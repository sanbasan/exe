// GBrain multi-tenant router.
//
// One process fronts many per-workspace GBrain "brains" while guaranteeing
// physical isolation between workspaces:
//
//   * Each workspace W has its own Postgres database `gbrain_ws_<W>` and its
//     own GBrain home dir `$GBRAIN_DATA_DIR/<W>`. Every `gbrain` invocation
//     for W is spawned with GBRAIN_HOME + GBRAIN_DATABASE_URL pointing only at
//     W's store. A serve process for W can therefore only ever read W's data,
//     and W's bearer tokens live only in W's database. There is no shared
//     brain and no cross-workspace query path.
//
// Responsibilities:
//   * POST /ingest                     — accumulate a call page into W's brain
//   * POST /extract_facts              — distill world-visible facts into W's hot memory
//   * POST /query                      — hybrid search inside W's brain
//   * POST /page                       — read one page from W's brain by slug
//   * ALL  /w/:workspaceId/mcp[/...]   — lazy-started, idle-reaped MCP egress
//   * POST /admin/w/:workspaceId/token — mint a bearer token for Claude Code
//   * GET  /healthz
//
// Auto-scaling: ingestion shells out to short-lived `gbrain` CLI runs (no
// per-workspace daemon). MCP egress starts a `gbrain serve --http` for W only
// on demand and reaps it after it goes idle (tenant-level scale-to-zero), with
// an LRU cap on concurrently-warm processes. Workspaces are created lazily on
// first use, so an unbounded, growing set of workspaces needs no provisioning.
//
// This whole `gbrain/` tree is purgeable — see gbrain/PURGE.md.

import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, access, readFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { join } from 'node:path';

const env = process.env;

const CONFIG = {
  adminToken: env.GBRAIN_ROUTER_ADMIN_TOKEN ?? '',
  dataDir: env.GBRAIN_DATA_DIR ?? '/data/brains',
  embeddingModel: env.GBRAIN_EMBEDDING_MODEL ?? 'openai:text-embedding-3-small',
  gbrainBin: env.GBRAIN_BIN ?? 'gbrain',
  ingestToken: env.GBRAIN_ROUTER_INGEST_TOKEN ?? '',
  openaiApiKey: env.OPENAI_API_KEY ?? '',
  pg: {
    host: env.PGHOST ?? 'postgres',
    password: env.PGPASSWORD ?? '',
    port: env.PGPORT ?? '5432',
    user: env.PGUSER ?? 'gbrain',
  },
  port: Number.parseInt(env.PORT ?? '8080', 10),
  publicBaseUrl: (env.PUBLIC_BASE_URL ?? '').replace(/\/+$/u, ''),
  serve: {
    idleTtlMs: Number.parseInt(env.GBRAIN_SERVE_IDLE_TTL_MS ?? '600000', 10),
    maxWarm: Number.parseInt(env.GBRAIN_SERVE_MAX_WARM ?? '8', 10),
    portBase: Number.parseInt(env.GBRAIN_SERVE_PORT_BASE ?? '3200', 10),
    startTimeoutMs: Number.parseInt(env.GBRAIN_SERVE_START_TIMEOUT_MS ?? '60000', 10),
  },
  spawnTimeoutMs: Number.parseInt(env.GBRAIN_SPAWN_TIMEOUT_MS ?? '120000', 10),
};

// Workspace ids are used to derive filesystem paths and Postgres database
// names, so they must be strictly validated to prevent traversal / injection.
const WORKSPACE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/u;

const isValidWorkspaceId = (workspaceId) =>
  typeof workspaceId === 'string' && WORKSPACE_ID_RE.test(workspaceId);

// Token names are the revoke key (revoke matches by exact name) and appear as
// the first whitespace-delimited column of `gbrain auth list`, so they must be
// space-free to keep both the revoke target and the list parser unambiguous.
const TOKEN_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/u;

const log = (level, message, extra) => {
  const line = { level, message, ts: new Date().toISOString(), ...extra };
  process.stdout.write(`${JSON.stringify(line)}\n`);
};

const dbNameFor = (workspaceId) => `gbrain_ws_${workspaceId}`;
const homeFor = (workspaceId) => join(CONFIG.dataDir, workspaceId);
const databaseUrlFor = (workspaceId) => {
  const { host, password, port, user } = CONFIG.pg;
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgres://${auth}@${host}:${port}/${dbNameFor(workspaceId)}`;
};
const adminDatabaseUrl = () => {
  const { host, password, port, user } = CONFIG.pg;
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgres://${auth}@${host}:${port}/postgres`;
};

// Environment a `gbrain` child process runs with for a specific workspace.
// This is the isolation boundary: GBRAIN_HOME + GBRAIN_DATABASE_URL bind the
// invocation to exactly one workspace's store.
const gbrainEnvFor = (workspaceId) => ({
  ...env,
  GBRAIN_DATABASE_URL: databaseUrlFor(workspaceId),
  GBRAIN_EMBEDDING_MODEL: CONFIG.embeddingModel,
  GBRAIN_HOME: homeFor(workspaceId),
  GBRAIN_HTTP_TRUST_PROXY: '1',
  // Keep CLI stdout machine-parseable: /query and /page JSON.parse it.
  GBRAIN_NO_BANNER: '1',
  OPENAI_API_KEY: CONFIG.openaiApiKey,
});

const runGbrain = (workspaceId, args, { stdin } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(CONFIG.gbrainBin, args, {
      env: gbrainEnvFor(workspaceId),
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`gbrain ${args[0]} timed out`));
    }, CONFIG.spawnTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`gbrain ${args[0]} exited ${code}: ${stderr.trim()}`));
    });

    if (stdin !== undefined) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });

const runPsqlAdmin = (sql) =>
  new Promise((resolve, reject) => {
    const child = spawn('psql', [adminDatabaseUrl(), '-tAc', sql], {
      env: { ...env, PGPASSWORD: CONFIG.pg.password },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`psql exited ${code}: ${stderr.trim()}`));
    });
  });

// ── Brain bootstrap (idempotent, serialized per workspace) ─────────────────

const brainReady = new Map(); // workspaceId -> Promise<void>

const ensureBrain = (workspaceId) => {
  const existing = brainReady.get(workspaceId);
  if (existing !== undefined) {
    return existing;
  }

  const ready = (async () => {
    const home = homeFor(workspaceId);
    const marker = join(home, '.gbrain-router-initialized');

    // Fast path: a previous run already initialized this brain.
    const alreadyInitialized = await access(marker).then(
      () => true,
      () => false
    );
    if (alreadyInitialized) {
      return;
    }

    await mkdir(home, { recursive: true });

    const dbName = dbNameFor(workspaceId);
    const exists = await runPsqlAdmin(
      `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`
    );
    if (exists !== '1') {
      // dbName is derived from a strictly-validated workspaceId.
      await runPsqlAdmin(`CREATE DATABASE "${dbName}"`);
      log('info', 'created workspace database', { dbName, workspaceId });
    }

    // Creates the schema in the (now existing) database and writes config.
    // --non-interactive + GBRAIN_DATABASE_URL selects Postgres; an explicit
    // --embedding-model avoids the interactive provider picker.
    await runGbrain(workspaceId, [
      'init',
      '--non-interactive',
      '--force',
      '--embedding-model',
      CONFIG.embeddingModel,
    ]);
    await writeFile(marker, 'ok\n');
    log('info', 'initialized workspace brain', { workspaceId });
  })().catch((error) => {
    // Don't cache failures — allow a later retry.
    brainReady.delete(workspaceId);
    throw error;
  });

  brainReady.set(workspaceId, ready);
  return ready;
};

// ── Ingestion ──────────────────────────────────────────────────────────────

const ingest = async (workspaceId, slug, markdown) => {
  await ensureBrain(workspaceId);
  // `put` writes the page to the DB and embeds it inline — no `sync` needed
  // (sync reconciles filesystem sources, which this brain doesn't use).
  await runGbrain(workspaceId, ['put', slug], { stdin: markdown });
};

// ── Read path (/query, /page) ───────────────────────────────────────────────

// Read-only traffic must not provision anything: an unknown workspace simply
// has an empty brain. Only ingestion creates databases.
const brainInitialized = (workspaceId) =>
  access(join(homeFor(workspaceId), '.gbrain-router-initialized')).then(
    () => true,
    () => false
  );

// Positional CLI args must not be mistaken for flags, so reject a leading "-".
// Slugs additionally derive paths inside the brain; keep the charset tight
// (matches the slugs our own ingest produces).
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u;

const isValidQueryText = (query) =>
  typeof query === 'string' &&
  query.trim().length > 0 &&
  query.length <= 1000 &&
  !query.startsWith('-');

// `gbrain query` has no machine-readable output on the local-engine path (the
// op dispatcher always renders through its human formatter), so parse that
// format: one `[<score>] <slug> -- <snippet>` line per hit, where the snippet
// is the matched chunk truncated to 100 chars by the CLI. That is enough for
// triage — the caller reads the full page via /page when a hit looks relevant.
const QUERY_LINE_RE = /^\[(?<score>[^\]]*)\]\s+(?<slug>\S+)\s+--\s?(?<snippet>.*)$/u;

const parseQueryLine = (line) => {
  const match = line.match(QUERY_LINE_RE);
  if (match === null) {
    return null;
  }
  const { score, slug, snippet } = match.groups;
  const parsedScore = Number.parseFloat(score);
  const stale = snippet.endsWith(' (stale)');
  return {
    chunk_text: stale ? snippet.slice(0, -' (stale)'.length) : snippet,
    score: Number.isFinite(parsedScore) ? parsedScore : null,
    slug,
    stale,
  };
};

const queryBrain = async (workspaceId, query, limit) => {
  if (!(await brainInitialized(workspaceId))) {
    return [];
  }
  const { stdout } = await runGbrain(workspaceId, [
    'query',
    query,
    '--limit',
    String(limit),
  ]);
  return stdout
    .split('\n')
    .map(parseQueryLine)
    .filter((result) => result !== null);
};

const getBrainPage = async (workspaceId, slug) => {
  if (!(await brainInitialized(workspaceId))) {
    return null;
  }
  // `gbrain get` prints the full page as markdown and exits non-zero for a
  // missing page — map that failure to "not found" instead of a 5xx.
  const result = await runGbrain(workspaceId, ['get', slug]).catch(() => null);
  if (result === null || result.stdout.trim().length === 0) {
    return null;
  }
  return result.stdout;
};

// ── Facts (post-call hot-memory writes) ─────────────────────────────────────

// The facts pipeline (`extract_facts`) is an MCP-only operation — the CLI has
// no subcommand for it — so the router reaches it through the workspace's own
// `gbrain serve` MCP endpoint. That endpoint requires a workspace bearer
// token; the router mints itself one per workspace (`router-internal`) and
// persists it in the brain's home dir, so restarts reuse it instead of
// re-minting. Losing the file is fine: the stale row is revoked by name and a
// fresh token minted.
const INTERNAL_TOKEN_NAME = 'router-internal';
const internalTokens = new Map(); // workspaceId -> token

const internalTokenPathFor = (workspaceId) =>
  join(homeFor(workspaceId), '.router-internal-token');

const ensureInternalToken = async (workspaceId) => {
  const cached = internalTokens.get(workspaceId);
  if (cached !== undefined) {
    return cached;
  }
  const path = internalTokenPathFor(workspaceId);
  const fromDisk = await readFile(path, 'utf8').then(
    (raw) => raw.trim() || null,
    () => null
  );
  if (fromDisk !== null) {
    internalTokens.set(workspaceId, fromDisk);
    return fromDisk;
  }
  // A row may survive a lost token file; revoke by name before re-minting.
  await runGbrain(workspaceId, ['auth', 'revoke', INTERNAL_TOKEN_NAME]).catch(
    () => {}
  );
  const { stdout } = await runGbrain(workspaceId, [
    'auth',
    'create',
    INTERNAL_TOKEN_NAME,
  ]);
  const token = (stdout.match(/gbrain_[A-Za-z0-9_-]+/u) ?? [])[0] ?? null;
  if (token === null) {
    throw new Error('failed to mint router-internal token');
  }
  await writeFile(path, `${token}\n`, { mode: 0o600 });
  internalTokens.set(workspaceId, token);
  return token;
};

// One stateless MCP tools/call against the workspace's serve. gbrain's
// streamable-HTTP transport accepts a bare tools/call POST (no initialize
// handshake; verified against the deployed revision) and frames the response
// as SSE — the result is the first `data:` line, whose tool payload is JSON
// serialized into content[0].text.
const callServeTool = async (workspaceId, name, args) => {
  const port = await ensureServe(workspaceId);
  const token = await ensureInternalToken(workspaceId);
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { arguments: args, name },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `serve tools/call ${name} failed: ${response.status} ${text.slice(0, 200)}`
    );
  }
  const dataLine = text
    .split('\n')
    .find((line) => line.startsWith('data:'));
  const envelope = JSON.parse(
    dataLine === undefined ? text : dataLine.slice('data:'.length).trim()
  );
  if (envelope.error !== undefined) {
    throw new Error(`serve tools/call ${name} error: ${JSON.stringify(envelope.error).slice(0, 200)}`);
  }
  const inner = envelope.result?.content?.[0]?.text;
  return inner === undefined ? (envelope.result ?? null) : JSON.parse(inner);
};

const MAX_FACTS_TEXT_LENGTH = 20_000;

const handleExtractFacts = async (req, res) => {
  // Same server-to-server trust boundary as /ingest.
  if (!secretEquals(bearerToken(req), CONFIG.ingestToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  const body = await readJsonBody(req).catch(() => null);
  if (body === null || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_body' });
    return;
  }
  const { sessionId, text, workspaceId } = body;
  if (!isValidWorkspaceId(workspaceId)) {
    sendJson(res, 400, { error: 'invalid_workspace_id' });
    return;
  }
  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > MAX_FACTS_TEXT_LENGTH
  ) {
    sendJson(res, 400, { error: 'invalid_text' });
    return;
  }

  await ensureBrain(workspaceId);
  // Facts are the workspace's shared team memory; remote readers (MCP recall)
  // only see visibility=world rows, so that is what post-call writes use.
  const result = await callServeTool(workspaceId, 'extract_facts', {
    turn_text: text,
    visibility: 'world',
    ...(typeof sessionId === 'string' && sessionId.length > 0
      ? { session_id: sessionId }
      : {}),
  });
  log('info', 'extracted facts', {
    inserted: result?.inserted ?? 0,
    workspaceId,
  });
  sendJson(res, 200, {
    duplicate: result?.duplicate ?? 0,
    inserted: result?.inserted ?? 0,
    ok: true,
    superseded: result?.superseded ?? 0,
  });
};

// ── Lazy MCP serve processes (tenant-level scale-to-zero) ───────────────────

const warmServes = new Map(); // workspaceId -> { port, proc, lastUsed, ready }
let nextServePort = CONFIG.serve.portBase;

const waitForPort = (port, timeoutMs) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`serve port ${port} not ready`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });

const reapWarmServes = () => {
  const now = Date.now();
  for (const [workspaceId, entry] of warmServes) {
    if (now - entry.lastUsed > CONFIG.serve.idleTtlMs) {
      entry.proc.kill('SIGTERM');
      warmServes.delete(workspaceId);
      log('info', 'reaped idle serve', { workspaceId });
    }
  }
  // LRU cap: if still over the ceiling, evict the least-recently-used.
  while (warmServes.size > CONFIG.serve.maxWarm) {
    let oldestId = null;
    let oldest = Infinity;
    for (const [workspaceId, entry] of warmServes) {
      if (entry.lastUsed < oldest) {
        oldest = entry.lastUsed;
        oldestId = workspaceId;
      }
    }
    if (oldestId === null) {
      break;
    }
    warmServes.get(oldestId).proc.kill('SIGTERM');
    warmServes.delete(oldestId);
    log('info', 'evicted serve (LRU cap)', { workspaceId: oldestId });
  }
};

const ensureServe = (workspaceId) => {
  const existing = warmServes.get(workspaceId);
  if (existing !== undefined) {
    existing.lastUsed = Date.now();
    return existing.ready.then(() => existing.port);
  }

  const port = nextServePort;
  nextServePort += 1;
  if (nextServePort > CONFIG.serve.portBase + 1000) {
    nextServePort = CONFIG.serve.portBase;
  }

  const entry = { lastUsed: Date.now(), port, proc: null, ready: null };
  entry.ready = (async () => {
    await ensureBrain(workspaceId);
    const publicUrl = `${CONFIG.publicBaseUrl}/w/${workspaceId}`;
    const proc = spawn(
      CONFIG.gbrainBin,
      [
        'serve',
        '--http',
        '--port',
        String(port),
        '--public-url',
        publicUrl,
      ],
      { env: gbrainEnvFor(workspaceId) }
    );
    entry.proc = proc;
    proc.stdout.on('data', (chunk) => {
      log('debug', 'serve stdout', { chunk: String(chunk).trim(), workspaceId });
    });
    proc.stderr.on('data', (chunk) => {
      log('debug', 'serve stderr', { chunk: String(chunk).trim(), workspaceId });
    });
    proc.on('close', (code) => {
      if (warmServes.get(workspaceId) === entry) {
        warmServes.delete(workspaceId);
      }
      log('info', 'serve exited', { code, workspaceId });
    });
    await waitForPort(port, CONFIG.serve.startTimeoutMs);
    log('info', 'serve ready', { port, workspaceId });
  })().catch((error) => {
    if (warmServes.get(workspaceId) === entry) {
      warmServes.delete(workspaceId);
    }
    if (entry.proc !== null) {
      entry.proc.kill('SIGKILL');
    }
    throw error;
  });

  warmServes.set(workspaceId, entry);
  return entry.ready.then(() => port);
};

const proxyToServe = (req, res, workspaceId, upstreamPath) => {
  ensureServe(workspaceId)
    .then((port) => {
      const upstream = httpRequest(
        {
          headers: { ...req.headers, host: `127.0.0.1:${port}` },
          host: '127.0.0.1',
          method: req.method,
          path: upstreamPath,
          port,
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        }
      );
      upstream.on('error', (error) => {
        log('error', 'proxy upstream error', {
          error: error.message,
          workspaceId,
        });
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
        }
        res.end(JSON.stringify({ error: 'gbrain_upstream_unavailable' }));
      });
      req.pipe(upstream);
    })
    .catch((error) => {
      log('error', 'ensureServe failed', { error: error.message, workspaceId });
      if (!res.headersSent) {
        res.writeHead(503, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'gbrain_serve_unavailable' }));
    });
};

// ── HTTP helpers ─────────────────────────────────────────────────────────

const readJsonBody = (req, limitBytes = 8 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const bearerToken = (req) => {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
};

// Constant-time-ish comparison to avoid trivial timing oracles on the shared
// secrets. Lengths differing is fine to reveal.
const secretEquals = (a, b) => {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

// ── Request routing ──────────────────────────────────────────────────────

const handleIngest = async (req, res) => {
  if (!secretEquals(bearerToken(req), CONFIG.ingestToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  const body = await readJsonBody(req).catch(() => null);
  if (body === null || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_body' });
    return;
  }
  const { markdown, slug, workspaceId } = body;
  if (!isValidWorkspaceId(workspaceId)) {
    sendJson(res, 400, { error: 'invalid_workspace_id' });
    return;
  }
  if (typeof slug !== 'string' || slug.length === 0 || typeof markdown !== 'string') {
    sendJson(res, 400, { error: 'invalid_page' });
    return;
  }

  await ingest(workspaceId, slug, markdown);
  log('info', 'ingested page', { slug, workspaceId });
  sendJson(res, 200, { ok: true, slug });
};

// /query and /page authenticate with the same server-to-server token as
// /ingest: the caller is the trusted call agent, which serves every workspace
// and asserts workspaceId itself. Isolation still holds below this layer —
// each CLI run is bound to exactly one workspace's database.
const handleQuery = async (req, res) => {
  if (!secretEquals(bearerToken(req), CONFIG.ingestToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  const body = await readJsonBody(req).catch(() => null);
  if (body === null || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_body' });
    return;
  }
  const { limit, query, workspaceId } = body;
  if (!isValidWorkspaceId(workspaceId)) {
    sendJson(res, 400, { error: 'invalid_workspace_id' });
    return;
  }
  if (!isValidQueryText(query)) {
    sendJson(res, 400, { error: 'invalid_query' });
    return;
  }
  const boundedLimit =
    Number.isInteger(limit) && limit >= 1 && limit <= 20 ? limit : 5;

  const results = await queryBrain(workspaceId, query, boundedLimit);
  log('info', 'queried brain', { results: results.length, workspaceId });
  sendJson(res, 200, { results });
};

const handleGetPage = async (req, res) => {
  if (!secretEquals(bearerToken(req), CONFIG.ingestToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  const body = await readJsonBody(req).catch(() => null);
  if (body === null || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_body' });
    return;
  }
  const { slug, workspaceId } = body;
  if (!isValidWorkspaceId(workspaceId)) {
    sendJson(res, 400, { error: 'invalid_workspace_id' });
    return;
  }
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    sendJson(res, 400, { error: 'invalid_slug' });
    return;
  }

  const markdown = await getBrainPage(workspaceId, slug);
  if (markdown === null) {
    sendJson(res, 404, { error: 'page_not_found' });
    return;
  }
  log('info', 'read brain page', { slug, workspaceId });
  sendJson(res, 200, { markdown });
};

const handleMintToken = async (req, res, workspaceId) => {
  if (!secretEquals(bearerToken(req), CONFIG.adminToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!isValidWorkspaceId(workspaceId)) {
    sendJson(res, 400, { error: 'invalid_workspace_id' });
    return;
  }
  const body = await readJsonBody(req).catch(() => ({}));
  const name =
    typeof body.name === 'string' && TOKEN_NAME_RE.test(body.name)
      ? body.name
      : 'claude-code';

  await ensureBrain(workspaceId);
  const { stdout } = await runGbrain(workspaceId, ['auth', 'create', name]);
  const token = (stdout.match(/gbrain_[A-Za-z0-9_-]+/u) ?? [])[0] ?? null;
  const mcpUrl = `${CONFIG.publicBaseUrl}/w/${workspaceId}/mcp`;
  sendJson(res, token === null ? 500 : 200, {
    connect:
      token === null
        ? undefined
        : `claude mcp add gbrain -t http ${mcpUrl} -H "Authorization: Bearer ${token}"`,
    mcpUrl,
    raw: token === null ? stdout : undefined,
    token,
    workspaceId,
  });
};

// `gbrain auth list` has no machine-readable output, so parse its fixed-column
// table: a header row ("Name ... Status"), a separator, then one row per token
// as `<name> <createdAt> <lastUsedAt|never> <status>`. Names are space-free
// (TOKEN_NAME_RE) and the timestamps are ISO strings without spaces, so each
// column is a single whitespace-delimited field.
const parseAuthListLine = (line) => {
  const trimmed = line.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith('Name') ||
    trimmed.startsWith('─') ||
    trimmed.startsWith('No tokens')
  ) {
    return null;
  }
  const parts = trimmed.split(/\s+/u);
  if (parts.length < 4) {
    return null;
  }
  const [name, createdAt, lastUsedAt, status] = parts;
  return {
    createdAt,
    lastUsedAt: lastUsedAt === 'never' ? null : lastUsedAt,
    name,
    status,
  };
};

const handleListTokens = async (req, res, workspaceId) => {
  if (!secretEquals(bearerToken(req), CONFIG.adminToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!isValidWorkspaceId(workspaceId)) {
    sendJson(res, 400, { error: 'invalid_workspace_id' });
    return;
  }

  // Managing tokens is read-only w.r.t. provisioning: an un-provisioned
  // workspace simply has no tokens (don't create a database just to list).
  if (!(await brainInitialized(workspaceId))) {
    sendJson(res, 200, { tokens: [] });
    return;
  }

  const { stdout } = await runGbrain(workspaceId, ['auth', 'list']);
  const tokens = stdout
    .split('\n')
    .map(parseAuthListLine)
    .filter((token) => token !== null && token.status === 'active');
  sendJson(res, 200, { tokens });
};

const handleRevokeToken = async (req, res, workspaceId, name) => {
  if (!secretEquals(bearerToken(req), CONFIG.adminToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!isValidWorkspaceId(workspaceId)) {
    sendJson(res, 400, { error: 'invalid_workspace_id' });
    return;
  }
  if (!TOKEN_NAME_RE.test(name)) {
    sendJson(res, 400, { error: 'invalid_token_name' });
    return;
  }

  if (!(await brainInitialized(workspaceId))) {
    sendJson(res, 404, { error: 'token_not_found', name });
    return;
  }

  // `gbrain auth revoke` exits non-zero when no active token has that name; map
  // that to a 404 rather than a 5xx.
  const revoked = await runGbrain(workspaceId, ['auth', 'revoke', name]).then(
    () => true,
    () => false
  );
  sendJson(res, revoked ? 200 : 404, {
    name,
    ...(revoked ? { ok: true } : { error: 'token_not_found' }),
  });
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  const run = async () => {
    if (path === '/healthz') {
      sendJson(res, 200, { ok: true, warm: warmServes.size });
      return;
    }
    if (path === '/ingest' && req.method === 'POST') {
      await handleIngest(req, res);
      return;
    }
    if (path === '/extract_facts' && req.method === 'POST') {
      await handleExtractFacts(req, res);
      return;
    }
    if (path === '/query' && req.method === 'POST') {
      await handleQuery(req, res);
      return;
    }
    if (path === '/page' && req.method === 'POST') {
      await handleGetPage(req, res);
      return;
    }

    const tokenMatch = path.match(/^\/admin\/w\/([^/]+)\/token$/u);
    if (tokenMatch !== null && req.method === 'POST') {
      await handleMintToken(req, res, decodeURIComponent(tokenMatch[1]));
      return;
    }

    const tokenListMatch = path.match(/^\/admin\/w\/([^/]+)\/tokens$/u);
    if (tokenListMatch !== null && req.method === 'GET') {
      await handleListTokens(req, res, decodeURIComponent(tokenListMatch[1]));
      return;
    }

    const tokenRevokeMatch = path.match(
      /^\/admin\/w\/([^/]+)\/token\/([^/]+)\/revoke$/u
    );
    if (tokenRevokeMatch !== null && req.method === 'POST') {
      await handleRevokeToken(
        req,
        res,
        decodeURIComponent(tokenRevokeMatch[1]),
        decodeURIComponent(tokenRevokeMatch[2])
      );
      return;
    }

    const mcpMatch = path.match(/^\/w\/([^/]+)(\/.*)?$/u);
    if (mcpMatch !== null) {
      const workspaceId = decodeURIComponent(mcpMatch[1]);
      if (!isValidWorkspaceId(workspaceId)) {
        sendJson(res, 400, { error: 'invalid_workspace_id' });
        return;
      }
      const upstreamPath = `${mcpMatch[2] ?? '/'}${url.search}`;
      proxyToServe(req, res, workspaceId, upstreamPath);
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  };

  run().catch((error) => {
    log('error', 'request failed', { error: error.message, path });
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal_error' });
    } else {
      res.end();
    }
  });
});

const startupCheck = () => {
  const missing = [];
  if (CONFIG.ingestToken.length === 0) missing.push('GBRAIN_ROUTER_INGEST_TOKEN');
  if (CONFIG.adminToken.length === 0) missing.push('GBRAIN_ROUTER_ADMIN_TOKEN');
  if (CONFIG.openaiApiKey.length === 0) missing.push('OPENAI_API_KEY');
  if (CONFIG.publicBaseUrl.length === 0) missing.push('PUBLIC_BASE_URL');
  if (missing.length > 0) {
    log('error', 'missing required config', { missing });
    process.exit(1);
  }
};

startupCheck();
setInterval(reapWarmServes, 60_000).unref();
server.listen(CONFIG.port, () => {
  log('info', 'gbrain router listening', { port: CONFIG.port });
});

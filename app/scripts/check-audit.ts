import { execSync } from 'node:child_process';

/**
 * `npm audit` advisories that are intentionally tolerated.
 *
 * GHSA-8988-4f7v-96qf: `@opentelemetry/core` (<2.8.0) W3C Baggage unbounded
 * memory allocation. Pulled in only transitively via `@livekit/agents` ->
 * `@opentelemetry/exporter-*`, which pin the older OpenTelemetry line. No
 * non-breaking upgrade is available without downgrading `@livekit/agents`, so
 * this single advisory (and its cascade) is allowlisted while the higher
 * `@livekit/agents` version is kept.
 */
const ALLOWED_ADVISORY_IDS = new Set(['GHSA-8988-4f7v-96qf']);
const ENFORCED_SEVERITIES = new Set(['critical', 'high', 'moderate']);
const GHSA_PATTERN = /GHSA-[0-9a-z-]+/u;
const MAX_AUDIT_OUTPUT_BYTES = 16 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const runNpmAudit = (): string => {
  try {
    return execSync('npm audit --json', {
      encoding: 'utf8',
      maxBuffer: MAX_AUDIT_OUTPUT_BYTES,
    });
  } catch (error) {
    if (isRecord(error) && typeof error.stdout === 'string') {
      return error.stdout;
    }

    throw error;
  }
};

const toGhsaId = (url: unknown): string | null => {
  if (typeof url !== 'string') {
    return null;
  }

  const match = GHSA_PATTERN.exec(url);

  return match === null ? null : match[0];
};

const getEnforcedAdvisoryId = (via: unknown): string | null => {
  if (!isRecord(via)) {
    return null;
  }

  const { severity } = via;

  if (typeof severity !== 'string' || !ENFORCED_SEVERITIES.has(severity)) {
    return null;
  }

  const ghsaId = toGhsaId(via.url);

  if (ghsaId !== null) {
    return ghsaId;
  }

  const { title } = via;

  return typeof title === 'string' ? title : 'unknown advisory';
};

const collectViaEntries = (vulnerability: unknown): readonly unknown[] => {
  if (!isRecord(vulnerability)) {
    return [];
  }

  const { via } = vulnerability;

  return Array.isArray(via) ? via : [];
};

const collectDisallowedAdvisoryIds = (report: unknown): readonly string[] => {
  if (!isRecord(report)) {
    return [];
  }

  const { vulnerabilities } = report;

  if (!isRecord(vulnerabilities)) {
    return [];
  }

  const advisoryIds = Object.values(vulnerabilities)
    .flatMap(collectViaEntries)
    .flatMap((via): readonly string[] => {
      const advisoryId = getEnforcedAdvisoryId(via);

      if (advisoryId === null || ALLOWED_ADVISORY_IDS.has(advisoryId)) {
        return [];
      }

      return [advisoryId];
    });

  return [...new Set(advisoryIds)];
};

const main = (): void => {
  const report: unknown = JSON.parse(runNpmAudit());
  const disallowed = collectDisallowedAdvisoryIds(report);

  if (disallowed.length > 0) {
    throw new Error(
      `Disallowed npm audit advisories (moderate or higher):\n${disallowed.join(
        '\n'
      )}`
    );
  }
};

main();

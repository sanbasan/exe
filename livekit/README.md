# LiveKit VM

Self-hosted LiveKit for the voice agent: one GCE VM per environment, running
LiveKit Server, Caddy, and the LiveKit agent through Docker Compose.

## Configuration

All deployment-specific values (GCP project ids, domains, VM names, backend
URLs) live in a gitignored `livekit/config.env`. Copy the template and fill it
in before running any script:

```sh
cp livekit/config.env.example livekit/config.env
$EDITOR livekit/config.env
```

`config.env` is gitignored at the repo root — never commit real project ids,
domains, or VM names. Every script sources it and maps the `_DEV` / `_PROD`
variables onto the selected environment (`--dev` / `--prod`); required values
fail fast if left empty. Non-identifying defaults (region, zone, machine type,
disk size, ports, thresholds) stay inside the scripts.

Per environment you configure a project, a public domain (Caddy TLS host and
`wss://` LiveKit URL), a VM name, and the backend `APP_URL` the agent calls
into. Both environments live in separate GCP projects.

## Provision

```sh
livekit/setup.sh --dev --yes
livekit/setup.sh --prod --yes
```

When `setup.sh` prints the reserved static IP, create a DNS A record pointing
your domain at it; Caddy then issues TLS automatically via Let's Encrypt.

## Deploy agent

```sh
livekit/deploy.sh --dev --yes
livekit/deploy.sh --prod --yes
```

## Deploy an agent VM pool

```sh
RUN_BUNDLED_AGENT=false livekit/deploy.sh --prod --yes
livekit/build-agent-vm-image.sh --prod --yes
livekit/agent-pool.sh --dev --min=1 --max=10 --yes
livekit/agent-pool.sh --prod --min=1 --max=20 --yes
```

## Latency and capacity

- The VM should stay running for low-latency calls. Avoid auto-stopping it
  unless you explicitly accept cold starts.
- The agent accepts `EXE_AGENT_MAX_CONCURRENT_JOBS=1` by default. This keeps
  one active call per agent worker VM and pushes burst capacity to the VM pool
  instead of requiring a vertically oversized VM.
- Keep the pool minimum small (`--min=1` or `--min=2` for prod) so idle warm
  capacity is bounded. Keep `--max` much higher because it is only the burst
  ceiling, not always-on capacity. Extra VMs are temporary burst capacity and
  scale back down to the minimum.
- The agent keeps one warm process via `EXE_AGENT_NUM_IDLE_PROCESSES=1` by
  default, and marks itself unavailable above `EXE_AGENT_LOAD_THRESHOLD=0.7`.
- Build the agent VM image with `livekit/build-agent-vm-image.sh` after pushing
  a new agent container image. Agent pool VMs boot from this image and skip
  Docker installation and image pull on the cold-start path. Set
  `PULL_AGENT_IMAGE_ON_BOOT=true` only when you prefer guaranteed latest image
  pulls over faster cold starts.
- The default VM size for new provisioning is `e2-standard-2`; override with
  `MACHINE_TYPE=... livekit/setup.sh ...` when resizing new environments.
- This Docker Compose setup is still a single LiveKit server VM. For true
  horizontal agent scaling, run the agent pool with the same
  `LIVEKIT_AGENT_NAME`. Move LiveKit server itself to a multi-node/managed
  topology before depending on horizontal scale for room media capacity.

The scripts read `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from Secret Manager
and render VM-local config under `/opt/exe`. Secrets are not committed.

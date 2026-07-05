# GBrain multi-tenant router image.
#
# Ships the `gbrain` CLI (Bun) plus the router (gbrain/router/server.mjs, run
# under Bun) and a Postgres client used to create per-workspace databases.
# No brain is initialized at build time — each workspace's brain is created
# lazily at runtime by the router (needs the runtime OPENAI_API_KEY).
FROM oven/bun:1

# psql is used by the router to CREATE DATABASE per workspace.
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin the GBrain revision here to make deploys reproducible; bump deliberately.
ARG GBRAIN_REF=master
# bun's global bin dir is already on PATH (/usr/local/bin) in this image, so
# `bun install -g` puts `gbrain` straight onto PATH.
RUN bun install -g "github:garrytan/gbrain#${GBRAIN_REF}" \
  && gbrain --version

WORKDIR /app
COPY router/ /app/router/

ENV GBRAIN_DATA_DIR=/data/brains
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "/app/router/server.mjs"]

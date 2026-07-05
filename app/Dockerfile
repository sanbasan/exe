FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY agent/package.json agent/
COPY packages/domain/package.json packages/domain/
COPY packages/server/package.json packages/server/
COPY packages/slack/package.json packages/slack/
RUN npm ci

COPY agent/ agent/
COPY packages/domain/ packages/domain/
COPY packages/server/ packages/server/
COPY packages/slack/ packages/slack/
RUN npm -w @exe/agent run build

RUN rm -rf node_modules && npm ci --omit=dev

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/agent/dist ./dist

USER node
CMD ["node", "dist/index.mjs", "start"]

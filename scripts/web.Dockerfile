# Runtime-only image for the prebuilt Next.js standalone output
# (app/.next/standalone, produced by `npm -w @exe/apphosting run build`).
# The output is pure JS (no native binaries), so a host-built bundle can be
# copied straight into a linux/amd64 base image without emulation.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]

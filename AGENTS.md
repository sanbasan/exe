# exe

Voice-call AI task assistant. Runs on Firebase (App Hosting / Functions / Firestore), a self-hosted LiveKit server, and a native iOS app. Two environments are assumed throughout: a dev and a prod Firebase project (configured in `.firebaserc`).

## Repository layout

- `app/` — Node 22 npm workspaces (TypeScript)
  - `agent/` — realtime voice agent running on LiveKit (call handling, tool execution, summaries)
  - `apphosting/` — Next.js web app + API (Firebase App Hosting, backend id `exe-web-app`; env in `apphosting.dev.yaml` / `apphosting.prod.yaml`)
  - `functions/` — Cloud Functions
  - `packages/domain` / `packages/server` / `packages/slack` — shared packages
- `ios/exe/` — SwiftUI iOS app (`exe.xcodeproj`) + local SPM packages `ExeAPIClient` / `ExeDomain` / `ExeLiveKit` / `ExeUI`
- `livekit/` — provisioning/deploy scripts for the self-hosted LiveKit GCE VM. See `livekit/README.md`
- `gbrain/` — optional memory-service VM (deploy scripts + router). See `gbrain/README.md`
- `firestore/` — Firestore rules / indexes
- `manifest/` — Slack app manifest template
- `scripts/` — deploy helpers

## Commands (quality gates)

- Everything: `make quality` (= app-check + app-build + ios-quality)
- app: `npm --prefix app run check` — format:check / type-check / lint / test / lint:configs / secrets scan / npm audit
  - Build: `npm --prefix app run build:all`
  - Fix formatting: `npm --prefix app run format`
- iOS: `make -C ios/exe quality` — `swiftlint --strict` + `swiftformat --lint` + xcodebuild build (iPhone 17 Pro simulator)
  - Fix formatting: `make -C ios/exe format`
  - Tests: `make -C ios/exe test`

Always run the quality command for the area you touched.

## Deploy

- `make deploy-dev` / `make deploy-prod` — after quality passes, deploys firestore / functions / apphosting in parallel (project ids from `.firebaserc`)
- Web-only fast path (skips quality): `make deploy-web-dev` / `make deploy-web-prod`
- LiveKit VM: `livekit/setup.sh` / `livekit/deploy.sh` / `livekit/agent-pool.sh` (see `livekit/README.md`)

## Coding conventions

- TypeScript: write optional properties as `?: T`, never `?: T | undefined`. When a value may be absent at the call site, omit the key itself via spread + ternary (`...(x ? { prop: x } : {})`).
- Lint / format are automated (ESLint plugins + Prettier / SwiftLint + SwiftFormat). Use the format commands instead of fixing style by hand.
- Keep commit messages short and consistent with the existing history.

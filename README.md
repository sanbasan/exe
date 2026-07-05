# exe

An AI task assistant. A web app is the task board (Gantt with dependencies, meeting
recording → transcript → task extraction, Slack sync); a voice agent calls people about
blocked or overloaded work and updates tasks from the conversation. It is built from a
few deployable parts:

| Part | Stack | Location |
|---|---|---|
| Web app + API | Next.js on Firebase App Hosting (Gantt board, meeting recorder) | `app/apphosting` |
| Background jobs | Cloud Functions (Node 22) | `app/functions` |
| Voice agent | LiveKit realtime agent | `app/agent`, deployed via `livekit/` |
| iOS call app | SwiftUI (CallKit) | `ios/exe` |
| Shared logic | domain / server / slack packages | `app/packages/*` |
| Memory service (optional) | Node MCP router + Postgres | `gbrain/` |

Data lives in Firestore; auth is Firebase Auth. Everything is parameterized — there are no
hardcoded project ids, domains, or keys. You supply your own via the config files below.

## Prerequisites

- Node 22 and npm
- The [Firebase CLI](https://firebase.google.com/docs/cli) (`firebase`) and [gcloud](https://cloud.google.com/sdk/docs/install)
- Xcode (for the iOS app), Docker (for the LiveKit/gbrain VMs)
- Two Firebase projects (a dev and a prod) on the Blaze plan — App Hosting, Functions, and Secret Manager all require it
- A Slack app, a Google Gemini API key, and (optional) OpenAI, SendGrid, and Apple Push (APNs) credentials

## Setup

### 1. Firebase projects

```bash
cp .firebaserc.example .firebaserc      # then edit: put your dev/prod project ids
```

Per project: enable **Authentication**, **Firestore**, **App Hosting**, and **Cloud Functions**.
Grant the App Hosting service account the **Service Account Token Creator** role on itself (needed
to mint custom tokens). Deploy the Firestore rules/indexes with `firebase deploy --only firestore`.

### 2. Secrets (Cloud Secret Manager)

Create these secrets in **each** project (`gcloud secrets create NAME --project=PROJECT`). The web
app, functions, and VM scripts all read them by these exact names:

| Secret | Used by | What it is |
|---|---|---|
| `ENCRYPTION_KEY` | web, functions, agent | 32-byte key for encrypting stored Slack tokens (`openssl rand -hex 32`) |
| `SLACK_CLIENT_SECRET` | web, functions | Slack app → Basic Information |
| `SLACK_SIGNING_SECRET` | web | Slack app → Basic Information |
| `GEMINI_API_KEY` | web, functions, agent | Google AI Studio (also read as `GOOGLE_API_KEY` on the agent) |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | web, functions, agent | LiveKit server credentials |
| `SENDGRID_API_KEY` | web | SendGrid, for outbound email (optional) |
| `APNS_AUTH_KEY` / `APNS_KEY_ID` / `APNS_TEAM_ID` | web, functions | Apple Push (`.p8` key + ids), for iOS notifications (optional) |
| `GBRAIN_ROUTER_ADMIN_TOKEN` | web, gbrain | Admin token for the optional memory service |
| `GBRAIN_ROUTER_INGEST_TOKEN` | web, gbrain | Ingest/extract-facts token for the optional memory service (mapped to `GBRAIN_INGEST_TOKEN`) |
| `OPENAI_API_KEY` | agent VM | Only if you use the OpenAI realtime provider (optional) |

Leaving an optional secret unset disables that feature (e.g. no APNs → no push; no gbrain token → memory service is skipped).

### 3. Web app + functions

Non-secret config is plain values in `app/apphosting.dev.yaml` / `app/apphosting.prod.yaml`. Replace
every `TODO_...` / `your-project-*` / `example.com` placeholder with your values:

| Value | Where | Example |
|---|---|---|
| Firebase project id | `GOOGLE_CLOUD_PROJECT`, `VM_PROJECT` | `my-app-prod` |
| Web SDK config (browser sign-in) | `FIREBASE_WEBAPP_CONFIG` | the Firebase Web app config JSON (public by design) |
| App Hosting public URL | `APP_URL`, `NEXT_PUBLIC_APP_URL` | `https://my-app.web.app` |
| App Hosting backend id | `firebase.json` `backendId`, Makefile | `exe-web-app` (rename if you like) |
| iOS bundle id | `APNS_BUNDLE_ID` | `com.yourcompany.exe` |
| Slack app / client id | `SLACK_APP_ID`, `SLACK_CLIENT_ID` | from your Slack app |
| LiveKit URL | `LIVEKIT_WS_URL`, `NEXT_PUBLIC_LIVEKIT_WS_URL` | `wss://livekit.yourdomain.com` |
| LiveKit VM name / zone | `VM_INSTANCE_NAME`, `VM_ZONE` | `exe-livekit`, `asia-northeast1-b` |
| From-address for email | `SENDGRID_FROM_EMAIL` | `noreply@yourdomain.com` |

App Hosting picks `apphosting.<env>.yaml` by the environment name configured on the backend in the
Firebase console — you don't switch files at deploy time.

For local development, copy the example env files and fill them in:

```bash
cp app/agent/.env.local.example      app/agent/.env.local
cp app/apphosting/.env.local.example app/apphosting/.env.local
```

Install and verify:

```bash
npm --prefix app install
npm --prefix app run check     # format / type-check / lint / test / secret scan
make deploy-dev                # quality gate, then deploy firestore + functions + web
```

### 4. Slack app

Create a Slack app **From a manifest** using `manifest/slack-manifest.example.json`. Replace every
`YOUR_APP_HOSTING_URL` with your deployed App Hosting URL (the OAuth redirect, events, and
interactivity endpoints). Put the resulting client id / secret / signing secret into config (step 2/3).

### 5. LiveKit voice agent (self-hosted VM)

```bash
cp livekit/config.env.example livekit/config.env    # fill in project ids, domain, VM name
```

`config.env` is gitignored. Then provision and deploy the VM per `livekit/README.md`:

```bash
livekit/setup.sh --dev      # one-time: create the GCE VM, LiveKit server, Caddy TLS
livekit/deploy.sh --dev     # build + push the agent image, render the VM .env from secrets
```

### 6. iOS app

```bash
cd ios/exe
cp exe/GoogleService-Info.example.plist exe/GoogleService-Info-Dev.plist   # dev Firebase config
cp exe/GoogleService-Info.example.plist exe/GoogleService-Info.plist       # prod Firebase config
```

Download the real `GoogleService-Info.plist` for each of your Firebase iOS apps and overwrite those
two files (both are gitignored). Then set your identifiers in `Dev.xcconfig` / `Prod.xcconfig`:

| Value | Key |
|---|---|
| Bundle id | `PRODUCT_BUNDLE_IDENTIFIER` (`com.example.exe[.dev]`) |
| API base URL | `API_BASE_URL` (your App Hosting URL) |
| LiveKit URL | `LIVEKIT_WS_URL` |
| Universal-link host | `UNIVERSAL_LINK_HOST` (host of your App Hosting URL) |
| Sentry (optional) | `SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` (empty = disabled) |

Set your Apple **Team** on the target in Xcode for device builds (the checked-in project has no team,
so simulator builds work out of the box). Verify with `make -C ios/exe quality`.

### 7. gbrain memory service (optional)

An optional long-term memory service the agent can query mid-call. If you don't want it, leave
`GBRAIN_ROUTER_ADMIN_TOKEN` / `GBRAIN_BASE_URL` unset and skip this. To run it, `cp gbrain/config.env.example gbrain/config.env`,
fill it in, and follow `gbrain/README.md`.

## Development

See [AGENTS.md](AGENTS.md) for the full command reference. Quick version:

- `make quality` — run every quality gate (app + iOS)
- `npm --prefix app run check` — app checks; `npm --prefix app run build:all` — build
- `make -C ios/exe quality` — iOS lint + format-check + simulator build

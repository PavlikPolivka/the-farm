# Decisions log

The interview record in `DESIGN.md` is fixed. This file records every default Claude Code picked on its own, newest last.

## M0 — 2026-10-08

| # | Decision | Why |
|---|----------|-----|
| 1 | Working title **Pixel Farm** / **Pixelová farma** (`shared/src/config/game.ts`) | Final name is still an open question; one constant to change. |
| 2 | Delivery: push to `main` on GitHub → Actions runs `pnpm check` + build → multi-arch image (`linux/amd64`, `linux/arm64`) to `ghcr.io/pavlikpolivka/the-farm`. Homelab pulls it. | Pavel's choice in planning; no local Docker. Both architectures because the homelab CPU wasn't inspected. |
| 3 | Homelab is **prepare-only**: snippets + `deploy/DEPLOY.md`; Claude Code does not SSH in. | Autonomy rules in `DESIGN.md`. |
| 4 | Phaser **3.90** (not 4.x), TypeScript **5.9** (not 7) | The doc fixes Phaser 3; typescript-eslint supports TS < 6.1. |
| 5 | Node **22** (`.nvmrc`, `engines`), pnpm **10** via `packageManager` | Vite 8, Vitest 5 and better-sqlite3 13 require Node ≥ 22. |
| 6 | openid-client **v6**, confidential client with `client_secret_basic`; PKCE verifier, state and nonce in a signed, 10-minute, `Path=/auth` cookie | Matches Authelia's default token auth method; no server-side flow table needed. |
| 7 | Profile and groups read from the **userinfo** endpoint, not only the ID token | Recent Authelia versions keep those claims out of the ID token by default. |
| 8 | Sessions: opaque random token in `pf_session`, SHA-256 stored in SQLite; sliding expiry renewed at most once a day | A leaked DB doesn't leak live cookies; avoids a write on every request. |
| 9 | Display name and locale are taken from Authelia (`name`) / `Accept-Language` **on first login only**; `is_admin` refreshes every login from `pixel-farm-admin` | The admin owns names after that (design doc); group membership stays authoritative. |
| 10 | Members of either `pixel-farm` or `pixel-farm-admin` may play | So Pavel doesn't need both groups. |
| 11 | `DEV_FAKE_USER` env lets local dev skip OIDC; ignored when `NODE_ENV=production` (tested) | Lets client and server be developed without Authelia. |
| 12 | Migrations are an append-only array applied via `PRAGMA user_version` | No migration library needed for one SQLite file. |
| 13 | M0 UI buttons are HTML over the Phaser canvas | Real DOM clicks are reliable user gestures for the iOS notification prompt; the game UI moves into Phaser in M1. |
| 14 | M0 strings are a tiny in-file dictionary; i18next + ICU plurals arrive in M1 | M0 has ~15 strings. |
| 15 | Temporary 10-colour palette in `scripts/sprites/palette.ts`, replaced by the palette extracted from the Kenney pack in M1 | Icons are needed before any packs are downloaded. |
| 16 | Service worker built with `injectManifest`; `/api`, `/auth`, `/healthz` are `NetworkOnly` and excluded from the navigation fallback; `index.html`, `sw.js` and the manifest are served `no-cache` | Required by the design doc; ensures deploys are picked up on the next launch. |
| 17 | Homelab: Claude Code stages everything it can as `pavel` (secrets generated on the homelab, smoke tests, dry-run validation); root-owned edits go through `deploy/homelab-setup.sh`, which Pavel runs with sudo | Pavel's instruction (2026-10-08); no passwordless sudo on the box. |
| 18 | Reuse Authelia groups: `PLAY_GROUPS=family,pixel-farm`, `ADMIN_GROUPS=admins`; the kid gets only `pixel-farm` | `family` grants forward-auth access to portal, scan, crm, pdf, printer and druhy, which the kid shouldn't have. |
| 19 | Caddy site `:9097`, tunnel hostname `farm.ppolivka.com → http://caddy:9097` | Matches the existing port-per-app layout. |

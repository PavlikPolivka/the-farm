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

## M1 — 2026-10-08

| # | Decision | Why |
|---|----------|-----|
| 20 | M0 exit: Android passed (install, login, push via FCM). **iPhone test still pending**, Pavel will run it later; M1 does not depend on auth | Pavel's call, to keep moving. |
| 21 | Art: Kenney **Tiny Farm** + **Tiny Town** (both CC0, verified from bundled License.txt by `pnpm assets:download`); sheets committed under `assets/vendor/` so builds never hit the network | Tiny Farm has crop growth stages, animals and goods in one 16×16 style. |
| 22 | Crops follow the art: wheat, carrot, corn, tomato, cabbage (not pumpkin/sunflower/strawberry) | Those five have sprout → growing → ripe sprites in Tiny Farm. |
| 23 | Animals: chicken→egg (eats wheat), sheep→wool (carrot), cow→milk (corn), beehive→honey (no feed) | Feeding links the crop and animal loops; bees give an idle-only income source. |
| 24 | Helpers: farmhand = automates one field; sprinkler = +20 % grow speed/level; scarecrow = +25 % yield/level (fractions carry); mill = auto-sells surplus and +10 % prices/level | Makes each named helper from the design doc do one understandable thing. |
| 25 | Missing sprites (windmill, sails, wool, honey, hand, sparkle, star, sprinkler, scarecrow, lock, gear, barn) drawn as palette grids in `scripts/assets/generated.ts`; the build fails if any colour is outside the 52-colour Kenney master palette | Keeps everything looking like one pack. |
| 26 | Individual PNGs, not atlases, for now (54 sprites, all precached) | Simpler; atlas packing moves to M6 with the size budget. |
| 27 | Plain JS numbers instead of break_infinity.js | Balance sim tops out around 1e9 after 6 days; doubles are exact to 9e15 and go to 1e308. Swap in later only if prestige pushes past that. |
| 28 | XP only from active play (hand harvests, orders; minigames in M3); idle production gives coins and goods but no XP. Level curve is geometric (×1.35) | First tuning let idle XP reach level 267 in 6 casual days. Now levels track play time. |
| 29 | Windmill tap power (level + 1)^1.5 with cost ×2.5 per level | Doubling power per level made tapping a runaway engine (millions per tap). |
| 30 | World in Phaser, all UI (HUD, sheets, toasts, tutorial) in the DOM | Crisp Czech diacritics at any size, real buttons, accessible tap targets; system font until the M6 pixel-font check. |
| 31 | Native pointer events on the canvas instead of Phaser's input queue; boot screen stays until the scene is ready | Phaser processes input on the next frame; quick taps were delayed or lost in testing. |
| 32 | Seed choice is a HUD chip ("Seed: Wheat"); tapping an empty field plants it, tapping a farmhand field picks what the farmhand plants | One tap per field for the kid; no popup per planting. |
| 33 | Locale stored in localStorage until M2 moves it to the server per user | M1 is offline single-player. |
| 34 | `window.__pf` exposes the local store for e2e/debugging | Only touches the device's own local farm; M2's server clamp limits what a doctored save can do. |
| 35 | Balance targets are tests (`shared/src/sim/bot.test.ts`): every profile buys within 30 s and hires a helper within 5 min | M1 exit criteria, enforced in CI. Coins over 6 days are still high; prestige pacing (seeds formula) is tuned in M5. |

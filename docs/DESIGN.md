# Pixel Farm — Family Clicker PWA Design Doc

8. 10. 2026 · Pavel Polivka

> This is the spec. The interview record is fixed. Everything else is a default Claude Code may adjust, logging each change in `DECISIONS.md`.

## Summary
Pixel Farm is a pixel-art farm clicker built as a PWA for three family players: Pavel, his wife and their 7-year-old.
- Each player grows their own village through tapping and idle production.
- Players play short minigames, visit and gift each other, and compete on family leaderboards.
- It runs on the homelab behind the existing Authelia and installs from the browser on Android and iOS.
- It is built by Claude Code with minimal human input.

Design pillars:
- **Always something to do.** A harvest is ready, a minigame is waiting, a gift has arrived, or a collection has a gap.
- **Pure family competition.** There are no handicaps. Skill-based minigames give the 7-year-old a real chance.
- **No pressure.** Nothing is lost by being away. No streak penalties, expiring offers or nag loops.
- **Readable at age 7.** Simple words, big tap targets, and an icon next to every label.
- **Zero-touch build.** Claude Code picks defaults, downloads CC0 assets and generates whatever is missing.

"Pixel Farm" is a working title; the final name, including a Czech one, is open.

## Interview record (fixed requirements)
| Topic | Decision |
|---|---|
| Platform | PWA, no app store. Pavel: Android; wife and kid: iPhones |
| Players | Pavel, his wife, their 7-year-old |
| Genre | Clicker with light puzzle elements |
| Theme | Build and grow a village/farm |
| Language | Czech and English, switchable |
| Competition | Personal leaderboards, shared daily challenge, weekly boards |
| Session shape | Idle base plus optional active bursts |
| Puzzles | A mix of small minigames |
| Village ownership | Each player has their own village; visit and gift each other |
| Fairness | No handicap, pure competition |
| Kid's reading level | Reads well |
| Healthy play | No time cap, but no pressure mechanics |
| Long-term structure | Endless growth with prestige resets |
| Interaction depth | Gifts and visiting only, no trading |
| Collections | Animals, decorations, building skins, achievements |
| Hosting | Homelab: Docker API + SQLite behind Caddy and Cloudflare Tunnel |
| Login | The existing Authelia on the homelab |
| Art | Pixel art from CC0 packs (Kenney first) |
| Notifications | Social (gift received, village visited) plus "crops ready" |
| Audio | CC0 chiptune music and sound effects |
| Stack | TypeScript, Phaser 3, Vite, vite-plugin-pwa, Fastify, SQLite |
| Build method | Claude Code, minimal input; it downloads or generates the graphics |

## Core loop and economy
1. Tap a field to plant it; tap a ripe crop to harvest coins and produce.
2. Feed crops to animals, which produce eggs, milk, wool and honey worth more than the crops.
3. Spend coins on new fields, buildings, animals and upgrades.
4. Hire helpers (farmhand, scarecrow, sprinkler, mill) that plant and harvest automatically. This is the idle income.
5. Expand the village tile by tile to unlock the next tier of buildings.
6. Once growth slows, prestige.

**Active play.**
- The windmill in the village centre is the clicker button. Each tap gives coins scaled by Tap Power upgrades.
- Harvesting crops in a row, each within 1.5 s of the last, builds a combo multiplier that tops out at x2.

**Idle play.**
- Helpers produce at their listed rate.
- Offline progress accrues at 100% for up to 24 h. A prestige perk raises the cap to 48 h.

**Orders board.**
- Three villager orders are always open, for example "20 carrots + 5 eggs".
- Each pays coins and sometimes a collectible.
- A completed order is replaced immediately. Orders never expire.

| Resource | Source | Used for |
|---|---|---|
| Coins | Harvests, windmill taps, orders, minigames | All purchases |
| Crops (wheat, carrot, pumpkin, sunflower, strawberry) | Fields | Selling, animal feed, orders |
| Animal goods (eggs, milk, wool, honey) | Animals | Selling, orders |
| Golden Seeds | Prestige | Permanent multipliers |
| Collectibles | Minigames, orders, rare harvest drops | Collections |

Balance targets (tunable in `shared/config`):
- First purchase within 30 s.
- First helper within 5 min.
- First prestige after 4–6 days of casual play (2–3 sessions a day).
- Each later prestige run 20–30% shorter than the one before.

Use break_infinity.js with short-scale suffixes (1.2K, 3.4M, 5.6B) in both languages.

## Minigames and daily challenge
Five minigames on one seeded, deterministic engine:

| Minigame | Mechanic | Skill | Length |
|---|---|---|---|
| Pexeso | Flip pairs of farm cards; score from moves and time | Memory | 60–90 s |
| Water Pipes | Rotate pipe tiles to route water from the well to the fields | Spatial | ~2 min |
| Crop Merge | 2048-style merging on 4×4: seed → sprout → crop → basket | Planning | ~3 min |
| Harvest Rush | Tap ripe crops, avoid weeds and unripe ones | Reflex | 30 s |
| Egg Sort | Ball-sort puzzle: sort coloured eggs into baskets | Logic | ~2 min |

Free play:
- Free play is unlimited, with no energy system.
- Rewards taper off after 5 rewarded plays per game per day. After that the game stays playable as practice.

Daily challenge:
- The featured game rotates by date. The day starts at midnight Europe/Prague.
- The seed is `HMAC-SHA256(server secret, YYYY-MM-DD)`, so everyone gets the same board.
- The first attempt on the daily seed is the ranked one. Practice always uses random seeds.
- Difficulty is the same for everyone and is tuned so a 7-year-old can finish every game.
- The day's winner gets a crown on their village until the next day, plus a collectible.
- Missing a day costs nothing.

**Score validation.**
- The client submits its input log (moves with timestamps), not a score.
- The server replays the log through the same engine from `shared/` and computes the score itself.

## Social: visiting, gifts, leaderboards, notifications
**Visiting.**
- A family bar shows the three players. Tapping one opens a read-only view of their village, rendered from their latest save.
- A visitor can leave one sticker reaction per visit, and the owner gets a notification.

**Gifts.**
- A player can send crops or animal goods from their own inventory, or a free flower that is worth nothing.
- At most 3 gifts per recipient per day.
- One gift is capped at 10% of the sender's current hourly income.
- Gifts land in an inbox, are claimed with one tap, and never expire.

| Board | Ranks by | Resets |
|---|---|---|
| All-time Farmer | Prestige level, then lifetime coins | Never |
| This Week | Coins earned this week | Monday 00:00 Prague |
| Daily Challenge | Today's ranked score | Daily |
| Minigame Bests | Best score per minigame | Never |
| Collector | Collection completion % | Never |
| Achievements | Achievements unlocked | Never |

The weekly winner gets a trophy decoration for their trophy cabinet.

**Notifications.**
- They use Web Push with VAPID keys.
- On iOS they need the PWA installed on the home screen (iOS 16.4+), and the permission prompt must come from a tap.

| Type | Rule |
|---|---|
| Gift received | Sent immediately |
| Village visited | Batched, at most one per hour |
| Crops ready | When manually planted fields are all ripe; at most 2 per day |

- Quiet hours default to 20:00–08:00. Each type can be toggled per player.
- The server computes each player's next "ready" time at sync and queues it in a SQLite `jobs` table. A 1-minute ticker sends whatever is due.

## Progression, prestige and collections
**Within a run.**
- Village XP comes from harvests, orders and minigames.
- Each level unlocks a building, crop or animal.
- Land expands up to 8 tiles.

**Prestige ("Move to new land").**
- Resets: coins, fields, buildings, helpers, land, crops and goods.
- Keeps: Golden Seeds, collections, decoration unlocks, achievements and trophies.
- Seeds earned: `floor(sqrt(coins earned this run / 1,000,000))` (tunable).
- Each Golden Seed adds +2% to all production.
- Perk tree: production %, tap power, a 48 h offline cap, starting with a helper, a 4th order slot, and higher rare-drop chance.

**Collections.**
- The Collection Book shows found items and silhouettes of missing ones.

| Collection | Count | Obtained from | Effect |
|---|---|---|---|
| Animals | 24 (6 rare) | Common ones bought; rare ones from minigames and orders | +1% production per species |
| Decorations | 40 | Orders, minigames, weekly trophies | Mostly cosmetic; +5% to adjacent fields |
| Building skins | 15 | Achievements, minigame milestones | Cosmetic |
| Achievements | 60, bronze/silver/gold | Play milestones | Badge on profile |

All drop rates, counts and bonuses live in `shared/config` as data, not code.

## Kid-friendliness, accessibility, i18n
**Layout and input.**
- Portrait only, with core actions in the bottom half.
- Tap targets are at least 48×48 CSS px.
- Haptics use `navigator.vibrate` on Android only, and no feature depends on it.

**Text and clarity.**
- Every label has an icon. Tooltips are at most 2 short lines.
- A 6-step skippable guided first session uses a pointing hand.
- Crop readiness shows as a sprite change plus sparkle, never by colour alone.
- Egg Sort eggs carry patterns as well as colours.

**Comfort.**
- Respect `prefers-reduced-motion`, with an in-game toggle too. Screen shake is off by default.
- Music and sound effects have separate volume controls and a mute toggle. Music starts at 40%.

**Safety.**
- No free text between players; stickers only.
- No external links, ads or purchases.
- Display names are set by an admin.

**Internationalisation.**
- Ship `cs` and `en` from day one with i18next and ICU plurals.
  - Czech has three plural forms: "3 mrkve" and "5 mrkví" must both be correct.
- The default language comes from `navigator.language`. The choice is stored per user on the server.
- Czech text uses full diacritics.
- Large numbers use suffixes. Small ones use `Intl.NumberFormat`.
- Pixel font check: "Příliš žluťoučký kůň úpěl ďábelské ódy" must render with no fallback glyphs.

## Technical architecture
One Docker container serves the static game and the API. Gameplay runs client-side on a shared deterministic simulation. The server stores saves, checks scores and sends pushes.

Repository (pnpm monorepo):

| Folder | Contents |
|---|---|
| `client/` | Phaser 3, Vite, vite-plugin-pwa |
| `server/` | Fastify, better-sqlite3 |
| `shared/` | Simulation, minigame engines, game config, types |
| `scripts/` | Asset pipeline, balance sim |
| `assets/` | Downloaded and generated art and audio |
| `deploy/` | Dockerfile, compose file, Caddy/Authelia/tunnel snippets |

**Sync and validation.**
- The client saves to IndexedDB on every change (debounced).
- It sends `PUT /api/save` every 30 s and whenever the page becomes hidden.
- Saves carry a version number. On conflict the server copy wins.
- Plausibility clamp: max progress = production rate × elapsed time, capped by the offline cap and 15 taps/s. The save is clamped to it.

| Table | Key columns |
|---|---|
| users | id, oidc_sub, display_name, locale, is_admin |
| sessions | id, user_id, expires_at |
| saves | user_id, version, state_json, updated_at |
| stats | user_id, lifetime_coins, week_coins, prestige_level, collection_pct, achievements |
| daily_results | user_id, date, game, seed, input_log, score |
| best_scores | user_id, game, best_score |
| gifts | id, from_id, to_id, payload_json, created_at, claimed_at |
| visits | id, visitor_id, owner_id, sticker, created_at |
| push_subs | user_id, endpoint, keys_json, prefs_json |
| jobs | id, user_id, type, due_at, sent_at |

| Method and path | Purpose |
|---|---|
| `GET /auth/login`, `GET /auth/callback`, `POST /auth/logout` | OIDC login with Authelia, session cookie |
| `GET /api/me` | Current player, locale, admin flag |
| `GET, PUT /api/save` | Load and store the save (versioned, clamped) |
| `GET /api/daily` | Today's game and seed |
| `POST /api/daily/result` | Ranked attempt as input log; server replays and scores |
| `POST /api/minigame/result` | Free-play result as input log; returns rewards |
| `GET /api/leaderboards/:board` | One of the six boards |
| `GET /api/family` | Players and summary stats |
| `GET /api/village/:userId` | Read-only village snapshot |
| `POST /api/visits` | Record a visit and its sticker |
| `POST /api/gifts`, `GET /api/gifts/inbox`, `POST /api/gifts/:id/claim` | Gifts |
| `POST /api/push/subscribe`, `PUT /api/push/prefs` | Push subscription and preferences |

## Auth via existing Authelia and the iOS PWA risk
The game is one more OIDC client of Authelia, using a backend-for-frontend flow. After login it issues its own 180-day sliding session.

1. The public app shell loads. `GET /api/me` returns 401.
2. "Log in" is a top-level navigation to `/auth/login`. The server redirects to Authelia using the code flow with PKCE, state and nonce, as a confidential client.
3. The player logs in at Authelia and is redirected to `/auth/callback?code=…`.
4. The server exchanges the code, validates the ID token, and upserts the user by `sub`. It sets `pf_session` (httpOnly, Secure, SameSite=Lax, 180 days, sliding) and redirects to `/`.

Homelab changes (one-time):
- An Authelia client `pixel-farm` with:
  - a hashed secret
  - redirect `https://farm.ppolivka.com/auth/callback`
  - scopes `openid profile groups`
  - `one_factor` (the kid has no second factor)
  - implicit consent
- Authelia users for the wife and kid.
  - Group `pixel-farm` can play.
  - Group `pixel-farm-admin` can rename players and reset saves.
- Caddy: no forward_auth on `farm.ppolivka.com`.
- Cloudflare Tunnel: ingress for `farm.ppolivka.com`.
- Service worker: never cache `/auth/*` or `/api/*`; exclude `/auth` from the navigation fallback.

**iOS risk.**
- In an installed iOS PWA, navigating to `auth.ppolivka.com` leaves the app's scope and opens an in-app browser overlay.
- Whether the callback lands back in the app with the cookie set has varied between iOS versions.
- Spike M0 tests this on a real device.
- Fallback (build only if the spike fails): a pairing code.
  1. The player logs in through Safari at `/pair` and gets a 6-digit code valid for 5 minutes.
  2. Entering it inside the PWA sets the session cookie there.

## Assets and audio pipeline
**Sources.**
- Primary: Kenney 16×16 pixel town/farm tilesets, UI pack and icons.
  - Verify each pack's bundled license is CC0.
- Secondary: OpenGameArt, CC0 only.
- Log every asset in `assets/manifest.json`. Generate `CREDITS.md` from it and show an in-game credits screen.

**Visual consistency.**
- 16×16 base tiles, scaled at integer factors (3–4×) with nearest-neighbour filtering.
- A master palette is extracted from the primary pack. Generated sprites use only those colours.

**Gap-filling generator.**
- `scripts/sprites/` defines palette-indexed pixel grids in TypeScript and renders them to PNG with pngjs.
- Variants come from palette swaps.
- Atlases are packed with free-tex-packer-core.

**PWA icons.** 192, 512, maskable, and a 180 apple-touch-icon.

**Audio.**
- Sound effects: Kenney CC0 audio packs, plus jsfxr effects from JSON parameters.
- Music: 3–5 CC0 chiptune loops.
- Encode as AAC `.m4a` with an `.ogg` fallback. Unlock audio on the first tap.

**Size budget.** First load ≤ 5 MB; full precache ≤ 15 MB.

## Milestones
Each milestone ends with a deployed, playable build.

**M0 Spike**
- Scope: scaffold, minimal Phaser scene, PWA manifest + SW, Docker deploy, Authelia OIDC, test Web Push.
- Exit:
  - On a real iPhone: install the app, log in, kill and reopen it, and still be logged in.
  - A test push arrives.
  - The same works on Android.

**M1 Farm loop**
- Scope: shared simulation, offline progress, IndexedDB save, tutorial, Kenney download + sprite generator, cs/en strings.
- Exit:
  - Playable offline.
  - Simulation tests pass.
  - First purchase under 30 s and first helper under 5 min.

**M2 Sync and boards**
- Scope: save sync, plausibility clamp, stats, family bar, six leaderboards.
- Exit: three accounts see each other's ranks, and a doctored save is clamped.

**M3 Minigames**
- Scope: five engines, input-log replay, free-play rewards, daily rotation and seed, crown.
- Exit: the server-replayed score equals the client score across 1,000 random seeds for each game.

**M4 Social and push**
- Scope: visits, stickers, gifts with caps, inbox, three notification types with quiet hours.
- Exit: a gift sent from Android triggers a push on an iPhone.

**M5 Prestige and collections**
- Scope: prestige, perk tree, Collection Book, achievements, skins, trophies.
- Exit: the balance sim shows first prestige after 4–6 days.

**M6 Polish**
- Scope: music and SFX, reduced motion, Czech pangram font check, credits, nightly backup, size budget.
- Exit:
  - Lighthouse reports the app installable.
  - First load ≤ 5 MB.
  - A backup lands on the NAS overnight.

## Autonomy rules and defaults
Claude Code decides everything not listed below and logs it in `docs/DECISIONS.md`.

Ask Pavel only for:
- applying changes on the homelab (Claude Code writes snippets plus `deploy/DEPLOY.md`)
- real-device testing
- anything touching existing homelab services

Quality bar:
- Vitest for `shared/`: determinism, offline maths, minigame replay.
- Playwright e2e tests on Pixel 7 (Chromium) and iPhone 14 (WebKit).
- A balance-sim script printing time-to-milestone for casual, active and kid profiles.
- `pnpm check` (typecheck, lint, tests) must pass before every milestone ends.

| Setting | Default |
|---|---|
| Domain | farm.ppolivka.com |
| Deploy path | /opt/pixel-farm, Docker network `portal`, port 3000 |
| Database | SQLite WAL at /opt/pixel-farm/data/farm.db |
| Backup | Nightly `sqlite3 .backup` copied to the OMV NAS |
| Day boundary | Midnight Europe/Prague |
| Weekly reset | Monday 00:00 |
| Quiet hours | 20:00–08:00 |
| Offline cap | 24 h (48 h with a perk) |
| Session length | 180 days, sliding |

Open questions:
- [ ] Final game name, in Czech and English
- [x] Should Claude Code apply homelab config over SSH? No: build via GitHub Actions; homelab changes are prepared, Pavel applies them (2026-10-08)
- [ ] Display names and avatars for the three players

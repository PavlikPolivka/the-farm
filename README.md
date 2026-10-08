# Pixel Farm

A family pixel-art farm clicker PWA. See [docs/DESIGN.md](docs/DESIGN.md) for the spec, [docs/DECISIONS.md](docs/DECISIONS.md) for the decisions made while building, and [deploy/DEPLOY.md](deploy/DEPLOY.md) for homelab setup.

**Status:** M3: five minigames with server replay, free-play rewards, the daily challenge and its crown, on top of save sync, boards (M2) and the farm loop (M1). M0 passed on Android; the iPhone login test is pending.

## Develop
Requires Node 22 (`nvm use`) and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm assets                        # slice/generate sprites and PWA icons into client/public
pnpm --filter @pixel-farm/shared build
cp deploy/.env.example .env        # for local dev, set DEV_FAKE_USER=pavel and leave the OIDC vars empty
pnpm dev                           # server :3000, Vite :5173 (proxies /api and /auth)
```

| Command | What it does |
|---|---|
| `pnpm check` | typecheck + lint + tests (must pass before a milestone ends) |
| `pnpm build` | sprites, shared, server, client (`client/dist`) |
| `pnpm e2e` | Playwright on Pixel 7 (Chromium) and iPhone 14 (WebKit); run `pnpm build` first |
| `pnpm balance` | balance sim: time-to-milestone for active, casual and kid players |
| `pnpm assets:download` | re-download the Kenney packs (checks CC0) |
| `pnpm vapid` | print a fresh VAPID key pair |

## Layout
| Folder | Contents |
|---|---|
| `shared/` | types, game config, farm simulation, save validation, minigame engines (`src/games`) |
| `server/` | Fastify API, OIDC login, sessions, Web Push, SQLite |
| `client/` | Phaser 3 game, PWA manifest and service worker (`client/sw/`) |
| `scripts/` | asset pipeline (`scripts/assets`), balance sim, VAPID key generator |
| `assets/` | committed Kenney sheets, `manifest.json` of every sprite and its source |
| `e2e/` | Playwright tests |
| `deploy/` | Dockerfile, compose file, Authelia, Caddy and tunnel snippets, `DEPLOY.md` |

Pushing to `main` runs CI and publishes `ghcr.io/pavlikpolivka/the-farm:latest`.

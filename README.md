# Pixel Farm

A family pixel-art farm clicker PWA. See [docs/DESIGN.md](docs/DESIGN.md) for the spec, [docs/DECISIONS.md](docs/DECISIONS.md) for the decisions made while building, and [deploy/DEPLOY.md](deploy/DEPLOY.md) for homelab setup.

**Status:** M0 spike: scaffold, OIDC login, PWA install and a test push.

## Develop
Requires Node 22 (`nvm use`) and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm sprites                       # generate sprites and PWA icons into client/public
pnpm --filter @pixel-farm/shared build
cp deploy/.env.example .env        # for local dev, set DEV_FAKE_USER=pavel and leave the OIDC vars empty
pnpm dev                           # server :3000, Vite :5173 (proxies /api and /auth)
```

| Command | What it does |
|---|---|
| `pnpm check` | typecheck + lint + tests (must pass before a milestone ends) |
| `pnpm build` | sprites, shared, server, client (`client/dist`) |
| `pnpm vapid` | print a fresh VAPID key pair |

## Layout
| Folder | Contents |
|---|---|
| `shared/` | types, game config, (later) simulation and minigame engines |
| `server/` | Fastify API, OIDC login, sessions, Web Push, SQLite |
| `client/` | Phaser 3 game, PWA manifest and service worker (`client/sw/`) |
| `scripts/` | sprite generator, VAPID key generator |
| `deploy/` | Dockerfile, compose file, Authelia, Caddy and tunnel snippets, `DEPLOY.md` |

Pushing to `main` runs CI and publishes `ghcr.io/pavlikpolivka/the-farm:latest`.

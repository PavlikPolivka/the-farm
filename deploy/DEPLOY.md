# Deploying Pixel Farm to the homelab

## How the homelab is wired (surveyed 2026-10-08)
- Docker apps live in `/opt/<app>` on the external network `portal`.
- Caddy (`/opt/caddy/Caddyfile`) listens on one port per app (`:9081`–`:9096`) and has no TLS.
- The Cloudflare tunnel is token-managed. The dashboard maps each hostname to `http://caddy:<port>`.
- Authelia 4.39 uses a file backend with groups `admins` (Pavel) and `family` (Pavel, Nikola).
- Pixel Farm gets **`:9097`** and **farm.ppolivka.com**.
- Who can play: `PLAY_GROUPS=family,pixel-farm`; admins: `ADMIN_GROUPS=admins`.
  - The kid gets only `pixel-farm`. `family` would also unlock portal, scan, crm, pdf, printer and druhy.

## Already done by Claude Code (no sudo needed)
- [x] `~/pixel-farm-staging/.env` (mode 600) with a session secret, VAPID keys and the OIDC client secret. These were generated on the homelab and never left it.
- [x] `~/pixel-farm-staging/oidc-client-digest`: the pbkdf2 digest of that secret, for Authelia.
- [x] `compose.yml`, `Caddyfile.snippet` and `homelab-setup.sh` uploaded to the staging directory.
- [x] Image pulled and smoke-tested with the real `.env`:
  - `/healthz` works.
  - `/api/me` returns 401.
  - `/auth/login` returns 302 to `auth.ppolivka.com` with PKCE.
- [x] Dry runs: the Caddyfile with the new block and the Authelia config with the new client both validate.

## Pavel: run the sudo script (about 2 minutes)
```sh
ssh pavel@192.168.0.113
sudo bash ~/pixel-farm-staging/homelab-setup.sh
```
It asks before each step, backs up every file it edits (`*.bak-pixel-farm-<timestamp>`), and skips steps that are already done.

1. Creates `/opt/pixel-farm` (owned by `pavel`), installs `.env` and `compose.yml`, and starts the container.
2. Appends `:9097 → pixel-farm:3000` to the Caddyfile, validates it, and reloads Caddy (no restart).
3. Creates the kid's Authelia account in group `pixel-farm`. It prompts for username, display name and password.
4. Adds the `pixel-farm` OIDC client, validates the config, and restarts Authelia.
   - Other SSO logins blip for a few seconds.
   - If Authelia doesn't come back healthy, it rolls back automatically.

## Pavel: Cloudflare dashboard
Zero Trust → Networks → Tunnels → (tunnel) → Public Hostname → Add:
- Subdomain `farm`, domain `ppolivka.com`
- Type **HTTP**, URL **caddy:9097**

Then `curl -s https://farm.ppolivka.com/healthz` should return `{"ok":true,...}`.

## Updating later
```sh
cd /opt/pixel-farm && docker compose pull && docker compose up -d
```
`pavel` owns `/opt/pixel-farm` and is in the `docker` group, so no sudo is needed.

## M0 exit test (real devices)
This is the gate for the whole auth design. Report each result back.

**iPhone (Safari, iOS 16.4+)**
1. [ ] Open https://farm.ppolivka.com in Safari, then Share → Add to Home Screen.
2. [ ] Open the app from the home screen. The footer should say `app`, not `browser`.
3. [ ] Tap **Log in**, sign in at Authelia, and confirm you land back in the app with "Hi, <name>!".
   - Note whether the return trip lands in the installed app or in a Safari overlay.
4. [ ] Kill the app from the app switcher and reopen it. It should still say "Hi, <name>!".
5. [ ] Tap **Enable notifications**, then allow.
6. [ ] Tap **Send test notification**, then lock the phone. "Hello from the farm 🌾" should arrive.

**Android (Chrome)**
7. [ ] Repeat steps 1–6 with Chrome → Install app.

If step 3 or 4 fails on iOS, the next step is the `/pair` 6-digit code fallback from `docs/DESIGN.md`.

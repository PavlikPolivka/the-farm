# Deploying Pixel Farm to the homelab (M0)

Claude Code prepares these files. Pavel applies them on the homelab. Do the steps in order and tick them off.

## 1. Authelia users and groups
- [ ] Find the user backend (file `users_database.yml` or LDAP).
- [ ] Add groups `pixel-farm` and `pixel-farm-admin` to Pavel's user.
- [ ] Create accounts for the wife and the kid with group `pixel-farm`. See `authelia-users.yml`.
  - `displayname` becomes the in-game player name on first login. An admin can change it later.

## 2. Authelia OIDC client
- [ ] Run `authelia --version` and compare `authelia-client.yml` with the docs for that version.
- [ ] Generate the client secret. The command is in the header of `authelia-client.yml`.
  - The plain-text secret goes in `.env` (step 5).
  - The `$pbkdf2-sha512$…` digest goes in the Authelia config.
- [ ] Merge the client into `identity_providers.oidc.clients`.
- [ ] Restart Authelia and check the log for config errors.
- [ ] `curl https://auth.ppolivka.com/.well-known/openid-configuration` returns JSON.

## 3. Caddy
- [ ] Add the `Caddyfile.snippet` site block. Use the `portal` network variant, or the loopback variant if Caddy runs on the host.
- [ ] Do **not** add `forward_auth` to this site.
- [ ] Reload Caddy.

## 4. Cloudflare Tunnel
- [ ] Add the `farm.ppolivka.com` ingress from `cloudflared-ingress.yml`, matching the existing hostnames, or add it in the Zero Trust dashboard.
- [ ] Make sure the DNS record exists (`cloudflared tunnel route dns <tunnel> farm.ppolivka.com` or the dashboard).

## 5. App container
```sh
sudo mkdir -p /opt/pixel-farm/data && cd /opt/pixel-farm
sudo chown 1000:1000 data            # the container runs as uid 1000 (node)
# copy compose.yml and .env.example from this repo's deploy/ folder
cp .env.example .env && chmod 600 .env
openssl rand -base64 48              # → SESSION_SECRET
npx web-push generate-vapid-keys     # → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (or `pnpm vapid` in the repo)
# fill in .env, including OIDC_CLIENT_SECRET from step 2
```
- [ ] The image is `ghcr.io/pavlikpolivka/the-farm:latest`, built by GitHub Actions on every push to `main`. If the GHCR package is private, run one of these:
  - `docker login ghcr.io -u PavlikPolivka` with a PAT that has `read:packages`, or
  - make the package public under GitHub → Packages → the-farm → Settings.
- [ ] `docker compose pull && docker compose up -d`
- [ ] `docker compose logs -f`. Expect no "OIDC not configured" or "VAPID" warnings.
- [ ] `curl -s https://farm.ppolivka.com/healthz` returns `{"ok":true,...}`.

Updating later: `docker compose pull && docker compose up -d`.

## 6. M0 exit test (real devices)
This is the gate for the whole auth design. Report each result back.

**iPhone (Safari, iOS 16.4+)**
1. [ ] Open https://farm.ppolivka.com in Safari, then Share → Add to Home Screen.
2. [ ] Open the app from the home screen. The footer should say `app`, not `browser`.
3. [ ] Tap **Log in**, sign in at Authelia, and confirm you land back in the app with "Hi, <name>!".
   - Note whether the return trip lands in the installed app or in a Safari overlay.
4. [ ] Kill the app from the app switcher and reopen it. It should still say "Hi, <name>!" with no login prompt.
5. [ ] Tap **Enable notifications**, then allow.
6. [ ] Tap **Send test notification**, then lock the phone. "Hello from the farm 🌾" should arrive.

**Android (Chrome)**
7. [ ] Repeat steps 1–6 with Chrome → Install app.

If step 3 or 4 fails on iOS, the next step is the `/pair` 6-digit code fallback from `docs/DESIGN.md`.

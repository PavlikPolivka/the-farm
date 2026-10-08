#!/usr/bin/env bash
# One-time homelab setup for Pixel Farm. Run on the homelab as:
#   sudo bash ~/pixel-farm-staging/homelab-setup.sh
#
# Expects ~/pixel-farm-staging (prepared by Claude Code) to contain:
#   .env                 app secrets (mode 600)
#   oidc-client-digest   pbkdf2 digest of OIDC_CLIENT_SECRET
#   compose.yml          app compose file
#   Caddyfile.snippet    the :9097 site block
#
# Every edited file is backed up as <file>.bak-pixel-farm-<timestamp>. Each step asks first,
# is skipped if already done, and configs are validated in a throwaway container before use.
set -euo pipefail

STAGING=/home/pavel/pixel-farm-staging
APP_DIR=/opt/pixel-farm
AUTHELIA_CFG=/opt/authelia/config/configuration.yml
AUTHELIA_USERS=/opt/authelia/config/users_database.yml
CADDYFILE=/opt/caddy/Caddyfile
OWNER=pavel
TS=$(date +%Y%m%d-%H%M%S)

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mxx  %s\033[0m\n' "$*" >&2; exit 1; }
confirm() { read -r -p "$1 [Y/n] " a; [[ -z "$a" || "$a" =~ ^[Yy] ]]; }
backup() { cp -a "$1" "$1.bak-pixel-farm-$TS"; echo "    backup: $1.bak-pixel-farm-$TS"; }

[[ $EUID -eq 0 ]] || die "Run with sudo."
for f in .env oidc-client-digest compose.yml Caddyfile.snippet; do
  [[ -f "$STAGING/$f" ]] || die "Missing $STAGING/$f"
done

# --------------------------------------------------------------------------- 1. app container
say "1/4  App: $APP_DIR (owned by $OWNER), image ghcr.io/pavlikpolivka/the-farm:latest"
if confirm "Create $APP_DIR and start the container?"; then
  install -d -o "$OWNER" -g "$OWNER" -m 755 "$APP_DIR"
  install -d -o 1000 -g 1000 -m 750 "$APP_DIR/data"    # container user `node` is uid 1000
  [[ -f "$APP_DIR/.env" ]] && backup "$APP_DIR/.env"
  install -o "$OWNER" -g "$OWNER" -m 600 "$STAGING/.env" "$APP_DIR/.env"
  install -o "$OWNER" -g "$OWNER" -m 644 "$STAGING/compose.yml" "$APP_DIR/compose.yml"
  sudo -u "$OWNER" docker compose -f "$APP_DIR/compose.yml" --project-directory "$APP_DIR" pull -q
  sudo -u "$OWNER" docker compose -f "$APP_DIR/compose.yml" --project-directory "$APP_DIR" up -d
  for _ in $(seq 1 20); do
    docker exec pixel-farm wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec pixel-farm wget -qO- http://127.0.0.1:3000/healthz && echo || die "App is not healthy: docker logs pixel-farm"
fi

# --------------------------------------------------------------------------- 2. caddy
say "2/4  Caddy: add the :9097 site (no forward_auth) and reload"
if grep -q '^:9097 ' "$CADDYFILE"; then
  echo "    :9097 already present, skipping"
elif confirm "Append the :9097 block to $CADDYFILE and reload Caddy?"; then
  tmp=$(mktemp); cat "$CADDYFILE" > "$tmp"; printf '\n' >> "$tmp"; cat "$STAGING/Caddyfile.snippet" >> "$tmp"
  docker run --rm -v "$tmp:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || die "Caddyfile does not validate; nothing changed"
  backup "$CADDYFILE"
  cat "$tmp" > "$CADDYFILE"   # rewrite in place: the file is a single-file bind mount, keep its inode
  rm -f "$tmp"
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "    reloaded"
fi

# --------------------------------------------------------------------------- 3. authelia user for the kid
say "3/4  Authelia: account for the kid (group pixel-farm only, NOT family)"
if confirm "Create the kid's Authelia account now?"; then
  read -r -p "    Username (login name, e.g. lowercase first name): " KID_USER
  [[ "$KID_USER" =~ ^[a-z0-9._-]+$ ]] || die "Username must be lowercase letters, digits, . _ -"
  if grep -qE "^  $KID_USER:" "$AUTHELIA_USERS"; then
    warn "User $KID_USER already exists, skipping (add group pixel-farm by hand if needed)"
  else
    read -r -p "    Display name (shown in the game): " KID_NAME
    read -r -p "    Email [polivka.pavel+$KID_USER@gmail.com]: " KID_EMAIL
    KID_EMAIL=${KID_EMAIL:-polivka.pavel+$KID_USER@gmail.com}
    read -r -s -p "    Password: " PW1; echo
    read -r -s -p "    Password again: " PW2; echo
    [[ "$PW1" == "$PW2" && -n "$PW1" ]] || die "Passwords do not match"
    HASH=$(docker exec authelia authelia crypto hash generate argon2 --password "$PW1" | awk -F': ' '/^Digest/{print $2}')
    unset PW1 PW2
    [[ "$HASH" == \$argon2* ]] || die "Could not hash the password"
    backup "$AUTHELIA_USERS"
    [[ -z "$(tail -c1 "$AUTHELIA_USERS")" ]] || printf '\n' >> "$AUTHELIA_USERS"
    cat >> "$AUTHELIA_USERS" <<EOF

  $KID_USER:
    displayname: "$KID_NAME"
    email: $KID_EMAIL
    password: "$HASH"
    groups:
      - pixel-farm
EOF
    echo "    added $KID_USER (takes effect with the Authelia restart in step 4)"
  fi
fi

# --------------------------------------------------------------------------- 4. authelia oidc client
say "4/4  Authelia: OIDC client pixel-farm, validate, restart (all SSO logins blip for a few seconds)"
if grep -q "client_id: pixel-farm" "$AUTHELIA_CFG"; then
  echo "    client already present"
  NEED_RESTART=$(confirm "Restart Authelia anyway (e.g. to load a new user)?" && echo yes || echo no)
elif confirm "Add the client and restart Authelia?"; then
  DIGEST=$(cat "$STAGING/oidc-client-digest")
  new="$AUTHELIA_CFG.new-pixel-farm"
  DIGEST="$DIGEST" python3 - "$AUTHELIA_CFG" "$new" <<'PY'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
lines = open(src).read().split('\n')
idx = next(i for i, l in enumerate(lines) if l == '    clients:')
client = f"""    - client_id: pixel-farm
      client_name: Pixel Farm
      client_secret: '{os.environ['DIGEST']}'
      public: false
      authorization_policy: one_factor
      consent_mode: implicit
      require_pkce: true
      pkce_challenge_method: S256
      redirect_uris:
      - https://farm.ppolivka.com/auth/callback
      scopes:
      - openid
      - profile
      - groups
      response_types:
      - code
      grant_types:
      - authorization_code
      token_endpoint_auth_method: client_secret_basic
      userinfo_signed_response_alg: none""".split('\n')
lines[idx + 1:idx + 1] = client
open(dst, 'w').write('\n'.join(lines))
PY
  chmod --reference="$AUTHELIA_CFG" "$new"
  IMG=$(docker inspect authelia --format '{{.Image}}')
  if ! docker run --rm -v /opt/authelia/config:/config \
      -e AUTHELIA_JWT_SECRET_FILE=/config/secrets/jwt \
      -e AUTHELIA_SESSION_SECRET_FILE=/config/secrets/session \
      -e AUTHELIA_STORAGE_ENCRYPTION_KEY_FILE=/config/secrets/encryption \
      "$IMG" authelia validate-config --config "/config/$(basename "$new")"; then
    rm -f "$new"; die "Authelia config does not validate; nothing changed"
  fi
  backup "$AUTHELIA_CFG"
  mv "$new" "$AUTHELIA_CFG"
  NEED_RESTART=yes
else
  NEED_RESTART=no
fi

if [[ "${NEED_RESTART:-no}" == yes ]]; then
  docker restart authelia >/dev/null
  ok=no
  for _ in $(seq 1 30); do
    docker exec authelia wget -qO- http://127.0.0.1:9091/api/health >/dev/null 2>&1 && { ok=yes; break; }
    sleep 1
  done
  if [[ $ok == no ]]; then
    warn "Authelia did not come back healthy; restoring backups"
    for f in "$AUTHELIA_CFG" "$AUTHELIA_USERS"; do
      [[ -f "$f.bak-pixel-farm-$TS" ]] && cp -a "$f.bak-pixel-farm-$TS" "$f"
    done
    docker restart authelia >/dev/null
    die "Rolled back. See: docker logs authelia --tail 50"
  fi
  echo "    Authelia healthy"
fi

say "Done on the server. One manual step left, in the Cloudflare dashboard:"
cat <<'EOF'
    Zero Trust → Networks → Tunnels → (your tunnel) → Public Hostname → Add a public hostname
      Subdomain: farm    Domain: ppolivka.com    Type: HTTP    URL: caddy:9097
    Then open https://farm.ppolivka.com
EOF

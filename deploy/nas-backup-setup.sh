#!/usr/bin/env bash
# One-off, run as root on the homelab:  sudo bash /opt/pixel-farm/nas-backup-setup.sh
#
# The game server writes a consistent snapshot every night at 02:30 Prague to
# /opt/pixel-farm/data/backups (newest 14 kept). This installs:
#   - a second, on-demand mount of the NAS share at /mnt/nas-backup (same share and the same
#     credentials file as the Jellyfin mount; it doesn't touch that mount),
#   - a systemd timer that copies the newest snapshot to //192.168.0.127/nas/backups/pixel-farm
#     at 03:30 every night and keeps the newest 30 there.
# Safe to run again.
set -euo pipefail

SHARE=//192.168.0.127/nas
MOUNT=/mnt/nas-backup
CREDS=/etc/cifs-credentials-jellyfin
SRC=/opt/pixel-farm/data/backups
DEST_SUB=backups/pixel-farm

[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
[ -r "$CREDS" ] || { echo "missing $CREDS (expected the Jellyfin CIFS credentials)"; exit 1; }

mkdir -p "$MOUNT"
if ! grep -q " $MOUNT cifs " /etc/fstab; then
  cp /etc/fstab "/etc/fstab.bak-pixel-farm-$(date +%Y%m%d%H%M%S)"
  echo "$SHARE $MOUNT cifs credentials=$CREDS,uid=0,gid=0,file_mode=0644,dir_mode=0755,_netdev,noauto,x-systemd.automount,x-systemd.idle-timeout=600 0 0" >> /etc/fstab
  echo "added $MOUNT to /etc/fstab"
fi
systemctl daemon-reload
systemctl restart "$(systemd-escape -p --suffix=automount "$MOUNT")"

cat > /usr/local/bin/pixel-farm-nas-backup <<EOF
#!/usr/bin/env bash
# Copies the newest Pixel Farm snapshot to the NAS; keeps the newest 30 there.
set -euo pipefail
newest=\$(ls -1 $SRC/farm-*.db 2>/dev/null | sort | tail -n 1)
[ -n "\$newest" ] || { echo "no snapshot in $SRC yet"; exit 1; }
dest=$MOUNT/$DEST_SUB
mkdir -p "\$dest"
cp "\$newest" "\$dest/\$(basename "\$newest").tmp"
mv "\$dest/\$(basename "\$newest").tmp" "\$dest/\$(basename "\$newest")"
ls -1 "\$dest"/farm-*.db | sort | head -n -30 | xargs -r rm --
echo "copied \$(basename "\$newest") to \$dest"
EOF
chmod 755 /usr/local/bin/pixel-farm-nas-backup

cat > /etc/systemd/system/pixel-farm-nas-backup.service <<EOF
[Unit]
Description=Copy the Pixel Farm database snapshot to the NAS
After=network-online.target
Wants=network-online.target
RequiresMountsFor=$MOUNT

[Service]
Type=oneshot
ExecStart=/usr/local/bin/pixel-farm-nas-backup
EOF

cat > /etc/systemd/system/pixel-farm-nas-backup.timer <<EOF
[Unit]
Description=Nightly Pixel Farm backup to the NAS

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now pixel-farm-nas-backup.timer
echo "--- test run now:"
systemctl start pixel-farm-nas-backup.service && journalctl -u pixel-farm-nas-backup.service -n 3 --no-pager
ls -la "$MOUNT/$DEST_SUB"
systemctl list-timers pixel-farm-nas-backup.timer --no-pager

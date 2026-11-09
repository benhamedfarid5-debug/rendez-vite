#!/usr/bin/env bash
# =============================================================================
#  Rendez-Vite — installation sur un serveur Ubuntu (Oracle Cloud Free Tier)
#  Usage :  sudo bash install.sh rendez-vite.tar.gz [domaine]
#  Sans domaine : une adresse gratuite xxx.sslip.io est créée avec l'IP.
#  Relancer le script est sans danger (les données et le .env sont gardés).
# =============================================================================
set -euo pipefail

TARBALL="${1:?Donner le fichier rendez-vite.tar.gz}"
DOMAIN="${2:-}"
APP_DIR=/opt/rendez-vite
DATA_DIR=/var/lib/rendez-vite
APP_USER=rendezvite
ENV_FILE=/etc/rendez-vite.env

[ "$(id -u)" = 0 ] || { echo "Lancer avec sudo."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/7 Paquets système"
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https sqlite3 iptables-persistent tar

echo "==> 2/7 Node.js 24"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 3/7 Caddy (HTTPS automatique)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> 4/7 Pare-feu : ports 80 et 443"
POS=$(iptables -L INPUT --line-numbers | awk '/REJECT/{print $1; exit}'); POS=${POS:-1}
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT "$POS" -p tcp --dport "$p" -j ACCEPT
done
netfilter-persistent save || true

echo "==> 5/7 Application"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR/backups"
rm -rf "$APP_DIR.new" && mkdir -p "$APP_DIR.new"
tar -xzf "$TARBALL" -C "$APP_DIR.new"
(cd "$APP_DIR.new" && npm ci --omit=dev --no-audit --no-fund)
rm -rf "$APP_DIR.old"; [ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_DIR.old"; mv "$APP_DIR.new" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

if [ -z "$DOMAIN" ]; then
  IP=$(curl -fsS https://api.ipify.org)
  DOMAIN="rendez-vite-${IP//./-}.sslip.io"
fi

if [ ! -f "$ENV_FILE" ]; then
  ADMIN_PASS=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
DATABASE_FILE=$DATA_DIR/rendez-vite.db
PUBLIC_BASE_URL=https://$DOMAIN
IP_HASH_SALT=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)
RATE_LIMIT_FACTOR=1
SESSION_TTL_HOURS=12
DEMO_MODE=0
TEST_ALL_BOOKABLE=0
PAY_PHONE=0561 70 55 12
ADMIN_EMAIL=admin@rendez-vite.app
ADMIN_PASSWORD=$ADMIN_PASS
CHARGILY_API_BASE=https://pay.chargily.net/test/api/v2
CHARGILY_SECRET_KEY=
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SELLER_NAME=
SELLER_ADDRESS=
SELLER_NIF=
SELLER_NIS=
SELLER_AE_CARD=
SELLER_EMAIL=
ANDROID_PACKAGE=
ANDROID_SHA256=
ENV
  chmod 600 "$ENV_FILE"
  echo "Admin : admin@rendez-vite.app / $ADMIN_PASS" > /root/rendez-vite-admin.txt
  chmod 600 /root/rendez-vite-admin.txt
fi

(cd "$APP_DIR" && set -a && . "$ENV_FILE" && set +a && runuser -u "$APP_USER" -- node server/cli/migrate.js)

cat > /etc/systemd/system/rendez-vite.service <<UNIT
[Unit]
Description=Rendez-Vite
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

echo "==> 6/7 HTTPS ($DOMAIN)"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:4000
}
CADDY

echo "==> 7/7 Sauvegarde quotidienne de la base (14 jours gardés)"
cat > /etc/cron.daily/rendez-vite-backup <<CRON
#!/bin/sh
sqlite3 $DATA_DIR/rendez-vite.db ".backup '$DATA_DIR/backups/rv-\$(date +%F).db'"
find $DATA_DIR/backups -name 'rv-*.db' -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/rendez-vite-backup

systemctl daemon-reload
systemctl enable --now rendez-vite
systemctl restart rendez-vite
systemctl reload caddy || systemctl restart caddy

sleep 3
curl -fsS http://127.0.0.1:4000/api/health >/dev/null && echo "Serveur OK" || echo "ATTENTION : vérifier 'journalctl -u rendez-vite -n 50'"
echo
echo "============================================================"
echo " Rendez-Vite est en ligne : https://$DOMAIN"
echo " Identifiants admin : sudo cat /root/rendez-vite-admin.txt"
echo "============================================================"

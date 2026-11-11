#!/usr/bin/env bash
# One-time server setup for SAHASRA on Ubuntu 22.04 (run as root). Safe to run again.
#
# Layout (one folder per product, so VAAHAK can sit beside it later as /srv/vaahak):
#   /srv/sahasra/app             code (git checkout of github.com/Astronnlabs/Sahasra)
#   /srv/sahasra/shared/.env     settings and secrets (root + sahasra only)
#   /srv/sahasra/shared/uploads  uploaded logos and receipts
#   /srv/sahasra/backups         nightly database backups (14 days kept)
#
#   sahaasra.in, www.sahaasra.in -> website      (nginx serves /srv/sahasra/app/website)
#   app.sahaasra.in              -> the software (nginx -> 127.0.0.1:4000, systemd "sahasra")
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

BASE=/srv/sahasra
APP=$BASE/app
REPO=https://github.com/Astronnlabs/Sahasra.git

echo "== packages"
apt-get update -y -q
apt-get install -y -q curl ca-certificates gnupg git nginx ufw certbot python3-certbot-nginx

if ! command -v node >/dev/null || ! node -v | grep -q '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -q nodejs
fi

# PostgreSQL 17 from the official PostgreSQL apt repository.
if ! dpkg -s postgresql-17 >/dev/null 2>&1; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt jammy-pgdg main" >/etc/apt/sources.list.d/pgdg.list
  apt-get update -y -q
  apt-get install -y -q postgresql-17
fi
systemctl enable --now postgresql

echo "== firewall (ssh, http, https only; the database and app ports stay private)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "== user and folders"
id sahasra >/dev/null 2>&1 || useradd --system --home-dir $BASE --shell /usr/sbin/nologin sahasra
install -d -m 755 -o sahasra -g sahasra $BASE
install -d -m 750 -o sahasra -g sahasra $BASE/shared $BASE/shared/uploads
install -d -m 750 -o postgres -g sahasra $BASE/backups

echo "== code"
if [ ! -d $APP/.git ]; then
  sudo -u sahasra git clone -q $REPO $APP
fi
chmod 755 $APP

echo "== database (local only, user and database 'sahasra')"
if [ ! -f $BASE/shared/.dbpass ]; then
  openssl rand -hex 24 >$BASE/shared/.dbpass
  chmod 600 $BASE/shared/.dbpass
fi
DBPASS=$(cat $BASE/shared/.dbpass)
sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sahasra') THEN
    CREATE ROLE sahasra LOGIN PASSWORD '$DBPASS';
  ELSE
    ALTER ROLE sahasra PASSWORD '$DBPASS';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='sahasra'" | grep -q 1 \
  || sudo -u postgres createdb -O sahasra sahasra

echo "== settings file"
ENV=$BASE/shared/.env
if [ ! -f $ENV ]; then
  cat >$ENV <<EOF
# SAHASRA settings. Edit with:  nano /srv/sahasra/shared/.env   then:  systemctl restart sahasra
NODE_ENV=production
PORT=4000
APP_ORIGIN=https://app.sahaasra.in
UPLOAD_DIR=/srv/sahasra/shared/uploads
DATABASE_URL=postgresql://sahasra:$DBPASS@127.0.0.1:5432/sahasra?schema=public
VAAHAK_API_URL=https://vaahak.onrender.com

# Copy these three from Render -> sahasra -> Environment. TOKEN_ENCRYPTION_KEY must be exactly the same.
TOKEN_ENCRYPTION_KEY=
PAYU_KEY=
PAYU_SALT=
PAYU_MODE=live

# Only for moving the data: the DATABASE_URL from Render (Supabase). Empty it again once the move is done.
OLD_DATABASE_URL=
EOF
fi
chown root:sahasra $ENV
chmod 640 $ENV

echo "== service, web server, backups"
install -m 644 $APP/deploy/vps/sahasra.service /etc/systemd/system/sahasra.service
systemctl daemon-reload
systemctl enable sahasra >/dev/null

# Copied only once: certbot adds the https settings to these files afterwards.
for f in sahaasra.in.conf app.sahaasra.in.conf; do
  [ -f /etc/nginx/sites-available/$f ] || install -m 644 $APP/deploy/vps/nginx/$f /etc/nginx/sites-available/$f
done
ln -sf /etc/nginx/sites-available/sahaasra.in.conf /etc/nginx/sites-enabled/sahaasra.in.conf
ln -sf /etc/nginx/sites-available/app.sahaasra.in.conf /etc/nginx/sites-enabled/app.sahaasra.in.conf
rm -f /etc/nginx/sites-enabled/default
sed -i 's/^\s*#\?\s*server_tokens .*/\tserver_tokens off;/' /etc/nginx/nginx.conf
nginx -t
systemctl reload nginx

install -m 755 $APP/deploy/vps/backup.sh /usr/local/bin/sahasra-backup
echo "30 2 * * * postgres /usr/local/bin/sahasra-backup" >/etc/cron.d/sahasra-backup
chmod 644 /etc/cron.d/sahasra-backup

echo "SETUP DONE"

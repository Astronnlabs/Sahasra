#!/usr/bin/env bash
# One-time server setup for SAHAASRA on Ubuntu 22.04 (run as root). Safe to run again.
#
# Layout (one folder per product, so VAAHAK can sit beside it later as /srv/vaahak):
#   /srv/sahaasra/app             code (git checkout of github.com/Astronnlabs/Sahasra)
#   /srv/sahaasra/shared/.env     settings and secrets (root + sahaasra only)
#   /srv/sahaasra/shared/uploads  uploaded logos and receipts
#   /srv/sahaasra/backups         nightly database backups (14 days kept)
#
#   sahaasra.in, www.sahaasra.in -> website      (nginx serves /srv/sahaasra/app/website)
#   app.sahaasra.in              -> the software (nginx -> 127.0.0.1:4000, systemd "sahaasra")
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

BASE=/srv/sahaasra
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
id sahaasra >/dev/null 2>&1 || useradd --system --home-dir $BASE --shell /usr/sbin/nologin sahaasra
install -d -m 755 -o sahaasra -g sahaasra $BASE
install -d -m 750 -o sahaasra -g sahaasra $BASE/shared $BASE/shared/uploads
install -d -m 750 -o postgres -g sahaasra $BASE/backups

echo "== code"
if [ ! -d $APP/.git ]; then
  sudo -u sahaasra git clone -q $REPO $APP
fi
chmod 755 $APP

echo "== database (local only, user and database 'sahaasra')"
if [ ! -f $BASE/shared/.dbpass ]; then
  openssl rand -hex 24 >$BASE/shared/.dbpass
  chmod 600 $BASE/shared/.dbpass
fi
DBPASS=$(cat $BASE/shared/.dbpass)
sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sahaasra') THEN
    CREATE ROLE sahaasra LOGIN PASSWORD '$DBPASS';
  ELSE
    ALTER ROLE sahaasra PASSWORD '$DBPASS';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='sahaasra'" | grep -q 1 \
  || sudo -u postgres createdb -O sahaasra sahaasra

echo "== settings file"
ENV=$BASE/shared/.env
if [ ! -f $ENV ]; then
  cat >$ENV <<EOF
# SAHAASRA settings. Edit with:  nano /srv/sahaasra/shared/.env   then:  systemctl restart sahaasra
NODE_ENV=production
PORT=4000
APP_ORIGIN=https://app.sahaasra.in
UPLOAD_DIR=/srv/sahaasra/shared/uploads
DATABASE_URL=postgresql://sahaasra:$DBPASS@127.0.0.1:5432/sahaasra?schema=public
VAAHAK_API_URL=https://vaahak.onrender.com

# Encrypts each business's saved VAAHAK key. Made once by setup; never change it after keys are saved.
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)

# PayU plan purchases. Fill in, then: systemctl restart sahaasra
PAYU_KEY=
PAYU_SALT=
PAYU_MODE=live
EOF
fi
chown root:sahaasra $ENV
chmod 640 $ENV

echo "== service, web server, backups"
install -m 644 $APP/deploy/vps/sahaasra.service /etc/systemd/system/sahaasra.service
systemctl daemon-reload
systemctl enable sahaasra >/dev/null

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

install -m 755 $APP/deploy/vps/backup.sh /usr/local/bin/sahaasra-backup
echo "30 2 * * * postgres /usr/local/bin/sahaasra-backup" >/etc/cron.d/sahaasra-backup
chmod 644 /etc/cron.d/sahaasra-backup

echo "SETUP DONE"

#!/usr/bin/env bash
# Updates SAHAASRA to the latest code on GitHub (run as root):  bash /srv/sahaasra/app/deploy/vps/deploy.sh
set -euo pipefail
APP=/srv/sahaasra/app
ENV=/srv/sahaasra/shared/.env
as_app() { sudo -u sahaasra -H env HOME=/srv/sahaasra "$@"; }

echo "== code"
as_app git -C $APP fetch -q origin main
as_app git -C $APP reset -q --hard origin/main
as_app git -C $APP log --oneline -1

echo "== build web app"
cd $APP
as_app npm ci --include=dev --no-audit --no-fund --loglevel=error
as_app npm run build --silent

echo "== build server"
cd $APP/backend
as_app npm ci --include=dev --no-audit --no-fund --loglevel=error
as_app npx prisma generate >/dev/null
as_app npm run build --silent

echo "== build website"
cd $APP/website
as_app npm ci --include=dev --no-audit --no-fund --loglevel=error
as_app npm run build --silent

echo "== database changes"
cd $APP/backend
DATABASE_URL=$(grep -E '^DATABASE_URL=' $ENV | cut -d= -f2- | sed 's/^"//; s/"$//')
as_app env DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy

# Keep the server config files in step with the repository.
install -m 644 $APP/deploy/vps/sahaasra.service /etc/systemd/system/sahaasra.service
install -m 755 $APP/deploy/vps/backup.sh /usr/local/bin/sahaasra-backup
systemctl daemon-reload

echo "== restart"
systemctl restart sahaasra
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then echo "DEPLOY OK"; exit 0; fi
  sleep 1
done
echo "The app did not answer. Last log lines:"
journalctl -u sahaasra -n 40 --no-pager
exit 1

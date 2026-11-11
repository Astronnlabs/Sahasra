#!/usr/bin/env bash
# Copies all SAHASRA data from the old database (Supabase, OLD_DATABASE_URL in the settings file)
# into this server's database, replacing what is here. Run as root:
#   bash /srv/sahasra/app/deploy/vps/move-data.sh
set -euo pipefail
ENV=/srv/sahasra/shared/.env
OLD=$(grep -E '^OLD_DATABASE_URL=' $ENV | cut -d= -f2- | sed 's/^"//; s/"$//')
[ -n "$OLD" ] || { echo "OLD_DATABASE_URL is empty in $ENV"; exit 1; }
# Supabase's pooler on port 6543 cannot be used for a dump; its port 5432 (session mode) can.
OLD=${OLD/:6543\//:5432\/}
# Prisma-only options are not understood by pg_dump.
OLD=$(echo "$OLD" | sed -E 's/[?&](pgbouncer|connection_limit|schema|pool_timeout)=[^&]*//g; s/\?$//; s/&&/\&/g')

STAMP=$(date +%F-%H%M)
DUMP=/srv/sahasra/backups/supabase-$STAMP.dump

echo "== reading the old database"
pg_dump --format=custom --schema=public --no-owner --no-privileges --dbname="$OLD" --file=$DUMP
chown postgres:sahasra $DUMP
echo "   saved $(du -h $DUMP | cut -f1) to $DUMP"

echo "== keeping a copy of this server's current data"
sudo -u postgres pg_dump -Fc sahasra >/srv/sahasra/backups/before-move-$STAMP.dump

echo "== replacing this server's data"
systemctl stop sahasra || true
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d sahasra -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION sahasra;"
# The "public" schema itself already exists here; restore only what is inside it.
LIST=$(mktemp)
pg_restore -l $DUMP | grep -vE 'SCHEMA - public|COMMENT - SCHEMA public' >$LIST
chmod 644 $LIST
sudo -u postgres pg_restore --no-owner --no-privileges --role=sahasra --dbname=sahasra --exit-on-error --use-list=$LIST $DUMP
rm -f $LIST

echo "== row counts"
sudo -u postgres psql -d sahasra -tA -c "SELECT 'businesses: ' || count(*) FROM \"Tenant\";"
sudo -u postgres psql -d sahasra -tA -c "SELECT 'users: ' || count(*) FROM \"User\";"
sudo -u postgres psql -d sahasra -tA -c "SELECT 'migrations applied: ' || count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
echo "MOVE DONE"

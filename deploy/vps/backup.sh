#!/usr/bin/env bash
# Nightly database backup (runs as the postgres user from /etc/cron.d/sahaasra-backup). Keeps 14 days.
set -euo pipefail
DIR=/srv/sahaasra/backups
pg_dump -Fc sahaasra >"$DIR/sahaasra-$(date +%F).dump"
find "$DIR" -name 'sahaasra-*.dump' -mtime +14 -delete

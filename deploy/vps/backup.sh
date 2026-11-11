#!/usr/bin/env bash
# Nightly database backup (runs as the postgres user from /etc/cron.d/sahasra-backup). Keeps 14 days.
set -euo pipefail
DIR=/srv/sahasra/backups
pg_dump -Fc sahasra >"$DIR/sahasra-$(date +%F).dump"
find "$DIR" -name 'sahasra-*.dump' -mtime +14 -delete

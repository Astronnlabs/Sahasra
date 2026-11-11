# SAHASRA on our own server (BigRock VPS, Ubuntu 22.04, 66.116.247.152)

| Address | What |
|---|---|
| https://sahaasra.in, https://www.sahaasra.in | Website (`website/` folder) |
| https://app.sahaasra.in | The software |

## Layout

```
/srv/sahasra/app             code (git checkout of this repository)
/srv/sahasra/shared/.env     settings and secrets (never in git)
/srv/sahasra/shared/uploads  uploaded logos and receipts
/srv/sahasra/backups         nightly database backups, 02:30, 14 days kept
/etc/systemd/system/sahasra.service
/etc/nginx/sites-available/sahaasra.in.conf, app.sahaasra.in.conf
```

The app runs as the `sahasra` user on 127.0.0.1:4000 behind nginx. PostgreSQL 17 runs on the same server and
is not reachable from outside. The firewall allows only ssh, http and https.
VAAHAK will go beside it the same way: `/srv/vaahak`, user `vaahak`, its own database, port 4100, its own nginx file.

## Everyday commands (as root)

| Task | Command |
|---|---|
| Update to the latest code on GitHub | `bash /srv/sahasra/app/deploy/vps/deploy.sh` |
| Change settings | `nano /srv/sahasra/shared/.env` then `systemctl restart sahasra` |
| Is it running? | `systemctl status sahasra` |
| Logs | `journalctl -u sahasra -f` |
| Back up now | `sudo -u postgres sahasra-backup` |
| Restore a backup | `systemctl stop sahasra; sudo -u postgres pg_restore --clean --if-exists -d sahasra /srv/sahasra/backups/<file>.dump; systemctl start sahasra` |

## First install

1. Point the domain's A records (`@`, `www`, `app`) to the server.
2. `bash deploy/vps/setup.sh` (installs Node 20, PostgreSQL 17, nginx, certbot and the firewall, then creates the folders, database and settings file).
3. Fill in `/srv/sahasra/shared/.env` (TOKEN_ENCRYPTION_KEY, PAYU_KEY, PAYU_SALT, and OLD_DATABASE_URL to move data).
4. `bash deploy/vps/move-data.sh` to copy the data across, then `bash deploy/vps/deploy.sh`.
5. `certbot --nginx -d sahaasra.in -d www.sahaasra.in -d app.sahaasra.in -m astronnlabs@gmail.com --agree-tos -n --redirect`

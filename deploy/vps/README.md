# SAHAASRA on our own server (BigRock VPS, Ubuntu 22.04, 66.116.247.152)

| Address | What |
|---|---|
| https://sahaasra.in, https://www.sahaasra.in | Website (`website/` folder) |
| https://app.sahaasra.in | The software |

## Layout

```
/srv/sahaasra/app             code (git checkout of this repository)
/srv/sahaasra/shared/.env     settings and secrets (never in git)
/srv/sahaasra/shared/uploads  uploaded logos and receipts
/srv/sahaasra/backups         nightly database backups, 02:30, 14 days kept
/etc/systemd/system/sahaasra.service
/etc/nginx/sites-available/sahaasra.in.conf, app.sahaasra.in.conf
```

The app runs as the `sahaasra` user on 127.0.0.1:4000 behind nginx. PostgreSQL 17 runs on the same server and
is not reachable from outside. The firewall allows only ssh, http and https.
VAAHAK will go beside it the same way: `/srv/vaahak`, user `vaahak`, its own database, port 4100, its own nginx file.

## Everyday commands (as root)

| Task | Command |
|---|---|
| Update to the latest code on GitHub | `bash /srv/sahaasra/app/deploy/vps/deploy.sh` |
| Change settings | `nano /srv/sahaasra/shared/.env` then `systemctl restart sahaasra` |
| Is it running? | `systemctl status sahaasra` |
| Logs | `journalctl -u sahaasra -f` |
| Build the Android app (after `android/` changes) | `bash /srv/sahaasra/app/deploy/vps/build-android.sh` |
| Back up now | `sudo -u postgres sahaasra-backup` |
| Restore a backup | `systemctl stop sahaasra; sudo -u postgres pg_restore --clean --if-exists -d sahaasra /srv/sahaasra/backups/<file>.dump; systemctl start sahaasra` |

## First install

1. Point the domain's A records (`@`, `www`, `app`) to the server.
2. `bash deploy/vps/setup.sh` (installs Node 20, PostgreSQL 17, nginx, certbot and the firewall, then creates the
   folders, an empty database and the settings file with a new TOKEN_ENCRYPTION_KEY).
3. `bash /srv/sahaasra/app/deploy/vps/deploy.sh` (builds the software and the website, creates the tables, starts the app).
4. `certbot --nginx -d sahaasra.in -d www.sahaasra.in -d app.sahaasra.in -m astronnlabs@gmail.com --agree-tos -n --redirect`
5. Open https://app.sahaasra.in and create the platform owner (Super Admin) account on the first-run screen.
6. Later: add PAYU_KEY and PAYU_SALT to `/srv/sahaasra/shared/.env` and run `systemctl restart sahaasra`.

The database here is separate from the Render/Supabase one, which stays for testing.

## Android app (Bluetooth printing)

`build-android.sh` installs Java 17, the Android SDK and Gradle under `/opt` (once), creates the app's
signing key in `/srv/sahaasra/shared/android/` (once, root only — **copy `release.jks` and
`keystore.properties` somewhere safe**; without them phones can't update the app), builds the APK and publishes
it at https://app.sahaasra.in/downloads/android/SAHAASRA.apk (served by the app from
`/srv/sahaasra/shared/downloads/android/`). See `android/README.md`.

# CONSPACE — database and media backup / recovery

## Scope

This process handles only PostgreSQL database `conspace` and `/var/lib/conspace/media`. It does not dump, restore, migrate, or change `hola_maps`, `x_hub`, other PostgreSQL databases, global roles, or PostgreSQL cluster settings.

## Backup layout and retention

- Root-only directory: `/var/backups/conspace` (0700).
- Each run creates `/var/backups/conspace/YYYYMMDDTHHMMSSZ/` containing `database.dump`, `media.tar.gz`, and `SHA256SUMS` (0600).
- Database archive: PostgreSQL custom format from database exactly named `conspace`, via local postgres peer access, with no owner/ACL records. It is not a cluster/global-role dump.
- Media archive includes private, public and staging trees under MEDIA_ROOT. Symlinks in the media tree are rejected before backup.
- Daily timer target: 02:30 server local time with up to 15 minutes randomized delay. Retention is 14 days, **preserving at least the seven most recent complete backup sets**. Timer installation is a one-time owner action.
- Backups are not stored in Git. Treat them as sensitive personal/project data. Current plan is local-disk backup only; it is not an offsite disaster-recovery copy. Add encrypted offsite replication only after a destination and key-management policy are approved.

## One-time setup

After reviewing actual filesystem owners and confirming Nginx worker group:

```bash
cd /var/www/conspace
sudo bash ops/scripts/setup-storage.sh --apply
```

Expected layout: `/var/lib/conspace/media/{staging,private,public}`; staging/private root:root 0700; media root/public root:www-data 2750 (setgid); API log directory root:root 0750; backup root root:root 0700. Published files must be root:www-data 0640 so the Nginx worker can read them. The script fails closed if an existing path has unexpected ownership/mode. It does not edit backend/.env. Add `MEDIA_ROOT=/var/lib/conspace/media` to private backend/.env only after Backend implements that configuration.

Install the daily timer:

```bash
sudo install -o root -g root -m 0644 ops/systemd/conspace-backup.service /etc/systemd/system/conspace-backup.service
sudo install -o root -g root -m 0644 ops/systemd/conspace-backup.timer /etc/systemd/system/conspace-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now conspace-backup.timer
systemctl list-timers conspace-backup.timer
```

This enables only the CONSPACE backup timer. It does not restart PostgreSQL, Nginx or other services.

## Manual backup and status

```bash
sudo bash /var/www/conspace/ops/scripts/backup-all.sh
sudo bash /var/www/conspace/ops/scripts/monitor.sh
```

The backup script verifies PostgreSQL is ready, checks the selected database name is exactly `conspace`, validates the custom dump with `pg_restore --list`, validates the media archive with `tar -tzf`, writes checksums and applies 14-day retention without pruning the most recent seven complete backup sets. A failed backup leaves the incomplete timestamp directory for inspection; it does not prune old backups before a successful archive.

## Restore drill — safe, non-production target

Run after the first backup and at least monthly:

```bash
BACKUP_DIR="$(find /var/backups/conspace -mindepth 2 -maxdepth 2 -name SHA256SUMS -printf '%T@ %h\\n' | sort -nr | head -n 1 | cut -d ' ' -f 2-)"
sudo bash /var/www/conspace/ops/scripts/restore-drill.sh "$BACKUP_DIR"
```

The drill verifies checksums, restores the dump into a newly named temporary database `conspace_restorecheck_*` owned by `conspace_app`, queries it as that role, extracts media to a temporary directory, then removes only those exact temporary targets. It never drops/replaces `conspace`, `hola_maps` or `x_hub`.

## Migration failure and recovery

The current migration runner uses one transaction, a PostgreSQL advisory lock, and SHA-256 checksums. If a migration fails before COMMIT, it issues ROLLBACK; no partial transactional DDL should remain. On failure:

1. Stop deployment; do not continue to PM2/Nginx activation.
2. Read the safe migration error and inspect `conspace.schema_migrations` using the conspace database only.
3. Fix the migration in a new commit. Never edit a migration that is already recorded as applied; add a forward-fix migration instead.
4. Re-run tests against a disposable PostgreSQL 16 service in CI, back up conspace again, then deploy the approved main SHA.

A restore is not the normal response to a transactional migration failure. If data corruption or a non-transactional operation requires restore, first run the restore drill. Production restore requires a separately approved maintenance window, a fresh backup of the current conspace database/media, and an explicit operator-reviewed command plan. Never restore a conspace dump into another database name or use a cluster-wide restore.

## Operational checks

- Alert/review if the latest complete checksum set is older than 26 hours.
- Run `monitor.sh` to check services, local API liveness/readiness, PM2 live-vs-saved inventory (including x-hub-api), disk free space and backup checksums.
- Review disk free space before every restore drill. Keep old deployment releases until the owner approves retention.

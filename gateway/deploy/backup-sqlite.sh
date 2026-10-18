#!/usr/bin/env bash
# Daily backup of the gateway SQLite file with 14-day rotation. Uses the
# online backup API (sqlite3 .backup), so the gateway keeps running.
#   Variant A (Docker): backup-sqlite.sh docker
#   Variant B (systemd): backup-sqlite.sh /var/lib/we-invoice/gateway.sqlite
# Cron (root or weinvoice): 15 3 * * * /opt/we-invoice/current/gateway/deploy/backup-sqlite.sh docker
set -euo pipefail

MODE="${1:-docker}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/we-invoice}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/gateway-$STAMP.sqlite"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [ "$MODE" = "docker" ]; then
  docker exec we-invoice-gateway sqlite3 /data/gateway.sqlite ".backup '/data/backup.tmp'"
  docker cp we-invoice-gateway:/data/backup.tmp "$TARGET"
  docker exec we-invoice-gateway rm -f /data/backup.tmp
else
  sqlite3 "$MODE" ".backup '$TARGET'"
fi

gzip -f "$TARGET"
find "$BACKUP_DIR" -name 'gateway-*.sqlite.gz' -mtime "+$KEEP_DAYS" -delete
echo "backup written: $TARGET.gz"

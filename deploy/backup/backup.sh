#!/bin/sh
# Копия базы: pg_dump в /backups, хранение BACKUP_KEEP_DAYS дней; при заданном S3 — ещё и в хранилище
# (там хранится BACKUP_S3_KEEP_DAYS дней). При ошибке — сообщение владельцу в Telegram.
set -eu

alert() {
  echo "backup: $1" >&2
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${ALERT_TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${ALERT_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=⚠️ Lidd CRM — резервная копия не создана: $1" >/dev/null || true
  fi
}

STAMP=$(date +%Y-%m-%d_%H%M)
FILE="/backups/lidd-$STAMP.dump"

if ! pg_dump -Fc -f "$FILE.tmp"; then
  rm -f "$FILE.tmp"
  alert "pg_dump завершился с ошибкой"
  exit 1
fi
mv "$FILE.tmp" "$FILE"
echo "backup: $FILE ($(du -h "$FILE" | cut -f1))"
find /backups -name 'lidd-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  export RCLONE_CONFIG_S3_TYPE=s3
  export RCLONE_CONFIG_S3_PROVIDER=Other
  export RCLONE_CONFIG_S3_ENDPOINT="${BACKUP_S3_ENDPOINT}"
  export RCLONE_CONFIG_S3_REGION="${BACKUP_S3_REGION:-ru-1}"
  export RCLONE_CONFIG_S3_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY}"
  export RCLONE_CONFIG_S3_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY}"
  export RCLONE_CONFIG_S3_NO_CHECK_BUCKET=true
  DEST="s3:${BACKUP_S3_BUCKET}/lidd-crm"
  if ! rclone copy "$FILE" "$DEST/"; then
    alert "не удалось загрузить в хранилище S3 (локальная копия есть: $FILE)"
    exit 1
  fi
  rclone delete --min-age "${BACKUP_S3_KEEP_DAYS:-30}d" "$DEST/" || true
  echo "backup: загружено в $DEST"
fi

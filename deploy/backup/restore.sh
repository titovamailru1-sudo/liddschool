#!/bin/sh
# Восстановление базы из копии (внутри контейнера backup). Запускать через deploy/restore.sh — он останавливает CRM.
set -eu
FILE="${1:?укажите файл копии, например /backups/lidd-2026-10-12_0300.dump}"
[ -f "$FILE" ] || { echo "нет файла $FILE"; exit 1; }
pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "$FILE"
echo "restore: база восстановлена из $FILE"

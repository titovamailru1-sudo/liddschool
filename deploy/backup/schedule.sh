#!/bin/sh
# Каждый день в BACKUP_TIME (по умолчанию 03:00 по времени школы, TZ контейнера) — копия базы.
set -u
TIME="${BACKUP_TIME:-03:00}"
echo "backup: расписание — ежедневно в $TIME ($TZ)"
while true; do
  now=$(date +%s)
  target=$(date -d "$(date +%Y-%m-%d) $TIME" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))
  /scripts/backup.sh || echo "backup: ошибка, см. выше"
done

#!/bin/sh
# Восстановить базу из резервной копии: ./deploy/restore.sh backups/lidd-2026-10-12_0300.dump
# Сайт и воркер на время восстановления останавливаются.
set -eu
cd "$(dirname "$0")/.."
FILE="${1:?укажите файл из папки backups/, например backups/lidd-2026-10-12_0300.dump}"
NAME=$(basename "$FILE")
[ -f "backups/$NAME" ] || { echo "нет файла backups/$NAME"; exit 1; }
printf "База будет заменена данными из %s. Продолжить? [y/N] " "$NAME"
read -r answer
[ "$answer" = "y" ] || { echo "отменено"; exit 1; }
C="docker compose -f compose.prod.yml"
$C stop app worker
$C exec -T backup /scripts/restore.sh "/backups/$NAME"
$C up -d app worker
echo "Готово."

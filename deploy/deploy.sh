#!/bin/sh
# Обновление на сервере: забрать новую версию, собрать, применить миграции, перезапустить.
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f compose.prod.yml up -d --build
docker image prune -f >/dev/null
echo "Проверка:"
sleep 5
curl -fsS "https://$(grep '^DOMAIN=' .env | cut -d= -f2)/api/health" || echo "  /api/health пока не отвечает 200 — посмотрите: docker compose -f compose.prod.yml logs --tail=50 app worker"

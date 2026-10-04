#!/usr/bin/env bash
# Обновление на VPS: git pull + пересборка. Запускать из каталога проекта.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
# Бэкап перед обновлением (если контейнер уже работает)
docker compose exec -T app node server/dist/cli/backup.js || true
docker compose up -d --build
docker image prune -f >/dev/null
sleep 3
curl -fsS http://127.0.0.1:${APP_PORT:-3100}/api/health && echo " — ок"

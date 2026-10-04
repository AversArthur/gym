# Gym Log

Личный дневник тренировок A·B·C. План работ: [PLAN.md](PLAN.md). Прототип: [reference/trenirovki-prototype.html](reference/trenirovki-prototype.html).

## Структура

- `shared/` — общие типы, схемы zod, сид упражнений и программы
- `server/` — Fastify API, в проде отдаёт и собранный фронт
- `web/` — Vite + React, mobile-first PWA

## Разработка

```sh
nvm use            # Node 22 (.nvmrc)
npm install
npm run dev        # фронт http://localhost:5173, API на :3000 (проксируется Vite)
npm run typecheck
npm run lint
```

## Локально в Docker (как на проде)

```sh
docker compose up -d --build
docker compose exec app node server/dist/cli/set-password.js arthur   # один раз: задать пароль
open http://localhost:3100
```

В `npm run dev` вход отключён (`DEV_AUTO_LOGIN=1`, работает только вне production).
Cookie в Docker помечены `Secure`: Chrome и Firefox принимают их на `http://localhost`, Safari — нет
(для проверки в Safari поставь `COOKIE_SECURE=false` в `.env`).

## Деплой

Пошагово для VPS — [deploy/README.md](deploy/README.md): DNS, deploy key, nginx + certbot, пароль, бэкапы, обновление.

Порт задаётся `APP_PORT` в `.env` (см. `.env.example`). Контейнер слушает только `127.0.0.1`; на VPS снаружи его открывает nginx.

## База данных

SQLite в `data/gym.db` (путь меняется через `DATABASE_PATH`). Миграции применяются и сид заливается автоматически при старте сервера.

```sh
npm run db:generate -w server -- --name <имя>   # после изменения server/src/db/schema.ts
npm run db:check -w server                       # распечатать программу из БД
npm test                                         # тесты (vitest)
npm run set-password -w server -- arthur          # пароль в локальной БД
npm run backup -w server                         # бэкап в backups/
```

# Деплой Gym Log на VPS

Приложение — один Docker-контейнер (`app`): Node.js отдаёт API и собранный фронт, SQLite лежит в `./data/gym.db`.
Снаружи его открывает nginx на хосте с HTTPS от Let's Encrypt (certbot). Контейнер слушает только `127.0.0.1:3100`.

Ниже — две части: **A** — наш VPS (`78.47.246.235`, nginx и certbot уже стоят), **B** — чистая Ubuntu 24.04 с нуля.

---

## A. Наш VPS: `gym.arturavers.com`

### 1. DNS
В панели DNS домена `arturavers.com` добавить запись:

| Тип | Имя | Значение |
|---|---|---|
| A | `gym` | `78.47.246.235` |

Проверка (с любого компьютера): `dig +short gym.arturavers.com` → `78.47.246.235`.

### 2. Доступ к репозиторию с VPS (deploy key, только чтение)
```sh
ssh root@78.47.246.235
ssh-keygen -t ed25519 -f ~/.ssh/gym_deploy -N "" -C "gym-deploy@vps"
cat ~/.ssh/gym_deploy.pub     # → GitHub: репозиторий → Settings → Deploy keys → Add (без write)
cat >> ~/.ssh/config <<'CFG'
Host github-gym
  HostName github.com
  User git
  IdentityFile ~/.ssh/gym_deploy
  IdentitiesOnly yes
CFG
```

### 3. Код и каталоги
```sh
git clone github-gym:AversArthur/gym.git /opt/gym
cd /opt/gym
mkdir -p data backups && chown -R 1000:1000 data backups   # в контейнере пользователь node (uid 1000)
cp .env.example .env    # при желании поправить; секретов там нет
```

### 4. Запуск
```sh
docker compose up -d --build
curl -s http://127.0.0.1:3100/api/health     # {"ok":true,...}
docker compose exec app node server/dist/cli/set-password.js arthur   # задать пароль (ввод скрыт)
```

### 5. nginx + HTTPS
```sh
cp deploy/nginx/gym.arturavers.com.conf /etc/nginx/sites-available/gym.arturavers.com
ln -s ../sites-available/gym.arturavers.com /etc/nginx/sites-enabled/gym.arturavers.com
nginx -t && systemctl reload nginx
/root/certbot-venv/bin/certbot --nginx -d gym.arturavers.com   # добавит 443 и редирект с http
# certbot на этом VPS стоит в venv; продление уже в crontab root: certbot renew каждую ночь в 03:00
```
Проверка: открыть `https://gym.arturavers.com` на телефоне → вход → «На экран „Домой“».

### 6. Бэкапы
```sh
cp deploy/backup.cron /etc/cron.d/gym-backup && chmod 644 /etc/cron.d/gym-backup
docker compose exec -T app node server/dist/cli/backup.js    # проверить руками
ls -la backups/
```
Каждый день в 04:15 — `backups/gym-YYYY-MM-DD.db`, хранятся последние 30. Бэкап делается через SQLite
online backup API (то же, что `sqlite3 .backup`), с проверкой `integrity_check`.

**Восстановление:**
```sh
docker compose stop app
cp backups/gym-2026-10-04.db data/gym.db && rm -f data/gym.db-wal data/gym.db-shm
chown 1000:1000 data/gym.db
docker compose start app
```

### 7. Обновление
```sh
cd /opt/gym && ./deploy/update.sh     # бэкап → git pull → пересборка → health-check
```

### Firewall (по желанию, осторожно)
Сейчас ufw выключен. На VPS работают и другие сервисы (3000, 3001, 8080 открыты наружу).
Если включать — сначала разрешить SSH, иначе можно потерять доступ:
```sh
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
# + порты других сервисов, если они нужны снаружи напрямую
ufw enable
```
Порт 3100 открывать не нужно: он слушает только 127.0.0.1.
Docker публикует порты в обход ufw, поэтому `127.0.0.1:` в `docker-compose.yml` — основная защита.

---

## B. Чистая Ubuntu 24.04

```sh
# Docker
apt update && apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```
Дальше — шаги 1–7 из части A (в nginx-конфиге заменить домен).

---

## Полезное

| Что | Команда |
|---|---|
| Логи | `docker compose logs -f app` |
| Сменить пароль (закроет все сессии) | `docker compose exec app node server/dist/cli/set-password.js arthur` |
| Бэкап сейчас | `docker compose exec -T app node server/dist/cli/backup.js` |
| Скачать бэкап к себе | `scp root@78.47.246.235:/opt/gym/backups/gym-YYYY-MM-DD.db .` |

Переменные окружения (`.env`): `APP_PORT` (3100), `COOKIE_SECURE` (true), `BACKUP_KEEP` (30).
Секретов в `.env` нет: пароль хранится в БД как argon2-хеш.

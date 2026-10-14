import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app.js';
import { openDb } from './db/client.js';
import { seedIfEmpty } from './db/seed.js';
import { users } from './db/schema.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

const db = openDb();
const env = process.env;
const app = await buildApp({
  db,
  logger: { level: env.LOG_LEVEL ?? 'info' },
  // В проде за https — cookie только по https
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  // Порт открыт только на 127.0.0.1, снаружи ходит nginx: доверяем его X-Forwarded-For
  trustProxy: env.TRUST_PROXY === 'true' ? true : (env.TRUST_PROXY ?? false),
  devAutoLogin: env.DEV_AUTO_LOGIN === '1',
  registrationOpen: env.REGISTRATION_OPEN !== 'false',
});
if (seedIfEmpty(db)) app.log.info('БД пустая: залит сид (упражнения, программа A·B·C)');
if (
  !db
    .select({ h: users.passwordHash })
    .from(users)
    .all()
    .some((u) => u.h) &&
  env.DEV_AUTO_LOGIN !== '1'
) {
  app.log.warn('Пароль не задан: войти нельзя. Задай: node server/dist/cli/set-password.js arthur');
}

// В проде сервер сам отдаёт собранный фронт; в dev фронт отдаёт Vite и проксирует /api сюда.
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    wildcard: false,
    // Файлы с хешем в имени не меняются — кэш на год; остальное (index.html, sw.js) — всегда свежее
    setHeaders: (res, path) =>
      res.header(
        'cache-control',
        path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      ),
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });
}

await app.listen({ port: PORT, host: HOST });

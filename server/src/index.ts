import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { buildApp } from './app.js';
import { openDb } from './db/client.js';
import { seedIfEmpty } from './db/seed.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

const db = openDb();
const app = buildApp({ db, logger: { level: process.env.LOG_LEVEL ?? 'info' } });
if (seedIfEmpty(db)) app.log.info('БД пустая: залит сид (упражнения, программа A·B·C)');

// В проде сервер сам отдаёт собранный фронт; в dev фронт отдаёт Vite и проксирует /api сюда.
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });
}

await app.listen({ port: PORT, host: HOST });

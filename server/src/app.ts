import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { eq } from 'drizzle-orm';
import { ZodError, type z } from 'zod';
import {
  Bodyweight,
  ExerciseIdParam,
  HistoryQuery,
  IdParam,
  LastQuery,
  Login,
  Register,
  ProgramDayOrder,
  ProgramDayPatch,
  ProgramItemCreate,
  ProgramItemPatch,
  SetPatch,
  SetUpsert,
  SyncOp,
  SyncRequest,
  WeekReportQuery,
  WorkoutCreate,
  WorkoutListQuery,
  WorkoutPatch,
  type HealthResponse,
  type SyncResult,
} from '@gym/shared';
import type { DB } from './db/client.js';
import { users } from './db/schema.js';
import { createRepo, HttpError } from './repo.js';
import { createAuth, SESSION_COOKIE, SESSION_TTL_MS } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: number;
  }
}

export interface AppOptions {
  db: DB;
  logger?: boolean | object;
  /** В тестах подменяет определение пользователя (вместо cookie-сессии), чтобы проверять изоляцию. */
  resolveUser?: (req: { headers: Record<string, unknown> }) => number | null;
  /** Secure-флаг cookie. В проде (https) — true. */
  cookieSecure?: boolean;
  /** Только для локальной разработки: без входа, как админ. В проде игнорируется. */
  devAutoLogin?: boolean;
  /** За nginx: брать IP клиента из X-Forwarded-For (для лимита попыток входа). */
  trustProxy?: boolean | string;
  loginLimit?: { max: number; timeWindow: string };
  /** Открытая регистрация (кнопка на экране входа). Выключается REGISTRATION_OPEN=false. */
  registrationOpen?: boolean;
  registerLimit?: { max: number; timeWindow: string };
}

const parse = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => schema.parse(data);

/** Пути API, доступные без входа */
const PUBLIC = new Set([
  '/api/health',
  '/api/login',
  '/api/logout',
  '/api/register',
  '/api/config',
]);

export async function buildApp({
  db,
  logger = false,
  resolveUser,
  cookieSecure = false,
  devAutoLogin = false,
  trustProxy = false,
  loginLimit = { max: 5, timeWindow: '1 minute' },
  registrationOpen = true,
  registerLimit = { max: 5, timeWindow: '1 hour' },
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy });
  const repo = createRepo(db);
  const auth = createAuth(db);

  // Плагины ждём до объявления маршрутов: rate-limit навешивается на маршруты при их создании
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });

  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: SESSION_TTL_MS / 1000,
    });

  const adminId = () =>
    db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).get()?.id ?? null;
  const autoLogin = devAutoLogin && process.env.NODE_ENV !== 'production';

  app.decorateRequest('userId', 0);
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const path = req.url.split('?')[0]!;
    // CSRF: изменяющий запрос с чужого сайта не пропускаем (вдобавок к SameSite=Lax)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin) {
        let host: string | null = null;
        try {
          host = new URL(origin).host;
        } catch {
          /* «null» и мусор — чужой источник */
        }
        if (host !== req.headers.host) return reply.code(403).send({ error: 'bad_origin' });
      }
    }
    if (PUBLIC.has(path)) return;
    if (resolveUser) {
      const uid = resolveUser(req);
      if (uid == null) return reply.code(401).send({ error: 'unauthorized' });
      req.userId = uid;
      return;
    }
    if (autoLogin) {
      req.userId = adminId() ?? 0;
      return;
    }
    const token = req.cookies[SESSION_COOKIE];
    const session = auth.resolve(token);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (session.renewed && token) setSessionCookie(reply, token);
    req.userId = session.user.id;
  });

  // ---------- вход ----------
  app.post(
    '/api/login',
    {
      config: {
        rateLimit: {
          ...loginLimit,
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: 'too_many_attempts',
            message: 'Слишком много попыток, подожди минуту',
          }),
        },
      },
    },
    async (req, reply) => {
      const { username, password } = parse(Login, req.body);
      const res = await auth.login(username, password, req.headers['user-agent']);
      if (!res)
        return reply
          .code(401)
          .send({ error: 'bad_credentials', message: 'Неверный логин или пароль' });
      setSessionCookie(reply, res.token);
      return res.user;
    },
  );
  app.get('/api/config', async () => ({ registrationOpen }));
  app.post(
    '/api/register',
    {
      config: {
        rateLimit: {
          ...registerLimit,
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: 'too_many_attempts',
            message: 'Слишком много регистраций с этого адреса, попробуй позже',
          }),
        },
      },
    },
    async (req, reply) => {
      if (!registrationOpen)
        return reply
          .code(403)
          .send({ error: 'registration_closed', message: 'Регистрация закрыта' });
      const res = await auth.register(parse(Register, req.body), req.headers['user-agent']);
      if (!res)
        return reply.code(409).send({ error: 'username_taken', message: 'Такой логин уже занят' });
      setSessionCookie(reply, res.token);
      return reply.code(201).send(res.user);
    },
  );
  app.post('/api/logout', async (req, reply) => {
    auth.logout(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });
  app.get('/api/me', async (req) => {
    const u = db.select().from(users).where(eq(users.id, req.userId)).get();
    if (!u) throw new HttpError(401, 'unauthorized');
    return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation',
        message: err.issues[0]?.message,
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof HttpError)
      return reply.code(err.status).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });

  app.get('/api/health', async (): Promise<HealthResponse> => ({ ok: true, version: '0.1.0' }));

  // ---------- программа и упражнения ----------
  app.get('/api/program/active', async (req) => repo.getActiveProgram(req.userId));
  app.put('/api/program/items/:id', async (req) =>
    repo.updateProgramItem(
      req.userId,
      parse(IdParam, req.params).id,
      parse(ProgramItemPatch, req.body),
    ),
  );
  app.post('/api/program/days/:id/items', async (req, reply) => {
    const item = repo.addProgramItem(
      req.userId,
      parse(IdParam, req.params).id,
      parse(ProgramItemCreate, req.body),
    );
    return reply.code(201).send(item);
  });
  app.delete('/api/program/items/:id', async (req, reply) => {
    repo.deleteProgramItem(req.userId, parse(IdParam, req.params).id);
    return reply.code(204).send();
  });
  app.put('/api/program/days/:id/order', async (req, reply) => {
    repo.reorderDay(
      req.userId,
      parse(IdParam, req.params).id,
      parse(ProgramDayOrder, req.body).itemIds,
    );
    return reply.code(204).send();
  });
  app.patch('/api/program/days/:id', async (req) =>
    repo.patchDay(req.userId, parse(IdParam, req.params).id, parse(ProgramDayPatch, req.body)),
  );
  app.get('/api/exercises', async (req) => repo.listExercises(req.userId));
  app.get('/api/exercises/last', async (req) => {
    const q = parse(LastQuery, req.query);
    return repo.lastPerformances(req.userId, q.ids, q.exclude);
  });
  app.get('/api/exercises/:id/last', async (req) => {
    const { id } = parse(ExerciseIdParam, req.params);
    const q = parse(LastQuery.pick({ exclude: true }), req.query);
    return repo.lastPerformances(req.userId, [id], q.exclude)[id] ?? null;
  });
  app.get('/api/exercises/:id/history', async (req) => {
    const { id } = parse(ExerciseIdParam, req.params);
    const q = parse(HistoryQuery, req.query);
    return repo.exerciseHistory(req.userId, id, q.from, q.to);
  });

  // ---------- тренировки ----------
  app.post('/api/workouts', async (req, reply) => {
    const { workout, created } = repo.createWorkout(req.userId, parse(WorkoutCreate, req.body));
    return reply.code(created ? 201 : 200).send(workout);
  });
  app.get('/api/workouts', async (req) => {
    const q = parse(WorkoutListQuery, req.query);
    return repo.listWorkouts(req.userId, q.limit, q.before);
  });
  app.get('/api/workouts/active', async (req) => repo.activeWorkout(req.userId));
  app.get('/api/workouts/by-client/:id', async (req) =>
    repo.getWorkoutByClientId(req.userId, parse(ExerciseIdParam, req.params).id),
  );
  app.get('/api/workouts/:id', async (req) =>
    repo.getWorkout(req.userId, parse(IdParam, req.params).id),
  );
  app.get('/api/workouts/:id/summary', async (req) =>
    repo.workoutSummary(req.userId, parse(IdParam, req.params).id),
  );
  app.patch('/api/workouts/:id', async (req) =>
    repo.patchWorkout(req.userId, parse(IdParam, req.params).id, parse(WorkoutPatch, req.body)),
  );
  app.delete('/api/workouts/:id', async (req, reply) => {
    repo.deleteWorkout(req.userId, parse(IdParam, req.params).id);
    return reply.code(204).send();
  });

  // ---------- подходы ----------
  app.post('/api/sets', async (req, reply) => {
    const { set, created } = repo.upsertSet(req.userId, parse(SetUpsert, req.body));
    return reply.code(created ? 201 : 200).send(set);
  });
  app.patch('/api/sets/:id', async (req) =>
    repo.patchSet(req.userId, parse(IdParam, req.params).id, parse(SetPatch, req.body)),
  );
  app.delete('/api/sets/:id', async (req, reply) => {
    repo.deleteSet(req.userId, parse(IdParam, req.params).id);
    return reply.code(204).send();
  });

  // Пачка офлайн-операций. Каждая операция независима: ошибка одной не откатывает остальные.
  app.post('/api/sync', async (req) => {
    const { ops } = parse(SyncRequest, req.body);
    const uid = req.userId;
    const results: SyncResult[] = ops.map((raw) => {
      const parsed = SyncOp.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'validation' };
      const op = parsed.data;
      try {
        switch (op.op) {
          case 'workout.create':
            return { ok: true, id: repo.createWorkout(uid, op).workout.id };
          case 'workout.update': {
            const w = repo.workoutByClientId(uid, op.clientId);
            if (!w) return { ok: false, error: 'not_found' };
            return { ok: true, id: repo.patchWorkout(uid, w.id, op.patch).id };
          }
          case 'workout.delete': {
            const w = repo.workoutByClientId(uid, op.clientId);
            if (w) repo.deleteWorkout(uid, w.id);
            return { ok: true };
          }
          case 'set.upsert':
            return { ok: true, id: repo.upsertSet(uid, op.set).set.id };
          case 'set.delete':
            repo.deleteSetByClientId(uid, op.clientId);
            return { ok: true };
        }
      } catch (e) {
        return { ok: false, error: e instanceof HttpError ? e.code : 'internal' };
      }
    });
    return { results };
  });

  // ---------- вес тела, экспорт, отчёт ----------
  app.get('/api/bodyweight', async (req) => repo.listBodyweight(req.userId));
  app.post('/api/bodyweight', async (req) => {
    const b = parse(Bodyweight, req.body);
    return repo.upsertBodyweight(req.userId, b.date, b.kg);
  });

  app.get('/api/export.json', async (req, reply) => {
    reply.header('content-disposition', `attachment; filename="gym-log-${today()}.json"`);
    return repo.exportJson(req.userId);
  });
  app.get('/api/export.csv', async (req, reply) => {
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="gym-log-${today()}.csv"`);
    // BOM, чтобы Excel открыл кириллицу
    return '﻿' + repo.exportCsv(req.userId);
  });
  app.get('/api/report/week', async (req) => {
    const q = parse(WeekReportQuery, req.query);
    return { text: repo.weekReportText(req.userId, q.from ?? Date.now() - 7 * 86_400_000, q.tz) };
  });

  return app;
}

const today = () => new Date().toISOString().slice(0, 10);

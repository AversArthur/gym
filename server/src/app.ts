import Fastify, { type FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ZodError, type z } from 'zod';
import {
  Bodyweight,
  ExerciseIdParam,
  HistoryQuery,
  IdParam,
  LastQuery,
  ProgramItemPatch,
  SetPatch,
  SetUpsert,
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

declare module 'fastify' {
  interface FastifyRequest {
    userId: number;
  }
}

export interface AppOptions {
  db: DB;
  logger?: boolean | object;
  /**
   * Как определить пользователя запроса. До фазы 9 (вход по паролю) — всегда админ.
   * В тестах подменяется, чтобы проверять изоляцию данных.
   */
  resolveUser?: (req: { headers: Record<string, unknown> }) => number | null;
}

const parse = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => schema.parse(data);

export function buildApp({ db, logger = false, resolveUser }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  const repo = createRepo(db);

  const adminId = () =>
    db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).get()?.id ?? null;
  const userOf = resolveUser ?? (() => adminId());

  app.decorateRequest('userId', 0);
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/health') return;
    const uid = userOf(req);
    if (uid == null) return reply.code(401).send({ error: 'unauthorized' });
    req.userId = uid;
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation',
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
    const results: SyncResult[] = ops.map((op) => {
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

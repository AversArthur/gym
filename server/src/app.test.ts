import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  ActiveProgram,
  LastMap,
  WorkoutDetail,
  WorkoutSet,
  WorkoutSummary,
} from '@gym/shared';
import { buildApp } from './app.js';
import { openDb, type DB } from './db/client.js';
import { seedIfEmpty } from './db/seed.js';
import { programDays, programs, users } from './db/schema.js';

let db: DB;
let app: FastifyInstance;
let program: ActiveProgram;

// Пользователь задаётся заголовком x-test-user (в тестах вместо сессии)
const as = (user: number) => ({ 'x-test-user': String(user) });

async function api<T = unknown>(method: string, url: string, body?: unknown, user = 1) {
  const res = await app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: as(user),
  });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
}

const dayId = (code: 'A' | 'B' | 'C') => program.days.find((d) => d.code === code)!.id;

async function startWorkout(code: 'A' | 'B' | 'C', startedAt: number, user = 1) {
  const r = await api<{ id: number }>(
    'POST',
    '/api/workouts',
    { programDayId: dayId(code), startedAt },
    user,
  );
  expect(r.status).toBe(201);
  return r.body.id;
}

async function addSets(
  workoutId: number,
  exerciseId: string,
  sets: [number, number][],
  tag: string,
) {
  for (const [i, [weight, reps]] of sets.entries()) {
    const r = await api('POST', '/api/sets', {
      clientId: `${tag}-${exerciseId}-${i}`,
      workoutId,
      exerciseId,
      setIndex: i,
      weight,
      reps,
    });
    expect(r.status).toBe(201);
  }
}

beforeEach(async () => {
  db = openDb(':memory:');
  seedIfEmpty(db);
  app = await buildApp({
    db,
    resolveUser: (req) => Number(req.headers['x-test-user'] ?? 1),
  });
  program = (await api<ActiveProgram>('GET', '/api/program/active')).body;
});

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

describe('программа', () => {
  it('активная программа: 3 дня, упражнения с анимационными ключами', async () => {
    expect(program.days.map((d) => d.code)).toEqual(['A', 'B', 'C']);
    expect(program.days[0]!.items[0]).toMatchObject({
      exerciseId: 'squat',
      sets: 4,
      repMin: 6,
      repMax: 10,
    });
    expect(program.exercises.squat).toMatchObject({ animKey: 'squat', weightMode: 'plates_only' });
  });

  it('PUT /api/program/items/:id меняет подходы и валидирует диапазон', async () => {
    const item = program.days[0]!.items[0]!;
    const ok = await api('PUT', `/api/program/items/${item.id}`, { sets: 5, repMax: 12 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ sets: 5, repMin: 6, repMax: 12 });
    expect((await api('PUT', `/api/program/items/${item.id}`, { repMin: 15 })).status).toBe(400);
    expect((await api('PUT', `/api/program/items/${item.id}`, { exerciseId: 'nope' })).status).toBe(
      400,
    );
    expect((await api('PUT', `/api/program/items/${item.id}`, { sets: -1 })).status).toBe(400);
  });
});

describe('редактор программы', () => {
  it('добавить упражнение в конец дня с дефолтами, удалить, переставить', async () => {
    const day = program.days[0]!;
    const add = await api<{
      id: number;
      position: number;
      sets: number;
      repMin: number;
      restSec: number;
    }>('POST', `/api/program/days/${day.id}/items`, { exerciseId: 'lateral' });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({
      position: day.items.length,
      sets: 3,
      repMin: 10,
      restSec: 90,
    });

    const ids = [add.body.id, ...day.items.map((i) => i.id)];
    expect((await api('PUT', `/api/program/days/${day.id}/order`, { itemIds: ids })).status).toBe(
      204,
    );
    let p = (await api<ActiveProgram>('GET', '/api/program/active')).body;
    expect(p.days[0]!.items[0]!.exerciseId).toBe('lateral');
    // Неполный список — отказ
    expect(
      (await api('PUT', `/api/program/days/${day.id}/order`, { itemIds: ids.slice(1) })).status,
    ).toBe(400);

    expect((await api('DELETE', `/api/program/items/${add.body.id}`)).status).toBe(204);
    p = (await api<ActiveProgram>('GET', '/api/program/active')).body;
    expect(p.days[0]!.items.map((i) => i.exerciseId)).not.toContain('lateral');
  });

  it('перестановка, разрывающая суперсет, распускает пару и возвращает отдых', async () => {
    const day = program.days[0]!;
    const [squat, bench, pulldown, dbpress, ...rest] = day.items.map((i) => i.id);
    await api('PUT', `/api/program/days/${day.id}/order`, {
      itemIds: [squat, bench, dbpress, pulldown, ...rest],
    });
    const p = (await api<ActiveProgram>('GET', '/api/program/active')).body.days[0]!.items;
    const byEx = Object.fromEntries(p.map((i) => [i.exerciseId, i]));
    expect(byEx.bench).toMatchObject({ supersetGroup: null, restSec: 90 });
    expect(byEx.pulldown).toMatchObject({ supersetGroup: null, restSec: 90 });
    // Пара бицепс + трицепс не тронута
    expect(byEx.curl!.supersetGroup).toBe(2);
    expect(byEx.pushdown!.supersetGroup).toBe(2);
  });

  it('переименовать день; неизвестное упражнение и чужой день — ошибка', async () => {
    const day = program.days[1]!;
    const r = await api<{ title: string }>('PATCH', `/api/program/days/${day.id}`, {
      title: 'Спина',
    });
    expect(r.body.title).toBe('Спина');
    expect(
      (await api('POST', `/api/program/days/${day.id}/items`, { exerciseId: 'nope' })).status,
    ).toBe(400);
    expect((await api('POST', '/api/program/days/999/items', { exerciseId: 'squat' })).status).toBe(
      404,
    );
  });

  it('замена и удаление упражнения в программе не трогают историю', async () => {
    const w = await startWorkout('A', T0);
    await addSets(w, 'squat', [[40, 10]], 'hist');
    const squatItem = program.days[0]!.items.find((i) => i.exerciseId === 'squat')!;
    await api('PUT', `/api/program/items/${squatItem.id}`, { exerciseId: 'legpress' });
    let detail = (await api<WorkoutDetail>('GET', `/api/workouts/${w}`)).body;
    expect(detail.sets[0]!.exerciseId).toBe('squat');
    await api('DELETE', `/api/program/items/${squatItem.id}`);
    detail = (await api<WorkoutDetail>('GET', `/api/workouts/${w}`)).body;
    expect(detail.sets).toHaveLength(1);
    expect((await api<LastMap>('GET', '/api/exercises/last?ids=squat')).body.squat!.workoutId).toBe(
      w,
    );
  });
});

describe('«в прошлый раз»', () => {
  it('берёт последнюю по дате тренировку с этим упражнением, исключая текущую', async () => {
    const w1 = await startWorkout('A', T0);
    await addSets(
      w1,
      'squat',
      [
        [40, 10],
        [40, 9],
        [40, 8],
        [40, 8],
      ],
      'w1',
    );
    const w2 = await startWorkout('B', T0 + 2 * DAY); // без приседа
    await addSets(w2, 'rdl', [[60, 10]], 'w2');
    const w3 = await startWorkout('A', T0 + 4 * DAY);
    await addSets(w3, 'squat', [[45, 8]], 'w3');

    const last = (
      await api<LastMap>('GET', `/api/exercises/last?ids=squat,bench,rdl&exclude=${w3}`)
    ).body;
    expect(last.squat!.workoutId).toBe(w1);
    expect(last.squat!.sets.map((s) => s.reps)).toEqual([10, 9, 8, 8]);
    expect(last.bench).toBeNull();
    expect(last.rdl!.workoutId).toBe(w2);

    const single = await api<{ workoutId: number }>('GET', '/api/exercises/squat/last');
    expect(single.body.workoutId).toBe(w3);
  });

  it('тренировка, начатая задним числом, не перебивает более позднюю', async () => {
    const late = await startWorkout('A', T0 + 5 * DAY);
    await addSets(late, 'squat', [[50, 10]], 'late');
    const early = await startWorkout('A', T0);
    await addSets(early, 'squat', [[30, 10]], 'early');
    const last = (await api<LastMap>('GET', '/api/exercises/last?ids=squat')).body;
    expect(last.squat!.workoutId).toBe(late);
  });
});

describe('идемпотентность по client_id', () => {
  it('повторная отправка подхода не создаёт дубль, а обновляет его', async () => {
    const w = await startWorkout('A', T0);
    const set = {
      clientId: 'set-uuid-0001',
      workoutId: w,
      exerciseId: 'squat',
      setIndex: 0,
      weight: 40,
      reps: 10,
    };
    const a = await api<WorkoutSet>('POST', '/api/sets', set);
    const b = await api<WorkoutSet>('POST', '/api/sets', set);
    const c = await api<WorkoutSet>('POST', '/api/sets', { ...set, reps: 11 });
    expect([a.status, b.status, c.status]).toEqual([201, 200, 200]);
    expect(b.body.id).toBe(a.body.id);
    expect(c.body.reps).toBe(11);
    const detail = (await api<WorkoutDetail>('GET', `/api/workouts/${w}`)).body;
    expect(detail.sets).toHaveLength(1);
  });

  it('повторное создание тренировки с тем же client_id возвращает ту же', async () => {
    const body = { programDayId: dayId('A'), clientId: 'workout-uuid-1' };
    const a = await api<{ id: number }>('POST', '/api/workouts', body);
    const b = await api<{ id: number }>('POST', '/api/workouts', body);
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.id).toBe(a.body.id);
  });

  it('/api/sync: офлайн-тренировка целиком, повтор пачки без дублей', async () => {
    const ops = [
      { op: 'workout.create', clientId: 'offline-w-1', programDayId: dayId('B'), startedAt: T0 },
      {
        op: 'set.upsert',
        set: {
          clientId: 'offline-s-1',
          workoutClientId: 'offline-w-1',
          exerciseId: 'rdl',
          setIndex: 0,
          weight: 60,
          reps: 10,
        },
      },
      {
        op: 'set.upsert',
        set: {
          clientId: 'offline-s-2',
          workoutClientId: 'offline-w-1',
          exerciseId: 'rdl',
          setIndex: 1,
          weight: 60,
          reps: 9,
        },
      },
      { op: 'set.delete', clientId: 'offline-s-2' },
      {
        op: 'workout.update',
        clientId: 'offline-w-1',
        patch: { finishedAt: T0 + 3_600_000, notes: 'ок' },
      },
    ];
    const r1 = await api<{ results: { ok: boolean }[] }>('POST', '/api/sync', { ops });
    expect(r1.body.results.every((r) => r.ok)).toBe(true);
    const r2 = await api<{ results: { ok: boolean }[] }>('POST', '/api/sync', { ops });
    expect(r2.body.results.every((r) => r.ok)).toBe(true);

    const list = (await api<WorkoutDetail[]>('GET', '/api/workouts')).body;
    expect(list).toHaveLength(1);
    const detail = (await api<WorkoutDetail>('GET', `/api/workouts/${list[0]!.id}`)).body;
    expect(detail.sets.map((s) => s.clientId)).toEqual(['offline-s-1']);
    expect(detail).toMatchObject({ notes: 'ок', dayCode: 'B', finishedAt: T0 + 3_600_000 });
  });

  it('/api/sync: невалидная операция получает ошибку, остальные проходят', async () => {
    const w = await startWorkout('A', T0);
    const r = await api<{ results: { ok: boolean; error?: string }[] }>('POST', '/api/sync', {
      ops: [
        { op: 'set.upsert', set: { clientId: 'x' } },
        { op: 'nope' },
        {
          op: 'set.upsert',
          set: {
            clientId: 'valid-0001',
            workoutId: w,
            exerciseId: 'squat',
            setIndex: 0,
            weight: 40,
            reps: 10,
          },
        },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.results.map((x) => x.error ?? 'ok')).toEqual(['validation', 'validation', 'ok']);
  });

  it('у каждой тренировки есть client_id; поиск по нему', async () => {
    const r = await api<{ id: number; clientId: string }>('POST', '/api/workouts', {
      programDayId: dayId('A'),
    });
    expect(r.body.clientId).toMatch(/^[0-9a-f-]{36}$/);
    const byClient = await api<{ id: number }>('GET', `/api/workouts/by-client/${r.body.clientId}`);
    expect(byClient.body.id).toBe(r.body.id);
    expect((await api('GET', '/api/workouts/by-client/unknown-id')).status).toBe(404);
  });

  it('/api/sync: ошибка одной операции не ломает остальные', async () => {
    const w = await startWorkout('A', T0);
    const r = await api<{ results: { ok: boolean; error?: string }[] }>('POST', '/api/sync', {
      ops: [
        {
          op: 'set.upsert',
          set: {
            clientId: 'bad-ex-0001',
            workoutId: w,
            exerciseId: 'nope',
            setIndex: 0,
            weight: 1,
            reps: 1,
          },
        },
        {
          op: 'set.upsert',
          set: {
            clientId: 'good-0001',
            workoutId: w,
            exerciseId: 'squat',
            setIndex: 0,
            weight: 40,
            reps: 10,
          },
        },
      ],
    });
    expect(r.body.results.map((x) => x.ok)).toEqual([false, true]);
    expect(r.body.results[0]!.error).toBe('unknown_exercise');
  });
});

describe('тренировки', () => {
  it('активная тренировка, завершение, итог с тоннажем и рекордами', async () => {
    const w1 = await startWorkout('A', T0);
    await addSets(
      w1,
      'squat',
      [
        [40, 10],
        [40, 10],
      ],
      'w1',
    );
    await addSets(w1, 'dbpress', [[16, 10]], 'w1');
    await api('PATCH', `/api/workouts/${w1}`, { finishedAt: T0 + 3_000_000 });

    const w2 = await startWorkout('A', T0 + 2 * DAY);
    expect((await api<{ id: number }>('GET', '/api/workouts/active')).body.id).toBe(w2);
    await addSets(
      w2,
      'squat',
      [
        [45, 8],
        [45, 7],
      ],
      'w2',
    ); // вес выше → рекорд веса
    await addSets(w2, 'dbpress', [[16, 12]], 'w2'); // вес тот же, повторов больше → рекорд 1ПМ
    await api('PATCH', `/api/workouts/${w2}`, {
      finishedAt: T0 + 2 * DAY + 3_600_000,
      notes: 'тяжело',
    });
    expect((await api('GET', '/api/workouts/active')).body).toBeNull();

    const sum = (await api<WorkoutSummary>('GET', `/api/workouts/${w2}/summary`)).body;
    expect(sum.durationSec).toBe(3600);
    expect(sum.setCount).toBe(3);
    expect(sum.tonnage).toBe(45 * 8 + 45 * 7 + 16 * 12 * 2);
    expect(sum.records).toEqual(
      expect.arrayContaining([
        { exerciseId: 'squat', kind: 'weight', value: 45, previous: 40 },
        expect.objectContaining({ exerciseId: 'dbpress', kind: 'e1rm' }),
      ]),
    );
    // Первая тренировка рекордов не даёт
    expect((await api<WorkoutSummary>('GET', `/api/workouts/${w1}/summary`)).body.records).toEqual(
      [],
    );
  });

  it('список с пагинацией, правка и удаление подходов задним числом', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await startWorkout('A', T0 + i * DAY));
    await addSets(ids[0]!, 'squat', [[40, 10]], 'p');
    const page1 = (await api<{ id: number; tonnage: number }[]>('GET', '/api/workouts?limit=2'))
      .body;
    expect(page1.map((w) => w.id)).toEqual([ids[2], ids[1]]);
    const page2 = (
      await api<{ id: number; tonnage: number }[]>(
        'GET',
        `/api/workouts?limit=2&before=${T0 + DAY}`,
      )
    ).body;
    expect(page2.map((w) => w.id)).toEqual([ids[0]]);
    expect(page2[0]!.tonnage).toBe(400);

    const set = (await api<WorkoutDetail>('GET', `/api/workouts/${ids[0]}`)).body.sets[0]!;
    expect(
      (await api<WorkoutSet>('PATCH', `/api/sets/${set.id}`, { weight: 42.5 })).body.weight,
    ).toBe(42.5);
    expect((await api('DELETE', `/api/sets/${set.id}`)).status).toBe(204);
    expect((await api('DELETE', `/api/workouts/${ids[0]}`)).status).toBe(204);
    expect((await api('GET', `/api/workouts/${ids[0]}`)).status).toBe(404);
  });

  it('история упражнения: макс. вес, 1ПМ, тоннаж по тренировкам и фильтр по датам', async () => {
    const w1 = await startWorkout('A', T0);
    await addSets(
      w1,
      'squat',
      [
        [40, 10],
        [45, 6],
      ],
      'h1',
    );
    const w2 = await startWorkout('A', T0 + 10 * DAY);
    await addSets(w2, 'squat', [[50, 5]], 'h2');
    const h = (
      await api<{ maxWeight: number; bestE1rm: number; tonnage: number }[]>(
        'GET',
        '/api/exercises/squat/history',
      )
    ).body;
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ maxWeight: 45, bestE1rm: 54, tonnage: 670 });
    expect(h[1]).toMatchObject({ maxWeight: 50, bestE1rm: 58.3 });
    const filtered = (await api<unknown[]>('GET', `/api/exercises/squat/history?from=${T0 + DAY}`))
      .body;
    expect(filtered).toHaveLength(1);
  });

  it('валидация: мусор во входе → 400', async () => {
    const w = await startWorkout('A', T0);
    expect(
      (
        await api('POST', '/api/sets', {
          clientId: 'x',
          workoutId: w,
          exerciseId: 'squat',
          setIndex: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (await api('POST', '/api/sets', { clientId: 'valid-id-1', exerciseId: 'squat', setIndex: 0 }))
        .status,
    ).toBe(400);
    expect(
      (
        await api('POST', '/api/sets', {
          clientId: 'valid-id-1',
          workoutId: w,
          exerciseId: 'squat',
          setIndex: 0,
          weight: -5,
        })
      ).status,
    ).toBe(400);
    expect((await api('POST', '/api/workouts', { programDayId: 'A' })).status).toBe(400);
    expect((await api('GET', '/api/workouts/abc')).status).toBe(400);
  });
});

describe('вес тела, экспорт, отчёт', () => {
  it('вес тела: одна запись на дату, повтор обновляет', async () => {
    await api('POST', '/api/bodyweight', { date: '2026-10-01', kg: 74 });
    await api('POST', '/api/bodyweight', { date: '2026-10-01', kg: 74.4 });
    await api('POST', '/api/bodyweight', { date: '2026-10-03', kg: 74.8 });
    expect((await api('GET', '/api/bodyweight')).body).toEqual([
      { date: '2026-10-01', kg: 74.4 },
      { date: '2026-10-03', kg: 74.8 },
    ]);
  });

  it('экспорт JSON и CSV, отчёт за неделю в порядке программы', async () => {
    const w = await startWorkout('A', Date.now() - DAY);
    await addSets(
      w,
      'bench',
      [
        [60, 10],
        [60, 10],
      ],
      'e',
    );
    await addSets(w, 'squat', [[40, 10]], 'e');
    const json = await app.inject({ url: '/api/export.json' });
    expect(json.headers['content-disposition']).toMatch(/attachment/);
    expect(json.json().workouts[0].sets).toHaveLength(3);
    const csv = await app.inject({ url: '/api/export.csv' });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body.trim().split('\n')).toHaveLength(4);
    expect(csv.body).toContain('Жим штанги лёжа');
    const rep = (await api<{ text: string }>('GET', '/api/report/week')).body.text;
    expect(rep).toMatch(/^\d\d\.\d\d A: Приседания в Смите 40×10; Жим штанги лёжа 60×10,10$/);
  });
});

describe('изоляция пользователей (основа для фазы 10)', () => {
  it('второй пользователь не видит и не меняет чужие данные', async () => {
    const [u2] = db
      .insert(users)
      .values({ username: 'friend', displayName: 'Друг' })
      .returning()
      .all();
    const [p2] = db
      .insert(programs)
      .values({ userId: u2!.id, name: 'P2', isActive: true })
      .returning()
      .all();
    db.insert(programDays).values({ programId: p2!.id, code: 'A', title: 'A', position: 0 }).run();

    const w = await startWorkout('A', T0);
    await addSets(w, 'squat', [[40, 10]], 'iso');
    const setId = (await api<WorkoutDetail>('GET', `/api/workouts/${w}`)).body.sets[0]!.id;
    const U2 = u2!.id;

    expect((await api<unknown[]>('GET', '/api/workouts', undefined, U2)).body).toEqual([]);
    expect((await api('GET', `/api/workouts/${w}`, undefined, U2)).status).toBe(404);
    expect((await api('PATCH', `/api/workouts/${w}`, { notes: 'x' }, U2)).status).toBe(404);
    expect((await api('DELETE', `/api/workouts/${w}`, undefined, U2)).status).toBe(404);
    expect((await api('PATCH', `/api/sets/${setId}`, { weight: 1 }, U2)).status).toBe(404);
    expect((await api('DELETE', `/api/sets/${setId}`, undefined, U2)).status).toBe(404);
    expect(
      (await api<LastMap>('GET', '/api/exercises/last?ids=squat', undefined, U2)).body.squat,
    ).toBeNull();
    // Подход в чужую тренировку и перехват чужого client_id
    expect(
      (
        await api(
          'POST',
          '/api/sets',
          {
            clientId: 'iso-x-0001',
            workoutId: w,
            exerciseId: 'squat',
            setIndex: 1,
            weight: 1,
            reps: 1,
          },
          U2,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await api(
          'POST',
          '/api/sets',
          {
            clientId: 'iso-squat-0',
            workoutClientId: 'nope-nope',
            exerciseId: 'squat',
            setIndex: 0,
          },
          U2,
        )
      ).status,
    ).toBe(404);
    const ownDay = (await api<ActiveProgram>('GET', '/api/program/active', undefined, U2)).body
      .days[0]!.id;
    const w2 = (await api<{ id: number }>('POST', '/api/workouts', { programDayId: ownDay }, U2))
      .body.id;
    expect(
      (
        await api(
          'POST',
          '/api/sets',
          {
            clientId: 'iso-squat-0',
            workoutId: w2,
            exerciseId: 'squat',
            setIndex: 0,
            weight: 1,
            reps: 1,
          },
          U2,
        )
      ).status,
    ).toBe(409);
    // Чужой день программы
    expect((await api('POST', '/api/workouts', { programDayId: dayId('A') }, U2)).status).toBe(404);
    // Чужой пункт программы
    expect(
      (await api('PUT', `/api/program/items/${program.days[0]!.items[0]!.id}`, { sets: 1 }, U2))
        .status,
    ).toBe(404);
    // Экспорт только своего
    const exported = (
      await api<{ workouts: { id: number }[] }>('GET', '/api/export.json', undefined, U2)
    ).body;
    expect(exported.workouts.map((x) => x.id)).toEqual([w2]);
    // У владельца всё на месте
    expect((await api<WorkoutDetail>('GET', `/api/workouts/${w}`)).body.sets[0]!.weight).toBe(40);
  });
});

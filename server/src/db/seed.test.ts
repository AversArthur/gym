import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDb } from './client.js';
import { seedIfEmpty } from './seed.js';
import {
  exercises,
  programDays,
  programItems,
  programs,
  users,
  workoutSets,
  workouts,
} from './schema.js';

const fresh = () => {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  return db;
};

describe('seed', () => {
  it('заливает 21 упражнение, админа и активную программу из 3 дней', () => {
    const db = fresh();
    expect(db.select().from(exercises).all()).toHaveLength(21);
    const [admin] = db.select().from(users).all();
    expect(admin).toMatchObject({ username: 'arthur', role: 'admin' });
    const progs = db.select().from(programs).all();
    expect(progs).toHaveLength(1);
    expect(progs[0]).toMatchObject({ isActive: true, userId: admin!.id });
    expect(
      db
        .select()
        .from(programDays)
        .all()
        .map((d) => d.code),
    ).toEqual(['A', 'B', 'C']);
  });

  it('раскладывает упражнения по дням как в прототипе', () => {
    const db = fresh();
    const perDay = Object.fromEntries(
      db
        .select({ code: programDays.code, n: count() })
        .from(programItems)
        .innerJoin(programDays, eq(programItems.dayId, programDays.id))
        .groupBy(programDays.code)
        .all()
        .map((r) => [r.code, r.n]),
    );
    expect(perDay).toEqual({ A: 7, B: 6, C: 8 });

    const squat = db.select().from(programItems).where(eq(programItems.exerciseId, 'squat')).get();
    expect(squat).toMatchObject({ sets: 4, repMin: 6, repMax: 10, restSec: 150, weightStep: 5 });
    const pullup = db
      .select()
      .from(programItems)
      .where(eq(programItems.exerciseId, 'pullup'))
      .get();
    expect(pullup).toMatchObject({ repMin: null, repMax: null });
    const plank = db.select().from(programItems).where(eq(programItems.exerciseId, 'plank')).get();
    expect(plank).toMatchObject({ unit: 'sec', repMin: 30, repMax: 45 });
  });

  it('суперсеты: пары в одной группе, отдых только после второго', () => {
    const db = fresh();
    const bench = db.select().from(programItems).where(eq(programItems.exerciseId, 'bench')).get();
    const pulldown = db
      .select()
      .from(programItems)
      .where(eq(programItems.exerciseId, 'pulldown'))
      .get();
    expect(bench?.supersetGroup).toBe(1);
    expect(pulldown?.supersetGroup).toBe(1);
    expect(bench?.restSec).toBe(0);
    expect(pulldown?.restSec).toBe(90);
  });

  it('повторный запуск ничего не дублирует', () => {
    const db = fresh();
    expect(seedIfEmpty(db)).toBe(false);
    expect(db.select().from(exercises).all()).toHaveLength(21);
    expect(db.select().from(programs).all()).toHaveLength(1);
  });

  it('client_id подхода уникален, внешние ключи включены', () => {
    const db = fresh();
    const [w] = db.insert(workouts).values({ userId: 1, startedAt: new Date() }).returning().all();
    const set = {
      workoutId: w!.id,
      exerciseId: 'squat',
      setIndex: 0,
      weight: 40,
      reps: 10,
      completedAt: new Date(),
      clientId: 'abc',
    };
    db.insert(workoutSets).values(set).run();
    expect(() => db.insert(workoutSets).values(set).run()).toThrow(/UNIQUE/);
    expect(() =>
      db
        .insert(workoutSets)
        .values({ ...set, clientId: 'x', exerciseId: 'nope' })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});

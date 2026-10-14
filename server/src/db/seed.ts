import { count } from 'drizzle-orm';
import { SEED_ADMIN, SEED_EXERCISES, SEED_PROGRAM } from '@gym/shared';
import type { DB } from './client.js';
import { exercises, programDays, programItems, programs, users } from './schema.js';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Стартовая программа A·B·C для пользователя: своя копия, правки не задевают других. */
export function createStarterProgram(tx: Tx | DB, userId: number) {
  const [program] = tx
    .insert(programs)
    .values({ userId, name: SEED_PROGRAM.name, isActive: true })
    .returning({ id: programs.id })
    .all();
  if (!program) throw new Error('seed: program not created');

  SEED_PROGRAM.days.forEach((d, di) => {
    const [day] = tx
      .insert(programDays)
      .values({
        programId: program.id,
        code: d.code,
        title: d.title,
        subtitle: d.subtitle,
        position: di,
      })
      .returning({ id: programDays.id })
      .all();
    if (!day) throw new Error('seed: day not created');
    tx.insert(programItems)
      .values(
        d.items.map((it, ii) => ({
          dayId: day.id,
          exerciseId: it.exerciseId,
          position: ii,
          sets: it.sets,
          repMin: it.repMin,
          repMax: it.repMax,
          unit: it.unit,
          supersetGroup: it.supersetGroup ?? null,
          restSec: it.restSec,
          weightStep: it.weightStep,
        })),
      )
      .run();
  });
  return program.id;
}

/** Заливает упражнения, админа и программу A·B·C, если БД пустая. Возвращает true, если залил. */
export function seedIfEmpty(db: DB): boolean {
  const [row] = db.select({ n: count() }).from(users).all();
  if (row && row.n > 0) return false;

  db.transaction((tx) => {
    const [admin] = tx
      .insert(users)
      .values({ username: SEED_ADMIN.username, displayName: SEED_ADMIN.displayName, role: 'admin' })
      .returning({ id: users.id })
      .all();
    if (!admin) throw new Error('seed: admin not created');

    tx.insert(exercises)
      .values(SEED_EXERCISES.map((e) => ({ ...e, animKey: e.id, ownerId: null })))
      .onConflictDoNothing()
      .run();

    createStarterProgram(tx, admin.id);
  });
  return true;
}

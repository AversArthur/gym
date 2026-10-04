// Доступ к данным. Каждая функция получает userId и видит только данные этого пользователя:
// так изоляция для фазы 10 (несколько пользователей) уже заложена в одном месте.
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import {
  e1rm,
  isLoadMode,
  tonnage,
  weekReport,
  type ActiveProgram,
  type BodyweightEntry,
  type Exercise,
  type HistoryPoint,
  type LastMap,
  type ProgramItem,
  type ProgramDayPatch,
  type ProgramItemCreate,
  type ProgramItemPatch,
  type SetPatch,
  type SetUpsert,
  type Workout,
  type WorkoutCreate,
  type WorkoutDetail,
  type WorkoutListItem,
  type WorkoutPatch,
  type WorkoutRecord,
  type WorkoutSet,
  type WorkoutSummary,
} from '@gym/shared';
import type { DB } from './db/client.js';
import {
  bodyweightLog,
  exercises,
  programDays,
  programItems,
  programs,
  workoutSets,
  workouts,
} from './db/schema.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
  ) {
    super(message);
  }
}
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} не найдено`);

type WorkoutRow = typeof workouts.$inferSelect;
type SetRow = typeof workoutSets.$inferSelect;
type ExerciseRow = typeof exercises.$inferSelect;

const toWorkout = (w: WorkoutRow): Workout => ({
  id: w.id,
  programDayId: w.programDayId,
  dayCode: w.dayCode,
  clientId: w.clientId,
  startedAt: w.startedAt.getTime(),
  finishedAt: w.finishedAt?.getTime() ?? null,
  notes: w.notes,
  bodyweightKg: w.bodyweightKg,
});

const toSet = (s: SetRow): WorkoutSet => ({
  id: s.id,
  workoutId: s.workoutId,
  exerciseId: s.exerciseId,
  setIndex: s.setIndex,
  weight: s.weight,
  reps: s.reps,
  durationSec: s.durationSec,
  rir: s.rir,
  completedAt: s.completedAt.getTime(),
  clientId: s.clientId,
});

const toExercise = (e: ExerciseRow): Exercise => ({ ...e, cues: e.cues ?? [] });

const visibleExercise = (userId: number) =>
  or(isNull(exercises.ownerId), eq(exercises.ownerId, userId));

const bySetOrder = (a: WorkoutSet, b: WorkoutSet) =>
  a.exerciseId === b.exerciseId ? a.setIndex - b.setIndex : a.completedAt - b.completedAt;

export function createRepo(db: DB) {
  // ---------- упражнения ----------

  function listExercises(userId: number): Exercise[] {
    return db
      .select()
      .from(exercises)
      .where(visibleExercise(userId))
      .orderBy(asc(exercises.nameRu))
      .all()
      .map(toExercise);
  }

  function exerciseModes(userId: number): Map<string, Exercise> {
    return new Map(listExercises(userId).map((e) => [e.id, e]));
  }

  function assertExerciseVisible(userId: number, exerciseId: string) {
    const ex = db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), visibleExercise(userId)))
      .get();
    if (!ex) throw new HttpError(400, 'unknown_exercise', `Упражнение ${exerciseId} не найдено`);
  }

  // ---------- программа ----------

  function getActiveProgram(userId: number): ActiveProgram {
    const program = db
      .select()
      .from(programs)
      .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
      .get();
    if (!program) throw notFound('Активная программа');
    const days = db
      .select()
      .from(programDays)
      .where(eq(programDays.programId, program.id))
      .orderBy(asc(programDays.position))
      .all();
    const items = days.length
      ? db
          .select()
          .from(programItems)
          .where(
            inArray(
              programItems.dayId,
              days.map((d) => d.id),
            ),
          )
          .orderBy(asc(programItems.position))
          .all()
      : [];
    return {
      id: program.id,
      name: program.name,
      days: days.map((d) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        subtitle: d.subtitle,
        position: d.position,
        items: items.filter((i) => i.dayId === d.id),
      })),
      exercises: Object.fromEntries(listExercises(userId).map((e) => [e.id, e])),
    };
  }

  function ownedDay(userId: number, dayId: number) {
    return db
      .select({ id: programDays.id, code: programDays.code })
      .from(programDays)
      .innerJoin(programs, eq(programDays.programId, programs.id))
      .where(and(eq(programDays.id, dayId), eq(programs.userId, userId)))
      .get();
  }

  function updateProgramItem(userId: number, itemId: number, patch: ProgramItemPatch): ProgramItem {
    const row = db
      .select({ item: programItems })
      .from(programItems)
      .innerJoin(programDays, eq(programItems.dayId, programDays.id))
      .innerJoin(programs, eq(programDays.programId, programs.id))
      .where(and(eq(programItems.id, itemId), eq(programs.userId, userId)))
      .get();
    if (!row) throw notFound('Упражнение программы');
    if (patch.exerciseId) assertExerciseVisible(userId, patch.exerciseId);
    const next = { ...row.item, ...patch };
    if (next.repMin != null && next.repMax != null && next.repMin > next.repMax) {
      throw new HttpError(400, 'invalid_range', 'repMin больше repMax');
    }
    if (Object.keys(patch).length)
      db.update(programItems).set(patch).where(eq(programItems.id, itemId)).run();
    return db.select().from(programItems).where(eq(programItems.id, itemId)).get()!;
  }

  function addProgramItem(userId: number, dayId: number, input: ProgramItemCreate): ProgramItem {
    if (!ownedDay(userId, dayId)) throw notFound('День программы');
    assertExerciseVisible(userId, input.exerciseId);
    const [row] = db
      .select({ max: sql<number | null>`max(${programItems.position})` })
      .from(programItems)
      .where(eq(programItems.dayId, dayId))
      .all();
    return db
      .insert(programItems)
      .values({ ...(input as Required<ProgramItemCreate>), dayId, position: (row?.max ?? -1) + 1 })
      .returning()
      .get();
  }

  function ownedItem(userId: number, itemId: number) {
    const row = db
      .select({ item: programItems })
      .from(programItems)
      .innerJoin(programDays, eq(programItems.dayId, programDays.id))
      .innerJoin(programs, eq(programDays.programId, programs.id))
      .where(and(eq(programItems.id, itemId), eq(programs.userId, userId)))
      .get();
    if (!row) throw notFound('Упражнение программы');
    return row.item;
  }

  /** Удаление из программы. История не страдает: подходы ссылаются на упражнение, а не на пункт программы. */
  function deleteProgramItem(userId: number, itemId: number) {
    ownedItem(userId, itemId);
    db.delete(programItems).where(eq(programItems.id, itemId)).run();
  }

  /** Новый порядок упражнений дня: itemIds — все пункты дня в нужном порядке. */
  function reorderDay(userId: number, dayId: number, itemIds: number[]) {
    if (!ownedDay(userId, dayId)) throw notFound('День программы');
    const current = db
      .select({ id: programItems.id })
      .from(programItems)
      .where(eq(programItems.dayId, dayId))
      .all();
    const same = current.length === itemIds.length && current.every((c) => itemIds.includes(c.id));
    if (!same) throw new HttpError(400, 'invalid_order', 'Список не совпадает с упражнениями дня');
    db.transaction((tx) => {
      itemIds.forEach((id, position) =>
        tx.update(programItems).set({ position }).where(eq(programItems.id, id)).run(),
      );
      // Суперсет, который перестал идти подряд, распускаем: иначе у первого упражнения останется отдых 0
      const ordered = tx
        .select()
        .from(programItems)
        .where(eq(programItems.dayId, dayId))
        .orderBy(asc(programItems.position))
        .all();
      const groups = new Map<number, number[]>();
      ordered.forEach((it, i) => {
        if (it.supersetGroup != null)
          groups.set(it.supersetGroup, [...(groups.get(it.supersetGroup) ?? []), i]);
      });
      for (const idx of groups.values()) {
        const consecutive = idx.length > 1 && idx.every((v, k) => k === 0 || v === idx[k - 1]! + 1);
        if (consecutive) continue;
        const rest = Math.max(...idx.map((i) => ordered[i]!.restSec));
        for (const i of idx) {
          const it = ordered[i]!;
          tx.update(programItems)
            .set({ supersetGroup: null, restSec: it.restSec || rest })
            .where(eq(programItems.id, it.id))
            .run();
        }
      }
    });
  }

  function patchDay(userId: number, dayId: number, patch: ProgramDayPatch) {
    if (!ownedDay(userId, dayId)) throw notFound('День программы');
    if (Object.keys(patch).length)
      db.update(programDays).set(patch).where(eq(programDays.id, dayId)).run();
    return db.select().from(programDays).where(eq(programDays.id, dayId)).get()!;
  }

  // ---------- тренировки ----------

  function ownedWorkout(userId: number, id: number): WorkoutRow {
    const w = db
      .select()
      .from(workouts)
      .where(and(eq(workouts.id, id), eq(workouts.userId, userId)))
      .get();
    if (!w) throw notFound('Тренировка');
    return w;
  }

  function workoutByClientId(userId: number, clientId: string): WorkoutRow | undefined {
    const w = db.select().from(workouts).where(eq(workouts.clientId, clientId)).get();
    if (w && w.userId !== userId) throw new HttpError(409, 'client_id_conflict');
    return w;
  }

  function createWorkout(
    userId: number,
    input: WorkoutCreate,
  ): { workout: Workout; created: boolean } {
    if (input.clientId) {
      const existing = workoutByClientId(userId, input.clientId);
      if (existing) return { workout: toWorkout(existing), created: false };
    }
    const day = ownedDay(userId, input.programDayId);
    if (!day) throw notFound('День программы');
    const row = db
      .insert(workouts)
      .values({
        userId,
        programDayId: day.id,
        dayCode: day.code,
        clientId: input.clientId ?? null,
        startedAt: new Date(input.startedAt ?? Date.now()),
      })
      .returning()
      .get();
    return { workout: toWorkout(row), created: true };
  }

  function setsOf(workoutIds: number[]): WorkoutSet[] {
    if (!workoutIds.length) return [];
    return db
      .select()
      .from(workoutSets)
      .where(inArray(workoutSets.workoutId, workoutIds))
      .all()
      .map(toSet);
  }

  function getWorkout(userId: number, id: number): WorkoutDetail {
    const w = ownedWorkout(userId, id);
    return { ...toWorkout(w), sets: setsOf([w.id]).sort(bySetOrder) };
  }

  function activeWorkout(userId: number): WorkoutDetail | null {
    const w = db
      .select()
      .from(workouts)
      .where(and(eq(workouts.userId, userId), isNull(workouts.finishedAt)))
      .orderBy(desc(workouts.startedAt))
      .get();
    return w ? { ...toWorkout(w), sets: setsOf([w.id]).sort(bySetOrder) } : null;
  }

  function listWorkouts(userId: number, limit: number, before?: number): WorkoutListItem[] {
    const rows = db
      .select()
      .from(workouts)
      .where(
        and(
          eq(workouts.userId, userId),
          before ? lt(workouts.startedAt, new Date(before)) : undefined,
        ),
      )
      .orderBy(desc(workouts.startedAt))
      .limit(limit)
      .all();
    const sets = setsOf(rows.map((r) => r.id));
    const ex = exerciseModes(userId);
    return rows.map((r) => {
      const own = sets.filter((s) => s.workoutId === r.id);
      return {
        ...toWorkout(r),
        setCount: own.length,
        tonnage: tonnage(own, (id) => ex.get(id)?.weightMode),
        exerciseIds: [...new Set(own.map((s) => s.exerciseId))],
      };
    });
  }

  function patchWorkout(userId: number, id: number, patch: WorkoutPatch): Workout {
    ownedWorkout(userId, id);
    const values: Partial<typeof workouts.$inferInsert> = {};
    if (patch.finishedAt !== undefined)
      values.finishedAt = patch.finishedAt == null ? null : new Date(patch.finishedAt);
    if (patch.notes !== undefined) values.notes = patch.notes;
    if (patch.bodyweightKg !== undefined) values.bodyweightKg = patch.bodyweightKg;
    if (Object.keys(values).length)
      db.update(workouts).set(values).where(eq(workouts.id, id)).run();
    return toWorkout(ownedWorkout(userId, id));
  }

  function deleteWorkout(userId: number, id: number) {
    ownedWorkout(userId, id);
    db.delete(workouts).where(eq(workouts.id, id)).run();
  }

  function workoutSummary(userId: number, id: number): WorkoutSummary {
    const w = getWorkout(userId, id);
    const ex = exerciseModes(userId);
    const records: WorkoutRecord[] = [];
    for (const exId of new Set(w.sets.map((s) => s.exerciseId))) {
      const mode = ex.get(exId)?.weightMode;
      if (!mode || !isLoadMode(mode)) continue;
      const own = w.sets.filter(
        (s) => s.exerciseId === exId && s.weight != null && (s.reps ?? 0) > 0,
      );
      if (!own.length) continue;
      const prev = db
        .select({ weight: workoutSets.weight, reps: workoutSets.reps })
        .from(workoutSets)
        .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
        .where(
          and(
            eq(workouts.userId, userId),
            eq(workoutSets.exerciseId, exId),
            lt(workouts.startedAt, new Date(w.startedAt)),
            sql`${workoutSets.reps} > 0`,
          ),
        )
        .all();
      // Рекорд — только если есть с чем сравнивать: первая тренировка с упражнением рекордом не считается
      if (!prev.length) continue;
      const best = (rows: { weight: number | null; reps: number | null }[]) => ({
        weight: Math.max(...rows.map((r) => r.weight ?? 0)),
        e1rm: Math.max(...rows.map((r) => e1rm(r.weight, r.reps) ?? 0)),
      });
      const now = best(own),
        before = best(prev);
      if (now.weight > before.weight)
        records.push({
          exerciseId: exId,
          kind: 'weight',
          value: now.weight,
          previous: before.weight,
        });
      else if (now.e1rm > before.e1rm + 0.01)
        records.push({
          exerciseId: exId,
          kind: 'e1rm',
          value: Math.round(now.e1rm * 10) / 10,
          previous: Math.round(before.e1rm * 10) / 10,
        });
    }
    return {
      workoutId: w.id,
      durationSec: w.finishedAt ? Math.round((w.finishedAt - w.startedAt) / 1000) : null,
      tonnage: tonnage(w.sets, (eid) => ex.get(eid)?.weightMode),
      setCount: w.sets.length,
      records,
    };
  }

  // ---------- подходы ----------

  function upsertSet(userId: number, input: SetUpsert): { set: WorkoutSet; created: boolean } {
    const w =
      input.workoutId != null
        ? ownedWorkout(userId, input.workoutId)
        : workoutByClientId(userId, input.workoutClientId!);
    if (!w) throw notFound('Тренировка');
    assertExerciseVisible(userId, input.exerciseId);

    const values = {
      workoutId: w.id,
      exerciseId: input.exerciseId,
      setIndex: input.setIndex,
      weight: input.weight ?? null,
      reps: input.reps ?? null,
      durationSec: input.durationSec ?? null,
      rir: input.rir ?? null,
      completedAt: new Date(input.completedAt ?? Date.now()),
    };
    const existing = db
      .select({ id: workoutSets.id, userId: workouts.userId })
      .from(workoutSets)
      .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
      .where(eq(workoutSets.clientId, input.clientId))
      .get();
    if (existing) {
      if (existing.userId !== userId) throw new HttpError(409, 'client_id_conflict');
      db.update(workoutSets).set(values).where(eq(workoutSets.id, existing.id)).run();
      return {
        set: toSet(db.select().from(workoutSets).where(eq(workoutSets.id, existing.id)).get()!),
        created: false,
      };
    }
    const row = db
      .insert(workoutSets)
      .values({ ...values, clientId: input.clientId })
      .returning()
      .get();
    return { set: toSet(row), created: true };
  }

  function ownedSet(userId: number, where: ReturnType<typeof eq>) {
    return db
      .select({ set: workoutSets })
      .from(workoutSets)
      .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
      .where(and(where, eq(workouts.userId, userId)))
      .get()?.set;
  }

  function patchSet(userId: number, id: number, patch: SetPatch): WorkoutSet {
    if (!ownedSet(userId, eq(workoutSets.id, id))) throw notFound('Подход');
    if (Object.keys(patch).length)
      db.update(workoutSets).set(patch).where(eq(workoutSets.id, id)).run();
    return toSet(db.select().from(workoutSets).where(eq(workoutSets.id, id)).get()!);
  }

  function deleteSet(userId: number, id: number) {
    if (!ownedSet(userId, eq(workoutSets.id, id))) throw notFound('Подход');
    db.delete(workoutSets).where(eq(workoutSets.id, id)).run();
  }

  /** Удаление по client_id идемпотентно: уже удалённый подход — не ошибка. */
  function deleteSetByClientId(userId: number, clientId: string) {
    const s = ownedSet(userId, eq(workoutSets.clientId, clientId));
    if (s) db.delete(workoutSets).where(eq(workoutSets.id, s.id)).run();
  }

  // ---------- история упражнения ----------

  function lastPerformances(userId: number, ids: string[], excludeWorkoutId?: number): LastMap {
    const out: LastMap = {};
    for (const exId of ids) {
      const top = db
        .select({ id: workouts.id, startedAt: workouts.startedAt })
        .from(workoutSets)
        .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
        .where(
          and(
            eq(workouts.userId, userId),
            eq(workoutSets.exerciseId, exId),
            excludeWorkoutId ? ne(workouts.id, excludeWorkoutId) : undefined,
          ),
        )
        .orderBy(desc(workouts.startedAt))
        .get();
      if (!top) {
        out[exId] = null;
        continue;
      }
      const sets = db
        .select()
        .from(workoutSets)
        .where(and(eq(workoutSets.workoutId, top.id), eq(workoutSets.exerciseId, exId)))
        .orderBy(asc(workoutSets.setIndex))
        .all()
        .map(toSet);
      out[exId] = { workoutId: top.id, startedAt: top.startedAt.getTime(), sets };
    }
    return out;
  }

  function exerciseHistory(
    userId: number,
    exId: string,
    from?: number,
    to?: number,
  ): HistoryPoint[] {
    const mode = exerciseModes(userId).get(exId)?.weightMode;
    if (!mode) throw notFound('Упражнение');
    const rows = db
      .select({ set: workoutSets, startedAt: workouts.startedAt })
      .from(workoutSets)
      .innerJoin(workouts, eq(workoutSets.workoutId, workouts.id))
      .where(
        and(
          eq(workouts.userId, userId),
          eq(workoutSets.exerciseId, exId),
          from != null ? gte(workouts.startedAt, new Date(from)) : undefined,
          to != null ? lte(workouts.startedAt, new Date(to)) : undefined,
        ),
      )
      .orderBy(asc(workouts.startedAt), asc(workoutSets.setIndex))
      .all();
    const points = new Map<number, HistoryPoint>();
    for (const r of rows) {
      const s = toSet(r.set);
      let p = points.get(s.workoutId);
      if (!p) {
        p = {
          workoutId: s.workoutId,
          startedAt: r.startedAt.getTime(),
          sets: [],
          maxWeight: null,
          bestE1rm: null,
          tonnage: 0,
          totalReps: 0,
        };
        points.set(s.workoutId, p);
      }
      p.sets.push(s);
    }
    for (const p of points.values()) {
      const load = isLoadMode(mode);
      const weights = p.sets
        .filter((s) => (s.reps ?? 0) > 0 || (s.durationSec ?? 0) > 0)
        .map((s) => s.weight ?? 0);
      p.maxWeight = weights.length
        ? mode === 'assisted'
          ? Math.min(...weights)
          : Math.max(...weights)
        : null;
      const e = p.sets.map((s) => e1rm(s.weight, s.reps) ?? 0);
      p.bestE1rm = load && e.some((x) => x > 0) ? Math.round(Math.max(...e) * 10) / 10 : null;
      p.tonnage = tonnage(p.sets, () => mode);
      p.totalReps = p.sets.reduce((n, s) => n + (s.reps ?? 0), 0);
    }
    return [...points.values()];
  }

  // ---------- вес тела ----------

  function upsertBodyweight(userId: number, date: string, kg: number): BodyweightEntry {
    db.insert(bodyweightLog)
      .values({ userId, date, kg })
      .onConflictDoUpdate({ target: [bodyweightLog.userId, bodyweightLog.date], set: { kg } })
      .run();
    return { date, kg };
  }

  function listBodyweight(userId: number): BodyweightEntry[] {
    return db
      .select({ date: bodyweightLog.date, kg: bodyweightLog.kg })
      .from(bodyweightLog)
      .where(eq(bodyweightLog.userId, userId))
      .orderBy(asc(bodyweightLog.date))
      .all();
  }

  // ---------- экспорт и отчёт ----------

  function allWorkouts(userId: number, from?: number): WorkoutDetail[] {
    const rows = db
      .select()
      .from(workouts)
      .where(
        and(
          eq(workouts.userId, userId),
          from != null ? gte(workouts.startedAt, new Date(from)) : undefined,
        ),
      )
      .orderBy(asc(workouts.startedAt))
      .all();
    const sets = setsOf(rows.map((r) => r.id));
    return rows.map((r) => ({
      ...toWorkout(r),
      sets: sets.filter((s) => s.workoutId === r.id).sort(bySetOrder),
    }));
  }

  function exportJson(userId: number) {
    return {
      exportedAt: Date.now(),
      program: getActiveProgram(userId),
      workouts: allWorkouts(userId),
      bodyweight: listBodyweight(userId),
    };
  }

  function exportCsv(userId: number): string {
    const ex = exerciseModes(userId);
    const head = [
      'date',
      'day',
      'workout_id',
      'exercise_id',
      'exercise',
      'set',
      'weight_kg',
      'weight_mode',
      'reps',
      'duration_sec',
      'rir',
    ];
    const lines = [head.join(',')];
    for (const w of allWorkouts(userId)) {
      for (const s of w.sets) {
        const e = ex.get(s.exerciseId);
        lines.push(
          [
            new Date(s.completedAt).toISOString(),
            w.dayCode ?? '',
            w.id,
            s.exerciseId,
            e?.nameRu ?? '',
            s.setIndex + 1,
            s.weight ?? '',
            e?.weightMode ?? '',
            s.reps ?? '',
            s.durationSec ?? '',
            s.rir ?? '',
          ]
            .map(csvCell)
            .join(','),
        );
      }
    }
    return lines.join('\n') + '\n';
  }

  function weekReportText(userId: number, from: number, tz: number): string {
    const ws = allWorkouts(userId, from).filter((w) => w.sets.length);
    const ex = Object.fromEntries(exerciseModes(userId));
    // Порядок упражнений как в программе
    const order = new Map<string, number>();
    try {
      getActiveProgram(userId).days.forEach((d, di) =>
        d.items.forEach((it) => order.set(it.exerciseId, di * 100 + it.position)),
      );
    } catch {
      /* без программы — порядок выполнения */
    }
    return weekReport(ws, ex, tz, (id) => order.get(id) ?? 9999);
  }

  return {
    listExercises,
    getActiveProgram,
    updateProgramItem,
    addProgramItem,
    deleteProgramItem,
    reorderDay,
    patchDay,
    createWorkout,
    getWorkout,
    activeWorkout,
    listWorkouts,
    patchWorkout,
    deleteWorkout,
    workoutSummary,
    workoutByClientId,
    upsertSet,
    patchSet,
    deleteSet,
    deleteSetByClientId,
    lastPerformances,
    exerciseHistory,
    upsertBodyweight,
    listBodyweight,
    exportJson,
    exportCsv,
    weekReportText,
    transaction: <T>(fn: () => T): T => db.transaction(() => fn()),
  };
}
export type Repo = ReturnType<typeof createRepo>;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Схемы входа API (zod). Общие для сервера (валидация) и клиента (типы запросов).
import { z } from 'zod';
import { REP_UNITS } from './types.js';

const id = z.coerce.number().int().positive();
const clientId = z.string().min(8).max(64);
const epochMs = z.number().int().nonnegative();
const kg = z.number().min(0).max(1000);

export const IdParam = z.object({ id });
export const ExerciseIdParam = z.object({ id: z.string().min(1).max(64) });

export const WorkoutCreate = z.object({
  programDayId: z.number().int().positive(),
  clientId: clientId.optional(),
  startedAt: epochMs.optional(),
});
export type WorkoutCreate = z.infer<typeof WorkoutCreate>;

export const WorkoutPatch = z.object({
  finishedAt: epochMs.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  bodyweightKg: z.number().min(20).max(400).nullable().optional(),
});
export type WorkoutPatch = z.infer<typeof WorkoutPatch>;

export const WorkoutListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(30),
  /** started_at (ms) — вернуть тренировки строго раньше, для пагинации */
  before: z.coerce.number().int().positive().optional(),
});

export const SetFields = z.object({
  exerciseId: z.string().min(1).max(64),
  setIndex: z.number().int().min(0).max(50),
  weight: kg.nullable().default(null),
  reps: z.number().int().min(0).max(1000).nullable().default(null),
  durationSec: z.number().int().min(0).max(3600).nullable().default(null),
  rir: z.number().int().min(0).max(10).nullable().default(null),
  completedAt: epochMs.optional(),
});

export const SetUpsert = SetFields.extend({
  clientId,
  workoutId: z.number().int().positive().optional(),
  /** для тренировок, созданных офлайн: ссылка по client_id тренировки */
  workoutClientId: clientId.optional(),
}).refine((v) => v.workoutId != null || v.workoutClientId != null, {
  message: 'workoutId или workoutClientId обязателен',
});
export type SetUpsert = z.input<typeof SetUpsert>;

export const SetPatch = z.object({
  setIndex: z.number().int().min(0).max(50).optional(),
  weight: kg.nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  durationSec: z.number().int().min(0).max(3600).nullable().optional(),
  rir: z.number().int().min(0).max(10).nullable().optional(),
});
export type SetPatch = z.infer<typeof SetPatch>;

export const SyncOp = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('workout.create'),
    clientId,
    programDayId: z.number().int().positive(),
    startedAt: epochMs,
  }),
  z.object({ op: z.literal('workout.update'), clientId, patch: WorkoutPatch }),
  z.object({ op: z.literal('workout.delete'), clientId }),
  z.object({ op: z.literal('set.upsert'), set: SetUpsert }),
  z.object({ op: z.literal('set.delete'), clientId }),
]);
export type SyncOp = z.input<typeof SyncOp>;
export const SyncRequest = z.object({ ops: z.array(SyncOp).max(500) });

export const ProgramItemPatch = z
  .object({
    exerciseId: z.string().min(1).max(64),
    position: z.number().int().min(0).max(100),
    sets: z.number().int().min(1).max(20),
    repMin: z.number().int().min(1).max(1000).nullable(),
    repMax: z.number().int().min(1).max(1000).nullable(),
    unit: z.enum(REP_UNITS),
    supersetGroup: z.number().int().min(1).max(50).nullable(),
    restSec: z.number().int().min(0).max(1800),
    weightStep: z.number().min(0.25).max(50),
  })
  .partial()
  .refine((v) => v.repMin == null || v.repMax == null || v.repMin <= v.repMax, {
    message: 'repMin больше repMax',
  });
export type ProgramItemPatch = z.infer<typeof ProgramItemPatch>;

export const HistoryQuery = z.object({
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
});

export const LastQuery = z.object({
  ids: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.string().max(64)).max(50)),
  /** не учитывать эту тренировку (текущую) */
  exclude: z.coerce.number().int().positive().optional(),
});

export const Bodyweight = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kg: z.number().min(20).max(400),
});
export type Bodyweight = z.infer<typeof Bodyweight>;

export const WeekReportQuery = z.object({
  /** начало периода (ms); по умолчанию последние 7 дней */
  from: z.coerce.number().int().nonnegative().optional(),
  /** смещение часового пояса клиента в минутах (Date.getTimezoneOffset) */
  tz: z.coerce.number().int().min(-840).max(840).default(0),
});

export const DAY_CODES = ['A', 'B', 'C'] as const;
export type DayCode = (typeof DAY_CODES)[number];

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'smith',
  'bodyweight',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/**
 * Как трактовать введённый вес:
 * total — полный вес штанги с грифом; plates_only — только блины (гриф Смита неизвестен);
 * per_dumbbell — вес одной гантели; stack — значение на стеке тренажёра;
 * assisted — противовес гравитрона (меньше = тяжелее); bodyweight — без веса / доп. отягощение.
 */
export const WEIGHT_MODES = [
  'total',
  'plates_only',
  'per_dumbbell',
  'stack',
  'assisted',
  'bodyweight',
] as const;
export type WeightMode = (typeof WEIGHT_MODES)[number];

/** Единица целевого диапазона: повторы или секунды (планка). */
export const REP_UNITS = ['reps', 'sec'] as const;
export type RepUnit = (typeof REP_UNITS)[number];

export const ROLES = ['admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

export interface HealthResponse {
  ok: true;
  version: string;
}

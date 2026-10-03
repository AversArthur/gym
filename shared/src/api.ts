// Формы ответов API. Даты — миллисекунды epoch.
import type { DayCode, Equipment, RepUnit, WeightMode } from './types.js';

export interface Exercise {
  id: string;
  ownerId: number | null;
  nameRu: string;
  nameEn: string | null;
  equipment: Equipment;
  muscle: string | null;
  cues: string[];
  animKey: string | null;
  weightMode: WeightMode;
  archived: boolean;
}

export interface ProgramItem {
  id: number;
  dayId: number;
  exerciseId: string;
  position: number;
  sets: number;
  repMin: number | null;
  repMax: number | null;
  unit: RepUnit;
  supersetGroup: number | null;
  restSec: number;
  weightStep: number;
}

export interface ProgramDay {
  id: number;
  code: DayCode;
  title: string;
  subtitle: string | null;
  position: number;
  items: ProgramItem[];
}

export interface ActiveProgram {
  id: number;
  name: string;
  days: ProgramDay[];
  exercises: Record<string, Exercise>;
}

export interface Workout {
  id: number;
  programDayId: number | null;
  dayCode: DayCode | null;
  clientId: string | null;
  startedAt: number;
  finishedAt: number | null;
  notes: string | null;
  bodyweightKg: number | null;
}

export interface WorkoutSet {
  id: number;
  workoutId: number;
  exerciseId: string;
  setIndex: number;
  weight: number | null;
  reps: number | null;
  durationSec: number | null;
  rir: number | null;
  completedAt: number;
  clientId: string;
}

export interface WorkoutDetail extends Workout {
  sets: WorkoutSet[];
}

export interface WorkoutListItem extends Workout {
  setCount: number;
  tonnage: number;
  exerciseIds: string[];
}

export interface WorkoutRecord {
  exerciseId: string;
  kind: 'weight' | 'e1rm';
  value: number;
  previous: number | null;
}

export interface WorkoutSummary {
  workoutId: number;
  durationSec: number | null;
  tonnage: number;
  setCount: number;
  records: WorkoutRecord[];
}

/** Последняя тренировка с упражнением: по ключу exerciseId */
export interface LastPerformance {
  workoutId: number;
  startedAt: number;
  sets: WorkoutSet[];
}
export type LastMap = Record<string, LastPerformance | null>;

export interface HistoryPoint {
  workoutId: number;
  startedAt: number;
  sets: WorkoutSet[];
  maxWeight: number | null;
  bestE1rm: number | null;
  tonnage: number;
  totalReps: number;
}

export interface BodyweightEntry {
  date: string;
  kg: number;
}

export type SyncResult = { ok: true; id?: number } | { ok: false; error: string };

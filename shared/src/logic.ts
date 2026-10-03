// Чистая логика тренировок. Общая для сервера и клиента (клиенту нужна офлайн).
import type { Exercise, ProgramItem, WorkoutSet } from './api.js';
import type { DayCode, WeightMode } from './types.js';

type SetLike = Pick<WorkoutSet, 'weight' | 'reps' | 'durationSec' | 'setIndex'>;

/** Расчётный 1ПМ по Эпли: w × (1 + reps/30). При 1 повторе — сам вес. */
export function e1rm(weight: number | null, reps: number | null): number | null {
  if (weight == null || reps == null || weight <= 0 || reps <= 0) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Режимы, где вес — это нагрузка (для гравитрона и веса тела вес не нагрузка). */
export const isLoadMode = (m: WeightMode) => m !== 'assisted' && m !== 'bodyweight';

/** Тоннаж подхода. Гантели считаются парой (вес вводится на одну гантель). */
export function setTonnage(s: SetLike, mode: WeightMode): number {
  if (!isLoadMode(mode) || s.weight == null || s.reps == null) return 0;
  return s.weight * s.reps * (mode === 'per_dumbbell' ? 2 : 1);
}

export function tonnage(
  sets: (SetLike & { exerciseId: string })[],
  modeOf: (exerciseId: string) => WeightMode | undefined,
): number {
  return sets.reduce((sum, s) => sum + setTonnage(s, modeOf(s.exerciseId) ?? 'total'), 0);
}

export interface Progression {
  /** предлагаемый вес */
  weight: number;
  /** изменение относительно прошлого раза (для гравитрона отрицательное) */
  delta: number;
}

/**
 * «Пора прибавить»: если в прошлый раз во всех запланированных подходах достигнут верх диапазона.
 * Для гравитрона прогресс — уменьшение противовеса.
 */
export function suggestProgression(
  item: Pick<ProgramItem, 'sets' | 'repMax' | 'unit' | 'weightStep'>,
  mode: WeightMode,
  lastSets: SetLike[],
): Progression | null {
  if (item.repMax == null || item.unit !== 'reps' || mode === 'bodyweight') return null;
  const sets = [...lastSets].sort((a, b) => a.setIndex - b.setIndex).slice(0, item.sets);
  if (sets.length < item.sets) return null;
  if (!sets.every((s) => s.reps != null && s.reps >= item.repMax!)) return null;
  const weights = sets.map((s) => s.weight).filter((w): w is number => w != null);
  if (!weights.length) return null;
  if (mode === 'assisted') {
    const base = Math.min(...weights);
    if (base <= 0) return null;
    const weight = Math.max(0, roundKg(base - item.weightStep));
    return { weight, delta: roundKg(weight - base) };
  }
  const base = Math.max(...weights);
  return { weight: roundKg(base + item.weightStep), delta: item.weightStep };
}

export const roundKg = (n: number) => Math.round(n * 100) / 100;

/** 42.5 → «42,5», 40 → «40» */
export function formatKg(n: number | null | undefined): string {
  if (n == null) return '—';
  return String(roundKg(n)).replace('.', ',');
}

/** Разбор ввода веса: принимает «37,5», «37.5», пробелы. null, если не число. */
export function parseKg(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? roundKg(n) : null;
}

/** Строка «в прошлый раз»: «40 кг · 10 / 9 / 8 / 8» или «40×10 / 42,5×8», если вес менялся. */
export function describeSets(
  sets: SetLike[],
  unit: 'reps' | 'sec' = 'reps',
  withWeight = true,
): string {
  const sorted = [...sets].sort((a, b) => a.setIndex - b.setIndex);
  if (!sorted.length) return '';
  const amount = (s: SetLike) =>
    unit === 'sec' ? `${s.durationSec ?? s.reps ?? 0} с` : `${s.reps ?? 0}`;
  const weights = new Set(sorted.map((s) => s.weight ?? 0));
  if (!withWeight || (weights.size === 1 && (sorted[0]!.weight ?? 0) === 0)) {
    return sorted.map(amount).join(' / ');
  }
  if (weights.size === 1)
    return `${formatKg(sorted[0]!.weight)} кг · ${sorted.map(amount).join(' / ')}`;
  return sorted.map((s) => `${formatKg(s.weight)}×${amount(s)}`).join(' / ');
}

/** Следующий день по ротации A → B → C → A. */
export function nextDayCode(
  last: DayCode | null | undefined,
  codes: readonly DayCode[],
): DayCode | undefined {
  if (!codes.length) return undefined;
  if (!last) return codes[0];
  const i = codes.indexOf(last);
  return codes[(i + 1) % codes.length];
}

export interface ReportWorkout {
  startedAt: number;
  dayCode: DayCode | null;
  sets: (SetLike & { exerciseId: string })[];
}

/**
 * Отчёт для тренера: «03.10 A: Смит 40×10,9,8,8; Жим 60×10,10,9,8».
 * Подходы с одинаковым весом подряд схлопываются: «40×10,9 45×8».
 * tzOffsetMin — Date.getTimezoneOffset() клиента, чтобы дата совпала с местной.
 */
export function weekReport(
  workouts: ReportWorkout[],
  exercises: Record<string, Pick<Exercise, 'nameRu' | 'weightMode'>>,
  tzOffsetMin = 0,
  order?: (exerciseId: string) => number,
): string {
  const lines = [...workouts]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((w) => {
      const d = new Date(w.startedAt - tzOffsetMin * 60_000);
      const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`;
      const byEx = new Map<string, SetLike[]>();
      for (const s of w.sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
      const ids = [...byEx.keys()];
      if (order) ids.sort((a, b) => order(a) - order(b));
      const parts = ids.map((exId) => {
        const ex = exercises[exId];
        const sets = byEx.get(exId)!.sort((a, b) => a.setIndex - b.setIndex);
        const name = ex?.nameRu ?? exId;
        const noWeight = ex && !isLoadMode(ex.weightMode) && sets.every((s) => !s.weight);
        const groups: { w: number | null; reps: string[] }[] = [];
        for (const s of sets) {
          const r =
            s.durationSec != null && s.reps == null ? `${s.durationSec}с` : `${s.reps ?? 0}`;
          const last = groups[groups.length - 1];
          if (last && last.w === s.weight) last.reps.push(r);
          else groups.push({ w: s.weight, reps: [r] });
        }
        const body = groups
          .map((g) =>
            noWeight || g.w == null ? g.reps.join(',') : `${formatKg(g.w)}×${g.reps.join(',')}`,
          )
          .join(' ');
        return `${name} ${body}`;
      });
      return `${date}${w.dayCode ? ' ' + w.dayCode : ''}: ${parts.join('; ')}`;
    });
  return lines.join('\n');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Уникальный id для client_id. randomUUID есть только в secure context (https/localhost). */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

import { describe, expect, it } from 'vitest';
import {
  describeSets,
  e1rm,
  formatKg,
  nextDayCode,
  parseKg,
  setTonnage,
  suggestProgression,
  uuid,
  weekReport,
} from '@gym/shared';

const s = (
  setIndex: number,
  weight: number | null,
  reps: number | null,
  durationSec: number | null = null,
) => ({
  setIndex,
  weight,
  reps,
  durationSec,
});

describe('1ПМ (Эпли)', () => {
  it('w × (1 + reps/30)', () => {
    expect(e1rm(100, 10)).toBeCloseTo(133.333, 2);
    expect(e1rm(60, 5)).toBeCloseTo(70, 5);
  });
  it('1 повтор = сам вес; пустые и нулевые значения — null', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(0, 10)).toBeNull();
    expect(e1rm(50, 0)).toBeNull();
    expect(e1rm(null, 5)).toBeNull();
  });
});

describe('подсказка прогрессии', () => {
  const item = { sets: 4, repMax: 10, unit: 'reps' as const, weightStep: 5 };

  it('все подходы на верхней границе → +шаг', () => {
    expect(
      suggestProgression(item, 'total', [s(0, 60, 10), s(1, 60, 10), s(2, 60, 11), s(3, 60, 10)]),
    ).toEqual({
      weight: 65,
      delta: 5,
    });
  });
  it('хотя бы один подход ниже границы → нет подсказки', () => {
    expect(
      suggestProgression(item, 'total', [s(0, 60, 10), s(1, 60, 10), s(2, 60, 9), s(3, 60, 10)]),
    ).toBeNull();
  });
  it('сделано меньше подходов, чем в программе → нет подсказки', () => {
    expect(
      suggestProgression(item, 'total', [s(0, 60, 10), s(1, 60, 10), s(2, 60, 10)]),
    ).toBeNull();
  });
  it('лишние подходы сверх программы не мешают', () => {
    const sets = [s(0, 60, 10), s(1, 60, 10), s(2, 60, 10), s(3, 60, 10), s(4, 60, 6)];
    expect(suggestProgression(item, 'total', sets)?.weight).toBe(65);
  });
  it('от максимального веса прошлого раза; шаг гантелей 2 кг', () => {
    const db = { ...item, sets: 3, repMax: 12, weightStep: 2 };
    expect(
      suggestProgression(db, 'per_dumbbell', [s(0, 14, 12), s(1, 16, 12), s(2, 16, 12)])?.weight,
    ).toBe(18);
  });
  it('«макс», планка и вес тела — без подсказки', () => {
    expect(suggestProgression({ ...item, repMax: null }, 'assisted', [s(0, 20, 8)])).toBeNull();
    expect(
      suggestProgression({ ...item, sets: 1, unit: 'sec' }, 'bodyweight', [s(0, 0, 60)]),
    ).toBeNull();
    expect(suggestProgression({ ...item, sets: 1 }, 'bodyweight', [s(0, 0, 15)])).toBeNull();
  });
  it('гравитрон: прогресс — меньше противовеса', () => {
    expect(
      suggestProgression({ ...item, sets: 2, weightStep: 2.5 }, 'assisted', [
        s(0, 20, 10),
        s(1, 20, 10),
      ]),
    ).toEqual({
      weight: 17.5,
      delta: -2.5,
    });
  });
});

describe('форматирование и ввод', () => {
  it('вес с запятой', () => {
    expect(formatKg(42.5)).toBe('42,5');
    expect(formatKg(40)).toBe('40');
    expect(parseKg('37,5')).toBe(37.5);
    expect(parseKg(' 13 ')).toBe(13);
    expect(parseKg('abc')).toBeNull();
    expect(parseKg('-5')).toBeNull();
  });
  it('строка «в прошлый раз»', () => {
    expect(describeSets([s(1, 40, 9), s(0, 40, 10), s(2, 40, 8), s(3, 40, 8)])).toBe(
      '40 кг · 10 / 9 / 8 / 8',
    );
    expect(describeSets([s(0, 40, 10), s(1, 42.5, 8)])).toBe('40×10 / 42,5×8');
    expect(describeSets([s(0, null, 12), s(1, null, 10)])).toBe('12 / 10');
    expect(describeSets([s(0, null, null, 45), s(1, null, null, 40)], 'sec')).toBe('45 с / 40 с');
  });
  it('тоннаж: гантели парой, гравитрон и вес тела не считаются', () => {
    expect(setTonnage(s(0, 60, 10), 'total')).toBe(600);
    expect(setTonnage(s(0, 16, 10), 'per_dumbbell')).toBe(320);
    expect(setTonnage(s(0, 20, 10), 'assisted')).toBe(0);
    expect(setTonnage(s(0, 0, 15), 'bodyweight')).toBe(0);
  });
});

describe('ротация дней', () => {
  it('A → B → C → A, без истории — A', () => {
    const codes = ['A', 'B', 'C'] as const;
    expect(nextDayCode(null, codes)).toBe('A');
    expect(nextDayCode('A', codes)).toBe('B');
    expect(nextDayCode('C', codes)).toBe('A');
  });
});

describe('отчёт за неделю', () => {
  it('формат для тренера, одинаковый вес схлопывается', () => {
    const ex = {
      squat: { nameRu: 'Смит', weightMode: 'plates_only' as const },
      bench: { nameRu: 'Жим', weightMode: 'total' as const },
      plank: { nameRu: 'Планка', weightMode: 'bodyweight' as const },
    };
    const d = Date.UTC(2026, 9, 3, 10);
    const text = weekReport(
      [
        {
          startedAt: d,
          dayCode: 'A',
          sets: [
            { exerciseId: 'squat', ...s(0, 40, 10) },
            { exerciseId: 'squat', ...s(1, 40, 9) },
            { exerciseId: 'squat', ...s(2, 40, 8) },
            { exerciseId: 'squat', ...s(3, 40, 8) },
            { exerciseId: 'bench', ...s(0, 60, 10) },
            { exerciseId: 'bench', ...s(1, 62.5, 8) },
            { exerciseId: 'plank', ...s(0, null, null, 45) },
          ],
        },
      ],
      ex,
    );
    expect(text).toBe('03.10 A: Смит 40×10,9,8,8; Жим 60×10 62,5×8; Планка 45с');
  });
  it('дата в часовом поясе клиента', () => {
    // 23:30 UTC 2 октября = 02:30 3 октября по Москве (offset -180)
    const t = Date.UTC(2026, 9, 2, 23, 30);
    expect(weekReport([{ startedAt: t, dayCode: 'B', sets: [] }], {}, -180)).toBe('03.10 B: ');
  });
});

it('uuid в формате v4', () => {
  expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// Сверка с прототипом: движок и позы из reference/trenirovki-prototype.html исполняются как есть,
// и каждый кадр каждой анимации должен совпасть с нашим символ в символ.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '@gym/shared';
import { ANIMS } from './anims';
import { frame, phase, stage } from './engine';

interface ProtoEx {
  A: object;
  B: object;
  st?: string;
  noFloor?: 1;
  bk?: (J: unknown) => string;
  fr?: (J: unknown) => string;
}
interface Proto {
  solve: (p: object) => unknown;
  body: (J: unknown, cls?: string) => string;
  lerp: (a: object, b: object, s: number) => object;
  EX: Record<string, ProtoEx>;
}

function loadPrototype(): Proto {
  const html = readFileSync(
    resolve(__dirname, '../../../reference/trenirovki-prototype.html'),
    'utf8',
  );
  const start = html.indexOf('const D=Math.PI/180');
  const end = html.indexOf('const S={get');
  const lerpSrc = html.match(/function lerp\(a,b,s\)\{.*\}/)?.[0];
  if (start < 0 || end < 0 || !lerpSrc) throw new Error('не нашёл движок в прототипе');
  return new Function(
    `${html.slice(start, end)}\n${lerpSrc}\nreturn {solve, body, lerp, EX};`,
  )() as Proto;
}

const proto = loadPrototype();

function protoFrame(id: string, s: number, ghost: boolean): string {
  const e = proto.EX[id]!;
  const Bf = { ...e.A, ...e.B };
  const J = proto.solve(proto.lerp(e.A, Bf, s));
  let out = (e.bk ? e.bk(J) : '') + proto.body(J) + (e.fr ? e.fr(J) : '');
  if (ghost) out = proto.body(proto.solve(e.A), 'ghost') + out;
  return out;
}

const ids = Object.keys(proto.EX);

describe('анимации совпадают с прототипом', () => {
  it('тот же набор из 21 упражнения, что в прототипе и в сиде БД', () => {
    expect(ids).toHaveLength(21);
    expect(Object.keys(ANIMS).sort()).toEqual([...ids].sort());
    expect(SEED_EXERCISES.map((e) => e.id).sort()).toEqual([...ids].sort());
  });

  it.each(ids)('%s: снаряд и пол', (id) => {
    const e = proto.EX[id]!;
    const expected = (e.noFloor ? '' : '<path class="floor" d="M6 151H194"/>') + (e.st ?? '');
    expect(stage(ANIMS[id as keyof typeof ANIMS])).toBe(expected);
  });

  it.each(ids)('%s: кадры движения и статичный кадр', (id) => {
    const def = ANIMS[id as keyof typeof ANIMS];
    for (const s of [0, 0.13, 0.25, 0.5, 0.77, 1]) {
      expect(frame(def, s)).toBe(protoFrame(id, s, false));
    }
    expect(frame(def, 1, true)).toBe(protoFrame(id, 1, true));
  });

  it('плавность как в прототипе: пауза в крайних точках, середина периода = поза B', () => {
    expect(phase(0)).toBe(0);
    expect(phase(1400)).toBe(1);
    expect(phase(2800 * 0.02)).toBe(0);
    expect(phase(700)).toBeCloseTo(0.5, 5);
  });
});

// Движок анимаций, перенесён из reference/trenirovki-prototype.html без изменения геометрии.
// Фигура — палочный человечек, позы задаются углами сегментов; кадр = lerp(A, B, s).
// Функции возвращают SVG-разметку строкой, как в прототипе: так дешевле перерисовывать каждый кадр.

export type Pt = [number, number];

/** Поза сбоку. Либо hip (таз), либо ank (лодыжка, тогда таз считается от ног). */
export interface SidePose {
  front?: undefined;
  hip?: Pt;
  ank?: Pt;
  th: number;
  sh: number;
  t: number;
  ua: number;
  fa: number;
  ft?: number;
}

/** Поза анфас: симметричные руки и ноги. */
export interface FrontPose {
  front: 1;
  hip: Pt;
  th: number;
  sh: number;
  ua: number;
  fa: number;
}

export interface SideJoints {
  front?: undefined;
  hip: Pt;
  kn: Pt;
  an: Pt;
  toe: Pt;
  sh: Pt;
  hd: Pt;
  el: Pt;
  ha: Pt;
  /** направление голени, нужно для груза на ногах (сгибание ног) */
  sd: Pt;
}

type Side = 'R' | 'L';
type FrontLimbs = {
  [K in `${'hip' | 'sh' | 'kn' | 'an' | 'toe' | 'el' | 'ha'}${Side}`]: Pt;
};
export interface FrontJoints extends FrontLimbs {
  front: true;
  c: number;
  hy: number;
  sy: number;
  hd: Pt;
}

type Props<J> = (J: J) => string;

interface AnimBase {
  /** статичный снаряд (скамья, стойка, блок) */
  st?: string;
  noFloor?: 1;
}
export interface SideAnim extends AnimBase {
  A: SidePose;
  B: Partial<SidePose>;
  /** то, что рисуется за фигурой (трос) */
  bk?: Props<SideJoints>;
  /** то, что рисуется перед фигурой (гриф, гантель, рукоять) */
  fr?: Props<SideJoints>;
}
export interface FrontAnim extends AnimBase {
  A: FrontPose;
  B: Partial<FrontPose>;
  bk?: Props<FrontJoints>;
  fr?: Props<FrontJoints>;
}
export type AnimDef = SideAnim | FrontAnim;

const D = Math.PI / 180;
const L = { th: 34, sh: 34, t: 44, ua: 26, fa: 24, nk: 13 };
const dir = (a: number): Pt => [Math.sin(a * D), Math.cos(a * D)];
const upv = (t: number): Pt => [Math.sin(t * D), -Math.cos(t * D)];
export const add = (p: Pt, v: Pt, k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];
export const f = (n: number) => n.toFixed(1);
export const P = (a: Pt) => f(a[0]) + ' ' + f(a[1]);

export function solve(p: SidePose): SideJoints;
export function solve(p: FrontPose): FrontJoints;
export function solve(p: SidePose | FrontPose): SideJoints | FrontJoints;
export function solve(p: SidePose | FrontPose): SideJoints | FrontJoints {
  if (p.front) return solveFront(p);
  let hip = p.hip as Pt;
  if (p.ank) {
    const a = dir(p.th),
      b = dir(p.sh);
    hip = [p.ank[0] - a[0] * L.th - b[0] * L.sh, p.ank[1] - a[1] * L.th - b[1] * L.sh];
  }
  const kn = add(hip, dir(p.th), L.th),
    an = add(kn, dir(p.sh), L.sh);
  const ft = p.ft != null ? p.ft : p.ank ? 90 : p.sh + 90;
  const toe = add(an, dir(ft), 11);
  const sh = add(hip, upv(p.t), L.t),
    hd = add(sh, upv(p.t), L.nk);
  const el = add(sh, dir(p.ua), L.ua),
    ha = add(el, dir(p.fa), L.fa);
  return { hip, kn, an, toe, sh, hd, el, ha, sd: dir(p.sh) };
}

export function solveFront(p: FrontPose): FrontJoints {
  const c = p.hip[0],
    hy = p.hip[1],
    sy = hy - L.t;
  const J = { front: true, c, hy, sy, hd: [c, sy - L.nk] } as FrontJoints;
  (
    [
      [1, 'R'],
      [-1, 'L'],
    ] as const
  ).forEach(([s, k]) => {
    const hip: Pt = [c + 7 * s, hy],
      sh: Pt = [c + 12 * s, sy];
    const m = (a: number): Pt => [s * Math.sin(a * D), Math.cos(a * D)];
    const kn = add(hip, m(p.th), L.th),
      an = add(kn, m(p.sh), L.sh);
    const el = add(sh, m(p.ua), L.ua),
      ha = add(el, m(p.fa), L.fa);
    J[`hip${k}`] = hip;
    J[`sh${k}`] = sh;
    J[`kn${k}`] = kn;
    J[`an${k}`] = an;
    J[`toe${k}`] = [an[0] + 7 * s, an[1] + 1];
    J[`el${k}`] = el;
    J[`ha${k}`] = ha;
  });
  return J;
}

export function body(J: SideJoints | FrontJoints, cls?: string): string {
  const g = cls ? ` class="${cls}"` : '';
  if (J.front) {
    return (
      `<g${g}><path class="limb" d="M${P(J.hipR)}L${P(J.knR)}L${P(J.anR)}L${P(J.toeR)}M${P(J.hipL)}L${P(J.knL)}L${P(J.anL)}L${P(J.toeL)}"/>` +
      `<path class="trunk" d="M${P(J.shL)}L${P(J.shR)}L${P(J.hipR)}L${P(J.hipL)}Z"/>` +
      `<path class="limb" d="M${P(J.shR)}L${P(J.elR)}L${P(J.haR)}M${P(J.shL)}L${P(J.elL)}L${P(J.haL)}"/>` +
      `<path class="limb neck" d="M${f(J.c)} ${f(J.sy)}L${P(J.hd)}"/><circle class="head" cx="${f(J.hd[0])}" cy="${f(J.hd[1])}" r="8.5"/></g>`
    );
  }
  return (
    `<g${g}><path class="limb" d="M${P(J.hip)}L${P(J.kn)}L${P(J.an)}L${P(J.toe)}"/>` +
    `<path class="limb torso" d="M${P(J.hip)}L${P(J.sh)}"/><path class="limb neck" d="M${P(J.sh)}L${P(J.hd)}"/>` +
    `<path class="limb" d="M${P(J.sh)}L${P(J.el)}L${P(J.ha)}"/>` +
    `<circle class="head" cx="${f(J.hd[0])}" cy="${f(J.hd[1])}" r="8.5"/></g>`
  );
}

// Пропсы: снаряды в руках
export const plate = (p: Pt, r = 11) =>
  `<circle class="load" cx="${f(p[0])}" cy="${f(p[1])}" r="${r}"/><circle class="hub" cx="${f(p[0])}" cy="${f(p[1])}" r="2.5"/>`;
export const db = (p: Pt) => `<circle class="load" cx="${f(p[0])}" cy="${f(p[1])}" r="5.5"/>`;
export const grip = (p: Pt) => `<circle class="grip" cx="${f(p[0])}" cy="${f(p[1])}" r="3.4"/>`;
export const cable = (a: Pt, p: Pt) =>
  `<path class="cable" d="M${P(a)}L${P(p)}"/><circle class="pulley" cx="${a[0]}" cy="${a[1]}" r="3.5"/>`;
export const rope = (p: Pt) => `<path class="rope" d="M${P(p)}l-4 9M${P(p)}l4 9"/>`;
export const handle = (p: Pt) =>
  `<rect class="load" x="${f(p[0] - 2.5)}" y="${f(p[1] - 8)}" width="5" height="16" rx="2.5"/>`;

type Pose = SidePose | FrontPose;

export function lerp<T extends Pose>(a: T, b: T, s: number): T {
  const o: Record<string, unknown> = {};
  for (const k in a) {
    const x = a[k] as unknown,
      y = b[k] as unknown;
    o[k] = Array.isArray(x)
      ? [x[0] + ((y as Pt)[0] - x[0]) * s, x[1] + ((y as Pt)[1] - x[1]) * s]
      : typeof x === 'number'
        ? x + ((y as number) - x) * s
        : x;
  }
  return o as T;
}

/** Плавность прототипа: туда-обратно за период, с паузами в крайних точках, smoothstep. */
export const PERIOD_MS = 2800;
export function phase(now: number): number {
  const p = (now % PERIOD_MS) / PERIOD_MS,
    tri = p < 0.5 ? p * 2 : 2 - p * 2,
    x = Math.min(1, Math.max(0, (tri - 0.08) / 0.84));
  return x * x * (3 - 2 * x);
}

/** Кадр анимации в момент s∈[0,1]. ghost=true добавляет полупрозрачную позу A (для reduced motion). */
export function frame(e: AnimDef, s: number, ghost = false): string {
  // Поза B в описании частичная: недостающее берём из A
  const Bf = { ...e.A, ...e.B } as Pose;
  const J = solve(lerp<Pose>(e.A, Bf, s));
  const fr = e.fr as Props<SideJoints | FrontJoints> | undefined;
  const bk = e.bk as Props<SideJoints | FrontJoints> | undefined;
  let out = (bk ? bk(J) : '') + body(J) + (fr ? fr(J) : '');
  if (ghost) out = body(solve(e.A), 'ghost') + out;
  return out;
}

/** Статичная часть SVG: пол и снаряд. */
export function stage(e: AnimDef): string {
  return (e.noFloor ? '' : '<path class="floor" d="M6 151H194"/>') + (e.st ?? '');
}

// Позы A/B, снаряды и пропсы 21 упражнения из reference/trenirovki-prototype.html (объект EX).
// Названия и подсказки по технике живут в БД (shared/src/seed.ts), здесь только геометрия.
// Ключ = exercises.anim_key.

import {
  add,
  cable,
  db,
  f,
  grip,
  handle,
  P,
  plate,
  rope,
  type AnimDef,
  type FrontAnim,
  type SideAnim,
} from './engine';

const side = (a: SideAnim) => a;
const front = (a: FrontAnim) => a;

export const ANIMS = {
  squat: side({
    A: { ank: [95, 150], th: 0, sh: 0, t: 4, ua: -35, fa: 150 },
    B: { th: 80, sh: -30, t: 40, ua: -10, fa: 175 },
    fr: (J) => plate([J.sh[0] - 3, J.sh[1] - 2], 12),
  }),
  bench: side({
    A: { hip: [122, 104], t: -90, th: 75, sh: -2, ua: 180, fa: 180 },
    B: { ua: 25, fa: 182 },
    st: '<rect class="pad" x="50" y="108" width="84" height="7" rx="3"/><path class="eq" d="M62 115V150M122 115V150"/>',
    fr: (J) => plate(J.ha),
  }),
  pulldown: side({
    A: { hip: [92, 112], t: -6, th: 90, sh: 0, ua: 178, fa: 180 },
    B: { t: -14, ua: -20, fa: 168 },
    st: '<path class="eq" d="M150 150V4H88"/><rect class="pad" x="70" y="116" width="44" height="6" rx="3"/><path class="eq" d="M92 122V150"/><rect class="pad" x="116" y="100" width="18" height="6" rx="3"/>',
    bk: (J) => cable([88, 4], J.ha),
    fr: (J) => grip(J.ha),
  }),
  dbpress: side({
    A: { hip: [95, 114], t: 0, th: 90, sh: 0, ua: 40, fa: 182 },
    B: { ua: 176, fa: 178 },
    st: '<rect class="pad" x="79" y="58" width="6" height="62" rx="3"/><rect class="pad" x="72" y="118" width="42" height="6" rx="3"/><path class="eq" d="M93 124V150"/>',
    fr: (J) => db(J.ha),
  }),
  curl: side({
    A: { ank: [100, 150], th: 0, sh: 0, t: 0, ua: 4, fa: 5 },
    B: { ua: 2, fa: 155 },
    fr: (J) => plate(J.ha, 9),
  }),
  pushdown: side({
    A: { ank: [95, 150], th: 5, sh: -5, t: 12, ua: 8, fa: 125 },
    B: { fa: 5 },
    st: '<path class="eq" d="M152 150V8"/>',
    bk: (J) => cable([150, 8], J.ha),
    fr: (J) => grip(J.ha),
  }),
  plank: side({
    A: { hip: [95, 128], t: 78, th: -78, sh: -78, ua: 0, fa: 90, ft: 30 },
    B: { hip: [95, 129.5] },
    st: '<rect class="pad" x="14" y="150" width="172" height="3"/>',
  }),
  rdl: side({
    A: { ank: [90, 150], th: 0, sh: 0, t: 0, ua: 0, fa: 0 },
    B: { th: 42, sh: -14, t: 60, ua: -12, fa: -12 },
    fr: (J) => plate(J.ha),
  }),
  incline: side({
    A: { hip: [112, 116], t: -55, th: 82, sh: 0, ua: 40, fa: 165 },
    B: { ua: 150, fa: 148 },
    st: '<path class="padline" d="M115 125L64 90"/><path class="padline" d="M104 124H136"/><path class="eq" d="M120 128V150"/>',
    fr: (J) => db(J.ha),
  }),
  bentrow: side({
    A: { ank: [85, 150], th: 30, sh: -12, t: 65, ua: -8, fa: -8 },
    B: { ua: -80, fa: 0 },
    fr: (J) => plate(J.ha),
  }),
  legcurl: side({
    A: { hip: [118, 108], t: -90, th: 90, sh: 90, ua: 15, fa: -80, ft: 0 },
    B: { sh: 205, ft: 115 },
    st: '<rect class="pad" x="54" y="113" width="110" height="7" rx="3"/><path class="eq" d="M66 120V150M150 120V150"/>',
    fr: (J) => {
      const d = J.sd;
      return `<circle class="load" cx="${f(J.an[0] + 7 * d[1])}" cy="${f(J.an[1] - 7 * d[0])}" r="5"/>`;
    },
  }),
  lateral: front({
    A: { front: 1, hip: [100, 82], th: 3, sh: 3, ua: 10, fa: 10 },
    B: { ua: 86, fa: 82 },
    fr: (J) => db(J.haR) + db(J.haL),
  }),
  legraise: side({
    A: { hip: [100, 99], t: 0, th: 15, sh: -40, ua: 180, fa: 180 },
    B: { th: 100, sh: 60 },
    st: '<path class="eq" d="M66 5H134"/>',
    noFloor: 1,
  }),
  legpress: side({
    A: { hip: [66, 112], t: -62, th: 135, sh: 135, ua: 20, fa: 70, ft: 225 },
    B: { th: 170, sh: 100 },
    st: '<path class="eq" d="M96 128L170 54"/><path class="padline" d="M63 117L24 97"/><path class="eq" d="M62 122V150M40 150H92"/>',
    fr: (J) => {
      const c = add(J.an, [0.707, -0.707], 4.5),
        a = add(c, [-0.707, -0.707], 18),
        b = add(c, [0.707, 0.707], 10);
      return `<path class="rope" style="stroke-width:5" d="M${P(a)}L${P(b)}"/>`;
    },
  }),
  pullup: front({
    A: { front: 1, hip: [100, 116.8], th: 2, sh: -6, ua: 152, fa: 155 },
    B: { hip: [100, 75.7], ua: 40, fa: 170 },
    st: '<path class="eq" d="M48 28H152"/>',
    noFloor: 1,
  }),
  chestpress: side({
    A: { hip: [88, 114], t: -8, th: 90, sh: 0, ua: -55, fa: 90 },
    B: { ua: 88, fa: 88 },
    st: '<path class="padline" d="M79 114L73 66"/><rect class="pad" x="66" y="118" width="44" height="6" rx="3"/><path class="eq" d="M86 124V150"/>',
    fr: (J) => handle(J.ha),
  }),
  cablerow: side({
    A: { hip: [70, 124], t: 25, th: 82, sh: 98, ua: 95, fa: 95 },
    B: { t: 0, ua: -45, fa: 90 },
    st: '<path class="eq" d="M162 100V150M143 110V142"/><rect class="pad" x="46" y="128" width="50" height="6" rx="3"/><path class="eq" d="M70 134V150"/>',
    bk: (J) => cable([162, 100], J.ha),
    fr: (J) => grip(J.ha),
  }),
  facepull: side({
    A: { ank: [85, 150], th: 5, sh: -5, t: -6, ua: 92, fa: 90 },
    B: { t: -8, ua: -95, fa: 132 },
    st: '<path class="eq" d="M178 150V30"/>',
    bk: (J) => cable([178, 30], J.ha),
    fr: (J) => rope(J.ha),
  }),
  hammer: side({
    A: { ank: [100, 150], th: 0, sh: 0, t: 0, ua: 4, fa: 5 },
    B: { ua: 2, fa: 155 },
    fr: (J) => db(J.ha),
  }),
  ropepush: side({
    A: { ank: [95, 150], th: 5, sh: -5, t: 12, ua: 8, fa: 125 },
    B: { fa: 5 },
    st: '<path class="eq" d="M152 150V8"/>',
    bk: (J) => cable([150, 8], J.ha),
    fr: (J) => rope(J.ha),
  }),
  calf: side({
    A: { ank: [100, 150], th: 0, sh: 0, t: 0, ua: 0, fa: 0, ft: 90 },
    B: { ank: [100, 141], ft: 52 },
    fr: (J) => db(J.ha),
  }),
} satisfies Record<string, AnimDef>;

export type AnimKey = keyof typeof ANIMS;

export const getAnim = (key: string | null | undefined): AnimDef | undefined =>
  key && key in ANIMS ? ANIMS[key as AnimKey] : undefined;

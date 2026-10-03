// Один requestAnimationFrame на все фигуры на странице (как в прототипе).
// Фигуры вне экрана не перерисовываются; при prefers-reduced-motion рисуется статичный кадр.

import { frame, phase, type AnimDef } from './engine';

interface Fig {
  g: SVGGElement;
  def: AnimDef;
  visible: boolean;
}

const figs = new Set<Fig>();
const bySvg = new Map<Element, Fig>();
let raf = 0;

const motionQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
let reduce = motionQuery?.matches ?? false;

function drawStatic(o: Fig) {
  o.g.innerHTML = frame(o.def, 1, true);
}

function tick(now: number) {
  raf = 0;
  const s = phase(now);
  let any = false;
  for (const o of figs) {
    if (!o.visible) continue;
    o.g.innerHTML = frame(o.def, s);
    any = true;
  }
  if (any) raf = requestAnimationFrame(tick);
}

function kick() {
  if (!reduce && !raf) raf = requestAnimationFrame(tick);
}

motionQuery?.addEventListener('change', (e) => {
  reduce = e.matches;
  if (reduce) {
    cancelAnimationFrame(raf);
    raf = 0;
    figs.forEach(drawStatic);
  } else kick();
});

const io =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const en of entries) {
          const o = bySvg.get(en.target);
          if (o) o.visible = en.isIntersecting;
        }
        kick();
      })
    : undefined;

/** Подписывает <g> на анимацию. Возвращает функцию отписки. */
export function register(g: SVGGElement, def: AnimDef): () => void {
  const o: Fig = { g, def, visible: !io };
  figs.add(o);
  // Первый кадр сразу, чтобы фигура была видна до старта цикла
  if (reduce) drawStatic(o);
  else g.innerHTML = frame(def, 0);
  const svg = g.ownerSVGElement;
  if (io && svg) {
    bySvg.set(svg, o);
    io.observe(svg);
  } else o.visible = true;
  kick();
  return () => {
    figs.delete(o);
    if (io && svg) {
      bySvg.delete(svg);
      io.unobserve(svg);
    }
  };
}

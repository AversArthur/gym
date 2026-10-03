// Однорядный линейный график на uPlot: линия 2px, точки r=4 с кольцом цвета фона,
// волосяная сетка, перекрестие с подписью значения. Один ряд — без легенды, ряд называет заголовок.
import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatKg } from '@gym/shared';

interface Props {
  title: string;
  unit: string;
  /** x — миллисекунды */
  xs: number[];
  ys: (number | null)[];
  height?: number;
  format?: (v: number) => string;
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

// Цвета берём с самого графика, чтобы обёртка могла переопределить --day
function css(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Перерисовка при смене темы системы или data-theme */
function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const bump = () => setV((x) => x + 1);
    mq.addEventListener('change', bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-day'] });
    return () => {
      mq.removeEventListener('change', bump);
      mo.disconnect();
    };
  }, []);
  return v;
}

export function LineChart({ title, unit, xs, ys, height = 170, format = formatKg }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const theme = useThemeVersion();
  const lastIdx = (() => {
    for (let i = ys.length - 1; i >= 0; i--) if (ys[i] != null) return i;
    return -1;
  })();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? lastIdx;

  useEffect(() => {
    const el = box.current;
    if (!el || xs.length === 0) return;
    const color = css(el, '--day'),
      line = css(el, '--line'),
      muted = css(el, '--muted'),
      surface = css(el, '--surface');
    const font = `11px ${css(el, '--font-m') || 'monospace'}`;
    const axis: uPlot.Axis = {
      stroke: muted,
      font,
      grid: { stroke: line, width: 1 },
      ticks: { show: false },
    };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      legend: { show: false },
      padding: [12, 12, 0, 0],
      cursor: {
        points: { size: 10, width: 2, stroke: surface, fill: color },
        drag: { x: false, y: false },
        y: false,
      },
      scales: { x: { time: false } },
      axes: [
        {
          ...axis,
          grid: { show: false },
          values: (_u, vals) => vals.map((v) => dayFmt.format(v)),
          space: 60,
        },
        { ...axis, values: (_u, vals) => vals.map((v) => format(v)), size: 48, space: 32 },
      ],
      series: [
        {},
        {
          stroke: color,
          width: 2,
          spanGaps: true,
          // Заливка — тот же цвет на 10%; canvas не понимает color-mix, поэтому альфа в hex
          fill: /^#[0-9a-f]{6}$/i.test(color) ? `${color}1a` : undefined,
          points: { show: true, size: 8, width: 2, stroke: surface, fill: color },
        },
      ],
      hooks: {
        setCursor: [(u) => setHover(u.cursor.idx ?? null)],
      },
    };
    const plot = new uPlot(opts, [xs, ys], el);
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [xs, ys, height, format, theme]);

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        {shown >= 0 && ys[shown] != null && (
          <span className="chart-value mono">
            {format(ys[shown]!)} {unit}
            <span className="muted"> · {dayFmt.format(xs[shown]!)}</span>
          </span>
        )}
      </figcaption>
      {xs.length === 0 ? (
        <p className="muted small chart-empty">Нет данных за период</p>
      ) : (
        <div ref={box} className="chart-plot" />
      )}
    </figure>
  );
}

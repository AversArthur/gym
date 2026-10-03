import { formatKg } from '@gym/shared';

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** 12340 → «12 340 кг» */
export const formatTonnage = (kg: number) => `${nf.format(Math.round(kg))} кг`;

/** секунды → «1:05:09» / «12:04» */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(r).padStart(2, '0')}`;
}

/** секунды → «1 ч 05 мин» / «48 мин» */
export function formatDuration(totalSec: number | null): string {
  if (totalSec == null) return '—';
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин`;
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const weekdayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

/** «3 октября, пт» */
export const formatDate = (ms: number) => `${dateFmt.format(ms)}, ${weekdayFmt.format(ms)}`;
export const formatShortDate = (ms: number) => shortFmt.format(ms);

/** Диапазон повторов: «6–10», «10», «макс», «30–45 с» */
export function formatRange(
  repMin: number | null,
  repMax: number | null,
  unit: 'reps' | 'sec',
): string {
  const r =
    repMin == null && repMax == null
      ? 'макс'
      : repMin === repMax || repMax == null
        ? `${repMin ?? repMax}`
        : `${repMin ?? ''}–${repMax}`;
  return unit === 'sec' ? `${r} с` : r;
}

export { formatKg };

/** Локальная дата YYYY-MM-DD */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

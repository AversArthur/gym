import type { ProgramItem } from '@gym/shared';
import { formatClock } from './format';

/** Подряд идущие упражнения с одним superset_group — один блок. */
export function blocksOf<T extends Pick<ProgramItem, 'supersetGroup'>>(items: T[]): T[][] {
  const out: T[][] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && it.supersetGroup != null && prev[0]!.supersetGroup === it.supersetGroup)
      prev.push(it);
    else out.push([it]);
  }
  return out;
}

/** «Отдых 2 мин», «Отдых 90 с после пары» — по отдыху после последнего упражнения блока. */
export function restText(block: Pick<ProgramItem, 'restSec'>[]): string {
  const sec = block[block.length - 1]!.restSec;
  if (!sec) return '';
  const t =
    sec >= 120 && sec % 60 === 0 ? `${sec / 60} мин` : sec > 90 ? formatClock(sec) : `${sec} с`;
  return block.length > 1 ? `Отдых ${t} после пары` : `Отдых ${t}`;
}

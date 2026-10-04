import type { ActiveProgram, LastMap } from '@gym/shared';
import { cachedGet } from './offline/cachedGet';

// Программа меняется редко: одна загрузка на сессию (с офлайн-копией), сброс после редактирования.
let cached: Promise<ActiveProgram> | null = null;

export function loadProgram(): Promise<ActiveProgram> {
  if (!cached) {
    cached = cachedGet<ActiveProgram>('/api/program/active', 'program');
    cached.catch(() => (cached = null));
  }
  return cached;
}

export function invalidateProgram() {
  cached = null;
}

/** «Прошлый раз» по всем упражнениям программы. Кэшируется, чтобы офлайн-старт тоже показывал историю. */
export async function loadLastAll(p: ActiveProgram): Promise<LastMap> {
  const ids = [...new Set(p.days.flatMap((d) => d.items.map((i) => i.exerciseId)))];
  if (!ids.length) return {};
  return cachedGet<LastMap>(`/api/exercises/last?ids=${ids.join(',')}`, 'last-all').catch(
    () => ({}),
  );
}

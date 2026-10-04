// Очередь записей. Каждая операция сначала ложится в IndexedDB, потом уходит пачкой в /api/sync.
// Сервер делает upsert по client_id, поэтому повторная отправка безопасна.
import { useSyncExternalStore } from 'react';
import type { SyncOp, SyncResult } from '@gym/shared';
import { authRequired } from '../api';
import { idb, localWorkouts } from './idb';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'auth' | 'error';
interface Status {
  pending: number;
  state: SyncState;
  /** последняя ошибка, из-за которой операцию пришлось выбросить */
  dropped?: string;
}

let status: Status = { pending: 0, state: 'idle' };
const subs = new Set<() => void>();
const set = (s: Partial<Status>) => {
  status = { ...status, ...s };
  subs.forEach((f) => f());
};

/** Ошибки, при которых повтор бессмыслен: операция выбрасывается. */
const FATAL = new Set([
  'validation',
  'not_found',
  'unknown_exercise',
  'client_id_conflict',
  'invalid_range',
]);
const MAX_ATTEMPTS = 8;
const BATCH = 200;

async function count() {
  return (await idb()).count('outbox');
}

export async function enqueue(op: SyncOp) {
  await (await idb()).add('outbox', { op, attempts: 0, createdAt: Date.now() });
  set({ pending: await count() });
  void flush();
}

let running: Promise<void> | null = null;

export function flush(): Promise<void> {
  running ??= doFlush().finally(() => (running = null));
  return running;
}

async function doFlush() {
  const db = await idb();
  for (;;) {
    const entries = (await db.getAll('outbox')).slice(0, BATCH);
    if (!entries.length) {
      set({ pending: 0, state: 'idle' });
      await cleanupLocal();
      return;
    }
    set({ pending: await count(), state: 'syncing' });
    let res: Response;
    try {
      res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops: entries.map((e) => e.op) }),
        credentials: 'same-origin',
      });
    } catch {
      return set({ state: 'offline' });
    }
    if (res.status === 401) {
      authRequired();
      return set({ state: 'auth' });
    }
    if (!res.ok) return set({ state: 'error' });
    const { results } = (await res.json()) as { results: SyncResult[] };
    const tx = db.transaction('outbox', 'readwrite');
    let dropped: string | undefined;
    entries.forEach((e, i) => {
      const r = results[i];
      if (!r) return;
      if (r.ok || FATAL.has(r.error) || e.attempts + 1 >= MAX_ATTEMPTS) {
        if (!r.ok) dropped = `${e.op.op}: ${r.error}`;
        void tx.store.delete(e.seq!);
      } else void tx.store.put({ ...e, attempts: e.attempts + 1 });
    });
    await tx.done;
    if (dropped) {
      console.warn('sync: операция отброшена', dropped);
      set({ dropped });
    }
    // Если всё, что осталось, — повторяемые ошибки, не крутимся вхолостую
    if (results.some((r) => !r.ok && !FATAL.has(r.error))) {
      set({ pending: await count(), state: 'error' });
      return;
    }
  }
}

/** Завершённые тренировки, у которых не осталось неотправленных операций, больше не нужны локально. */
async function cleanupLocal() {
  for (const w of await localWorkouts.all()) {
    if (w.finishedAt != null && Date.now() - w.finishedAt > 10 * 60_000)
      await localWorkouts.delete(w.clientId);
  }
}

// Триггеры: появление сети, возврат во вкладку, периодический повтор
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush());
  document.addEventListener(
    'visibilitychange',
    () => document.visibilityState === 'visible' && void flush(),
  );
  setInterval(() => status.pending > 0 && void flush(), 20_000);
  void count().then((n) => {
    set({ pending: n });
    if (n) void flush();
  });
}

export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => status,
  );
}

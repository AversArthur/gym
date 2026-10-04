// IndexedDB приложения: очередь операций, локальные тренировки, кэш чтения.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LastMap, SyncOp, WorkoutSet } from '@gym/shared';

export interface LocalWorkout {
  clientId: string;
  /** id на сервере, если уже известен */
  serverId?: number;
  programDayId: number | null;
  dayCode: 'A' | 'B' | 'C' | null;
  startedAt: number;
  finishedAt: number | null;
  notes: string | null;
  sets: WorkoutSet[];
  /** «прошлый раз», снятый на старте тренировки — работает без сети */
  last: LastMap;
}

export interface OutboxEntry {
  seq?: number;
  op: SyncOp;
  attempts: number;
  createdAt: number;
}

interface Schema extends DBSchema {
  outbox: { key: number; value: OutboxEntry };
  workouts: { key: string; value: LocalWorkout };
  cache: { key: string; value: { key: string; value: unknown; at: number } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function idb() {
  dbp ??= openDB<Schema>('gym-log', 1, {
    upgrade(db) {
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      db.createObjectStore('workouts', { keyPath: 'clientId' });
      db.createObjectStore('cache', { keyPath: 'key' });
    },
  });
  return dbp;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  return (await (await idb()).get('cache', key))?.value as T | undefined;
}
export async function cachePut(key: string, value: unknown) {
  await (await idb()).put('cache', { key, value, at: Date.now() });
}

export const localWorkouts = {
  async get(clientId: string) {
    return (await idb()).get('workouts', clientId);
  },
  async put(w: LocalWorkout) {
    await (await idb()).put('workouts', w);
  },
  async delete(clientId: string) {
    await (await idb()).delete('workouts', clientId);
  },
  async all() {
    return (await idb()).getAll('workouts');
  },
};

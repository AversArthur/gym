import { idb } from './idb';

/** Стереть локальные данные прошлого пользователя: кэш, тренировки, очередь, кэш service worker. */
export async function resetLocalData() {
  const db = await idb();
  await Promise.all([db.clear('cache'), db.clear('workouts'), db.clear('outbox')]);
  try {
    await caches.delete('api');
  } catch {
    /* нет Cache API */
  }
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('workout-ui:') || k === 'rest-timer' || k.startsWith('progress-'))
        localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

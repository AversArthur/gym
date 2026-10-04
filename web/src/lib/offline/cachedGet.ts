import { ApiError, get } from '../api';
import { cacheGet, cachePut } from './idb';

/** GET с запасным вариантом: при успехе кладёт ответ в IndexedDB, без сети отдаёт сохранённый. */
export async function cachedGet<T>(url: string, key = url): Promise<T> {
  try {
    const data = await get<T>(url);
    void cachePut(key, data);
    return data;
  } catch (e) {
    if (e instanceof ApiError && e.status !== 0) throw e;
    const cached = await cacheGet<T>(key);
    if (cached !== undefined) return cached;
    throw e;
  }
}

// Тонкая обёртка над fetch для /api. В фазе 8 запись пойдёт через офлайн-очередь.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.status === 401 && !url.startsWith('/api/login')) authRequired();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message);
  return data as T;
}

export const get = <T>(url: string) => api<T>('GET', url);

/** Сессия кончилась — приложение показывает экран входа. */
export function authRequired() {
  window.dispatchEvent(new Event('auth-required'));
}

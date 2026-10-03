// localStorage с защитой от исключений (приватный режим, переполнение).
export const store = {
  get<T>(key: string): T | null {
    try {
      const v = localStorage.getItem(key);
      return v == null ? null : (JSON.parse(v) as T);
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

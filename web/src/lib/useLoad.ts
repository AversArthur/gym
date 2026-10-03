import { useEffect, useState } from 'react';

/** Загрузка данных с перезапуском при смене deps; reload() перезагружает, не сбрасывая показанные данные. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error }>({});
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    fn().then(
      (data) => alive && setState({ data }),
      (error: Error) => alive && setState((s) => ({ ...s, error })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

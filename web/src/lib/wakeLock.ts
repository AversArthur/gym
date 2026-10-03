import { useEffect } from 'react';

/** Не даёт экрану гаснуть, пока active. Перезапрашивает блокировку после возврата во вкладку. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || lock) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => (lock = null));
        if (cancelled) void lock.release();
      } catch {
        /* нет https или отказ системы — просто без блокировки */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [active]);
}

import { useEffect } from 'react';

/** Красит акценты страницы в цвет дня (A красный, B синий, C зелёный), как в прототипе. */
export function useDayColor(code: string | null | undefined) {
  useEffect(() => {
    if (!code) return;
    document.body.dataset.day = code;
    return () => {
      delete document.body.dataset.day;
    };
  }, [code]);
}

import { restTimer, useRestTimer } from '../lib/timer';
import { formatClock } from '../lib/format';

/** Плашка таймера отдыха поверх экрана, над нижним меню. */
export function RestTimerBar() {
  const t = useRestTimer();
  if (!t) return null;
  const done = t.doneAt != null;
  const progress = done ? 1 : 1 - t.left / t.total;
  return (
    <div
      className={`restbar${done ? ' done' : ''}`}
      role="timer"
      aria-live={done ? 'assertive' : 'off'}
    >
      <div className="restbar-fill" style={{ transform: `scaleX(${progress})` }} />
      <div className="restbar-body">
        <div className="restbar-text">
          <span className="restbar-label">{done ? 'Отдых окончен' : `Отдых · ${t.label}`}</span>
          <span className="restbar-time mono">{done ? 'Вперёд!' : formatClock(t.left)}</span>
        </div>
        {!done && (
          <>
            <button type="button" onClick={() => restTimer.add(-15)} aria-label="Минус 15 секунд">
              −15
            </button>
            <button type="button" onClick={() => restTimer.add(15)} aria-label="Плюс 15 секунд">
              +15
            </button>
          </>
        )}
        <button type="button" onClick={() => restTimer.stop()} aria-label="Закрыть таймер">
          ✕
        </button>
      </div>
    </div>
  );
}

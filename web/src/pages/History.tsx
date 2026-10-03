import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import type { WorkoutListItem } from '@gym/shared';
import { get } from '../lib/api';
import { formatDate, formatDuration, formatTonnage } from '../lib/format';

const PAGE = 30;
const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

export function HistoryPage() {
  const [items, setItems] = useState<WorkoutListItem[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();

  const load = (before?: number) =>
    get<WorkoutListItem[]>(`/api/workouts?limit=${PAGE}${before ? `&before=${before}` : ''}`).then(
      (page) => {
        setItems((cur) => (before ? [...cur, ...page] : page));
        setDone(page.length < PAGE);
      },
      (e: Error) => setError(e.message),
    );

  useEffect(() => {
    void load();
  }, []);

  if (error) return <p>Ошибка: {error}</p>;

  // Группы по месяцам: [«октябрь 2026», тренировки]
  const groups: [string, WorkoutListItem[]][] = [];
  for (const w of items) {
    const m = monthFmt.format(w.startedAt);
    const g = groups[groups.length - 1];
    if (g && g[0] === m) g[1].push(w);
    else groups.push([m, [w]]);
  }

  return (
    <section>
      <h1 className="page-title">История</h1>
      {items.length === 0 && done && <div className="card muted">Тренировок пока нет.</div>}
      <div className="hist-list">
        {groups.map(([m, ws]) => [
          <h2 className="hist-month" key={m}>
            {m}
          </h2>,
          ...ws.map((w) => {
            const dur = w.finishedAt ? (w.finishedAt - w.startedAt) / 1000 : null;
            return (
              <Link key={w.id} href={`/history/${w.id}`} className="hist-item">
                <span className={`day-pill sm day-${w.dayCode ?? 'A'}`}>{w.dayCode ?? '·'}</span>
                <span className="hist-main">
                  <b>{formatDate(w.startedAt)}</b>
                  <span className="muted small">
                    {w.finishedAt ? formatDuration(dur) : 'не завершена'} · {w.exerciseIds.length}{' '}
                    упр. · {w.setCount} подх.
                  </span>
                </span>
                <span className="mono hist-ton">{formatTonnage(w.tonnage)}</span>
              </Link>
            );
          }),
        ])}
      </div>
      {!done && items.length > 0 && (
        <button
          type="button"
          className="btn wide"
          style={{ marginTop: 12 }}
          onClick={() => load(items[items.length - 1]!.startedAt)}
        >
          Показать ещё
        </button>
      )}
    </section>
  );
}

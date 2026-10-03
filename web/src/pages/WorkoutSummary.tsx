import { Link, useParams } from 'wouter';
import { formatKg, type ActiveProgram, type WorkoutDetail, type WorkoutSummary } from '@gym/shared';
import { get } from '../lib/api';
import { formatDate, formatDuration, formatTonnage } from '../lib/format';
import { loadProgram } from '../lib/program';
import { useDayColor } from '../lib/useDayColor';
import { useLoad } from '../lib/useLoad';

export function WorkoutSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useLoad(
    () =>
      Promise.all([
        get<WorkoutSummary>(`/api/workouts/${id}/summary`),
        get<WorkoutDetail>(`/api/workouts/${id}`),
        loadProgram(),
      ]) as Promise<[WorkoutSummary, WorkoutDetail, ActiveProgram]>,
    [id],
  );
  useDayColor(data?.[1].dayCode);
  if (error) return <p>Ошибка: {error.message}</p>;
  if (!data) return <p className="muted">Загрузка…</p>;
  const [sum, w, program] = data;
  const name = (exId: string) => program.exercises[exId]?.nameRu ?? exId;

  return (
    <section>
      <h1 className="page-title">Готово 💪</h1>
      <p className="muted">
        {formatDate(w.startedAt)}
        {w.dayCode && ` · день ${w.dayCode}`}
      </p>
      <div className="stats">
        <div>
          <b className="mono">{formatDuration(sum.durationSec)}</b>
          <span>время</span>
        </div>
        <div>
          <b className="mono">{formatTonnage(sum.tonnage)}</b>
          <span>тоннаж</span>
        </div>
        <div>
          <b className="mono">{sum.setCount}</b>
          <span>подходов</span>
        </div>
      </div>
      {sum.records.length > 0 && (
        <div className="card">
          <h2 className="card-title">Рекорды</h2>
          <ul className="records">
            {sum.records.map((r) => (
              <li key={r.exerciseId + r.kind}>
                <span>{name(r.exerciseId)}</span>
                <span className="mono">
                  {r.kind === 'weight' ? 'вес' : '1ПМ'} {formatKg(r.value)} кг
                  {r.previous != null && (
                    <span className="muted"> (было {formatKg(r.previous)})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {w.notes && (
        <div className="card">
          <p className="muted">{w.notes}</p>
        </div>
      )}
      <div className="workout-foot">
        <Link href="/" className="btn primary wide">
          На главную
        </Link>
        <Link href={`/history/${w.id}`} className="link">
          Подробности и правка подходов
        </Link>
      </div>
    </section>
  );
}

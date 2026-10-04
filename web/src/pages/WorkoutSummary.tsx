import { Link, useParams } from 'wouter';
import {
  formatKg,
  tonnage,
  type ActiveProgram,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@gym/shared';
import { localWorkouts } from '../lib/offline/idb';
import { flush } from '../lib/offline/outbox';
import { get } from '../lib/api';
import { formatDate, formatDuration, formatTonnage } from '../lib/format';
import { loadProgram } from '../lib/program';
import { useDayColor } from '../lib/useDayColor';
import { useLoad } from '../lib/useLoad';

interface Loaded {
  sum: WorkoutSummary;
  startedAt: number;
  dayCode: string | null;
  notes: string | null;
  serverId: number | null;
  program: ActiveProgram;
  /** итог посчитан на телефоне без сервера (нет рекордов) */
  offline: boolean;
}

async function loadSummary(clientId: string): Promise<Loaded> {
  const program = await loadProgram();
  await flush().catch(() => {});
  try {
    const w = await get<WorkoutDetail>(`/api/workouts/by-client/${clientId}`);
    const sum = await get<WorkoutSummary>(`/api/workouts/${w.id}/summary`);
    return {
      sum,
      startedAt: w.startedAt,
      dayCode: w.dayCode,
      notes: w.notes,
      serverId: w.id,
      program,
      offline: false,
    };
  } catch (e) {
    const local = await localWorkouts.get(clientId);
    if (!local) throw e;
    const sum: WorkoutSummary = {
      workoutId: -1,
      durationSec: local.finishedAt
        ? Math.round((local.finishedAt - local.startedAt) / 1000)
        : null,
      tonnage: tonnage(local.sets, (id) => program.exercises[id]?.weightMode),
      setCount: local.sets.length,
      records: [],
    };
    return {
      sum,
      startedAt: local.startedAt,
      dayCode: local.dayCode,
      notes: local.notes,
      serverId: null,
      program,
      offline: true,
    };
  }
}

export function WorkoutSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useLoad(() => loadSummary(id), [id]);
  useDayColor(data?.dayCode);
  if (error) return <p>Ошибка: {error.message}</p>;
  if (!data) return <p className="muted">Загрузка…</p>;
  const { sum, program } = data;
  const w = { startedAt: data.startedAt, dayCode: data.dayCode, notes: data.notes };
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
      {data.offline && (
        <p className="muted small">
          Нет связи: итог посчитан на телефоне. Рекорды появятся после синхронизации.
        </p>
      )}
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
        {data.serverId && (
          <Link href={`/history/${data.serverId}`} className="link">
            Подробности и правка подходов
          </Link>
        )}
      </div>
    </section>
  );
}

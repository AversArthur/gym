import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import {
  formatKg,
  parseKg,
  tonnage,
  type ActiveProgram,
  type WorkoutDetail,
  type WorkoutSet,
} from '@gym/shared';
import { api, get } from '../lib/api';
import { formatDate, formatDuration, formatTonnage } from '../lib/format';
import { loadProgram } from '../lib/program';
import { useDayColor } from '../lib/useDayColor';
import { useLoad } from '../lib/useLoad';

/** Подробности тренировки: правка и удаление подходов задним числом. */
export function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { data, error, reload } = useLoad(
    () =>
      Promise.all([get<WorkoutDetail>(`/api/workouts/${id}`), loadProgram()]) as Promise<
        [WorkoutDetail, ActiveProgram]
      >,
    [id],
  );
  useDayColor(data?.[0].dayCode);
  if (error) return <p>Ошибка: {error.message}</p>;
  if (!data) return <p className="muted">Загрузка…</p>;
  const [w, program] = data;
  const ex = program.exercises;
  const byEx = new Map<string, WorkoutSet[]>();
  for (const s of w.sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);

  async function remove() {
    if (!confirm('Удалить тренировку целиком?')) return;
    await api('DELETE', `/api/workouts/${w.id}`);
    navigate('/history');
  }

  return (
    <section>
      <Link href="/history" className="link small">
        ← История
      </Link>
      <h1 className="page-title" style={{ marginTop: 6 }}>
        {formatDate(w.startedAt)}
      </h1>
      <p className="muted">
        {w.dayCode && `День ${w.dayCode} · `}
        {w.finishedAt ? formatDuration((w.finishedAt - w.startedAt) / 1000) : 'не завершена'} ·{' '}
        {formatTonnage(tonnage(w.sets, (eid) => ex[eid]?.weightMode))}
        {w.bodyweightKg != null && ` · вес тела ${formatKg(w.bodyweightKg)} кг`}
      </p>
      {!w.finishedAt && (
        <Link href={`/workout/${w.id}`} className="btn primary wide" style={{ marginBottom: 12 }}>
          Продолжить тренировку
        </Link>
      )}

      <div className="blocks">
        {[...byEx.entries()].map(([exId, sets]) => (
          <div key={exId} className="card">
            <h2 className="card-title">{ex[exId]?.nameRu ?? exId}</h2>
            <div className="edit-sets">
              {sets
                .sort((a, b) => a.setIndex - b.setIndex)
                .map((s) => (
                  <EditableSet key={s.id} set={s} onChange={reload} />
                ))}
            </div>
          </div>
        ))}
        {w.sets.length === 0 && <div className="card muted">Подходов нет.</div>}
      </div>

      <Notes workout={w} />

      <div className="workout-foot">
        <button type="button" className="link danger" onClick={remove}>
          Удалить тренировку
        </button>
      </div>
    </section>
  );
}

function EditableSet({ set, onChange }: { set: WorkoutSet; onChange: () => void }) {
  const timed = set.reps == null && set.durationSec != null;
  const [weight, setWeight] = useState(set.weight == null ? '' : formatKg(set.weight));
  const [amount, setAmount] = useState(String((timed ? set.durationSec : set.reps) ?? ''));
  const [busy, setBusy] = useState(false);
  const dirty =
    weight !== (set.weight == null ? '' : formatKg(set.weight)) ||
    amount !== String((timed ? set.durationSec : set.reps) ?? '');

  async function save() {
    const a = Number(amount);
    if (!Number.isFinite(a) || a < 0) return;
    setBusy(true);
    await api('PATCH', `/api/sets/${set.id}`, {
      weight: weight.trim() ? parseKg(weight) : null,
      ...(timed ? { durationSec: Math.round(a) } : { reps: Math.round(a) }),
    }).finally(() => setBusy(false));
    onChange();
  }
  async function del() {
    if (!confirm(`Удалить подход ${set.setIndex + 1}?`)) return;
    await api('DELETE', `/api/sets/${set.id}`);
    onChange();
  }

  return (
    <div className="edit-set">
      <span className="mono muted">{set.setIndex + 1}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label="Вес, кг"
        value={weight}
        placeholder="—"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setWeight(e.currentTarget.value)}
      />
      <span className="muted">×</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={timed ? 'Секунды' : 'Повторы'}
        value={amount}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setAmount(e.currentTarget.value)}
      />
      <span className="muted small">{timed ? 'с' : ''}</span>
      {dirty ? (
        <button type="button" className="chip" onClick={save} disabled={busy}>
          Сохранить
        </button>
      ) : (
        <button
          type="button"
          className="chip ghost"
          onClick={del}
          aria-label={`Удалить подход ${set.setIndex + 1}`}
        >
          Удалить
        </button>
      )}
    </div>
  );
}

function Notes({ workout }: { workout: WorkoutDetail }) {
  const [notes, setNotes] = useState(workout.notes ?? '');
  return (
    <div className="card notes">
      <label htmlFor="hnotes">Заметка</label>
      <textarea
        id="hnotes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
        onBlur={() =>
          notes !== (workout.notes ?? '') &&
          void api('PATCH', `/api/workouts/${workout.id}`, { notes })
        }
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import type { ProgramItem } from '@gym/shared';
import { ExerciseCard } from '../components/ExerciseCard';
import { api } from '../lib/api';
import { unlockAudio } from '../lib/feedback';
import { formatClock } from '../lib/format';
import { restTimer } from '../lib/timer';
import { useWakeLock } from '../lib/wakeLock';
import { draftKey, useWorkoutSession } from '../lib/workoutSession';
import { useDayColor } from '../lib/useDayColor';

/** Подряд идущие упражнения с одним superset_group — один блок. */
function blocksOf(items: ProgramItem[]): ProgramItem[][] {
  const out: ProgramItem[][] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && it.supersetGroup != null && prev[0]!.supersetGroup === it.supersetGroup)
      prev.push(it);
    else out.push([it]);
  }
  return out;
}

function restText(block: ProgramItem[]): string {
  const sec = block[block.length - 1]!.restSec;
  if (!sec) return '';
  const t =
    sec >= 120 && sec % 60 === 0 ? `${sec / 60} мин` : sec > 90 ? formatClock(sec) : `${sec} с`;
  return block.length > 1 ? `Отдых ${t} после пары` : `Отдых ${t}`;
}

export function WorkoutPage() {
  const params = useParams<{ id: string }>();
  const workoutId = Number(params.id);
  const [, navigate] = useLocation();
  const s = useWorkoutSession(workoutId);
  const { program, workout, last, ui, setUi } = s;
  const [now, setNow] = useState(() => Date.now());
  const [notes, setNotes] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const active = !!workout && workout.finishedAt == null;
  useWakeLock(active);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const day = program?.days.find((d) => d.id === workout?.programDayId);
  useDayColor(workout?.dayCode ?? day?.code);

  // Упражнения тренировки: из дня программы + те, что записаны, но в программе их уже нет
  const items = useMemo<ProgramItem[]>(() => {
    if (!workout) return [];
    const base = day?.items ?? [];
    const extra = [...new Set(workout.sets.map((x) => x.exerciseId))]
      .filter((id) => !base.some((i) => i.exerciseId === id))
      .map((exerciseId, k) => ({
        id: -1 - k,
        dayId: day?.id ?? 0,
        exerciseId,
        position: 1000 + k,
        sets: 1,
        repMin: null,
        repMax: null,
        unit: 'reps' as const,
        supersetGroup: null,
        restSec: 90,
        weightStep: 2.5,
      }));
    return [...base, ...extra];
  }, [workout, day]);

  if (s.error) {
    return (
      <section>
        <h1 className="page-title">Тренировка</h1>
        <div className="card">
          <p>Не удалось загрузить: {s.error.message}</p>
          <Link href="/">На главную</Link>
        </div>
      </section>
    );
  }
  if (!program || !workout) return <p className="muted">Загрузка…</p>;

  if (workout.finishedAt != null && !finishing) {
    return (
      <section>
        <h1 className="page-title">Тренировка завершена</h1>
        <div className="card">
          <Link href={`/workout/${workout.id}/summary`}>Открыть итог</Link>
        </div>
      </section>
    );
  }

  const unsaved = Object.values(s.status).some((x) => x === 'error' || x === 'saving');

  async function finish() {
    if (unsaved && !confirm('Есть несохранённые подходы. Всё равно завершить?')) return;
    if (!workout!.sets.length && !confirm('Ни одного подхода не записано. Завершить?')) return;
    setFinishing(true);
    try {
      await s.patchWorkout({ finishedAt: Date.now(), ...(notes != null ? { notes } : {}) });
      restTimer.stop();
      s.clearUi();
      navigate(`/workout/${workout!.id}/summary`);
    } catch (e) {
      setFinishing(false);
      alert(`Не удалось завершить: ${(e as Error).message}`);
    }
  }

  async function discard() {
    if (!confirm('Удалить эту тренировку вместе со всеми подходами?')) return;
    await api('DELETE', `/api/workouts/${workout!.id}`);
    restTimer.stop();
    s.clearUi();
    navigate('/');
  }

  const totalPlanned = items.reduce((n, i) => n + i.sets, 0);

  return (
    <section className="workout">
      <header className="workout-head">
        <div>
          <h1 className="page-title">
            {workout.dayCode ? `День ${workout.dayCode}` : 'Тренировка'}
            {day && <span className="sub">{day.title}</span>}
          </h1>
          <p className="muted mono">
            {formatClock((now - workout.startedAt) / 1000)} · {workout.sets.length}/{totalPlanned}{' '}
            подходов
          </p>
        </div>
        <button type="button" className="btn primary" onClick={finish} disabled={finishing}>
          Завершить
        </button>
      </header>

      <div className="blocks">
        {blocksOf(items).map((block) => (
          <section key={block[0]!.id} className={`block${block.length > 1 ? ' super' : ''}`}>
            {block.length > 1 && <div className="tag">Суперсет · подряд без отдыха</div>}
            {block.map((item) => {
              const ex = program.exercises[item.exerciseId];
              if (!ex) return null;
              const sets = workout.sets.filter((x) => x.exerciseId === item.exerciseId);
              return (
                <ExerciseCard
                  key={item.id}
                  item={item}
                  exercise={ex}
                  sets={sets}
                  last={last[item.exerciseId]}
                  drafts={ui.drafts}
                  extra={ui.extra[item.exerciseId] ?? 0}
                  skipped={!!ui.skipped[item.exerciseId]}
                  status={s.status}
                  onDraft={(key, d) => setUi((u) => ({ ...u, drafts: { ...u.drafts, [key]: d } }))}
                  onSave={(setIndex, weight, amount) => {
                    unlockAudio();
                    const isSec = item.unit === 'sec';
                    void s.saveSet({
                      exerciseId: item.exerciseId,
                      setIndex,
                      weight,
                      reps: isSec ? null : amount,
                      durationSec: isSec ? amount : null,
                    });
                    // Черновик больше не нужен: строка покажет сохранённое значение
                    setUi((u) => {
                      const { [draftKey(item.exerciseId, setIndex)]: _, ...drafts } = u.drafts;
                      return { ...u, drafts };
                    });
                    const isNew = !sets.some((x) => x.setIndex === setIndex);
                    if (isNew && item.restSec > 0) restTimer.start(item.restSec, ex.nameRu);
                  }}
                  onAddRow={() =>
                    setUi((u) => ({
                      ...u,
                      extra: { ...u.extra, [item.exerciseId]: (u.extra[item.exerciseId] ?? 0) + 1 },
                    }))
                  }
                  onRemoveRow={() => {
                    const rows = Math.max(
                      item.sets + (ui.extra[item.exerciseId] ?? 0),
                      ...sets.map((x) => x.setIndex + 1),
                    );
                    const lastSaved = sets.find((x) => x.setIndex === rows - 1);
                    if (lastSaved) {
                      if (!confirm(`Удалить записанный подход ${rows}?`)) return;
                      void s.removeSet(lastSaved);
                    }
                    setUi((u) => ({
                      ...u,
                      extra: { ...u.extra, [item.exerciseId]: rows - 1 - item.sets },
                    }));
                  }}
                  onSkip={(skip) =>
                    setUi((u) => ({ ...u, skipped: { ...u.skipped, [item.exerciseId]: skip } }))
                  }
                />
              );
            })}
            {restText(block) && <p className="rest">{restText(block)}</p>}
          </section>
        ))}
      </div>

      <div className="card notes">
        <label htmlFor="notes">Заметка</label>
        <textarea
          id="notes"
          rows={2}
          placeholder="Самочувствие, что поменять…"
          value={notes ?? workout.notes ?? ''}
          onChange={(e) => setNotes(e.currentTarget.value)}
          onBlur={() =>
            notes != null && notes !== (workout.notes ?? '') && void s.patchWorkout({ notes })
          }
        />
      </div>

      <div className="workout-foot">
        <button type="button" className="btn primary wide" onClick={finish} disabled={finishing}>
          Завершить тренировку
        </button>
        <button type="button" className="link danger" onClick={discard}>
          Удалить тренировку
        </button>
      </div>
    </section>
  );
}

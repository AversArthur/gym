import { useMemo, useState, type CSSProperties } from 'react';
import {
  describeSets,
  formatKg,
  isLoadMode,
  type ActiveProgram,
  type BodyweightEntry,
  type Exercise,
  type HistoryPoint,
} from '@gym/shared';
import { LineChart } from '../components/LineChart';
import { get } from '../lib/api';
import { formatShortDate } from '../lib/format';
import { loadProgram } from '../lib/program';
import { store } from '../lib/storage';
import { useDayColor } from '../lib/useDayColor';
import { useLoad } from '../lib/useLoad';

type Period = '4w' | '3m' | 'all';
const PERIODS: [Period, string, number | null][] = [
  ['4w', '4 недели', 28],
  ['3m', '3 месяца', 91],
  ['all', 'Всё время', null],
];
const DAY = 86_400_000;
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const formatInt = (v: number) => nf.format(Math.round(v));

/** Базовые упражнения — с долгим отдыхом (2+ мин): присед, тяга, жим ногами, подтягивания. */
function baseExercises(p: ActiveProgram) {
  return p.days.flatMap((d) =>
    d.items.filter((i) => i.restSec >= 120).map((i) => ({ item: i, day: d.code })),
  );
}

/** Главная метрика упражнения: 1ПМ для весовых, вес помощи для гравитрона, сумма повторов для веса тела. */
function headline(ex: Exercise, p: HistoryPoint): number | null {
  if (ex.weightMode === 'assisted') return p.maxWeight;
  if (!isLoadMode(ex.weightMode)) return p.totalReps;
  return p.bestE1rm;
}
const headlineUnit = (ex: Exercise) =>
  isLoadMode(ex.weightMode) || ex.weightMode === 'assisted' ? 'кг' : 'повт.';

export function ProgressPage() {
  const { data: program } = useLoad(loadProgram, []);
  const [exId, setExId] = useState<string>(() => store.get<string>('progress-ex') ?? 'squat');
  const [period, setPeriod] = useState<Period>(() => store.get<Period>('progress-period') ?? '3m');

  const options = useMemo(
    () =>
      program?.days.map((d) => ({
        code: d.code,
        items: d.items
          .map((i) => program.exercises[i.exerciseId])
          .filter((e): e is Exercise => !!e),
      })) ?? [],
    [program],
  );
  const dayOf = program?.days.find((d) => d.items.some((i) => i.exerciseId === exId))?.code;
  useDayColor(dayOf);

  if (!program) return <p className="muted">Загрузка…</p>;
  const ex = program.exercises[exId] ?? program.exercises.squat!;

  return (
    <section>
      <h1 className="page-title">Прогресс</h1>

      <MonthCompare program={program} onPick={(id) => setExId(id)} />

      <div className="progress-controls">
        <select
          aria-label="Упражнение"
          value={ex.id}
          onChange={(e) => {
            setExId(e.currentTarget.value);
            store.set('progress-ex', e.currentTarget.value);
          }}
        >
          {options.map((g) => (
            <optgroup key={g.code} label={`День ${g.code}`}>
              {g.items.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nameRu}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Период">
          {PERIODS.map(([p, label]) => (
            <button
              key={p}
              aria-pressed={period === p}
              onClick={() => {
                setPeriod(p);
                store.set('progress-period', p);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ExerciseProgress ex={ex} period={period} />

      <h2 className="section-title">Вес тела</h2>
      <BodyweightChart period={period} />
    </section>
  );
}

function ExerciseProgress({ ex, period }: { ex: Exercise; period: Period }) {
  const days = PERIODS.find((p) => p[0] === period)![2];
  const { data, error } = useLoad(() => {
    const from = days ? Date.now() - days * DAY : undefined;
    return get<HistoryPoint[]>(`/api/exercises/${ex.id}/history${from ? `?from=${from}` : ''}`);
  }, [ex.id, days]);
  const [showTable, setShowTable] = useState(false);
  const series = useMemo(() => {
    const pts = data ?? [];
    return {
      xs: pts.map((p) => p.startedAt),
      weight: pts.map((p) => p.maxWeight),
      e1rm: pts.map((p) => p.bestE1rm),
      tonnage: pts.map((p) => p.tonnage),
      reps: pts.map((p) => p.totalReps),
    };
  }, [data]);

  if (error) return <p>Ошибка: {error.message}</p>;
  if (!data) return <p className="muted">Загрузка…</p>;
  if (!data.length)
    return <div className="card muted">По этому упражнению пока нет записей за период.</div>;

  const load = isLoadMode(ex.weightMode);
  const first = data[0]!,
    last = data[data.length - 1]!;
  const h0 = headline(ex, first),
    h1 = headline(ex, last);
  const delta = h0 != null && h1 != null && data.length > 1 ? h1 - h0 : null;
  // Для гравитрона меньше — лучше
  const better = delta == null ? null : ex.weightMode === 'assisted' ? delta < 0 : delta > 0;

  return (
    <>
      <div className="stats">
        <div>
          <b className="mono">
            {h1 != null ? formatKg(h1) : '—'} {headlineUnit(ex)}
          </b>
          <span>
            {load ? 'расчётный 1ПМ' : ex.weightMode === 'assisted' ? 'помощь' : 'повторов'}
          </span>
        </div>
        <div>
          <b className={`mono ${better == null ? '' : better ? 'up' : 'down'}`}>
            {delta == null
              ? '—'
              : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatKg(Math.abs(delta))}`}
          </b>
          <span>за период</span>
        </div>
        <div>
          <b className="mono">{data.length}</b>
          <span>трениров{data.length === 1 ? 'ка' : 'ок'}</span>
        </div>
      </div>

      <div className="charts">
        {ex.weightMode !== 'bodyweight' && (
          <LineChart
            title={
              ex.weightMode === 'assisted' ? 'Противовес (меньше — лучше)' : 'Макс. вес в подходе'
            }
            unit="кг"
            xs={series.xs}
            ys={series.weight}
          />
        )}
        {load && (
          <LineChart title="Расчётный 1ПМ (Эпли)" unit="кг" xs={series.xs} ys={series.e1rm} />
        )}
        {load ? (
          <LineChart
            title="Тоннаж за тренировку"
            unit="кг"
            xs={series.xs}
            ys={series.tonnage}
            format={formatInt}
          />
        ) : (
          <LineChart
            title="Повторов за тренировку"
            unit=""
            xs={series.xs}
            ys={series.reps}
            format={formatInt}
          />
        )}
      </div>

      <button
        type="button"
        className="link small"
        aria-expanded={showTable}
        onClick={() => setShowTable(!showTable)}
      >
        {showTable ? 'Скрыть таблицу' : 'Показать таблицей'}
      </button>
      {showTable && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Подходы</th>
              {load && <th>1ПМ</th>}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((p) => (
              <tr key={p.workoutId}>
                <td className="mono">{formatShortDate(p.startedAt)}</td>
                <td className="mono">
                  {describeSets(
                    p.sets,
                    p.sets.some((s) => s.durationSec != null && s.reps == null) ? 'sec' : 'reps',
                  )}
                </td>
                {load && (
                  <td className="mono">{p.bestE1rm != null ? formatKg(p.bestE1rm) : '—'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** «Месяц назад vs сейчас» по базовым упражнениям. */
function MonthCompare({
  program,
  onPick,
}: {
  program: ActiveProgram;
  onPick: (id: string) => void;
}) {
  const base = baseExercises(program);
  const [today] = useState(() => Date.now());
  const { data } = useLoad(
    () =>
      Promise.all(
        base.map((b) => get<HistoryPoint[]>(`/api/exercises/${b.item.exerciseId}/history`)),
      ),
    [program.id],
  );
  return (
    <div className="card compare">
      <h2 className="card-title">Месяц назад → сейчас</h2>
      {!data ? (
        <p className="muted small">Загрузка…</p>
      ) : (
        <ul>
          {base.map((b, i) => {
            const ex = program.exercises[b.item.exerciseId]!;
            const pts = data[i] ?? [];
            const now = pts[pts.length - 1];
            const monthAgo = [...pts].reverse().find((p) => p.startedAt <= today - 28 * DAY);
            const v1 = now ? headline(ex, now) : null,
              v0 = monthAgo ? headline(ex, monthAgo) : null;
            const d = v0 != null && v1 != null ? v1 - v0 : null;
            const better = d == null ? null : ex.weightMode === 'assisted' ? d < 0 : d > 0;
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  onClick={() => onPick(ex.id)}
                  style={{ '--day': `var(--${b.day.toLowerCase()})` } as CSSProperties}
                >
                  <span className="dot-day" />
                  <span className="cmp-name">{ex.nameRu}</span>
                  <span className="mono cmp-val">
                    {v1 == null ? (
                      <span className="muted">нет данных</span>
                    ) : v0 == null ? (
                      <>
                        {formatKg(v1)} <span className="muted small">(мало истории)</span>
                      </>
                    ) : (
                      <>
                        {formatKg(v0)} → {formatKg(v1)}{' '}
                        <span className={better == null ? '' : better ? 'up' : 'down'}>
                          {d! > 0 ? '+' : d! < 0 ? '−' : '±'}
                          {formatKg(Math.abs(d!))}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">Расчётный 1ПМ, для подтягиваний — вес помощи.</p>
    </div>
  );
}

function BodyweightChart({ period }: { period: Period }) {
  const { data } = useLoad(() => get<BodyweightEntry[]>('/api/bodyweight'), []);
  const days = PERIODS.find((p) => p[0] === period)![2];
  const [now] = useState(() => Date.now());
  const pts = useMemo(() => {
    const from = days ? now - days * DAY : 0;
    return (data ?? [])
      .map((b) => ({ x: new Date(b.date + 'T12:00:00').getTime(), y: b.kg }))
      .filter((p) => p.x >= from);
  }, [data, days, now]);
  const xs = useMemo(() => pts.map((p) => p.x), [pts]);
  const ys = useMemo(() => pts.map((p) => p.y), [pts]);
  if (!data) return null;
  if (!data.length)
    return (
      <div className="card muted small">
        Записывай вес на главном экране — здесь появится график.
      </div>
    );
  return (
    <div className="charts neutral">
      <LineChart title="Вес тела" unit="кг" xs={xs} ys={ys} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  nextDayCode,
  uuid,
  type ActiveProgram,
  type BodyweightEntry,
  type DayCode,
  type Workout,
  type WorkoutDetail,
  type WorkoutListItem,
} from '@gym/shared';
import { api, get } from '../lib/api';
import { formatDate, formatRange, localDate } from '../lib/format';
import { loadProgram } from '../lib/program';
import { useDayColor } from '../lib/useDayColor';
import { useLoad } from '../lib/useLoad';
import { formatKg, parseKg } from '@gym/shared';

// Возврат в незавершённую тренировку — один раз при открытии приложения
let resumeChecked = false;

export function TodayPage() {
  const [, navigate] = useLocation();
  const { data, error } = useLoad(
    () =>
      Promise.all([
        loadProgram(),
        get<WorkoutDetail | null>('/api/workouts/active'),
        get<WorkoutListItem[]>('/api/workouts?limit=1'),
      ]) as Promise<[ActiveProgram, WorkoutDetail | null, WorkoutListItem[]]>,
    [],
  );
  const [picked, setPicked] = useState<DayCode>();
  const [starting, setStarting] = useState(false);

  const [program, active, recent] = data ?? [];
  const lastDone = recent?.find((w) => w.finishedAt != null) ?? recent?.[0];
  const codes = program?.days.map((d) => d.code) ?? [];
  const suggested = nextDayCode(lastDone?.dayCode, codes);
  const code = picked ?? suggested;
  const day = program?.days.find((d) => d.code === code);
  useDayColor(code);

  useEffect(() => {
    if (!resumeChecked && data) {
      resumeChecked = true;
      if (active) navigate(`/workout/${active.id}`, { replace: true });
    }
  }, [data, active, navigate]);

  async function start() {
    if (!day) return;
    setStarting(true);
    try {
      const w = await api<Workout>('POST', '/api/workouts', {
        programDayId: day.id,
        clientId: uuid(),
      });
      navigate(`/workout/${w.id}`);
    } catch (e) {
      setStarting(false);
      alert(`Не удалось начать: ${(e as Error).message}`);
    }
  }

  if (error) return <p>Нет связи с сервером: {error.message}</p>;
  if (!program) return <p className="muted">Загрузка…</p>;

  return (
    <section>
      <h1 className="page-title">Сегодня</h1>

      {active && (
        <Link href={`/workout/${active.id}`} className="card resume">
          <b>Идёт тренировка {active.dayCode}</b>
          <span className="muted">
            начата {formatDate(active.startedAt)} · {active.sets.length} подх. — продолжить →
          </span>
        </Link>
      )}

      <nav className="tabs" role="tablist" aria-label="День тренировки">
        {program.days.map((d) => (
          <button
            key={d.code}
            role="tab"
            className="tab"
            aria-selected={d.code === code}
            style={{ ['--tc' as string]: `var(--${d.code.toLowerCase()})` }}
            onClick={() => setPicked(d.code)}
          >
            <span className="l">
              <span className="dot" />
              {d.code}
              {d.code === suggested && <span className="next">по плану</span>}
            </span>
            <span className="s">{d.title}</span>
          </button>
        ))}
      </nav>

      {day && (
        <div className="card day-preview">
          <p className="muted">{day.subtitle}</p>
          <ol>
            {day.items.map((it) => (
              <li key={it.id} className={it.supersetGroup ? 'ss' : undefined}>
                <span>{program.exercises[it.exerciseId]?.nameRu}</span>
                <span className="mono muted">
                  {it.sets}×{formatRange(it.repMin, it.repMax, it.unit)}
                </span>
              </li>
            ))}
          </ol>
          {lastDone && (
            <p className="muted small">
              Последняя: {formatDate(lastDone.startedAt)}, день {lastDone.dayCode}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn primary wide big"
        onClick={start}
        disabled={starting || !!active}
      >
        {active ? 'Сначала заверши текущую' : `Начать тренировку ${code ?? ''}`}
      </button>

      <BodyweightCard />
    </section>
  );
}

function BodyweightCard() {
  const { data, reload } = useLoad(() => get<BodyweightEntry[]>('/api/bodyweight'), []);
  const today = localDate();
  const todays = data?.find((b) => b.date === today);
  const lastEntry = data?.[data.length - 1];
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  async function save() {
    const kg = parseKg(value);
    if (kg == null || kg < 20) return;
    await api('POST', '/api/bodyweight', { date: today, kg });
    setSaved(true);
    setValue('');
    reload();
  }

  return (
    <div className="card bw">
      <label htmlFor="bw">Вес тела сегодня</label>
      <div className="bw-row">
        <input
          id="bw"
          type="text"
          inputMode="decimal"
          placeholder={todays ? formatKg(todays.kg) : lastEntry ? formatKg(lastEntry.kg) : 'кг'}
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            setSaved(false);
          }}
        />
        <button type="button" className="btn" onClick={save} disabled={parseKg(value) == null}>
          Записать
        </button>
      </div>
      <p className="muted small">
        {saved || todays
          ? `Сегодня: ${formatKg((todays ?? lastEntry)!.kg)} кг`
          : 'Необязательно. График — в «Прогрессе».'}
      </p>
    </div>
  );
}

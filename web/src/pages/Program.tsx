import { useState } from 'react';
import {
  parseKg,
  type ActiveProgram,
  type DayCode,
  type Exercise,
  type ProgramDay,
  type ProgramItem,
  type ProgramItemPatch,
} from '@gym/shared';
import { Stepper } from '../components/Stepper';
import { api } from '../lib/api';
import { formatKg, formatRange } from '../lib/format';
import { invalidateProgram, loadProgram } from '../lib/program';
import { useDayColor } from '../lib/useDayColor';
import { useLoad } from '../lib/useLoad';

const EQUIPMENT_RU: Record<Exercise['equipment'], string> = {
  barbell: 'Штанга',
  dumbbell: 'Гантели',
  cable: 'Блоки',
  machine: 'Тренажёры',
  smith: 'Смит',
  bodyweight: 'Свой вес',
};

/** Шаг веса по умолчанию для нового упражнения: блины 2,5 кг на сторону, гантели через 2 кг. */
const defaultStep = (ex: Exercise) =>
  ex.weightMode === 'per_dumbbell'
    ? 2
    : ex.weightMode === 'total' || ex.weightMode === 'plates_only'
      ? 5
      : 2.5;

function restLabel(sec: number) {
  if (!sec) return 'без отдыха';
  return sec % 60 === 0
    ? `${sec / 60} мин`
    : sec > 60
      ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
      : `${sec} с`;
}

export function ProgramPage() {
  const { data: program, reload } = useLoad(loadProgram, []);
  const [code, setCode] = useState<DayCode>('A');
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useDayColor(code);

  if (!program) return <p className="muted">Загрузка…</p>;
  const day = program.days.find((d) => d.code === code) ?? program.days[0]!;

  /** Любая правка: запрос → сброс кэша программы → перезагрузка. */
  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(`Не сохранилось: ${(e as Error).message}`);
    } finally {
      invalidateProgram();
      reload();
      setBusy(false);
    }
  }

  const items = day.items;
  const move = (i: number, dir: -1 | 1) =>
    mutate(() => {
      const ids = items.map((it) => it.id);
      [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
      return api('PUT', `/api/program/days/${day.id}/order`, { itemIds: ids });
    });

  const toggleSuperset = (i: number) =>
    mutate(async () => {
      const it = items[i]!,
        next = items[i + 1]!;
      const linked = it.supersetGroup != null && it.supersetGroup === next.supersetGroup;
      if (linked) {
        // Разорвать пару: отдых после первого становится как после пары
        await api('PUT', `/api/program/items/${it.id}`, {
          supersetGroup: null,
          restSec: next.restSec,
        });
        await api('PUT', `/api/program/items/${next.id}`, { supersetGroup: null });
      } else {
        const g = Math.max(0, ...items.map((x) => x.supersetGroup ?? 0)) + 1;
        // Подряд без отдыха: у первого 0, отдых — после второго
        await api('PUT', `/api/program/items/${it.id}`, { supersetGroup: g, restSec: 0 });
        await api('PUT', `/api/program/items/${next.id}`, { supersetGroup: g });
      }
    });

  return (
    <section className="program">
      <h1 className="page-title">Программа</h1>
      <p className="muted small">
        Изменения действуют со следующей тренировки. История не меняется.
      </p>

      <nav className="tabs" role="tablist" aria-label="День">
        {program.days.map((d) => (
          <button
            key={d.code}
            role="tab"
            className="tab"
            aria-selected={d.code === day.code}
            style={{ ['--tc' as string]: `var(--${d.code.toLowerCase()})` }}
            onClick={() => {
              setCode(d.code);
              setOpenId(null);
            }}
          >
            <span className="l">
              <span className="dot" />
              {d.code}
            </span>
            <span className="s">{d.title}</span>
          </button>
        ))}
      </nav>

      <DayTitle
        key={day.id}
        day={day}
        onSave={(patch) => mutate(() => api('PATCH', `/api/program/days/${day.id}`, patch))}
      />

      <ol className="prog-items">
        {items.map((it, i) => {
          const ex = program.exercises[it.exerciseId];
          const next = items[i + 1];
          const linkedNext =
            next && it.supersetGroup != null && it.supersetGroup === next.supersetGroup;
          const linkedPrev =
            i > 0 && it.supersetGroup != null && items[i - 1]!.supersetGroup === it.supersetGroup;
          const open = openId === it.id;
          return (
            <li
              key={it.id}
              className={`prog-item${linkedPrev || linkedNext ? ' ss' : ''}${linkedNext ? ' ss-first' : ''}`}
            >
              <button
                type="button"
                className="prog-row"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : it.id)}
              >
                <span className="prog-name">{ex?.nameRu ?? it.exerciseId}</span>
                <span className="prog-dose mono">
                  {it.sets}×{formatRange(it.repMin, it.repMax, it.unit)} · {restLabel(it.restSec)}
                </span>
              </button>
              {open && (
                <ItemEditor
                  item={it}
                  program={program}
                  busy={busy}
                  onSave={(patch) =>
                    mutate(() => api('PUT', `/api/program/items/${it.id}`, patch)).then(() =>
                      setOpenId(null),
                    )
                  }
                  onDelete={() =>
                    confirm(
                      `Убрать «${ex?.nameRu}» из дня ${day.code}? История тренировок сохранится.`,
                    ) && mutate(() => api('DELETE', `/api/program/items/${it.id}`))
                  }
                />
              )}
              <div className="prog-tools">
                <button
                  type="button"
                  className="chip"
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Выше"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="chip"
                  disabled={busy || !next}
                  onClick={() => move(i, 1)}
                  aria-label="Ниже"
                >
                  ↓
                </button>
                {next && (
                  <button
                    type="button"
                    className={`chip${linkedNext ? ' on' : ''}`}
                    disabled={busy}
                    onClick={() => toggleSuperset(i)}
                  >
                    {linkedNext ? 'Разорвать суперсет' : 'Суперсет со следующим'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <AddItem
        program={program}
        busy={busy}
        onAdd={(ex) =>
          mutate(() =>
            api('POST', `/api/program/days/${day.id}/items`, {
              exerciseId: ex.id,
              weightStep: defaultStep(ex),
              ...(ex.id === 'plank' ? { unit: 'sec', repMin: 30, repMax: 45, restSec: 60 } : {}),
            }),
          )
        }
      />
    </section>
  );
}

function DayTitle({
  day,
  onSave,
}: {
  day: ProgramDay;
  onSave: (p: { title?: string; subtitle?: string | null }) => void;
}) {
  const [title, setTitle] = useState(day.title);
  const [subtitle, setSubtitle] = useState(day.subtitle ?? '');
  return (
    <div className="card day-title-edit">
      <label>
        <span className="muted small">Название дня</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onBlur={() => title.trim() && title !== day.title && onSave({ title })}
        />
      </label>
      <label>
        <span className="muted small">Описание</span>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => setSubtitle(e.currentTarget.value)}
          onBlur={() => subtitle !== (day.subtitle ?? '') && onSave({ subtitle: subtitle || null })}
        />
      </label>
    </div>
  );
}

function ItemEditor(p: {
  item: ProgramItem;
  program: ActiveProgram;
  busy: boolean;
  onSave: (patch: ProgramItemPatch) => void;
  onDelete: () => void;
}) {
  const it = p.item;
  const [exerciseId, setExerciseId] = useState(it.exerciseId);
  const [sets, setSets] = useState(String(it.sets));
  const [isMax, setIsMax] = useState(it.repMin == null && it.repMax == null);
  const [repMin, setRepMin] = useState(String(it.repMin ?? ''));
  const [repMax, setRepMax] = useState(String(it.repMax ?? ''));
  const [unit, setUnit] = useState(it.unit);
  const [rest, setRest] = useState(String(it.restSec));
  const [step, setStep] = useState(formatKg(it.weightStep));
  const [err, setErr] = useState<string>();

  const exercises = Object.values(p.program.exercises).filter((e) => !e.archived);
  const groups = Object.entries(EQUIPMENT_RU)
    .map(([eq, label]) => [label, exercises.filter((e) => e.equipment === eq)] as const)
    .filter(([, list]) => list.length);

  function save() {
    const n = (s: string) => (s.trim() ? Number(s) : NaN);
    const patch: ProgramItemPatch = {
      exerciseId,
      sets: n(sets),
      unit,
      restSec: n(rest),
      weightStep: parseKg(step) ?? NaN,
      repMin: isMax ? null : n(repMin),
      repMax: isMax ? null : repMax.trim() ? n(repMax) : n(repMin),
    };
    if (
      ![patch.sets, patch.restSec, patch.weightStep].every(
        (x) => (Number.isFinite(x) && x! > 0) || x === 0,
      )
    )
      return setErr('Проверь подходы, отдых и шаг веса');
    if (
      !isMax &&
      (!Number.isFinite(patch.repMin!) ||
        !Number.isFinite(patch.repMax!) ||
        patch.repMin! > patch.repMax!)
    )
      return setErr('Диапазон: «от» не больше «до»');
    setErr(undefined);
    p.onSave(patch);
  }

  return (
    <div className="item-editor">
      <label className="field">
        <span>Упражнение</span>
        <select value={exerciseId} onChange={(e) => setExerciseId(e.currentTarget.value)}>
          {groups.map(([label, list]) => (
            <optgroup key={label} label={label}>
              {list.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nameRu}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="field-row">
        <div className="field">
          <span>Подходы</span>
          <Stepper value={sets} onChange={setSets} step={1} label="Подходы" />
        </div>
        <div className="field">
          <span>Отдых после, сек</span>
          <Stepper value={rest} onChange={setRest} step={15} label="Отдых, секунды" />
        </div>
      </div>
      <div className="field">
        <span>{unit === 'sec' ? 'Секунды' : 'Повторы'}</span>
        <div className="range-row">
          <div className="seg" role="group" aria-label="Единица">
            <button type="button" aria-pressed={unit === 'reps'} onClick={() => setUnit('reps')}>
              повт.
            </button>
            <button type="button" aria-pressed={unit === 'sec'} onClick={() => setUnit('sec')}>
              сек
            </button>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={isMax}
              onChange={(e) => setIsMax(e.currentTarget.checked)}
            />{' '}
            макс
          </label>
        </div>
        {!isMax && (
          <div className="field-row">
            <Stepper value={repMin} onChange={setRepMin} step={unit === 'sec' ? 5 : 1} label="от" />
            <Stepper value={repMax} onChange={setRepMax} step={unit === 'sec' ? 5 : 1} label="до" />
          </div>
        )}
      </div>
      <div className="field">
        <span>Шаг веса, кг (кнопки −/+ и «пора прибавить»)</span>
        <Stepper value={step} onChange={setStep} step={0.5} decimal label="Шаг веса" />
      </div>
      {err && (
        <p className="small" style={{ color: 'var(--a)' }}>
          {err}
        </p>
      )}
      <div className="item-editor-actions">
        <button type="button" className="btn primary" onClick={save} disabled={p.busy}>
          Сохранить
        </button>
        <span className="spacer" />
        <button type="button" className="link danger" onClick={p.onDelete} disabled={p.busy}>
          Убрать из дня
        </button>
      </div>
    </div>
  );
}

function AddItem({
  program,
  busy,
  onAdd,
}: {
  program: ActiveProgram;
  busy: boolean;
  onAdd: (ex: Exercise) => void;
}) {
  const exercises = Object.values(program.exercises).filter((e) => !e.archived);
  const [id, setId] = useState('');
  const ex = exercises.find((e) => e.id === id);
  return (
    <div className="card add-item">
      <label className="field">
        <span>Добавить упражнение в день</span>
        <select value={id} onChange={(e) => setId(e.currentTarget.value)}>
          <option value="">Выбери…</option>
          {Object.entries(EQUIPMENT_RU).map(([eq, label]) => {
            const list = exercises.filter((e) => e.equipment === eq);
            return list.length ? (
              <optgroup key={eq} label={label}>
                {list.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nameRu}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </label>
      <button
        type="button"
        className="btn wide"
        disabled={!ex || busy}
        onClick={() => {
          if (ex) onAdd(ex);
          setId('');
        }}
      >
        Добавить в конец · 3×10–12
      </button>
    </div>
  );
}

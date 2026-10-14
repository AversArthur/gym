import { useState } from 'react';
import {
  formatKg,
  isLoadMode,
  parseKg,
  suggestProgression,
  type Exercise,
  type LastPerformance,
  type ProgramItem,
  type WeightMode,
  type WorkoutSet,
} from '@gym/shared';
import { ExerciseHead } from './ExerciseHead';
import { draftKey, type Draft, type SetStatus } from '../lib/workoutSession';
import { SetRow, type RowStatus } from './SetRow';

const WEIGHT_LABEL: Record<WeightMode, string> = {
  total: 'кг',
  plates_only: 'блины, кг',
  per_dumbbell: 'кг, 1 гантель',
  stack: 'кг',
  assisted: 'помощь, кг',
  bodyweight: 'доп. кг',
};

interface Props {
  item: ProgramItem;
  exercise: Exercise;
  sets: WorkoutSet[];
  last: LastPerformance | null | undefined;
  drafts: Record<string, Draft>;
  extra: number;
  skipped: boolean;
  status: Record<string, SetStatus>;
  onDraft: (key: string, d: Draft) => void;
  onSave: (setIndex: number, weight: number | null, amount: number) => void;
  onAddRow: () => void;
  onRemoveRow: () => void;
  onSkip: (skip: boolean) => void;
}

export function ExerciseCard(p: Props) {
  const { item, exercise: ex } = p;
  const [invalid, setInvalid] = useState<Record<number, 'weight' | 'amount'>>({});

  const isSec = item.unit === 'sec';
  // Для веса тела поле веса скрыто, пока не нажали «+ вес» или уже не записали вес
  const showWeight =
    ex.weightMode !== 'bodyweight' ||
    p.sets.some((s) => (s.weight ?? 0) > 0) ||
    Object.entries(p.drafts).some(([k, d]) => k.startsWith(ex.id + ':') && d.weight !== undefined);
  const lastSets = p.last?.sets ?? [];
  const progression = suggestProgression(item, ex.weightMode, lastSets);
  const doneCount = p.sets.length;
  const maxSaved = p.sets.reduce((m, s) => Math.max(m, s.setIndex + 1), 0);
  const rows = Math.max(item.sets + p.extra, maxSaved);

  const amountOf = (s: WorkoutSet) => (isSec ? (s.durationSec ?? s.reps) : s.reps);

  /** Значения по умолчанию для строки: сохранённое → прогрессия → прошлый раз → предыдущая строка. */
  function defaults(i: number, prevWeight: string): { weight: string; amount: string } {
    const saved = p.sets.find((s) => s.setIndex === i);
    if (saved)
      return {
        weight: saved.weight == null ? '' : formatKg(saved.weight),
        amount: String(amountOf(saved) ?? ''),
      };
    const lastSet = lastSets.find((s) => s.setIndex === i) ?? lastSets[lastSets.length - 1];
    let weight = prevWeight;
    if (!weight) {
      if (progression) weight = formatKg(progression.weight);
      else if (lastSet?.weight != null) weight = formatKg(lastSet.weight);
    }
    let amount = '';
    if (progression && item.repMin != null) amount = String(item.repMin);
    else if (lastSet && amountOf(lastSet) != null) amount = String(amountOf(lastSet));
    else if (item.repMin != null) amount = String(item.repMin);
    return { weight, amount };
  }

  const rowViews: { i: number; key: string; weight: string; amount: string; status: RowStatus }[] =
    [];
  let prevWeight = '';
  for (let i = 0; i < rows; i++) {
    const key = draftKey(ex.id, i);
    const d = defaults(i, prevWeight);
    const draft = p.drafts[key] ?? {};
    const weight = draft.weight ?? d.weight;
    const amount = draft.amount ?? d.amount;
    prevWeight = weight;
    const saved = p.sets.find((s) => s.setIndex === i);
    let status: RowStatus = 'empty';
    if (saved) {
      const st = p.status[saved.clientId];
      const same =
        (saved.weight == null ? '' : formatKg(saved.weight)) === (showWeight ? weight : '') &&
        String(amountOf(saved) ?? '') === amount;
      status = st ?? (same ? 'saved' : 'dirty');
    }
    rowViews.push({ i, key, weight, amount, status });
  }

  function save(i: number, weight: string, amount: string) {
    const w = showWeight ? parseKg(weight) : null;
    const a = Number(amount);
    if (showWeight && isLoadMode(ex.weightMode) && w == null) return setInvalid({ [i]: 'weight' });
    if (!amount || !Number.isFinite(a) || a <= 0) return setInvalid({ [i]: 'amount' });
    setInvalid({});
    p.onSave(i, w, Math.round(a));
  }

  if (p.skipped) {
    return (
      <article className="ex skipped">
        <div className="ex-skipped-row">
          <h3>{ex.nameRu}</h3>
          <button type="button" className="link" onClick={() => p.onSkip(false)}>
            Вернуть
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="ex">
      <ExerciseHead
        item={item}
        exercise={ex}
        lastSets={lastSets}
        progression={progression}
        doseExtra={
          doneCount > 0 && (
            <span className="done-count">
              {' '}
              · {doneCount}/{rows}
            </span>
          )
        }
      />

      <div className={`setrows${showWeight ? '' : ' no-weight'}`}>
        <div className="setrows-head" aria-hidden>
          {showWeight && <span>{WEIGHT_LABEL[ex.weightMode]}</span>}
          <span>{isSec ? 'секунды' : 'повторы'}</span>
          <span />
        </div>
        {rowViews.map((r) => (
          <SetRow
            key={r.key}
            index={r.i}
            showWeight={showWeight}
            weightLabel={WEIGHT_LABEL[ex.weightMode]}
            weightStep={item.weightStep}
            amountLabel={isSec ? 'секунды' : 'повторы'}
            amountStep={isSec ? 5 : 1}
            weight={r.weight}
            amount={r.amount}
            status={r.status}
            invalid={invalid[r.i]}
            onWeight={(v) => p.onDraft(r.key, { weight: v, amount: r.amount })}
            onAmount={(v) => p.onDraft(r.key, { weight: r.weight, amount: v })}
            onSave={() => save(r.i, r.weight, r.amount)}
          />
        ))}
      </div>

      <div className="ex-actions">
        <button type="button" className="chip" onClick={p.onAddRow}>
          + подход
        </button>
        {rows > 1 && (
          <button type="button" className="chip" onClick={p.onRemoveRow}>
            − подход
          </button>
        )}
        {ex.weightMode === 'bodyweight' && !showWeight && (
          <button
            type="button"
            className="chip"
            onClick={() =>
              p.onDraft(draftKey(ex.id, 0), { weight: '0', amount: rowViews[0]?.amount })
            }
          >
            + вес
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="chip ghost" onClick={() => p.onSkip(true)}>
          Пропустить
        </button>
      </div>
    </article>
  );
}

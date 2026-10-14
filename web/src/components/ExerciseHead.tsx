import { useState, type ReactNode } from 'react';
import {
  describeSets,
  formatKg,
  type Exercise,
  type ProgramItem,
  type WorkoutSet,
  type Progression,
} from '@gym/shared';
import { ExerciseAnim } from '../anim/ExerciseAnim';
import { formatRange } from '../lib/format';

interface Props {
  item: ProgramItem;
  exercise: Exercise;
  lastSets: Pick<WorkoutSet, 'weight' | 'reps' | 'durationSec' | 'setIndex'>[];
  progression: Progression | null;
  /** дописка к дозировке, например «· 2/4» во время тренировки */
  doseExtra?: ReactNode;
  cuesOpenByDefault?: boolean;
}

/** Шапка карточки упражнения: анимация, дозировка, «прошлый раз», «пора прибавить», техника.
 *  Одна и та же в тренировке и в просмотре дня. */
export function ExerciseHead({
  item,
  exercise: ex,
  lastSets,
  progression,
  doseExtra,
  cuesOpenByDefault = false,
}: Props) {
  const [cuesOpen, setCuesOpen] = useState(cuesOpenByDefault);
  return (
    <>
      <div className="ex-head">
        <ExerciseAnim id={ex.animKey} label={ex.nameRu} />
        <div className="ex-info">
          <h3>{ex.nameRu}</h3>
          <p className="dose">
            {item.sets} × {formatRange(item.repMin, item.repMax, item.unit)}
            {doseExtra}
          </p>
          {lastSets.length > 0 && (
            <p className="last">
              <span className="muted">Прошлый раз:</span>{' '}
              <span className="mono">
                {describeSets(lastSets, item.unit, ex.weightMode !== 'bodyweight')}
              </span>
            </p>
          )}
          {progression && (
            <p className="progress-hint">
              Пора {progression.delta > 0 ? 'прибавить' : 'убавить помощь'}:{' '}
              <b>
                {progression.delta > 0 ? '+' : '−'}
                {formatKg(Math.abs(progression.delta))} кг
              </b>{' '}
              → {formatKg(progression.weight)}
            </p>
          )}
          {ex.cues.length > 0 && (
            <button
              type="button"
              className="link cues-toggle"
              aria-expanded={cuesOpen}
              onClick={() => setCuesOpen(!cuesOpen)}
            >
              {cuesOpen ? 'Скрыть технику' : 'Техника'}
            </button>
          )}
        </div>
      </div>
      {cuesOpen && (
        <ul className="cues">
          {ex.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </>
  );
}

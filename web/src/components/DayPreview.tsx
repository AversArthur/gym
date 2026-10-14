import { suggestProgression, type ActiveProgram, type LastMap, type ProgramDay } from '@gym/shared';
import { blocksOf, restText } from '../lib/blocks';
import { ExerciseHead } from './ExerciseHead';

/** День целиком, как на тренировке, но без ввода: анимации, дозировка, прошлый раз, техника, отдых. */
export function DayPreview({
  day,
  program,
  last,
}: {
  day: ProgramDay;
  program: ActiveProgram;
  last: LastMap;
}) {
  return (
    <div className="blocks day-full">
      {blocksOf(day.items).map((block) => (
        <section key={block[0]!.id} className={`block${block.length > 1 ? ' super' : ''}`}>
          {block.length > 1 && <div className="tag">Суперсет · подряд без отдыха</div>}
          {block.map((item) => {
            const ex = program.exercises[item.exerciseId];
            if (!ex) return null;
            const lastSets = last[item.exerciseId]?.sets ?? [];
            return (
              <article key={item.id} className="ex">
                <ExerciseHead
                  item={item}
                  exercise={ex}
                  lastSets={lastSets}
                  progression={suggestProgression(item, ex.weightMode, lastSets)}
                />
              </article>
            );
          })}
          {restText(block) && <p className="rest">{restText(block)}</p>}
        </section>
      ))}
    </div>
  );
}

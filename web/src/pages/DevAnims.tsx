import { useEffect, useState, type CSSProperties } from 'react';
import { SEED_EXERCISES, SEED_PROGRAM } from '@gym/shared';
import { ExerciseAnim } from '../anim/ExerciseAnim';

type Theme = 'auto' | 'light' | 'dark';
const THEMES: [Theme, string][] = [
  ['auto', 'Авто'],
  ['light', 'Светлая'],
  ['dark', 'Тёмная'],
];

const names = new Map(SEED_EXERCISES.map((e) => [e.id, e.nameRu]));

// Витрина для сверки с прототипом: все анимации по дням, переключатель темы.
export function DevAnimsPage() {
  const [theme, setTheme] = useState<Theme>(() => {
    const q = new URLSearchParams(location.search).get('theme');
    return q === 'light' || q === 'dark' ? q : 'auto';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  return (
    <section>
      <h1 className="page-title">Анимации</h1>
      <div className="seg" role="group" aria-label="Тема">
        {THEMES.map(([t, label]) => (
          <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
            {label}
          </button>
        ))}
      </div>
      {SEED_PROGRAM.days.map((d) => (
        <div key={d.code} style={{ '--day': `var(--${d.code.toLowerCase()})` } as CSSProperties}>
          <h2 className="dev-day">
            <span className={`day-dot day-${d.code}`} /> {d.code} · {d.title}
          </h2>
          <div className="dev-grid">
            {d.items.map((it) => (
              <figure key={it.exerciseId} className="dev-cell">
                <ExerciseAnim id={it.exerciseId} label={names.get(it.exerciseId)} />
                <figcaption>
                  {names.get(it.exerciseId)}
                  <span className="mono muted">{it.exerciseId}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
      <h2 className="dev-day">Без анимации (своё упражнение)</h2>
      <div className="dev-grid">
        <figure className="dev-cell">
          <ExerciseAnim id="custom" label="Своё упражнение" />
          <figcaption>Заглушка</figcaption>
        </figure>
      </div>
    </section>
  );
}

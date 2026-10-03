import { useEffect, useRef } from 'react';
import { getAnim } from './anims';
import { stage } from './engine';
import { register } from './loop';
import './anim.css';

interface Props {
  /** exercises.anim_key */
  id: string | null | undefined;
  /** подпись для скринридера, обычно название упражнения */
  label?: string;
  className?: string;
}

export function ExerciseAnim({ id, label, className }: Props) {
  const def = getAnim(id);
  const gRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!def || !gRef.current) return;
    return register(gRef.current, def);
  }, [def]);

  return (
    <div className={`anim${className ? ' ' + className : ''}`}>
      <svg viewBox="0 0 200 160" role="img" aria-label={`Схема: ${label ?? id ?? 'упражнение'}`}>
        {def ? (
          <>
            <g dangerouslySetInnerHTML={{ __html: stage(def) }} />
            <g ref={gRef} data-fig={id} />
          </>
        ) : (
          // Своё упражнение без анимации: нейтральная гантель
          <g className="anim-none">
            <path className="floor" d="M6 151H194" />
            <path className="eq" d="M70 80H130" />
            <rect className="load" x="56" y="62" width="14" height="36" rx="4" />
            <rect className="load" x="130" y="62" width="14" height="36" rx="4" />
          </g>
        )}
      </svg>
    </div>
  );
}

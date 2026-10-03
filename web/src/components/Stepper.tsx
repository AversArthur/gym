import { parseKg } from '@gym/shared';

interface Props {
  value: string;
  onChange: (v: string) => void;
  step: number;
  label: string;
  decimal?: boolean;
  invalid?: boolean;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** [−] поле [+]. Поле всегда редактируется вручную; −/+ шагают от текущего значения. */
export function Stepper({ value, onChange, step, label, decimal, invalid }: Props) {
  const num = parseKg(value);
  const bump = (dir: 1 | -1) => {
    const base = num ?? 0;
    // Шаг идёт от текущего значения, в том числе введённого руками: 37,5 + 5 → 42,5
    onChange(fmt(Math.max(0, base + dir * step)));
  };
  return (
    <div className={`stepper${invalid ? ' invalid' : ''}`}>
      <button
        type="button"
        className="step"
        aria-label={`${label}: минус ${fmt(step)}`}
        onClick={() => bump(-1)}
        disabled={num == null || num <= 0}
      >
        −
      </button>
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        enterKeyHint="done"
        aria-label={label}
        value={value}
        placeholder="—"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.currentTarget.value.replace(/[^\d.,]/g, ''))}
      />
      <button
        type="button"
        className="step"
        aria-label={`${label}: плюс ${fmt(step)}`}
        onClick={() => bump(1)}
      >
        +
      </button>
    </div>
  );
}

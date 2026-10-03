import { Stepper } from './Stepper';

export type RowStatus = 'empty' | 'saved' | 'dirty' | 'saving' | 'error';

interface Props {
  index: number;
  showWeight: boolean;
  weightLabel: string;
  weightStep: number;
  amountLabel: string;
  amountStep: number;
  weight: string;
  amount: string;
  status: RowStatus;
  invalid?: 'weight' | 'amount';
  onWeight: (v: string) => void;
  onAmount: (v: string) => void;
  onSave: () => void;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  empty: 'сохранить',
  saved: 'сохранён',
  dirty: 'изменён, сохранить',
  saving: 'сохраняется',
  error: 'не сохранён, повторить',
};

export function SetRow(p: Props) {
  return (
    <div className={`setrow${p.showWeight ? '' : ' no-weight'}`} data-status={p.status}>
      {p.showWeight && (
        <Stepper
          value={p.weight}
          onChange={p.onWeight}
          step={p.weightStep}
          decimal
          label={`Подход ${p.index + 1}, ${p.weightLabel}`}
          invalid={p.invalid === 'weight'}
        />
      )}
      <Stepper
        value={p.amount}
        onChange={p.onAmount}
        step={p.amountStep}
        label={`Подход ${p.index + 1}, ${p.amountLabel}`}
        invalid={p.invalid === 'amount'}
      />
      <button
        type="button"
        className="setbtn"
        aria-label={`Подход ${p.index + 1}: ${STATUS_LABEL[p.status]}`}
        aria-pressed={p.status === 'saved'}
        onClick={p.onSave}
        disabled={p.status === 'saving'}
      >
        {p.status === 'error' ? '!' : p.status === 'saved' ? '✓' : p.index + 1}
      </button>
    </div>
  );
}

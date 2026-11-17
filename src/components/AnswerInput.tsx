import { Delete } from 'lucide-react';
import type { Question, ResponseValue } from '../lib/types';

export const optionLabel = (q: Pick<Question, 'optionStyle'>, i: number) =>
  q.optionStyle === 'numeric' ? String(i + 1) : String.fromCharCode(65 + i);

interface Props {
  q: Question;
  value: ResponseValue;
  onChange: (v: ResponseValue) => void;
  showOptionText: boolean;
  natLabel?: string;
  compact?: boolean;
}

export function AnswerInput({ q, value, onChange, showOptionText, natLabel = 'Numerical', compact }: Props) {
  if (q.type === 'NAT') return <NumericPad value={typeof value === 'string' ? value : ''} onChange={onChange} label={natLabel} compact={compact} />;

  const selected = Array.isArray(value) ? value : [];
  const multi = q.type === 'MSQ';
  const count = Math.max(q.optionCount, q.options.length, 2);
  const toggle = (i: number) => {
    if (!multi) return onChange([i]);
    const next = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].sort((a, b) => a - b);
    onChange(next);
  };

  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'space-y-2'} role={multi ? 'group' : 'radiogroup'}>
      {Array.from({ length: count }, (_, i) => {
        const on = selected.includes(i);
        return (
          <label
            key={i}
            className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition ${
              on ? 'border-ion-sky bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'
            } ${compact ? 'min-w-16' : ''}`}
          >
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={`q-${q.id}`}
              checked={on}
              onChange={() => toggle(i)}
              className="mt-1 h-4 w-4 accent-ion-sky"
            />
            <span className="font-semibold text-slate-700">({optionLabel(q, i)})</span>
            {showOptionText && q.options[i] && <span className="text-[15px] whitespace-pre-wrap text-slate-800">{q.options[i]}</span>}
          </label>
        );
      })}
    </div>
  );
}

function NumericPad({ value, onChange, label, compact }: { value: string; onChange: (v: string) => void; label: string; compact?: boolean }) {
  const press = (k: string) => {
    if (k === 'back') return onChange(value.slice(0, -1));
    if (k === 'clear') return onChange('');
    if (k === '-') return onChange(value.startsWith('-') ? value.slice(1) : '-' + value);
    if (k === '.' && value.includes('.')) return;
    onChange(value + k);
  };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '-'];
  return (
    <div className={compact ? 'flex items-center gap-3' : 'inline-block'}>
      <div className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">{label} answer</div>
      <input
        value={value}
        inputMode="decimal"
        onChange={(e) => {
          const v = e.target.value;
          if (/^-?\d*\.?\d*$/.test(v)) onChange(v);
        }}
        placeholder="Type your answer"
        className="input w-56 font-mono text-lg"
      />
      {!compact && (
        <div className="mt-2 grid w-56 grid-cols-3 gap-1.5">
          {keys.map((k) => (
            <button key={k} type="button" onClick={() => press(k)} className="rounded border border-slate-300 bg-slate-50 py-2 font-mono hover:bg-slate-100">
              {k}
            </button>
          ))}
          <button type="button" onClick={() => press('back')} className="col-span-2 flex items-center justify-center gap-1 rounded border border-slate-300 bg-slate-50 py-2 text-sm hover:bg-slate-100">
            <Delete size={14} /> Backspace
          </button>
          <button type="button" onClick={() => press('clear')} className="rounded border border-slate-300 bg-slate-50 py-2 text-sm hover:bg-slate-100">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

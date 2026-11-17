import { EXAMS, examGroups } from '../../shared/exams';

export function ExamPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  };
  return (
    <div className="space-y-3">
      {examGroups().map((group) => (
        <div key={group}>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">{group}</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMS.filter((exam) => exam.group === group).map((exam) => {
              const on = value.includes(exam.id);
              return (
                <button
                  key={exam.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(exam.id)}
                  className={`rounded-full border px-2.5 py-1 text-left text-sm ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-300'}`}
                >
                  {exam.label}
                  <span className={on ? 'text-indigo-100' : 'text-slate-400'}> · {exam.format}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

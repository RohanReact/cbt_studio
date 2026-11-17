import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Eye, FileUp, KeyRound, Loader2, Play, Plus, Trash2, Wand2 } from 'lucide-react';
import { newQuestion, uid } from '../lib/build';
import { db } from '../lib/db';
import { applyKey, extractKeyEntries } from '../lib/pdf/answerKey';
import { extractLayouts } from '../lib/pdf/extract';
import { layoutText } from '../lib/pdf/parse';
import { openPdf } from '../lib/pdf/pdfjs';
import { applyPreset, PRESET_LIST, PRESETS, timerGroups } from '../lib/presets';
import type { DisplayMode, Paper, PresetId, Question, QType, Section } from '../lib/types';
import { optionLabel } from '../components/AnswerInput';
import { ContextBody, QuestionBody } from '../components/QuestionView';

export default function Editor() {
  const { id } = useParams();
  const [paper, setPaper] = useState<Paper | null | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState<{ section: string; missing: boolean }>({ section: '', missing: false });

  useEffect(() => {
    db.paper(id!).then((p) => setPaper(p ?? null));
  }, [id]);

  useEffect(() => {
    if (!dirty || !paper) return;
    const t = setTimeout(() => {
      db.savePaper(paper).then(() => setDirty(false)).catch(() => setDirty(true));
    }, 500);
    return () => clearTimeout(t);
  }, [paper, dirty]);

  const change = (fn: (p: Paper) => Paper) => {
    setPaper((p) => (p ? fn(p) : p));
    setDirty(true);
  };
  const updateQ = (qid: string, patch: Partial<Question>) =>
    change((p) => ({ ...p, questions: p.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) }));

  const visible = useMemo(
    () =>
      (paper?.questions ?? [])
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (!filter.section || q.sectionId === filter.section) && (!filter.missing || !q.answer)),
    [paper, filter],
  );

  if (paper === undefined) return <p className="text-slate-500">Loading…</p>;
  if (paper === null) return <p>Paper not found. <Link to="/" className="text-indigo-600">Back to library</Link></p>;

  const keyed = paper.questions.filter((q) => q.answer).length;
  const maxMarks = paper.questions.reduce((s, q) => s + q.marks, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-2xl font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-indigo-400"
          value={paper.name}
          onChange={(e) => change((p) => ({ ...p, name: e.target.value }))}
        />
        <span className="text-xs text-slate-400">{dirty ? 'Saving…' : 'All changes saved'}</span>
        <Link to={`/paper/${paper.id}/start`} className={`btn-primary ${paper.questions.length ? '' : 'pointer-events-none opacity-50'}`}>
          <Play size={16} /> Start test
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>{paper.questions.length} questions</span>
        {paper.setCode && <span>Set {paper.setCode}</span>}
        <span>Max marks {Math.round(maxMarks * 100) / 100}</span>
        <span className={keyed === paper.questions.length && keyed ? 'text-emerald-600' : 'text-amber-600'}>
          {keyed}/{paper.questions.length} answers set
        </span>
      </div>

      {paper.parseNotes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">Import notes</div>
          <ul className="mt-1 list-disc pl-5">
            {paper.parseNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <ExamSettings paper={paper} change={change} />
        <SectionsCard paper={paper} change={change} />
        <AnswerKeyCard paper={paper} change={change} />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-900">Questions</h2>
          <select className="input" value={filter.section} onChange={(e) => setFilter((f) => ({ ...f, section: e.target.value }))}>
            <option value="">All sections</option>
            {paper.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={filter.missing} onChange={(e) => setFilter((f) => ({ ...f, missing: e.target.checked }))} />
            Only missing answers
          </label>
          <div className="ml-auto flex gap-2">
            <BulkAdd paper={paper} change={change} />
          </div>
        </div>
        {paper.questions.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No questions yet. Use <b>Add questions</b> to create answer slots — with the <b>Full PDF</b> display mode, the paper is shown beside the answer
            panel during the test.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="hidden grid-cols-[3rem_4rem_1fr_6rem_5rem_minmax(12rem,1.5fr)_4.5rem_4.5rem_4.5rem] gap-2 px-4 py-2 text-xs font-medium tracking-wide text-slate-500 uppercase md:grid">
              <span>#</span>
              <span>Q.No</span>
              <span>Section</span>
              <span>Type</span>
              <span>Options</span>
              <span>Correct answer</span>
              <span>Marks</span>
              <span>Negative</span>
              <span />
            </div>
            {visible.map(({ q, i }) => (
              <QuestionRow key={q.id} q={q} index={i} sections={paper.sections} preset={paper.preset} onChange={updateQ} onDelete={(qid) => change((p) => ({ ...p, questions: p.questions.filter((x) => x.id !== qid) }))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Change = (fn: (p: Paper) => Paper) => void;

function ExamSettings({ paper, change }: { paper: Paper; change: Change }) {
  const groups = timerGroups({ ...paper, timing: 'sectional' });
  const modes: { id: DisplayMode; label: string; hint: string }[] = [
    { id: 'snippet', label: 'Original', hint: 'Each question cropped from the PDF (keeps diagrams & equations)' },
    { id: 'text', label: 'Text', hint: 'Extracted text, like the real exam font' },
    { id: 'pdf', label: 'Full PDF', hint: 'Whole PDF beside the answer panel (works for any paper)' },
  ];
  return (
    <div className="card space-y-4 p-4">
      <h2 className="font-semibold text-slate-900">Exam pattern</h2>
      <div>
        <label className="label">Exam</label>
        <select
          className="input w-full"
          value={paper.preset}
          onChange={(e) => change((p) => applyPreset(p, e.target.value as PresetId, { marking: true, timing: true }))}
        >
          {PRESET_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">{PRESETS[paper.preset].blurb} Changing this resets marks and timer.</p>
        {paper.preset === 'CUSTOM' && (
          <p className="mt-1 text-xs text-slate-500">
            Use Custom for a board paper, a university paper, or anything that is not a standard CBT. Set the minutes and marks below. Full PDF view keeps the original pages beside the answers.
          </p>
        )}
      </div>
      <div>
        <label className="label">Timer</label>
        <div className="flex gap-4 text-sm">
          {(['total', 'sectional'] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="radio" checked={paper.timing === t} onChange={() => change((p) => ({ ...p, timing: t }))} />
              {t === 'total' ? 'One timer for the paper' : 'Sectional timers'}
            </label>
          ))}
        </div>
        {paper.timing === 'total' ? (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <input type="number" min={1} className="input w-24" value={paper.durationMin} onChange={(e) => change((p) => ({ ...p, durationMin: Math.max(1, Number(e.target.value) || 1) }))} />
            minutes
          </div>
        ) : (
          <div className="mt-2 space-y-1.5 text-sm">
            {groups.map((g) => (
              <div key={g.group} className="flex items-center gap-2">
                <span className="w-40 truncate text-slate-600">{g.sectionIds.map((sid) => paper.sections.find((s) => s.id === sid)?.name).join(' + ')}</span>
                <input
                  type="number"
                  min={1}
                  className="input w-20"
                  value={g.minutes}
                  onChange={(e) => change((p) => ({ ...p, groupMinutes: { ...p.groupMinutes, [g.group]: Math.max(1, Number(e.target.value) || 1) } }))}
                />
                min
              </div>
            ))}
            <label className="flex items-center gap-2 pt-1 text-slate-600">
              <input type="checkbox" checked={paper.allowEarlySectionSubmit} onChange={(e) => change((p) => ({ ...p, allowEarlySectionSubmit: e.target.checked }))} />
              Allow moving to the next section early
            </label>
          </div>
        )}
      </div>
      <div>
        <label className="label">Show questions as</label>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          {modes.map((m) => {
            const locked = m.id === 'text' && paper.allowText === false;
            return (
              <button
                key={m.id}
                title={locked ? 'This paper is shown from the original page. The extracted text is not reliable.' : m.hint}
                disabled={locked}
                onClick={() => change((p) => ({ ...p, displayMode: m.id }))}
                className={`rounded-md px-2 py-1.5 text-sm font-medium ${paper.displayMode === m.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'} ${locked ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {paper.allowText === false
            ? 'Text view is off for this paper. Each question is cut from the original page.'
            : modes.find((m) => m.id === paper.displayMode)?.hint}
        </p>
      </div>
    </div>
  );
}

function SectionsCard({ paper, change }: { paper: Paper; change: Change }) {
  const update = (sid: string, patch: Partial<Section>) => change((p) => ({ ...p, sections: p.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }));
  return (
    <div className="card p-4">
      <h2 className="mb-3 font-semibold text-slate-900">Sections</h2>
      <p className="mb-3 text-xs text-slate-500">
        Sections that share a pick-one group are alternatives. The candidate chooses one before the test, and can skip any section so its marks are not counted.
        {(paper.languages?.length ?? 0) > 1 && ' This paper has a second language. The test screen can switch between them.'}
      </p>
      <div className="space-y-2">
        {paper.sections.map((s) => {
          const count = paper.questions.filter((q) => q.sectionId === s.id).length;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <input className="input min-w-0 flex-1" value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} />
              <select
                className="input w-28"
                title="Sections with the same letter are alternatives"
                value={s.choiceGroup ?? ''}
                onChange={(e) => update(s.id, { choiceGroup: e.target.value || undefined })}
              >
                <option value="">Required</option>
                <option value="subject">Pick one A</option>
                <option value="extra">Pick one B</option>
              </select>
              <span className="w-10 text-right text-xs text-slate-500">{count} Q</span>
              {paper.timing === 'sectional' && (
                <select className="input w-24" value={s.timerGroup} title="Sections in the same timer group share one clock" onChange={(e) => update(s.id, { timerGroup: Number(e.target.value) })}>
                  {Array.from({ length: paper.sections.length }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Timer {i + 1}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn-ghost px-2 text-slate-400 hover:text-red-600"
                disabled={count > 0 || paper.sections.length === 1}
                title={count ? 'Move or delete its questions first' : 'Delete section'}
                onClick={() => change((p) => ({ ...p, sections: p.sections.filter((x) => x.id !== s.id) }))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="btn-ghost mt-2 text-indigo-600"
        onClick={() =>
          change((p) => ({ ...p, sections: [...p.sections, { id: uid(), name: `Section ${p.sections.length + 1}`, timerGroup: p.sections.length + 1 }] }))
        }
      >
        <Plus size={15} /> Add section
      </button>
    </div>
  );
}

function AnswerKeyCard({ paper, change }: { paper: Paper; change: Change }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = () => {
    const entries = extractKeyEntries(text, paper.setCode);
    if (!entries.length) return setMsg('No answers recognised. Try a format like "1-B, 2-C, 3-12.5" or one letter per question.');
    const res = applyKey(paper.questions, paper.sections, entries);
    change((p) => applyPreset({ ...p, questions: res.questions }, p.preset, { marking: true, timing: false }));
    setMsg(`Read ${entries.length} answers, matched ${res.matched} questions.`);
  };

  const loadPdf = async (file: File) => {
    setBusy(true);
    setMsg('Reading answer key PDF…');
    try {
      const doc = await openPdf(await file.arrayBuffer());
      const { layouts } = await extractLayouts(doc, { ocr: 'auto' });
      await doc.cleanup();
      await doc.loadingTask.destroy();
      setText(layoutText(layouts));
      setMsg('Key text loaded — check it, then press Apply.');
    } catch (e) {
      setMsg(`Could not read PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <KeyRound size={16} /> Answer key
      </h2>
      <p className="mb-2 text-xs text-slate-500">Paste any format: “1-B 2-C”, “Q1 (a)”, tables, GATE key rows, ranges like “2.5 to 2.7”, or just “BCDA…”.</p>
      <textarea className="input min-h-28 flex-1 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'1. B   2. D   3. A,C\n4. 12.5   5. 3 to 3.2'} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!text.trim()} onClick={apply}>
          <Wand2 size={15} /> Apply
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} From PDF
        </button>
        <button
          className="btn-ghost ml-auto text-slate-500"
          onClick={() => confirm('Remove all answers from this paper?') && change((p) => ({ ...p, questions: p.questions.map((q) => ({ ...q, answer: null })) }))}
        >
          Clear all
        </button>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => e.target.files?.[0] && loadPdf(e.target.files[0])} />
      </div>
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
    </div>
  );
}

function BulkAdd({ paper, change }: { paper: Paper; change: Change }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(paper.questions.length ? 1 : 50);
  const [type, setType] = useState<QType>('MCQ');
  const [section, setSection] = useState(paper.sections[paper.sections.length - 1]?.id ?? '');
  if (!open)
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add questions
      </button>
    );
  const add = () => {
    change((p) => {
      const sid = section || p.sections[0].id;
      const inSection = p.questions.filter((q) => q.sectionId === sid);
      const start = Math.max(0, ...inSection.map((q) => q.sourceNumber));
      const fileId = p.files[0]?.id ?? '';
      const added = Array.from({ length: count }, (_, i) => newQuestion(sid, fileId, start + i + 1, type));
      const lastIdx = p.questions.findLastIndex((q) => q.sectionId === sid);
      const questions = [...p.questions];
      questions.splice(lastIdx < 0 ? questions.length : lastIdx + 1, 0, ...added);
      return applyPreset({ ...p, questions }, p.preset, { marking: true, timing: false });
    });
    setOpen(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      Add
      <input type="number" min={1} max={300} className="input w-20" value={count} onChange={(e) => setCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} />
      <select className="input" value={type} onChange={(e) => setType(e.target.value as QType)}>
        <option value="MCQ">MCQ</option>
        <option value="MSQ">MSQ</option>
        <option value="NAT">Numerical</option>
      </select>
      to
      <select className="input" value={section} onChange={(e) => setSection(e.target.value)}>
        {paper.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button className="btn-primary" onClick={add}>
        Add
      </button>
      <button className="btn-ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

const QuestionRow = memo(function QuestionRow({
  q,
  index,
  sections,
  preset,
  onChange,
  onDelete,
}: {
  q: Question;
  index: number;
  sections: Section[];
  preset: PresetId;
  onChange: (id: string, patch: Partial<Question>) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Question>) => onChange(q.id, patch);

  const setType = (type: QType) => {
    if (type === q.type) return;
    const toNat = type === 'NAT';
    set({
      type,
      optionCount: toNat ? 0 : Math.max(q.optionCount, q.options.length, 4),
      answer: q.answer?.kind === 'dropped' ? q.answer : toNat === (q.answer?.kind === 'range') ? q.answer : null,
    });
  };

  return (
    <div className={!q.answer ? 'bg-amber-50/40' : ''}>
      <div className="grid grid-cols-2 items-center gap-2 px-4 py-2 text-sm md:grid-cols-[3rem_4rem_1fr_6rem_5rem_minmax(12rem,1.5fr)_4.5rem_4.5rem_4.5rem]">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 font-medium text-slate-700">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {index + 1}
        </button>
        <input type="number" className="input w-16 py-1" value={q.sourceNumber} onChange={(e) => set({ sourceNumber: Number(e.target.value) || 0 })} />
        <select className="input min-w-0 py-1" value={q.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="input py-1" value={q.type} onChange={(e) => setType(e.target.value as QType)}>
          <option value="MCQ">MCQ</option>
          <option value="MSQ">MSQ</option>
          <option value="NAT">{PRESETS[preset].natLabel}</option>
        </select>
        {q.type === 'NAT' ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          <input type="number" min={2} max={8} className="input w-16 py-1" value={q.optionCount} onChange={(e) => set({ optionCount: Math.max(2, Math.min(8, Number(e.target.value) || 4)) })} />
        )}
        <AnswerCell q={q} set={set} />
        <input type="number" step="0.01" className="input w-16 py-1" value={q.marks} onChange={(e) => set({ marks: Number(e.target.value) })} />
        <input type="number" step="0.01" className="input w-16 py-1" value={q.negative} onChange={(e) => set({ negative: Math.abs(Number(e.target.value)) })} />
        <div className="flex justify-end gap-1">
          <button className="btn-ghost px-1.5" title="Preview" onClick={() => setOpen((o) => !o)}>
            <Eye size={15} />
          </button>
          <button className="btn-ghost px-1.5 text-slate-400 hover:text-red-600" title="Delete question" onClick={() => onDelete(q.id)}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {open && (
        <div className="grid gap-4 bg-slate-50 px-4 py-4 lg:grid-cols-2">
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-slate-500 uppercase">As it appears in the PDF</div>
            {q.context && (
              <div className="mb-3 border-b border-dashed border-slate-200 pb-3">
                <ContextBody q={q} mode="snippet" zoom={0.85} />
              </div>
            )}
            {q.regions.length ? <QuestionBody q={q} mode="snippet" zoom={0.85} /> : <p className="text-sm text-slate-400">No PDF region for this question.</p>}
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Question text (used in Text view)</label>
              <textarea className="input min-h-28 w-full" value={q.text} onChange={(e) => set({ text: e.target.value })} />
            </div>
            {q.type !== 'NAT' && (
              <div>
                <label className="label">Options, one per line</label>
                <textarea
                  className="input min-h-24 w-full"
                  value={q.options.join('\n')}
                  onChange={(e) => {
                    const options = e.target.value.split('\n');
                    set({ options, optionCount: Math.max(2, options.filter(Boolean).length || q.optionCount) });
                  }}
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={q.answer?.kind === 'dropped'} onChange={(e) => set({ answer: e.target.checked ? { kind: 'dropped' } : null })} />
              Marks to all (question dropped / bonus)
            </label>
            {q.solution && (
              <div>
                <label className="label">Solution found in PDF</label>
                <p className="text-sm whitespace-pre-wrap text-slate-600">{q.solution}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

function AnswerCell({ q, set }: { q: Question; set: (p: Partial<Question>) => void }) {
  if (q.answer?.kind === 'dropped') return <span className="text-xs font-medium text-emerald-700">Marks to all</span>;
  if (q.type === 'NAT') {
    const r = q.answer?.kind === 'range' ? q.answer : null;
    const update = (min: string, max: string) => {
      if (min.trim() === '') return set({ answer: null });
      const a = Number(min);
      const b = max.trim() === '' ? a : Number(max);
      if (Number.isNaN(a) || Number.isNaN(b)) return;
      set({ answer: { kind: 'range', min: Math.min(a, b), max: Math.max(a, b) } });
    };
    return (
      <div className="flex items-center gap-1">
        <NumberField value={r ? String(r.min) : ''} placeholder="answer" onCommit={(v) => update(v, r && r.max !== r.min ? String(r.max) : '')} />
        <span className="text-xs text-slate-400">to</span>
        <NumberField value={r && r.max !== r.min ? String(r.max) : ''} placeholder="max" onCommit={(v) => r && update(String(r.min), v)} />
      </div>
    );
  }
  const values = q.answer?.kind === 'choice' ? q.answer.values : [];
  const count = Math.max(q.optionCount, 2);
  const toggle = (i: number) => {
    let next: number[];
    if (q.type === 'MSQ') next = values.includes(i) ? values.filter((v) => v !== i) : [...values, i].sort((a, b) => a - b);
    else next = values.length === 1 && values[0] === i ? [] : [i];
    set({ answer: next.length ? { kind: 'choice', values: next } : null });
  };
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          className={`h-7 min-w-7 rounded border px-1.5 text-xs font-semibold ${
            values.includes(i) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
          }`}
        >
          {optionLabel(q, i)}
        </button>
      ))}
    </div>
  );
}

/** Text input that only commits on blur/Enter so partial numbers like "-" or "2." can be typed. */
function NumberField({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="input w-20 py-1"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

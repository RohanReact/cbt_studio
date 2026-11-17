import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Clock, FileUp, KeyRound, Loader2, MinusCircle, RotateCcw, Target, Wand2, XCircle } from 'lucide-react';
import { db } from '../lib/db';
import { applyKey, extractKeyEntries, formatAnswer } from '../lib/pdf/answerKey';
import { extractLayouts } from '../lib/pdf/extract';
import { layoutText } from '../lib/pdf/parse';
import { openPdf } from '../lib/pdf/pdfjs';
import { formatDuration, grade, hasValue, type Outcome, type QResult } from '../lib/grading';
import { applyPreset, typeLabel } from '../lib/presets';
import { useAsync } from '../lib/useAsync';
import type { Paper, ResponseValue } from '../lib/types';
import { ContextBody, QuestionBody } from '../components/QuestionView';
import { optionLabel } from '../components/AnswerInput';

const OUTCOME: Record<Outcome, { label: string; cls: string; bar: string }> = {
  correct: { label: 'Correct', cls: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  wrong: { label: 'Wrong', cls: 'bg-red-50 text-red-700', bar: 'bg-red-500' },
  unattempted: { label: 'Not attempted', cls: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300' },
  unevaluated: { label: 'No key', cls: 'bg-amber-50 text-amber-700', bar: 'bg-amber-400' },
  dropped: { label: 'Bonus', cls: 'bg-sky-50 text-sky-700', bar: 'bg-sky-400' },
  skipped: { label: 'Skipped', cls: 'bg-slate-100 text-slate-500', bar: 'bg-slate-200' },
};

export default function Result() {
  const { attemptId } = useParams();
  const { data, loading } = useAsync(async () => {
    const attempt = await db.attempt(attemptId!);
    const paper = attempt ? await db.paper(attempt.paperId) : undefined;
    const history = attempt ? await db.attemptsFor(attempt.paperId) : [];
    return { attempt, paper, history };
  }, [attemptId]);

  const [paperOverride, setPaperOverride] = useState<Paper | null>(null);
  const graded = useMemo(() => {
    const paper = paperOverride ?? data?.paper;
    return paper && data?.attempt ? grade(paper, data.attempt) : null;
  }, [data, paperOverride]);
  const [filter, setFilter] = useState<Outcome | 'all' | 'marked'>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!data?.attempt) return <p>Attempt not found.</p>;
  if (!data.paper || !graded) return <p>The paper for this attempt was deleted.</p>;

  const { attempt, history } = data;
  const paper = paperOverride ?? data.paper;
  const { total, bySection, items } = graded;
  const pct = total.maxScore ? Math.round((total.score / total.maxScore) * 1000) / 10 : 0;
  const sectionName = (id: string) => paper.sections.find((s) => s.id === id)?.name ?? '';
  const maxTime = Math.max(1, ...items.map((i) => i.response?.timeMs ?? 0));
  const shown = items.filter((i) => (filter === 'all' ? true : filter === 'marked' ? i.response?.marked : i.outcome === filter));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{paper.name}</h1>
          <p className="text-sm text-slate-500">
            {attempt.candidateName} · {new Date(attempt.startedAt).toLocaleString()} · time taken {formatDuration(attempt.timeUsedMs)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/paper/${paper.id}`} className="btn-secondary">
            <KeyRound size={16} /> Edit answer key
          </Link>
          <Link to={`/paper/${paper.id}/start`} className="btn-primary">
            <RotateCcw size={16} /> Retake
          </Link>
        </div>
      </div>

      {paper.questions.some((q) => !q.answer) && (
        <div className="space-y-3">
          {total.unevaluated > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No answer key was available for {total.unevaluated} attempted question{total.unevaluated > 1 ? 's' : ''}, so {total.unevaluated > 1 ? 'they are' : 'it is'} not scored yet.
              Upload the key here. The score on this page updates as soon as the answers match.
            </div>
          )}
          <LateKey paper={paper} onPaper={setPaperOverride} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <div className="card flex items-center gap-6 p-6">
          <ScoreRing pct={Math.max(0, pct)} />
          <div>
            <div className="text-sm text-slate-500">Score</div>
            <div className="text-4xl font-bold text-slate-900">
              {total.score}
              <span className="text-xl font-medium text-slate-400"> / {total.maxScore}</span>
            </div>
            <div className="mt-1 text-sm text-slate-600">{pct}% · {total.attempted} of {items.length} attempted</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat icon={<CheckCircle2 className="text-emerald-600" size={18} />} label="Correct" value={total.correct} />
          <Stat icon={<XCircle className="text-red-600" size={18} />} label="Wrong" value={total.wrong} />
          <Stat icon={<MinusCircle className="text-slate-400" size={18} />} label="Not attempted" value={total.unattempted} />
          <Stat icon={<Target className="text-indigo-600" size={18} />} label="Accuracy" value={`${total.accuracy}%`} />
          <Stat icon={<XCircle className="text-red-400" size={18} />} label="Negative marks" value={total.negative ? `−${total.negative}` : '0'} />
          <Stat icon={<Clock className="text-slate-500" size={18} />} label="Avg time / attempted" value={formatDuration(total.attempted ? total.timeMs / total.attempted : 0)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              {['Section', 'Score', 'Correct', 'Wrong', 'Not attempted', 'Accuracy', 'Time spent'].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bySection.map((s) => (
              <tr key={s.section.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium">{s.section.name}</td>
                <td className="px-4">
                  {s.skipped > 0 && s.maxScore === 0 ? (
                    <span className="text-slate-500">Skipped</span>
                  ) : (
                    <>
                      <b>{s.score}</b> <span className="text-slate-400">/ {s.maxScore}</span>
                    </>
                  )}
                </td>
                <td className="px-4 text-emerald-700">{s.correct}</td>
                <td className="px-4 text-red-600">{s.wrong}</td>
                <td className="px-4 text-slate-500">{s.unattempted}</td>
                <td className="px-4">{s.accuracy}%</td>
                <td className="px-4 text-slate-600">{formatDuration(s.timeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="mb-1 font-semibold text-slate-900">Time spent per question</h2>
        <p className="mb-3 text-xs text-slate-500">Bar height is time spent; colour is the outcome. Click a bar to jump to that question.</p>
        <div className="flex h-32 items-end gap-[2px] overflow-x-auto">
          {items.map((it) => (
            <button
              key={it.q.id}
              title={`Q${it.index + 1} · ${OUTCOME[it.outcome].label} · ${formatDuration(it.response?.timeMs ?? 0)}`}
              onClick={() => {
                setFilter('all');
                setOpen((p) => new Set(p).add(it.q.id));
                setTimeout(() => document.getElementById(`rev-${it.q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
              }}
              className={`min-w-[6px] flex-1 rounded-t ${OUTCOME[it.outcome].bar} hover:opacity-80`}
              style={{ height: `${Math.max(3, ((it.response?.timeMs ?? 0) / maxTime) * 100)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <h2 className="mr-2 font-semibold text-slate-900">Answer review</h2>
          {(['all', 'correct', 'wrong', 'unattempted', 'marked', 'unevaluated', 'skipped'] as const).map((f) => {
            const n = f === 'all' ? items.length : f === 'marked' ? items.filter((i) => i.response?.marked).length : items.filter((i) => i.outcome === f).length;
            if (!n && f !== 'all') return null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f === 'all' ? 'All' : f === 'marked' ? 'Marked for review' : OUTCOME[f].label} ({n})
              </button>
            );
          })}
        </div>
        <div className="divide-y divide-slate-100">
          {shown.map((it) => (
            <ReviewItem key={it.q.id} it={it} paper={paper} sectionName={sectionName(it.q.sectionId)} open={open.has(it.q.id)} onToggle={() => toggle(it.q.id)} />
          ))}
        </div>
      </div>

      {history.length > 1 && (
        <div className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">All attempts of this paper</h2>
          <div className="flex flex-wrap gap-2">
            {history
              .filter((h) => h.status === 'submitted')
              .map((h) => (
                <Link
                  key={h.id}
                  to={`/result/${h.id}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${h.id === attempt.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <div className="font-medium">
                    {grade(paper, h).total.score} / {grade(paper, h).total.maxScore}
                  </div>
                  <div className="text-xs text-slate-500">{new Date(h.startedAt).toLocaleDateString()}</div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LateKey({ paper, onPaper }: { paper: Paper; onPaper: (paper: Paper) => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = async () => {
    const entries = extractKeyEntries(text, paper.setCode);
    if (!entries.length) return setMsg('No answers recognised. Try “1-B, 2-C” or “1. 2  2. 4”, or one letter per question.');
    const res = applyKey(paper.questions, paper.sections, entries);
    const next = applyPreset({ ...paper, questions: res.questions, updatedAt: Date.now() }, paper.preset, { marking: true, timing: false });
    await db.savePaper(next);
    onPaper(next);
    setMsg(`Matched ${res.matched} of ${paper.questions.length} questions. The score above is updated.`);
  };

  const loadPdf = async (file: File) => {
    setBusy(true);
    setMsg('Reading answer key…');
    try {
      const doc = await openPdf(await file.arrayBuffer());
      const { layouts } = await extractLayouts(doc, { ocr: 'auto' });
      await doc.cleanup();
      await doc.loadingTask.destroy();
      setText(layoutText(layouts));
      setMsg('Key text loaded. Check it, then press Apply key.');
    } catch (e) {
      setMsg(`Could not read that PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
        <KeyRound size={16} /> Add the answer key now
      </h2>
      <p className="mb-2 text-xs text-slate-500">Paste the key, or upload the official key PDF. This does not change the answers you already submitted.</p>
      <textarea className="input min-h-24 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'1. 2\n2. 4\n3. 1'} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!text.trim()} onClick={() => void apply()}>
          <Wand2 size={15} /> Apply key
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} Upload key PDF
        </button>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => e.target.files?.[0] && void loadPdf(e.target.files[0])} />
      </div>
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
    </div>
  );
}

function ReviewItem({ it, paper, sectionName, open, onToggle }: { it: QResult; paper: Paper; sectionName: string; open: boolean; onToggle: () => void }) {
  const { q } = it;
  const o = OUTCOME[it.outcome];
  const yours = formatResponse(it.response?.value, q.optionStyle);
  return (
    <div id={`rev-${q.id}`}>
      <button onClick={onToggle} className="grid w-full grid-cols-[1.5rem_4rem_1fr] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50 md:grid-cols-[1.5rem_4rem_8rem_7rem_1fr_1fr_5rem_5rem]">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-semibold">Q{it.index + 1}</span>
        <span className="hidden truncate text-slate-500 md:block">{sectionName}</span>
        <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${o.cls}`}>{o.label}</span>
        <span className="hidden md:block">
          <span className="text-slate-400">Yours: </span>
          <b className={it.outcome === 'wrong' ? 'text-red-600' : ''}>{yours}</b>
        </span>
        <span className="hidden md:block">
          <span className="text-slate-400">Correct: </span>
          <b className="text-emerald-700">{formatAnswer(q.answer, q.optionStyle)}</b>
        </span>
        <span className={`hidden font-medium md:block ${it.score > 0 ? 'text-emerald-700' : it.score < 0 ? 'text-red-600' : 'text-slate-400'}`}>
          {it.score > 0 ? '+' : ''}
          {it.score}
        </span>
        <span className="hidden text-slate-500 md:block">{formatDuration(it.response?.timeMs ?? 0)}</span>
      </button>
      {open && (
        <div className="space-y-4 bg-slate-50 px-4 py-4 md:px-12">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm md:hidden">
            <span>Yours: <b>{yours}</b></span>
            <span>Correct: <b className="text-emerald-700">{formatAnswer(q.answer, q.optionStyle)}</b></span>
            <span>Marks: {it.score}</span>
          </div>
          <div className="text-xs text-slate-500">
            {typeLabel(q.type, paper.preset)} · +{q.marks}
            {q.negative ? ` / −${q.negative}` : ''} · time spent {formatDuration(it.response?.timeMs ?? 0)}
          </div>
          {q.context && (
            <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-3">
              <ContextBody q={q} mode={q.context.regions.length ? 'snippet' : 'text'} zoom={0.9} />
            </div>
          )}
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-3">
            <QuestionBody q={q} mode={q.regions.length ? 'snippet' : 'text'} zoom={0.9} />
          </div>
          {q.type !== 'NAT' && q.options.length > 0 && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {q.options.map((opt, i) => {
                const correct = q.answer?.kind === 'choice' && q.answer.values.includes(i);
                const chosen = Array.isArray(it.response?.value) && it.response.value.includes(i);
                return (
                  <div
                    key={i}
                    className={`rounded-md border px-3 py-1.5 text-sm ${correct ? 'border-emerald-400 bg-emerald-50' : chosen ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
                  >
                    <b>({optionLabel(q, i)})</b> {opt}
                    {chosen && <span className="ml-2 text-xs text-slate-500">your choice</span>}
                  </div>
                );
              })}
            </div>
          )}
          {q.solution && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm whitespace-pre-wrap text-slate-700">
              <div className="mb-1 text-xs font-semibold tracking-wide text-indigo-700 uppercase">Solution</div>
              {q.solution}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatResponse(v: ResponseValue | undefined, style: 'alpha' | 'numeric') {
  if (!hasValue(v)) return '—';
  if (typeof v === 'string') return v;
  return v!.map((i) => (style === 'numeric' ? String(i + 1) : String.fromCharCode(65 + i))).join(', ');
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
      <circle cx="55" cy="55" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        stroke="#4f46e5"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`}
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="61" textAnchor="middle" className="fill-slate-800 text-lg font-semibold">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

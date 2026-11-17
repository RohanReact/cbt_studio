import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileText, KeyRound, Loader2, Pencil, Play, Trash2, UploadCloud, X } from 'lucide-react';
import { UsageBanner } from '../components/UsageBanner';
import { ApiError } from '../lib/api';
import { SAMPLE_FILES, type ExamId } from '../../shared/exams';
import { guessRoles, runImport, type ImportJob, type JobProgress } from '../lib/importer';
import { useAuth } from '../lib/session';
import { PRESET_LIST } from '../lib/presets';
import type { Paper } from '../lib/types';

const ALL_SAMPLES = [...new Set(Object.values(SAMPLE_FILES).flat())];

type Outcome = { state: 'running'; progress: JobProgress } | { state: 'done'; paper: Paper } | { state: 'error'; message: string; code?: string };

export default function Import() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [params] = useSearchParams();
  const { refresh } = useAuth();

  const addFiles = (files: File[]) => {
    const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;
    setJobs((prev) => {
      const all = [...prev.map((j) => j.file), ...pdfs];
      const guessed = guessRoles(all);
      return guessed.map((g, i) => (prev[i] ? { ...prev[i], keyFor: prev[i].keyFor ?? g.keyFor } : { ...g, preset: 'auto', ocr: 'auto' }));
    });
  };

  const samplesLoaded = useRef(false);
  useEffect(() => {
    const flag = params.get('samples');
    if (!flag || samplesLoaded.current) return;
    samplesLoaded.current = true;
    const names = flag === '1' ? ALL_SAMPLES : SAMPLE_FILES[flag as ExamId];
    if (!names?.length) return;
    Promise.all(
      names.map(async (n) => new File([await (await fetch(`${import.meta.env.BASE_URL}samples/${n}`)).blob()], n, { type: 'application/pdf' })),
    ).then(addFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (id: string, patch: Partial<ImportJob>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const papers = jobs.filter((j) => j.role === 'paper');
  const orphanKeys = jobs.filter((j) => j.role === 'key' && !papers.some((p) => p.id === j.keyFor));

  const start = async () => {
    setRunning(true);
    for (const job of papers) {
      if (outcomes[job.id]?.state === 'done') continue;
      const keys = jobs.filter((k) => k.role === 'key' && k.keyFor === job.id);
      const set = (o: Outcome) => setOutcomes((prev) => ({ ...prev, [job.id]: o }));
      set({ state: 'running', progress: { label: 'Starting…', fraction: 0 } });
      try {
        const paper = await runImport(job, keys, (progress) => set({ state: 'running', progress }));
        set({ state: 'done', paper });
      } catch (e) {
        console.error(e);
        set({
          state: 'error',
          message: e instanceof Error ? e.message : 'Failed to read this PDF.',
          code: e instanceof ApiError ? e.code : undefined,
        });
      }
    }
    setRunning(false);
    void refresh();
  };

  const pending = papers.filter((p) => outcomes[p.id]?.state !== 'done').length;

  return (
    <div className="mx-auto max-w-5xl">
      <UsageBanner />
      <h1 className="text-2xl font-semibold text-slate-900">Import question papers</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add as many PDFs as you like, including papers that are not computer-based. Answer keys can be a separate PDF. CBT exams pick up a timer automatically. For any other paper, choose Custom in the editor and set the minutes. Finished papers are saved to your account.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles([...e.dataTransfer.files]);
        }}
        onClick={() => input.current?.click()}
        className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          drag ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400'
        }`}
      >
        <UploadCloud className="text-indigo-500" size={36} />
        <p className="mt-2 font-medium text-slate-800">Drop PDFs here or click to browse</p>
        <p className="text-sm text-slate-500">Question papers and answer keys — CAT, GATE, MHT-CET, JEE or any other exam</p>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>

      {jobs.length > 0 && (
        <div className="card mt-6 divide-y divide-slate-100">
          {jobs.map((job) => {
            const o = outcomes[job.id];
            return (
              <div key={job.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {job.role === 'paper' ? <FileText className="text-indigo-500" size={20} /> : <KeyRound className="text-amber-500" size={20} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{job.file.name}</div>
                    <div className="text-xs text-slate-500">{(job.file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <select
                    className="input"
                    value={job.role}
                    disabled={running}
                    onChange={(e) => update(job.id, { role: e.target.value as ImportJob['role'] })}
                  >
                    <option value="paper">Question paper</option>
                    <option value="key">Answer key</option>
                  </select>
                  {job.role === 'key' ? (
                    <select className="input max-w-56" value={job.keyFor ?? ''} disabled={running} onChange={(e) => update(job.id, { keyFor: e.target.value || undefined })}>
                      <option value="">Key for which paper?</option>
                      {papers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.file.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select className="input" value={job.preset} disabled={running} onChange={(e) => update(job.id, { preset: e.target.value as ImportJob['preset'] })}>
                      <option value="auto">Exam: auto-detect</option>
                      {PRESET_LIST.map((p) => (
                        <option key={p.id} value={p.id}>
                          Exam: {p.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    className="input"
                    value={job.ocr}
                    disabled={running}
                    title="OCR reads scanned (image-only) pages"
                    onChange={(e) => update(job.id, { ocr: e.target.value as ImportJob['ocr'] })}
                  >
                    <option value="auto">OCR: auto</option>
                    <option value="always">OCR: always</option>
                    <option value="off">OCR: off</option>
                  </select>
                  <button className="btn-ghost px-2" disabled={running} onClick={() => setJobs((js) => js.filter((j) => j.id !== job.id))} title="Remove">
                    <X size={16} />
                  </button>
                </div>
                {o && <OutcomeRow o={o} />}
              </div>
            );
          })}
        </div>
      )}

      {orphanKeys.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
          <AlertTriangle size={16} /> {orphanKeys.length} answer key{orphanKeys.length > 1 ? 's are' : ' is'} not linked to a paper and will be ignored.
        </p>
      )}

      {jobs.length > 0 && (
        <div className="mt-5 flex items-center gap-3">
          <button className="btn-primary" disabled={running || pending === 0} onClick={start}>
            {running ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
            {running ? 'Processing…' : `Process ${pending} paper${pending === 1 ? '' : 's'}`}
          </button>
          {!running && (
            <button className="btn-ghost" onClick={() => (setJobs([]), setOutcomes({}))}>
              <Trash2 size={16} /> Clear list
            </button>
          )}
          {Object.values(outcomes).some((o) => o.state === 'done') && !running && (
            <Link to="/" className="btn-secondary ml-auto">
              Go to library
            </Link>
          )}
        </div>
      )}

      <Tips />
    </div>
  );
}

function OutcomeRow({ o }: { o: Outcome }) {
  if (o.state === 'running')
    return (
      <div className="mt-3">
        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="animate-spin" size={12} /> {o.progress.label}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round(o.progress.fraction * 100)}%` }} />
        </div>
      </div>
    );
  if (o.state === 'error')
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-red-600">
        <AlertTriangle size={16} /> {o.message}
        {o.code === 'upgrade_required' && (
          <Link to="/pricing" className="font-medium text-indigo-700">
            View plans
          </Link>
        )}
      </p>
    );
  const p = o.paper;
  const keyed = p.questions.filter((q) => q.answer).length;
  const types = ['MCQ', 'MSQ', 'NAT'].map((t) => [t, p.questions.filter((q) => q.type === t).length] as const).filter(([, n]) => n);
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1 font-medium text-emerald-700">
          <CheckCircle2 size={16} /> {p.questions.length} questions
        </span>
        <span className="text-slate-600">{p.sections.map((s) => s.name).join(' · ')}</span>
        <span className="text-slate-600">{types.map(([t, n]) => `${n} ${t}`).join(', ')}</span>
        <span className={keyed === p.questions.length && keyed ? 'text-emerald-700' : 'text-amber-700'}>
          {keyed}/{p.questions.length} answers found
        </span>
        <div className="ml-auto flex gap-2">
          <Link to={`/paper/${p.id}`} className="btn-secondary py-1">
            <Pencil size={14} /> Review
          </Link>
          {p.questions.length > 0 && (
            <Link to={`/paper/${p.id}/start`} className="btn-primary py-1">
              <Play size={14} /> Start
            </Link>
          )}
        </div>
      </div>
      {p.parseNotes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
          {p.parseNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tips() {
  return (
    <div className="mt-10 grid gap-4 text-sm text-slate-600 md:grid-cols-3">
      <div className="card p-4">
        <h3 className="font-medium text-slate-900">Best results</h3>
        <p className="mt-1">Official papers with selectable text (GATE, CAT memory-based PDFs, coaching papers) are read most accurately. Questions keep their original look, including diagrams and equations.</p>
      </div>
      <div className="card p-4">
        <h3 className="font-medium text-slate-900">Scanned papers</h3>
        <p className="mt-1">Image-only pages are read with OCR in your browser, then the paper is saved to your account. Review detected questions before attempting.</p>
      </div>
      <div className="card p-4">
        <h3 className="font-medium text-slate-900">Nothing detected?</h3>
        <p className="mt-1">Open the paper in the editor, set the number of questions and use “Full PDF” view. You get the full CBT experience with the PDF shown beside the answer panel.</p>
      </div>
    </div>
  );
}

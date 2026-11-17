import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Clock, Expand, Lock, Minus, Plus, UserRound } from 'lucide-react';
import { asAttemptQuestion, languageLabel, shownQuestion, textAllowed, textIsReadable } from '../lib/build';
import { db } from '../lib/db';
import { formatDuration, statusOf } from '../lib/grading';
import { typeLabel } from '../lib/presets';
import type { LangCode, Paper, Question } from '../lib/types';
import { sectionCounts, skippedSet, useExam } from '../store/exam';
import { AnswerInput } from '../components/AnswerInput';
import { ContextBody, PdfPage, QuestionBody } from '../components/QuestionView';
import { pageImageUrl } from '../lib/pdf/render';

type Modal = null | 'submit' | 'section' | { kind: 'timeup'; last: boolean };

export default function Exam() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { paper, attempt, load } = useExam();
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const a = await db.attempt(attemptId!);
      if (!a) return setError('This attempt no longer exists.');
      if (a.status === 'submitted') return navigate(`/result/${a.id}`, { replace: true });
      const p = await db.paper(a.paperId);
      if (!p || !p.questions.length) return setError('The paper for this attempt was deleted or has no questions.');
      load(p, a);
    })();
  }, [attemptId, load, navigate]);

  if (error) return <p className="p-10 text-center text-slate-600">{error}</p>;
  if (!paper || !attempt || attempt.id !== attemptId) return <p className="p-10 text-center text-slate-500">Loading exam…</p>;
  return <ExamScreen />;
}

function ExamScreen() {
  const navigate = useNavigate();
  const s = useExam();
  const paper = s.paper!;
  const attempt = s.attempt!;
  const [modal, setModal] = useState<Modal>(null);
  const [view, setView] = useState<'snippet' | 'text'>(paper.allowText !== false && paper.displayMode === 'text' ? 'text' : 'snippet');
  const [zoom, setZoom] = useState(1);

  const group = s.groups[attempt.groupIndex];
  const skipped = skippedSet(attempt);
  const sections = paper.sections.filter((sec) => group.sectionIds.includes(sec.id) && !skipped.has(sec.id));
  const q = paper.questions.find((x) => x.id === attempt.currentQid)!;
  const activeSection = paper.sections.find((sec) => sec.id === q.sectionId)!;
  const lang = attempt.lang ?? paper.languages?.[0] ?? 'en';
  const displayQ = shownQuestion(q, lang);
  const answerQ = asAttemptQuestion(displayQ, paper);
  const allowText = (paper.allowText ?? textAllowed(paper.questions, paper.languages ?? ['en'])) && textIsReadable(`${displayQ.text}\n${displayQ.options.join('\n')}`);
  const languages = paper.languages ?? (q.alt ? ['en', q.alt.lang] : ['en']);
  const labels = useMemo(() => questionLabels(paper), [paper]);
  const isLastGroup = attempt.groupIndex === s.groups.length - 1;

  const finish = async () => {
    const done = await useExam.getState().submit();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    navigate(`/result/${done.id}`, { replace: true });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Countdown. Uses wall-clock deltas so a throttled background tab still counts correctly.
  useEffect(() => {
    let last = performance.now();
    let ending = false;
    const id = setInterval(() => {
      const now = performance.now();
      const expired = useExam.getState().tick(now - last);
      last = now;
      if (!expired || ending) return;
      if (useExam.getState().nextGroup()) {
        setModal({ kind: 'timeup', last: false });
      } else {
        ending = true;
        clearInterval(id);
        void finishRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      useExam.getState().persist();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const counts = sectionCounts(paper, attempt, [activeSection.id]);
  const low = attempt.timeLeftMs < 5 * 60_000;
  const pdfMode = paper.displayMode === 'pdf';

  return (
    <div className="flex h-screen flex-col bg-white text-[14px] text-slate-800 select-none">
      <header className="flex h-12 shrink-0 items-center gap-3 bg-ion-blue px-4 text-white">
        <span className="truncate font-semibold">{paper.name}</span>
        {paper.setCode && <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-medium">Set {paper.setCode}</span>}
        <button
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-100 hover:bg-white/10"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        >
          <Expand size={14} /> Full screen
        </button>
      </header>

      <div className="flex h-11 shrink-0 items-center border-b border-slate-200 bg-slate-50 pr-4">
        <div className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto">
          {paper.sections.map((sec) => {
            const enabled = group.sectionIds.includes(sec.id);
            const active = sec.id === activeSection.id && !skipped.has(sec.id);
            const leftOut = skipped.has(sec.id);
            return (
              <button
                key={sec.id}
                disabled={!enabled && !leftOut}
                onClick={() => {
                  if (leftOut) {
                    if (confirm(`Include “${sec.name}” again? Its marks will be counted.`)) s.unskipSection(sec.id);
                    return;
                  }
                  const first = paper.questions.find((x) => x.sectionId === sec.id);
                  if (first) s.goto(first.id);
                }}
                className={`flex shrink-0 items-center gap-1.5 border-r border-slate-200 px-4 text-sm font-medium ${
                  active ? 'bg-ion-sky text-white' : leftOut ? 'text-slate-400 line-through' : enabled ? 'text-ion-blue hover:bg-white' : 'cursor-not-allowed text-slate-400'
                }`}
              >
                {!enabled && !leftOut && <Lock size={12} />}
                {sec.name}
                {leftOut && <span className="text-[10px] font-normal no-underline">skipped</span>}
              </button>
            );
          })}
        </div>
        <div className={`ml-4 flex items-center gap-2 rounded-md px-3 py-1 font-mono text-[15px] font-semibold ${low ? 'timer-low bg-red-600 text-white' : 'bg-ion-blue text-white'}`}>
          <Clock size={15} />
          {paper.timing === 'sectional' && <span className="font-sans text-xs font-normal opacity-80">Section</span>}
          Time Left: {formatDuration(attempt.timeLeftMs)}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-4 py-2">
            <span className="text-[15px] font-semibold">Question No. {labels.get(q.id)}</span>
            <span className="text-xs text-slate-500">
              {typeLabel(answerQ.type, paper.preset)}
              {answerQ.type === 'MSQ' && ' (one or more correct)'}
            </span>
            <span className="text-xs">
              Marks: <b className="text-emerald-700">+{q.marks}</b> {q.negative > 0 && <b className="text-red-600">−{q.negative}</b>}
            </span>
            <div className="ml-auto flex items-center gap-2 text-xs">
              {languages.length > 1 && (
                <div className="flex rounded-md border border-slate-300 p-0.5">
                  {languages.map((code) => (
                    <button key={code} onClick={() => s.setLang(code as LangCode)} className={`rounded px-2 py-0.5 ${lang === code ? 'bg-ion-sky text-white' : 'text-slate-600'}`}>
                      {languageLabel(code)}
                    </button>
                  ))}
                </div>
              )}
              {!pdfMode && allowText && q.regions.length > 0 && (
                <div className="flex rounded-md border border-slate-300 p-0.5">
                  {(['snippet', 'text'] as const).map((m) => (
                    <button key={m} onClick={() => setView(m)} className={`rounded px-2 py-0.5 ${view === m ? 'bg-ion-sky text-white' : 'text-slate-600'}`}>
                      {m === 'snippet' ? 'Original' : 'Text'}
                    </button>
                  ))}
                </div>
              )}
              {!pdfMode && (
                <div className="flex items-center rounded-md border border-slate-300">
                  <button className="px-1.5 py-1 hover:bg-slate-100" onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))} title="Zoom out">
                    <Minus size={13} />
                  </button>
                  <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button className="px-1.5 py-1 hover:bg-slate-100" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} title="Zoom in">
                    <Plus size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {pdfMode ? (
            <div className="flex min-h-0 flex-1">
              <PdfViewer paper={paper} q={displayQ} />
              <div className="w-72 shrink-0 overflow-auto border-l border-slate-200 p-4">
                <div className="mb-3 text-sm font-medium">Your answer for Q.{labels.get(q.id)}</div>
                <AnswerInput key={q.id} q={answerQ} value={s.draft} onChange={s.setDraft} showOptionText={false} natLabel={typeLabel('NAT', paper.preset)} />
              </div>
            </div>
          ) : q.context ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-slate-200">
              <div className="overflow-auto p-5">
                <ContextBody q={displayQ} mode={view} zoom={zoom} lang={lang} />
              </div>
              <div className="overflow-auto p-5">
                <QuestionPane q={displayQ} answerQ={answerQ} view={allowText ? view : 'snippet'} zoom={zoom} lang={lang} natLabel={typeLabel('NAT', paper.preset)} />
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <QuestionPane q={displayQ} answerQ={answerQ} view={allowText ? view : 'snippet'} zoom={zoom} lang={lang} natLabel={typeLabel('NAT', paper.preset)} />
            </div>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
            <button className="btn border border-slate-300 bg-white hover:bg-slate-100" onClick={s.markAndNext}>
              Mark for Review &amp; Next
            </button>
            <button className="btn border border-slate-300 bg-white hover:bg-slate-100" onClick={s.clearResponse}>
              Clear Response
            </button>
            <button
              className="btn border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              onClick={() => {
                const others = paper.sections.some((sec) => sec.id !== activeSection.id && !skipped.has(sec.id));
                if (!others) {
                  alert('This is the only section still being counted.');
                  return;
                }
                if (!confirm(`Skip “${activeSection.name}”? Its marks will not be counted.`)) return;
                if (s.skipSection(activeSection.id) === 'empty') setModal('submit');
              }}
            >
              Skip section
            </button>
            <button className="btn ml-auto bg-ion-sky px-6 text-white hover:bg-ion-blue" onClick={s.saveAndNext}>
              Save &amp; Next
            </button>
          </div>
        </div>

        <aside className="flex w-[300px] shrink-0 flex-col border-l border-slate-200 bg-[#f4f8fc]">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-200 text-slate-500">
              <UserRound size={22} />
            </span>
            <span className="font-medium">{attempt.candidateName}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-b border-slate-200 px-4 py-3 text-xs">
            <LegendItem cls="qbadge-answered" n={counts.answered} label="Answered" />
            <LegendItem cls="qbadge-notAnswered" n={counts.notAnswered} label="Not Answered" />
            <LegendItem cls="qbadge-notVisited" n={counts.notVisited} label="Not Visited" />
            <LegendItem cls="qbadge-marked" n={counts.marked} label="Marked for Review" />
            <div className="col-span-2">
              <LegendItem cls="qbadge-answeredMarked" n={counts.answeredMarked} label="Answered & Marked for Review (will be evaluated)" />
            </div>
          </div>
          <div className="bg-ion-sky px-4 py-1.5 text-sm font-semibold text-white">{activeSection.name}</div>
          <div className="px-4 pt-2 text-xs text-slate-500">Choose a question</div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            <div className="grid grid-cols-5 gap-2">
              {paper.questions
                .filter((x) => x.sectionId === activeSection.id)
                .map((x) => (
                  <button
                    key={x.id}
                    onClick={() => s.goto(x.id)}
                    className={`qbadge qbadge-${statusOf(attempt.responses[x.id])} ${x.id === q.id ? 'qbadge-current' : ''}`}
                  >
                    {labels.get(x.id)}
                  </button>
                ))}
            </div>
          </div>
          <div className="border-t border-slate-200 p-3">
            {isLastGroup ? (
              <button className="btn w-full bg-ion-answered text-white hover:brightness-95" onClick={() => setModal('submit')}>
                Submit
              </button>
            ) : (
              <button
                className="btn w-full bg-ion-answered text-white hover:brightness-95"
                disabled={!paper.allowEarlySectionSubmit}
                title={paper.allowEarlySectionSubmit ? '' : 'You can move on when the section timer ends'}
                onClick={() => setModal('section')}
              >
                Submit section &amp; continue
              </button>
            )}
          </div>
        </aside>
      </div>

      {modal === 'submit' && (
        <ConfirmModal
          title="Submit the test?"
          paper={paper}
          sectionIds={paper.sections.map((x) => x.id)}
          confirm="Yes, submit"
          onCancel={() => setModal(null)}
          onConfirm={finish}
        />
      )}
      {modal === 'section' && (
        <ConfirmModal
          title={`Submit ${sections.map((x) => x.name).join(' + ')}?`}
          note="You will not be able to return to this section."
          paper={paper}
          sectionIds={group.sectionIds}
          confirm="Yes, go to next section"
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            s.nextGroup();
          }}
        />
      )}
      {modal && typeof modal === 'object' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-xl">
            <AlertTriangle className="mx-auto text-amber-500" size={32} />
            <h2 className="mt-2 text-lg font-semibold">Section time is over</h2>
            <p className="mt-1 text-sm text-slate-600">Your saved answers in the previous section are locked in. The next section's timer has started.</p>
            <button className="btn mt-5 bg-ion-sky px-6 text-white" onClick={() => setModal(null)}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionPane({ q, answerQ, view, zoom, natLabel, lang }: { q: Question; answerQ: Question; view: 'snippet' | 'text'; zoom: number; natLabel: string; lang?: LangCode }) {
  const { draft, setDraft } = useExam();
  const readable = textIsReadable(`${q.text}\n${q.options.join('\n')}`);
  const textMode = view === 'text' && (readable || !q.regions.length);
  return (
    <div className="space-y-5">
      <QuestionBody q={q} mode={view} zoom={zoom} lang={lang} />
      <div className="border-t border-slate-100 pt-4">
        <AnswerInput key={q.id} q={answerQ} value={draft} onChange={setDraft} showOptionText={textMode} natLabel={natLabel} compact={!textMode && answerQ.type !== 'NAT'} />
      </div>
    </div>
  );
}

function PdfViewer({ paper, q }: { paper: Paper; q: Question }) {
  const ref = useRef<HTMLDivElement>(null);
  const fileId = q.fileId || paper.files[0]?.id;
  const pages = paper.files.find((f) => f.id === fileId)?.pages ?? 0;
  const [visible, setVisible] = useState<Set<number>>(() => new Set([1, 2]));

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) if (e.isIntersecting) next.add(Number((e.target as HTMLElement).dataset.slot));
          return next.size === prev.size ? prev : next;
        }),
      { root, rootMargin: '800px 0px' },
    );
    root.querySelectorAll('[data-slot]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages]);

  useEffect(() => {
    const r = q.regions[0];
    const root = ref.current;
    if (!r || !root) return;
    setVisible((prev) => (prev.has(r.page) ? prev : new Set(prev).add(r.page)));
    pageImageUrl(fileId, r.page).then((img) => {
      const slot = root.querySelector<HTMLElement>(`[data-slot="${r.page}"]`);
      if (!slot) return;
      root.scrollTo({ top: slot.offsetTop + (r.y0 / img.h) * slot.offsetHeight - 24, behavior: 'smooth' });
    });
  }, [q.id, fileId]);

  if (!fileId) return <div className="flex-1 p-6 text-slate-500">No PDF attached.</div>;
  return (
    <div ref={ref} className="relative min-h-0 flex-1 space-y-4 overflow-auto bg-slate-200 p-4">
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <div key={n} data-slot={n} className="mx-auto max-w-[900px]">
          {visible.has(n) ? <PdfPage fileId={fileId} page={n} highlight={q.regions} /> : <div className="aspect-[1/1.414] bg-white/60" />}
        </div>
      ))}
    </div>
  );
}

function LegendItem({ cls, n, label }: { cls: string; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`qbadge ${cls} h-8 w-9 shrink-0 text-xs`}>{n}</span>
      <span className="leading-tight text-slate-600">{label}</span>
    </div>
  );
}

function ConfirmModal({
  title,
  note,
  paper,
  sectionIds,
  confirm,
  onCancel,
  onConfirm,
}: {
  title: string;
  note?: string;
  paper: Paper;
  sectionIds: string[];
  confirm: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const attempt = useExam((st) => st.attempt!);
  const groups = useExam((st) => st.groups);
  const reachable = new Set(groups.slice(attempt.groupIndex).flatMap((g) => g.sectionIds));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-3 text-lg font-semibold">{title}</div>
        <div className="overflow-x-auto p-5">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                {['Section', 'Questions', 'Answered', 'Not answered', 'Marked', 'Answered & marked', 'Not visited'].map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paper.sections
                .filter((sec) => sectionIds.includes(sec.id))
                .map((sec) => {
                  const c = sectionCounts(paper, attempt, [sec.id]);
                  return (
                    <tr key={sec.id} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-medium">
                        {sec.name}
                        {(attempt.skippedSectionIds ?? []).includes(sec.id) && <span className="ml-1 text-xs text-slate-400">(skipped, not counted)</span>}
                        {!reachable.has(sec.id) && !(attempt.skippedSectionIds ?? []).includes(sec.id) && <span className="ml-1 text-xs text-slate-400">(closed)</span>}
                      </td>
                      <td className="px-2">{c.total}</td>
                      <td className="px-2 text-emerald-700">{c.answered}</td>
                      <td className="px-2 text-red-600">{c.notAnswered}</td>
                      <td className="px-2 text-purple-700">{c.marked}</td>
                      <td className="px-2 text-purple-700">{c.answeredMarked}</td>
                      <td className="px-2 text-slate-500">{c.notVisited}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {note && <p className="mt-3 text-sm text-amber-700">{note}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button className="btn-secondary" onClick={onCancel}>
            No, go back
          </button>
          <button className="btn bg-ion-answered px-5 text-white" onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Palette labels: the number printed in the PDF when it's unique within its section, else the position. */
function questionLabels(paper: Paper) {
  const out = new Map<string, number>();
  for (const sec of paper.sections) {
    const qs = paper.questions.filter((q) => q.sectionId === sec.id);
    const unique = new Set(qs.map((q) => q.sourceNumber)).size === qs.length && qs.every((q) => q.sourceNumber > 0);
    qs.forEach((q, i) => out.set(q.id, unique ? q.sourceNumber : i + 1));
  }
  return out;
}
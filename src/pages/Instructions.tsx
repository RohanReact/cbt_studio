import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { defaultSkippedSections, languageLabel, uid } from '../lib/build';
import { db } from '../lib/db';
import { timerGroups, typeLabel } from '../lib/presets';
import { useAuth } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import type { Attempt, LangCode, Paper } from '../lib/types';

const NAME_KEY = 'cbt-candidate-name';

export function createAttempt(paper: Paper, candidateName: string, opts?: { skippedSectionIds?: string[]; lang?: LangCode }): Attempt {
  const groups = timerGroups(paper);
  const skipped = new Set(opts?.skippedSectionIds ?? []);
  let groupIndex = 0;
  let first = paper.questions.find((q) => groups[groupIndex]?.sectionIds.includes(q.sectionId) && !skipped.has(q.sectionId));
  while (!first && groupIndex + 1 < groups.length) {
    groupIndex += 1;
    first = paper.questions.find((q) => groups[groupIndex].sectionIds.includes(q.sectionId) && !skipped.has(q.sectionId));
  }
  first ??= paper.questions[0];
  return {
    id: uid(),
    paperId: paper.id,
    paperName: paper.name,
    candidateName,
    status: 'in-progress',
    startedAt: Date.now(),
    responses: { [first.id]: { value: null, visited: true, marked: false, timeMs: 0 } },
    currentQid: first.id,
    groupIndex,
    timeLeftMs: (groups[groupIndex] ?? groups[0]).minutes * 60_000,
    timeUsedMs: 0,
    skippedSectionIds: [...skipped],
    lang: opts?.lang ?? 'en',
  };
}

export default function Instructions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: paper, loading } = useAsync(() => db.paper(id!), [id]);
  const { user } = useAuth();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [agreed, setAgreed] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [lang, setLang] = useState<LangCode>('en');
  const [readyPaper, setReadyPaper] = useState<string | null>(null);

  useEffect(() => {
    if (!paper || readyPaper === paper.id) return;
    setSkipped(defaultSkippedSections(paper));
    setLang(paper.languages?.[0] ?? 'en');
    setReadyPaper(paper.id);
  }, [paper, readyPaper]);

  useEffect(() => {
    if (!localStorage.getItem(NAME_KEY) && user?.name) setName(user.name);
  }, [user?.name]);

  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!paper) return <p className="p-8">Paper not found.</p>;

  const groups = timerGroups(paper);
  const sectionName = (sid: string) => paper.sections.find((s) => s.id === sid)?.name ?? '';
  const missing = paper.questions.filter((q) => !q.answer).length;

  const counted = paper.sections.filter((s) => !skipped.includes(s.id));
  const start = async () => {
    localStorage.setItem(NAME_KEY, name.trim());
    const attempt = createAttempt(paper, name.trim() || 'Candidate', { skippedSectionIds: skipped, lang });
    await db.saveAttempt(attempt);
    navigate(`/exam/${attempt.id}`, { replace: true });
  };

  const choiceGroups = [...new Set(paper.sections.map((s) => s.choiceGroup).filter(Boolean))] as string[];
  const inChoice = new Set(paper.sections.filter((s) => s.choiceGroup).map((s) => s.id));

  const types = [...new Set(paper.questions.map((q) => q.type))];
  const marking = types.map((t) => {
    const qs = paper.questions.filter((q) => q.type === t);
    const marks = [...new Set(qs.map((q) => q.marks))].join(' / ');
    const neg = [...new Set(qs.map((q) => q.negative))].join(' / ');
    return { t, n: qs.length, marks, neg };
  });

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="flex h-14 items-center bg-ion-blue px-5 text-white">
        <span className="font-semibold">{paper.name}</span>
        {paper.setCode && <span className="ml-3 rounded bg-white/15 px-2 py-0.5 text-xs">Set {paper.setCode}</span>}
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-6">
        <Link to={`/paper/${paper.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> Back to editor
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">General Instructions</h1>
        <p className="mt-1 text-sm text-slate-500">Please read the instructions carefully.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="mb-2 font-medium text-slate-900">Paper summary</h2>
            <table className="w-full text-sm">
              <tbody>
                {groups.map((g, gi) => (
                  <tr key={gi} className="border-t border-slate-100 first:border-0">
                    <td className="py-1.5 text-slate-700">
                      {g.sectionIds.map(sectionName).join(' + ')}
                      <div className="text-xs text-slate-500">{paper.questions.filter((q) => g.sectionIds.includes(q.sectionId)).length} questions</div>
                    </td>
                    <td className="py-1.5 text-right font-medium">{g.minutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="mb-2 font-medium text-slate-900">Marking scheme</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-1 font-medium">Type</th>
                  <th className="pb-1 font-medium">Questions</th>
                  <th className="pb-1 font-medium">Correct</th>
                  <th className="pb-1 font-medium">Wrong</th>
                </tr>
              </thead>
              <tbody>
                {marking.map((m) => (
                  <tr key={m.t} className="border-t border-slate-100">
                    <td className="py-1.5">{typeLabel(m.t, paper.preset)}</td>
                    <td>{m.n}</td>
                    <td className="text-emerald-700">+{m.marks}</td>
                    <td className="text-red-600">{m.neg === '0' ? '0' : `−${m.neg}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Unattempted questions get 0. MSQ needs every correct option and no wrong one.</p>
          </div>
        </div>

        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            The countdown timer at the top right shows the time left. When it reaches zero the {paper.timing === 'sectional' ? 'section ends automatically and the next one starts' : 'test is submitted automatically'}.
          </li>
          {paper.timing === 'sectional' && <li>Sections are timed separately. You cannot go back to a section once its time is over.</li>}
          <li>
            The question palette on the right shows the status of each question:
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Legend cls="qbadge-notVisited" text="You have not visited the question yet." />
              <Legend cls="qbadge-notAnswered" text="You have not answered the question." />
              <Legend cls="qbadge-answered" text="You have answered the question." />
              <Legend cls="qbadge-marked" text="Not answered, but marked for review." />
              <Legend cls="qbadge-answeredMarked" text="Answered and marked for review — this will be evaluated." />
            </div>
          </li>
          <li>
            Your choice is saved only when you click <b>Save &amp; Next</b> or <b>Mark for Review &amp; Next</b>. Moving to another question from the palette without saving
            discards the selection, exactly as in the real exam.
          </li>
          <li>Numerical answer questions are answered with the on-screen keypad or your keyboard.</li>
          <li>Progress is saved on this device; if the page is closed you can resume from the library.</li>
        </ol>

        <section className="mt-6 rounded-lg border border-slate-200 p-4">
          <h2 className="font-medium text-slate-900">Sections to count</h2>
          <p className="mt-1 text-sm text-slate-500">
            A skipped section is left out of the score. Its marks are not added and its wrong answers are not subtracted. You can also skip a section after the test starts.
          </p>
          <div className="mt-3 space-y-4">
            {choiceGroups.map((group) => {
              const options = paper.sections.filter((s) => s.choiceGroup === group);
              const picked = options.find((s) => !skipped.includes(s.id))?.id ?? options[0].id;
              return (
                <fieldset key={group}>
                  <legend className="text-sm font-medium text-slate-800">Attempt one of these</legend>
                  <div className="mt-2 space-y-1.5">
                    {options.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name={group}
                          checked={picked === s.id}
                          onChange={() => setSkipped((prev) => [...prev.filter((id) => !options.some((o) => o.id === id)), ...options.filter((o) => o.id !== s.id).map((o) => o.id)])}
                        />
                        {s.name}
                        <span className="text-xs text-slate-400">{paper.questions.filter((q) => q.sectionId === s.id).length} questions</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
            <div className="space-y-1.5">
              {paper.sections
                .filter((s) => !inChoice.has(s.id))
                .map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={!skipped.includes(s.id)}
                      onChange={(e) => setSkipped((prev) => (e.target.checked ? prev.filter((id) => id !== s.id) : [...prev, s.id]))}
                    />
                    {s.name}
                    <span className="text-xs text-slate-400">{paper.questions.filter((q) => q.sectionId === s.id).length} questions</span>
                  </label>
                ))}
            </div>
          </div>
          {counted.length === 0 && <p className="mt-3 text-sm text-red-600">Keep at least one section. A test with every section skipped has nothing to score.</p>}
        </section>

        {(paper.languages?.length ?? 0) > 1 && (
          <section className="mt-4 rounded-lg border border-slate-200 p-4">
            <h2 className="font-medium text-slate-900">Question language</h2>
            <p className="mt-1 text-sm text-slate-500">This paper prints the same questions in more than one language. You can switch during the test.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(paper.languages ?? ['en']).map((code) => (
                <button key={code} type="button" onClick={() => setLang(code)} className={`rounded-full px-3 py-1 text-sm ${lang === code ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {languageLabel(code)}
                </button>
              ))}
            </div>
          </section>
        )}

        {missing > 0 && (
          <p className="mt-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {missing} question{missing > 1 ? 's have' : ' has'} no answer key yet. You can start without one. After you submit, upload the key on the result page and the score updates.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-end gap-4 border-t border-slate-200 pt-5">
          <div>
            <label className="label">Candidate name</label>
            <input className="input w-64" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <label className="flex max-w-md items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />I have read and understood the instructions and am ready to begin.
          </label>
          <button className="btn ml-auto bg-ion-sky px-6 text-white hover:bg-ion-blue" disabled={!agreed || !paper.questions.length || counted.length === 0} onClick={start}>
            <Play size={16} /> I am ready to begin
          </button>
        </div>
      </div>
    </div>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`qbadge ${cls} shrink-0`}>1</span>
      <span>{text}</span>
    </div>
  );
}

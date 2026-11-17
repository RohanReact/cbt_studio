import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CheckCircle2, Clock, FileText, Target } from 'lucide-react';
import { grade } from '../lib/grading';
import { PRESETS } from '../lib/presets';
import { useAsync } from '../lib/useAsync';
import { db } from '../lib/db';
import type { Attempt, Paper } from '../lib/types';

export default function Dashboard() {
  const { data, loading } = useAsync(async () => {
    const [papers, attempts] = await Promise.all([db.papers(), db.allAttempts()]);
    return { papers, attempts };
  }, []);

  if (loading && !data) return <p className="text-slate-500">Loading your dashboard…</p>;
  const papers = data?.papers ?? [];
  const attempts = data?.attempts ?? [];
  const byId = new Map(papers.map((p) => [p.id, p]));
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const live = attempts.filter((a) => a.status === 'in-progress');

  const rows = submitted
    .map((attempt) => {
      const paper = byId.get(attempt.paperId);
      if (!paper) return null;
      const { total, bySection } = grade(paper, attempt);
      const pct = total.maxScore ? Math.round((total.score / total.maxScore) * 1000) / 10 : null;
      return { attempt, paper, total, bySection, pct };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => (b.attempt.submittedAt ?? b.attempt.startedAt) - (a.attempt.submittedAt ?? a.attempt.startedAt));

  const scored = rows.filter((row) => row.pct !== null);
  const avg = scored.length ? Math.round((scored.reduce((s, row) => s + (row.pct ?? 0), 0) / scored.length) * 10) / 10 : null;
  const best = scored.reduce<(typeof scored)[number] | null>((top, row) => (!top || (row.pct ?? 0) > (top.pct ?? 0) ? row : top), null);

  const byPreset = new Map<string, { papers: number; tests: number; pct: number[] }>();
  for (const paper of papers) {
    const slot = byPreset.get(paper.preset) ?? { papers: 0, tests: 0, pct: [] };
    slot.papers += 1;
    byPreset.set(paper.preset, slot);
  }
  for (const row of rows) {
    const slot = byPreset.get(row.paper.preset) ?? { papers: 0, tests: 0, pct: [] };
    slot.tests += 1;
    if (row.pct !== null) slot.pct.push(row.pct);
    byPreset.set(row.paper.preset, slot);
  }

  const sections = new Map<string, { correct: number; wrong: number }>();
  for (const row of rows) {
    for (const section of row.bySection) {
      if (section.skipped > 0 && section.maxScore === 0) continue;
      const slot = sections.get(section.section.name) ?? { correct: 0, wrong: 0 };
      slot.correct += section.correct;
      slot.wrong += section.wrong;
      sections.set(section.section.name, slot);
    }
  }
  const sectionRows = [...sections.entries()]
    .map(([name, stat]) => ({
      name,
      ...stat,
      accuracy: stat.correct + stat.wrong ? Math.round((stat.correct / (stat.correct + stat.wrong)) * 1000) / 10 : null,
    }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));

  const waiting = papers.filter((p) => p.questions.some((q) => !q.answer));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Every paper you have added, and every test you have finished or left in progress.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card icon={<FileText size={18} className="text-indigo-600" />} label="Papers added" value={papers.length} hint={waiting.length ? `${waiting.length} still need an answer key` : 'Answer keys are in place'} />
        <Card icon={<CheckCircle2 size={18} className="text-emerald-600" />} label="Tests completed" value={submitted.length} hint={live.length ? `${live.length} still in progress` : 'Nothing left open'} />
        <Card icon={<Target size={18} className="text-indigo-600" />} label="Average score" value={avg === null ? '—' : `${avg}%`} hint={scored.length ? `Across ${scored.length} scored tests` : 'Finish a test with an answer key'} />
        <Card icon={<BarChart3 size={18} className="text-amber-600" />} label="Best score" value={best?.pct === null || !best ? '—' : `${best.pct}%`} hint={best ? best.paper.name : 'No scored test yet'} />
      </div>

      {papers.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-slate-600">Import a question paper to see scores, sections and trends here.</p>
          <Link to="/import" className="btn-primary mt-4">
            Import a paper
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-semibold text-slate-900">Recent tests</h2>
              <Link to="/" className="text-sm text-indigo-600">
                Library
              </Link>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-500">No finished test yet. {live.length ? 'You have one in progress.' : 'Start a paper from the library.'}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    {['Paper', 'Exam', 'Score', 'Accuracy', 'When'].map((h) => (
                      <th key={h} className="px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 12).map((row) => (
                    <tr key={row.attempt.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <Link to={`/result/${row.attempt.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                          {row.paper.name}
                        </Link>
                      </td>
                      <td className="px-4 text-slate-600">{PRESETS[row.paper.preset].label}</td>
                      <td className="px-4">
                        {row.pct === null ? <span className="text-amber-700">Needs key</span> : <b>{row.total.score}</b>}
                        {row.pct !== null && <span className="text-slate-400"> / {row.total.maxScore}</span>}
                      </td>
                      <td className="px-4">{row.total.unevaluated && !row.total.correct && !row.total.wrong ? '—' : `${row.total.accuracy}%`}</td>
                      <td className="px-4 text-slate-500">{new Date(row.attempt.submittedAt ?? row.attempt.startedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-4">
            <div className="card p-4">
              <h2 className="mb-3 font-semibold text-slate-900">By exam</h2>
              <div className="space-y-3">
                {[...byPreset.entries()].map(([preset, stat]) => {
                  const mean = stat.pct.length ? Math.round(stat.pct.reduce((s, n) => s + n, 0) / stat.pct.length) : 0;
                  return (
                    <div key={preset}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{PRESETS[preset as Paper['preset']]?.label ?? preset}</span>
                        <span className="text-slate-500">
                          {stat.papers} paper{stat.papers === 1 ? '' : 's'} · {stat.tests} test{stat.tests === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${stat.pct.length ? mean : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-4">
              <h2 className="mb-1 font-semibold text-slate-900">Section accuracy</h2>
              <p className="mb-3 text-xs text-slate-500">Across finished tests. Skipped sections are left out. Lower accuracy is listed first.</p>
              {sectionRows.length === 0 ? (
                <p className="text-sm text-slate-500">Finish a test that has an answer key to see this.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {sectionRows.slice(0, 8).map((row) => (
                    <li key={row.name} className="flex items-center justify-between gap-3">
                      <span className="truncate">{row.name}</span>
                      <span className={row.accuracy !== null && row.accuracy < 50 ? 'font-medium text-red-600' : 'text-slate-700'}>
                        {row.accuracy === null ? '—' : `${row.accuracy}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {live.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
            <Clock size={16} /> In progress
          </h2>
          <div className="flex flex-wrap gap-2">
            {live.map((attempt) => (
              <LiveLink key={attempt.id} attempt={attempt} paper={byId.get(attempt.paperId)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string | number; hint: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function LiveLink({ attempt, paper }: { attempt: Attempt; paper?: Paper }) {
  return (
    <Link to={`/exam/${attempt.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
      <div className="font-medium">{paper?.name ?? attempt.paperName}</div>
      <div className="text-xs text-slate-500">Started {new Date(attempt.startedAt).toLocaleString()}</div>
    </Link>
  );
}

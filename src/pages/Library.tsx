import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, FileUp, KeyRound, Pencil, Play, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { UsageBanner } from '../components/UsageBanner';
import { db } from '../lib/db';
import { PRESETS } from '../lib/presets';
import { useAuth } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import type { Attempt, Paper } from '../lib/types';
import { SAMPLE_FILES, examById } from '../../shared/exams';
import { useState } from 'react';

export default function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [examId, setExamId] = useState('all');
  const { data, loading, reload } = useAsync(async () => {
    const [papers, attempts] = await Promise.all([db.papers(), db.allAttempts()]);
    return { papers, attempts };
  }, []);

  if (loading && !data) return <p className="text-slate-500">Loading…</p>;
  const papers = data?.papers ?? [];
  const interests = user?.exams ?? [];
  const visible = papers.filter((paper) => {
    if (examId === 'all') return true;
    const exam = examById(examId);
    return exam ? paper.preset === exam.preset : true;
  });

  const remove = async (p: Paper) => {
    if (!confirm(`Delete "${p.name}" and all its attempts?`)) return;
    await db.deletePaper(p.id);
    reload();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your papers</h1>
          <p className="text-sm text-slate-500">
            {interests.length
              ? `Showing papers for ${interests.map((id) => examById(id)?.label).filter(Boolean).join(', ')}. Any other PDF can still be imported.`
              : 'Saved to your account. Pick your exams in Account so this library can follow them.'}
          </p>
        </div>
        <Link to="/import" className="btn-primary">
          <FileUp size={16} /> Import question papers
        </Link>
      </div>

      <UsageBanner />
      {interests.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <FilterChip active={examId === 'all'} onClick={() => setExamId('all')}>
            All
          </FilterChip>
          {interests.map((id) => (
            <FilterChip key={id} active={examId === id} onClick={() => setExamId(id)}>
              {examById(id)?.label ?? id}
            </FilterChip>
          ))}
        </div>
      )}

      {papers.length === 0 ? (
        <EmptyState interests={interests} onSamples={(id) => navigate(id ? `/import?samples=${id}` : '/import?samples=1')} />
      ) : visible.length === 0 ? (
        <EmptyState interests={[examId]} onSamples={(id) => navigate(id ? `/import?samples=${id}` : '/import')} filtered />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <PaperCard key={p.id} paper={p} attempts={(data?.attempts ?? []).filter((a) => a.paperId === p.id)} onDelete={() => remove(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ${active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
    >
      {children}
    </button>
  );
}

function PaperCard({ paper, attempts, onDelete }: { paper: Paper; attempts: Attempt[]; onDelete: () => void }) {
  const keyed = paper.questions.filter((q) => q.answer).length;
  const done = attempts.filter((a) => a.status === 'submitted' && a.summary);
  const best = done.reduce<Attempt | null>((b, a) => (!b || a.summary!.score > b.summary!.score ? a : b), null);
  const live = attempts.find((a) => a.status === 'in-progress');
  const last = done.sort((a, b) => b.startedAt - a.startedAt)[0];

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-2 font-semibold text-slate-900">{paper.name}</h2>
        <span className="flex shrink-0 gap-1">
          {paper.setCode && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Set {paper.setCode}</span>}
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{PRESETS[paper.preset].label}</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>{paper.questions.length} questions</span>
        <span>{paper.sections.length} section{paper.sections.length === 1 ? '' : 's'}</span>
        <span className="inline-flex items-center gap-1">
          <Clock size={14} />
          {paper.timing === 'sectional' ? 'Sectional' : `${paper.durationMin} min`}
        </span>
        <span className={`inline-flex items-center gap-1 ${keyed === paper.questions.length && keyed ? 'text-emerald-600' : 'text-amber-600'}`}>
          <KeyRound size={14} /> {keyed}/{paper.questions.length} answers
        </span>
      </div>
      {best && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={16} /> Best {best.summary!.score}/{best.summary!.maxScore} · {done.length} attempt{done.length === 1 ? '' : 's'}
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {live ? (
          <Link to={`/exam/${live.id}`} className="btn-primary">
            <RotateCcw size={16} /> Resume test
          </Link>
        ) : (
          <Link to={`/paper/${paper.id}/start`} className={`btn-primary ${paper.questions.length ? '' : 'pointer-events-none opacity-50'}`}>
            <Play size={16} /> Start test
          </Link>
        )}
        <Link to={`/paper/${paper.id}`} className="btn-secondary">
          <Pencil size={16} /> Edit
        </Link>
        {last && (
          <Link to={`/result/${last.id}`} className="btn-ghost">
            Last result
          </Link>
        )}
        <button onClick={onDelete} className="btn-ghost ml-auto text-slate-400 hover:text-red-600" title="Delete paper">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ interests, onSamples, filtered }: { interests: string[]; onSamples: (examId?: string) => void; filtered?: boolean }) {
  const named = interests.map((id) => examById(id)).filter((exam) => exam !== undefined);
  const withSamples = named.filter((exam) => SAMPLE_FILES[exam.id]?.length);
  return (
    <div className="card p-8">
      <h2 className="text-lg font-semibold text-slate-900">{filtered ? 'No papers for this exam yet' : 'Your library is empty'}</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Drop a question-paper PDF. CAT, GATE, JEE, NEET, CUET, CLAT, SSC and bank papers pick up a timer and marking scheme. A board paper, university paper, or any other PDF still becomes a timed test — choose Custom in the editor and set the minutes.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/import" className="btn-primary">
          <FileUp size={16} /> Import a PDF
        </Link>
        {withSamples.map((exam) => (
          <button key={exam.id} onClick={() => onSamples(exam.id)} className="btn-secondary">
            <Wand2 size={16} /> Try a {exam.label} sample
          </button>
        ))}
        {!withSamples.length && !filtered && (
          <button onClick={() => onSamples()} className="btn-secondary">
            <Wand2 size={16} /> Try sample papers
          </button>
        )}
      </div>
    </div>
  );
}

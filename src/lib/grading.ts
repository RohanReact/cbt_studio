import type { Attempt, Paper, QResponse, QStatus, Question, ResponseValue } from './types';

export type Outcome = 'correct' | 'wrong' | 'unattempted' | 'unevaluated' | 'dropped' | 'skipped';

export interface QResult {
  q: Question;
  index: number;
  response?: QResponse;
  outcome: Outcome;
  score: number;
}

export function hasValue(v: ResponseValue | undefined): boolean {
  if (v == null) return false;
  return Array.isArray(v) ? v.length > 0 : v.trim() !== '';
}

export function statusOf(r: QResponse | undefined): QStatus {
  if (!r || !r.visited) return 'notVisited';
  const answered = hasValue(r.value);
  if (r.marked) return answered ? 'answeredMarked' : 'marked';
  return answered ? 'answered' : 'notAnswered';
}

export function gradeQuestion(q: Question, value: ResponseValue | undefined): { outcome: Outcome; score: number } {
  if (q.answer?.kind === 'dropped') return { outcome: 'dropped', score: q.marks };
  if (!hasValue(value)) return { outcome: 'unattempted', score: 0 };
  if (!q.answer) return { outcome: 'unevaluated', score: 0 };

  let correct = false;
  if (q.answer.kind === 'range') {
    const n = Number(String(value).trim());
    correct = Number.isFinite(n) && n >= q.answer.min - 1e-9 && n <= q.answer.max + 1e-9;
  } else if (Array.isArray(value)) {
    const key = q.answer.values;
    correct =
      q.type === 'MSQ'
        ? value.length === key.length && value.every((v) => key.includes(v))
        : value.length === 1 && key.includes(value[0]);
  }
  return correct ? { outcome: 'correct', score: q.marks } : { outcome: 'wrong', score: -q.negative };
}

export function grade(paper: Paper, attempt: Attempt) {
  const skipped = new Set(attempt.skippedSectionIds ?? []);
  const items: QResult[] = paper.questions.map((q, index) => {
    const response = attempt.responses[q.id];
    if (skipped.has(q.sectionId)) return { q, index, response, outcome: 'skipped' as const, score: 0 };
    return { q, index, response, ...gradeQuestion(q, response?.value) };
  });

  const tally = (list: QResult[]) => {
    const count = (o: Outcome) => list.filter((i) => i.outcome === o).length;
    const correct = count('correct');
    const wrong = count('wrong');
    const counted = list.filter((i) => i.outcome !== 'skipped');
    const score = round(counted.reduce((s, i) => s + i.score, 0));
    const maxScore = round(counted.reduce((s, i) => s + i.q.marks, 0));
    const attempted = counted.filter((i) => hasValue(i.response?.value)).length;
    return {
      score,
      maxScore,
      correct,
      wrong,
      unattempted: count('unattempted'),
      unevaluated: count('unevaluated'),
      dropped: count('dropped'),
      skipped: count('skipped'),
      attempted,
      accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 1000) / 10 : 0,
      negative: round(list.filter((i) => i.outcome === 'wrong').reduce((s, i) => s - i.score, 0)),
      timeMs: list.reduce((s, i) => s + (i.response?.timeMs ?? 0), 0),
    };
  };

  const bySection = paper.sections.map((s) => ({ section: s, ...tally(items.filter((i) => i.q.sectionId === s.id)) }));
  return { items, total: tally(items), bySection };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

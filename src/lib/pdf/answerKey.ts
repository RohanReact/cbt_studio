import type { Answer, QType, Question, Section } from '../types';

export interface KeyEntry {
  num: number;
  raw: string;
  type?: QType;
  marks?: number;
}

const GATE_ROW =
  /^\s*(?:Q\.?\s*)?(\d{1,3})\b.*?\b(MCQ|MSQ|NAT)\b\s+(?:([A-Z]{2,4}\d?)\s+)?(.+?)(?:\s+(\d))?\s*$/i;
const LETTERS = String.raw`\(?[A-Ea-e]\)?(?:\s*(?:,|&|;|and|or)\s*\(?[A-Ea-e]\)?)*|MTA|Bonus|Dropped|[A-E]{2,5}`;
const NUMBER = String.raw`\(?[-+]?\d*\.?\d+(?:\s*(?:to|–|—|~|-)\s*[-+]?\d*\.?\d+)?\)?`;
const QPREFIX = String.raw`(?:Q(?:ue(?:s(?:tion)?)?)?\.?\s*(?:No\.?\s*)?)?`;
const ANS_LABEL = String.raw`(?:Ans(?:wer)?\.?\s*[:\-]?\s*)?`;
const PAIR_LETTER = new RegExp(
  String.raw`(?<![\d.])${QPREFIX}(\d{1,3})\s*(?:[.):\-–—=]\s*|\s+)${ANS_LABEL}(${LETTERS})(?![A-Za-z0-9])`,
  'gi',
);
const PAIR_NUMBER = new RegExp(
  String.raw`(?<![\d.])${QPREFIX}(\d{1,3})\s*[.):\-–—=]\s*${ANS_LABEL}(${NUMBER})(?![\d.]|\s*[A-Za-z])`,
  'gi',
);

/**
 * When a key prints several booklet sets, keep the block for `setCode`.
 * A key that only has one set is returned unchanged.
 */
export function keyTextForSet(text: string, setCode?: string | null): string {
  if (!setCode) return text;
  const re = /(?:^|\n)\s*(?:(?:test\s+)?booklet\s+code|set|code|P-[IVX]+)\s*[/:\-.]?\s*([A-E])\b/gi;
  const marks = [...text.matchAll(re)];
  const letters = new Set(marks.map((m) => m[1].toUpperCase()));
  if (letters.size < 2) return text;
  const wanted = setCode.toUpperCase();
  const mine = marks.find((m) => m[1].toUpperCase() === wanted);
  if (!mine || mine.index == null) return text;
  const next = marks.find((m) => (m.index ?? 0) > mine.index! && m[1].toUpperCase() !== wanted);
  return text.slice(mine.index, next?.index ?? text.length);
}

/** Pull (question number → raw answer) pairs out of free-form answer key text, in reading order. */
export function extractKeyEntries(text: string, setCode?: string | null): KeyEntry[] {
  return extractKeyEntriesFrom(keyTextForSet(text, setCode));
}

function extractKeyEntriesFrom(text: string): KeyEntry[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const gate: KeyEntry[] = [];
  for (const l of lines) {
    const m = l.match(GATE_ROW);
    if (m) gate.push({ num: Number(m[1]), type: m[2].toUpperCase() as QType, raw: m[4], marks: m[5] ? Number(m[5]) : undefined });
  }
  if (gate.length >= 3) return gate;

  const consumed = new Set<number>();
  const entries: { at: number; e: KeyEntry }[] = [];

  // Transposed tables: "Q.No 1 2 3 4" followed by "Ans B C A D".
  for (let i = 0; i < lines.length - 1; i++) {
    const nums = lines[i].replace(/^(?:Q(?:ue(?:s(?:tion)?)?)?\.?\s*(?:No\.?)?|S\.?\s*No\.?)\s*[:.]?/i, '').trim().split(/\s+/);
    if (nums.length < 3 || !nums.every((t) => /^\d{1,3}$/.test(t))) continue;
    const ints = nums.map(Number);
    if (!ints.every((n, k) => k === 0 || n === ints[k - 1] + 1)) continue;
    const vals = lines[i + 1].replace(/^(?:Ans(?:wer)?s?|Key|Correct(?: option)?)\s*[:.]?/i, '').trim().split(/\s+/);
    if (vals.length !== ints.length) continue;
    ints.forEach((n, k) => entries.push({ at: i * 1000 + k, e: { num: n, raw: vals[k] } }));
    consumed.add(i).add(i + 1);
    i++;
  }

  const rest = lines.map((l, i) => (consumed.has(i) ? '' : l));
  rest.forEach((line, li) => {
    const found: { start: number; end: number; e: KeyEntry }[] = [];
    for (const re of [PAIR_LETTER, PAIR_NUMBER]) {
      for (const m of line.matchAll(re)) found.push({ start: m.index!, end: m.index! + m[0].length, e: { num: Number(m[1]), raw: m[2] } });
    }
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    let cursor = -1;
    for (const f of found) {
      if (f.start < cursor) continue;
      entries.push({ at: li * 1000 + f.start / 1000, e: f.e });
      cursor = f.end;
    }
  });

  entries.sort((a, b) => a.at - b.at);
  const out = entries.map((x) => x.e);

  if (!out.length) {
    const letters = text.replace(/[\s,;]+/g, '');
    if (/^[A-Ea-e]+$/.test(letters)) return [...letters].map((c, i) => ({ num: i + 1, raw: c.toUpperCase() }));
  }
  return out;
}

type Value =
  | { kind: 'letters'; values: number[]; any: boolean }
  | { kind: 'number'; min: number; max: number }
  | { kind: 'dropped' };

export function parseKeyValue(raw: string): Value | null {
  const r = raw.trim();
  if (/^(?:mta|marks to all|bonus|dropped|deleted|cancelled|\*)$/i.test(r)) return { kind: 'dropped' };
  const stripped = r.replace(/[()]/g, '').trim();
  if (/^[A-Ea-e](?:\s*(?:,|&|;|and|or)?\s*[A-Ea-e])*$/i.test(stripped)) {
    const letters = stripped.replace(/\b(?:and|or)\b/gi, ' ').match(/[A-Ea-e]/g) ?? [];
    const values = [...new Set(letters.map((c) => c.toUpperCase().charCodeAt(0) - 65))].sort((a, b) => a - b);
    return { kind: 'letters', values, any: /\bor\b/i.test(stripped) };
  }
  const m = stripped.match(/^([-+]?\d*\.?\d+)(?:\s*(?:to|–|—|~|-|:)\s*([-+]?\d*\.?\d+))?$/i);
  if (m) {
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    return { kind: 'number', min: Math.min(a, b), max: Math.max(a, b) };
  }
  return null;
}

/** Apply one parsed key value to a question, adjusting its type when the key makes it obvious. */
export function answerFor(q: Question, v: Value, hintType?: QType): Partial<Question> | null {
  if (v.kind === 'dropped') return { answer: { kind: 'dropped' } };
  if (v.kind === 'letters') {
    const optionCount = Math.max(q.optionCount || 4, Math.max(...v.values) + 1);
    const type: QType = hintType && hintType !== 'NAT' ? hintType : v.values.length > 1 && !v.any ? 'MSQ' : q.type === 'MSQ' ? 'MSQ' : 'MCQ';
    return { type, optionCount, answer: { kind: 'choice', values: v.values } };
  }
  const isInt = Number.isInteger(v.min) && v.min === v.max;
  if (q.type !== 'NAT' && hintType !== 'NAT' && isInt && v.min >= 1 && v.min <= (q.optionCount || 4)) {
    return { answer: { kind: 'choice', values: [v.min - 1] } };
  }
  return { type: 'NAT', answer: { kind: 'range', min: v.min, max: v.max } };
}

function compatible(q: Question, v: Value) {
  if (v.kind === 'dropped') return true;
  if (v.kind === 'letters') return q.type !== 'NAT' || q.options.length === 0;
  return q.type === 'NAT' || (Number.isInteger(v.min) && v.min >= 1 && v.min <= (q.optionCount || 4));
}

/**
 * Match key entries to questions. Keys may number questions globally or restart per section,
 * so a few mappings are tried and the one that fits the most entries wins.
 */
export function applyKey(questions: Question[], sections: Section[], entries: KeyEntry[]) {
  const runs: KeyEntry[][] = [];
  for (const e of entries) {
    const run = runs[runs.length - 1];
    if (!run || e.num <= run[run.length - 1].num) runs.push([e]);
    else run.push(e);
  }

  const bySection = sections.map((s) => questions.filter((q) => q.sectionId === s.id));
  const uniqueSource = new Set(questions.map((q) => q.sourceNumber)).size === questions.length;

  const mappings: ((run: number, e: KeyEntry) => Question | undefined)[] = [
    (_r, e) => (uniqueSource ? questions.find((q) => q.sourceNumber === e.num) : undefined),
    (_r, e) => questions[e.num - 1],
    (r, e) => bySection[r]?.find((q) => q.sourceNumber === e.num),
    (r, e) => bySection[r]?.[e.num - 1],
  ];

  let best = { score: -1, pairs: [] as { q: Question; e: KeyEntry; v: Value }[] };
  for (const map of mappings) {
    const seen = new Set<string>();
    const pairs: { q: Question; e: KeyEntry; v: Value }[] = [];
    let score = 0;
    runs.forEach((run, r) =>
      run.forEach((e) => {
        const q = map(r, e);
        const v = parseKeyValue(e.raw);
        if (!q || !v || seen.has(q.id)) return;
        seen.add(q.id);
        pairs.push({ q, e, v });
        score += compatible(q, v) ? 1 : 0.25;
      }),
    );
    if (score > best.score) best = { score, pairs };
  }

  const patch = new Map<string, Partial<Question>>();
  for (const { q, e, v } of best.pairs) {
    const p = answerFor(q, v, e.type);
    if (!p) continue;
    if (e.marks !== undefined) Object.assign(p, { marksHint: e.marks });
    patch.set(q.id, p);
  }
  return {
    questions: questions.map((q) => (patch.has(q.id) ? { ...q, ...patch.get(q.id) } : q)),
    matched: patch.size,
  };
}

export function formatAnswer(a: Answer | null, optionStyle: 'alpha' | 'numeric' = 'alpha'): string {
  if (!a) return '—';
  if (a.kind === 'dropped') return 'Marks to all';
  if (a.kind === 'range') return a.min === a.max ? String(a.min) : `${a.min} to ${a.max}`;
  return a.values.map((v) => (optionStyle === 'numeric' ? String(v + 1) : String.fromCharCode(65 + v))).join(', ');
}

import { answerFor, applyKey, extractKeyEntries, parseKeyValue } from './pdf/answerKey';
import { detectSetCode, type ParseResult } from './pdf/parse';
import { applyPreset, PRESETS } from './presets';
import type { LangCode, Paper, PaperFile, PresetId, Question, QType, Section } from './types';

export const uid = () => crypto.randomUUID().slice(0, 8) + Date.now().toString(36).slice(-4);

interface BuildInput {
  name: string;
  file: PaperFile;
  parsed: ParseResult;
  /** Text of separately uploaded answer keys. */
  keyTexts: string[];
  preset: PresetId;
}

export function buildPaper({ name, file, parsed, keyTexts, preset }: BuildInput): Paper {
  let sections: Section[] = parsed.sections.map((n, i) => ({ id: uid(), name: n, timerGroup: i + 1 }));
  let questions: Question[] = parsed.questions.map((p) => ({
    id: uid(),
    sectionId: sections[p.section]?.id ?? sections[0].id,
    sourceNumber: p.sourceNumber,
    type: p.type,
    text: p.text,
    options: p.options,
    optionCount: p.options.length || (p.type === 'NAT' ? 0 : 4),
    optionStyle: p.optionStyle,
    answer: null,
    marks: 1,
    negative: 0,
    marksHint: p.marksHint,
    fileId: file.id,
    regions: p.regions,
    context: p.context,
    solution: p.solution,
    alt: p.alt,
  }));

  ({ sections, questions } = splitByPresetCounts(sections, questions, preset));
  sections = assignChoiceGroups(sections);
  const setCode = parsed.setCode || detectSetCode('', `${name} ${file.name}`) || undefined;

  const notes = [...parsed.notes];
  if (setCode && !notes.some((n) => n.startsWith('Booklet set'))) notes.push(`Booklet set ${setCode}.`);
  let inline = 0;
  questions = questions.map((q, i) => {
    const raw = parsed.questions[i]?.inlineAnswer;
    const v = raw ? parseKeyValue(raw) : null;
    const patch = v ? answerFor(q, v) : null;
    if (patch) inline++;
    return patch ? { ...q, ...patch } : q;
  });
  if (inline) notes.push(`Found ${inline} answers printed next to the questions.`);

  for (const text of [parsed.keyText, ...keyTexts].filter((t) => t.trim())) {
    const entries = extractKeyEntries(text, setCode);
    if (!entries.length) continue;
    const res = applyKey(questions, sections, entries);
    if (res.matched < 5 && questions.length > 40) {
      notes.push(`Ignored ${res.matched} stray answer${res.matched === 1 ? '' : 's'} that did not look like a full key. Upload the answer key when you have it.`);
    } else {
      questions = res.questions;
      notes.push(`Answer key: matched ${res.matched} of ${questions.length} questions.`);
    }
  }

  questions = withChoiceButtons(questions, preset);

  const languages = languagesOf(questions);
  const allowText = textAllowed(questions, languages);
  if (languages.length > 1) notes.push(`Language switch: ${languages.map(languageLabel).join(' / ')}.`);
  else if (!allowText) notes.push(`Questions are in ${languageLabel(languages[0] ?? 'mr')}. Text view is off, so each question is shown from the original page.`);
  else if (languages[0] && languages[0] !== 'en') notes.push(`Questions are in ${languageLabel(languages[0])}. Text view uses that script.`);

  const now = Date.now();
  const paper: Paper = {
    id: uid(),
    name,
    preset,
    createdAt: now,
    updatedAt: now,
    files: [file],
    sections,
    questions,
    durationMin: PRESETS[preset].durationMin,
    timing: 'total',
    groupMinutes: {},
    displayMode: questions.length ? 'snippet' : 'pdf',
    allowEarlySectionSubmit: true,
    parseNotes: notes,
    languages,
    setCode,
    allowText,
  };
  return applyPreset(paper, preset, { marking: true, timing: true });
}

/** Sections that share a choice group are alternatives, such as CTET Mathematics and Social Studies. */
export function assignChoiceGroups(sections: Section[]): Section[] {
  const pairs: [RegExp, RegExp, string][] = [[/mathematics and science/i, /social studies/i, 'subject']];
  let next = sections;
  for (const [a, b, group] of pairs) {
    const left = next.find((s) => a.test(s.name));
    const right = next.find((s) => b.test(s.name));
    if (!left || !right) continue;
    next = next.map((s) => (s.id === left.id || s.id === right.id ? { ...s, choiceGroup: group } : s));
  }
  const sets = next.filter((s) => /^Set [A-E]$/.test(s.name));
  if (sets.length >= 2) next = next.map((s) => (/^Set [A-E]$/.test(s.name) ? { ...s, choiceGroup: 'booklet' } : s));
  return next;
}

const DEVANAGARI = /[\u0900-\u097F]/g;
const LATIN = /[A-Za-z]/g;

export function scriptOf(text: string): LangCode {
  const dev = (text.match(DEVANAGARI) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  if (dev >= 20 && dev > latin * 0.35) {
    const lla = (text.match(/ळ/g) ?? []).length;
    if (/मराठी/.test(text) || lla >= 2) return 'mr';
    return 'hi';
  }
  return 'en';
}

export function languagesOf(questions: Question[]): LangCode[] {
  const body = questions.map((q) => `${q.text}\n${q.options.join('\n')}`).join('\n');
  const primary = scriptOf(body);
  const langs: LangCode[] = [primary];
  for (const lang of questions.flatMap((q) => (q.alt ? [q.alt.lang] : []))) {
    if (!langs.includes(lang)) langs.push(lang);
  }
  return langs;
}

/** For each choice group, keep one section and skip the rest until the candidate chooses. */
export function defaultSkippedSections(paper: Paper): string[] {
  const groups = new Map<string, string[]>();
  for (const section of paper.sections) {
    if (!section.choiceGroup) continue;
    const list = groups.get(section.choiceGroup) ?? [];
    list.push(section.id);
    groups.set(section.choiceGroup, list);
  }
  return [...groups.entries()].flatMap(([group, ids]) => {
    if (group === 'booklet' && paper.setCode) {
      const keep = ids.find((id) => paper.sections.find((s) => s.id === id)?.name.endsWith(` ${paper.setCode}`));
      if (keep) return ids.filter((id) => id !== keep);
    }
    return ids.slice(1);
  });
}

export function languageLabel(lang: LangCode) {
  if (lang === 'hi') return 'हिन्दी';
  if (lang === 'mr') return 'मराठी';
  if (lang === 'other') return 'Other language';
  return 'English';
}

/** Exams where every question is a 4-option MCQ. A missed option list must not become a number pad. */
const FOUR_CHOICES = new Set<PresetId>(['CTET', 'MHTCET', 'NEETUG', 'NEETPG', 'UPSC', 'CLAT', 'BITSAT', 'SSCCGL', 'IBPSPO', 'CUET', 'CMAT']);

function withChoiceButtons(questions: Question[], preset: PresetId): Question[] {
  const indic = questions.filter((q) => (q.text.match(/[\u0900-\u097F]/g) ?? []).length > 12).length;
  const numeric = questions.filter((q) => q.type !== 'NAT' && q.optionStyle === 'numeric').length;
  const force = FOUR_CHOICES.has(preset) || (indic > questions.length * 0.4 && numeric >= 5);
  if (!force) return questions;
  const styled = questions.filter((q) => q.type !== 'NAT');
  const style: Question['optionStyle'] = numeric >= styled.length / 2 ? 'numeric' : 'alpha';
  return questions.map((q) =>
    q.type === 'NAT'
      ? { ...q, type: 'MCQ', optionStyle: style, optionCount: 4 }
      : { ...q, optionCount: Math.max(q.optionCount, q.options.length, 4) },
  );
}

/** Marathi from a legacy font, and other text that is not real Unicode, stays on the page image. */
export function textAllowed(questions: Question[], languages: LangCode[]) {
  if ((languages[0] ?? 'en') === 'mr') return false;
  const sample = questions.slice(0, 40);
  if (!sample.length) return false;
  const ok = sample.filter((q) => textIsReadable(`${q.text}\n${q.options.join(' ')}`)).length;
  return ok / sample.length >= 0.75;
}

/** What the attempt screen should show for this question, including a 4-option pad when the paper has no numerical type. */
export function asAttemptQuestion(q: Question, paper: Pick<Paper, 'preset' | 'languages' | 'questions'>): Question {
  if (q.type !== 'NAT') return q;
  const indic = (paper.languages ?? []).includes('mr') || (q.text.match(/[\u0900-\u097F]/g) ?? []).length > 12;
  if (!FOUR_CHOICES.has(paper.preset) && !indic) return q;
  return { ...q, type: 'MCQ', optionStyle: 'numeric', optionCount: Math.max(q.optionCount, 4) };
}

/** Legacy fonts sometimes extract as private-use boxes. Those stay on the original page crop. */
export function textIsReadable(text: string) {
  let letters = 0;
  let bad = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 32) continue;
    const privateUse = (cp >= 0xe000 && cp <= 0xf8ff) || cp === 0xfffd;
    if (privateUse) {
      bad++;
      letters++;
      continue;
    }
    if (/\p{L}/u.test(ch)) letters++;
  }
  if (letters < 8) return bad === 0;
  return bad / letters < 0.2;
}

/** The question as it should be shown for the selected language. Option indexes stay the same. */
export function shownQuestion(q: Question, lang: LangCode | undefined): Question {
  if (!lang || lang === 'en' || !q.alt || q.alt.lang !== lang) return q;
  return {
    ...q,
    text: q.alt.text || q.text,
    options: q.alt.options.length ? q.alt.options : q.options,
    regions: q.alt.regions.length ? q.alt.regions : q.regions,
  };
}

/** When no section headings were found but the count matches the exam pattern (e.g. GATE 10 + 55), split by position. */
function splitByPresetCounts(sections: Section[], questions: Question[], preset: PresetId) {
  const defs = PRESETS[preset].sections;
  const total = defs.reduce((s, d) => s + (d.count ?? 0), 0);
  if (sections.length !== 1 || !defs.length || questions.length !== total) return { sections, questions };
  const next = defs.map((d) => ({ id: uid(), name: d.name, timerGroup: d.timerGroup }));
  let at = 0;
  const bounds = defs.map((d) => (at += d.count ?? 0));
  return {
    sections: next,
    questions: questions.map((q, i) => ({ ...q, sectionId: next[bounds.findIndex((b) => i < b)].id })),
  };
}

/** A blank paper for "OMR mode": the PDF is shown as-is and the user only defines answer slots. */
export function blankPaper(name: string, file: PaperFile, preset: PresetId, count: number, type: QType = 'MCQ'): Paper {
  const section: Section = { id: uid(), name: 'Section 1', timerGroup: 1 };
  const now = Date.now();
  const paper: Paper = {
    id: uid(),
    name,
    preset,
    createdAt: now,
    updatedAt: now,
    files: [file],
    sections: [section],
    questions: Array.from({ length: count }, (_, i) => newQuestion(section.id, file.id, i + 1, type)),
    durationMin: PRESETS[preset].durationMin,
    timing: 'total',
    groupMinutes: {},
    displayMode: 'pdf',
    allowEarlySectionSubmit: true,
    parseNotes: [],
  };
  return applyPreset(paper, preset, { marking: true, timing: true });
}

export function newQuestion(sectionId: string, fileId: string, sourceNumber: number, type: QType = 'MCQ'): Question {
  return {
    id: uid(),
    sectionId,
    sourceNumber,
    type,
    text: '',
    options: [],
    optionCount: type === 'NAT' ? 0 : 4,
    optionStyle: 'alpha',
    answer: null,
    marks: 1,
    negative: 0,
    fileId,
    regions: [],
  };
}

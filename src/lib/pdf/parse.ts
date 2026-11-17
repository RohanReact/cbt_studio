import type { LangCode, QType, Region } from '../types';
import type { Line, PageLayout } from './layout';

export interface ParsedQuestion {
  sourceNumber: number;
  section: number;
  text: string;
  options: string[];
  optionStyle: 'alpha' | 'numeric';
  type: QType;
  marksHint?: number;
  /** Answer printed right after the question ("Ans: (B)"). */
  inlineAnswer?: string;
  solution?: string;
  regions: Region[];
  context?: { text: string; regions: Region[] };
  alt?: { lang: Exclude<LangCode, 'en'>; text: string; options: string[]; regions: Region[] };
}

export interface ParseResult {
  questions: ParsedQuestion[];
  sections: string[];
  /** Text after an "Answer Key" heading, if the paper contains one. */
  keyText: string;
  notes: string[];
  /** Booklet set when the paper is one of A/B/C/D/E, not a mix of sets. */
  setCode?: string | null;
}

const Q_PREFIXED = /^(?:Q|Que|Ques|Question)\s*\.?\s*(?:No\.?\s*)?(\d{1,3})\s*[.):\-–—]?\s*(.*)$/i;
const BARE = /^(\d{1,3})\s*[.)](?!\d)\s*(.*)$/;
const RANGE_HINT = /^Q\.?\s*\d{1,3}\s*(?:[-–—]|to)\s*Q?\.?\s*\d{1,3}\b/i;
const CARRY_MARKS = /carr(?:y|ies)\s+(one|two|three|four|\d+)\s+marks?/i;
const SECTION_GENERIC = /^(?:section|part|subject)\s*[-:–]?\s*(?:(?:[A-Z]|[IVX]{1,4}|\d{1,2})\b\s*[-:–.]?\s*)?(.*)$/i;
const PART_LINE = /^(?:part|section|भाग)\s*[-–:]?\s*([IVX]{1,4}|\d{1,2}|[०-९]{1,2})\b\s*[-–:/]*\s*(.*)$/i;
const SET_LINE = /^(?:set|booklet)\s*[-:]?\s*([A-E])$/i;
const SUBJECT =
  /^(?:physics|chemistry|mathematics|maths|biology|botany|zoology|general aptitude|verbal ability(?:\s*(?:and|&)\s*reading comprehension)?|varc|data interpretation(?:\s*(?:and|&)\s*logical reasoning)?|dilr|lrdi|quantitative (?:ability|aptitude)|logical reasoning|english(?: language)?|general knowledge|reasoning ability|technical(?: section)?)(?:\s*\([^)]*\))?\s*[:\-–]?$/i;
const KEY_HEADING =
  /^(?:final\s+|provisional\s+|official\s+)?(?:answer\s*keys?|key\s*answers?|answers\s*[:\-–]|answer\s*sheet)\b(?!\s*[.])(?:\s*[:\-–]?\s*(?:for\s+)?(?:set\s*)?[A-E])?\s*$/i;
const CONTEXT =
  /^(?:directions?|instructions? for questions?|passage|read the (?:following|passage)|comprehension|common data|linked answer|for questions?)\b/i;
const CONTEXT_RANGE = /(?:questions?|Q\.?|Qs\.?)\s*(?:nos?\.?\s*)?(\d{1,3})\s*(?:to|-|–|—|through|and)\s*(\d{1,3})/i;
const ANSWER_HEAD = /^(?:ans(?:wer)?|correct\s+(?:answer|option)|sol(?:ution)?|explanation|hint)\s*[:.\-–)]\s*(.*)$/i;
const INLINE_ANS =
  /(?:^|\n)\s*(?:ans(?:wer)?|correct\s+(?:answer|option)|key)\s*[:.\-–]\s*\(?([A-E](?:\s*[,&]\s*[A-E])*|[-+]?\d*\.?\d+(?:\s*(?:to|-|–)\s*[-+]?\d*\.?\d+)?)\)?(?![A-Za-z.])/i;
const MSQ_HINT = /one or more|more than one|multiple correct|all (?:the )?correct (?:options|statements)|\bMSQ\b/i;
const MARKS_INLINE = /[[(]\s*(\d+(?:\.\d+)?)\s*marks?\s*[\])]/i;

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
const toNum = (s: string) => WORD_NUM[s.toLowerCase()] ?? Number(s);

interface OptionStyle {
  re: RegExp;
  ord: (label: string) => number;
  numeric: boolean;
}

const alpha = (l: string) => l.toUpperCase().charCodeAt(0) - 65;
const OPTION_STYLES: OptionStyle[] = [
  { re: /\(([A-E])\)/g, ord: alpha, numeric: false },
  { re: /\(([a-e])\)/g, ord: alpha, numeric: false },
  { re: /(?<![A-Za-z0-9.])([A-E])[.)](?=\s)/g, ord: alpha, numeric: false },
  { re: /(?<![A-Za-z0-9.])([a-e])\)(?=\s)/g, ord: alpha, numeric: false },
  { re: /\(([1-5])\)/g, ord: (l) => Number(l) - 1, numeric: true },
  { re: /(?<![\w.])([1-5])\)(?=\s)/g, ord: (l) => Number(l) - 1, numeric: true },
];
const NUMERIC_DOT: OptionStyle = { re: /(?:^|\n)\s*([1-5])\.(?=\s)/g, ord: (l) => Number(l) - 1, numeric: true };

/**
 * Split a question block into stem and options. For every marker style, take the
 * longest A→B→C→D run, preferring the one that starts latest (so "(A)" references
 * inside the stem don't win over the real options).
 */
export function splitOptions(text: string, allowNumericDot = false) {
  const styles = allowNumericDot ? [...OPTION_STYLES, NUMERIC_DOT] : OPTION_STYLES;
  let best: { marks: { start: number; end: number }[]; numeric: boolean } | null = null;

  for (const style of styles) {
    const marks = [...text.matchAll(style.re)].map((m) => {
      const label = m[1];
      const start = m.index! + m[0].indexOf(label) - (m[0].includes('(') ? 1 : 0);
      return { ord: style.ord(label), start: Math.max(0, start), end: m.index! + m[0].length };
    });
    let seq: typeof marks = [];
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i].ord !== 0) continue;
      const run = [marks[i]];
      for (let j = i + 1; j < marks.length; j++) if (marks[j].ord === run.length) run.push(marks[j]);
      if (run.length > seq.length) seq = run;
    }
    if (seq.length >= 3 && (!best || seq.length > best.marks.length)) best = { marks: seq, numeric: style.numeric };
  }

  if (!best) return { stem: clean(text), options: [] as string[], numeric: false };
  const options = best.marks.map((m, i) => clean(text.slice(m.end, best!.marks[i + 1]?.start ?? text.length)));
  return { stem: clean(text.slice(0, best.marks[0].start)), options, numeric: best.numeric };
}

const clean = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

interface Pos {
  page: number;
  col: number;
  y: number;
}

/**
 * Crop only the columns that actually contain this question's lines.
 * A question that ends at the bottom of a column must not pull in the next column or the next page.
 * When the next question is in the same column, the crop runs down to it so a diagram under the text is kept.
 */
function regionsOfLines(pages: PageLayout[], block: Line[], stop: Pos | null): Region[] {
  const groups = new Map<string, Line[]>();
  for (const line of block) {
    const key = `${line.page}:${line.col}`;
    const list = groups.get(key);
    if (list) list.push(line);
    else groups.set(key, [line]);
  }
  const out: Region[] = [];
  for (const [key, lines] of groups) {
    const [pageNo, colNo] = key.split(':').map(Number);
    const page = pages.find((p) => p.page === pageNo);
    const col = page?.cols[colNo];
    if (!page || !col) continue;
    const y0 = Math.max(0, Math.min(...lines.map((l) => l.y0)) - 8);
    let y1 = Math.max(...lines.map((l) => l.y1)) + 18;
    if (stop && stop.page === pageNo && stop.col === colNo && stop.y > y0) y1 = Math.max(y1, stop.y - 2);
    // A figure with no text sits under the words. Keep it when this question continues in a later column or page.
    const continuesPast =
      block.some((l) => l.page > pageNo || (l.page === pageNo && l.col > colNo)) ||
      (stop != null && (stop.page > pageNo || (stop.page === pageNo && stop.col > colNo)));
    if (continuesPast) y1 = Math.max(y1, Math.min(page.height, col.bottom || page.height));
    y1 = Math.min(page.height, y1);
    const x0 = Math.max(0, Math.min(col.x0, ...lines.map((l) => l.x0)) - 4);
    const x1 = Math.min(page.width, Math.max(col.x1, ...lines.map((l) => l.x1)) + 6);
    if (y1 - y0 > 10) out.push({ page: pageNo, x0, y0, x1, y1 });
  }
  return out;
}

type Kind = 'question' | 'section' | 'hint' | 'context' | 'key' | 'answer' | 'text';

export function parseLayout(pages: PageLayout[]): ParseResult {
  const notes: string[] = [];
  const lines: Line[] = [];
  const bilingual = new Map<number, BilingualPage>();
  for (const p of pages) {
    if (isInstructionPage(p)) {
      notes.push(`Skipped page ${p.page} (looks like an instructions page).`);
      continue;
    }
    const bi = bilingualColumns(p);
    if (bi) bilingual.set(p.page, bi);
    for (let c = 0; c < p.cols.length; c++) {
      if (bi && c === bi.secondary) continue;
      lines.push(...p.lines.filter((l) => l.col === c && !l.furniture).sort((a, b) => a.y0 - b.y0));
    }
  }

  const qPrefixedNums = new Set(lines.map((l) => l.text.match(Q_PREFIXED)?.[1]).filter(Boolean));
  const qMode = qPrefixedNums.size >= 5;

  // Classify every line.
  const kinds: Kind[] = [];
  const nums: number[] = [];
  const lineSection: number[] = [];
  const sections: string[] = [];
  let sectionHeaderSinceLast = false;
  let last = 0;
  let keyStart = -1;
  let questionCount = 0;
  let inCurrentSection = 0;

  const startSection = (name: string) => {
    const prev = sections[sections.length - 1];
    const keepsLanguagePart =
      /^(?:english|hindi|sanskrit|urdu|marathi|मराठी|हिन्दी|हिंदी)$/i.test(name) && /^Language [IV]+$/.test(prev ?? '') && inCurrentSection === 0;
    if (keepsLanguagePart) {
      sectionHeaderSinceLast = true;
      return;
    }
    if (sections.length && inCurrentSection === 0) sections[sections.length - 1] = name;
    else sections.push(name);
    inCurrentSection = 0;
    sectionHeaderSinceLast = true;
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text.trim();
    kinds[i] = 'text';
    lineSection[i] = Math.max(0, sections.length - 1);

    if (questionCount > 0 && t.length <= 48 && KEY_HEADING.test(t)) {
      keyStart = i;
      break;
    }
    if (RANGE_HINT.test(t) || (CARRY_MARKS.test(t) && t.length < 80 && !Q_PREFIXED.test(t) && !BARE.test(t))) {
      kinds[i] = 'hint';
      continue;
    }
    if (t.length <= 80) {
      const named = canonicalSection(t);
      if (named) {
        kinds[i] = 'section';
        startSectionName(named, true);
        lineSection[i] = sections.length - 1;
        continue;
      }
      const setHead = t.match(SET_LINE);
      if (setHead) {
        kinds[i] = 'section';
        startSectionName(`Set ${setHead[1].toUpperCase()}`, true);
        lineSection[i] = sections.length - 1;
        continue;
      }
      const part = t.match(PART_LINE);
      const partName = part ? partHeading(part) : null;
      if (partName) {
        kinds[i] = 'section';
        startSectionName(partName, true);
        lineSection[i] = sections.length - 1;
        continue;
      }
    }
    if (t.length <= 60) {
      const generic = t.match(SECTION_GENERIC);
      const rest = generic?.[1]?.trim() ?? '';
      const genericOk =
        generic &&
        !/^sections?\.?$/i.test(t) &&
        !isSentenceHeading(rest) &&
        (rest === '' || (/^[A-Z\u0900-\u097F(]/.test(rest) && rest.length <= 40 && !/[.?]/.test(rest)));
      if (SUBJECT.test(t) || genericOk) {
        kinds[i] = 'section';
        startSectionName(t);
        lineSection[i] = sections.length - 1;
        continue;
      }
    }
    if (CONTEXT.test(t)) {
      kinds[i] = 'context';
      continue;
    }
    if (isAnswerLine(t)) {
      kinds[i] = 'answer';
      continue;
    }

    const qm = t.match(Q_PREFIXED);
    const bm = qMode ? null : t.match(BARE);
    const n = qm ? Number(qm[1]) : bm ? Number(bm[1]) : NaN;
    if (Number.isNaN(n)) continue;

    let accept = false;
    if (last === 0) accept = n === 1 || !!qm || sectionHeaderSinceLast;
    else if (n === last + 1) accept = true;
    else if (n > last && n <= last + 3 && (qm || /^\d{1,3}\s*[.)]\s*$/.test(t))) {
      accept = true;
      notes.push(`Question numbers jump from ${last} to ${n}; check for missed questions.`);
    } else if (n === 1 && (sectionHeaderSinceLast || qm)) {
      accept = true;
      if (!sectionHeaderSinceLast) startSection(`Section ${sections.length + 1}`);
    }
    if (!accept) continue;

    if (sections.length === 0) sections.push('Section 1');
    kinds[i] = 'question';
    nums[i] = n;
    lineSection[i] = sections.length - 1;
    last = n;
    questionCount++;
    inCurrentSection++;
    sectionHeaderSinceLast = false;
  }

  function startSectionName(raw: string, ready = false) {
    let name = raw;
    if (!ready) {
      const generic = raw.match(SECTION_GENERIC);
      name = raw.replace(/\s*\([^)]*\)\s*$/, '').replace(/[:\-–]\s*$/, '').trim();
      if (generic && generic[1]?.trim()) name = generic[1].replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
      name = name.length > 2 ? titleCase(name) : name.toUpperCase();
    }
    startSection(name);
    last = 0;
  }

  const end = keyStart >= 0 ? keyStart : lines.length;
  const keyText =
    keyStart >= 0
      ? lines
          .slice(keyStart + 1)
          .map((l) => l.text)
          .join('\n')
      : '';

  // Assemble question blocks.
  const questions: ParsedQuestion[] = [];
  let section = -1;
  let marksHint: number | undefined;
  let context: { text: string; regions: Region[]; range?: [number, number]; section: number } | null = null;

  const posTop = (l: Line): Pos => ({ page: l.page, col: l.col, y: l.y0 - 3 });

  for (let i = 0; i < end; i++) {
    const k = kinds[i];
    if (k === 'section') {
      section = lineSection[i];
      context = null;
      marksHint = undefined;
      continue;
    }
    if (k === 'hint') {
      const m = lines[i].text.match(CARRY_MARKS);
      if (m) marksHint = toNum(m[1]);
      continue;
    }
    if (k === 'context') {
      let j = i + 1;
      while (j < end && kinds[j] !== 'question' && kinds[j] !== 'section' && kinds[j] !== 'context') j++;
      const stop = j < end ? posTop(lines[j]) : { page: lines[j - 1].page, col: lines[j - 1].col, y: lines[j - 1].y1 + 4 };
      const rm = lines[i].text.match(CONTEXT_RANGE);
      const contextLines = lines.slice(i, j);
      context = {
        text: clean(contextLines.map((l) => l.text).join('\n')),
        regions: regionsOfLines(pages, contextLines, stop),
        range: rm ? [Number(rm[1]), Number(rm[2])] : undefined,
        section: lineSection[i],
      };
      i = j - 1;
      continue;
    }
    if (k !== 'question') continue;
    if (lineSection[i] !== section) {
      if (context && context.section !== lineSection[i]) context = null;
      section = lineSection[i];
    }

    let j = i + 1;
    while (j < end && (kinds[j] === 'text' || kinds[j] === 'answer')) j++;
    const block = lines.slice(i, j);
    const ansIdx = block.findIndex((_, bi) => bi > 0 && kinds[i + bi] === 'answer');
    const visible = ansIdx > 0 ? block.slice(0, ansIdx) : block;
    const stopLine = ansIdx > 0 ? block[ansIdx] : lines[j];
    const stop: Pos = stopLine
      ? posTop(stopLine)
      : { page: block[block.length - 1].page, col: block[block.length - 1].col, y: block[block.length - 1].y1 + 6 };

    const first = visible[0].text.trim();
    const body = (first.match(Q_PREFIXED)?.[2] ?? first.match(BARE)?.[2] ?? first).trim();
    let text = [body, ...visible.slice(1).map((l) => l.text)].join('\n');
    const answerText = ansIdx > 0 ? block.slice(ansIdx).map((l) => l.text).join('\n') : '';

    const inline = (answerText || text).match(INLINE_ANS);
    if (inline && !answerText) text = text.slice(0, inline.index).trim();

    const { stem, options, numeric } = splitOptions(text, qMode);
    let type: QType = options.length >= 2 ? (MSQ_HINT.test(stem) ? 'MSQ' : 'MCQ') : 'NAT';
    const mi = text.match(MARKS_INLINE);
    const n = nums[i];

    let ctx: ParsedQuestion['context'];
    if (context && context.section === section && (!context.range || (n >= context.range[0] && n <= context.range[1])))
      ctx = { text: context.text, regions: context.regions };
    else if (context?.range && n > context.range[1]) context = null;

    questions.push({
      sourceNumber: n,
      section,
      text: stem || clean(text),
      options,
      optionStyle: numeric ? 'numeric' : 'alpha',
      type,
      marksHint: mi ? Number(mi[1]) : marksHint,
      inlineAnswer: inline?.[1],
      solution: answerText ? clean(answerText) : undefined,
      regions: regionsOfLines(pages, visible, stop),
      context: ctx,
    });
    i = j - 1;
  }

  const altCount = attachAlts(questions, pages, bilingual);
  if (altCount) {
    const langs = [...new Set(questions.flatMap((q) => (q.alt ? [q.alt.lang] : [])))];
    const label = langs.map((l) => (l === 'hi' ? 'Hindi' : l === 'mr' ? 'Marathi' : 'another language')).join(' and ');
    notes.push(`Side-by-side languages on ${bilingual.size} page(s). English is the main text, and ${label} stays available while you attempt.`);
  }

  // Sections that ended up without questions (e.g. a stray "Physics" heading) are dropped.
  const used = [...new Set(questions.map((q) => q.section))].sort((a, b) => a - b);
  const remap = new Map(used.map((s, idx) => [s, idx]));
  const sectionNames = used.map((s) => sections[s] ?? `Section ${s + 1}`);
  for (const q of questions) q.section = remap.get(q.section) ?? 0;

  if (!questions.length) notes.push('No questions were detected. Use "Full PDF" mode and enter the question count manually.');
  if (questions.length && questions.every((q) => q.type === 'NAT'))
    notes.push('No answer options were detected; all questions were treated as numerical. Fix types in the editor if needed.');

  const allText = pages.flatMap((p) => p.lines.map((l) => l.text)).join('\n');
  const setCode = detectSetCode(allText);
  if (setCode) notes.push(`Booklet set ${setCode}.`);
  else if (new Set([...allText.matchAll(/\bP-[IVX]+\/([A-E])\b/g)].map((m) => m[1].toUpperCase())).size > 1)
    notes.push('This file contains more than one booklet set. Pick the set you are attempting and skip the others.');

  return { questions, sections: sectionNames.length ? sectionNames : ['Section 1'], keyText, notes, setCode };
}

const DEV_DIGIT: Record<string, string> = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
const foldDevanagariDigits = (s: string) => s.replace(/[०-९]/g, (d) => DEV_DIGIT[d] ?? d);

/** Set letter from a page header such as P-II/E, a "Test Booklet Code E" line, or a file name like "set E". */
export function detectSetCode(text: string, fileName = ''): string | null {
  const headers = [...text.matchAll(/\bP-[IVX]+\/([A-E])\b/g)].map((m) => m[1].toUpperCase());
  const unique = [...new Set(headers)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return null;
  const label = text.match(/\b(?:test\s+)?booklet\s+code\s*[:\-]?\s*([A-E])\b/i);
  if (label) return label[1].toUpperCase();
  const named = fileName.match(/(?:^|[\s._-])set[\s._-]*([A-E])\b/i);
  return named ? named[1].toUpperCase() : null;
}

/** A printed "Ans: B" line. "choose the correct answer :" followed by statement A. is the question, not the key. */
function isAnswerLine(t: string) {
  const m = t.match(ANSWER_HEAD);
  if (!m) return false;
  const rest = m[1].trim();
  if (!rest || rest.length > 24) return false;
  return /^(?:\(?[A-E]\)?(?:\s*[,&]\s*\(?[A-E]\)?)*|[-+]?\d*\.?\d+(?:\s*(?:to|-|–)\s*[-+]?\d*\.?\d+)?|mta|bonus|dropped|marks to all)\b/i.test(rest);
}

const INSTR_CUE =
  /do not open this test booklet|read carefully the instructions|read the following instructions|instructions for candidates|this booklet is a supplement|test booklet code|space for rough work|परीक्षार्थींसाठी सूचना|खालील सूचना काळजीपूर्वक|सूचना काळजीपूर्वक वाचा|ही पुस्तिका उघडायला|रफ कामासाठी/i;

function isInstructionPage(p: PageLayout) {
  const body = p.lines.filter((l) => !l.furniture);
  const text = body.map((l) => l.text).join('\n');
  const nums = body.flatMap((l) => {
    const m = l.text.trim().match(/^(\d{1,3})\s*[.)](?!\d)/);
    return m ? [Number(m[1])] : [];
  });
  const hasExamNumber = nums.some((n) => n >= 21);
  const hasQuestion = nums.length > 0;
  // A divider such as "answer below only if you chose Marathi" has no questions. It must not be glued onto the previous question.
  if (!hasQuestion && /निवडला असेल|उत्तरे द्यावीत|only if you have opted|answer the questions given below/i.test(text)) return true;
  if (/space for rough work|रफ कामासाठी/i.test(text) && !hasExamNumber) return true;
  if (hasExamNumber) return false;
  if (INSTR_CUE.test(text)) return true;
  const head = body.filter((l) => l.y0 < p.height * 0.35);
  const hasHeading = head.some((l) => /^(?:general\s+|important\s+)?instructions\b/i.test(l.text.trim()) || /^सूचना\b/.test(l.text.trim()));
  if (!hasHeading) return false;
  return !/\([A-Ea-e1-4]\)[\s\S]{0,160}\([A-Ea-e1-4]\)[\s\S]{0,160}\([A-Ea-e1-4]\)/.test(text);
}

interface BilingualPage {
  secondary: number;
  lang: Exclude<LangCode, 'en'>;
}

const Q_START = /^(\d{1,3})\s*[.)](?!\d)(?:\s|$)/;
const DEVANAGARI = /[\u0900-\u097F]/g;
const LEGACY_FONT = /[\uE000-\uF8FF]/g;
const LATIN = /[A-Za-z]/g;

/** A page whose columns repeat the same question numbers is a translation, not more questions. */
export function bilingualColumns(page: PageLayout): BilingualPage | null {
  if (page.cols.length < 2) return null;
  const nums = [0, 1].map((col) => {
    const set = new Set<number>();
    for (const line of page.lines) {
      if (line.col !== col || line.furniture) continue;
      const m = line.text.trim().match(Q_START);
      if (m) set.add(Number(m[1]));
    }
    return set;
  });
  if (nums[0].size < 2 || nums[1].size < 2) return null;
  let overlap = 0;
  for (const n of nums[0]) if (nums[1].has(n)) overlap++;
  if (overlap / Math.min(nums[0].size, nums[1].size) < 0.6) return null;

  const score = (col: number) => {
    const text = page.lines.filter((l) => l.col === col).map((l) => l.text).join(' ');
    return {
      latin: (text.match(LATIN) ?? []).length,
      indic: (text.match(DEVANAGARI) ?? []).length + (text.match(LEGACY_FONT) ?? []).length,
    };
  };
  const scores = [score(0), score(1)];
  const primary = scores[0].latin >= scores[1].latin ? 0 : 1;
  const secondary = primary === 0 ? 1 : 0;
  const other = scores[secondary];
  if (!(other.indic > 20 && other.indic > other.latin * 0.15)) return null;
  const otherText = page.lines.filter((l) => l.col === secondary).map((l) => l.text).join(' ');
  return { secondary, lang: indicLanguage(otherText) };
}

function indicLanguage(text: string): 'mr' | 'hi' {
  const lla = (text.match(/ळ/g) ?? []).length;
  if (/मराठी/.test(text) || lla >= 2) return 'mr';
  return 'hi';
}

/** A "Part II contains 30 questions…" line is a sentence, not a new section. */
function isSentenceHeading(rest: string) {
  return /\b(?:contains|consisting|either|candidates|questions|from)\b|[.?!]/i.test(rest);
}

function partHeading(part: RegExpMatchArray) {
  const rest = (part[2] ?? '').replace(/\s+/g, ' ').trim();
  const known = canonicalSection(rest);
  if (known) return known;
  if (isSentenceHeading(rest)) return null;
  const partNo = foldDevanagariDigits(part[1]).toUpperCase();
  const partDefault = partNo === 'IV' || partNo === '4' ? 'Language I' : partNo === 'V' || partNo === '5' ? 'Language II' : `Part ${partNo}`;
  if (!rest || /^[\/|.\-–:\s]+$/.test(rest)) return partDefault;
  if (rest.length > 48) return null;
  return titleCase(rest.replace(/[\/|]/g, ' ').replace(/\s+/g, ' ').trim());
}

/** Known bilingual exam headings, kept only when the line is the heading itself. */
export function canonicalSection(raw: string): string | null {
  const h = raw.replace(/\s*[\/|]+\s*$/g, '').replace(/\s+/g, ' ').trim();
  if (h.length > 60 || /[.?]$/.test(h)) return null;
  if (/^child development\b/i.test(h)) return 'Child Development and Pedagogy';
  if (/^mathematics and science\b/i.test(h)) return 'Mathematics and Science';
  if (/^social studies\b/i.test(h)) return 'Social Studies';
  if (/^environmental studies\b/i.test(h)) return 'Environmental Studies';
  if (/^language\s*[-–]?\s*(?:ii|2)\b/i.test(h)) return 'Language II';
  if (/^language\s*[-–]?\s*(?:i|1)\b/i.test(h)) return 'Language I';
  if (/^भाषा\s*[-–:]?\s*(?:ii|2|२)\b/i.test(h)) return 'Language II';
  if (/^भाषा\s*[-–:]?\s*(?:i|1|१)\b/i.test(h)) return 'Language I';
  return null;
}

function attachAlts(questions: ParsedQuestion[], pages: PageLayout[], bilingual: Map<number, BilingualPage>) {
  let attached = 0;
  for (const q of questions) {
    const startPage = q.regions[0]?.page;
    const info = startPage ? bilingual.get(startPage) : undefined;
    const page = pages.find((p) => p.page === startPage);
    if (!info || !page) continue;
    const column = page.lines.filter((l) => l.col === info.secondary && !l.furniture).sort((a, b) => a.y0 - b.y0);
    const idx = column.findIndex((l) => new RegExp(`^${q.sourceNumber}\\s*[.)](?!\\d)`).test(l.text.trim()));
    if (idx < 0) continue;
    let end = column.length;
    for (let k = idx + 1; k < column.length; k++) {
      if (Q_START.test(column[k].text.trim())) {
        end = k;
        break;
      }
    }
    const block = column.slice(idx, end);
    const next = end < column.length ? column[end] : null;
    const regions = regionsOfLines(
      pages,
      block,
      next ? { page: next.page, col: info.secondary, y: next.y0 - 2 } : { page: block[block.length - 1].page, col: info.secondary, y: block[block.length - 1].y1 + 16 },
    );
    const raw = block.map((l) => l.text).join('\n');
    const body = raw.replace(new RegExp(`^${q.sourceNumber}\\s*[.)]\\s*`), '');
    const split = splitOptions(body, true);
    q.alt = { lang: info.lang, text: split.stem || clean(body), options: split.options, regions };
    attached++;
  }
  return attached;
}

function titleCase(s: string) {
  if (/^[A-Z]{2,5}$/.test(s)) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(And|Of|The)\b/g, (m) => m.toLowerCase());
}

/** Plain text of all non-furniture lines in reading order (used for answer-key-only PDFs). */
export function layoutText(pages: PageLayout[]) {
  const out: string[] = [];
  for (const p of pages)
    for (let c = 0; c < p.cols.length; c++)
      out.push(...p.lines.filter((l) => l.col === c && !l.furniture).sort((a, b) => a.y0 - b.y0).map((l) => l.text));
  return out.join('\n');
}

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildPaper } from '../build';
import { formatAnswer } from './answerKey';
import { layoutPage, markFurniture, type PageLayout } from './layout';
import { layoutText, parseLayout } from './parse';
import { pageTextItems } from './textItems';

const samples = join(__dirname, '../../../public/samples');

async function layouts(name: string): Promise<PageLayout[]> {
  const data = new Uint8Array(readFileSync(join(samples, name)));
  const doc = (await getDocument({ data, verbosity: 0 }).promise) as unknown as PDFDocumentProxy;
  const pages: PageLayout[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const { width, height, items } = await pageTextItems(await doc.getPage(i));
    pages.push(layoutPage(i, width, height, items));
  }
  markFurniture(pages);
  return pages;
}

async function build(paper: string, key?: string, preset: Parameters<typeof buildPaper>[0]['preset'] = 'CUSTOM') {
  const parsed = parseLayout(await layouts(paper));
  const keyTexts = key ? [layoutText(await layouts(key))] : [];
  return buildPaper({ name: paper, file: { id: 'f1', name: paper, pages: 1 }, parsed, keyTexts, preset });
}

beforeAll(() => {
  if (!existsSync(join(samples, 'cat-style-answer-key.pdf'))) execFileSync('node', [join(__dirname, '../../../scripts/make-samples.mjs')]);
});

describe('GATE-style paper', () => {
  it('detects questions, types, marks and applies the separate key', async () => {
    const p = await build('gate-style-paper.pdf', 'gate-style-answer-key.pdf', 'GATE');
    expect(p.questions.map((q) => q.sourceNumber)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(p.questions[0].options).toEqual(['11', '12', '15', '21']);
    expect(p.questions[12].type).toBe('NAT');
    expect(p.questions[13].type).toBe('MSQ');
    expect(formatAnswer(p.questions[13].answer)).toBe('A, C');
    expect(p.questions[14].answer).toEqual({ kind: 'dropped' });
    expect(p.questions[15].answer).toEqual({ kind: 'range', min: 0.66, max: 0.67 });
    expect(p.questions.slice(0, 10).map((q) => q.marks)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    expect(p.questions[5].negative).toBeCloseTo(0.67);
    expect(p.questions[12].negative).toBe(0);
    expect(p.questions.every((q) => q.answer)).toBe(true);
    // Running header and footer must not leak into question text.
    expect(p.questions.some((q) => /GATE 2025|Page \d/.test(q.text + q.options.join()))).toBe(false);
    // Q7 has a figure: its crop must be taller than a text-only question.
    const h = (i: number) => p.questions[i].regions.reduce((s, r) => s + r.y1 - r.y0, 0);
    expect(h(6)).toBeGreaterThan(h(5) + 50);
  });
});

describe('MHT-CET-style paper', () => {
  it('handles two columns, subject sections, restarting numbers and an embedded key', async () => {
    const p = await build('mhtcet-style-paper.pdf', undefined, 'MHTCET');
    expect(p.sections.map((s) => s.name)).toEqual(['Physics', 'Chemistry', 'Mathematics']);
    expect(p.questions).toHaveLength(24);
    expect(p.questions.every((q) => q.options.length === 4)).toBe(true);
    expect(p.questions.every((q) => q.answer?.kind === 'choice')).toBe(true);
    // PHYSICS has 7 letters: key for Q1 is L[(1+7)%4] = 'A'; CHEMISTRY Q1 L[(1+9)%4] = 'C'.
    expect(formatAnswer(p.questions[0].answer)).toBe('A');
    expect(formatAnswer(p.questions[8].answer)).toBe('C');
    expect(p.timing).toBe('sectional');
    expect(p.sections.map((s) => s.timerGroup)).toEqual([1, 1, 2]);
    expect(p.questions[20].marks).toBe(2);
    expect(p.questions[0].regions.every((r) => r.x1 - r.x0 < 320)).toBe(true);
  });
});

describe('CAT-style paper', () => {
  it('attaches the passage, reads numbered options and TITA, and a transposed key', async () => {
    const p = await build('cat-style-paper.pdf', 'cat-style-answer-key.pdf', 'CAT');
    expect(p.sections.map((s) => s.name)).toEqual(['VARC', 'DILR', 'QA']);
    expect(p.questions).toHaveLength(7);
    expect(p.questions[0].context?.text).toMatch(/cartography/);
    expect(p.questions[2].context).toBeTruthy();
    expect(p.questions[3].context).toBeFalsy();
    expect(p.questions[0].options).toHaveLength(4);
    expect(p.questions[0].optionStyle).toBe('numeric');
    expect(p.questions[5].type).toBe('NAT');
    expect(p.questions[6].answer).toEqual({ kind: 'range', min: 210, max: 210 });
    expect(p.questions[0].answer).toEqual({ kind: 'choice', values: [2] });
    expect(p.questions.map((q) => [q.marks, q.negative])).toEqual([
      [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 0], [3, 0],
    ]);
  });
});

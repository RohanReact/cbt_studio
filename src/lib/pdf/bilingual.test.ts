import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildPaper } from '../build';
import { grade } from '../grading';
import { layoutPage, markFurniture, type Line, type PageLayout } from './layout';
import { parseLayout } from './parse';
import { pageTextItems } from './textItems';
import type { Attempt, Paper } from '../types';

function line(text: string, page: number, col: number, y: number): Line {
  return { text, page, col, x0: col === 0 ? 36 : 320, x1: col === 0 ? 280 : 560, y0: y, y1: y + 12 };
}

function page(lines: Line[]): PageLayout {
  return {
    page: lines[0]?.page ?? 1,
    width: 600,
    height: 800,
    cols: [
      { x0: 0, x1: 300, top: 0, bottom: 800 },
      { x0: 300, x1: 600, top: 0, bottom: 800 },
    ],
    lines,
    ocr: false,
  };
}

describe('bilingual columns', () => {
  it('keeps one question when the other column repeats the same numbers', () => {
    const hi = (n: number, y: number) => line(`${n}. \uE042\uE043\uE044 \uE045\uE046\uE047\uE048`, 1, 1, y);
    const parsed = parseLayout([
      page([
        line('PART – I /', 1, 0, 40),
        line('CHILD DEVELOPMENT AND PEDAGOGY', 1, 0, 58),
        line('1. What is 2 + 2?', 1, 0, 80),
        line('(1) 3', 1, 0, 96),
        line('(2) 4', 1, 0, 112),
        line('(3) 5', 1, 0, 128),
        line('(4) 6', 1, 0, 144),
        line('2. Capital of India?', 1, 0, 170),
        line('(1) Mumbai', 1, 0, 186),
        line('(2) Delhi', 1, 0, 202),
        line('(3) Chennai', 1, 0, 218),
        line('(4) Kolkata', 1, 0, 234),
        hi(1, 80),
        line('(1) \uE030', 1, 1, 96),
        line('(2) \uE031', 1, 1, 112),
        line('(3) \uE032', 1, 1, 128),
        line('(4) \uE033', 1, 1, 144),
        hi(2, 170),
        line('(1) \uE034', 1, 1, 186),
        line('(2) \uE035', 1, 1, 202),
        line('(3) \uE036', 1, 1, 218),
        line('(4) \uE037', 1, 1, 234),
      ]),
    ]);
    expect(parsed.sections).toEqual(['Child Development and Pedagogy']);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].text).toContain('2 + 2');
    expect(parsed.questions[0].alt?.lang).toBe('hi');
    expect(parsed.questions[0].alt?.regions[0].x0).toBeGreaterThan(200);
    expect(parsed.questions[1].alt?.options).toHaveLength(4);
  });

  it('still reads a normal two-column page as more questions', () => {
    const parsed = parseLayout([
      page([
        line('1. First left question here', 1, 0, 40),
        line('(A) one', 1, 0, 56),
        line('(B) two', 1, 0, 72),
        line('(C) three', 1, 0, 88),
        line('(D) four', 1, 0, 104),
        line('2. Second left question here', 1, 0, 130),
        line('(A) one', 1, 0, 146),
        line('(B) two', 1, 0, 162),
        line('(C) three', 1, 0, 178),
        line('(D) four', 1, 0, 194),
        line('3. First right question here', 1, 1, 40),
        line('(A) one', 1, 1, 56),
        line('(B) two', 1, 1, 72),
        line('(C) three', 1, 1, 88),
        line('(D) four', 1, 1, 104),
        line('4. Second right question here', 1, 1, 130),
        line('(A) one', 1, 1, 146),
        line('(B) two', 1, 1, 162),
        line('(C) three', 1, 1, 178),
        line('(D) four', 1, 1, 194),
      ]),
    ]);
    expect(parsed.questions.map((q) => q.sourceNumber)).toEqual([1, 2, 3, 4]);
    expect(parsed.questions.every((q) => !q.alt)).toBe(true);
  });
});

describe('optional sections', () => {
  it('leaves a skipped section out of the score', () => {
    const paper = buildPaper({
      name: 'ctet-paper-2.pdf',
      file: { id: 'f', name: 'ctet-paper-2.pdf', pages: 1 },
      preset: 'CTET',
      keyTexts: [],
      parsed: {
        keyText: '',
        notes: [],
        sections: ['Child Development and Pedagogy', 'Mathematics and Science', 'Social Studies'],
        questions: [1, 2, 31, 32, 31, 32].map((n, i) => ({
          sourceNumber: n,
          section: i < 2 ? 0 : i < 4 ? 1 : 2,
          text: `Question ${n}`,
          options: ['a', 'b', 'c', 'd'],
          optionStyle: 'numeric' as const,
          type: 'MCQ' as const,
          regions: [],
        })),
      },
    });
    expect(paper.preset).toBe('CTET');
    expect(paper.sections.map((s) => s.choiceGroup ?? '')).toEqual(['', 'subject', 'subject']);
    const social = paper.sections[2].id;
    const attempt: Attempt = {
      id: 'a',
      paperId: paper.id,
      paperName: paper.name,
      candidateName: 'Asha',
      status: 'submitted',
      startedAt: 1,
      responses: Object.fromEntries(paper.questions.map((q) => [q.id, { value: [0], visited: true, marked: false, timeMs: 0 }])),
      currentQid: paper.questions[0].id,
      groupIndex: 0,
      timeLeftMs: 0,
      timeUsedMs: 1000,
      skippedSectionIds: [social],
    };
    const result = grade(paper, attempt);
    expect(result.total.maxScore).toBe(4);
    expect(result.bySection[2].maxScore).toBe(0);
    expect(result.bySection[2].skipped).toBe(2);
    expect(result.items.filter((item) => item.outcome === 'skipped')).toHaveLength(2);
  });
});

describe('CTET January 2021 Paper 2', () => {
  const file = '/Users/rohanmisal/Documents/Projects/ctet-january-2021-paper-2.pdf';
  it.skipIf(!existsSync(file))('splits bilingual columns and the either-or subject parts', async () => {
    const data = new Uint8Array(readFileSync(file));
    const doc = (await getDocument({ data, verbosity: 0 }).promise) as unknown as PDFDocumentProxy;
    const pages: PageLayout[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { width, height, items } = await pageTextItems(await doc.getPage(i));
      pages.push(layoutPage(i, width, height, items));
    }
    markFurniture(pages);
    const paper: Paper = buildPaper({
      name: 'ctet-january-2021-paper-2.pdf',
      file: { id: 'f', name: 'ctet-january-2021-paper-2.pdf', pages: doc.numPages },
      parsed: parseLayout(pages),
      keyTexts: [],
      preset: 'CTET',
    });
    expect(paper.sections.map((s) => s.name)).toEqual([
      'Child Development and Pedagogy',
      'Mathematics and Science',
      'Social Studies',
      'Language I',
      'Language II',
    ]);
    expect(paper.questions.length).toBeGreaterThan(180);
    expect(paper.questions.length).toBeLessThan(230);
    expect(paper.sections.filter((s) => s.choiceGroup === 'subject').map((s) => s.name)).toEqual(['Mathematics and Science', 'Social Studies']);
    const pedagogy = paper.questions.filter((q) => q.sectionId === paper.sections[0].id);
    expect(pedagogy).toHaveLength(30);
    expect(pedagogy.filter((q) => q.alt?.lang === 'hi').length).toBeGreaterThan(20);
    expect(paper.languages).toContain('hi');
    expect(paper.questions.filter((q) => q.answer)).toHaveLength(0);
    expect(paper.durationMin).toBe(150);
    expect(paper.questions.every((q) => q.negative === 0)).toBe(true);
  });
});

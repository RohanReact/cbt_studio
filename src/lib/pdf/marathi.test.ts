import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildPaper, textIsReadable } from '../build';
import { keyTextForSet } from './answerKey';
import { layoutPage, markFurniture, type PageLayout } from './layout';
import { parseLayout } from './parse';
import { fontLooksLikeShree, shreeDevToUnicode } from './shreeDev';
import { pageTextItems } from './textItems';

describe('Shree-Dev text', () => {
  it('turns legacy codes into Marathi', () => {
    expect(shreeDevToUnicode('^mfm')).toBe('भाषा');
    expect(shreeDevToUnicode('_amR>r')).toBe('मराठी');
    expect(shreeDevToUnicode('gyMZm')).toBe('सूचना');
    expect(shreeDevToUnicode('qH$dm')).toBe('किंवा');
    expect(shreeDevToUnicode('àíZn{ÌH$m')).toBe('प्रश्नपत्रिका');
    expect(shreeDevToUnicode('{dÚmÏ¶mªÀ¶m')).toBe('विद्यार्थ्यांच्या');
  });

  it('leaves an English header font alone and decodes a Shree font', () => {
    expect(fontLooksLikeShree('P-II/E MARATHI ( 4 )')).toBe(false);
    expect(fontLooksLikeShree('This booklet is a supplement to the Main Test Booklet')).toBe(false);
    expect(fontLooksLikeShree('^mJ ^mfm _amR>r gyMZm')).toBe(true);
    expect(fontLooksLikeShree('Zmhr')).toBe(true);
  });
});

describe('booklet sets', () => {
  it('keeps only the matching set from a multi-set answer key', () => {
    const text = 'SET A\n91 A\n92 B\nSET E\n91 C\n92 D\nSET B\n91 A\n92 A';
    expect(keyTextForSet(text, 'E')).toContain('91 C');
    expect(keyTextForSet(text, 'E')).not.toContain('92 B');
    expect(keyTextForSet('91 A\n92 B', 'E')).toContain('92 B');
  });
});

describe('CTET Marathi II set E', () => {
  const file = '/Users/rohanmisal/Documents/Projects/MARATHI-II set E.pdf';
  it.skipIf(!existsSync(file))('reads Marathi questions instead of the instruction pages', async () => {
    const data = new Uint8Array(readFileSync(file));
    const doc = (await getDocument({ data, verbosity: 0 }).promise) as unknown as PDFDocumentProxy;
    const pages: PageLayout[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { width, height, items } = await pageTextItems(await doc.getPage(i));
      pages.push(layoutPage(i, width, height, items));
    }
    markFurniture(pages);
    const parsed = parseLayout(pages);
    const paper = buildPaper({
      name: 'MARATHI-II set E.pdf',
      file: { id: 'f', name: 'MARATHI-II set E.pdf', pages: doc.numPages },
      parsed,
      keyTexts: [],
      preset: 'CTET',
    });

    expect(paper.setCode).toBe('E');
    expect(paper.languages).toContain('mr');
    expect(paper.sections.map((s) => s.name)).toEqual(expect.arrayContaining(['Language I', 'Language II']));
    expect(paper.questions.length).toBeGreaterThanOrEqual(50);
    expect(paper.questions.length).toBeLessThanOrEqual(70);
    expect(Math.min(...paper.questions.map((q) => q.sourceNumber))).toBeGreaterThanOrEqual(91);
    expect(paper.questions.some((q) => q.sourceNumber === 91)).toBe(true);
    expect(paper.questions.some((q) => q.sourceNumber === 121)).toBe(true);
    const joined = paper.questions.map((q) => q.text).join('\n');
    expect(joined).toMatch(/विद्यार्थ/);
    expect(joined).not.toMatch(/ही पुस्तिका उघडायला/);
    expect(joined).not.toMatch(/Do not open this Test Booklet/);
    expect(textIsReadable(paper.questions[0].text)).toBe(true);
    expect(paper.allowText).toBe(false);
    expect(paper.questions.every((q) => q.type === 'MCQ')).toBe(true);
    expect(paper.questions.every((q) => q.optionCount >= 4 || q.options.length >= 4)).toBe(true);
    expect(paper.questions.every((q) => q.regions.length > 0 && q.regions.every((r) => r.y1 - r.y0 > 12))).toBe(true);
    expect(paper.questions.some((q) => q.regions.some((r) => r.page === 3 || r.page === 8))).toBe(false);
  });
});

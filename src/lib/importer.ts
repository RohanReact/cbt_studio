import { blankPaper, buildPaper, uid } from './build';
import { db } from './db';
import { extractLayouts, type OcrMode, type Progress } from './pdf/extract';
import { layoutText, parseLayout } from './pdf/parse';
import { openPdf } from './pdf/pdfjs';
import { detectPreset } from './presets';
import type { Paper, PresetId } from './types';

export interface ImportJob {
  id: string;
  file: File;
  role: 'paper' | 'key';
  /** For keys: id of the paper job this key belongs to. */
  keyFor?: string;
  preset: PresetId | 'auto';
  ocr: OcrMode;
}

export type JobProgress = { label: string; fraction: number };

async function readText(file: File, ocr: OcrMode, onProgress: (p: Progress) => void) {
  const doc = await openPdf(await file.arrayBuffer());
  try {
    const { layouts, ocrPages } = await extractLayouts(doc, { ocr, onProgress });
    return { layouts, ocrPages, pages: doc.numPages };
  } finally {
    await doc.cleanup();
    await doc.loadingTask.destroy();
  }
}

const describe = (prefix: string, p: Progress): JobProgress => {
  const base = (p.page - 1) / p.pages;
  if (p.stage === 'ocr-load') return { label: `${prefix}: loading OCR engine (first time downloads ~10 MB)…`, fraction: base };
  if (p.stage === 'ocr')
    return { label: `${prefix}: OCR page ${p.page}/${p.pages}`, fraction: base + (p.sub ?? 0) / p.pages };
  return { label: `${prefix}: reading page ${p.page}/${p.pages}`, fraction: base };
};

export async function runImport(job: ImportJob, keys: ImportJob[], onProgress: (p: JobProgress) => void): Promise<Paper> {
  const fileId = uid();
  const data = await job.file.arrayBuffer();
  await db.saveFile({ id: fileId, name: job.file.name, data });

  const { layouts, ocrPages, pages } = await readText(job.file, job.ocr, (p) => onProgress(describe('Paper', p)));

  const keyTexts: string[] = [];
  for (const k of keys) {
    const r = await readText(k.file, k.ocr, (p) => onProgress(describe(k.file.name, p)));
    keyTexts.push(layoutText(r.layouts));
  }

  onProgress({ label: 'Detecting questions…', fraction: 1 });
  const parsed = parseLayout(layouts);
  if (ocrPages) parsed.notes.unshift(`${ocrPages} scanned page(s) were read with OCR — double-check question text and options.`);

  const preset = job.preset === 'auto' ? detectPreset(layoutText(layouts.slice(0, 2)), job.file.name) : job.preset;
  const name = job.file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  const file = { id: fileId, name: job.file.name, pages };

  const paper = parsed.questions.length
    ? buildPaper({ name, file, parsed, keyTexts, preset })
    : { ...blankPaper(name, file, preset, 0), parseNotes: parsed.notes };
  await db.savePaper(paper);
  return paper;
}

/** Guess which uploads are answer keys and which paper each belongs to. */
export function guessRoles(files: File[]): Omit<ImportJob, 'preset' | 'ocr'>[] {
  const isKey = (n: string) => /answer|key|\bans\b|solution/i.test(n);
  const jobs = files.map((file) => ({ id: uid(), file, role: (isKey(file.name) ? 'key' : 'paper') as ImportJob['role'], keyFor: undefined as string | undefined }));
  const papers = jobs.filter((j) => j.role === 'paper');
  const stem = (n: string) => n.toLowerCase().replace(/\.pdf$/, '').replace(/answer|key|ans|solutions?|question|paper|qp/g, '').replace(/[^a-z0-9]/g, '');
  for (const j of jobs.filter((x) => x.role === 'key')) {
    const s = stem(j.file.name);
    const match = papers.find((p) => stem(p.file.name) === s) ?? papers.find((p) => s && (stem(p.file.name).includes(s) || s.includes(stem(p.file.name)))) ?? (papers.length === 1 ? papers[0] : undefined);
    j.keyFor = match?.id;
  }
  return jobs;
}

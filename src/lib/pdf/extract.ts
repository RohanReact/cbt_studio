import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { Worker as OcrWorker } from 'tesseract.js';
import { layoutPage, markFurniture, type PageLayout, type RawItem } from './layout';
import { pageTextItems } from './textItems';

export type OcrMode = 'auto' | 'off' | 'always';

export interface Progress {
  stage: 'text' | 'ocr-load' | 'ocr';
  page: number;
  pages: number;
  /** 0..1 within the current OCR page. */
  sub?: number;
}

const OCR_SCALE = 2.5;
/** Pages with less extractable text than this are treated as scanned images. */
const MIN_CHARS = 40;

async function ocrPage(page: PDFPageProxy, worker: OcrWorker): Promise<RawItem[]> {
  const viewport = page.getViewport({ scale: OCR_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });

  const items: RawItem[] = [];
  for (const block of data.blocks ?? [])
    for (const para of block.paragraphs)
      for (const line of para.lines) {
        const h = (line.bbox.y1 - line.bbox.y0) / OCR_SCALE;
        const baseline = line.bbox.y1 / OCR_SCALE - h * 0.2;
        for (const w of line.words) {
          if (!w.text.trim() || w.confidence < 20) continue;
          items.push({ str: w.text, x0: w.bbox.x0 / OCR_SCALE, x1: w.bbox.x1 / OCR_SCALE, baseline, h: h * 0.85 });
        }
      }
  canvas.width = canvas.height = 0;
  return items;
}

export async function extractLayouts(
  doc: PDFDocumentProxy,
  opts: { ocr: OcrMode; onProgress?: (p: Progress) => void },
): Promise<{ layouts: PageLayout[]; ocrPages: number }> {
  const layouts: PageLayout[] = [];
  let worker: OcrWorker | null = null;
  let ocrPages = 0;
  let current = 0;

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      current = i;
      opts.onProgress?.({ stage: 'text', page: i, pages: doc.numPages });
      const page = await doc.getPage(i);
      const { width, height, items } = await pageTextItems(page);
      const chars = items.reduce((s, it) => s + it.str.trim().length, 0);
      const needOcr = opts.ocr === 'always' || (opts.ocr === 'auto' && chars < MIN_CHARS);

      if (!needOcr) {
        layouts.push(layoutPage(i, width, height, items));
        continue;
      }
      if (!worker) {
        opts.onProgress?.({ stage: 'ocr-load', page: i, pages: doc.numPages });
        const { createWorker } = await import('tesseract.js');
        worker = await createWorker('eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') opts.onProgress?.({ stage: 'ocr', page: current, pages: doc.numPages, sub: m.progress });
          },
        });
      }
      opts.onProgress?.({ stage: 'ocr', page: i, pages: doc.numPages, sub: 0 });
      layouts.push(layoutPage(i, width, height, await ocrPage(page, worker), true));
      ocrPages++;
    }
  } finally {
    await worker?.terminate();
  }

  markFurniture(layouts);
  return { layouts, ocrPages };
}

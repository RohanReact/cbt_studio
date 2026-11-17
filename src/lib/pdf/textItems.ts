import type { PDFPageProxy } from 'pdfjs-dist';
import type { RawItem } from './layout';
import { fontLooksLikeShree, shreeDevToUnicode } from './shreeDev';

type M = number[];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

interface Run extends RawItem {
  font: string;
}

/**
 * Join neighbouring Shree-Dev glyphs before decoding. A conjunct such as `Am` (आ)
 * is often split across runs, and the converter only sees it when the runs are one string.
 */
function decodeShreeRuns(runs: Run[], shree: Set<string>): RawItem[] {
  const sorted = [...runs].sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0);
  const items: RawItem[] = [];
  let buf: Run[] = [];
  const flush = () => {
    if (!buf.length) return;
    let text = '';
    let prev: Run | null = null;
    for (const it of buf) {
      if (prev && it.x0 - prev.x1 > 0.18 * Math.min(prev.h, it.h)) text += ' ';
      text += it.str;
      prev = it;
    }
    items.push({
      str: shreeDevToUnicode(text),
      x0: Math.min(...buf.map((b) => b.x0)),
      x1: Math.max(...buf.map((b) => b.x1)),
      baseline: buf[0].baseline,
      h: Math.max(...buf.map((b) => b.h)),
    });
    buf = [];
  };
  for (const it of sorted) {
    if (!shree.has(it.font)) {
      flush();
      items.push({ str: it.str, x0: it.x0, x1: it.x1, baseline: it.baseline, h: it.h });
      continue;
    }
    if (buf.length) {
      const prev = buf[buf.length - 1];
      const sameLine = Math.abs(it.baseline - prev.baseline) <= Math.max(1.5, 0.45 * Math.min(prev.h, it.h));
      const gap = it.x0 - prev.x1;
      // Only glue glyphs of one word. A wider gap is a word space or the other column.
      if (!sameLine || it.font !== prev.font || gap > Math.max(2.5, 0.35 * prev.h)) flush();
    }
    buf.push(it);
  }
  flush();
  return items;
}

/** Text runs of a page in scale-1 viewport coordinates. Works with both the browser and Node builds of pdf.js. */
export async function pageTextItems(page: PDFPageProxy) {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const runs: Run[] = [];
  for (const it of tc.items) {
    if (!('str' in it) || !it.str) continue;
    const m = mul(vp.transform, it.transform);
    const h = Math.hypot(m[2], m[3]);
    runs.push({ str: it.str, x0: m[4], x1: m[4] + it.width, baseline: m[5], h, font: 'fontName' in it ? it.fontName : '' });
  }
  const byFont = new Map<string, string>();
  for (const run of runs) byFont.set(run.font, (byFont.get(run.font) ?? '') + run.str);
  const shree = new Set([...byFont].filter(([, text]) => fontLooksLikeShree(text)).map(([font]) => font));
  return { width: vp.width, height: vp.height, items: decodeShreeRuns(runs, shree) };
}

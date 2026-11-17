import type { Region } from '../types';
import { docFor } from './pdfjs';

const SCALE = 2;
const MAX_PAGES = 16;
const pages = new Map<string, Promise<HTMLCanvasElement>>();

export function renderPage(fileId: string, pageNo: number, scale = SCALE): Promise<HTMLCanvasElement> {
  const key = `${fileId}:${pageNo}:${scale}`;
  const hit = pages.get(key);
  if (hit) {
    pages.delete(key);
    pages.set(key, hit);
    return hit;
  }
  const p = (async () => {
    const page = await (await docFor(fileId)).getPage(pageNo);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas;
  })();
  p.catch(() => pages.delete(key));
  pages.set(key, p);
  while (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value!);
  return p;
}

/** Shrink a crop to its inked area so stray margins and blank space don't show. */
function trim(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let top = h, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return null;
  const pad = 6 * SCALE;
  return {
    x: Math.max(0, left - pad),
    y: Math.max(0, top - pad),
    w: Math.min(w, right + pad) - Math.max(0, left - pad),
    h: Math.min(h, bottom + pad) - Math.max(0, top - pad),
  };
}

const snippets = new Map<string, Promise<string | null>>();

/** Render the given page regions of a PDF as one stacked image. Returns an object URL. */
export function renderRegions(fileId: string, regions: Region[]): Promise<string | null> {
  if (!regions.length) return Promise.resolve(null);
  const key = fileId + JSON.stringify(regions);
  let p = snippets.get(key);
  if (p) return p;

  p = (async () => {
    const raws: { raw: HTMLCanvasElement; t: NonNullable<ReturnType<typeof trim>> }[] = [];
    for (const r of regions) {
      const page = await renderPage(fileId, r.page);
      const sx = Math.floor(r.x0 * SCALE);
      const sy = Math.floor(r.y0 * SCALE);
      const sw = Math.min(page.width - sx, Math.ceil((r.x1 - r.x0) * SCALE));
      const sh = Math.min(page.height - sy, Math.ceil((r.y1 - r.y0) * SCALE));
      if (sw <= 0 || sh <= 0) continue;
      const raw = document.createElement('canvas');
      raw.width = sw;
      raw.height = sh;
      const rctx = raw.getContext('2d', { willReadFrequently: true })!;
      rctx.drawImage(page, sx, sy, sw, sh, 0, 0, sw, sh);
      const t = trim(rctx, sw, sh);
      if (t) raws.push({ raw, t });
    }
    if (!raws.length) return null;

    // Trim horizontally to the union of all crops so a question continued across pages stays aligned.
    const left = Math.min(...raws.map((r) => r.t.x));
    const right = Math.max(...raws.map((r) => r.t.x + r.t.w));
    const crops = raws.map(({ raw, t }) => {
      const w = Math.min(right, raw.width) - left;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = t.h;
      c.getContext('2d')!.drawImage(raw, left, t.y, w, t.h, 0, 0, w, t.h);
      return c;
    });

    const gap = 10 * SCALE;
    const out = document.createElement('canvas');
    out.width = Math.max(...crops.map((c) => c.width));
    out.height = crops.reduce((s, c) => s + c.height, 0) + gap * (crops.length - 1);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    for (const c of crops) {
      ctx.drawImage(c, 0, y);
      y += c.height + gap;
    }
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
    return blob ? URL.createObjectURL(blob) : null;
  })();
  p.catch(() => snippets.delete(key));
  snippets.set(key, p);
  return p;
}

/** Display width (CSS px) a snippet should get so its text matches the PDF at 100%. */
export const SNIPPET_SCALE = SCALE;

const PAGE_SCALE = 1.6;
const pageUrls = new Map<string, Promise<{ url: string; w: number; h: number }>>();

/** A full page as an image, plus its size in scale-1 units (the coordinate space of regions). */
export function pageImageUrl(fileId: string, pageNo: number) {
  const key = `${fileId}:${pageNo}`;
  let p = pageUrls.get(key);
  if (!p) {
    p = renderPage(fileId, pageNo, PAGE_SCALE).then(
      (c) =>
        new Promise((res, rej) =>
          c.toBlob((b) =>
            b ? res({ url: URL.createObjectURL(b), w: c.width / PAGE_SCALE, h: c.height / PAGE_SCALE }) : rej(new Error('render failed')),
          ),
        ),
    );
    p.catch(() => pageUrls.delete(key));
    pageUrls.set(key, p);
  }
  return p;
}

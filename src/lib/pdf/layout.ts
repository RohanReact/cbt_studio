/** A run of text on a page, in scale-1 viewport units (origin top-left). */
export interface RawItem {
  str: string;
  x0: number;
  x1: number;
  baseline: number;
  /** Font size. */
  h: number;
}

export interface Column {
  x0: number;
  x1: number;
  /** Content area, excluding running headers/footers. Filled in by markFurniture. */
  top: number;
  bottom: number;
}

export interface Line {
  text: string;
  page: number;
  col: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Running header/footer/page number. */
  furniture?: boolean;
}

export interface PageLayout {
  page: number;
  width: number;
  height: number;
  cols: Column[];
  lines: Line[];
  ocr: boolean;
}

/**
 * Find a vertical gutter near the middle of the page that (almost) no text crosses,
 * which indicates a two-column layout.
 */
function findGutter(items: RawItem[], width: number): number | null {
  if (items.length < 20) return null;
  const lo = Math.floor(width * 0.3);
  const hi = Math.ceil(width * 0.7);
  const cover = new Array<number>(hi - lo).fill(0);
  for (const it of items) {
    const a = Math.max(lo, Math.floor(it.x0));
    const b = Math.min(hi, Math.ceil(it.x1));
    for (let x = a; x < b; x++) cover[x - lo]++;
  }
  const tol = Math.max(1, Math.floor(items.length * 0.02));
  let best = { len: 0, at: 0 };
  let runStart = -1;
  for (let i = 0; i <= cover.length; i++) {
    const free = i < cover.length && cover[i] <= tol;
    if (free && runStart < 0) runStart = i;
    if (!free && runStart >= 0) {
      if (i - runStart > best.len) best = { len: i - runStart, at: lo + (runStart + i) / 2 };
      runStart = -1;
    }
  }
  if (best.len < 8) return null;
  const left = items.filter((it) => (it.x0 + it.x1) / 2 < best.at).length;
  const right = items.length - left;
  if (left < items.length * 0.15 || right < items.length * 0.15) return null;
  return best.at;
}

function groupLines(items: RawItem[], page: number, col: number): Line[] {
  const sorted = [...items].sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0);
  const rows: RawItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row) {
      const ref = row[0];
      const tol = Math.max(1.5, 0.45 * Math.min(ref.h, it.h));
      if (Math.abs(it.baseline - ref.baseline) <= tol) {
        row.push(it);
        continue;
      }
    }
    rows.push([it]);
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x0 - b.x0);
    const pieces: RawItem[][] = [[]];
    let prev: RawItem | null = null;
    for (const it of row) {
      const gap = prev ? it.x0 - prev.x1 : 0;
      const heightJump = prev ? Math.abs(it.h - prev.h) > 0.22 * Math.min(it.h, prev.h) : false;
      // A wide gap, or a smaller gap into a different type size, is the other column.
      const columnGap = prev && gap > Math.max(6, 0.4 * prev.h) && (heightJump || gap > Math.max(12, prev.h * 0.85));
      if (prev && columnGap) pieces.push([]);
      pieces[pieces.length - 1].push(it);
      prev = it;
    }
    return pieces.map((piece) => {
      let text = '';
      let before: RawItem | null = null;
      for (const it of piece) {
        if (before) {
          const gap = it.x0 - before.x1;
          if (gap > 0.15 * Math.min(before.h, it.h) && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
        }
        text += it.str;
        before = it;
      }
      return {
        text: text.replace(/\s+/g, ' ').trim(),
        page,
        col,
        x0: Math.min(...piece.map((r) => r.x0)),
        x1: Math.max(...piece.map((r) => r.x1)),
        y0: Math.min(...piece.map((r) => r.baseline - r.h * 0.85)),
        y1: Math.max(...piece.map((r) => r.baseline + r.h * 0.25)),
      };
    });
  }).flat();
}

export function layoutPage(page: number, width: number, height: number, rawItems: RawItem[], ocr = false): PageLayout {
  const items = rawItems.filter((it) => it.str.trim() && it.h > 0);
  const gutter = findGutter(items, width);
  const cols: Column[] = gutter
    ? [
        { x0: 0, x1: gutter, top: 0, bottom: height },
        { x0: gutter, x1: width, top: 0, bottom: height },
      ]
    : [{ x0: 0, x1: width, top: 0, bottom: height }];

  const lines: Line[] = [];
  cols.forEach((_, ci) => {
    const mine = items.filter((it) => {
      const mid = (it.x0 + it.x1) / 2;
      return gutter === null || (ci === 0 ? mid < gutter : mid >= gutter);
    });
    lines.push(...groupLines(mine, page, ci).filter((l) => l.text));
  });
  if (!gutter) promoteSideColumn(lines, width, height, cols);
  return { page, width, height, cols, lines, ocr };
}

/** A passage with questions beside it has no empty gutter, but the questions still start further right. */
function promoteSideColumn(lines: Line[], width: number, height: number, cols: Column[]) {
  const questions = lines.filter((l) => /^\d{1,3}\s*[.)](?!\d)(?:\s|$)/.test(l.text.trim()) && l.x0 > width * 0.38);
  if (questions.length < 2) return;
  const gutter = Math.min(...questions.map((l) => l.x0)) - 2;
  const right = lines.filter((l) => l.x0 >= gutter);
  const left = lines.filter((l) => l.x0 < gutter);
  if (left.length < 3 || right.length < 3) return;
  for (const line of lines) line.col = line.x0 >= gutter ? 1 : 0;
  cols.splice(0, cols.length, { x0: 0, x1: gutter, top: 0, bottom: height }, { x0: gutter, x1: width, top: 0, bottom: height });
}

const normKey = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const PAGE_NO = /^(?:page\s*)?[#\d]+(?:\s*(?:of|\/)\s*\d+)?$|^-\s*\d+\s*-$/i;

/** Flag running headers/footers and page numbers, then compute each column's content area. */
export function markFurniture(pages: PageLayout[]) {
  const inZone = (l: Line, p: PageLayout) => l.y0 < p.height * 0.1 || l.y1 > p.height * 0.9;

  const seen = new Map<string, Set<number>>();
  for (const p of pages)
    for (const l of p.lines)
      if (inZone(l, p)) {
        const k = normKey(l.text);
        if (!seen.has(k)) seen.set(k, new Set());
        seen.get(k)!.add(p.page);
      }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));

  for (const p of pages) {
    for (const l of p.lines) {
      if (!inZone(l, p)) continue;
      // A question number at the top of a column is not a running header, even though "12." and "5." share a digit key.
      if (/^\d{1,3}\s*[.)]$/.test(l.text.trim())) continue;
      const repeated = pages.length >= 3 && (seen.get(normKey(l.text))?.size ?? 0) >= threshold;
      if (repeated || PAGE_NO.test(l.text.trim())) l.furniture = true;
    }
    const topF = p.lines.filter((l) => l.furniture && l.y1 < p.height * 0.5);
    const botF = p.lines.filter((l) => l.furniture && l.y0 >= p.height * 0.5);
    const top = topF.length ? Math.max(...topF.map((l) => l.y1)) + 2 : 0;
    const bottom = botF.length ? Math.min(...botF.map((l) => l.y0)) - 2 : p.height;
    for (const c of p.cols) {
      c.top = top;
      c.bottom = bottom;
    }
  }
}

import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { textIsReadable } from '../lib/build';
import { pageImageUrl, renderRegions, SNIPPET_SCALE } from '../lib/pdf/render';
import type { LangCode, Question, Region } from '../lib/types';

export function Snippet({ fileId, regions, zoom = 1 }: { fileId: string; regions: Region[]; zoom?: number }) {
  const [state, setState] = useState<{ url: string | null; w: number } | 'loading' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    renderRegions(fileId, regions).then(
      (url) => {
        if (!url) return alive && setState({ url: null, w: 0 });
        const img = new Image();
        img.onload = () => alive && setState({ url, w: img.naturalWidth });
        img.src = url;
      },
      () => alive && setState('error'),
    );
    return () => {
      alive = false;
    };
  }, [fileId, JSON.stringify(regions)]);

  if (state === 'loading')
    return (
      <div className="flex h-32 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (state === 'error' || !state.url)
    return (
      <div className="flex h-24 items-center justify-center gap-2 text-sm text-slate-400">
        <ImageOff size={16} /> {state === 'error' ? 'Could not render this part of the PDF.' : 'Empty region.'}
      </div>
    );
  return (
    <img
      src={state.url}
      alt="Question"
      className="snippet-img max-w-none"
      style={{ width: (state.w / SNIPPET_SCALE) * 1.15 * zoom }}
      draggable={false}
    />
  );
}

const INDIC_FONT = '"Nirmala UI","Kohinoor Devanagari","Mangal",sans-serif';

function textStyle(zoom: number, text: string, lang?: LangCode) {
  const indic = lang === 'hi' || lang === 'mr' || /[\u0900-\u097F]/.test(text);
  return {
    fontSize: 15 * zoom,
    fontFamily: indic ? INDIC_FONT : undefined,
  };
}

/** The question stem: a crop of the original PDF, or the extracted text. */
export function QuestionBody({ q, mode, zoom = 1, lang }: { q: Question; mode: 'snippet' | 'text'; zoom?: number; lang?: LangCode }) {
  const readable = textIsReadable(q.text);
  if ((mode === 'snippet' || !readable) && q.regions.length)
    return (
      <div>
        {mode === 'text' && !readable && (
          <p className="mb-2 text-xs text-slate-500">This language is shown from the page. The file has no readable Unicode text for it.</p>
        )}
        <Snippet fileId={q.fileId} regions={q.regions} zoom={zoom} />
      </div>
    );
  return (
    <div lang={lang === 'en' && /[\u0900-\u097F]/.test(q.text) ? 'mr' : lang} className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-900" style={textStyle(zoom, q.text, lang)}>
      {q.text || <span className="text-slate-400 italic">No question text. Use the PDF view to read this question.</span>}
    </div>
  );
}

export function ContextBody({ q, mode, zoom = 1, lang }: { q: Question; mode: 'snippet' | 'text'; zoom?: number; lang?: LangCode }) {
  if (!q.context) return null;
  const readable = textIsReadable(q.context.text);
  if ((mode === 'snippet' || !readable) && q.context.regions.length) return <Snippet fileId={q.fileId} regions={q.context.regions} zoom={zoom} />;
  return (
    <div lang={lang} className="leading-relaxed whitespace-pre-wrap text-slate-800" style={textStyle(zoom, q.context.text, lang)}>
      {q.context.text}
    </div>
  );
}

export function PdfPage({ fileId, page, highlight = [] }: { fileId: string; page: number; highlight?: Region[] }) {
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => {
    let alive = true;
    pageImageUrl(fileId, page).then((r) => alive && setImg(r));
    return () => {
      alive = false;
    };
  }, [fileId, page]);
  return (
    <div className="relative mx-auto w-full max-w-[900px] bg-white shadow" data-page={page}>
      {img ? <img src={img.url} alt={`Page ${page}`} className="block w-full" /> : <div className="aspect-[1/1.414] animate-pulse bg-slate-100" />}
      {img &&
        highlight
          .filter((r) => r.page === page)
          .map((r, i) => (
            <div
              key={i}
              data-highlight
              className="pointer-events-none absolute rounded-sm border-2 border-amber-400 bg-amber-200/15"
              style={{
                left: `${(r.x0 / img.w) * 100}%`,
                top: `${(r.y0 / img.h) * 100}%`,
                width: `${((r.x1 - r.x0) / img.w) * 100}%`,
                height: `${((r.y1 - r.y0) / img.h) * 100}%`,
              }}
            />
          ))}
    </div>
  );
}

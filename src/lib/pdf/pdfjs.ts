import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db } from '../db';

GlobalWorkerOptions.workerSrc = workerUrl;

const base = `${import.meta.env.BASE_URL}pdfjs/`;

export function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  return getDocument({
    data: new Uint8Array(data.slice(0)),
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
  }).promise;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function clearDocCache() {
  docs.clear();
}

/** Cached PDF document for a stored file. */
export function docFor(fileId: string): Promise<PDFDocumentProxy> {
  let p = docs.get(fileId);
  if (!p) {
    p = db.file(fileId).then((f) => {
      if (!f) throw new Error('PDF file is missing from storage.');
      return openPdf(f.data);
    });
    p.catch(() => docs.delete(fileId));
    docs.set(fileId, p);
  }
  return p;
}

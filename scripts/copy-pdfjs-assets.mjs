// pdf.js loads fonts, character maps and wasm image decoders (JPX/JBIG2, common in scanned papers) at runtime.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/pdfjs-dist');
const dest = join(root, 'public/pdfjs');

for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  if (!existsSync(join(src, dir))) continue;
  mkdirSync(join(dest, dir), { recursive: true });
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs');

// Generates sample question papers in common Indian exam layouts for testing the importer.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples');
mkdirSync(out, { recursive: true });

const W = 595;
const H = 842;

async function makeDoc({ header, columns = 1 }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  const gutter = 24;
  const colW = (W - margin * 2 - gutter * (columns - 1)) / columns;
  let page;
  let col = 0;
  let y = 0;

  const newPage = () => {
    page = doc.addPage([W, H]);
    col = 0;
    y = H - 70;
    if (header) page.drawText(header, { x: margin, y: H - 35, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
  };
  const colX = () => margin + col * (colW + gutter);
  const advance = (need) => {
    if (y - need < 60) {
      if (col < columns - 1) {
        col++;
        y = H - 70;
      } else newPage();
    }
  };

  const wrap = (text, size, f, width) => {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const api = {
    text(t, { size = 10.5, b = false, indent = 0, gap = 4 } = {}) {
      const f = b ? bold : font;
      for (const line of wrap(t, size, f, colW - indent)) {
        advance(size + 3);
        page.drawText(line, { x: colX() + indent, y, size, font: f });
        y -= size + 3;
      }
      y -= gap;
    },
    figure(h = 70) {
      advance(h + 10);
      const x = colX() + 30;
      page.drawRectangle({ x, y: y - h, width: 120, height: h, borderColor: rgb(0, 0, 0), borderWidth: 1.2 });
      page.drawCircle({ x: x + 60, y: y - h / 2, size: h / 3, borderColor: rgb(0.1, 0.2, 0.8), borderWidth: 1.5 });
      page.drawLine({ start: { x, y: y - h }, end: { x: x + 120, y }, thickness: 1, color: rgb(0.8, 0.1, 0.1) });
      y -= h + 10;
    },
    pageBreak() {
      newPage();
    },
    async save(name) {
      const pages = doc.getPages();
      pages.forEach((p, i) =>
        p.drawText(`Page ${i + 1} of ${pages.length}`, { x: W / 2 - 25, y: 30, size: 8, font, color: rgb(0.4, 0.4, 0.4) }),
      );
      writeFileSync(join(out, name), await doc.save());
      console.log('wrote', name, pages.length, 'pages');
    },
  };
  newPage();
  return api;
}

const L = ['A', 'B', 'C', 'D'];

// ---------- GATE style: single column, "Q.n", range hints, MCQ/MSQ/NAT, separate key PDF ----------
{
  const d = await makeDoc({ header: 'GATE 2025 Computer Science and Information Technology (CS)' });
  d.text('General Aptitude (GA)', { b: true, size: 13, gap: 8 });
  d.text('Q.1 – Q.5 Carry ONE mark Each', { b: true });
  const gaKey = [];
  for (let i = 1; i <= 10; i++) {
    if (i === 6) d.text('Q.6 – Q.10 Carry TWO marks Each', { b: true });
    d.text(`Q.${i} If the price of ${i + 2} pens is Rs. ${(i + 2) * 12}, what is the price of one pen in rupees? Choose the most appropriate option.`);
    if (i === 7) d.figure();
    d.text(`(A) ${10 + i}`, { indent: 18, gap: 0 });
    d.text(`(B) 12`, { indent: 18, gap: 0 });
    d.text(`(C) ${14 + i}`, { indent: 18, gap: 0 });
    d.text(`(D) ${20 + i}`, { indent: 18, gap: 10 });
    gaKey.push('B');
  }
  d.pageBreak();
  d.text('Q.11 – Q.15 Carry ONE mark Each', { b: true });
  for (let i = 11; i <= 15; i++) {
    if (i === 13) {
      d.text(`Q.${i} The number of edges in a complete graph on ${i - 7} vertices is __________ (in integer).`, { gap: 10 });
    } else if (i === 14) {
      d.text(`Q.${i} Which of the following are regular languages? Select one or more correct options.`);
      d.text('(A) a*b*', { indent: 18, gap: 0 });
      d.text('(B) a^n b^n for n >= 0', { indent: 18, gap: 0 });
      d.text('(C) (ab)*', { indent: 18, gap: 0 });
      d.text('(D) palindromes over {a, b}', { indent: 18, gap: 10 });
    } else {
      d.text(`Q.${i} Consider a binary tree with ${i} nodes. The minimum possible height of the tree (root at height 0) is`);
      d.text(`(A) ${i % 4}`, { indent: 18, gap: 0 });
      d.text(`(B) ${(i % 4) + 1}`, { indent: 18, gap: 0 });
      d.text(`(C) 3`, { indent: 18, gap: 0 });
      d.text(`(D) ${(i % 4) + 3}`, { indent: 18, gap: 10 });
    }
  }
  d.text('Q.16 – Q.18 Carry TWO marks Each', { b: true });
  for (let i = 16; i <= 18; i++) {
    d.text(`Q.${i} The probability that a fair die shows a number greater than ${i - 14} is __________ (rounded off to two decimal places).`, {
      gap: 10,
    });
  }
  await d.save('gate-style-paper.pdf');

  const k = await makeDoc({ header: 'GATE 2025 Answer Key for Computer Science and Information Technology (CS)' });
  k.text('Q. No.  Session  Question Type  Section  Key/Range  Mark', { b: true });
  const rows = [
    ...gaKey.map((a, i) => `${i + 1} 3 MCQ GA ${a} ${i < 5 ? 1 : 2}`),
    '11 3 MCQ CS C 1',
    '12 3 MCQ CS C 1',
    '13 3 NAT CS 15 to 15 1',
    '14 3 MSQ CS A;C 1',
    '15 3 MCQ CS MTA 1',
    '16 3 NAT CS 0.66 to 0.67 2',
    '17 3 NAT CS 0.49 to 0.51 2',
    '18 3 NAT CS 0.33 to 0.34 2',
  ];
  for (const r of rows) k.text(r, { gap: 1 });
  await k.save('gate-style-answer-key.pdf');
}

// ---------- MHT-CET style: two columns, subject headings, bare numbering restarting, key at end ----------
{
  const d = await makeDoc({ header: 'MHT-CET 2025 Mock Paper — PCM', columns: 2 });
  const subjects = ['PHYSICS', 'CHEMISTRY', 'MATHEMATICS'];
  const key = {};
  for (const s of subjects) {
    d.text(s, { b: true, size: 13, gap: 8 });
    key[s] = [];
    for (let i = 1; i <= 8; i++) {
      d.text(`${i}. A ${s.toLowerCase()} question number ${i}: which value satisfies the given condition when x = ${i}?`);
      d.text(`(A) ${i}  (B) ${i * 2}`, { indent: 12, gap: 0 });
      d.text(`(C) ${i * 3}  (D) ${i * 4}`, { indent: 12, gap: 8 });
      key[s].push(L[(i + s.length) % 4]);
    }
  }
  d.pageBreak();
  d.text('ANSWER KEY', { b: true, size: 13 });
  for (const s of subjects) {
    d.text(s, { b: true });
    d.text(key[s].map((a, i) => `${i + 1}. (${a})`).join('   '));
  }
  await d.save('mhtcet-style-paper.pdf');
}

// ---------- CAT style: sections, RC passage with "Directions for questions", numbered options, TITA, transposed key ----------
{
  const d = await makeDoc({ header: 'CAT 2025 Slot 1 — Memory Based' });
  const key = [];
  d.text('Section: VARC', { b: true, size: 13, gap: 8 });
  d.text('Directions for questions 1 to 3: Read the passage below and answer the questions that follow.', { b: true });
  d.text(
    'The history of cartography is a history of compromise. Every flat map distorts the curved surface of the earth, and every mapmaker decides which distortions matter least for the purpose at hand. Navigators prized true angles, administrators prized true areas, and travellers wanted true distances along a few chosen routes.',
    { gap: 8 },
  );
  for (let i = 1; i <= 3; i++) {
    d.text(`Q${i}. According to the passage, which of the following best describes statement ${i}?`);
    for (let o = 1; o <= 4; o++) d.text(`${o}. Option ${o} for question ${i}`, { indent: 18, gap: 0 });
    d.text('', { gap: 8 });
    key.push(String(((i + 1) % 4) + 1));
  }
  d.text('Section: DILR', { b: true, size: 13, gap: 8 });
  for (let i = 4; i <= 5; i++) {
    d.text(`Q${i}. Five friends sit in a row. How many arrangements have friend A at an end if there are ${i} constraints?`);
    for (let o = 1; o <= 4; o++) d.text(`${o}. ${o * 12}`, { indent: 18, gap: 0 });
    d.text('', { gap: 8 });
    key.push('2');
  }
  d.text('Section: QA', { b: true, size: 13, gap: 8 });
  d.text('Q6. If x + 1/x = 3, find the value of x^2 + 1/x^2.', { gap: 10 });
  key.push('7');
  d.text('Q7. The sum of the first 20 natural numbers is', { gap: 10 });
  key.push('210');
  await d.save('cat-style-paper.pdf');

  const k = await makeDoc({ header: 'CAT 2025 Answer Key' });
  k.text('Q.No ' + key.map((_, i) => i + 1).join(' '));
  k.text('Ans ' + key.join(' '));
  await k.save('cat-style-answer-key.pdf');
}

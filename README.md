# CBT Studio

Turn any exam question paper PDF into a real **computer-based test** — timer, question palette, mark-for-review, submit, and instant score against an answer key.

Built for practising the way CAT, GATE, MHT-CET, JEE Main and similar exams actually run on screen.

## What it does

1. **Import PDFs** — drop one or many question papers (and optional answer-key PDFs).
2. **Parse in the browser** — reads text with PDF.js; scanned pages use Tesseract OCR locally, then the paper and PDF are saved to your account.
3. **Review & edit** — fix question types (MCQ / MSQ / NAT), options, sections, marks, and answers.
4. **Attempt as CBT** — sectional or total timer, palette statuses, autosave to IndexedDB.
5. **Instant result** — score, accuracy, and per-question review. The answer key can be added before the test or on the result page afterwards.
6. **Dashboard** — papers added, tests finished, scores, and section accuracy in one place.

Papers printed in two languages, such as English beside Hindi, keep a language switch on the test screen. Any section can be skipped before or during the test, and a skipped section is left out of the score.

## Quick start

```bash
cd cbt-studio
npm install
npm run dev
```

`npm run dev` starts the site (usually `http://localhost:5173`) and the account API on `http://127.0.0.1:8787`.

Create an account, import a PDF, and take the test. A free account stores **1 paper**. Paid plans store as many as you need.

Try built-in demos from the empty library → **Try sample papers**, or go to `/import?samples=1`.

## Exam presets

| Preset   | Timing                         | Marking (default)                          |
|----------|--------------------------------|--------------------------------------------|
| CAT      | 3 × 40 min sectional (locked)  | MCQ +3/−1, TITA +3/0                       |
| GATE     | 180 min total                  | 1/2-mark; MCQ −⅓ of marks; MSQ/NAT 0       |
| MHT-CET  | 90 + 90 min groups             | Physics/Chem 1, Maths 2; no negative       |
| JEE Main | 180 min total                  | +4 / −1                                    |
| CTET     | 150 min total                  | +1 / 0. Paper 2: attempt Maths and Science or Social Studies. |
| Custom   | Your duration                  | +1 / 0                                     |

Presets are auto-detected from the PDF text/filename and can be changed in the editor.

## Tips for best parse quality

- Prefer **official / text-selectable** PDFs (GATE, memory-based CAT, coaching papers).
- Name answer keys with `answer` / `key` in the filename so they auto-link.
- For image-only scans, leave OCR on **auto** and review detected questions before starting.
- If parsing finds nothing, open the editor → use **Full PDF** display and set question count manually — you still get the full CBT UI with the PDF beside the answer panel.

## Plans

Prices include taxes. Quarterly is the plan that fits a CAT, GATE or MHT-CET season.

| Plan | Price | What you get |
|------|-------|----------------|
| Free | ₹0 | 1 paper, full timer / palette / score |
| Weekly | ₹99 | Unlimited papers for 7 days |
| Monthly | ₹299 | Unlimited papers for 30 days |
| Quarterly | ₹599 | Unlimited papers for 90 days |

Quarterly is ₹599 against ₹897 for three separate months, so the season saves ₹298. It is about the same sticker as two monthly plans. Weekly is for the last week before the exam: four weeks at ₹99 would be ₹396, which is more than one month.

Buying another plan while one is still active extends the end date. It does not restart from today.

Payments go through **Razorpay** when `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. Without those keys the pricing page uses a test checkout that activates the plan and does not charge a card. Copy `.env.example` to `.env`.

```bash
npm run build
npm start
```

`npm start` serves the built site and the API together on port 8787. Uploaded PDFs and the SQLite database live in `data/` (override with `DATA_DIR`).

## Move to production

The app is one Node process: it serves the built React site and the API. There is no separate frontend host required.

1. Buy a domain and point it at a small Linux VM (2 GB RAM is enough to start).
2. Install Node 22 or newer. Clone the repo, run `npm install`, `npm run build`.
3. Put `data/` on a disk that survives restarts, and back it up daily. That folder is the database and every uploaded PDF.
4. Copy `.env.example` to `.env`. Set `HOST=0.0.0.0`, `COOKIE_SECURE=1`, and `CORS_ORIGIN` to your https origin.
5. Create a Razorpay account, complete KYC, and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Until those are set, checkout does not charge a card.
6. Put Caddy or Nginx in front of port 8787 so the site is served on HTTPS. Run `node server/index.ts` under systemd so it restarts if it crashes.
7. Start with `npm start` only after `npm run build`. The Vite dev server is not the production server.

Still local-only until you do that: accounts, papers and test payments stay on this machine.

## Tech

- React 19 + Vite + TypeScript + Tailwind
- PDF.js + optional Tesseract.js (OCR stays in the browser)
- Account API on Node (`node:sqlite`) for users, papers, PDFs and attempts
- Zustand for the live exam screen

```bash
npm test          # unit tests for parse / answer-key
npm run typecheck
npm run build
```

## Privacy

Papers, PDFs and attempts are stored for the signed-in account. OCR still runs in the browser. Use HTTPS and Razorpay keys before accepting real payments, and only upload papers you have the right to use.

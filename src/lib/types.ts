export type QType = 'MCQ' | 'MSQ' | 'NAT';

/** `hi` and `mr` cover Hindi and Marathi in Unicode or in a legacy font. `other` is a second language we could not name. */
export type LangCode = 'en' | 'hi' | 'mr' | 'other';

export type PresetId =
  | 'CAT'
  | 'CMAT'
  | 'GATE'
  | 'JEEMAIN'
  | 'JEEADV'
  | 'MHTCET'
  | 'BITSAT'
  | 'CUET'
  | 'NEETUG'
  | 'NEETPG'
  | 'CLAT'
  | 'SSCCGL'
  | 'IBPSPO'
  | 'UPSC'
  | 'CTET'
  | 'CUSTOM';

/** A rectangle on a PDF page, in scale-1 viewport units (origin top-left). */
export interface Region {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Answer =
  | { kind: 'choice'; values: number[] }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'dropped' };

export interface Question {
  id: string;
  sectionId: string;
  /** Number printed in the source PDF. */
  sourceNumber: number;
  type: QType;
  text: string;
  options: string[];
  optionCount: number;
  optionStyle: 'alpha' | 'numeric';
  answer: Answer | null;
  marks: number;
  negative: number;
  /** Marks printed in the paper itself (e.g. "Q.26 – Q.55 carry TWO marks"). */
  marksHint?: number;
  fileId: string;
  regions: Region[];
  /** Shared passage / directions (e.g. a reading comprehension passage for Q1–4). */
  context?: { text: string; regions: Region[] };
  /** Solution text printed after the question, shown only in the review. */
  solution?: string;
  /** The same question printed in the other language, usually the facing column. */
  alt?: { lang: Exclude<LangCode, 'en'>; text: string; options: string[]; regions: Region[] };
}

export interface Section {
  id: string;
  name: string;
  /** Sections sharing a timer group are attempted together under one clock. */
  timerGroup: number;
  /** Sections with the same choice group are alternatives. The candidate attempts one of them. */
  choiceGroup?: string;
}

export interface PaperFile {
  id: string;
  name: string;
  pages: number;
}

export type DisplayMode = 'snippet' | 'text' | 'pdf';

export interface Paper {
  id: string;
  name: string;
  preset: PresetId;
  createdAt: number;
  updatedAt: number;
  files: PaperFile[];
  sections: Section[];
  questions: Question[];
  durationMin: number;
  timing: 'total' | 'sectional';
  /** Minutes per timer group, used when timing is 'sectional'. */
  groupMinutes: Record<number, number>;
  displayMode: DisplayMode;
  /** Allow moving to the next timer group before its clock runs out. */
  allowEarlySectionSubmit: boolean;
  parseNotes: string[];
  /** Languages detected in the PDF. The paper's own language is first. */
  languages?: LangCode[];
  /** Booklet set, such as E, when the PDF is one set of a multi-set exam. */
  setCode?: string;
  /** False when the extracted script is not reliable, so the test stays on the original page. */
  allowText?: boolean;
}

export type QStatus = 'notVisited' | 'notAnswered' | 'answered' | 'marked' | 'answeredMarked';

/** number[] for MCQ/MSQ (option indices), string for NAT. */
export type ResponseValue = number[] | string | null;

export interface QResponse {
  value: ResponseValue;
  visited: boolean;
  marked: boolean;
  timeMs: number;
}

export interface Attempt {
  id: string;
  paperId: string;
  paperName: string;
  candidateName: string;
  status: 'in-progress' | 'submitted';
  startedAt: number;
  submittedAt?: number;
  responses: Record<string, QResponse>;
  currentQid: string;
  groupIndex: number;
  /** Remaining time on the active clock (whole paper, or current timer group). */
  timeLeftMs: number;
  timeUsedMs: number;
  /** Cached at submit for the library; the result page always re-grades live. */
  summary?: { score: number; maxScore: number; correct: number; wrong: number; unattempted: number };
  /** Sections the candidate chose not to attempt. Their marks are left out of the score. */
  skippedSectionIds?: string[];
  /** Language shown on the question screen. */
  lang?: LangCode;
}

export interface StoredFile {
  id: string;
  name: string;
  data: ArrayBuffer;
}

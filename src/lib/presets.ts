import type { Paper, PresetId, QType, Question, Section } from './types';

interface MarkingContext {
  /** 1-based position of the question in the whole paper. */
  position: number;
  total: number;
  section: Section;
}

export interface Preset {
  id: PresetId;
  label: string;
  blurb: string;
  durationMin: number;
  timing: 'total' | 'sectional';
  /** Default section names, used when the PDF has no recognisable section headings. */
  sections: { name: string; match: RegExp; timerGroup: number; count?: number }[];
  groupMinutes: Record<number, number>;
  allowEarlySectionSubmit: boolean;
  natLabel: string;
  marking: (q: Question, ctx: MarkingContext) => { marks: number; negative: number };
  /** Text in the paper that suggests this exam. */
  detect: RegExp;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const PRESETS: Record<PresetId, Preset> = {
  CAT: {
    id: 'CAT',
    label: 'CAT',
    blurb: '3 sections × 40 min, locked sectional timer. MCQ +3/−1, TITA +3/0.',
    durationMin: 120,
    timing: 'sectional',
    sections: [
      { name: 'VARC', match: /verbal|reading|varc/i, timerGroup: 1, count: 24 },
      { name: 'DILR', match: /data\s*interp|logical|dilr|lrdi/i, timerGroup: 2, count: 22 },
      { name: 'QA', match: /quant|^qa\b/i, timerGroup: 3, count: 22 },
    ],
    groupMinutes: { 1: 40, 2: 40, 3: 40 },
    allowEarlySectionSubmit: false,
    natLabel: 'TITA',
    marking: (q) => ({ marks: 3, negative: q.type === 'MCQ' ? 1 : 0 }),
    detect: /\bCAT\b|common admission test|\bIIM\b|\bTITA\b/i,
  },
  GATE: {
    id: 'GATE',
    label: 'GATE',
    blurb: '3 hours, 65 questions, 100 marks. 1/2-mark questions; MCQ negative 1/3 of marks, none for MSQ/NAT.',
    durationMin: 180,
    timing: 'total',
    sections: [
      { name: 'General Aptitude', match: /general\s*aptitude|\bGA\b/i, timerGroup: 1, count: 10 },
      { name: 'Technical', match: /technical|engineering|core|subject/i, timerGroup: 1, count: 55 },
    ],
    groupMinutes: { 1: 180 },
    allowEarlySectionSubmit: true,
    natLabel: 'NAT',
    marking: (q, { position, total }) => {
      let marks = q.marksHint ?? 1;
      if (q.marksHint === undefined && total === 65) {
        marks = position <= 5 ? 1 : position <= 10 ? 2 : position <= 35 ? 1 : 2;
      }
      return { marks, negative: q.type === 'MCQ' ? round2(marks / 3) : 0 };
    },
    detect: /\bGATE\b|graduate aptitude test/i,
  },
  MHTCET: {
    id: 'MHTCET',
    label: 'MHT-CET (PCM)',
    blurb: 'Physics + Chemistry 90 min, then Maths 90 min. Maths 2 marks, others 1. No negative marking.',
    durationMin: 180,
    timing: 'sectional',
    sections: [
      { name: 'Physics', match: /physics/i, timerGroup: 1, count: 50 },
      { name: 'Chemistry', match: /chemistry/i, timerGroup: 1, count: 50 },
      { name: 'Mathematics', match: /math/i, timerGroup: 2, count: 50 },
    ],
    groupMinutes: { 1: 90, 2: 90 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q, { section }) => ({
      marks: q.marksHint ?? (/math/i.test(section.name) ? 2 : 1),
      negative: 0,
    }),
    detect: /MHT[\s-]*CET|maharashtra/i,
  },
  JEEMAIN: {
    id: 'JEEMAIN',
    label: 'JEE Main',
    blurb: '3 hours, Physics / Chemistry / Maths. +4 / −1 for MCQ and numerical.',
    durationMin: 180,
    timing: 'total',
    sections: [
      { name: 'Physics', match: /physics/i, timerGroup: 1, count: 25 },
      { name: 'Chemistry', match: /chemistry/i, timerGroup: 1, count: 25 },
      { name: 'Mathematics', match: /math/i, timerGroup: 1, count: 25 },
    ],
    groupMinutes: { 1: 180 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 4, negative: 1 }),
    detect: /\bJEE\b|joint entrance/i,
  },
  JEEADV: {
    id: 'JEEADV',
    label: 'JEE Advanced',
    blurb: '3 hours. Starting point +3/−1 for single-correct MCQ, no negative for numerical. Advanced marking changes every year, so check the paper.',
    durationMin: 180,
    timing: 'total',
    sections: [
      { name: 'Physics', match: /physics/i, timerGroup: 1 },
      { name: 'Chemistry', match: /chemistry/i, timerGroup: 1 },
      { name: 'Mathematics', match: /math/i, timerGroup: 1 },
    ],
    groupMinutes: { 1: 180 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 3, negative: q.type === 'MCQ' ? 1 : 0 }),
    detect: /jee\s*adv/i,
  },
  BITSAT: {
    id: 'BITSAT',
    label: 'BITSAT',
    blurb: '3 hours. +3 / −1.',
    durationMin: 180,
    timing: 'total',
    sections: [
      { name: 'Physics', match: /physics/i, timerGroup: 1 },
      { name: 'Chemistry', match: /chemistry/i, timerGroup: 1 },
      { name: 'Mathematics', match: /math/i, timerGroup: 1 },
      { name: 'English', match: /english/i, timerGroup: 1 },
      { name: 'Logical Reasoning', match: /logical|reasoning/i, timerGroup: 1 },
    ],
    groupMinutes: { 1: 180 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 3, negative: 1 }),
    detect: /bitsat/i,
  },
  CUET: {
    id: 'CUET',
    label: 'CUET UG',
    blurb: 'CBT. Subject time and marks vary. Starting point: 60 min, +5 / −1.',
    durationMin: 60,
    timing: 'total',
    sections: [{ name: 'Domain', match: /domain|subject|section/i, timerGroup: 1 }],
    groupMinutes: { 1: 60 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 5, negative: 1 }),
    detect: /\bcuet\b/i,
  },
  NEETPG: {
    id: 'NEETPG',
    label: 'NEET PG',
    blurb: '3 hours 30 min, 200 MCQs. +4 / −1.',
    durationMin: 210,
    timing: 'total',
    sections: [{ name: 'NEET PG', match: /neet|medical/i, timerGroup: 1 }],
    groupMinutes: { 1: 210 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 4, negative: 1 }),
    detect: /neet[\s-]*pg/i,
  },
  NEETUG: {
    id: 'NEETUG',
    label: 'NEET UG',
    blurb: 'The hall exam is pen-and-paper. Here it is a 180 min on-screen test. +4 / −1.',
    durationMin: 180,
    timing: 'total',
    sections: [
      { name: 'Physics', match: /physics/i, timerGroup: 1 },
      { name: 'Chemistry', match: /chemistry/i, timerGroup: 1 },
      { name: 'Biology', match: /biology|botany|zoology/i, timerGroup: 1 },
    ],
    groupMinutes: { 1: 180 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 4, negative: 1 }),
    detect: /\bneet\b/i,
  },
  CLAT: {
    id: 'CLAT',
    label: 'CLAT',
    blurb: '2 hours, 120 questions. +1 / −0.25.',
    durationMin: 120,
    timing: 'total',
    sections: [{ name: 'CLAT', match: /legal|english|logic|quant|current/i, timerGroup: 1 }],
    groupMinutes: { 1: 120 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 1, negative: 0.25 }),
    detect: /\bclat\b/i,
  },
  CMAT: {
    id: 'CMAT',
    label: 'CMAT',
    blurb: '3 hours. +4 / −1.',
    durationMin: 180,
    timing: 'total',
    sections: [{ name: 'CMAT', match: /quant|language|logical|general/i, timerGroup: 1 }],
    groupMinutes: { 1: 180 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 4, negative: 1 }),
    detect: /\bcmat\b/i,
  },
  SSCCGL: {
    id: 'SSCCGL',
    label: 'SSC CGL Tier 1',
    blurb: '60 minutes, 100 questions. +2 / −0.50.',
    durationMin: 60,
    timing: 'total',
    sections: [
      { name: 'General Intelligence', match: /intelligence|reasoning/i, timerGroup: 1 },
      { name: 'General Awareness', match: /awareness|gk/i, timerGroup: 1 },
      { name: 'Quantitative Aptitude', match: /quant|aptitude|math/i, timerGroup: 1 },
      { name: 'English', match: /english/i, timerGroup: 1 },
    ],
    groupMinutes: { 1: 60 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 2, negative: 0.5 }),
    detect: /ssc[\s-]*cgl|staff selection/i,
  },
  IBPSPO: {
    id: 'IBPSPO',
    label: 'IBPS PO prelims',
    blurb: '20 min English, 20 min Quant, 20 min Reasoning. +1 / −0.25. Mains is a different paper.',
    durationMin: 60,
    timing: 'sectional',
    sections: [
      { name: 'English', match: /english/i, timerGroup: 1, count: 30 },
      { name: 'Quantitative Aptitude', match: /quant|aptitude|math/i, timerGroup: 2, count: 35 },
      { name: 'Reasoning', match: /reason/i, timerGroup: 3, count: 35 },
    ],
    groupMinutes: { 1: 20, 2: 20, 3: 20 },
    allowEarlySectionSubmit: false,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 1, negative: 0.25 }),
    detect: /\bibps\b/i,
  },
  CTET: {
    id: 'CTET',
    label: 'CTET',
    blurb: '2 hours 30 min. +1 / 0. Paper 2: attempt Mathematics and Science or Social Studies, not both.',
    durationMin: 150,
    timing: 'total',
    sections: [
      { name: 'Child Development and Pedagogy', match: /child development|pedagogy/i, timerGroup: 1 },
      { name: 'Mathematics and Science', match: /mathematics and science/i, timerGroup: 1 },
      { name: 'Social Studies', match: /social studies|social science/i, timerGroup: 1 },
      { name: 'Language I', match: /language\s*[-–]?\s*i\b/i, timerGroup: 1 },
      { name: 'Language II', match: /language\s*[-–]?\s*ii\b/i, timerGroup: 1 },
    ],
    groupMinutes: { 1: 150 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 1, negative: 0 }),
    detect: /\bctet\b|central teacher eligibility/i,
  },
  UPSC: {
    id: 'UPSC',
    label: 'UPSC CSE Prelims',
    blurb: 'The hall uses an OMR sheet. Here GS is a 2 hour on-screen test. +2 / −0.66.',
    durationMin: 120,
    timing: 'total',
    sections: [{ name: 'General Studies', match: /general|gs|prelim/i, timerGroup: 1 }],
    groupMinutes: { 1: 120 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 2, negative: 0.66 }),
    detect: /\bupsc\b|civil services/i,
  },
  CUSTOM: {
    id: 'CUSTOM',
    label: 'Custom',
    blurb: 'Your own timer and marking. Defaults: 60 min, +1 / 0.',
    durationMin: 60,
    timing: 'total',
    sections: [],
    groupMinutes: { 1: 60 },
    allowEarlySectionSubmit: true,
    natLabel: 'Numerical',
    marking: (q) => ({ marks: q.marksHint ?? 1, negative: 0 }),
    detect: /$^/,
  },
};

export const PRESET_LIST = Object.values(PRESETS);

const DETECT_ORDER: PresetId[] = [
  'CTET',
  'JEEADV',
  'NEETPG',
  'NEETUG',
  'MHTCET',
  'BITSAT',
  'JEEMAIN',
  'CUET',
  'CLAT',
  'CMAT',
  'SSCCGL',
  'IBPSPO',
  'UPSC',
  'CAT',
  'GATE',
];

export function detectPreset(text: string, fileName: string): PresetId {
  const hay = `${fileName}\n${text.slice(0, 4000)}`;
  for (const id of DETECT_ORDER) if (PRESETS[id].detect.test(hay)) return id;
  return 'CUSTOM';
}

export function typeLabel(type: QType, preset: PresetId) {
  return type === 'NAT' ? PRESETS[preset].natLabel : type;
}

/** Map each section to the preset's timer group (by name), then fill marks/negative for every question. */
export function applyPreset(paper: Paper, presetId: PresetId, opts: { marking: boolean; timing: boolean }): Paper {
  const preset = PRESETS[presetId];
  let sections = paper.sections;

  if (opts.timing) {
    sections = sections.map((s, i) => {
      const def = preset.sections.find((d) => d.match.test(s.name)) ?? preset.sections[i];
      return { ...s, timerGroup: def?.timerGroup ?? 1 };
    });
  }

  let questions = paper.questions;
  if (opts.marking) {
    const byId = new Map(sections.map((s) => [s.id, s]));
    questions = questions.map((q, i) => {
      const { marks, negative } = preset.marking(q, {
        position: i + 1,
        total: questions.length,
        section: byId.get(q.sectionId) ?? sections[0],
      });
      return { ...q, marks, negative };
    });
  }

  const groups = [...new Set(sections.map((s) => s.timerGroup))];
  const timing = opts.timing ? (groups.length > 1 ? preset.timing : 'total') : paper.timing;
  const groupMinutes = opts.timing ? { ...preset.groupMinutes } : paper.groupMinutes;
  for (const g of groups) groupMinutes[g] ??= Math.round(preset.durationMin / groups.length);

  return {
    ...paper,
    preset: presetId,
    sections,
    questions,
    timing,
    groupMinutes,
    durationMin: opts.timing ? preset.durationMin : paper.durationMin,
    allowEarlySectionSubmit: opts.timing ? preset.allowEarlySectionSubmit : paper.allowEarlySectionSubmit,
  };
}

/** Ordered timer groups with their sections and minutes. Single group when timing is 'total'. */
export function timerGroups(paper: Paper) {
  if (paper.timing === 'total') {
    return [{ group: 0, sectionIds: paper.sections.map((s) => s.id), minutes: paper.durationMin }];
  }
  const ids = [...new Set(paper.sections.map((s) => s.timerGroup))].sort((a, b) => a - b);
  return ids.map((g) => ({
    group: g,
    sectionIds: paper.sections.filter((s) => s.timerGroup === g).map((s) => s.id),
    minutes: paper.groupMinutes[g] ?? 30,
  }));
}

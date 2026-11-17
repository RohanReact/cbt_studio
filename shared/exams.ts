export const EXAMS = [
  { id: 'CAT', label: 'CAT', group: 'MBA', preset: 'CAT', format: 'CBT' },
  { id: 'CMAT', label: 'CMAT', group: 'MBA', preset: 'CMAT', format: 'CBT' },
  { id: 'GATE', label: 'GATE', group: 'Engineering', preset: 'GATE', format: 'CBT' },
  { id: 'JEEMAIN', label: 'JEE Main', group: 'Engineering', preset: 'JEEMAIN', format: 'CBT' },
  { id: 'JEEADV', label: 'JEE Advanced', group: 'Engineering', preset: 'JEEADV', format: 'CBT' },
  { id: 'MHTCET', label: 'MHT-CET', group: 'Engineering', preset: 'MHTCET', format: 'CBT' },
  { id: 'BITSAT', label: 'BITSAT', group: 'Engineering', preset: 'BITSAT', format: 'CBT' },
  { id: 'CUET', label: 'CUET UG', group: 'University', preset: 'CUET', format: 'CBT' },
  { id: 'NEETUG', label: 'NEET UG', group: 'Medical', preset: 'NEETUG', format: 'Pen and paper' },
  { id: 'NEETPG', label: 'NEET PG', group: 'Medical', preset: 'NEETPG', format: 'CBT' },
  { id: 'CLAT', label: 'CLAT', group: 'Law', preset: 'CLAT', format: 'CBT' },
  { id: 'SSCCGL', label: 'SSC CGL', group: 'Government', preset: 'SSCCGL', format: 'CBT' },
  { id: 'IBPSPO', label: 'IBPS PO', group: 'Government', preset: 'IBPSPO', format: 'CBT' },
  { id: 'UPSC', label: 'UPSC CSE Prelims', group: 'Government', preset: 'UPSC', format: 'OMR sheet' },
  { id: 'CTET', label: 'CTET', group: 'Teaching', preset: 'CTET', format: 'CBT' },
  { id: 'OTHER', label: 'Any other PDF', group: 'Other', preset: 'CUSTOM', format: 'Any paper' },
] as const;

export type ExamId = (typeof EXAMS)[number]['id'];

export const SAMPLE_FILES: Partial<Record<ExamId, string[]>> = {
  CAT: ['cat-style-paper.pdf', 'cat-style-answer-key.pdf'],
  GATE: ['gate-style-paper.pdf', 'gate-style-answer-key.pdf'],
  MHTCET: ['mhtcet-style-paper.pdf'],
};

export function examById(id: string) {
  return EXAMS.find((exam) => exam.id === id);
}

export function examGroups() {
  return [...new Set(EXAMS.map((exam) => exam.group))];
}

/** Returns a cleaned list, or null when the selection is empty or unknown. */
export function normalizeExams(value: unknown): ExamId[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.filter((item): item is ExamId => typeof item === 'string' && EXAMS.some((exam) => exam.id === item)))];
  if (!ids.length || ids.length > EXAMS.length) return null;
  return ids;
}

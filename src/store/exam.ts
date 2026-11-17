import { create } from 'zustand';
import { db } from '../lib/db';
import { grade, hasValue } from '../lib/grading';
import { timerGroups } from '../lib/presets';
import type { Attempt, LangCode, Paper, QResponse, Question, ResponseValue } from '../lib/types';

type Groups = ReturnType<typeof timerGroups>;

interface ExamState {
  paper: Paper | null;
  attempt: Attempt | null;
  groups: Groups;
  /** Selection on screen that hasn't been saved with Save & Next yet. */
  draft: ResponseValue;
  load: (paper: Paper, attempt: Attempt) => void;
  goto: (qid: string) => void;
  setDraft: (v: ResponseValue) => void;
  saveAndNext: () => void;
  markAndNext: () => void;
  clearResponse: () => void;
  setLang: (lang: LangCode) => void;
  /** Leave a section out of the score and move to the next counted question. */
  skipSection: (sectionId: string) => 'moved' | 'empty';
  unskipSection: (sectionId: string) => void;
  /** Advance the clock. Returns true when the active timer has run out. */
  tick: (ms: number) => boolean;
  /** Move to the next timer group. Returns false if this was the last one. */
  nextGroup: () => boolean;
  submit: () => Promise<Attempt>;
  persist: () => void;
}

const blank = (): QResponse => ({ value: null, visited: false, marked: false, timeMs: 0 });

function normalize(v: ResponseValue): ResponseValue {
  if (Array.isArray(v)) return v.length ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t && Number.isFinite(Number(t)) ? t : null;
  }
  return null;
}

export function groupQuestions(paper: Paper, groups: Groups, groupIndex: number): Question[] {
  const ids = new Set(groups[groupIndex]?.sectionIds ?? []);
  return paper.questions.filter((q) => ids.has(q.sectionId));
}

export function skippedSet(attempt: Attempt) {
  return new Set(attempt.skippedSectionIds ?? []);
}

export function countedQuestions(paper: Paper, groups: Groups, groupIndex: number, attempt: Attempt): Question[] {
  const skip = skippedSet(attempt);
  return groupQuestions(paper, groups, groupIndex).filter((q) => !skip.has(q.sectionId));
}

let ticksSinceSave = 0;

export const useExam = create<ExamState>((set, get) => {
  const update = (fn: (a: Attempt) => Attempt) => {
    const a = get().attempt;
    if (a) set({ attempt: fn(a) });
  };

  const visit = (a: Attempt, qid: string): Attempt => ({
    ...a,
    currentQid: qid,
    responses: { ...a.responses, [qid]: { ...(a.responses[qid] ?? blank()), visited: true } },
  });

  const nextQid = () => {
    const { paper, attempt, groups } = get();
    const list = countedQuestions(paper!, groups, attempt!.groupIndex, attempt!);
    const i = list.findIndex((q) => q.id === attempt!.currentQid);
    return list[(i + 1) % Math.max(list.length, 1)]?.id ?? attempt!.currentQid;
  };

  const saveCurrent = (marked: boolean) => {
    const { attempt, draft } = get();
    if (!attempt) return;
    const cur = attempt.currentQid;
    const a: Attempt = {
      ...attempt,
      responses: { ...attempt.responses, [cur]: { ...(attempt.responses[cur] ?? blank()), visited: true, value: normalize(draft), marked } },
    };
    set({ attempt: a });
    get().goto(nextQid());
  };

  return {
    paper: null,
    attempt: null,
    groups: [],
    draft: null,

    load(paper, attempt) {
      const groups = timerGroups(paper);
      const visible = countedQuestions(paper, groups, attempt.groupIndex, attempt);
      const valid = visible.some((q) => q.id === attempt.currentQid);
      const a = valid ? attempt : visit(attempt, visible[0]?.id ?? paper.questions[0].id);
      set({ paper, groups, attempt: a, draft: a.responses[a.currentQid]?.value ?? null });
    },

    goto(qid) {
      const { paper, attempt, groups } = get();
      if (!paper || !attempt) return;
      if (!countedQuestions(paper, groups, attempt.groupIndex, attempt).some((q) => q.id === qid)) return;
      const a = visit(attempt, qid);
      set({ attempt: a, draft: a.responses[qid]?.value ?? null });
      get().persist();
    },

    setDraft: (v) => set({ draft: v }),
    saveAndNext: () => saveCurrent(false),
    markAndNext: () => saveCurrent(true),

    setLang(lang) {
      update((a) => ({ ...a, lang }));
      get().persist();
    },

    skipSection(sectionId) {
      const { paper, attempt, groups } = get();
      if (!paper || !attempt) return 'empty';
      const skippedSectionIds = [...new Set([...(attempt.skippedSectionIds ?? []), sectionId])];
      const draftAttempt = { ...attempt, skippedSectionIds };
      let groupIndex = attempt.groupIndex;
      let list = countedQuestions(paper, groups, groupIndex, draftAttempt);
      while (!list.length && groupIndex + 1 < groups.length) {
        groupIndex += 1;
        list = countedQuestions(paper, groups, groupIndex, draftAttempt);
      }
      if (!list.length) {
        set({ attempt: draftAttempt });
        get().persist();
        return 'empty';
      }
      const stay = list.some((q) => q.id === attempt.currentQid);
      const target = stay ? attempt.currentQid : list[0].id;
      const a = visit({ ...draftAttempt, groupIndex, timeLeftMs: groupIndex === attempt.groupIndex ? attempt.timeLeftMs : groups[groupIndex].minutes * 60_000 }, target);
      set({ attempt: a, draft: a.responses[target]?.value ?? null });
      get().persist();
      return 'moved';
    },

    unskipSection(sectionId) {
      const { paper, attempt, groups } = get();
      if (!paper || !attempt) return;
      const skippedSectionIds = (attempt.skippedSectionIds ?? []).filter((id) => id !== sectionId);
      const first = paper.questions.find((q) => q.sectionId === sectionId);
      if (!first) return;
      const groupIndex = groups.findIndex((g) => g.sectionIds.includes(sectionId));
      const a = visit(
        {
          ...attempt,
          skippedSectionIds,
          groupIndex: groupIndex < 0 ? attempt.groupIndex : groupIndex,
          timeLeftMs: groupIndex < 0 || groupIndex === attempt.groupIndex ? attempt.timeLeftMs : groups[groupIndex].minutes * 60_000,
        },
        first.id,
      );
      set({ attempt: a, draft: a.responses[first.id]?.value ?? null });
      get().persist();
    },

    clearResponse() {
      set({ draft: null });
      update((a) => ({
        ...a,
        responses: { ...a.responses, [a.currentQid]: { ...(a.responses[a.currentQid] ?? blank()), visited: true, value: null } },
      }));
      get().persist();
    },

    tick(ms) {
      const a = get().attempt;
      if (!a || a.status !== 'in-progress') return false;
      const cur = a.responses[a.currentQid] ?? blank();
      const timeLeftMs = Math.max(0, a.timeLeftMs - ms);
      set({
        attempt: {
          ...a,
          timeLeftMs,
          timeUsedMs: a.timeUsedMs + ms,
          responses: { ...a.responses, [a.currentQid]: { ...cur, timeMs: cur.timeMs + ms } },
        },
      });
      if (++ticksSinceSave >= 5) get().persist();
      return timeLeftMs <= 0;
    },

    nextGroup() {
      const { paper, attempt, groups } = get();
      if (!paper || !attempt || attempt.groupIndex + 1 >= groups.length) return false;
      let groupIndex = attempt.groupIndex + 1;
      let first = countedQuestions(paper, groups, groupIndex, attempt)[0];
      while (!first && groupIndex + 1 < groups.length) {
        groupIndex += 1;
        first = countedQuestions(paper, groups, groupIndex, attempt)[0];
      }
      if (!first) return false;
      const a = visit({ ...attempt, groupIndex, timeLeftMs: groups[groupIndex].minutes * 60_000 }, first.id);
      set({ attempt: a, draft: a.responses[first.id]?.value ?? null });
      get().persist();
      return true;
    },

    async submit() {
      const { paper, attempt } = get();
      const { total } = grade(paper!, attempt!);
      const done: Attempt = {
        ...attempt!,
        status: 'submitted',
        submittedAt: Date.now(),
        summary: { score: total.score, maxScore: total.maxScore, correct: total.correct, wrong: total.wrong, unattempted: total.unattempted },
      };
      set({ attempt: done });
      await db.saveAttempt(done);
      return done;
    },

    persist() {
      ticksSinceSave = 0;
      const a = get().attempt;
      if (a) void db.saveAttempt(a);
    },
  };
});

export function sectionCounts(paper: Paper, attempt: Attempt, sectionIds: string[]) {
  const qs = paper.questions.filter((q) => sectionIds.includes(q.sectionId));
  const c = { total: qs.length, answered: 0, notAnswered: 0, marked: 0, answeredMarked: 0, notVisited: 0 };
  for (const q of qs) {
    const r = attempt.responses[q.id];
    if (!r?.visited) c.notVisited++;
    else if (r.marked) hasValue(r.value) ? c.answeredMarked++ : c.marked++;
    else hasValue(r.value) ? c.answered++ : c.notAnswered++;
  }
  return c;
}

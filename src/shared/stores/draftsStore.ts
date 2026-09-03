import { create } from 'zustand';

// Buffer against an accidental tab close between the last successful PUT and the next one —
// not wizard progress, which lives in the database in real rows (ARCHITECTURE.md §3.4). No
// `persist`: a draft surviving a full reload would compete with the row that already answers
// the same question.
interface DraftsState {
  drafts: Record<string, Record<string, unknown>>;
  get: (caseId: string, step: string) => unknown;
  set: (caseId: string, step: string, value: unknown) => void;
  clear: (caseId: string, step: string) => void;
}

export const useDraftsStore = create<DraftsState>((set, get) => ({
  drafts: {},
  get: (caseId, step) => get().drafts[caseId]?.[step],
  set: (caseId, step, value) =>
    set((state) => ({
      drafts: {
        ...state.drafts,
        [caseId]: { ...state.drafts[caseId], [step]: value },
      },
    })),
  clear: (caseId, step) =>
    set((state) => {
      if (!(caseId in state.drafts)) return state;
      const rest = { ...state.drafts[caseId] };
      delete rest[step];
      return { drafts: { ...state.drafts, [caseId]: rest } };
    }),
}));

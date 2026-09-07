import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Buffer against an accidental tab close between the last successful PUT/POST and the next one —
// not wizard progress, which lives in the database in real rows (ARCHITECTURE.md §3.4). `persist`
// is a deliberate, declared deviation from that norm (SPEC FE12a §3.4 "El borrador persistido"):
// a draft surviving a reload would normally compete with the row that already answers the same
// question, so it carries `baseUpdatedAt` — the row's `updatedAt` at the moment editing started —
// and `resolveDraftConflict` below decides, on mount, whether the draft is still safe to restore.
export interface DraftEntry {
  values: unknown;
  baseUpdatedAt: string | null;
  savedAt: string;
}

interface DraftsState {
  drafts: Record<string, Record<string, DraftEntry>>;
  get: (caseId: string, step: string) => DraftEntry | undefined;
  set: (caseId: string, step: string, values: unknown, baseUpdatedAt: string | null) => void;
  clear: (caseId: string, step: string) => void;
  // Called from the same place `tokenStore.clearRefreshToken()` is (ARCHITECTURE.md §11.1):
  // `esaviDescription` and its siblings are clinical free text about an identified patient, and
  // `localStorage` survives a logout on a shared workstation (SPEC FE12a §3.4).
  clearAll: () => void;
}

export const useDraftsStore = create<DraftsState>()(
  persist(
    (set, get) => ({
      drafts: {},
      get: (caseId, step) => get().drafts[caseId]?.[step],
      set: (caseId, step, values, baseUpdatedAt) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [caseId]: {
              ...state.drafts[caseId],
              [step]: { values, baseUpdatedAt, savedAt: new Date().toISOString() },
            },
          },
        })),
      clear: (caseId, step) =>
        set((state) => {
          if (!(caseId in state.drafts)) return state;
          const rest = { ...state.drafts[caseId] };
          delete rest[step];
          return { drafts: { ...state.drafts, [caseId]: rest } };
        }),
      clearAll: () => {
        set({ drafts: {} });
        // `set({ drafts: {} })` alone would leave `persist` writing back an empty-but-present
        // object under the key; `clearStorage()` removes the key itself, matching
        // `tokenStore.clearRefreshToken()`'s `localStorage.removeItem` (SPEC FE12a §3.4).
        useDraftsStore.persist.clearStorage();
      },
    }),
    { name: 'esavi-drafts' },
  ),
);

export type DraftConflictResolution = 'noDraft' | 'restore' | 'discard';

// The four-row table of SPEC FE12a §3.4 collapses to one comparison: a draft is only safe to
// restore when nothing answered the question while it sat in `localStorage` — including the
// case where neither the draft nor the row existed yet, `baseUpdatedAt === null ===
// rowUpdatedAt`. Any mismatch, `null` against a real timestamp included, means the row moved
// (or was created) after the draft started, and the row wins.
export function resolveDraftConflict(
  draft: DraftEntry | undefined,
  rowUpdatedAt: string | null,
): DraftConflictResolution {
  if (!draft) return 'noDraft';
  return draft.baseUpdatedAt === rowUpdatedAt ? 'restore' : 'discard';
}

import { useCallback, useState } from 'react';

export interface ProgressiveSectionsInput<Id extends string> {
  /** The sections that apply today, in visual order — never the theoretical ones (SPEC FE12f §3.1). */
  sections: Id[];
  /** `existedOnMount`: the whole form is already there, so nothing has to be walked through. */
  revealAll: boolean;
  /** From this section on, everything is revealed together by the last advance. */
  lastWithButton: Id;
}

export interface ProgressiveSections<Id extends string> {
  isVisible: (id: Id) => boolean;
  /** The only section that paints the advance button; `null` when there is none. */
  frontier: Id | null;
  advance: () => void;
}

// SPEC FE12f §3.3 — progressive reveal of a long form, section by section. It knows nothing about
// notifications on purpose: FE13 inherits it for step 5, which writes other entities entirely.
//
// `advance()` does not save. Saving belongs to the caller, which runs its own chain and only calls
// `advance()` once it resolved (SPEC FE12f §3.3, §6). Visibility and the frontier are derived on
// render (§3.4): the only state here is how far this session got.
export function useProgressiveSections<Id extends string>({
  sections,
  revealAll,
  lastWithButton,
}: ProgressiveSectionsInput<Id>): ProgressiveSections<Id> {
  const [advanced, setAdvanced] = useState(0);

  // Advancing past the last section with a button reveals the tail sections all at once, and no
  // button is left. A `lastWithButton` outside `sections` degrades the same way — everything
  // visible, nothing to press — instead of trapping the user on a form that never opens.
  const lastWithButtonIndex = sections.indexOf(lastWithButton);
  const showsEverything = revealAll || advanced > lastWithButtonIndex;

  const advance = useCallback(() => {
    setAdvanced((current) => Math.min(current + 1, sections.length));
  }, [sections.length]);

  const isVisible = useCallback(
    (id: Id) => {
      const index = sections.indexOf(id);
      if (index === -1) return false;
      return showsEverything || index <= advanced;
    },
    [advanced, sections, showsEverything],
  );

  return {
    isVisible,
    frontier: showsEverything ? null : (sections[advanced] ?? null),
    advance,
  };
}

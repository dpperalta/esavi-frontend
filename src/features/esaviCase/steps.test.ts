import { describe, expect, it } from 'vitest';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';
import {
  CASE_WIZARD_STEPS,
  findNextRequiredStep,
  findPreviousRequiredStep,
  isReachableStepSlug,
  isStepRequired,
  isStepUnlocked,
  resolveResumeStep,
  type CaseWizardStepFlags,
} from './steps';

function buildStages(
  overrides: Partial<CaseWorkflowDetail['stages']> = {},
): CaseWorkflowDetail['stages'] {
  const notStarted = {
    exists: false,
    id: null,
    startedAt: null,
    endedAt: null,
    durationMinutes: null,
  };
  return {
    classification: { ...notStarted },
    notification: { ...notStarted },
    investigation: { ...notStarted },
    finalClassification: { ...notStarted },
    ...overrides,
  };
}

describe('CASE_WIZARD_STEPS', () => {
  it('declara los siete pasos con su grupo y etapa', () => {
    expect(CASE_WIZARD_STEPS.map((step) => step.slug)).toEqual([
      'patient',
      'case-opening',
      'classification',
      'notification',
      'investigation',
      'final-classification',
      'closure',
    ]);
  });

  it('closure va detrás de final-classification, sin stage propio', () => {
    const closure = CASE_WIZARD_STEPS.find((step) => step.slug === 'closure');
    expect(closure).toEqual({ slug: 'closure', group: 'closure', stage: null });
  });
});

describe('isStepUnlocked', () => {
  it('patient, case-opening y classification no dependen de ninguna precondición', () => {
    const stages = buildStages();
    expect(isStepUnlocked('patient', stages)).toBe(true);
    expect(isStepUnlocked('case-opening', stages)).toBe(true);
    expect(isStepUnlocked('classification', stages)).toBe(true);
  });

  it('notification se desbloquea cuando classification.exists es true', () => {
    expect(isStepUnlocked('notification', buildStages())).toBe(false);
    expect(
      isStepUnlocked(
        'notification',
        buildStages({
          classification: {
            exists: true,
            id: 'c-1',
            startedAt: null,
            endedAt: null,
            durationMinutes: null,
          },
        }),
      ),
    ).toBe(true);
  });

  it('el paso 6 se desbloquea con notification.exists === true, sin depender de investigation', () => {
    const stages = buildStages({
      notification: {
        exists: true,
        id: 'n-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
      investigation: {
        exists: false,
        id: null,
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });

    expect(isStepUnlocked('final-classification', stages)).toBe(true);
  });

  it('investigation se desbloquea cuando notification.exists es true', () => {
    expect(isStepUnlocked('investigation', buildStages())).toBe(false);
    expect(
      isStepUnlocked(
        'investigation',
        buildStages({
          notification: {
            exists: true,
            id: 'n-1',
            startedAt: null,
            endedAt: null,
            durationMinutes: null,
          },
        }),
      ),
    ).toBe(true);
  });

  it('closure está siempre desbloqueado, sin precondición propia (SPEC FE14b §2)', () => {
    expect(isStepUnlocked('closure', buildStages())).toBe(true);
  });
});

describe('isReachableStepSlug', () => {
  it('acepta los siete pasos, incluidos patient, case-opening y closure (SPEC FE10 §8, SPEC FE14b §2)', () => {
    expect(isReachableStepSlug('patient')).toBe(true);
    expect(isReachableStepSlug('case-opening')).toBe(true);
    expect(isReachableStepSlug('classification')).toBe(true);
    expect(isReachableStepSlug('notification')).toBe(true);
    expect(isReachableStepSlug('investigation')).toBe(true);
    expect(isReachableStepSlug('final-classification')).toBe(true);
    expect(isReachableStepSlug('closure')).toBe(true);
  });

  it('rechaza cualquier valor desconocido', () => {
    expect(isReachableStepSlug('not-a-step')).toBe(false);
  });
});

describe('resolveResumeStep', () => {
  it('resuelve a classification cuando nada empezó todavía', () => {
    expect(resolveResumeStep(buildStages())).toBe('classification');
  });

  it('resuelve al paso desbloqueado más avanzado', () => {
    const stages = buildStages({
      classification: {
        exists: true,
        id: 'c-1',
        startedAt: null,
        endedAt: '2026-09-01',
        durationMinutes: 10,
      },
      notification: {
        exists: true,
        id: 'n-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });

    // investigation y final-classification comparten la misma precondición
    // (notification.exists) — el orden de recorrido deja final-classification como el último.
    expect(resolveResumeStep(stages)).toBe('final-classification');
  });

  it('sin flags (default null) no oculta nada, igual que antes de SPEC FE14a', () => {
    const stages = buildStages({
      classification: {
        exists: true,
        id: 'c-1',
        startedAt: null,
        endedAt: '2026-09-01',
        durationMinutes: 10,
      },
      notification: {
        exists: true,
        id: 'n-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });

    expect(resolveResumeStep(stages)).toBe('final-classification');
  });

  it('la reanudación nunca devuelve un paso no requerido — un caso no grave sin investigación se queda en notification', () => {
    const stages = buildStages({
      classification: {
        exists: true,
        id: 'c-1',
        startedAt: null,
        endedAt: '2026-09-01',
        durationMinutes: 10,
      },
      notification: {
        exists: true,
        id: 'n-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };

    expect(resolveResumeStep(stages, flags)).toBe('notification');
  });

  it('un caso grave sin investigación resuelve a final-classification, saltando investigation', () => {
    const stages = buildStages({
      classification: {
        exists: true,
        id: 'c-1',
        startedAt: null,
        endedAt: '2026-09-01',
        durationMinutes: 10,
      },
      notification: {
        exists: true,
        id: 'n-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });
    const flags: CaseWizardStepFlags = { isSeriousEvent: true, requestInvestigation: false };

    expect(resolveResumeStep(stages, flags)).toBe('final-classification');
  });

  it('sin isClosed, closure nunca gana la reanudación aunque esté siempre desbloqueado y requerido (SPEC FE14b §2, §6)', () => {
    const stages = buildStages({
      classification: {
        exists: true,
        id: 'c-1',
        startedAt: null,
        endedAt: '2026-09-01',
        durationMinutes: 10,
      },
      notification: {
        exists: true,
        id: 'n-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };

    expect(resolveResumeStep(stages, flags, false)).toBe('notification');
  });

  it('con isClosed, closure gana la reanudación', () => {
    const stages = buildStages({
      classification: {
        exists: true,
        id: 'c-1',
        startedAt: null,
        endedAt: '2026-09-01',
        durationMinutes: 10,
      },
      notification: {
        exists: true,
        id: 'n-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };

    expect(resolveResumeStep(stages, flags, true)).toBe('closure');
  });
});

describe('isStepRequired — SPEC FE14a §2, §3.4', () => {
  it('patient, case-opening, classification y notification siempre se requieren', () => {
    const stages = buildStages();
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };
    expect(isStepRequired('patient', stages, flags)).toBe(true);
    expect(isStepRequired('case-opening', stages, flags)).toBe(true);
    expect(isStepRequired('classification', stages, flags)).toBe(true);
    expect(isStepRequired('notification', stages, flags)).toBe(true);
  });

  it('closure siempre se requiere (SPEC FE14b §2)', () => {
    const stages = buildStages();
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };
    expect(isStepRequired('closure', stages, flags)).toBe(true);
  });

  it('caso no grave y sin investigación: no requiere ni el 5 ni el 6', () => {
    const stages = buildStages();
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };
    expect(isStepRequired('investigation', stages, flags)).toBe(false);
    expect(isStepRequired('final-classification', stages, flags)).toBe(false);
  });

  it('grave sin investigación: requiere el 6 y no el 5', () => {
    const stages = buildStages();
    const flags: CaseWizardStepFlags = { isSeriousEvent: true, requestInvestigation: false };
    expect(isStepRequired('investigation', stages, flags)).toBe(false);
    expect(isStepRequired('final-classification', stages, flags)).toBe(true);
  });

  it('no grave con requestInvestigation: requiere los dos', () => {
    const stages = buildStages();
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: true };
    expect(isStepRequired('investigation', stages, flags)).toBe(true);
    expect(isStepRequired('final-classification', stages, flags)).toBe(true);
  });

  it('con stages.finalClassification.exists, el 6 se requiere aunque las dos banderas sean false', () => {
    const stages = buildStages({
      finalClassification: {
        exists: true,
        id: 'fc-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };
    expect(isStepRequired('final-classification', stages, flags)).toBe(true);
  });

  it('con stages.investigation.exists, el 5 se requiere aunque requestInvestigation sea false', () => {
    const stages = buildStages({
      investigation: {
        exists: true,
        id: 'inv-1',
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
      },
    });
    const flags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };
    expect(isStepRequired('investigation', stages, flags)).toBe(true);
  });

  it('con flags === null, todo se requiere', () => {
    const stages = buildStages();
    expect(isStepRequired('investigation', stages, null)).toBe(true);
    expect(isStepRequired('final-classification', stages, null)).toBe(true);
  });
});

function indexOfStep(slug: string): number {
  return CASE_WIZARD_STEPS.findIndex((step) => step.slug === slug);
}

describe('findPreviousRequiredStep — SPEC FE16 §4 paso 1', () => {
  const noFlags: CaseWizardStepFlags = { isSeriousEvent: false, requestInvestigation: false };
  const bothRequired: CaseWizardStepFlags = { isSeriousEvent: true, requestInvestigation: true };

  it('desde investigation devuelve notification', () => {
    const previous = findPreviousRequiredStep(
      indexOfStep('investigation'),
      buildStages(),
      bothRequired,
    );
    expect(previous?.slug).toBe('notification');
  });

  it('desde el primer paso devuelve null', () => {
    expect(findPreviousRequiredStep(indexOfStep('patient'), buildStages(), bothRequired)).toBeNull();
  });

  it('desde closure salta el 5 y el 6 cuando isStepRequired los deja fuera', () => {
    const previous = findPreviousRequiredStep(indexOfStep('closure'), buildStages(), noFlags);
    expect(previous?.slug).toBe('notification');
  });

  it('desde closure salta sólo el 5 cuando el caso es grave sin investigación', () => {
    const flags: CaseWizardStepFlags = { isSeriousEvent: true, requestInvestigation: false };
    const previous = findPreviousRequiredStep(indexOfStep('closure'), buildStages(), flags);
    expect(previous?.slug).toBe('final-classification');
  });

  it('desde final-classification salta un investigation oculto y aterriza en notification', () => {
    const flags: CaseWizardStepFlags = { isSeriousEvent: true, requestInvestigation: false };
    const previous = findPreviousRequiredStep(
      indexOfStep('final-classification'),
      buildStages(),
      flags,
    );
    expect(previous?.slug).toBe('notification');
  });

  it('con flags === null nada se salta: es el paso inmediatamente anterior', () => {
    const previous = findPreviousRequiredStep(indexOfStep('closure'), buildStages(), null);
    expect(previous?.slug).toBe('final-classification');
  });
});

describe('findNextRequiredStep', () => {
  it('desde notification salta investigation cuando no se requiere', () => {
    const flags: CaseWizardStepFlags = { isSeriousEvent: true, requestInvestigation: false };
    const next = findNextRequiredStep(indexOfStep('notification'), buildStages(), flags);
    expect(next?.slug).toBe('final-classification');
  });

  it('desde closure devuelve null', () => {
    expect(findNextRequiredStep(indexOfStep('closure'), buildStages(), null)).toBeNull();
  });
});

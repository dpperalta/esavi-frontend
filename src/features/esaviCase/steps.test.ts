import { describe, expect, it } from 'vitest';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';
import { CASE_WIZARD_STEPS, isStepUnlocked } from './steps';

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
  it('declara los seis pasos con su grupo y etapa', () => {
    expect(CASE_WIZARD_STEPS.map((step) => step.slug)).toEqual([
      'patient',
      'case-opening',
      'classification',
      'notification',
      'investigation',
      'final-classification',
    ]);
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
});

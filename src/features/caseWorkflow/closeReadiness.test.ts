import { describe, expect, it } from 'vitest';
import { type CloseReadinessInput, evaluateCloseReadiness } from './closeReadiness';

function baseInput(overrides: Partial<CloseReadinessInput> = {}): CloseReadinessInput {
  return {
    statusCode: 'OPEN',
    classification: { isSeriousEvent: false },
    notification: {
      requestInvestigation: false,
      notificationType: 'NON_SEVERE',
      takesMedication: 'NO',
      outcomeValue: null,
    },
    investigation: null,
    finalClassification: null,
    autopsy: null,
    community: null,
    hasActiveMedication: false,
    ...overrides,
  };
}

function lineById(lines: ReturnType<typeof evaluateCloseReadiness>['lines'], id: string) {
  return lines.find((line) => line.id === id);
}

describe('evaluateCloseReadiness — SPEC FE14b §3.5', () => {
  it('caso no grave y sin investigación: sin las precondiciones de investigación ni clasificación final', () => {
    const { lines, canClose } = evaluateCloseReadiness(baseInput());

    // severityMismatch se evalúa porque clasificación y notificación están activas, pero es una
    // incoherencia que bloquea (no una precondición), y aquí sale 'met' (false === false).
    expect(lines.map((line) => line.id)).toEqual([
      'notPendingValidation',
      'classification',
      'notification',
      'severityMismatch',
    ]);
    expect(lineById(lines, 'investigation')).toBeUndefined();
    expect(lineById(lines, 'finalClassification')).toBeUndefined();
    expect(canClose).toBe(true);
  });

  it('isSeriousEvent: null con notificationType SEVERE bloquea la coherencia de gravedad', () => {
    const { lines, canClose } = evaluateCloseReadiness(
      baseInput({
        classification: { isSeriousEvent: null },
        notification: {
          requestInvestigation: false,
          notificationType: 'SEVERE',
          takesMedication: 'NO',
          outcomeValue: null,
        },
      }),
    );

    expect(lineById(lines, 'severityMismatch')?.state).toBe('unmet');
    expect(canClose).toBe(false);
  });

  it('isSeriousEvent: true con SEVERE no bloquea', () => {
    const { lines } = evaluateCloseReadiness(
      baseInput({
        classification: { isSeriousEvent: true },
        notification: {
          requestInvestigation: false,
          notificationType: 'SEVERE',
          takesMedication: 'NO',
          outcomeValue: null,
        },
      }),
    );

    expect(lineById(lines, 'severityMismatch')?.state).toBe('met');
  });

  it('autopsia activa con outcome: null bloquea (la variante sin desenlace)', () => {
    const { lines, canClose } = evaluateCloseReadiness(
      baseInput({
        notification: {
          requestInvestigation: true,
          notificationType: 'SEVERE',
          takesMedication: 'NO',
          outcomeValue: null,
        },
        autopsy: { investigationId: 'inv-1' },
      }),
    );

    const line = lineById(lines, 'autopsyWithoutDeath');
    expect(line?.state).toBe('unmet');
    expect(line?.links).toEqual([
      { step: 'notification', labelKey: 'caseWorkflow.close.links.fixOutcome' },
      { step: 'investigation', labelKey: 'caseWorkflow.close.links.reviewAutopsy' },
    ]);
    expect(canClose).toBe(false);
  });

  it('autopsia activa con outcome DEATH no bloquea', () => {
    const { lines } = evaluateCloseReadiness(
      baseInput({
        notification: {
          requestInvestigation: false,
          notificationType: 'NON_SEVERE',
          takesMedication: 'NO',
          outcomeValue: 'DEATH',
        },
        autopsy: { investigationId: 'inv-1' },
      }),
    );

    expect(lineById(lines, 'autopsyWithoutDeath')?.state).toBe('met');
  });

  it('communityCount con un contador null no se pinta', () => {
    const { lines } = evaluateCloseReadiness(
      baseInput({
        investigation: { investigationId: 'inv-1' },
        community: {
          similarEventCount: 5,
          affectedVaccinated: 2,
          affectedUnvaccinated: null,
          affectedUnknown: 1,
        },
      }),
    );

    expect(lineById(lines, 'communityCount')).toBeUndefined();
  });

  it('communityCount con los cuatro contadores presentes y suma distinta avisa sin bloquear', () => {
    const { lines, canClose } = evaluateCloseReadiness(
      baseInput({
        investigation: { investigationId: 'inv-1' },
        community: {
          similarEventCount: 5,
          affectedVaccinated: 2,
          affectedUnvaccinated: 1,
          affectedUnknown: 1,
        },
      }),
    );

    const line = lineById(lines, 'communityCount');
    expect(line?.kind).toBe('warning');
    expect(line?.state).toBe('unmet');
    expect(canClose).toBe(true);
  });

  it('sin notificación activa no se evalúan las incoherencias que dependen de ella', () => {
    const { lines } = evaluateCloseReadiness(
      baseInput({
        notification: null,
        autopsy: { investigationId: 'inv-1' },
        hasActiveMedication: true,
      }),
    );

    expect(lineById(lines, 'autopsyWithoutDeath')).toBeUndefined();
    expect(lineById(lines, 'severityMismatch')).toBeUndefined();
    expect(lineById(lines, 'medicationAnswer')).toBeUndefined();
  });

  it('un warning no cambia canClose', () => {
    const { canClose } = evaluateCloseReadiness(
      baseInput({
        notification: {
          requestInvestigation: false,
          notificationType: 'NON_SEVERE',
          takesMedication: 'NO',
          outcomeValue: null,
        },
        hasActiveMedication: true,
      }),
    );

    expect(canClose).toBe(true);
  });

  it('takesMedication distinto de YES con medicación activa avisa y no bloquea', () => {
    const { lines, canClose } = evaluateCloseReadiness(baseInput({ hasActiveMedication: true }));

    const line = lineById(lines, 'medicationAnswer');
    expect(line?.kind).toBe('warning');
    expect(line?.state).toBe('unmet');
    expect(canClose).toBe(true);
  });

  it('una fila deactivated impide cerrar', () => {
    const { lines, canClose } = evaluateCloseReadiness(baseInput({ classification: 'deactivated' }));

    expect(lineById(lines, 'classification')?.state).toBe('deactivated');
    expect(canClose).toBe(false);
  });

  it('PENDING_VALIDATION deja la línea incumplida e impide cerrar', () => {
    const { lines, canClose } = evaluateCloseReadiness(baseInput({ statusCode: 'PENDING_VALIDATION' }));

    expect(lineById(lines, 'notPendingValidation')?.state).toBe('unmet');
    expect(canClose).toBe(false);
  });

  it('caso grave sin investigación exige la clasificación final, no la investigación', () => {
    const { lines } = evaluateCloseReadiness(
      baseInput({ classification: { isSeriousEvent: true }, finalClassification: null }),
    );

    expect(lineById(lines, 'finalClassification')?.state).toBe('unmet');
    expect(lineById(lines, 'investigation')).toBeUndefined();
  });

  it('caso con investigación solicitada exige investigación y clasificación final', () => {
    const { lines } = evaluateCloseReadiness(
      baseInput({
        notification: {
          requestInvestigation: true,
          notificationType: 'NON_SEVERE',
          takesMedication: 'NO',
          outcomeValue: null,
        },
      }),
    );

    expect(lineById(lines, 'investigation')?.state).toBe('unmet');
    expect(lineById(lines, 'finalClassification')?.state).toBe('unmet');
  });
});

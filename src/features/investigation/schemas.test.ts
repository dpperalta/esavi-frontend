import { describe, expect, it } from 'vitest';
import {
  areAutopsyFlagsMutuallyExclusive,
  investigationAutopsySaveSchema,
  investigationSaveSchema,
  investigationSourceSaveSchema,
  isAutopsyDateNotBeforeDeath,
  isAutopsyDateRequirementMet,
  isOtherSourceDescriptionRequirementMet,
  isScheduledAutopsyDateRequirementMet,
  teamMemberSaveSchema,
} from './schemas';

describe('investigationSaveSchema — A (SPEC FE13a §3.5 A)', () => {
  it('ninguna columna de datos es obligatoria: un objeto vacío pasa', () => {
    expect(investigationSaveSchema.safeParse({}).success).toBe(true);
  });

  it('acepta el estado vacío (statusItemId ausente)', () => {
    const result = investigationSaveSchema.safeParse({ notes: 'x' });
    expect(result.success).toBe(true);
  });

  it('rechaza una latitud fuera de rango', () => {
    expect(investigationSaveSchema.safeParse({ vaccinationLatitude: 200 }).success).toBe(false);
  });
});

describe('isOtherSourceDescriptionRequirementMet — B (SPEC FE13a §3.5 B)', () => {
  it('other:true sin descripción no cumple', () => {
    expect(isOtherSourceDescriptionRequirementMet(true, null)).toBe(false);
    expect(isOtherSourceDescriptionRequirementMet(true, '  ')).toBe(false);
  });

  it('other:true con descripción cumple', () => {
    expect(isOtherSourceDescriptionRequirementMet(true, 'Registro clínico externo')).toBe(true);
  });

  it('other apagado (false o null) sin descripción cumple', () => {
    expect(isOtherSourceDescriptionRequirementMet(false, null)).toBe(true);
    expect(isOtherSourceDescriptionRequirementMet(null, null)).toBe(true);
  });

  it('other apagado con descripción no cumple — una descripción heredada no se envía', () => {
    expect(isOtherSourceDescriptionRequirementMet(false, 'texto viejo')).toBe(false);
    expect(isOtherSourceDescriptionRequirementMet(null, 'texto viejo')).toBe(false);
  });
});

describe('investigationSourceSaveSchema — B', () => {
  it('un interruptor sin tocar (undefined) pasa; el cuerpo no lo lleva como false', () => {
    const result = investigationSourceSaveSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('other:true sin otherDescription no valida', () => {
    const result = investigationSourceSaveSchema.safeParse({ other: true });
    expect(result.success).toBe(false);
  });

  it('other:false con otherDescription con contenido no valida', () => {
    const result = investigationSourceSaveSchema.safeParse({
      other: false,
      otherDescription: 'texto que no debería viajar',
    });
    expect(result.success).toBe(false);
  });

  it('other:true con otherDescription válida', () => {
    const result = investigationSourceSaveSchema.safeParse({
      other: true,
      otherDescription: 'Registro clínico externo',
    });
    expect(result.success).toBe(true);
  });
});

describe('Las cuatro reglas de coherencia de la autopsia — C (SPEC FE13a §3.5 C)', () => {
  it('regla 1 — los dos no pueden ser true a la vez', () => {
    expect(areAutopsyFlagsMutuallyExclusive(true, true)).toBe(false);
    expect(areAutopsyFlagsMutuallyExclusive(true, false)).toBe(true);
    expect(areAutopsyFlagsMutuallyExclusive(null, null)).toBe(true);
  });

  it('regla 2 — sin isAutopsyPerformed:true, autopsyDate prohibida', () => {
    expect(isAutopsyDateRequirementMet(false, '2026-09-05')).toBe(false);
    expect(isAutopsyDateRequirementMet(null, '2026-09-05')).toBe(false);
    expect(isAutopsyDateRequirementMet(true, '2026-09-05')).toBe(true);
    expect(isAutopsyDateRequirementMet(true, null)).toBe(true);
  });

  it('regla 3 — espejo de la regla 2 sobre isAutopsyScheduled/scheduledAutopsyDate', () => {
    expect(isScheduledAutopsyDateRequirementMet(false, '2026-09-10')).toBe(false);
    expect(isScheduledAutopsyDateRequirementMet(true, '2026-09-10')).toBe(true);
    expect(isScheduledAutopsyDateRequirementMet(true, null)).toBe(true);
  });

  it('regla 4 — autopsyDate no anterior a deathDate', () => {
    expect(isAutopsyDateNotBeforeDeath('2026-09-01', '2026-09-05')).toBe(false);
    expect(isAutopsyDateNotBeforeDeath('2026-09-05', '2026-09-05')).toBe(true);
    expect(isAutopsyDateNotBeforeDeath('2026-09-06', '2026-09-05')).toBe(true);
    expect(isAutopsyDateNotBeforeDeath(null, '2026-09-05')).toBe(true);
  });
});

describe('investigationAutopsySaveSchema — C', () => {
  const base = { isDeath: true as const, deathDate: '2026-09-05' };

  it('isDeath sólo acepta true — nunca se ofrece como control editable', () => {
    expect(investigationAutopsySaveSchema.safeParse({ ...base, isDeath: false }).success).toBe(
      false,
    );
  });

  it('deathDate no acepta null en el update — es corregible pero no anulable', () => {
    expect(
      investigationAutopsySaveSchema.safeParse({ isDeath: true, deathDate: null }).success,
    ).toBe(false);
    expect(
      investigationAutopsySaveSchema.safeParse({ isDeath: true, deathDate: undefined }).success,
    ).toBe(false);
  });

  it('scheduledAutopsyDate acepta una fecha futura sin error', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyScheduled: true,
      scheduledAutopsyDate: '2099-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('autopsyDate anterior a deathDate no valida', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyPerformed: true,
      autopsyDate: '2026-09-01',
    });
    expect(result.success).toBe(false);
  });

  it('las cuatro reglas se rechazan a la vez, no de una en una', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyPerformed: false,
      isAutopsyScheduled: true,
      autopsyDate: '2026-09-01',
      scheduledAutopsyDate: '2099-01-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      // Rule 2 (autopsyDate present without isAutopsyPerformed:true) and rule 4 (autopsyDate
      // before deathDate) fire at once over the same case — the user sees both, not one.
      expect(paths).toContain('autopsyDate');
      expect(paths).toContain('deathDate');
    }
  });

  it('un bloque coherente (performed, sin scheduled, fecha posterior a la muerte) valida', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyPerformed: true,
      autopsyDate: '2026-09-06',
    });
    expect(result.success).toBe(true);
  });
});

describe('teamMemberSaveSchema — D (SPEC FE13a §3.5 D)', () => {
  it('fullName es obligatorio', () => {
    expect(teamMemberSaveSchema.safeParse({}).success).toBe(false);
    expect(teamMemberSaveSchema.safeParse({ fullName: '' }).success).toBe(false);
  });

  it('institutionName no se normaliza en el cliente — el schema no lo toca', () => {
    const result = teamMemberSaveSchema.safeParse({
      fullName: 'Ana Pérez',
      institutionName: 'MINSAL',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.institutionName).toBe('MINSAL');
    }
  });

  it('email inválido no valida', () => {
    expect(
      teamMemberSaveSchema.safeParse({ fullName: 'Ana Pérez', email: 'no-es-un-correo' }).success,
    ).toBe(false);
  });

  it('phone es texto libre, sin máscara', () => {
    const result = teamMemberSaveSchema.safeParse({
      fullName: 'Ana Pérez',
      phone: 'ext. 234 / +593 99 000 0000',
    });
    expect(result.success).toBe(true);
  });
});

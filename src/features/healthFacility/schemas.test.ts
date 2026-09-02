import { describe, expect, it } from 'vitest';
import { createHealthFacilitySchema, updateHealthFacilitySchema } from './schemas';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    geoLocationId: '11111111-1111-4111-8111-111111111111',
    name: 'Centro de salud Quito Sur',
    ...overrides,
  };
}

describe('createHealthFacilitySchema', () => {
  it('acepta el mínimo válido — sólo geoLocationId y name', () => {
    const result = createHealthFacilitySchema.safeParse(validInput());

    expect(result.success).toBe(true);
  });

  it('rechaza name vacío', () => {
    const result = createHealthFacilitySchema.safeParse(validInput({ name: '' }));

    expect(result.success).toBe(false);
  });

  it('rechaza name de 251 caracteres (DDL STRING(250), hallazgo H del riesgo §7)', () => {
    const result = createHealthFacilitySchema.safeParse(validInput({ name: 'a'.repeat(251) }));

    expect(result.success).toBe(false);
  });

  it('acepta name de 250 caracteres', () => {
    const result = createHealthFacilitySchema.safeParse(validInput({ name: 'a'.repeat(250) }));

    expect(result.success).toBe(true);
  });

  it('rechaza latitude: 91', () => {
    const result = createHealthFacilitySchema.safeParse(validInput({ latitude: 91 }));

    expect(result.success).toBe(false);
  });

  it('rechaza longitude: -181', () => {
    const result = createHealthFacilitySchema.safeParse(validInput({ longitude: -181 }));

    expect(result.success).toBe(false);
  });

  it('acepta latitude y longitude en el límite (90/-180)', () => {
    const result = createHealthFacilitySchema.safeParse(
      validInput({ latitude: 90, longitude: -180 }),
    );

    expect(result.success).toBe(true);
  });

  it('con facilityTypeItemId: "" (combo sin elegir), no viaja en el objeto parseado', () => {
    const result = createHealthFacilitySchema.safeParse(validInput({ facilityTypeItemId: '' }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.facilityTypeItemId).toBeUndefined();
      expect(JSON.stringify(result.data)).not.toContain('facilityTypeItemId');
    }
  });

  it('con parentHealthFacilityId: "" (raíz), no viaja en el objeto parseado', () => {
    const result = createHealthFacilitySchema.safeParse(
      validInput({ parentHealthFacilityId: '' }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentHealthFacilityId).toBeUndefined();
    }
  });

  it('rechaza email inválido', () => {
    const result = createHealthFacilitySchema.safeParse(validInput({ email: 'not-an-email' }));

    expect(result.success).toBe(false);
  });

  it('isActive no es campo del schema (SPEC FE06 §2)', () => {
    expect(createHealthFacilitySchema.shape).not.toHaveProperty('isActive');
  });
});

describe('updateHealthFacilitySchema', () => {
  it('todos los campos son opcionales', () => {
    const result = updateHealthFacilitySchema.safeParse({});

    expect(result.success).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createGeoLocationSchema, geoImportFileSchema, updateGeoLocationSchema } from './schemas';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    geoLevelTypeId: '11111111-1111-4111-8111-111111111111',
    name: 'Quito',
    externalCode: 'UIO',
    ...overrides,
  };
}

describe('createGeoLocationSchema', () => {
  it('rechaza externalCode vacío', () => {
    const result = createGeoLocationSchema.safeParse(validInput({ externalCode: '' }));

    expect(result.success).toBe(false);
  });

  it('rechaza name vacío', () => {
    const result = createGeoLocationSchema.safeParse(validInput({ name: '' }));

    expect(result.success).toBe(false);
  });

  it('rechaza latitude: 91', () => {
    const result = createGeoLocationSchema.safeParse(validInput({ latitude: 91 }));

    expect(result.success).toBe(false);
  });

  it('rechaza longitude: -181', () => {
    const result = createGeoLocationSchema.safeParse(validInput({ longitude: -181 }));

    expect(result.success).toBe(false);
  });

  it('acepta el mínimo válido, sin parentGeoLocationId (raíz)', () => {
    const result = createGeoLocationSchema.safeParse(validInput());

    expect(result.success).toBe(true);
  });

  it('acepta latitude y longitude en el límite (90/-180)', () => {
    const result = createGeoLocationSchema.safeParse(
      validInput({ latitude: 90, longitude: -180 }),
    );

    expect(result.success).toBe(true);
  });

  it('con parentGeoLocationId: null (raíz), no viaja en el objeto parseado', () => {
    const result = createGeoLocationSchema.safeParse(validInput({ parentGeoLocationId: null }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentGeoLocationId).toBeUndefined();
      expect(JSON.stringify(result.data)).not.toContain('parentGeoLocationId');
    }
  });

  it('level y geoPolygon no son campos del schema', () => {
    expect(createGeoLocationSchema.shape).not.toHaveProperty('level');
    expect(createGeoLocationSchema.shape).not.toHaveProperty('geoPolygon');
  });
});

describe('updateGeoLocationSchema', () => {
  it('todos los campos son opcionales', () => {
    const result = updateGeoLocationSchema.safeParse({});

    expect(result.success).toBe(true);
  });
});

describe('geoImportFileSchema (SPEC FE07 §3.5)', () => {
  it('rechaza un .pdf con la clave de extensión', () => {
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });

    const result = geoImportFileSchema.safeParse(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('invalidExtension');
    }
  });

  it('rechaza un .xlsx de 21 MB con la clave de tamaño', () => {
    const file = new File([new Uint8Array(21 * 1024 * 1024)], 'geo.xlsx');

    const result = geoImportFileSchema.safeParse(file);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('tooLarge');
    }
  });

  it('acepta un .xlsx de 19 MB', () => {
    const file = new File([new Uint8Array(19 * 1024 * 1024)], 'geo.xlsx');

    const result = geoImportFileSchema.safeParse(file);

    expect(result.success).toBe(true);
  });
});

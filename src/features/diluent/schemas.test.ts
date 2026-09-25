import { describe, expect, it } from 'vitest';
import {
  createDiluentSchema,
  diluentErrorFieldMap,
  toDiluentPayload,
  updateDiluentSchema,
} from './schemas';

const valid = { code: 'AGUA_DESTILADA', name: 'Agua destilada', description: '', composition: '' };

describe('createDiluentSchema', () => {
  it('acepta un diluyente con los dos campos opcionales vacíos', () => {
    expect(createDiluentSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza code vacío', () => {
    expect(createDiluentSchema.safeParse({ ...valid, code: '' }).success).toBe(false);
  });

  it('rechaza code con solo espacios', () => {
    expect(createDiluentSchema.safeParse({ ...valid, code: '   ' }).success).toBe(false);
  });

  it('rechaza code de 101 caracteres y acepta 100', () => {
    expect(createDiluentSchema.safeParse({ ...valid, code: 'A'.repeat(101) }).success).toBe(false);
    expect(createDiluentSchema.safeParse({ ...valid, code: 'A'.repeat(100) }).success).toBe(true);
  });

  it('rechaza name vacío', () => {
    expect(createDiluentSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rechaza name de 251 caracteres y acepta 250', () => {
    expect(createDiluentSchema.safeParse({ ...valid, name: 'a'.repeat(251) }).success).toBe(false);
    expect(createDiluentSchema.safeParse({ ...valid, name: 'a'.repeat(250) }).success).toBe(true);
  });
});

describe('updateDiluentSchema', () => {
  it('todos los campos son opcionales', () => {
    expect(updateDiluentSchema.safeParse({}).success).toBe(true);
  });

  it('sigue rechazando code vacío si viaja', () => {
    expect(updateDiluentSchema.safeParse({ code: '' }).success).toBe(false);
  });
});

describe('toDiluentPayload', () => {
  it("convierte description: '' y composition: '' en null", () => {
    const parsed = createDiluentSchema.parse(valid);

    expect(toDiluentPayload(parsed)).toEqual({
      code: 'AGUA_DESTILADA',
      name: 'Agua destilada',
      description: null,
      composition: null,
    });
  });

  it('un texto con solo espacios también viaja como null', () => {
    const parsed = createDiluentSchema.parse({ ...valid, description: '   ' });

    expect(toDiluentPayload(parsed).description).toBeNull();
  });

  it('conserva los textos no vacíos', () => {
    const parsed = createDiluentSchema.parse({
      ...valid,
      description: 'Para reconstituir',
      composition: 'H2O',
    });

    expect(toDiluentPayload(parsed)).toMatchObject({
      description: 'Para reconstituir',
      composition: 'H2O',
    });
  });
});

describe('diluentErrorFieldMap', () => {
  it('envía los dos CODE_EXISTS al campo code', () => {
    expect(diluentErrorFieldMap.DILUENT_001_CODE_EXISTS).toBe('code');
    expect(diluentErrorFieldMap.DILUENT_004_CODE_EXISTS).toBe('code');
  });

  it('no mapea los errores que van al toast', () => {
    expect(diluentErrorFieldMap.DILUENT_004_NOT_FOUND).toBeUndefined();
  });
});

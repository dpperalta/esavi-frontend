import { describe, expect, it } from 'vitest';
import { createGeoLevelTypeSchema, updateGeoLevelTypeSchema } from './schemas';

describe('createGeoLevelTypeSchema', () => {
  it('rechaza name vacío', () => {
    const result = createGeoLevelTypeSchema.safeParse({ code: 'CTRY', name: '', sortOrder: 1 });

    expect(result.success).toBe(false);
  });

  it('rechaza code vacío', () => {
    const result = createGeoLevelTypeSchema.safeParse({ code: '', name: 'País', sortOrder: 1 });

    expect(result.success).toBe(false);
  });

  it('rechaza sortOrder: 0 (mínimo 1, no 0 como catalogType)', () => {
    const result = createGeoLevelTypeSchema.safeParse({
      code: 'CTRY',
      name: 'País',
      sortOrder: 0,
    });

    expect(result.success).toBe(false);
  });

  it('acepta code, name y sortOrder válidos', () => {
    const result = createGeoLevelTypeSchema.safeParse({
      code: 'CTRY',
      name: 'País',
      sortOrder: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe('updateGeoLevelTypeSchema', () => {
  it('todos los campos son opcionales', () => {
    const result = updateGeoLevelTypeSchema.safeParse({});

    expect(result.success).toBe(true);
  });
});

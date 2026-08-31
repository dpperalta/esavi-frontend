import { describe, expect, it } from 'vitest';
import { createCatalogTypeSchema, updateCatalogTypeSchema } from './schemas';

describe('createCatalogTypeSchema', () => {
  it('rechaza name vacío', () => {
    const result = createCatalogTypeSchema.safeParse({ name: '' });

    expect(result.success).toBe(false);
  });

  it('rechaza sortOrder: -1', () => {
    const result = createCatalogTypeSchema.safeParse({ name: 'Tipo A', sortOrder: -1 });

    expect(result.success).toBe(false);
  });

  it('con code ausente (cadena vacía), pasa y code no viaja en el cuerpo', () => {
    const result = createCatalogTypeSchema.safeParse({ code: '', name: 'Tipo A' });

    expect(result.success).toBe(true);
    if (result.success) {
      // `code` stays `undefined` on the parsed object, but JSON.stringify — what actually
      // travels in the axios request body — drops undefined-valued keys entirely.
      expect(result.data.code).toBeUndefined();
      expect(JSON.stringify(result.data)).not.toContain('code');
    }
  });

  it('acepta un sortOrder válido y un description dentro del límite', () => {
    const result = createCatalogTypeSchema.safeParse({
      name: 'Tipo A',
      description: 'Una descripción corta',
      sortOrder: 3,
    });

    expect(result.success).toBe(true);
  });
});

describe('updateCatalogTypeSchema', () => {
  it('todos los campos son opcionales', () => {
    const result = updateCatalogTypeSchema.safeParse({});

    expect(result.success).toBe(true);
  });
});

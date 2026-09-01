import { describe, expect, it } from 'vitest';
import { buildUpdateCatalogItemSchema, createCatalogItemSchema } from './schemas';

describe('createCatalogItemSchema', () => {
  it('rechaza name vacío', () => {
    const result = createCatalogItemSchema.safeParse({ name: '', value: 'Un valor' });

    expect(result.success).toBe(false);
  });

  it('rechaza name con 251 caracteres', () => {
    const result = createCatalogItemSchema.safeParse({
      name: 'a'.repeat(251),
      value: 'Un valor',
    });

    expect(result.success).toBe(false);
  });

  it('acepta name con 250 caracteres', () => {
    const result = createCatalogItemSchema.safeParse({
      name: 'a'.repeat(250),
      value: 'Un valor',
    });

    expect(result.success).toBe(true);
  });

  it('rechaza value vacío en creación', () => {
    const result = createCatalogItemSchema.safeParse({ name: 'Ítem A', value: '' });

    expect(result.success).toBe(false);
  });

  it('rechaza sortOrder: -1', () => {
    const result = createCatalogItemSchema.safeParse({
      name: 'Ítem A',
      value: 'Un valor',
      sortOrder: -1,
    });

    expect(result.success).toBe(false);
  });

  it('rechaza sortOrder por encima de 32767 (smallint)', () => {
    const result = createCatalogItemSchema.safeParse({
      name: 'Ítem A',
      value: 'Un valor',
      sortOrder: 32768,
    });

    expect(result.success).toBe(false);
  });

  it('con code ausente (cadena vacía), pasa y code no viaja en el cuerpo', () => {
    const result = createCatalogItemSchema.safeParse({
      code: '',
      name: 'Ítem A',
      value: 'Un valor',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBeUndefined();
      expect(JSON.stringify(result.data)).not.toContain('code');
    }
  });

  it('acepta description sin tope explícito', () => {
    const result = createCatalogItemSchema.safeParse({
      name: 'Ítem A',
      value: 'Un valor',
      description: 'a'.repeat(5000),
    });

    expect(result.success).toBe(true);
  });
});

describe('buildUpdateCatalogItemSchema — fila no congelada', () => {
  const schema = buildUpdateCatalogItemSchema(false);

  it('todos los campos son opcionales', () => {
    const result = schema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('sí acepta y conserva value', () => {
    const result = schema.safeParse({ value: 'Nuevo valor' });

    expect(result.success).toBe(true);
    if (result.success) {
      // `buildUpdateCatalogItemSchema`'s return type is a union of both branches (its parameter
      // is `boolean`, not a literal) — this branch is known safe at runtime by the `false` passed
      // above, so `'value' in data` is how the test proves it without a schema-level cast.
      expect('value' in result.data && result.data.value).toBe('Nuevo valor');
    }
  });
});

describe('buildUpdateCatalogItemSchema — fila congelada (isValueLocked)', () => {
  const schema = buildUpdateCatalogItemSchema(true);

  it('no declara value: una fila congelada no lo acepta en el cuerpo', () => {
    const result = schema.safeParse({ value: 'Intento de cambio', name: 'Ítem A' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect('value' in result.data).toBe(false);
      expect(JSON.stringify(result.data)).not.toContain('value');
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildUpdateCatalogItemSchema,
  createCatalogItemSchema,
  importCatalogItemsSchema,
  MAX_CATALOG_ITEM_IMPORT_FILE_SIZE_BYTES,
} from './schemas';

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

describe('importCatalogItemsSchema (SPEC FE30 §3.5)', () => {
  function fileOf(name: string, bytes: number): File {
    const file = new File(['PK'], name);
    Object.defineProperty(file, 'size', { value: bytes });
    return file;
  }

  function firstIssue(value: unknown) {
    return importCatalogItemsSchema.safeParse(value).error?.issues[0]?.message;
  }

  it('rechaza la ausencia de fichero con el código del 400', () => {
    expect(firstIssue(null)).toBe('CATITEM_006_FILE_REQUIRED');
  });

  it('rechaza un .xls con el código de fichero inválido', () => {
    expect(firstIssue(fileOf('catalogo.xls', 1024))).toBe('CATITEM_006_FILE_INVALID');
  });

  it('acepta la extensión .XLSX en mayúsculas', () => {
    expect(importCatalogItemsSchema.safeParse(fileOf('CATALOGO.XLSX', 1024)).success).toBe(true);
  });

  it('acepta exactamente 20 MB', () => {
    expect(
      importCatalogItemsSchema.safeParse(
        fileOf('catalogo.xlsx', MAX_CATALOG_ITEM_IMPORT_FILE_SIZE_BYTES),
      ).success,
    ).toBe(true);
  });

  it('rechaza 20 MB y un byte con el código del 413', () => {
    expect(firstIssue(fileOf('catalogo.xlsx', MAX_CATALOG_ITEM_IMPORT_FILE_SIZE_BYTES + 1))).toBe(
      'CATITEM_006_FILE_TOO_LARGE',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { createSystemConfigSchema, createUpdateSystemConfigSchema } from './schemas';

function base(overrides: Record<string, unknown> = {}) {
  return {
    code: 'ESAVI_MAX_UPLOAD_SIZE',
    name: 'Tamaño máximo de carga',
    valueType: 'number',
    value: 42,
    ...overrides,
  };
}

describe('createSystemConfigSchema — value contra valueType', () => {
  it('valueType number con 42 pasa', () => {
    const result = createSystemConfigSchema.safeParse(base({ valueType: 'number', value: 42 }));

    expect(result.success).toBe(true);
  });

  it('valueType number con "42" (string) falla', () => {
    const result = createSystemConfigSchema.safeParse(base({ valueType: 'number', value: '42' }));

    expect(result.success).toBe(false);
  });

  it('valueType array con "{}" (objeto, no array) falla', () => {
    const result = createSystemConfigSchema.safeParse(base({ valueType: 'array', value: '{}' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('invalidArray');
    }
  });

  it('valueType array con "[1,2,3]" pasa', () => {
    const result = createSystemConfigSchema.safeParse(
      base({ valueType: 'array', value: '[1,2,3]' }),
    );

    expect(result.success).toBe(true);
  });

  it('valueType json con "{ mal" (JSON inválido) falla con la clave invalidJson', () => {
    const result = createSystemConfigSchema.safeParse(base({ valueType: 'json', value: '{ mal' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('invalidJson');
    }
  });

  it('valueType json con \'{"a":1}\' pasa', () => {
    const result = createSystemConfigSchema.safeParse(
      base({ valueType: 'json', value: '{"a":1}' }),
    );

    expect(result.success).toBe(true);
  });

  it('valueType string vacío falla', () => {
    const result = createSystemConfigSchema.safeParse(base({ valueType: 'string', value: '  ' }));

    expect(result.success).toBe(false);
  });

  it('valueType boolean con false pasa (no se confunde con ausente)', () => {
    const result = createSystemConfigSchema.safeParse(
      base({ valueType: 'boolean', value: false }),
    );

    expect(result.success).toBe(true);
  });

  it('code y name obligatorios', () => {
    const result = createSystemConfigSchema.safeParse(base({ code: '', name: '' }));

    expect(result.success).toBe(false);
  });
});

describe('createUpdateSystemConfigSchema — changeReason condicional', () => {
  it('con value distinto del original y sin changeReason, falla', () => {
    const schema = createUpdateSystemConfigSchema({ originalValue: 10 });
    const result = schema.safeParse(base({ value: 42 }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === 'changeReasonRequired')).toBe(
        true,
      );
    }
  });

  it('con value distinto del original y changeReason presente, pasa', () => {
    const schema = createUpdateSystemConfigSchema({ originalValue: 10 });
    const result = schema.safeParse(
      base({ value: 42, changeReason: 'Ajuste de límite acordado con soporte' }),
    );

    expect(result.success).toBe(true);
  });

  it('con value igual al original y sin changeReason, pasa', () => {
    const schema = createUpdateSystemConfigSchema({ originalValue: 42 });
    const result = schema.safeParse(base({ value: 42 }));

    expect(result.success).toBe(true);
  });
});

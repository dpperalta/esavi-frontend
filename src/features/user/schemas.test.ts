import { describe, expect, it } from 'vitest';
import {
  createUserSchema,
  updateUserSchema,
  userErrorFieldMap,
  userUpdateErrorFieldMap,
} from './schemas';

const ROLE_ADMIN = '11111111-1111-4111-8111-111111111111';

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@minsa.gob',
    password: '12345678',
    roleIds: [ROLE_ADMIN],
    ...overrides,
  };
}

describe('createUserSchema — SPEC FE20 §3.5', () => {
  it('acepta el mínimo obligatorio', () => {
    expect(createUserSchema.safeParse(validCreate()).success).toBe(true);
  });

  it('rechaza una contraseña de siete caracteres y acepta la de ocho', () => {
    expect(createUserSchema.safeParse(validCreate({ password: '1234567' })).success).toBe(false);
    expect(createUserSchema.safeParse(validCreate({ password: '12345678' })).success).toBe(true);
  });

  it('exige al menos un rol', () => {
    expect(createUserSchema.safeParse(validCreate({ roleIds: [] })).success).toBe(false);
  });

  it('exige que los roles sean UUID', () => {
    expect(createUserSchema.safeParse(validCreate({ roleIds: ['ADMIN'] })).success).toBe(false);
  });

  it('rechaza un correo con formato inválido y uno de más de 250 caracteres', () => {
    expect(createUserSchema.safeParse(validCreate({ email: 'ana' })).success).toBe(false);
    const longEmail = `${'a'.repeat(245)}@b.com`;
    expect(createUserSchema.safeParse(validCreate({ email: longEmail })).success).toBe(false);
  });

  it('rechaza nombres de más de 150 caracteres, el límite del validador del backend', () => {
    expect(createUserSchema.safeParse(validCreate({ firstName: 'a'.repeat(151) })).success).toBe(
      false,
    );
    expect(createUserSchema.safeParse(validCreate({ lastName: 'a'.repeat(151) })).success).toBe(
      false,
    );
  });

  it('username y phone son opcionales, y vacíos no llegan al cuerpo de la petición', () => {
    const result = createUserSchema.safeParse(validCreate({ username: '', phone: '' }));
    expect(result.success).toBe(true);
    expect(result.data?.username).toBeUndefined();
    expect(result.data?.phone).toBeUndefined();
    // JSON.stringify descarta las claves `undefined`: el cuerpo no lleva ni username ni phone.
    expect(JSON.parse(JSON.stringify(result.data))).not.toHaveProperty('username');
  });

  it('no tiene displayName, isActive ni requiresPasswordChange: el backend responde 400 si viajan', () => {
    const shape = Object.keys(createUserSchema.shape);
    expect(shape).not.toContain('displayName');
    expect(shape).not.toContain('isActive');
    expect(shape).not.toContain('requiresPasswordChange');
  });
});

describe('updateUserSchema — los cinco campos de ESAVI-USER-004', () => {
  it('son exactamente cinco, sin password ni roleIds', () => {
    expect(Object.keys(updateUserSchema.shape)).toEqual([
      'firstName',
      'lastName',
      'email',
      'username',
      'phone',
    ]);
  });

  it('acepta los cinco campos con valor', () => {
    const result = updateUserSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@minsa.gob',
      username: 'aperez',
      phone: '0999999999',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un correo vacío: viaja en cada PUT y `optional().notEmpty()` lo devuelve 400', () => {
    const result = updateUserSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Pérez',
      email: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('mapas de errores a campo — SPEC FE20 §3.5', () => {
  it('los duplicados de correo y usuario van a su campo', () => {
    expect(userErrorFieldMap.USER_001_EMAIL_EXISTS).toBe('email');
    expect(userErrorFieldMap.USER_004_EMAIL_EXISTS).toBe('email');
    expect(userErrorFieldMap.USER_001_USERNAME_EXISTS).toBe('username');
    expect(userErrorFieldMap.USER_004_USERNAME_EXISTS).toBe('username');
  });

  it('los dos códigos de rol del alta van al selector de roles', () => {
    expect(userErrorFieldMap.USER_001_ROLE_NOT_FOUND).toBe('roleIds');
    expect(userErrorFieldMap.USER_001_ROLE_LEVEL_EXCEEDED).toBe('roleIds');
  });

  it('los dos 409 de 005A no están en ningún mapa: van a toast', () => {
    expect(userErrorFieldMap.USER_005A_SELF_DEACTIVATION).toBeUndefined();
    expect(userErrorFieldMap.USER_005A_LAST_SUPERADMIN).toBeUndefined();
  });

  it('el mapa de la edición sólo tiene los dos códigos de 004', () => {
    expect(Object.keys(userUpdateErrorFieldMap)).toEqual([
      'USER_004_EMAIL_EXISTS',
      'USER_004_USERNAME_EXISTS',
    ]);
  });
});

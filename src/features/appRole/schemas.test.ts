import { describe, expect, it } from 'vitest';
import { createAppRoleSchema, updateAppRoleSchema } from './schemas';

const ADMIN_LEVEL = 50;
const SUPERADMIN_LEVEL = 100;

const validInput = {
  code: 'SUPERVISOR',
  name: 'SUPERVISOR',
  description: 'Supervisa una zona',
  level: 50,
};

describe('createAppRoleSchema', () => {
  it('rechaza un nivel negativo', () => {
    const result = createAppRoleSchema(ADMIN_LEVEL).safeParse({ ...validInput, level: -1 });
    expect(result.success).toBe(false);
  });

  it('acepta el nivel propio y rechaza el superior', () => {
    const adminSchema = createAppRoleSchema(ADMIN_LEVEL);
    expect(adminSchema.safeParse({ ...validInput, level: 50 }).success).toBe(true);
    expect(adminSchema.safeParse({ ...validInput, level: 100 }).success).toBe(false);
    expect(
      createAppRoleSchema(SUPERADMIN_LEVEL).safeParse({ ...validInput, level: 100 }).success,
    ).toBe(true);
  });

  it('exige el nivel en vez de tomar el campo vacío por cero', () => {
    const result = createAppRoleSchema(ADMIN_LEVEL).safeParse({ ...validInput, level: '' });
    expect(result.success).toBe(false);
  });

  it('coacciona el nivel tecleado, que llega como texto', () => {
    const result = createAppRoleSchema(ADMIN_LEVEL).safeParse({ ...validInput, level: '40' });
    expect(result.success && result.data.level).toBe(40);
  });

  it('no declara los tres campos que el backend responde con 400', () => {
    const result = createAppRoleSchema(ADMIN_LEVEL).safeParse({
      ...validInput,
      isSystemRole: true,
      isActive: false,
      roleId: 'role-1',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty('isSystemRole');
    expect(result.success && result.data).not.toHaveProperty('isActive');
    expect(result.success && result.data).not.toHaveProperty('roleId');
  });

  it('exige los cuatro campos', () => {
    expect(createAppRoleSchema(ADMIN_LEVEL).safeParse({}).success).toBe(false);
  });
});

describe('updateAppRoleSchema', () => {
  it('acepta un objeto vacío: los cuatro campos son opcionales', () => {
    expect(updateAppRoleSchema(ADMIN_LEVEL).safeParse({}).success).toBe(true);
  });

  it('mantiene el tope de nivel del solicitante', () => {
    expect(updateAppRoleSchema(ADMIN_LEVEL).safeParse({ level: 100 }).success).toBe(false);
  });
});

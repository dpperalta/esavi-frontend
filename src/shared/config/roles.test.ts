import { describe, expect, it } from 'vitest';
import { getEffectiveLevel } from './roles';

describe('getEffectiveLevel', () => {
  it('usa role.level cuando está presente', () => {
    expect(getEffectiveLevel([{ name: 'ADMIN', level: 50 }])).toBe(50);
  });

  it('cae a ROLE_LEVELS[NAME] cuando level es nulo', () => {
    expect(getEffectiveLevel([{ name: 'ADMIN', level: null }])).toBe(50);
    expect(getEffectiveLevel([{ name: 'user' }])).toBe(25);
  });

  it('cae a 0 cuando ni level ni el nombre existen en ROLE_LEVELS', () => {
    expect(getEffectiveLevel([{ name: 'INVENTED_ROLE' }])).toBe(0);
  });

  it('un usuario sin roles obtiene 0', () => {
    expect(getEffectiveLevel([])).toBe(0);
  });

  it('un usuario con dos roles obtiene el mayor', () => {
    expect(
      getEffectiveLevel([
        { name: 'ANALYTICS', level: 10 },
        { name: 'ADMIN', level: 50 },
      ]),
    ).toBe(50);
  });

  it('mezcla level real y respaldo por nombre entre varios roles', () => {
    expect(
      getEffectiveLevel([
        { name: 'user', level: null },
        { name: 'SUPERADMIN', level: 999 },
      ]),
    ).toBe(999);
  });
});

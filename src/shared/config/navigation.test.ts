import { describe, expect, it } from 'vitest';
import { NAVIGATION, filterNavigationByLevel } from './navigation';
import { ROLE_LEVELS } from './roles';

function countChildren(items: ReturnType<typeof filterNavigationByLevel>): number {
  return items.reduce((total, item) => total + (item.children?.length ?? 0), 0);
}

describe('filterNavigationByLevel', () => {
  it('con ANALYTICS no aparece ningún hijo (ni grupos vacíos)', () => {
    const visible = filterNavigationByLevel(NAVIGATION, ROLE_LEVELS.ANALYTICS);

    expect(countChildren(visible)).toBe(0);
    expect(visible.every((item) => !item.children)).toBe(true);
    // "Inicio" sigue visible: su minLevel es ANALYTICS.
    expect(visible.some((item) => item.key === 'nav.home')).toBe(true);
  });

  it('con USER aparecen todos los hijos menos «Usuarios»', () => {
    const visible = filterNavigationByLevel(NAVIGATION, ROLE_LEVELS.USER);

    expect(countChildren(visible)).toBe(17);
    const allKeys = visible.flatMap((item) => item.children?.map((child) => child.key) ?? []);
    expect(allKeys).not.toContain('nav.items.user');
    expect(allKeys).not.toContain('nav.items.geoBulkImport');
  });

  it('con ADMIN aparecen los diecinueve hijos', () => {
    const visible = filterNavigationByLevel(NAVIGATION, ROLE_LEVELS.ADMIN);

    expect(countChildren(visible)).toBe(19);
    const allKeys = visible.flatMap((item) => item.children?.map((child) => child.key) ?? []);
    expect(allKeys).toContain('nav.items.user');
    // SPEC FE07 §3.1 — geoBulkImport's minLevel is ADMIN, the real minimum of ESAVI-GEOLOC-007.
    expect(allKeys).toContain('nav.items.geoBulkImport');
  });

  it('con SUPERADMIN también aparecen los diecinueve', () => {
    const visible = filterNavigationByLevel(NAVIGATION, ROLE_LEVELS.SUPERADMIN);

    expect(countChildren(visible)).toBe(19);
  });
});

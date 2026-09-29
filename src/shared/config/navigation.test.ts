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

  it('con USER aparecen todos los hijos menos «Usuarios», «Roles», «Configuraciones» y «Medicamentos WHODrug»', () => {
    const visible = filterNavigationByLevel(NAVIGATION, ROLE_LEVELS.USER);

    expect(countChildren(visible)).toBe(10);
    const allKeys = visible.flatMap((item) => item.children?.map((child) => child.key) ?? []);
    expect(allKeys).not.toContain('nav.items.user');
    expect(allKeys).not.toContain('nav.items.geoBulkImport');
    // SPEC FE19 §2, §6 — desviación declarada: systemConfig exige SUPERADMIN, no USER.
    expect(allKeys).not.toContain('nav.items.systemConfig');
    // SPEC FE21 §3.1, §6 — desviación declarada: appRole exige ADMIN aunque el rol mínimo real
    // de ESAVI-APPROLE-002A sea USER. Hasta este spec el ítem estaba `disabled`.
    expect(allKeys).not.toContain('nav.items.appRole');
    // SPEC FE25d §3.1 — ADMIN, the real minimum of ESAVI-WHODPROD-002B, its only listing.
    expect(allKeys).not.toContain('nav.items.whodrugProduct');
  });

  it('con ADMIN aparecen catorce hijos, sin «Configuraciones»', () => {
    const visible = filterNavigationByLevel(NAVIGATION, ROLE_LEVELS.ADMIN);

    expect(countChildren(visible)).toBe(14);
    const allKeys = visible.flatMap((item) => item.children?.map((child) => child.key) ?? []);
    expect(allKeys).toContain('nav.items.user');
    expect(allKeys).toContain('nav.items.appRole');
    // SPEC FE07 §3.1 — geoBulkImport's minLevel is ADMIN, the real minimum of ESAVI-GEOLOC-007.
    expect(allKeys).toContain('nav.items.geoBulkImport');
    expect(allKeys).toContain('nav.items.whodrugProduct');
    expect(allKeys).not.toContain('nav.items.systemConfig');
  });

  it('con SUPERADMIN aparecen los quince, incluida «Configuraciones»', () => {
    const visible = filterNavigationByLevel(NAVIGATION, ROLE_LEVELS.SUPERADMIN);

    expect(countChildren(visible)).toBe(15);
    const allKeys = visible.flatMap((item) => item.children?.map((child) => child.key) ?? []);
    expect(allKeys).toContain('nav.items.systemConfig');
  });
});

describe('NAVIGATION', () => {
  // SPEC FE26 §2: a group without children is not declared, even though the role filter would
  // hide it anyway — relying on the filter to mask an empty group is an accident, not a design.
  it('ningún grupo se declara con children vacío', () => {
    const emptyGroups = NAVIGATION.filter((item) => item.children && item.children.length === 0);

    expect(emptyGroups).toEqual([]);
  });

  it('declara los cuatro grupos de SPEC FE26 §3.1 más la hoja de inicio', () => {
    expect(NAVIGATION.map((item) => item.key)).toEqual([
      'nav.home',
      'nav.groups.cases',
      'nav.groups.clinicalCatalogs',
      'nav.groups.geography',
      'nav.groups.administration',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { distributionsFixture } from './distributionsFixture';
import { sexAgeRows } from './sexAgeRows';

describe('sexAgeRows', () => {
  it('una fila por banda, en el orden de bands', () => {
    const rows = sexAgeRows(distributionsFixture().sexAge);

    expect(rows.map((row) => row.band)).toEqual([
      'LT_1Y',
      'Y1_17',
      'Y18_24',
      'Y25_49',
      'Y50_59',
      'Y60_69',
      'Y70_79',
      'Y80_PLUS',
      'UNKNOWN',
    ]);
  });

  it('separa femenino, masculino y desconocido más sin dato', () => {
    const rows = sexAgeRows(distributionsFixture().sexAge);

    expect(rows[3]).toEqual({
      band: 'Y25_49',
      female: 5,
      male: 3,
      unknown: 1,
      none: 0,
      unknownOrNone: 1,
      total: 9,
    });
    expect(rows[8]).toMatchObject({ unknown: 0, none: 2, unknownOrNone: 2, total: 4 });
  });

  it('lee las columnas por su código en sexes, no por posición', () => {
    const rows = sexAgeRows({
      bands: ['Y18_24', 'Y25_49'],
      sexes: ['NONE', 'MALE', 'UNKNOWN', 'FEMALE'],
      matrix: [
        [1, 2, 0, 7],
        [0, 3, 4, 5],
      ],
    });

    expect(rows[0]).toMatchObject({ female: 7, male: 2, unknown: 0, none: 1, total: 10 });
    expect(rows[1]).toMatchObject({ female: 5, male: 3, unknown: 4, none: 0, unknownOrNone: 4 });
  });

  it('una columna ausente cuenta como 0', () => {
    const rows = sexAgeRows({ bands: ['LT_1Y'], sexes: ['FEMALE', 'MALE'], matrix: [[2, 1]] });

    expect(rows[0]).toMatchObject({ female: 2, male: 1, unknown: 0, none: 0, total: 3 });
  });

  it('la suma de la matriz es el total de la fixture de indicadores (42)', () => {
    const total = sexAgeRows(distributionsFixture().sexAge).reduce(
      (sum, row) => sum + row.total,
      0,
    );

    expect(total).toBe(42);
  });
});

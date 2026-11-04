import { describe, expect, it } from 'vitest';
import { distributionsFixture } from './distributionsFixture';
import { pyramidMax, pyramidTicks, sexAgeRows } from './sexAgeRows';

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

describe('pyramidMax', () => {
  it('es el mayor valor de femenino o masculino, nunca menos de 1', () => {
    expect(pyramidMax(sexAgeRows(distributionsFixture().sexAge))).toBe(5);
    expect(
      pyramidMax(sexAgeRows({ bands: ['LT_1Y'], sexes: ['FEMALE', 'MALE'], matrix: [[0, 0]] })),
    ).toBe(1);
  });

  it('ignora desconocido y sin dato, que no se dibujan en la pirámide', () => {
    const rows = sexAgeRows({
      bands: ['UNKNOWN'],
      sexes: ['FEMALE', 'MALE', 'UNKNOWN', 'NONE'],
      matrix: [[1, 2, 9, 9]],
    });
    expect(pyramidMax(rows)).toBe(2);
  });
});

describe('pyramidTicks', () => {
  it('son simétricas alrededor de 0', () => {
    for (const max of [1, 3, 5, 12, 137]) {
      const ticks = pyramidTicks(max);
      // `|| 0` turns -0 into 0, which toEqual tells apart.
      expect(ticks).toEqual([...ticks].reverse().map((tick) => -tick || 0));
      expect(ticks).toContain(0);
      expect(ticks[0]).toBe(-max);
      expect(ticks.at(-1)).toBe(max);
    }
  });

  it('son enteras', () => {
    expect(pyramidTicks(5)).toEqual([-5, -3, 0, 3, 5]);
    expect(pyramidTicks(3)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });
});

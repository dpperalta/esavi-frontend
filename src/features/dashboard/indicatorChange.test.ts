import { describe, expect, it } from 'vitest';
import { formatChange, formatPointChange, share } from './indicatorChange';

describe('formatChange', () => {
  it('0 → N es «nuevo», sin porcentaje', () => {
    expect(formatChange(5, 0)).toEqual({ kind: 'new' });
  });

  it('0 → 0 es «sin cambios»', () => {
    expect(formatChange(0, 0)).toEqual({ kind: 'none' });
  });

  it('N → N es «sin cambios»', () => {
    expect(formatChange(12, 12)).toEqual({ kind: 'none' });
  });

  it('N → M mayor sube, con la razón sobre el anterior', () => {
    expect(formatChange(42, 30)).toEqual({ kind: 'up', ratio: 0.4 });
  });

  it('N → M menor baja, con la razón en positivo', () => {
    expect(formatChange(15, 30)).toEqual({ kind: 'down', ratio: 0.5 });
  });

  it('N → 0 baja un 100 %', () => {
    expect(formatChange(0, 8)).toEqual({ kind: 'down', ratio: 1 });
  });
});

describe('formatPointChange', () => {
  it('compara en puntos porcentuales, no en porcentaje del porcentaje', () => {
    const change = formatPointChange(0.15, 0.1);
    expect(change?.kind).toBe('pp');
    if (change?.kind !== 'pp') return;
    expect(change.points).toBeCloseTo(5);
  });

  it('una bajada da puntos negativos', () => {
    const change = formatPointChange(0.1, 0.132);
    if (change?.kind !== 'pp') throw new Error('expected pp');
    expect(change.points).toBeCloseTo(-3.2);
  });

  it('sin clasificados en el periodo anterior es «nuevo»', () => {
    expect(formatPointChange(0.2, null)).toEqual({ kind: 'new' });
  });

  it('sin clasificados en el periodo actual no hay variación que mostrar', () => {
    expect(formatPointChange(null, 0.2)).toBeNull();
  });

  it('una diferencia que redondea a 0,0 pp es «sin cambios»', () => {
    expect(formatPointChange(0.10004, 0.1)).toEqual({ kind: 'none' });
  });
});

describe('share', () => {
  it('con denominador 0 devuelve null, nunca NaN', () => {
    expect(share(0, 0)).toBeNull();
  });

  it('divide la parte entre el total', () => {
    expect(share(8, 40)).toBe(0.2);
  });
});

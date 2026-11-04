import { describe, expect, it } from 'vitest';
import { chartMinWidth, labelStep } from './epiCurveLayout';

describe('labelStep', () => {
  it('desde md, todas las etiquetas hasta 26 semanas', () => {
    expect(labelStep(5, false)).toBe(1);
    expect(labelStep(26, false)).toBe(1);
  });

  it('desde md, una de cada 4 con más de 26 semanas', () => {
    expect(labelStep(27, false)).toBe(4);
    expect(labelStep(53, false)).toBe(4);
  });

  it('por debajo de md, una de cada 8 sea cual sea el número de semanas', () => {
    expect(labelStep(5, true)).toBe(8);
    expect(labelStep(53, true)).toBe(8);
  });
});

describe('chartMinWidth', () => {
  it('53 semanas caben en el ancho útil de una tarjeta a 375 px sin scroll', () => {
    // 375 px viewport, minus the 16 px gutters of the page and of the card on each side.
    expect(chartMinWidth(53)).toBeLessThanOrEqual(375 - 4 * 16);
  });
});

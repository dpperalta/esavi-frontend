import { describe, expect, it } from 'vitest';
import { programmaticRate } from './programmaticRate';

describe('programmaticRate', () => {
  it('con denominador 0 devuelve null, nunca NaN ni 0', () => {
    expect(programmaticRate(0, 4, 4)).toBeNull();
    expect(programmaticRate(0, 0, 0)).toBeNull();
  });

  it('divide entre las investigaciones con registro del grupo', () => {
    expect(programmaticRate(3, 12, 2)).toBe(0.3);
  });

  it('sin investigaciones sin registro, el denominador es el total investigado', () => {
    expect(programmaticRate(2, 8, 0)).toBe(0.25);
  });
});

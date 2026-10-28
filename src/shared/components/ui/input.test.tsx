import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input — touch target', () => {
  // Declared exception to CONVENTIONS.md §12 (no Tailwind class assertions): jsdom does not
  // evaluate `(pointer: coarse)`, so the 44px height cannot be measured here. The test pins the
  // wiring; the rendered height is measured in SPEC FE31 §4 step 6.
  it('mantiene 32px con ratón y sube a 44px con puntero táctil', () => {
    render(<Input aria-label="campo" />);

    const input = screen.getByRole('textbox', { name: 'campo' });
    expect(input).toHaveClass('h-8');
    expect(input).toHaveClass('pointer-coarse:h-11');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button — touch target', () => {
  // Declared exception to CONVENTIONS.md §12 (no Tailwind class assertions): jsdom does not
  // evaluate `(pointer: coarse)`, so the 44px size cannot be measured here. The test pins the
  // wiring; the rendered size is measured in SPEC FE31 §4 step 6.
  it('el tamaño default mantiene 32px con ratón y sube a 44px con puntero táctil', () => {
    render(<Button>Guardar</Button>);

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toHaveClass('h-8');
    expect(button).toHaveClass('pointer-coarse:h-11');
  });

  it('el tamaño icon mantiene 32px con ratón y sube a 44px con puntero táctil', () => {
    render(<Button size="icon" aria-label="Cerrar" />);

    const button = screen.getByRole('button', { name: 'Cerrar' });
    expect(button).toHaveClass('size-8');
    expect(button).toHaveClass('pointer-coarse:size-11');
  });

  it.each(['sm', 'xs', 'touch'] as const)(
    'el tamaño %s no cambia con puntero táctil',
    (size) => {
      render(<Button size={size}>Acción</Button>);

      expect(screen.getByRole('button', { name: 'Acción' }).className).not.toMatch(
        /pointer-coarse:/,
      );
    },
  );
});

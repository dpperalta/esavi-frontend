import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge — variante warning', () => {
  // Declared exception to CONVENTIONS.md §12 (no Tailwind class assertions): SPEC FE37 §4 step 5
  // asks that the new variant sits on the `--warning` token and that the existing ones don't move,
  // and the class list is the only observable trace of a token in jsdom.
  it('warning se apoya en el token --warning', () => {
    render(<Badge variant="warning">Atención</Badge>);

    const badge = screen.getByText('Atención');
    expect(badge).toHaveAttribute('data-variant', 'warning');
    expect(badge).toHaveClass('bg-warning/10', 'text-warning', 'dark:bg-warning/20');
  });

  it('destructive conserva sus clases', () => {
    render(<Badge variant="destructive">Inactivo</Badge>);

    const badge = screen.getByText('Inactivo');
    expect(badge).toHaveClass('bg-destructive/10', 'text-destructive', 'dark:bg-destructive/20');
    expect(badge.className).not.toMatch(/warning/);
  });

  it('default sigue siendo la variante por defecto', () => {
    render(<Badge>Nuevo</Badge>);

    expect(screen.getByText('Nuevo')).toHaveAttribute('data-variant', 'default');
  });
});

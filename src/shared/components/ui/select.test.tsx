import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

function renderSelect(props: {
  value?: string;
  clearable?: boolean;
  onClear?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'default';
}) {
  const { value, ...triggerProps } = props;
  return render(
    <Select value={value} onValueChange={() => {}}>
      <SelectTrigger {...triggerProps}>
        <SelectValue placeholder="Elige una opción" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Opción A</SelectItem>
        <SelectItem value="b">Opción B</SelectItem>
      </SelectContent>
    </Select>,
  );
}

describe('SelectTrigger — clearable', () => {
  // jsdom no evalúa `:has()` ni carga el CSS de Tailwind, así que no puede calcular el
  // `display: none` que produce `group-has-data-[placeholder]:hidden` (SPEC FE05 §3.1). Este
  // test verifica el cableado —el trigger sin valor lleva `data-placeholder`, del que depende
  // la clase que oculta la «×»—, no el resultado visual. Ese resultado se confirma a ojo en el
  // recorrido manual de cierre (paso 8 del plan), junto con tema oscuro y <md.
  it('sin valor seleccionado, el trigger lleva data-placeholder y la "×" lleva la clase que la oculta', () => {
    renderSelect({ value: undefined, onClear: vi.fn() });

    expect(screen.getByRole('combobox')).toHaveAttribute('data-placeholder');
    expect(screen.getByRole('button', { name: 'Limpiar selección' })).toHaveClass(
      'group-has-data-[placeholder]:hidden',
    );
  });

  it('con valor seleccionado, el trigger no lleva data-placeholder y la "×" está en el DOM', () => {
    renderSelect({ value: 'a', onClear: vi.fn() });

    expect(screen.getByRole('combobox')).not.toHaveAttribute('data-placeholder');
    expect(screen.getByRole('button', { name: 'Limpiar selección' })).toBeInTheDocument();
  });

  it('pulsar la "×" llama a onClear y no abre el desplegable', async () => {
    const onClear = vi.fn();
    const user = setupUser();
    renderSelect({ value: 'a', onClear });

    await user.click(screen.getByRole('button', { name: 'Limpiar selección' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('option', { name: 'Opción A' })).not.toBeInTheDocument();
  });

  it('con clearable={false} la "×" no aparece nunca, aunque haya valor y onClear', () => {
    renderSelect({ value: 'a', onClear: vi.fn(), clearable: false });

    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
  });

  it('con disabled la "×" no aparece, aunque haya valor y onClear', () => {
    renderSelect({ value: 'a', onClear: vi.fn(), disabled: true });

    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
  });

  it('sin onClear, un <Select> se comporta exactamente como antes: sin "×"', () => {
    renderSelect({ value: 'a' });

    expect(screen.queryByRole('button', { name: 'Limpiar selección' })).not.toBeInTheDocument();
  });
});

describe('SelectTrigger — touch target', () => {
  // Declared exception to CONVENTIONS.md §12 (no Tailwind class assertions): jsdom does not
  // evaluate `(pointer: coarse)`. The class lives in the static string for every size and only
  // takes effect through `data-size="default"`, so the test pins that wiring (SPEC FE31 §3.1);
  // the rendered height is measured in §4 step 6.
  it('el trigger default lleva data-size="default" y la clase de 44px en táctil', () => {
    renderSelect({ value: 'a' });

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('data-size', 'default');
    expect(trigger).toHaveClass('data-[size=default]:h-8');
    expect(trigger).toHaveClass('pointer-coarse:data-[size=default]:h-11');
  });

  it('el trigger sm lleva data-size="sm", que deja sin efecto la clase de 44px', () => {
    renderSelect({ value: 'a', size: 'sm' });

    expect(screen.getByRole('combobox')).toHaveAttribute('data-size', 'sm');
  });
});

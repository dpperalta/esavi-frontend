import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { TermSearchField, type TermSearchFieldProps, type TermSearchOption } from './TermSearchField';

const OPTIONS: TermSearchOption[] = [
  { code: 'FIEBRE', name: 'Fiebre alta' },
  { code: 'CONVULSION', name: 'Convulsión febril' },
];

function Harness(props: Partial<TermSearchFieldProps>) {
  const [value, setValue] = useState(props.value ?? '');

  return (
    <TermSearchField
      value={value}
      onValueChange={(next) => {
        setValue(next);
        props.onValueChange?.(next);
      }}
      onSelect={props.onSelect ?? vi.fn()}
      onQueryChange={props.onQueryChange ?? vi.fn()}
      options={props.options ?? []}
      isLoading={props.isLoading}
      isError={props.isError}
      moreResultsAvailable={props.moreResultsAvailable}
      minLength={props.minLength ?? 3}
      debounceMs={props.debounceMs ?? 10}
      placeholder="Buscar término"
      ariaLabel="Término"
      readOnly={props.readOnly}
      onClear={props.onClear}
    />
  );
}

// Every test carries an explicit timeout: a Popover-backed combobox is noticeably heavier than a
// plain `<input>` in this environment, the same "yield intermittently stalls" cost documented in
// `src/test/user.ts` and in `HealthFacilitySelect.test.tsx` — real, not fake.
const POPOVER_TEST_TIMEOUT = 30000;

describe('TermSearchField', () => {
  it(
    'es un combobox con teclado completo',
    () => {
      render(<Harness />);
      const input = screen.getByRole('combobox', { name: 'Término' });
      expect(input).toHaveAttribute('aria-expanded', 'false');
    },
    POPOVER_TEST_TIMEOUT,
  );

  it(
    'seleccionar una sugerencia con el mouse llama a onSelect y cierra el panel',
    () => {
      const onSelect = vi.fn();
      render(<Harness options={OPTIONS} value="fi" onSelect={onSelect} />);

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fie' } });
      fireEvent.click(screen.getByRole('option', { name: 'Fiebre alta' }));

      expect(onSelect).toHaveBeenCalledWith(OPTIONS[0]);
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    },
    POPOVER_TEST_TIMEOUT,
  );

  it(
    'ArrowDown y Enter seleccionan la sugerencia resaltada',
    () => {
      const onSelect = vi.fn();
      render(<Harness options={OPTIONS} onSelect={onSelect} />);

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'fie' } });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith(OPTIONS[0]);
    },
    POPOVER_TEST_TIMEOUT,
  );

  it(
    'Escape cierra el panel',
    () => {
      render(<Harness options={OPTIONS} />);
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'fie' } });
      expect(input).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toHaveAttribute('aria-expanded', 'false');
    },
    POPOVER_TEST_TIMEOUT,
  );

  it(
    'con menos caracteres que el mínimo no muestra resultados ni pide más',
    () => {
      render(<Harness options={OPTIONS} minLength={3} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fi' } });

      expect(screen.getByText('Escribe al menos 3 caracteres.')).toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    },
    POPOVER_TEST_TIMEOUT,
  );

  it(
    'avisa cuando count === limit',
    () => {
      render(<Harness options={OPTIONS} moreResultsAvailable />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fie' } });

      expect(screen.getByText(/Hubo más resultados/)).toBeInTheDocument();
    },
    POPOVER_TEST_TIMEOUT,
  );

  it(
    'en sólo lectura muestra la acción «quitar» y no abre el panel',
    () => {
      const onClear = vi.fn();
      render(<Harness options={OPTIONS} readOnly onClear={onClear} value="Fiebre alta" />);

      const clearButton = screen.getByRole('button', { name: 'Quitar' });
      fireEvent.click(clearButton);
      expect(onClear).toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    },
    POPOVER_TEST_TIMEOUT,
  );
});

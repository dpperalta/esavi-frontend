import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { MeddraSearchField } from './MeddraSearchField';
import type { TermSearchFieldProps } from './TermSearchField';

function Harness(props: Partial<TermSearchFieldProps>) {
  const [value, setValue] = useState(props.value ?? '');

  return (
    <MeddraSearchField
      value={value}
      onValueChange={setValue}
      onSelect={props.onSelect ?? vi.fn()}
      onQueryChange={props.onQueryChange ?? vi.fn()}
      options={props.options ?? []}
      isError={props.isError}
      placeholder="Buscar término del ESAVI"
      ariaLabel="Término del ESAVI"
    />
  );
}

// Same real-time cost as TermSearchField.test.tsx — see the comment there. The two debounce tests
// below additionally wait out a real timer while the popover is open, which layers Radix's own
// positioning polling on top of that cost, so they carry a wider margin than the others.
const POPOVER_TEST_TIMEOUT = 30000;
const DEBOUNCE_TEST_TIMEOUT = 60000;

describe('MeddraSearchField', () => {
  it(
    'con dos caracteres no llama a onQueryChange (mínimo de MEDDRA-006 es 3)',
    async () => {
      const onQueryChange = vi.fn();
      render(<Harness onQueryChange={onQueryChange} />);

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fi' } });
      await new Promise((resolve) => setTimeout(resolve, 450));

      expect(onQueryChange).toHaveBeenCalledWith('');
    },
    DEBOUNCE_TEST_TIMEOUT,
  );

  it(
    'con tres caracteres llama a onQueryChange tras el rebote de 400ms',
    async () => {
      const onQueryChange = vi.fn();
      render(<Harness onQueryChange={onQueryChange} />);

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fie' } });
      await new Promise((resolve) => setTimeout(resolve, 450));

      expect(onQueryChange).toHaveBeenCalledWith('fie');
    },
    DEBOUNCE_TEST_TIMEOUT,
  );

  it(
    'con un 503 del diccionario sigue aceptando texto y muestra su estado de servicio, no "no hay resultados"',
    () => {
      render(<Harness isError />);

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fie' } });

      expect(screen.getByText(/no está disponible ahora mismo/)).toBeInTheDocument();
      expect(screen.queryByText(/Ningún resultado coincide/)).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).not.toBeDisabled();
    },
    POPOVER_TEST_TIMEOUT,
  );
});

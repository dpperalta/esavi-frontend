import { useMemo, useState } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setupUser } from '@/test/user';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';

const TWENTY_OPTIONS: SearchableSelectOption[] = Array.from({ length: 20 }, (_, index) => ({
  value: `option-${index}`,
  label: `Opción ${index}`,
}));

// A minimal harness that plays the caller's part: it owns `search` and recomputes `options` by
// filtering the static list on every keystroke, exactly like a "catálogo largo" consumer would —
// this component never filters on its own (SPEC FE12c §4 paso 2).
function Harness({ minLength = 2 }: { minLength?: number }) {
  const [value, setValue] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => TWENTY_OPTIONS.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase())),
    [search],
  );
  return (
    <SearchableSelect
      value={value}
      onChange={setValue}
      search={search}
      onSearchChange={setSearch}
      options={filtered}
      minLength={minLength}
      minLengthMessage="Escribe al menos 2 caracteres."
      placeholder="Elige una opción"
      ariaLabel="Opción"
      emptyMessage="Sin resultados"
    />
  );
}

describe('SearchableSelect', () => {
  // Mounting an opened Radix `<Popover>` costs this environment ~20-35s of real wall time,
  // reproduced with a minimal Popover + cmdk `Command` with none of this component's own logic
  // involved, and independent of whether it opens via a click or is already open on first render
  // — confirmed by inspecting the DOM synchronously right after mount, where the popover is
  // already there. The stall sits somewhere in the Vitest/jsdom/Radix Popover interaction and
  // resisted isolation past that point; it is not the already-documented `userEvent` `delay:0`
  // stall of `src/test/user.ts` (`fireEvent` reproduces it too). Both assertions that need the
  // popover open share a single test to pay that cost once instead of twice, and the timeout is
  // raised locally to this file instead of the global one in `vite.config.ts`.
  it(
    'no monta el listado entero antes del mínimo, y filtra con el teclado una vez alcanzado',
    async () => {
      render(<Harness />);
      const user = setupUser();

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByText('Escribe al menos 2 caracteres.')).toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();

      await user.type(screen.getByPlaceholderText('Elige una opción'), 'Opción 1');

      expect(await screen.findByRole('option', { name: 'Opción 1' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Opción 2' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Opción 10' })).toBeInTheDocument();
    },
    60000,
  );

  it('el desplegable deshabilitado muestra su explicación en vez de abrirse vacío', () => {
    render(
      <SearchableSelect
        value={null}
        onChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        options={[]}
        placeholder="Elige una opción"
        ariaLabel="Opción"
        emptyMessage="Sin resultados"
        disabled
        disabledReason="El maestro no tiene datos cargados."
      />,
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByText('El maestro no tiene datos cargados.')).toBeInTheDocument();
  });
});

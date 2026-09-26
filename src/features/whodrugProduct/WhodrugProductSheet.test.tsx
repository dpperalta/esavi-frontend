import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { WhodrugProductRow } from '@/contracts/declared/whodrugProduct';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { WhodrugProductSheet } from './WhodrugProductSheet';

function makeRow(overrides: Partial<WhodrugProductRow> = {}): WhodrugProductRow {
  return {
    whodrugProductId: 'p-1',
    rowHash: 'a'.repeat(64),
    drugCode: '000001010016',
    drugName: 'Paracetamol',
    drugAtcs: ';N02BE01;',
    medicinalProductId: null,
    atcs: 'N02BE01',
    ingredient: 'Paracetamol',
    ingredientTranslations: 'Paracetamol',
    languageCode: 'es',
    iso3Code: 'ECU',
    countryMedicinalProductId: null,
    maHolders: 'Laboratorio X',
    maHoldersMedicinalProductId: null,
    form: 'Tableta',
    formMedicinalProductId: null,
    strength: '500 mg',
    strengthMedicinalProductId: null,
    isGeneric: true,
    isPreferred: false,
    optionName: 'Paracetamol (Paracetamol)',
    optionNameSearch: 'paracetamol-search-only',
    metadata: {},
    isActive: true,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [
      {
        createdAt: new Date('2026-09-21T10:00:00.000Z'),
        user: 'sync@esavi',
        method: 'PUT',
        detail: 'Retirado del estándar',
      },
    ],
    ...overrides,
  };
}

function renderSheet(row: WhodrugProductRow | null, level: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['user', 'me'], {
    userId: 'me-1',
    roles: [{ roleId: 'r1', name: 'ROLE', code: 'ROLE', level }],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WhodrugProductSheet row={row} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  tokenStore.setRefreshToken('a-refresh-token');
});
afterEach(() => localStorage.clear());

describe('WhodrugProductSheet (SPEC FE25d §3.1)', () => {
  it('pinta las seis secciones con la fila recibida', () => {
    renderSheet(makeRow(), 50);

    const dialog = screen.getByRole('dialog', { name: 'Paracetamol' });
    for (const name of [
      'Medicamento',
      'Clasificación',
      'Composición',
      'País y registro',
      'Presentación',
      'Procedencia',
    ]) {
      expect(within(dialog).getByRole('region', { name })).toBeInTheDocument();
    }
    const presentation = within(dialog).getByRole('region', { name: 'Presentación' });
    expect(within(presentation).getByText('500 mg')).toBeInTheDocument();
  });

  it('marca los campos vacíos con «—» y un texto accesible', () => {
    renderSheet(makeRow(), 50);

    const registration = screen.getByRole('region', { name: 'País y registro' });
    expect(within(registration).getAllByText('Sin valor').length).toBeGreaterThan(0);
    expect(within(registration).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('con ADMIN no muestra la auditoría', () => {
    renderSheet(makeRow(), 50);

    expect(screen.queryByRole('region', { name: 'Auditoría' })).not.toBeInTheDocument();
  });

  it('con SUPERADMIN muestra la auditoría con appDetails', () => {
    renderSheet(makeRow(), 100);

    const audit = screen.getByRole('region', { name: 'Auditoría' });
    expect(within(audit).getByText('sync@esavi')).toBeInTheDocument();
  });

  it('muestra metadata como pares clave–valor, sin suponer sus claves', () => {
    renderSheet(makeRow({ metadata: { dictionaryVersion: 'X' } }), 50);

    const provenance = screen.getByRole('region', { name: 'Procedencia' });
    expect(within(provenance).getByText('dictionaryVersion')).toBeInTheDocument();
    expect(within(provenance).getByText('X')).toBeInTheDocument();
  });

  it('no muestra optionNameSearch', () => {
    renderSheet(makeRow(), 100);

    expect(screen.queryByText('paracetamol-search-only')).not.toBeInTheDocument();
  });

  it('una fila retirada lleva el badge «Retirado del estándar»', () => {
    renderSheet(makeRow({ isActive: false, deletedAt: '2026-09-21T10:00:00.000Z' }), 50);

    expect(screen.getByText('Retirado del estándar')).toBeInTheDocument();
  });

  it('con row: null no abre el panel', () => {
    renderSheet(null, 50);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('al cerrar, el foco vuelve al elemento que lo abrió', async () => {
    const user = setupUser();
    const row = makeRow();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Paracetamol fila
          </button>
          <WhodrugProductSheet row={open ? row : null} onClose={() => setOpen(false)} />
        </>
      );
    }

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Paracetamol fila' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix's FocusScope restores focus in a `setTimeout(0)` on unmount.
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

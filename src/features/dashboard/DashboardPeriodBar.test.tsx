import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DashboardPeriodBar } from './DashboardPeriodBar';

const API = 'http://localhost:4500/api';
const GEO_ID = '3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40';
const DESKTOP_WIDTH = window.innerWidth;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
  vi.useRealTimers();
  window.innerWidth = DESKTOP_WIDTH;
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0));
  // ANALYTICS keeps the geo filter off the network, so these tests are about the period only.
  server.use(
    http.get(`${API}/users/me`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: 'u1',
          displayName: 'Ana',
          roles: [{ roleId: 'r1', name: 'ANALYTICS', code: 'ANALYTICS', level: 10 }],
        },
      }),
    ),
  );
});

function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function renderBar(search: string, props: Parameters<typeof DashboardPeriodBar>[0] = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/${search}`]}>
        <DashboardPeriodBar {...props} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function currentSearch(): URLSearchParams {
  return new URLSearchParams(screen.getByTestId('search').textContent ?? '');
}

describe('DashboardPeriodBar', () => {
  it('elegir un atajo escribe ?range= y borra from y to, conservando geoLocationId', async () => {
    const user = setupUser();
    renderBar(`?from=2026-10-01&to=2026-10-31&geoLocationId=${GEO_ID}`);

    await user.click(await screen.findByRole('radio', { name: '7 días' }));

    const search = currentSearch();
    expect(search.get('range')).toBe('7d');
    expect(search.has('from')).toBe(false);
    expect(search.has('to')).toBe(false);
    expect(search.get('geoLocationId')).toBe(GEO_ID);
  });

  it('aplicar un personalizado escribe from y to y borra range', async () => {
    const user = setupUser();
    renderBar('?range=7d');

    await user.click(await screen.findByRole('radio', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(currentSearch().get('from')).toBe('2026-10-01'));
    expect(currentSearch().get('to')).toBe('2026-10-31');
    expect(currentSearch().has('range')).toBe(false);
  });

  it('un rango de 400 días no se aplica y muestra el error en el campo', async () => {
    const user = setupUser();
    renderBar('?range=7d');

    await user.click(await screen.findByRole('radio', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-09-29' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-02' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El periodo no puede superar 366 días.');
    expect(currentSearch().get('range')).toBe('7d');
    expect(currentSearch().has('from')).toBe(false);
  });

  it('from posterior a to marca el error en «Hasta»', async () => {
    const user = setupUser();
    renderBar('');

    await user.click(await screen.findByRole('radio', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha final no puede ser anterior a la inicial.',
    );
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });

  it('recargar con ?range=90d marca ese atajo', async () => {
    renderBar('?range=90d');

    expect(await screen.findByRole('radio', { name: '90 días' })).toHaveAttribute('aria-checked', 'true');
  });

  it('recargar con un personalizado lo marca y rellena las fechas', async () => {
    renderBar('?from=2026-10-01&to=2026-10-31');

    expect(await screen.findByRole('radio', { name: 'Personalizado' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-31');
  });

  it('sin parámetros marca el default de 30 días sin escribirlo en la URL', async () => {
    renderBar('');

    expect(await screen.findByRole('radio', { name: '30 días' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
  });

  it('las flechas mueven la selección dentro del grupo', async () => {
    const user = setupUser();
    renderBar('?range=30d');

    await user.click(await screen.findByRole('radio', { name: '30 días' }));
    await user.keyboard('{ArrowRight}');

    expect(currentSearch().get('range')).toBe('90d');
    expect(screen.getByRole('radio', { name: '90 días' })).toHaveFocus();
  });

  it.each(['?range=999d', '?from=2030-01-01', '?from=2025-09-29&to=2026-11-02'])(
    '%s muestra el aviso de enlace inválido',
    async (search) => {
      renderBar(search);

      expect(await screen.findByRole('status')).toHaveTextContent(/no es válido/);
    },
  );

  it('serverRejected muestra el mismo aviso', async () => {
    renderBar('', { serverRejected: true });

    expect(await screen.findByRole('status')).toHaveTextContent(/no es válido/);
  });

  it('muestra el rango de data.period, no uno calculado', async () => {
    renderBar('?range=7d', { displayedPeriod: { from: '2026-10-05', to: '2026-11-03', days: 30 } });

    expect(await screen.findByText(/^Del .*5.* al .*3.*2026$/)).toBeInTheDocument();
  });

  it('por debajo de md los atajos son un Select', async () => {
    window.innerWidth = 375;
    renderBar('?range=7d');

    expect(await screen.findByRole('combobox', { name: 'Periodo' })).toHaveTextContent('7 días');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});

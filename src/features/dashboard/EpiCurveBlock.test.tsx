import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardEpiCurve } from '@/contracts/dashboard';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { EpiCurveBlock } from './EpiCurveBlock';
import { epiCurveFixture } from './epiCurveFixture';

const EPI_CURVE_URL = 'http://localhost:4500/api/dashboard/epi-curve';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function mockEpiCurve(data: DashboardEpiCurve) {
  server.use(http.get(EPI_CURVE_URL, () => HttpResponse.json({ ok: true, message: 'ok', data })));
}

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderBlock(initialUrl = '/') {
  // The hook owns `retry` (no 4xx retries); retryDelay 0 only keeps its 5xx retries instant here.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <EpiCurveBlock query={{}} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function currentSearch() {
  return new URLSearchParams(screen.getByTestId('search').textContent ?? '');
}

describe('EpiCurveBlock — ESAVI-DASH-008', () => {
  it('dibuja el gráfico con el resumen accesible de rango, total y semanas', async () => {
    mockEpiCurve(epiCurveFixture());
    renderBlock();

    expect(
      await screen.findByRole('img', {
        name: 'Casos por semana epidemiológica, del 5 oct 2026 al 3 nov 2026: 42 casos en 5 semanas',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver como tabla' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('con ?epiView=table renderiza la tabla y el botón dice «Ver como gráfico»', async () => {
    mockEpiCurve(epiCurveFixture());
    renderBlock('/?range=90d&epiView=table');

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver como gráfico' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('pulsar «Ver como gráfico» quita epiView y conserva range', async () => {
    mockEpiCurve(epiCurveFixture());
    const user = setupUser();
    renderBlock('/?range=90d&epiView=table');

    await user.click(await screen.findByRole('button', { name: 'Ver como gráfico' }));

    expect(currentSearch().has('epiView')).toBe(false);
    expect(currentSearch().get('range')).toBe('90d');
    expect(await screen.findByRole('img')).toBeInTheDocument();
  });

  it('pulsar «Ver como tabla» escribe epiView=table y conserva el periodo y la unidad', async () => {
    mockEpiCurve(epiCurveFixture());
    const user = setupUser();
    renderBlock('/?from=2026-10-01&to=2026-10-31&geoLocationId=geo-1');

    await user.click(await screen.findByRole('button', { name: 'Ver como tabla' }));

    expect(currentSearch().get('epiView')).toBe('table');
    expect(currentSearch().get('from')).toBe('2026-10-01');
    expect(currentSearch().get('to')).toBe('2026-10-31');
    expect(currentSearch().get('geoLocationId')).toBe('geo-1');
  });

  it('?epiView=cualquierCosa muestra el gráfico, sin aviso', async () => {
    mockEpiCurve(epiCurveFixture());
    renderBlock('/?epiView=cualquierCosa');

    expect(await screen.findByRole('img')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con todas las semanas en 0 se ven el gráfico y la línea de periodo sin casos', async () => {
    const zeroWeeks = epiCurveFixture().weeks.map((week) => ({
      ...week,
      serious: 0,
      nonSerious: 0,
      unclassified: 0,
      total: 0,
    }));
    mockEpiCurve(epiCurveFixture({ weeks: zeroWeeks }));
    renderBlock();

    expect(await screen.findByText('No hay casos reportados en este periodo.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /0 casos en 5 semanas/ })).toBeInTheDocument();
  });

  it('un 500 muestra el error del bloque con «Reintentar», y reintentar lo recupera', async () => {
    let failing = true;
    server.use(
      http.get(EPI_CURVE_URL, () =>
        failing
          ? HttpResponse.json(
              { ok: false, message: 'Error', code: 'DASH_008_QUERY_FAILED', errors: [] },
              { status: 500 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: epiCurveFixture() }),
      ),
    );
    const user = setupUser();
    renderBlock();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la curva epidemiológica.',
    );
    expect(screen.queryByRole('button', { name: 'Ver como tabla' })).not.toBeInTheDocument();

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('img')).toBeInTheDocument();
  });

  it('sin territorio el bloque no se dibuja', async () => {
    let answered = false;
    server.use(
      http.get(EPI_CURVE_URL, () => {
        answered = true;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: epiCurveFixture({
            scope: { restricted: true, hasAssignments: false, geoLocationId: null },
            weeks: [],
          }),
        });
      }),
    );
    const { container } = renderBlock();

    await waitFor(() => expect(answered).toBe(true));
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });
});

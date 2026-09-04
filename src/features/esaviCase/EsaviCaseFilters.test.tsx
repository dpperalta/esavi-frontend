import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { countActiveEsaviCaseFilters, EsaviCaseFilters } from './EsaviCaseFilters';

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

function mockGeoLocationPicker() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              geoLevelTypeId: 'lvl-country',
              code: 'COUNTRY',
              name: 'País',
              sortOrder: 1,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
    http.get('http://localhost:4500/api/geo-locations', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function renderFilters(initialPath = '/esavi-cases') {
  const router = createMemoryRouter(
    [
      { path: '/esavi-cases', element: <EsaviCaseFilters /> },
      { path: '/elsewhere', element: <p>elsewhere</p> },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('EsaviCaseFilters — segmentado Exacta/Rango', () => {
  it('cambiar de Exacta a Rango borra el parámetro exacto de la URL en la misma navegación', async () => {
    mockGeoLocationPicker();
    const user = setupUser();
    const router = renderFilters('/esavi-cases?reportDate=2026-03-01');

    // The «reportDate» column is the first of the three rendered (SPEC FE09 §3.5 order).
    await waitFor(() =>
      expect(screen.getAllByRole('radio', { name: 'Exacta' })[0]).toHaveAttribute('data-state', 'checked'),
    );

    await user.click(screen.getAllByRole('radio', { name: 'Rango' })[0]);

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.has('reportDate')).toBe(false);
    });
  });

  it('el botón atrás del navegador restaura el modo correcto de las tres columnas', async () => {
    mockGeoLocationPicker();
    const user = setupUser();
    const router = renderFilters('/esavi-cases?reportDate=2026-03-01');

    await waitFor(() =>
      expect(screen.getAllByRole('radio', { name: 'Exacta' })[0]).toHaveAttribute('data-state', 'checked'),
    );

    await user.click(screen.getAllByRole('radio', { name: 'Rango' })[0]);
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.has('reportDate')).toBe(false);
    });

    router.navigate(-1);

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('reportDate')).toBe('2026-03-01');
    });
    await waitFor(() =>
      expect(screen.getAllByRole('radio', { name: 'Exacta' })[0]).toHaveAttribute('data-state', 'checked'),
    );
  });

  it('From posterior a To muestra el error en línea y no produce petición', async () => {
    mockGeoLocationPicker();
    const router = renderFilters('/esavi-cases?eventDateFrom=2026-03-05&eventDateTo=2026-03-01');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha inicial no puede ser posterior a la fecha final.',
    );
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('eventDateFrom')).toBe('2026-03-05');
    expect(params.get('eventDateTo')).toBe('2026-03-01');
  });

  it('?reportDate=…&eventDateFrom=… es aceptado: la exclusión es por columna, no global', async () => {
    mockGeoLocationPicker();
    renderFilters('/esavi-cases?reportDate=2026-03-01&eventDateFrom=2026-02-01');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('countActiveEsaviCaseFilters', () => {
  it('cuenta sólo los parámetros de filtro presentes', () => {
    const params = new URLSearchParams(
      '?code=ab&geoLocationId=g1&page=2&includeInactive=true&tab=cases',
    );
    expect(countActiveEsaviCaseFilters(params)).toBe(2);
  });

  it('devuelve 0 sin filtros', () => {
    expect(countActiveEsaviCaseFilters(new URLSearchParams())).toBe(0);
  });

  it('cuenta las nueve columnas de fecha si están presentes', () => {
    const params = new URLSearchParams(
      '?reportDateFrom=2026-01-01&reportDateTo=2026-02-01&eventDate=2026-01-15',
    );
    expect(countActiveEsaviCaseFilters(params)).toBe(3);
  });
});

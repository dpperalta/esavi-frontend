import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardBatchAlerts } from '@/contracts/dashboard';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { setupUser } from '@/test/user';
import { BatchAlertsBlock } from './BatchAlertsBlock';
import { batchAlertFixture, batchAlertsFixture } from './batchAlertsFixture';

const API = 'http://localhost:4500/api';

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
  server.use(
    http.get(`${API}/users/me`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: '1',
          roles: [{ roleId: 'r1', name: 'ANALYTICS', code: 'ANALYTICS', level: 10 }],
        },
      }),
    ),
  );
});

function mockBatchAlerts(data: DashboardBatchAlerts) {
  server.use(
    http.get(`${API}/dashboard/batch-alerts`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data }),
    ),
  );
}

function alerts(count: number) {
  return Array.from({ length: count }, (_, index) =>
    batchAlertFixture({ batchNumber: `LOT${index + 1}`, label: `Vacuna ${index + 1}` }),
  );
}

function renderBlock() {
  // The hook owns `retry` (no 4xx retries); retryDelay 0 only keeps its 5xx retries instant here.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TooltipProvider>
          <BatchAlertsBlock query={{}} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function findBlock() {
  return screen.findByRole('region', { name: 'Lotes con alerta en su territorio' });
}

describe('BatchAlertsBlock', () => {
  it('la cabecera muestra los umbrales y los contadores', async () => {
    mockBatchAlerts(batchAlertsFixture());
    renderBlock();

    const block = await findBlock();
    expect(
      await within(block).findByText('Umbrales: ≥ 3 casos · ≥ 2 graves · cualquier defunción'),
    ).toBeInTheDocument();
    expect(
      within(block).getByText('18 lotes evaluados · 4 casos sin lote registrado'),
    ).toBeInTheDocument();
  });

  it('las alertas se muestran en el orden recibido', async () => {
    mockBatchAlerts(batchAlertsFixture());
    renderBlock();

    const articles = await within(await findBlock()).findAllByRole('article');
    expect(articles.map((article) => article.querySelector('h4')?.textContent)).toEqual([
      'Comirnaty · , Lote AB123',
      'vacuna antigripal estacional · , Lote FLU2026',
      'Sin nombre · , Lote X9',
    ]);
  });

  it('con 12 alertas se ven 5, y «Ver las 12 alertas» muestra 12 y mueve el foco a la sexta', async () => {
    mockBatchAlerts(batchAlertsFixture({ total: 12, alerts: alerts(12) }));
    const user = setupUser();
    renderBlock();

    const block = await findBlock();
    expect(await within(block).findAllByRole('article')).toHaveLength(5);

    const toggle = within(block).getByRole('button', { name: 'Ver las 12 alertas' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    const articles = within(block).getAllByRole('article');
    expect(articles).toHaveLength(12);
    expect(articles[5]).toHaveFocus();
    expect(within(block).getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(within(block).getByRole('button', { name: 'Ver menos' }));
    expect(within(block).getAllByRole('article')).toHaveLength(5);
  });

  it('con 5 alertas o menos no hay botón de desplegar', async () => {
    mockBatchAlerts(batchAlertsFixture({ total: 5, alerts: alerts(5) }));
    renderBlock();

    const block = await findBlock();
    expect(await within(block).findAllByRole('article')).toHaveLength(5);
    expect(within(block).queryByRole('button', { name: /^Ver las/ })).not.toBeInTheDocument();
  });

  it('con total 60 y 50 alertas se ve «Y 10 alertas más no mostradas»', async () => {
    mockBatchAlerts(batchAlertsFixture({ total: 60, alerts: alerts(50) }));
    renderBlock();

    expect(
      await within(await findBlock()).findByText('Y 10 alertas más no mostradas'),
    ).toBeInTheDocument();
  });

  it('con thresholds.minSerious null la línea dice «desactivado» en su lugar', async () => {
    mockBatchAlerts(batchAlertsFixture({ thresholds: { minCases: 3, minSerious: null } }));
    renderBlock();

    expect(
      await within(await findBlock()).findByText(
        'Umbrales: ≥ 3 casos · graves: desactivado · cualquier defunción',
      ),
    ).toBeInTheDocument();
  });

  it('sin alertas se ve el vacío con los umbrales', async () => {
    mockBatchAlerts(batchAlertsFixture({ total: 0, alerts: [] }));
    renderBlock();

    const block = await findBlock();
    expect(
      await within(block).findByText('Ningún lote supera los umbrales en este periodo.'),
    ).toBeInTheDocument();
    expect(within(block).getByText(/^Umbrales:/)).toBeInTheDocument();
    expect(within(block).queryByRole('article')).not.toBeInTheDocument();
  });

  it('un 500 muestra el error con «Reintentar»', async () => {
    server.use(
      http.get(`${API}/dashboard/batch-alerts`, () =>
        HttpResponse.json(
          { ok: false, message: 'Error', code: 'DASH_010_BATCH_ALERTS_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );
    renderBlock();

    const block = await findBlock();
    expect(await within(block).findByRole('alert')).toHaveTextContent(
      'No pudimos cargar las alertas por lote.',
    );
    expect(within(block).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('sin territorio el bloque no se dibuja', async () => {
    mockBatchAlerts(
      batchAlertsFixture({
        scope: { restricted: true, hasAssignments: false, geoLocationId: null },
        total: 0,
        alerts: [],
      }),
    );
    renderBlock();

    // Present while loading, gone once the response says there is no territory.
    await findBlock();
    await expect.poll(() => screen.queryByRole('region')).toBeNull();
  });
});

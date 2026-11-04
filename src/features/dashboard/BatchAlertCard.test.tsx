import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardBatchAlert } from '@/contracts/dashboard';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { setupUser } from '@/test/user';
import { BatchAlertCard } from './BatchAlertCard';
import { batchAlertFixture, batchAlertsFixture } from './batchAlertsFixture';

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

function mockCurrentUser(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

const { period } = batchAlertsFixture();

function renderCard(alert: DashboardBatchAlert, role: [string, number] = ['USER', 20]) {
  mockCurrentUser(...role);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TooltipProvider>
          <BatchAlertCard alert={alert} period={period} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

// `useCan` is false until ['user', 'me'] resolves, so an absence is only meaningful after it.
async function userResolved(queryClient: QueryClient) {
  await waitFor(() => {
    const queries = queryClient.getQueryCache().getAll();
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((query) => query.state.status === 'success')).toBe(true);
  });
}

describe('BatchAlertCard', () => {
  it('el título es la vacuna y el lote', () => {
    renderCard(batchAlertFixture());

    expect(screen.getByRole('article', { name: /Comirnaty.*Lote AB123/ })).toBeInTheDocument();
  });

  it('con reasons [MIN_CASES, DEATH] el primer badge es «Defunción»', () => {
    renderCard(batchAlertFixture({ reasons: ['MIN_CASES', 'DEATH'] }));

    const badges = within(screen.getAllByRole('list')[0]).getAllByRole('listitem');
    expect(badges.map((badge) => badge.textContent)).toEqual([
      'Defunción',
      'Casos sobre el umbral',
    ]);
    expect(within(badges[0]).getByText('Defunción')).toHaveAttribute('data-variant', 'destructive');
    expect(within(badges[1]).getByText('Casos sobre el umbral')).toHaveAttribute(
      'data-variant',
      'warning',
    );
  });

  it('muestra la línea de métricas', () => {
    renderCard(batchAlertFixture());

    expect(screen.getByText('5 casos')).toBeInTheDocument();
    expect(screen.getByText('4 sospechosos')).toBeInTheDocument();
    expect(screen.getByText('2 graves')).toBeInTheDocument();
    expect(screen.getByText('1 defunción')).toBeInTheDocument();
    expect(screen.getByText('3 establecimientos')).toBeInTheDocument();
    expect(screen.getByText('2 unidades geográficas')).toBeInTheDocument();
    expect(screen.getByText(/^Del .+ al .+$/)).toBeInTheDocument();
  });

  it('con expiredAtVaccination 2 se ve la marca', () => {
    renderCard(batchAlertFixture({ expiredAtVaccination: 2 }));
    expect(screen.getByText('2 vacunados con el lote caducado')).toBeInTheDocument();
  });

  it('con expiredAtVaccination 0 no hay marca de caducado', () => {
    renderCard(batchAlertFixture({ expiredAtVaccination: 0 }));
    expect(screen.queryByText(/con el lote caducado/)).not.toBeInTheDocument();
  });

  it('con una sola variante no hay marca', () => {
    renderCard(batchAlertFixture({ variants: ['AB123'] }));

    expect(screen.queryByText(/^Escrito de/)).not.toBeInTheDocument();
  });

  it('con varias variantes, el tooltip las muestra al recibir el foco', async () => {
    const user = setupUser();
    renderCard(batchAlertFixture());

    await user.tab();
    expect(screen.getByRole('button', { name: 'Escrito de 3 formas' })).toHaveFocus();

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('AB-123');
    expect(tooltip).toHaveTextContent('AB 123');
    expect(tooltip).toHaveTextContent('ab123');
  });

  it('coded: false lleva «Texto libre», y label: null se lee «Sin nombre»', () => {
    renderCard(batchAlertFixture({ coded: false, label: null }));

    expect(screen.getByText('Texto libre')).toBeInTheDocument();
    expect(screen.getByText('Sin nombre')).toBeInTheDocument();
  });

  it('con ANALYTICS no hay «Ver casos» ni ningún enlace', async () => {
    const queryClient = renderCard(batchAlertFixture(), ['ANALYTICS', 10]);

    await userResolved(queryClient);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('con USER, el href lleva exactamente lote, vacuna y periodo de la respuesta', async () => {
    renderCard(batchAlertFixture());

    const link = await screen.findByRole('link', { name: 'Ver casos' });
    const url = new URL(link.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/esavi-cases');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      batchNumber: 'AB123',
      vaccineKey: 'W:6f1c2a90-0d6e-4b1f-9a51-0c1e2b3a4d01',
      reportDateFrom: period.from,
      reportDateTo: period.to,
    });
  });

  it('un vaccineKey T: con espacios y símbolos va bien codificado', async () => {
    const vaccineKey = 'T:vacuna antigripal & co/2026?';
    renderCard(batchAlertFixture({ vaccineKey, coded: false }));

    const link = await screen.findByRole('link', { name: 'Ver casos' });
    const href = link.getAttribute('href') ?? '';
    expect(href).not.toContain(' ');
    expect(new URL(href, 'http://localhost').searchParams.get('vaccineKey')).toBe(vaccineKey);
  });
});

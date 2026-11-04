import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardIndicators } from '@/contracts/dashboard';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { setupUser } from '@/test/user';
import { IndicatorsBlock } from './IndicatorsBlock';
import { indicatorsFixture } from './indicatorsFixture';

const INDICATORS_URL = 'http://localhost:4500/api/dashboard/indicators';

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

function mockIndicators(data: DashboardIndicators) {
  server.use(http.get(INDICATORS_URL, () => HttpResponse.json({ ok: true, message: 'ok', data })));
}

function renderBlock() {
  // The hook owns `retry` (no 4xx retries); retryDelay 0 only keeps its 5xx retries instant here.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <IndicatorsBlock query={{}} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function zeroIndicators(): DashboardIndicators {
  const base = indicatorsFixture();
  const zero = { current: 0, previous: 0 };
  return indicatorsFixture({
    volume: { total: zero, byNotificationType: { SEVERE: zero, NON_SEVERE: zero, none: zero } },
    severity: {
      classified: zero,
      serious: zero,
      unclassified: zero,
      criteria: Object.fromEntries(
        Object.keys(base.severity.criteria).map((key) => [key, 0]),
      ) as DashboardIndicators['severity']['criteria'],
    },
    deaths: { total: zero, autopsyRequested: 0, autopsyPerformed: 0 },
    timeliness: { withEventDate: 0, withoutEventDate: 0, medianDays: null, onTime: 0, deadlineDays: 7 },
    closure: {
      closedCases: 0,
      medianDaysToClose: null,
      stageMedianDays: { CLASSIFICATION: null, NOTIFICATION: null, INVESTIGATION: null, FINAL_CLASSIFICATION: null },
    },
  });
}

describe('IndicatorsBlock — ESAVI-DASH-007', () => {
  it('muestra los 4 KPIs con su variación en el nombre accesible', async () => {
    mockIndicators(indicatorsFixture());
    renderBlock();

    expect(await screen.findByRole('group', { name: /^Casos del periodo: 42\. 40\s%\smás/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Defunciones: 1\. Nuevo$/ })).toBeInTheDocument();
    // 8/38 = 21,1 % against 5/27 = 18,5 %: compared in points, not as a percentage of a percentage.
    expect(screen.getByRole('group', { name: /^Graves sobre clasificados: 21,1\s%\.\s\+2,5\spp$/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Mediana de oportunidad: 3,5 días$/ })).toBeInTheDocument();
  });

  it('0 → 0 se lee «Sin cambios», y un periodo sin casos lo avisa con las tarjetas en 0', async () => {
    mockIndicators(zeroIndicators());
    renderBlock();

    expect(await screen.findByText('No hay casos reportados en este periodo.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Casos del periodo: 0\. Sin cambios$/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Gravedad' })).toBeInTheDocument();
  });

  it('una mediana null se lee «Sin casos»', async () => {
    mockIndicators(zeroIndicators());
    renderBlock();

    expect(await screen.findByRole('group', { name: /^Mediana de oportunidad: Sin casos$/ })).toBeInTheDocument();
    const closure = screen.getByRole('region', { name: 'Cierre' });
    expect(within(closure).getAllByText('Sin casos').length).toBeGreaterThan(0);
  });

  it('onTime null se lee «Plazo no configurado»', async () => {
    const base = indicatorsFixture();
    mockIndicators(indicatorsFixture({ timeliness: { ...base.timeliness, onTime: null, deadlineDays: null } }));
    renderBlock();

    expect(await screen.findByText('Plazo no configurado')).toBeInTheDocument();
  });

  it('sin clasificados, el % de graves dice «Sin casos clasificados» y nunca NaN ni 0 %', async () => {
    mockIndicators(zeroIndicators());
    renderBlock();

    const kpi = await screen.findByRole('group', { name: /^Graves sobre clasificados/ });
    expect(kpi).toHaveTextContent('Sin casos clasificados');
    expect(kpi).not.toHaveTextContent(/NaN|0 %/);
  });

  it('la tarjeta de cierre dice «casos cerrados en el periodo» y usa las etiquetas de etapa', async () => {
    mockIndicators(indicatorsFixture());
    renderBlock();

    const closure = await screen.findByRole('region', { name: 'Cierre' });
    expect(within(closure).getByText('12 casos cerrados en el periodo')).toBeInTheDocument();
    for (const stage of ['Clasificación inicial', 'Notificación', 'Investigación', 'Clasificación final']) {
      expect(within(closure).getByText(stage)).toBeInTheDocument();
    }
  });

  it('la causalidad separa «sin clasificación final» de «sin clasificar», con la nota de A', async () => {
    mockIndicators(indicatorsFixture());
    renderBlock();

    const causality = await screen.findByRole('region', { name: 'Causalidad' });
    expect(within(causality).getByText('Sin clasificar')).toBeInTheDocument();
    expect(within(causality).getByText('Sin clasificación final: 30')).toBeInTheDocument();
    expect(within(causality).getByText(/un caso puede contar en varias/)).toBeInTheDocument();
  });

  it('sin territorio asignado muestra el aviso en lugar de los indicadores', async () => {
    mockIndicators(indicatorsFixture({ scope: { restricted: true, hasAssignments: false, geoLocationId: null } }));
    renderBlock();

    expect(await screen.findByText(/No tienes territorio asignado/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Casos del periodo/ })).not.toBeInTheDocument();
  });

  it('un 500 muestra el error del bloque, y «Reintentar» vuelve a pedir', async () => {
    let failing = true;
    server.use(
      http.get(INDICATORS_URL, () => {
        return failing
          ? HttpResponse.json(
              { ok: false, message: 'Error', code: 'DASH_007_INDICATORS_FAILED', errors: [] },
              { status: 500 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: indicatorsFixture() });
      }),
    );
    const user = setupUser();
    renderBlock();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los indicadores.');
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('group', { name: /^Casos del periodo: 42/ })).toBeInTheDocument();
  });
});

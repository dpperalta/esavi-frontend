import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DistributionsSection } from './DistributionsSection';
import { distributionsFixture } from './distributionsFixture';

const DISTRIBUTIONS_URL = 'http://localhost:4500/api/dashboard/distributions';

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

function renderSection() {
  // The hook owns `retry` (no 4xx retries); retryDelay 0 only keeps its 5xx retries instant here.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DistributionsSection query={{ from: '2026-10-05', to: '2026-11-03' }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DistributionsSection — ESAVI-DASH-009', () => {
  it('hace una sola petición y reparte los datos a los tres bloques', async () => {
    let requests = 0;
    server.use(
      http.get(DISTRIBUTIONS_URL, () => {
        requests += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: distributionsFixture() });
      }),
    );

    renderSection();

    expect(await screen.findByRole('region', { name: 'Vacunas sospechosas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sexo y edad' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Fallos programáticos' })).toBeInTheDocument();
    expect(requests).toBe(1);
  });

  it('un 500 muestra un solo error con un solo «Reintentar», que vuelve a pedir y dibuja los bloques', async () => {
    let fail = true;
    server.use(
      http.get(DISTRIBUTIONS_URL, () =>
        fail
          ? HttpResponse.json(
              { ok: false, message: 'Error', code: 'DASH_009_DISTRIBUTIONS_FAILED', errors: [] },
              { status: 500 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: distributionsFixture() }),
      ),
    );
    const user = setupUser();

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar las distribuciones de vacunas, sexo y edad y fallos programáticos.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('region', { name: 'Vacunas sospechosas' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin territorio asignado no dibuja nada: el aviso es de la sección', async () => {
    let answered = false;
    server.use(
      http.get(DISTRIBUTIONS_URL, () => {
        answered = true;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: distributionsFixture({
            scope: { restricted: true, hasAssignments: false, geoLocationId: null },
          }),
        });
      }),
    );

    const { container } = renderSection();

    await vi.waitFor(() => expect(answered).toBe(true));
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

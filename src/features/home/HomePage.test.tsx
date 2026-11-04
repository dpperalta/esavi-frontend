import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// Interpolated i18n text ("Hola, {{name}}") is asserted here, unlike other tests that check
// the raw key — real i18next needs to be initialized for the interpolation to happen at all.
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { MemoryRouter } from 'react-router-dom';
import { pendingWorkFixture } from '@/features/dashboard/pendingWorkFixture';
import { HomePage } from './HomePage';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  tokenStore.setRefreshToken('a-refresh-token');
  setAccessToken('a-token');
});

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>,
  );
}

// The pending-work block renders `<Link>`s, so these tests need a router; the two original tests
// above finish before the block leaves its skeleton and keep their plain render.
function renderHomeWithRouter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockCurrentUser(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', displayName: 'Ana', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

describe('HomePage — bloque «Trabajo pendiente» (SPEC FE34)', () => {
  it('con ANALYTICS muestra solo el saludo y no pide /dashboard/pending-work', async () => {
    mockCurrentUser('ANALYTICS', 10);
    // No handler for pending-work: `onUnhandledRequest: 'error'` would fail the request if made.
    let pendingWorkRequested = false;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/dashboard/pending-work')) pendingWorkRequested = true;
    });

    renderHomeWithRouter();

    expect(await screen.findByText('Hola, Ana')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region', { name: 'Trabajo pendiente' })).not.toBeInTheDocument();
    expect(pendingWorkRequested).toBe(false);
    server.events.removeAllListeners();
  });

  it('con USER monta el bloque y pide /dashboard/pending-work', async () => {
    mockCurrentUser('USER', 20);
    let pendingWorkRequested = false;
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () => {
        pendingWorkRequested = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() });
      }),
    );

    renderHomeWithRouter();

    expect(await screen.findByRole('list', { name: 'Casos por estado' })).toBeInTheDocument();
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
    expect(pendingWorkRequested).toBe(true);
  });

  it('un 500 del bloque deja el saludo visible', async () => {
    mockCurrentUser('USER', 20);
    server.use(
      http.get('http://localhost:4500/api/dashboard/pending-work', () =>
        HttpResponse.json({ ok: false, message: 'Internal', code: 'DASH_006_FAILED' }, { status: 500 }),
      ),
    );

    renderHomeWithRouter();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el trabajo pendiente.');
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
  });
});

describe('HomePage', () => {
  it('muestra el displayName y el rol de ESAVI-USER-007, no el del login', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            userId: '1',
            // A propósito, distinto del nombre que traería una respuesta de login: si algo
            // en HomePage leyera esa fuente por error, este test lo delataría.
            displayName: 'Nombre de /users/me',
            roles: [
              { roleId: 'r1', name: 'USER', code: 'USER', level: 25 },
              { roleId: 'r2', name: 'ADMIN', code: 'ADMIN', level: 50 },
            ],
          },
        }),
      ),
    );

    renderHome();

    await waitFor(() => expect(screen.getByText('Hola, Nombre de /users/me')).toBeInTheDocument());
    // The role shown is the higher of the two (ADMIN), not the first in the list.
    expect(screen.getByText('Tu rol: ADMIN')).toBeInTheDocument();
  });

  it('muestra un estado de error con reintentar cuando la query falla', async () => {
    const user = setupUser();
    let callCount = 0;
    server.use(
      http.get('http://localhost:4500/api/users/me', () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { ok: false, message: 'Error', code: 'USER_007_NOT_FOUND' },
            { status: 404 },
          );
        }
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { userId: '1', displayName: 'Recuperado', roles: [] },
        });
      }),
    );

    renderHome();

    await waitFor(() =>
      expect(
        screen.getByText('Ocurrió un error inesperado. Inténtalo de nuevo.'),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(screen.getByText('Hola, Recuperado')).toBeInTheDocument());
  });
});

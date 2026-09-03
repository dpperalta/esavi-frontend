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

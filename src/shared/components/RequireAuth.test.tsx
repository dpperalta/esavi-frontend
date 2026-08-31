import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequireAuth } from './RequireAuth';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function renderWithRouter(initialPath = '/protected') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>Pantalla de login</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<div>Contenido protegido</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequireAuth', () => {
  it('redirige a /login sin refresh token guardado', () => {
    renderWithRouter();

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
  });

  it('muestra el contenido protegido con sesión válida', async () => {
    tokenStore.setRefreshToken('a-refresh-token');
    setAccessToken('a-token');
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { userId: '1', roles: [] } }),
      ),
    );

    renderWithRouter();

    await waitFor(() => expect(screen.getByText('Contenido protegido')).toBeInTheDocument());
  });

  it('redirige a /login si hay refresh token pero la sesión no se puede resolver', async () => {
    tokenStore.setRefreshToken('stale-refresh-token');
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json(
          { ok: false, message: 'Token expirado', code: 'AUTH_401_TOKEN_EXPIRED' },
          { status: 401 },
        ),
      ),
      http.post('http://localhost:4500/api/auth/refresh', () =>
        HttpResponse.json(
          { ok: false, message: 'Refresh inválido', code: 'AUTH_002_INVALID_REFRESH_TOKEN' },
          { status: 401 },
        ),
      ),
    );

    renderWithRouter();

    await waitFor(() => expect(screen.getByText('Pantalla de login')).toBeInTheDocument());
  });
});

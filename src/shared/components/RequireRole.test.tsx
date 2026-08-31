import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { RoleName } from '@/shared/config/roles';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';

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

// RequireRole assumes a session and nests inside RequireAuth (SPEC FE01 §3.1): by the time it
// mounts, ['user','me'] is already resolved in cache. A standalone RequireRole, without that
// parent, would redirect on the first render with the query still loading — not real usage.
function renderWithRole(level: number | RoleName) {
  tokenStore.setRefreshToken('a-refresh-token');
  setAccessToken('a-token');

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin-only']}>
        <Routes>
          <Route path="/" element={<div>Inicio</div>} />
          <Route element={<RequireAuth />}>
            <Route element={<RequireRole level={level} />}>
              <Route path="/admin-only" element={<div>Sólo admin</div>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequireRole', () => {
  it('muestra el contenido cuando el nivel efectivo alcanza el mínimo', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            userId: '1',
            roles: [{ roleId: 'r1', name: 'ADMIN', code: 'ADMIN', level: 50 }],
          },
        }),
      ),
    );

    renderWithRole('ADMIN');

    await waitFor(() => expect(screen.getByText('Sólo admin')).toBeInTheDocument());
  });

  it('redirige a / cuando el nivel efectivo no alcanza el mínimo', async () => {
    server.use(
      http.get('http://localhost:4500/api/users/me', () =>
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

    renderWithRole('ADMIN');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
  });
});

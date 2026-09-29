import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useShowInactive } from '@/shared/hooks/useShowInactive';
import { ShowInactiveSwitch } from './ShowInactiveSwitch';

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

function Probe() {
  const location = useLocation();
  const showInactive = useShowInactive();
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <output data-testid="show-inactive">{String(showInactive)}</output>
    </>
  );
}

function renderSwitch(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ShowInactiveSwitch />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ShowInactiveSwitch / useShowInactive — SPEC FE29', () => {
  it('con ADMIN aparece apagado, y encenderlo escribe includeInactive=true', async () => {
    mockCurrentUser('ADMIN', 50);
    renderSwitch('/esavi-cases/case-1/wizard/notification');

    const toggle = await screen.findByRole('switch', { name: 'Mostrar registros eliminados' });
    expect(toggle).not.toBeChecked();

    await setupUser().click(toggle);

    expect(screen.getByTestId('search')).toHaveTextContent('?includeInactive=true');
    expect(screen.getByTestId('show-inactive')).toHaveTextContent('true');
    expect(toggle).toBeChecked();
  });

  it('apagarlo borra el parámetro en lugar de escribir false, y conserva los demás', async () => {
    mockCurrentUser('ADMIN', 50);
    renderSwitch('/esavi-cases/case-1/wizard/notification?other=1&includeInactive=true');

    const toggle = await screen.findByRole('switch', { name: 'Mostrar registros eliminados' });
    expect(toggle).toBeChecked();

    await setupUser().click(toggle);

    expect(screen.getByTestId('search')).toHaveTextContent(/^\?other=1$/);
    expect(screen.getByTestId('show-inactive')).toHaveTextContent('false');
  });

  it('con USER no aparece, y useShowInactive es false aunque la URL traiga true', async () => {
    mockCurrentUser('USER', 25);
    renderSwitch('/esavi-cases/case-1/wizard/notification?includeInactive=true');

    await waitFor(() => expect(screen.getByTestId('show-inactive')).toHaveTextContent('false'));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

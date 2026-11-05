import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardRecentActivity } from '@/contracts/dashboard';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { setupUser } from '@/test/user';
import { ActivitySection } from './ActivitySection';
import { PendingWorkBlock } from './PendingWorkBlock';
import { pendingWorkFixture } from './pendingWorkFixture';
import { recentActivityFixture } from './recentActivityFixture';

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

const RECENT_ACTIVITY_URL = 'http://localhost:4500/api/dashboard/recent-activity';
const PENDING_WORK_URL = 'http://localhost:4500/api/dashboard/pending-work';

function mockRecentActivity(data: DashboardRecentActivity) {
  server.use(
    http.get(RECENT_ACTIVITY_URL, () => HttpResponse.json({ ok: true, message: 'ok', data })),
  );
}

function renderSection(withPendingWork = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter>
          {withPendingWork && <PendingWorkBlock roleName="USER" />}
          <ActivitySection />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('ActivitySection — contenido', () => {
  it('muestra las dos listas, la hora de actualización y el pie con windowDays', async () => {
    mockRecentActivity(recentActivityFixture());

    renderSection();

    expect(await screen.findByRole('list', { name: 'Mis casos' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Actividad del territorio' })).toBeInTheDocument();
    expect(screen.getByText(/^Actualizado a las \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText('Últimos 30 días')).toBeInTheDocument();
  });

  it('con hasAssignments false muestra el aviso de sin territorio y ninguna lista', async () => {
    mockRecentActivity(
      recentActivityFixture({
        scope: { restricted: true, hasAssignments: false },
        territory: [],
        myCases: [],
      }),
    );

    renderSection();

    expect(await screen.findByText(/No tienes territorio asignado/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Mis casos')).not.toBeInTheDocument();
  });

  it('con las dos listas vacías muestra cada texto de vacío con windowDays', async () => {
    mockRecentActivity(recentActivityFixture({ windowDays: 14, territory: [], myCases: [] }));

    renderSection();

    expect(
      await screen.findByText('No has intervenido en ningún caso en los últimos 14 días.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No hay actividad en tu territorio en los últimos 14 días.'),
    ).toBeInTheDocument();
  });
});

describe('ActivitySection — frescura', () => {
  it('«Actualizar» vuelve a pedir y se deshabilita mientras dura', async () => {
    let requests = 0;
    let release: () => void = () => {};
    server.use(
      http.get(RECENT_ACTIVITY_URL, async () => {
        requests += 1;
        if (requests > 1) await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json({ ok: true, message: 'ok', data: recentActivityFixture() });
      }),
    );
    const user = setupUser();

    renderSection();

    const refresh = await screen.findByRole('button', { name: 'Actualizar' });
    await user.click(refresh);

    await waitFor(() => expect(refresh).toBeDisabled());
    expect(screen.getByRole('region', { name: 'Actividad' })).toHaveAttribute('aria-busy', 'true');
    release();
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(requests).toBe(2);
  });
});

describe('ActivitySection — errores', () => {
  it('un 500 muestra un solo error con «Reintentar» y deja visible «Trabajo pendiente»', async () => {
    let requests = 0;
    server.use(
      http.get(PENDING_WORK_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() }),
      ),
      http.get(RECENT_ACTIVITY_URL, () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json(
              { ok: false, message: 'Internal', code: 'DASH_011_FAILED', errors: 'stack trace' },
              { status: 500 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: recentActivityFixture() });
      }),
    );
    const user = setupUser();

    renderSection(true);

    const activity = screen.getByRole('region', { name: 'Actividad' });
    expect(await within(activity).findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la actividad reciente.',
    );
    expect(within(activity).getAllByRole('alert')).toHaveLength(1);
    expect(within(activity).getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    expect(screen.queryByText('stack trace')).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Casos por estado' })).toBeInTheDocument();

    await user.click(within(activity).getByRole('button', { name: 'Reintentar' }));

    expect(await within(activity).findByRole('list', { name: 'Mis casos' })).toBeInTheDocument();
  });

  it('un 403 AUTH_ROLE_FORBIDDEN se maneja igual, sin pantalla en blanco', async () => {
    server.use(
      http.get(RECENT_ACTIVITY_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'Forbidden', code: 'AUTH_ROLE_FORBIDDEN' },
          { status: 403 },
        ),
      ),
    );

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la actividad reciente.',
    );
    expect(screen.getByRole('heading', { name: 'Actividad' })).toBeInTheDocument();
  });

  it('un error de red usa errors.network', async () => {
    server.use(http.get(RECENT_ACTIVITY_URL, () => HttpResponse.error()));

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor. Comprueba tu conexión.',
    );
  });
});

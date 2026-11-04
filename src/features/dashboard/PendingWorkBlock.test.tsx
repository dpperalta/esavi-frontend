import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardPendingWork } from '@/contracts/dashboard';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { PendingWorkBlock } from './PendingWorkBlock';
import { pendingWorkFixture } from './pendingWorkFixture';

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

const PENDING_WORK_URL = 'http://localhost:4500/api/dashboard/pending-work';

function mockPendingWork(data: DashboardPendingWork) {
  server.use(http.get(PENDING_WORK_URL, () => HttpResponse.json({ ok: true, message: 'ok', data })));
}

function renderBlock(roleName: string | null = 'USER') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PendingWorkBlock roleName={roleName} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PendingWorkBlock — datos', () => {
  it('muestra la cabecera con abiertos, reabiertos y la hora de generatedAt', async () => {
    mockPendingWork(pendingWorkFixture());

    renderBlock();

    expect(await screen.findByText(/21 casos abiertos · 2 reabiertos · Actualizado a las \d{2}:\d{2}/)).toBeInTheDocument();
  });

  it('las 8 tarjetas del embudo, incluida la de 0, enlazan a ?statusCode=', async () => {
    mockPendingWork(pendingWorkFixture());

    renderBlock();

    const funnel = await screen.findByRole('list', { name: 'Casos por estado' });
    const cards = within(funnel).getAllByRole('link');
    expect(cards).toHaveLength(8);
    expect(within(funnel).getByRole('link', { name: 'Abierto: 0 casos' })).toHaveAttribute(
      'href',
      '/esavi-cases?statusCode=OPEN',
    );
    expect(within(funnel).getByRole('link', { name: 'En notificación: 2 casos' })).toBeInTheDocument();
    expect(cards.at(-1)).toHaveAccessibleName('Cerrado: 6 casos');
  });

  it('un statusCode desconocido muestra su statusName', async () => {
    const fixture = pendingWorkFixture();
    fixture.funnel[0] = { statusCode: 'ARCHIVED', statusName: 'Archivado', sortOrder: 1, count: 4 };
    mockPendingWork(fixture);

    renderBlock();

    expect(await screen.findByRole('link', { name: 'Archivado: 4 casos' })).toBeInTheDocument();
  });

  it('cada caseCode lleva al wizard del caso, con su estado, etapa y días', async () => {
    mockPendingWork(pendingWorkFixture());

    renderBlock();

    const stalled = await screen.findByRole('list', { name: 'Casos detenidos' });
    expect(within(stalled).getByRole('link', { name: 'ESAVI-0007' })).toHaveAttribute(
      'href',
      '/esavi-cases/case-stalled/wizard',
    );
    expect(within(stalled).getByText('En notificación · Notificación')).toBeInTheDocument();
    expect(within(stalled).getByText('15 días')).toBeInTheDocument();

    const pending = screen.getByRole('list', { name: 'Investigaciones sin iniciar' });
    expect(within(pending).getByRole('link', { name: 'ESAVI-0009' })).toHaveAttribute(
      'href',
      '/esavi-cases/case-pending/wizard',
    );
    expect(within(pending).getByText('5 días esperando')).toBeInTheDocument();
  });

  it('con total 14 e items de 10 aparece «y 4 más», sin enlace', async () => {
    const base = pendingWorkFixture();
    const items = Array.from({ length: 10 }, (_, index) => ({
      ...base.stalled.items[0],
      caseId: `case-${index}`,
      caseCode: `ESAVI-${index}`,
    }));
    mockPendingWork({ ...base, stalled: { staleDays: 7, total: 14, items } });

    renderBlock();

    const more = await screen.findByText('y 4 más');
    expect(more.closest('a')).toBeNull();
  });

  it('listas vacías muestran sus textos propios', async () => {
    mockPendingWork(
      pendingWorkFixture({
        stalled: { staleDays: 7, total: 0, items: [] },
        pendingInvestigations: { total: 0, items: [] },
      }),
    );

    renderBlock();

    expect(await screen.findByText('Ningún caso lleva más de 7 días detenido.')).toBeInTheDocument();
    expect(screen.getByText('No hay investigaciones solicitadas sin iniciar.')).toBeInTheDocument();
  });

  it('con staleDays = 0 muestra «detección desactivada», no la lista vacía', async () => {
    mockPendingWork(pendingWorkFixture({ stalled: { staleDays: 0, total: 0, items: [] } }));

    renderBlock();

    expect(await screen.findByText('La detección de casos detenidos está desactivada.')).toBeInTheDocument();
    expect(screen.queryByText(/Ningún caso lleva más de/)).not.toBeInTheDocument();
  });

  it('con hasAssignments = false muestra el aviso en lugar del embudo y las listas', async () => {
    mockPendingWork(pendingWorkFixture({ scope: { restricted: true, hasAssignments: false } }));

    renderBlock();

    expect(await screen.findByText(/No tienes territorio asignado/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Casos por estado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Casos detenidos' })).not.toBeInTheDocument();
  });
});

describe('PendingWorkBlock — orden por rol', () => {
  function listHeadings() {
    return screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
  }

  it('con INVESTIGATOR la lista de investigaciones pendientes va primero', async () => {
    mockPendingWork(pendingWorkFixture());

    renderBlock('INVESTIGATOR');

    await screen.findByRole('list', { name: 'Casos detenidos' });
    expect(listHeadings()).toEqual(['Casos por estado', 'Investigaciones sin iniciar', 'Casos detenidos']);
  });

  it('con USER se mantiene el orden por defecto', async () => {
    mockPendingWork(pendingWorkFixture());

    renderBlock('USER');

    await screen.findByRole('list', { name: 'Casos detenidos' });
    expect(listHeadings()).toEqual(['Casos por estado', 'Casos detenidos', 'Investigaciones sin iniciar']);
  });
});

describe('PendingWorkBlock — frescura', () => {
  it('«Actualizar» vuelve a pedir y se deshabilita mientras dura', async () => {
    let requests = 0;
    let release: () => void = () => {};
    server.use(
      http.get(PENDING_WORK_URL, async () => {
        requests += 1;
        if (requests > 1) await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() });
      }),
    );
    const user = setupUser();

    renderBlock();

    const refresh = await screen.findByRole('button', { name: 'Actualizar' });
    await user.click(refresh);

    await waitFor(() => expect(refresh).toBeDisabled());
    expect(screen.getByRole('region', { name: 'Trabajo pendiente' })).toHaveAttribute('aria-busy', 'true');
    release();
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(requests).toBe(2);
  });
});

describe('PendingWorkBlock — errores', () => {
  it('un 500 muestra el error del bloque con «Reintentar», que vuelve a pedir', async () => {
    let requests = 0;
    server.use(
      http.get(PENDING_WORK_URL, () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json(
              { ok: false, message: 'Internal', code: 'DASH_006_FAILED', errors: 'stack trace' },
              { status: 500 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: pendingWorkFixture() });
      }),
    );
    const user = setupUser();

    renderBlock();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el trabajo pendiente.');
    expect(screen.queryByText('stack trace')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trabajo pendiente' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('list', { name: 'Casos por estado' })).toBeInTheDocument();
  });

  it('un 403 AUTH_ROLE_FORBIDDEN se maneja igual', async () => {
    server.use(
      http.get(PENDING_WORK_URL, () =>
        HttpResponse.json({ ok: false, message: 'Forbidden', code: 'AUTH_ROLE_FORBIDDEN' }, { status: 403 }),
      ),
    );

    renderBlock();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el trabajo pendiente.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('un error sin code no rompe el bloque', async () => {
    server.use(http.get(PENDING_WORK_URL, () => HttpResponse.json({ ok: false }, { status: 500 })));

    renderBlock();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el trabajo pendiente.');
  });
});

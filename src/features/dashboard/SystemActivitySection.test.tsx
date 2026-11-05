import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardSystemActivity } from '@/contracts/dashboard';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { SystemActivitySection } from './SystemActivitySection';
import { systemActivityFixture } from './systemActivityFixture';

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

const SYSTEM_ACTIVITY_URL = 'http://localhost:4500/api/dashboard/system-activity';
const REVOCATIONS = 'Revocaciones de sesión en 7 días';

function mockSystemActivity(data: DashboardSystemActivity) {
  server.use(
    http.get(SYSTEM_ACTIVITY_URL, () => HttpResponse.json({ ok: true, message: 'ok', data })),
  );
}

function withReuse(count: number): DashboardSystemActivity {
  const base = systemActivityFixture();
  return {
    ...base,
    revocations7d: base.revocations7d.map((row) =>
      row.reason === 'REUSE_DETECTED' ? { ...row, count } : row,
    ),
  };
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SystemActivitySection />
    </QueryClientProvider>,
  );
}

describe('SystemActivitySection — contenido', () => {
  it('muestra los 5 contadores con sus valores', async () => {
    mockSystemActivity(systemActivityFixture());

    renderSection();

    const counters: [string, string][] = [
      ['Sesiones activas', '12'],
      ['Usuarios activos en 24 h', '8'],
      ['Usuarios activos en 7 días', '19'],
      ['Sesiones iniciadas en 24 h', '15'],
      ['Sesiones iniciadas en 7 días', '64'],
    ];
    for (const [label, value] of counters) {
      const term = await screen.findByText(label);
      expect(term.nextElementSibling).toHaveTextContent(value);
    }
  });

  it('muestra los 6 motivos en el orden recibido, con su conteo en texto', async () => {
    mockSystemActivity(systemActivityFixture());

    renderSection();

    const items = within(await screen.findByRole('list', { name: REVOCATIONS })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual([
      'Cierre de sesión9',
      'Cierre de todas las sesiones1',
      'Reutilización de token detectada0',
      'Cambio de contraseña2',
      'Restablecimiento de contraseña0',
      'Duración máxima alcanzada3',
    ]);
  });

  it('un motivo desconocido se lee «Otro»', async () => {
    const base = systemActivityFixture();
    mockSystemActivity({
      ...base,
      revocations7d: [...base.revocations7d, { reason: 'FOO', count: 4 }],
    });

    renderSection();

    const items = within(await screen.findByRole('list', { name: REVOCATIONS })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(7);
    expect(items[6]).toHaveTextContent('Otro4');
  });

  it('con todas las revocaciones en 0 mantiene las 6 barras y dice «Sin revocaciones en 7 días»', async () => {
    const base = systemActivityFixture();
    mockSystemActivity({
      ...base,
      revocations7d: base.revocations7d.map((row) => ({ ...row, count: 0 })),
    });

    renderSection();

    expect(await screen.findByText('Sin revocaciones en 7 días.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: REVOCATIONS })).getAllByRole('listitem'),
    ).toHaveLength(6);
  });

  it('la hora de la cabecera sale de generatedAt', async () => {
    mockSystemActivity(systemActivityFixture({ generatedAt: '2026-11-04T09:07:00.000Z' }));

    renderSection();

    const expected = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(
      new Date('2026-11-04T09:07:00.000Z'),
    );
    expect(await screen.findByText(`Actualizado a las ${expected}`)).toBeInTheDocument();
  });
});

describe('SystemActivitySection — aviso de reutilización', () => {
  it('con REUSE_DETECTED 2 muestra el aviso con el número', async () => {
    mockSystemActivity(withReuse(2));

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '2 reutilizaciones de token detectadas en 7 días: posible robo de sesión.',
    );
  });

  it('con REUSE_DETECTED 0 no hay aviso', async () => {
    mockSystemActivity(withReuse(0));

    renderSection();

    await screen.findByRole('list', { name: REVOCATIONS });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un refetch con el mismo count no vuelve a montar el aviso, así que no se anuncia otra vez', async () => {
    let requests = 0;
    server.use(
      http.get(SYSTEM_ACTIVITY_URL, () => {
        requests += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: withReuse(2) });
      }),
    );
    const user = setupUser();

    renderSection();

    const alert = await screen.findByRole('alert');
    const refresh = screen.getByRole('button', { name: 'Actualizar' });
    await user.click(refresh);
    await waitFor(() => expect(requests).toBe(2));
    await waitFor(() => expect(refresh).toBeEnabled());

    expect(screen.getByRole('alert')).toBe(alert);
    expect(alert).toHaveTextContent('2 reutilizaciones');
  });
});

describe('SystemActivitySection — errores', () => {
  it('un 500 muestra el error con «Reintentar», que vuelve a pedir', async () => {
    let requests = 0;
    server.use(
      http.get(SYSTEM_ACTIVITY_URL, () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json(
              { ok: false, message: 'Internal', code: 'DASH_012_FAILED', errors: 'stack trace' },
              { status: 500 },
            )
          : HttpResponse.json({ ok: true, message: 'ok', data: systemActivityFixture() });
      }),
    );
    const user = setupUser();

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la actividad del sistema.',
    );
    expect(screen.queryByText('stack trace')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('list', { name: REVOCATIONS })).toBeInTheDocument();
  });

  it('un 403 AUTH_ROLE_FORBIDDEN se maneja igual, sin pantalla en blanco', async () => {
    server.use(
      http.get(SYSTEM_ACTIVITY_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'Forbidden', code: 'AUTH_ROLE_FORBIDDEN' },
          { status: 403 },
        ),
      ),
    );

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar la actividad del sistema.',
    );
    expect(screen.getByRole('heading', { name: 'Sistema' })).toBeInTheDocument();
  });
});

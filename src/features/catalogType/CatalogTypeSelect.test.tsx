import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CatalogTypeSelect } from './CatalogTypeSelect';

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

function signInAs(roleName: string, level: number) {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
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

function Harness() {
  const [value, setValue] = useState('');
  return (
    <CatalogTypeSelect value={value} onValueChange={setValue} onClear={() => setValue('')} />
  );
}

function renderSelect() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('CatalogTypeSelect', () => {
  it('pinta el aviso de "demasiados tipos" cuando count > 100', async () => {
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 150, rows: [] } }),
      ),
    );

    renderSelect();

    expect(
      await screen.findByText(/Hay más de 100 tipos de catálogo/i),
    ).toBeInTheDocument();
  });

  it('no pinta el aviso cuando count <= 100', async () => {
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                catalogTypeId: 'ct-1',
                code: 'OUTCOME',
                name: 'Desenlace',
                description: null,
                sortOrder: 1,
                isActive: true,
                deletedAt: null,
                appDetails: [],
              },
            ],
          },
        }),
      ),
    );

    renderSelect();

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());
    expect(screen.queryByText(/Hay más de 100 tipos de catálogo/i)).not.toBeInTheDocument();
  });

  it('marca con el distintivo destructive la opción de un tipo inactivo', async () => {
    signInAs('SUPERADMIN', 100);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                catalogTypeId: 'ct-2',
                code: 'RETIRED',
                name: 'Retirado',
                description: null,
                sortOrder: 1,
                isActive: false,
                deletedAt: '2026-01-01T00:00:00.000Z',
                appDetails: [],
              },
            ],
          },
        }),
      ),
    );

    const user = userEvent.setup();
    renderSelect();

    const trigger = await screen.findByRole('combobox');
    await user.click(trigger);

    const option = await screen.findByRole('option', { name: /Retirado/i });
    expect(option).toHaveTextContent('Inactivo');
  });

  it('la «×» limpia el tipo elegido (SPEC FE05)', async () => {
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                catalogTypeId: 'ct-1',
                code: 'OUTCOME',
                name: 'Desenlace',
                description: null,
                sortOrder: 1,
                isActive: true,
                deletedAt: null,
                appDetails: [],
              },
            ],
          },
        }),
      ),
    );

    const user = userEvent.setup();
    renderSelect();

    const trigger = await screen.findByRole('combobox');
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Desenlace' }));

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Desenlace'));

    await user.click(screen.getByRole('button', { name: 'Limpiar selección' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox')).not.toHaveTextContent('Desenlace'),
    );
  });

  it('con nivel USER el combo no falla aunque el backend no devuelva inactivos', async () => {
    signInAs('USER', 25);
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                catalogTypeId: 'ct-1',
                code: 'OUTCOME',
                name: 'Desenlace',
                description: null,
                sortOrder: 1,
                isActive: true,
                deletedAt: null,
                appDetails: [],
              },
            ],
          },
        }),
      ),
    );

    renderSelect();

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByText(/common.errors.unexpected/i)).not.toBeInTheDocument();
  });
});

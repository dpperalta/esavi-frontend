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
import { CatalogSelect } from './CatalogSelect';

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
    <CatalogSelect
      typeCode="healthFacilityType"
      value={value}
      onValueChange={setValue}
      onClear={() => setValue('')}
    />
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

const catalogTypesPage = {
  ok: true,
  message: 'ok',
  data: {
    count: 1,
    rows: [
      {
        catalogTypeId: 'ct-hfac',
        code: 'healthFacilityType',
        name: 'Tipo de unidad de salud',
        description: null,
        sortOrder: 1,
        isActive: true,
        deletedAt: null,
        appDetails: [],
      },
    ],
  },
};

describe('CatalogSelect', () => {
  it('con typeCode="healthFacilityType" pide primero catalog-types y después catalog-items/type/<id>, en ese orden', async () => {
    signInAs('USER', 25);
    const requests: string[] = [];
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () => {
        requests.push('catalog-types');
        return HttpResponse.json(catalogTypesPage);
      }),
      http.get('http://localhost:4500/api/catalog-items/type/ct-hfac', () => {
        requests.push('catalog-items/type/ct-hfac');
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                catalogItemId: 'ci-1',
                catalogTypeId: 'ct-hfac',
                code: 'HEALTH_CENTER',
                name: 'Centro de salud',
                value: null,
                isValueLocked: false,
                description: null,
                sortOrder: 1,
                metadata: null,
                isActive: true,
                deletedAt: null,
                appDetails: [],
              },
            ],
          },
        });
      }),
    );

    const user = userEvent.setup();
    renderSelect();

    const trigger = await screen.findByRole('combobox');
    await waitFor(() => expect(requests).toEqual(['catalog-types', 'catalog-items/type/ct-hfac']));

    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Centro de salud' });
    expect(option).toBeInTheDocument();
    // The name is shown, never the code.
    expect(screen.queryByText('HEALTH_CENTER')).not.toBeInTheDocument();
  });

  it('si ningún catalogType tiene ese code, el combo queda deshabilitado y no pide catalog-items', async () => {
    signInAs('USER', 25);
    let itemsRequested = false;
    server.use(
      http.get('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.get('http://localhost:4500/api/catalog-items/type/:id', () => {
        itemsRequested = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderSelect();

    const trigger = await screen.findByRole('combobox');
    expect(trigger).toBeDisabled();
    expect(screen.getByText('El tipo de catálogo requerido no existe.')).toBeInTheDocument();
    expect(itemsRequested).toBe(false);
  });
});

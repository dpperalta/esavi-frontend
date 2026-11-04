import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DashboardGeoFilter } from './DashboardGeoFilter';

const API = 'http://localhost:4500/api';
const USER_ID = '7a0d4e2c-1b3f-4a5e-8c9d-0e1f2a3b4c5d';
const PROVINCE = '3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40';
const CANTON = '5b2e4d6f-8a1c-4e3b-9d7f-1a2b3c4d5e6f';

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
    http.get(`${API}/users/me`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: USER_ID,
          displayName: 'Ana',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
      }),
    ),
  );
}

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderFilter(search: string, value?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/${search}`]}>
        <DashboardGeoFilter value={value} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardGeoFilter', () => {
  it('ANALYTICS ve «Todo su territorio» sin pedir /coverage ni /geo-locations', async () => {
    // onUnhandledRequest: 'error' makes any request to either route fail the test.
    mockCurrentUser('ANALYTICS', 10);

    renderFilter('?range=30d');

    expect(await screen.findByText('Todo su territorio')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('ANALYTICS con geoLocationId ve «Unidad seleccionada», y «Ver todo mi territorio» quita solo ese parámetro', async () => {
    mockCurrentUser('ANALYTICS', 10);
    const user = setupUser();

    renderFilter(`?range=7d&geoLocationId=${PROVINCE}`, PROVINCE);

    expect(await screen.findByText('Unidad seleccionada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver todo mi territorio' }));

    expect(screen.getByTestId('search')).toHaveTextContent(/^\?range=7d$/);
  });

  it('INVESTIGATOR lista las unidades de coverage, con «Toda mi cobertura» primero', async () => {
    mockCurrentUser('INVESTIGATOR', 30);
    server.use(
      http.get(`${API}/user-geo-locations/user/${USER_ID}/coverage`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            assigned: [{ geoLocationId: PROVINCE, name: 'Pichincha', level: 1 }],
            coverage: [
              { geoLocationId: PROVINCE, name: 'Pichincha', level: 1, parentGeoLocationId: null },
              { geoLocationId: CANTON, name: 'Quito', level: 2, parentGeoLocationId: PROVINCE },
            ],
            count: 2,
          },
        }),
      ),
    );
    const user = setupUser();

    renderFilter('?range=90d');

    const trigger = await screen.findByRole('combobox', { name: 'Territorio' });
    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Toda mi cobertura',
      'Pichincha',
      'Quito',
    ]);

    await user.click(within(listbox).getByRole('option', { name: 'Quito' }));
    expect(screen.getByTestId('search')).toHaveTextContent(`?range=90d&geoLocationId=${CANTON}`);
  });

  it('ADMIN monta <GeoLocationPicker> sobre el árbol', async () => {
    mockCurrentUser('ADMIN', 50);
    let treeRequested = false;
    server.use(
      http.get(`${API}/geo-level-types`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [{ geoLevelTypeId: 'lvl-country', name: 'País', code: 'COUNTRY', sortOrder: 1, isActive: true }],
          },
        }),
      ),
      http.get(`${API}/geo-locations`, () => {
        treeRequested = true;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 1,
            rows: [
              {
                geoLocationId: PROVINCE,
                name: 'Ecuador',
                code: 'EC',
                geoLevelTypeId: 'lvl-country',
                parentGeoLocationId: null,
                isActive: true,
              },
            ],
          },
        });
      }),
    );

    renderFilter('');

    expect(await screen.findByRole('group', { name: 'Territorio' })).toBeInTheDocument();
    await waitFor(() => expect(treeRequested).toBe(true));
    expect(await screen.findByRole('combobox', { name: /País/ })).toBeInTheDocument();
  });
});

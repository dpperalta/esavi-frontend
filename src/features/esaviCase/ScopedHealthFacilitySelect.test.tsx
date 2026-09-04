import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { ScopedHealthFacilitySelect } from './ScopedHealthFacilitySelect';

const server = setupServer();

const USER_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROVINCE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CANTON_IN_COVERAGE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CANTON_OUT_OF_COVERAGE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const HFAC_IN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const HFAC_OUT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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
        data: { userId: USER_1, roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

// `assigned` only has the province — `CANTON_IN_COVERAGE` reaches the response only through the
// recursive `coverage` expansion, never through `assigned` (SPEC FE10 §3.3).
function mockCoverage() {
  server.use(
    http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_1}/coverage`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          assigned: [{ geoLocationId: PROVINCE, name: 'Pichincha', level: 1 }],
          coverage: [
            { geoLocationId: PROVINCE, name: 'Pichincha', level: 1, parentGeoLocationId: null },
            { geoLocationId: CANTON_IN_COVERAGE, name: 'Rumiñahui', level: 2, parentGeoLocationId: PROVINCE },
          ],
          count: 2,
        },
      }),
    ),
  );
}

function mockEmptyCoverage() {
  server.use(
    http.get(`http://localhost:4500/api/user-geo-locations/user/${USER_1}/coverage`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { assigned: [], coverage: [], count: 0 } }),
    ),
  );
}

function mockSearchResults() {
  server.use(
    http.get('http://localhost:4500/api/health-facilities/search', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            {
              healthFacilityId: HFAC_IN,
              name: 'Centro de salud Rumiñahui',
              geoLocationId: CANTON_IN_COVERAGE,
              geoLocation: { geoLocationId: CANTON_IN_COVERAGE, name: 'Rumiñahui' },
              facilityTypeItemId: null,
              facilityType: null,
              parentHealthFacilityId: null,
              localCode: null,
              officialName: null,
              shortName: null,
              address: null,
              latitude: null,
              longitude: null,
              phone: null,
              email: null,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
            {
              healthFacilityId: HFAC_OUT,
              name: 'Centro de salud Otro Cantón',
              geoLocationId: CANTON_OUT_OF_COVERAGE,
              geoLocation: { geoLocationId: CANTON_OUT_OF_COVERAGE, name: 'Otro Cantón' },
              facilityTypeItemId: null,
              facilityType: null,
              parentHealthFacilityId: null,
              localCode: null,
              officialName: null,
              shortName: null,
              address: null,
              latitude: null,
              longitude: null,
              phone: null,
              email: null,
              isActive: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: null,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
  );
}

function renderSelect() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ScopedHealthFacilitySelect value={null} onChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

// Each test carries an explicit 60s timeout: typing into this Popover+Command combobox is
// noticeably heavier than a plain `<input>` (same "yield intermittently stalls" cost `src/test/
// user.ts` already documents for `delay: null`, just larger here, and worse still under the full
// suite's worker contention) — real, not fake, and bounded well inside 60s on every observed run.
describe('ScopedHealthFacilitySelect — filtro por cobertura (SPEC FE10 §1C, §5)', () => {
  it('con USER, una unidad fuera de cobertura aparece deshabilitada y con su razón, no oculta', async () => {
    const user = setupUser();
    signInAs('USER', 25);
    mockCoverage();
    mockSearchResults();

    renderSelect();

    await user.type(screen.getByRole('combobox', { name: 'Unidad de salud' }), 'Centro');

    const inOption = await screen.findByRole('option', { name: /Centro de salud Rumiñahui/ });
    expect(inOption).toHaveAttribute('aria-disabled', 'false');

    const outOption = await screen.findByRole('option', { name: /Centro de salud Otro Cantón/ });
    expect(outOption).toHaveAttribute('aria-disabled', 'true');
    expect(outOption).toHaveTextContent('Fuera de tu cobertura geográfica');
  }, 60000);

  it('el cruce es contra coverage, no contra assigned: un cantón sólo en coverage sigue elegible', async () => {
    const user = setupUser();
    signInAs('USER', 25);
    mockCoverage();
    mockSearchResults();

    renderSelect();

    await user.type(screen.getByRole('combobox', { name: 'Unidad de salud' }), 'Centro');

    const inOption = await screen.findByRole('option', { name: /Centro de salud Rumiñahui/ });
    expect(inOption).toHaveAttribute('aria-disabled', 'false');
    expect(inOption).not.toHaveTextContent('Fuera de tu cobertura geográfica');
  }, 60000);

  it('con ADMIN sin filas de cobertura, todas las unidades siguen elegibles', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    mockEmptyCoverage();
    mockSearchResults();

    renderSelect();

    await user.type(screen.getByRole('combobox', { name: 'Unidad de salud' }), 'Centro');

    const inOption = await screen.findByRole('option', { name: /Centro de salud Rumiñahui/ });
    const outOption = await screen.findByRole('option', { name: /Centro de salud Otro Cantón/ });
    expect(inOption).toHaveAttribute('aria-disabled', 'false');
    expect(outOption).toHaveAttribute('aria-disabled', 'false');
  }, 60000);
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useVaccineWhodrugDetail } from '@/shared/hooks/useVaccineWhodrugTree';
import { vaccineWhodrugResource } from './api';

const server = setupServer();
const BASE_URL = 'http://localhost:4500/api/whodrug-vaccines';
const VACCINE_ID = 'b3f1c2d4-0000-4000-8000-000000000001';

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

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

function buildVaccine(overrides: Partial<VaccineWhodrugDetail> = {}): VaccineWhodrugDetail {
  return {
    vaccineWhodrugId: VACCINE_ID,
    externalId: 1001,
    drugCode: '000001 01 001',
    drugRecNo: '000001',
    drugRecNoSeq: '01',
    drugName: 'BCG Vaccine',
    language: 'es',
    medicinalProductId: null,
    atcs: 'J07AN01',
    icd11: null,
    icd11Term: null,
    abbreviation: 'BCG',
    ingredient: null,
    ingredientTranslation: 'Mycobacterium bovis',
    languageCode: null,
    iso3Code: 'ECU',
    countryMedicinalProductId: null,
    maHolders: 'Serum Institute',
    maHoldersMedicinalProductId: null,
    form: null,
    formTranslations: 'Polvo',
    formMedicinalProductId: null,
    strength: '0.05 mg',
    strengthMedicinalProductId: null,
    noDose: null,
    diluent: null,
    isGeneric: null,
    isPreferred: true,
    notes: null,
    metadata: {},
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

const emptyList = { ok: true, message: 'ok', data: { count: 0, rows: [] } };

describe('vaccineWhodrugResource — ESAVI-WHODRUG-002A/002B', () => {
  it('sin includeInactive pega al 002A con name, code y los filtros; nunca search ni language', async () => {
    mockCurrentUser('USER', 25);
    let receivedUrl: URL | null = null;
    server.use(
      http.get(BASE_URL, ({ request }) => {
        receivedUrl = new URL(request.url);
        return HttpResponse.json(emptyList);
      }),
    );

    const { Wrapper } = createWrapper();
    renderHook(
      () =>
        vaccineWhodrugResource.useList({
          page: 2,
          pageSize: 10,
          filters: { name: 'bcg', code: 'bcg', iso3Code: 'ECU', isPreferred: 'true' },
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(receivedUrl).not.toBeNull());
    expect(receivedUrl!.searchParams.get('name')).toBe('bcg');
    expect(receivedUrl!.searchParams.get('code')).toBe('bcg');
    expect(receivedUrl!.searchParams.get('iso3Code')).toBe('ECU');
    expect(receivedUrl!.searchParams.get('isPreferred')).toBe('true');
    expect(receivedUrl!.searchParams.get('offset')).toBe('10');
    expect(receivedUrl!.searchParams.has('search')).toBe(false);
    expect(receivedUrl!.searchParams.has('language')).toBe(false);
  });

  it('con ADMIN e includeInactive pega al 002B', async () => {
    mockCurrentUser('ADMIN', 50);
    let adminHit = false;
    server.use(
      http.get(`${BASE_URL}/admin`, () => {
        adminHit = true;
        return HttpResponse.json(emptyList);
      }),
    );

    const { Wrapper } = createWrapper();
    renderHook(
      () => vaccineWhodrugResource.useList({ page: 1, pageSize: 10, includeInactive: true }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(adminHit).toBe(true));
  });
});

describe('vaccineWhodrugResource — caché compartida con useVaccineWhodrugTree (SPEC FE25c §3.4)', () => {
  it('useOne(id) y useVaccineWhodrugDetail leen la misma entrada: una sola petición al 003', async () => {
    let detailCalls = 0;
    server.use(
      http.get(`${BASE_URL}/:id`, () => {
        detailCalls += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: buildVaccine() });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const resource = renderHook(() => vaccineWhodrugResource.useOne(VACCINE_ID), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(resource.result.current.isSuccess).toBe(true));

    const tree = renderHook(() => useVaccineWhodrugDetail(VACCINE_ID), { wrapper: Wrapper });

    expect(tree.result.current.data).toEqual(resource.result.current.data);
    expect(queryClient.getQueryData(['whodrugVaccine', 'detail', VACCINE_ID])).toEqual(
      buildVaccine(),
    );
    expect(detailCalls).toBe(1);
  });

  it('un 004 marca como inválidas las entradas de nivel del árbol', async () => {
    server.use(
      http.put(`${BASE_URL}/:id`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildVaccine({ strength: '0.1 mg' }) }),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    const levelKey = ['whodrugVaccine', 'level', 'abbreviation', {}, '', 'es'];
    queryClient.setQueryData(levelKey, { matchCount: 1, options: [] });
    expect(queryClient.getQueryState(levelKey)?.isInvalidated).toBe(false);

    const { result } = renderHook(() => vaccineWhodrugResource.useUpdate(), { wrapper: Wrapper });
    result.current.mutate({ id: VACCINE_ID, data: { drugCode: 'X', drugName: 'Y' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(levelKey)?.isInvalidated).toBe(true);
  });
});

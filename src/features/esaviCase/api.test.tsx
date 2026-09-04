import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { esaviCaseResource } from './api';

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

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper };
}

// Shape of ESAVI-CASE-003, per contracts/declared/esaviCase.ts / SPEC FE08 §3.3.
const esaviCaseDetail = {
  caseId: 'case-1',
  caseCode: 'ESAVI-2026-000001',
  reportDate: '2026-09-01',
  eventDate: '2026-08-30',
  countryIsoCode: 'EC',
  reportFillingDate: null,
  notificationOrganization: null,
  details: null,
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  patient: {
    patientId: 'patient-1',
    names: 'Ana',
    lastNames: 'Perez',
    documentNumber: '0102030405',
    healthSystemCode: null,
  },
  healthFacility: {
    healthFacilityId: 'facility-1',
    localCode: 'HF-01',
    name: 'Centro de Salud Norte',
  },
};

describe('esaviCaseResource.useOne — ESAVI-CASE-003', () => {
  it('devuelve la forma de declared/esaviCase.ts', async () => {
    server.use(
      http.get('http://localhost:4500/api/esavi-cases/case-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: esaviCaseDetail }),
      ),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => esaviCaseResource.useOne('case-1'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(esaviCaseDetail);
  });
});

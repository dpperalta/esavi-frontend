import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { useGenerateGeoTemplate, useImportGeoData } from './importApi';

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
  return { Wrapper, queryClient };
}

// SPEC FE07 §2, hallazgo C: jsdom doesn't implement the object-URL API the download uses.
function stubObjectUrl() {
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  return { createObjectURL, revokeObjectURL };
}

describe('useGenerateGeoTemplate — ESAVI-GEOLOC-007', () => {
  it('no pasa por la desenvoltura del envelope y descarga el Blob con el filename del backend', async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrl();
    let receivedUrl: URL | null = null;

    server.use(
      http.get('http://localhost:4500/api/geo-locations/import/template', ({ request }) => {
        receivedUrl = new URL(request.url);
        return new HttpResponse(new Blob(['fake xlsx content']), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="esavi-geo-template-2026-09-02.xlsx"',
          },
        });
      }),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useGenerateGeoTemplate(), { wrapper: Wrapper });

    result.current.mutate(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(receivedUrl!.searchParams.get('includeExisting')).toBe('true');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('useImportGeoData — ESAVI-GEOLOC-006', () => {
  it('con dryRun: true no invalida ninguna clave', async () => {
    server.use(
      http.post('http://localhost:4500/api/geo-locations/import', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            dryRun: true,
            sheets: { geoLocation: 'geoLocation', healthFacility: 'healthFacility' },
            geoLocation: {
              read: 0,
              inserted: 0,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
              sortOrderCoerced: 0,
            },
            healthFacility: {
              read: 0,
              inserted: 0,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
            },
            missingOptionalHeaders: { geoLocation: [], healthFacility: [] },
            unknownHeaders: { geoLocation: [], healthFacility: [] },
            errors: [],
          },
        }),
      ),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportGeoData(), { wrapper: Wrapper });

    result.current.mutate({ file: new File(['x'], 'geo.xlsx'), dryRun: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('con dryRun: false invalida geoLocation y healthFacility', async () => {
    server.use(
      http.post('http://localhost:4500/api/geo-locations/import', async ({ request }) => {
        const formData = await request.formData();
        expect(formData.get('dryRun')).toBe('false');
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            dryRun: false,
            sheets: { geoLocation: 'geoLocation', healthFacility: 'healthFacility' },
            geoLocation: {
              read: 1,
              inserted: 1,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
              sortOrderCoerced: 0,
            },
            healthFacility: {
              read: 0,
              inserted: 0,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
            },
            missingOptionalHeaders: { geoLocation: [], healthFacility: [] },
            unknownHeaders: { geoLocation: [], healthFacility: [] },
            errors: [],
          },
        });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportGeoData(), { wrapper: Wrapper });

    result.current.mutate({ file: new File(['x'], 'geo.xlsx'), dryRun: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['geoLocation'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['healthFacility'] });
  });
});

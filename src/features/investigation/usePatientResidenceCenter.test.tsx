import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { usePatientResidenceCenter } from './usePatientResidenceCenter';

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

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const patientDetailWithResidence = {
  patientId: 'patient-1',
  names: 'Ana',
  lastNames: 'Pérez',
  documentNumber: '0102030405',
  passportNumber: null,
  birthDate: '1990-01-01',
  healthSystemCode: null,
  email: null,
  phoneNumber: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  sex: null,
  residence: { geoLocationId: 'geo-1', name: 'Quito', geoLevelTypeId: 'level-1', level: 3 },
};

const patientDetailWithoutResidence = { ...patientDetailWithResidence, residence: null };

const geoLocationWithCoordinates = {
  geoLocationId: 'geo-1',
  geoLevelTypeId: 'level-1',
  parentGeoLocationId: null,
  name: 'Quito',
  officialName: null,
  shortName: null,
  isoCode: null,
  externalCode: 'Q001',
  level: 3,
  latitude: -0.22985,
  longitude: -78.52495,
  sortOrder: null,
  isActive: true,
  deletedAt: null,
  appDetails: [],
};

const geoLocationWithoutCoordinates = {
  ...geoLocationWithCoordinates,
  latitude: null,
  longitude: null,
};

// `usePatientResidenceCenter` returns a plain `{ lat, lng } | null`, not a query object — there's
// no `isSuccess`/`isError` to await directly, so the probe renders the value on screen and the
// tests wait on the mocked handlers themselves to know the two chained reads settled.
function Probe({ patientId }: { patientId: string | undefined }) {
  const center = usePatientResidenceCenter(patientId);
  return <div data-testid="center">{center ? `${center.lat},${center.lng}` : 'null'}</div>;
}

describe('usePatientResidenceCenter — SPEC FE13e §3.7', () => {
  it('camino feliz: con residencia y coordenadas resueltas, devuelve { lat, lng }', async () => {
    const patientHandler = vi.fn(() =>
      HttpResponse.json({ ok: true, message: 'ok', data: patientDetailWithResidence }),
    );
    const geoHandler = vi.fn(() =>
      HttpResponse.json({ ok: true, message: 'ok', data: geoLocationWithCoordinates }),
    );
    server.use(
      http.get('http://localhost:4500/api/patients/patient-1', patientHandler),
      http.get('http://localhost:4500/api/geo-locations/geo-1', geoHandler),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { getByTestId } = render(<Probe patientId="patient-1" />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(geoHandler).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByTestId('center').textContent).toBe('-0.22985,-78.52495'));
  });

  it('el paciente sin residence resuelve null sin llamar a ESAVI-GEOLOC-003', async () => {
    const geoHandler = vi.fn(() =>
      HttpResponse.json({ ok: true, message: 'ok', data: geoLocationWithCoordinates }),
    );
    server.use(
      http.get('http://localhost:4500/api/patients/patient-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: patientDetailWithoutResidence }),
      ),
      http.get('http://localhost:4500/api/geo-locations/geo-1', geoHandler),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { getByTestId } = render(<Probe patientId="patient-1" />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(queryClient.getQueryState(['patient', 'detail', 'patient-1'])?.status).toBe('success'),
    );
    expect(getByTestId('center').textContent).toBe('null');
    expect(geoHandler).not.toHaveBeenCalled();
  });

  it('la división sin latitude/longitude resuelve null', async () => {
    server.use(
      http.get('http://localhost:4500/api/patients/patient-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: patientDetailWithResidence }),
      ),
      http.get('http://localhost:4500/api/geo-locations/geo-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: geoLocationWithoutCoordinates }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { getByTestId } = render(<Probe patientId="patient-1" />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(queryClient.getQueryState(['geoLocation', 'detail', 'geo-1'])?.status).toBe('success'),
    );
    expect(getByTestId('center').textContent).toBe('null');
  });

  it('un 500 en ESAVI-PATIENT-003 resuelve null sin lanzar', async () => {
    server.use(
      http.get('http://localhost:4500/api/patients/patient-1', () =>
        HttpResponse.json({ ok: false, message: 'boom', code: 'UNKNOWN_ERROR' }, { status: 500 }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { getByTestId } = render(<Probe patientId="patient-1" />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(queryClient.getQueryState(['patient', 'detail', 'patient-1'])?.status).toBe('error'),
    );
    expect(getByTestId('center').textContent).toBe('null');
  });

  it('un 500 en ESAVI-GEOLOC-003 resuelve null sin lanzar', async () => {
    server.use(
      http.get('http://localhost:4500/api/patients/patient-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: patientDetailWithResidence }),
      ),
      http.get('http://localhost:4500/api/geo-locations/geo-1', () =>
        HttpResponse.json({ ok: false, message: 'boom', code: 'UNKNOWN_ERROR' }, { status: 500 }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { getByTestId } = render(<Probe patientId="patient-1" />, {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(queryClient.getQueryState(['geoLocation', 'detail', 'geo-1'])?.status).toBe('error'),
    );
    expect(getByTestId('center').textContent).toBe('null');
  });

  it('sin patientId, no se dispara ninguna lectura y el resultado es null', async () => {
    const patientHandler = vi.fn(() =>
      HttpResponse.json({ ok: true, message: 'ok', data: patientDetailWithResidence }),
    );
    server.use(http.get('http://localhost:4500/api/patients/patient-1', patientHandler));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { getByTestId } = render(<Probe patientId={undefined} />, {
      wrapper: createWrapper(queryClient),
    });

    expect(getByTestId('center').textContent).toBe('null');
    expect(patientHandler).not.toHaveBeenCalled();
  });
});

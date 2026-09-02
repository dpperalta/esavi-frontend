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
import { HealthFacilityFormDialog } from './HealthFacilityFormDialog';

const server = setupServer();

const LVL_COUNTRY = '11111111-1111-4111-8111-111111111111';
const GL_ECUADOR = '22222222-2222-4222-8222-222222222222';
const HFAC_1 = '33333333-3333-4333-8333-333333333333';
const HFAC_2 = '44444444-4444-4444-8444-444444444444';

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

function mockCatalogTypesEmpty() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockGeoLocationPicker() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              geoLevelTypeId: LVL_COUNTRY,
              code: 'COUNTRY',
              name: 'País',
              sortOrder: 1,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
    ),
    http.get('http://localhost:4500/api/geo-locations', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            {
              geoLocationId: GL_ECUADOR,
              geoLevelTypeId: LVL_COUNTRY,
              parentGeoLocationId: null,
              name: 'Ecuador',
              officialName: null,
              shortName: null,
              isoCode: null,
              externalCode: 'EC',
              level: 1,
              latitude: null,
              longitude: null,
              sortOrder: 1,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
          ],
        },
      }),
      http.get(`http://localhost:4500/api/geo-locations/${GL_ECUADOR}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            geoLocationId: GL_ECUADOR,
            geoLevelTypeId: LVL_COUNTRY,
            parentGeoLocationId: null,
            name: 'Ecuador',
            officialName: null,
            shortName: null,
            isoCode: null,
            externalCode: 'EC',
            level: 1,
            latitude: null,
            longitude: null,
            sortOrder: 1,
            isActive: true,
            deletedAt: null,
            appDetails: [],
          },
        }),
      ),
    ),
  );
}

function makeFacility(overrides: Record<string, unknown> = {}) {
  return {
    healthFacilityId: HFAC_1,
    geoLocationId: GL_ECUADOR,
    facilityTypeItemId: null,
    parentHealthFacilityId: null,
    localCode: null,
    name: 'Centro de salud Quito Sur',
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
    ...overrides,
  };
}

function renderDialog(healthFacilityId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HealthFacilityFormDialog open healthFacilityId={healthFacilityId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('HealthFacilityFormDialog — combo de unidad padre (SPEC FE06 §3.7)', () => {
  it('sin ubicación elegida, el combo de padre está deshabilitado y no pide nada', async () => {
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    let parentListRequested = false;
    server.use(
      http.get('http://localhost:4500/api/health-facilities/location/:id', () => {
        parentListRequested = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderDialog();

    const parentTrigger = await screen.findByLabelText('Unidad padre');
    expect(parentTrigger).toBeDisabled();
    expect(screen.getByText('Elige primero una ubicación')).toBeInTheDocument();
    expect(parentListRequested).toBe(false);
  });

  it('elegir una ubicación recarga los candidatos a padre de esa ubicación', async () => {
    const user = userEvent.setup();
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [makeFacility()] },
        }),
      ),
    );

    renderDialog();

    await user.click(await screen.findByLabelText('Nivel País'));
    await user.click(await screen.findByRole('option', { name: 'Ecuador' }));

    await waitFor(() => expect(screen.getByLabelText('Unidad padre')).not.toBeDisabled());
    await user.click(screen.getByLabelText('Unidad padre'));
    expect(
      await screen.findByRole('option', { name: 'Centro de salud Quito Sur' }),
    ).toBeInTheDocument();
  });
});

describe('HealthFacilityFormDialog — mapeo de errores (SPEC FE06 §3.7)', () => {
  it('un 409 con HFAC_001_LOCAL_CODE_EXISTS marca el campo código local', async () => {
    const user = userEvent.setup();
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/health-facilities', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe una unidad de salud con ese código local',
            code: 'HFAC_001_LOCAL_CODE_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog();

    await user.click(await screen.findByLabelText('Nivel País'));
    await user.click(await screen.findByRole('option', { name: 'Ecuador' }));
    await user.type(screen.getByLabelText('Nombre'), 'Centro de salud Quito Sur');
    await user.type(screen.getByLabelText('Código local'), 'DUP-001');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Ya existe una unidad de salud con ese código local'),
    ).toBeInTheDocument();
  });

  it('un 409 con HFAC_004_CIRCULAR_PARENT marca el campo unidad padre', async () => {
    const user = userEvent.setup();
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/${HFAC_2}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: makeFacility({ healthFacilityId: HFAC_2, name: 'Subcentro de salud' }),
        }),
      ),
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { count: 1, rows: [makeFacility()] },
        }),
      ),
      http.put(`http://localhost:4500/api/health-facilities/${HFAC_2}`, () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'La unidad padre elegida crea un ciclo',
            code: 'HFAC_004_CIRCULAR_PARENT',
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog(HFAC_2);

    await user.click(await screen.findByLabelText('Unidad padre'));
    await user.click(await screen.findByRole('option', { name: 'Centro de salud Quito Sur' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('La unidad padre elegida crea un ciclo')).toBeInTheDocument();
  });
});

describe('HealthFacilityFormDialog — el error de una mutación no sobrevive al cierre (CONVENTIONS.md §10.7)', () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Reabrir
        </button>
        <HealthFacilityFormDialog open={open} healthFacilityId={null} onOpenChange={setOpen} />
      </>
    );
  }

  function renderHarness() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  }

  it('un 409 no reaparece al cancelar y reabrir para crear otra unidad', async () => {
    const user = userEvent.setup();
    mockCatalogTypesEmpty();
    mockGeoLocationPicker();
    server.use(
      http.get(`http://localhost:4500/api/health-facilities/location/${GL_ECUADOR}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/health-facilities', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe una unidad de salud con ese código local',
            code: 'HFAC_001_LOCAL_CODE_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderHarness();

    await user.click(await screen.findByLabelText('Nivel País'));
    await user.click(await screen.findByRole('option', { name: 'Ecuador' }));
    await user.type(screen.getByLabelText('Nombre'), 'Centro de salud Quito Sur');
    await user.type(screen.getByLabelText('Código local'), 'DUP-001');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Ya existe una unidad de salud con ese código local'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue(''));
    expect(
      screen.queryByText('Ya existe una unidad de salud con ese código local'),
    ).not.toBeInTheDocument();
  });
});

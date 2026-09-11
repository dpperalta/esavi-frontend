import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { BasicInfoSection } from './BasicInfoSection';

// Leaflet manipulates the real DOM with layout measurements jsdom doesn't compute — same minimal
// double as `MapPointPicker.test.tsx` (step 3). Only the numeric latitude field is needed here,
// which doesn't depend on the map itself.
vi.mock('leaflet', () => {
  class FakeHandler {
    enable() {}
    disable() {}
  }
  class FakeMarker {
    dragging = new FakeHandler();
    addTo() {
      return this;
    }
    on() {
      return this;
    }
    setLatLng() {}
    getLatLng() {
      return { lat: 0, lng: 0 };
    }
    remove() {}
  }
  class FakeTileLayer {
    addTo() {
      return this;
    }
  }
  class FakeMap {
    dragging = new FakeHandler();
    doubleClickZoom = new FakeHandler();
    scrollWheelZoom = new FakeHandler();
    boxZoom = new FakeHandler();
    keyboard = new FakeHandler();
    touchZoom = new FakeHandler();
    on() {
      return this;
    }
    panTo() {}
    remove() {}
  }
  return {
    default: {
      map: vi.fn(() => new FakeMap()),
      tileLayer: vi.fn(() => new FakeTileLayer()),
      marker: vi.fn(() => new FakeMarker()),
      Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    },
  };
});

const server = setupServer();

const CASE_1 = 'case-1';
const INVESTIGATION_1 = 'investigation-1';
const INVESTIGATION_STATUS_TYPE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STATUS_RECOVERED = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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
  mockEmptyCatalogAndSearch();
});

function mockEmptyCatalogAndSearch() {
  server.use(
    // The real, non-empty `investigationStatus` catalog (SPEC FE13a §6): the death block's gate
    // is derived from `catalogItem.value`, so step 9 needs a real `DEATH` item behind
    // `<CatalogSelect>`, not the empty list that sufficed before step 9.
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 1,
          rows: [
            { catalogTypeId: INVESTIGATION_STATUS_TYPE, code: 'investigationStatus', name: 'Estado' },
          ],
        },
      }),
    ),
    http.get(`http://localhost:4500/api/catalog-items/type/${INVESTIGATION_STATUS_TYPE}`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            { catalogItemId: STATUS_DEATH, code: 'DEATH', name: 'Fallecido', value: 'DEATH' },
            { catalogItemId: STATUS_RECOVERED, code: 'RECOVERED', name: 'Recuperado', value: 'RECOVERED' },
          ],
        },
      }),
    ),
    http.get('http://localhost:4500/api/health-facilities/search', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    // Sub-queries from `<HealthFacilitySelect scoped={false}>` and `<GeoLocationPicker>` that
    // this section doesn't exercise — mocked empty so as not to pollute the output with
    // "unhandled request".
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'user-1', roles: [{ roleId: 'r1', name: 'USER', code: 'USER', level: 25 }] },
      }),
    ),
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(/\/api\/geo-locations\/.+/, () =>
      HttpResponse.json(
        { ok: false, message: 'no encontrado', code: 'GEOLOC_003_NOT_FOUND' },
        { status: 404 },
      ),
    ),
  );
}

// The four resolved ids have to look like real UUIDs: `investigationSaveSchema` validates
// `z.string().uuid()` and an id like `'geo-1'` would fail client-side validation before reaching
// the network — not what this test wants to check. `STATUS_OTHER` is deliberately distinct from
// `STATUS_DEATH` (used by step 9's tests): these three tests only check that the id is sent and
// not the resolved object, and must not open the death block.
const STATUS_OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE_HOME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HFAC_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GEO_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STATUS_DEATH = '11111111-1111-4111-8111-111111111111';

const investigationWithResolvedObjects = {
  investigationId: INVESTIGATION_1,
  case: { caseId: 'case-1', caseCode: 'C-1', reportDate: '2026-09-01', eventDate: null },
  status: { catalogItemId: STATUS_OTHER, code: 'OTHER', name: 'Otro' },
  vaccinationSite: { catalogItemId: SITE_HOME, code: 'HOME', name: 'Domicilio' },
  vaccinationHealthFacility: { healthFacilityId: HFAC_1, localCode: 'HF-01', name: 'Centro Norte' },
  vaccinationGeoLocation: { geoLocationId: GEO_1, name: 'Quito', level: 2 },
  hospitalizationDate: '2026-09-02',
  investigationStartDate: '2026-09-03',
  // `numeric(10,7)` arrives as a string, not a number (SPEC FE13a §3.3) — the form's mapping
  // does the conversion, in a single spot.
  vaccinationLatitude: '-0.1807000',
  vaccinationLongitude: '-78.4678000',
  notes: 'Notas previas',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
};

function renderBasicInfoSection(props: Partial<Parameters<typeof BasicInfoSection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BasicInfoSection
          caseId={CASE_1}
          investigationId={INVESTIGATION_1}
          investigation={null}
          investigationAutopsy={null}
          notification={null}
          showSaveButton
          onSaved={onSaved}
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, onSaved };
}

describe('BasicInfoSection — nunca reenvía objetos resueltos (SPEC FE13a §4 paso 8)', () => {
  it('dejar el estado vacío guarda sin error', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationWithResolvedObjects });
      }),
    );
    const user = setupUser();
    const { onSaved } = renderBasicInfoSection();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(receivedBody).toMatchObject({ statusItemId: null });
  });

  it('en reentrada, el envío manda ids y nunca los objetos resueltos del GET', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationWithResolvedObjects });
      }),
    );
    const user = setupUser();
    renderBasicInfoSection({ investigation: investigationWithResolvedObjects });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({
      statusItemId: STATUS_OTHER,
      vaccinationSiteItemId: SITE_HOME,
      vaccinationHealthFacilityId: HFAC_1,
      vaccinationGeoLocationId: GEO_1,
    });
    // No body key is an object — never `status: {...}` nor any other resolved value.
    for (const value of Object.values(receivedBody!)) {
      expect(typeof value === 'object' && value !== null).toBe(false);
    }
  });

  it('ocho decimales en la latitud no llegan a salir', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationWithResolvedObjects });
      }),
    );
    const user = setupUser();
    renderBasicInfoSection({ investigation: investigationWithResolvedObjects });

    // `<MapPointPicker>` is the one that rounds (SPEC FE13a §3.7) — an eighth decimal is typed
    // into the numeric field and the `PUT` is checked to already come trimmed to seven.
    fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: '-0.180712345' } });
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    const latitude = String(receivedBody!.vaccinationLatitude);
    const decimals = latitude.split('.')[1] ?? '';
    expect(decimals.length).toBeLessThanOrEqual(7);
    expect(receivedBody!.vaccinationLatitude).toBe(-0.1807123);
  });
});

const investigationAutopsyFixture = {
  investigationId: INVESTIGATION_1,
  isDeath: true,
  deathDate: '2026-01-16',
  deathTime: '10:30:00',
  isAutopsyPerformed: true,
  isAutopsyScheduled: null,
  autopsyDate: '2026-01-17',
  scheduledAutopsyDate: null,
  autopsyComments: 'Necropsia normal',
  notes: null,
  createdAt: '2026-01-16T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  investigation: {
    investigationId: INVESTIGATION_1,
    isActive: true,
    investigationStartDate: null,
    status: { catalogItemId: STATUS_DEATH, code: 'DEATH', name: 'Fallecido' },
    case: { caseId: CASE_1, caseCode: 'C-1', eventDate: null },
  },
};

const investigationWithDeathStatus = {
  ...investigationWithResolvedObjects,
  status: { catalogItemId: STATUS_DEATH, code: 'DEATH', name: 'Fallecido' },
};

describe('BasicInfoSection — el bloque de muerte y autopsia (SPEC FE13a §4 paso 9)', () => {
  it('elegir «Fallecido» revela el bloque y precarga la fecha de la notificación', async () => {
    const user = setupUser();
    renderBasicInfoSection({
      notification: { deathDate: '2026-01-16', outcome: null } as never,
    });

    expect(
      screen.queryByLabelText('Si la persona murió, indique la fecha de la muerte'),
    ).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole('combobox', {
        name: 'Estado de la persona al momento de la investigación',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'Fallecido' }));

    expect(
      await screen.findByLabelText('Si la persona murió, indique la fecha de la muerte'),
    ).toHaveValue('2026-01-16');
  });

  it('cambiar el estado a uno que no es muerte limpia los campos de autopsia con un PUT y no borra la fila', async () => {
    let investigationBody: Record<string, unknown> | null = null;
    let autopsyBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, async ({ request }) => {
        investigationBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: investigationWithResolvedObjects });
      }),
      http.put(
        `http://localhost:4500/api/investigation-autopsies/${INVESTIGATION_1}`,
        async ({ request }) => {
          autopsyBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: investigationAutopsyFixture });
        },
      ),
    );
    const user = setupUser();
    renderBasicInfoSection({
      investigation: investigationWithDeathStatus,
      investigationAutopsy: investigationAutopsyFixture,
    });

    await screen.findByLabelText('Registre los resultados de la necropsia');

    await user.click(
      screen.getByRole('combobox', {
        name: 'Estado de la persona al momento de la investigación',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'Recuperado' }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText('Si la persona murió, indique la fecha de la muerte'),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(autopsyBody).not.toBeNull());
    // Doesn't delete the row (§3.5 C, acceptance criterion): a `PUT`, never a `DELETE` — which
    // isn't even mocked, so MSW would have failed it as "unhandled request".
    expect(investigationBody).toMatchObject({ statusItemId: STATUS_RECOVERED });
    expect(autopsyBody).toMatchObject({
      isDeath: true,
      deathDate: '2026-01-16',
      isAutopsyPerformed: null,
      autopsyDate: null,
      isAutopsyScheduled: null,
      scheduledAutopsyDate: null,
      autopsyComments: null,
    });
  });

  it('el aviso de discrepancia con la notificación aparece, no bloquea el guardado y enlaza al paso 4', async () => {
    server.use(
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationWithResolvedObjects }),
      ),
      http.post('http://localhost:4500/api/investigation-autopsies', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationAutopsyFixture }),
      ),
    );
    const user = setupUser();
    const { onSaved } = renderBasicInfoSection({
      investigation: investigationWithDeathStatus,
      investigationAutopsy: null,
      notification: {
        deathDate: '2026-01-10',
        outcome: { catalogItemId: STATUS_RECOVERED, code: 'RECOVERED', name: 'Recuperado', value: 'RECOVERED' },
      } as never,
    });

    const warning = await screen.findByRole('status');
    expect(warning).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar el paso 4' })).toHaveAttribute(
      'href',
      `/esavi-cases/${CASE_1}/wizard/notification`,
    );

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

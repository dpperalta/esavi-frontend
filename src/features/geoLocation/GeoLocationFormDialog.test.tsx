import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { GeoLocationFormDialog } from './GeoLocationFormDialog';

const server = setupServer();

const LVL_COUNTRY = '11111111-1111-4111-8111-111111111111';
const GL_ECUADOR = '22222222-2222-4222-8222-222222222222';
const GL_COLOMBIA = '33333333-3333-4333-8333-333333333333';

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

function mockLevelTypes() {
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
  );
}

function makeLocation(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function renderDialog(geoLocationId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GeoLocationFormDialog open geoLocationId={geoLocationId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('GeoLocationFormDialog — crear', () => {
  it('sin parentGeoLocationId, el POST no lo manda', async () => {
    const user = userEvent.setup();
    mockLevelTypes();
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/geo-locations', async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: makeLocation() });
      }),
    );

    renderDialog();

    await user.click(await screen.findByLabelText('Nivel geográfico'));
    await user.click(await screen.findByRole('option', { name: 'País' }));
    await user.type(screen.getByLabelText('Nombre'), 'Ecuador');
    await user.type(screen.getByLabelText('Código externo'), 'EC');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).not.toHaveProperty('parentGeoLocationId');
  });
});

describe('GeoLocationFormDialog — mapeo de errores', () => {
  it('un 409 con GEOLOC_001_NAME_EXISTS marca el campo nombre', async () => {
    const user = userEvent.setup();
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
      http.post('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json(
          { ok: false, message: 'Ya existe una ubicación con el nombre Ecuador', code: 'GEOLOC_001_NAME_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderDialog();

    await user.click(await screen.findByLabelText('Nivel geográfico'));
    await user.click(await screen.findByRole('option', { name: 'País' }));
    await user.type(screen.getByLabelText('Nombre'), 'Ecuador');
    await user.type(screen.getByLabelText('Código externo'), 'EC');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Ya existe una ubicación con el nombre Ecuador'),
    ).toBeInTheDocument();
  });
});

describe('GeoLocationFormDialog — edición, picker con excludeSubtreeOf', () => {
  it('la fila que se edita no aparece entre las opciones del picker en el nivel donde vive', async () => {
    const user = userEvent.setup();
    mockLevelTypes();
    server.use(
      http.get(`http://localhost:4500/api/geo-locations/${GL_ECUADOR}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeLocation() }),
      ),
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('geoLevelId') === LVL_COUNTRY) {
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: {
              count: 2,
              rows: [makeLocation(), makeLocation({ geoLocationId: GL_COLOMBIA, name: 'Colombia' })],
            },
          });
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderDialog(GL_ECUADOR);

    // Ecuador has no parent of its own (root), so the picker starts directly in cascade mode —
    // there's no prior parent to show as read-only, so no «Cambiar» button appears here.
    const pickerTrigger = await screen.findByLabelText('Nivel País');
    await user.click(pickerTrigger);

    expect(screen.queryByRole('option', { name: 'Ecuador' })).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Colombia' })).toBeInTheDocument();
  });
});

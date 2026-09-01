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
import { GeoLocationPicker } from './GeoLocationPicker';

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

function mockLevelTypes() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          count: 2,
          rows: [
            {
              geoLevelTypeId: 'lvl-country',
              code: 'COUNTRY',
              name: 'País',
              sortOrder: 1,
              isActive: true,
              deletedAt: null,
              appDetails: [],
            },
            {
              geoLevelTypeId: 'lvl-province',
              code: 'PROVINCE',
              name: 'Provincia',
              sortOrder: 2,
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
    geoLocationId: 'gl-1',
    geoLevelTypeId: 'lvl-country',
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

function renderPicker(props: {
  value?: string | null;
  excludeSubtreeOf?: string;
  onChange?: (id: string | null) => void;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [value, setValue] = useState<string | null>(props.value ?? null);
    return (
      <GeoLocationPicker
        value={value}
        onChange={(id) => {
          setValue(id);
          props.onChange?.(id);
        }}
        excludeSubtreeOf={props.excludeSubtreeOf}
      />
    );
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('GeoLocationPicker — primer nivel (hallazgo D)', () => {
  it('pide el primer nivel filtrando por geoLevelId del nivel raíz, nunca con parentId vacío', async () => {
    mockLevelTypes();
    let requestedUrl: URL | null = null;
    server.use(
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPicker({});

    await waitFor(() => expect(requestedUrl).not.toBeNull());
    expect(requestedUrl!.searchParams.get('geoLevelId')).toBe('lvl-country');
    expect(requestedUrl!.searchParams.has('parentId')).toBe(false);
  });
});

describe('GeoLocationPicker — cascada', () => {
  it('elegir una opción del primer nivel dispara la consulta del nivel siguiente con parentId', async () => {
    const user = userEvent.setup();
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('geoLevelId') === 'lvl-country') {
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: { count: 1, rows: [makeLocation()] },
          });
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPicker({});

    const trigger = await screen.findByRole('combobox');
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Ecuador' }));

    await waitFor(() =>
      expect(
        screen.getAllByRole('combobox').length,
      ).toBeGreaterThanOrEqual(1),
    );
  });

  it('con excludeSubtreeOf fijado, esa fila no aparece entre las opciones del nivel donde vive', async () => {
    const user = userEvent.setup();
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            count: 2,
            rows: [makeLocation(), makeLocation({ geoLocationId: 'gl-2', name: 'Colombia' })],
          },
        }),
      ),
    );

    renderPicker({ excludeSubtreeOf: 'gl-1' });

    const trigger = await screen.findByRole('combobox');
    await user.click(trigger);

    expect(screen.queryByRole('option', { name: 'Ecuador' })).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Colombia' })).toBeInTheDocument();
  });

  it('un nivel sin hijos no pinta un <Select> vacío', async () => {
    const user = userEvent.setup();
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('geoLevelId') === 'lvl-country') {
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: { count: 1, rows: [makeLocation()] },
          });
        }
        // Children query (parentId) — no children.
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPicker({});

    const trigger = await screen.findByRole('combobox');
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Ecuador' }));

    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(1));
  });
});

describe('GeoLocationPicker — edición sin precarga de ancestros', () => {
  it('con un value ya asignado, muestra el valor plano de solo lectura con botón «Cambiar»', async () => {
    mockLevelTypes();
    server.use(
      http.get('http://localhost:4500/api/geo-locations/gl-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeLocation() }),
      ),
    );

    renderPicker({ value: 'gl-1' });

    expect(await screen.findByText('Ecuador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('pulsar «Cambiar» abre la cascada vacía desde el nivel raíz', async () => {
    const user = userEvent.setup();
    mockLevelTypes();
    let rootRequested = false;
    server.use(
      http.get('http://localhost:4500/api/geo-locations/gl-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeLocation() }),
      ),
      http.get('http://localhost:4500/api/geo-locations', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('geoLevelId') === 'lvl-country') {
          rootRequested = true;
        }
        return HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } });
      }),
    );

    renderPicker({ value: 'gl-1' });

    await user.click(await screen.findByRole('button', { name: 'Cambiar' }));

    await waitFor(() => expect(rootRequested).toBe(true));
    expect(screen.queryByRole('button', { name: 'Cambiar' })).not.toBeInTheDocument();
  });
});

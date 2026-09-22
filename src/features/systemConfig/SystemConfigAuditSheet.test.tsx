import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { SystemConfigDetail } from '@/contracts/declared/systemConfig';
import { SystemConfigAuditSheet } from './SystemConfigAuditSheet';

const server = setupServer();
const SC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function makeRow(overrides: Partial<Record<string, unknown>> = {}): SystemConfigDetail {
  return {
    systemConfigId: SC_ID,
    code: 'ESAVI_MAX_UPLOAD_SIZE',
    name: 'Tamaño máximo de carga',
    description: null,
    value: 10,
    valueType: 'number',
    scope: 'GLOBAL',
    isEncrypted: false,
    isEditable: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  } as SystemConfigDetail;
}

function renderSheet(systemConfigId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemConfigAuditSheet open systemConfigId={systemConfigId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('SystemConfigAuditSheet — SPEC FE19 §4 paso 8', () => {
  it('abre con una fila de varias entradas de appDetails', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: makeRow({
            appDetails: [
              {
                createdAt: new Date('2026-08-20T10:00:00Z'),
                user: 'superadmin@esavi.test',
                method: 'ESAVI-SYSCONF-001',
                detail: 'Creación inicial',
              },
              {
                createdAt: new Date('2026-08-25T10:00:00Z'),
                user: 'superadmin@esavi.test',
                method: 'ESAVI-SYSCONF-004',
                detail: 'Actualización de valor',
              },
            ],
          }),
        }),
      ),
    );

    renderSheet(SC_ID);

    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });

  it('con appDetails: {} (objeto, no array) no revienta y muestra el estado vacío', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ appDetails: {} }) }),
      ),
    );

    renderSheet(SC_ID);

    expect(await screen.findByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

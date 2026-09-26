import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DiagnosticTerm } from '@/contracts/declared/diagnosticTerm';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { DiagnosticTermAuditSheet } from './DiagnosticTermAuditSheet';

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

function makeRow(overrides: Partial<DiagnosticTerm> = {}): DiagnosticTerm {
  return {
    diagnosticTermId: 't-1',
    source: 'LOCAL',
    code: 'FIEBRE',
    name: 'Fiebre',
    termGroup: null,
    metadata: {},
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderSheet(diagnosticTermId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiagnosticTermAuditSheet open diagnosticTermId={diagnosticTermId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('DiagnosticTermAuditSheet', () => {
  it('lista las entradas de appDetails, la más reciente primero', async () => {
    server.use(
      http.get('http://localhost:4500/api/diagnostic-terms/t-1', () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: makeRow({
            appDetails: [
              {
                createdAt: new Date('2026-09-20T10:00:00Z'),
                user: 'admin@esavi.test',
                method: 'POST',
                detail: 'Creación implícita',
              },
              {
                createdAt: new Date('2026-09-22T10:00:00Z'),
                user: 'admin@esavi.test',
                method: 'PUT',
                detail: 'Revisión aprobada',
              },
            ],
          }),
        }),
      ),
    );

    renderSheet('t-1');

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Revisión aprobada');
    expect(items[1]).toHaveTextContent('Creación implícita');
  });

  it('con appDetails: null muestra el estado vacío', async () => {
    server.use(
      http.get('http://localhost:4500/api/diagnostic-terms/t-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ appDetails: null }) }),
      ),
    );

    renderSheet('t-1');

    expect(await screen.findByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
  });
});

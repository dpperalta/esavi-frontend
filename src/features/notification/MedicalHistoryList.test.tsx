import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { itBehavesAsRestorableSatelliteList } from '@/test/satelliteAuditCases';
import { MedicalHistoryList } from './MedicalHistoryList';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const NOTIFICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEDICAL_HISTORY_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  toastError.mockClear();
  toastSuccess.mockClear();
});

function medicalHistoryRow(overrides: Record<string, unknown>) {
  return {
    medicalHistoryId: MEDICAL_HISTORY_1,
    notificationId: NOTIFICATION_ID,
    diagnosticTermId: null,
    historyRaw: 'Asma',
    sortOrder: 1,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    diagnosticTerm: null,
    ...overrides,
  };
}

describe('MedicalHistoryList — registros eliminados (SPEC FE29 §4 paso 6)', () => {
  itBehavesAsRestorableSatelliteList({
    server,
    render: ({ initialPath, readOnly }) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialPath]}>
            <MedicalHistoryList
              caseId="case-1"
              notificationId={NOTIFICATION_ID}
              readOnly={readOnly}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    },
    apiPath: 'notification-medical-histories',
    adminListSegment: `admin/notification/${NOTIFICATION_ID}`,
    activeListUrl: 'http://localhost:4500/api/notification-medical-histories/case/case-1',
    rowId: MEDICAL_HISTORY_1,
    rowLabel: 'Asma',
    buildRow: medicalHistoryRow,
    restoredToast: 'Registro restaurado',
    toastSuccess,
    toastError,
  });
});

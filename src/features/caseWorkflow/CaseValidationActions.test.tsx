import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { CaseValidationActions } from './CaseValidationActions';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
  toastError.mockClear();
  toastSuccess.mockClear();
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

const WORKFLOW_URL = 'http://localhost:4500/api/case-workflows/case/case-1';

const STATUS_NAMES: Record<string, string> = {
  IN_NOTIFICATION: 'En notificación',
  REOPENED: 'Reabierto',
  PENDING_VALIDATION: 'Pendiente de validación',
  CLOSED: 'Cerrado',
};

function workflowWith(statusCode: string, previousCode: string | null = null) {
  return {
    caseWorkflowId: 'workflow-1',
    caseId: 'case-1',
    status: {
      catalogItemId: `status-${statusCode}`,
      code: statusCode,
      name: STATUS_NAMES[statusCode],
    },
    previousStatus: previousCode
      ? {
          catalogItemId: `status-${previousCode}`,
          code: previousCode,
          name: STATUS_NAMES[previousCode],
        }
      : null,
    openedAt: '2026-09-01T00:00:00.000Z',
    closedAt: null,
    lastReopenedAt: null,
    reopenCount: 0,
    stages: {},
  };
}

function mockWorkflow(statusCode: string, previousCode: string | null = null) {
  server.use(
    http.get(WORKFLOW_URL, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: workflowWith(statusCode, previousCode) }),
    ),
  );
}

function renderActions(mode?: 'full' | 'resolveOnly') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CaseValidationActions caseId="case-1" mode={mode} />
    </QueryClientProvider>,
  );
  return queryClient;
}

async function waitForWorkflow(queryClient: QueryClient) {
  await waitFor(() =>
    expect(queryClient.getQueryState(['caseWorkflow', 'byCase', 'case-1'])?.status).toBe('success'),
  );
}

// SPEC FE23 §4 paso 2
describe('CaseValidationActions — ESAVI-CASEFLOW-010 / ESAVI-CASEFLOW-011', () => {
  it.each(['IN_NOTIFICATION', 'REOPENED'])('con %s pinta «Pedir validación»', async (status) => {
    mockWorkflow(status);
    renderActions();

    expect(await screen.findByRole('button', { name: 'Pedir validación' })).toBeInTheDocument();
  });

  it('con PENDING_VALIDATION pinta «Resolver validación» y el diálogo nombra el estado anterior', async () => {
    mockWorkflow('PENDING_VALIDATION', 'IN_NOTIFICATION');
    const user = setupUser();
    renderActions();

    await user.click(await screen.findByRole('button', { name: 'Resolver validación' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'El expediente volverá al estado En notificación.',
    );
  });

  it('con CLOSED no pinta nada', async () => {
    mockWorkflow('CLOSED');
    const queryClient = renderActions();

    await waitForWorkflow(queryClient);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('en resolveOnly con IN_NOTIFICATION no pinta nada', async () => {
    mockWorkflow('IN_NOTIFICATION');
    const queryClient = renderActions('resolveOnly');

    await waitForWorkflow(queryClient);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('en resolveOnly con PENDING_VALIDATION pinta «Resolver validación»', async () => {
    mockWorkflow('PENDING_VALIDATION', 'IN_NOTIFICATION');
    renderActions('resolveOnly');

    expect(await screen.findByRole('button', { name: 'Resolver validación' })).toBeInTheDocument();
  });

  it('confirmar lanza un único PATCH y deshabilita el botón de confirmar mientras está en curso', async () => {
    mockWorkflow('IN_NOTIFICATION');
    let patchCalls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch(`${WORKFLOW_URL}/request-validation`, async () => {
        patchCalls++;
        await gate;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: workflowWith('PENDING_VALIDATION', 'IN_NOTIFICATION'),
        });
      }),
    );

    const user = setupUser();
    renderActions();

    await user.click(await screen.findByRole('button', { name: 'Pedir validación' }));
    const confirm = await screen.findByRole('button', { name: 'Enviar a validación' });
    await user.click(confirm);

    await waitFor(() => expect(confirm).toBeDisabled());
    await user.click(confirm);

    release();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Expediente enviado a validación'),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(patchCalls).toBe(1);
  });

  it('un 409 CASEFLOW_011_NOT_PENDING muestra su toast y cierra el diálogo', async () => {
    mockWorkflow('PENDING_VALIDATION', 'IN_NOTIFICATION');
    server.use(
      http.patch(`${WORKFLOW_URL}/resolve-validation`, () =>
        HttpResponse.json(
          { ok: false, message: 'conflict', code: 'CASEFLOW_011_NOT_PENDING' },
          { status: 409 },
        ),
      ),
    );

    const user = setupUser();
    renderActions();

    await user.click(await screen.findByRole('button', { name: 'Resolver validación' }));
    await user.click(await screen.findByRole('button', { name: 'Resolver' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Este expediente ya no está pendiente de validación.',
      ),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

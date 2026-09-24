import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { ReactivateCaseWorkflowButton } from './ReactivateCaseWorkflowButton';

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

function mockCurrentUser(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReactivateCaseWorkflowButton caseWorkflowId="workflow-1" caseId="case-1" />
    </QueryClientProvider>,
  );
}

// SPEC FE24 §4 step 4
describe('ReactivateCaseWorkflowButton — ESAVI-CASEFLOW-005B', () => {
  it('con ADMIN no renderiza nada', async () => {
    mockCurrentUser('ADMIN', 50);
    renderButton();

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('con SUPERADMIN abre el diálogo y confirmar lanza un único PATCH con el caseWorkflowId', async () => {
    mockCurrentUser('SUPERADMIN', 100);
    const activatedIds: string[] = [];
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/activate/:id', ({ params }) => {
        activatedIds.push(params.id as string);
        return HttpResponse.json({ ok: true, message: 'ok' });
      }),
    );

    const user = setupUser();
    renderButton();

    await user.click(await screen.findByRole('button', { name: 'Reactivar registro' }));

    const dialog = await screen.findByRole('alertdialog', { name: '¿Reactivar el registro de flujo?' });
    expect(dialog).toHaveTextContent(
      'El expediente volverá a estar visible para todos los usuarios, en el estado en que quedó.',
    );

    // Trigger and confirm share the label; the confirm button is the last one in the DOM.
    const buttons = screen.getAllByRole('button', { name: 'Reactivar registro' });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Registro de flujo reactivado'));
    expect(activatedIds).toEqual(['workflow-1']);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('un 409 CASEFLOW_005B_ALREADY_ACTIVE muestra su toast y cierra el diálogo', async () => {
    mockCurrentUser('SUPERADMIN', 100);
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/activate/:id', () =>
        HttpResponse.json(
          { ok: false, message: 'conflict', code: 'CASEFLOW_005B_ALREADY_ACTIVE' },
          { status: 409 },
        ),
      ),
    );

    const user = setupUser();
    renderButton();

    await user.click(await screen.findByRole('button', { name: 'Reactivar registro' }));
    const buttons = await screen.findAllByRole('button', { name: 'Reactivar registro' });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Este registro de flujo ya estaba activo.'),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});

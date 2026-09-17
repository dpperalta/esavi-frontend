import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { ReopenCaseButton } from './ReopenCaseButton';

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
      <ReopenCaseButton caseId="case-1" />
    </QueryClientProvider>,
  );
}

// SPEC FE14b §4 paso 4
describe('ReopenCaseButton — ESAVI-CASEFLOW-009', () => {
  it('con USER no renderiza ningún botón', async () => {
    mockCurrentUser('USER', 25);
    renderButton();

    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('con ADMIN, confirmar hace un PATCH …/reopen', async () => {
    mockCurrentUser('ADMIN', 50);
    let reopenCalls = 0;
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/reopen', () => {
        reopenCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    const user = setupUser();
    renderButton();

    const openButton = await screen.findByRole('button', { name: 'Reabrir' });
    await user.click(openButton);

    // Two buttons now read "Reabrir": the trigger, behind the dialog overlay, and the dialog's
    // own confirm action — the confirm button is the last one in the DOM.
    const buttons = await screen.findAllByRole('button', { name: 'Reabrir' });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(reopenCalls).toBe(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Expediente reabierto.'));
  });

  it('cancelar no hace ningún PATCH', async () => {
    mockCurrentUser('ADMIN', 50);
    let reopenCalls = 0;
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/reopen', () => {
        reopenCalls++;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    const user = setupUser();
    renderButton();

    const openButton = await screen.findByRole('button', { name: 'Reabrir' });
    await user.click(openButton);

    const cancelButton = await screen.findByRole('button', { name: 'Cancelar' });
    await user.click(cancelButton);

    expect(reopenCalls).toBe(0);
  });

  it('un 403 AUTH_ROLE_FORBIDDEN muestra el toast propio', async () => {
    mockCurrentUser('ADMIN', 50);
    server.use(
      http.patch('http://localhost:4500/api/case-workflows/case/case-1/reopen', () =>
        HttpResponse.json({ ok: false, message: 'Rol insuficiente', code: 'AUTH_ROLE_FORBIDDEN' }, { status: 403 }),
      ),
    );

    const user = setupUser();
    renderButton();

    const openButton = await screen.findByRole('button', { name: 'Reabrir' });
    await user.click(openButton);

    const buttons = await screen.findAllByRole('button', { name: 'Reabrir' });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Tu rol ya no permite reabrir expedientes.'),
    );
  });
});

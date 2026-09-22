import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { SystemConfigFormDialog } from './SystemConfigFormDialog';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

const server = setupServer();

const SC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function renderDialog(systemConfigId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemConfigFormDialog open systemConfigId={systemConfigId} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

function baseSystemConfigRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    systemConfigId: SC_ID,
    code: 'ESAVI_APP_COUNTRY_ISO_CODE',
    name: 'País',
    description: null,
    value: 'ECU',
    valueType: 'string',
    scope: 'GLOBAL',
    isEncrypted: false,
    isEditable: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

describe('SystemConfigFormDialog — SPEC FE19 §4 paso 5', () => {
  it('crear una configuración con valueType json envía el value parseado, no el texto', async () => {
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost:4500/api/system-configs', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: baseSystemConfigRow({ systemConfigId: 'new-id' }),
        });
      }),
    );

    const user = setupUser();
    renderDialog(null);

    await user.type(screen.getByLabelText('Código'), 'ESAVI_NEW_PARAM');
    await user.type(screen.getByLabelText('Nombre'), 'Nuevo parámetro');
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '{"a":1}' } });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({
      code: 'ESAVI_NEW_PARAM',
      name: 'Nuevo parámetro',
      value: { a: 1 },
    });
  }, 60000);

  it('editar una fila cifrada muestra el valor en claro, no null', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: baseSystemConfigRow({ value: 'shh-secret', isEncrypted: true }),
        }),
      ),
    );

    renderDialog(SC_ID);

    expect(await screen.findByLabelText('Valor')).toHaveValue('shh-secret');
  });

  it('un PUT que reenvía la ficha sin tocarla no exige changeReason y responde 200', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() }),
      ),
    );
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/system-configs/${SC_ID}`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() });
      }),
    );

    const user = setupUser();
    renderDialog(SC_ID);

    await screen.findByLabelText('Valor');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ value: 'ECU' });
    expect(requestBody).not.toHaveProperty('changeReason', expect.stringMatching(/.+/));
  }, 60000);

  it('tocar el valor sin indicar el motivo bloquea el envío', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() }),
      ),
    );
    let putCalled = false;
    server.use(
      http.put(`http://localhost:4500/api/system-configs/${SC_ID}`, () => {
        putCalled = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() });
      }),
    );

    const user = setupUser();
    renderDialog(SC_ID);

    const valueInput = await screen.findByLabelText('Valor');
    await user.clear(valueInput);
    await user.type(valueInput, 'PER');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Indica el motivo del cambio antes de guardar.'),
    ).toBeInTheDocument();
    expect(putCalled).toBe(false);
  }, 60000);

  it('con motivo indicado, un cambio de valor sí se envía', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() }),
      ),
    );
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/system-configs/${SC_ID}`, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() });
      }),
    );

    const user = setupUser();
    renderDialog(SC_ID);

    const valueInput = await screen.findByLabelText('Valor');
    await user.clear(valueInput);
    await user.type(valueInput, 'PER');
    await user.type(screen.getByLabelText('Motivo del cambio'), 'Corrección acordada con soporte');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ value: 'PER', changeReason: 'Corrección acordada con soporte' });
  }, 60000);

  it('un 409 SYSCONF_004_NOT_EDITABLE aparece sobre el campo isEditable', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() }),
      ),
      http.put(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Esta configuración está protegida contra edición.', code: 'SYSCONF_004_NOT_EDITABLE' },
          { status: 409 },
        ),
      ),
    );

    const user = setupUser();
    renderDialog(SC_ID);

    await screen.findByLabelText('Valor');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Esta configuración está protegida contra edición.'),
    ).toBeInTheDocument();
  }, 60000);

  it('un 403 AUTH_ROLE_FORBIDDEN muestra el aviso propio de SUPERADMIN', async () => {
    server.use(
      http.get(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: baseSystemConfigRow() }),
      ),
      http.put(`http://localhost:4500/api/system-configs/${SC_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Rol insuficiente', code: 'AUTH_ROLE_FORBIDDEN' },
          { status: 403 },
        ),
      ),
    );

    const user = setupUser();
    renderDialog(SC_ID);

    await screen.findByLabelText('Valor');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(
      'Administrar configuraciones exige un superadministrador en este despliegue.',
    );
  }, 60000);
});

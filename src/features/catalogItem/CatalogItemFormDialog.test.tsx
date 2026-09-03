import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { CatalogItem } from '@/contracts/declared/catalogItem';
import { CatalogItemFormDialog } from './CatalogItemFormDialog';

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

function makeRow(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    catalogItemId: 'ci-1',
    catalogTypeId: 'ct-1',
    code: 'DEATH',
    name: 'Muerte',
    value: 'DEATH',
    isValueLocked: false,
    description: null,
    sortOrder: 1,
    metadata: null,
    isActive: true,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function Harness({ catalogItemId = null as string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reabrir
      </button>
      <CatalogItemFormDialog
        open={open}
        catalogItemId={catalogItemId}
        catalogTypeId="ct-1"
        onOpenChange={setOpen}
      />
    </>
  );
}

function renderHarness(catalogItemId: string | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness catalogItemId={catalogItemId} />
    </QueryClientProvider>,
  );
}

describe('CatalogItemFormDialog — crear', () => {
  it('un 409 con CATITEM_001_CODE_EXISTS marca el campo code y no abre un toast', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/catalog-items', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe un elemento con el código deathOutcome',
            code: 'CATITEM_001_CODE_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderHarness();

    await user.type(screen.getByLabelText('Nombre'), 'Muerte');
    await user.type(screen.getByLabelText('Valor'), 'DEATH');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Ya existe un elemento con el código deathOutcome'),
    ).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('CatalogItemFormDialog — editar, fila congelada (isValueLocked)', () => {
  it('el input de value está deshabilitado, el texto de ayuda es visible, y el PUT no lleva value', async () => {
    const user = setupUser();
    let putBody: unknown = null;
    server.use(
      http.get('http://localhost:4500/api/catalog-items/ci-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ isValueLocked: true }) }),
      ),
      http.put('http://localhost:4500/api/catalog-items/ci-1', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: makeRow({ isValueLocked: true }),
        });
      }),
    );

    renderHarness('ci-1');

    const valueInput = await screen.findByLabelText('Valor');
    expect(valueInput).toBeDisabled();
    expect(
      screen.getByText(
        'El sistema usa este valor internamente y no se puede cambiar. El código y el nombre sí se pueden editar.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).not.toHaveProperty('value');
  });
});

describe('CatalogItemFormDialog — editar, fila no congelada', () => {
  it('el mismo PUT sí envía value', async () => {
    const user = setupUser();
    let putBody: unknown = null;
    server.use(
      http.get('http://localhost:4500/api/catalog-items/ci-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: makeRow({ isValueLocked: false }) }),
      ),
      http.put('http://localhost:4500/api/catalog-items/ci-1', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: makeRow({ isValueLocked: false }),
        });
      }),
    );

    renderHarness('ci-1');

    const valueInput = await screen.findByLabelText('Valor');
    expect(valueInput).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toHaveProperty('value', 'DEATH');
  });
});

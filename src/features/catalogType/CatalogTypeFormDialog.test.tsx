import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CatalogTypeFormDialog } from './CatalogTypeFormDialog';

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

// Mirrors how CatalogTypeListPage owns the dialog's state: it never unmounts
// <CatalogTypeFormDialog>, only toggles `open` — a "Reabrir" button here stands in for
// clicking "Crear" again after closing.
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reabrir
      </button>
      <CatalogTypeFormDialog open={open} catalogTypeId={null} onOpenChange={setOpen} />
    </>
  );
}

function renderHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe('CatalogTypeFormDialog — el error de una mutación no sobrevive al cierre', () => {
  it('un 409 por código duplicado no reaparece al cancelar y reabrir para crear otro', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/catalog-types', () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Un tipo de catálogo con el código medicalInformation ya existe',
            code: 'CATTYPE_001_CODE_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderHarness();

    await user.type(screen.getByLabelText('Nombre'), 'Información médica');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Un tipo de catálogo con el código medicalInformation ya existe'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveValue(''));
    expect(
      screen.queryByText('Un tipo de catálogo con el código medicalInformation ya existe'),
    ).not.toBeInTheDocument();
  });
});

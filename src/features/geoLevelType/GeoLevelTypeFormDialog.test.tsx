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
import { GeoLevelTypeFormDialog } from './GeoLevelTypeFormDialog';

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

// Mirrors how GeoLevelTypeListPage owns the dialog's state: it never unmounts
// <GeoLevelTypeFormDialog>, only toggles `open`.
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reabrir
      </button>
      <GeoLevelTypeFormDialog open={open} geoLevelTypeId={null} onOpenChange={setOpen} />
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

describe('GeoLevelTypeFormDialog — mapeo de errores', () => {
  it('un 409 con GEOTYPE_001_CODE_EXISTS marca el campo código, no un toast genérico', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/geo-level-types', () =>
        HttpResponse.json(
          { ok: false, message: 'Ya existe un nivel geográfico con el código CTRY', code: 'GEOTYPE_001_CODE_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderHarness();

    await user.type(screen.getByLabelText('Código'), 'CTRY');
    await user.type(screen.getByLabelText('Nombre'), 'País');
    await user.type(screen.getByLabelText('Orden'), '1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Ya existe un nivel geográfico con el código CTRY'),
    ).toBeInTheDocument();
  });

  it('el error de una mutación no sobrevive al cierre', async () => {
    const user = setupUser();
    server.use(
      http.post('http://localhost:4500/api/geo-level-types', () =>
        HttpResponse.json(
          { ok: false, message: 'Ya existe un nivel geográfico con el código CTRY', code: 'GEOTYPE_001_CODE_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderHarness();

    await user.type(screen.getByLabelText('Código'), 'CTRY');
    await user.type(screen.getByLabelText('Nombre'), 'País');
    await user.type(screen.getByLabelText('Orden'), '1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Ya existe un nivel geográfico con el código CTRY'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveValue(''));
    expect(
      screen.queryByText('Ya existe un nivel geográfico con el código CTRY'),
    ).not.toBeInTheDocument();
  });
});

describe('GeoLevelTypeFormDialog — validación de sortOrder', () => {
  it('sortOrder: 0 falla la validación del cliente, sin llegar a mandar el POST', async () => {
    const user = setupUser();
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/geo-level-types', () => {
        postCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    renderHarness();

    await user.type(screen.getByLabelText('Código'), 'CTRY');
    await user.type(screen.getByLabelText('Nombre'), 'País');
    await user.type(screen.getByLabelText('Orden'), '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(postCount).toBe(0));
  });
});

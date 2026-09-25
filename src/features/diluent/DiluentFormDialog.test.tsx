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
import type { Diluent } from '@/contracts/declared/diluent';
import { DiluentFormDialog } from './DiluentFormDialog';

const API = 'http://localhost:4500/api';
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

function diluent(overrides: Partial<Diluent> = {}): Diluent {
  return {
    diluentCatalogId: 'd-1',
    code: 'AGUA_DESTILADA',
    name: 'Agua destilada',
    description: null,
    composition: 'H2O',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function serveDetail(row: Diluent) {
  server.use(
    http.get(`${API}/diluents/${row.diluentCatalogId}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: row }),
    ),
  );
}

// The list page never unmounts the dialog, only toggles `open` — "Reabrir" stands in for
// clicking "Crear diluyente" again.
function Harness({ diluentId }: { diluentId: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reabrir
      </button>
      <DiluentFormDialog open={open} diluentId={diluentId} onOpenChange={setOpen} />
    </>
  );
}

function renderDialog(diluentId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness diluentId={diluentId} />
    </QueryClientProvider>,
  );
}

const CODE_EXISTS_TEXT =
  'Ya existe un diluyente con este código. Puede pertenecer a un diluyente dado de baja.';

describe('DiluentFormDialog — crear', () => {
  it('un 409 DILUENT_001_CODE_EXISTS pinta el error bajo code, con el texto que menciona las bajas', async () => {
    const user = setupUser();
    server.use(
      http.post(`${API}/diluents`, () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'Ya existe un diluyente con el código AGUA',
            code: 'DILUENT_001_CODE_EXISTS',
          },
          { status: 409 },
        ),
      ),
    );

    renderDialog(null);

    await user.type(screen.getByLabelText('Código'), 'agua');
    await user.type(screen.getByLabelText('Nombre'), 'Agua');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(CODE_EXISTS_TEXT)).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true');
  });

  it('el error del 409 no reaparece al cancelar y reabrir', async () => {
    const user = setupUser();
    server.use(
      http.post(`${API}/diluents`, () =>
        HttpResponse.json(
          { ok: false, message: 'x', code: 'DILUENT_001_CODE_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderDialog(null);

    await user.type(screen.getByLabelText('Código'), 'agua');
    await user.type(screen.getByLabelText('Nombre'), 'Agua');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(CODE_EXISTS_TEXT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByLabelText('Código')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveValue(''));
    expect(screen.queryByText(CODE_EXISTS_TEXT)).not.toBeInTheDocument();
  });

  it('envía description y composition vacíos como null', async () => {
    const user = setupUser();
    let body: unknown;
    server.use(
      http.post(`${API}/diluents`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: diluent() }, { status: 201 });
      }),
    );

    renderDialog(null);

    await user.type(screen.getByLabelText('Código'), 'agua destilada');
    await user.type(screen.getByLabelText('Nombre'), 'Agua destilada');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(body).toEqual({
        code: 'agua destilada',
        name: 'Agua destilada',
        description: null,
        composition: null,
      }),
    );
  });

  it('muestra la ayuda de normalización del código', () => {
    renderDialog(null);

    expect(screen.getByText('Se guardará en mayúsculas con guiones bajos.')).toBeInTheDocument();
  });
});

describe('DiluentFormDialog — editar', () => {
  it('el PUT lleva los cuatro campos', async () => {
    const user = setupUser();
    let body: unknown;
    serveDetail(diluent());
    server.use(
      http.put(`${API}/diluents/d-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: diluent() });
      }),
    );

    renderDialog('d-1');

    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue('Agua destilada'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(body).toEqual({
        code: 'AGUA_DESTILADA',
        name: 'Agua destilada',
        description: null,
        composition: 'H2O',
      }),
    );
  });

  it('una fila con code OTHER muestra el aviso y deja guardar', async () => {
    const user = setupUser();
    let saved = false;
    serveDetail(diluent({ code: 'OTHER', name: 'Otro' }));
    server.use(
      http.put(`${API}/diluents/d-1`, () => {
        saved = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: diluent() });
      }),
    );

    renderDialog('d-1');

    expect(await screen.findByRole('note')).toHaveTextContent(
      'El paso de notificación usa este diluyente',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saved).toBe(true));
  });

  it('el aviso depende del code guardado, no del tecleado', async () => {
    const user = setupUser();
    serveDetail(diluent());

    renderDialog('d-1');

    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveValue('AGUA_DESTILADA'));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Código'));
    await user.type(screen.getByLabelText('Código'), 'OTHER');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('los campos están deshabilitados hasta que llega el 003', async () => {
    serveDetail(diluent());

    renderDialog('d-1');

    expect(screen.getByLabelText('Código')).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText('Código')).toBeEnabled());
  });

  it('un 404 DILUENT_003_NOT_FOUND cierra el diálogo', async () => {
    server.use(
      http.get(`${API}/diluents/d-1`, () =>
        HttpResponse.json(
          { ok: false, message: 'no', code: 'DILUENT_003_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    renderDialog('d-1');

    await waitFor(() => expect(screen.queryByLabelText('Código')).not.toBeInTheDocument());
  });
});

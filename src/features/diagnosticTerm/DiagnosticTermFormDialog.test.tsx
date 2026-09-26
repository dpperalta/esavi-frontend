import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DiagnosticTerm } from '@/contracts/declared/diagnosticTerm';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DiagnosticTermFormDialog } from './DiagnosticTermFormDialog';

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

function term(overrides: Partial<DiagnosticTerm> = {}): DiagnosticTerm {
  return {
    diagnosticTermId: 't-1',
    source: 'MEDDRA',
    code: '10016558',
    name: 'Fiebre',
    termGroup: 'LLT',
    metadata: {},
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function serveDetail(row: DiagnosticTerm) {
  server.use(
    http.get(`${API}/diagnostic-terms/${row.diagnosticTermId}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: row }),
    ),
  );
}

// The list page never unmounts the dialog, only toggles `open`.
function Harness({ diagnosticTermId }: { diagnosticTermId: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reabrir
      </button>
      <DiagnosticTermFormDialog
        open={open}
        diagnosticTermId={diagnosticTermId}
        onOpenChange={setOpen}
      />
    </>
  );
}

function renderDialog(diagnosticTermId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness diagnosticTermId={diagnosticTermId} />
    </QueryClientProvider>,
  );
}

const CODE_EXISTS_UPDATE_TEXT =
  'Ya existe otro término con esta fuente y este código. Puede pertenecer a un término dado de baja.';

describe('DiagnosticTermFormDialog — crear', () => {
  it('envía source LOCAL por defecto, sin termGroup vacío ni reviewStatus', async () => {
    const user = setupUser();
    let body: unknown;
    server.use(
      http.post(`${API}/diagnostic-terms`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: term() }, { status: 201 });
      }),
    );

    renderDialog(null);

    expect(screen.queryByText('Revisión')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Código'), 'fiebre local');
    await user.type(screen.getByLabelText('Nombre'), 'Fiebre alta');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(body).toEqual({ source: 'LOCAL', code: 'fiebre local', name: 'Fiebre alta' }),
    );
  });

  it('muestra la ayuda de normalización del código', () => {
    renderDialog(null);

    expect(screen.getByText('Se guardará en mayúsculas con guiones bajos.')).toBeInTheDocument();
  });
});

describe('DiagnosticTermFormDialog — editar', () => {
  it('un 409 DIAGTERM_004_CODE_EXISTS pinta el error bajo code', async () => {
    const user = setupUser();
    serveDetail(term());
    server.use(
      http.put(`${API}/diagnostic-terms/t-1`, () =>
        HttpResponse.json(
          { ok: false, message: 'exists', code: 'DIAGTERM_004_CODE_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderDialog('t-1');

    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue('Fiebre'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(CODE_EXISTS_UPDATE_TEXT)).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true');
  });

  it('con metadata: {} muestra «Sin marcar» y el PUT no lleva reviewStatus ni source', async () => {
    const user = setupUser();
    let body: Record<string, unknown> | undefined;
    serveDetail(term({ termGroup: null }));
    server.use(
      http.put(`${API}/diagnostic-terms/t-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: term() });
      }),
    );

    renderDialog('t-1');

    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue('Fiebre'));
    expect(screen.getByRole('combobox', { name: 'Revisión' })).toHaveTextContent('Sin marcar');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(body).toEqual({ code: '10016558', name: 'Fiebre', termGroup: null }),
    );
  });

  it('una fila PENDING no ofrece «Sin marcar», y aprobarla envía reviewStatus', async () => {
    const user = setupUser();
    let body: Record<string, unknown> | undefined;
    serveDetail(term({ metadata: { reviewStatus: 'PENDING' } }));
    server.use(
      http.put(`${API}/diagnostic-terms/t-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: term() });
      }),
    );

    renderDialog('t-1');

    // The form remounts once the 003 arrives, so the trigger is queried only after that.
    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveValue('Fiebre'));
    const trigger = screen.getByRole('combobox', { name: 'Revisión' });
    expect(trigger).toHaveTextContent('Pendiente');
    await user.click(trigger);

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Pendiente', 'Aprobado']);

    await user.click(screen.getByRole('option', { name: 'Aprobado' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(body).toMatchObject({ reviewStatus: 'APPROVED' }));
    expect(body).not.toHaveProperty('source');
  });

  it('muestra la fuente de solo lectura', async () => {
    serveDetail(term());

    renderDialog('t-1');

    await waitFor(() => expect(screen.getByLabelText('Fuente')).toHaveValue('MedDRA'));
    expect(screen.getByLabelText('Fuente')).toHaveAttribute('readonly');
    expect(
      screen.getByText('La fuente no se puede cambiar una vez creado el término.'),
    ).toBeInTheDocument();
  });

  it('un término autogenerado muestra el aviso informativo', async () => {
    serveDetail(
      term({
        source: 'LOCAL',
        metadata: {
          autoCreated: true,
          createdFrom: 'ESAVI-NOTIFEVENT-001',
          reviewStatus: 'PENDING',
        },
      }),
    );

    renderDialog('t-1');

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Creado automáticamente desde una notificación.',
    );
  });

  it('un DIAGTERM_003_NOT_FOUND cierra el diálogo', async () => {
    server.use(
      http.get(`${API}/diagnostic-terms/t-1`, () =>
        HttpResponse.json(
          { ok: false, message: 'not found', code: 'DIAGTERM_003_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    );

    renderDialog('t-1');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

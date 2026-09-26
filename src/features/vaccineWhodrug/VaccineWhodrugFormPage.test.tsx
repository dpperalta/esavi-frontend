import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { VaccineWhodrugFormPage } from './VaccineWhodrugFormPage';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const server = setupServer();
const VACCINE_ID = 'b3f1c2d4-0000-4000-8000-000000000001';
const NEW_ID = 'b3f1c2d4-0000-4000-8000-000000000002';
const BASE_URL = 'http://localhost:4500/api/whodrug-vaccines';

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
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: 'me-1',
          roles: [{ roleId: 'r1', name: 'ADMIN', code: 'ADMIN', level: 50 }],
        },
      }),
    ),
  );
});

function buildVaccine(overrides: Partial<VaccineWhodrugDetail> = {}): VaccineWhodrugDetail {
  return {
    vaccineWhodrugId: VACCINE_ID,
    externalId: 1001,
    drugCode: '000001 01 001',
    drugRecNo: '000001',
    drugRecNoSeq: '01',
    drugName: 'BCG Vaccine',
    language: 'es',
    medicinalProductId: null,
    atcs: 'J07AN01',
    icd11: null,
    icd11Term: null,
    abbreviation: 'BCG',
    ingredient: null,
    ingredientTranslation: 'Mycobacterium bovis',
    languageCode: null,
    iso3Code: 'ECU',
    countryMedicinalProductId: null,
    maHolders: 'Serum Institute',
    maHoldersMedicinalProductId: null,
    form: null,
    formTranslations: 'Polvo',
    formMedicinalProductId: null,
    strength: '0.05 mg',
    strengthMedicinalProductId: null,
    noDose: null,
    diluent: null,
    isGeneric: null,
    isPreferred: true,
    notes: null,
    metadata: {},
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function mockDetail(data: VaccineWhodrugDetail) {
  server.use(
    http.get(`${BASE_URL}/${VACCINE_ID}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data }),
    ),
  );
}

function renderPage(initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path: '/whodrug-vaccines/new', element: <VaccineWhodrugFormPage /> },
      { path: '/whodrug-vaccines/:id/edit', element: <VaccineWhodrugFormPage /> },
      { path: '/whodrug-vaccines/:id', element: <p>detalle</p> },
      { path: '/whodrug-vaccines', element: <p>listado</p> },
    ],
    { initialEntries: [initialEntry] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const EDIT_PATH = `/whodrug-vaccines/${VACCINE_ID}/edit`;

describe('VaccineWhodrugFormPage — edición (SPEC FE25c §4 paso 8)', () => {
  it('el PUT lleva los 28 campos, con null en los vacíos, y navega al detalle', async () => {
    const user = setupUser();
    mockDetail(buildVaccine());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put(`${BASE_URL}/${VACCINE_ID}`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: buildVaccine() });
      }),
    );

    const router = renderPage(EDIT_PATH);
    await screen.findByLabelText('Código del fármaco');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/whodrug-vaccines/${VACCINE_ID}`),
    );
    expect(Object.keys(body!)).toHaveLength(28);
    expect(body!.icd11).toBeNull();
    expect(body!.isGeneric).toBeNull();
    expect(body!.isPreferred).toBe(true);
    expect(body!.drugName).toBe('BCG Vaccine');
  });

  it('un 409 WHODRUG_004_EXTERNAL_ID_EXISTS pinta el error bajo externalId', async () => {
    const user = setupUser();
    mockDetail(buildVaccine());
    server.use(
      http.put(`${BASE_URL}/${VACCINE_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'exists', code: 'WHODRUG_004_EXTERNAL_ID_EXISTS', errors: [] },
          { status: 409 },
        ),
      ),
    );

    const router = renderPage(EDIT_PATH);
    await screen.findByLabelText('Código del fármaco');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(
        'Ya existe otra vacuna con este id externo. Puede pertenecer a una vacuna dada de baja.',
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(EDIT_PATH);
  });

  it('una fila con externalId muestra el aviso de sobrescritura', async () => {
    mockDetail(buildVaccine());

    renderPage(EDIT_PATH);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'La próxima importación sobrescribirá los cambios, salvo las notas.',
    );
  });

  it('una fila sin externalId no muestra el aviso', async () => {
    mockDetail(buildVaccine({ externalId: null }));

    renderPage(EDIT_PATH);
    await screen.findByLabelText('Código del fármaco');

    expect(screen.queryByText(/La próxima importación sobrescribirá/)).not.toBeInTheDocument();
  });

  it('sin tocar nada, «Cancelar» vuelve directamente al detalle', async () => {
    const user = setupUser();
    mockDetail(buildVaccine());

    const router = renderPage(EDIT_PATH);
    await screen.findByLabelText('Código del fármaco');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/whodrug-vaccines/${VACCINE_ID}`);
  });

  it('con un campo tocado, «Cancelar» pide confirmación; «Seguir editando» se queda', async () => {
    const user = setupUser();
    mockDetail(buildVaccine());

    const router = renderPage(EDIT_PATH);
    await user.type(await screen.findByLabelText('Notas'), 'Corregido a mano');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(router.state.location.pathname).toBe(EDIT_PATH);
    expect(screen.getByLabelText('Notas')).toHaveValue('Corregido a mano');
  });

  it('con cambios, «Volver al listado» pide confirmación y «Descartar» navega', async () => {
    const user = setupUser();
    mockDetail(buildVaccine());

    const router = renderPage(EDIT_PATH);
    await user.type(await screen.findByLabelText('Notas'), 'x');
    await user.click(screen.getByRole('button', { name: 'Volver al listado' }));
    await user.click(await screen.findByRole('button', { name: 'Descartar cambios' }));

    expect(router.state.location.pathname).toBe('/whodrug-vaccines');
  });

  it('beforeunload solo se bloquea con cambios sin guardar', async () => {
    const user = setupUser();
    mockDetail(buildVaccine());

    renderPage(EDIT_PATH);
    await screen.findByLabelText('Notas');

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Notas'), 'x');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('un 404 del 003 muestra «no existe»', async () => {
    server.use(
      http.get(`${BASE_URL}/${VACCINE_ID}`, () =>
        HttpResponse.json(
          { ok: false, message: 'nf', code: 'WHODRUG_003_NOT_FOUND', errors: [] },
          { status: 404 },
        ),
      ),
    );

    renderPage(EDIT_PATH);

    expect(await screen.findByText('La vacuna no existe o está dada de baja.')).toBeInTheDocument();
  });
});

describe('VaccineWhodrugFormPage — alta', () => {
  it('crea con isPreferred: false e isGeneric null, y navega al detalle de la nueva fila', async () => {
    const user = setupUser();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(BASE_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: buildVaccine({ vaccineWhodrugId: NEW_ID, externalId: null }),
        });
      }),
    );

    const router = renderPage('/whodrug-vaccines/new');
    expect(screen.getByRole('heading', { name: 'Nueva vacuna WHODrug' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Código del fármaco'), '  BCG 01  ');
    await user.type(screen.getByLabelText('Nombre del fármaco'), 'BCG');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/whodrug-vaccines/${NEW_ID}`));
    expect(body!.drugCode).toBe('BCG 01');
    expect(body!.isPreferred).toBe(false);
    expect(body!.isGeneric).toBeNull();
    expect(body!.externalId).toBeNull();
  });

  it('sin drugName no envía nada', async () => {
    const user = setupUser();
    let posted = false;
    server.use(
      http.post(BASE_URL, () => {
        posted = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: buildVaccine() });
      }),
    );

    renderPage('/whodrug-vaccines/new');
    await user.type(screen.getByLabelText('Código del fármaco'), 'BCG 01');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del fármaco')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(posted).toBe(false);
  });

  it('en alta, «Cancelar» sin cambios vuelve al listado', async () => {
    const user = setupUser();

    const router = renderPage('/whodrug-vaccines/new');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(router.state.location.pathname).toBe('/whodrug-vaccines');
  });
});

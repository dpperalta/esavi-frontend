import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { VaccineWhodrugDetailPage } from './VaccineWhodrugDetailPage';

const server = setupServer();
const VACCINE_ID = 'b3f1c2d4-0000-4000-8000-000000000001';
const DETAIL_URL = `http://localhost:4500/api/whodrug-vaccines/${VACCINE_ID}`;

let meServed = false;

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
  meServed = false;
});

function signInAs(roleName: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () => {
      meServed = true;
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: 'me-1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      });
    }),
  );
}

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
  server.use(http.get(DETAIL_URL, () => HttpResponse.json({ ok: true, message: 'ok', data })));
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/whodrug-vaccines/:id', element: <VaccineWhodrugDetailPage /> },
      { path: '/whodrug-vaccines/:id/edit', element: <p>formulario</p> },
      { path: '/whodrug-vaccines', element: <p>listado</p> },
    ],
    { initialEntries: [`/whodrug-vaccines/${VACCINE_ID}`] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('VaccineWhodrugDetailPage (SPEC FE25c §4 paso 7)', () => {
  it('pinta la cabecera, los badges y las seis secciones', async () => {
    signInAs('USER', 25);
    mockDetail(buildVaccine());

    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'BCG Vaccine' }),
    ).toBeInTheDocument();
    expect(screen.getByText('000001 01 001', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getAllByText('Preferido').length).toBeGreaterThan(0);

    for (const section of [
      'Identificación',
      'Clasificación',
      'Composición',
      'País y registro',
      'Presentación',
      'Notas',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('definition')).toHaveLength(28);
  });

  it('pinta «—» con texto accesible en los vacíos y Sí/No en los booleanos', async () => {
    signInAs('USER', 25);
    mockDetail(buildVaccine({ isGeneric: false }));

    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'BCG Vaccine' });

    const classification = screen
      .getByRole('heading', { level: 2, name: 'Clasificación' })
      .closest('section')!;
    const icd11 = within(classification).getByText('CIE-11').nextElementSibling!;
    expect(icd11).toHaveTextContent('—');
    expect(icd11).toHaveTextContent('Sin dato');
    const isGeneric = within(classification).getByText('Genérico').nextElementSibling!;
    expect(isGeneric).toHaveTextContent('No');
    const isPreferred = within(classification).getByText('Preferido', {
      selector: 'dt',
    }).nextElementSibling!;
    expect(isPreferred).toHaveTextContent('Sí');
  });

  it('con USER no aparecen «Editar» ni «Ver auditoría»', async () => {
    signInAs('USER', 25);
    mockDetail(buildVaccine());

    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'BCG Vaccine' });
    await waitFor(() => expect(meServed).toBe(true));

    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver auditoría' })).not.toBeInTheDocument();
  });

  it('con ADMIN y una fila activa aparece «Editar», que lleva al formulario; sin auditoría', async () => {
    signInAs('ADMIN', 50);
    mockDetail(buildVaccine());

    const router = renderPage();

    const edit = await screen.findByRole('link', { name: 'Editar' });
    expect(screen.queryByRole('button', { name: 'Ver auditoría' })).not.toBeInTheDocument();

    await setupUser().click(edit);
    expect(router.state.location.pathname).toBe(`/whodrug-vaccines/${VACCINE_ID}/edit`);
  });

  it('con SUPERADMIN y una fila inactiva aparecen «Editar» y «Ver auditoría», que abre el panel', async () => {
    signInAs('SUPERADMIN', 100);
    mockDetail(buildVaccine({ isActive: false }));

    renderPage();

    expect(await screen.findByRole('link', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();

    await setupUser().click(screen.getByRole('button', { name: 'Ver auditoría' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('un 404 muestra «no existe» con el enlace de vuelta al listado', async () => {
    signInAs('ADMIN', 50);
    server.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'not found', code: 'WHODRUG_003_NOT_FOUND', errors: [] },
          { status: 404 },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText('La vacuna no existe o está dada de baja.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al listado' })).toHaveAttribute(
      'href',
      '/whodrug-vaccines',
    );
  });

  it('otro error muestra el mensaje y «Reintentar»', async () => {
    signInAs('USER', 25);
    server.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'boom', code: 'WHODRUG_003_FETCH_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

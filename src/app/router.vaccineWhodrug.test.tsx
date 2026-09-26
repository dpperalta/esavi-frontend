import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { HomePage } from '@/features/home/HomePage';
import { VaccineWhodrugDetailPage } from '@/features/vaccineWhodrug/VaccineWhodrugDetailPage';
import { VaccineWhodrugFormPage } from '@/features/vaccineWhodrug/VaccineWhodrugFormPage';
import { VaccineWhodrugImportPage } from '@/features/vaccineWhodrug/VaccineWhodrugImportPage';
import { VaccineWhodrugListPage } from '@/features/vaccineWhodrug/VaccineWhodrugListPage';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { RequireRole } from '@/shared/components/RequireRole';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { setupUser } from '@/test/user';
import { AppShell } from './layout/AppShell';

const API = 'http://localhost:4500/api';
const VACCINE_ID = 'b3f1c2d4-0000-4000-8000-000000000001';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function vaccine(): VaccineWhodrugDetail {
  return {
    vaccineWhodrugId: VACCINE_ID,
    externalId: null,
    drugCode: '000001 01 001',
    drugRecNo: null,
    drugRecNoSeq: null,
    drugName: 'BCG Vaccine',
    language: null,
    medicinalProductId: null,
    atcs: null,
    icd11: null,
    icd11Term: null,
    abbreviation: null,
    ingredient: null,
    ingredientTranslation: null,
    languageCode: null,
    iso3Code: null,
    countryMedicinalProductId: null,
    maHolders: null,
    maHoldersMedicinalProductId: null,
    form: null,
    formTranslations: null,
    formMedicinalProductId: null,
    strength: null,
    strengthMedicinalProductId: null,
    noDose: null,
    diluent: null,
    isGeneric: null,
    isPreferred: false,
    notes: null,
    metadata: {},
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
}

// `onUnhandledRequest: 'error'` makes any GET /whodrug-vaccines/import or /new — "import" or "new"
// read as an id — fail the test on its own.
function signInAs(roleName: string, level: number) {
  tokenStore.setRefreshToken('a-refresh-token');
  setAccessToken('a-token');
  server.use(
    http.get(`${API}/users/me`, () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: '1',
          displayName: 'Persona de prueba',
          roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
        },
      }),
    ),
    http.get(`${API}/whodrug-vaccines`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
    http.get(`${API}/whodrug-vaccines/${VACCINE_ID}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: vaccine() }),
    ),
  );
}

// Mirrors the real nesting and order of app/router.tsx: the ADMIN and SUPERADMIN groups, which
// hold /new, /:id/edit and /import, come before the USER group that holds /:id (SPEC FE25c §3.1).
function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>login-screen</div>} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<HomePage />} />
                <Route element={<RequireRole level={ROLE_LEVELS.ADMIN} />}>
                  <Route path="/whodrug-vaccines/new" element={<VaccineWhodrugFormPage />} />
                  <Route path="/whodrug-vaccines/:id/edit" element={<VaccineWhodrugFormPage />} />
                </Route>
                <Route element={<RequireRole level={ROLE_LEVELS.SUPERADMIN} />}>
                  <Route path="/whodrug-vaccines/import" element={<VaccineWhodrugImportPage />} />
                </Route>
                <Route element={<RequireRole level={ROLE_LEVELS.USER} />}>
                  <Route path="/whodrug-vaccines" element={<VaccineWhodrugListPage />} />
                  <Route path="/whodrug-vaccines/:id" element={<VaccineWhodrugDetailPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Ruta /whodrug-vaccines — navegación desde el sidebar', () => {
  it('con USER, el ítem ya no dice «Próximamente» y lleva al listado', async () => {
    const user = setupUser();
    signInAs('USER', 25);

    renderApp('/');

    const link = await screen.findByRole('link', { name: 'Vacunas WHODrug' });
    expect(link).not.toHaveTextContent('Próximamente');
    await user.click(link);

    expect(await screen.findByRole('heading', { name: 'Vacunas WHODrug' })).toBeInTheDocument();
  });

  it('con ANALYTICS la entrada del menú no aparece', async () => {
    signInAs('ANALYTICS', 10);

    renderApp('/');

    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Vacunas WHODrug' })).not.toBeInTheDocument();
  });

  it('ni la importación ni el alta tienen entrada de menú, ni siquiera con SUPERADMIN', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/');

    await screen.findByRole('link', { name: 'Vacunas WHODrug' });
    expect(screen.queryByRole('link', { name: /importar diccionario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /crear vacuna/i })).not.toBeInTheDocument();
  });
});

describe('Rutas /whodrug-vaccines/* — autorización (SPEC FE25c §4 paso 11)', () => {
  it('sin sesión redirige al login', async () => {
    renderApp('/whodrug-vaccines');

    expect(await screen.findByText('login-screen')).toBeInTheDocument();
  });

  it('con USER, /whodrug-vaccines/<id> abre el detalle', async () => {
    signInAs('USER', 25);

    renderApp(`/whodrug-vaccines/${VACCINE_ID}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'BCG Vaccine' }),
    ).toBeInTheDocument();
  });

  it('con USER, /whodrug-vaccines/new redirige a / sin pantalla en blanco', async () => {
    signInAs('USER', 25);

    renderApp('/whodrug-vaccines/new');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Nueva vacuna WHODrug' })).not.toBeInTheDocument();
  });

  it('con USER, /whodrug-vaccines/<id>/edit redirige a /', async () => {
    signInAs('USER', 25);

    renderApp(`/whodrug-vaccines/${VACCINE_ID}/edit`);

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(
      screen.queryByRole('heading', { name: 'Editar vacuna WHODrug' }),
    ).not.toBeInTheDocument();
  });

  it('con ADMIN, /whodrug-vaccines/new abre el alta y no el detalle', async () => {
    signInAs('ADMIN', 50);

    renderApp('/whodrug-vaccines/new');

    expect(
      await screen.findByRole('heading', { name: 'Nueva vacuna WHODrug' }),
    ).toBeInTheDocument();
  });

  it('con ADMIN, /whodrug-vaccines/<id>/edit abre la edición', async () => {
    signInAs('ADMIN', 50);

    renderApp(`/whodrug-vaccines/${VACCINE_ID}/edit`);

    expect(
      await screen.findByRole('heading', { name: 'Editar vacuna WHODrug' }),
    ).toBeInTheDocument();
  });

  it('con ADMIN, /whodrug-vaccines/import redirige a / y no se lee como un id', async () => {
    signInAs('ADMIN', 50);

    renderApp('/whodrug-vaccines/import');

    await waitFor(() => expect(screen.getByText(/Hola,/)).toBeInTheDocument());
    expect(
      screen.queryByRole('heading', { name: 'Importar diccionario WHODrug' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('La vacuna no existe o está dada de baja.')).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, /whodrug-vaccines/import abre la importación, nunca el detalle', async () => {
    signInAs('SUPERADMIN', 100);

    renderApp('/whodrug-vaccines/import');

    expect(
      await screen.findByRole('heading', { name: 'Importar diccionario WHODrug' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('La vacuna no existe o está dada de baja.')).not.toBeInTheDocument();
  });
});

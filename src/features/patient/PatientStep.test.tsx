import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { PatientStep } from './PatientStep';

const server = setupServer();

const PATIENT_1 = '66666666-6666-4666-8666-666666666666';
const PATIENT_2 = '77777777-7777-4777-8777-777777777777';

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

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    patientId: PATIENT_1,
    names: 'Ana',
    lastNames: 'Pérez',
    documentNumber: '1712345678',
    birthDate: null,
    healthSystemCode: 'HSC-0001',
    isActive: true,
    sex: null,
    residence: null,
    ...overrides,
  };
}

function mockCatalogTypesEmpty() {
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockGeoLocationPickerEmpty() {
  server.use(
    http.get('http://localhost:4500/api/geo-level-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
}

function mockIdentifierSearch(data: { count: number; rows: unknown[] }) {
  server.use(
    http.get('http://localhost:4500/api/patients/search/:identifier', () =>
      HttpResponse.json({ ok: true, message: 'ok', data }),
    ),
  );
}

function mockNameSearch(data: { count: number; inactiveCount: number; rows: unknown[] }) {
  server.use(
    http.get('http://localhost:4500/api/patients/search-by-name', () =>
      HttpResponse.json({ ok: true, message: 'ok', data }),
    ),
  );
}

function renderStep() {
  const router = createMemoryRouter(
    [{ path: '/esavi-cases/new/patient', element: <PatientStep /> }],
    { initialEntries: ['/esavi-cases/new/patient'] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('PatientStep — el alta no se ofrece antes de una búsqueda (SPEC FE10 §5)', () => {
  it('sin buscar, no hay botón «Crear paciente»; tras una búsqueda vacía, aparece', async () => {
    const user = setupUser();
    mockIdentifierSearch({ count: 0, rows: [] });

    renderStep();

    expect(screen.queryByRole('button', { name: 'Crear paciente' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Término de búsqueda'), '1712345678');

    expect(await screen.findByRole('button', { name: 'Crear paciente' })).toBeInTheDocument();
  });
});

describe('PatientStep — pacientes inactivos (SPEC FE10 §5)', () => {
  it('count: 0 con inactiveCount: 2 muestra el aviso propio, no el texto de «no existe»', async () => {
    const user = setupUser();
    mockNameSearch({ count: 0, inactiveCount: 2, rows: [] });

    renderStep();

    await user.click(screen.getByRole('radio', { name: 'Nombre' }));
    await user.type(screen.getByLabelText('Término de búsqueda'), 'Pérez');

    expect(
      await screen.findByText('No hay pacientes activos, pero hay 2 paciente(s) inactivo(s) con ese criterio.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No se encontraron pacientes activos con ese criterio.')).not.toBeInTheDocument();
  });
});

describe('PatientStep — elegir un paciente escribe sólo ?patientId= (SPEC FE10 §5)', () => {
  it('el término tecleado no aparece en la URL', async () => {
    const user = setupUser();
    mockIdentifierSearch({ count: 1, rows: [makeRow()] });

    const router = renderStep();

    await user.type(screen.getByLabelText('Término de búsqueda'), '1712345678');
    await user.click(await screen.findByRole('button', { name: 'Usar este paciente' }));

    await waitFor(() => {
      expect(router.state.location.search).toBe(`?patientId=${PATIENT_1}`);
    });
  });
});

describe('PatientStep — el 409 de documento duplicado (SPEC FE10 §3.6, §5)', () => {
  it('dispara 006 y, si encuentra al titular, ofrece usarlo sin repetir el formulario', async () => {
    const user = setupUser();
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    mockIdentifierSearch({ count: 0, rows: [] });
    server.use(
      http.post('http://localhost:4500/api/patients', () =>
        HttpResponse.json(
          { ok: false, message: 'Ese documento ya está registrado', code: 'PATIENT_001_DOCUMENT_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderStep();

    await user.type(screen.getByLabelText('Término de búsqueda'), '1712345678');
    await user.click(await screen.findByRole('button', { name: 'Crear paciente' }));

    await user.type(screen.getByLabelText('Nombres'), 'Ana');
    await user.type(screen.getByLabelText('Apellidos'), 'Pérez');
    await user.clear(screen.getByLabelText('Número de documento'));
    await user.type(screen.getByLabelText('Número de documento'), '1712345678');

    // The duplicate flow re-runs -006 with a row now present — switch the handler right before
    // submitting, same as the create POST returning the 409 that triggers it.
    mockIdentifierSearch({ count: 1, rows: [makeRow({ patientId: PATIENT_2, names: 'Otra', lastNames: 'Persona' })] });

    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Ese documento ya está registrado en este paciente')).toBeInTheDocument();
    expect(screen.getByText(/Otra Persona/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usarlo' })).toBeInTheDocument();
    // The form isn't repeated/left showing under the finding.
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument();
  });
});

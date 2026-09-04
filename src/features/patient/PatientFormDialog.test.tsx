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
import { PatientFormDialog } from './PatientFormDialog';

const server = setupServer();

const PATIENT_1 = '55555555-5555-4555-8555-555555555555';

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

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    patientId: PATIENT_1,
    names: 'Ana',
    lastNames: 'Pérez',
    documentNumber: '1712345678',
    passportNumber: null,
    birthDate: null,
    healthSystemCode: 'HSC-0001',
    email: null,
    phoneNumber: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    sex: null,
    residence: null,
    ...overrides,
  };
}

function mockPatientDetail(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
      HttpResponse.json({ ok: true, message: 'ok', data: makePatient(overrides) }),
    ),
  );
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PatientFormDialog open patientId={PATIENT_1} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('PatientFormDialog — casilla «sin documento» (SPEC FE10 §3.5, §8 paso 8)', () => {
  it('marcarla deshabilita el campo documento y lo rellena con un PROV-', async () => {
    const user = setupUser();
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    mockPatientDetail();

    renderDialog();

    const documentInput = await screen.findByLabelText('Número de documento');
    expect(documentInput).toBeEnabled();
    expect(documentInput).toHaveValue('1712345678');

    await user.click(screen.getByRole('checkbox', { name: 'No tiene documento de identidad' }));

    expect(documentInput).toBeDisabled();
    expect((documentInput as HTMLInputElement).value).toMatch(/^PROV-\d{8}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });
});

describe('PatientFormDialog — mapeo de errores (SPEC FE10 §3.5)', () => {
  it('un 409 con PATIENT_004_GEOLOC_NOT_FOUND marca residenceGeoLocationId, no un toast', async () => {
    const user = setupUser();
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    mockPatientDetail();
    server.use(
      http.put(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
        HttpResponse.json(
          {
            ok: false,
            message: 'La ubicación de residencia no existe',
            code: 'PATIENT_004_GEOLOC_NOT_FOUND',
          },
          { status: 404 },
        ),
      ),
    );

    renderDialog();

    await screen.findByLabelText('Número de documento');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const fieldError = await screen.findByText('La ubicación de residencia no existe');
    // Mapped to the field (a `<FormMessage>`, `data-slot="form-message"`), never a generic toast —
    // no `<Toaster>` is even mounted in this render tree, so a toast would leave no trace at all.
    expect(fieldError.closest('[data-slot="form-message"]')).toBeInTheDocument();
  });
});

describe('PatientFormDialog — el error de una mutación no sobrevive al cierre (CONVENTIONS.md §10.7)', () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Reabrir
        </button>
        <PatientFormDialog open={open} patientId={PATIENT_1} onOpenChange={setOpen} />
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

  it('un 409 no reaparece al cerrar y reabrir el diálogo', async () => {
    const user = setupUser();
    mockCatalogTypesEmpty();
    mockGeoLocationPickerEmpty();
    mockPatientDetail();
    server.use(
      http.put(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
        HttpResponse.json(
          { ok: false, message: 'Ese documento ya está en uso', code: 'PATIENT_004_DOCUMENT_EXISTS' },
          { status: 409 },
        ),
      ),
    );

    renderHarness();

    await screen.findByLabelText('Número de documento');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ese documento ya está en uso')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByText('Ese documento ya está en uso')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reabrir' }));

    await screen.findByLabelText('Número de documento');
    expect(screen.queryByText('Ese documento ya está en uso')).not.toBeInTheDocument();
  });
});

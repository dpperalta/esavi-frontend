import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { AdministrationErrorSection } from './AdministrationErrorSection';

const server = setupServer();

const CASE_1 = 'case-1';
const INVESTIGATION_1 = 'investigation-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function emptyAdministrationErrorDetail(overrides: Record<string, unknown> = {}) {
  return {
    investigationId: INVESTIGATION_1,
    investigation: { investigationId: INVESTIGATION_1, caseId: CASE_1, isActive: true },
    usedAutoDisableSyringes: null,
    usedGlassSyringes: null,
    usedDisposableSyringes: null,
    usedRecycledDisposableSyringes: null,
    usedOtherSyringes: null,
    otherSyringesDescription: null,
    syringesKeyFindings: null,
    reconstitutionUsedSameSyringe: null,
    reconstitutionUsedSameSyringeDifferentVaccine: null,
    reconstitutionUsedDifferentSyringeSameVial: null,
    reconstitutionUsedDifferentSyringeDifferentVaccine: null,
    reconstitutionFollowedManufacturerRecommendation: null,
    reconstitutionKeyFindings: null,
    hadPrescriptionError: null,
    prescriptionErrorNotes: null,
    hadContaminatedVaccine: null,
    contaminatedVaccineNotes: null,
    hadAbnormalVaccineConditions: null,
    abnormalConditionsNotes: null,
    hadPreparationError: null,
    preparationErrorNotes: null,
    hadHandlingError: null,
    handlingErrorNotes: null,
    hadImproperAdministration: null,
    improperAdministrationNotes: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderSection(props: Partial<Parameters<typeof AdministrationErrorSection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const onRevealPractices = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AdministrationErrorSection
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        administrationError={null}
        practicesRevealed={false}
        onRevealPractices={onRevealPractices}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved, onRevealPractices };
}

function mockPut(onBody?: (body: Record<string, unknown>) => void) {
  server.use(
    http.put(
      `http://localhost:4500/api/investigation-administration-errors/${INVESTIGATION_1}`,
      async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        onBody?.(body);
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyAdministrationErrorDetail() });
      },
    ),
  );
}

describe('AdministrationErrorSection — apertura de la ficha (SPEC FE13e §4 paso 5)', () => {
  it('al revelarse con la ficha inexistente, lanza exactamente un POST { investigationId }', async () => {
    let postCount = 0;
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-administration-errors', async ({ request }) => {
        postCount++;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyAdministrationErrorDetail() });
      }),
    );
    renderSection();

    await waitFor(() => expect(postCount).toBe(1));
    expect(receivedBody).toEqual({ investigationId: INVESTIGATION_1 });
  });

  it('con la ficha ya creada, no lanza ningún POST', async () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-administration-errors', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyAdministrationErrorDetail() });
      }),
    );
    renderSection({ administrationError: emptyAdministrationErrorDetail() });

    await screen.findByRole('heading', { name: 'Jeringas y agujas' });
    expect(postCount).toBe(0);
  });
});

describe('AdministrationErrorSection — la compuerta invertida (SPEC FE13e §1.A)', () => {
  it("con usedAutoDisableSyringes en 'NO', el bloque de cuatro tipos y los hallazgos clave se ven", () => {
    renderSection({
      administrationError: emptyAdministrationErrorDetail({ usedAutoDisableSyringes: 'NO' }),
    });

    expect(screen.getByText('Vidrio')).toBeInTheDocument();
    expect(screen.getByText('Desechables')).toBeInTheDocument();
    expect(
      screen.getByText('Especifique los hallazgos clave, observaciones adicionales o comentarios'),
    ).toBeInTheDocument();
  });

  it.each(['YES', 'UNKNOWN', 'NOT_APPLICABLE', null])(
    'con usedAutoDisableSyringes en %s, sólo se ven los hallazgos clave',
    (value) => {
      renderSection({
        administrationError: emptyAdministrationErrorDetail({ usedAutoDisableSyringes: value }),
      });

      expect(screen.queryByText('Vidrio')).not.toBeInTheDocument();
      expect(
        screen.getByText('Especifique los hallazgos clave, observaciones adicionales o comentarios'),
      ).toBeInTheDocument();
    },
  );
});

describe('AdministrationErrorSection — regla de mínimo (SPEC FE13e §1.B)', () => {
  it('con el bloque abierto y los cuatro tipos sin tocar, el guardado no sale del cliente', async () => {
    let putCount = 0;
    mockPut(() => putCount++);
    const user = setupUser();
    renderSection({
      administrationError: emptyAdministrationErrorDetail({ usedAutoDisableSyringes: 'NO' }),
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect(
      await screen.findByText('Indica al menos un tipo de jeringa usada'),
    ).toBeInTheDocument();
    expect(putCount).toBe(0);
  });

  it('con un tipo marcado en true, el guardado sí sale', async () => {
    let putCount = 0;
    mockPut(() => putCount++);
    const user = setupUser();
    const { onRevealPractices } = renderSection({
      administrationError: emptyAdministrationErrorDetail({ usedAutoDisableSyringes: 'NO' }),
    });

    const [glassYes] = screen.getAllByRole('radio', { name: 'Sí' });
    await user.click(glassYes);
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onRevealPractices).toHaveBeenCalledTimes(1));
    expect(putCount).toBe(1);
  });
});

describe('AdministrationErrorSection — salida del bloque en una sola petición (SPEC FE13e §3.5)', () => {
  it('marcar un tipo y luego cambiar la bandera fuera de NO limpia los cinco campos en el mismo PUT', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    mockPut((body) => {
      receivedBody = body;
    });
    const user = setupUser();
    renderSection({
      administrationError: emptyAdministrationErrorDetail({
        usedAutoDisableSyringes: 'NO',
        usedGlassSyringes: true,
      }),
    });

    await user.click(
      screen.getByRole('combobox', { name: '¿Se usaron jeringas autodesactivables (AD)?' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Sí' }));

    // El bloque desaparece de la pantalla en cuanto la bandera deja de ser NO.
    expect(screen.queryByText('Vidrio')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({
      usedAutoDisableSyringes: 'YES',
      usedGlassSyringes: null,
      usedDisposableSyringes: null,
      usedRecycledDisposableSyringes: null,
      usedOtherSyringes: null,
      otherSyringesDescription: null,
    });
  });

  it('usedOtherSyringes:true sin descripción guarda sin error', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    mockPut((body) => {
      receivedBody = body;
    });
    const user = setupUser();
    renderSection({
      administrationError: emptyAdministrationErrorDetail({
        usedAutoDisableSyringes: 'NO',
        usedOtherSyringes: true,
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({ usedOtherSyringes: true, otherSyringesDescription: null });
  });
});

describe('AdministrationErrorSection — F y F2, un formulario y dos identificadores (SPEC FE13e §3.6)', () => {
  it('sin practicesRevealed, F2 no se pinta', () => {
    renderSection({
      administrationError: emptyAdministrationErrorDetail(),
      practicesRevealed: false,
    });

    expect(screen.queryByRole('heading', { name: 'Procedimiento de reconstitución' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeInTheDocument();
  });

  it('el guardado de F llama a onRevealPractices tras el PUT', async () => {
    let putCount = 0;
    mockPut(() => putCount++);
    const user = setupUser();
    const { onRevealPractices } = renderSection({
      administrationError: emptyAdministrationErrorDetail(),
      practicesRevealed: false,
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onRevealPractices).toHaveBeenCalledTimes(1));
    expect(putCount).toBe(1);
  });

  it('con practicesRevealed, F2 se pinta con sus dos bloques y el botón de F desaparece', () => {
    renderSection({
      administrationError: emptyAdministrationErrorDetail(),
      practicesRevealed: true,
    });

    expect(screen.getByRole('heading', { name: 'Procedimiento de reconstitución' })).toBeInTheDocument();
    expect(screen.getByText('Reconstitución')).toBeInTheDocument();
    expect(screen.getByText('Errores de administración')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Guardar y continuar' })).toHaveLength(1);
  });

  it('las cinco de reconstitución admiten YES las cinco a la vez y el guardado de F2 llama a onSaved', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    mockPut((body) => {
      receivedBody = body;
    });
    const user = setupUser();
    const { onSaved } = renderSection({
      administrationError: emptyAdministrationErrorDetail({
        reconstitutionUsedSameSyringe: 'YES',
        reconstitutionUsedSameSyringeDifferentVaccine: 'YES',
        reconstitutionUsedDifferentSyringeSameVial: 'YES',
        reconstitutionUsedDifferentSyringeDifferentVaccine: 'YES',
        reconstitutionFollowedManufacturerRecommendation: 'YES',
      }),
      practicesRevealed: true,
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(receivedBody).toMatchObject({
      reconstitutionUsedSameSyringe: 'YES',
      reconstitutionUsedSameSyringeDifferentVaccine: 'YES',
      reconstitutionUsedDifferentSyringeSameVial: 'YES',
      reconstitutionUsedDifferentSyringeDifferentVaccine: 'YES',
      reconstitutionFollowedManufacturerRecommendation: 'YES',
    });
  });

  it("un had* en NO con su *Notes escrita valida — un registro válido, no se estorba", async () => {
    let receivedBody: Record<string, unknown> | null = null;
    mockPut((body) => {
      receivedBody = body;
    });
    const user = setupUser();
    renderSection({
      administrationError: emptyAdministrationErrorDetail({
        hadPrescriptionError: 'NO',
        prescriptionErrorNotes: 'se registró el motivo',
      }),
      practicesRevealed: true,
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({
      hadPrescriptionError: 'NO',
      prescriptionErrorNotes: 'se registró el motivo',
    });
  });
});

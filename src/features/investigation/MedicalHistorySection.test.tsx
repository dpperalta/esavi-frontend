import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { useInvestigationMedicalHistoryByCase } from './api';
import { MedicalHistorySection } from './MedicalHistorySection';

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

function emptyMedicalHistoryDetail() {
  return {
    investigationId: INVESTIGATION_1,
    investigation: {
      investigationId: INVESTIGATION_1,
      isActive: true,
      investigationStartDate: null,
      status: null,
      case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: null },
    },
    hasPriorHospitalizationHistory: null,
    priorHospitalizationObservations: null,
    hasFamilyHistory: null,
    familyHistoryObservations: null,
    isPregnancyConfirmed: null,
    gestationalWeeks: null,
    gestationMethodItemId: null,
    deliveryItemId: null,
    birthItemId: null,
    pregnancyOutcomeItemId: null,
    hasPregnancyRiskFactor: null,
    riskFactorDescription: null,
    birthWeightGrams: null,
    wasBreastfed: null,
    notes: null,
    gestationMethod: null,
    delivery: null,
    birth: null,
    pregnancyOutcome: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
}

function renderMedicalHistorySection(
  props: Partial<Parameters<typeof MedicalHistorySection>[0]> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MedicalHistorySection
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        medicalHistory={null}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved };
}

describe('MedicalHistorySection — apertura de la ficha (SPEC FE13b §4 paso 5)', () => {
  it('al revelarse con la ficha inexistente, lanza exactamente un POST { investigationId }', async () => {
    let postCount = 0;
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-medical-histories', async ({ request }) => {
        postCount++;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyMedicalHistoryDetail() });
      }),
    );
    const { rerender } = renderMedicalHistorySection();

    await waitFor(() => expect(postCount).toBe(1));
    expect(receivedBody).toEqual({ investigationId: INVESTIGATION_1 });

    // A second render with the same still-null prop (the effect's own dependency) never repeats
    // the `POST` — the guard is `attemptedRef`, not React's render count.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MedicalHistorySection
          caseId={CASE_1}
          investigationId={INVESTIGATION_1}
          medicalHistory={null}
          showSaveButton
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(postCount).toBe(1);
  });

  it('con la ficha ya creada, no lanza ningún POST', async () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-medical-histories', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyMedicalHistoryDetail() });
      }),
    );
    renderMedicalHistorySection({ medicalHistory: emptyMedicalHistoryDetail() });

    await screen.findByRole('heading', { name: 'Antecedentes de la persona vacunada' });
    expect(postCount).toBe(0);
  });

  it('mientras la ficha no existe, los controles quedan deshabilitados', () => {
    renderMedicalHistorySection();
    expect(screen.getByRole('button', { name: 'Guardar y continuar' })).toBeDisabled();
  });

  it('un 409 INVMEDH_001_ALREADY_EXISTS relee en vez de duplicar, sin toast', async () => {
    let postCount = 0;
    let getCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-medical-histories', () => {
        postCount++;
        return HttpResponse.json(
          { ok: false, message: 'Ya existe', code: 'INVMEDH_001_ALREADY_EXISTS' },
          { status: 409 },
        );
      }),
      http.get(`http://localhost:4500/api/investigation-medical-histories/case/${CASE_1}`, () => {
        getCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyMedicalHistoryDetail() });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useInvestigationMedicalHistoryByCase(CASE_1, true), { wrapper: Wrapper });
    await waitFor(() => expect(getCount).toBe(1));

    render(
      <Wrapper>
        <MedicalHistorySection
          caseId={CASE_1}
          investigationId={INVESTIGATION_1}
          medicalHistory={null}
          showSaveButton
          onSaved={vi.fn()}
        />
      </Wrapper>,
    );

    await waitFor(() => expect(postCount).toBe(1));
    await waitFor(() => expect(getCount).toBe(2));
  });
});

describe('MedicalHistorySection — sección B (SPEC FE13b §3.5 A)', () => {
  it('las dos observaciones se pintan siempre, y apagar la bandera no las borra', async () => {
    const user = setupUser();
    renderMedicalHistorySection({
      medicalHistory: {
        ...emptyMedicalHistoryDetail(),
        hasPriorHospitalizationHistory: 'YES',
        priorHospitalizationObservations: 'Ingreso por neumonía',
      },
    });

    expect(
      screen.getByLabelText('Observaciones del antecedente de hospitalización'),
    ).toHaveValue('Ingreso por neumonía');

    await user.click(
      screen.getByRole('combobox', { name: 'Antecedentes de hospitalización en los 30 días previos a la vacunación actual' }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    expect(
      screen.getByLabelText('Observaciones del antecedente de hospitalización'),
    ).toHaveValue('Ingreso por neumonía');
  });

  it('guarda las cinco columnas de B con un PUT a :investigationId', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(
        `http://localhost:4500/api/investigation-medical-histories/${INVESTIGATION_1}`,
        async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyMedicalHistoryDetail() });
        },
      ),
    );
    const user = setupUser();
    const { onSaved } = renderMedicalHistorySection({ medicalHistory: emptyMedicalHistoryDetail() });

    await user.type(
      screen.getByLabelText('Observaciones de la ficha'),
      'Sin antecedentes relevantes',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(receivedBody).toMatchObject({
      notes: 'Sin antecedentes relevantes',
      // The block is closed — `isPregnancyConfirmed` is `null` in this fixture — so the nine
      // pregnancy columns travel as explicit `null`, not omitted (§3.5 A punto 3).
      gestationalWeeks: null,
      birthWeightGrams: null,
      pregnancyOutcomeItemId: null,
    });
  });

  it('un error del PUT no avanza la sección — mapeado o no', async () => {
    let putCount = 0;
    server.use(
      http.put(
        `http://localhost:4500/api/investigation-medical-histories/${INVESTIGATION_1}`,
        () => {
          putCount++;
          return HttpResponse.json(
            {
              ok: false,
              message: 'El método de cálculo gestacional no existe.',
              code: 'INVMEDH_004_GESTATION_METHOD_NOT_FOUND',
            },
            { status: 404 },
          );
        },
      ),
    );
    const user = setupUser();
    const { onSaved } = renderMedicalHistorySection({ medicalHistory: emptyMedicalHistoryDetail() });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(putCount).toBe(1));
    expect(onSaved).not.toHaveBeenCalled();
  });
});

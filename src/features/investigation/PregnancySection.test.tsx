import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnswerOption } from '@/contracts/common';
import { setAccessToken } from '@/shared/api/client';
import { PregnancySection } from './PregnancySection';

const server = setupServer();

const INVESTIGATION_1 = 'investigation-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  // The four `<CatalogSelect>` of B1 (§3.5 A): empty by default, so as not to pollute the output
  // with "unhandled request" — none of these tests resolve a catalog label, only the raw id.
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
});

function emptyMedicalHistoryDetail() {
  return {
    investigationId: INVESTIGATION_1,
    investigation: {
      investigationId: INVESTIGATION_1,
      isActive: true,
      investigationStartDate: null,
      status: null,
      case: { caseId: 'case-1', caseCode: 'ESAVI-2026-0001', eventDate: null },
    },
    hasPriorHospitalizationHistory: null,
    priorHospitalizationObservations: null,
    hasFamilyHistory: null,
    familyHistoryObservations: null,
    isPregnancyConfirmed: null as AnswerOption | null,
    gestationalWeeks: null as number | null,
    gestationMethodItemId: null as string | null,
    deliveryItemId: null as string | null,
    birthItemId: null as string | null,
    pregnancyOutcomeItemId: null as string | null,
    hasPregnancyRiskFactor: null as AnswerOption | null,
    riskFactorDescription: null as string | null,
    birthWeightGrams: null as string | null,
    wasBreastfed: null as AnswerOption | null,
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

function renderPregnancySection(props: Partial<Parameters<typeof PregnancySection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PregnancySection
        investigationId={INVESTIGATION_1}
        medicalHistory={emptyMedicalHistoryDetail()}
        pregnancyGate="visible"
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved };
}

describe('PregnancySection — la compuerta exterior (SPEC FE13b §4 paso 6)', () => {
  it('con la compuerta oculta, no pinta nada — ni el encabezado', () => {
    const { container } = renderPregnancySection({ pregnancyGate: 'hidden' });
    expect(container).toBeEmptyDOMElement();
  });

  it('con "Si aplica" muestra la marca junto al título', () => {
    renderPregnancySection({ pregnancyGate: 'visibleIfApplicable' });
    expect(screen.getByText('Si aplica')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preguntas para mujeres' })).toBeInTheDocument();
  });

  it('en "visible" normal no muestra la marca', () => {
    renderPregnancySection({ pregnancyGate: 'visible' });
    expect(screen.queryByText('Si aplica')).not.toBeInTheDocument();
  });
});

describe('PregnancySection — la compuerta interior (SPEC FE13b §3.5 A)', () => {
  it('sin isPregnancyConfirmed en YES, las nueve columnas no se pintan', () => {
    renderPregnancySection();
    expect(screen.queryByLabelText('Semanas de gestación')).not.toBeInTheDocument();
  });

  it('con isPregnancyConfirmed en YES, las nueve columnas se pintan', async () => {
    const user = setupUser();
    renderPregnancySection();

    await user.click(
      screen.getByRole('combobox', {
        name: 'Confirme si la mujer estaba embarazada en el momento de la vacuna',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'Sí' }));

    expect(screen.getByLabelText('Semanas de gestación')).toBeInTheDocument();
  });

  it('apagar el factor de riesgo limpia su explicación', async () => {
    const user = setupUser();
    renderPregnancySection({
      medicalHistory: {
        ...emptyMedicalHistoryDetail(),
        isPregnancyConfirmed: 'YES',
        hasPregnancyRiskFactor: 'YES',
        riskFactorDescription: 'Hipertensión previa',
      },
    });

    expect(screen.getByLabelText('Explique cuál fue el factor de riesgo')).toHaveValue(
      'Hipertensión previa',
    );

    await user.click(
      screen.getByRole('combobox', {
        name: '¿Se identificó algún factor de riesgo de complicaciones obstétricas graves?',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    expect(
      screen.queryByLabelText('Explique cuál fue el factor de riesgo'),
    ).not.toBeInTheDocument();
  });
});

describe('PregnancySection — guardado (SPEC FE13b §4 paso 6)', () => {
  it('bloque cerrado (isPregnancyConfirmed: NO) con semanas cargadas manda los nueve null', async () => {
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
    const { onSaved } = renderPregnancySection({
      medicalHistory: {
        ...emptyMedicalHistoryDetail(),
        isPregnancyConfirmed: 'NO',
        gestationalWeeks: 12,
        gestationMethodItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(receivedBody).toMatchObject({
      isPregnancyConfirmed: 'NO',
      gestationalWeeks: null,
      gestationMethodItemId: null,
      birthWeightGrams: null,
      pregnancyOutcomeItemId: null,
    });
  });

  it('bloque abierto: gestationalWeeks: 0 se guarda como 0, no como null', async () => {
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
    renderPregnancySection({
      medicalHistory: {
        ...emptyMedicalHistoryDetail(),
        isPregnancyConfirmed: 'YES',
        gestationalWeeks: 0,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect((receivedBody as { gestationalWeeks: unknown } | null)?.gestationalWeeks).toBe(0);
  });
});

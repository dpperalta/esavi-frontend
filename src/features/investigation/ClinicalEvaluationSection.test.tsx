import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { useInvestigationClinicalEvaluationByCase } from './api';
import { ClinicalEvaluationSection } from './ClinicalEvaluationSection';

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

function emptyClinicalEvaluationDetail() {
  return {
    investigationId: INVESTIGATION_1,
    investigation: {
      investigationId: INVESTIGATION_1,
      isActive: true,
      investigationStartDate: null,
      status: null,
      case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: null },
    },
    receivedMedicalAttention: null,
    sourceExam: null,
    sourceDocuments: null,
    sourceVerbalAutopsy: null,
    sourceOther: null,
    otherDescription: null,
    suspectedChildAbuse: null,
    childAbuseExplanation: null,
    suspectedDomesticViolence: null,
    domesticViolenceExplanation: null,
    clinicalDetailsPersonName: null,
    familyClinicalDetails: null,
    completeClinicalSummary: null,
    signsAndSymptoms: null,
    otherSocialBackground: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
}

function renderClinicalEvaluationSection(
  props: Partial<Parameters<typeof ClinicalEvaluationSection>[0]> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ClinicalEvaluationSection
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        clinicalEvaluation={emptyClinicalEvaluationDetail()}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved };
}

describe('ClinicalEvaluationSection — un interruptor sin tocar (SPEC FE13c §4 paso 4)', () => {
  it('un interruptor sin tocar envía null y no false', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.put(
        `http://localhost:4500/api/investigation-clinical-evaluations/${INVESTIGATION_1}`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyClinicalEvaluationDetail() });
        },
      ),
    );
    const user = setupUser();
    const { onSaved } = renderClinicalEvaluationSection();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(receivedBody).toMatchObject({
      sourceExam: null,
      sourceDocuments: null,
      sourceVerbalAutopsy: null,
      sourceOther: null,
      suspectedChildAbuse: null,
      suspectedDomesticViolence: null,
    });
  });

  it('el botón «marcar como sin comprobar» devuelve la bandera a null', async () => {
    const user = setupUser();
    renderClinicalEvaluationSection({
      clinicalEvaluation: { ...emptyClinicalEvaluationDetail(), sourceExam: true },
    });

    const sourceExamSwitch = screen.getByRole('switch', {
      name: 'Examen realizado por el investigador',
    });
    expect(sourceExamSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: 'Marcar como sin comprobar' }));

    expect(sourceExamSwitch).toHaveAttribute('aria-checked', 'mixed');
  });
});

describe('ClinicalEvaluationSection — los tres pares bandera/explicación (SPEC FE13c §1.D)', () => {
  it('apagar una sospecha oculta su explicación y el cuerpo la lleva como null explícito', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.put(
        `http://localhost:4500/api/investigation-clinical-evaluations/${INVESTIGATION_1}`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyClinicalEvaluationDetail() });
        },
      ),
    );
    const user = setupUser();
    renderClinicalEvaluationSection({
      clinicalEvaluation: {
        ...emptyClinicalEvaluationDetail(),
        suspectedChildAbuse: true,
        childAbuseExplanation: 'Se sospechó maltrato',
      },
    });

    expect(screen.getByLabelText('Explique')).toHaveValue('Se sospechó maltrato');

    await user.click(
      screen.getByRole('switch', {
        name: 'Si el ESAVI se presentó en un menor de cinco años de edad, ¿hay sospecha de maltrato infantil?',
      }),
    );
    expect(screen.queryByLabelText('Explique')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect((receivedBody as { childAbuseExplanation: unknown }).childAbuseExplanation).toBeNull();
  });

  it('un cuerpo que rompe los tres pares muestra los tres mensajes a la vez y no envía nada', async () => {
    let putCount = 0;
    server.use(
      http.put(
        `http://localhost:4500/api/investigation-clinical-evaluations/${INVESTIGATION_1}`,
        () => {
          putCount++;
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyClinicalEvaluationDetail() });
        },
      ),
    );
    const user = setupUser();
    renderClinicalEvaluationSection({
      clinicalEvaluation: {
        ...emptyClinicalEvaluationDetail(),
        sourceOther: true,
        suspectedChildAbuse: true,
        suspectedDomesticViolence: true,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() =>
      expect(screen.getByText('Especifica cuál es la otra fuente antes de guardar.')).toBeInTheDocument(),
    );
    expect(
      screen.getByText('Explica la sospecha de maltrato infantil antes de guardar.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Explica la sospecha de violencia intrafamiliar antes de guardar.'),
    ).toBeInTheDocument();
    expect(putCount).toBe(0);
  });
});

describe('ClinicalEvaluationSection — receivedMedicalAttention no gobierna nada (SPEC FE13c §6 decision 9)', () => {
  it('en NO, el resto de la sección sigue visible', async () => {
    const user = setupUser();
    renderClinicalEvaluationSection();

    await user.click(
      screen.getByRole('combobox', {
        name: '¿Ha recibido la persona atención médica para el ESAVI?',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    expect(
      screen.getByRole('switch', { name: 'Examen realizado por el investigador' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'Nombre e información de contacto de la persona o personas que conocen los detalles clínicos',
      ),
    ).toBeInTheDocument();
  });
});

describe('ClinicalEvaluationSection — clinicalDetailsPersonName cifrado (SPEC FE13c §1.E, §8)', () => {
  it('muestra lo que devolvió el servidor en Title Case, no lo que se escribió', () => {
    renderClinicalEvaluationSection({
      clinicalEvaluation: {
        ...emptyClinicalEvaluationDetail(),
        clinicalDetailsPersonName: 'Juan Pérez',
      },
    });

    expect(
      screen.getByLabelText(
        'Nombre e información de contacto de la persona o personas que conocen los detalles clínicos',
      ),
    ).toHaveValue('Juan Pérez');
  });

  it('no tiene tope de longitud — es text, no varchar(n)', () => {
    renderClinicalEvaluationSection();

    const input = screen.getByLabelText(
      'Nombre e información de contacto de la persona o personas que conocen los detalles clínicos',
    );
    expect(input).not.toHaveAttribute('maxLength');
  });
});

describe('ClinicalEvaluationSection — la ficha se crea al revelarse la sección (SPEC FE13c §4 paso 5)', () => {
  it('revelar la sección sin ficha dispara un solo POST', async () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-clinical-evaluations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyClinicalEvaluationDetail() });
      }),
    );
    renderClinicalEvaluationSection({ clinicalEvaluation: null });

    await waitFor(() => expect(postCount).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(postCount).toBe(1);
  });

  it('el POST vacío sólo lleva investigationId', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-clinical-evaluations', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyClinicalEvaluationDetail() });
      }),
    );
    renderClinicalEvaluationSection({ clinicalEvaluation: null });

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toEqual({ investigationId: INVESTIGATION_1 });
  });

  it('revelar la sección con una ficha ya existente no dispara ningún POST', () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-clinical-evaluations', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyClinicalEvaluationDetail() });
      }),
    );
    renderClinicalEvaluationSection();

    expect(postCount).toBe(0);
  });

  it('con clinicalEvaluation:null, el formulario está deshabilitado mientras la ficha no existe', () => {
    server.use(
      http.post(
        'http://localhost:4500/api/investigation-clinical-evaluations',
        () => new Promise(() => {}),
      ),
    );
    renderClinicalEvaluationSection({ clinicalEvaluation: null });

    expect(
      screen.getByRole('switch', { name: 'Examen realizado por el investigador' }),
    ).toBeDisabled();
  });

  it('con el POST en error, no se pinta el formulario y hay botón de reintentar', async () => {
    server.use(
      http.post('http://localhost:4500/api/investigation-clinical-evaluations', () =>
        HttpResponse.json(
          { ok: false, message: 'Error inesperado', code: 'INVCLIEV_001_CREATION_FAILED' },
          { status: 500 },
        ),
      ),
    );
    renderClinicalEvaluationSection({ clinicalEvaluation: null });

    await waitFor(() =>
      expect(screen.getByText('No se pudo abrir la ficha de evaluación clínica.')).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('switch', { name: 'Examen realizado por el investigador' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('un 409 INVCLIEV_001_ALREADY_EXISTS relee en vez de duplicar', async () => {
    let postCount = 0;
    let getCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-clinical-evaluations', () => {
        postCount++;
        return HttpResponse.json(
          { ok: false, message: 'Ya existe', code: 'INVCLIEV_001_ALREADY_EXISTS' },
          { status: 409 },
        );
      }),
      http.get(
        `http://localhost:4500/api/investigation-clinical-evaluations/case/${CASE_1}`,
        () => {
          getCount++;
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyClinicalEvaluationDetail() });
        },
      ),
    );

    // The by-case query needs an active observer for `invalidateQueries` to trigger a real
    // refetch — on the real screen that observer is `InvestigationStep`; here it's simulated by
    // sharing the same `queryClient` with a dedicated `renderHook`, same as
    // `SourceSection.test.tsx`'s equivalent test.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useInvestigationClinicalEvaluationByCase(CASE_1, true), { wrapper: Wrapper });
    await waitFor(() => expect(getCount).toBe(1));

    render(
      <Wrapper>
        <ClinicalEvaluationSection
          caseId={CASE_1}
          investigationId={INVESTIGATION_1}
          clinicalEvaluation={null}
          showSaveButton
          onSaved={vi.fn()}
        />
      </Wrapper>,
    );

    await waitFor(() => expect(postCount).toBe(1));
    await waitFor(() => expect(getCount).toBe(2));
  });
});

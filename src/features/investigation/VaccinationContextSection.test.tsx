import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { VaccinationContextSection } from './VaccinationContextSection';

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
  // `momentItemId`/`multidoseItemId` van por `<CatalogSelect typeCode="vaccinationMoment">`
  // (SPEC FE13d §3.2) — vacío por defecto, ningún test de esta sección lo necesita con datos.
  server.use(
    http.get('http://localhost:4500/api/catalog-types', () =>
      HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
    ),
  );
});

function emptyVaccinationContextDetail() {
  return {
    investigationId: INVESTIGATION_1,
    investigation: {
      investigationId: INVESTIGATION_1,
      isActive: true,
      investigationStartDate: null,
      status: null,
      case: { caseId: CASE_1, caseCode: 'ESAVI-2026-0001', eventDate: null },
    },
    momentItemId: null,
    moment: null,
    multidoseItemId: null,
    multidoseMoment: null,
    vaccinatedPerVialCount: null,
    vaccinatedPerBatchCount: null,
    locations: null,
    isCluster: null,
    clusterIdentificationNumber: null,
    clusterAdditionalCaseCount: null,
    clusterUsedSameVial: null,
    clusterSameVialCount: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };
}

function renderSection(props: Partial<Parameters<typeof VaccinationContextSection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <VaccinationContextSection
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        vaccinationContext={null}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved };
}

describe('VaccinationContextSection — apertura de la ficha (SPEC FE13d §4 paso 8)', () => {
  it('al revelarse con la ficha inexistente, lanza exactamente un POST { investigationId }', async () => {
    let postCount = 0;
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-vaccination-contexts', async ({ request }) => {
        postCount++;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyVaccinationContextDetail() });
      }),
    );
    renderSection();

    await waitFor(() => expect(postCount).toBe(1));
    expect(receivedBody).toEqual({ investigationId: INVESTIGATION_1 });
  });

  it('con la ficha ya creada, no lanza ningún POST', async () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-vaccination-contexts', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyVaccinationContextDetail() });
      }),
    );
    renderSection({ vaccinationContext: emptyVaccinationContextDetail() });

    await screen.findByRole('heading', { name: 'Contexto de la vacunación' });
    expect(postCount).toBe(0);
  });
});

describe('VaccinationContextSection — la compuerta del conglomerado (SPEC FE13d §4 paso 8)', () => {
  it('sin isCluster en YES, las cuatro columnas del conglomerado no se pintan', () => {
    renderSection({
      vaccinationContext: { ...emptyVaccinationContextDetail(), isCluster: 'NO' },
    });

    expect(screen.queryByLabelText('Número de identificación del conglomerado')).not.toBeInTheDocument();
  });

  it('con isCluster en YES, las cuatro columnas del conglomerado se pintan', async () => {
    renderSection({
      vaccinationContext: { ...emptyVaccinationContextDetail(), isCluster: 'YES' },
    });

    expect(await screen.findByLabelText('Número de identificación del conglomerado')).toBeInTheDocument();
  });
});

describe('VaccinationContextSection — guardado (SPEC FE13d §4 paso 8)', () => {
  it('bloque cerrado (isCluster: NO) con datos del conglomerado cargados manda las cuatro null', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(
        `http://localhost:4500/api/investigation-vaccination-contexts/${INVESTIGATION_1}`,
        async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyVaccinationContextDetail() });
        },
      ),
    );
    const user = setupUser();
    const { onSaved } = renderSection({
      vaccinationContext: {
        ...emptyVaccinationContextDetail(),
        isCluster: 'NO',
        clusterIdentificationNumber: 'CL-001',
        clusterAdditionalCaseCount: 3,
        clusterUsedSameVial: 'YES',
        clusterSameVialCount: 2,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(receivedBody).toMatchObject({
      isCluster: 'NO',
      clusterIdentificationNumber: null,
      clusterAdditionalCaseCount: null,
      clusterUsedSameVial: null,
      clusterSameVialCount: null,
    });
  });

  it('bloque abierto: clusterSameVialCount: 0 se guarda como 0, no como null', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(
        `http://localhost:4500/api/investigation-vaccination-contexts/${INVESTIGATION_1}`,
        async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, message: 'ok', data: emptyVaccinationContextDetail() });
        },
      ),
    );
    const user = setupUser();
    renderSection({
      vaccinationContext: {
        ...emptyVaccinationContextDetail(),
        isCluster: 'YES',
        clusterUsedSameVial: 'NO',
        clusterSameVialCount: 0,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect((receivedBody as { clusterSameVialCount: unknown } | null)?.clusterSameVialCount).toBe(0);
  });

  it('clusterUsedSameVial:NO sin contador bloquea el envío y muestra el aviso, sin PUT', async () => {
    let putCount = 0;
    server.use(
      http.put(`http://localhost:4500/api/investigation-vaccination-contexts/${INVESTIGATION_1}`, () => {
        putCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyVaccinationContextDetail() });
      }),
    );
    const user = setupUser();
    renderSection({
      vaccinationContext: {
        ...emptyVaccinationContextDetail(),
        isCluster: 'YES',
        clusterUsedSameVial: 'NO',
        clusterSameVialCount: null,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect(
      await screen.findByText('Indica cuántos casos usaron el mismo vial antes de guardar.'),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(putCount).toBe(0);
  });
});

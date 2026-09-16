import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { CommunitySection } from './CommunitySection';

const server = setupServer();

const CASE_1 = 'case-1';
const INVESTIGATION_1 = 'investigation-1';
const PATIENT_1 = 'patient-1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

function emptyCommunityDetail(overrides: Record<string, unknown> = {}) {
  return {
    investigationId: INVESTIGATION_1,
    investigation: { investigationId: INVESTIGATION_1, caseId: CASE_1, isActive: true },
    patientLatitude: null,
    patientLongitude: null,
    hadSimilarEvent: null,
    similarEventDescription: null,
    similarEventCount: null,
    affectedVaccinated: null,
    affectedUnvaccinated: null,
    affectedUnknown: null,
    otherComments: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderSection(props: Partial<Parameters<typeof CommunitySection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <CommunitySection
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        patientId={undefined}
        community={null}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved };
}

function mockPut(onBody?: (body: Record<string, unknown>) => void) {
  server.use(
    http.put(
      `http://localhost:4500/api/investigation-communities/${INVESTIGATION_1}`,
      async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        onBody?.(body);
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyCommunityDetail() });
      },
    ),
  );
}

describe('CommunitySection — apertura de la ficha (SPEC FE13e §4 paso 6)', () => {
  it('al revelarse con la ficha inexistente, lanza exactamente un POST { investigationId }', async () => {
    let postCount = 0;
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-communities', async ({ request }) => {
        postCount++;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyCommunityDetail() });
      }),
    );
    renderSection();

    await waitFor(() => expect(postCount).toBe(1));
    expect(receivedBody).toEqual({ investigationId: INVESTIGATION_1 });
  });

  it('con la ficha ya creada, no lanza ningún POST', async () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-communities', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyCommunityDetail() });
      }),
    );
    renderSection({ community: emptyCommunityDetail() });

    await screen.findByRole('heading', { name: 'Investigación comunitaria' });
    expect(postCount).toBe(0);
  });
});

describe('CommunitySection — la compuerta de polaridad normal (SPEC FE13e §1.E)', () => {
  it("con hadSimilarEvent en 'YES', la descripción y los contadores se ven", () => {
    renderSection({ community: emptyCommunityDetail({ hadSimilarEvent: 'YES' }) });

    expect(screen.getByText('Si la respuesta es "sí", descríbalo')).toBeInTheDocument();
    expect(
      screen.getByText('De las personas afectadas, ¿cuántas están vacunadas?'),
    ).toBeInTheDocument();
  });

  it.each(['NO', 'UNKNOWN', 'NOT_APPLICABLE', null])(
    'con hadSimilarEvent en %s, el bloque no se ve',
    (value) => {
      renderSection({ community: emptyCommunityDetail({ hadSimilarEvent: value }) });

      expect(screen.queryByText('Si la respuesta es "sí", descríbalo')).not.toBeInTheDocument();
    },
  );
});

describe('CommunitySection — descripción obligatoria con el bloque abierto (SPEC FE13e §1.E)', () => {
  it('con la descripción vacía, el guardado no sale del cliente', async () => {
    let putCount = 0;
    mockPut(() => putCount++);
    const user = setupUser();
    renderSection({ community: emptyCommunityDetail({ hadSimilarEvent: 'YES' }) });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    expect(
      await screen.findByText('Describe el evento similar notificado.'),
    ).toBeInTheDocument();
    expect(putCount).toBe(0);
  });

  it('con la descripción escrita, el guardado sí sale', async () => {
    let putCount = 0;
    mockPut(() => putCount++);
    const user = setupUser();
    const { onSaved } = renderSection({
      community: emptyCommunityDetail({
        hadSimilarEvent: 'YES',
        similarEventDescription: 'se notificaron dos casos en la misma localidad',
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(putCount).toBe(1);
  });
});

describe('CommunitySection — salida del bloque en una sola petición (SPEC FE13e §3.5 D)', () => {
  it('cerrar la compuerta limpia los cinco campos en el mismo PUT', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    mockPut((body) => {
      receivedBody = body;
    });
    const user = setupUser();
    renderSection({
      community: emptyCommunityDetail({
        hadSimilarEvent: 'YES',
        similarEventDescription: 'descripción previa',
        similarEventCount: 3,
        affectedVaccinated: 1,
        affectedUnvaccinated: 1,
        affectedUnknown: 1,
      }),
    });

    await user.click(
      screen.getByRole('combobox', {
        name: '¿Se notificó algún evento similar en un momento próximo al momento en el que ocurrió el ESAVI y en la misma localidad?',
      }),
    );
    await user.click(await screen.findByRole('option', { name: 'No' }));

    expect(screen.queryByText('Si la respuesta es "sí", descríbalo')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({
      hadSimilarEvent: 'NO',
      similarEventDescription: null,
      similarEventCount: null,
      affectedVaccinated: null,
      affectedUnvaccinated: null,
      affectedUnknown: null,
    });
  });
});

describe('CommunitySection — aviso de suma, no bloqueante (SPEC FE13e §3.5 D)', () => {
  it('con 12 declarados y 9 desglosados, muestra la diferencia y el botón sigue activo', () => {
    renderSection({
      community: emptyCommunityDetail({
        hadSimilarEvent: 'YES',
        similarEventDescription: 'descripción',
        similarEventCount: 12,
        affectedVaccinated: 5,
        affectedUnvaccinated: 2,
        affectedUnknown: 2,
      }),
    });

    expect(
      screen.getByText('El desglose suma 9 y has declarado 12.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar y continuar' })).not.toBeDisabled();
  });

  it('sin los cuatro contadores informados, no muestra el aviso', () => {
    renderSection({
      community: emptyCommunityDetail({
        hadSimilarEvent: 'YES',
        similarEventDescription: 'descripción',
        similarEventCount: 12,
      }),
    });

    expect(screen.queryByText(/El desglose suma/)).not.toBeInTheDocument();
  });
});

describe('CommunitySection — la precarga del marcador y su aviso (SPEC FE13e §3.7)', () => {
  const patientDetailWithResidence = {
    patientId: PATIENT_1,
    names: 'Ana',
    lastNames: 'Pérez',
    documentNumber: '0102030405',
    passportNumber: null,
    birthDate: '1990-01-01',
    healthSystemCode: null,
    email: null,
    phoneNumber: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    sex: null,
    residence: { geoLocationId: 'geo-1', name: 'Quito', geoLevelTypeId: 'level-1', level: 3 },
  };
  const geoLocationWithCoordinates = {
    geoLocationId: 'geo-1',
    geoLevelTypeId: 'level-1',
    parentGeoLocationId: null,
    name: 'Quito',
    officialName: null,
    shortName: null,
    isoCode: null,
    externalCode: 'Q001',
    level: 3,
    latitude: -0.22985,
    longitude: -78.52495,
    sortOrder: null,
    isActive: true,
    deletedAt: null,
    appDetails: [],
  };

  function mockPreload() {
    server.use(
      http.get(`http://localhost:4500/api/patients/${PATIENT_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: patientDetailWithResidence }),
      ),
      http.get('http://localhost:4500/api/geo-locations/geo-1', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: geoLocationWithCoordinates }),
      ),
    );
  }

  it('con la precarga resuelta y sin arrastrar, el guardado envía patientLatitude/Longitude: null', async () => {
    mockPreload();
    let receivedBody: Record<string, unknown> | null = null;
    mockPut((body) => {
      receivedBody = body;
    });
    const user = setupUser();
    renderSection({ community: emptyCommunityDetail(), patientId: PATIENT_1 });

    await screen.findByText(/Posición aproximada/);

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({ patientLatitude: null, patientLongitude: null });
  });

  it('tras editar las coordenadas a mano, el aviso desaparece y el guardado envía el punto', async () => {
    mockPreload();
    let receivedBody: Record<string, unknown> | null = null;
    mockPut((body) => {
      receivedBody = body;
    });
    const user = setupUser();
    renderSection({ community: emptyCommunityDetail(), patientId: PATIENT_1 });

    await screen.findByText(/Posición aproximada/);

    // A single `fireEvent.change` per field, not keystroke-by-keystroke `user.type`: typing "-0"
    // character by character round-trips through `MapPointPicker`'s controlled `value`, which
    // resets the draft to "0" the instant `-0` rounds to `0` (SPEC FE13a §3.7's primitive, not
    // this section's own logic) and would silently drop the sign.
    fireEvent.change(screen.getByRole('textbox', { name: 'Latitud' }), { target: { value: '-0.5' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Longitud' }), { target: { value: '-78.1' } });

    expect(screen.queryByText(/Posición aproximada/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect(receivedBody).toMatchObject({ patientLatitude: -0.5, patientLongitude: -78.1 });
  });
});

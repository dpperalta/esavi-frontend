import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { ColdChainSection } from './ColdChainSection';

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

function emptyColdChainDetail(overrides: Record<string, unknown> = {}) {
  return {
    investigationId: INVESTIGATION_1,
    investigation: { investigationId: INVESTIGATION_1, caseId: CASE_1, isActive: true },
    storageTemperatureMonitored: null,
    storageRangeDeviation: null,
    storageProcedureFollowed: null,
    storageOtherObjectPresent: null,
    storagePartiallyReconstitutedVaccine: null,
    storageVaccineNotUsable: null,
    storageDiluentNotUsable: null,
    storageKeyFindings: null,
    transportUsedThermos: null,
    transportSetInThermos: null,
    transportReturnedInThermos: null,
    transportUsedColdPack: null,
    transportTypeThermo: null,
    transportKeyFindings: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderSection(props: Partial<Parameters<typeof ColdChainSection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const onRevealTransport = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ColdChainSection
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        coldChain={null}
        transportRevealed={false}
        onRevealTransport={onRevealTransport}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved, onRevealTransport };
}

describe('ColdChainSection — apertura de la ficha (SPEC FE13d §4 paso 9)', () => {
  it('al revelarse con la ficha inexistente, lanza exactamente un POST { investigationId }', async () => {
    let postCount = 0;
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-cold-chains', async ({ request }) => {
        postCount++;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyColdChainDetail() });
      }),
    );
    renderSection();

    await waitFor(() => expect(postCount).toBe(1));
    expect(receivedBody).toEqual({ investigationId: INVESTIGATION_1 });
  });

  it('con la ficha ya creada, no lanza ningún POST', async () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-cold-chains', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyColdChainDetail() });
      }),
    );
    renderSection({ coldChain: emptyColdChainDetail() });

    await screen.findByRole('heading', { name: 'Cadena de frío' });
    expect(postCount).toBe(0);
  });
});

describe('ColdChainSection — E1/E2, dos identificadores y un solo guardado (SPEC FE13d §6 decision 7)', () => {
  it('sin transportRevealed, E2 no se pinta y sí el botón «Continuar»', () => {
    renderSection({ coldChain: emptyColdChainDetail(), transportRevealed: false });

    expect(
      screen.queryByRole('heading', { name: 'Transporte' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('pulsar «Continuar» llama a onRevealTransport sin disparar ninguna petición', async () => {
    let putCount = 0;
    server.use(
      http.put(`http://localhost:4500/api/investigation-cold-chains/${INVESTIGATION_1}`, () => {
        putCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyColdChainDetail() });
      }),
    );
    const user = setupUser();
    const { onRevealTransport } = renderSection({
      coldChain: emptyColdChainDetail(),
      transportRevealed: false,
    });

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(onRevealTransport).toHaveBeenCalledTimes(1);
    expect(putCount).toBe(0);
  });

  it('con transportRevealed, E2 se pinta y el botón «Guardar y continuar» aparece una sola vez', () => {
    renderSection({ coldChain: emptyColdChainDetail(), transportRevealed: true });

    expect(
      screen.getByRole('heading', { name: 'Transporte' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Guardar y continuar' })).toHaveLength(1);
  });
});

describe('ColdChainSection — guardado (SPEC FE13d §4 paso 9)', () => {
  it('storageRangeDeviation:false con la compuerta en true se guarda como false, no como null', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`http://localhost:4500/api/investigation-cold-chains/${INVESTIGATION_1}`, async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyColdChainDetail() });
      }),
    );
    const user = setupUser();
    const { onSaved } = renderSection({
      coldChain: emptyColdChainDetail({
        storageTemperatureMonitored: true,
        storageRangeDeviation: false,
      }),
      transportRevealed: true,
    });

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(receivedBody).toMatchObject({
      storageTemperatureMonitored: true,
      storageRangeDeviation: false,
    });
  });

  it('marcar el paquete frío pone el termo en NO sin ninguna petición', async () => {
    let putCount = 0;
    server.use(
      http.put(`http://localhost:4500/api/investigation-cold-chains/${INVESTIGATION_1}`, () => {
        putCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyColdChainDetail() });
      }),
    );
    const user = setupUser();
    renderSection({
      coldChain: emptyColdChainDetail({ transportUsedThermos: 'YES', transportUsedColdPack: 'NO' }),
      transportRevealed: true,
    });

    await user.click(
      screen.getByRole('combobox', { name: '¿Se usó paquete frío?' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Sí' }));

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: '¿Se usó termo?' }),
      ).toHaveTextContent('No'),
    );
    expect(putCount).toBe(0);
  });

  it('un reset con los dos en YES deja el termo, baja el paquete y pinta el aviso con role="status"', async () => {
    renderSection({
      coldChain: emptyColdChainDetail({ transportUsedThermos: 'YES', transportUsedColdPack: 'YES' }),
      transportRevealed: true,
    });

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'Esta ficha tenía los dos contenedores marcados. Se ha conservado el termo; al guardar quedará corregido.',
    );

    expect(
      screen.getByRole('combobox', { name: '¿Se usó termo?' }),
    ).toHaveTextContent('Sí');
    expect(
      screen.getByRole('combobox', { name: '¿Se usó paquete frío?' }),
    ).toHaveTextContent('No');
  });

  it('el aviso del empate no bloquea el guardado', async () => {
    let putCount = 0;
    server.use(
      http.put(`http://localhost:4500/api/investigation-cold-chains/${INVESTIGATION_1}`, () => {
        putCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: emptyColdChainDetail() });
      }),
    );
    const user = setupUser();
    const { onSaved } = renderSection({
      coldChain: emptyColdChainDetail({ transportUsedThermos: 'YES', transportUsedColdPack: 'YES' }),
      transportRevealed: true,
    });

    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putCount).toBe(1);
    // Muere al guardar (§3.4): el aviso desaparece una vez la escritura resolvió.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

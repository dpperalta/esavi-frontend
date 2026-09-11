import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { useInvestigationSourceByCase } from './api';
import { SourceSection } from './SourceSection';

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

function renderSourceSection(props: Partial<Parameters<typeof SourceSection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SourceSection
        caseId={CASE_1}
        investigationId={INVESTIGATION_1}
        investigationSource={null}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved };
}

const savedInvestigationSource = {
  investigationId: INVESTIGATION_1,
  history: null,
  interviewVaccinatedPerson: null,
  interviewHealthWorker: null,
  vaccinationRecord: null,
  autopsyRecord: null,
  verbalAutopsyRecord: null,
  investigationReport: null,
  other: false,
  otherDescription: null,
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: null,
  deletedAt: null,
  appDetails: [],
  investigation: {
    investigationId: INVESTIGATION_1,
    isActive: true,
    investigationStartDate: null,
    status: null,
    case: { caseId: CASE_1, caseCode: 'C-1', eventDate: null },
  },
};

describe('SourceSection — un interruptor sin tocar (SPEC FE13a §4 paso 7)', () => {
  it('un interruptor sin tocar envía null y no false', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-sources', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: savedInvestigationSource });
      }),
    );
    const user = setupUser();
    const { onSaved } = renderSourceSection();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(receivedBody).toMatchObject({
      investigationId: INVESTIGATION_1,
      history: null,
      interviewVaccinatedPerson: null,
      other: null,
    });
  });

  it('marcar y desmarcar una fuente la envía como false, no null', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-sources', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: savedInvestigationSource });
      }),
    );
    const user = setupUser();
    renderSourceSection();

    const historySwitch = screen.getByRole('switch', { name: 'Historia clínica' });
    await user.click(historySwitch);
    await user.click(historySwitch);
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    expect((receivedBody as { history: unknown }).history).toBe(false);
  });
});

describe('SourceSection — «otra fuente» (SPEC FE13a §3.5 B)', () => {
  it('apagar «otra fuente» limpia el texto y el cuerpo no lo lleva', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('http://localhost:4500/api/investigation-sources', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true, message: 'ok', data: savedInvestigationSource });
      }),
    );
    const user = setupUser();
    renderSourceSection();

    await user.click(screen.getByRole('switch', { name: 'Otro' }));
    await user.type(screen.getByLabelText('Especifique ¿cuál?'), 'Registro clínico externo');
    // Apagar «otra fuente» vuelve a ocultar el textarea (§3.5 B).
    await user.click(screen.getByRole('switch', { name: 'Otro' }));
    expect(screen.queryByLabelText('Especifique ¿cuál?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(receivedBody).not.toBeNull());
    const body = receivedBody as { other: unknown; otherDescription: unknown };
    expect(body.other).toBe(false);
    expect(body.otherDescription).toBeNull();
  });

  it('other:true sin descripción no envía nada — la validación lo bloquea', async () => {
    let postCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-sources', () => {
        postCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: savedInvestigationSource });
      }),
    );
    const user = setupUser();
    renderSourceSection();

    await user.click(screen.getByRole('switch', { name: 'Otro' }));
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() =>
      expect(
        screen.getByText('Especifica cuál es la otra fuente antes de guardar.'),
      ).toBeInTheDocument(),
    );
    expect(postCount).toBe(0);
  });
});

describe('SourceSection — 409 de fila ya existente (SPEC FE13a §3.5 E)', () => {
  it('un 409 INVSRC_001_ALREADY_EXISTS relee en vez de duplicar', async () => {
    let postCount = 0;
    let getCount = 0;
    server.use(
      http.post('http://localhost:4500/api/investigation-sources', () => {
        postCount++;
        return HttpResponse.json(
          { ok: false, message: 'Ya existe', code: 'INVSRC_001_ALREADY_EXISTS' },
          { status: 409 },
        );
      }),
      http.get(`http://localhost:4500/api/investigation-sources/case/${CASE_1}`, () => {
        getCount++;
        return HttpResponse.json({ ok: true, message: 'ok', data: savedInvestigationSource });
      }),
    );

    // La query por caso necesita un observador activo para que `invalidateQueries` dispare un
    // refetch de verdad — en la pantalla real ese observador es `InvestigationStep`, aquí se
    // simula compartiendo el mismo `queryClient` con un `renderHook` propio.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useInvestigationSourceByCase(CASE_1, true), { wrapper: Wrapper });
    await waitFor(() => expect(getCount).toBe(1));

    const onSaved = vi.fn();
    const user = setupUser();
    render(
      <Wrapper>
        <SourceSection
          caseId={CASE_1}
          investigationId={INVESTIGATION_1}
          investigationSource={null}
          showSaveButton
          onSaved={onSaved}
        />
      </Wrapper>,
    );

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(getCount).toBe(2));
    expect(postCount).toBe(1);
    // No avanza la sección sobre un conflicto: `onSaved` es sólo para el camino feliz.
    expect(onSaved).not.toHaveBeenCalled();
  });
});

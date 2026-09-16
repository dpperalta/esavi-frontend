import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { OtherFindingsSection } from './OtherFindingsSection';

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
});

function investigationDetail(overrides: Record<string, unknown> = {}) {
  return {
    investigationId: INVESTIGATION_1,
    case: { caseId: 'case-1', caseCode: 'CASE-1', reportDate: '2026-01-01', eventDate: null },
    isActive: true,
    status: null,
    vaccinationSite: null,
    vaccinationHealthFacility: null,
    vaccinationGeoLocation: null,
    hospitalizationDate: null,
    investigationStartDate: null,
    vaccinationLatitude: null,
    vaccinationLongitude: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderSection(props: Partial<Parameters<typeof OtherFindingsSection>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <OtherFindingsSection
        investigationId={INVESTIGATION_1}
        investigation={investigationDetail()}
        showSaveButton
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSaved, queryClient };
}

describe('OtherFindingsSection — sección H sobre la cabecera (SPEC FE13e §3.5 E)', () => {
  it('guarda notes con un PUT contra investigations/:id y llama a onSaved', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(
        `http://localhost:4500/api/investigations/${INVESTIGATION_1}`,
        async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            ok: true,
            message: 'ok',
            data: investigationDetail({ notes: 'hallazgo relevante' }),
          });
        },
      ),
    );
    const user = setupUser();
    const { onSaved } = renderSection();

    await user.type(screen.getByLabelText('Observaciones'), 'hallazgo relevante');
    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(receivedBody).toEqual({ notes: 'hallazgo relevante' });
  });

  it('el notes leído se precarga en el campo al reentrar', () => {
    renderSection({ investigation: investigationDetail({ notes: 'observación previa' }) });

    expect(screen.getByLabelText('Observaciones')).toHaveValue('observación previa');
  });

  it('un guardado en H no invalida las claves de las dos fichas nuevas', async () => {
    server.use(
      http.put(`http://localhost:4500/api/investigations/${INVESTIGATION_1}`, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: investigationDetail() }),
      ),
    );
    const user = setupUser();
    const { queryClient } = renderSection();

    queryClient.setQueryData(['investigationAdministrationError', 'byCase', 'case-1'], {
      marker: 'untouched',
    });
    queryClient.setQueryData(['investigationCommunity', 'byCase', 'case-1'], {
      marker: 'untouched',
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: 'Guardar y continuar' }));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(invalidatedKeys).toContain('investigation');
    expect(invalidatedKeys).not.toContain('investigationAdministrationError');
    expect(invalidatedKeys).not.toContain('investigationCommunity');
  });

  it('sin showSaveButton, no se pinta ningún botón', () => {
    renderSection({ showSaveButton: false });

    expect(screen.queryByRole('button', { name: 'Guardar y continuar' })).not.toBeInTheDocument();
  });
});

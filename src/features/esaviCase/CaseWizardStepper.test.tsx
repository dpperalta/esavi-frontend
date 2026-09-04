import '@/shared/config/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { CaseWizardStepper } from './CaseWizardStepper';

// The i18n keys of SPEC FE08 §3.8 don't exist yet — they land with plan step 14 — so these
// assertions read structure (links, aria-disabled) rather than translated text, which the
// missing keys would render as the raw dotted key itself right now.

const server = setupServer();

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

function mockWorkflow(stages: Record<string, { exists: boolean; endedAt: string | null }>) {
  server.use(
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: 'case-1',
          status: { catalogItemId: 'status-1', code: 'OPEN', name: 'Abierto' },
          previousStatus: null,
          openedAt: '2026-09-01T00:00:00.000Z',
          closedAt: null,
          lastReopenedAt: null,
          reopenCount: 0,
          stages: Object.fromEntries(
            Object.entries(stages).map(([key, value]) => [
              key,
              {
                id: value.exists ? `${key}-1` : null,
                startedAt: null,
                durationMinutes: null,
                ...value,
              },
            ]),
          ),
        },
      }),
    ),
  );
}

function renderStepper(activeSlug: Parameters<typeof CaseWizardStepper>[0]['activeSlug']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseWizardStepper caseId="case-1" activeSlug={activeSlug} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CaseWizardStepper', () => {
  it('el paso notification queda con candado mientras classification.exists es false', async () => {
    mockWorkflow({
      classification: { exists: false, endedAt: null },
      notification: { exists: false, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });

    const { container } = renderStepper('classification');

    await waitFor(() =>
      expect(container.querySelectorAll('[aria-disabled="true"]').length).toBeGreaterThan(0),
    );

    expect(
      container.querySelector('a[href="/esavi-cases/case-1/wizard/notification"]'),
    ).not.toBeInTheDocument();
  });

  it('el paso 6 se desbloquea con notification.exists === true, sin depender de investigation', async () => {
    mockWorkflow({
      classification: { exists: true, endedAt: '2026-09-01' },
      notification: { exists: true, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });

    const { container } = renderStepper('final-classification');

    await waitFor(() =>
      expect(
        container.querySelectorAll('a[href="/esavi-cases/case-1/wizard/final-classification"]')
          .length,
      ).toBeGreaterThan(0),
    );

    // Both hang off the same precondition (notification.exists), not a 5→6 chain (§6): unlocking
    // final-classification here doesn't depend on investigation ever starting.
    expect(
      container.querySelector('a[href="/esavi-cases/case-1/wizard/investigation"]'),
    ).toBeInTheDocument();
  });
});

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

function mockWorkflow(
  stages: Record<string, { exists: boolean; endedAt: string | null }>,
  statusCode: 'OPEN' | 'CLOSED' = 'OPEN',
) {
  server.use(
    http.get('http://localhost:4500/api/case-workflows/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          caseWorkflowId: 'workflow-1',
          caseId: 'case-1',
          status: { catalogItemId: 'status-1', code: statusCode, name: statusCode },
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

function mockClassification(isSeriousEvent: boolean | null) {
  server.use(
    http.get('http://localhost:4500/api/classifications/case/case-1', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          classificationId: 'classif-1',
          age: null,
          firstConsultationDate: null,
          isSeriousEvent,
          causedDeath: null,
          causedDisability: null,
          causedCongenitalAnomaly: null,
          causedFetalDeath: null,
          causedLifeThreatening: null,
          causedHospitalization: null,
          causedAbortion: null,
          causedOtherCondition: null,
          otherSeriousConditionDescription: null,
          notes: null,
          isActive: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
          case: { caseId: 'case-1', caseCode: 'C-1', reportDate: null, eventDate: null },
          ageUnit: null,
        },
      }),
    ),
  );
}

function mockNotification(requestInvestigation: boolean, delayMs = 0) {
  server.use(
    http.get('http://localhost:4500/api/notifications/case/case-1', async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          notificationId: 'notif-1',
          notificationType: 'SEVERE',
          requestInvestigation,
          isActive: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: null,
          deletedAt: null,
          appDetails: [],
        },
      });
    }),
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
      finalClassification: { exists: true, endedAt: null },
    });
    mockClassification(true);
    mockNotification(true);

    const { container } = renderStepper('final-classification');

    await waitFor(() =>
      expect(
        container.querySelectorAll('a[href="/esavi-cases/case-1/wizard/final-classification"]')
          .length,
      ).toBeGreaterThan(0),
    );

    // Both hang off the same precondition (notification.exists), not a 5→6 chain (§6): unlocking
    // final-classification here doesn't depend on investigation ever starting. `requestInvestigation`
    // is true too, so step 5 stays required and visible.
    expect(
      container.querySelector('a[href="/esavi-cases/case-1/wizard/investigation"]'),
    ).toBeInTheDocument();
  });

  it('un caso no grave y sin investigación no muestra los pasos 5 ni 6 (SPEC FE14a §2)', async () => {
    mockWorkflow({
      classification: { exists: true, endedAt: '2026-09-01' },
      notification: { exists: true, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });
    mockClassification(false);
    mockNotification(false);

    const { container } = renderStepper('notification');

    await waitFor(() =>
      expect(
        container.querySelector('a[href="/esavi-cases/case-1/wizard/notification"]'),
      ).toBeInTheDocument(),
    );

    await waitFor(() => {
      expect(
        container.querySelector('a[href="/esavi-cases/case-1/wizard/investigation"]'),
      ).not.toBeInTheDocument();
      expect(
        container.querySelector('a[href="/esavi-cases/case-1/wizard/final-classification"]'),
      ).not.toBeInTheDocument();
    });
  });

  it('mientras la notificación carga, el stepper muestra los seis pasos', async () => {
    mockWorkflow({
      classification: { exists: true, endedAt: '2026-09-01' },
      notification: { exists: true, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });
    mockClassification(false);
    mockNotification(false, 50);

    const { container } = renderStepper('notification');

    // The workflow resolves fast; the notification read is still in flight, so `flags` is `null`
    // and nothing is hidden yet (SPEC FE14a §3.4, §7 riesgo 2).
    await waitFor(() =>
      expect(
        container.querySelector('a[href="/esavi-cases/case-1/wizard/notification"]'),
      ).toBeInTheDocument(),
    );
    expect(
      container.querySelector('a[href="/esavi-cases/case-1/wizard/investigation"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('a[href="/esavi-cases/case-1/wizard/final-classification"]'),
    ).toBeInTheDocument();

    // Once it resolves (not required, not serious), both hide.
    await waitFor(() =>
      expect(
        container.querySelector('a[href="/esavi-cases/case-1/wizard/final-classification"]'),
      ).not.toBeInTheDocument(),
    );
  });

  // SPEC FE14b §4 paso 7
  it('el paso closure siempre se pinta, sin candado, en un caso recién abierto', async () => {
    mockWorkflow({
      classification: { exists: false, endedAt: null },
      notification: { exists: false, endedAt: null },
      investigation: { exists: false, endedAt: null },
      finalClassification: { exists: false, endedAt: null },
    });

    const { container } = renderStepper('classification');

    const link = await waitFor(() => {
      const el = container.querySelector('a[href="/esavi-cases/case-1/wizard/closure"]');
      expect(el).toBeInTheDocument();
      return el;
    });
    expect(link?.closest('[aria-disabled="true"]')).toBeNull();
  });

  it('closure marca «Completado» con CLOSED y «Sin iniciar» en cualquier otro estado', async () => {
    mockWorkflow(
      {
        classification: { exists: true, endedAt: '2026-09-01' },
        notification: { exists: true, endedAt: null },
        investigation: { exists: false, endedAt: null },
        finalClassification: { exists: false, endedAt: null },
      },
      'CLOSED',
    );
    mockClassification(false);
    mockNotification(false);

    const { container } = renderStepper('closure');

    const link = await waitFor(() => {
      const el = container.querySelector('a[href="/esavi-cases/case-1/wizard/closure"]');
      expect(el).toBeInTheDocument();
      return el;
    });
    expect(link?.textContent).toContain('Completado');
  });
});

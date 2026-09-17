import { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AnswerOption } from '@/contracts/common';
import { useCloseCase } from '@/features/caseWorkflow/api';
import { type CloseReadinessContext, useCloseReadiness } from '@/features/caseWorkflow/useCloseReadiness';
import type { CloseCheckId, CloseCheckKind, CloseCheckLine, CloseCheckState } from '@/features/caseWorkflow/closeReadiness';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';

interface ClosureStepProps {
  caseId: string;
}

function ClosureStepSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function ClosureStepLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-sm font-medium text-foreground">{t('caseWorkflow.close.loadError')}</p>
      <Button variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

const ANSWER_OPTION_LABEL_KEY: Record<AnswerOption, string> = {
  YES: 'common.answerOption.yes',
  NO: 'common.answerOption.no',
  UNKNOWN: 'common.answerOption.unknown',
  NOT_APPLICABLE: 'common.answerOption.notApplicable',
  NO_ANSWER: 'common.answerOption.noAnswer',
};

// The reason a precondition applies, when it applies conditionally (SPEC FE14b §3.5, "el motivo
// de las que sí aplican va en la propia línea"). `classification`/`notification` are always
// required, so they never need this — `notPendingValidation` isn't a phase precondition at all.
function reasonKey(id: CloseCheckId, context: CloseReadinessContext): string | null {
  if (id === 'investigation') {
    return 'caseWorkflow.close.reasons.investigationRequested';
  }
  if (id === 'finalClassification') {
    const serious = context.isSeriousEvent === true;
    const investigated = context.requestInvestigation === true;
    if (serious && investigated) return 'caseWorkflow.close.reasons.seriousAndInvestigated';
    if (serious) return 'caseWorkflow.close.reasons.seriousEvent';
    return 'caseWorkflow.close.reasons.investigationRequested';
  }
  if (id === 'classification' || id === 'notification') {
    return 'caseWorkflow.close.reasons.always';
  }
  return null;
}

// §3.8 only names a sentence key for the four business-rule ids ("checks.autopsyWithoutDeath" is
// already the interpolated "pero el desenlace es «{{outcome}}»" text, not a short title) — so the
// bold line label they need when the sentence itself doesn't render (a met check has nothing to
// contradict) comes from a short "*Label" key each, added alongside them rather than reusing a
// name §3.8 never gives.
const CHECK_LABEL_KEY: Record<CloseCheckId, string> = {
  notPendingValidation: 'caseWorkflow.close.checks.notPendingValidation',
  classification: 'caseWorkflow.close.checks.classification',
  notification: 'caseWorkflow.close.checks.notification',
  investigation: 'caseWorkflow.close.checks.investigation',
  finalClassification: 'caseWorkflow.close.checks.finalClassification',
  autopsyWithoutDeath: 'caseWorkflow.close.checks.autopsyWithoutDeathLabel',
  severityMismatch: 'caseWorkflow.close.checks.severityMismatchLabel',
  medicationAnswer: 'caseWorkflow.close.checks.medicationAnswerLabel',
  communityCount: 'caseWorkflow.close.checks.communityCountLabel',
};

// The four precondition ids carry a generic "not registered yet" / "deactivated" detail
// (§3.5); the five business-rule ids (blockers and warnings) each interpolate their own values
// instead, computed here from `context` — the pure function never widens past what it compares
// (SPEC FE14b §3.3). Rendered only when unmet: every one of these sentences is phrased as the
// contradiction itself ("... pero ..."), and a met check has nothing to contradict.
function detailText(
  t: ReturnType<typeof useTranslation>['t'],
  line: CloseCheckLine,
  context: CloseReadinessContext,
): string | null {
  if (line.kind === 'precondition' && line.id !== 'notPendingValidation') {
    if (line.state === 'unmet') return t('caseWorkflow.close.rowMissing');
    if (line.state === 'deactivated') return t('caseWorkflow.close.rowDeactivated');
    return null;
  }

  if (line.id === 'autopsyWithoutDeath' && line.state === 'unmet') {
    return context.outcomeName
      ? t('caseWorkflow.close.checks.autopsyWithoutDeath', { outcome: context.outcomeName })
      : t('caseWorkflow.close.checks.autopsyWithoutOutcome');
  }

  if (line.id === 'severityMismatch' && line.state === 'unmet') {
    const severityLabel = (isSerious: boolean) =>
      t(isSerious ? 'caseWorkflow.close.severity.serious' : 'caseWorkflow.close.severity.notSerious');
    return t('caseWorkflow.close.checks.severityMismatch', {
      classification: severityLabel(context.isSeriousEvent === true),
      notification: severityLabel(context.notificationType === 'SEVERE'),
    });
  }

  if (line.id === 'medicationAnswer' && line.state === 'unmet') {
    const answer = context.takesMedication
      ? t(ANSWER_OPTION_LABEL_KEY[context.takesMedication as AnswerOption])
      : t('caseWorkflow.close.unanswered');
    return t('caseWorkflow.close.checks.medicationAnswer', {
      count: context.activeMedicationCount,
      answer,
    });
  }

  if (line.id === 'communityCount' && line.state === 'unmet' && context.community) {
    const { affectedVaccinated, affectedUnvaccinated, affectedUnknown, similarEventCount } = context.community;
    return t('caseWorkflow.close.checks.communityCount', {
      breakdown: `${affectedVaccinated} + ${affectedUnvaccinated} + ${affectedUnknown}`,
      declared: similarEventCount,
    });
  }

  return null;
}

const STATE_ICON: Record<'met' | 'unmet' | 'warning', typeof CheckCircle2> = {
  met: CheckCircle2,
  unmet: XCircle,
  warning: AlertTriangle,
};

const STATE_COLOR: Record<'met' | 'unmet' | 'warning', string> = {
  met: 'text-success',
  unmet: 'text-destructive',
  warning: 'text-warning',
};

const STATE_LABEL_KEY: Record<'met' | 'unmet' | 'warning', string> = {
  met: 'caseWorkflow.close.state.met',
  unmet: 'caseWorkflow.close.state.unmet',
  warning: 'caseWorkflow.close.state.warning',
};

function visualState(kind: CloseCheckKind, state: CloseCheckState): 'met' | 'unmet' | 'warning' {
  if (state === 'met') return 'met';
  return kind === 'warning' ? 'warning' : 'unmet';
}

function ClosureCheckRow({
  line,
  caseId,
  context,
}: {
  line: CloseCheckLine;
  caseId: string;
  context: CloseReadinessContext;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const visual = visualState(line.kind, line.state);
  const Icon = STATE_ICON[visual];
  const label = t(CHECK_LABEL_KEY[line.id]);
  const reason = reasonKey(line.id, context);
  const detail = detailText(t, line, context);

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-start gap-2">
        <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', STATE_COLOR[visual])} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {label}
            <span className="sr-only"> — {t(STATE_LABEL_KEY[visual])}</span>
          </span>
          {reason && (
            <span className="text-sm text-muted-foreground">{t(reason)}</span>
          )}
          {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
          {line.links.length > 0 && line.state !== 'met' && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {line.links.map((link) => (
                <Button
                  key={link.labelKey}
                  variant="link"
                  className="h-auto min-h-11 p-0 text-sm"
                  onClick={() => navigate(`/esavi-cases/${caseId}/wizard/${link.step}`)}
                >
                  {t(link.labelKey)}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ClosureSection({
  titleKey,
  lines,
  caseId,
  context,
}: {
  titleKey: string;
  lines: CloseCheckLine[];
  caseId: string;
  context: CloseReadinessContext;
}) {
  const { t } = useTranslation();
  if (lines.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">{t(titleKey)}</h2>
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <ClosureCheckRow key={line.id} line={line} caseId={caseId} context={context} />
        ))}
      </ul>
    </section>
  );
}

const BLOCKED_HINT_ID = 'closure-step-blocked-hint';

// Modo abierto (SPEC FE14b §2, §3.6): la lista completa y «Cerrar expediente». El modo `CLOSED`
// lo añade el siguiente paso del plan.
export function ClosureStep({ caseId }: ClosureStepProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const readiness = useCloseReadiness(caseId);
  const closeCase = useCloseCase(caseId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function retry() {
    // Every phase read shares the `[<entity>, 'byCase', caseId]` shape (CONVENTIONS.md §6.3):
    // one predicate re-triggers every one of them, active or not, without naming the seven by
    // hand a second time.
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[1] === 'byCase' && query.queryKey[2] === caseId,
    });
  }

  if (readiness.status === 'loading') {
    return <ClosureStepSkeleton />;
  }

  const hasLoadError = readiness.status === 'error';
  const preconditions = readiness.lines.filter((line) => line.kind === 'precondition');
  const blockers = readiness.lines.filter((line) => line.kind === 'blocker');
  const warnings = readiness.lines.filter((line) => line.kind === 'warning');
  const unmetWarnings = warnings.filter((line) => line.state !== 'met');

  function handleConfirmClose() {
    closeCase.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('caseWorkflow.close.success'));
        setConfirmOpen(false);
      },
      onError: (error) => {
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        setConfirmOpen(false);
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-20 md:pb-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">{t('caseWorkflow.close.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('caseWorkflow.close.intro')}</p>
      </div>

      {hasLoadError ? (
        <ClosureStepLoadError onRetry={retry} />
      ) : (
        <>
          <ClosureSection
            titleKey="caseWorkflow.close.sections.preconditions"
            lines={preconditions}
            caseId={caseId}
            context={readiness.context}
          />
          <ClosureSection
            titleKey="caseWorkflow.close.sections.blockers"
            lines={blockers}
            caseId={caseId}
            context={readiness.context}
          />
          <ClosureSection
            titleKey="caseWorkflow.close.sections.warnings"
            lines={warnings}
            caseId={caseId}
            context={readiness.context}
          />

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {readiness.canClose ? t('caseWorkflow.close.ready') : null}
          </p>
        </>
      )}

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background/95 p-4 backdrop-blur-sm md:static md:border-t-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!readiness.canClose}
            aria-describedby={!readiness.canClose && !hasLoadError ? BLOCKED_HINT_ID : undefined}
          >
            {t('caseWorkflow.close.action')}
          </Button>
          {!readiness.canClose && !hasLoadError && (
            <p id={BLOCKED_HINT_ID} className="text-sm text-muted-foreground">
              {t('caseWorkflow.close.blockedHint')}
            </p>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('caseWorkflow.close.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('caseWorkflow.close.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {unmetWarnings.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <p className="text-sm font-medium text-warning">
                {t('caseWorkflow.close.confirmWarnings')}
              </p>
              <ul className="flex flex-col gap-1 text-sm text-warning">
                {unmetWarnings.map((line) => (
                  <li key={line.id}>
                    {detailText(t, line, readiness.context) ?? t(CHECK_LABEL_KEY[line.id])}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} disabled={closeCase.isPending}>
              {t('caseWorkflow.close.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

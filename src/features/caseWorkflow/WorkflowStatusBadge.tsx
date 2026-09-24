import { useTranslation } from 'react-i18next';
import type { CaseWorkflowDetail } from '@/contracts/declared/caseWorkflow';
import { Badge } from '@/shared/components/ui/badge';

interface WorkflowStatusBadgeProps {
  workflow: Pick<CaseWorkflowDetail, 'status' | 'previousStatus'>;
}

// SPEC FE23 §3.1 — shared by the case detail and the wizard header. "venía de …" is part of the
// text, not a tooltip (§3.7), so the badge must be allowed to wrap: the base Badge is a
// single-line `h-5 whitespace-nowrap` chip that would clip the long label at 375px.
export function WorkflowStatusBadge({ workflow }: WorkflowStatusBadgeProps) {
  const { t } = useTranslation();
  const { status, previousStatus } = workflow;

  // `previousStatus` null while pending is the inconsistency behind `011_PREVIOUS_STATUS_MISSING`
  // (§3.3): the badge falls back to the bare status name.
  const label =
    status.code === 'PENDING_VALIDATION' && previousStatus
      ? t('caseWorkflow.validation.statusWithPrevious', {
          status: status.name,
          previous: previousStatus.name,
        })
      : status.name;

  return (
    <Badge
      variant={status.code === 'CLOSED' ? 'outline' : 'default'}
      className="h-auto min-h-5 min-w-0 shrink whitespace-normal"
    >
      {label}
    </Badge>
  );
}

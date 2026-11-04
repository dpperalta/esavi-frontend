import type { TFunction } from 'i18next';
import {
  CASE_WORKFLOW_STATUS_CODES,
  type CaseWorkflowStatusCode,
} from '@/contracts/declared/caseWorkflow';

function isKnownStatusCode(code: string): code is CaseWorkflowStatusCode {
  return (CASE_WORKFLOW_STATUS_CODES as readonly string[]).includes(code);
}

// SPEC F65 §8 — localized by `statusCode`; the catalog `statusName` is Spanish-only and only
// covers a state the backend added after CASE_WORKFLOW_STATUS_CODES was last reconciled.
export function statusLabel(t: TFunction, code: string, fallback: string): string {
  return isKnownStatusCode(code) ? t(`caseWorkflow.status.${code}`) : fallback;
}

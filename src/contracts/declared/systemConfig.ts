// Origin: esavi-backend/src/services/systemConfig.service.ts, shapeSingleSystemConfig.
// The shape of ESAVI-SYSCONF-003 and -006. Declared complete, not as the subset today's only
// consumer (the country ISO code) needs: FE08 declared CaseWorkflowDetail short and FE09 had to
// reconcile it — the missing fields cost more than declaring them once. `value` is `unknown`
// here too: it is `valueType` that says how to read it, and the client checks before treating it
// as a string. sysDetails is never exposed and is not declared.
import type { AppDetails } from '@/contracts/common';

export interface SystemConfigDetail {
  systemConfigId: string;
  code: string;
  name: string;
  description: string | null;
  value: unknown;
  valueType: string;
  scope: string;
  isEncrypted: boolean;
  isEditable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

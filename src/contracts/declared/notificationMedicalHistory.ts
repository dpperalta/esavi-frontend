// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE12e §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails, TermSource } from '@/contracts/common';

// GET .../notification-medical-histories/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/notificationMedicalHistory.service.ts (RESPONSE_ATTRIBUTES,
// DIAGNOSTIC_TERM_INCLUDE, toNotificationMedicalHistoryResponse). The parent `notification` is
// deleted from the payload and never reaches the client, and `sysDetails` never leaves the service.
//
// `diagnosticTerm` comes back as an explicit `null` when the antecedent was notified without a
// code, so the client never has to tell "empty" from "absent". There is no `historyName` here and
// no canonical name field either: what the form shows on reread is `historyRaw ?? diagnosticTerm.
// name`, and `historyRaw` is null exactly when the notifier wrote what the master already says
// (SPEC FE12e §3.3).
export interface NotificationMedicalHistoryDetail {
  medicalHistoryId: string;
  notificationId: string;
  diagnosticTermId: string | null;
  historyRaw: string | null;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  diagnosticTerm: {
    diagnosticTermId: string;
    source: TermSource;
    code: string | null;
    name: string;
    termGroup: string | null;
    isActive: boolean;
  } | null;
}

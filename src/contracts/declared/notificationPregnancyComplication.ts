// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE12d §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails, TermSource } from '@/contracts/common';

// GET .../notification-pregnancy-complications/pregnancy/:id (002A), POST (001), PUT (004) —
// origin: esavi-backend/src/services/notificationPregnancyComplication.service.ts
// (DIAGNOSTIC_TERM_INCLUDE, COMPLICATION_TYPE_INCLUDE, toNotificationPregnancyComplicationResponse).
// `diagnosticTerm` comes back `null` when the complication was written free-text with no code
// (SPEC FE12d §3.3, §3.5 tabla de `source`). There is no `esaviName` here, unlike
// `notificationEvent`: this table does not store a canonical name of its own — the field the form
// shows on reread is `complicationRawName` when it exists, and `diagnosticTerm.name` otherwise.
export interface NotificationPregnancyComplicationDetail {
  complicationId: string;
  pregnancyId: string;
  diagnosticTermId: string | null;
  complicationTypeItemId: string | null;
  complicationRawName: string | null;
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
  complicationType: {
    catalogItemId: string;
    code: string;
    name: string;
    isActive: boolean;
  } | null;
}

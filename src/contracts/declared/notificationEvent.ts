// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE12b §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails, TermSource } from '@/contracts/common';

// GET .../notification-events/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/notificationEvent.service.ts (DIAGNOSTIC_TERM_INCLUDE,
// toNotificationEventResponse). diagnosticTerm comes back as an explicit null when the event was
// never coded, so the client does not have to tell "empty" from "absent". `source` never appears
// here: it is input only and discarded once the resolution runs (SPEC FE12b §3.3).
export interface NotificationEventDetail {
  eventId: string;
  notificationId: string;
  diagnosticTermId: string | null;
  sortOrder: number;
  esaviName: string;
  esaviCode: string | null;
  esaviRawName: string | null;
  isMainEsavi: boolean;
  startDate: string | null;
  startTime: string | null;
  isOtherEsavi: boolean;
  otherDescription: string | null;
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

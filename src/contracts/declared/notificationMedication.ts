// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE12b §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';

// GET .../notification-medications/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/notificationMedication.service.ts (PHARMACEUTICAL_FORM_INCLUDE,
// ADMINISTRATION_ROUTE_INCLUDE, toNotificationMedicationResponse). The two catalog items come back
// as explicit nulls when the notifier did not choose them. No `whodrugProduct` type crosses into
// this row: the buscador only ever fills `medicationName` and `medicationCode`, two strings, and
// there is no foreign key behind either (SPEC FE12b §3.3).
export interface NotificationMedicationDetail {
  medicationId: string;
  notificationId: string;
  sortOrder: number;
  medicationName: string;
  medicationCode: string | null;
  dose: string | null;
  pharmaceuticalFormItemId: string | null;
  administrationRouteItemId: string | null;
  startDate: string | null;
  isOtherMedication: boolean;
  otherMedicationText: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  pharmaceuticalForm: { catalogItemId: string; code: string; name: string } | null;
  administrationRoute: { catalogItemId: string; code: string; name: string } | null;
}

// NOT a mirror: the backend builds this response as a flattened Sequelize instance, with no
// `interface` `contracts:sync` could copy (SPEC FE12c §3.3). Reconciled by hand against
// esavi-backend/src/services/notificationVaccine.service.ts (toNotificationVaccineResponse,
// VACCINE_WHODRUG_INCLUDE) if the backend changes.
import type { AppDetails } from '@/contracts/common';

// GET .../notification-vaccines/case/:id (006), POST (001), PUT (004) — `vaccineWhodrug` comes
// back as an explicit `null` when the vaccine was notified without being coded (the rama cruda of
// SPEC FE12c §3.5), and carries only the three columns the client copies from — the other 26 are
// governance of the dictionary, read through `ESAVI-WHODRUG-003` when the tree resolves.
export interface NotificationVaccineDetail {
  vaccineId: string;
  notificationId: string;
  vaccineWhodrugId: string | null;
  sortOrder: number;
  isSuspected: boolean;
  whoCode: string | null;
  vaccineCode: string | null;
  vaccineName: string | null;
  vaccinationDate: string | null;
  vaccinationTime: string | null;
  doseNumber: number | null;
  batchNumber: string | null;
  expirationDate: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  vaccineWhodrug: {
    vaccineWhodrugId: string;
    drugCode: string | null;
    drugName: string;
  } | null;
}

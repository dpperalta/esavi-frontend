// NOT a mirror: the backend builds this response as a literal — `toNotificationPregnancyResponse`
// drops `sysDetails`/`notification` off the Sequelize instance's `toJSON()`, no `interface` to
// copy (SPEC FE12d §3.3). Reconciled by hand if the backend changes; `contracts:sync` never writes
// into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';

// GET .../notification-pregnancies/notification/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/notificationPregnancy.service.ts (toNotificationPregnancyResponse).
// `wasPregnantAtVaccination` is nullable here even though ESAVI-NOTIFPRG-001 demands it on create:
// the column itself allows null, because `004` can withdraw a wrongly given answer without losing
// the row (SPEC FE12d §3.3) — the response type follows the DDL, not the create input.
export interface NotificationPregnancyDetail {
  pregnancyId: string;
  notificationId: string;
  wasPregnantAtVaccination: AnswerOption | null;
  wasPregnantAtEsavi: AnswerOption | null;
  lastMenstruationDate: string | null;
  probableDeliveryDate: string | null;
  hasComplications: AnswerOption | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}

// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy (SPEC FE12a §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AnswerOption, AppDetails } from '@/contracts/common';
import type { NotificationType } from '@/contracts/notification';

// GET .../notifications/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/notification.service.ts:27-46 (CASE_INCLUDE, OUTCOME_INCLUDE,
// DETAIL_EXCLUDE, toNotificationResponse). value travels alongside code and name on outcome
// since SPEC F46: the death rule reads it, not code, because code belongs to the country catalog.
export interface NotificationDetail {
  notificationId: string;
  notificationType: NotificationType;
  esaviDescription: string;
  hasRelevantMedicalHistory: AnswerOption | null;
  takesMedication: AnswerOption | null;
  requestInvestigation: boolean;
  deathDate: string | null;
  autopsyRequested: boolean | null;
  verbalAutopsyPerformed: boolean | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  case: { caseId: string; caseCode: string; reportDate: string | null; eventDate: string | null };
  outcome: { catalogItemId: string; code: string; name: string; value: string | null } | null;
}

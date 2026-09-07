import { useQuery } from '@tanstack/react-query';
import type { CreateNonSevereNotificationInput } from '@/contracts/nonSevereNotification';
import type { CreateNotificationInput, NotificationType } from '@/contracts/notification';
import type { CreateSevereNotificationInput } from '@/contracts/severeNotification';
import type { NonSevereNotificationDetail } from '@/contracts/declared/nonSevereNotification';
import type { NotificationDetail } from '@/contracts/declared/notification';
import type { SevereNotificationDetail } from '@/contracts/declared/severeNotification';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';

// POST   /api/notifications                ESAVI-NOTIFCN-001  USER   create (+ seals notificationStartedAt)
// GET    /api/notifications                ESAVI-NOTIFCN-002A USER   active listing — unused, no notification screen (SPEC FE12a §3.2)
// GET    /api/notifications/admin          ESAVI-NOTIFCN-002B ADMIN  incl. inactive — unused, same reason
// GET    /api/notifications/case/:id       ESAVI-NOTIFCN-006  USER   detail by case, in reentry — hand-written below
// GET    /api/notifications/:id            ESAVI-NOTIFCN-003  USER   detail by own PK — unused, `006` covers reentry
// PUT    /api/notifications/:id            ESAVI-NOTIFCN-004  USER   edit from the wizard
// DELETE /api/notifications/:id            ESAVI-NOTIFCN-005A ADMIN  deactivate — out of scope, the wizard never retires a notification (§2)
// PATCH  /api/notifications/activate/:id   ESAVI-NOTIFCN-005B SUPERADMIN — out of scope, same reason
// DELETE /api/notifications/purge/:id      ESAVI-NOTIFCN-005C SUPERADMIN — out of scope, same reason
export const notificationResource = createResource<
  NotificationDetail,
  CreateNotificationInput,
  Partial<CreateNotificationInput>
>({
  key: 'notification',
  path: 'notifications',
  idField: 'notificationId',
  inactiveMode: 'adminPath',
  // Required by `assertConfig` with `inactiveMode: 'adminPath'`, even though `useList` is never
  // called (no notification listing screen — SPEC FE12a §2). Same case as `classificationResource`.
  adminPath: 'notifications/admin',
});

// POST   /api/severe-notifications         ESAVI-SEVNOT-001  USER   create the branch, `notificationId` is the PK the client sends
// GET    /api/severe-notifications/case/:id ESAVI-SEVNOT-006 USER   detail by case, in reentry — hand-written below
// GET    /api/severe-notifications/:id     ESAVI-SEVNOT-003  USER   detail by own PK — unused, `006` covers reentry
// PUT    /api/severe-notifications/:id     ESAVI-SEVNOT-004  USER   edit from the wizard
// DELETE /api/severe-notifications/purge/:id ESAVI-SEVNOT-005C SUPERADMIN — out of scope (§2); the
// table carries no `isActive` of its own (SPEC FE12a §3.3), so there is no `005A`/`005B` either.
export const severeNotificationResource = createResource<
  SevereNotificationDetail,
  CreateSevereNotificationInput,
  Partial<CreateSevereNotificationInput>
>({
  key: 'severeNotification',
  path: 'severe-notifications',
  idField: 'notificationId',
  inactiveMode: 'serverDecides',
  // No `PATCH /activate/:id` exists for this entity at all (API-ROUTES.md) — unlike
  // `classificationResource`/`notificationResource`, `hasActivate` is false, not just unused.
  hasActivate: false,
});

// POST   /api/non-severe-notifications         ESAVI-NSEVNOT-001 USER   create the branch, `notificationId` is the PK the client sends
// GET    /api/non-severe-notifications/case/:id ESAVI-NSEVNOT-006 USER  detail by case, in reentry — hand-written below
// GET    /api/non-severe-notifications/:id     ESAVI-NSEVNOT-003 USER  detail by own PK — unused, `006` covers reentry
// PUT    /api/non-severe-notifications/:id     ESAVI-NSEVNOT-004 USER  edit from the wizard
// DELETE /api/non-severe-notifications/purge/:id ESAVI-NSEVNOT-005C SUPERADMIN — out of scope (§2);
// same reason as its severe sibling, no `isActive` of its own.
export const nonSevereNotificationResource = createResource<
  NonSevereNotificationDetail,
  CreateNonSevereNotificationInput,
  Partial<CreateNonSevereNotificationInput>
>({
  key: 'nonSevereNotification',
  path: 'non-severe-notifications',
  idField: 'notificationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function notificationByCaseKey(caseId: string) {
  return ['notification', 'byCase', caseId] as const;
}

// ESAVI-NOTIFCN-006 — read by caseId, not by the row's own PK, same reasoning as
// `useClassificationByCase` (SPEC FE11 §3.1). `enabled` follows `stages.notification.exists`
// (passed in by the caller) so a fresh case never fires a `404` this screen would otherwise have
// to swallow silently (SPEC FE12a §3.4: "sin `staleTime`; se invalida tras cada escritura").
export function useNotificationByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: notificationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<NotificationDetail>(`notifications/case/${caseId}`);
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
  });
}

function severeNotificationByCaseKey(caseId: string) {
  return ['severeNotification', 'byCase', caseId] as const;
}

// ESAVI-SEVNOT-006. `enabled` only with `SEVERE` (SPEC FE12a §3.4 and criterio de aceptación:
// con un caso `SEVERE` la pantalla no llama a `non-severe-notifications/case/:id`, y al revés) —
// the branch that does not match `notificationType` does not exist by definition, and asking for
// it is a guaranteed `404` on every load of the step.
export function useSevereNotificationByCase(
  caseId: string | undefined,
  notificationType: NotificationType | undefined,
) {
  return useQuery({
    queryKey: severeNotificationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<SevereNotificationDetail>(
        `severe-notifications/case/${caseId}`,
      );
      return response.data;
    },
    enabled: caseId !== undefined && notificationType === 'SEVERE',
  });
}

function nonSevereNotificationByCaseKey(caseId: string) {
  return ['nonSevereNotification', 'byCase', caseId] as const;
}

// ESAVI-NSEVNOT-006. `enabled` only with `NON_SEVERE`, mirroring its severe sibling above.
export function useNonSevereNotificationByCase(
  caseId: string | undefined,
  notificationType: NotificationType | undefined,
) {
  return useQuery({
    queryKey: nonSevereNotificationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<NonSevereNotificationDetail>(
        `non-severe-notifications/case/${caseId}`,
      );
      return response.data;
    },
    enabled: caseId !== undefined && notificationType === 'NON_SEVERE',
  });
}

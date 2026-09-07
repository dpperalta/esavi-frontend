import { useQuery } from '@tanstack/react-query';
import type { CreateNonSevereNotificationInput } from '@/contracts/nonSevereNotification';
import type { CreateNotificationEventInput } from '@/contracts/notificationEvent';
import type { CreateNotificationInput, NotificationType } from '@/contracts/notification';
import type { CreateNotificationMedicationInput } from '@/contracts/notificationMedication';
import type { CreateSevereNotificationInput } from '@/contracts/severeNotification';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { NonSevereNotificationDetail } from '@/contracts/declared/nonSevereNotification';
import type { NotificationDetail } from '@/contracts/declared/notification';
import type { NotificationEventDetail } from '@/contracts/declared/notificationEvent';
import type { NotificationMedicationDetail } from '@/contracts/declared/notificationMedication';
import type { SevereNotificationDetail } from '@/contracts/declared/severeNotification';
import type { WhodrugProductSearchResult } from '@/contracts/declared/whodrugProduct';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';
import { EsaviApiError } from '@/shared/api/types';

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

export function severeNotificationByCaseKey(caseId: string) {
  return ['severeNotification', 'byCase', caseId] as const;
}

// ESAVI-SEVNOT-006. `enabled` needs both `SEVERE` (SPEC FE12a §3.4 and criterio de aceptación:
// con un caso `SEVERE` la pantalla no llama a `non-severe-notifications/case/:id`, y al revés —
// the branch that does not match `notificationType` does not exist by definition) and the header
// itself existing (`stageExists`, passed in by the caller): a fresh case has no header yet either.
// Even with both, the branch can still be legitimately missing — the exact partial-failure this
// spec exists to recover from (SPEC FE12a §4 paso 12, §7 riesgo "cabecera creada, rama falla") —
// so `SEVNOT_006_NOT_FOUND` resolves to `null`, "confirmed: no row yet", instead of throwing;
// `useNotificationByCase` above never needs this because its own `stageExists` gate already means
// the row is there.
export function useSevereNotificationByCase(
  caseId: string | undefined,
  notificationType: NotificationType | undefined,
  stageExists: boolean,
) {
  return useQuery({
    queryKey: severeNotificationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<SevereNotificationDetail>(
          `severe-notifications/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'SEVNOT_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: stageExists && caseId !== undefined && notificationType === 'SEVERE',
  });
}

export function nonSevereNotificationByCaseKey(caseId: string) {
  return ['nonSevereNotification', 'byCase', caseId] as const;
}

// ESAVI-NSEVNOT-006. Mirrors its severe sibling above in every respect, `NOT_FOUND` code included.
export function useNonSevereNotificationByCase(
  caseId: string | undefined,
  notificationType: NotificationType | undefined,
  stageExists: boolean,
) {
  return useQuery({
    queryKey: nonSevereNotificationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<NonSevereNotificationDetail>(
          `non-severe-notifications/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'NSEVNOT_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: stageExists && caseId !== undefined && notificationType === 'NON_SEVERE',
  });
}

// POST   /api/notification-events            ESAVI-NOTIFEVT-001   USER   create
// GET    /api/notification-events/case/:id   ESAVI-NOTIFEVT-006   USER   events of the case, in reentry — hand-written below
// PUT    /api/notification-events/:id        ESAVI-NOTIFEVT-004   ADMIN  update (§10.4 half-applied — SPEC FE12b §3.2)
// DELETE /api/notification-events/:id        ESAVI-NOTIFEVT-005A  ADMIN  soft delete
// Out of scope (SPEC FE12b §2): the two 002A/002B listings (the `006` above covers both, entered
// by caseId), 003 by own PK, 005B/005C (SUPERADMIN, reactivate/purge).
export const notificationEventResource = createResource<
  NotificationEventDetail,
  CreateNotificationEventInput,
  Partial<CreateNotificationEventInput>
>({
  key: 'notificationEvent',
  path: 'notification-events',
  idField: 'eventId',
  // No screen ever toggles inactive rows for a satellite (SPEC FE12b §2: "sin toggle de mostrar
  // inactivos"), so `useList`/`useListByParent` are never called here either — same case as
  // `severeNotificationResource` above.
  inactiveMode: 'serverDecides',
});

export function notificationEventsByCaseKey(caseId: string) {
  return ['notificationEvent', 'byCase', caseId] as const;
}

// ESAVI-NOTIFEVT-006 — the real query of the domain (notificationEvent.service.ts): the client
// holds `caseId`, not `notificationId`. Returns `{ count, rows }` with no pagination UI over it —
// every active event of the notification comes back in one page. No `staleTime` (SPEC FE12b
// §3.4): the three mutations of `notificationEventResource` above invalidate this exact key on
// every write, and that is the only thing that should ever make it stale.
export function useNotificationEventsByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: notificationEventsByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<NotificationEventDetail>>(
        `notification-events/case/${caseId}`,
      );
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST   /api/notification-medications            ESAVI-NOTIFMED-001   USER   create
// GET    /api/notification-medications/case/:id   ESAVI-NOTIFMED-006   USER   medications of the case, in reentry — hand-written below
// PUT    /api/notification-medications/:id        ESAVI-NOTIFMED-004   ADMIN  update (§10.4 half-applied)
// DELETE /api/notification-medications/:id        ESAVI-NOTIFMED-005A  ADMIN  soft delete
// Same out-of-scope routes as its event sibling above.
export const notificationMedicationResource = createResource<
  NotificationMedicationDetail,
  CreateNotificationMedicationInput,
  Partial<CreateNotificationMedicationInput>
>({
  key: 'notificationMedication',
  path: 'notification-medications',
  idField: 'medicationId',
  inactiveMode: 'serverDecides',
});

export function notificationMedicationsByCaseKey(caseId: string) {
  return ['notificationMedication', 'byCase', caseId] as const;
}

// ESAVI-NOTIFMED-006. Mirrors its event sibling above in every respect.
export function useNotificationMedicationsByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: notificationMedicationsByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<NotificationMedicationDetail>>(
        `notification-medications/case/${caseId}`,
      );
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
  });
}

// The `limit` this screen asks for — the caller compares the response's `count` against this same
// number to derive `moreResultsAvailable` (SPEC FE12b §3.2, §3.7).
export const WHODRUG_PRODUCT_SEARCH_LIMIT = 20;

// ESAVI-WHODPROD-006 — search against the local WHODrug mirror, never `<EntitySearchSelect>`: the
// route takes `term`, not `name`/`code`, and returns pairs with no id to open later (SPEC FE12b
// §6, decisión tomada). `staleTime` is 30 minutes, not MedDRA's 5: this is a query against a local
// mirror that only changes when a SUPERADMIN runs the `007` (SPEC FE12b §3.4).
export function useWhodrugProductSearch(term: string) {
  const trimmed = term.trim();

  return useQuery({
    queryKey: ['whodrugProduct', 'search', trimmed],
    queryFn: async () => {
      const response = await client.get<WhodrugProductSearchResult>('whodrug-products/search', {
        params: { term: trimmed, limit: WHODRUG_PRODUCT_SEARCH_LIMIT },
      });
      return response.data;
    },
    // Below the validator's three-character minimum the backend answers 400 — the hook never
    // fires, mirroring `useHealthFacilitySearch`'s reasoning for its own two-character floor.
    enabled: trimmed.length >= 3,
    staleTime: 30 * 60 * 1000,
  });
}

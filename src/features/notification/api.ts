import { useQuery } from '@tanstack/react-query';
import type { CreateNonSevereNotificationInput } from '@/contracts/nonSevereNotification';
import type { CreateNotificationEventInput } from '@/contracts/notificationEvent';
import type { CreateNotificationInput, NotificationType } from '@/contracts/notification';
import type { CreateNotificationMedicationInput } from '@/contracts/notificationMedication';
import type { CreateNotificationDiluentInput } from '@/contracts/notificationDiluent';
import type { CreateNotificationVaccineInput } from '@/contracts/notificationVaccine';
import type { CreateNotificationPregnancyInput } from '@/contracts/notificationPregnancy';
import type { CreateNotificationPregnancyComplicationInput } from '@/contracts/notificationPregnancyComplication';
import type { CreateSevereNotificationInput } from '@/contracts/severeNotification';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import type { NonSevereNotificationDetail } from '@/contracts/declared/nonSevereNotification';
import type { NotificationDetail } from '@/contracts/declared/notification';
import type { NotificationDiluentDetail } from '@/contracts/declared/notificationDiluent';
import type { NotificationEventDetail } from '@/contracts/declared/notificationEvent';
import type { NotificationMedicationDetail } from '@/contracts/declared/notificationMedication';
import type { NotificationVaccineDetail } from '@/contracts/declared/notificationVaccine';
import type { NotificationPregnancyDetail } from '@/contracts/declared/notificationPregnancy';
import type { NotificationPregnancyComplicationDetail } from '@/contracts/declared/notificationPregnancyComplication';
import type { MeddraSearchResult } from '@/contracts/declared/meddra';
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

// ESAVI-MEDDRA-006 — search against the licensed dictionary, never against `diagnosticTerm`
// directly: the clinical catalog is only ever read or written by the resolution the service runs
// on `POST`/`PUT` of `notificationEvent` (SPEC FE12b §3.2, "Qué no se consume"). `term` is the
// only parameter the backend accepts — `take` and the level flags live in
// `ESAVI_MEDDRA_SEARCH_CONFIG` and are not open to the client (meddra.validator.ts). `staleTime`
// is 5 minutes, matching the server's own per-term-and-language cache, because behind this one
// there is a paid API limited to 60 requests per 15 minutes (SPEC FE12b §3.4).
export function useMeddraSearch(term: string) {
  const trimmed = term.trim();

  return useQuery({
    queryKey: ['meddra', 'search', trimmed],
    queryFn: async () => {
      const response = await client.get<MeddraSearchResult>('meddra/search', {
        params: { term: trimmed },
      });
      return response.data;
    },
    // Below the validator's three-character minimum the backend answers 400 — the hook never
    // fires, same reasoning as `useWhodrugProductSearch`'s own floor.
    enabled: trimmed.length >= 3,
    staleTime: 5 * 60 * 1000,
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

// POST   /api/notification-vaccines          ESAVI-NOTIFVAC-001   USER   create
// GET    /api/notification-vaccines/case/:id ESAVI-NOTIFVAC-006   USER   vaccines of the case, in reentry — hand-written below
// PUT    /api/notification-vaccines/:id      ESAVI-NOTIFVAC-004   ADMIN  update (§10.4 half-applied, SPEC FE12c §3.2)
// DELETE /api/notification-vaccines/:id      ESAVI-NOTIFVAC-005A  ADMIN  soft delete
// Same out-of-scope routes as its event and medication siblings above (002A/002B, 003, 005B/005C).
export const notificationVaccineResource = createResource<
  NotificationVaccineDetail,
  CreateNotificationVaccineInput,
  Partial<CreateNotificationVaccineInput>
>({
  key: 'notificationVaccine',
  path: 'notification-vaccines',
  idField: 'vaccineId',
  inactiveMode: 'serverDecides',
});

export function notificationVaccinesByCaseKey(caseId: string) {
  return ['notificationVaccine', 'byCase', caseId] as const;
}

// ESAVI-NOTIFVAC-006. Mirrors its event and medication siblings above in every respect — no
// `staleTime`: expediente data invalidates on every write, never ages on its own (SPEC FE12c §3.4).
export function useNotificationVaccinesByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: notificationVaccinesByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<NotificationVaccineDetail>>(
        `notification-vaccines/case/${caseId}`,
      );
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST   /api/notification-diluents             ESAVI-NOTIFDIL-001   USER   create
// GET    /api/notification-diluents/vaccine/:id ESAVI-NOTIFDIL-002A  USER   diluents of one vaccine — hand-written below
// PUT    /api/notification-diluents/:id         ESAVI-NOTIFDIL-004   ADMIN  update (§10.4 half-applied)
// DELETE /api/notification-diluents/:id         ESAVI-NOTIFDIL-005A  ADMIN  soft delete
// `NOTIFDIL` is the only one of the six satellites with no `006` by case (SPEC FE12c §1): it reads
// by `vaccineId`, one vaccine at a time, and 002A is its only listing — there is no admin variant.
export const notificationDiluentResource = createResource<
  NotificationDiluentDetail,
  CreateNotificationDiluentInput,
  Partial<CreateNotificationDiluentInput>
>({
  key: 'notificationDiluent',
  path: 'notification-diluents',
  idField: 'diluentId',
  inactiveMode: 'serverDecides',
});

export function notificationDiluentsByVaccineKey(vaccineId: string) {
  return ['notificationDiluent', 'byVaccine', vaccineId] as const;
}

// ESAVI-NOTIFDIL-002A — read only while the modal of that vaccine is open (`enabled`), lazily and
// one vaccine at a time (SPEC FE12c §3.4): there is no case-wide listing to prefetch instead.
export function useNotificationDiluentsByVaccine(vaccineId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: notificationDiluentsByVaccineKey(vaccineId ?? ''),
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<NotificationDiluentDetail>>(
        `notification-diluents/vaccine/${vaccineId}`,
      );
      return response.data;
    },
    enabled: enabled && vaccineId !== undefined,
  });
}

// POST   /api/notification-pregnancies                   ESAVI-NOTIFPRG-001  USER  create
// GET    /api/notification-pregnancies/notification/:id  ESAVI-NOTIFPRG-006  USER  the block, in reentry — hand-written below
// PUT    /api/notification-pregnancies/:id                ESAVI-NOTIFPRG-004  USER  update and clear (SPEC FE12d §2, §8)
// Out of scope (SPEC FE12d §2, §3.2): `005A` — never called, `UQ_notificationPregnancy_notification`
// does not filter by `deletedAt` so a retired row still occupies the slot and only a SUPERADMIN
// (`005B`) can bring it back; clearing the block is a `004`, never a `DELETE`. Also out: `003` (the
// `006` above covers reentry) and `005B`/`005C` (SUPERADMIN).
export const notificationPregnancyResource = createResource<
  NotificationPregnancyDetail,
  CreateNotificationPregnancyInput,
  Partial<CreateNotificationPregnancyInput>
>({
  key: 'notificationPregnancy',
  path: 'notification-pregnancies',
  idField: 'pregnancyId',
  inactiveMode: 'serverDecides',
});

export function notificationPregnancyByNotificationKey(notificationId: string) {
  return ['notificationPregnancy', 'byNotification', notificationId] as const;
}

// ESAVI-NOTIFPRG-006 — by `notificationId`, not by `caseId`: the only one of the six satellites of
// the step read this way (SPEC FE12d §3.2). Two distinct 404 codes exist on the backend
// (`NOTIFPRG_006_NOTIFICATION_NOT_FOUND` is a dead end, `NOTIFPRG_006_NOT_FOUND` means "this
// notification has no pregnancy yet"); only the second resolves to `null` — "confirmed, no row
// yet" — the same reasoning `useSevereNotificationByCase` uses above.
export function useNotificationPregnancyByNotification(
  notificationId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: notificationPregnancyByNotificationKey(notificationId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<NotificationPregnancyDetail>(
          `notification-pregnancies/notification/${notificationId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'NOTIFPRG_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: enabled && notificationId !== undefined,
  });
}

// POST   /api/notification-pregnancy-complications                ESAVI-PREGCOMP-001   USER   create
// GET    /api/notification-pregnancy-complications/pregnancy/:id  ESAVI-PREGCOMP-002A  USER   complications of the pregnancy, in reentry — hand-written below
// PUT    /api/notification-pregnancy-complications/:id            ESAVI-PREGCOMP-004   USER   update
// DELETE /api/notification-pregnancy-complications/:id            ESAVI-PREGCOMP-005A  ADMIN  soft delete — §10.4, the one write this spec re-requests
// Out of scope (SPEC FE12d §3.2): `002B` (ADMIN, includes inactive — the wizard shows none), `003`
// (the `002A` above covers reentry), `005B`/`005C` (SUPERADMIN).
export const notificationPregnancyComplicationResource = createResource<
  NotificationPregnancyComplicationDetail,
  CreateNotificationPregnancyComplicationInput,
  Partial<CreateNotificationPregnancyComplicationInput>
>({
  key: 'notificationPregnancyComplication',
  path: 'notification-pregnancy-complications',
  idField: 'complicationId',
  inactiveMode: 'serverDecides',
});

export function notificationPregnancyComplicationsByPregnancyKey(pregnancyId: string) {
  return ['notificationPregnancyComplication', 'byPregnancy', pregnancyId] as const;
}

// ESAVI-PREGCOMP-002A. `enabled` follows the parent having a `pregnancyId` (SPEC FE12d §3.4,
// "fase 2"): the list stays disabled until `notificationPregnancyResource`'s `001` returns one, no
// `staleTime` — the three mutations of the resource above invalidate this exact key on every write.
export function useNotificationPregnancyComplicationsByPregnancy(
  pregnancyId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: notificationPregnancyComplicationsByPregnancyKey(pregnancyId ?? ''),
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<NotificationPregnancyComplicationDetail>>(
        `notification-pregnancy-complications/pregnancy/${pregnancyId}`,
      );
      return response.data;
    },
    enabled: enabled && pregnancyId !== undefined,
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

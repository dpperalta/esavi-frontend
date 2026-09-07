// Resolves the toast text for an EsaviApiError. The `code` decides, never a parse of `message`
// (CONVENTIONS.md §6.2). `errors` is debugging material and never reaches this module.
import { i18next } from '@/shared/config/i18n';
import type { EsaviApiError } from '@/shared/api/types';

// Grows as each entity declares its own codes (CONVENTIONS.md §6.4). A code routed to a form
// field via `errorFieldMap` (SPEC FE02 §3.6) doesn't need an entry here — it never reaches a
// toast, and the field shows the backend's own translated `message` instead (CONVENTIONS.md
// §6.2). Entries here are for codes that *do* reach the toast — a stable, client-owned text for
// a stable code, the same pattern SPEC FE01's ChangePasswordForm already uses.
const ERROR_CODE_KEYS: Record<string, string> = {
  // SPEC FE02 §3.6 — the three catalogType codes that go to the toast, not to a field.
  CATTYPE_001_CREATION_FAILED: 'catalogType.errors.CATTYPE_001_CREATION_FAILED',
  CATTYPE_004_UPDATE_FAILED: 'catalogType.errors.CATTYPE_004_UPDATE_FAILED',
  CATTYPE_004_NOT_FOUND: 'catalogType.errors.CATTYPE_004_NOT_FOUND',
  // SPEC FE03 §3.5 — the catalogItem codes that go to the toast: the type isn't a form field, so
  // `_CATTYPE_NOT_FOUND` has nowhere to mark; the other three are reachable only from a stale tab
  // (§3.6, §7), never from an action this screen offers.
  CATITEM_001_CATTYPE_NOT_FOUND: 'catalogItem.errors.CATITEM_001_CATTYPE_NOT_FOUND',
  CATITEM_004_CATTYPE_NOT_FOUND: 'catalogItem.errors.CATITEM_004_CATTYPE_NOT_FOUND',
  CATITEM_004_NOT_FOUND: 'catalogItem.errors.CATITEM_004_NOT_FOUND',
  CATITEM_005A_VALUE_LOCKED: 'catalogItem.errors.CATITEM_005A_VALUE_LOCKED',
  CATITEM_005A_ALREADY_INACTIVE: 'catalogItem.errors.CATITEM_005A_ALREADY_INACTIVE',
  CATITEM_005B_ALREADY_ACTIVE: 'catalogItem.errors.CATITEM_005B_ALREADY_ACTIVE',
  // SPEC FE04 §3.6, hallazgo C — errorFieldMap only maps the `GEOTYPE_*` CODE_EXISTS codes to
  // the `code` field; these three go to the toast instead.
  GEOTYPE_004_NOT_FOUND: 'geoLevelType.errors.GEOTYPE_004_NOT_FOUND',
  GEOTYPE_005A_ALREADY_INACTIVE: 'geoLevelType.errors.GEOTYPE_005A_ALREADY_INACTIVE',
  GEOTYPE_005B_ALREADY_ACTIVE: 'geoLevelType.errors.GEOTYPE_005B_ALREADY_ACTIVE',
  // SPEC FE04 §3.6 — errorFieldMap only maps the four `GEOLOC_*` FK/duplicate codes to a field;
  // these three go to the toast instead.
  GEOLOC_004_NOT_FOUND: 'geoLocation.errors.GEOLOC_004_NOT_FOUND',
  GEOLOC_005A_ALREADY_INACTIVE: 'geoLocation.errors.GEOLOC_005A_ALREADY_INACTIVE',
  GEOLOC_005B_ALREADY_ACTIVE: 'geoLocation.errors.GEOLOC_005B_ALREADY_ACTIVE',
  // SPEC FE06 §3.7 — errorFieldMap only maps the FK/duplicate/cycle codes to a field; these go
  // to the toast instead. HFAC_005A_HAS_ACTIVE_CHILDREN (hallazgo F) needs its own text: the
  // deactivation failed because of dependent facilities, not a generic server error.
  HFAC_003_NOT_FOUND: 'healthFacility.errors.HFAC_003_NOT_FOUND',
  HFAC_004_NOT_FOUND: 'healthFacility.errors.HFAC_004_NOT_FOUND',
  HFAC_005A_NOT_FOUND: 'healthFacility.errors.HFAC_005A_NOT_FOUND',
  HFAC_005B_NOT_FOUND: 'healthFacility.errors.HFAC_005B_NOT_FOUND',
  HFAC_005A_ALREADY_INACTIVE: 'healthFacility.errors.HFAC_005A_ALREADY_INACTIVE',
  HFAC_005B_ALREADY_ACTIVE: 'healthFacility.errors.HFAC_005B_ALREADY_ACTIVE',
  HFAC_005A_HAS_ACTIVE_CHILDREN: 'healthFacility.errors.HFAC_005A_HAS_ACTIVE_CHILDREN',
  // SPEC FE07 §3.2 — the three `006` codes the screen can't prevent client-side (a required
  // file, an invalid workbook, or one over 20MB) go to the toast. The six `409`s of geoLevelType
  // are deliberately absent: their `message` carries the interpolated detail and is shown as-is.
  GEOLOC_006_FILE_REQUIRED: 'geoBulkImport.errors.GEOLOC_006_FILE_REQUIRED',
  GEOLOC_006_FILE_INVALID: 'geoBulkImport.errors.GEOLOC_006_FILE_INVALID',
  GEOLOC_006_FILE_TOO_LARGE: 'geoBulkImport.errors.GEOLOC_006_FILE_TOO_LARGE',
  // SPEC FE08 §3.6. The two `006` codes reach a dedicated screen (CaseWorkflowErrorScreen), not
  // this catalog, in the one place this spec calls `006` — kept here anyway as the stable
  // fallback text for any other caller. The three `007` codes are the ones that actually reach
  // a toast: `STAGE_NOT_STARTED` and `STAGE_ALREADY_COMPLETED` are prevented client-side (the
  // action bar disables "Completar etapa" while `!stages.<stage>.exists`) and only surface here
  // if the workflow state was stale; `CASE_CLOSED` is the real race — the case closed in another
  // tab between this one's last `006` and its `007`.
  CASEFLOW_006_CASE_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_006_CASE_NOT_FOUND',
  CASEFLOW_006_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_006_NOT_FOUND',
  CASEFLOW_007_STAGE_NOT_STARTED: 'caseWorkflow.errors.CASEFLOW_007_STAGE_NOT_STARTED',
  CASEFLOW_007_STAGE_ALREADY_COMPLETED: 'caseWorkflow.errors.CASEFLOW_007_STAGE_ALREADY_COMPLETED',
  CASEFLOW_007_CASE_CLOSED: 'caseWorkflow.errors.CASEFLOW_007_CASE_CLOSED',
  // SPEC FE09 §3.5 — not a toast: CaseWorkflowInbox reads this text itself and shows it inline
  // next to the `statusCode` selector, after clearing the offending filter from the URL.
  CASEFLOW_002_STATUS_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_002_STATUS_NOT_FOUND',
  // SPEC FE09 §4.14 — deactivate/reactivate from the list's row menu, same four-code shape as
  // every other entity's 005A/005B.
  CASE_005A_NOT_FOUND: 'esaviCase.errors.CASE_005A_NOT_FOUND',
  CASE_005B_NOT_FOUND: 'esaviCase.errors.CASE_005B_NOT_FOUND',
  CASE_005A_ALREADY_INACTIVE: 'esaviCase.errors.CASE_005A_ALREADY_INACTIVE',
  CASE_005B_ALREADY_ACTIVE: 'esaviCase.errors.CASE_005B_ALREADY_ACTIVE',
  // SPEC FE10 §3.5 — the paciente no se elige en el paso 2, así que este código no tiene campo
  // que marcar: toast, y `CaseOpeningStep` manda de vuelta al paso 1. `LOCALCODE_MISSING` y
  // `CODE_EXISTS` tampoco tienen campo — `caseCode` lo genera el backend.
  CASE_001_PATIENT_NOT_FOUND: 'esaviCase.errors.CASE_001_PATIENT_NOT_FOUND',
  CASE_001_LOCALCODE_MISSING: 'esaviCase.errors.CASE_001_LOCALCODE_MISSING',
  CASE_001_CODE_EXISTS: 'esaviCase.errors.CASE_001_CODE_EXISTS',
  // SPEC FE10 §3.5 — sólo alcanzable si el caso se desactivó entre las dos escrituras de
  // ESAVI-CASE-001 y ESAVI-NOTIFIER-001 (§3.2).
  NOTIFIER_001_CASE_NOT_FOUND: 'notifier.errors.NOTIFIER_001_CASE_NOT_FOUND',
  // SPEC FE11 §3.5 — ninguno de estos siete debería alcanzarse en el uso normal (el `caseId` sale
  // del wizard, la matriz de coherencia ya bloqueó el envío en el cliente, `AGEUNIT_CATALOG_MISSING`
  // es una precondición de despliegue): un solo texto genérico basta, no uno por código.
  // `CLASSIF_00X_AGEUNIT_NOT_FOUND` no está aquí — va al campo `ageUnitItemId` vía
  // `classificationErrorFieldMap` (features/classification/schemas.ts), nunca al toast.
  CLASSIF_001_CASE_NOT_FOUND: 'classification.error.generic',
  CLASSIF_001_CASE_ALREADY_CLASSIFIED: 'classification.error.generic',
  CLASSIF_001_AGEUNIT_CATALOG_MISSING: 'classification.error.generic',
  CLASSIF_004_AGEUNIT_CATALOG_MISSING: 'classification.error.generic',
  CLASSIF_001_INVALID_AGE_RANGE: 'classification.error.generic',
  CLASSIF_004_INVALID_AGE_RANGE: 'classification.error.generic',
  CLASSIF_004_NOT_FOUND: 'classification.error.generic',
  CLASSIF_004_SEVERITY_INCOHERENT: 'classification.error.generic',
  // El único con comportamiento propio además del texto: `ClassificationStep` fuerza el modo
  // `CLOSED` del armazón al capturarlo, sin esperar el próximo `006` de workflow (SPEC FE11 §3.5).
  CASEFLOW_012_CASE_CLOSED: 'classification.error.caseClosed',
  // SPEC FE12a §3.5 — los `_CREATION_FAILED`, `_UPDATE_FAILED` y el `_NOT_FOUND`/`_CASE_NOT_FOUND`
  // de crear (`001`) y actualizar (`004`) de las tres entidades (o su equivalente
  // `_NOTIFICATION_NOT_FOUND` en las dos ramas, que no llevan `caseId` propio). Ninguno debería
  // alcanzarse en uso normal — el mismo criterio que FE11 aplicó a los `CLASSIF_*` — así que
  // comparten un texto genérico por entidad, no uno por código. Los códigos con comportamiento
  // propio (`CASEFLOW_012_CASE_CLOSED`, `NOTIFCN_001_CASE_ALREADY_NOTIFIED`,
  // `SEVNOT_001_ALREADY_EXISTS`/`NSEVNOT_001_ALREADY_EXISTS`,
  // `SEVNOT_001_NOTIFICATION_NOT_SEVERE`/`NSEVNOT_001_NOTIFICATION_NOT_NON_SEVERE`) no están aquí:
  // `NotificationStep.tsx` los intercepta antes de llegar a `getErrorMessage`.
  NOTIFCN_001_CREATION_FAILED: 'notification.error.generic',
  NOTIFCN_004_UPDATE_FAILED: 'notification.error.generic',
  NOTIFCN_004_NOT_FOUND: 'notification.error.generic',
  NOTIFCN_001_CASE_NOT_FOUND: 'notification.error.generic',
  SEVNOT_001_CREATION_FAILED: 'notification.error.severeGeneric',
  SEVNOT_004_UPDATE_FAILED: 'notification.error.severeGeneric',
  SEVNOT_004_NOT_FOUND: 'notification.error.severeGeneric',
  SEVNOT_001_NOTIFICATION_NOT_FOUND: 'notification.error.severeGeneric',
  NSEVNOT_001_CREATION_FAILED: 'notification.error.nonSevereGeneric',
  NSEVNOT_004_UPDATE_FAILED: 'notification.error.nonSevereGeneric',
  NSEVNOT_004_NOT_FOUND: 'notification.error.nonSevereGeneric',
  NSEVNOT_001_NOTIFICATION_NOT_FOUND: 'notification.error.nonSevereGeneric',
  // Los `006` (lectura) son un camino aparte del de guardado: sólo se alcanzan desde la rama de
  // error de carga de `NotificationStep`, nunca desde un toast de guardado, así que comparten un
  // único texto de carga en vez de uno por entidad — la pantalla ya sabe que algo no cargó, no
  // hace falta decir cuál de las tres filas fue.
  NOTIFCN_006_NOT_FOUND: 'notification.error.load',
  NOTIFCN_006_CASE_NOT_FOUND: 'notification.error.load',
  SEVNOT_006_NOT_FOUND: 'notification.error.load',
  SEVNOT_006_CASE_NOT_FOUND: 'notification.error.load',
  NSEVNOT_006_NOT_FOUND: 'notification.error.load',
  NSEVNOT_006_CASE_NOT_FOUND: 'notification.error.load',
  // SPEC FE12b §3.5, §4 paso 13 — mismo criterio que el bloque de arriba: un texto genérico por
  // entidad para lo que ninguna acción de la pantalla debería alcanzar en uso normal.
  // `AUTH_ROLE_FORBIDDEN` no está aquí: `EventFormDialog`/`MedicationFormDialog`/`EventList`/
  // `MedicationList` lo interceptan antes de llegar a `getErrorMessage` (§10.4, el aviso de
  // administrador). Los tres `NOT_ALLOWED`/`CONFLICT` de las reglas de «otro» tampoco — van al
  // campo vía `errorFieldMap`, no al toast.
  NOTIFEVT_001_CREATION_FAILED: 'notification.events.error.generic',
  NOTIFEVT_004_UPDATE_FAILED: 'notification.events.error.generic',
  NOTIFEVT_004_NOT_FOUND: 'notification.events.error.generic',
  NOTIFEVT_005A_DELETE_FAILED: 'notification.events.error.generic',
  NOTIFEVT_005A_NOT_FOUND: 'notification.events.error.generic',
  NOTIFEVT_001_NOTIFICATION_NOT_FOUND: 'notification.events.error.generic',
  NOTIFEVT_006_NOT_FOUND: 'notification.events.error.load',
  NOTIFEVT_006_CASE_NOT_FOUND: 'notification.events.error.load',
  NOTIFEVT_006_NOTIFICATION_NOT_FOUND: 'notification.events.error.load',
  NOTIFMED_001_CREATION_FAILED: 'notification.medications.error.generic',
  NOTIFMED_004_UPDATE_FAILED: 'notification.medications.error.generic',
  NOTIFMED_004_NOT_FOUND: 'notification.medications.error.generic',
  NOTIFMED_005A_DELETE_FAILED: 'notification.medications.error.generic',
  NOTIFMED_005A_NOT_FOUND: 'notification.medications.error.generic',
  NOTIFMED_001_NOTIFICATION_NOT_FOUND: 'notification.medications.error.generic',
  NOTIFMED_006_NOT_FOUND: 'notification.medications.error.load',
  NOTIFMED_006_CASE_NOT_FOUND: 'notification.medications.error.load',
  NOTIFMED_006_NOTIFICATION_NOT_FOUND: 'notification.medications.error.load',
  // Los dos buscadores nunca deberían alcanzar este toast en uso normal: `<TermSearchField>`
  // intercepta `isError` y degrada a texto libre con el mismo texto de estado de servicio antes
  // de que un `EsaviApiError` llegue tan lejos (§3.5) — esto es sólo el respaldo estable para
  // cualquier otro llamador, igual que el resto de este archivo.
  MEDDRA_006_DISABLED: 'notification.events.meddraUnavailable',
  MEDDRA_006_NOT_CONFIGURED: 'notification.events.meddraUnavailable',
  MEDDRA_006_TIMEOUT: 'notification.events.meddraUnavailable',
  MEDDRA_006_SEARCH_FAILED: 'notification.events.meddraUnavailable',
  MEDDRA_006_AUTH_FAILED: 'notification.events.meddraUnavailable',
  WHODPROD_006_NOT_CONFIGURED: 'notification.medications.catalogUnavailable',
  WHODPROD_006_FETCH_FAILED: 'notification.medications.catalogUnavailable',
};

export function getErrorMessage(error: EsaviApiError): string {
  const key = ERROR_CODE_KEYS[error.code];
  if (key) {
    return i18next.t(key);
  }
  if (error.message) {
    return error.message;
  }
  return i18next.t('common.errors.unexpected');
}

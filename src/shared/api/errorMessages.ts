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
  // SPEC FE14b §3.5 — close (008) and reopen (009). The closure step prevents the six `409`s of
  // `008`, so they only surface when its checklist was stale; `useCloseCase` re-reads on them.
  CASEFLOW_008_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_008_NOT_FOUND',
  CASEFLOW_008_ALREADY_CLOSED: 'caseWorkflow.errors.CASEFLOW_008_ALREADY_CLOSED',
  CASEFLOW_008_PENDING_VALIDATION: 'caseWorkflow.errors.CASEFLOW_008_PENDING_VALIDATION',
  CASEFLOW_008_CLASSIFICATION_REQUIRED: 'caseWorkflow.errors.CASEFLOW_008_CLASSIFICATION_REQUIRED',
  CASEFLOW_008_NOTIFICATION_REQUIRED: 'caseWorkflow.errors.CASEFLOW_008_NOTIFICATION_REQUIRED',
  CASEFLOW_008_INVESTIGATION_REQUIRED: 'caseWorkflow.errors.CASEFLOW_008_INVESTIGATION_REQUIRED',
  CASEFLOW_008_FINAL_CLASSIFICATION_REQUIRED:
    'caseWorkflow.errors.CASEFLOW_008_FINAL_CLASSIFICATION_REQUIRED',
  CASEFLOW_008_CLOSE_FAILED: 'caseWorkflow.errors.CASEFLOW_008_CLOSE_FAILED',
  CASEFLOW_009_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_009_NOT_FOUND',
  CASEFLOW_009_NOT_CLOSED: 'caseWorkflow.errors.CASEFLOW_009_NOT_CLOSED',
  CASEFLOW_009_REOPEN_FAILED: 'caseWorkflow.errors.CASEFLOW_009_REOPEN_FAILED',
  // SPEC FE23 §3.5 — request (010) and resolve (011) validation. The three `409`s are races with
  // another tab; the hooks re-read `006` on them. `011_PREVIOUS_STATUS_MISSING` is a data
  // inconsistency in the backend and is not retried.
  CASEFLOW_010_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_010_NOT_FOUND',
  CASEFLOW_010_ALREADY_PENDING: 'caseWorkflow.errors.CASEFLOW_010_ALREADY_PENDING',
  CASEFLOW_010_CASE_CLOSED: 'caseWorkflow.errors.CASEFLOW_010_CASE_CLOSED',
  CASEFLOW_010_STATUS_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_010_STATUS_NOT_FOUND',
  CASEFLOW_010_REQUEST_FAILED: 'caseWorkflow.errors.CASEFLOW_010_REQUEST_FAILED',
  CASEFLOW_011_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_011_NOT_FOUND',
  CASEFLOW_011_NOT_PENDING: 'caseWorkflow.errors.CASEFLOW_011_NOT_PENDING',
  CASEFLOW_011_PREVIOUS_STATUS_MISSING: 'caseWorkflow.errors.CASEFLOW_011_PREVIOUS_STATUS_MISSING',
  CASEFLOW_011_STATUS_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_011_STATUS_NOT_FOUND',
  CASEFLOW_011_RESOLVE_FAILED: 'caseWorkflow.errors.CASEFLOW_011_RESOLVE_FAILED',
  // SPEC FE24 §3.5 — deactivate (005A) and reactivate (005B) the workflow record. The two `409`s
  // are races with another tab; the hooks re-read the inbox and `006` on them.
  CASEFLOW_005A_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_005A_NOT_FOUND',
  CASEFLOW_005A_ALREADY_INACTIVE: 'caseWorkflow.errors.CASEFLOW_005A_ALREADY_INACTIVE',
  CASEFLOW_005A_DELETE_FAILED: 'caseWorkflow.errors.CASEFLOW_005A_DELETE_FAILED',
  CASEFLOW_005B_NOT_FOUND: 'caseWorkflow.errors.CASEFLOW_005B_NOT_FOUND',
  CASEFLOW_005B_ALREADY_ACTIVE: 'caseWorkflow.errors.CASEFLOW_005B_ALREADY_ACTIVE',
  CASEFLOW_005B_ACTIVATE_FAILED: 'caseWorkflow.errors.CASEFLOW_005B_ACTIVATE_FAILED',
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
  // Conserva su texto propio; el cambio a sólo lectura ya no es de cada paso: lo hace el
  // `MutationCache` global de `queryClient.ts` para todo `*_CASE_CLOSED` (SPEC FE17 §3.1).
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
  // SPEC FE12e §3.5 — sólo los dos `404` del `006`, que son el estado de error de la sección
  // y no «no hay antecedentes». Los dos `ALREADY_EXISTS` van al campo vía `errorFieldMap`, el
  // `_DIAGTERM_NOT_FOUND` tiene comportamiento propio en el diálogo y el `AUTH_ROLE_FORBIDDEN`
  // del `005A` lo intercepta `MedicalHistoryList` con el aviso de §10.4.
  MEDHIST_006_CASE_NOT_FOUND: 'notification.medicalHistory.error.load',
  MEDHIST_006_NOTIFICATION_NOT_FOUND: 'notification.medicalHistory.error.load',
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
  // SPEC FE13c §3.5, §7.D — the three write-path codes per entity that ought to be unreachable in
  // normal use (the same criterion FE11/FE12a applied to `CLASSIF_*`/`NOTIFCN_*`): the `caseId`/
  // `investigationId` the dialogs send always comes from state this screen already confirmed
  // exists. `INVCLIEV_00X_*_REQUIRED`/`_NOT_ALLOWED`, `EVALINST_00X_ALREADY_EXISTS`/
  // `_IDENTIFICATION_REQUIRED` and `INVDIAG_00X_DIAGTERM_NOT_FOUND`/`_ALREADY_EXISTS`/
  // `_INVALID_DIAGNOSTIC_TYPE` aren't here — they go to a field via their `errorFieldMap`
  // (`features/investigation/schemas.ts`). `EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` isn't
  // here either — `EvaluationInstitutionFormDialog` intercepts it before `getErrorMessage` to
  // create the missing ficha and retry (§7 riesgo E).
  INVCLIEV_001_CREATION_FAILED: 'investigation.clinicalEvaluation.errors.saveFailed',
  INVCLIEV_004_UPDATE_FAILED: 'investigation.clinicalEvaluation.errors.saveFailed',
  INVCLIEV_004_NOT_FOUND: 'investigation.clinicalEvaluation.errors.saveFailed',
  EVALINST_001_CREATION_FAILED: 'investigation.evaluationInstitution.errors.saveFailed',
  EVALINST_004_UPDATE_FAILED: 'investigation.evaluationInstitution.errors.saveFailed',
  EVALINST_004_NOT_FOUND: 'investigation.evaluationInstitution.errors.saveFailed',
  INVDIAG_001_CREATION_FAILED: 'investigation.diagnostic.errors.saveFailed',
  INVDIAG_004_UPDATE_FAILED: 'investigation.diagnostic.errors.saveFailed',
  INVDIAG_004_NOT_FOUND: 'investigation.diagnostic.errors.saveFailed',
  // The one read-path code of §3.2's dual-404 table that IS an error (the sibling
  // `INVDIAG_006_INVESTIGATION_NOT_FOUND` is the empty state `DiagnosticList` renders itself,
  // never a toast).
  INVDIAG_006_CASE_NOT_FOUND: 'investigation.diagnostic.errors.caseNotFound',
  // SPEC FE13d §3.5, §7.E — same criterion as FE13c above: the write-path codes per entity that
  // ought to be unreachable in normal use, one generic text per entity. The business-rule codes
  // (`CLUSTER_SAME_VIAL_COUNT_REQUIRED`, `CLUSTER_FIELDS_NOT_ALLOWED`, `TRANSPORT_CONTAINER_CONFLICT`,
  // `MOMENT_NOT_FOUND`/`MULTIDOSE_NOT_FOUND`, `ALREADY_EXISTS`, `WHODRUG_NOT_FOUND`) aren't here —
  // they go to a field via `investigationVaccinationContextErrorFieldMap`/
  // `vaccineAdministeredErrorFieldMap` (`features/investigation/schemas.ts`), and their message
  // is the backend's own already-translated text (CONVENTIONS.md §6.2) — a second, client-authored
  // string here would just be a second translation of the same thing.
  INVVACTX_001_CREATION_FAILED: 'investigation.vaccinationContext.errors.saveFailed',
  INVVACTX_004_UPDATE_FAILED: 'investigation.vaccinationContext.errors.saveFailed',
  INVVACTX_004_NOT_FOUND: 'investigation.vaccinationContext.errors.saveFailed',
  INVVACAD_001_CREATION_FAILED: 'investigation.vaccinesAdministered.errors.saveFailed',
  INVVACAD_004_UPDATE_FAILED: 'investigation.vaccinesAdministered.errors.saveFailed',
  INVVACAD_004_NOT_FOUND: 'investigation.vaccinesAdministered.errors.saveFailed',
  INVCOLD_001_CREATION_FAILED: 'investigation.coldChain.errors.saveFailed',
  INVCOLD_004_UPDATE_FAILED: 'investigation.coldChain.errors.saveFailed',
  INVCOLD_004_NOT_FOUND: 'investigation.coldChain.errors.saveFailed',
  INVADMER_001_CREATION_FAILED: 'investigation.administrationError.errors.saveFailed',
  INVADMER_004_UPDATE_FAILED: 'investigation.administrationError.errors.saveFailed',
  INVADMER_004_NOT_FOUND: 'investigation.administrationError.errors.saveFailed',
  // SPEC FE13e §1.B, §3.5 A — the minimum rule is validated client-side before every submit
  // (`isSyringeTypeDeclared` in `features/investigation/schemas.ts`), so this code should never
  // reach the server. Registered anyway as a safety net, pointing at the same text the `<fieldset>`
  // already shows inline.
  INVADMER_001_SYRINGE_TYPE_REQUIRED: 'investigation.administrationError.syringes.minimumRequired',
  INVADMER_004_SYRINGE_TYPE_REQUIRED: 'investigation.administrationError.syringes.minimumRequired',
  INVCOMM_001_CREATION_FAILED: 'investigation.community.errors.saveFailed',
  INVCOMM_004_UPDATE_FAILED: 'investigation.community.errors.saveFailed',
  INVCOMM_004_NOT_FOUND: 'investigation.community.errors.saveFailed',
  // SPEC FE13e §1.E, §3.5 D, §6 decision 17 — the form never produces the state that triggers
  // either of these two (the description obligation is validated client-side and closing the gate
  // always clears the five fields in the same request), but the server's precedence between them
  // isn't reproduced, so both codes are registered regardless.
  INVCOMM_001_SIMILAR_EVENT_DESCRIPTION_REQUIRED:
    'investigation.community.errors.similarEventDescriptionRequired',
  INVCOMM_004_SIMILAR_EVENT_DESCRIPTION_REQUIRED:
    'investigation.community.errors.similarEventDescriptionRequired',
  INVCOMM_001_SIMILAR_EVENT_FIELDS_NOT_ALLOWED:
    'investigation.community.errors.similarEventFieldsNotAllowed',
  INVCOMM_004_SIMILAR_EVENT_FIELDS_NOT_ALLOWED:
    'investigation.community.errors.similarEventFieldsNotAllowed',
  // SPEC FE20 §3.5 — the codes of the user screens that reach a toast. The six that go to a field
  // (`USER_001_*`/`USER_004_*` duplicates and the two role codes of the alta) are absent: they are
  // routed by `userErrorFieldMap` (features/user/schemas.ts) and never get here.
  //
  // The two 409 of `005A` need a text of their own: deactivating yourself and deactivating the last
  // superadministrator are the two things an administrator has to understand at once.
  USER_005A_SELF_DEACTIVATION: 'user.errors.selfDeactivation',
  USER_005A_LAST_SUPERADMIN: 'user.errors.lastSuperAdmin',
  // The roles block. `ASSIGNMENT_EXISTS` is not a rule the user broke: the cache was stale, so its
  // text asks for another attempt after `UserRolesCard` invalidates the assignments.
  USERROLE_007_ROLE_LEVEL_EXCEEDED: 'user.errors.roleLevelExceeded',
  USERROLE_007_ASSIGNMENT_EXISTS: 'user.errors.assignmentExists',
  // SPEC FE21 §3.5 — the appRole codes with no field to mark. The duplicate and escalation codes
  // of `001`/`004` are absent: `appRoleErrorFieldMap` routes those to `code`, `name` and `level`.
  // These three reach the listing's row menu, which hides the action the backend refuses — they
  // are the stale-tab case, and each needs a text that says which guard stopped it.
  APPROLE_004_SYSTEM_ROLE: 'appRole.errors.systemRole',
  APPROLE_005A_SYSTEM_ROLE: 'appRole.errors.systemRole',
  APPROLE_005A_SUPERADMIN_ROLE: 'appRole.errors.superAdminRole',
  APPROLE_005A_HAS_ACTIVE_ASSIGNMENTS: 'appRole.errors.hasActiveAssignments',
  // SPEC FE22 §3.5 — the userGeoLocation codes with no field to mark. `007_ASSIGNMENT_EXISTS` is
  // here and not in a field map on purpose: it means the picker's exclusion was stale, so the
  // text asks for another attempt after the listing is invalidated. The other three describe the
  // state of a row the action menu already hides — the stale-tab case.
  USERGEO_007_ASSIGNMENT_EXISTS: 'userGeoLocation.errors.assignmentExists',
  USERGEO_004_ALREADY_INACTIVE: 'userGeoLocation.errors.alreadyInactive',
  USERGEO_005A_ALREADY_INACTIVE: 'userGeoLocation.errors.alreadyInactive',
  USERGEO_006_ALREADY_INACTIVE: 'userGeoLocation.errors.alreadyInactive',
  USERGEO_005B_ALREADY_ACTIVE: 'userGeoLocation.errors.alreadyActive',
  // SPEC FE25a §3.5 — the diluent codes with no field to mark. The two `CODE_EXISTS` are absent:
  // `diluentErrorFieldMap` routes them to `code`.
  DILUENT_003_NOT_FOUND: 'diluent.errors.DILUENT_003_NOT_FOUND',
  DILUENT_004_NOT_FOUND: 'diluent.errors.DILUENT_004_NOT_FOUND',
  DILUENT_005A_NOT_FOUND: 'diluent.errors.DILUENT_005A_NOT_FOUND',
  DILUENT_005B_NOT_FOUND: 'diluent.errors.DILUENT_005B_NOT_FOUND',
  DILUENT_005A_ALREADY_INACTIVE: 'diluent.errors.DILUENT_005A_ALREADY_INACTIVE',
  DILUENT_005B_ALREADY_ACTIVE: 'diluent.errors.DILUENT_005B_ALREADY_ACTIVE',
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

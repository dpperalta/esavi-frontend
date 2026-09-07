import { z } from 'zod';
import { ANSWER_OPTIONS, TERM_SOURCES, type AnswerOption } from '@/contracts/common';
import type { CreateNonSevereNotificationInput } from '@/contracts/nonSevereNotification';
import type { CreateNotificationEventInput } from '@/contracts/notificationEvent';
import type { CreateNotificationInput, NotificationType } from '@/contracts/notification';
import type { CreateNotificationMedicationInput } from '@/contracts/notificationMedication';
import type { CreateSevereNotificationInput } from '@/contracts/severeNotification';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const answerOptionSchema = z.enum(ANSWER_OPTIONS);

// One `useForm` for the three tables (SPEC FE12a §3.5) — the header's own `notes` and the two
// branches' each need their own free-text field, so the branch ones carry a prefix instead of
// colliding on the same RHF path. `caseId`, `notificationType` and `isActive` are derived and
// never editable (§3.5): they are not fields of this type at all, same reasoning as `caseId` in
// `ClassificationFormValues`.
export type NotificationFormValues = Omit<
  CreateNotificationInput,
  'caseId' | 'notificationType' | 'isActive'
> &
  Omit<CreateSevereNotificationInput, 'notificationId' | 'notes'> & {
    severeNotes?: CreateSevereNotificationInput['notes'];
  } & Omit<CreateNonSevereNotificationInput, 'notificationId' | 'notes'> & {
    nonSevereNotes?: CreateNonSevereNotificationInput['notes'];
  };

// Every field optional/nullable except `esaviDescription` — "sin él no hay fila que crear"
// (§3.5). This is also the shape `notificationCompleteSchema` extends: the base never rejects a
// value legitimately typed for a field the save button doesn't require yet.
const notificationBaseSchema = z.object({
  esaviDescription: z.string().trim().min(1),
  hasRelevantMedicalHistory: answerOptionSchema.nullable().optional(),
  takesMedication: answerOptionSchema.nullable().optional(),
  outcomeItemId: z.string().uuid().nullable().optional(),
  // Never `null` (§3.3: "el único booleano opcional sin `| null`") — while unanswered it simply
  // does not travel in the body (§3.5), which `undefined` already models without extra handling.
  requestInvestigation: z.boolean().optional(),
  deathDate: z.string().regex(isoDateRegex).nullable().optional(),
  autopsyRequested: z.boolean().nullable().optional(),
  verbalAutopsyPerformed: z.boolean().nullable().optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  hasPreviousEventHistory: answerOptionSchema.nullable().optional(),
  hasAllergyToOtherVaccines: answerOptionSchema.nullable().optional(),
  hasAllergyToMedications: answerOptionSchema.nullable().optional(),
  hasAllergyToPreviousSameVaccine: answerOptionSchema.nullable().optional(),
  hasPregnancyComplications: answerOptionSchema.nullable().optional(),
  pregnancyComplicationsDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  severeNotes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  vaccinationHealthFacilityId: z.string().uuid().nullable().optional(),
  vaccinationSiteItemId: z.string().uuid().nullable().optional(),
  // The only field of the repository with a declared length (§3.5, mirroring the DDL).
  vaccinationCenterAddress: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(250).nullable().optional(),
  ),
  vaccinationGeoLocationId: z.string().uuid().nullable().optional(),
  verifiedPhysicalDocument: z.boolean().nullable().optional(),
  verifiedElectronicRecord: z.boolean().nullable().optional(),
  verifiedVerbalReport: z.boolean().nullable().optional(),
  verifiedClinicalRecord: z.boolean().nullable().optional(),
  verifiedUnknown: z.boolean().nullable().optional(),
  verifiedOtherSource: z.boolean().nullable().optional(),
  otherSourceDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  nonSevereNotes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

// "Guardar" (§3.5): the only requirement is `esaviDescription`. Attached as the form's resolver —
// everything else is free to travel or not, `CaseWizardActionBar`'s pending-fields list is what
// tells the user what is still missing for "Completar etapa", not a blocked save button.
export const notificationSaveSchema = notificationBaseSchema;

// Never called, only type-checked — same technique as `_assertSchemaMatchesContract` in
// `features/classification/schemas.ts`.
function _assertSchemaMatchesContract(value: z.infer<typeof notificationSaveSchema>): NotificationFormValues {
  return value;
}
void _assertSchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// The three conditional rules of §3.5 ("qué significa «limpiar» en cada una"), as pure
// predicates: each one is true exactly when the block's visibility and its value(s) agree — the
// block is shown and answered, or hidden and cleared to `null`. Any other combination is what a
// `PUT` would reject with the codes named next to each rule in §3.5, and it is also what
// `createNotificationCompleteSchema` below turns into a pending-fields issue.
// ---------------------------------------------------------------------------------------------

// Fallecimiento (3 campos): visible sólo con `outcome.value === 'DEATH'`. `verbalAutopsyPerformed`
// nunca es obligatorio, ni siquiera bajo muerte (§3.5) — pero sigue siendo uno de los tres que el
// backend rechaza fuera de `DEATH`: `notification.service.ts`'s `DEATH_FIELDS` los lista los
// tres, y `NOTIFCN_00X_DEATH_FIELDS_NOT_ALLOWED` no distingue cuál de los tres sobra.
export function isDeathFieldsRequirementMet(
  isDeathOutcome: boolean,
  deathDate: string | null | undefined,
  autopsyRequested: boolean | null | undefined,
  verbalAutopsyPerformed: boolean | null | undefined,
): boolean {
  if (isDeathOutcome) {
    return deathDate != null && autopsyRequested != null;
  }
  return deathDate == null && autopsyRequested == null && verbalAutopsyPerformed == null;
}

// «No anterior a `case.eventDate`» (§3.5, decisión §6): regla del cliente — el servicio incluye
// `eventDate` en la respuesta precisamente para esta comparación
// (`notification.service.ts:30-32`), pero no la valida él mismo. Comparación lexicográfica sobre
// `YYYY-MM-DD`, igual que el resto del repositorio hace con fechas ISO. `null` en cualquiera de
// los dos lados no es un desacuerdo — nada que comparar todavía.
export function isDeathDateNotBeforeEventDate(
  deathDate: string | null | undefined,
  eventDate: string | null | undefined,
): boolean {
  if (!deathDate || !eventDate) return true;
  return deathDate >= eventDate;
}

const PREGNANCY_MIN_AGE = 15;
const PREGNANCY_MAX_AGE = 49;

export type PregnancyGateState = 'hidden' | 'visible' | 'visibleIfApplicable';

// La compuerta de embarazo (`CASE-PROCESS.md` §7.4, citada por SPEC FE12a §3.5, §6 "Los
// catálogos y la edad"). Comparar siempre por `sex.value`, nunca por `code`/`name` (SPEC F46) —
// se recodifican por país y `value` es lo único congelado. La edad viene ya calculada por
// `classification` (`resolveAgeAtEvent` en el backend): CASE-PROCESS.md §7.4 prohíbe
// expresamente reimplementar la aritmética de calendario aquí.
//
// «Se oculta cuando conste que no aplica, no se muestra sólo cuando conste que aplica» — dos
// exclusiones independientes (sexo `MALE`, o edad conocida y fuera de 15–49), y fuera de esos dos
// casos el bloque se muestra. Se marca «Si aplica» cuando se muestra sin poder confirmarlo: sexo
// desconocido/sin informar, o edad incalculable por falta de `birthDate`.
export function resolvePregnancyGate(
  sexValue: string | null | undefined,
  age: number | null | undefined,
): PregnancyGateState {
  const ageKnown = age !== null && age !== undefined;
  const ageInRange = ageKnown && age >= PREGNANCY_MIN_AGE && age <= PREGNANCY_MAX_AGE;
  const ageOutOfRange = ageKnown && !ageInRange;

  if (sexValue === 'MALE' || ageOutOfRange) {
    return 'hidden';
  }
  if (sexValue === 'FEMALE' && ageInRange) {
    return 'visible';
  }
  return 'visibleIfApplicable';
}

// `pregnancyComplicationsDescription`: visible sólo con `hasPregnancyComplications === 'YES'`.
export function isPregnancyDescriptionRequirementMet(
  hasPregnancyComplications: AnswerOption | null | undefined,
  pregnancyComplicationsDescription: string | null | undefined,
): boolean {
  const trimmed = (pregnancyComplicationsDescription ?? '').trim();
  return hasPregnancyComplications === 'YES' ? trimmed.length > 0 : trimmed.length === 0;
}

// `otherSourceDescription`: visible sólo con `verifiedOtherSource === true`.
export function isOtherSourceDescriptionRequirementMet(
  verifiedOtherSource: boolean | null | undefined,
  otherSourceDescription: string | null | undefined,
): boolean {
  const trimmed = (otherSourceDescription ?? '').trim();
  return verifiedOtherSource === true ? trimmed.length > 0 : trimmed.length === 0;
}

// "Al menos una fuente de verificación" (§3.5, §6 "Los controles"): not one of the three
// conditional-visibility rules above — the six switches are always visible — but still a group
// requirement `notificationCompleteSchema` needs, so it lives here as the same kind of pure
// predicate.
export function hasAnyVerificationSource(values: {
  verifiedPhysicalDocument?: boolean | null;
  verifiedElectronicRecord?: boolean | null;
  verifiedVerbalReport?: boolean | null;
  verifiedClinicalRecord?: boolean | null;
  verifiedUnknown?: boolean | null;
  verifiedOtherSource?: boolean | null;
}): boolean {
  return [
    values.verifiedPhysicalDocument,
    values.verifiedElectronicRecord,
    values.verifiedVerbalReport,
    values.verifiedClinicalRecord,
    values.verifiedUnknown,
    values.verifiedOtherSource,
  ].some((value) => value === true);
}

export interface NotificationCompleteContext {
  notificationType: NotificationType;
  // Resolved from `outcomeItemId` against `catalogItem.value` (SPEC FE12a §6 "Los catálogos y la
  // edad") — never from `code`/`name`. Not a form field, so it travels as context, not a key of
  // `NotificationFormValues`.
  isDeathOutcome: boolean;
  // §7.4: only a woman of fertile age opens this gate. Also context, same reason.
  pregnancyGateOpen: boolean;
  // SPEC FE12b §2, §4 paso 12: el primer obligatorio de proceso del paso 4. Vive en otra tabla
  // (`notificationEvent`), así que no hay campo del formulario que comprobar — llega como
  // contexto, igual que los otros dos derivados de arriba.
  hasAtLeastOneEvent: boolean;
}

// "Completar etapa" (§3.5): everything `notificationSaveSchema` already checks, plus the
// unconditional "sí" fields of the three tables and the three conditional rules above, gated to
// whichever branch `notificationType` says is active — the other branch's fields are never
// required, they don't exist for this notification. `notificationType`, `isDeathOutcome` and
// `pregnancyGateOpen` are derived elsewhere in the wizard and passed in as context instead of
// smuggled into the form's own field set (§3.5: none of the three is an editable field).
export function createNotificationCompleteSchema({
  notificationType,
  isDeathOutcome,
  pregnancyGateOpen,
  hasAtLeastOneEvent,
}: NotificationCompleteContext) {
  return notificationBaseSchema.superRefine((data, ctx) => {
    // El primer obligatorio de proceso del paso 4 (§2, §4 paso 12): un ESAVI sin ningún
    // diagnóstico registrado es un párrafo de texto que ningún análisis puede contar. No bloquea
    // «Guardar» — sólo aparece en la lista de «Completar etapa», como el resto de este schema.
    if (!hasAtLeastOneEvent) {
      ctx.addIssue({ code: 'custom', message: 'atLeastOneEvent', path: ['events'] });
    }
    if (!data.hasRelevantMedicalHistory) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['hasRelevantMedicalHistory'] });
    }
    if (!data.takesMedication) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['takesMedication'] });
    }
    if (!data.outcomeItemId) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['outcomeItemId'] });
    }
    if (data.requestInvestigation === undefined) {
      ctx.addIssue({ code: 'custom', message: 'required', path: ['requestInvestigation'] });
    }
    if (
      !isDeathFieldsRequirementMet(
        isDeathOutcome,
        data.deathDate,
        data.autopsyRequested,
        data.verbalAutopsyPerformed,
      )
    ) {
      ctx.addIssue({ code: 'custom', message: 'deathFieldsRequired', path: ['deathDate'] });
    }

    if (notificationType === 'SEVERE') {
      if (!data.hasPreviousEventHistory) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasPreviousEventHistory'] });
      }
      if (!data.hasAllergyToOtherVaccines) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasAllergyToOtherVaccines'] });
      }
      if (!data.hasAllergyToMedications) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasAllergyToMedications'] });
      }
      if (!data.hasAllergyToPreviousSameVaccine) {
        ctx.addIssue({
          code: 'custom',
          message: 'required',
          path: ['hasAllergyToPreviousSameVaccine'],
        });
      }
      if (pregnancyGateOpen && !data.hasPregnancyComplications) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['hasPregnancyComplications'] });
      }
      if (
        !isPregnancyDescriptionRequirementMet(
          data.hasPregnancyComplications,
          data.pregnancyComplicationsDescription,
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'pregnancyDescriptionRequired',
          path: ['pregnancyComplicationsDescription'],
        });
      }
    }

    if (notificationType === 'NON_SEVERE') {
      if (!data.vaccinationHealthFacilityId) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['vaccinationHealthFacilityId'] });
      }
      if (!data.vaccinationSiteItemId) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['vaccinationSiteItemId'] });
      }
      if (!data.vaccinationGeoLocationId) {
        ctx.addIssue({ code: 'custom', message: 'required', path: ['vaccinationGeoLocationId'] });
      }
      if (!hasAnyVerificationSource(data)) {
        // Group-level error, no single field owns it — same technique as `criteria` in
        // `features/classification/schemas.ts`.
        ctx.addIssue({ code: 'custom', message: 'atLeastOneVerificationSource', path: ['verifiedAny'] });
      }
      if (
        !isOtherSourceDescriptionRequirementMet(data.verifiedOtherSource, data.otherSourceDescription)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'otherSourceDescriptionRequired',
          path: ['otherSourceDescription'],
        });
      }
    }
  });
}

// SPEC FE12a §3.5 "Errores del backend mapeados" — al campo, por entidad. `SEVNOT_*`/`NSEVNOT_*`
// share the same field for their `_REQUIRED` and `_NOT_ALLOWED` variants: both are the same
// coherence rule seen from either direction, and the user needs to look at the same input either
// way (`CASE-PROCESS.md`, corrected in el paso 1 de este spec).
export const notificationErrorFieldMap: Partial<Record<string, keyof NotificationFormValues>> = {
  NOTIFCN_001_OUTCOME_NOT_FOUND: 'outcomeItemId',
  NOTIFCN_004_OUTCOME_NOT_FOUND: 'outcomeItemId',
  NOTIFCN_001_DEATH_FIELDS_REQUIRED: 'deathDate',
  NOTIFCN_004_DEATH_FIELDS_REQUIRED: 'deathDate',
  // Not `deathDate`: what is wrong is the combination, and `outcomeItemId` is the field the user
  // just touched (§6 "Las decisiones tomadas y descartadas").
  NOTIFCN_004_DEATH_FIELDS_NOT_ALLOWED: 'outcomeItemId',
};

export const severeNotificationErrorFieldMap: Partial<Record<string, keyof NotificationFormValues>> = {
  SEVNOT_001_PREGNANCY_DESCRIPTION_REQUIRED: 'pregnancyComplicationsDescription',
  SEVNOT_004_PREGNANCY_DESCRIPTION_REQUIRED: 'pregnancyComplicationsDescription',
  SEVNOT_001_PREGNANCY_DESCRIPTION_NOT_ALLOWED: 'pregnancyComplicationsDescription',
  SEVNOT_004_PREGNANCY_DESCRIPTION_NOT_ALLOWED: 'pregnancyComplicationsDescription',
};

export const nonSevereNotificationErrorFieldMap: Partial<Record<string, keyof NotificationFormValues>> = {
  NSEVNOT_001_OTHER_SOURCE_DESCRIPTION_REQUIRED: 'otherSourceDescription',
  NSEVNOT_004_OTHER_SOURCE_DESCRIPTION_REQUIRED: 'otherSourceDescription',
  NSEVNOT_001_OTHER_SOURCE_DESCRIPTION_NOT_ALLOWED: 'otherSourceDescription',
  NSEVNOT_004_OTHER_SOURCE_DESCRIPTION_NOT_ALLOWED: 'otherSourceDescription',
  NSEVNOT_001_HEALTH_FACILITY_NOT_FOUND: 'vaccinationHealthFacilityId',
  NSEVNOT_004_HEALTH_FACILITY_NOT_FOUND: 'vaccinationHealthFacilityId',
  NSEVNOT_001_VACCINATION_SITE_NOT_FOUND: 'vaccinationSiteItemId',
  NSEVNOT_004_VACCINATION_SITE_NOT_FOUND: 'vaccinationSiteItemId',
  NSEVNOT_001_GEOLOCATION_NOT_FOUND: 'vaccinationGeoLocationId',
  NSEVNOT_004_GEOLOCATION_NOT_FOUND: 'vaccinationGeoLocationId',
};

// ---------------------------------------------------------------------------------------------
// SPEC FE12b §3.5 — el evento y la medicación concomitante. Dos modales, dos `useForm` propios,
// ninguno comparte estado con el de la cabecera: una fila de satélite se guarda al aceptar el
// modal (§3.4).
// ---------------------------------------------------------------------------------------------

// `source` viaja al crear/actualizar y nunca vuelve en la respuesta (§3.3): es el único campo del
// tipo que no es columna. `diagnosticTermId` y `esaviRawName` son derivados — la resolución los
// escribe — y por eso no están aquí, igual que en `CreateNotificationEventInput`.
export type NotificationEventFormValues = Omit<CreateNotificationEventInput, 'notificationId' | 'isActive'>;

const timeRegex = /^\d{2}:\d{2}$/;

// La regla de «otro evento», bidireccional: con `isOtherEsavi === true` la descripción es
// obligatoria (`NOTIFEVT_00X_OTHER_DESCRIPTION_REQUIRED`); con `false`, una descripción presente
// se rechaza (`NOTIFEVT_00X_OTHER_DESCRIPTION_NOT_ALLOWED`). Espejo de
// `isPregnancyDescriptionRequirementMet` de arriba.
export function isOtherEsaviDescriptionCoherent(
  isOtherEsavi: boolean | null | undefined,
  otherDescription: string | null | undefined,
): boolean {
  const trimmed = (otherDescription ?? '').trim();
  return isOtherEsavi === true ? trimmed.length > 0 : trimmed.length === 0;
}

// La segunda mitad de la regla de «otro evento», unidireccional: declarar «otro» y conservar un
// código o un término resuelto es una contradicción (`NOTIFEVT_00X_OTHER_ESAVI_CONFLICT`); lo
// contrario — `isOtherEsavi === false` con código — no es un conflicto, es el caso normal.
export function isOtherEsaviCodeConflictAbsent(
  isOtherEsavi: boolean | null | undefined,
  esaviCode: string | null | undefined,
): boolean {
  if (isOtherEsavi !== true) return true;
  return (esaviCode ?? '').trim().length === 0;
}

// `esaviName` — lo que escribió el notificador — nunca se limpia al marcar «otro»; sólo el
// buscador y `esaviCode` lo hacen (§3.5, "qué limpia cada una").
export const notificationEventSchema = z
  .object({
    esaviName: z.string().trim().min(1).max(250),
    esaviCode: z.preprocess(emptyToUndefined, z.string().trim().max(250).nullable().optional()),
    source: z.enum(TERM_SOURCES).optional(),
    isMainEsavi: z.boolean().optional(),
    startDate: z.string().regex(isoDateRegex).nullable().optional(),
    startTime: z.preprocess(emptyToUndefined, z.string().regex(timeRegex).nullable().optional()),
    isOtherEsavi: z.boolean().optional(),
    otherDescription: z.preprocess(emptyToUndefined, z.string().trim().max(500).nullable().optional()),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!isOtherEsaviDescriptionCoherent(data.isOtherEsavi, data.otherDescription)) {
      if (data.isOtherEsavi === true) {
        ctx.addIssue({ code: 'custom', message: 'otherDescriptionRequired', path: ['otherDescription'] });
      } else {
        ctx.addIssue({ code: 'custom', message: 'otherDescriptionNotAllowed', path: ['isOtherEsavi'] });
      }
    }
    if (!isOtherEsaviCodeConflictAbsent(data.isOtherEsavi, data.esaviCode)) {
      ctx.addIssue({ code: 'custom', message: 'otherEsaviConflict', path: ['isOtherEsavi'] });
    }
  });

// SPEC FE12b §3.5 "Errores del backend mapeados" — al campo. Los tres `NOT_ALLOWED`/`CONFLICT` van
// a la bandera y no al campo que sobra: lo que sobra es la combinación, y el campo culpable está
// oculto en ese momento (mismo criterio que `NOTIFCN_004_DEATH_FIELDS_NOT_ALLOWED` en FE12a). Los
// dos `404` de `DIAGTERM_NOT_FOUND` no están aquí — tienen comportamiento propio, no un campo que
// señalar (§3.5, cablea en el paso 9).
export const notificationEventErrorFieldMap: Partial<Record<string, keyof NotificationEventFormValues>> = {
  NOTIFEVT_001_OTHER_DESCRIPTION_REQUIRED: 'otherDescription',
  NOTIFEVT_004_OTHER_DESCRIPTION_REQUIRED: 'otherDescription',
  NOTIFEVT_001_OTHER_DESCRIPTION_NOT_ALLOWED: 'isOtherEsavi',
  NOTIFEVT_004_OTHER_DESCRIPTION_NOT_ALLOWED: 'isOtherEsavi',
  NOTIFEVT_001_OTHER_ESAVI_CONFLICT: 'isOtherEsavi',
  NOTIFEVT_004_OTHER_ESAVI_CONFLICT: 'isOtherEsavi',
};

// `medicationCode` nunca es columna con control propio (§3.5): el buscador la rellena, o queda
// vacía. `dose`, `startDate` y los dos catálogos son el resto de las once columnas de §5.4b.
export type NotificationMedicationFormValues = Omit<
  CreateNotificationMedicationInput,
  'notificationId' | 'isActive'
>;

// La regla de «otra medicación», bidireccional — espejo exacto de la de eventos, pero sin la
// segunda mitad: `medicationCode` no tiene maestro clínico que pueda entrar en conflicto con la
// bandera (`CASE-PROCESS.md` §5.4b: "aquí `medicationCode` no entra en la regla").
export function isOtherMedicationTextCoherent(
  isOtherMedication: boolean | null | undefined,
  otherMedicationText: string | null | undefined,
): boolean {
  const trimmed = (otherMedicationText ?? '').trim();
  return isOtherMedication === true ? trimmed.length > 0 : trimmed.length === 0;
}

// La cuarta regla condicional, y la única que el backend no impone (§3.5): declarar «otra
// medicación» significa que no está en el catálogo, así que un `medicationCode` del maestro
// debajo sería una contradicción que el servidor aceptaría sin protestar. Se limpia en el
// cliente, nunca en el servicio.
export function isMedicationCodeClearedWhenOther(
  isOtherMedication: boolean | null | undefined,
  medicationCode: string | null | undefined,
): boolean {
  if (isOtherMedication !== true) return true;
  return (medicationCode ?? '').trim().length === 0;
}

export const notificationMedicationSchema = z
  .object({
    medicationName: z.string().trim().min(1).max(250),
    medicationCode: z.preprocess(emptyToUndefined, z.string().trim().max(250).nullable().optional()),
    dose: z.preprocess(emptyToUndefined, z.string().trim().max(100).nullable().optional()),
    pharmaceuticalFormItemId: z.string().uuid().nullable().optional(),
    administrationRouteItemId: z.string().uuid().nullable().optional(),
    startDate: z.string().regex(isoDateRegex).nullable().optional(),
    isOtherMedication: z.boolean().optional(),
    // Sin longitud declarada en el servicio (§3.5) — a diferencia de `otherDescription` del
    // evento, que sí lleva `max(500)`.
    otherMedicationText: z.preprocess(emptyToUndefined, z.string().trim().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!isOtherMedicationTextCoherent(data.isOtherMedication, data.otherMedicationText)) {
      if (data.isOtherMedication === true) {
        ctx.addIssue({ code: 'custom', message: 'otherTextRequired', path: ['otherMedicationText'] });
      } else {
        ctx.addIssue({ code: 'custom', message: 'otherTextNotAllowed', path: ['isOtherMedication'] });
      }
    }
    // La cuarta regla es del cliente, no del backend (§3.5): no hay código de error del servicio
    // que mapear aquí, sólo la coherencia local antes de enviar.
    if (!isMedicationCodeClearedWhenOther(data.isOtherMedication, data.medicationCode)) {
      ctx.addIssue({ code: 'custom', message: 'medicationCodeNotAllowed', path: ['isOtherMedication'] });
    }
  });

// Los dos `404` de catálogo (`PHARMACEUTICAL_FORM_NOT_FOUND`/`ADMINISTRATION_ROUTE_NOT_FOUND`) se
// añaden en el paso 13, con el sufijo exacto copiado del servicio (§3.5).
export const notificationMedicationErrorFieldMap: Partial<
  Record<string, keyof NotificationMedicationFormValues>
> = {
  NOTIFMED_001_OTHER_TEXT_REQUIRED: 'otherMedicationText',
  NOTIFMED_004_OTHER_TEXT_REQUIRED: 'otherMedicationText',
  NOTIFMED_001_OTHER_TEXT_NOT_ALLOWED: 'isOtherMedication',
  NOTIFMED_004_OTHER_TEXT_NOT_ALLOWED: 'isOtherMedication',
};

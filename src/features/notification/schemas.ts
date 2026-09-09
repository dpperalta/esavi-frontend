import { z } from 'zod';
import { ANSWER_OPTIONS, TERM_SOURCES, type AnswerOption } from '@/contracts/common';
import type { CreateNonSevereNotificationInput } from '@/contracts/nonSevereNotification';
import type { CreateNotificationEventInput } from '@/contracts/notificationEvent';
import type { CreateNotificationInput, NotificationType } from '@/contracts/notification';
import type { CreateNotificationMedicationInput } from '@/contracts/notificationMedication';
import type { CreateNotificationDiluentInput } from '@/contracts/notificationDiluent';
import type { CreateNotificationVaccineInput } from '@/contracts/notificationVaccine';
import type { CreateNotificationPregnancyInput } from '@/contracts/notificationPregnancy';
import type { CreateNotificationPregnancyComplicationInput } from '@/contracts/notificationPregnancyComplication';
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
  // SPEC FE12c §2, §4 paso 11: los dos obligatorios de proceso del paso 4 que salen de
  // `notificationVaccine` — ninguno bloquea «Guardar», los dos sí «Completar etapa». Viven en
  // otra tabla, igual que `hasAtLeastOneEvent`, así que llegan como contexto.
  hasAtLeastOneVaccine: boolean;
  hasAtLeastOneSuspectedVaccine: boolean;
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
  hasAtLeastOneVaccine,
  hasAtLeastOneSuspectedVaccine,
}: NotificationCompleteContext) {
  return notificationBaseSchema.superRefine((data, ctx) => {
    // El primer obligatorio de proceso del paso 4 (§2, §4 paso 12): un ESAVI sin ningún
    // diagnóstico registrado es un párrafo de texto que ningún análisis puede contar. No bloquea
    // «Guardar» — sólo aparece en la lista de «Completar etapa», como el resto de este schema.
    if (!hasAtLeastOneEvent) {
      ctx.addIssue({ code: 'custom', message: 'atLeastOneEvent', path: ['events'] });
    }
    // Los dos obligatorios de proceso de las vacunas (SPEC FE12c §2, §4 paso 11): dos `path`
    // independientes para que puedan listarse los dos a la vez — con cero vacunas, no hay ninguna
    // sospechosa tampoco, y el usuario necesita ver ambos pendientes, no sólo el primero.
    if (!hasAtLeastOneVaccine) {
      ctx.addIssue({ code: 'custom', message: 'missingVaccine', path: ['vaccines'] });
    }
    if (!hasAtLeastOneSuspectedVaccine) {
      ctx.addIssue({ code: 'custom', message: 'missingSuspected', path: ['suspectedVaccine'] });
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

// ---------------------------------------------------------------------------------------------
// SPEC FE12c §3.5 — la vacuna y su lista anidada de diluyentes. Las dos guardas de contenido
// mínimo se evalúan sobre el estado resultante (§3.5: "un `PUT` que borra el nombre de una fila
// sin código falla en el cliente antes de llegar al `400`"), y las dos coherencias temporales
// entran como contexto — `eventDate` y `vaccinationDate` — en vez de leerse de una caché dentro
// del schema, igual que `isDeathDateNotBeforeEventDate` recibe `eventDate` por parámetro arriba.
// ---------------------------------------------------------------------------------------------

// «Vacuna» — `vaccineWhodrugId` o `vaccineName`, nunca ninguno de los dos vacío a la vez
// (`NOTIFVAC_00X_VACCINE_REQUIRED`, esavi-backend/src/services/notificationVaccine.service.ts).
export function hasVaccineIdentity(
  vaccineWhodrugId: string | null | undefined,
  vaccineName: string | null | undefined,
): boolean {
  if (vaccineWhodrugId) return true;
  return (vaccineName ?? '').trim().length > 0;
}

// `vaccinationDate` no posterior a `eventDate` (`NOTIFVAC_00X_VACCINATION_AFTER_EVENT`). El mismo
// día es válido — una reacción inmediata se registra con la fecha de la vacunación — y ninguna de
// las dos partes bloquea si falta la otra, igual que `isDeathDateNotBeforeEventDate`. Comparación
// lexicográfica sobre `YYYY-MM-DD`, sin recortar a los primeros diez caracteres porque el campo ya
// llega en ese formato (`<DateField>`), a diferencia del backend que sí lo recorta por si acaso.
export function isVaccinationNotAfterEventDate(
  vaccinationDate: string | null | undefined,
  eventDate: string | null | undefined,
): boolean {
  if (!vaccinationDate || !eventDate) return true;
  return vaccinationDate <= eventDate;
}

export type NotificationVaccineFormValues = Omit<
  CreateNotificationVaccineInput,
  'notificationId' | 'isActive'
>;

export interface NotificationVaccineContext {
  // El `eventDate` del caso (`ESAVI-CASE-003`, FE09/FE10) — no un campo de este formulario, así
  // que llega como contexto y no como clave de `NotificationVaccineFormValues`.
  eventDate: string | null | undefined;
}

// `whoCode` viaja en el formulario pero nunca lo escribe el usuario (§3.5: "se muestra por
// análisis, no por captura") — sólo lo rellena la resolución del árbol.
export function createNotificationVaccineSchema({ eventDate }: NotificationVaccineContext) {
  return z
    .object({
      vaccineWhodrugId: z.string().uuid().nullable().optional(),
      isSuspected: z.boolean().optional(),
      whoCode: z.preprocess(emptyToUndefined, z.string().trim().max(250).nullable().optional()),
      vaccineCode: z.preprocess(emptyToUndefined, z.string().trim().max(250).nullable().optional()),
      vaccineName: z.preprocess(emptyToUndefined, z.string().trim().max(500).nullable().optional()),
      vaccinationDate: z.string().regex(isoDateRegex).nullable().optional(),
      vaccinationTime: z.preprocess(emptyToUndefined, z.string().regex(timeRegex).nullable().optional()),
      // Entero >= 0, sin techo (§3.5: a diferencia de los nueve contadores con techo de `smallint`
      // de `ARCHITECTURE.md` §4.3, esta columna no lo tiene).
      doseNumber: z.number().int().min(0).nullable().optional(),
      batchNumber: z.preprocess(emptyToUndefined, z.string().trim().max(100).nullable().optional()),
      expirationDate: z.string().regex(isoDateRegex).nullable().optional(),
      notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    })
    .superRefine((data, ctx) => {
      if (!hasVaccineIdentity(data.vaccineWhodrugId, data.vaccineName)) {
        ctx.addIssue({ code: 'custom', message: 'vaccineRequired', path: ['vaccineName'] });
      }
      if (!isVaccinationNotAfterEventDate(data.vaccinationDate, eventDate)) {
        ctx.addIssue({ code: 'custom', message: 'vaccinationAfterEvent', path: ['vaccinationDate'] });
      }
    });
}

// SPEC FE12c §3.5 "Códigos de error mapeados". `NOTIFVAC_00X_WHODRUG_NOT_FOUND` no está aquí: va
// al `<WhodrugTreePicker>`, no a un campo del formulario (cableado en el paso 9).
export const notificationVaccineErrorFieldMap: Partial<Record<string, keyof NotificationVaccineFormValues>> = {
  NOTIFVAC_001_VACCINE_REQUIRED: 'vaccineName',
  NOTIFVAC_004_VACCINE_REQUIRED: 'vaccineName',
  NOTIFVAC_001_VACCINATION_AFTER_EVENT: 'vaccinationDate',
  NOTIFVAC_004_VACCINATION_AFTER_EVENT: 'vaccinationDate',
};

// «Diluyente» — espejo exacto de `hasVaccineIdentity`, sobre `diluentCatalogId`/`diluentName`
// (`NOTIFDIL_00X_DILUENT_REQUIRED`).
export function hasDiluentIdentity(
  diluentCatalogId: string | null | undefined,
  diluentName: string | null | undefined,
): boolean {
  if (diluentCatalogId) return true;
  return (diluentName ?? '').trim().length > 0;
}

// `reconstitutionDate` no posterior a `vaccinationDate` de su vacuna
// (`NOTIFDIL_00X_RECONSTITUTION_AFTER_VACCINATION`). Sólo fechas, nunca horas — igual que el
// servicio, que compara sobre columnas `date` sin recortar ninguna hora que no existe.
export function isReconstitutionNotAfterVaccination(
  reconstitutionDate: string | null | undefined,
  vaccinationDate: string | null | undefined,
): boolean {
  if (!reconstitutionDate || !vaccinationDate) return true;
  return reconstitutionDate <= vaccinationDate;
}

export type NotificationDiluentFormValues = Omit<CreateNotificationDiluentInput, 'vaccineId' | 'isActive'>;

export interface NotificationDiluentContext {
  // `vaccinationDate` de la fila de `notificationVaccine` a la que cuelga este diluyente — no un
  // campo de este formulario.
  vaccinationDate: string | null | undefined;
}

// Sin `notes`: la única de las seis satélites sin ese campo (§3.3), y el formulario no lo inventa.
export function createNotificationDiluentSchema({ vaccinationDate }: NotificationDiluentContext) {
  return z
    .object({
      diluentCatalogId: z.string().uuid().nullable().optional(),
      // Más ancho que el `batchNumber` de la vacuna (250 contra 100, §3.5).
      batchNumber: z.preprocess(emptyToUndefined, z.string().trim().max(250).nullable().optional()),
      expirationDate: z.string().regex(isoDateRegex).nullable().optional(),
      reconstitutionDate: z.string().regex(isoDateRegex).nullable().optional(),
      // No entra en ninguna comparación (§3.5) — se declara igual que cualquier otra hora.
      reconstitutionTime: z.preprocess(emptyToUndefined, z.string().regex(timeRegex).nullable().optional()),
      diluentName: z.preprocess(emptyToUndefined, z.string().trim().max(250).nullable().optional()),
      diluentCode: z.preprocess(emptyToUndefined, z.string().trim().max(250).nullable().optional()),
    })
    .superRefine((data, ctx) => {
      if (!hasDiluentIdentity(data.diluentCatalogId, data.diluentName)) {
        ctx.addIssue({ code: 'custom', message: 'diluentRequired', path: ['diluentName'] });
      }
      if (!isReconstitutionNotAfterVaccination(data.reconstitutionDate, vaccinationDate)) {
        ctx.addIssue({ code: 'custom', message: 'reconstitutionAfterVaccination', path: ['reconstitutionDate'] });
      }
    });
}

// SPEC FE12c §3.5. El código real del backend es `CATALOG_NOT_FOUND`
// (esavi-backend/src/services/notificationDiluent.service.ts), no `DILUENT_NOT_FOUND` como cita
// la prosa del spec — se mapea el código estable, no la paráfrasis.
export const notificationDiluentErrorFieldMap: Partial<Record<string, keyof NotificationDiluentFormValues>> = {
  NOTIFDIL_001_DILUENT_REQUIRED: 'diluentName',
  NOTIFDIL_004_DILUENT_REQUIRED: 'diluentName',
  NOTIFDIL_001_RECONSTITUTION_AFTER_VACCINATION: 'reconstitutionDate',
  NOTIFDIL_004_RECONSTITUTION_AFTER_VACCINATION: 'reconstitutionDate',
  NOTIFDIL_001_CATALOG_NOT_FOUND: 'diluentCatalogId',
  NOTIFDIL_004_CATALOG_NOT_FOUND: 'diluentCatalogId',
};

// ---------------------------------------------------------------------------------------------
// SPEC FE12d §3.5 — el bloque de embarazo, encadenado al `useForm` de `NotificationStep` como la
// cabecera y las dos ramas (§3.4: "no tiene formulario propio"), y su lista anidada de
// complicaciones, con su propio modal — igual que eventos y medicación en FE12b.
// ---------------------------------------------------------------------------------------------

// Naegele's rule: 266 a 294 días inclusive entre `lastMenstruationDate` y `probableDeliveryDate`
// (`CASE-PROCESS.md` §7.4 cita `SPEC FE12d`). Misma aritmética que
// `assertGestationRangeIsCoherent` en esavi-backend/src/services/notificationPregnancy.service.ts
// — las dos fechas se leen como medianoche UTC para que la diferencia sea un número entero de
// días de calendario, inmune al DST. Los límites viven aquí, con nombre, por el mismo motivo que
// en el backend: son valores clínicos que alguien va a querer ajustar.
export const GESTATION_MIN_DAYS = 266;
export const GESTATION_MAX_DAYS = 294;

// `null` cuando falta una de las dos fechas — un embarazo con sólo una fecha conocida es un
// registro legítimo (§3.5) y no hay nada que comparar todavía.
export function computeGestationDays(
  lastMenstruationDate: string | null | undefined,
  probableDeliveryDate: string | null | undefined,
): number | null {
  if (!lastMenstruationDate || !probableDeliveryDate) return null;
  const start = Date.parse(`${lastMenstruationDate.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${probableDeliveryDate.slice(0, 10)}T00:00:00Z`);
  return (end - start) / 86400000;
}

// Un solo mensaje cubre también el parto anterior a la menstruación (días negativos caen fuera
// del rango igual que cualquier otro valor fuera de 266–294), igual que hace el backend.
export function isGestationRangeCoherent(
  lastMenstruationDate: string | null | undefined,
  probableDeliveryDate: string | null | undefined,
): boolean {
  const days = computeGestationDays(lastMenstruationDate, probableDeliveryDate);
  if (days === null) return true;
  return days >= GESTATION_MIN_DAYS && days <= GESTATION_MAX_DAYS;
}

// El campo del formulario nunca es `undefined` (§3.4: los `answerOption` sin responder se
// modelan con `null`, igual que el resto de `NotificationFormValues` — ver `defaultValues` de
// `NotificationStep`), así que la asimetría entre alta y edición no puede expresarse acortando
// `CreateNotificationPregnancyInput` con `Omit`: hay que redeclarar el campo.
export type NotificationPregnancyFormValues = Omit<
  CreateNotificationPregnancyInput,
  'notificationId' | 'isActive' | 'wasPregnantAtVaccination'
> & {
  wasPregnantAtVaccination: AnswerOption | null;
};

const notificationPregnancySharedFields = {
  wasPregnantAtEsavi: answerOptionSchema.nullable().optional(),
  lastMenstruationDate: z.string().regex(isoDateRegex).nullable().optional(),
  probableDeliveryDate: z.string().regex(isoDateRegex).nullable().optional(),
  // Derivado y bloqueado con ≥1 complicación activa (§6.5, cableado en el paso 11) — el schema no
  // lo trata distinto de una `answerOption` cualquiera: lo que lo bloquea es la UI, no una regla
  // de Zod, porque el valor que viaja en el `PUT` es exactamente el que el usuario ve en pantalla.
  hasComplications: answerOptionSchema.nullable().optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
};

// Alta (`ESAVI-NOTIFPRG-001`): `wasPregnantAtVaccination` es la única `answerOption` obligatoria
// de todo el proceso (§3.3, §3.5) — cualquiera de los cinco valores vale, no sólo `'YES'`: exigir
// `'YES'` convertiría la tabla en un registro de embarazos confirmados y perdería el caso que más
// importa, vacunar a alguien cuyo embarazo se ignoraba.
export const notificationPregnancyCreateSchema = z
  .object({
    wasPregnantAtVaccination: answerOptionSchema,
    ...notificationPregnancySharedFields,
  })
  .superRefine((data, ctx) => {
    if (!isGestationRangeCoherent(data.lastMenstruationDate, data.probableDeliveryDate)) {
      ctx.addIssue({ code: 'custom', message: 'deliveryDateOutOfRange', path: ['probableDeliveryDate'] });
    }
  });

// Edición (`ESAVI-NOTIFPRG-004`): la asimetría con el alta es deliberada (§3.3) — retirar una
// respuesta dada por error es legítimo sobre una fila que ya existe; crearla sin responder, no.
export const notificationPregnancyUpdateSchema = z
  .object({
    wasPregnantAtVaccination: answerOptionSchema.nullable().optional(),
    ...notificationPregnancySharedFields,
  })
  .superRefine((data, ctx) => {
    if (!isGestationRangeCoherent(data.lastMenstruationDate, data.probableDeliveryDate)) {
      ctx.addIssue({ code: 'custom', message: 'deliveryDateOutOfRange', path: ['probableDeliveryDate'] });
    }
  });

// `source` viaja al crear/actualizar y nunca vuelve en la respuesta (§3.3): el único campo del
// tipo que no es columna, igual que en `notificationEvent`. `diagnosticTermId` y
// `complicationRawName` son derivados — la resolución los escribe — y por eso no están aquí.
export type NotificationPregnancyComplicationFormValues = Omit<
  CreateNotificationPregnancyComplicationInput,
  'pregnancyId' | 'isActive'
>;

// Los dos obligatorios de §3.5: `complicationTypeItemId` (el DDL lo admite nulo, el validador lo
// exige) y `complicationName` (lo que escribió el notificador, nunca vacío). Sin variante de
// edición: a diferencia de `wasPregnantAtVaccination`, el `004` no admite un `null` explícito en
// ninguno de los dos — corregir es mandar el valor correcto, nunca borrarlo (§3.3) — y el
// formulario del modal siempre viaja con el objeto completo (§3.5: "se envía el objeto completo
// en el `PUT`"), así que un único schema basta para las dos operaciones.
export const notificationPregnancyComplicationSchema = z.object({
  complicationName: z.string().trim().min(1).max(500),
  complicationCode: z.preprocess(emptyToUndefined, z.string().trim().max(100).nullable().optional()),
  complicationTypeItemId: z.string().uuid(),
  source: z.enum(TERM_SOURCES).optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

import { z } from 'zod';
import type { CreateInvestigationInput } from '@/contracts/investigation';
import type { CreateInvestigationSourceInput } from '@/contracts/investigationSource';
import type { CreateInvestigationAutopsyInput } from '@/contracts/investigationAutopsy';
import type { CreateInvestigationTeamMemberInput } from '@/contracts/investigationTeamMember';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

// ---------------------------------------------------------------------------------------------
// A — Cabecera (SPEC FE13a §3.5 A). Ninguna columna de datos es obligatoria: la fila nace del
// `POST` vacío al entrar al paso (§2), y "Guardar y continuar" nunca tiene nada que bloquear.
// `hospitalizationDate`/`investigationStartDate` no llevan la regla "no futura" aquí — la aplica
// `<DateField allowFuture={false}>` en la pantalla, igual que en el resto del asistente.
// ---------------------------------------------------------------------------------------------

export type InvestigationFormValues = Omit<CreateInvestigationInput, 'caseId' | 'isActive'>;

export const investigationSaveSchema = z.object({
  statusItemId: z.string().uuid().nullable().optional(),
  vaccinationSiteItemId: z.string().uuid().nullable().optional(),
  vaccinationHealthFacilityId: z.string().uuid().nullable().optional(),
  vaccinationGeoLocationId: z.string().uuid().nullable().optional(),
  hospitalizationDate: z.string().regex(isoDateRegex).nullable().optional(),
  investigationStartDate: z.string().regex(isoDateRegex).nullable().optional(),
  // `numeric(10,7)` (§3.7): el rango es el de una coordenada real, el máximo de 7 decimales ya lo
  // impone `<MapPointPicker>` al emitir — el schema no lo repite.
  vaccinationLatitude: z.number().min(-90).max(90).nullable().optional(),
  vaccinationLongitude: z.number().min(-180).max(180).nullable().optional(),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

// Nunca invocada, sólo comprueba tipos — misma técnica que `_assertSchemaMatchesContract` de
// `features/notification/schemas.ts`.
function _assertInvestigationSchemaMatchesContract(
  value: z.infer<typeof investigationSaveSchema>,
): InvestigationFormValues {
  return value;
}
void _assertInvestigationSchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// B — Fuentes de información (SPEC FE13a §3.5 B). Ocho banderas tri-estado (`null` = "no se
// recogió", `false` = un "no" deliberado) más el texto detrás de `other`.
// ---------------------------------------------------------------------------------------------

export type InvestigationSourceFormValues = Omit<CreateInvestigationSourceInput, 'investigationId'>;

// `otherDescription`: visible sólo con `other === true` — misma firma que
// `isOtherSourceDescriptionRequirementMet` de `features/notification/schemas.ts`, entidad distinta.
export function isOtherSourceDescriptionRequirementMet(
  other: boolean | null | undefined,
  otherDescription: string | null | undefined,
): boolean {
  const trimmed = (otherDescription ?? '').trim();
  return other === true ? trimmed.length > 0 : trimmed.length === 0;
}

export const investigationSourceSaveSchema = z
  .object({
    history: z.boolean().nullable().optional(),
    interviewVaccinatedPerson: z.boolean().nullable().optional(),
    interviewHealthWorker: z.boolean().nullable().optional(),
    vaccinationRecord: z.boolean().nullable().optional(),
    autopsyRecord: z.boolean().nullable().optional(),
    verbalAutopsyRecord: z.boolean().nullable().optional(),
    investigationReport: z.boolean().nullable().optional(),
    other: z.boolean().nullable().optional(),
    otherDescription: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!isOtherSourceDescriptionRequirementMet(data.other, data.otherDescription)) {
      if (data.other === true) {
        ctx.addIssue({
          code: 'custom',
          message: 'otherDescriptionRequired',
          path: ['otherDescription'],
        });
      } else {
        ctx.addIssue({
          code: 'custom',
          message: 'otherDescriptionNotAllowed',
          path: ['otherDescription'],
        });
      }
    }
  });

function _assertInvestigationSourceSchemaMatchesContract(
  value: z.infer<typeof investigationSourceSaveSchema>,
): InvestigationSourceFormValues {
  return value;
}
void _assertInvestigationSourceSchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// C — Autopsia (SPEC FE13a §3.5 C). Bloque 6.1–6.7, visible con `status.value === 'DEATH'`.
// `isDeath` viaja siempre `true` y nunca se ofrece como control; `deathDate` es obligatoria y
// **no anulable** — un solo schema para alta y edición, como el resto de los satélites del paso 5.
// ---------------------------------------------------------------------------------------------

export type InvestigationAutopsyFormValues = Omit<CreateInvestigationAutopsyInput, 'investigationId'>;

// Regla 1 — `INVAUT_00X_AUTOPSY_FLAGS_EXCLUSIVE`: los dos no pueden ser `true` a la vez.
export function areAutopsyFlagsMutuallyExclusive(
  isAutopsyPerformed: boolean | null | undefined,
  isAutopsyScheduled: boolean | null | undefined,
): boolean {
  return !(isAutopsyPerformed === true && isAutopsyScheduled === true);
}

// Regla 2 — `INVAUT_00X_AUTOPSY_DATE_NOT_ALLOWED`: sin `isAutopsyPerformed === true`, prohibida.
// Con la bandera en `true` la fecha sigue siendo opcional — no hay obligación en sentido inverso.
export function isAutopsyDateRequirementMet(
  isAutopsyPerformed: boolean | null | undefined,
  autopsyDate: string | null | undefined,
): boolean {
  if (isAutopsyPerformed === true) return true;
  return !autopsyDate;
}

// Regla 3 — `INVAUT_00X_SCHEDULED_AUTOPSY_DATE_NOT_ALLOWED`: espejo exacto de la regla 2, sobre
// `isAutopsyScheduled`/`scheduledAutopsyDate`.
export function isScheduledAutopsyDateRequirementMet(
  isAutopsyScheduled: boolean | null | undefined,
  scheduledAutopsyDate: string | null | undefined,
): boolean {
  if (isAutopsyScheduled === true) return true;
  return !scheduledAutopsyDate;
}

// Regla 4 — `INVAUT_00X_AUTOPSY_DATE_BEFORE_DEATH`: la única de las cuatro que sí puede dispararse
// desde un campo que no es el suyo (§3.5 C) — corregir sólo `deathDate` puede dejar detrás una
// `autopsyDate` ya guardada. Comparación lexicográfica sobre `YYYY-MM-DD`, igual que el resto del
// repositorio. `null` en cualquiera de las dos partes no es un desacuerdo — nada que comparar.
export function isAutopsyDateNotBeforeDeath(
  autopsyDate: string | null | undefined,
  deathDate: string | null | undefined,
): boolean {
  if (!autopsyDate || !deathDate) return true;
  return autopsyDate >= deathDate;
}

export const investigationAutopsySaveSchema = z
  .object({
    isDeath: z.literal(true),
    deathDate: z.string().regex(isoDateRegex),
    deathTime: z.preprocess(emptyToUndefined, z.string().regex(timeRegex).nullable().optional()),
    isAutopsyPerformed: z.boolean().nullable().optional(),
    autopsyDate: z.string().regex(isoDateRegex).nullable().optional(),
    // Sin la regla "no futura" (§3.5 C): a diferencia de `autopsyDate`, una autopsia programada
    // dentro de unos días es el caso normal.
    isAutopsyScheduled: z.boolean().nullable().optional(),
    scheduledAutopsyDate: z.string().regex(isoDateRegex).nullable().optional(),
    autopsyComments: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
    notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!areAutopsyFlagsMutuallyExclusive(data.isAutopsyPerformed, data.isAutopsyScheduled)) {
      ctx.addIssue({
        code: 'custom',
        message: 'autopsyFlagsExclusive',
        path: ['isAutopsyScheduled'],
      });
    }
    if (!isAutopsyDateRequirementMet(data.isAutopsyPerformed, data.autopsyDate)) {
      ctx.addIssue({ code: 'custom', message: 'autopsyDateNotAllowed', path: ['autopsyDate'] });
    }
    if (!isScheduledAutopsyDateRequirementMet(data.isAutopsyScheduled, data.scheduledAutopsyDate)) {
      ctx.addIssue({
        code: 'custom',
        message: 'scheduledAutopsyDateNotAllowed',
        path: ['scheduledAutopsyDate'],
      });
    }
    if (!isAutopsyDateNotBeforeDeath(data.autopsyDate, data.deathDate)) {
      // Se ancla en las dos fechas a la vez (§3.5 C): quien mire sólo `deathDate` o sólo
      // `autopsyDate` tiene que ver el error igual.
      ctx.addIssue({ code: 'custom', message: 'autopsyDateBeforeDeath', path: ['deathDate'] });
      ctx.addIssue({ code: 'custom', message: 'autopsyDateBeforeDeath', path: ['autopsyDate'] });
    }
  });

function _assertInvestigationAutopsySchemaMatchesContract(
  value: z.infer<typeof investigationAutopsySaveSchema>,
): InvestigationAutopsyFormValues {
  return value;
}
void _assertInvestigationAutopsySchemaMatchesContract;

// ---------------------------------------------------------------------------------------------
// D — Miembro del equipo (SPEC FE13a §3.5 D). Diálogo de alta y edición, un solo schema para
// las dos operaciones — el `004` consume el mismo `Partial<CreateInvestigationTeamMemberInput>`.
// ---------------------------------------------------------------------------------------------

export type TeamMemberFormValues = Omit<CreateInvestigationTeamMemberInput, 'investigationId'>;

export const teamMemberSaveSchema = z.object({
  fullName: z.string().trim().min(1).max(250),
  // No se normaliza en el cliente (§3.5 D): `MINSAL` no debe volver `Minsal`, y el backend es
  // quien decide si `fullName` sí se pasa a Title Case.
  institutionName: z.preprocess(emptyToUndefined, z.string().trim().max(500).nullable().optional()),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().nullable().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(50).nullable().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().nullable().optional()),
});

function _assertTeamMemberSchemaMatchesContract(
  value: z.infer<typeof teamMemberSaveSchema>,
): TeamMemberFormValues {
  return value;
}
void _assertTeamMemberSchemaMatchesContract;

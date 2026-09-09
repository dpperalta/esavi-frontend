import { describe, expect, it } from 'vitest';
import {
  computeGestationDays,
  createNotificationCompleteSchema,
  createNotificationDiluentSchema,
  createNotificationVaccineSchema,
  hasAnyVerificationSource,
  hasDiluentIdentity,
  hasVaccineIdentity,
  isDeathDateNotBeforeEventDate,
  isDeathFieldsRequirementMet,
  isGestationRangeCoherent,
  isMedicationCodeClearedWhenOther,
  isOtherEsaviCodeConflictAbsent,
  isOtherEsaviDescriptionCoherent,
  isOtherMedicationTextCoherent,
  isOtherSourceDescriptionRequirementMet,
  isPregnancyDescriptionRequirementMet,
  isReconstitutionNotAfterVaccination,
  isVaccinationNotAfterEventDate,
  notificationEventSchema,
  notificationMedicationSchema,
  notificationPregnancyComplicationSchema,
  notificationMedicalHistorySchema,
  notificationMedicalHistoryUpdateSchema,
  notificationPregnancyCreateSchema,
  notificationPregnancyUpdateSchema,
  notificationSaveSchema,
  resolvePregnancyGate,
} from './schemas';

describe('resolvePregnancyGate — CASE-PROCESS.md §7.4 (SPEC FE12d §3.5, §4 paso 6)', () => {
  it('isMale, cualquier edad: oculto', () => {
    expect(resolvePregnancyGate(true, false, 25)).toBe('hidden');
    expect(resolvePregnancyGate(true, false, null)).toBe('hidden');
  });

  it('cualquier sexo, edad conocida fuera de 15-49: oculto', () => {
    expect(resolvePregnancyGate(false, true, 14)).toBe('hidden');
    expect(resolvePregnancyGate(false, true, 50)).toBe('hidden');
    expect(resolvePregnancyGate(false, false, 10)).toBe('hidden');
  });

  it('isFemaleConfirmed, edad 15-49: visible, normal', () => {
    expect(resolvePregnancyGate(false, true, 15)).toBe('visible');
    expect(resolvePregnancyGate(false, true, 49)).toBe('visible');
    expect(resolvePregnancyGate(false, true, 30)).toBe('visible');
  });

  it('isFemaleConfirmed, edad desconocida: visible, «Si aplica»', () => {
    expect(resolvePregnancyGate(false, true, null)).toBe('visibleIfApplicable');
    expect(resolvePregnancyGate(false, true, undefined)).toBe('visibleIfApplicable');
  });

  it('ni isMale ni isFemaleConfirmed (desconocido o sin informar), 15-49 o desconocida: visible, «Si aplica»', () => {
    expect(resolvePregnancyGate(false, false, 30)).toBe('visibleIfApplicable');
    expect(resolvePregnancyGate(false, false, null)).toBe('visibleIfApplicable');
  });
});

describe('isDeathFieldsRequirementMet — fallecimiento (SPEC FE12a §3.5, §7)', () => {
  it('muerte sin autopsyRequested: inválido', () => {
    expect(isDeathFieldsRequirementMet(true, '2026-01-01', undefined, null)).toBe(false);
  });

  it('muerte con deathDate y autopsyRequested:false: válido — false cuenta como informado', () => {
    expect(isDeathFieldsRequirementMet(true, '2026-01-01', false, null)).toBe(true);
  });

  it('muerte sin deathDate: inválido', () => {
    expect(isDeathFieldsRequirementMet(true, null, false, null)).toBe(false);
  });

  it('autopsyRequested:false bajo recuperación (no muerte): inválido, debe ser null', () => {
    expect(isDeathFieldsRequirementMet(false, null, false, null)).toBe(false);
  });

  it('verbalAutopsyPerformed colgado bajo recuperación (no muerte): inválido', () => {
    expect(isDeathFieldsRequirementMet(false, null, null, true)).toBe(false);
  });

  it('sin muerte y los tres campos en null: válido', () => {
    expect(isDeathFieldsRequirementMet(false, null, null, null)).toBe(true);
  });

  it('muerte con verbalAutopsyPerformed sin responder: válido — nunca es obligatorio', () => {
    expect(isDeathFieldsRequirementMet(true, '2026-01-01', true, undefined)).toBe(true);
  });
});

describe('isDeathDateNotBeforeEventDate (SPEC FE12a §3.5)', () => {
  it('deathDate anterior a eventDate: inválido', () => {
    expect(isDeathDateNotBeforeEventDate('2026-01-01', '2026-01-15')).toBe(false);
  });

  it('deathDate igual a eventDate: válido', () => {
    expect(isDeathDateNotBeforeEventDate('2026-01-15', '2026-01-15')).toBe(true);
  });

  it('deathDate posterior a eventDate: válido', () => {
    expect(isDeathDateNotBeforeEventDate('2026-02-01', '2026-01-15')).toBe(true);
  });

  it('sin deathDate o sin eventDate: nada que comparar, válido', () => {
    expect(isDeathDateNotBeforeEventDate(null, '2026-01-15')).toBe(true);
    expect(isDeathDateNotBeforeEventDate('2026-01-01', null)).toBe(true);
  });
});

describe('isPregnancyDescriptionRequirementMet (SPEC FE12a §3.5, §7)', () => {
  it("descripción de embarazo bajo 'NO': inválido", () => {
    expect(isPregnancyDescriptionRequirementMet('NO', 'preeclampsia')).toBe(false);
  });

  it("'YES' sin descripción: inválido", () => {
    expect(isPregnancyDescriptionRequirementMet('YES', '')).toBe(false);
    expect(isPregnancyDescriptionRequirementMet('YES', '   ')).toBe(false);
  });

  it("'YES' con descripción: válido", () => {
    expect(isPregnancyDescriptionRequirementMet('YES', 'preeclampsia')).toBe(true);
  });

  it('sin respuesta (null) y sin descripción: válido', () => {
    expect(isPregnancyDescriptionRequirementMet(null, null)).toBe(true);
  });
});

describe('isOtherSourceDescriptionRequirementMet (SPEC FE12a §3.5)', () => {
  it('verifiedOtherSource:true sin descripción: inválido', () => {
    expect(isOtherSourceDescriptionRequirementMet(true, '')).toBe(false);
  });

  it('verifiedOtherSource:true con descripción: válido', () => {
    expect(isOtherSourceDescriptionRequirementMet(true, 'referido por otro centro')).toBe(true);
  });

  it('verifiedOtherSource:false con una descripción colgada: inválido', () => {
    expect(isOtherSourceDescriptionRequirementMet(false, 'texto viejo')).toBe(false);
  });

  it('verifiedOtherSource:null y sin descripción: válido', () => {
    expect(isOtherSourceDescriptionRequirementMet(null, null)).toBe(true);
  });
});

describe('hasAnyVerificationSource (SPEC FE12a §3.5)', () => {
  it('las seis en null/false: false', () => {
    expect(
      hasAnyVerificationSource({
        verifiedPhysicalDocument: null,
        verifiedElectronicRecord: false,
        verifiedVerbalReport: null,
        verifiedClinicalRecord: null,
        verifiedUnknown: null,
        verifiedOtherSource: null,
      }),
    ).toBe(false);
  });

  it('con una sola en true: true', () => {
    expect(hasAnyVerificationSource({ verifiedUnknown: true })).toBe(true);
  });
});

describe('notificationSaveSchema — "Guardar" (SPEC FE12a §3.5)', () => {
  it('sólo esaviDescription es obligatorio', () => {
    const result = notificationSaveSchema.safeParse({ esaviDescription: 'Reacción local' });
    expect(result.success).toBe(true);
  });

  it('esaviDescription vacío o sólo espacios falla', () => {
    expect(notificationSaveSchema.safeParse({ esaviDescription: '' }).success).toBe(false);
    expect(notificationSaveSchema.safeParse({ esaviDescription: '   ' }).success).toBe(false);
  });

  it('acepta el resto de campos sin exigirlos', () => {
    const result = notificationSaveSchema.safeParse({
      esaviDescription: 'Reacción local',
      hasRelevantMedicalHistory: 'NO_ANSWER',
      deathDate: null,
      vaccinationCenterAddress: 'Av. Siempre Viva 123',
    });
    expect(result.success).toBe(true);
  });
});

const UUID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('createNotificationCompleteSchema — "Completar etapa" (SPEC FE12a §3.5)', () => {
  const baseValid = {
    esaviDescription: 'Reacción local',
    hasRelevantMedicalHistory: 'NO' as const,
    takesMedication: 'NO' as const,
    outcomeItemId: UUID_1,
    requestInvestigation: false,
    deathDate: null,
    autopsyRequested: null,
  };

  it('rama SEVERE completa y coherente pasa', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse({
      ...baseValid,
      hasPreviousEventHistory: 'NO',
      hasAllergyToOtherVaccines: 'NO',
      hasAllergyToMedications: 'NO',
      hasAllergyToPreviousSameVaccine: 'NO',
    });
    expect(result.success).toBe(true);
  });

  it('rama SEVERE sin los criterios obligatorios falla con un issue por campo', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse(baseValid);
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain('hasPreviousEventHistory');
    expect(paths).toContain('hasAllergyToOtherVaccines');
  });

  it('con la compuerta de embarazo abierta, hasPregnancyComplications es obligatorio', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: true,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse({
      ...baseValid,
      hasPreviousEventHistory: 'NO',
      hasAllergyToOtherVaccines: 'NO',
      hasAllergyToMedications: 'NO',
      hasAllergyToPreviousSameVaccine: 'NO',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain('hasPregnancyComplications');
  });

  it('rama NON_SEVERE requiere unidad, sitio, geolocalización y al menos una verificación', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'NON_SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse(baseValid);
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain('vaccinationHealthFacilityId');
    expect(paths).toContain('vaccinationSiteItemId');
    expect(paths).toContain('vaccinationGeoLocationId');
    expect(paths).toContain('verifiedAny');
  });

  it('rama NON_SEVERE completa y coherente pasa', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'NON_SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse({
      ...baseValid,
      vaccinationHealthFacilityId: UUID_1,
      vaccinationSiteItemId: UUID_2,
      vaccinationGeoLocationId: UUID_3,
      verifiedClinicalRecord: true,
    });
    expect(result.success).toBe(true);
  });

  it('con outcome de muerte, faltan deathDate/autopsyRequested', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'NON_SEVERE',
      isDeathOutcome: true,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse({
      ...baseValid,
      vaccinationHealthFacilityId: UUID_1,
      vaccinationSiteItemId: UUID_2,
      vaccinationGeoLocationId: UUID_3,
      verifiedClinicalRecord: true,
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain('deathDate');
  });

  // SPEC FE12b §4 paso 12 — el primer obligatorio de proceso del paso 4.
  it('con cero eventos, falla con un issue en "events"', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: false,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse({
      ...baseValid,
      hasPreviousEventHistory: 'NO',
      hasAllergyToOtherVaccines: 'NO',
      hasAllergyToMedications: 'NO',
      hasAllergyToPreviousSameVaccine: 'NO',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain('events');
  });

  it('con al menos un evento, ya no aparece "events" entre los pendientes', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse({
      ...baseValid,
      hasPreviousEventHistory: 'NO',
      hasAllergyToOtherVaccines: 'NO',
      hasAllergyToMedications: 'NO',
      hasAllergyToPreviousSameVaccine: 'NO',
    });
    expect(result.success).toBe(true);
  });

  // SPEC FE12c §4 paso 11 — los dos obligatorios de proceso de las vacunas.
  it('con cero vacunas, lista los dos pendientes (falta vacuna y falta sospechosa)', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: false,
      hasAtLeastOneSuspectedVaccine: false,
    });
    const result = schema.safeParse({
      ...baseValid,
      hasPreviousEventHistory: 'NO',
      hasAllergyToOtherVaccines: 'NO',
      hasAllergyToMedications: 'NO',
      hasAllergyToPreviousSameVaccine: 'NO',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain('vaccines');
    expect(paths).toContain('suspectedVaccine');
  });

  it('con una vacuna no sospechosa, lista sólo "suspectedVaccine"', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: false,
    });
    const result = schema.safeParse({
      ...baseValid,
      hasPreviousEventHistory: 'NO',
      hasAllergyToOtherVaccines: 'NO',
      hasAllergyToMedications: 'NO',
      hasAllergyToPreviousSameVaccine: 'NO',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).not.toContain('vaccines');
    expect(paths).toContain('suspectedVaccine');
  });

  it('con al menos una vacuna sospechosa, ninguno de los dos aparece entre los pendientes', () => {
    const schema = createNotificationCompleteSchema({
      notificationType: 'SEVERE',
      isDeathOutcome: false,
      pregnancyGateOpen: false,
      hasAtLeastOneEvent: true,
      hasAtLeastOneVaccine: true,
      hasAtLeastOneSuspectedVaccine: true,
    });
    const result = schema.safeParse({
      ...baseValid,
      hasPreviousEventHistory: 'NO',
      hasAllergyToOtherVaccines: 'NO',
      hasAllergyToMedications: 'NO',
      hasAllergyToPreviousSameVaccine: 'NO',
    });
    expect(result.success).toBe(true);
  });
});

// SPEC FE12b §4 paso 7 — los cuatro casos frontera de las cuatro reglas condicionales.
describe('isOtherEsaviDescriptionCoherent / isOtherEsaviCodeConflictAbsent — el evento', () => {
  it('«otro» sin descripción: incoherente', () => {
    expect(isOtherEsaviDescriptionCoherent(true, null)).toBe(false);
    expect(isOtherEsaviDescriptionCoherent(true, '   ')).toBe(false);
  });

  it('«otro» con descripción: coherente', () => {
    expect(isOtherEsaviDescriptionCoherent(true, 'Reacción no catalogada')).toBe(true);
  });

  it('descripción presente con la bandera en false: incoherente', () => {
    expect(isOtherEsaviDescriptionCoherent(false, 'Reacción no catalogada')).toBe(false);
  });

  it('sin descripción y la bandera en false: coherente', () => {
    expect(isOtherEsaviDescriptionCoherent(false, null)).toBe(true);
    expect(isOtherEsaviDescriptionCoherent(undefined, undefined)).toBe(true);
  });

  it('«otro» con código presente: conflicto', () => {
    expect(isOtherEsaviCodeConflictAbsent(true, 'FIEBRE')).toBe(false);
  });

  it('«otro» sin código: sin conflicto', () => {
    expect(isOtherEsaviCodeConflictAbsent(true, null)).toBe(true);
    expect(isOtherEsaviCodeConflictAbsent(true, '   ')).toBe(true);
  });

  it('sin «otro», con código: no es un conflicto — es el caso normal', () => {
    expect(isOtherEsaviCodeConflictAbsent(false, 'FIEBRE')).toBe(true);
  });
});

describe('notificationEventSchema', () => {
  const base = { esaviName: 'Fiebre alta' };

  it('rechaza "otro" sin descripción, en el campo otherDescription', () => {
    const result = notificationEventSchema.safeParse({ ...base, isOtherEsavi: true });
    expect(result.success).toBe(false);
    const issue =
      !result.success && result.error.issues.find((i) => i.path[0] === 'otherDescription');
    expect(issue).toBeTruthy();
  });

  it('rechaza una descripción presente con la bandera en false, en isOtherEsavi', () => {
    const result = notificationEventSchema.safeParse({
      ...base,
      isOtherEsavi: false,
      otherDescription: 'Reacción no catalogada',
    });
    expect(result.success).toBe(false);
    const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'isOtherEsavi');
    expect(issue).toBeTruthy();
  });

  it('rechaza "otro" con código presente, en isOtherEsavi (no en esaviCode)', () => {
    const result = notificationEventSchema.safeParse({
      ...base,
      isOtherEsavi: true,
      otherDescription: 'Reacción no catalogada',
      esaviCode: 'FIEBRE',
    });
    expect(result.success).toBe(false);
    const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'isOtherEsavi');
    expect(issue).toBeTruthy();
  });

  it('acepta el caso normal: sin "otro", con nombre y código', () => {
    const result = notificationEventSchema.safeParse({
      ...base,
      esaviCode: 'FIEBRE',
      source: 'MEDDRA',
    });
    expect(result.success).toBe(true);
  });
});

describe('isOtherMedicationTextCoherent / isMedicationCodeClearedWhenOther — la medicación', () => {
  it('«otra» sin texto: incoherente; «otra» con texto: coherente', () => {
    expect(isOtherMedicationTextCoherent(true, null)).toBe(false);
    expect(isOtherMedicationTextCoherent(true, 'Paracetamol de otra marca')).toBe(true);
  });

  it('texto presente con la bandera en false: incoherente', () => {
    expect(isOtherMedicationTextCoherent(false, 'Paracetamol de otra marca')).toBe(false);
  });

  it('medicationCode presente con isOtherMedication en true: se debe limpiar', () => {
    expect(isMedicationCodeClearedWhenOther(true, 'PAR001')).toBe(false);
  });

  it('medicationCode presente con isOtherMedication en false: es el caso normal, del catálogo', () => {
    expect(isMedicationCodeClearedWhenOther(false, 'PAR001')).toBe(true);
  });
});

describe('notificationMedicationSchema', () => {
  it('rechaza medicationCode presente con isOtherMedication en true, en isOtherMedication', () => {
    const result = notificationMedicationSchema.safeParse({
      medicationName: 'Paracetamol',
      isOtherMedication: true,
      otherMedicationText: 'Paracetamol de otra marca',
      medicationCode: 'PAR001',
    });
    expect(result.success).toBe(false);
    const issue =
      !result.success && result.error.issues.find((i) => i.path[0] === 'isOtherMedication');
    expect(issue).toBeTruthy();
  });

  it('acepta el caso normal: del catálogo, sin "otra"', () => {
    const result = notificationMedicationSchema.safeParse({
      medicationName: 'Paracetamol',
      medicationCode: 'PAR001',
    });
    expect(result.success).toBe(true);
  });
});

describe('hasVaccineIdentity — SPEC FE12c §3.5', () => {
  it('con vaccineWhodrugId, vaccineName vacío no es un problema', () => {
    expect(hasVaccineIdentity('vw-1', null)).toBe(true);
    expect(hasVaccineIdentity('vw-1', '')).toBe(true);
  });

  it('sin vaccineWhodrugId, exige vaccineName no vacío', () => {
    expect(hasVaccineIdentity(null, 'BCG')).toBe(true);
    expect(hasVaccineIdentity(null, '')).toBe(false);
    expect(hasVaccineIdentity(null, '   ')).toBe(false);
    expect(hasVaccineIdentity(null, null)).toBe(false);
  });
});

describe('isVaccinationNotAfterEventDate — SPEC FE12c §3.5', () => {
  it('el mismo día es válido', () => {
    expect(isVaccinationNotAfterEventDate('2026-03-10', '2026-03-10')).toBe(true);
  });

  it('un día después falla', () => {
    expect(isVaccinationNotAfterEventDate('2026-03-11', '2026-03-10')).toBe(false);
  });

  it('sin una de las dos fechas, no hay nada que comparar', () => {
    expect(isVaccinationNotAfterEventDate(null, '2026-03-10')).toBe(true);
    expect(isVaccinationNotAfterEventDate('2026-03-10', null)).toBe(true);
  });
});

describe('notificationVaccineSchema — la guarda de contenido mínimo se evalúa sobre el estado resultante', () => {
  it('borrar vaccineName de una fila sin FK falla', () => {
    const schema = createNotificationVaccineSchema({ eventDate: null });
    const result = schema.safeParse({ vaccineWhodrugId: null, vaccineName: '' });
    expect(result.success).toBe(false);
    const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'vaccineName');
    expect(issue).toBeTruthy();
  });

  it('vaccinationDate igual a eventDate pasa; un día después falla', () => {
    const schema = createNotificationVaccineSchema({ eventDate: '2026-03-10' });

    expect(schema.safeParse({ vaccineName: 'BCG', vaccinationDate: '2026-03-10' }).success).toBe(
      true,
    );

    const late = schema.safeParse({ vaccineName: 'BCG', vaccinationDate: '2026-03-11' });
    expect(late.success).toBe(false);
    const issue = !late.success && late.error.issues.find((i) => i.path[0] === 'vaccinationDate');
    expect(issue).toBeTruthy();
  });

  it('con vaccineWhodrugId y sin vaccineName, la guarda de contenido mínimo se satisface igual', () => {
    const schema = createNotificationVaccineSchema({ eventDate: null });
    expect(
      schema.safeParse({ vaccineWhodrugId: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });
});

describe('hasDiluentIdentity — SPEC FE12c §3.5', () => {
  it('sin diluentCatalogId, exige diluentName no vacío', () => {
    expect(hasDiluentIdentity(null, '')).toBe(false);
    expect(hasDiluentIdentity(null, 'Agua estéril')).toBe(true);
  });
});

describe('isReconstitutionNotAfterVaccination — sólo fechas, nunca horas', () => {
  it('el mismo día es válido aunque la hora sea posterior', () => {
    // La regla compara `YYYY-MM-DD`: la hora no forma parte de ninguna de las dos columnas que
    // entran aquí (§3.5 — `reconstitutionTime` no entra en ninguna comparación).
    expect(isReconstitutionNotAfterVaccination('2026-03-10', '2026-03-10')).toBe(true);
  });

  it('un día después falla', () => {
    expect(isReconstitutionNotAfterVaccination('2026-03-11', '2026-03-10')).toBe(false);
  });
});

describe('notificationDiluentSchema', () => {
  it('borrar diluentName de una fila sin diluentCatalogId falla', () => {
    const schema = createNotificationDiluentSchema({ vaccinationDate: null });
    const result = schema.safeParse({ diluentCatalogId: null, diluentName: '' });
    expect(result.success).toBe(false);
    const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'diluentName');
    expect(issue).toBeTruthy();
  });

  it('reconstitutionDate el mismo día que vaccinationDate se guarda aunque la hora sea posterior', () => {
    const schema = createNotificationDiluentSchema({ vaccinationDate: '2026-03-10' });
    const result = schema.safeParse({
      diluentName: 'Agua estéril',
      reconstitutionDate: '2026-03-10',
      reconstitutionTime: '23:59',
    });
    expect(result.success).toBe(true);
  });

  it('reconstitutionDate un día después de vaccinationDate falla', () => {
    const schema = createNotificationDiluentSchema({ vaccinationDate: '2026-03-10' });
    const result = schema.safeParse({
      diluentName: 'Agua estéril',
      reconstitutionDate: '2026-03-11',
    });
    expect(result.success).toBe(false);
    const issue =
      !result.success && result.error.issues.find((i) => i.path[0] === 'reconstitutionDate');
    expect(issue).toBeTruthy();
  });
});

describe('computeGestationDays / isGestationRangeCoherent — Naegele (SPEC FE12d §3.5)', () => {
  it('sin una de las dos fechas, no hay nada que comparar', () => {
    expect(computeGestationDays(null, '2026-09-24')).toBeNull();
    expect(computeGestationDays('2026-01-01', undefined)).toBeNull();
    expect(isGestationRangeCoherent(null, '2026-09-24')).toBe(true);
    expect(isGestationRangeCoherent('2026-01-01', null)).toBe(true);
  });

  it('266 y 294 días, ambos límites inclusive: coherente', () => {
    expect(computeGestationDays('2026-01-01', '2026-09-24')).toBe(266);
    expect(isGestationRangeCoherent('2026-01-01', '2026-09-24')).toBe(true);

    expect(computeGestationDays('2026-01-01', '2026-10-22')).toBe(294);
    expect(isGestationRangeCoherent('2026-01-01', '2026-10-22')).toBe(true);
  });

  it('265 y 295 días, uno a cada lado del límite: incoherente', () => {
    expect(computeGestationDays('2026-01-01', '2026-09-23')).toBe(265);
    expect(isGestationRangeCoherent('2026-01-01', '2026-09-23')).toBe(false);

    expect(computeGestationDays('2026-01-01', '2026-10-23')).toBe(295);
    expect(isGestationRangeCoherent('2026-01-01', '2026-10-23')).toBe(false);
  });

  it('el parto anterior a la menstruación cae fuera del rango con el mismo error', () => {
    expect(isGestationRangeCoherent('2026-09-24', '2026-01-01')).toBe(false);
  });
});

describe('notificationPregnancyCreateSchema / notificationPregnancyUpdateSchema (SPEC FE12d §3.5)', () => {
  it('el alta rechaza wasPregnantAtVaccination ausente', () => {
    const result = notificationPregnancyCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    const issue =
      !result.success && result.error.issues.find((i) => i.path[0] === 'wasPregnantAtVaccination');
    expect(issue).toBeTruthy();
  });

  it('el alta acepta cualquiera de los cinco valores, no sólo YES', () => {
    expect(
      notificationPregnancyCreateSchema.safeParse({ wasPregnantAtVaccination: 'NO' }).success,
    ).toBe(true);
    expect(
      notificationPregnancyCreateSchema.safeParse({ wasPregnantAtVaccination: 'UNKNOWN' }).success,
    ).toBe(true);
  });

  it('la edición admite wasPregnantAtVaccination en null — retirar una respuesta dada por error', () => {
    const result = notificationPregnancyUpdateSchema.safeParse({ wasPregnantAtVaccination: null });
    expect(result.success).toBe(true);
  });

  it('las dos variantes rechazan un rango gestacional fuera de 266–294 días', () => {
    const invalidRange = {
      wasPregnantAtVaccination: 'YES' as const,
      lastMenstruationDate: '2026-01-01',
      probableDeliveryDate: '2026-09-23',
    };
    const create = notificationPregnancyCreateSchema.safeParse(invalidRange);
    expect(create.success).toBe(false);
    const createIssue =
      !create.success && create.error.issues.find((i) => i.path[0] === 'probableDeliveryDate');
    expect(createIssue).toBeTruthy();

    const update = notificationPregnancyUpdateSchema.safeParse(invalidRange);
    expect(update.success).toBe(false);
  });

  it('sin ninguna de las dos fechas de gestación, ninguna variante rechaza el resto', () => {
    expect(
      notificationPregnancyCreateSchema.safeParse({ wasPregnantAtVaccination: 'NO' }).success,
    ).toBe(true);
  });
});

describe('notificationPregnancyComplicationSchema (SPEC FE12d §3.5)', () => {
  it('exige complicationTypeItemId y complicationName', () => {
    const result = notificationPregnancyComplicationSchema.safeParse({});
    expect(result.success).toBe(false);
    const paths = !result.success && result.error.issues.map((i) => i.path[0]);
    expect(paths).toContain('complicationTypeItemId');
    expect(paths).toContain('complicationName');
  });

  it('con los dos obligatorios presentes, pasa sin complicationCode ni source', () => {
    const result = notificationPregnancyComplicationSchema.safeParse({
      complicationName: 'Preeclampsia',
      complicationTypeItemId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(true);
  });
});

describe('notificationMedicalHistorySchema (SPEC FE12e §3.5)', () => {
  it('exige historyName y rechaza un nombre de solo espacios', () => {
    expect(notificationMedicalHistorySchema.safeParse({}).success).toBe(false);
    expect(notificationMedicalHistorySchema.safeParse({ historyName: '   ' }).success).toBe(false);
  });

  it('rechaza un historyName de 501 caracteres y admite uno de 500', () => {
    expect(
      notificationMedicalHistorySchema.safeParse({ historyName: 'a'.repeat(501) }).success,
    ).toBe(false);
    expect(
      notificationMedicalHistorySchema.safeParse({ historyName: 'a'.repeat(500) }).success,
    ).toBe(true);
  });

  it('rechaza un historyCode de 101 caracteres y pasa sin historyCode ni source', () => {
    expect(
      notificationMedicalHistorySchema.safeParse({
        historyName: 'Diabetes mellitus',
        historyCode: 'a'.repeat(101),
      }).success,
    ).toBe(false);
    expect(
      notificationMedicalHistorySchema.safeParse({ historyName: 'Diabetes mellitus' }).success,
    ).toBe(true);
  });

  it('acepta notes en null en las dos variantes', () => {
    expect(
      notificationMedicalHistorySchema.safeParse({ historyName: 'Asma', notes: null }).success,
    ).toBe(true);
    expect(notificationMedicalHistoryUpdateSchema.safeParse({ notes: null }).success).toBe(true);
  });

  it('la variante de edición admite historyName ausente y rechaza un null explícito', () => {
    expect(notificationMedicalHistoryUpdateSchema.safeParse({}).success).toBe(true);
    expect(notificationMedicalHistoryUpdateSchema.safeParse({ historyName: null }).success).toBe(
      false,
    );
    expect(notificationMedicalHistoryUpdateSchema.safeParse({ historyName: '  ' }).success).toBe(
      false,
    );
  });
});

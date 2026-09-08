import { describe, expect, it } from 'vitest';
import {
  createNotificationCompleteSchema,
  createNotificationDiluentSchema,
  createNotificationVaccineSchema,
  hasAnyVerificationSource,
  hasDiluentIdentity,
  hasVaccineIdentity,
  isDeathDateNotBeforeEventDate,
  isDeathFieldsRequirementMet,
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
  notificationSaveSchema,
  resolvePregnancyGate,
} from './schemas';

describe('resolvePregnancyGate — CASE-PROCESS.md §7.4', () => {
  it('MALE, cualquier edad: oculto', () => {
    expect(resolvePregnancyGate('MALE', 25)).toBe('hidden');
    expect(resolvePregnancyGate('MALE', null)).toBe('hidden');
  });

  it('cualquier sexo, edad conocida fuera de 15-49: oculto', () => {
    expect(resolvePregnancyGate('FEMALE', 14)).toBe('hidden');
    expect(resolvePregnancyGate('FEMALE', 50)).toBe('hidden');
    expect(resolvePregnancyGate('UNKNOWN', 10)).toBe('hidden');
  });

  it('FEMALE, edad 15-49: visible, normal', () => {
    expect(resolvePregnancyGate('FEMALE', 15)).toBe('visible');
    expect(resolvePregnancyGate('FEMALE', 49)).toBe('visible');
    expect(resolvePregnancyGate('FEMALE', 30)).toBe('visible');
  });

  it('FEMALE, edad desconocida: visible, «Si aplica»', () => {
    expect(resolvePregnancyGate('FEMALE', null)).toBe('visibleIfApplicable');
    expect(resolvePregnancyGate('FEMALE', undefined)).toBe('visibleIfApplicable');
  });

  it('UNKNOWN o sin informar, 15-49 o desconocida: visible, «Si aplica»', () => {
    expect(resolvePregnancyGate('UNKNOWN', 30)).toBe('visibleIfApplicable');
    expect(resolvePregnancyGate(null, 30)).toBe('visibleIfApplicable');
    expect(resolvePregnancyGate(null, null)).toBe('visibleIfApplicable');
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
    const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'otherDescription');
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
    const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'isOtherMedication');
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

    expect(
      schema.safeParse({ vaccineName: 'BCG', vaccinationDate: '2026-03-10' }).success,
    ).toBe(true);

    const late = schema.safeParse({ vaccineName: 'BCG', vaccinationDate: '2026-03-11' });
    expect(late.success).toBe(false);
    const issue = !late.success && late.error.issues.find((i) => i.path[0] === 'vaccinationDate');
    expect(issue).toBeTruthy();
  });

  it('con vaccineWhodrugId y sin vaccineName, la guarda de contenido mínimo se satisface igual', () => {
    const schema = createNotificationVaccineSchema({ eventDate: null });
    expect(schema.safeParse({ vaccineWhodrugId: '11111111-1111-4111-8111-111111111111' }).success).toBe(
      true,
    );
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
    const result = schema.safeParse({ diluentName: 'Agua estéril', reconstitutionDate: '2026-03-11' });
    expect(result.success).toBe(false);
    const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'reconstitutionDate');
    expect(issue).toBeTruthy();
  });
});

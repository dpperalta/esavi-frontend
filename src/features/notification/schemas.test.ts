import { describe, expect, it } from 'vitest';
import {
  createNotificationCompleteSchema,
  hasAnyVerificationSource,
  isDeathFieldsRequirementMet,
  isOtherSourceDescriptionRequirementMet,
  isPregnancyDescriptionRequirementMet,
  notificationSaveSchema,
} from './schemas';

describe('isDeathFieldsRequirementMet — fallecimiento (SPEC FE12a §3.5, §7)', () => {
  it('muerte sin autopsyRequested: inválido', () => {
    expect(isDeathFieldsRequirementMet(true, '2026-01-01', undefined)).toBe(false);
  });

  it('muerte con deathDate y autopsyRequested:false: válido — false cuenta como informado', () => {
    expect(isDeathFieldsRequirementMet(true, '2026-01-01', false)).toBe(true);
  });

  it('muerte sin deathDate: inválido', () => {
    expect(isDeathFieldsRequirementMet(true, null, false)).toBe(false);
  });

  it('autopsyRequested:false bajo recuperación (no muerte): inválido, debe ser null', () => {
    expect(isDeathFieldsRequirementMet(false, null, false)).toBe(false);
  });

  it('sin muerte y los dos campos en null: válido', () => {
    expect(isDeathFieldsRequirementMet(false, null, null)).toBe(true);
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
});

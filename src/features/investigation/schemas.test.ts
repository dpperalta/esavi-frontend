import { describe, expect, it } from 'vitest';
import {
  areAutopsyFlagsMutuallyExclusive,
  buildClinicalEvaluationSavePayload,
  buildMedicalHistorySavePayload,
  ENCRYPTED_FIELD_SCREEN_LIMIT,
  evaluationInstitutionErrorFieldMap,
  evaluationInstitutionSaveSchema,
  hasPregnancyFieldContent,
  investigationAutopsySaveSchema,
  investigationClinicalEvaluationErrorFieldMap,
  investigationClinicalEvaluationSaveSchema,
  investigationDiagnosticErrorFieldMap,
  investigationDiagnosticSaveSchema,
  investigationSaveSchema,
  investigationSourceSaveSchema,
  isAutopsyDateNotBeforeDeath,
  isAutopsyDateRequirementMet,
  isFlagExplanationRequirementMet,
  isInstitutionIdentified,
  isOtherSourceDescriptionRequirementMet,
  isPregnancyBlockOpen,
  isScheduledAutopsyDateRequirementMet,
  medicalHistoryErrorFieldMap,
  medicalHistorySaveSchema,
  newbornConditionErrorFieldMap,
  newbornConditionSaveSchema,
  teamMemberSaveSchema,
  type MedicalHistoryFormValues,
} from './schemas';

describe('investigationSaveSchema — A (SPEC FE13a §3.5 A)', () => {
  it('ninguna columna de datos es obligatoria: un objeto vacío pasa', () => {
    expect(investigationSaveSchema.safeParse({}).success).toBe(true);
  });

  it('acepta el estado vacío (statusItemId ausente)', () => {
    const result = investigationSaveSchema.safeParse({ notes: 'x' });
    expect(result.success).toBe(true);
  });

  it('rechaza una latitud fuera de rango', () => {
    expect(investigationSaveSchema.safeParse({ vaccinationLatitude: 200 }).success).toBe(false);
  });
});

describe('isOtherSourceDescriptionRequirementMet — B (SPEC FE13a §3.5 B)', () => {
  it('other:true sin descripción no cumple', () => {
    expect(isOtherSourceDescriptionRequirementMet(true, null)).toBe(false);
    expect(isOtherSourceDescriptionRequirementMet(true, '  ')).toBe(false);
  });

  it('other:true con descripción cumple', () => {
    expect(isOtherSourceDescriptionRequirementMet(true, 'Registro clínico externo')).toBe(true);
  });

  it('other apagado (false o null) sin descripción cumple', () => {
    expect(isOtherSourceDescriptionRequirementMet(false, null)).toBe(true);
    expect(isOtherSourceDescriptionRequirementMet(null, null)).toBe(true);
  });

  it('other apagado con descripción no cumple — una descripción heredada no se envía', () => {
    expect(isOtherSourceDescriptionRequirementMet(false, 'texto viejo')).toBe(false);
    expect(isOtherSourceDescriptionRequirementMet(null, 'texto viejo')).toBe(false);
  });
});

describe('investigationSourceSaveSchema — B', () => {
  it('un interruptor sin tocar (undefined) pasa; el cuerpo no lo lleva como false', () => {
    const result = investigationSourceSaveSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('other:true sin otherDescription no valida', () => {
    const result = investigationSourceSaveSchema.safeParse({ other: true });
    expect(result.success).toBe(false);
  });

  it('other:false con otherDescription con contenido no valida', () => {
    const result = investigationSourceSaveSchema.safeParse({
      other: false,
      otherDescription: 'texto que no debería viajar',
    });
    expect(result.success).toBe(false);
  });

  it('other:true con otherDescription válida', () => {
    const result = investigationSourceSaveSchema.safeParse({
      other: true,
      otherDescription: 'Registro clínico externo',
    });
    expect(result.success).toBe(true);
  });
});

describe('Las cuatro reglas de coherencia de la autopsia — C (SPEC FE13a §3.5 C)', () => {
  it('regla 1 — los dos no pueden ser true a la vez', () => {
    expect(areAutopsyFlagsMutuallyExclusive(true, true)).toBe(false);
    expect(areAutopsyFlagsMutuallyExclusive(true, false)).toBe(true);
    expect(areAutopsyFlagsMutuallyExclusive(null, null)).toBe(true);
  });

  it('regla 2 — sin isAutopsyPerformed:true, autopsyDate prohibida', () => {
    expect(isAutopsyDateRequirementMet(false, '2026-09-05')).toBe(false);
    expect(isAutopsyDateRequirementMet(null, '2026-09-05')).toBe(false);
    expect(isAutopsyDateRequirementMet(true, '2026-09-05')).toBe(true);
    expect(isAutopsyDateRequirementMet(true, null)).toBe(true);
  });

  it('regla 3 — espejo de la regla 2 sobre isAutopsyScheduled/scheduledAutopsyDate', () => {
    expect(isScheduledAutopsyDateRequirementMet(false, '2026-09-10')).toBe(false);
    expect(isScheduledAutopsyDateRequirementMet(true, '2026-09-10')).toBe(true);
    expect(isScheduledAutopsyDateRequirementMet(true, null)).toBe(true);
  });

  it('regla 4 — autopsyDate no anterior a deathDate', () => {
    expect(isAutopsyDateNotBeforeDeath('2026-09-01', '2026-09-05')).toBe(false);
    expect(isAutopsyDateNotBeforeDeath('2026-09-05', '2026-09-05')).toBe(true);
    expect(isAutopsyDateNotBeforeDeath('2026-09-06', '2026-09-05')).toBe(true);
    expect(isAutopsyDateNotBeforeDeath(null, '2026-09-05')).toBe(true);
  });
});

describe('investigationAutopsySaveSchema — C', () => {
  const base = { isDeath: true as const, deathDate: '2026-09-05' };

  it('isDeath sólo acepta true — nunca se ofrece como control editable', () => {
    expect(investigationAutopsySaveSchema.safeParse({ ...base, isDeath: false }).success).toBe(
      false,
    );
  });

  it('deathDate no acepta null en el update — es corregible pero no anulable', () => {
    expect(
      investigationAutopsySaveSchema.safeParse({ isDeath: true, deathDate: null }).success,
    ).toBe(false);
    expect(
      investigationAutopsySaveSchema.safeParse({ isDeath: true, deathDate: undefined }).success,
    ).toBe(false);
  });

  it('scheduledAutopsyDate acepta una fecha futura sin error', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyScheduled: true,
      scheduledAutopsyDate: '2099-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('autopsyDate anterior a deathDate no valida', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyPerformed: true,
      autopsyDate: '2026-09-01',
    });
    expect(result.success).toBe(false);
  });

  it('las cuatro reglas se rechazan a la vez, no de una en una', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyPerformed: false,
      isAutopsyScheduled: true,
      autopsyDate: '2026-09-01',
      scheduledAutopsyDate: '2099-01-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      // Rule 2 (autopsyDate present without isAutopsyPerformed:true) and rule 4 (autopsyDate
      // before deathDate) fire at once over the same case — the user sees both, not one.
      expect(paths).toContain('autopsyDate');
      expect(paths).toContain('deathDate');
    }
  });

  it('un bloque coherente (performed, sin scheduled, fecha posterior a la muerte) valida', () => {
    const result = investigationAutopsySaveSchema.safeParse({
      ...base,
      isAutopsyPerformed: true,
      autopsyDate: '2026-09-06',
    });
    expect(result.success).toBe(true);
  });
});

describe('teamMemberSaveSchema — D (SPEC FE13a §3.5 D)', () => {
  it('fullName es obligatorio', () => {
    expect(teamMemberSaveSchema.safeParse({}).success).toBe(false);
    expect(teamMemberSaveSchema.safeParse({ fullName: '' }).success).toBe(false);
  });

  it('institutionName no se normaliza en el cliente — el schema no lo toca', () => {
    const result = teamMemberSaveSchema.safeParse({
      fullName: 'Ana Pérez',
      institutionName: 'MINSAL',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.institutionName).toBe('MINSAL');
    }
  });

  it('email inválido no valida', () => {
    expect(
      teamMemberSaveSchema.safeParse({ fullName: 'Ana Pérez', email: 'no-es-un-correo' }).success,
    ).toBe(false);
  });

  it('phone es texto libre, sin máscara', () => {
    const result = teamMemberSaveSchema.safeParse({
      fullName: 'Ana Pérez',
      phone: 'ext. 234 / +593 99 000 0000',
    });
    expect(result.success).toBe(true);
  });
});

describe('isPregnancyBlockOpen — E (SPEC FE13b §3.5 A, compuerta interior de §7.4)', () => {
  it('solo YES abre el bloque — comparación estricta, no veracidad', () => {
    expect(isPregnancyBlockOpen('YES')).toBe(true);
    expect(isPregnancyBlockOpen('NO')).toBe(false);
    expect(isPregnancyBlockOpen('UNKNOWN')).toBe(false);
    expect(isPregnancyBlockOpen('NOT_APPLICABLE')).toBe(false);
    expect(isPregnancyBlockOpen('NO_ANSWER')).toBe(false);
    expect(isPregnancyBlockOpen(null)).toBe(false);
    expect(isPregnancyBlockOpen(undefined)).toBe(false);
  });
});

describe('hasPregnancyFieldContent — E (equivalente de hasContent del backend)', () => {
  it('null y la cadena en blanco son ausencia', () => {
    expect(hasPregnancyFieldContent(null)).toBe(false);
    expect(hasPregnancyFieldContent(undefined)).toBe(false);
    expect(hasPregnancyFieldContent('')).toBe(false);
    expect(hasPregnancyFieldContent('   ')).toBe(false);
  });

  it('el 0 es contenido, no ausencia', () => {
    expect(hasPregnancyFieldContent(0)).toBe(true);
  });

  it('cualquier texto o número no vacío es contenido', () => {
    expect(hasPregnancyFieldContent('texto')).toBe(true);
    expect(hasPregnancyFieldContent(37)).toBe(true);
  });
});

describe('buildMedicalHistorySavePayload — E (SPEC FE13b §3.5 A punto 3)', () => {
  const withPregnancyData: MedicalHistoryFormValues = {
    isPregnancyConfirmed: 'NO',
    gestationalWeeks: 12,
    gestationMethodItemId: 'gm-1',
    hasPregnancyRiskFactor: 'YES',
    riskFactorDescription: 'Hipertensión',
    deliveryItemId: 'dv-1',
    birthItemId: 'bc-1',
    birthWeightGrams: 0,
    pregnancyOutcomeItemId: 'po-1',
    wasBreastfed: 'YES',
  };

  it('bloque cerrado: las nueve columnas viajan null explícito, no se omiten', () => {
    const result = buildMedicalHistorySavePayload(withPregnancyData);
    expect(result).toMatchObject({
      isPregnancyConfirmed: 'NO',
      gestationalWeeks: null,
      gestationMethodItemId: null,
      hasPregnancyRiskFactor: null,
      riskFactorDescription: null,
      deliveryItemId: null,
      birthItemId: null,
      birthWeightGrams: null,
      pregnancyOutcomeItemId: null,
      wasBreastfed: null,
    });
  });

  it('bloque abierto: los valores se envían tal cual, el 0 sobrevive', () => {
    const result = buildMedicalHistorySavePayload({
      ...withPregnancyData,
      isPregnancyConfirmed: 'YES',
    });
    expect(result.birthWeightGrams).toBe(0);
    expect(result.gestationalWeeks).toBe(12);
  });

  // Caso cruzado (SPEC FE13b §4 paso 9): las cinco formas del `answerOption` que cierran el
  // bloque (§7.4 en el paso 5) lo cierran por igual en el constructor del cuerpo, no sólo en el
  // predicado `isPregnancyBlockOpen` — es la diferencia entre "el schema sabe que está cerrado" y
  // "el `PUT` realmente lo declara cerrado".
  it.each([
    ['NO', 'NO'],
    ['UNKNOWN', 'UNKNOWN'],
    ['NOT_APPLICABLE', 'NOT_APPLICABLE'],
    ['NO_ANSWER', 'NO_ANSWER'],
    ['null', null],
  ] as const)('%s cierra las nueve columnas igual que NO', (_label, value) => {
    const result = buildMedicalHistorySavePayload({
      ...withPregnancyData,
      isPregnancyConfirmed: value,
    });
    expect(result).toMatchObject({
      gestationalWeeks: null,
      gestationMethodItemId: null,
      hasPregnancyRiskFactor: null,
      riskFactorDescription: null,
      deliveryItemId: null,
      birthItemId: null,
      birthWeightGrams: null,
      pregnancyOutcomeItemId: null,
      wasBreastfed: null,
    });
  });

  // Caso cruzado: los dos bordes del `CHECK` sobreviven juntos con el bloque abierto, no sólo el
  // 0 de arriba — `45` y `6000` son los máximos de `gestationalWeeks` y `birthWeightGrams`
  // respectivamente (§3.5 A).
  it('bloque abierto: los dos bordes superiores (45 y 6000) sobreviven juntos', () => {
    const result = buildMedicalHistorySavePayload({
      ...withPregnancyData,
      isPregnancyConfirmed: 'YES',
      gestationalWeeks: 45,
      birthWeightGrams: 6000,
    });
    expect(result.gestationalWeeks).toBe(45);
    expect(result.birthWeightGrams).toBe(6000);
  });
});

describe('medicalHistoryErrorFieldMap — E (SPEC FE13b §3.5 A)', () => {
  it('las cuatro claves de catálogo anclan en su campo, en el 001 y en el 004', () => {
    expect(medicalHistoryErrorFieldMap.INVMEDH_001_GESTATION_METHOD_NOT_FOUND).toBe(
      'gestationMethodItemId',
    );
    expect(medicalHistoryErrorFieldMap.INVMEDH_004_GESTATION_METHOD_NOT_FOUND).toBe(
      'gestationMethodItemId',
    );
    expect(medicalHistoryErrorFieldMap.INVMEDH_001_DELIVERY_NOT_FOUND).toBe('deliveryItemId');
    expect(medicalHistoryErrorFieldMap.INVMEDH_004_DELIVERY_NOT_FOUND).toBe('deliveryItemId');
    expect(medicalHistoryErrorFieldMap.INVMEDH_001_BIRTH_NOT_FOUND).toBe('birthItemId');
    expect(medicalHistoryErrorFieldMap.INVMEDH_004_BIRTH_NOT_FOUND).toBe('birthItemId');
    expect(medicalHistoryErrorFieldMap.INVMEDH_001_PREGNANCY_OUTCOME_NOT_FOUND).toBe(
      'pregnancyOutcomeItemId',
    );
    expect(medicalHistoryErrorFieldMap.INVMEDH_004_PREGNANCY_OUTCOME_NOT_FOUND).toBe(
      'pregnancyOutcomeItemId',
    );
  });

  it('la regla del bloque ancla en isPregnancyConfirmed, en el 001 y en el 004', () => {
    expect(medicalHistoryErrorFieldMap.INVMEDH_001_PREGNANCY_FIELDS_NOT_ALLOWED).toBe(
      'isPregnancyConfirmed',
    );
    expect(medicalHistoryErrorFieldMap.INVMEDH_004_PREGNANCY_FIELDS_NOT_ALLOWED).toBe(
      'isPregnancyConfirmed',
    );
  });

  it('el 409 de duplicado y los dos 404 no anclan en ningún campo — son estados de pantalla, no errores de formulario', () => {
    expect(medicalHistoryErrorFieldMap.INVMEDH_001_ALREADY_EXISTS).toBeUndefined();
    expect(medicalHistoryErrorFieldMap.INVMEDH_006_NOT_FOUND).toBeUndefined();
    expect(medicalHistoryErrorFieldMap.INVMEDH_006_INVESTIGATION_NOT_FOUND).toBeUndefined();
  });
});

describe('newbornConditionErrorFieldMap — F (SPEC FE13b §3.5 B)', () => {
  it('DIAGTERM_NOT_FOUND y ALREADY_EXISTS anclan en conditionName, en el 001 y en el 004', () => {
    expect(newbornConditionErrorFieldMap.INVPREG_001_DIAGTERM_NOT_FOUND).toBe('conditionName');
    expect(newbornConditionErrorFieldMap.INVPREG_004_DIAGTERM_NOT_FOUND).toBe('conditionName');
    expect(newbornConditionErrorFieldMap.INVPREG_001_ALREADY_EXISTS).toBe('conditionName');
    expect(newbornConditionErrorFieldMap.INVPREG_004_ALREADY_EXISTS).toBe('conditionName');
  });

  it('el 404 de la nieta no ancla en ningún campo — tiene su propio estado de pantalla («Crear la ficha»)', () => {
    expect(newbornConditionErrorFieldMap.INVPREG_001_MEDICAL_HISTORY_NOT_FOUND).toBeUndefined();
    expect(newbornConditionErrorFieldMap.INVPREG_004_MEDICAL_HISTORY_NOT_FOUND).toBeUndefined();
  });
});

describe('medicalHistorySaveSchema — E', () => {
  it('ninguna columna es obligatoria: un objeto vacío pasa', () => {
    expect(medicalHistorySaveSchema.safeParse({}).success).toBe(true);
  });

  it('gestationalWeeks acepta 0 y rechaza fuera de 0-45', () => {
    expect(medicalHistorySaveSchema.safeParse({ gestationalWeeks: 0 }).success).toBe(true);
    expect(medicalHistorySaveSchema.safeParse({ gestationalWeeks: 46 }).success).toBe(false);
  });

  it('birthWeightGrams acepta 0 y rechaza fuera de 0-6000', () => {
    expect(medicalHistorySaveSchema.safeParse({ birthWeightGrams: 0 }).success).toBe(true);
    expect(medicalHistorySaveSchema.safeParse({ birthWeightGrams: 6001 }).success).toBe(false);
  });
});

describe('newbornConditionSaveSchema — F (SPEC FE13b §3.5 B)', () => {
  it('conditionName es obligatorio', () => {
    expect(newbornConditionSaveSchema.safeParse({}).success).toBe(false);
    expect(newbornConditionSaveSchema.safeParse({ conditionName: '' }).success).toBe(false);
  });

  it('un conditionName con contenido, sin más campos, valida', () => {
    const result = newbornConditionSaveSchema.safeParse({ conditionName: 'Ictericia neonatal' });
    expect(result.success).toBe(true);
  });
});

describe('isFlagExplanationRequirementMet — G (SPEC FE13c §1.D)', () => {
  it('bandera:true sin explicación no cumple', () => {
    expect(isFlagExplanationRequirementMet(true, null)).toBe(false);
    expect(isFlagExplanationRequirementMet(true, '  ')).toBe(false);
  });

  it('bandera:true con explicación cumple', () => {
    expect(isFlagExplanationRequirementMet(true, 'Se sospechó maltrato')).toBe(true);
  });

  it('bandera cerrada (false o null) sin explicación cumple', () => {
    expect(isFlagExplanationRequirementMet(false, null)).toBe(true);
    expect(isFlagExplanationRequirementMet(null, null)).toBe(true);
  });

  it('bandera cerrada con explicación heredada no cumple', () => {
    expect(isFlagExplanationRequirementMet(false, 'texto viejo')).toBe(false);
    expect(isFlagExplanationRequirementMet(null, 'texto viejo')).toBe(false);
  });
});

describe('buildClinicalEvaluationSavePayload — G (SPEC FE13c §3.5 A)', () => {
  const base = {
    receivedMedicalAttention: null,
    sourceExam: null,
    sourceDocuments: null,
    sourceVerbalAutopsy: null,
    sourceOther: null,
    otherDescription: null,
    suspectedChildAbuse: null,
    childAbuseExplanation: null,
    suspectedDomesticViolence: null,
    domesticViolenceExplanation: null,
    clinicalDetailsPersonName: null,
    familyClinicalDetails: null,
    completeClinicalSummary: null,
    signsAndSymptoms: null,
    otherSocialBackground: null,
    notes: null,
  };

  it('con las tres banderas cerradas, fuerza las tres explicaciones a null aunque el campo tenga texto', () => {
    const payload = buildClinicalEvaluationSavePayload({
      ...base,
      sourceOther: false,
      otherDescription: 'texto heredado',
      suspectedChildAbuse: null,
      childAbuseExplanation: 'texto heredado',
      suspectedDomesticViolence: false,
      domesticViolenceExplanation: 'texto heredado',
    });
    expect(payload.otherDescription).toBeNull();
    expect(payload.childAbuseExplanation).toBeNull();
    expect(payload.domesticViolenceExplanation).toBeNull();
  });

  it('con una bandera abierta, conserva su explicación', () => {
    const payload = buildClinicalEvaluationSavePayload({
      ...base,
      sourceOther: true,
      otherDescription: 'Registro clínico externo',
    });
    expect(payload.otherDescription).toBe('Registro clínico externo');
  });
});

describe('investigationClinicalEvaluationSaveSchema — G', () => {
  it('ninguna columna es obligatoria: un objeto vacío pasa', () => {
    expect(investigationClinicalEvaluationSaveSchema.safeParse({}).success).toBe(true);
  });

  it('un cuerpo que rompe los tres pares produce los tres errores a la vez, no uno', () => {
    const result = investigationClinicalEvaluationSaveSchema.safeParse({
      sourceOther: true,
      suspectedChildAbuse: true,
      suspectedDomesticViolence: true,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain('otherDescription');
    expect(paths).toContain('childAbuseExplanation');
    expect(paths).toContain('domesticViolenceExplanation');
    expect(result.error.issues).toHaveLength(3);
  });

  it('una explicación con la bandera en null no valida', () => {
    const result = investigationClinicalEvaluationSaveSchema.safeParse({
      suspectedChildAbuse: null,
      childAbuseExplanation: 'texto que no debería viajar',
    });
    expect(result.success).toBe(false);
  });

  it('receivedMedicalAttention en NO no oculta ni exige nada más (§6 decision 9)', () => {
    const result = investigationClinicalEvaluationSaveSchema.safeParse({
      receivedMedicalAttention: 'NO',
    });
    expect(result.success).toBe(true);
  });

  it('clinicalDetailsPersonName no tiene tope — es text, no varchar(n)', () => {
    const result = investigationClinicalEvaluationSaveSchema.safeParse({
      clinicalDetailsPersonName: 'x'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });
});

describe('investigationClinicalEvaluationErrorFieldMap — G (SPEC FE13c §3.5 A)', () => {
  it('los seis códigos, en las dos operaciones, anclan en su propia explicación', () => {
    expect(investigationClinicalEvaluationErrorFieldMap.INVCLIEV_001_OTHER_DESCRIPTION_REQUIRED).toBe(
      'otherDescription',
    );
    expect(investigationClinicalEvaluationErrorFieldMap.INVCLIEV_004_OTHER_DESCRIPTION_NOT_ALLOWED).toBe(
      'otherDescription',
    );
    expect(
      investigationClinicalEvaluationErrorFieldMap.INVCLIEV_001_CHILD_ABUSE_EXPLANATION_REQUIRED,
    ).toBe('childAbuseExplanation');
    expect(
      investigationClinicalEvaluationErrorFieldMap.INVCLIEV_004_DOMESTIC_VIOLENCE_EXPLANATION_NOT_ALLOWED,
    ).toBe('domesticViolenceExplanation');
  });
});

describe('isInstitutionIdentified — H (SPEC FE13c §3.5 B)', () => {
  it('sin healthFacilityId y sin institutionName no cumple', () => {
    expect(isInstitutionIdentified(null, null)).toBe(false);
    expect(isInstitutionIdentified(null, '   ')).toBe(false);
  });

  it('con sólo uno de los dos cumple', () => {
    expect(isInstitutionIdentified('facility-1', null)).toBe(true);
    expect(isInstitutionIdentified(null, 'Hospital San Juan')).toBe(true);
  });

  it('con los dos cumple', () => {
    expect(isInstitutionIdentified('facility-1', 'Hospital San Juan')).toBe(true);
  });
});

describe('evaluationInstitutionSaveSchema — H', () => {
  it('una institución sin healthFacilityId y sin institutionName no valida', () => {
    const result = evaluationInstitutionSaveSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('con sólo uno de los dos valida', () => {
    expect(
      evaluationInstitutionSaveSchema.safeParse({ healthFacilityId: crypto.randomUUID() }).success,
    ).toBe(true);
    expect(
      evaluationInstitutionSaveSchema.safeParse({ institutionName: 'Hospital San Juan' }).success,
    ).toBe(true);
  });

  it(`personContact corta en ${ENCRYPTED_FIELD_SCREEN_LIMIT} caracteres, no en 250`, () => {
    const base = { institutionName: 'Hospital San Juan' };
    expect(
      evaluationInstitutionSaveSchema.safeParse({
        ...base,
        personContact: 'x'.repeat(ENCRYPTED_FIELD_SCREEN_LIMIT),
      }).success,
    ).toBe(true);
    expect(
      evaluationInstitutionSaveSchema.safeParse({
        ...base,
        personContact: 'x'.repeat(ENCRYPTED_FIELD_SCREEN_LIMIT + 1),
      }).success,
    ).toBe(false);
  });

  it('institutionName corta en 250 caracteres', () => {
    expect(
      evaluationInstitutionSaveSchema.safeParse({ institutionName: 'x'.repeat(250) }).success,
    ).toBe(true);
    expect(
      evaluationInstitutionSaveSchema.safeParse({ institutionName: 'x'.repeat(251) }).success,
    ).toBe(false);
  });
});

describe('evaluationInstitutionErrorFieldMap — H (SPEC FE13c §3.5 B)', () => {
  it('el 404 de la ficha no está mapeado — tiene su propio estado de pantalla', () => {
    expect(
      evaluationInstitutionErrorFieldMap.EVALINST_001_CLINICAL_EVALUATION_NOT_FOUND,
    ).toBeUndefined();
  });

  it('IDENTIFICATION_REQUIRED y ALREADY_EXISTS anclan en un campo, en las dos operaciones', () => {
    expect(evaluationInstitutionErrorFieldMap.EVALINST_001_IDENTIFICATION_REQUIRED).toBeDefined();
    expect(evaluationInstitutionErrorFieldMap.EVALINST_004_IDENTIFICATION_REQUIRED).toBeDefined();
    expect(evaluationInstitutionErrorFieldMap.EVALINST_001_ALREADY_EXISTS).toBe('healthFacilityId');
    expect(evaluationInstitutionErrorFieldMap.EVALINST_004_ALREADY_EXISTS).toBe('healthFacilityId');
  });
});

describe('investigationDiagnosticSaveSchema — I (SPEC FE13c §3.5 C)', () => {
  it('diagnosticName es obligatorio', () => {
    expect(investigationDiagnosticSaveSchema.safeParse({}).success).toBe(false);
    expect(investigationDiagnosticSaveSchema.safeParse({ diagnosticName: '' }).success).toBe(false);
  });

  it('un diagnosticName con contenido, sin más campos, valida', () => {
    const result = investigationDiagnosticSaveSchema.safeParse({ diagnosticName: 'Fiebre' });
    expect(result.success).toBe(true);
  });

  it('acepta una fecha anterior al inicio de la investigación — no hay cruce de fechas (§2)', () => {
    const result = investigationDiagnosticSaveSchema.safeParse({
      diagnosticName: 'Fiebre',
      diagnosticDate: '2000-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('diagnosticTypeItemId no tiene valor por defecto — undefined es válido (§6 decision 8)', () => {
    const result = investigationDiagnosticSaveSchema.safeParse({ diagnosticName: 'Fiebre' });
    expect(result.success && result.data.diagnosticTypeItemId).toBeUndefined();
  });
});

describe('investigationDiagnosticErrorFieldMap — I (SPEC FE13c §3.5 C)', () => {
  it('DIAGTERM_NOT_FOUND y ALREADY_EXISTS anclan en diagnosticName, en el 001 y en el 004', () => {
    expect(investigationDiagnosticErrorFieldMap.INVDIAG_001_DIAGTERM_NOT_FOUND).toBe(
      'diagnosticName',
    );
    expect(investigationDiagnosticErrorFieldMap.INVDIAG_004_DIAGTERM_NOT_FOUND).toBe(
      'diagnosticName',
    );
    expect(investigationDiagnosticErrorFieldMap.INVDIAG_001_ALREADY_EXISTS).toBe('diagnosticName');
    expect(investigationDiagnosticErrorFieldMap.INVDIAG_004_ALREADY_EXISTS).toBe('diagnosticName');
  });

  it('INVALID_DIAGNOSTIC_TYPE ancla en diagnosticTypeItemId', () => {
    expect(investigationDiagnosticErrorFieldMap.INVDIAG_001_INVALID_DIAGNOSTIC_TYPE).toBe(
      'diagnosticTypeItemId',
    );
  });
});

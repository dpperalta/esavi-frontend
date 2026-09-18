import { describe, expect, it } from 'vitest';
import {
  areAutopsyFlagsMutuallyExclusive,
  areTransportContainersExclusive,
  buildAdministrationErrorSavePayload,
  buildClinicalEvaluationSavePayload,
  buildColdChainSavePayload,
  buildCommunitySavePayload,
  buildMedicalHistorySavePayload,
  buildVaccinationContextSavePayload,
  ENCRYPTED_FIELD_SCREEN_LIMIT,
  evaluationInstitutionErrorFieldMap,
  evaluationInstitutionSaveSchema,
  hasPregnancyFieldContent,
  investigationAdministrationErrorSaveSchema,
  investigationAutopsySaveSchema,
  investigationBasicInfoCompleteSchema,
  investigationClinicalEvaluationErrorFieldMap,
  investigationClinicalEvaluationSaveSchema,
  investigationColdChainSaveSchema,
  investigationCommunitySaveSchema,
  investigationDiagnosticErrorFieldMap,
  investigationDiagnosticSaveSchema,
  investigationSaveSchema,
  investigationSourceSaveSchema,
  investigationVaccinationContextErrorFieldMap,
  investigationVaccinationContextSaveSchema,
  isAutopsyDateNotBeforeDeath,
  isAutopsyDateRequirementMet,
  isClusterBlockOpen,
  isFlagExplanationRequirementMet,
  isInstitutionIdentified,
  isOtherSourceDescriptionRequirementMet,
  isPregnancyBlockOpen,
  isSameVialCountRequirementMet,
  isScheduledAutopsyDateRequirementMet,
  isSimilarEventBlockOpen,
  isSimilarEventDescriptionMet,
  isStorageBlockOpen,
  isSyringeBlockOpen,
  isSyringeTypeDeclared,
  medicalHistoryErrorFieldMap,
  medicalHistorySaveSchema,
  newbornConditionErrorFieldMap,
  newbornConditionSaveSchema,
  teamMemberSaveSchema,
  type InvestigationAdministrationErrorFormValues,
  type InvestigationColdChainFormValues,
  type InvestigationCommunityFormValues,
  type InvestigationVaccinationContextFormValues,
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

describe('investigationBasicInfoCompleteSchema — A (SPEC FE16 §3.5)', () => {
  function pendingPaths(value: unknown): string[] {
    const result = investigationBasicInfoCompleteSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => String(issue.path[0]));
  }

  it('sin fecha de inicio, la fecha de inicio queda pendiente', () => {
    expect(
      pendingPaths({ investigationStartDate: null, isDeath: false, hasAutopsyRow: false }),
    ).toEqual(['investigationStartDate']);
    expect(
      pendingPaths({ investigationStartDate: undefined, isDeath: false, hasAutopsyRow: false }),
    ).toEqual(['investigationStartDate']);
    expect(
      pendingPaths({ investigationStartDate: '', isDeath: false, hasAutopsyRow: false }),
    ).toEqual(['investigationStartDate']);
  });

  it('con fecha de inicio y sin bloque de muerte, no hay pendientes', () => {
    expect(
      pendingPaths({ investigationStartDate: '2026-09-01', isDeath: false, hasAutopsyRow: false }),
    ).toEqual([]);
  });

  it('con el estado en DEATH y sin fila de autopsia, la fecha de fallecimiento queda pendiente', () => {
    expect(
      pendingPaths({ investigationStartDate: '2026-09-01', isDeath: true, hasAutopsyRow: false }),
    ).toEqual(['deathDate']);
  });

  it('con el estado en DEATH y la fila de autopsia guardada, la fecha de fallecimiento no está pendiente', () => {
    expect(
      pendingPaths({ investigationStartDate: '2026-09-01', isDeath: true, hasAutopsyRow: true }),
    ).toEqual([]);
  });

  it('con las dos reglas incumplidas a la vez, devuelve las dos', () => {
    expect(
      pendingPaths({ investigationStartDate: null, isDeath: true, hasAutopsyRow: false }),
    ).toEqual(['investigationStartDate', 'deathDate']);
  });

  it('una fila de autopsia sin estado DEATH no genera pendiente', () => {
    expect(
      pendingPaths({ investigationStartDate: '2026-09-01', isDeath: false, hasAutopsyRow: true }),
    ).toEqual([]);
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

describe('isClusterBlockOpen — J (SPEC FE13d §1.A)', () => {
  it('sólo YES abre el bloque; las otras cuatro formas del answerOption lo cierran igual', () => {
    expect(isClusterBlockOpen('YES')).toBe(true);
    expect(isClusterBlockOpen('NO')).toBe(false);
    expect(isClusterBlockOpen('UNKNOWN')).toBe(false);
    expect(isClusterBlockOpen('NOT_APPLICABLE')).toBe(false);
    expect(isClusterBlockOpen('NO_ANSWER')).toBe(false);
    expect(isClusterBlockOpen(null)).toBe(false);
    expect(isClusterBlockOpen(undefined)).toBe(false);
  });
});

describe('isSameVialCountRequirementMet — J (SPEC FE13d §1.A, §6 decision 3)', () => {
  it('con clusterUsedSameVial distinto de NO, el contador no se exige', () => {
    expect(isSameVialCountRequirementMet('YES', null)).toBe(true);
    expect(isSameVialCountRequirementMet('UNKNOWN', null)).toBe(true);
    expect(isSameVialCountRequirementMet(null, null)).toBe(true);
    expect(isSameVialCountRequirementMet(undefined, undefined)).toBe(true);
  });

  it('con clusterUsedSameVial:NO, el contador es obligatorio', () => {
    expect(isSameVialCountRequirementMet('NO', null)).toBe(false);
    expect(isSameVialCountRequirementMet('NO', undefined)).toBe(false);
  });

  it('un 0 satisface la obligación — no es una ausencia (§6 decision 3)', () => {
    expect(isSameVialCountRequirementMet('NO', 0)).toBe(true);
  });

  it('cualquier número mayor satisface igual', () => {
    expect(isSameVialCountRequirementMet('NO', 5)).toBe(true);
  });
});

describe('buildVaccinationContextSavePayload — J (SPEC FE13d §3.5)', () => {
  const withClusterData: InvestigationVaccinationContextFormValues = {
    momentItemId: 'moment-1',
    multidoseItemId: null,
    vaccinatedPerVialCount: 3,
    vaccinatedPerBatchCount: 5,
    locations: 'Centro de salud X',
    isCluster: 'YES',
    clusterIdentificationNumber: 'CL-001',
    clusterAdditionalCaseCount: 2,
    clusterUsedSameVial: 'NO',
    clusterSameVialCount: 0,
    notes: null,
  };

  it('bloque abierto: las cuatro columnas del conglomerado viajan tal cual, el 0 sobrevive', () => {
    const result = buildVaccinationContextSavePayload(withClusterData);
    expect(result.clusterIdentificationNumber).toBe('CL-001');
    expect(result.clusterAdditionalCaseCount).toBe(2);
    expect(result.clusterUsedSameVial).toBe('NO');
    expect(result.clusterSameVialCount).toBe(0);
  });

  // Caso cruzado (mismo criterio que `buildMedicalHistorySavePayload`): las cuatro formas que
  // cierran el bloque lo cierran igual en el constructor del cuerpo, no sólo en el predicado.
  it.each([
    ['NO', 'NO'],
    ['UNKNOWN', 'UNKNOWN'],
    ['NOT_APPLICABLE', 'NOT_APPLICABLE'],
    ['NO_ANSWER', 'NO_ANSWER'],
    ['null', null],
  ] as const)('%s cierra las cuatro columnas del conglomerado — null explícito, no omitido', (_label, value) => {
    const result = buildVaccinationContextSavePayload({ ...withClusterData, isCluster: value });
    expect(result).toMatchObject({
      isCluster: value,
      clusterIdentificationNumber: null,
      clusterAdditionalCaseCount: null,
      clusterUsedSameVial: null,
      clusterSameVialCount: null,
    });
  });

  it('el contexto de fuera del bloque (D.3–D.6) no se toca al cerrar el conglomerado', () => {
    const result = buildVaccinationContextSavePayload({ ...withClusterData, isCluster: 'NO' });
    expect(result.momentItemId).toBe('moment-1');
    expect(result.vaccinatedPerVialCount).toBe(3);
    expect(result.vaccinatedPerBatchCount).toBe(5);
    expect(result.locations).toBe('Centro de salud X');
  });
});

describe('investigationVaccinationContextSaveSchema — J', () => {
  it('un objeto vacío valida — ningún campo es obligatorio (§2, la ficha nace vacía)', () => {
    expect(investigationVaccinationContextSaveSchema.safeParse({}).success).toBe(true);
  });

  it('isCluster:UNKNOWN con clusterIdentificationNumber escrito valida en el schema — la limpieza la hace el constructor del cuerpo, no el schema', () => {
    const result = investigationVaccinationContextSaveSchema.safeParse({
      isCluster: 'UNKNOWN',
      clusterIdentificationNumber: 'CL-001',
    });
    expect(result.success).toBe(true);
  });

  it('clusterUsedSameVial:NO sin contador falla', () => {
    const result = investigationVaccinationContextSaveSchema.safeParse({
      isCluster: 'YES',
      clusterUsedSameVial: 'NO',
    });
    expect(result.success).toBe(false);
  });

  it('clusterUsedSameVial:NO con contador 0 pasa', () => {
    const result = investigationVaccinationContextSaveSchema.safeParse({
      isCluster: 'YES',
      clusterUsedSameVial: 'NO',
      clusterSameVialCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('clusterUsedSameVial:YES no exige el contador', () => {
    const result = investigationVaccinationContextSaveSchema.safeParse({
      isCluster: 'YES',
      clusterUsedSameVial: 'YES',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['vaccinatedPerVialCount'],
    ['vaccinatedPerBatchCount'],
    ['clusterAdditionalCaseCount'],
    ['clusterSameVialCount'],
  ] as const)('%s rechaza 40000 — por encima del techo smallint de 32767', (field) => {
    const result = investigationVaccinationContextSaveSchema.safeParse({ [field]: 40000 });
    expect(result.success).toBe(false);
  });

  it.each([
    ['vaccinatedPerVialCount'],
    ['vaccinatedPerBatchCount'],
    ['clusterAdditionalCaseCount'],
    ['clusterSameVialCount'],
  ] as const)('%s acepta 32767 — el borde exacto', (field) => {
    const result = investigationVaccinationContextSaveSchema.safeParse({ [field]: 32767 });
    expect(result.success).toBe(true);
  });

  it('clusterIdentificationNumber rechaza más de 100 caracteres', () => {
    const result = investigationVaccinationContextSaveSchema.safeParse({
      clusterIdentificationNumber: 'x'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe('investigationVaccinationContextErrorFieldMap — J', () => {
  it('los dos códigos de catálogo compartido anclan en desplegables distintos', () => {
    expect(investigationVaccinationContextErrorFieldMap.INVVACTX_001_MOMENT_NOT_FOUND).toBe(
      'momentItemId',
    );
    expect(investigationVaccinationContextErrorFieldMap.INVVACTX_001_MULTIDOSE_NOT_FOUND).toBe(
      'multidoseItemId',
    );
  });

  it('CLUSTER_SAME_VIAL_COUNT_REQUIRED ancla en clusterSameVialCount, en el 001 y en el 004', () => {
    expect(
      investigationVaccinationContextErrorFieldMap.INVVACTX_001_CLUSTER_SAME_VIAL_COUNT_REQUIRED,
    ).toBe('clusterSameVialCount');
    expect(
      investigationVaccinationContextErrorFieldMap.INVVACTX_004_CLUSTER_SAME_VIAL_COUNT_REQUIRED,
    ).toBe('clusterSameVialCount');
  });
});

describe('isStorageBlockOpen — K (SPEC FE13d §1.D)', () => {
  it('sólo true abre el bloque; false y null lo cierran igual — no es un answerOption de cinco valores', () => {
    expect(isStorageBlockOpen(true)).toBe(true);
    expect(isStorageBlockOpen(false)).toBe(false);
    expect(isStorageBlockOpen(null)).toBe(false);
    expect(isStorageBlockOpen(undefined)).toBe(false);
  });
});

describe('buildColdChainSavePayload — K (SPEC FE13d §3.5)', () => {
  const withStorageData: InvestigationColdChainFormValues = {
    storageTemperatureMonitored: true,
    storageRangeDeviation: false,
    storageProcedureFollowed: 'YES',
    storageOtherObjectPresent: null,
    storagePartiallyReconstitutedVaccine: null,
    storageVaccineNotUsable: null,
    storageDiluentNotUsable: null,
    storageKeyFindings: null,
    transportUsedThermos: null,
    transportSetInThermos: null,
    transportReturnedInThermos: null,
    transportUsedColdPack: null,
    transportTypeThermo: null,
    transportKeyFindings: null,
    notes: null,
  };

  it('bloque abierto: storageRangeDeviation:false sobrevive — es contenido, no ausencia (§1.F)', () => {
    const result = buildColdChainSavePayload(withStorageData);
    expect(result.storageRangeDeviation).toBe(false);
  });

  it('bloque cerrado (false): storageRangeDeviation se limpia a null explícito', () => {
    const result = buildColdChainSavePayload({
      ...withStorageData,
      storageTemperatureMonitored: false,
    });
    expect(result.storageRangeDeviation).toBeNull();
  });

  it('bloque cerrado (null): storageRangeDeviation se limpia igual que con false', () => {
    const result = buildColdChainSavePayload({
      ...withStorageData,
      storageTemperatureMonitored: null,
    });
    expect(result.storageRangeDeviation).toBeNull();
  });

  it('las seis columnas storage* fuera del bloque no se tocan al cerrarlo', () => {
    const result = buildColdChainSavePayload({
      ...withStorageData,
      storageTemperatureMonitored: false,
    });
    expect(result.storageProcedureFollowed).toBe('YES');
  });
});

describe('areTransportContainersExclusive — K (SPEC FE13d §3.5, tres reglas)', () => {
  it('los dos en YES es el único conflicto', () => {
    expect(areTransportContainersExclusive('YES', 'YES')).toBe(false);
  });

  it('un solo YES no es conflicto', () => {
    expect(areTransportContainersExclusive('YES', 'NO')).toBe(true);
    expect(areTransportContainersExclusive('NO', 'YES')).toBe(true);
  });

  it('NO, UNKNOWN y null en cualquier combinación no arrastran nada', () => {
    expect(areTransportContainersExclusive('NO', 'NO')).toBe(true);
    expect(areTransportContainersExclusive('UNKNOWN', 'UNKNOWN')).toBe(true);
    expect(areTransportContainersExclusive(null, null)).toBe(true);
    expect(areTransportContainersExclusive(undefined, undefined)).toBe(true);
  });
});

describe('investigationColdChainSaveSchema — K', () => {
  it('un objeto vacío valida — ningún campo es obligatorio (§2, la ficha nace vacía)', () => {
    expect(investigationColdChainSaveSchema.safeParse({}).success).toBe(true);
  });

  it('storageTemperatureMonitored y storageRangeDeviation aceptan boolean, nunca AnswerOption', () => {
    const result = investigationColdChainSaveSchema.safeParse({
      storageTemperatureMonitored: true,
      storageRangeDeviation: false,
    });
    expect(result.success).toBe(true);
    // En runtime, 'YES' (la trampa de AnswerOption) no pasa la forma boolean de la columna
    // (SPEC FE13d §1.D) — el mismo 400 que el validador del backend produciría.
    const wrongType = investigationColdChainSaveSchema.safeParse({
      storageTemperatureMonitored: 'YES',
    });
    expect(wrongType.success).toBe(false);
  });

  it('storageRangeDeviation:false con la compuerta en true valida — no se confunde con ausencia', () => {
    const result = investigationColdChainSaveSchema.safeParse({
      storageTemperatureMonitored: true,
      storageRangeDeviation: false,
    });
    expect(result.success).toBe(true);
  });

  it('los dos contenedores en YES no es un estado alcanzable desde el schema', () => {
    const result = investigationColdChainSaveSchema.safeParse({
      transportUsedThermos: 'YES',
      transportUsedColdPack: 'YES',
    });
    expect(result.success).toBe(false);
  });

  it('un solo contenedor en YES sí es alcanzable', () => {
    const result = investigationColdChainSaveSchema.safeParse({
      transportUsedThermos: 'YES',
      transportUsedColdPack: 'NO',
    });
    expect(result.success).toBe(true);
  });

  it('transportTypeThermo rechaza más de 250 caracteres', () => {
    const result = investigationColdChainSaveSchema.safeParse({
      transportTypeThermo: 'x'.repeat(251),
    });
    expect(result.success).toBe(false);
  });

  it('transportTypeThermo acepta exactamente 250 caracteres', () => {
    const result = investigationColdChainSaveSchema.safeParse({
      transportTypeThermo: 'x'.repeat(250),
    });
    expect(result.success).toBe(true);
  });
});

describe('isSyringeBlockOpen — L (SPEC FE13e §1.A, la única compuerta invertida)', () => {
  it('sólo NO abre el bloque; YES, UNKNOWN, NOT_APPLICABLE, NO_ANSWER y null lo cierran igual', () => {
    expect(isSyringeBlockOpen('NO')).toBe(true);
    expect(isSyringeBlockOpen('YES')).toBe(false);
    expect(isSyringeBlockOpen('UNKNOWN')).toBe(false);
    expect(isSyringeBlockOpen('NOT_APPLICABLE')).toBe(false);
    expect(isSyringeBlockOpen('NO_ANSWER')).toBe(false);
    expect(isSyringeBlockOpen(null)).toBe(false);
    expect(isSyringeBlockOpen(undefined)).toBe(false);
  });
});

describe('isSyringeTypeDeclared — L (SPEC FE13e §1.B, la regla de mínimo)', () => {
  it('los cuatro en false no satisfacen el mínimo — la misma omisión que los cuatro ausentes', () => {
    expect(
      isSyringeTypeDeclared({
        usedGlassSyringes: false,
        usedDisposableSyringes: false,
        usedRecycledDisposableSyringes: false,
        usedOtherSyringes: false,
      }),
    ).toBe(false);
  });

  it('los cuatro ausentes (undefined) tampoco satisfacen el mínimo', () => {
    expect(
      isSyringeTypeDeclared({
        usedGlassSyringes: undefined,
        usedDisposableSyringes: undefined,
        usedRecycledDisposableSyringes: undefined,
        usedOtherSyringes: undefined,
      }),
    ).toBe(false);
  });

  it('uno solo en true satisface el mínimo', () => {
    expect(
      isSyringeTypeDeclared({
        usedGlassSyringes: true,
        usedDisposableSyringes: false,
        usedRecycledDisposableSyringes: null,
        usedOtherSyringes: undefined,
      }),
    ).toBe(true);
  });
});

describe('buildAdministrationErrorSavePayload — L (SPEC FE13e §1.D, §3.5 A)', () => {
  const withSyringeData: InvestigationAdministrationErrorFormValues = {
    usedAutoDisableSyringes: 'NO',
    usedGlassSyringes: true,
    usedDisposableSyringes: false,
    usedRecycledDisposableSyringes: null,
    usedOtherSyringes: true,
    otherSyringesDescription: 'jeringa retráctil',
    syringesKeyFindings: 'hallazgo',
    reconstitutionUsedSameSyringe: null,
    reconstitutionUsedSameSyringeDifferentVaccine: null,
    reconstitutionUsedDifferentSyringeSameVial: null,
    reconstitutionUsedDifferentSyringeDifferentVaccine: null,
    reconstitutionFollowedManufacturerRecommendation: null,
    reconstitutionKeyFindings: null,
    hadPrescriptionError: null,
    prescriptionErrorNotes: null,
    hadContaminatedVaccine: null,
    contaminatedVaccineNotes: null,
    hadAbnormalVaccineConditions: null,
    abnormalConditionsNotes: null,
    hadPreparationError: null,
    preparationErrorNotes: null,
    hadHandlingError: null,
    handlingErrorNotes: null,
    hadImproperAdministration: null,
    improperAdministrationNotes: null,
    notes: null,
  };

  it('bloque cerrado: la bandera y los cinco campos limpios viajan en la misma petición', () => {
    const result = buildAdministrationErrorSavePayload({
      ...withSyringeData,
      usedAutoDisableSyringes: 'YES',
    });
    expect(result.usedAutoDisableSyringes).toBe('YES');
    expect(result.usedGlassSyringes).toBeNull();
    expect(result.usedDisposableSyringes).toBeNull();
    expect(result.usedRecycledDisposableSyringes).toBeNull();
    expect(result.usedOtherSyringes).toBeNull();
    expect(result.otherSyringesDescription).toBeNull();
  });

  it('syringesKeyFindings, fuera del bloque, no se toca al cerrarlo', () => {
    const result = buildAdministrationErrorSavePayload({
      ...withSyringeData,
      usedAutoDisableSyringes: 'UNKNOWN',
    });
    expect(result.syringesKeyFindings).toBe('hallazgo');
  });

  it('bloque abierto con usedOtherSyringes:true conserva la descripción', () => {
    const result = buildAdministrationErrorSavePayload(withSyringeData);
    expect(result.otherSyringesDescription).toBe('jeringa retráctil');
  });

  it('bloque abierto con usedOtherSyringes en false limpia sólo la descripción, no los otros tres', () => {
    const result = buildAdministrationErrorSavePayload({
      ...withSyringeData,
      usedOtherSyringes: false,
    });
    expect(result.otherSyringesDescription).toBeNull();
    expect(result.usedGlassSyringes).toBe(true);
  });
});

describe('investigationAdministrationErrorSaveSchema — L', () => {
  it('un objeto vacío valida — ningún campo es obligatorio (§2, la ficha nace vacía)', () => {
    expect(investigationAdministrationErrorSaveSchema.safeParse({}).success).toBe(true);
  });

  it('los cuatro tipos aceptan boolean, nunca AnswerOption', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      usedAutoDisableSyringes: 'NO',
      usedGlassSyringes: true,
    });
    expect(result.success).toBe(true);
    const wrongType = investigationAdministrationErrorSaveSchema.safeParse({
      usedGlassSyringes: 'YES',
    });
    expect(wrongType.success).toBe(false);
  });

  it('bloque abierto (NO) con los cuatro en false no valida — el error se ancla en los cuatro', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      usedAutoDisableSyringes: 'NO',
      usedGlassSyringes: false,
      usedDisposableSyringes: false,
      usedRecycledDisposableSyringes: false,
      usedOtherSyringes: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path[0]);
      expect(paths).toEqual(
        expect.arrayContaining([
          'usedGlassSyringes',
          'usedDisposableSyringes',
          'usedRecycledDisposableSyringes',
          'usedOtherSyringes',
        ]),
      );
    }
  });

  it('bloque abierto (NO) con los cuatro ausentes tampoco valida', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      usedAutoDisableSyringes: 'NO',
    });
    expect(result.success).toBe(false);
  });

  it('bloque abierto (NO) con un tipo en true valida', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      usedAutoDisableSyringes: 'NO',
      usedGlassSyringes: true,
    });
    expect(result.success).toBe(true);
  });

  it('bloque cerrado (YES) con los cuatro en false valida — la regla de mínimo no aplica', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      usedAutoDisableSyringes: 'YES',
      usedGlassSyringes: false,
      usedDisposableSyringes: false,
      usedRecycledDisposableSyringes: false,
      usedOtherSyringes: false,
    });
    expect(result.success).toBe(true);
  });

  it('usedOtherSyringes:true sin descripción valida — nunca se exige (§1.C, decisión 3)', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      usedAutoDisableSyringes: 'NO',
      usedOtherSyringes: true,
    });
    expect(result.success).toBe(true);
  });

  it('las cinco de reconstitución admiten YES las cinco a la vez', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      reconstitutionUsedSameSyringe: 'YES',
      reconstitutionUsedSameSyringeDifferentVaccine: 'YES',
      reconstitutionUsedDifferentSyringeSameVial: 'YES',
      reconstitutionUsedDifferentSyringeDifferentVaccine: 'YES',
      reconstitutionFollowedManufacturerRecommendation: 'YES',
    });
    expect(result.success).toBe(true);
  });

  it('un had* en NO con su *Notes escrita valida — un registro válido, no se estorba', () => {
    const result = investigationAdministrationErrorSaveSchema.safeParse({
      hadPrescriptionError: 'NO',
      prescriptionErrorNotes: 'se registró el motivo',
    });
    expect(result.success).toBe(true);
  });
});

describe('isSimilarEventBlockOpen — M (SPEC FE13e §1.E, polaridad normal)', () => {
  it('sólo YES estricto abre el bloque', () => {
    expect(isSimilarEventBlockOpen('YES')).toBe(true);
    expect(isSimilarEventBlockOpen('NO')).toBe(false);
    expect(isSimilarEventBlockOpen('UNKNOWN')).toBe(false);
    expect(isSimilarEventBlockOpen('NOT_APPLICABLE')).toBe(false);
    expect(isSimilarEventBlockOpen('NO_ANSWER')).toBe(false);
    expect(isSimilarEventBlockOpen(null)).toBe(false);
    expect(isSimilarEventBlockOpen(undefined)).toBe(false);
  });
});

describe('isSimilarEventDescriptionMet — M (SPEC FE13e §1.E, la única obligación de step 5)', () => {
  it('con el bloque cerrado, la descripción vacía no es un problema', () => {
    expect(isSimilarEventDescriptionMet('NO', null)).toBe(true);
    expect(isSimilarEventDescriptionMet(null, undefined)).toBe(true);
  });

  it('con el bloque abierto, la descripción vacía o en blanco no satisface la obligación', () => {
    expect(isSimilarEventDescriptionMet('YES', null)).toBe(false);
    expect(isSimilarEventDescriptionMet('YES', '   ')).toBe(false);
    expect(isSimilarEventDescriptionMet('YES', undefined)).toBe(false);
  });

  it('con el bloque abierto, una descripción no vacía sí la satisface', () => {
    expect(isSimilarEventDescriptionMet('YES', 'se investigaron dos casos más')).toBe(true);
  });
});

describe('buildCommunitySavePayload — M (SPEC FE13e §1.E, §3.5 D)', () => {
  const withCommunityData: InvestigationCommunityFormValues = {
    patientLatitude: -0.22985,
    patientLongitude: -78.52495,
    hadSimilarEvent: 'YES',
    similarEventDescription: 'se investigaron dos casos más',
    similarEventCount: 12,
    affectedVaccinated: 5,
    affectedUnvaccinated: 4,
    affectedUnknown: 0,
    otherComments: 'comentario',
    notes: 'nota',
  };

  it('bloque abierto: los cinco campos del bloque sobreviven tal cual', () => {
    const result = buildCommunitySavePayload(withCommunityData);
    expect(result.similarEventDescription).toBe('se investigaron dos casos más');
    expect(result.similarEventCount).toBe(12);
  });

  it('bloque cerrado: los cinco campos viajan como null explícito, en la misma petición', () => {
    const result = buildCommunitySavePayload({ ...withCommunityData, hadSimilarEvent: 'NO' });
    expect(result.similarEventDescription).toBeNull();
    expect(result.similarEventCount).toBeNull();
    expect(result.affectedVaccinated).toBeNull();
    expect(result.affectedUnvaccinated).toBeNull();
    expect(result.affectedUnknown).toBeNull();
  });

  it('las coordenadas y los dos textos libres, fuera del bloque, no se tocan al cerrarlo', () => {
    const result = buildCommunitySavePayload({ ...withCommunityData, hadSimilarEvent: 'NO' });
    expect(result.patientLatitude).toBe(-0.22985);
    expect(result.otherComments).toBe('comentario');
    expect(result.notes).toBe('nota');
  });
});

describe('investigationCommunitySaveSchema — M', () => {
  it('un objeto vacío valida — ningún campo es obligatorio (§2, la ficha nace vacía)', () => {
    expect(investigationCommunitySaveSchema.safeParse({}).success).toBe(true);
  });

  it('una latitud de 500 se rechaza — fuera de ±90', () => {
    const result = investigationCommunitySaveSchema.safeParse({ patientLatitude: 500 });
    expect(result.success).toBe(false);
  });

  it('una longitud de 200 se rechaza — fuera de ±180', () => {
    const result = investigationCommunitySaveSchema.safeParse({ patientLongitude: 200 });
    expect(result.success).toBe(false);
  });

  it('una latitud y longitud dentro de rango validan', () => {
    const result = investigationCommunitySaveSchema.safeParse({
      patientLatitude: -0.22985,
      patientLongitude: -78.52495,
    });
    expect(result.success).toBe(true);
  });

  it('bloque abierto (YES) sin descripción no valida — la única obligación de step 5', () => {
    const result = investigationCommunitySaveSchema.safeParse({ hadSimilarEvent: 'YES' });
    expect(result.success).toBe(false);
  });

  it('bloque abierto (YES) con descripción valida', () => {
    const result = investigationCommunitySaveSchema.safeParse({
      hadSimilarEvent: 'YES',
      similarEventDescription: 'se investigaron dos casos más',
    });
    expect(result.success).toBe(true);
  });

  it('bloque cerrado (NO) sin descripción valida — la obligación no aplica', () => {
    const result = investigationCommunitySaveSchema.safeParse({ hadSimilarEvent: 'NO' });
    expect(result.success).toBe(true);
  });

  it('el contador similarEventCount acepta 0 — es contenido, no ausencia', () => {
    const result = investigationCommunitySaveSchema.safeParse({ similarEventCount: 0 });
    expect(result.success).toBe(true);
  });

  it('un contador de 40000 se rechaza — el techo smallint replicado en el cliente', () => {
    const result = investigationCommunitySaveSchema.safeParse({ affectedVaccinated: 40000 });
    expect(result.success).toBe(false);
  });

  it('los cuatro contadores informados no se validan entre sí — la suma puede no coincidir', () => {
    const result = investigationCommunitySaveSchema.safeParse({
      hadSimilarEvent: 'YES',
      similarEventDescription: 'x',
      similarEventCount: 12,
      affectedVaccinated: 5,
      affectedUnvaccinated: 4,
      affectedUnknown: 0,
    });
    expect(result.success).toBe(true);
  });
});

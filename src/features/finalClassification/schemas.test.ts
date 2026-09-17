import { describe, expect, it } from 'vitest';
import type { FinalClassificationDetail } from '@/contracts/declared/finalClassification';
import {
  finalClassificationSaveSchema,
  findDuplicatedImportanceFields,
  hasVerdict,
  isUnclassifiableCoherent,
  toFormValues,
  type FinalClassificationFormValues,
} from './schemas';

const EMPTY: FinalClassificationFormValues = {
  importanceAItemId: null,
  aIsRelatedToVaccineProduct: null,
  aIsRelatedToQualityDeviation: null,
  aIsRelatedToProgrammaticError: null,
  aIsRelatedToStress: null,
  importanceBItemId: null,
  bIsConsistentTemporalRelation: null,
  bHasDeterminantFactor: null,
  importanceCItemId: null,
  cHasCoincidentCause: null,
  dIsUnclassifiable: null,
  notes: null,
};

const ITEM_1 = '11111111-1111-4111-8111-111111111111';
const ITEM_2 = '22222222-2222-4222-8222-222222222222';

describe('finalClassificationSaveSchema — ningún control bloquea el guardado por sí solo', () => {
  it('un objeto vacío pasa', () => {
    expect(finalClassificationSaveSchema.safeParse({}).success).toBe(true);
  });

  it('el estado sin tocar (los ocho <Switch> en null) pasa', () => {
    expect(finalClassificationSaveSchema.safeParse(EMPTY).success).toBe(true);
  });
});

describe('la precedencia — FINCLASS_00X_IMPORTANCE_DUPLICATED', () => {
  it('A=1, B=2, C=null valida', () => {
    const result = finalClassificationSaveSchema.safeParse({
      ...EMPTY,
      importanceAItemId: ITEM_1,
      importanceBItemId: ITEM_2,
    });
    expect(result.success).toBe(true);
  });

  it('A=1, B=1 no valida', () => {
    const result = finalClassificationSaveSchema.safeParse({
      ...EMPTY,
      importanceAItemId: ITEM_1,
      importanceBItemId: ITEM_1,
    });
    expect(result.success).toBe(false);
  });

  it('tres importancias en null validan', () => {
    expect(finalClassificationSaveSchema.safeParse(EMPTY).success).toBe(true);
  });

  it('el error de precedencia se ancla en los dos campos repetidos, no en el tercero', () => {
    const result = finalClassificationSaveSchema.safeParse({
      ...EMPTY,
      importanceAItemId: ITEM_1,
      importanceBItemId: ITEM_1,
      importanceCItemId: ITEM_2,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path[0]);
      expect(paths).toContain('importanceAItemId');
      expect(paths).toContain('importanceBItemId');
      expect(paths).not.toContain('importanceCItemId');
    }
  });
});

describe('findDuplicatedImportanceFields', () => {
  it('sin duplicados devuelve un arreglo vacío', () => {
    expect(
      findDuplicatedImportanceFields({
        importanceAItemId: ITEM_1,
        importanceBItemId: ITEM_2,
        importanceCItemId: null,
      }),
    ).toEqual([]);
  });

  it('con dos repetidos devuelve sólo esos dos', () => {
    expect(
      findDuplicatedImportanceFields({
        importanceAItemId: ITEM_1,
        importanceBItemId: ITEM_1,
        importanceCItemId: null,
      }),
    ).toEqual(['importanceAItemId', 'importanceBItemId']);
  });
});

describe('el bloque D — FINCLASS_00X_UNCLASSIFIABLE_FIELDS_NOT_ALLOWED', () => {
  it('D en true con un false en A no valida', () => {
    const result = finalClassificationSaveSchema.safeParse({
      ...EMPTY,
      dIsUnclassifiable: true,
      aIsRelatedToVaccineProduct: false,
    });
    expect(result.success).toBe(false);
  });

  it('D en true con los diez en null valida', () => {
    const result = finalClassificationSaveSchema.safeParse({
      ...EMPTY,
      dIsUnclassifiable: true,
    });
    expect(result.success).toBe(true);
  });

  it('D en true con una importancia informada no valida', () => {
    const result = finalClassificationSaveSchema.safeParse({
      ...EMPTY,
      dIsUnclassifiable: true,
      importanceAItemId: ITEM_1,
    });
    expect(result.success).toBe(false);
  });

  it('el error de D se ancla en dIsUnclassifiable', () => {
    const result = finalClassificationSaveSchema.safeParse({
      ...EMPTY,
      dIsUnclassifiable: true,
      cHasCoincidentCause: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(['dIsUnclassifiable']);
    }
  });
});

describe('isUnclassifiableCoherent', () => {
  it('con D en false o null, cualquier estado de los diez es coherente', () => {
    expect(
      isUnclassifiableCoherent({ ...EMPTY, dIsUnclassifiable: false, cHasCoincidentCause: true }),
    ).toBe(true);
    expect(
      isUnclassifiableCoherent({ ...EMPTY, dIsUnclassifiable: null, cHasCoincidentCause: true }),
    ).toBe(true);
  });
});

describe('hasVerdict — "Completar etapa" exige un veredicto', () => {
  it('con todo en null es false', () => {
    expect(hasVerdict(EMPTY)).toBe(false);
  });

  it('con todo en false es false', () => {
    expect(
      hasVerdict({
        ...EMPTY,
        aIsRelatedToVaccineProduct: false,
        aIsRelatedToQualityDeviation: false,
        aIsRelatedToProgrammaticError: false,
        aIsRelatedToStress: false,
        bIsConsistentTemporalRelation: false,
        bHasDeterminantFactor: false,
        cHasCoincidentCause: false,
      }),
    ).toBe(false);
  });

  it('con D en true es true', () => {
    expect(hasVerdict({ ...EMPTY, dIsUnclassifiable: true })).toBe(true);
  });

  it('con un solo true entre A, B o C es true', () => {
    expect(hasVerdict({ ...EMPTY, cHasCoincidentCause: true })).toBe(true);
  });

  it('las importancias solas no cuentan como veredicto', () => {
    expect(hasVerdict({ ...EMPTY, importanceAItemId: ITEM_1 } as never)).toBe(false);
  });
});

describe('toFormValues', () => {
  const detail: FinalClassificationDetail = {
    finalClassificationId: 'fc-1',
    case: { caseId: 'case-1', caseCode: 'C-1', isActive: true },
    importanceA: { catalogItemId: ITEM_1, code: 'A', name: 'Importancia A', value: '1' },
    importanceB: null,
    importanceC: null,
    aIsRelatedToVaccineProduct: true,
    aIsRelatedToQualityDeviation: null,
    aIsRelatedToProgrammaticError: null,
    aIsRelatedToStress: null,
    bIsConsistentTemporalRelation: null,
    bHasDeterminantFactor: null,
    cHasCoincidentCause: null,
    dIsUnclassifiable: null,
    notes: 'nota',
    isActive: true,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
  };

  it('deriva importanceAItemId del objeto resuelto, nunca devuelve el objeto', () => {
    const values = toFormValues(detail);
    expect(values.importanceAItemId).toBe(ITEM_1);
    expect(values).not.toHaveProperty('importanceA');
    for (const value of Object.values(values)) {
      expect(typeof value === 'object' && value !== null).toBe(false);
    }
  });

  it('una importancia null se mapea a null, no a undefined', () => {
    const values = toFormValues(detail);
    expect(values.importanceBItemId).toBeNull();
    expect(values.importanceCItemId).toBeNull();
  });

  it('copia los ocho booleanos y notes tal cual', () => {
    const values = toFormValues(detail);
    expect(values.aIsRelatedToVaccineProduct).toBe(true);
    expect(values.notes).toBe('nota');
  });
});

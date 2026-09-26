import { describe, expect, it } from 'vitest';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import {
  createVaccineWhodrugSchema,
  EXTERNAL_ID_MAX,
  IMPORT_DEFAULT_VALUES,
  importVaccineWhodrugsSchema,
  MAX_VACCINE_WHODRUG_IMPORT_FILE_SIZE_BYTES,
  toVaccineWhodrugFormValues,
  toVaccineWhodrugPayload,
  VACCINE_WHODRUG_DEFAULT_VALUES,
  VACCINE_WHODRUG_OPTIONAL_TEXT_FIELDS,
  vaccineWhodrugErrorFieldMap,
  vaccineWhodrugImportErrorFieldMap,
  vaccineWhodrugImportFileSchema,
  type VaccineWhodrugFormValues,
} from './schemas';

const validValues: VaccineWhodrugFormValues = {
  ...VACCINE_WHODRUG_DEFAULT_VALUES,
  drugCode: '000001 01 001',
  drugName: 'BCG Vaccine',
};

function parse(overrides: Partial<VaccineWhodrugFormValues>) {
  return createVaccineWhodrugSchema.safeParse({ ...validValues, ...overrides });
}

function buildDetail(overrides: Partial<VaccineWhodrugDetail> = {}): VaccineWhodrugDetail {
  return {
    vaccineWhodrugId: 'b3f1c2d4-0000-4000-8000-000000000001',
    externalId: 1001,
    drugCode: '000001 01 001',
    drugRecNo: '000001',
    drugRecNoSeq: '01',
    drugName: 'BCG Vaccine',
    language: 'es',
    medicinalProductId: null,
    atcs: 'J07AN01',
    icd11: null,
    icd11Term: null,
    abbreviation: 'BCG',
    ingredient: null,
    ingredientTranslation: 'Mycobacterium bovis',
    languageCode: null,
    iso3Code: 'ECU',
    countryMedicinalProductId: null,
    maHolders: 'Serum Institute',
    maHoldersMedicinalProductId: null,
    form: null,
    formTranslations: 'Polvo',
    formMedicinalProductId: null,
    strength: '0.05 mg',
    strengthMedicinalProductId: null,
    noDose: null,
    diluent: null,
    isGeneric: false,
    isPreferred: true,
    notes: null,
    metadata: {},
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

describe('createVaccineWhodrugSchema (SPEC FE25c §3.5)', () => {
  it('acepta los valores por defecto con drugCode y drugName', () => {
    expect(parse({}).success).toBe(true);
  });

  it('rechaza drugCode de 251 caracteres y acepta 250', () => {
    expect(parse({ drugCode: 'A'.repeat(251) }).success).toBe(false);
    expect(parse({ drugCode: 'A'.repeat(250) }).success).toBe(true);
  });

  it('rechaza drugName vacío y con solo espacios', () => {
    expect(parse({ drugName: '' }).success).toBe(false);
    expect(parse({ drugName: '   ' }).success).toBe(false);
  });

  it('acepta drugName largo: la columna es text', () => {
    expect(parse({ drugName: 'a'.repeat(2000) }).success).toBe(true);
  });

  it('rechaza externalId: 1.5 y por encima del techo de integer; acepta null', () => {
    expect(parse({ externalId: 1.5 }).success).toBe(false);
    expect(parse({ externalId: EXTERNAL_ID_MAX + 1 }).success).toBe(false);
    expect(parse({ externalId: EXTERNAL_ID_MAX }).success).toBe(true);
    expect(parse({ externalId: null }).success).toBe(true);
  });

  it('aplica los límites del validador a los opcionales', () => {
    expect(parse({ drugRecNo: 'a'.repeat(51) }).success).toBe(false);
    expect(parse({ language: 'a'.repeat(11) }).success).toBe(false);
    expect(parse({ languageCode: 'a'.repeat(101) }).success).toBe(false);
    expect(parse({ icd11Term: 'a'.repeat(501) }).success).toBe(false);
    expect(parse({ icd11Term: 'a'.repeat(500) }).success).toBe(true);
    expect(parse({ iso3Code: 'a'.repeat(251) }).success).toBe(false);
    expect(parse({ maHolders: 'a'.repeat(5000) }).success).toBe(true);
  });

  it('recorta los espacios de drugCode sin normalizarlo', () => {
    const result = parse({ drugCode: '  bcg 01  ' });
    expect(result.success && result.data.drugCode).toBe('bcg 01');
  });
});

describe('toVaccineWhodrugPayload (SPEC FE25c §3.5)', () => {
  it('lleva los 28 campos y ninguno más', () => {
    const payload = toVaccineWhodrugPayload(validValues);

    expect(Object.keys(payload)).toHaveLength(28);
    expect(payload).not.toHaveProperty('isActive');
  });

  it('convierte en null los opcionales vacíos', () => {
    const payload = toVaccineWhodrugPayload(validValues);

    for (const field of VACCINE_WHODRUG_OPTIONAL_TEXT_FIELDS) {
      expect(payload[field]).toBeNull();
    }
    expect(payload.externalId).toBeNull();
  });

  it("convierte isGeneric: 'unknown' en null, y 'true'/'false' en booleano", () => {
    expect(toVaccineWhodrugPayload({ ...validValues, isGeneric: 'unknown' }).isGeneric).toBeNull();
    expect(toVaccineWhodrugPayload({ ...validValues, isGeneric: 'true' }).isGeneric).toBe(true);
    expect(toVaccineWhodrugPayload({ ...validValues, isGeneric: 'false' }).isGeneric).toBe(false);
  });

  it('isPreferred nunca sale null', () => {
    expect(toVaccineWhodrugPayload({ ...validValues, isPreferred: false }).isPreferred).toBe(false);
    expect(toVaccineWhodrugPayload({ ...validValues, isPreferred: true }).isPreferred).toBe(true);
  });

  it('conserva los valores rellenos', () => {
    const payload = toVaccineWhodrugPayload({ ...validValues, iso3Code: 'ECU', externalId: 7 });

    expect(payload.iso3Code).toBe('ECU');
    expect(payload.externalId).toBe(7);
  });
});

describe('toVaccineWhodrugFormValues', () => {
  it('lleva los null a cadena vacía y isGeneric a su opción', () => {
    const values = toVaccineWhodrugFormValues(buildDetail({ isGeneric: null, drugCode: null }));

    expect(values.drugCode).toBe('');
    expect(values.medicinalProductId).toBe('');
    expect(values.isGeneric).toBe('unknown');
    expect(values.externalId).toBe(1001);
  });

  it('ida y vuelta: una fila sin tocar produce el mismo contenido', () => {
    const detail = buildDetail();
    const payload = toVaccineWhodrugPayload(toVaccineWhodrugFormValues(detail));

    for (const [field, value] of Object.entries(payload)) {
      expect(detail[field as keyof VaccineWhodrugDetail]).toEqual(value);
    }
  });
});

describe('importVaccineWhodrugsSchema', () => {
  it('acepta dictionaryVersion vacío y rechaza más de 100 caracteres', () => {
    expect(importVaccineWhodrugsSchema.safeParse(IMPORT_DEFAULT_VALUES).success).toBe(true);
    expect(
      importVaccineWhodrugsSchema.safeParse({ dictionaryVersion: 'a'.repeat(101) }).success,
    ).toBe(false);
  });
});

describe('vaccineWhodrugImportFileSchema', () => {
  function fileOfSize(bytes: number): File {
    const file = new File(['PK'], 'whodrug.xlsx');
    Object.defineProperty(file, 'size', { value: bytes });
    return file;
  }

  it('rechaza un .xlsx de 21 MB con el código del 413', () => {
    const result = vaccineWhodrugImportFileSchema.safeParse(fileOfSize(21 * 1024 * 1024));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('WHODRUG_007_FILE_TOO_LARGE');
  });

  it('acepta exactamente 20 MB', () => {
    expect(
      vaccineWhodrugImportFileSchema.safeParse(fileOfSize(MAX_VACCINE_WHODRUG_IMPORT_FILE_SIZE_BYTES))
        .success,
    ).toBe(true);
  });

  it('sin fichero devuelve el código de fichero obligatorio', () => {
    const result = vaccineWhodrugImportFileSchema.safeParse(null);

    expect(result.error?.issues[0]?.message).toBe('WHODRUG_007_FILE_REQUIRED');
  });
});

describe('mapas de errores', () => {
  it('los dos EXTERNAL_ID_EXISTS van a externalId', () => {
    expect(vaccineWhodrugErrorFieldMap.WHODRUG_001_EXTERNAL_ID_EXISTS).toBe('externalId');
    expect(vaccineWhodrugErrorFieldMap.WHODRUG_004_EXTERNAL_ID_EXISTS).toBe('externalId');
    expect(vaccineWhodrugErrorFieldMap.WHODRUG_004_NOT_FOUND).toBeUndefined();
  });

  it('los errores de fichero del 007 van a file, IMPORT_FAILED no', () => {
    expect(vaccineWhodrugImportErrorFieldMap.WHODRUG_007_FILE_INVALID).toBe('file');
    expect(vaccineWhodrugImportErrorFieldMap.WHODRUG_007_FILE_TOO_LARGE).toBe('file');
    expect(vaccineWhodrugImportErrorFieldMap.WHODRUG_007_IMPORT_FAILED).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  createDiagnosticTermSchema,
  diagnosticTermErrorFieldMap,
  diagnosticTermImportErrorFieldMap,
  diagnosticTermImportFileSchema,
  importDiagnosticTermsSchema,
  IMPORT_DEFAULT_VALUES,
  toDiagnosticTermPayload,
  updateDiagnosticTermSchema,
} from './schemas';

const validCreate = { source: 'LOCAL' as const, code: '10016558', name: 'Fiebre', termGroup: '' };
const validUpdate = { ...validCreate, reviewStatus: '' as const };

describe('createDiagnosticTermSchema', () => {
  it('acepta un término con termGroup vacío', () => {
    expect(createDiagnosticTermSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rechaza code vacío y con solo espacios', () => {
    expect(createDiagnosticTermSchema.safeParse({ ...validCreate, code: '' }).success).toBe(false);
    expect(createDiagnosticTermSchema.safeParse({ ...validCreate, code: '   ' }).success).toBe(
      false,
    );
  });

  it('rechaza code de 101 caracteres y acepta 100', () => {
    expect(
      createDiagnosticTermSchema.safeParse({ ...validCreate, code: 'A'.repeat(101) }).success,
    ).toBe(false);
    expect(
      createDiagnosticTermSchema.safeParse({ ...validCreate, code: 'A'.repeat(100) }).success,
    ).toBe(true);
  });

  it('rechaza name de 501 caracteres y acepta 500', () => {
    expect(
      createDiagnosticTermSchema.safeParse({ ...validCreate, name: 'a'.repeat(501) }).success,
    ).toBe(false);
    expect(
      createDiagnosticTermSchema.safeParse({ ...validCreate, name: 'a'.repeat(500) }).success,
    ).toBe(true);
  });

  it('rechaza termGroup de 251 caracteres', () => {
    expect(
      createDiagnosticTermSchema.safeParse({ ...validCreate, termGroup: 'a'.repeat(251) }).success,
    ).toBe(false);
  });

  it('rechaza una fuente fuera de TERM_SOURCES', () => {
    expect(createDiagnosticTermSchema.safeParse({ ...validCreate, source: 'ICD10' }).success).toBe(
      false,
    );
  });
});

describe('updateDiagnosticTermSchema', () => {
  it('acepta reviewStatus sin marcar, PENDING y APPROVED', () => {
    for (const reviewStatus of ['', 'PENDING', 'APPROVED']) {
      expect(updateDiagnosticTermSchema.safeParse({ ...validUpdate, reviewStatus }).success).toBe(
        true,
      );
    }
  });

  it('rechaza un reviewStatus desconocido', () => {
    expect(
      updateDiagnosticTermSchema.safeParse({ ...validUpdate, reviewStatus: 'REJECTED' }).success,
    ).toBe(false);
  });
});

describe('toDiagnosticTermPayload', () => {
  it('al crear envía source y omite termGroup vacío', () => {
    expect(
      toDiagnosticTermPayload(createDiagnosticTermSchema.parse(validCreate), 'create'),
    ).toEqual({
      source: 'LOCAL',
      code: '10016558',
      name: 'Fiebre',
    });
  });

  it('al editar no envía source y convierte termGroup vacío en null', () => {
    const payload = toDiagnosticTermPayload(
      updateDiagnosticTermSchema.parse({ ...validUpdate, source: 'MEDDRA' }),
      'update',
    );

    expect(payload).not.toHaveProperty('source');
    expect(payload).toEqual({ code: '10016558', name: 'Fiebre', termGroup: null });
  });

  it('al editar, un reviewStatus sin marcar no aparece en el payload', () => {
    const payload = toDiagnosticTermPayload(
      updateDiagnosticTermSchema.parse(validUpdate),
      'update',
    );

    expect(payload).not.toHaveProperty('reviewStatus');
  });

  it('al editar, un reviewStatus marcado sí viaja', () => {
    const payload = toDiagnosticTermPayload(
      updateDiagnosticTermSchema.parse({
        ...validUpdate,
        reviewStatus: 'APPROVED',
        termGroup: 'LLT',
      }),
      'update',
    );

    expect(payload).toEqual({
      code: '10016558',
      name: 'Fiebre',
      termGroup: 'LLT',
      reviewStatus: 'APPROVED',
    });
  });
});

describe('diagnosticTermErrorFieldMap', () => {
  it('lleva los dos CODE_EXISTS al campo code', () => {
    expect(diagnosticTermErrorFieldMap.DIAGTERM_001_CODE_EXISTS).toBe('code');
    expect(diagnosticTermErrorFieldMap.DIAGTERM_004_CODE_EXISTS).toBe('code');
  });

  it('no lleva los NOT_FOUND a ningún campo', () => {
    expect(diagnosticTermErrorFieldMap.DIAGTERM_004_NOT_FOUND).toBeUndefined();
  });
});

describe('importDiagnosticTermsSchema', () => {
  it('acepta los valores por defecto', () => {
    expect(importDiagnosticTermsSchema.safeParse(IMPORT_DEFAULT_VALUES).success).toBe(true);
  });

  it('rechaza dictionaryVersion de 51 caracteres', () => {
    expect(
      importDiagnosticTermsSchema.safeParse({
        ...IMPORT_DEFAULT_VALUES,
        dictionaryVersion: '9'.repeat(51),
      }).success,
    ).toBe(false);
  });

  it('rechaza una codificación distinta de utf8 y latin1', () => {
    expect(
      importDiagnosticTermsSchema.safeParse({ ...IMPORT_DEFAULT_VALUES, encoding: 'utf16' })
        .success,
    ).toBe(false);
  });
});

describe('diagnosticTermImportFileSchema', () => {
  function fileOfSize(bytes: number): File {
    const file = new File(['x'], 'llt.asc');
    Object.defineProperty(file, 'size', { value: bytes });
    return file;
  }

  it('rechaza un fichero de 21 MB con el code del 413', () => {
    const result = diagnosticTermImportFileSchema.safeParse(fileOfSize(21 * 1024 * 1024));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('DIAGTERM_007_FILE_TOO_LARGE');
  });

  it('acepta un fichero de 20 MB exactos', () => {
    expect(diagnosticTermImportFileSchema.safeParse(fileOfSize(20 * 1024 * 1024)).success).toBe(
      true,
    );
  });

  it('sin fichero devuelve FILE_REQUIRED', () => {
    const result = diagnosticTermImportFileSchema.safeParse(null);

    expect(result.error?.issues[0]?.message).toBe('DIAGTERM_007_FILE_REQUIRED');
  });
});

describe('diagnosticTermImportErrorFieldMap', () => {
  it('lleva los tres errores de fichero al campo file y deja IMPORT_FAILED fuera', () => {
    expect(diagnosticTermImportErrorFieldMap.DIAGTERM_007_FILE_REQUIRED).toBe('file');
    expect(diagnosticTermImportErrorFieldMap.DIAGTERM_007_FILE_TOO_LARGE).toBe('file');
    expect(diagnosticTermImportErrorFieldMap.DIAGTERM_007_FILE_INVALID).toBe('file');
    expect(diagnosticTermImportErrorFieldMap.DIAGTERM_007_IMPORT_FAILED).toBeUndefined();
  });
});

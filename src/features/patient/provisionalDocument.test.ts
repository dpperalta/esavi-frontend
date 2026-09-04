import { describe, expect, it, vi } from 'vitest';
import {
  createWithProvisionalDocumentRetry,
  generateProvisionalDocument,
  isProvisionalDocumentNumber,
} from './provisionalDocument';

describe('generateProvisionalDocument', () => {
  it('mil identificadores generados no contienen I, L, O ni U en su sufijo aleatorio', () => {
    for (let i = 0; i < 1000; i++) {
      const documentNumber = generateProvisionalDocument();
      const suffix = documentNumber.split('-')[2];
      expect(suffix).not.toMatch(/[ILOU]/);
    }
  });

  it('tiene el formato PROV-YYYYMMDD-XXXX', () => {
    const documentNumber = generateProvisionalDocument(new Date('2026-03-05T12:00:00Z'));
    expect(documentNumber).toMatch(/^PROV-20260305-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('el formato sobrevive a trim().toUpperCase() sin cambiar', () => {
    const documentNumber = generateProvisionalDocument();
    expect(documentNumber.trim().toUpperCase()).toBe(documentNumber);
  });

  it('isProvisionalDocumentNumber reconoce un PROV- generado y rechaza un documento normal', () => {
    const documentNumber = generateProvisionalDocument();
    expect(isProvisionalDocumentNumber(documentNumber)).toBe(true);
    expect(isProvisionalDocumentNumber('1712345678')).toBe(false);
  });
});

describe('createWithProvisionalDocumentRetry', () => {
  it('el primer intento reutiliza exactamente el initialDocumentNumber', async () => {
    const initial = generateProvisionalDocument();
    const submit = vi.fn(async (documentNumber: string) => documentNumber);

    const result = await createWithProvisionalDocumentRetry(submit, () => true, {
      initialDocumentNumber: initial,
    });

    expect(result).toBe(initial);
    expect(submit).toHaveBeenCalledWith(initial);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('un 409 sobre el PROV- regenera el identificador y reintenta hasta que uno funciona', async () => {
    const initial = generateProvisionalDocument();
    const attempted: string[] = [];
    const submit = vi.fn(async (documentNumber: string) => {
      attempted.push(documentNumber);
      if (attempted.length < 2) {
        throw new Error('collision');
      }
      return documentNumber;
    });

    const result = await createWithProvisionalDocumentRetry(submit, () => true, {
      initialDocumentNumber: initial,
    });

    expect(attempted[0]).toBe(initial);
    expect(result).toBe(attempted[1]);
    expect(result).not.toBe(initial);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(new Set(attempted).size).toBe(2);
  });

  it('la función de reintento se agota a las tres', async () => {
    const submit = vi.fn(async () => {
      throw new Error('collision');
    });

    await expect(
      createWithProvisionalDocumentRetry(submit, () => true, {
        initialDocumentNumber: generateProvisionalDocument(),
      }),
    ).rejects.toThrow('collision');
    expect(submit).toHaveBeenCalledTimes(3);
  });

  it('un error que no es colisión se propaga sin reintentar', async () => {
    const submit = vi.fn(async () => {
      throw new Error('other error');
    });

    await expect(
      createWithProvisionalDocumentRetry(submit, () => false, {
        initialDocumentNumber: generateProvisionalDocument(),
      }),
    ).rejects.toThrow('other error');
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

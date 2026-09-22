import { describe, expect, it, vi } from 'vitest';
import { createAppQueryClient, isCaseClosedError } from './queryClient';
import { EsaviApiError } from './types';

describe('isCaseClosedError', () => {
  it.each(['NOTIFEVT_004_CASE_CLOSED', 'CASEFLOW_012_CASE_CLOSED', 'INVDIAG_005A_CASE_CLOSED'])(
    'reconoce %s',
    (code) => {
      expect(isCaseClosedError(new EsaviApiError('cerrado', 409, code))).toBe(true);
    },
  );

  it.each(['CASE_CLOSED_X', 'UNKNOWN_ERROR', 'INVDIAG_005A_NOT_FOUND'])('no reconoce %s', (code) => {
    expect(isCaseClosedError(new EsaviApiError('otro', 409, code))).toBe(false);
  });

  it('no reconoce un error que no es EsaviApiError ni un valor vacío', () => {
    expect(isCaseClosedError(Object.assign(new Error('x'), { code: 'CASE_004_CASE_CLOSED' }))).toBe(false);
    expect(isCaseClosedError(new Error('x'))).toBe(false);
    expect(isCaseClosedError(undefined)).toBe(false);
  });
});

describe('createAppQueryClient', () => {
  async function failMutationWith(code: string) {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(['caseWorkflow', 'byCase', 'c1'], { status: { code: 'OPEN' } });
    queryClient.setQueryData(['caseWorkflow', 'list', {}], { count: 0, rows: [] });
    queryClient.setQueryData(['investigationDiagnostic', 'list'], []);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => Promise.reject(new EsaviApiError('respuesta', 409, code)),
      })
      .execute(undefined)
      .catch(() => undefined);

    return { queryClient, invalidate };
  }

  it('un 409 *_CASE_CLOSED invalida todas las claves de caseWorkflow y nada más', async () => {
    const { queryClient, invalidate } = await failMutationWith('INVDIAG_005A_CASE_CLOSED');

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['caseWorkflow'] });
    expect(queryClient.getQueryState(['caseWorkflow', 'byCase', 'c1'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['caseWorkflow', 'list', {}])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['investigationDiagnostic', 'list'])?.isInvalidated).toBe(false);
  });

  it('cualquier otro error no invalida nada', async () => {
    const { queryClient, invalidate } = await failMutationWith('INVDIAG_005A_NOT_FOUND');

    expect(invalidate).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(['caseWorkflow', 'byCase', 'c1'])?.isInvalidated).toBe(false);
  });
});

import { MutationCache, QueryClient } from '@tanstack/react-query';
import { EsaviApiError } from './types';

const CASE_CLOSED_CODE = /_CASE_CLOSED$/;

// SPEC FE17 §3.1 — every write on a closed case's content answers 409 `<PREFIX>_<op>_CASE_CLOSED`
// (SPEC F61 of the backend, esavi-backend/references/CONVENTIONS.md §11). The suffix is the
// contract, so no code is listed one by one.
export function isCaseClosedError(error: unknown): boolean {
  return error instanceof EsaviApiError && typeof error.code === 'string' && CASE_CLOSED_CODE.test(error.code);
}

// SPEC FE17 §3.4 — the handler owns state only: it refetches ESAVI-CASEFLOW-006 so `CLOSED` is
// read from its single source. The toast stays in each mutation's own `catch`; showing it here too
// would duplicate it. The whole `caseWorkflow` root is invalidated because this handler doesn't
// know the case id — only mounted queries actually refetch.
export function createAppQueryClient(): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isCaseClosedError(error)) {
          void queryClient.invalidateQueries({ queryKey: ['caseWorkflow'] });
        }
      },
    }),
  });
  return queryClient;
}

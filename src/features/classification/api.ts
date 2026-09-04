import { useQuery } from '@tanstack/react-query';
import type { CreateClassificationInput } from '@/contracts/classification';
import type { ClassificationDetail } from '@/contracts/declared/classification';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';

// POST   /api/classifications          ESAVI-CLASSIF-001  USER   create (+ advances CLASSIFICATION)
// GET    /api/classifications          ESAVI-CLASSIF-002A USER   active listing — unused, no classification screen (SPEC FE11 §2)
// GET    /api/classifications/admin    ESAVI-CLASSIF-002B ADMIN  incl. inactive — unused, same reason
// GET    /api/classifications/case/:id ESAVI-CLASSIF-006  USER   detail by case, in reentry — hand-written below
// GET    /api/classifications/:id      ESAVI-CLASSIF-003  USER   detail by own PK — unused, `006` covers reentry (SPEC FE11 §3.2)
// PUT    /api/classifications/:id      ESAVI-CLASSIF-004  USER   edit from the wizard
// DELETE /api/classifications/:id      ESAVI-CLASSIF-005A ADMIN  deactivate — out of scope, classification is mandatory case data (SPEC FE11 §2)
// PATCH  /api/classifications/activate/:id ESAVI-CLASSIF-005B SUPERADMIN — out of scope, same reason
// DELETE /api/classifications/purge/:id    ESAVI-CLASSIF-005C SUPERADMIN — out of scope, same reason
export const classificationResource = createResource<
  ClassificationDetail,
  CreateClassificationInput,
  Partial<CreateClassificationInput>
>({
  key: 'classification',
  path: 'classifications',
  idField: 'classificationId',
  inactiveMode: 'adminPath',
  // Required by `assertConfig` with `inactiveMode: 'adminPath'`, even though `useList` is never
  // called (no classification listing screen — SPEC FE11 §2). Same case as `patientResource`.
  adminPath: 'classifications/admin',
});

function classificationByCaseKey(caseId: string) {
  return ['classification', 'byCase', caseId] as const;
}

// ESAVI-CLASSIF-006 — read by caseId, not by the row's own PK. `createResource` has no notion of
// a read scoped by a foreign key that isn't the resource's own parent listing (SPEC FE11 §3.1,
// same reasoning as `useCaseWorkflow` in features/caseWorkflow/api.ts) — hand-written.
export function useClassificationByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: classificationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<ClassificationDetail>(`classifications/case/${caseId}`);
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
    // No `staleTime` (SPEC FE11 §3.4): all remote data of the wizard invalidates after each
    // mutation, and the fresh row from `001`/`004` is what the compuerta derives on reentry.
  });
}

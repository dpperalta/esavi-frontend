import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateFinalClassificationInput } from '@/contracts/finalClassification';
import type { FinalClassificationDetail } from '@/contracts/declared/finalClassification';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';

// POST   /api/final-classifications            ESAVI-FINCLASS-001  USER  create; advances FINAL_CLASSIFICATION in its own transaction — `useCreateFinalClassification` below, not the factory's `useCreate` (SPEC FE14a §1B)
// GET    /api/final-classifications            ESAVI-FINCLASS-002A USER  active listing — unused, the wizard enters by case (SPEC FE14a §2)
// GET    /api/final-classifications/admin      ESAVI-FINCLASS-002B ADMIN incl. inactive — unused, same reason
// GET    /api/final-classifications/case/:id   ESAVI-FINCLASS-006  USER  detail by case, in reentry — hand-written below
// GET    /api/final-classifications/:id        ESAVI-FINCLASS-003  USER  detail by own PK — unused, `006` covers reentry
// PUT    /api/final-classifications/:id        ESAVI-FINCLASS-004  USER  edit from the wizard
// Out of scope (SPEC FE14a §2): `-005A`/`-005B`/`-005C` — the wizard cleans with a `PUT`, it never
// deactivates, reactivates or purges the row.
export const finalClassificationResource = createResource<
  FinalClassificationDetail,
  CreateFinalClassificationInput,
  Partial<CreateFinalClassificationInput>
>({
  key: 'finalClassification',
  path: 'final-classifications',
  idField: 'finalClassificationId',
  inactiveMode: 'adminPath',
  adminPath: 'final-classifications/admin',
});

export function finalClassificationByCaseKey(caseId: string) {
  return ['finalClassification', 'byCase', caseId] as const;
}

// ESAVI-FINCLASS-006 — read by caseId, not by the row's own PK, same reasoning as
// `useClassificationByCase`. `FINCLASS_006_NOT_FOUND` is NOT swallowed into `null` here, unlike
// the investigation satellites: with `stages.finalClassification.exists === true` a 404 means the
// row was deactivated, and `FinalClassificationStep` needs the `code` to show that state, not a
// silent empty form (SPEC FE14a §3.6).
export function useFinalClassificationByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: finalClassificationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<FinalClassificationDetail>(
        `final-classifications/case/${caseId}`,
      );
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
    // No `staleTime` (SPEC FE14a §3.4): the row invalidates after `001`/`004`, and the fresh read
    // is what the "Completar etapa" gate and the draft's conflict check derive on reentry.
  });
}

// ESAVI-FINCLASS-001 — hand-written instead of the factory's `useCreate`: this `POST` advances the
// case workflow inside its own transaction (SPEC FE14a §1B), so the client also has to invalidate
// `['caseWorkflow','byCase',caseId]`, which the factory cannot know about — same pattern as
// `useCreateInvestigationClinicalEvaluation` in features/investigation/api.ts.
export function useCreateFinalClassification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFinalClassificationInput) => {
      const response = await client.post<FinalClassificationDetail>(
        'final-classifications',
        input,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['finalClassification'] });
      void queryClient.invalidateQueries({
        queryKey: ['caseWorkflow', 'byCase', variables.caseId],
      });
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import type { CreateInvestigationInput } from '@/contracts/investigation';
import type { CreateInvestigationSourceInput } from '@/contracts/investigationSource';
import type { CreateInvestigationAutopsyInput } from '@/contracts/investigationAutopsy';
import type { CreateInvestigationTeamMemberInput } from '@/contracts/investigationTeamMember';
import type { InvestigationDetail } from '@/contracts/declared/investigation';
import type { InvestigationSourceDetail } from '@/contracts/declared/investigationSource';
import type { InvestigationAutopsyDetail } from '@/contracts/declared/investigationAutopsy';
import type { InvestigationTeamMemberDetail } from '@/contracts/declared/investigationTeamMember';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';
import { EsaviApiError } from '@/shared/api/types';

// POST   /api/investigations               ESAVI-INVESTGN-001  USER  create the header, `{ caseId }` only (SPEC FE13a §2)
// GET    /api/investigations/case/:id      ESAVI-INVESTGN-006  USER  by case, in reentry — hand-written below
// PUT    /api/investigations/:id           ESAVI-INVESTGN-004  USER  update
// Out of scope (SPEC FE13a §3.2): `-002A`/`-002B` (backoffice-wide listings, the wizard always
// enters by case), `-003` (the `006` above covers reentry), `-005A`/`-005B`/`-005C` (the wizard
// cleans with a `PUT`, it never deactivates, reactivates or purges the header).
export const investigationResource = createResource<
  InvestigationDetail,
  CreateInvestigationInput,
  Partial<CreateInvestigationInput>
>({
  key: 'investigation',
  path: 'investigations',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationByCaseKey(caseId: string) {
  return ['investigation', 'byCase', caseId] as const;
}

// ESAVI-INVESTGN-006 — by caseId, not by the row's own PK, same reasoning as
// `useNotificationByCase` (SPEC FE13a §3.4). `enabled` follows `stages.investigation.exists`,
// passed in by the caller: a fresh case has no header yet and the `POST` at mount is what creates
// it (SPEC FE13a §3.6, `InvestigationStep`).
export function useInvestigationByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: investigationByCaseKey(caseId ?? ''),
    queryFn: async () => {
      const response = await client.get<InvestigationDetail>(`investigations/case/${caseId}`);
      return response.data;
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST /api/investigation-sources       ESAVI-INVSRC-001  USER  create — carries `investigationId` in the body
// PUT  /api/investigation-sources/:id   ESAVI-INVSRC-004  USER  update — `:id` IS the investigationId
// `investigationId` is primary key and foreign key at once (CASE-PROCESS.md §5.5.2), so
// `createResource`'s generic `/:id` shape already lands on the right route without a custom hook.
// Out of scope (SPEC FE13a §3.2): `-002A`/`-002B` (global), `-003` (the `006` below covers
// reentry), `-005C` (SUPERADMIN purge — the wizard cleans with a `PUT`, never deletes).
export const investigationSourceResource = createResource<
  InvestigationSourceDetail,
  CreateInvestigationSourceInput,
  Partial<CreateInvestigationSourceInput>
>({
  key: 'investigationSource',
  path: 'investigation-sources',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationSourceByCaseKey(caseId: string) {
  return ['investigationSource', 'byCase', caseId] as const;
}

// ESAVI-INVSRC-006 — one object, not a list (SPEC FE13a §3.2). Before the first "Guardar y
// continuar" of the section, the investigation header exists but this satellite doesn't yet
// (SPEC FE13a §2, §3.6) — same "confirmed, no row yet" shape as `useNotificationPregnancyByNotification`,
// inferred from the `<PREFIX>_006_NOT_FOUND` the sibling satellites already use; reconcile the
// exact code against `investigationSource.service.ts` if the backend ever answers otherwise.
export function useInvestigationSourceByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: investigationSourceByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<InvestigationSourceDetail>(
          `investigation-sources/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'INVSRC_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST /api/investigation-autopsies       ESAVI-INVAUT-001  USER  create — carries `investigationId` in the body
// PUT  /api/investigation-autopsies/:id   ESAVI-INVAUT-004  USER  update — `:id` IS the investigationId
// Same 1:1 shape as its source sibling above.
export const investigationAutopsyResource = createResource<
  InvestigationAutopsyDetail,
  CreateInvestigationAutopsyInput,
  Partial<CreateInvestigationAutopsyInput>
>({
  key: 'investigationAutopsy',
  path: 'investigation-autopsies',
  idField: 'investigationId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
});

export function investigationAutopsyByCaseKey(caseId: string) {
  return ['investigationAutopsy', 'byCase', caseId] as const;
}

// ESAVI-INVAUT-006. Mirrors its source sibling above in every respect: one object, and
// "confirmed, no row yet" until the death block has been saved at least once (a row only exists
// over a death — SPEC FE13a §3.5 C).
export function useInvestigationAutopsyByCase(caseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: investigationAutopsyByCaseKey(caseId ?? ''),
    queryFn: async () => {
      try {
        const response = await client.get<InvestigationAutopsyDetail>(
          `investigation-autopsies/case/${caseId}`,
        );
        return response.data;
      } catch (err) {
        if (err instanceof EsaviApiError && err.code === 'INVAUT_006_NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: enabled && caseId !== undefined,
  });
}

// POST /api/investigation-team-members                     ESAVI-INVTEAM-001   USER  add a member
// GET  /api/investigation-team-members/investigation/:id   ESAVI-INVTEAM-002A  USER  active members, by parent — `useListByParent` below
// PUT  /api/investigation-team-members/:id                 ESAVI-INVTEAM-004   USER  edit a member
// `investigationTeamMemberId` is its own PK, minted by the database (unlike its two 1:1 siblings
// above) — a proper list of rows, not a satellite object. Out of scope (SPEC FE13a §2):
// `-005A`/`-005B`/`-005C` — deleting a member is blocked on `CASE-PROCESS.md` §10 lowering
// `-005A` from ADMIN to USER, so no delete hook exists here at all.
export const investigationTeamMemberResource = createResource<
  InvestigationTeamMemberDetail,
  CreateInvestigationTeamMemberInput,
  Partial<CreateInvestigationTeamMemberInput>
>({
  key: 'investigationTeamMember',
  path: 'investigation-team-members',
  idField: 'investigationTeamMemberId',
  inactiveMode: 'serverDecides',
  hasActivate: false,
  parent: {
    operation: 'byInvestigation',
    segment: 'investigation/:parentId',
  },
});

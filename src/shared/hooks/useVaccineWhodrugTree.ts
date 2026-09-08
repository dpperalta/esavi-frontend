import { useQuery } from '@tanstack/react-query';
import type {
  VaccineWhodrugTreeAncestor,
  VaccineWhodrugTreeLevel,
  VaccineWhodrugTreeResult,
} from '@/contracts/vaccineWhodrug';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { client } from '@/shared/api/client';

const TREE_STALE_TIME_MS = 30 * 60 * 1000;

const LEVEL_PATHS: Record<VaccineWhodrugTreeLevel, string> = {
  abbreviation: 'whodrug-vaccines/abbreviations',
  drugName: 'whodrug-vaccines/drug-names',
  maHolders: 'whodrug-vaccines/ma-holders',
  formTranslations: 'whodrug-vaccines/forms',
  strength: 'whodrug-vaccines/strengths',
};

// Mirrors the backend's own TREE_ANCESTORS (esavi-backend/src/services/vaccineWhodrug.service.ts)
// — each level's validator requires exactly its immediate parent and accepts the rest of the
// chain as optional (SPEC FE12c §3.2). The last entry of each array is that immediate parent.
const LEVEL_ANCESTORS: Record<VaccineWhodrugTreeLevel, VaccineWhodrugTreeAncestor[]> = {
  abbreviation: [],
  drugName: ['abbreviation'],
  maHolders: ['abbreviation', 'drugName'],
  formTranslations: ['abbreviation', 'drugName', 'maHolders'],
  strength: ['abbreviation', 'drugName', 'maHolders', 'formTranslations'],
};

export type WhodrugTreeAncestorValues = Partial<Record<VaccineWhodrugTreeAncestor, string>>;

// The five hooks the tree needs, parametrized by level instead of repeated five times — the same
// call fetches ESAVI-WHODRUG-006A through 006E depending on `level`. Ancestors travel exact,
// never trimmed or recoded (SPEC FE12c §3.2): what a previous level's option carried, including
// the `__NULL__` sentinel, is what the next level receives back. `search` is the one filter with
// its own two-character floor (CONVENTIONS.md §6.7) — below it the parameter is left out of the
// request entirely, never sent and discovered as a 400.
export function useWhodrugTreeLevel(
  level: VaccineWhodrugTreeLevel,
  ancestors: WhodrugTreeAncestorValues,
  search: string,
  language: string,
  country?: string,
) {
  const requiredAncestors = LEVEL_ANCESTORS[level];
  const immediateParent = requiredAncestors[requiredAncestors.length - 1];
  const enabled = immediateParent === undefined || ancestors[immediateParent] !== undefined;
  const trimmedSearch = search.trim();
  const searchParam = trimmedSearch.length >= 2 ? trimmedSearch : undefined;

  const ancestorParams: WhodrugTreeAncestorValues = {};
  for (const ancestor of requiredAncestors) {
    ancestorParams[ancestor] = ancestors[ancestor];
  }

  return useQuery({
    queryKey: ['whodrugVaccine', 'level', level, ancestorParams, trimmedSearch, language],
    queryFn: async () => {
      const response = await client.get<VaccineWhodrugTreeResult>(LEVEL_PATHS[level], {
        params: { country, language, search: searchParam, ...ancestorParams },
      });
      return response.data;
    },
    enabled,
    staleTime: TREE_STALE_TIME_MS,
  });
}

// ESAVI-WHODRUG-003 — the full dictionary row behind an id a level resolved (`matchCount === 1`).
// Feeds both the seven-row information panel and the three copied texts (`whoCode`/`vaccineCode`
// from `drugCode`, `vaccineName` from `drugName`) of `notificationVaccineSchema` (SPEC FE12c §3.5).
export function useVaccineWhodrugDetail(vaccineWhodrugId: string | null) {
  return useQuery({
    queryKey: ['whodrugVaccine', 'detail', vaccineWhodrugId ?? ''],
    queryFn: async () => {
      const response = await client.get<VaccineWhodrugDetail>(`whodrug-vaccines/${vaccineWhodrugId}`);
      return response.data;
    },
    enabled: vaccineWhodrugId !== null,
    staleTime: TREE_STALE_TIME_MS,
  });
}

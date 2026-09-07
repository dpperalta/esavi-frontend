// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy. Origin: esavi-backend/src/types/meddra/meddra.types.ts and
// esavi-backend/src/services/meddra.service.ts, searchMeddraTermsService. Reconciled by hand if
// the backend changes; `contracts:sync` never writes into this folder.
//
// The five levels of the dictionary, in the precedence order of SPEC F55 §3.5. The API does not
// return the level: it is derived from whichever level flag is true in the search config.
export type MeddraTermGroup = 'LLT' | 'PT' | 'HLT' | 'HLGT' | 'SOC';

export interface MeddraSearchRow {
  code: string;
  name: string;
  termGroup: MeddraTermGroup;
}

// No `term` echoed back, unlike `WhodrugProductSearchResult` — the difference is the backend's,
// copied as it is (SPEC FE12b §3.3, mismo criterio que la nota de `NOTIFIER`/`GEOLOCATION`).
export interface MeddraSearchResult {
  count: number;
  rows: MeddraSearchRow[];
}

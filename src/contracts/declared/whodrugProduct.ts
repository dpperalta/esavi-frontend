// NOT a mirror: the backend builds this response as a literal, with no `interface` that
// `contracts:sync` could copy. Copied from SPEC F56 §3.7, the backend contract of
// `ESAVI-WHODPROD-006` — origin: esavi-backend/src/services/whodrugProduct.service.ts,
// searchWhodrugProductsService. Reconciled by hand if the backend changes; `contracts:sync` never
// writes into this folder.
export interface WhodrugProductSearchRow {
  code: string;
  name: string;
}

// count === rows.length; when it equals the `limit` sent, there were more results and the client
// has to narrow the term — there is no pagination (SPEC FE12b §3.2).
export interface WhodrugProductSearchResult {
  term: string;
  count: number;
  rows: WhodrugProductSearchRow[];
}

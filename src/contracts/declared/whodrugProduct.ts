import type { AppDetails } from '@/contracts/common';

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

// NOT a mirror: the 002B returns the Sequelize instance as-is with `sysDetails` excluded
// (`attributes: { exclude: ['sysDetails'] }`, esavi-backend/src/services/whodrugProduct.service.ts),
// and there is no interface `contracts:sync` could copy — `WhodrugProductFlatRow` is the sync's
// internal shape, not the stored row. Shape from SPEC F56 §3.7, reconciled by hand against
// esavi-backend/src/models/whodrugProduct.model.ts.

// GET /api/whodrug-products/admin (ESAVI-WHODPROD-002B) — the only list, always including the
// rows the last sync retired (`isActive: false`).
export interface WhodrugProductRow {
  whodrugProductId: string;
  // SHA-256 over the seven fields that identify a presentation: the API sends no row id.
  rowHash: string;
  drugCode: string;
  drugName: string;
  // Every ATC of the medicine, delimited by ';' at both ends (;J07AN01;L03AX;).
  drugAtcs: string | null;
  medicinalProductId: string | null;
  // A single ATC per row: the flattening explodes the list.
  atcs: string | null;
  ingredient: string | null;
  ingredientTranslations: string | null;
  languageCode: string | null;
  iso3Code: string | null;
  countryMedicinalProductId: string | null;
  maHolders: string | null;
  maHoldersMedicinalProductId: string | null;
  form: string | null;
  formMedicinalProductId: string | null;
  strength: string | null;
  strengthMedicinalProductId: string | null;
  isGeneric: boolean;
  isPreferred: boolean;
  optionName: string;
  optionNameSearch: string;
  // Sealed at insert; its keys are the sync's, not a contract (SPEC FE25d §3.1).
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  // The column is NOT NULL, but seed rows can carry `{}`; `<AuditTrail>` guards with
  // `Array.isArray` (CONVENTIONS.md §10.4).
  appDetails: AppDetails[] | null;
}

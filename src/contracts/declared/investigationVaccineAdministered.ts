// NOT a mirror: the backend builds this response as a literal — `toInvestigationVaccineAdministeredResponse`
// drops the `investigation` parent off the Sequelize instance's `toJSON()` and resolves `vaccineWhodrug`
// to an explicit `null`, so there is no `interface` for `contracts:sync` to copy (SPEC FE13d §3.3).
// Reconciled by hand if the backend changes; `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';

// POST /api/investigation-vaccines-administered (001),
// GET /api/investigation-vaccines-administered/investigation/:id (002A), PUT .../:id (004) — origin:
// esavi-backend/src/services/investigationVaccineAdministered.service.ts (RESPONSE_ATTRIBUTES,
// WHODRUG_INCLUDE, toInvestigationVaccineAdministeredResponse).
//
// `vaccineWhodrug` carries only three columns of the master — the other twenty-six are governance
// of the dictionary, read through the tree's own operations. `drugName` is what `<SatelliteList>`
// paints: the fully-resolved name of the five-level selection, not a nested tree (SPEC FE13d §3.3).
//
// `sortOrder` travels because the listing orders by it, but the client never sends it back: it is
// assigned by `TRG_investigationVaccineAdministered_setSortOrder`.
//
// `isActive` is the only field of this spec's three tables that exists: unlike the two one-to-one
// satellites, this table has state of its own — governed by `005A`/`005B`, out of scope here
// (SPEC FE13d §2).
export interface InvestigationVaccineAdministeredDetail {
  vaccineAdministeredId: string;
  investigationId: string;
  sortOrder: number | null;
  vaccineWhodrugId: string | null;
  doseNumber: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  vaccineWhodrug: {
    vaccineWhodrugId: string;
    drugCode: string | null;
    drugName: string;
  } | null;
}

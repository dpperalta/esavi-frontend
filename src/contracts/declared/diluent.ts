// NOT a mirror: the backend's own type for this table lives under the entity name
// `diluentCatalog` (esavi-backend/src/types/diluentCatalog/), but `createResource('diluent')`
// treats it as a plain catalog-shaped resource — `diluentCatalog` is the table, `diluent` is what
// the tree of `<DiluentSelect>` picks (SPEC FE12c §3, §6). Reconciled by hand against
// esavi-backend/src/models/diluentCatalog.model.ts if the backend changes; `contracts:sync` never
// writes into this folder.
import type { AppDetails } from '@/contracts/common';

// GET /api/diluents (002A), /api/diluents/admin (002B), /api/diluents/:id (003).
export interface Diluent {
  diluentCatalogId: string;
  code: string | null;
  name: string;
  description: string | null;
  composition: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// POST /api/diluents (001), PUT /api/diluents/:id (004) — the update uses
// `Partial<CreateDiluentInput>`, no separate update type, same as every other entity.
export interface CreateDiluentInput {
  code: string;
  name: string;
  description?: string | null;
  composition?: string | null;
  isActive?: boolean;
}

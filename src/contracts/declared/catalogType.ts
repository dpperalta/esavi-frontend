// NOT a mirror: the backend never exports the row as a type, it lives on the Sequelize model
// (SPEC FE02 §3.4). Reconciled by hand if the model changes; `contracts:sync` never writes into
// this folder.
// Origin: esavi-backend/src/models/catalogType.model.ts
import type { AppDetails } from '@/contracts/common';

export interface CatalogType {
  catalogTypeId: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number | null;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// NOT a mirror: the backend never exports the row as a type, it lives on the Sequelize model
// (SPEC FE02 §3.4). Reconciled by hand if the model changes; `contracts:sync` never writes into
// this folder.
// Origin: esavi-backend/src/models/geoLevelType.model.ts
import type { AppDetails } from '@/contracts/common';

export interface GeoLevelType {
  geoLevelTypeId: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

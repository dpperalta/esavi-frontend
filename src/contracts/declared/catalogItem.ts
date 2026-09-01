// NOT a mirror: the backend never exports the row as a type, it lives on the Sequelize model
// (SPEC FE02 §3.4, same pattern as declared/catalogType.ts). Reconciled by hand if the model
// changes; `contracts:sync` never writes into this folder.
// Origin: esavi-backend/src/models/catalogItem.model.ts
//
// value is `allowNull: false` on the model but nullable in the DDL — a contradiction SPEC F20
// left unresolved (SPEC FE03 §7). Typed `string | null` here as the conservative reading of the
// two sources; the table must tolerate an empty cell.
import type { AppDetails } from '@/contracts/common';

export interface CatalogItem {
  catalogItemId: string;
  catalogTypeId: string;
  code: string;
  name: string;
  value: string | null;
  // SPEC F46: never editable through the API, exposed on 002A/002B/003 so the UI can disable
  // the field instead of silently discarding what the user typed.
  isValueLocked: boolean;
  description: string | null;
  sortOrder: number;
  metadata: object | null;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

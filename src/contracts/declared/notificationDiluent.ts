// NOT a mirror: same reasoning as notificationVaccine.ts — the backend flattens the Sequelize
// instance with no `interface` to copy. Reconciled by hand against
// esavi-backend/src/services/notificationDiluent.service.ts (toNotificationDiluentResponse,
// DILUENT_CATALOG_INCLUDE) if the backend changes.
import type { AppDetails } from '@/contracts/common';

// GET .../notification-diluents/vaccine/:id (002A), POST (001), PUT (004) — no `notes` (the only
// one of the six satellites without it, SPEC FE12c §3.3). `diluentCatalog` comes back as an
// explicit `null` when the diluent was notified without being coded — the rama cruda of the
// diluent, same shape as `vaccineWhodrug` above.
export interface NotificationDiluentDetail {
  diluentId: string;
  vaccineId: string;
  diluentCatalogId: string | null;
  sortOrder: number;
  batchNumber: string | null;
  expirationDate: string | null;
  reconstitutionDate: string | null;
  reconstitutionTime: string | null;
  diluentName: string | null;
  diluentCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  diluentCatalog: {
    diluentCatalogId: string;
    code: string | null;
    name: string;
  } | null;
}

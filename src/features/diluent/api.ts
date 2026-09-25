import type { CreateDiluentInput, Diluent } from '@/contracts/declared/diluent';
import { createResource } from '@/shared/api/createResource';

// POST   /api/diluents              ESAVI-DILUENT-001   ADMIN       create — DiluentFormDialog (SPEC FE25a)
// GET    /api/diluents              ESAVI-DILUENT-002A  USER        active listing — DiluentListPage and <DiluentSelect>
// GET    /api/diluents/admin        ESAVI-DILUENT-002B  ADMIN       incl. inactive — DiluentListPage "show inactive" toggle (SPEC FE25a)
// GET    /api/diluents/:id          ESAVI-DILUENT-003   USER        detail — DiluentFormDialog (edit) and DiluentAuditSheet (SPEC FE25a)
// PUT    /api/diluents/:id          ESAVI-DILUENT-004   ADMIN       update — DiluentFormDialog (SPEC FE25a)
// DELETE /api/diluents/:id          ESAVI-DILUENT-005A  ADMIN       deactivate — DiluentListPage row actions (SPEC FE25a)
// PATCH  /api/diluents/activate/:id ESAVI-DILUENT-005B  SUPERADMIN  activate — DiluentListPage row actions (SPEC FE25a)
//
// `diluentCatalog` is a catalog-shaped entity of its own, not a `catalogType` (SPEC FE12c §6):
// the table is `diluentCatalog`, the resource is `diluent`. No 005C: the table is in
// `preventPhysicalDelete`.
// The free-text fallback of the notification step hangs on this row (DiluentFormRow.tsx). A
// convention of this deployment, not of the contract: the screen never saves nor deactivates it,
// but the backend still accepts both (SPEC FE25a §3.5, §7).
export const FREE_TEXT_DILUENT_CODE = 'OTHER';

export const diluentResource = createResource<Diluent, CreateDiluentInput, Partial<CreateDiluentInput>>({
  key: 'diluent',
  path: 'diluents',
  idField: 'diluentCatalogId',
  inactiveMode: 'adminPath',
  adminPath: 'diluents/admin',
  // Catalog data changes rarely (CONVENTIONS.md §6.3).
  staleTime: 30 * 60 * 1000,
});

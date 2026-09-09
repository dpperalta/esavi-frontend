import type { CreateDiluentInput, Diluent } from '@/contracts/declared/diluent';
import { createResource } from '@/shared/api/createResource';

// POST   /api/diluents              ESAVI-DILUENT-001   ADMIN       create — maintenance, out of scope (SPEC FE12c §2)
// GET    /api/diluents              ESAVI-DILUENT-002A  USER        active listing — what <DiluentSelect> reads
// GET    /api/diluents/admin        ESAVI-DILUENT-002B  ADMIN       incl. inactive — out of scope, same reason
// GET    /api/diluents/:id          ESAVI-DILUENT-003   USER        detail — unused, the 002A listing already carries what the select needs
// PUT    /api/diluents/:id          ESAVI-DILUENT-004   ADMIN       update — out of scope
// DELETE /api/diluents/:id          ESAVI-DILUENT-005A  ADMIN       deactivate — out of scope
// PATCH  /api/diluents/activate/:id ESAVI-DILUENT-005B  SUPERADMIN  activate — out of scope
//
// `diluentCatalog` is a catalog-shaped entity of its own, not a `catalogType` (SPEC FE12c §6):
// this declaration exists solely so `<DiluentSelect>` can resolve `002A`. Seeding the master and
// its maintenance screens are a dependency of the other repository (§10.5).
export const diluentResource = createResource<Diluent, CreateDiluentInput, Partial<CreateDiluentInput>>({
  key: 'diluent',
  path: 'diluents',
  idField: 'diluentCatalogId',
  inactiveMode: 'adminPath',
  adminPath: 'diluents/admin',
  // Catalog data changes rarely (CONVENTIONS.md §6.3).
  staleTime: 30 * 60 * 1000,
});

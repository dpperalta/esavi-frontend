import type { CreateCatalogTypeInput } from '@/contracts/catalogType';
import type { CatalogType } from '@/contracts/declared/catalogType';
import { createResource } from '@/shared/api/createResource';

// GET    /api/catalog-types              ESAVI-CATTYPE-002    USER        list
// GET    /api/catalog-types/:id          ESAVI-CATTYPE-003    USER        detail
// POST   /api/catalog-types              ESAVI-CATTYPE-001    ADMIN       create
// PUT    /api/catalog-types/:id          ESAVI-CATTYPE-004    ADMIN       update
// DELETE /api/catalog-types/:id          ESAVI-CATTYPE-005A   ADMIN       deactivate
// PATCH  /api/catalog-types/activate/:id ESAVI-CATTYPE-005B   SUPERADMIN  activate
//
// One of the three single-route entities (SPEC FE02 §1 finding B) — no `002A`/`002B`, the
// backend decides active-vs-all by role. No `adminPath`, no inactive toggle.
export const catalogTypeResource = createResource<
  CatalogType,
  CreateCatalogTypeInput,
  Partial<CreateCatalogTypeInput>
>({
  key: 'catalogType',
  path: 'catalog-types',
  idField: 'catalogTypeId',
  inactiveMode: 'serverDecides',
  // Catalog data changes rarely (CONVENTIONS.md §6.3).
  staleTime: 30 * 60 * 1000,
});

import type { CreateCatalogItemInput } from '@/contracts/catalogItem';
import type { CatalogItem } from '@/contracts/declared/catalogItem';
import { createResource } from '@/shared/api/createResource';

// GET    /api/catalog-items/type/:id        ESAVI-CATITEM-002A  USER        list active by type
// GET    /api/catalog-items/admin/type/:id  ESAVI-CATITEM-002B  ADMIN       list including inactive
// GET    /api/catalog-items/:id             ESAVI-CATITEM-003   USER        detail
// POST   /api/catalog-items                 ESAVI-CATITEM-001   ADMIN       create
// PUT    /api/catalog-items/:id             ESAVI-CATITEM-004   ADMIN       update
// DELETE /api/catalog-items/:id             ESAVI-CATITEM-005A  ADMIN       deactivate
// PATCH  /api/catalog-items/activate/:id    ESAVI-CATITEM-005B  SUPERADMIN  activate
// POST   /api/catalog-items/import          ESAVI-CATITEM-006   SUPERADMIN  not consumed (own spec, SPEC FE03 §2)
//
// First real consumer of `inactiveMode: 'adminPath'` and `parent` (SPEC FE03 §1 finding B):
// there is no flat `GET /api/catalog-items` in the inventory, only the two by-type reads, so
// `useList` is never invoked here — only `useListByParent`.
export const catalogItemResource = createResource<
  CatalogItem,
  CreateCatalogItemInput,
  Partial<Omit<CreateCatalogItemInput, 'catalogTypeId'>>
>({
  key: 'catalogItem',
  path: 'catalog-items',
  idField: 'catalogItemId',
  inactiveMode: 'adminPath',
  // Required by `assertConfig` whenever `inactiveMode` is `'adminPath'`, even though this entity
  // only ever lists by parent and never calls `useList` (SPEC FE03 §3.2, §7).
  adminPath: 'catalog-items/admin',
  parent: {
    operation: 'byType',
    segment: 'type/:parentId',
    adminSegment: 'admin/type/:parentId',
  },
  // Catalog data changes rarely (CONVENTIONS.md §6.3).
  staleTime: 30 * 60 * 1000,
});

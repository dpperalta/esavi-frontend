import type { CreateVaccineWhodrugInput } from '@/contracts/vaccineWhodrug';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { createResource } from '@/shared/api/createResource';

// POST   /api/whodrug-vaccines              ESAVI-WHODRUG-001   ADMIN       create — VaccineWhodrugFormPage (SPEC FE25c)
// GET    /api/whodrug-vaccines              ESAVI-WHODRUG-002A  USER        active listing — VaccineWhodrugListPage
// GET    /api/whodrug-vaccines/admin        ESAVI-WHODRUG-002B  ADMIN       incl. inactive (toggle) — VaccineWhodrugListPage
// GET    /api/whodrug-vaccines/:id          ESAVI-WHODRUG-003   USER        detail — VaccineWhodrugDetailPage, VaccineWhodrugFormPage (edit), VaccineWhodrugAuditSheet
// PUT    /api/whodrug-vaccines/:id          ESAVI-WHODRUG-004   ADMIN       update — VaccineWhodrugFormPage
// DELETE /api/whodrug-vaccines/:id          ESAVI-WHODRUG-005A  ADMIN       deactivate — VaccineWhodrugRowActions
// PATCH  /api/whodrug-vaccines/activate/:id ESAVI-WHODRUG-005B  SUPERADMIN  activate — VaccineWhodrugRowActions
// POST   /api/whodrug-vaccines/import       ESAVI-WHODRUG-007   SUPERADMIN  .xlsx import — importApi.ts
//
// No 005C: the table is in `preventPhysicalDelete`. 006A–006E (the five tree levels) live in
// `shared/hooks/useVaccineWhodrugTree.ts`, consumed by `<WhodrugTreePicker>`.
export const vaccineWhodrugResource = createResource<
  VaccineWhodrugDetail,
  CreateVaccineWhodrugInput,
  Partial<CreateVaccineWhodrugInput>
>({
  // Declared deviation from the folder name (SPEC FE25c §3.4): the key is the one
  // `useVaccineWhodrugTree` already uses, so `useOne(id)` shares its detail entry and every
  // mutation here also refreshes the tree levels `['whodrugVaccine', 'level', …]`.
  key: 'whodrugVaccine',
  path: 'whodrug-vaccines',
  idField: 'vaccineWhodrugId',
  inactiveMode: 'adminPath',
  adminPath: 'whodrug-vaccines/admin',
  staleTime: 30 * 60 * 1000,
});

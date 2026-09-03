import type { CreateEsaviCaseInput } from '@/contracts/esaviCase';
import type { EsaviCaseDetail } from '@/contracts/declared/esaviCase';
import { createResource } from '@/shared/api/createResource';

// POST   /api/esavi-cases              ESAVI-CASE-001   USER        create
// GET    /api/esavi-cases              ESAVI-CASE-002A  USER        active list
// GET    /api/esavi-cases/admin        ESAVI-CASE-002B  ADMIN       incl. inactive
// GET    /api/esavi-cases/:id          ESAVI-CASE-003   USER        detail
// PUT    /api/esavi-cases/:id          ESAVI-CASE-004   USER        update
// DELETE /api/esavi-cases/:id          ESAVI-CASE-005A  ADMIN       deactivate
// PATCH  /api/esavi-cases/activate/:id ESAVI-CASE-005B  SUPERADMIN  activate
//
// The entity's api.ts belongs here, not to FE09 (SPEC FE08 §6): the artifact belongs to the
// entity, not to the spec that lists it. This spec consumes only `useOne` — FE09 reuses the
// declaration without redeclaring it (CONVENTIONS.md §5).
export const esaviCaseResource = createResource<EsaviCaseDetail, CreateEsaviCaseInput>({
  key: 'esaviCase',
  path: 'esavi-cases',
  adminPath: 'esavi-cases/admin',
  idField: 'caseId',
  inactiveMode: 'adminPath',
  hasActivate: true,
});

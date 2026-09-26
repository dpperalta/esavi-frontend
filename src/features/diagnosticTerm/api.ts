import type { CreateDiagnosticTermInput } from '@/contracts/diagnosticTerm';
import type { DiagnosticTerm } from '@/contracts/declared/diagnosticTerm';
import { createResource } from '@/shared/api/createResource';

// POST   /api/diagnostic-terms              ESAVI-DIAGTERM-001   ADMIN       create — DiagnosticTermFormDialog (SPEC FE25b)
// GET    /api/diagnostic-terms              ESAVI-DIAGTERM-002A  USER        active listing — DiagnosticTermListPage
// GET    /api/diagnostic-terms/admin        ESAVI-DIAGTERM-002B  ADMIN       incl. inactive; the only listing that reads reviewStatus
// GET    /api/diagnostic-terms/:id          ESAVI-DIAGTERM-003   USER        detail — DiagnosticTermFormDialog (edit) and DiagnosticTermAuditSheet
// PUT    /api/diagnostic-terms/:id          ESAVI-DIAGTERM-004   ADMIN       update, reviewStatus included — DiagnosticTermFormDialog
// DELETE /api/diagnostic-terms/:id          ESAVI-DIAGTERM-005A  ADMIN       deactivate — DiagnosticTermRowActions
// PATCH  /api/diagnostic-terms/activate/:id ESAVI-DIAGTERM-005B  SUPERADMIN  activate — DiagnosticTermRowActions
// POST   /api/diagnostic-terms/import       ESAVI-DIAGTERM-007   SUPERADMIN  .asc import — importApi.ts
//
// No 005C: the table is in `preventPhysicalDelete`. No 006: implicit resolution is an internal
// service with no HTTP route.
export const diagnosticTermResource = createResource<
  DiagnosticTerm,
  CreateDiagnosticTermInput,
  Partial<CreateDiagnosticTermInput>
>({
  key: 'diagnosticTerm',
  path: 'diagnostic-terms',
  idField: 'diagnosticTermId',
  inactiveMode: 'adminPath',
  adminPath: 'diagnostic-terms/admin',
  // Declared exception to the 30-minute catalog staleTime of CONVENTIONS.md §6.3 (SPEC FE25b
  // §3.4): this master also grows from the notification and investigation screens through 006,
  // and those mutations do not invalidate ['diagnosticTerm'].
  staleTime: 5 * 60 * 1000,
});

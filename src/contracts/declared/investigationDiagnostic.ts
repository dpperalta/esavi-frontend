// NOT a mirror: the backend builds this response as a literal — `toInvestigationDiagnosticResponse`
// picks `RESPONSE_ATTRIBUTES` one by one and drops the `investigation` parent off the Sequelize
// instance's `toJSON()`, so there is no `interface` for `contracts:sync` to copy (SPEC FE13c §3.3).
// Reconciled by hand if the backend changes; `contracts:sync` never writes into this folder.
import type { AppDetails, TermSource } from '@/contracts/common';

// POST /api/investigation-diagnostics (001), GET /api/investigation-diagnostics/case/:id (006),
// PUT /api/investigation-diagnostics/:id (004) — origin:
// esavi-backend/src/services/investigationDiagnostic.service.ts (RESPONSE_ATTRIBUTES,
// DIAGNOSTIC_TERM_INCLUDE, DIAGNOSTIC_TYPE_INCLUDE, toInvestigationDiagnosticResponse).
//
// `investigationId` names the investigation itself, with no UNIQUE behind it: N diagnoses hang from
// one investigation. The `investigation` parent the service reads to enforce visibility never
// reaches this response.
//
// `diagnosticTerm` comes back `null` when the diagnosis was recorded free-text with no code
// resolved. What the screen shows is `diagnosticRaw ?? diagnosticTerm.name` — there is no third
// field that resolves it (SPEC FE13c §3.6). There is no `diagnosticName` here: the GET never carries
// the text the investigator typed as its own field, which is what keeps a `PUT` that resends the GET
// from rewriting `diagnosticRaw` with the master's name (SPEC FE13c §3.5, the same trap FE12b closed).
//
// `sortOrder` travels because the two listings order by it, but the client never sends it back:
// it is assigned by `TRG_investigationDiagnostic_setSortOrder`. `diagnosticTermId` travels for the
// same read-only reason — the resolution decides it, never the client.
export interface InvestigationDiagnosticDetail {
  diagnosticId: string;
  investigationId: string;
  diagnosticTermId: string | null;
  diagnosticTerm: {
    diagnosticTermId: string;
    source: TermSource;
    code: string | null;
    name: string;
    termGroup: string | null;
    isActive: boolean;
  } | null;
  diagnosticRaw: string | null;
  diagnosticDate: string | null;
  diagnosticTypeItemId: string | null;
  diagnosticType: {
    catalogItemId: string;
    code: string;
    name: string;
    value: string;
  } | null;
  sortOrder: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
}

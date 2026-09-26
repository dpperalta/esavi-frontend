// NOT a mirror: the backend returns the Sequelize row as-is, with no `interface` in
// esavi-backend/src/types/diagnosticTerm/ to copy (SPEC FE25b §3.3). Reconciled by hand against
// esavi-backend/src/models/diagnosticTerm.model.ts if the backend changes; `contracts:sync` never
// writes into this folder.
import type { AppDetails, TermSource } from '@/contracts/common';

// The model declares `metadata` as `object`. These are the keys the backend writes: the implicit
// resolution (ESAVI-DIAGTERM-006) stamps the first three, the import (007) stamps
// dictionaryVersion, and the update (004) merges reviewStatus.
export interface DiagnosticTermMetadata {
  autoCreated?: boolean;
  createdFrom?: string;
  reviewStatus?: string;
  dictionaryVersion?: string;
}

// GET /api/diagnostic-terms (002A), /api/diagnostic-terms/admin (002B), /api/diagnostic-terms/:id (003).
export interface DiagnosticTerm {
  diagnosticTermId: string;
  source: TermSource;
  code: string | null;
  name: string;
  termGroup: string | null;
  metadata: DiagnosticTermMetadata | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

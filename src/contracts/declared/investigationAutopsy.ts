// NOT a mirror: the backend builds this response as a literal — `toInvestigationAutopsyResponse`
// drops `sysDetails` off the Sequelize instance's `toJSON()`, so there is no `interface` for
// `contracts:sync` to copy (SPEC FE13a §3.3). Reconciled by hand if the backend changes;
// `contracts:sync` never writes into this folder.
import type { AppDetails } from '@/contracts/common';
import type { InvestigationParentRef } from '@/contracts/declared/investigation';

// GET /api/investigation-autopsies/case/:id (006), POST (001), PUT (004) — origin:
// esavi-backend/src/services/investigationAutopsy.service.ts (AUTOPSY_EXCLUDE,
// INVESTIGATION_INCLUDE, toInvestigationAutopsyResponse). The `006` answers one object, not a list.
//
// `investigationId` is primary key and foreign key at once, like investigationSource.
//
// `isDeath` is the only non-nullable data column: a row exists only over a death, which is why the
// screen never offers it as a control and always sends `true` (SPEC FE13a §3.5 C).
//
// The three dates come back as 'YYYY-MM-DD' and `deathTime` as **'HH:mm:ss'** — the normalized form
// of DATEONLY and TIME, never the one the client sent. `<TimeField>` speaks 'HH:mm', so the seconds
// are trimmed in the form mapping.
//
// There is no `isActive`: the table does not have that column.
export interface InvestigationAutopsyDetail {
  investigationId: string;
  isDeath: boolean;
  deathDate: string | null;
  deathTime: string | null;
  isAutopsyPerformed: boolean | null;
  isAutopsyScheduled: boolean | null;
  autopsyDate: string | null;
  scheduledAutopsyDate: string | null;
  autopsyComments: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  investigation: InvestigationParentRef;
}

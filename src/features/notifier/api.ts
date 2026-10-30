import type { CreateNotifierInput } from '@/contracts/notifier';
import type { NotifierDetail, NotifierListRow } from '@/contracts/declared/notifier';
import { createResource } from '@/shared/api/createResource';

// POST   /api/notifiers               ESAVI-NOTIFIER-001   NOTIFIER    add
// GET    /api/notifiers?caseId=       ESAVI-NOTIFIER-002A  USER        the case's list
// GET    /api/notifiers/admin         ESAVI-NOTIFIER-002B  ADMIN       incl. inactive
// GET    /api/notifiers/:id           ESAVI-NOTIFIER-003   USER        unused — the list row already carries the full shape (SPEC FE10 §3.2)
// PUT    /api/notifiers/:id           ESAVI-NOTIFIER-004   NOTIFIER    edit
// DELETE /api/notifiers/:id           ESAVI-NOTIFIER-005A  NOTIFIER    remove — follows the step's read-only mode (SPEC FE33 §3.5)
// PATCH  /api/notifiers/activate/:id  ESAVI-NOTIFIER-005B  SUPERADMIN  out of scope
// DELETE /api/notifiers/purge/:id     ESAVI-NOTIFIER-005C  SUPERADMIN  out of scope
//
// `TListRow` is `NotifierListRow`, not `NotifierDetail`: the list drops `details` entirely
// (it's not in the backend's own `LIST_ATTRIBUTES`) and the modal only has it after a `PUT`.
export const notifierResource = createResource<
  NotifierDetail,
  CreateNotifierInput,
  Partial<CreateNotifierInput>,
  NotifierListRow
>({
  key: 'notifier',
  path: 'notifiers',
  idField: 'notifierId',
  inactiveMode: 'adminPath',
  adminPath: 'notifiers/admin',
});

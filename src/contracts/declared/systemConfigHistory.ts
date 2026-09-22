// Origin: esavi-backend/src/services/systemConfig.service.ts, getSystemConfigHistoryService.
// The shape of ESAVI-SYSCONF-007 — the app's own service assembles this row, so there is no
// backend interface to mirror with `contracts:sync` (SPEC F26 §3.7). `previousValue` and
// `newValue` are `unknown` for the same reason as `SystemConfigDetail.value`: `valueType` on the
// parent row says how to read them. `changedByUser` is `null` when the FK was cleared by
// `ON DELETE SET NULL` on the author's account.
export interface SystemConfigHistoryRow {
  systemConfigHistoryId: string;
  systemConfigId: string;
  previousValue: unknown;
  newValue: unknown;
  changeReason: string | null;
  createdAt: string;
  changedByUser: { userId: string; displayName: string } | null;
}

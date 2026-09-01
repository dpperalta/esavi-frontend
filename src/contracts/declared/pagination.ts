// NOT a mirror: the backend never types its own `findAndCountAll` result — every listing
// controller inlines `{ count, rows }` in the response (SPEC FE02 §1, finding A). Reconciled
// by hand if that changes; `contracts:sync` never writes into this folder.
export interface PaginatedResponse<T> {
  count: number;
  rows: T[];
}

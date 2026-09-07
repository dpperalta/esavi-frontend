import type { CatalogItem } from '@/contracts/declared/catalogItem';
import { catalogItemResource } from '@/features/catalogItem/api';
import { catalogTypeResource } from '@/features/catalogType/api';

export interface CatalogItemsByTypeCodeResult {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  catalogTypeId: string;
  rows: CatalogItem[];
  refetch: () => void;
}

// ESAVI-CATTYPE-002 (resolves `typeCode` → `catalogTypeId`) + ESAVI-CATITEM-002A (items of that
// type), the same two-hop resolution `<CatalogSelect>` wrote by hand since SPEC FE09 §1E — moved
// here so a screen that needs to compare against `catalogItem.value` (never `code` nor `name`,
// SPEC F46) does not reimplement it (SPEC FE12a §3.3, §6 "Los catálogos y la edad"). Both
// resources declare their own 30-minute `staleTime`; nothing is redeclared here, so two callers
// with the same `typeCode` — including a `<CatalogSelect>` and this hook side by side — share
// both cache entries and cost one request per hop, not one per caller.
export function useCatalogItemsByTypeCode(typeCode: string): CatalogItemsByTypeCodeResult {
  const typesList = catalogTypeResource.useList({ pageSize: 100 });
  const catalogTypeId =
    typesList.data?.rows.find((row) => row.code === typeCode)?.catalogTypeId ?? '';
  const itemsList = catalogItemResource.useListByParent!(catalogTypeId, { pageSize: 100 });

  return {
    isLoading: typesList.isLoading || itemsList.isLoading,
    isError: typesList.isError || itemsList.isError,
    error: typesList.isError ? typesList.error : itemsList.error,
    catalogTypeId,
    rows: itemsList.data?.rows ?? [],
    refetch: () => {
      void typesList.refetch();
      void itemsList.refetch();
    },
  };
}

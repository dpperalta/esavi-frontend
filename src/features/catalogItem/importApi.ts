import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CatalogItemImportReport, ImportCatalogItemsInput } from '@/contracts/catalogItem';
import { client } from '@/shared/api/client';

export interface ImportCatalogItemsVariables extends Omit<ImportCatalogItemsInput, 'dryRun'> {
  file: File;
  dryRun: boolean;
}

// ESAVI-CATITEM-006. `dryRun` travels as a string because it rides a FormData field, not JSON
// (same as vaccineWhodrug/importApi.ts).
export function useImportCatalogItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      dryRun,
    }: ImportCatalogItemsVariables): Promise<CatalogItemImportReport> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dryRun', String(dryRun));

      const response = await client.post<CatalogItemImportReport>(
        '/catalog-items/import',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (_report, { dryRun }) => {
      // SPEC FE30 §3.4: a real import also founds the catalog types it does not find, so the
      // catalogType root is invalidated too — otherwise its 30-minute staleTime hides them.
      if (!dryRun) {
        void queryClient.invalidateQueries({ queryKey: ['catalogItem'] });
        void queryClient.invalidateQueries({ queryKey: ['catalogType'] });
      }
    },
  });
}

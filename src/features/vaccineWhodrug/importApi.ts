import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ImportVaccineWhodrugsInput,
  VaccineWhodrugImportReport,
} from '@/contracts/vaccineWhodrug';
import { client } from '@/shared/api/client';

export interface ImportVaccineWhodrugsVariables extends Omit<ImportVaccineWhodrugsInput, 'dryRun'> {
  file: File;
  dryRun: boolean;
}

// ESAVI-WHODRUG-007. `dryRun` travels as a string because it rides a FormData field, not JSON
// (same as diagnosticTerm/importApi.ts).
export function useImportVaccineWhodrugs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      dryRun,
      dictionaryVersion,
    }: ImportVaccineWhodrugsVariables): Promise<VaccineWhodrugImportReport> => {
      const formData = new FormData();
      formData.append('file', file);
      if (dictionaryVersion) formData.append('dictionaryVersion', dictionaryVersion);
      formData.append('dryRun', String(dryRun));

      const response = await client.post<VaccineWhodrugImportReport>(
        '/whodrug-vaccines/import',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (_report, { dryRun }) => {
      // SPEC FE25c §3.4: a dry run wrote nothing. A real one invalidates the whole root key, which
      // also marks the `<WhodrugTreePicker>` levels stale.
      if (!dryRun) {
        void queryClient.invalidateQueries({ queryKey: ['whodrugVaccine'] });
      }
    },
  });
}

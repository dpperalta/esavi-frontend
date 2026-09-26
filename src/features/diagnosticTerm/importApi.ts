import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DiagnosticTermImportReport,
  ImportDiagnosticTermsInput,
} from '@/contracts/diagnosticTerm';
import { client } from '@/shared/api/client';

export interface ImportDiagnosticTermsVariables extends Omit<ImportDiagnosticTermsInput, 'dryRun'> {
  file: File;
  dryRun: boolean;
}

// ESAVI-DIAGTERM-007. `dryRun` travels as a string because it rides a FormData field, not JSON
// (same as geoLocation/importApi.ts).
export function useImportDiagnosticTerms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      dryRun,
      source,
      termGroup,
      dictionaryVersion,
      encoding,
    }: ImportDiagnosticTermsVariables): Promise<DiagnosticTermImportReport> => {
      const formData = new FormData();
      formData.append('file', file);
      if (source) formData.append('source', source);
      if (termGroup) formData.append('termGroup', termGroup);
      if (dictionaryVersion) formData.append('dictionaryVersion', dictionaryVersion);
      if (encoding) formData.append('encoding', encoding);
      formData.append('dryRun', String(dryRun));

      const response = await client.post<DiagnosticTermImportReport>(
        '/diagnostic-terms/import',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (_report, { dryRun }) => {
      // SPEC FE25b §3.4: a dry run wrote nothing, so there is nothing to invalidate.
      if (!dryRun) {
        void queryClient.invalidateQueries({ queryKey: ['diagnosticTerm'] });
      }
    },
  });
}

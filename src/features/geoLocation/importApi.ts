import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GeoImportReport } from '@/contracts/geoImport';
import { client } from '@/shared/api/client';

// Filename comes from the backend's own `Content-Disposition` (SPEC FE07 §2), date-stamped —
// this hook never invents one. Falls back only if the header is missing or unparseable.
const FILENAME_PATTERN = /filename="?([^";]+)"?/i;

function extractFilename(contentDisposition: string | undefined): string {
  const match = contentDisposition ? FILENAME_PATTERN.exec(contentDisposition) : null;
  return match?.[1] ?? 'esavi-geo-template.xlsx';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ESAVI-GEOLOC-007. `responseType: 'blob'` is what makes client.ts skip the envelope unwrap
// (SPEC FE07 §1.C) — the 200 here has no envelope, it's the raw .xlsx. Not a `useQuery`: a
// download isn't a cacheable read, and TanStack shouldn't hold a multi-megabyte Blob under a key.
export function useGenerateGeoTemplate() {
  return useMutation({
    mutationFn: async (includeExisting: boolean) => {
      const response = await client.get<Blob>('/geo-locations/import/template', {
        params: { includeExisting },
        responseType: 'blob',
      });
      triggerDownload(response.data, extractFilename(response.headers['content-disposition']));
    },
  });
}

interface ImportGeoDataVariables {
  file: File;
  dryRun: boolean;
}

// ESAVI-GEOLOC-006. `dryRun` travels as a string because it rides a FormData field, not JSON.
export function useImportGeoData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, dryRun }: ImportGeoDataVariables): Promise<GeoImportReport> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dryRun', String(dryRun));

      const response = await client.post<GeoImportReport>('/geo-locations/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (_report, { dryRun }) => {
      // SPEC FE07 §3.4: a dry run wrote nothing, so invalidating here would drop two 30-minute
      // catalog caches for zero real change.
      if (!dryRun) {
        void queryClient.invalidateQueries({ queryKey: ['geoLocation'] });
        void queryClient.invalidateQueries({ queryKey: ['healthFacility'] });
      }
    },
  });
}

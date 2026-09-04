import { useQuery } from '@tanstack/react-query';
import type { SystemConfigDetail } from '@/contracts/declared/systemConfig';
import { client } from '@/shared/api/client';
import { EsaviApiError } from '@/shared/api/types';

const COUNTRY_ISO_CODE_CONFIG_CODE = 'ESAVI_APP_COUNTRY_ISO_CODE';
const COUNTRY_ISO_CODE_FALLBACK = import.meta.env.VITE_ESAVI_APP_COUNTRY_ISO_CODE as string;

// ESAVI-SYSCONF-006 — resolves the country ISO code the case-opening step sends on every
// `ESAVI-CASE-001`, never asked to the user (SPEC FE10 §2). `systemConfig` wins over the
// environment (SPEC F43 §3.6): a 404 means the row hasn't been created yet — a dependency of the
// other repository this spec functions without (CASE-PROCESS.md §10.1) — and falls back to
// `VITE_ESAVI_APP_COUNTRY_ISO_CODE` without surfacing an error to the user. Any other status is a
// real problem with the endpoint itself and propagates: swallowing a 500 here would hide a broken
// systemConfig service behind what looks like a missing seed row.
export function useCountryIsoCode() {
  return useQuery({
    queryKey: ['systemConfig', 'byCode', COUNTRY_ISO_CODE_CONFIG_CODE],
    queryFn: async () => {
      try {
        const response = await client.get<SystemConfigDetail>(
          `system-configs/code/${COUNTRY_ISO_CODE_CONFIG_CODE}`,
        );
        return String(response.data.value);
      } catch (error) {
        if (error instanceof EsaviApiError && error.status === 404) {
          return COUNTRY_ISO_CODE_FALLBACK;
        }
        throw error;
      }
    },
    // Configuration, not case data — it changes when an administrator changes it, not during an
    // alta (SPEC FE10 §3.4: "dos altos, el resto ninguno").
    staleTime: 30 * 60 * 1000,
  });
}

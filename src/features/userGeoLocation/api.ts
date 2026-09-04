import { useQuery } from '@tanstack/react-query';
import type { UserGeoCoverage } from '@/contracts/declared/userGeoLocation';
import { client } from '@/shared/api/client';

// ESAVI-USERGEO-008 — the only endpoint this feature declares (SPEC FE10 §3.1): `CaseOpeningStep`
// imports it to cross the health-facility search against the caller's coverage. Every other
// `appUserGeoLocation` operation belongs to whichever spec eventually builds the user-management
// screens, not to this one.
export function useUserGeoCoverage(userId: string) {
  return useQuery({
    queryKey: ['userGeoLocation', 'coverage', userId],
    queryFn: async () => {
      const response = await client.get<UserGeoCoverage>(`user-geo-locations/user/${userId}/coverage`);
      return response.data;
    },
    enabled: !!userId,
    // Configuration of who covers what — changes when an administrator changes it, not during an
    // alta (SPEC FE10 §3.4: "dos altos, el resto ninguno").
    staleTime: 30 * 60 * 1000,
  });
}

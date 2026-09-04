import { useQuery } from '@tanstack/react-query';
import type { CreatePatientInput } from '@/contracts/patient';
import type { PatientDetail, PatientListRow, PatientNameSearchResponse } from '@/contracts/declared/patient';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import { client } from '@/shared/api/client';
import { createResource } from '@/shared/api/createResource';

// POST   /api/patients                       ESAVI-PATIENT-001   USER   create
// GET    /api/patients                       ESAVI-PATIENT-002A  USER   active listing — unused (SPEC FE10 §2, no patient screen)
// GET    /api/patients/admin                 ESAVI-PATIENT-002B  ADMIN  incl. inactive — unused, same reason
// GET    /api/patients/search/:identifier    ESAVI-PATIENT-006   USER   exact match by document/passport/healthSystemCode
// GET    /api/patients/search-by-name        ESAVI-PATIENT-007   USER   token search by name
// GET    /api/patients/:id                   ESAVI-PATIENT-003   USER   detail, in reentry
// PUT    /api/patients/:id                   ESAVI-PATIENT-004   USER   edit from the wizard
// DELETE /api/patients/:id                   ESAVI-PATIENT-005A  ADMIN  deactivate — out of scope (SPEC FE10 §2)
// PATCH  /api/patients/activate/:id          ESAVI-PATIENT-005B  SUPERADMIN — out of scope, same reason
export const patientResource = createResource<PatientDetail, CreatePatientInput, Partial<CreatePatientInput>>({
  key: 'patient',
  path: 'patients',
  idField: 'patientId',
  inactiveMode: 'adminPath',
  // Required by `assertConfig` with `inactiveMode: 'adminPath'`, even though `useList` is never
  // called (no patient listing screen — SPEC FE10 §2). Same case as `healthFacility`.
  adminPath: 'patients/admin',
});

export interface PatientSearchByIdentifierParams {
  identifier: string;
  page?: number;
  pageSize: number;
}

// ESAVI-PATIENT-006 — exact match over documentNumber, passportNumber and healthSystemCode.
// `createResource` has no notion of a search route — `useList` always hits `config.path` — so
// this hook lives beside the resource declaration, same reasoning as `useHealthFacilitySearch`.
export function usePatientSearchByIdentifier(params: PatientSearchByIdentifierParams) {
  const { identifier, page, pageSize } = params;
  const trimmed = identifier.trim();
  const limit = pageSize;
  const offset = ((page ?? 1) - 1) * pageSize;

  return useQuery({
    queryKey: ['patient', 'searchByIdentifier', trimmed, { limit, offset }],
    queryFn: async () => {
      const response = await client.get<PaginatedResponse<PatientListRow>>(
        `patients/search/${encodeURIComponent(trimmed)}`,
        { params: { limit, offset } },
      );
      return response.data;
    },
    // The backend 400s an empty identifier; this hook never fires for it. No minimum beyond
    // non-empty — unlike -007, -006 is exact match, so there's no ambiguous short-string case.
    enabled: trimmed.length > 0,
    // No `staleTime` on purpose (SPEC FE10 §3.4): between two searches of the same document,
    // someone else may have just registered the patient the first search didn't find.
  });
}

export interface PatientSearchByNameParams {
  name: string;
  page?: number;
  pageSize: number;
}

// ESAVI-PATIENT-007 — token search over `nameTokens`. The response is `PatientNameSearchResponse`
// (declared by hand, `src/contracts/declared/patient.ts`), never `PaginatedResponse<T>`:
// `inactiveCount` is computed regardless of role (SPEC F45 §3.3), so a USER who cannot see
// inactive rows still gets the signal instead of silently duplicating a patient.
export function usePatientSearchByName(params: PatientSearchByNameParams) {
  const { name, page, pageSize } = params;
  const trimmed = name.trim();
  const limit = pageSize;
  const offset = ((page ?? 1) - 1) * pageSize;

  return useQuery({
    queryKey: ['patient', 'searchByName', trimmed, { limit, offset }],
    queryFn: async () => {
      const response = await client.get<PatientNameSearchResponse>('patients/search-by-name', {
        params: { name: trimmed, limit, offset },
      });
      return response.data;
    },
    // The backend 400s an empty name; the real minimum length is whatever `toNameTokens`
    // produces at least one token from — the client imposes nothing beyond non-empty (SPEC FE10
    // §3.4: "el mínimo real lo impone el backend").
    enabled: trimmed.length > 0,
    // No `staleTime`, same reasoning as -006.
  });
}

import { useQuery } from '@tanstack/react-query';
import type { CurrentUser } from '@/contracts/declared/auth';
import { client } from '@/shared/api/client';

// ESAVI-USER-007 — única fuente del usuario y de su nivel efectivo (SPEC FE01 §1, hallazgo A).
// La respuesta del login no se guarda en ningún sitio: no trae `level` por rol.
async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await client.get<CurrentUser>('/users/me');
  return response.data;
}

interface UseCurrentUserOptions {
  enabled?: boolean;
}

export function useCurrentUser(options?: UseCurrentUserOptions) {
  return useQuery({
    queryKey: ['user', 'me'],
    queryFn: fetchCurrentUser,
    // El rol no cambia en mitad de una sesión; el backend lo recarga en cada petición de
    // todas formas (SPEC FE01 §3.4). Se invalida a mano tras login, cambio de contraseña o logout.
    staleTime: Infinity,
    // Un 401 real ya lo resuelve la cola de refresh de client.ts antes de que este hook lo vea;
    // si sigue fallando, reintentar en silencio no cambia el resultado — el estado de error del
    // arranque (SPEC FE01 §3.6) ofrece un botón de reintentar manual.
    retry: false,
    enabled: options?.enabled,
  });
}

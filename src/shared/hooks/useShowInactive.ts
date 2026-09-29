import { useSearchParams } from 'react-router-dom';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';

export const SHOW_INACTIVE_PARAM = 'includeInactive';

// SPEC FE29 §3.4: the URL is the only source of the case-file toggle. Below ADMIN — the real level
// of the ten `002B` — a hand-written `?includeInactive=true` is ignored, and `createResource`
// enforces the same level again. Lives in `shared/` because the switch (esaviCase) and the ten
// lists (notification, investigation) all read it (CONVENTIONS.md §3).
export function useShowInactive(): boolean {
  const [searchParams] = useSearchParams();
  const canViewDeleted = useCan(ROLE_LEVELS.ADMIN);
  return canViewDeleted && searchParams.get(SHOW_INACTIVE_PARAM) === 'true';
}

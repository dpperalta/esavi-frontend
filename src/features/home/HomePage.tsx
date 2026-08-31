import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/api';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { getEffectiveRoleName } from '@/shared/config/roles';
import { EsaviApiError } from '@/shared/api/types';

// ESAVI-USER-007 is the only source shown here — never the login response's `user`
// (SPEC FE01 §1, finding A), which carries no `level` and could already be stale.
export function HomePage() {
  const { t } = useTranslation();
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-5 w-40" />
      </div>
    );
  }

  if (isError || !user) {
    const message =
      error instanceof EsaviApiError && error.code === 'NETWORK_ERROR'
        ? t('errors.network')
        : t('errors.unexpected');

    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const roleName = getEffectiveRoleName(user.roles);

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-medium">{t('home.greeting', { name: user.displayName })}</h1>
      {roleName && (
        <p className="text-muted-foreground">{t('home.roleLabel', { role: roleName })}</p>
      )}
    </div>
  );
}

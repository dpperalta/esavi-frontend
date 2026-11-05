import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/api';
import { ActivitySection } from '@/features/dashboard/ActivitySection';
import { PendingWorkBlock } from '@/features/dashboard/PendingWorkBlock';
import { SurveillanceSection } from '@/features/dashboard/SurveillanceSection';
import { SystemActivitySection } from '@/features/dashboard/SystemActivitySection';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { getEffectiveRoleName, ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { EsaviApiError } from '@/shared/api/types';

// ESAVI-USER-007 is the only source shown here — never the login response's `user`
// (SPEC FE01 §1, finding A), which carries no `level` and could already be stale.
export function HomePage() {
  const { t } = useTranslation();
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser();
  const canSeePendingWork = useCan(ROLE_LEVELS.USER);
  const canSeeSurveillance = useCan(ROLE_LEVELS.ANALYTICS);
  const canSeeSystemActivity = useCan(ROLE_LEVELS.SUPERADMIN);

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">{t('home.greeting', { name: user.displayName })}</h1>
        {roleName && (
          <p className="text-muted-foreground">{t('home.roleLabel', { role: roleName })}</p>
        )}
      </div>
      {/* Each block is gated by the minimum role of its own route and not mounted below it, so no
          request that would 403 is ever made (SPEC FE34 §6). ESAVI-DASH-006 and ESAVI-DASH-011
          are USER; ESAVI-DASH-007 is ANALYTICS (SPEC FE35); ESAVI-DASH-012 is SUPERADMIN.
          «Actividad» is a snapshot with no period, so it sits above the period bar, and
          «Sistema» is administration, so it goes last (SPEC FE38 §6). */}
      {canSeePendingWork && <PendingWorkBlock roleName={roleName} />}
      {canSeePendingWork && <ActivitySection />}
      {canSeeSurveillance && <SurveillanceSection />}
      {canSeeSystemActivity && <SystemActivitySection />}
    </div>
  );
}

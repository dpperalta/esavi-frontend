import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { userResource } from './api';
import { UserFormDialog } from './UserFormDialog';
import { UserRolesCard } from './UserRolesCard';

type ConfirmAction = 'deactivate' | 'activate';

function formatTimestamp(value: string | null): string {
  return value ? format(new Date(value), 'dd/MM/yyyy') : '—';
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

// ESAVI-USER-003 — the ficha as a page, not a panel: it has a URL of its own, which is what gets
// passed to another administrator, and it is where SPEC FE22's geographic coverage will land as a
// third block (§6). No <AuditTrail> here: it lives in the listing's Sheet, and the same content in
// two places is the same content twice (§6).
export function UserDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const userId = id ?? '';
  const user = userResource.useOne(userId);
  const canEdit = useCan(ROLE_LEVELS.ADMIN);
  // ESAVI-USER-005B is SUPERADMIN in the inventory, so the button is not even rendered below that.
  const canActivate = useCan(ROLE_LEVELS.SUPERADMIN);

  const deactivate = userResource.useDeactivate();
  const activate = userResource.useActivate!();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  function handleConfirm() {
    if (!confirmAction) {
      return;
    }
    // ESAVI-USER-005A / ESAVI-USER-005B
    const mutation = confirmAction === 'deactivate' ? deactivate : activate;
    const action = confirmAction;
    mutation.mutate(userId, {
      onSuccess: () => {
        toast.success(
          t(action === 'deactivate' ? 'common.toast.deactivated' : 'common.toast.activated'),
        );
        setConfirmAction(null);
      },
      onError: (error) => {
        // `USER_005A_SELF_DEACTIVATION` and `USER_005A_LAST_SUPERADMIN` have a text of their own in
        // `ERROR_CODE_KEYS`; neither belongs to a field of any form on this page (§3.5).
        if (error instanceof EsaviApiError) {
          toast.error(getErrorMessage(error));
        }
        setConfirmAction(null);
      },
    });
  }

  if (user.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  // USER_003_NOT_FOUND — its own screen with a way back, never a blank page (§3.6).
  if (user.error instanceof EsaviApiError && user.error.status === 404) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('user.detail.notFound')}</p>
        <Button asChild type="button" variant="outline">
          <Link to="/users">{t('user.detail.backToList')}</Link>
        </Button>
      </div>
    );
  }

  if (user.isError || !user.data) {
    const message =
      user.error instanceof EsaviApiError
        ? getErrorMessage(user.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-destructive">{message}</p>
        <Button type="button" variant="outline" onClick={() => void user.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  const { displayName, email, username, phone, requiresPasswordChange, isActive, createdAt } =
    user.data;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium text-foreground">{displayName}</h1>
          {!isActive && <Badge variant="destructive">{t('user.detail.inactive')}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* An inactive user's editing controls are hidden, not disabled (§3.6). */}
          {canEdit && isActive && (
            <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
              {t('common.actions.edit')}
            </Button>
          )}
          {canEdit && isActive && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction('deactivate')}
              disabled={deactivate.isPending}
            >
              {t('common.actions.deactivate')}
            </Button>
          )}
          {canActivate && !isActive && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction('activate')}
              disabled={activate.isPending}
            >
              {t('common.actions.activate')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => navigate('/users')}>
            {t('user.detail.backToList')}
          </Button>
        </div>
      </div>

      {/* Two columns on desktop, one on mobile: first the data, then the roles (§3.7). */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('user.detail.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <DetailRow label={t('user.field.email')} value={email} />
            <DetailRow label={t('user.field.username')} value={username ?? '—'} />
            <DetailRow label={t('user.field.phone')} value={phone ?? '—'} />
            <DetailRow label={t('user.columns.createdAt')} value={formatTimestamp(createdAt)} />
            {requiresPasswordChange && (
              <p className="text-xs text-muted-foreground">
                {t('user.form.requiresPasswordChange')}
              </p>
            )}
          </CardContent>
        </Card>

        <UserRolesCard userId={userId} readOnly={!isActive} />
      </div>

      <UserFormDialog open={editOpen} userId={userId} onOpenChange={setEditOpen} />

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                confirmAction === 'activate'
                  ? 'common.confirm.activate'
                  : 'common.confirm.deactivate',
              )}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t(
                confirmAction === 'activate'
                  ? 'common.actions.activate'
                  : 'common.actions.deactivate',
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

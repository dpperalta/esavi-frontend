import { useId, useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { UserRoleAssignment } from '@/contracts/declared/appUserRole';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { useAppRoles, useReinstateUserRole, useUserRoleHistory, userRoleHistoryKey } from './api';

interface UserRoleHistorySheetProps {
  userId: string;
  readOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Both 409s of `005B` mean the history on screen is stale (SPEC FE28 §3.5).
const STALE_HISTORY_CODES = new Set([
  'USERROLE_005B_ALREADY_ACTIVE',
  'USERROLE_005B_ASSIGNMENT_EXISTS',
]);

function formatDate(value: string | null): string {
  return value ? format(new Date(value), 'dd/MM/yyyy') : '—';
}

export function UserRoleHistorySheet({
  userId,
  readOnly,
  open,
  onOpenChange,
}: UserRoleHistorySheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const idPrefix = useId();
  const canReinstate = useCan(ROLE_LEVELS.SUPERADMIN);

  // ESAVI-USERROLE-002B — silent while the sheet is closed.
  const history = useUserRoleHistory(userId, open);
  // ESAVI-APPROLE-002A — only decides which revoked rows may be reinstated; it filters nothing.
  const appRoles = useAppRoles();
  const reinstate = useReinstateUserRole();

  const [pendingUserRoleId, setPendingUserRoleId] = useState<string | null>(null);

  const rows = history.data?.rows ?? [];
  const activeRoleIds = appRoles.isSuccess
    ? new Set(appRoles.data.rows.map((role) => role.roleId))
    : null;
  const showReinstate = canReinstate && !readOnly;

  function handleConfirm() {
    if (!pendingUserRoleId) {
      return;
    }
    // ESAVI-USERROLE-005B
    reinstate.mutate(
      { userRoleId: pendingUserRoleId, userId },
      {
        onSuccess: () => {
          toast.success(t('common.toast.activated'));
          setPendingUserRoleId(null);
        },
        onError: (error) => {
          if (error instanceof EsaviApiError) {
            if (STALE_HISTORY_CODES.has(error.code)) {
              void queryClient.invalidateQueries({ queryKey: userRoleHistoryKey(userId) });
            }
            toast.error(getErrorMessage(error));
          } else {
            toast.error(t('common.errors.unexpected'));
          }
          setPendingUserRoleId(null);
        },
      },
    );
  }

  function renderReinstate(row: UserRoleAssignment) {
    // Hidden, not disabled, for whoever will never be able to press it (ARCHITECTURE.md §4.4).
    if (row.isActive || !showReinstate) {
      return null;
    }
    // While the catalog loads the button waits disabled and silent: a role that has not arrived
    // yet is not a retired one (§3.5).
    const catalogLoading = activeRoleIds === null;
    const roleRetired = !catalogLoading && !activeRoleIds.has(row.roleId);
    const warningId = `${idPrefix}-retired-${row.userRoleId}`;

    return (
      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="md:h-8"
          disabled={catalogLoading || roleRetired}
          aria-describedby={roleRetired ? warningId : undefined}
          onClick={() => setPendingUserRoleId(row.userRoleId)}
        >
          {t('common.actions.activate')}
        </Button>
        {roleRetired && (
          <p id={warningId} className="text-xs text-muted-foreground">
            {t('user.roleHistory.roleRetired')}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>{t('user.roleHistory.title')}</SheetTitle>
            <SheetDescription>{t('user.roleHistory.description')}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4 pb-4">
            {history.isLoading && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {history.isError && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-destructive">
                  {history.error instanceof EsaviApiError
                    ? getErrorMessage(history.error)
                    : t('common.errors.unexpected')}
                </p>
                <Button type="button" variant="outline" onClick={() => void history.refetch()}>
                  {t('common.table.retry')}
                </Button>
              </div>
            )}

            {history.isSuccess && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('user.roleHistory.empty')}</p>
            )}

            {history.isSuccess && rows.length > 0 && (
              <ul className="flex flex-col gap-3">
                {rows.map((row) => (
                  <li
                    key={row.userRoleId}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {row.role.name}
                      </span>
                      <Badge variant={row.isActive ? 'secondary' : 'destructive'}>
                        {t(
                          row.isActive
                            ? 'user.roleHistory.status.active'
                            : 'user.roleHistory.status.revoked',
                        )}
                      </Badge>
                    </div>

                    <dl className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {/* Below md a revoked row keeps only the date that matters to it (§3.7). */}
                      <div className={row.isActive ? 'flex gap-1' : 'hidden gap-1 md:flex'}>
                        <dt>{t('user.roleHistory.assignedAt')}</dt>
                        <dd>{formatDate(row.createdAt)}</dd>
                      </div>
                      {!row.isActive && (
                        <div className="flex gap-1">
                          <dt>{t('user.roleHistory.revokedAt')}</dt>
                          <dd>{formatDate(row.deletedAt)}</dd>
                        </div>
                      )}
                    </dl>

                    {renderReinstate(row)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingUserRoleId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !reinstate.isPending) {
            setPendingUserRoleId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm.activate')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reinstate.isPending}>
              {t('common.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reinstate.isPending}
              onClick={(event) => {
                // Kept open until `005B` answers, so `isPending` has a button to disable (§3.4).
                event.preventDefault();
                handleConfirm();
              }}
            >
              {t('common.actions.activate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

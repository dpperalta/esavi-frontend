import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AssignedUser } from '@/contracts/declared/appUserRole';
import { Button } from '@/shared/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { useRoleHolders } from './api';

interface AppRoleHoldersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string | null;
}

const PAGE_SIZE = 10;

// The five columns of USER_ATTRIBUTES arrive decrypted but optional, and the narrow user of this
// response has no `displayName` — that one is composed by ESAVI-USER-003, which this listing is
// not. Falls back so a row is never blank.
function holderLabel(user: AssignedUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.username || user.email || user.userId;
}

// Its page lives in `useState` and not in `searchParams` — the one declared exception to the rule
// of §3.4: the panel opens from a row and closes there, and its page has no business surviving
// in a link to the listing.
export function AppRoleHoldersSheet({ open, onOpenChange, roleId }: AppRoleHoldersSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);

  // A different role reuses this panel, so its page starts over rather than opening on page 3
  // of somebody else's holders.
  useEffect(() => {
    setPage(1);
  }, [roleId]);

  // ESAVI-USERROLE-006 — silent while `roleId` is null, which is how the panel stays closed.
  const holders = useRoleHolders(open && roleId ? roleId : '', { page, pageSize: PAGE_SIZE });
  const rows = holders.data?.rows ?? [];
  const count = holders.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('appRole.holders.title')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          {holders.isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}

          {!holders.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('appRole.holders.empty')}</p>
          )}

          {rows.map((row) => (
            <Link
              key={row.userRoleId}
              to={`/users/${row.userId}`}
              className="flex flex-col rounded-lg border border-border p-3 hover:bg-accent"
              onClick={() => onOpenChange(false)}
            >
              <span className="font-medium text-foreground">{holderLabel(row.user)}</span>
              {row.user.email && (
                <span className="text-sm text-muted-foreground">{row.user.email}</span>
              )}
            </Link>
          ))}

          {pages > 1 && (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                {t('common.table.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('common.table.pageStatus', { page, pages, count })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('common.table.next')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

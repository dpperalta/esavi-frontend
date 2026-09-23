import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import {
  useBulkAssignRoles,
  useRevokeUserRole,
  useUserRoleAssignments,
  userRoleAssignmentsKey,
} from './api';
import { UserRoleCheckboxGroup } from './UserRoleCheckboxGroup';

interface UserRolesCardProps {
  userId: string;
  // An inactive user's ficha hides its editing controls (SPEC FE20 §3.6); the selection is still
  // shown, because what roles someone held is exactly what you come here to read.
  readOnly?: boolean;
}

export function UserRolesCard({ userId, readOnly = false }: UserRolesCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canEdit = useCan(ROLE_LEVELS.ADMIN);
  // ESAVI-USERROLE-002A — the assignments in force, and the only read that carries `userRoleId`.
  const assignments = useUserRoleAssignments(userId);
  const bulkAssign = useBulkAssignRoles();
  const revoke = useRevokeUserRole();

  // The draft of a form, not a copy of the server (SPEC FE20 §3.4, declared exception): it only
  // lives while the block is unsaved, is reseeded when the query changes, and is dropped on save.
  const [selected, setSelected] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const assigned = assignments.data?.rows ?? [];
  // The identity of what the server holds, so an external change — another administrator, the
  // invalidation after saving — reseeds the draft, and a mere refetch of the same rows does not.
  const assignedSignature = assigned
    .map((row) => row.roleId)
    .sort()
    .join(',');

  useEffect(() => {
    setSelected(assignedSignature ? assignedSignature.split(',') : []);
  }, [assignedSignature]);

  const toAdd = selected.filter((roleId) => !assigned.some((row) => row.roleId === roleId));
  const toRemove = assigned.filter((row) => !selected.includes(row.roleId));
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  async function handleSave() {
    setIsSaving(true);
    try {
      // Additions first: if the batch fails nothing has been revoked yet. The other order leaves
      // the user without the old role and without the new one (§6).
      if (toAdd.length > 0) {
        try {
          // Only the additions travel. A single pair already active answers 409 and aborts the
          // whole batch (appUserRole.service.ts:229-231), so the full set is never sent.
          await bulkAssign.mutateAsync({ userId, roleIds: toAdd });
        } catch (error) {
          if (error instanceof EsaviApiError) {
            if (error.code === 'USERROLE_007_ASSIGNMENT_EXISTS') {
              // The cache was stale: someone else changed this user's roles. Not retried on its
              // own — the second attempt has to start from what is there now (§7).
              void queryClient.invalidateQueries({ queryKey: userRoleAssignmentsKey(userId) });
            }
            toast.error(getErrorMessage(error));
          }
          return;
        }
      }

      // Revocations are one per assignment — `005A` has no bulk form. A failure does not stop the
      // rest: stopping leaves a state just as partial, but arbitrary, because where it cuts depends
      // on the order the list happened to be walked (§6).
      const failed: string[] = [];
      for (const row of toRemove) {
        try {
          await revoke.mutateAsync({ userRoleId: row.userRoleId, userId });
        } catch (error) {
          // The role that could not be revoked, and next to it the reason — the backend's own
          // already-translated `message`, which is what carries `USERROLE_005A_LAST_SUPERADMIN`
          // (§3.5: "en el resumen final, junto al rol que no pudo retirarse").
          const reason = error instanceof EsaviApiError ? error.message : '';
          failed.push(reason ? `${row.role.name} (${reason})` : row.role.name);
        }
      }

      if (failed.length > 0) {
        toast.error(t('user.roles.partial', { roles: failed.join(', ') }));
        return;
      }
      toast.success(t('user.roles.saved'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('user.roles.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {assignments.isLoading && <Skeleton className="h-24 w-full" />}

        {!assignments.isLoading && (
          <>
            {assigned.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('user.roles.empty')}</p>
            )}
            <UserRoleCheckboxGroup
              value={selected}
              onChange={setSelected}
              disabled={readOnly || !canEdit || isSaving}
            />
            {/* Hidden, not disabled, for a role that will never be able to press it — the UI hides
                what the user cannot do (ARCHITECTURE.md §4.4). Disabled is for the other reason:
                there is nothing to save yet. */}
            {canEdit && !readOnly && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!hasChanges || isSaving}
                >
                  {t('user.roles.save')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

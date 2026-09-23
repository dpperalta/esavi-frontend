import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useAppRoles } from './api';

interface UserRoleCheckboxGroupProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

// The active role catalog is a handful of rows, read whole and ordered by level DESC by the backend
// (appRole.service.ts:15), so it needs no search box: a checkbox per role reads the whole set at
// once, reaches 44px on a phone without tricks, and leaves `<SearchableSelect>` untouched — which
// SPEC FE20 §8 requires and §3.5's `multiple` would not have.
//
// Written once here because the alta dialog and the ficha's roles card pick roles the same way.
export function UserRoleCheckboxGroup({ value, onChange, disabled }: UserRoleCheckboxGroupProps) {
  const { t } = useTranslation();
  // ESAVI-APPROLE-002A — active roles only: the selector never offers a role nobody can hold.
  const roles = useAppRoles();

  function handleToggle(roleId: string, checked: boolean) {
    onChange(checked ? [...value, roleId] : value.filter((id) => id !== roleId));
  }

  if (roles.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11 w-48" />
        <Skeleton className="h-11 w-48" />
      </div>
    );
  }

  const rows = roles.data?.rows ?? [];

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((role) => (
        <label
          key={role.roleId}
          className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground"
        >
          <Checkbox
            checked={value.includes(role.roleId)}
            disabled={disabled}
            onCheckedChange={(checked) => handleToggle(role.roleId, checked === true)}
            aria-label={role.name}
          />
          {role.name}
          {/* The level is what makes two similar names distinguishable, and it is also what the
              backend compares against the requester's own to answer ROLE_LEVEL_EXCEEDED. */}
          <span className="text-xs text-muted-foreground">{role.level}</span>
        </label>
      ))}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('common.catalogSelect.empty')}</p>
      )}
    </div>
  );
}

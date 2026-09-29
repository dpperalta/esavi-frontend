import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { SHOW_INACTIVE_PARAM, useShowInactive } from '@/shared/hooks/useShowInactive';

// SPEC FE29 §2: one toggle for the whole case file, on steps 4 and 5 only. Turning it off removes
// the parameter instead of writing 'false', so the URL goes back to exactly what it was before.
export function ShowInactiveSwitch() {
  const { t } = useTranslation();
  const id = useId();
  const descriptionId = `${id}-description`;
  const [, setSearchParams] = useSearchParams();
  const canViewDeleted = useCan(ROLE_LEVELS.ADMIN);
  const checked = useShowInactive();

  if (!canViewDeleted) return null;

  function handleCheckedChange(next: boolean) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next) params.set(SHOW_INACTIVE_PARAM, 'true');
        else params.delete(SHOW_INACTIVE_PARAM);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <div className="flex min-h-11 items-start gap-3 rounded-lg border border-dashed px-3 py-2">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={handleCheckedChange}
        aria-describedby={descriptionId}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {t('caseWizard.showInactive.label')}
        </Label>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {t('caseWizard.showInactive.description')}
        </p>
      </div>
    </div>
  );
}

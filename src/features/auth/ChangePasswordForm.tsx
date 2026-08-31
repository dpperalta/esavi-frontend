import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { EsaviApiError } from '@/shared/api/types';
import { useChangePassword } from './api';
import { changePasswordSchema, type ChangePasswordFormValues } from './schemas';

interface ChangePasswordFormProps {
  // Called after a successful change. The dismissible dialog closes itself here; the required
  // one (SPEC FE01 §3.4) doesn't pass this at all — its `open` already derives from the
  // refetch that this same success triggers.
  onSuccess?: () => void;
}

// Shared by ChangePasswordDialog (dismissible, Topbar) and RequiredPasswordChangeDialog
// (not dismissible, requiresPasswordChange) — the form itself doesn't know which wraps it.
export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
  const { t } = useTranslation();
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = (values: ChangePasswordFormValues) => {
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          toast.success(t('auth.changePassword.success'));
          onSuccess?.();
        },
      },
    );
  };

  // USER_006_INVALID_CREDENTIALS → currentPassword, USER_006_SAME_PASSWORD → newPassword
  // (SPEC FE01 §3.5) — mapped to fields, never to a generic toast.
  const invalidCurrentPassword =
    changePassword.error instanceof EsaviApiError &&
    changePassword.error.code === 'USER_006_INVALID_CREDENTIALS';
  const samePassword =
    changePassword.error instanceof EsaviApiError &&
    changePassword.error.code === 'USER_006_SAME_PASSWORD';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">{t('auth.changePassword.current')}</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword || invalidCurrentPassword}
          {...register('currentPassword')}
        />
        {invalidCurrentPassword && (
          <p className="text-sm text-destructive" role="alert">
            {t('auth.login.invalidCredentials')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">{t('auth.changePassword.new')}</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword || samePassword}
          {...register('newPassword')}
        />
        {samePassword && (
          <p className="text-sm text-destructive" role="alert">
            {t('auth.changePassword.samePassword')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">{t('auth.changePassword.confirm')}</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive" role="alert">
            {t('auth.passwordMismatch')}
          </p>
        )}
      </div>
      <Button type="submit" disabled={changePassword.isPending}>
        {t('auth.changePassword.submit')}
      </Button>
    </form>
  );
}

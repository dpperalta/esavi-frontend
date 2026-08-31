import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { EsaviApiError } from '@/shared/api/types';
import { AuthCard } from './AuthCard';
import { useResetPassword } from './api';
import { resetPasswordSchema, type ResetPasswordFormValues } from './schemas';

// These four codes are not field errors — they mean the token itself is unusable, whichever
// the reason (SPEC FE01 §3.5). appPasswordReset.service.ts is the source, verified in the
// spec's design step.
const INVALID_TOKEN_CODES = [
  'AUTH_007_INVALID_RESET_TOKEN',
  'AUTH_007_RESET_TOKEN_USED',
  'AUTH_007_RESET_TOKEN_INVALIDATED',
  'AUTH_007_RESET_TOKEN_EXPIRED',
];

// Public; reads the token from ?token= (SPEC FE01 §3.1) — never from the form. Without it, or
// once the backend rejects it for any reason, the invalid-link state renders directly instead
// of the form.
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const resetPassword = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  const tokenRejected =
    resetPassword.error instanceof EsaviApiError &&
    INVALID_TOKEN_CODES.includes(resetPassword.error.code);

  if (!token || tokenRejected) {
    return (
      <AuthCard>
        <CardHeader>
          <CardTitle>{t('auth.reset.title')}</CardTitle>
          <CardDescription>{t('auth.reset.invalidLink')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/forgot-password">{t('auth.reset.requestNew')}</Link>
          </Button>
        </CardContent>
      </AuthCard>
    );
  }

  if (resetPassword.isSuccess) {
    return (
      <AuthCard>
        <CardHeader>
          <CardTitle>{t('auth.reset.title')}</CardTitle>
          <CardDescription>{t('auth.reset.success')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/login" className="text-sm text-primary underline-offset-4 hover:underline">
            {t('auth.forgot.backToLogin')}
          </Link>
        </CardContent>
      </AuthCard>
    );
  }

  const onSubmit = (values: ResetPasswordFormValues) =>
    resetPassword.mutate({ token, newPassword: values.newPassword });

  return (
    <AuthCard>
      <CardHeader>
        <CardTitle>{t('auth.reset.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">{t('auth.reset.newPassword')}</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...register('newPassword')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">{t('auth.reset.confirmPassword')}</Label>
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
          <Button type="submit" disabled={resetPassword.isPending}>
            {t('auth.reset.submit')}
          </Button>
        </form>
      </CardContent>
    </AuthCard>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { AuthCard } from './AuthCard';
import { useForgotPassword } from './api';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from './schemas';

// Public. The success screen shows unconditionally on a 2xx response — ESAVI-AUTH-006 answers
// 200 whether or not the email exists, and distinguishing the two here would reopen the
// account-enumeration oracle the backend closed (SPEC FE01 §3.5).
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgotPassword = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = (values: ForgotPasswordFormValues) => forgotPassword.mutate(values);

  if (forgotPassword.isSuccess) {
    return (
      <AuthCard>
        <CardHeader>
          <CardTitle>{t('auth.forgot.sentTitle')}</CardTitle>
          <CardDescription>{t('auth.forgot.sentDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/login" className="text-sm text-primary underline-offset-4 hover:underline">
            {t('auth.forgot.backToLogin')}
          </Link>
        </CardContent>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <CardHeader>
        <CardTitle>{t('auth.forgot.title')}</CardTitle>
        <CardDescription>{t('auth.forgot.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t('auth.login.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
          </div>
          <Button type="submit" disabled={forgotPassword.isPending}>
            {t('auth.forgot.submit')}
          </Button>
          <Link
            to="/login"
            className="text-center text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('auth.forgot.backToLogin')}
          </Link>
        </form>
      </CardContent>
    </AuthCard>
  );
}

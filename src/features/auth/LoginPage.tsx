import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { EsaviApiError } from '@/shared/api/types';
import { tokenStore } from '@/shared/api/tokenStore';
import { AuthCard } from './AuthCard';
import { useCurrentUser, useLogin } from './api';
import { loginSchema, type LoginFormValues } from './schemas';

interface RouteState {
  from?: { pathname: string };
}

// Public; redirects to / with an active session (SPEC FE01 §3.1). Gates on hasRefreshToken
// like RequireAuth/useCan so a first-time visitor's mount doesn't fire a doomed refresh.
export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRefreshToken = tokenStore.getRefreshToken() !== null;
  const { data: user } = useCurrentUser({ enabled: hasRefreshToken });
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const destination = (location.state as RouteState | null)?.from?.pathname ?? '/';

  if (user) {
    return <Navigate to={destination} replace />;
  }

  const onSubmit = (values: LoginFormValues) => {
    login.mutate(values, {
      onSuccess: () => navigate(destination, { replace: true }),
    });
  };

  // AUTH_001_INVALID_CREDENTIALS goes under the form, not to a field (SPEC FE01 §3.5) — naming
  // which of the two was wrong turns the screen into an account-enumeration oracle.
  const invalidCredentials =
    login.error instanceof EsaviApiError && login.error.code === 'AUTH_001_INVALID_CREDENTIALS';

  return (
    <AuthCard>
      <CardHeader>
        <CardTitle>{t('auth.login.title')}</CardTitle>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t('auth.login.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </div>
          {invalidCredentials && (
            <p className="text-sm text-destructive" role="alert">
              {t('auth.login.invalidCredentials')}
            </p>
          )}
          <Button type="submit" disabled={login.isPending}>
            {t('auth.login.submit')}
          </Button>
          <Link
            to="/forgot-password"
            className="text-center text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('auth.login.forgotLink')}
          </Link>
        </form>
      </CardContent>
    </AuthCard>
  );
}

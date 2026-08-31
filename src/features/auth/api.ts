import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CurrentUser, LoginResponse } from '@/contracts/declared/auth';
import { client, setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import type { ForgotPasswordFormValues, LoginFormValues } from './schemas';

// ESAVI-USER-007 — the only source of the user and their effective level (SPEC FE01 §1,
// finding A). The login response isn't stored anywhere: it doesn't carry `level` per role.
async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await client.get<CurrentUser>('/users/me');
  return response.data;
}

interface UseCurrentUserOptions {
  enabled?: boolean;
}

export function useCurrentUser(options?: UseCurrentUserOptions) {
  return useQuery({
    queryKey: ['user', 'me'],
    queryFn: fetchCurrentUser,
    // The role doesn't change mid-session; the backend reloads it on every request anyway
    // (SPEC FE01 §3.4). Invalidated by hand after login, password change or logout.
    staleTime: Infinity,
    // A real 401 is already resolved by client.ts's refresh queue before this hook sees it;
    // if it keeps failing, silently retrying doesn't change the outcome — the startup error
    // state (SPEC FE01 §3.6) offers a manual retry button.
    retry: false,
    enabled: options?.enabled,
  });
}

// ESAVI-AUTH-001
async function login(credentials: LoginFormValues): Promise<LoginResponse> {
  const response = await client.post<LoginResponse>('/auth/login', credentials);
  return response.data;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    onSuccess: ({ token, refreshToken }) => {
      setAccessToken(token);
      tokenStore.setRefreshToken(refreshToken);
      // The login response's `user` is discarded here — it has no `level` (SPEC FE01 §1,
      // finding A). Invalidating forces ['user','me'] to refetch with the new access token.
      void queryClient.invalidateQueries({ queryKey: ['user', 'me'] });
    },
  });
}

// ESAVI-AUTH-006. Always answers 200, whether or not the email exists (SPEC FE01 §3.5) — the
// client never distinguishes the two, so the mutation's shape doesn't leak that either.
async function forgotPassword(payload: ForgotPasswordFormValues): Promise<void> {
  await client.post('/auth/forgot-password', payload);
}

export function useForgotPassword() {
  return useMutation({ mutationFn: forgotPassword });
}

// ESAVI-AUTH-007. confirmPassword never leaves the form — the backend only takes token and
// newPassword (SPEC FE01 §3.5).
async function resetPassword(payload: { token: string; newPassword: string }): Promise<void> {
  await client.post('/auth/reset-password', payload);
}

export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}

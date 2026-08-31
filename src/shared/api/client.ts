import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { tokenStore } from './tokenStore';
import { EsaviApiError, type ApiErrorEnvelope, type ApiSuccessEnvelope } from './types';

// API-CONTRACT.md §1. VITE_API_BASE_URL is required — see .env.example. CORS_ORIGINS on the
// backend already includes 5173 without touching anything (CLAUDE.md).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set — copy .env.example to .env.development');
}

// The access token lives in memory, not in persistent storage (ARCHITECTURE.md §11.1 —
// phase 1). It's lost on reload; refreshAccessToken() repopulates it on the first refresh.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const client = axios.create({
  baseURL: API_BASE_URL,
});

client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  // API-CONTRACT.md §6: without this the UI stays in the chosen language while server
  // messages arrive in Spanish, the default.
  config.params = {
    ...config.params,
    lang: usePreferencesStore.getState().language,
  };

  return config;
});

function toEsaviApiError(error: AxiosError<ApiErrorEnvelope>): EsaviApiError {
  if (error.response) {
    const { message, code } = error.response.data;
    return new EsaviApiError(message, error.response.status, code);
  }
  // No response: the request never reached the server (network down, CORS, server offline).
  // There's no backend `code` to keep; NETWORK_ERROR is the client's own, not the contract's.
  return new EsaviApiError(error.message, 0, 'NETWORK_ERROR');
}

// CONVENTIONS.md §6.6: any code ending in _REFRESH_TOKEN_REUSED —AUTH_002 while refreshing,
// AUTH_003 while logging out, both share the backend's helper (auth.service.ts:136,160)—
// means the session is compromised or duplicated. Compared by suffix, not by exact string:
// both codes are valid and neither is retried.
function isRefreshTokenReused(code: string): boolean {
  return code.endsWith('_REFRESH_TOKEN_REUSED');
}

function clearSession() {
  setAccessToken(null);
  tokenStore.clearRefreshToken();
}

// The five public auth endpoints (API-ROUTES.md's "sin fila" section, SPEC FE01 §3.2) never
// carried a session to begin with — a 401 from them is a real answer (bad credentials, bad
// reset token), not an expired access token. /auth/refresh isn't listed: it's never called
// through `client` in the first place (see performRefresh above).
const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function isPublicAuthRequest(url: string | undefined): boolean {
  return url !== undefined && PUBLIC_AUTH_PATHS.some((path) => url.endsWith(path));
}

// A single refresh in flight (CONVENTIONS.md §6.6, API-CONTRACT.md §3.2): two requests that
// get a 401 at the same time share this one promise instead of firing two POST /auth/refresh
// — the second would use an already-consumed token and revoke every session of the user.
// Called with plain axios, not `client`: going through `client`'s interceptors would retry
// this same POST if the refresh itself returns 401, and a refresh is never retried.
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    // No session to refresh. Client-only code: the backend never emits it because it never
    // gets to see this request at all.
    throw new EsaviApiError('No refresh token', 401, 'AUTH_002_NO_REFRESH_TOKEN');
  }

  try {
    const response = await axios.post<
      ApiSuccessEnvelope<{ token: string; refreshToken: string; expiresAt: string }>
    >(`${API_BASE_URL}/auth/refresh`, { refreshToken });

    const { token, refreshToken: newRefreshToken } = response.data.data;
    setAccessToken(token);
    tokenStore.setRefreshToken(newRefreshToken);
    return token;
  } catch (error) {
    const apiError = toEsaviApiError(error as AxiosError<ApiErrorEnvelope>);
    if (isRefreshTokenReused(apiError.code) || apiError.status === 401) {
      clearSession();
    }
    throw apiError;
  }
}

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

client.interceptors.response.use(
  (response) => {
    // API-CONTRACT.md §2: the interceptor unwraps the envelope here, once.
    // From this line on, response.data IS the real payload — nobody else unwraps it.
    const envelope = response.data as ApiSuccessEnvelope<unknown>;
    response.data = envelope.data;
    return response;
  },
  async (error: AxiosError<ApiErrorEnvelope>) => {
    const status = error.response?.status;
    const code = error.response?.data.code;
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (status === 401 && code && isRefreshTokenReused(code)) {
      clearSession();
      return Promise.reject(toEsaviApiError(error));
    }

    if (
      status === 401 &&
      originalRequest &&
      !isPublicAuthRequest(originalRequest.url) &&
      !originalRequest._retriedAfterRefresh
    ) {
      originalRequest._retriedAfterRefresh = true;
      try {
        await refreshAccessToken();
        // The request interceptor reads `accessToken` again —already updated— on resend.
        return client(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(toEsaviApiError(error));
  },
);

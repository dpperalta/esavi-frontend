import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { tokenStore } from './tokenStore';
import { EsaviApiError, type ApiErrorEnvelope, type ApiSuccessEnvelope } from './types';

// API-CONTRACT.md §1. Sin variable de entorno todavía: el único destino hoy es el backend
// local en 4500, y CORS_ORIGINS ya incluye 5173 sin tocar nada (CLAUDE.md).
const API_BASE_URL = 'http://localhost:4500/api';

// El access token vive en memoria, no en almacenamiento persistente (ARCHITECTURE.md §11.1 —
// fase 1). Se pierde al recargar; refreshAccessToken() lo repuebla con el primer refresh.
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

  // API-CONTRACT.md §6: sin esto la interfaz queda en el idioma elegido y los mensajes del
  // servidor llegan en español por defecto.
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
  // Sin response: la petición no llegó al servidor (red caída, CORS, servidor apagado).
  // No hay `code` del backend que conservar; NETWORK_ERROR es del cliente, no del contrato.
  return new EsaviApiError(error.message, 0, 'NETWORK_ERROR');
}

// CONVENTIONS.md §6.6: cualquier code terminado en _REFRESH_TOKEN_REUSED —AUTH_002 al refrescar,
// AUTH_003 al hacer logout, ambos comparten el helper del backend (auth.service.ts:136,160)—
// significa que la sesión está comprometida o duplicada. Se compara por sufijo, no por cadena
// exacta: los dos códigos son válidos y ninguno se reintenta.
function isRefreshTokenReused(code: string): boolean {
  return code.endsWith('_REFRESH_TOKEN_REUSED');
}

function clearSession() {
  setAccessToken(null);
  tokenStore.clearRefreshToken();
}

// Un solo refresco en vuelo (CONVENTIONS.md §6.6, API-CONTRACT.md §3.2): dos peticiones que
// reciben 401 a la vez comparten esta misma promesa en lugar de disparar dos POST /auth/refresh
// — el segundo usaría un token ya consumido y revocaría todas las sesiones del usuario.
// Se llama con axios "pelado", no con `client`: pasar por los interceptores de `client`
// reintentaría este mismo POST si el refresh devuelve 401, y el refresh nunca se reintenta.
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    // No hay sesión que refrescar. Código propio del cliente: el backend nunca lo emite porque
    // nunca llega a verlo.
    throw new EsaviApiError('No hay refresh token', 401, 'AUTH_002_NO_REFRESH_TOKEN');
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
    // API-CONTRACT.md §2: el interceptor desenvuelve el envelope aquí, una sola vez.
    // A partir de esta línea, response.data YA es el payload real — nadie más lo desenvuelve.
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

    if (status === 401 && originalRequest && !originalRequest._retriedAfterRefresh) {
      originalRequest._retriedAfterRefresh = true;
      try {
        await refreshAccessToken();
        // El interceptor de petición vuelve a leer `accessToken` —ya actualizado— al reenviar.
        return client(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(toEsaviApiError(error));
  },
);

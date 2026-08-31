import axios, { AxiosError } from 'axios';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { EsaviApiError, type ApiErrorEnvelope, type ApiSuccessEnvelope } from './types';

// API-CONTRACT.md §1. Sin variable de entorno todavía: el único destino hoy es el backend
// local en 4500, y CORS_ORIGINS ya incluye 5173 sin tocar nada (CLAUDE.md).
const API_BASE_URL = 'http://localhost:4500/api';

// El access token vive en memoria, nunca en localStorage (ARCHITECTURE.md §11.1 — fase 1).
// Se pierde al recargar; el paso 7 lo repuebla con el primer refresh de la sesión.
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

client.interceptors.response.use(
  (response) => {
    // API-CONTRACT.md §2: el interceptor desenvuelve el envelope aquí, una sola vez.
    // A partir de esta línea, response.data YA es el payload real — nadie más lo desenvuelve.
    const envelope = response.data as ApiSuccessEnvelope<unknown>;
    response.data = envelope.data;
    return response;
  },
  (error: AxiosError<ApiErrorEnvelope>) => {
    if (error.response) {
      const { message, code } = error.response.data;
      return Promise.reject(new EsaviApiError(message, error.response.status, code));
    }
    // Sin response: la petición no llegó al servidor (red caída, CORS, servidor apagado).
    // No hay `code` del backend que conservar; NETWORK_ERROR es del cliente, no del contrato.
    return Promise.reject(new EsaviApiError(error.message, 0, 'NETWORK_ERROR'));
  },
);

// ARCHITECTURE.md §11.1 — el refresh token vive detrás de esta interfaz. Fase 1: localStorage.
// Migrar a cookie httpOnly (fase 2) es sustituir tokenStore.ts; ningún otro módulo llama a
// localStorage para esto (CONVENTIONS.md §6.6).
export interface TokenStore {
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  clearRefreshToken(): void;
}

const REFRESH_TOKEN_KEY = 'esavi-refresh-token';

export const tokenStore: TokenStore = {
  getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setRefreshToken(token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },
  clearRefreshToken() {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

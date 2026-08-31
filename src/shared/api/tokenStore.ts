// ARCHITECTURE.md §11.1 — the refresh token lives behind this interface. Phase 1: localStorage.
// Migrating to an httpOnly cookie (phase 2) means replacing tokenStore.ts; no other module
// calls localStorage for this (CONVENTIONS.md §6.6).
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

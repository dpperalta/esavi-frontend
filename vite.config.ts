/// <reference types="vitest/config" />
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
    // A jsdom fork with React 19 + MSW is CPU-bound, so one fork per logical core doubles the CPU
    // the suite burns for the same wall time. The cap is about not saturating the machine while
    // `npm test` runs; it is not what makes the suite deterministic (see src/test/user.ts).
    maxWorkers: 8,
    // The slowest test is ~3s, so this is a 5x margin: enough that a loaded machine never trips it,
    // tight enough that a genuinely hung test still fails fast. Prefer fixing what is slow over
    // raising this — the per-test `}, 20000)` overrides this replaced used to hide a 22s stall.
    testTimeout: 15000,
    env: {
      VITE_API_BASE_URL: 'http://localhost:4500/api',
    },
  },
});

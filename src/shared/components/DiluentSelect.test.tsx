import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DiluentSelect } from './DiluentSelect';

const server = setupServer();
const LONG_WAIT = { timeout: 30000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function diluentRow(overrides: Record<string, unknown> = {}) {
  return {
    diluentCatalogId: 'dil-1',
    code: 'AGUA',
    name: 'Agua estéril',
    description: null,
    composition: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    deletedAt: null,
    appDetails: [],
    ...overrides,
  };
}

function renderSelect(props: { value?: string | null; onChange?: (v: string | null) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiluentSelect value={props.value ?? null} onChange={props.onChange ?? vi.fn()} ariaLabel="Diluyente" />
    </QueryClientProvider>,
  );
}

describe('DiluentSelect', () => {
  it('con el maestro sin semillas, sale deshabilitado con su explicación', async () => {
    server.use(
      http.get('http://localhost:4500/api/diluents', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { count: 0, rows: [] } }),
      ),
    );

    renderSelect();

    const select = await screen.findByRole('combobox', {}, LONG_WAIT);
    expect(select).toBeDisabled();
    expect(await screen.findByText(/diluent\.select\.empty/, {}, LONG_WAIT)).toBeInTheDocument();
  });

  it(
    'con el maestro sembrado, permite elegir un diluyente',
    async () => {
      server.use(
        http.get('http://localhost:4500/api/diluents', () =>
          HttpResponse.json({
            ok: true,
            message: 'ok',
            data: { count: 2, rows: [diluentRow(), diluentRow({ diluentCatalogId: 'dil-2', code: 'SUERO', name: 'Suero fisiológico' })] },
          }),
        ),
      );

      const onChange = vi.fn();
      renderSelect({ onChange });
      const user = setupUser();

      await user.click(await screen.findByRole('combobox', {}, LONG_WAIT));
      await user.click(await screen.findByRole('option', { name: 'Suero fisiológico' }, LONG_WAIT));

      expect(onChange).toHaveBeenCalledWith('dil-2');
    },
    // Same Popover-open environment stall documented in SearchableSelect.test.tsx.
    60000,
  );
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { RoleLevelField } from './RoleLevelField';

const server = setupServer();

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

function signedInAs(name: string, level: number) {
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name, code: name, level }] },
      }),
    ),
  );
}

function renderField(props: Partial<Parameters<typeof RoleLevelField>[0]> = {}) {
  const onChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<RoleLevelField value={null} onChange={onChange} {...props} />, { wrapper: Wrapper });
  return { onChange };
}

describe('RoleLevelField', () => {
  it('con sesión ADMIN no deja escribir 100 y anuncia el tope', async () => {
    signedInAs('ADMIN', 50);
    const user = setupUser();
    const { onChange } = renderField();

    await screen.findByText('Tu nivel máximo es 50.');

    await user.type(screen.getByLabelText('Nivel'), '100');

    await waitFor(() => expect(screen.getByText('El número no es válido.')).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalledWith(100);
  });

  it('con sesión ADMIN acepta el nivel propio', async () => {
    signedInAs('ADMIN', 50);
    const user = setupUser();
    const { onChange } = renderField();

    await screen.findByText('Tu nivel máximo es 50.');

    await user.type(screen.getByLabelText('Nivel'), '50');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(50));
  });

  it('con sesión SUPERADMIN acepta 100', async () => {
    signedInAs('SUPERADMIN', 100);
    const user = setupUser();
    const { onChange } = renderField();

    await screen.findByText('Tu nivel máximo es 100.');

    await user.type(screen.getByLabelText('Nivel'), '100');

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(100));
  });

  it('nombra el nivel cuando coincide con uno conocido, y sólo el número cuando no', async () => {
    signedInAs('SUPERADMIN', 100);
    renderField({ value: 50 });

    expect(await screen.findByText('· ADMIN')).toBeInTheDocument();
  });

  it('no inventa nombre para un nivel intermedio', async () => {
    signedInAs('SUPERADMIN', 100);
    renderField({ value: 60 });

    await screen.findByText('Tu nivel máximo es 100.');
    expect(screen.queryByText(/· [A-Z]+/)).not.toBeInTheDocument();
  });

  it('enumera los cuatro niveles conocidos', async () => {
    signedInAs('ADMIN', 50);
    renderField();

    expect(
      await screen.findByText(
        'Niveles conocidos: 10 ANALYTICS, 25 USER, 50 ADMIN, 100 SUPERADMIN.',
      ),
    ).toBeInTheDocument();
  });
});

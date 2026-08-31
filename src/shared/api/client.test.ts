import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { client, setAccessToken } from './client';
import { tokenStore } from './tokenStore';
import { EsaviApiError } from './types';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
});

describe('client — envelope', () => {
  it('desenvuelve `data` en una respuesta 2xx', async () => {
    server.use(
      http.get('http://localhost:4500/api/ping', () =>
        HttpResponse.json({ ok: true, message: 'ok', data: { pong: true } }),
      ),
    );

    const response = await client.get('/ping');

    expect(response.data).toEqual({ pong: true });
  });

  it('lanza EsaviApiError con code y status en un error del backend', async () => {
    server.use(
      http.get('http://localhost:4500/api/broken', () =>
        HttpResponse.json(
          { ok: false, message: 'Algo salió mal', code: 'FOO_001_BAD', errors: 'stack trace' },
          { status: 400 },
        ),
      ),
    );

    await expect(client.get('/broken')).rejects.toMatchObject({
      code: 'FOO_001_BAD',
      status: 400,
    });
    await expect(client.get('/broken')).rejects.toBeInstanceOf(EsaviApiError);
  });

  it('nunca expone `errors` en el EsaviApiError', async () => {
    server.use(
      http.get('http://localhost:4500/api/broken', () =>
        HttpResponse.json(
          { ok: false, message: 'Algo salió mal', code: 'FOO_001_BAD', errors: 'stack trace' },
          { status: 400 },
        ),
      ),
    );

    try {
      await client.get('/broken');
      throw new Error('debía rechazar');
    } catch (error) {
      expect(error).not.toHaveProperty('errors');
    }
  });
});

describe('client — cabeceras y parámetros', () => {
  it('añade ?lang= con el idioma activo de preferencesStore', async () => {
    usePreferencesStore.getState().setLanguage('nl');
    let receivedLang: string | null = null;

    server.use(
      http.get('http://localhost:4500/api/ping', ({ request }) => {
        receivedLang = new URL(request.url).searchParams.get('lang');
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    await client.get('/ping');

    expect(receivedLang).toBe('nl');
  });

  it('no añade Authorization sin access token', async () => {
    let receivedAuth: string | null = null;

    server.use(
      http.get('http://localhost:4500/api/ping', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    await client.get('/ping');

    expect(receivedAuth).toBeNull();
  });

  it('añade Authorization: Bearer <token> cuando hay access token', async () => {
    setAccessToken('a-token');
    let receivedAuth: string | null = null;

    server.use(
      http.get('http://localhost:4500/api/ping', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    await client.get('/ping');

    expect(receivedAuth).toBe('Bearer a-token');
  });
});

describe('client — sin respuesta del servidor', () => {
  it('produce un EsaviApiError con code NETWORK_ERROR', async () => {
    server.use(http.get('http://localhost:4500/api/unreachable', () => HttpResponse.error()));

    await expect(client.get('/unreachable')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});

// El test más importante del repositorio (CONVENTIONS.md §12): la cola de refresh.
describe('client — cola de refresh', () => {
  it('dos peticiones con 401 simultáneas producen un solo POST /api/auth/refresh, y ambas se reintentan con el token nuevo', async () => {
    tokenStore.setRefreshToken('old-refresh-token');

    let protectedCallCount = 0;
    let refreshCallCount = 0;
    let refreshRequestBody: unknown = null;

    server.use(
      http.get('http://localhost:4500/api/protected', ({ request }) => {
        protectedCallCount += 1;
        if (protectedCallCount <= 2) {
          return HttpResponse.json(
            { ok: false, message: 'Token expirado', code: 'AUTH_401_TOKEN_EXPIRED' },
            { status: 401 },
          );
        }
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { auth: request.headers.get('authorization') },
        });
      }),
      http.post('http://localhost:4500/api/auth/refresh', async ({ request }) => {
        refreshCallCount += 1;
        refreshRequestBody = await request.json();
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            token: 'new-access-token',
            refreshToken: 'new-refresh-token',
            expiresAt: '2026-01-01T00:00:00Z',
          },
        });
      }),
    );

    const [first, second] = await Promise.all([client.get('/protected'), client.get('/protected')]);

    expect(refreshCallCount).toBe(1);
    expect(refreshRequestBody).toEqual({ refreshToken: 'old-refresh-token' });
    expect(first.data).toEqual({ auth: 'Bearer new-access-token' });
    expect(second.data).toEqual({ auth: 'Bearer new-access-token' });
    expect(tokenStore.getRefreshToken()).toBe('new-refresh-token');
  });

  it('AUTH_002_REFRESH_TOKEN_REUSED (durante el refresh) no reintenta y limpia la sesión', async () => {
    tokenStore.setRefreshToken('stolen-refresh-token');
    setAccessToken('stale-access-token');

    server.use(
      http.get('http://localhost:4500/api/protected', () =>
        HttpResponse.json(
          { ok: false, message: 'Token expirado', code: 'AUTH_401_TOKEN_EXPIRED' },
          { status: 401 },
        ),
      ),
      http.post('http://localhost:4500/api/auth/refresh', () =>
        HttpResponse.json(
          { ok: false, message: 'Sesión comprometida', code: 'AUTH_002_REFRESH_TOKEN_REUSED' },
          { status: 401 },
        ),
      ),
    );

    await expect(client.get('/protected')).rejects.toMatchObject({
      code: 'AUTH_002_REFRESH_TOKEN_REUSED',
    });
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('AUTH_003_REFRESH_TOKEN_REUSED (durante el logout) no dispara un refresh y limpia la sesión', async () => {
    tokenStore.setRefreshToken('stolen-refresh-token');
    let refreshCallCount = 0;

    server.use(
      http.post('http://localhost:4500/api/auth/logout', () =>
        HttpResponse.json(
          { ok: false, message: 'Sesión comprometida', code: 'AUTH_003_REFRESH_TOKEN_REUSED' },
          { status: 401 },
        ),
      ),
      http.post('http://localhost:4500/api/auth/refresh', () => {
        refreshCallCount += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: { token: 'x', refreshToken: 'y', expiresAt: '' },
        });
      }),
    );

    await expect(
      client.post('/auth/logout', { refreshToken: 'stolen-refresh-token' }),
    ).rejects.toMatchObject({ code: 'AUTH_003_REFRESH_TOKEN_REUSED' });
    expect(refreshCallCount).toBe(0);
    expect(tokenStore.getRefreshToken()).toBeNull();
  });

  it('sin refresh token guardado, rechaza de inmediato sin llamar a la red', async () => {
    let refreshCallCount = 0;

    server.use(
      http.get('http://localhost:4500/api/protected', () =>
        HttpResponse.json(
          { ok: false, message: 'Token expirado', code: 'AUTH_401_TOKEN_EXPIRED' },
          { status: 401 },
        ),
      ),
      http.post('http://localhost:4500/api/auth/refresh', () => {
        refreshCallCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: {} });
      }),
    );

    await expect(client.get('/protected')).rejects.toMatchObject({
      code: 'AUTH_002_NO_REFRESH_TOKEN',
    });
    expect(refreshCallCount).toBe(0);
  });
});

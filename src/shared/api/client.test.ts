import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { client, setAccessToken } from './client';
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

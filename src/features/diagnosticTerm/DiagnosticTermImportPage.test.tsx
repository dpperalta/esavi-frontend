import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DiagnosticTermImportReport } from '@/contracts/diagnosticTerm';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { DiagnosticTermImportPage } from './DiagnosticTermImportPage';

const server = setupServer();
const IMPORT_URL = 'http://localhost:4500/api/diagnostic-terms/import';

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
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: {
          userId: '1',
          roles: [{ roleId: 'r1', name: 'SUPERADMIN', code: 'SUPERADMIN', level: 100 }],
        },
      }),
    ),
  );
});

function buildReport(dryRun: boolean): DiagnosticTermImportReport {
  return {
    read: 3,
    inserted: 3,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    duplicated: 0,
    dryRun,
    source: 'MEDDRA',
    termGroup: 'LLT',
    errors: [],
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DiagnosticTermImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Archivo .asc');
}

function ascFile(name = 'llt.asc'): File {
  return new File(['10016558$Fiebre$$$$$$$Y$$'], name, { type: 'text/plain' });
}

describe('DiagnosticTermImportPage (SPEC FE25b §4 paso 6)', () => {
  it('sin archivo, «Simular» e «Importar» están deshabilitados', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });

  it('«Simular» envía dryRun=true y pinta el informe con la marca de simulación', async () => {
    const user = setupUser();
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) });
      }),
    );

    renderPage();
    await user.upload(fileInput(), ascFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByText('Simulación: no se escribió nada.')).toBeInTheDocument();
    expect(body).toContain('name="dryRun"\r\n\r\ntrue');
    expect(body).toContain('name="source"\r\n\r\nMEDDRA');
    expect(body).toContain('name="termGroup"\r\n\r\nLLT');
    expect(body).toContain('name="encoding"\r\n\r\nutf8');
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Informe de la importación' })).toHaveFocus(),
    );
  });

  it('cambiar el archivo después de simular borra el informe', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) }),
      ),
    );

    renderPage();
    await user.upload(fileInput(), ascFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByText('Informe de la importación')).toBeInTheDocument();

    await user.upload(fileInput(), ascFile('pt.asc'));

    expect(screen.queryByText('Informe de la importación')).not.toBeInTheDocument();
  });

  it('cambiar un campo después de simular borra el informe', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) }),
      ),
    );

    renderPage();
    await user.upload(fileInput(), ascFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByText('Informe de la importación')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Versión del diccionario'), '27.1');

    expect(screen.queryByText('Informe de la importación')).not.toBeInTheDocument();
  });

  it('«Importar» no envía nada hasta confirmar, y luego envía dryRun=false', async () => {
    const user = setupUser();
    let callCount = 0;
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        callCount += 1;
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(false) });
      }),
    );

    renderPage();
    await user.upload(fileInput(), ascFile());
    await user.click(screen.getByRole('button', { name: 'Importar' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(callCount).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Sí, importar' }));

    expect(await screen.findByRole('link', { name: 'Ver términos' })).toBeInTheDocument();
    expect(callCount).toBe(1);
    expect(body).toContain('name="dryRun"\r\n\r\nfalse');
  });

  it('un 413 del servidor pinta el error bajo el archivo', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'too large', code: 'DIAGTERM_007_FILE_TOO_LARGE', errors: [] },
          { status: 413 },
        ),
      ),
    );

    renderPage();
    await user.upload(fileInput(), ascFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByText('El archivo no puede superar los 20 MB.')).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('un archivo de más de 20 MB se rechaza en el cliente, sin petición', async () => {
    const user = setupUser();
    let callCount = 0;
    server.use(
      http.post(IMPORT_URL, () => {
        callCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport(true) });
      }),
    );

    renderPage();
    const bigFile = ascFile();
    Object.defineProperty(bigFile, 'size', { value: 21 * 1024 * 1024 });
    await user.upload(fileInput(), bigFile);

    expect(await screen.findByText('El archivo no puede superar los 20 MB.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(callCount).toBe(0);
  });

  it('IMPORT_FAILED se muestra como alerta de página', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'failed', code: 'DIAGTERM_007_IMPORT_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderPage();
    await user.upload(fileInput(), ascFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/se revirtió el lote en curso/);
  });

  it('las opciones avanzadas arrancan colapsadas', async () => {
    const user = setupUser();
    renderPage();

    const toggle = screen.getByRole('button', { name: 'Opciones avanzadas' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Grupo de término')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Grupo de término')).toHaveValue('LLT');
  });
});

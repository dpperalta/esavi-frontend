import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { VaccineWhodrugImportReport } from '@/contracts/vaccineWhodrug';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { VaccineWhodrugImportPage } from './VaccineWhodrugImportPage';

const server = setupServer();
const IMPORT_URL = 'http://localhost:4500/api/whodrug-vaccines/import';

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

function buildReport(
  overrides: Partial<VaccineWhodrugImportReport> = {},
): VaccineWhodrugImportReport {
  return {
    read: 3,
    inserted: 3,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    duplicated: 0,
    dryRun: true,
    sheet: 'WHODrug Vaccines',
    missingOptionalHeaders: [],
    unknownHeaders: [],
    errors: [],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VaccineWhodrugImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Archivo .xlsx');
}

function xlsxFile(name = 'whodrug.xlsx', size?: number): File {
  const file = new File(['PK'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('VaccineWhodrugImportPage (SPEC FE25c §4 paso 9)', () => {
  it('sin archivo, «Simular» e «Importar» están deshabilitados', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });

  it('«Simular» envía dryRun=true y pinta la hoja leída', async () => {
    const user = setupUser();
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport() });
      }),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.type(screen.getByLabelText('Versión del diccionario'), 'WHODrug Global 2025 Sep 1');
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByText('WHODrug Vaccines')).toBeInTheDocument();
    expect(screen.getByText('Hoja leída')).toBeInTheDocument();
    expect(screen.getByText('Simulación: no se escribió nada.')).toBeInTheDocument();
    expect(body).toContain('name="dryRun"\r\n\r\ntrue');
    expect(body).toContain('name="dictionaryVersion"\r\n\r\nWHODrug Global 2025 Sep 1');
    expect(screen.getByRole('heading', { name: 'Informe de la importación' })).toHaveFocus();
    expect(screen.queryByRole('link', { name: 'Ver vacunas' })).not.toBeInTheDocument();
  });

  it('con unknownHeaders: [foo] se ve la lista; sin cabeceras ausentes no se ve la otra', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: buildReport({ unknownHeaders: ['foo'] }),
        }),
      ),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByText('Cabeceras desconocidas (se ignoraron)')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('foo');
    expect(screen.queryByText('Cabeceras opcionales ausentes')).not.toBeInTheDocument();
  });

  it('pinta los rechazos con la fila, el motivo traducido y la columna', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: buildReport({
            invalid: 2,
            errors: [
              { row: 7, reason: 'VALUE_TOO_LONG', column: 'drugRecNo' },
              { row: 9, reason: 'EMPTY_DRUG_NAME' },
            ],
          }),
        }),
      ),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(
      await screen.findByText('Un valor supera la longitud de su columna.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'drugRecNo' })).toBeInTheDocument();
    expect(screen.getByText('Falta el nombre del fármaco.')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '9' })).toBeInTheDocument();
  });

  it('cambiar el fichero borra el informe', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport() }),
      ),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByText('Informe de la importación')).toBeInTheDocument();

    await user.upload(fileInput(), xlsxFile('otro.xlsx'));

    expect(screen.queryByText('Informe de la importación')).not.toBeInTheDocument();
  });

  it('cambiar la versión del diccionario también borra el informe', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json({ ok: true, message: 'ok', data: buildReport() }),
      ),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByText('Informe de la importación')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Versión del diccionario'), 'v2');

    expect(screen.queryByText('Informe de la importación')).not.toBeInTheDocument();
  });

  it('un FILE_INVALID del servidor pinta el error bajo el archivo', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'invalid', code: 'WHODRUG_007_FILE_INVALID', errors: [] },
          { status: 400 },
        ),
      ),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByText(/El fichero no es un \.xlsx válido/)).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('un .xlsx de 21 MB se rechaza en el cliente, sin petición', async () => {
    const user = setupUser();
    let requested = false;
    server.use(
      http.post(IMPORT_URL, () => {
        requested = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport() });
      }),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile('grande.xlsx', 21 * 1024 * 1024));

    expect(screen.getByText('El archivo no puede superar los 20 MB.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(requested).toBe(false);
  });

  it('un IMPORT_FAILED se muestra como alerta de la página', async () => {
    const user = setupUser();
    server.use(
      http.post(IMPORT_URL, () =>
        HttpResponse.json(
          { ok: false, message: 'failed', code: 'WHODRUG_007_IMPORT_FAILED', errors: [] },
          { status: 500 },
        ),
      ),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La importación falló');
  });

  it('«Importar» no envía nada hasta confirmar, y luego envía dryRun=false y ofrece «Ver vacunas»', async () => {
    const user = setupUser();
    let callCount = 0;
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        callCount += 1;
        body = await request.text();
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport({ dryRun: false }) });
      }),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Importar' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(callCount).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Sí, importar' }));

    expect(await screen.findByRole('link', { name: 'Ver vacunas' })).toHaveAttribute(
      'href',
      '/whodrug-vaccines',
    );
    expect(callCount).toBe(1);
    expect(body).toContain('name="dryRun"\r\n\r\nfalse');
    expect(body).not.toContain('name="dictionaryVersion"');
  });
});

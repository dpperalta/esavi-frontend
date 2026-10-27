import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/config/i18n';
import type { CatalogItemImportReport, RejectedCatalogItemRow } from '@/contracts/catalogItem';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { setupUser } from '@/test/user';
import { CatalogItemImportPage } from './CatalogItemImportPage';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const server = setupServer();
const IMPORT_URL = 'http://localhost:4500/api/catalog-items/import';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  setAccessToken(null);
});
afterAll(() => server.close());

beforeEach(() => {
  localStorage.clear();
  toastError.mockReset();
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
});

function buildReport(overrides: Partial<CatalogItemImportReport> = {}): CatalogItemImportReport {
  return {
    read: 3,
    inserted: 3,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    duplicated: 0,
    catalogTypesCreated: 0,
    sortOrderCoerced: 0,
    dryRun: true,
    sheet: 'Items',
    missingOptionalHeaders: [],
    unknownHeaders: [],
    errors: [],
    ...overrides,
  };
}

function respondWith(report: CatalogItemImportReport) {
  server.use(
    http.post(IMPORT_URL, () => HttpResponse.json({ ok: true, message: 'ok', data: report })),
  );
}

function respondWithError(code: string, status: number) {
  server.use(
    http.post(IMPORT_URL, () =>
      HttpResponse.json({ ok: false, message: 'failed', code, errors: ['debug'] }, { status }),
    ),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CatalogItemImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Archivo .xlsx');
}

function xlsxFile(name = 'catalogo.xlsx', size?: number): File {
  const file = new File(['PK'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function simulate(user: ReturnType<typeof setupUser>) {
  await user.upload(fileInput(), xlsxFile());
  await user.click(screen.getByRole('button', { name: 'Simular' }));
  await screen.findByRole('heading', { name: 'Informe de la importación' });
}

function counter(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling;
}

describe('CatalogItemImportPage (SPEC FE30 §4 paso 5)', () => {
  it('sin archivo, «Simular» e «Importar» están deshabilitados', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });

  it('la ayuda lista las seis cabeceras y enlaza la plantilla con download', () => {
    renderPage();

    for (const header of [
      'catalogTypeCode',
      'catalogTypeName',
      'name',
      'value',
      'description',
      'sortOrder',
    ]) {
      expect(screen.getByRole('cell', { name: header })).toBeInTheDocument();
    }
    const template = screen.getByRole('link', { name: 'Descargar plantilla (.xlsx)' });
    expect(template).toHaveAttribute('href', '/templates/catalog-items-template.xlsx');
    expect(template).toHaveAttribute('download');
    expect(screen.getByRole('note')).toHaveTextContent('crea un duplicado');
  });

  it('un .csv se rechaza en el cliente, sin petición', async () => {
    const user = setupUser({ applyAccept: false });
    let callCount = 0;
    server.use(
      http.post(IMPORT_URL, () => {
        callCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport() });
      }),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile('catalogo.csv'));

    expect(screen.getByText(/no es un \.xlsx válido/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(callCount).toBe(0);
  });

  it('un .xlsx de 21 MB se rechaza en el cliente, sin petición', async () => {
    const user = setupUser();
    let callCount = 0;
    server.use(
      http.post(IMPORT_URL, () => {
        callCount += 1;
        return HttpResponse.json({ ok: true, message: 'ok', data: buildReport() });
      }),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile('catalogo.xlsx', 21 * 1024 * 1024));

    expect(screen.getByText('El archivo supera los 20 MB.')).toBeInTheDocument();
    expect(callCount).toBe(0);
  });

  it('«Simular» pinta la marca de simulación y los ocho contadores en orden', async () => {
    const user = setupUser();
    respondWith(buildReport({ sortOrderCoerced: 2 }));

    renderPage();
    await simulate(user);

    expect(screen.getByText(/Simulación/)).toBeInTheDocument();
    const labels = Array.from(document.querySelectorAll('dl dt')).map((dt) => dt.textContent);
    expect(labels.slice(0, 8)).toEqual([
      'Leídas',
      'Insertadas',
      'Actualizadas',
      'Sin cambios',
      'Rechazadas',
      'Duplicadas',
      'Tipos nuevos',
      'Orden corregido a 0',
    ]);
    expect(counter('Orden corregido a 0')).toHaveTextContent('2');
  });

  it('con catalogTypesCreated: 2 en la simulación avisa y el diálogo repite la cifra', async () => {
    const user = setupUser();
    respondWith(buildReport({ catalogTypesCreated: 2 }));

    renderPage();
    await simulate(user);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Esta carga crearía 2 tipos de catálogo nuevos',
    );

    await user.click(screen.getByRole('button', { name: 'Importar' }));

    expect(
      within(screen.getByRole('alertdialog')).getByText(/crearía 2 tipos/),
    ).toBeInTheDocument();
  });

  it('con catalogTypesCreated: 0 no avisa y el diálogo dice que no crearía tipos', async () => {
    const user = setupUser();
    respondWith(buildReport());

    renderPage();
    await simulate(user);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Importar' }));

    expect(
      within(screen.getByRole('alertdialog')).getByText('La simulación no crearía tipos nuevos.'),
    ).toBeInTheDocument();
  });

  it('sin simulación previa, el diálogo muestra solo el cuerpo base', async () => {
    const user = setupUser();

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Importar' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Esto escribirá los elementos/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/simulación/i)).not.toBeInTheDocument();
  });

  it('cambiar el fichero tras simular descarta el informe', async () => {
    const user = setupUser();
    respondWith(buildReport());

    renderPage();
    await simulate(user);
    await user.upload(fileInput(), xlsxFile('otro.xlsx'));

    expect(
      screen.queryByRole('heading', { name: 'Informe de la importación' }),
    ).not.toBeInTheDocument();
  });

  it('el informe definitivo con un tipo creado avisa en pasado, enlaza tipos y ofrece «Ver elementos»', async () => {
    const user = setupUser();
    let body = '';
    server.use(
      http.post(IMPORT_URL, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: buildReport({ dryRun: false, catalogTypesCreated: 1 }),
        });
      }),
    );

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Importar' }));
    await user.click(screen.getByRole('button', { name: 'Sí, importar' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Se creó 1 tipo de catálogo nuevo');
    expect(within(notice).getByRole('link', { name: 'Ver tipos de catálogo' })).toHaveAttribute(
      'href',
      '/catalog-types',
    );
    expect(screen.getByRole('link', { name: 'Ver elementos de catálogo' })).toHaveAttribute(
      'href',
      '/catalog-items',
    );
    expect(body).toContain('name="dryRun"\r\n\r\nfalse');
  });

  it('con 20 rechazos y tipos creados no aparece la nota de truncado', async () => {
    const user = setupUser();
    const errors: RejectedCatalogItemRow[] = Array.from({ length: 20 }, (_, index) => ({
      row: index + 2,
      reason: 'EMPTY_NAME',
    }));
    respondWith(buildReport({ invalid: 20, catalogTypesCreated: 3, errors }));

    renderPage();
    await simulate(user);

    expect(screen.queryByText(/primeros 20/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Falta el nombre.')).toHaveLength(20);
  });

  it('unknownHeaders: [code] muestra la nota de que la columna code no se usa', async () => {
    const user = setupUser();
    respondWith(buildReport({ unknownHeaders: ['code'] }));

    renderPage();
    await simulate(user);

    expect(
      screen.getByText('La columna code no se usa: el código se genera a partir del nombre.'),
    ).toBeInTheDocument();
  });

  it('traduce los seis motivos de rechazo sin mostrar la clave cruda', async () => {
    const user = setupUser();
    const errors: RejectedCatalogItemRow[] = [
      { row: 2, reason: 'EMPTY_CATALOG_TYPE_CODE' },
      { row: 3, reason: 'EMPTY_NAME' },
      { row: 4, reason: 'EMPTY_CODE' },
      { row: 5, reason: 'VALUE_TOO_LONG', column: 'catalogTypeName' },
      { row: 6, reason: 'DUPLICATE_IN_FILE' },
      { row: 7, reason: 'CATALOG_TYPE_NAME_REQUIRED' },
    ];
    respondWith(buildReport({ invalid: 5, duplicated: 1, errors }));

    renderPage();
    await simulate(user);

    for (const text of [
      'Falta el código del tipo (catalogTypeCode).',
      'Falta el nombre.',
      'El nombre no genera ningún código (solo tiene símbolos o separadores).',
      'Un valor supera la longitud de su columna.',
      'El mismo nombre ya apareció antes en el archivo, bajo el mismo tipo.',
      'El tipo no existe y falta catalogTypeName para crearlo.',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    // One cell in the file help table, the other in the rejections table (VALUE_TOO_LONG).
    expect(screen.getAllByRole('cell', { name: 'catalogTypeName' })).toHaveLength(2);
    expect(screen.queryByText(/catalogItem\.import\.reasons/)).not.toBeInTheDocument();
  });

  it.each([
    ['CATITEM_006_FILE_REQUIRED', 400, 'Elige un archivo .xlsx.'],
    ['CATITEM_006_FILE_TOO_LARGE', 413, 'El archivo supera los 20 MB.'],
    ['CATITEM_006_FILE_INVALID', 400, /no es un \.xlsx válido/],
  ] as const)('un %s del servidor se pinta bajo el archivo', async (code, status, message) => {
    const user = setupUser();
    respondWithError(code, status);

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('un IMPORT_FAILED se muestra como alerta de la página', async () => {
    const user = setupUser();
    respondWithError('CATITEM_006_IMPORT_FAILED', 500);

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La importación falló');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('un code desconocido va al toast genérico', async () => {
    const user = setupUser();
    respondWithError('AUTH_ROLE_FORBIDDEN', 403);

    renderPage();
    await user.upload(fileInput(), xlsxFile());
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

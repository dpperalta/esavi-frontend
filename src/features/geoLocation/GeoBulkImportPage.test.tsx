import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupUser } from '@/test/user';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setAccessToken } from '@/shared/api/client';
import { tokenStore } from '@/shared/api/tokenStore';
import { GeoBulkImportPage } from './GeoBulkImportPage';

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

function signInAs(roleName: string, level: number) {
  setAccessToken('a-token');
  tokenStore.setRefreshToken('a-refresh-token');
  server.use(
    http.get('http://localhost:4500/api/users/me', () =>
      HttpResponse.json({
        ok: true,
        message: 'ok',
        data: { userId: '1', roles: [{ roleId: 'r1', name: roleName, code: roleName, level }] },
      }),
    ),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GeoBulkImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GeoBulkImportPage — reparto por rol (SPEC FE07 §3.1)', () => {
  it('con ADMIN, la tarjeta de plantilla funciona y la de subida se sustituye por el texto de SUPERADMIN', async () => {
    signInAs('ADMIN', 50);

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /descargar plantilla/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/exige el rol Superadministrador/i)).toBeInTheDocument();
    expect(screen.queryByText(/arrastra aquí el archivo/i)).not.toBeInTheDocument();
  });

  it('con SUPERADMIN, las dos tarjetas funcionan', async () => {
    signInAs('SUPERADMIN', 100);

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Validar sin guardar' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /descargar plantilla/i })).toBeInTheDocument();
    expect(screen.getByText(/arrastra aquí el archivo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument();
  });
});

describe('GeoBulkImportPage — selección de archivo', () => {
  it('rechaza un .pdf sin tocar el estado del archivo elegido', async () => {
    // `accept=".xlsx"` in the input only steers a native OS picker — a drag-and-drop bypasses
    // it entirely, which is exactly the case the client validation (SPEC FE07 §3.5) exists for.
    // `applyAccept: false` stops user-event's own accept-based filtering so the .pdf actually
    // reaches the change handler, the same way a dropped file would.
    const user = userEvent.setup({ delay: null, applyAccept: false });
    signInAs('SUPERADMIN', 100);

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Validar sin guardar' })).toBeInTheDocument(),
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const pdfFile = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
    await user.upload(input, pdfFile);

    expect(await screen.findByText('El archivo debe tener extensión .xlsx.')).toBeInTheDocument();
    expect(screen.queryByText('plan.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validar sin guardar' })).toBeDisabled();
  });
});

describe('GeoBulkImportPage — importar exige confirmación', () => {
  it('«Importar» no envía hasta confirmar en el diálogo', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);

    let importCallCount = 0;
    server.use(
      http.post('http://localhost:4500/api/geo-locations/import', () => {
        importCallCount += 1;
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            dryRun: false,
            sheets: { geoLocation: 'geoLocation', healthFacility: null },
            geoLocation: {
              read: 1,
              inserted: 1,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
              sortOrderCoerced: 0,
            },
            healthFacility: {
              read: 0,
              inserted: 0,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
            },
            missingOptionalHeaders: { geoLocation: [], healthFacility: [] },
            unknownHeaders: { geoLocation: [], healthFacility: [] },
            errors: [],
          },
        });
      }),
    );

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Importar' })).toBeInTheDocument(),
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const xlsxFile = new File(['x'], 'geo.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(input, xlsxFile);

    await user.click(screen.getByRole('button', { name: 'Importar' }));

    expect(importCallCount).toBe(0);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sí, importar' }));

    await waitFor(() => expect(importCallCount).toBe(1));
  });

  it('durante la petición, los botones y el selector de archivo se deshabilitan', async () => {
    const user = setupUser();
    signInAs('SUPERADMIN', 100);

    let resolveImport: (() => void) | undefined;
    server.use(
      http.post('http://localhost:4500/api/geo-locations/import', async () => {
        await new Promise<void>((resolve) => {
          resolveImport = resolve;
        });
        return HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            dryRun: true,
            sheets: { geoLocation: 'geoLocation', healthFacility: null },
            geoLocation: {
              read: 0,
              inserted: 0,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
              sortOrderCoerced: 0,
            },
            healthFacility: {
              read: 0,
              inserted: 0,
              updated: 0,
              unchanged: 0,
              invalid: 0,
              duplicated: 0,
              inactiveMatched: 0,
            },
            missingOptionalHeaders: { geoLocation: [], healthFacility: [] },
            unknownHeaders: { geoLocation: [], healthFacility: [] },
            errors: [],
          },
        });
      }),
    );

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Validar sin guardar' })).toBeInTheDocument(),
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const xlsxFile = new File(['x'], 'geo.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(input, xlsxFile);

    await user.click(screen.getByRole('button', { name: 'Validar sin guardar' }));

    await waitFor(() => {
      const loadingButtons = screen.getAllByRole('button', { name: /cargando/i });
      expect(loadingButtons).toHaveLength(2);
      loadingButtons.forEach((button) => expect(button).toBeDisabled());
    });
    expect(input).toBeDisabled();

    resolveImport?.();
  });
});

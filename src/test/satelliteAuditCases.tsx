import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { SetupServer } from 'msw/node';
import type { Mock } from 'vitest';
import { expect, it } from 'vitest';
import { setupUser } from '@/test/user';

const API = 'http://localhost:4500/api';

export interface SatelliteAuditCaseConfig {
  server: SetupServer;
  // Renders the list inside a MemoryRouter at `initialPath`.
  render: (options: { initialPath: string; readOnly?: boolean }) => void;
  // e.g. 'notification-events'.
  apiPath: string;
  // The `002B` segment after `apiPath`, parent id included: 'admin/notification/<id>'.
  adminListSegment: string;
  // The list's own query today (`006` or `002A`), as an absolute URL.
  activeListUrl: string;
  rowId: string;
  rowLabel: string;
  buildRow: (overrides: Record<string, unknown>) => Record<string, unknown>;
  restoredToast: string;
  toastSuccess: Mock;
  toastError: Mock;
  // Extra handlers the list needs to render (catalogs, parents…).
  mockDependencies?: () => void;
}

const WIZARD_PATH = '/esavi-cases/case-1/wizard/notification';

function page(rows: unknown[]) {
  return HttpResponse.json({ ok: true, message: 'ok', data: { count: rows.length, rows } });
}

// SPEC FE29 §4 steps 6–7: the same five cases for each of the ten restorable satellite lists.
export function itBehavesAsRestorableSatelliteList(config: SatelliteAuditCaseConfig) {
  const { server } = config;
  const adminListUrl = `${API}/${config.apiPath}/${config.adminListSegment}`;
  const activateUrl = `${API}/${config.apiPath}/activate/${config.rowId}`;
  const restoreName = `Restaurar ${config.rowLabel}`;
  const historyName = `Ver historial de ${config.rowLabel}`;

  function signInAs(roleName: string, level: number) {
    server.use(
      http.get(`${API}/users/me`, () =>
        HttpResponse.json({
          ok: true,
          message: 'ok',
          data: {
            userId: 'user-1',
            roles: [{ roleId: 'r1', name: roleName, code: roleName, level }],
          },
        }),
      ),
    );
  }

  function mockActiveList() {
    server.use(http.get(config.activeListUrl, () => page([])));
  }

  it('con el toggle encendido y ADMIN, una fila eliminada del 002B aparece con badge', async () => {
    signInAs('ADMIN', 50);
    config.mockDependencies?.();
    mockActiveList();
    server.use(http.get(adminListUrl, () => page([config.buildRow({ isActive: false })])));

    config.render({ initialPath: `${WIZARD_PATH}?includeInactive=true` });

    expect((await screen.findAllByText('Eliminado')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: restoreName }).length).toBeGreaterThan(0);
  });

  it('«Restaurar» hace el PATCH y la fila se relee activa', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    config.mockDependencies?.();
    mockActiveList();
    let restored = false;
    server.use(
      http.get(adminListUrl, () => page([config.buildRow({ isActive: restored })])),
      http.patch(activateUrl, () => {
        restored = true;
        return HttpResponse.json({ ok: true, message: 'ok', data: null });
      }),
    );

    config.render({ initialPath: `${WIZARD_PATH}?includeInactive=true` });

    await user.click((await screen.findAllByRole('button', { name: restoreName }))[0]);

    await waitFor(() => expect(screen.queryByText('Eliminado')).not.toBeInTheDocument());
    expect(restored).toBe(true);
    expect(config.toastSuccess).toHaveBeenCalledWith(config.restoredToast);
  });

  it('un 409 *_005B_ALREADY_ACTIVE muestra el aviso común y relee la lista', async () => {
    const user = setupUser();
    signInAs('ADMIN', 50);
    config.mockDependencies?.();
    mockActiveList();
    let adminReads = 0;
    server.use(
      http.get(adminListUrl, () => {
        adminReads += 1;
        return page([config.buildRow({ isActive: false })]);
      }),
      http.patch(activateUrl, () =>
        HttpResponse.json(
          { ok: false, message: 'ya activo', code: 'X_005B_ALREADY_ACTIVE' },
          { status: 409 },
        ),
      ),
    );

    config.render({ initialPath: `${WIZARD_PATH}?includeInactive=true` });

    await user.click((await screen.findAllByRole('button', { name: restoreName }))[0]);

    await waitFor(() =>
      expect(config.toastError).toHaveBeenCalledWith('Este registro ya estaba restaurado.'),
    );
    await waitFor(() => expect(adminReads).toBeGreaterThan(1));
  });

  it('en solo lectura no hay «Restaurar», pero sí «Historial» con SUPERADMIN', async () => {
    signInAs('SUPERADMIN', 100);
    config.mockDependencies?.();
    mockActiveList();
    server.use(http.get(adminListUrl, () => page([config.buildRow({ isActive: false })])));

    config.render({ initialPath: `${WIZARD_PATH}?includeInactive=true`, readOnly: true });

    expect((await screen.findAllByRole('button', { name: historyName })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: restoreName })).not.toBeInTheDocument();
  });

  it.each([
    ['ADMIN con el toggle apagado', 'ADMIN', 50, ''],
    ['USER con includeInactive=true a mano', 'USER', 25, '?includeInactive=true'],
  ])('%s: la petición es la de hoy y nunca el 002B', async (_label, roleName, level, search) => {
    signInAs(roleName, level);
    config.mockDependencies?.();
    let activeReads = 0;
    let adminReads = 0;
    server.use(
      http.get(config.activeListUrl, () => {
        activeReads += 1;
        return page([config.buildRow({ isActive: true })]);
      }),
      http.get(adminListUrl, () => {
        adminReads += 1;
        return page([]);
      }),
    );

    config.render({ initialPath: `${WIZARD_PATH}${search}` });

    expect((await screen.findAllByText(config.rowLabel)).length).toBeGreaterThan(0);
    expect(activeReads).toBeGreaterThan(0);
    expect(adminReads).toBe(0);
    expect(screen.queryByRole('button', { name: historyName })).not.toBeInTheDocument();
  });
}

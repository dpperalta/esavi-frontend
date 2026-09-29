import { render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/test/user';
import { describe, expect, it, vi } from 'vitest';
import type { AppDetails } from '@/contracts/common';
import '@/shared/config/i18n';
import { SatelliteList, type SatelliteListColumn } from './SatelliteList';

interface Row {
  id: string;
  name: string;
  date: string | null;
}

const columns: SatelliteListColumn<Row>[] = [
  { key: 'name', header: 'notification.events.fields.esaviName', render: (row) => row.name, card: 'primary' },
  { key: 'date', header: 'notification.events.fields.startDate', render: (row) => row.date, card: 'secondary' },
];

describe('SatelliteList', () => {
  it('con cero filas sólo muestra título y botón «Añadir»', () => {
    render(
      <SatelliteList
        titleKey="notification.events.sectionTitle"
        columns={columns}
        rows={[]}
        idField="id"
        getRowLabel={(row) => row.name}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Añadir' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/no hay/i)).not.toBeInTheDocument();
  });

  it('sin onAdd no muestra el botón «Añadir» (caso cerrado)', () => {
    render(
      <SatelliteList
        titleKey="notification.events.sectionTitle"
        columns={columns}
        rows={[]}
        idField="id"
        getRowLabel={(row) => row.name}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument();
  });

  it('en la tarjeta móvil, un campo sin valor no pinta ningún separador huérfano', () => {
    const { container } = render(
      <SatelliteList
        titleKey="notification.events.sectionTitle"
        columns={columns}
        rows={[{ id: '1', name: 'Fiebre alta', date: null }]}
        idField="id"
        getRowLabel={(row) => row.name}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // Both the desktop table and the mobile card are in the DOM at once — CSS decides which one
    // shows — so every assertion here expects the pair, not a single match.
    expect(screen.getAllByText('Fiebre alta')).toHaveLength(2);
    expect(container.innerHTML).not.toContain('—');
    expect(screen.getAllByRole('button', { name: 'Editar Fiebre alta' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Eliminar Fiebre alta' })).toHaveLength(2);
  });
});

interface AuditedRow extends Row {
  isActive: boolean;
  appDetails: AppDetails[] | null;
}

const OLDER_ENTRY: AppDetails = {
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  method: 'POST',
  user: 'Ana Pérez',
  detail: 'Creación del evento',
};
const NEWER_ENTRY: AppDetails = {
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
  method: 'DELETE',
  user: 'Luis Gómez',
  detail: 'Eliminación del evento',
};

const auditedColumns: SatelliteListColumn<AuditedRow>[] = [
  { key: 'name', header: 'notification.events.fields.esaviName', render: (row) => row.name, card: 'primary' },
];

function renderAudited(rows: AuditedRow[], overrides: { onRestore?: (row: AuditedRow) => Promise<void> } = {}) {
  return render(
    <SatelliteList
      titleKey="notification.events.sectionTitle"
      columns={auditedColumns}
      rows={rows}
      idField="id"
      getRowLabel={(row) => row.name}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      isRowInactive={(row) => !row.isActive}
      onRestore={overrides.onRestore ?? vi.fn().mockResolvedValue(undefined)}
      getRowAppDetails={(row) => row.appDetails}
    />,
  );
}

describe('SatelliteList — registros eliminados y auditoría (SPEC FE29)', () => {
  it('una fila inactiva muestra «Eliminado» y «Restaurar», y no ofrece editar ni eliminar', () => {
    renderAudited([{ id: '1', name: 'Fiebre alta', date: null, isActive: false, appDetails: null }]);

    expect(screen.getAllByText('Eliminado')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Restaurar Fiebre alta' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Editar Fiebre alta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Fiebre alta' })).not.toBeInTheDocument();
  });

  it('una fila activa no muestra «Restaurar» ni el badge, y conserva editar y eliminar', () => {
    renderAudited([{ id: '1', name: 'Fiebre alta', date: null, isActive: true, appDetails: null }]);

    expect(screen.queryByText('Eliminado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar Fiebre alta' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar Fiebre alta' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Eliminar Fiebre alta' })).toHaveLength(2);
  });

  it('«Restaurar» llama a onRestore con la fila', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const row = { id: '1', name: 'Fiebre alta', date: null, isActive: false, appDetails: null };
    renderAudited([row], { onRestore });

    await setupUser().click(screen.getAllByRole('button', { name: 'Restaurar Fiebre alta' })[0]);

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(row));
  });

  it('«Ver historial de …» abre el Sheet con las entradas, la más reciente primero', async () => {
    renderAudited([
      { id: '1', name: 'Fiebre alta', date: null, isActive: false, appDetails: [OLDER_ENTRY, NEWER_ENTRY] },
    ]);

    await setupUser().click(screen.getAllByRole('button', { name: 'Ver historial de Fiebre alta' })[0]);

    const sheet = await screen.findByRole('dialog', { name: 'Historial de Fiebre alta' });
    const entries = within(sheet).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Eliminación del evento');
    expect(entries[1]).toHaveTextContent('Creación del evento');
  });

  it('con appDetails null, el Sheet muestra el estado vacío', async () => {
    renderAudited([{ id: '1', name: 'Fiebre alta', date: null, isActive: true, appDetails: null }]);

    await setupUser().click(screen.getAllByRole('button', { name: 'Ver historial de Fiebre alta' })[0]);

    const sheet = await screen.findByRole('dialog', { name: 'Historial de Fiebre alta' });
    expect(within(sheet).getByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
  });

  it('sin getRowAppDetails no hay «Historial»', () => {
    render(
      <SatelliteList
        titleKey="notification.events.sectionTitle"
        columns={auditedColumns}
        rows={[{ id: '1', name: 'Fiebre alta', date: null, isActive: true, appDetails: null }]}
        idField="id"
        getRowLabel={(row) => row.name}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ver historial de Fiebre alta' })).not.toBeInTheDocument();
  });

  it('la fila con restoringId deja «Restaurar» deshabilitado y con aria-busy', () => {
    render(
      <SatelliteList
        titleKey="notification.events.sectionTitle"
        columns={auditedColumns}
        rows={[
          { id: '1', name: 'Fiebre alta', date: null, isActive: false, appDetails: null },
          { id: '2', name: 'Cefalea', date: null, isActive: false, appDetails: null },
        ]}
        idField="id"
        getRowLabel={(row) => row.name}
        isRowInactive={(row) => !row.isActive}
        onRestore={vi.fn()}
        restoringId="1"
      />,
    );

    for (const button of screen.getAllByRole('button', { name: 'Restaurar Fiebre alta' })) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    }
    for (const button of screen.getAllByRole('button', { name: 'Restaurar Cefalea' })) {
      expect(button).toBeEnabled();
    }
  });
});

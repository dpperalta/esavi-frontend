import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

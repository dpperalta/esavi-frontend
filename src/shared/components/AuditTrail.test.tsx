import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { AuditTrail } from './AuditTrail';

describe('AuditTrail', () => {
  it('pinta una lista cronológica con fecha, usuario, método y detalle', () => {
    render(
      <AuditTrail
        appDetails={[
          {
            createdAt: new Date('2026-08-20T10:00:00Z'),
            user: 'admin@esavi.test',
            method: 'POST',
            detail: 'Creación inicial',
          },
          {
            createdAt: new Date('2026-08-25T10:00:00Z'),
            user: 'admin@esavi.test',
            method: 'PUT',
            detail: 'Actualización de nombre',
          },
          {
            createdAt: new Date('2026-08-30T10:00:00Z'),
            user: 'superadmin@esavi.test',
            method: 'DELETE',
            detail: 'Baja lógica',
          },
        ]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Baja lógica')).toBeInTheDocument();
    expect(screen.getByText('Creación inicial')).toBeInTheDocument();
  });

  it('con appDetails: null muestra el estado vacío sin reventar', () => {
    render(<AuditTrail appDetails={null} />);

    expect(screen.getByText('Todavía no hay cambios registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

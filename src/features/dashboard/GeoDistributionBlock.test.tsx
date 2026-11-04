import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { setupUser } from '@/test/user';
import { distributionsFixture } from './distributionsFixture';
import { GeoDistributionBlock } from './GeoDistributionBlock';

const rows = distributionsFixture().geography.rows;

function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function renderBlock(data: DashboardDistributions['geography'], search = '') {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <GeoDistributionBlock data={data} hasUnit={search.includes('geoLocationId')} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('GeoDistributionBlock', () => {
  it('con filas muestra el mapa y la tabla bajo el título del bloque', () => {
    renderBlock({ rows });

    const block = screen.getByRole('region', { name: 'Distribución geográfica' });
    expect(within(block).getByText('Por ubicación del establecimiento')).toBeInTheDocument();
    expect(within(block).getByRole('img')).toHaveAccessibleName(
      '2 unidades en el mapa; la de más casos, Pichincha con 18',
    );
    expect(within(block).getByRole('table')).toBeInTheDocument();
    expect(within(block).queryByText(/ninguna unidad/i)).not.toBeInTheDocument();
  });

  it('sin unidades en una unidad elegida ofrece volver a todo el territorio, conservando el periodo', async () => {
    const user = setupUser();
    renderBlock({ rows: [] }, '?range=90d&geoLocationId=3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40');

    expect(screen.getByText('No hay unidades para mostrar en este nivel.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver todo mi territorio' }));

    expect(screen.getByTestId('search')).toHaveTextContent('?range=90d');
    expect(screen.getByTestId('search')).not.toHaveTextContent('geoLocationId');
  });

  it('sin unidades y sin unidad elegida no ofrece el enlace', () => {
    renderBlock({ rows: [] });

    expect(screen.getByText('No hay unidades para mostrar en este nivel.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ver todo mi territorio' }),
    ).not.toBeInTheDocument();
  });

  it('con filas pero ninguna con coordenadas, el mapa queda sin círculos con su aviso y la tabla completa', () => {
    renderBlock({ rows: rows.slice(2) });

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(
      screen.getAllByText('Ninguna unidad de este nivel tiene coordenadas para el mapa'),
    ).toHaveLength(1);
    const body = screen.getAllByRole('rowgroup')[1];
    expect(within(body).getAllByRole('row')).toHaveLength(3);
  });
});

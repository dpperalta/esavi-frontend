import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { setupUser } from '@/test/user';
import { distributionsFixture } from './distributionsFixture';
import { GeoDistributionTable } from './GeoDistributionTable';
import { indicatorsFixture } from './indicatorsFixture';

const rows = distributionsFixture().geography.rows;

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="search">{location.search}</div>
      <div data-testid="action">{useNavigationType()}</div>
    </>
  );
}

function renderTable(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <GeoDistributionTable rows={rows} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('GeoDistributionTable', () => {
  it('pinta una fila por elemento, en el orden recibido, y solo las unidades son botones', () => {
    renderTable();

    const body = screen.getAllByRole('rowgroup')[1];
    const headers = within(body)
      .getAllByRole('row')
      .map((row) => within(row).getByRole('rowheader').textContent);
    expect(headers).toEqual(['Pichincha', 'Guayas', 'Galápagos', 'En la propia unidad', 'Sin ubicación']);

    const buttons = within(body).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Ver Pichincha',
      'Ver Guayas',
      'Ver Galápagos',
    ]);
  });

  it('la nota suma la unidad sin coordenadas, la propia unidad y los casos sin ubicar', () => {
    renderTable();

    expect(screen.getByText('16 casos no se pueden ubicar en el mapa')).toBeInTheDocument();
  });

  it('sin filas fuera del mapa no muestra la nota', () => {
    render(
      <MemoryRouter>
        <GeoDistributionTable rows={rows.slice(0, 2)} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/no se pueden? ubicar en el mapa/)).not.toBeInTheDocument();
  });

  it('la suma de casos es igual al volumen de los indicadores del mismo periodo', () => {
    const sum = rows.reduce((total, row) => total + row.total, 0);

    expect(sum).toBe(indicatorsFixture().volume.total.current);
  });

  it('pulsar una unidad escribe geoLocationId con una entrada nueva y conserva el periodo', async () => {
    const user = setupUser();
    renderTable('?range=90d&vaccinesView=table');

    await user.click(screen.getByRole('button', { name: 'Ver Guayas' }));

    const params = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(params.get('geoLocationId')).toBe(rows[1].geoLocationId);
    expect(params.get('range')).toBe('90d');
    expect(params.get('vaccinesView')).toBe('table');
    expect(screen.getByTestId('action')).toHaveTextContent('PUSH');
  });
});

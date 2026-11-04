import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { setupUser } from '@/test/user';
import { distributionsFixture } from './distributionsFixture';
import { VaccinesBlock } from './VaccinesBlock';

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

// The block receives the ESAVI-DASH-009 payload from DistributionsSection (SPEC FE36b §3.1).
function renderBlock(
  overrides: Partial<DashboardDistributions['vaccines']> = {},
  initialUrl = '/',
) {
  const data = { ...distributionsFixture().vaccines, ...overrides };
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <VaccinesBlock data={data} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function chart() {
  return screen.getByRole('img', {
    name: '4 vacunas sospechosas, la más frecuente Comirnaty con 14 casos',
  });
}

describe('VaccinesBlock', () => {
  it('dibuja una etiqueta por vacuna en el orden recibido, con «Otras vacunas» al final', () => {
    renderBlock();

    expect(chart()).toHaveTextContent(
      /^Comirnaty.*Vacuna antineumocócica.*INFLUENZA TETRAVALENTE.*Sin nombre.*Otras vacunas/,
    );
  });

  it('una vacuna coded: false lleva el badge «Texto libre»; label: null se lee «Sin nombre»', () => {
    renderBlock();

    expect(within(chart()).getAllByText('Texto libre')).toHaveLength(1);
    expect(within(chart()).getByText('INFLUENZA TETRAVALENTE')).toHaveClass('italic');
    expect(within(chart()).getByText('Sin nombre')).toHaveClass('italic');
    expect(within(chart()).getByText('Comirnaty')).not.toHaveClass('italic');
  });

  it('con others.cases = 0 no hay fila «Otras vacunas», pero sigue la nota de varias vacunas', () => {
    renderBlock({ others: { cases: 0, serious: 0 } });

    expect(screen.queryByText('Otras vacunas')).not.toBeInTheDocument();
    expect(screen.getByText('Un caso puede contar en varias vacunas.')).toBeInTheDocument();
  });

  it('el pie muestra los casos sin vacuna sospechosa y la nota de varias vacunas', () => {
    renderBlock();

    expect(screen.getByText('7 casos sin vacuna sospechosa')).toBeInTheDocument();
    expect(screen.getByText('Un caso puede contar en varias vacunas.')).toBeInTheDocument();
  });

  it('sin vacunas ni others, muestra el vacío y los casos sin vacuna sospechosa, sin gráfico ni botón', () => {
    renderBlock({ items: [], others: { cases: 0, serious: 0 }, casesWithoutSuspectedVaccine: 3 });

    expect(
      screen.getByText('No hay vacunas sospechosas registradas en este periodo.'),
    ).toBeInTheDocument();
    expect(screen.getByText('3 casos sin vacuna sospechosa')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('?vaccinesView=table lista las mismas filas, con «Codificada: No» en la de texto libre', () => {
    renderBlock({}, '/?range=90d&vaccinesView=table');

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('VacunaCodificadaCasosGraves');
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      'ComirnatySí143',
      'Vacuna antineumocócica conjugada 13-valente adsorbidaSí92',
      'INFLUENZA TETRAVALENTENo61',
      'Sin nombreSí20',
      'Otras vacunas51',
    ]);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('el botón alterna solo vaccinesView y conserva el periodo y las otras vistas', async () => {
    const user = setupUser();
    renderBlock({}, '/?range=90d&epiView=table');

    await user.click(screen.getByRole('button', { name: 'Ver como tabla' }));

    const search = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(search.get('vaccinesView')).toBe('table');
    expect(search.get('epiView')).toBe('table');
    expect(search.get('range')).toBe('90d');
    expect(screen.getByRole('button', { name: 'Ver como gráfico' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

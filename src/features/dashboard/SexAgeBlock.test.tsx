import { render, screen, within } from '@testing-library/react';
import type { TooltipContentProps } from 'recharts';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { distributionsFixture } from './distributionsFixture';
import { indicatorsFixture } from './indicatorsFixture';
import { SexAgeBlock } from './SexAgeBlock';
import { sexAgeRows } from './sexAgeRows';
import { SexAgeTooltip } from './SexAgeTooltip';

// The block receives the ESAVI-DASH-009 payload from DistributionsSection (SPEC FE36b §3.1).
function renderBlock(sexAge: DashboardDistributions['sexAge'], initialUrl = '/') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <SexAgeBlock data={sexAge} />
    </MemoryRouter>,
  );
}

function zeroSexAge(): DashboardDistributions['sexAge'] {
  const { bands, sexes } = distributionsFixture().sexAge;
  return { bands, sexes, matrix: bands.map(() => sexes.map(() => 0)) };
}

const BAND_LABELS = [
  '< 1 año',
  '1–17',
  '18–24',
  '25–49',
  '50–59',
  '60–69',
  '70–79',
  '80 y más',
  'Sin edad',
];

describe('SexAgeBlock', () => {
  // jsdom gives ResponsiveContainer no size, so Recharts draws no SVG here: the symmetric axis is
  // covered by pyramidMax / pyramidTicks, and the band order by the table view below.
  it('dibuja la pirámide con el resumen accesible y femenino a la izquierda de masculino', () => {
    renderBlock(distributionsFixture().sexAge);

    const pyramid = screen.getByRole('img', { name: '42 casos por sexo y edad' });
    expect(pyramid).toHaveTextContent(/^Femenino\s*Masculino/);
    expect(screen.getByRole('button', { name: 'Ver como tabla' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('el tooltip de 25–49 muestra femenino 5 y masculino 3, sin signo negativo', () => {
    const row = sexAgeRows(distributionsFixture().sexAge)[3];
    const props = { active: true, payload: [{ payload: { ...row, femaleBar: -row.female } }] };

    render(<SexAgeTooltip {...(props as unknown as TooltipContentProps)} />);

    expect(screen.getByText('25–49')).toBeInTheDocument();
    const value = (sex: string) => screen.getByText(sex).nextElementSibling?.textContent;
    expect(value('Femenino')).toBe('5');
    expect(value('Masculino')).toBe('3');
    expect(value('Desconocido')).toBe('1');
    expect(value('Sin dato')).toBe('0');
    expect(document.body).not.toHaveTextContent(/[-−]\d/);
  });

  it('suma desconocido y sin dato en una línea aparte', () => {
    renderBlock(distributionsFixture().sexAge);

    expect(screen.getByText('Sexo desconocido o sin dato: 3')).toBeInTheDocument();
  });

  it('con UNKNOWN + NONE = 0 no hay línea de sexo desconocido', () => {
    const sexAge = distributionsFixture().sexAge;
    const matrix = sexAge.matrix.map(([female, male]) => [female, male, 0, 0]);
    renderBlock({ ...sexAge, matrix });

    expect(screen.queryByText(/Sexo desconocido o sin dato/)).not.toBeInTheDocument();
  });

  it('con la matriz toda en 0 sigue dibujando la pirámide y dice que no hay casos', () => {
    renderBlock(zeroSexAge());

    expect(screen.getByText('No hay casos reportados en este periodo.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0 casos por sexo y edad' })).toBeInTheDocument();
    expect(screen.queryByText(/Sexo desconocido o sin dato/)).not.toBeInTheDocument();
  });

  it('?sexAgeView=table muestra la matriz de 9×4 con total por banda, y suma el total de los indicadores', () => {
    renderBlock(distributionsFixture().sexAge, '/?sexAgeView=table');

    const table = screen.getByRole('table');
    const [header, ...rows] = within(table).getAllByRole('row');
    expect(
      within(header)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Edad', 'Femenino', 'Masculino', 'Desconocido', 'Sin dato', 'Total']);
    expect(rows).toHaveLength(9);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(BAND_LABELS);
    expect(rows[3]).toHaveTextContent('25–4953109');
    const tableTotal = rows.reduce(
      (sum, row) => sum + Number(within(row).getAllByRole('cell').at(-1)?.textContent),
      0,
    );
    expect(tableTotal).toBe(indicatorsFixture().volume.total.current);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('una matriz con las columnas en otro orden se lee por sexes', () => {
    renderBlock(
      {
        bands: ['Y25_49'],
        sexes: ['NONE', 'MALE', 'UNKNOWN', 'FEMALE'],
        matrix: [[2, 3, 1, 5]],
      },
      '/?sexAgeView=table',
    );

    const [, row] = within(screen.getByRole('table')).getAllByRole('row');
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['5', '3', '1', '2', '11']);
  });
});

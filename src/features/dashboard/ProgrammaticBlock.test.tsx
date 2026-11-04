import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { distributionsFixture } from './distributionsFixture';
import { ProgrammaticBlock } from './ProgrammaticBlock';

// The block receives the ESAVI-DASH-009 payload from DistributionsSection (SPEC FE36b §3.1); the
// request itself, with MSW, is covered by the useDistributions and DistributionsSection tests.
function renderBlock(overrides: Partial<DashboardDistributions['programmatic']> = {}) {
  const data = { ...distributionsFixture().programmatic, ...overrides };
  return render(<ProgrammaticBlock data={data} />);
}

function card(name: string) {
  return screen.getByRole('region', { name });
}

describe('ProgrammaticBlock', () => {
  it('muestra «al menos uno» y los seis indicadores con conteo y porcentaje sobre las investigaciones con registro', () => {
    renderBlock();

    // 12 investigated − 2 without administration record = 10.
    const administration = card('Errores de administración');
    expect(
      within(administration).getByText('Al menos un error de administración'),
    ).toBeInTheDocument();
    expect(within(administration).getByText(/^3 · 30\s%$/)).toBeInTheDocument();
    expect(
      within(administration).getByText('Sobre 10 investigaciones con registro'),
    ).toBeInTheDocument();
    const administrationRows = within(administration).getAllByRole('listitem');
    expect(administrationRows).toHaveLength(6);
    expect(administrationRows[0]).toHaveTextContent(
      /Error de prescripción o de indicación1 · 10\s%/,
    );
    expect(administrationRows[3]).toHaveTextContent(
      /Error de preparación o reconstitución2 · 20\s%/,
    );
    expect(within(administration).getByText('2 investigaciones sin registro')).toBeInTheDocument();

    // 12 investigated − 4 without cold-chain record = 8.
    const coldChain = card('Cadena de frío');
    // «At least one» and rangeDeviation are both 2 of 8 in the fixture.
    expect(within(coldChain).getAllByText(/^2 · 25\s%$/)).toHaveLength(2);
    expect(within(coldChain).getByText('Sobre 8 investigaciones con registro')).toBeInTheDocument();
    const coldChainRows = within(coldChain).getAllByRole('listitem');
    expect(coldChainRows).toHaveLength(6);
    expect(coldChainRows[0]).toHaveTextContent(/Desviación del rango de temperatura2 · 25\s%/);
    expect(coldChainRows[1]).toHaveTextContent(
      /Procedimiento de almacenamiento no seguido1 · 12,5\s%/,
    );
    expect(within(coldChain).getByText('4 investigaciones sin registro')).toBeInTheDocument();
  });

  it('con investigatedCases = 0, las dos tarjetas dicen que no hay investigación y no dibujan barras', () => {
    renderBlock({
      investigatedCases: 0,
      withoutAdministrationRecord: 0,
      withoutColdChainRecord: 0,
    });

    for (const name of ['Errores de administración', 'Cadena de frío']) {
      const region = card(name);
      expect(
        within(region).getByText('Ningún caso del periodo tiene investigación.'),
      ).toBeInTheDocument();
      expect(within(region).queryByRole('list')).not.toBeInTheDocument();
      expect(region).not.toHaveTextContent(/NaN|0\s%/);
    }
  });

  it('un grupo con denominador 0 dice «sin investigaciones con registro» y el otro sigue con sus porcentajes', () => {
    renderBlock({ withoutColdChainRecord: 12 });

    const coldChain = card('Cadena de frío');
    expect(within(coldChain).getByText('Sin investigaciones con registro.')).toBeInTheDocument();
    expect(within(coldChain).getByText('12 investigaciones sin registro')).toBeInTheDocument();
    expect(within(coldChain).queryByRole('list')).not.toBeInTheDocument();
    expect(coldChain).not.toHaveTextContent(/NaN|0\s%/);

    expect(within(card('Errores de administración')).getByText(/^3 · 30\s%$/)).toBeInTheDocument();
  });
});

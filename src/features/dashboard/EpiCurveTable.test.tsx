import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { EpiCurveTable } from './EpiCurveTable';
import { epiCurveFixture } from './epiCurveFixture';

const PARTIAL = 'Semana incompleta: no comparable';

function parseCount(text: string | null): number {
  return Number((text ?? '').replace(/\D/g, ''));
}

describe('EpiCurveTable', () => {
  const weeks = epiCurveFixture().weeks.slice(0, 3);

  function bodyRows() {
    const [, ...rows] = screen.getAllByRole('row');
    return rows;
  }

  it('una fila por semana, en el orden recibido, con su rango de fechas', () => {
    render(<EpiCurveTable weeks={weeks} />);

    const rowHeaders = bodyRows().map((row) => within(row).getByRole('rowheader'));
    expect(rowHeaders.map((cell) => cell.textContent)).toEqual([
      expect.stringContaining('2026-SE40'),
      expect.stringContaining('2026-SE41'),
      expect.stringContaining('2026-SE42'),
    ]);
    expect(rowHeaders[0]).toHaveTextContent(/Del 4 oct 2026 al 10 oct 2026/);
  });

  it('marca con texto solo la semana partial', () => {
    render(<EpiCurveTable weeks={weeks} />);

    const [partialRow, ...fullRows] = bodyRows();
    expect(within(partialRow).getByText(PARTIAL)).toBeInTheDocument();
    for (const row of fullRows) expect(within(row).queryByText(PARTIAL)).not.toBeInTheDocument();
  });

  it('los totales cuadran fila a fila', () => {
    render(<EpiCurveTable weeks={weeks} />);

    for (const row of bodyRows()) {
      const [serious, nonSerious, unclassified, total] = within(row)
        .getAllByRole('cell')
        .map((cell) => parseCount(cell.textContent));
      expect(serious + nonSerious + unclassified).toBe(total);
    }
  });

  it('las columnas llevan el nombre de cada serie', () => {
    render(<EpiCurveTable weeks={weeks} />);

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Semana', 'Graves', 'No graves', 'Sin clasificar', 'Total']);
  });
});

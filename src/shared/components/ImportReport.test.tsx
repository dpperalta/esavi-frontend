import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import { ImportReport, type ImportReportCounters, type ImportReportProps } from './ImportReport';

interface Rejection {
  row: number;
  reason: string;
}

const COUNTERS: ImportReportCounters = {
  read: 100,
  inserted: 60,
  updated: 10,
  unchanged: 30,
  invalid: 0,
  duplicated: 0,
};

const COLUMNS: ImportReportProps<Rejection>['rejectedColumns'] = [
  { key: 'row', header: 'Fila', render: (rejection) => rejection.row },
  { key: 'reason', header: 'Motivo', render: (rejection) => rejection.reason },
];

function rejections(count: number): Rejection[] {
  return Array.from({ length: count }, (_, index) => ({ row: index + 2, reason: 'EMPTY' }));
}

function renderReport(props: Partial<ImportReportProps<Rejection>> = {}) {
  return render(
    <ImportReport
      counters={COUNTERS}
      dryRun={false}
      rejected={[]}
      rejectedColumns={COLUMNS}
      {...props}
    />,
  );
}

describe('ImportReport (SPEC FE25c §3.9)', () => {
  it('pinta los seis contadores en orden', () => {
    renderReport();

    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    expect(terms).toEqual([
      'Leídas',
      'Insertadas',
      'Actualizadas',
      'Sin cambios',
      'Rechazadas',
      'Duplicadas',
    ]);
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('con invalid: 30, duplicated: 0 y 20 rechazos muestra la nota de truncado', () => {
    renderReport({ counters: { ...COUNTERS, invalid: 30 }, rejected: rejections(20) });

    expect(screen.getByText('Se muestran los primeros 20 rechazos.')).toBeInTheDocument();
  });

  it('con tantos rechazos como inválidos y duplicados no muestra la nota de truncado', () => {
    renderReport({
      counters: { ...COUNTERS, invalid: 1, duplicated: 1 },
      rejected: rejections(2),
    });

    expect(screen.queryByText('Se muestran los primeros 20 rechazos.')).not.toBeInTheDocument();
  });

  it('con cero rechazos no pinta la tabla y lo dice', () => {
    renderReport();

    expect(screen.getByText('No se rechazó ninguna fila.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('pinta las columnas configuradas y cada fila con su render', () => {
    renderReport({
      counters: { ...COUNTERS, invalid: 1 },
      rejected: [{ row: 42, reason: 'Motivo traducido' }],
    });

    const table = screen.getByRole('table', { name: 'Filas rechazadas' });
    expect(within(table).getByRole('columnheader', { name: 'Fila' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Motivo' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '42' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'Motivo traducido' })).toBeInTheDocument();
  });

  it('muestra la marca de simulación solo con dryRun: true', () => {
    const { rerender } = renderReport({ dryRun: true });
    expect(screen.getByText('Simulación: no se escribió nada.')).toBeInTheDocument();

    rerender(
      <ImportReport counters={COUNTERS} dryRun={false} rejected={[]} rejectedColumns={COLUMNS} />,
    );
    expect(screen.queryByText('Simulación: no se escribió nada.')).not.toBeInTheDocument();
  });

  it('pinta children entre los contadores y la tabla de rechazos', () => {
    renderReport({
      counters: { ...COUNTERS, invalid: 1 },
      rejected: rejections(1),
      children: <p>Hoja leída: WHODrug</p>,
    });

    const counters = screen.getByText('Leídas');
    const slot = screen.getByText('Hoja leída: WHODrug');
    const table = screen.getByRole('table');
    expect(counters.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('mueve el foco al título al montarse', () => {
    renderReport();

    expect(screen.getByRole('heading', { name: 'Informe de la importación' })).toHaveFocus();
  });
});

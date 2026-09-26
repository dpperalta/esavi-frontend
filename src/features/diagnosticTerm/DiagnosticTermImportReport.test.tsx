import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type {
  DiagnosticTermImportReport as DiagnosticTermImportReportData,
  RejectedDiagnosticTermRow,
} from '@/contracts/diagnosticTerm';
import { DiagnosticTermImportReport } from './DiagnosticTermImportReport';

function buildReport(
  overrides: Partial<DiagnosticTermImportReportData> = {},
): DiagnosticTermImportReportData {
  return {
    read: 100,
    inserted: 60,
    updated: 10,
    unchanged: 30,
    invalid: 0,
    duplicated: 0,
    dryRun: false,
    source: 'MEDDRA',
    termGroup: 'LLT',
    errors: [],
    ...overrides,
  };
}

function rejections(count: number): RejectedDiagnosticTermRow[] {
  return Array.from({ length: count }, (_, index) => ({
    line: index + 1,
    reason: 'EMPTY_NAME',
    raw: `1000000${index}$$`,
  }));
}

function renderReport(report: DiagnosticTermImportReportData) {
  return render(
    <MemoryRouter>
      <DiagnosticTermImportReport report={report} />
    </MemoryRouter>,
  );
}

describe('DiagnosticTermImportReport (SPEC FE25b §4 paso 5)', () => {
  it('pinta los seis contadores', () => {
    renderReport(buildReport());

    for (const label of [
      'Leídas',
      'Insertadas',
      'Actualizadas',
      'Sin cambios',
      'Rechazadas',
      'Duplicadas',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('con invalid: 30 y 20 errores muestra la nota de truncado', () => {
    renderReport(buildReport({ invalid: 30, errors: rejections(20) }));

    expect(screen.getByText('Se muestran los primeros 20 rechazos.')).toBeInTheDocument();
  });

  it('con tantos rechazos como errores no muestra la nota de truncado', () => {
    renderReport(buildReport({ invalid: 2, errors: rejections(2) }));

    expect(screen.queryByText('Se muestran los primeros 20 rechazos.')).not.toBeInTheDocument();
  });

  it('con dryRun: true muestra la marca de simulación y no el enlace a términos', () => {
    renderReport(buildReport({ dryRun: true }));

    expect(screen.getByText('Simulación: no se escribió nada.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver términos' })).not.toBeInTheDocument();
  });

  it('con dryRun: false no muestra la marca y ofrece «Ver términos»', () => {
    renderReport(buildReport());

    expect(screen.queryByText('Simulación: no se escribió nada.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver términos' })).toHaveAttribute(
      'href',
      '/diagnostic-terms',
    );
  });

  it('traduce el motivo de rechazo y muestra la línea y el contenido', () => {
    renderReport(
      buildReport({
        invalid: 1,
        errors: [{ line: 42, reason: 'DUPLICATE_IN_FILE', raw: '10016558$Fiebre' }],
      }),
    );

    expect(screen.getByText('El código ya apareció antes en el archivo.')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('10016558$Fiebre')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import type { GeoImportReport as GeoImportReportData } from '@/contracts/geoImport';
import { GeoImportReport } from './GeoImportReport';

function buildReport(overrides: Partial<GeoImportReportData> = {}): GeoImportReportData {
  return {
    dryRun: false,
    sheets: { geoLocation: 'geoLocation', healthFacility: 'healthFacility' },
    geoLocation: {
      read: 10,
      inserted: 5,
      updated: 2,
      unchanged: 3,
      invalid: 0,
      duplicated: 0,
      inactiveMatched: 0,
      sortOrderCoerced: 0,
    },
    healthFacility: {
      read: 4,
      inserted: 4,
      updated: 0,
      unchanged: 0,
      invalid: 0,
      duplicated: 0,
      inactiveMatched: 0,
    },
    missingOptionalHeaders: { geoLocation: [], healthFacility: [] },
    unknownHeaders: { geoLocation: [], healthFacility: [] },
    errors: [],
    ...overrides,
  };
}

describe('GeoImportReport (SPEC FE07 §4 paso 6)', () => {
  it('con inactiveMatched: 3 muestra el aviso', () => {
    const report = buildReport({
      geoLocation: {
        read: 3,
        inserted: 0,
        updated: 3,
        unchanged: 0,
        invalid: 0,
        duplicated: 0,
        inactiveMatched: 3,
        sortOrderCoerced: 0,
      },
    });

    render(<GeoImportReport report={report} />);

    expect(screen.getByText(/desactivada/i)).toBeInTheDocument();
  });

  it('con inactiveMatched: 0 no muestra el aviso', () => {
    render(<GeoImportReport report={buildReport()} />);

    expect(screen.queryByText(/desactivada/i)).not.toBeInTheDocument();
  });

  it('con invalid: 340 y 20 entradas en errors dice «20 de 340»', () => {
    const errors = Array.from({ length: 20 }, (_, index) => ({
      sheet: 'geoLocation' as const,
      row: index + 2,
      reason: 'VALUE_TOO_LONG' as const,
      column: 'name',
    }));
    const report = buildReport({
      geoLocation: {
        read: 400,
        inserted: 0,
        updated: 0,
        unchanged: 60,
        invalid: 340,
        duplicated: 0,
        inactiveMatched: 0,
        sortOrderCoerced: 0,
      },
      errors,
    });

    render(<GeoImportReport report={report} />);

    expect(screen.getByText('20 de 340 errores')).toBeInTheDocument();
  });

  it('con sheets.healthFacility: null muestra el estado "no venía en el libro", no ceros', () => {
    const report = buildReport({ sheets: { geoLocation: 'geoLocation', healthFacility: null } });

    render(<GeoImportReport report={report} />);

    expect(screen.getByText('Esta hoja no venía en el libro.')).toBeInTheDocument();
  });

  it('con errors: [] sale el estado vacío de la tabla', () => {
    render(<GeoImportReport report={buildReport()} />);

    expect(screen.getByText('No hubo filas rechazadas.')).toBeInTheDocument();
  });
});

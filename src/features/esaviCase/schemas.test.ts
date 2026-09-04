import { describe, expect, it } from 'vitest';
import { caseWorkflowFiltersSchema, esaviCaseFiltersSchema } from './schemas';

describe('esaviCaseFiltersSchema', () => {
  it('descarta lo inválido y produce un objeto de filtros vacío, sin lanzar', () => {
    const result = esaviCaseFiltersSchema.safeParse({
      reportDate: 'ayer',
      patientId: 'abc',
      page: '-3',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.filters.reportDate).toBeUndefined();
    expect(result.data.filters.patientId).toBeUndefined();
  });

  it('From posterior a To marca error y no produce petición', () => {
    const result = esaviCaseFiltersSchema.safeParse({
      reportDateFrom: '2026-03-05',
      reportDateTo: '2026-03-01',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual(['reportDateTo']);
    expect(result.error.issues[0].message).toBe('rangeInvalid');
  });

  it('las tres columnas de fecha aplican la misma regla From ≤ To', () => {
    for (const column of ['reportDate', 'eventDate', 'reportFillingDate']) {
      const result = esaviCaseFiltersSchema.safeParse({
        [`${column}From`]: '2026-05-01',
        [`${column}To`]: '2026-01-01',
      });
      expect(result.success).toBe(false);
    }
  });

  it('?reportDate=…&eventDateFrom=… es válida: la exclusión es por columna, no global', () => {
    const result = esaviCaseFiltersSchema.safeParse({
      reportDate: '2026-03-01',
      eventDateFrom: '2026-02-01',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filters.reportDate).toBe('2026-03-01');
    expect(result.data.filters.eventDateFrom).toBe('2026-02-01');
  });

  it('code de un carácter se descarta y code de dos se conserva', () => {
    const short = esaviCaseFiltersSchema.safeParse({ code: 'a' });
    const long = esaviCaseFiltersSchema.safeParse({ code: 'ab' });

    expect(short.success && short.data.filters.code).toBeUndefined();
    expect(long.success && long.data.filters.code).toBe('ab');
  });

  it('geoLocationId inválido se descarta sin lanzar', () => {
    const result = esaviCaseFiltersSchema.safeParse({ geoLocationId: 'not-a-uuid' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filters.geoLocationId).toBeUndefined();
  });

  it('includeInactive sólo es true con el literal "true"', () => {
    const yes = esaviCaseFiltersSchema.safeParse({ includeInactive: 'true' });
    const typo = esaviCaseFiltersSchema.safeParse({ includeInactive: '1' });
    const absent = esaviCaseFiltersSchema.safeParse({});

    expect(yes.success && yes.data.includeInactive).toBe(true);
    expect(typo.success && typo.data.includeInactive).toBe(false);
    expect(absent.success && absent.data.includeInactive).toBe(false);
  });
});

describe('caseWorkflowFiltersSchema', () => {
  it('parsea los tres filtros de la bandeja', () => {
    const result = caseWorkflowFiltersSchema.safeParse({
      statusCode: 'IN_INVESTIGATION',
      openedFrom: '2026-01-01',
      openedTo: '2026-03-01',
      page: '2',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filters).toEqual({
      statusCode: 'IN_INVESTIGATION',
      openedFrom: '2026-01-01',
      openedTo: '2026-03-01',
    });
    expect(result.data.page).toBe(2);
  });

  it('no aplica ninguna regla de rango a openedFrom/openedTo', () => {
    const result = caseWorkflowFiltersSchema.safeParse({
      openedFrom: '2026-03-05',
      openedTo: '2026-01-01',
    });

    expect(result.success).toBe(true);
  });

  it('un openedFrom inválido se descarta sin lanzar', () => {
    const result = caseWorkflowFiltersSchema.safeParse({ openedFrom: 'ayer' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filters.openedFrom).toBeUndefined();
  });
});

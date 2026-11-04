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

  // SPEC FE34 §3.5 — closed to the eight codes of CASE_WORKFLOW_STATUS_CODES.
  it('statusCode conocido se conserva, desconocido se descarta y ausente queda undefined', () => {
    const known = esaviCaseFiltersSchema.safeParse({ statusCode: 'IN_INVESTIGATION' });
    const unknown = esaviCaseFiltersSchema.safeParse({ statusCode: 'FOO' });
    const absent = esaviCaseFiltersSchema.safeParse({});

    expect(known.success && known.data.filters.statusCode).toBe('IN_INVESTIGATION');
    expect(unknown.success).toBe(true);
    expect(unknown.success && unknown.data.filters.statusCode).toBeUndefined();
    expect(absent.success && absent.data.filters.statusCode).toBeUndefined();
  });

  it('includeInactive sólo es true con el literal "true"', () => {
    const yes = esaviCaseFiltersSchema.safeParse({ includeInactive: 'true' });
    const typo = esaviCaseFiltersSchema.safeParse({ includeInactive: '1' });
    const absent = esaviCaseFiltersSchema.safeParse({});

    expect(yes.success && yes.data.includeInactive).toBe(true);
    expect(typo.success && typo.data.includeInactive).toBe(false);
    expect(absent.success && absent.data.includeInactive).toBe(false);
  });

  describe('lote y vacuna (SPEC FE37)', () => {
    const vaccineKey = 'W:3f2a9c1e-8b7d-4e6f-a5c4-1d2e3f4a5b6c';

    it('batchNumber=AB-123 es válido y viaja tal como llega', () => {
      const result = esaviCaseFiltersSchema.parse({ batchNumber: 'AB-123' });
      expect(result.filters.batchNumber).toBe('AB-123');
    });

    it('batchNumber sin letras ni números se descarta', () => {
      const result = esaviCaseFiltersSchema.parse({ batchNumber: '--' });
      expect(result.filters.batchNumber).toBeUndefined();
    });

    it('batchNumber de más de 100 caracteres se descarta', () => {
      const result = esaviCaseFiltersSchema.parse({ batchNumber: 'A'.repeat(101) });
      expect(result.filters.batchNumber).toBeUndefined();
    });

    it('vaccineKey W:<uuid> con lote se conserva, y T:<texto> también', () => {
      expect(
        esaviCaseFiltersSchema.parse({ batchNumber: 'AB123', vaccineKey }).filters.vaccineKey,
      ).toBe(vaccineKey);
      expect(
        esaviCaseFiltersSchema.parse({ batchNumber: 'AB123', vaccineKey: 'T:vacuna libre' }).filters
          .vaccineKey,
      ).toBe('T:vacuna libre');
    });

    it('vaccineKey sin lote, o con un lote descartado, se descarta', () => {
      expect(esaviCaseFiltersSchema.parse({ vaccineKey }).filters).not.toHaveProperty('vaccineKey');
      expect(
        esaviCaseFiltersSchema.parse({ batchNumber: '--', vaccineKey }).filters,
      ).not.toHaveProperty('vaccineKey');
    });

    it('vaccineKey=foo se descarta', () => {
      const result = esaviCaseFiltersSchema.parse({ batchNumber: 'AB123', vaccineKey: 'foo' });
      expect(result.filters).not.toHaveProperty('vaccineKey');
    });

    it('los otros quince filtros no cambian con lote y vacuna presentes', () => {
      const others = {
        code: 'EC-001',
        statusCode: 'IN_NOTIFICATION',
        patientId: '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
        healthFacilityId: '1b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
        geoLocationId: '2b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
        reportDate: '2026-01-10',
        eventDateFrom: '2026-01-01',
        eventDateTo: '2026-01-31',
        reportFillingDateFrom: '2026-02-01',
      };
      const without = esaviCaseFiltersSchema.parse(others).filters;
      const withBatch = esaviCaseFiltersSchema.parse({
        ...others,
        batchNumber: 'AB123',
        vaccineKey,
      }).filters;
      expect(withBatch).toEqual({ ...without, batchNumber: 'AB123', vaccineKey });
    });
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

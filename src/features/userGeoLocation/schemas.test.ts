import { describe, expect, it } from 'vitest';
import '@/shared/config/i18n';
import {
  bulkAssignGeoSchema,
  composeValidFrom,
  composeValidTo,
  updateGeoValiditySchema,
} from './schemas';

const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const LOCATION_B = '22222222-2222-4222-8222-222222222222';

describe('composición de las fechas — SPEC FE22 §3.5', () => {
  it('el mismo día en las dos fechas es un día completo, no un rango vacío', () => {
    const from = new Date(composeValidFrom('2026-03-01'));
    const to = new Date(composeValidTo('2026-03-01'));

    // 24 horas menos un milisegundo: lo que el CHECK (validTo > validFrom) acepta y un rango
    // construido con dos medianoches no.
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('compone la hora en local, no en UTC', () => {
    const from = new Date(composeValidFrom('2026-03-01'));
    const to = new Date(composeValidTo('2026-03-01'));

    expect(from.getFullYear()).toBe(2026);
    expect(from.getDate()).toBe(1);
    expect(from.getHours()).toBe(0);
    expect(to.getDate()).toBe(1);
    expect(to.getHours()).toBe(23);
    expect(to.getMilliseconds()).toBe(999);
  });

  it('serializa en ISO 8601 con desfase, no en Z', () => {
    expect(composeValidFrom('2026-03-01')).toMatch(/^2026-03-01T00:00:00\.000[+-]\d{2}:\d{2}$/);
  });
});

describe('updateGeoValiditySchema — ESAVI-USERGEO-004', () => {
  it('acepta el mismo día en validFrom y validTo', () => {
    const result = updateGeoValiditySchema.safeParse({
      validFrom: '2026-03-01',
      validTo: '2026-03-01',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza en el cliente un validTo anterior a validFrom, y lo marca en validTo', () => {
    const result = updateGeoValiditySchema.safeParse({
      validFrom: '2026-03-02',
      validTo: '2026-03-01',
    });

    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual(['validTo']);
    expect(issue?.message).toBe('La fecha de fin tiene que ser posterior a la de inicio.');
  });

  it('una vigencia abierta —sin validTo— es válida', () => {
    const result = updateGeoValiditySchema.safeParse({ validFrom: '2026-03-01', validTo: null });
    expect(result.success).toBe(true);
  });
});

describe('bulkAssignGeoSchema — ESAVI-USERGEO-007', () => {
  it('exige al menos una ubicación', () => {
    const result = bulkAssignGeoSchema.safeParse({
      geoLocationIds: [],
      validFrom: null,
      validTo: null,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza ids repetidos, que el validador del backend devuelve como 400', () => {
    const result = bulkAssignGeoSchema.safeParse({
      geoLocationIds: [LOCATION_A, LOCATION_A],
      validFrom: null,
      validTo: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Hay una ubicación repetida en la lista.');
  });

  it('acepta varias ubicaciones distintas sin fechas', () => {
    const result = bulkAssignGeoSchema.safeParse({
      geoLocationIds: [LOCATION_A, LOCATION_B],
      validFrom: null,
      validTo: null,
    });
    expect(result.success).toBe(true);
  });
});

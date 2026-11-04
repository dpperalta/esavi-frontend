import { describe, expect, it } from 'vitest';
import { parseDashboardPeriod } from './dashboardPeriod';
import { dashboardPeriodSchema } from './schemas';

const TODAY = '2026-11-03';
const GEO_ID = '3f1c2a9e-8b4d-4c1e-9a7f-2d6b5e8c1a40';

function parse(query: string) {
  return parseDashboardPeriod(new URLSearchParams(query), TODAY);
}

describe('parseDashboardPeriod', () => {
  it('sin parámetros da mode default y no descarta nada', () => {
    expect(parse('')).toEqual({
      params: { mode: 'default' },
      periodDiscarded: false,
      geoLocationIdDiscarded: false,
    });
  });

  it('?range=30d da mode range', () => {
    const { params, periodDiscarded } = parse('range=30d');
    expect(params).toEqual({ mode: 'range', range: '30d' });
    expect(periodDiscarded).toBe(false);
  });

  it('un personalizado válido da mode custom con las dos fechas', () => {
    const { params, periodDiscarded } = parse('from=2026-10-01&to=2026-10-31');
    expect(params).toEqual({ mode: 'custom', from: '2026-10-01', to: '2026-10-31' });
    expect(periodDiscarded).toBe(false);
  });

  it('con fechas y range a la vez mandan las fechas, aunque range sea inválido', () => {
    expect(parse('range=7d&from=2026-10-01&to=2026-10-31').params).toEqual({
      mode: 'custom',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(parse('range=999d&from=2026-10-01&to=2026-10-31').periodDiscarded).toBe(false);
  });

  it.each([
    ['from > to', 'from=2026-10-31&to=2026-10-01'],
    ['to futura', 'from=2026-11-01&to=2026-11-04'],
    ['367 días', 'from=2025-11-01&to=2026-11-02'],
    ['range=999d', 'range=999d'],
    ['solo from', 'from=2030-01-01'],
    ['fecha inexistente', 'from=2026-02-30&to=2026-03-01'],
  ])('%s se descarta entero y vuelve al default', (_label, query) => {
    const { params, periodDiscarded } = parse(query);
    expect(params.mode).toBe('default');
    expect(params.range).toBeUndefined();
    expect(params.from).toBeUndefined();
    expect(params.to).toBeUndefined();
    expect(periodDiscarded).toBe(true);
  });

  it('366 días exactos se aceptan', () => {
    expect(parse('from=2025-11-03&to=2026-11-03').params.mode).toBe('custom');
  });

  it('to = hoy se acepta', () => {
    expect(parse('from=2026-11-01&to=2026-11-03').params.mode).toBe('custom');
  });

  it('un geoLocationId válido se conserva junto al periodo', () => {
    expect(parse(`range=7d&geoLocationId=${GEO_ID}`).params).toEqual({
      mode: 'range',
      range: '7d',
      geoLocationId: GEO_ID,
    });
  });

  it('un geoLocationId mal formado se descarta por separado, sin tocar el periodo', () => {
    const result = parse('range=90d&geoLocationId=abc');
    expect(result.params).toEqual({ mode: 'range', range: '90d' });
    expect(result.geoLocationIdDiscarded).toBe(true);
    expect(result.periodDiscarded).toBe(false);
  });
});

describe('dashboardPeriodSchema', () => {
  const schema = dashboardPeriodSchema(TODAY);

  function firstIssue(input: Record<string, string>) {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    return result.error.issues[0];
  }

  it('from > to marca fromAfterTo sobre to', () => {
    const issue = firstIssue({ from: '2026-10-31', to: '2026-10-01' });
    expect(issue.path).toEqual(['to']);
    expect(issue.message).toBe('dashboard.period.errors.fromAfterTo');
  });

  it('to futura marca futureTo', () => {
    expect(firstIssue({ from: '2026-11-01', to: '2026-11-04' }).message).toBe(
      'dashboard.period.errors.futureTo',
    );
  });

  it('más de 366 días marca tooLong', () => {
    expect(firstIssue({ from: '2025-11-01', to: '2026-11-02' }).message).toBe(
      'dashboard.period.errors.tooLong',
    );
  });

  it('un personalizado a medias marca el extremo que falta', () => {
    expect(firstIssue({ from: '2026-10-01' }).path).toEqual(['to']);
  });
});

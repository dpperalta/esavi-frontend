import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useChartViewParam } from './useChartViewParam';

function renderViewParam(initialUrl: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ view: useChartViewParam('x'), search: new URLSearchParams(useLocation().search) }),
    { wrapper },
  );
}

describe('useChartViewParam', () => {
  it('sin el parámetro muestra el gráfico', () => {
    const { result } = renderViewParam('/?range=90d');

    expect(result.current.view.isTable).toBe(false);
  });

  it('toggle() escribe x=table y conserva los demás parámetros', () => {
    const { result } = renderViewParam('/?range=90d&geoLocationId=geo-1');

    act(() => result.current.view.toggle());

    expect(result.current.view.isTable).toBe(true);
    expect(result.current.search.get('x')).toBe('table');
    expect(result.current.search.get('range')).toBe('90d');
    expect(result.current.search.get('geoLocationId')).toBe('geo-1');
  });

  it('el segundo toggle() borra x y conserva los demás parámetros', () => {
    const { result } = renderViewParam('/?from=2026-10-01&to=2026-10-31&x=table');

    act(() => result.current.view.toggle());

    expect(result.current.view.isTable).toBe(false);
    expect(result.current.search.has('x')).toBe(false);
    expect(result.current.search.get('from')).toBe('2026-10-01');
    expect(result.current.search.get('to')).toBe('2026-10-31');
  });

  it('un valor desconocido se lee como gráfico, y toggle() pasa a la tabla', () => {
    const { result } = renderViewParam('/?x=cualquierCosa');

    expect(result.current.view.isTable).toBe(false);

    act(() => result.current.view.toggle());

    expect(result.current.search.get('x')).toBe('table');
  });

  it('solo toca su propia clave', () => {
    const { result } = renderViewParam('/?x=table&y=table');

    act(() => result.current.view.toggle());

    expect(result.current.search.get('y')).toBe('table');
  });
});

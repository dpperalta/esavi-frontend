import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
import '@/shared/config/i18n';
import type { DashboardGeoRow } from '@/contracts/dashboard';
import { distributionsFixture } from './distributionsFixture';
import { GeoDistributionMap } from './GeoDistributionMap';

// jsdom cannot lay out Leaflet, so the test runs against a double that records the circle layer:
// how many circles, which radius, what a click writes — not the render (SPEC FE36c §7).
vi.mock('leaflet', () => {
  class FakeCircle {
    options: Record<string, unknown>;
    latlng: [number, number];
    tooltipOpen = false;
    private handlers: Record<string, Array<(event: unknown) => void>> = {};

    constructor(latlng: [number, number], options: Record<string, unknown>) {
      this.latlng = latlng;
      this.options = options;
    }
    bindTooltip(content: HTMLElement) {
      this.tooltip = content;
      return this;
    }
    tooltip: HTMLElement | null = null;
    on(event: string, callback: (event: unknown) => void) {
      (this.handlers[event] ??= []).push(callback);
      return this;
    }
    openTooltip() {
      this.tooltipOpen = true;
    }
    click(pointerType: string) {
      this.handlers.click?.forEach((callback) => callback({ originalEvent: { pointerType } }));
    }
  }

  class FakeLayerGroup {
    layers: FakeCircle[] = [];
    addTo() {
      return this;
    }
    addLayer(layer: FakeCircle) {
      this.layers.push(layer);
    }
    clearLayers() {
      this.layers = [];
    }
  }

  class FakeMap {
    fitBounds = vi.fn();
    setView = vi.fn();
    private container: HTMLElement;
    constructor(container: HTMLElement) {
      this.container = container;
    }
    getContainer() {
      return this.container;
    }
    invalidateSize() {}
    getCenter() {
      return { lat: 0, lng: 0 };
    }
    getZoom() {
      return 6;
    }
    remove() {}
  }

  return {
    default: {
      map: vi.fn((container: HTMLElement) => new FakeMap(container)),
      tileLayer: vi.fn(() => ({ addTo: () => undefined })),
      layerGroup: vi.fn(() => new FakeLayerGroup()),
      circleMarker: vi.fn(
        (latlng: [number, number], options: Record<string, unknown>) =>
          new FakeCircle(latlng, options),
      ),
      latLngBounds: vi.fn((points: unknown) => ({ points })),
    },
  };
});

interface FakeCircleHandle {
  options: { radius: number; className: string };
  tooltip: HTMLElement;
  tooltipOpen: boolean;
  click: (pointerType: string) => void;
}

function circles(): FakeCircleHandle[] {
  const group = vi.mocked(L.layerGroup).mock.results.at(-1)?.value as {
    layers: FakeCircleHandle[];
  };
  return group.layers;
}

function lastMap() {
  return vi.mocked(L.map).mock.results.at(-1)?.value as {
    fitBounds: ReturnType<typeof vi.fn>;
    setView: ReturnType<typeof vi.fn>;
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="search">{location.search}</div>
      <div data-testid="action">{useNavigationType()}</div>
    </>
  );
}

const rows = distributionsFixture().geography.rows;

function renderMap(mapRows: DashboardGeoRow[] = rows, search = '?range=90d') {
  const view = (current: DashboardGeoRow[]) => (
    <MemoryRouter initialEntries={[`/${search}`]}>
      <GeoDistributionMap rows={current} />
      <LocationProbe />
    </MemoryRouter>
  );
  const result = render(view(mapRows));
  return { ...result, rerenderRows: (next: DashboardGeoRow[]) => result.rerender(view(next)) };
}

// jsdom measures every element at 0×0; the map fits only once its container has a size.
function setContainerSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
  } as DOMRect);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  setContainerSize(600, 360);
});

describe('GeoDistributionMap', () => {
  it('dibuja un círculo por unidad con coordenadas y casos, y ninguno más', () => {
    renderMap();

    expect(circles()).toHaveLength(2);
  });

  it('la unidad con más casos tiene el radio máximo de 28 px y la escala es por raíz cuadrada', () => {
    renderMap();

    const [pichincha, guayas] = circles();
    expect(pichincha.options.radius).toBe(28);
    expect(guayas.options.radius).toBeCloseTo(4 + 24 * Math.sqrt(8 / 18));
  });

  it('el color sale de --chart-1 por clase, no por las opciones del trazo', () => {
    renderMap();

    const options = vi.mocked(L.circleMarker).mock.calls[0][1] as Record<string, unknown>;
    expect(options.className).toContain('fill-chart-1/40');
    expect(options).not.toHaveProperty('color');
    expect(options).not.toHaveProperty('fillColor');
  });

  it('no hace zoom con la rueda y encuadra los círculos', () => {
    renderMap();

    expect(vi.mocked(L.map).mock.calls[0][1]).toMatchObject({ scrollWheelZoom: false });
    expect(lastMap().fitBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: [24, 24] }),
    );
  });

  it('el tooltip lleva el nombre, los casos y los graves', () => {
    renderMap();

    expect(circles()[0].tooltip.textContent).toBe('Pichincha18 casos4 graves');
  });

  it('cambiar las filas redibuja los círculos sin recrear el mapa', () => {
    const { container, rerenderRows } = renderMap();
    const mapNode = container.querySelector('[role="img"]');

    rerenderRows(rows.slice(1));

    expect(L.map).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="img"]')).toBe(mapNode);
    expect(circles()).toHaveLength(1);
    expect(circles()[0].options.radius).toBe(28);
  });

  it('montado a 0×0 no encuadra todavía: el encuadre espera al primer tamaño real', () => {
    setContainerSize(0, 0);
    renderMap();

    expect(circles()).toHaveLength(2);
    expect(lastMap().fitBounds).not.toHaveBeenCalled();
  });

  it('sin círculos se centra en el centro por defecto y lo anuncia', () => {
    renderMap(rows.slice(2));

    expect(circles()).toHaveLength(0);
    expect(lastMap().fitBounds).not.toHaveBeenCalled();
    expect(lastMap().setView).toHaveBeenCalled();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Ninguna unidad de este nivel tiene coordenadas para el mapa',
    );
  });

  it('el contenedor resume el mapa para lectores de pantalla', () => {
    renderMap();

    expect(screen.getByRole('img')).toHaveAccessibleName(
      '2 unidades en el mapa; la de más casos, Pichincha con 18',
    );
  });

  it('un clic con ratón baja de nivel con una entrada nueva y conserva el periodo', () => {
    renderMap();

    act(() => circles()[1].click('mouse'));

    const params = new URLSearchParams(screen.getByTestId('search').textContent ?? '');
    expect(params.get('geoLocationId')).toBe(rows[1].geoLocationId);
    expect(params.get('range')).toBe('90d');
    expect(screen.getByTestId('action')).toHaveTextContent('PUSH');
  });

  it('en táctil, el primer toque solo abre el tooltip y el segundo baja de nivel', () => {
    renderMap();
    const guayas = circles()[1];

    act(() => guayas.click('touch'));
    expect(guayas.tooltipOpen).toBe(true);
    expect(screen.getByTestId('search')).not.toHaveTextContent('geoLocationId');

    act(() => guayas.click('touch'));
    expect(screen.getByTestId('search')).toHaveTextContent(
      `geoLocationId=${rows[1].geoLocationId}`,
    );
  });
});

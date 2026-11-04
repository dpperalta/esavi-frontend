import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DashboardGeoRow } from '@/contracts/dashboard';
import {
  ABSOLUTE_FALLBACK_CENTER,
  MAP_MAX_ZOOM,
  MAP_TILE_ATTRIBUTION,
  resolveDefaultMapCenter,
  resolveTileUrl,
} from '@/shared/config/map';
import { circleRadius, isMappable, type MappableGeoRow } from './geoRows';
import { useGeoDrillDown } from './useGeoDrillDown';

const FIT_PADDING = 24;
const DEFAULT_ZOOM = 6;
// fitBounds over a single circle would zoom to street level; a province-sized view is enough.
const FIT_MAX_ZOOM = 10;

// SVG presentation attributes do not resolve `var()`, so the color never goes in the path options:
// it comes from these utilities over `--chart-1` (SPEC FE36c §3.7). Opacity stays at 1
// in the options so the alpha of the class is the only one applied.
const CIRCLE_CLASS = 'fill-chart-1/40 stroke-chart-1 hover:fill-chart-1/60';

function isTouchClick(event: L.LeafletMouseEvent): boolean {
  const pointerType = (event.originalEvent as PointerEvent).pointerType;
  if (pointerType) return pointerType === 'touch';
  return window.matchMedia('(pointer: coarse)').matches;
}

function hasSize(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function GeoDistributionMap({ rows }: { rows: DashboardGeoRow[] }) {
  const { t, i18n } = useTranslation();
  const { drillDown } = useGeoDrillDown();
  const captionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circlesRef = useRef<L.LayerGroup | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const drillDownRef = useRef(drillDown);
  drillDownRef.current = drillDown;

  const circles = rows.filter((row): row is MappableGeoRow => isMappable(row) && row.total > 0);
  const top = circles.reduce<MappableGeoRow | null>(
    (best, row) => (best === null || row.total > best.total ? row : best),
    null,
  );
  const countFormat = new Intl.NumberFormat(i18n.language);
  const summary = top
    ? t('dashboard.geo.summary', {
        count: circles.length,
        name: top.name,
        total: countFormat.format(top.total),
      })
    : t('dashboard.geo.noMappable');

  // Created once; period and level changes only redraw the circle layer (SPEC FE36c §3.4).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const center = resolveDefaultMapCenter() ?? ABSOLUTE_FALLBACK_CENTER;
    const map = L.map(container, {
      center: [center.lat, center.lng],
      zoom: DEFAULT_ZOOM,
      // A map halfway down Inicio must not trap the wheel; zoom stays on the controls and gestures.
      scrollWheelZoom: false,
      // The circles take no focus: the table is the keyboard path, so the container is no tab stop.
      keyboard: false,
      // Leaflet's own control carries English titles; a translated one is added below.
      zoomControl: false,
    });
    L.tileLayer(resolveTileUrl(), {
      attribution: MAP_TILE_ATTRIBUTION,
      maxZoom: MAP_MAX_ZOOM,
    }).addTo(map);
    mapRef.current = map;
    circlesRef.current = L.layerGroup().addTo(map);

    // Same 0×0 mount problem as MapPointPicker, plus fitBounds: it computes the zoom from the
    // container size, so a fit drawn at 0×0 is deferred and replayed on the first real size.
    let hadZeroSize = !hasSize(container);
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
      if (hadZeroSize && hasSize(container)) {
        hadZeroSize = false;
        fitRef.current();
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      circlesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = circlesRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const maxTotal = Math.max(...circles.map((row) => row.total));
    // On touch the first tap only opens the tooltip, the second one drills down: reading a circle
    // must not lose the current view (SPEC FE36c §6).
    let armedId: string | null = null;

    for (const row of circles) {
      const circle = L.circleMarker([row.latitude, row.longitude], {
        radius: circleRadius(row.total, maxTotal),
        className: CIRCLE_CLASS,
        weight: 1.5,
        opacity: 1,
        fillOpacity: 1,
      });
      circle.bindTooltip(tooltipContent(row), { direction: 'top', className: 'geo-tooltip' });
      circle.on('click', (event: L.LeafletMouseEvent) => {
        if (isTouchClick(event) && armedId !== row.geoLocationId) {
          armedId = row.geoLocationId;
          circle.openTooltip();
          return;
        }
        drillDownRef.current(row.geoLocationId);
      });
      circle.on('tooltipclose', () => {
        if (armedId === row.geoLocationId) armedId = null;
      });
      layer.addLayer(circle);
    }

    fitRef.current = () => {
      if (circles.length > 0) {
        const bounds = L.latLngBounds(circles.map((row) => [row.latitude, row.longitude]));
        map.fitBounds(bounds, { padding: [FIT_PADDING, FIT_PADDING], maxZoom: FIT_MAX_ZOOM });
      } else {
        const center = resolveDefaultMapCenter() ?? ABSOLUTE_FALLBACK_CENTER;
        map.setView([center.lat, center.lng], DEFAULT_ZOOM, { animate: false });
      }
    };
    if (hasSize(map.getContainer())) fitRef.current();

    // Built from the server's name with textContent, never as HTML.
    function tooltipContent(row: MappableGeoRow): HTMLElement {
      const root = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'font-medium';
      name.translate = false;
      name.textContent = row.name;
      const cases = document.createElement('p');
      cases.className = 'tabular-nums';
      cases.textContent = t('dashboard.geo.tooltip.cases', {
        count: row.total,
        formatted: countFormat.format(row.total),
      });
      const serious = document.createElement('p');
      serious.className = 'tabular-nums text-muted-foreground';
      serious.textContent = t('dashboard.geo.tooltip.serious', {
        count: row.serious,
        formatted: countFormat.format(row.serious),
      });
      root.append(name, cases, serious);
      return root;
    }
    // `circles` is derived from `rows` on every render; `rows` and the language are what change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, i18n.language]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const zoom = L.control
      .zoom({ zoomInTitle: t('dashboard.geo.zoomIn'), zoomOutTitle: t('dashboard.geo.zoomOut') })
      .addTo(map);
    return () => {
      zoom.remove();
    };
  }, [t]);

  // A figure, not role="img": Leaflet's zoom buttons live inside the container and must stay
  // reachable, which an img's presentational children are not. The caption carries the summary,
  // and is visible when there is no circle, since it is then the «no coordinates» notice.
  return (
    <figure aria-labelledby={captionId} className="m-0 flex flex-col gap-2">
      <div
        ref={containerRef}
        className="isolate h-[260px] w-full rounded-md border border-border lg:h-[360px]"
      />
      <figcaption id={captionId} className={top ? 'sr-only' : 'text-sm text-muted-foreground'}>
        {summary}
      </figcaption>
    </figure>
  );
}

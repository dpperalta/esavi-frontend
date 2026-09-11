import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/utils';

// Vite serves leaflet's marker images from a hashed URL, not the relative path the library's own
// default icon computes at import time (an `import.meta.url` trick that assumes an unbundled
// static layout) — without this, dragging a marker onto the map paints nothing (SPEC FE13a §3.7).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
});

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapPointPickerProps {
  value: LatLng | null;
  onChange: (value: LatLng | null) => void;
  // Por defecto, VITE_MAP_DEFAULT_CENTER (SPEC FE13a §3.7). El llamador lo sobreescribe con las
  // coordenadas del `geoLocation` elegido, cuando las trae.
  fallbackCenter?: LatLng;
  disabled?: boolean;
  ariaLabel: string;
}

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// Último recurso si ni el `value`, ni `fallbackCenter`, ni `VITE_MAP_DEFAULT_CENTER` resuelven —
// nunca geolocalización del navegador (§3.7).
const ABSOLUTE_FALLBACK_CENTER: LatLng = { lat: 0, lng: 0 };
const COORDINATE_PRECISION = 7;
const FLOAT_PATTERN = /^-?\d+(\.\d+)?$/;

// Avisa una sola vez por sesión de página, no por instancia del componente — un formulario con
// varios `<MapPointPicker>` (éste y el de `investigationCommunity` en FE13d) no debe repetir el
// mismo aviso por cada uno.
let warnedMissingTileUrl = false;
let warnedMissingDefaultCenter = false;

function resolveTileUrl(): string {
  const raw = import.meta.env.VITE_MAP_TILE_URL as string | undefined;
  if (raw) {
    return raw;
  }
  if (!warnedMissingTileUrl) {
    warnedMissingTileUrl = true;
    console.warn(
      'VITE_MAP_TILE_URL no está definida — <MapPointPicker> usa el servidor público de OpenStreetMap.',
    );
  }
  return DEFAULT_TILE_URL;
}

function parseLatLng(raw: string | undefined): LatLng | null {
  if (!raw) {
    return null;
  }
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return { lat: parts[0], lng: parts[1] };
}

function resolveEnvDefaultCenter(): LatLng | null {
  const parsed = parseLatLng(import.meta.env.VITE_MAP_DEFAULT_CENTER as string | undefined);
  if (!parsed && !warnedMissingDefaultCenter) {
    warnedMissingDefaultCenter = true;
    console.warn(
      'VITE_MAP_DEFAULT_CENTER no está definida o no es válida — <MapPointPicker> usa (0, 0).',
    );
  }
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Redondea a `numeric(10,7)` (§3.7): arrastrar el marcador y escribir en el campo tienen que
// producir siempre el mismo valor, y evita el `400` que el usuario no puede entender.
function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION));
}

function toLatLng(lat: number, lng: number): LatLng {
  return {
    lat: roundCoordinate(clamp(lat, -90, 90)),
    lng: roundCoordinate(clamp(lng, -180, 180)),
  };
}

// La primitiva de `ARCHITECTURE.md` §4.3, declarada y escrita en SPEC FE13a §3.7. Leaflet sobre
// `VITE_MAP_TILE_URL`, con dos campos numéricos como alternativa sin ratón: el mapa y los campos
// son dos vistas del mismo `value`, nunca dos dueños (SPEC FE13a §3.4).
export function MapPointPicker({ value, onChange, fallbackCenter, disabled, ariaLabel }: MapPointPickerProps) {
  const { t } = useTranslation();
  const latId = useId();
  const lngId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(!!disabled);
  onChangeRef.current = onChange;

  const [latDraft, setLatDraft] = useState(value ? String(value.lat) : '');
  const [lngDraft, setLngDraft] = useState(value ? String(value.lng) : '');

  useEffect(() => {
    setLatDraft(value ? String(value.lat) : '');
    setLngDraft(value ? String(value.lng) : '');
  }, [value]);

  function emit(lat: number, lng: number) {
    onChangeRef.current(toLatLng(lat, lng));
  }

  // Monta el mapa una sola vez. `value`, `disabled` y `ariaLabel` se sincronizan aparte, en los
  // efectos de abajo, porque Leaflet es imperativo y no vuelve a montarse en cada cambio.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }
    const initialCenter = value ?? fallbackCenter ?? resolveEnvDefaultCenter() ?? ABSOLUTE_FALLBACK_CENTER;
    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: value ? 15 : 6,
    });
    L.tileLayer(resolveTileUrl(), {
      // Texto exigido verbatim por la política de uso de OpenStreetMap — no es texto de la
      // interfaz, así que no viene de `investigation.*` ni de `common.*` (CONVENTIONS.md §10.1
      // cubre color y texto propios, no la atribución legal de un tercero).
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (disabledRef.current) {
        return;
      }
      emit(event.latlng.lat, event.latlng.lng);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    containerRef.current?.setAttribute('aria-label', ariaLabel);
  }, [ariaLabel]);

  // El marcador es la única fuente de verdad de dónde está el punto en el mapa: se crea, se mueve
  // o se quita según `value`, nunca lleva posición propia.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = L.marker([value.lat, value.lng], { draggable: !disabledRef.current }).addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        emit(position.lat, position.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
    map.panTo([value.lat, value.lng]);
  }, [value]);

  useEffect(() => {
    disabledRef.current = !!disabled;
    const map = mapRef.current;
    const marker = markerRef.current;
    const interactionHandlers = map
      ? [map.dragging, map.doubleClickZoom, map.scrollWheelZoom, map.boxZoom, map.keyboard, map.touchZoom]
      : [];
    for (const handler of interactionHandlers) {
      if (disabled) {
        handler.disable();
      } else {
        handler.enable();
      }
    }
    if (marker) {
      if (disabled) {
        marker.dragging?.disable();
      } else {
        marker.dragging?.enable();
      }
    }
  }, [disabled]);

  function commitLat(raw: string) {
    setLatDraft(raw);
    const trimmed = raw.trim();
    if (trimmed === '' || !FLOAT_PATTERN.test(trimmed)) {
      return;
    }
    emit(Number(trimmed), value?.lng ?? fallbackCenter?.lng ?? resolveEnvDefaultCenter()?.lng ?? ABSOLUTE_FALLBACK_CENTER.lng);
  }

  function commitLng(raw: string) {
    setLngDraft(raw);
    const trimmed = raw.trim();
    if (trimmed === '' || !FLOAT_PATTERN.test(trimmed)) {
      return;
    }
    emit(value?.lat ?? fallbackCenter?.lat ?? resolveEnvDefaultCenter()?.lat ?? ABSOLUTE_FALLBACK_CENTER.lat, Number(trimmed));
  }

  function handleClear() {
    setLatDraft('');
    setLngDraft('');
    onChangeRef.current(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        role="application"
        aria-label={ariaLabel}
        className={cn('aspect-[16/10] w-full rounded-md border', disabled && 'pointer-events-none')}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={latId}
          type="text"
          inputMode="decimal"
          aria-label={t('common.mapPointPicker.latitude')}
          disabled={disabled}
          value={latDraft}
          onChange={(event) => commitLat(event.target.value)}
          className="flex-1"
        />
        <Input
          id={lngId}
          type="text"
          inputMode="decimal"
          aria-label={t('common.mapPointPicker.longitude')}
          disabled={disabled}
          value={lngDraft}
          onChange={(event) => commitLng(event.target.value)}
          className="flex-1"
        />
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={!value}>
            {t('common.mapPointPicker.clearPoint')}
          </Button>
        )}
      </div>
    </div>
  );
}

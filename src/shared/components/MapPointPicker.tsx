import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderIcon, SearchIcon } from 'lucide-react';
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
const DEFAULT_GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
const GEOCODER_RESULT_LIMIT = 5;
const SEARCH_RESULT_ZOOM = 17;
const SEARCH_MIN_LENGTH = 3;
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

interface GeocoderResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// Nominatim's usage policy forbids autocomplete (at most one request per second), so the search
// runs on an explicit submit, never per keystroke. A closed-network deployment points
// VITE_MAP_GEOCODER_URL at its own Nominatim-compatible instance, same as the tile server.
async function geocode(
  query: string,
  language: string,
  bounds: L.LatLngBounds | null,
  signal: AbortSignal,
): Promise<GeocoderResult[]> {
  const url = new URL((import.meta.env.VITE_MAP_GEOCODER_URL as string | undefined) || DEFAULT_GEOCODER_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(GEOCODER_RESULT_LIMIT));
  url.searchParams.set('accept-language', language);
  if (bounds) {
    // Biases results toward what the user is looking at, without excluding the rest.
    url.searchParams.set('viewbox', bounds.toBBoxString());
  }
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Geocoder responded ${response.status}`);
  }
  const places = (await response.json()) as NominatimPlace[];
  return places.map((place) => ({
    id: String(place.place_id),
    label: place.display_name,
    lat: Number(place.lat),
    lng: Number(place.lon),
  }));
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

// Leaflet repeats the world horizontally, so a click or a drag on any copy but the central one
// yields a longitude outside [-180, 180]. That is the same place on Earth, not an invalid value:
// it is wrapped back, never clamped — clamping pinned every such click to the antimeridian.
function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

// La primitiva de `ARCHITECTURE.md` §4.3, declarada y escrita en SPEC FE13a §3.7. Leaflet sobre
// `VITE_MAP_TILE_URL`, con dos campos numéricos como alternativa sin ratón: el mapa y los campos
// son dos vistas del mismo `value`, nunca dos dueños (SPEC FE13a §3.4).
export function MapPointPicker({ value, onChange, fallbackCenter, disabled, ariaLabel }: MapPointPickerProps) {
  const { t, i18n } = useTranslation();
  const latId = useId();
  const lngId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const initialCenterRef = useRef<LatLng | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(!!disabled);
  const valueRef = useRef(value);
  const fallbackCenterRef = useRef(fallbackCenter);
  onChangeRef.current = onChange;
  valueRef.current = value;
  fallbackCenterRef.current = fallbackCenter;

  const [latDraft, setLatDraft] = useState(value ? String(value.lat) : '');
  const [lngDraft, setLngDraft] = useState(value ? String(value.lng) : '');

  // Ephemeral UI state of the search overlay: it only moves the map and proposes a point — the
  // chosen point still lives solely in `value`.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [searchResults, setSearchResults] = useState<GeocoderResult[]>([]);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  useEffect(() => {
    setLatDraft(value ? String(value.lat) : '');
    setLngDraft(value ? String(value.lng) : '');
  }, [value]);

  function emit(lat: number, lng: number) {
    onChangeRef.current(toLatLng(lat, lng));
  }

  // Idempotent by design (guards on `markerRef.current`): safe to call both right after creating
  // the map and again from the `[value]` effect below without producing a second marker.
  function applyValue(map: L.Map, val: LatLng | null) {
    if (!val) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = L.marker([val.lat, val.lng], { draggable: !disabledRef.current }).addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        emit(position.lat, wrapLongitude(position.lng));
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([val.lat, val.lng]);
    }
    map.panTo([val.lat, val.lng]);
  }

  // Monta el mapa una sola vez. `value`, `disabled` y `ariaLabel` se sincronizan aparte, en los
  // efectos de abajo, porque Leaflet es imperativo y no vuelve a montarse en cada cambio.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const initialCenter =
      valueRef.current ?? fallbackCenterRef.current ?? resolveEnvDefaultCenter() ?? ABSOLUTE_FALLBACK_CENTER;
    const map = L.map(container, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: valueRef.current ? 15 : 6,
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
      emit(event.latlng.lat, wrapLongitude(event.latlng.lng));
    });
    mapRef.current = map;
    initialCenterRef.current = initialCenter;

    // Leaflet reads the container's size once, when it's constructed. A progressively-revealed
    // section (`investigationCommunity`'s map, deep in the wizard — SPEC FE13e) can mount while
    // the container still measures 0×0, a moment before layout settles. `invalidateSize()` alone
    // updates the stored size but, starting from an invalid tile grid, doesn't repaint any tile —
    // the map stays fully black instead of merely mis-cropped. The first resize away from zero
    // needs a full `setView` (which recomputes the pixel origin and reloads every tile), not just
    // `invalidateSize()`; later resizes (the sidebar collapsing, etc.) are the ordinary case and
    // only need the cheaper call.
    let hadZeroSize = container.getBoundingClientRect().width === 0 || container.getBoundingClientRect().height === 0;
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
      if (hadZeroSize) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          hadZeroSize = false;
          map.setView(map.getCenter(), map.getZoom(), { animate: false });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    containerRef.current?.setAttribute('aria-label', ariaLabel);
  }, [ariaLabel]);

  // `fallbackCenter` usually arrives after mount — it comes from a query the caller resolves
  // (the chosen `geoLocation`, the patient's residence). Without this, the map stays on the env
  // default it was created with. Only while there is no own point: a `value` always wins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || value || !fallbackCenter) {
      return;
    }
    const initial = initialCenterRef.current;
    if (initial && initial.lat === fallbackCenter.lat && initial.lng === fallbackCenter.lng) {
      return;
    }
    initialCenterRef.current = fallbackCenter;
    map.setView([fallbackCenter.lat, fallbackCenter.lng], map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the coordinates, not on the object identity the caller rebuilds every render.
  }, [fallbackCenter?.lat, fallbackCenter?.lng]);

  // El marcador es la única fuente de verdad de dónde está el punto en el mapa: se crea, se mueve
  // o se quita según `value`, nunca lleva posición propia.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    applyValue(map, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function runSearch() {
    const query = searchQuery.trim();
    if (query.length < SEARCH_MIN_LENGTH) {
      return;
    }
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchStatus('loading');
    try {
      const results = await geocode(query, i18n.language, mapRef.current?.getBounds() ?? null, controller.signal);
      setSearchResults(results);
      setSearchStatus('done');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      console.warn('<MapPointPicker> geocoder request failed', error);
      setSearchResults([]);
      setSearchStatus('error');
    }
  }

  // The field sits inside the case form: Enter must search, never submit the surrounding form.
  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void runSearch();
    } else if (event.key === 'Escape') {
      setSearchStatus('idle');
      setSearchResults([]);
    }
  }

  function handlePickResult(result: GeocoderResult) {
    mapRef.current?.setView([result.lat, result.lng], SEARCH_RESULT_ZOOM);
    emit(result.lat, result.lng);
    setSearchStatus('idle');
    setSearchResults([]);
  }

  function handleClear() {
    setLatDraft('');
    setLngDraft('');
    onChangeRef.current(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative isolate">
        <div
          ref={containerRef}
          role="application"
          aria-label={ariaLabel}
          className={cn(
            'isolate aspect-[16/10] w-full rounded-md border',
            disabled && 'pointer-events-none',
          )}
        />
        {!disabled && (
          // Sibling of the Leaflet container, not a child: clicks and scrolls on the overlay never
          // reach the map, so they can't drop a point or pan it. z-[1000] matches Leaflet's controls.
          <div className="absolute top-2 right-2 z-[1000] flex w-72 max-w-[calc(100%-4rem)] flex-col gap-1">
            <div className="flex items-center rounded-md border bg-background shadow-sm">
              <Input
                type="search"
                aria-label={t('common.mapPointPicker.searchLabel')}
                placeholder={t('common.mapPointPicker.searchPlaceholder')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="h-11 flex-1 border-0 shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('common.mapPointPicker.search')}
                onClick={() => void runSearch()}
                disabled={searchQuery.trim().length < SEARCH_MIN_LENGTH || searchStatus === 'loading'}
                className="size-11 shrink-0"
              >
                {searchStatus === 'loading' ? <LoaderIcon className="animate-spin" /> : <SearchIcon />}
              </Button>
            </div>
            {(searchStatus === 'done' || searchStatus === 'error') && (
              <div className="max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
                {searchStatus === 'error' && (
                  <p role="alert" className="px-3 py-2 text-sm text-destructive">
                    {t('common.mapPointPicker.searchError')}
                  </p>
                )}
                {searchStatus === 'done' && searchResults.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t('common.mapPointPicker.noResults')}</p>
                )}
                {searchResults.length > 0 && (
                  <ul>
                    {searchResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => handlePickResult(result)}
                          className="min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                        >
                          {result.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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

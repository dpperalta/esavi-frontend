import { useSearchParams } from 'react-router-dom';

// Drilling down pushes a history entry on purpose — no `replace` — so «back» climbs one level
// without knowing the parent, which the response does not carry (SPEC FE36c §3.4). Only
// `geoLocationId` is touched: the period and the view params survive.
export function useGeoDrillDown() {
  const [, setSearchParams] = useSearchParams();

  function writeGeoLocationId(geoLocationId: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (geoLocationId) next.set('geoLocationId', geoLocationId);
      else next.delete('geoLocationId');
      return next;
    });
  }

  return {
    drillDown: (geoLocationId: string) => writeGeoLocationId(geoLocationId),
    showWholeTerritory: () => writeGeoLocationId(null),
  };
}

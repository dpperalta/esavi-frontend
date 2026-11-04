import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardDistributions } from '@/contracts/dashboard';
import { Button } from '@/shared/components/ui/button';
import { GeoDistributionMap } from './GeoDistributionMap';
import { GeoDistributionTable } from './GeoDistributionTable';
import { useGeoDrillDown } from './useGeoDrillDown';

interface GeoDistributionBlockProps {
  data: DashboardDistributions['geography'];
  hasUnit: boolean;
}

// Loading and error belong to DistributionsSection: this block shares its one request (SPEC FE36c
// §3.6). The table is always next to the map, never a toggled view (§6).
export function GeoDistributionBlock({ data, hasUnit }: GeoDistributionBlockProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const { showWholeTerritory } = useGeoDrillDown();

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-base font-medium text-foreground">
          {t('dashboard.geo.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('dashboard.geo.subtitle')}</p>
      </div>

      {data.rows.length === 0 ? (
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="text-sm text-muted-foreground">{t('dashboard.geo.empty')}</p>
          {hasUnit && (
            <Button
              type="button"
              variant="link"
              className="h-8 px-0 pointer-coarse:h-11"
              onClick={showWholeTerritory}
            >
              {t('dashboard.period.wholeTerritoryLink')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Without circles the map's own caption becomes the «no coordinates» notice. */}
          <div className="min-w-0">
            <GeoDistributionMap rows={data.rows} />
          </div>
          <div className="min-w-0">
            <GeoDistributionTable rows={data.rows} />
          </div>
        </div>
      )}
    </section>
  );
}

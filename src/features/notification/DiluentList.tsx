import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useNotificationDiluentsByVaccine } from './api';
import { DiluentFormRow } from './DiluentFormRow';

export interface DiluentListProps {
  // `null` mientras la vacuna no está guardada — no hay padre al que colgar nada (§3.1).
  vaccineId: string | null;
  vaccinationDate: string | null;
  disabled?: boolean;
}

// La lista anidada dentro del modal de su vacuna (SPEC FE12c §3.1, §4 paso 9): lectura perezosa
// por `ESAVI-NOTIFDIL-002A`, habilitada sólo mientras el modal de esa vacuna está abierto y ella
// ya existe. Edita en línea — la fila se expande a `<DiluentFormRow>`, nunca un segundo modal.
export function DiluentList({ vaccineId, vaccinationDate, disabled = false }: DiluentListProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<'new' | string | null>(null);
  const diluents = useNotificationDiluentsByVaccine(vaccineId ?? undefined, vaccineId !== null);

  if (vaccineId === null) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-dashed p-3">
        <p className="text-sm font-medium text-muted-foreground">{t('notificationDiluent.list.title')}</p>
        <p className="text-sm text-muted-foreground">{t('notificationDiluent.list.needsParent')}</p>
      </div>
    );
  }

  const rows = diluents.data?.rows ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{t('notificationDiluent.list.title')}</p>
        {!disabled && expanded === null && (
          <Button type="button" size="sm" onClick={() => setExpanded('new')}>
            <PlusIcon aria-hidden="true" />
            {t('notificationDiluent.list.add')}
          </Button>
        )}
      </div>

      {diluents.isLoading && (
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {!diluents.isLoading && diluents.isError && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">
            {diluents.error instanceof EsaviApiError
              ? getErrorMessage(diluents.error)
              : t('notificationDiluent.list.error')}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => diluents.refetch()}>
            {t('common.table.retry')}
          </Button>
        </div>
      )}

      {!diluents.isLoading &&
        !diluents.isError &&
        rows.map((row) =>
          expanded === row.diluentId ? (
            <DiluentFormRow
              key={row.diluentId}
              vaccineId={vaccineId}
              vaccinationDate={vaccinationDate}
              diluent={row}
              onDone={() => setExpanded(null)}
            />
          ) : (
            <div key={row.diluentId} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span>{row.diluentName ?? row.diluentCatalog?.name}</span>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.satelliteList.edit', { name: row.diluentName ?? row.diluentCatalog?.name ?? '' })}
                  onClick={() => setExpanded(row.diluentId)}
                >
                  <PencilIcon aria-hidden="true" />
                </Button>
              )}
            </div>
          ),
        )}

      {expanded === 'new' && (
        <DiluentFormRow
          vaccineId={vaccineId}
          vaccinationDate={vaccinationDate}
          diluent={null}
          onDone={() => setExpanded(null)}
        />
      )}
    </div>
  );
}

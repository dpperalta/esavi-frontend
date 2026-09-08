import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { NotificationVaccineDetail } from '@/contracts/declared/notificationVaccine';
import { EsaviApiError } from '@/shared/api/types';
import { Badge } from '@/shared/components/ui/badge';
import { SatelliteList, type SatelliteListColumn } from '@/shared/components/SatelliteList';
import { useNotificationVaccinesByCase } from './api';

export interface VaccineListProps {
  caseId: string;
  // `null` significa que la cabecera de la notificación no existe todavía: la sección no se
  // renderiza (SPEC FE12c §3.6) — sin `notificationId` no hay padre al que colgar nada.
  notificationId: string | null;
}

// La tercera lista del paso 4 y la única anidada (SPEC FE12c §1). Este spec sólo la deja en
// solo lectura — alta, edición y baja llegan en los pasos 8 y 10 — sobre `<SatelliteList>`, sin
// saber de vacunas ni de diluyentes: sus columnas son enteramente de aquí.
export function VaccineList({ caseId, notificationId }: VaccineListProps) {
  const { t } = useTranslation();
  const vaccines = useNotificationVaccinesByCase(caseId, notificationId !== null);

  if (notificationId === null) {
    return null;
  }

  const columns: SatelliteListColumn<NotificationVaccineDetail>[] = [
    {
      key: 'vaccineName',
      header: 'notificationVaccine.field.vaccineName',
      render: (row) => row.vaccineName,
      card: 'primary',
    },
    {
      key: 'vaccinationDate',
      header: 'notificationVaccine.field.vaccinationDate',
      render: (row) => (row.vaccinationDate ? format(new Date(`${row.vaccinationDate}T00:00:00`), 'dd/MM/yyyy') : null),
      card: 'secondary',
    },
    {
      key: 'doseNumber',
      header: 'notificationVaccine.field.doseNumber',
      render: (row) => row.doseNumber,
      card: 'secondary',
    },
    // Sin `card`: aparece como columna normal del escritorio, pero no se cuenta entre los tres
    // campos de la tarjeta móvil — la marca de sospechosa va aparte, como `cardBadge` (§3.7).
    {
      key: 'isSuspected',
      header: 'notificationVaccine.field.isSuspected',
      render: (row) =>
        row.isSuspected ? (
          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
            {t('notificationVaccine.badge.suspected')}
          </Badge>
        ) : null,
    },
  ];

  return (
    <SatelliteList<NotificationVaccineDetail>
      titleKey="notificationVaccine.list.title"
      columns={columns}
      rows={vaccines.data?.rows ?? []}
      idField="vaccineId"
      getRowLabel={(row) => row.vaccineName ?? ''}
      cardBadge={(row) =>
        row.isSuspected ? (
          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
            {t('notificationVaccine.badge.suspected')}
          </Badge>
        ) : null
      }
      isLoading={vaccines.isLoading}
      isError={vaccines.isError}
      error={vaccines.error instanceof EsaviApiError ? vaccines.error : null}
      onRetry={() => void vaccines.refetch()}
    />
  );
}

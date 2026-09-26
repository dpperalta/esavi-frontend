import { format } from 'date-fns';
import { enUS, es, nl } from 'date-fns/locale';
import { XIcon } from 'lucide-react';
import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WhodrugProductRow } from '@/contracts/declared/whodrugProduct';
import { AuditTrail } from '@/shared/components/AuditTrail';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet';
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import type { Language } from '@/shared/stores/preferences.types';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';

const DATE_FNS_LOCALES: Record<Language, typeof es> = { es, en: enUS, nl };

type SectionField = Exclude<
  keyof WhodrugProductRow,
  'whodrugProductId' | 'optionNameSearch' | 'appDetails' | 'metadata'
>;

// SPEC FE25d §3.1. `optionNameSearch` is deliberately absent: it is `optionName` lowercased and
// stripped of diacritics for the `006`, and says nothing a reader could inspect.
const SECTIONS: { key: string; fields: SectionField[]; withMetadata?: boolean }[] = [
  {
    key: 'product',
    fields: [
      'drugName',
      'drugCode',
      'optionName',
      'medicinalProductId',
      'isGeneric',
      'isPreferred',
    ],
  },
  { key: 'classification', fields: ['atcs', 'drugAtcs'] },
  { key: 'composition', fields: ['ingredient', 'ingredientTranslations', 'languageCode'] },
  {
    key: 'countryRegistration',
    fields: ['iso3Code', 'countryMedicinalProductId', 'maHolders', 'maHoldersMedicinalProductId'],
  },
  {
    key: 'presentation',
    fields: ['form', 'formMedicinalProductId', 'strength', 'strengthMedicinalProductId'],
  },
  {
    key: 'provenance',
    fields: ['rowHash', 'createdAt', 'updatedAt', 'deletedAt'],
    withMetadata: true,
  },
];

const DATE_FIELDS: ReadonlySet<SectionField> = new Set(['createdAt', 'updatedAt', 'deletedAt']);
const CODE_FIELDS: ReadonlySet<SectionField> = new Set([
  'drugCode',
  'medicinalProductId',
  'atcs',
  'drugAtcs',
  'countryMedicinalProductId',
  'maHoldersMedicinalProductId',
  'formMedicinalProductId',
  'strengthMedicinalProductId',
  'rowHash',
]);

function EmptyValue() {
  const { t } = useTranslation();
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t('whodrugProduct.sheet.emptyValue')}</span>
    </>
  );
}

function FieldValue({ row, field }: { row: WhodrugProductRow; field: SectionField }) {
  const { t } = useTranslation();
  const language = usePreferencesStore((state) => state.language);
  const value = row[field];

  if (value === null || value === '') {
    return <EmptyValue />;
  }
  if (typeof value === 'boolean') {
    return <>{t(value ? 'common.answerOption.yes' : 'common.answerOption.no')}</>;
  }
  if (DATE_FIELDS.has(field)) {
    return (
      <time dateTime={new Date(value).toISOString()}>
        {format(new Date(value), 'd MMM yyyy, HH:mm', { locale: DATE_FNS_LOCALES[language] })}
      </time>
    );
  }
  if (CODE_FIELDS.has(field)) {
    return <span className="font-mono text-xs break-all">{value}</span>;
  }
  return <>{value}</>;
}

// `metadata` is sealed by the sync and its keys are not a contract (SPEC FE25d §3.1): painted as
// whatever pairs it carries, with no key assumed.
function MetadataValue({ metadata }: { metadata: WhodrugProductRow['metadata'] }) {
  const entries =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? Object.entries(metadata)
      : [];

  if (entries.length === 0) {
    return <EmptyValue />;
  }
  return (
    <dl className="flex flex-col gap-1 rounded-lg border p-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex min-w-0 flex-wrap gap-x-2">
          <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
          <dd className="min-w-0 text-xs break-all text-foreground">
            {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface WhodrugProductSheetProps {
  // Resolved by the list from `rows` on every render (§3.4): `null` closes the panel.
  row: WhodrugProductRow | null;
  onClose: () => void;
}

// SPEC FE25d §3.1: no `003` exists, so the panel paints the 002B row it is handed and fetches
// nothing.
export function WhodrugProductSheet({ row, onClose }: WhodrugProductSheetProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const isSuperadmin = useCan(ROLE_LEVELS.SUPERADMIN);
  // §3.7: focus goes back to the row on close. Radix's modal content only restores focus to a
  // `Dialog.Trigger`, and this panel is opened from state with none, so the element focused at open
  // time — the row — is kept and restored by hand.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      {/* §3.7: full screen below md. The overrides carry the same `data-[side=right]` variant as
          the primitive's widths so tailwind-merge replaces them instead of losing on specificity. */}
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-labelledby={titleId}
        onOpenAutoFocus={() => {
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
        className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:md:w-3/4 data-[side=right]:md:max-w-xl"
      >
        {row && (
          <>
            <SheetHeader className="sticky top-0 z-10 border-b bg-popover pr-16">
              <SheetDescription className="text-xs">
                {t('whodrugProduct.sheet.title')}
              </SheetDescription>
              <SheetTitle id={titleId} className="break-words">
                {row.drugName}
              </SheetTitle>
              <div className="flex flex-wrap gap-2 pt-1">
                {row.isActive ? (
                  <Badge variant="outline">{t('whodrugProduct.status.active')}</Badge>
                ) : (
                  <Badge variant="destructive">{t('whodrugProduct.status.retired')}</Badge>
                )}
                {row.isGeneric && (
                  <Badge variant="secondary">{t('whodrugProduct.status.generic')}</Badge>
                )}
                {row.isPreferred && (
                  <Badge variant="secondary">{t('whodrugProduct.status.preferred')}</Badge>
                )}
              </div>
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="absolute top-2 right-2 w-11 px-0"
                  aria-label={t('whodrugProduct.sheet.close')}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </SheetClose>
            </SheetHeader>

            <div className="flex flex-col gap-6 p-4">
              {SECTIONS.map((section) => {
                const headingId = `${titleId}-${section.key}`;
                return (
                  <section
                    key={section.key}
                    aria-labelledby={headingId}
                    className="flex flex-col gap-3"
                  >
                    <h2 id={headingId} className="font-heading text-sm font-medium">
                      {t(`whodrugProduct.sections.${section.key}`)}
                    </h2>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {section.withMetadata && (
                        <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-2">
                          <dt className="text-xs text-muted-foreground">
                            {t('whodrugProduct.fields.metadata')}
                          </dt>
                          <dd className="text-sm">
                            <MetadataValue metadata={row.metadata} />
                          </dd>
                        </div>
                      )}
                      {section.fields.map((field) => (
                        <div key={field} className="flex min-w-0 flex-col gap-0.5">
                          <dt className="text-xs text-muted-foreground">
                            {t(`whodrugProduct.fields.${field}`)}
                          </dt>
                          <dd className="text-sm break-words text-foreground">
                            <FieldValue row={row} field={field} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                );
              })}

              {/* The retirement and reactivation the `007` writes land here (SPEC FE25d §3.1);
                  SUPERADMIN only, like every audit trail (CONVENTIONS.md §10.4). */}
              {isSuperadmin && (
                <section aria-label={t('whodrugProduct.sheet.audit')} className="border-t pt-4">
                  <AuditTrail appDetails={row.appDetails} />
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

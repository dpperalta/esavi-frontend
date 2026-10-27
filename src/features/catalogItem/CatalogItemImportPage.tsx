import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { type ChangeEvent, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import type { CatalogItemImportReport, RejectedCatalogItemRow } from '@/contracts/catalogItem';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ImportReport, type ImportReportColumn } from '@/shared/components/ImportReport';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { cn } from '@/shared/lib/utils';
import { useImportCatalogItems } from './importApi';
import { catalogItemImportErrorFieldMap, importCatalogItemsSchema } from './schemas';

const IMPORT_FAILED_CODE = 'CATITEM_006_IMPORT_FAILED';
const LIST_PATH = '/catalog-items';
const CATALOG_TYPES_PATH = '/catalog-types';
const TEMPLATE_PATH = '/templates/catalog-items-template.xlsx';
const COMMON_COUNTER_KEYS = [
  'read',
  'inserted',
  'updated',
  'unchanged',
  'invalid',
  'duplicated',
] as const;
const OWN_COUNTER_KEYS = ['catalogTypesCreated', 'sortOrderCoerced'] as const;
// SPEC FE30 §3.1, in the order of SPEC F20 §3.5; the first three are the required ones.
const FILE_HEADERS = [
  { name: 'catalogTypeCode', required: true },
  { name: 'catalogTypeName', required: true },
  { name: 'name', required: true },
  { name: 'value', required: false },
  { name: 'description', required: false },
  { name: 'sortOrder', required: false },
] as const;

const WARNING_BOX =
  'flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning';

interface ListLocationState {
  typeId?: string;
}

function HeaderList({ title, headers }: { title: string; headers: string[] }) {
  if (headers.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="flex flex-wrap gap-1.5">
        {headers.map((header) => (
          <li
            key={header}
            className="rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs break-all"
          >
            {header}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileHelp({ helpId }: { helpId: string }) {
  const { t } = useTranslation();

  return (
    <div id={helpId} className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('catalogItem.import.help.columns.header')}</TableHead>
              <TableHead>{t('catalogItem.import.help.columns.required')}</TableHead>
              <TableHead>{t('catalogItem.import.help.columns.description')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FILE_HEADERS.map((header) => (
              <TableRow key={header.name}>
                <TableCell className="font-mono text-xs">{header.name}</TableCell>
                <TableCell>
                  {header.required
                    ? t('catalogItem.import.help.required')
                    : t('catalogItem.import.help.optional')}
                </TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  {t(`catalogItem.import.help.headers.${header.name}`)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>{t('catalogItem.import.help.firstSheet')}</li>
        <li>{t('catalogItem.import.help.codeIgnored')}</li>
        <li>{t('catalogItem.import.help.defaults')}</li>
      </ul>
      {/* A static file, not an endpoint (SPEC FE30 §3.9): no template route exists for this
          entity, so it bypasses client.ts and TanStack Query on purpose. */}
      <a
        href={TEMPLATE_PATH}
        download
        className={cn(buttonVariants({ variant: 'outline', size: 'touch' }), 'w-fit')}
      >
        <Download aria-hidden="true" />
        {t('catalogItem.import.help.template')}
      </a>
    </div>
  );
}

function TypesCreatedNotice({ report }: { report: CatalogItemImportReport }) {
  const { t } = useTranslation();
  if (report.catalogTypesCreated === 0) return null;

  const count = report.catalogTypesCreated;
  return (
    <div role="status" className={cn(WARNING_BOX, 'flex-col sm:flex-row sm:items-center')}>
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          {report.dryRun
            ? t('catalogItem.import.report.typesCreatedDryRun', { count })
            : t('catalogItem.import.report.typesCreated', { count })}
        </p>
      </div>
      {!report.dryRun && (
        <Link
          to={CATALOG_TYPES_PATH}
          className="inline-flex min-h-11 shrink-0 items-center rounded-md font-medium underline underline-offset-4 hover:decoration-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:ml-auto"
        >
          {t('catalogItem.import.report.viewTypes')}
        </Link>
      )}
    </div>
  );
}

export function CatalogItemImportPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const fileHintId = useId();
  const fileErrorId = useId();
  const helpId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileErrorCode, setFileErrorCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(true);

  // ESAVI-CATITEM-006
  const importItems = useImportCatalogItems();
  const { reset: resetImport, data: report, isPending: busy, submittedAt } = importItems;

  const returnTypeId = (location.state as ListLocationState | null)?.typeId;
  const listPath = returnTypeId
    ? `${LIST_PATH}?typeId=${encodeURIComponent(returnTypeId)}`
    : LIST_PATH;

  const rejectedColumns: ImportReportColumn<RejectedCatalogItemRow>[] = [
    {
      key: 'row',
      header: t('catalogItem.import.report.columns.row'),
      render: (row) => <span className="tabular-nums">{row.row}</span>,
    },
    {
      key: 'reason',
      header: t('catalogItem.import.report.columns.reason'),
      render: (row) => t(`catalogItem.import.reasons.${row.reason}`),
    },
    {
      key: 'column',
      header: t('catalogItem.import.report.columns.column'),
      // Only VALUE_TOO_LONG names a column; the other five reasons already say which one.
      render: (row) =>
        row.column ? (
          <span className="font-mono text-xs">{row.column}</span>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{t('catalogItem.import.report.noColumn')}</span>
          </>
        ),
    },
  ];

  const apiError = importItems.error instanceof EsaviApiError ? importItems.error : null;
  const serverFileErrorCode =
    apiError && catalogItemImportErrorFieldMap[apiError.code] ? apiError.code : null;
  const shownFileErrorCode = fileErrorCode ?? serverFileErrorCode;
  const importFailed = apiError?.code === IMPORT_FAILED_CODE;
  // SPEC FE30 §6, decision 5: any file change resets the mutation, so a dry-run report still in
  // `data` always describes the file currently selected.
  const simulation = report?.dryRun ? report : null;
  const codeColumnSent = report?.unknownHeaders.some((header) => header.toLowerCase() === 'code');

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0] ?? null;
    resetImport();
    // §3.5: extension and the 20 MB ceiling are checked here, so a rejected file never leaves
    // the browser.
    const result = importCatalogItemsSchema.safeParse(candidate);
    if (!result.success) {
      setFile(null);
      setFileErrorCode(result.error.issues[0]?.message ?? null);
      event.target.value = '';
      return;
    }
    setFile(result.data);
    setFileErrorCode(null);
  }

  function runImport(dryRun: boolean) {
    if (!file) return;
    importItems.mutate(
      { file, dryRun },
      {
        onError: (error) => {
          if (!(error instanceof EsaviApiError)) {
            toast.error(t('common.errors.unexpected'));
            return;
          }
          if (catalogItemImportErrorFieldMap[error.code]) {
            fileInputRef.current?.focus();
            return;
          }
          if (error.code === IMPORT_FAILED_CODE) return;
          toast.error(getErrorMessage(error));
        },
      },
    );
  }

  function handleImportConfirmed() {
    setConfirmOpen(false);
    runImport(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          to={listPath}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('catalogItem.import.back')}
        </Link>
        <h1 className="text-xl font-medium text-balance text-foreground">
          {t('catalogItem.import.title')}
        </h1>
      </div>

      <Card className="max-w-3xl">
        <CardContent className="flex min-w-0 flex-col gap-3">
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="w-fit"
            aria-expanded={helpOpen}
            aria-controls={helpId}
            onClick={() => setHelpOpen((open) => !open)}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('motion-safe:transition-transform', helpOpen && 'rotate-180')}
            />
            {t('catalogItem.import.help.title')}
          </Button>
          {helpOpen && <FileHelp helpId={helpId} />}
        </CardContent>
      </Card>

      <div role="note" className={cn(WARNING_BOX, 'max-w-3xl')}>
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>{t('catalogItem.import.fixedNote')}</p>
      </div>

      <Card aria-busy={busy} className="max-w-3xl">
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => event.preventDefault()}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {/* The input sits inside its label so the label is both its accessible name and
                    the visible trigger; `focus-within` shows the ring the sr-only input can't. */}
                <label
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'touch' }),
                    'w-fit cursor-pointer focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
                    busy && 'pointer-events-none opacity-50',
                  )}
                >
                  <FileSpreadsheet aria-hidden="true" />
                  {t('catalogItem.import.file')}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    className="sr-only"
                    disabled={busy}
                    aria-invalid={shownFileErrorCode ? true : undefined}
                    aria-describedby={cn(fileHintId, shownFileErrorCode && fileErrorId)}
                    onChange={handleFileChange}
                  />
                </label>
                {file && (
                  <span className="min-w-0 truncate text-sm text-foreground" title={file.name}>
                    {file.name}
                  </span>
                )}
              </div>
              <p id={fileHintId} className="text-xs text-muted-foreground">
                {t('catalogItem.import.fileHint')}
              </p>
              <p
                id={fileErrorId}
                aria-live="polite"
                className="text-sm text-destructive empty:hidden"
              >
                {shownFileErrorCode ? t(`catalogItem.errors.${shownFileErrorCode}`) : null}
              </p>
            </div>

            {importFailed && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {t(`catalogItem.errors.${IMPORT_FAILED_CODE}`)}
              </p>
            )}

            <div aria-live="polite" className="empty:hidden">
              {busy && (
                <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
                  <Loader2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
                  />
                  {t('catalogItem.import.running')}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="sm:flex-1"
                disabled={!file || busy}
                onClick={() => runImport(true)}
              >
                {t('catalogItem.import.simulate')}
              </Button>
              <Button
                type="button"
                size="touch"
                className="sm:flex-1"
                disabled={!file || busy}
                onClick={() => setConfirmOpen(true)}
              >
                {t('catalogItem.import.run')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* §3.4: the report is `useMutation().data`, never copied to a useState. */}
      {report && (
        <div className="flex min-w-0 flex-col gap-4">
          {/* `<ImportReport>` focuses its title on mount; keying by submission remounts it for
              every new response, so a second simulation moves focus again. */}
          <ImportReport
            key={submittedAt}
            counters={[
              ...COMMON_COUNTER_KEYS.map((key) => ({
                key,
                label: t(`common.importReport.${key}`),
                value: report[key],
              })),
              ...OWN_COUNTER_KEYS.map((key) => ({
                key,
                label: t(`catalogItem.import.report.${key}`),
                value: report[key],
              })),
            ]}
            // CATALOG_TYPE_NAME_REQUIRED is already inside `invalid` (SPEC FE30 §3.7), and
            // catalogTypesCreated is not a rejection, so it never enters this sum.
            rejectedTotal={report.invalid + report.duplicated}
            dryRun={report.dryRun}
            rejected={report.errors}
            rejectedColumns={rejectedColumns}
          >
            <TypesCreatedNotice report={report} />
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
              <dl className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">
                  {t('catalogItem.import.report.sheet')}
                </dt>
                <dd className="text-sm font-medium break-all">{report.sheet}</dd>
              </dl>
              <HeaderList
                title={t('catalogItem.import.report.missingOptionalHeaders')}
                headers={report.missingOptionalHeaders}
              />
              <HeaderList
                title={t('catalogItem.import.report.unknownHeaders')}
                headers={report.unknownHeaders}
              />
              {codeColumnSent && (
                <p className="text-sm text-muted-foreground">
                  {t('catalogItem.import.report.codeColumnIgnored')}
                </p>
              )}
            </div>
          </ImportReport>
          {!report.dryRun && (
            <Button asChild variant="outline" size="touch" className="w-fit">
              <Link to={listPath}>{t('catalogItem.import.viewItems')}</Link>
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('catalogItem.import.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>{t('catalogItem.import.confirmBody')}</p>
                {simulation &&
                  (simulation.catalogTypesCreated > 0 ? (
                    <p className="font-medium text-warning">
                      {t('catalogItem.import.confirmTypesCreated', {
                        count: simulation.catalogTypesCreated,
                      })}
                    </p>
                  ) : (
                    <p>{t('catalogItem.import.confirmNoTypesCreated')}</p>
                  ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirmed}>
              {t('catalogItem.import.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

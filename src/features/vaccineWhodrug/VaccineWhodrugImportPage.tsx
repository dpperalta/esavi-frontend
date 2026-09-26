import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, FileSpreadsheet, Loader2 } from 'lucide-react';
import { type ChangeEvent, useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { RejectedVaccineWhodrugRow } from '@/contracts/vaccineWhodrug';
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/utils';
import { useImportVaccineWhodrugs } from './importApi';
import {
  IMPORT_DEFAULT_VALUES,
  importVaccineWhodrugsSchema,
  type ImportVaccineWhodrugsFormValues,
  vaccineWhodrugImportErrorFieldMap,
  vaccineWhodrugImportFileSchema,
} from './schemas';

const IMPORT_FAILED_CODE = 'WHODRUG_007_IMPORT_FAILED';
const LIST_PATH = '/whodrug-vaccines';

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

export function VaccineWhodrugImportPage() {
  const { t } = useTranslation();
  const fileHintId = useId();
  const fileErrorId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileErrorCode, setFileErrorCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const form = useForm<ImportVaccineWhodrugsFormValues>({
    resolver: zodResolver(importVaccineWhodrugsSchema),
    defaultValues: IMPORT_DEFAULT_VALUES,
  });

  // ESAVI-WHODRUG-007
  const importVaccines = useImportVaccineWhodrugs();
  const { reset: resetImport, data: report, isPending: busy, submittedAt } = importVaccines;

  const rejectedColumns: ImportReportColumn<RejectedVaccineWhodrugRow>[] = [
    {
      key: 'row',
      header: t('vaccineWhodrug.import.report.columns.row'),
      render: (row) => <span className="tabular-nums">{row.row}</span>,
    },
    {
      key: 'reason',
      header: t('vaccineWhodrug.import.report.columns.reason'),
      render: (row) => t(`vaccineWhodrug.import.reasons.${row.reason}`),
    },
    {
      key: 'column',
      header: t('vaccineWhodrug.import.report.columns.column'),
      // Only VALUE_TOO_LONG names a column; the other four reasons already say which one.
      render: (row) =>
        row.column ? (
          <span className="font-mono text-xs">{row.column}</span>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{t('vaccineWhodrug.detail.empty')}</span>
          </>
        ),
    },
  ];

  // SPEC FE25c §3.5 (same as FE25b): a report must never describe a file or a version other than
  // the ones about to be imported, so any field change drops it.
  useEffect(() => {
    const subscription = form.watch(() => resetImport());
    return () => subscription.unsubscribe();
  }, [form, resetImport]);

  const apiError = importVaccines.error instanceof EsaviApiError ? importVaccines.error : null;
  const serverFileErrorCode =
    apiError && vaccineWhodrugImportErrorFieldMap[apiError.code] ? apiError.code : null;
  const shownFileErrorCode = fileErrorCode ?? serverFileErrorCode;
  const importFailed = apiError?.code === IMPORT_FAILED_CODE;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0] ?? null;
    resetImport();
    // §3.5: the 20 MB ceiling is checked here, so an oversized file never leaves the browser.
    const result = vaccineWhodrugImportFileSchema.safeParse(candidate);
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
    void form.handleSubmit((values) => {
      importVaccines.mutate(
        { file, dryRun, dictionaryVersion: values.dictionaryVersion },
        {
          onError: (error) => {
            if (!(error instanceof EsaviApiError)) {
              toast.error(t('common.errors.unexpected'));
              return;
            }
            if (
              vaccineWhodrugImportErrorFieldMap[error.code] ||
              error.code === IMPORT_FAILED_CODE
            ) {
              return;
            }
            toast.error(getErrorMessage(error));
          },
        },
      );
    })();
  }

  function handleImportConfirmed() {
    setConfirmOpen(false);
    runImport(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          to={LIST_PATH}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('vaccineWhodrug.import.back')}
        </Link>
        <h1 className="text-xl font-medium text-balance text-foreground">
          {t('vaccineWhodrug.import.title')}
        </h1>
      </div>

      <Card aria-busy={busy} className="max-w-3xl">
        <CardContent>
          <Form {...form}>
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
                    {t('vaccineWhodrug.import.file')}
                    <input
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
                  {t('vaccineWhodrug.import.fileHint')}
                </p>
                <p
                  id={fileErrorId}
                  aria-live="polite"
                  className="text-sm text-destructive empty:hidden"
                >
                  {shownFileErrorCode ? t(`vaccineWhodrug.errors.${shownFileErrorCode}`) : null}
                </p>
              </div>

              <FormField
                control={form.control}
                name="dictionaryVersion"
                render={({ field }) => (
                  <FormItem className="sm:max-w-md">
                    <FormLabel>{t('vaccineWhodrug.import.dictionaryVersion')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={busy}
                        className="min-h-11"
                      />
                    </FormControl>
                    <FormDescription>
                      {t('vaccineWhodrug.import.dictionaryVersionHint')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {importFailed && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {t(`vaccineWhodrug.errors.${IMPORT_FAILED_CODE}`)}
                </p>
              )}

              <div aria-live="polite" className="empty:hidden">
                {busy && (
                  <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
                    <Loader2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
                    />
                    {t('vaccineWhodrug.import.running')}
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
                  {t('vaccineWhodrug.import.simulate')}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  className="sm:flex-1"
                  disabled={!file || busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('vaccineWhodrug.import.run')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* §3.4: the report is `useMutation().data`, never copied to a useState. */}
      {report && (
        <div className="flex min-w-0 flex-col gap-4">
          {/* `<ImportReport>` focuses its title on mount; keying by submission remounts it for
              every new response, so a second simulation moves focus again. */}
          <ImportReport
            key={submittedAt}
            counters={report}
            dryRun={report.dryRun}
            rejected={report.errors}
            rejectedColumns={rejectedColumns}
          >
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
              <dl className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">
                  {t('vaccineWhodrug.import.report.sheet')}
                </dt>
                <dd className="text-sm font-medium break-all">{report.sheet}</dd>
              </dl>
              <HeaderList
                title={t('vaccineWhodrug.import.report.missingOptionalHeaders')}
                headers={report.missingOptionalHeaders}
              />
              <HeaderList
                title={t('vaccineWhodrug.import.report.unknownHeaders')}
                headers={report.unknownHeaders}
              />
            </div>
          </ImportReport>
          {!report.dryRun && (
            <Button asChild variant="outline" size="touch" className="w-fit">
              <Link to={LIST_PATH}>{t('vaccineWhodrug.import.viewVaccines')}</Link>
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('vaccineWhodrug.import.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('vaccineWhodrug.import.confirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirmed}>
              {t('vaccineWhodrug.import.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

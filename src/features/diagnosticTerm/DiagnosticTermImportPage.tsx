import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ChevronDown, FileText, Loader2 } from 'lucide-react';
import { type ChangeEvent, useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { TERM_SOURCES } from '@/contracts/common';
import type { RejectedDiagnosticTermRow } from '@/contracts/diagnosticTerm';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { cn } from '@/shared/lib/utils';
import { useImportDiagnosticTerms } from './importApi';
import {
  diagnosticTermImportErrorFieldMap,
  diagnosticTermImportFileSchema,
  IMPORT_DEFAULT_VALUES,
  IMPORT_ENCODINGS,
  importDiagnosticTermsSchema,
  type ImportDiagnosticTermsFormValues,
} from './schemas';

const IMPORT_FAILED_CODE = 'DIAGTERM_007_IMPORT_FAILED';
const REPORT_COUNTER_KEYS = [
  'read',
  'inserted',
  'updated',
  'unchanged',
  'invalid',
  'duplicated',
] as const;

export function DiagnosticTermImportPage() {
  const { t } = useTranslation();
  const fileHintId = useId();
  const fileErrorId = useId();
  const advancedId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileErrorCode, setFileErrorCode] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const form = useForm<ImportDiagnosticTermsFormValues>({
    resolver: zodResolver(importDiagnosticTermsSchema),
    defaultValues: IMPORT_DEFAULT_VALUES,
  });

  // ESAVI-DIAGTERM-007
  const importTerms = useImportDiagnosticTerms();
  const { reset: resetImport, data: report, isPending: busy, submittedAt } = importTerms;

  const rejectedColumns: ImportReportColumn<RejectedDiagnosticTermRow>[] = [
    {
      key: 'line',
      header: t('diagnosticTerm.import.report.columns.line'),
      render: (row) => <span className="tabular-nums">{row.line}</span>,
    },
    {
      key: 'reason',
      header: t('diagnosticTerm.import.report.columns.reason'),
      render: (row) => t(`diagnosticTerm.import.reasons.${row.reason}`),
    },
    {
      key: 'raw',
      header: t('diagnosticTerm.import.report.columns.raw'),
      render: (row) => (
        <span className="block max-w-[28rem] truncate font-mono text-xs" title={row.raw}>
          {row.raw}
        </span>
      ),
    },
  ];

  // SPEC FE25b §3.5: a report must never describe a file or options other than the ones about to
  // be imported, so any field change drops it.
  useEffect(() => {
    const subscription = form.watch(() => resetImport());
    return () => subscription.unsubscribe();
  }, [form, resetImport]);

  const apiError = importTerms.error instanceof EsaviApiError ? importTerms.error : null;
  const serverFileErrorCode =
    apiError && diagnosticTermImportErrorFieldMap[apiError.code] ? apiError.code : null;
  const shownFileErrorCode = fileErrorCode ?? serverFileErrorCode;
  const importFailed = apiError?.code === IMPORT_FAILED_CODE;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0] ?? null;
    resetImport();
    const result = diagnosticTermImportFileSchema.safeParse(candidate);
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
      importTerms.mutate(
        {
          file,
          dryRun,
          source: values.source,
          termGroup: values.termGroup,
          dictionaryVersion: values.dictionaryVersion,
          encoding: values.encoding,
        },
        {
          onError: (error) => {
            if (!(error instanceof EsaviApiError)) {
              toast.error(t('common.errors.unexpected'));
              return;
            }
            if (
              diagnosticTermImportErrorFieldMap[error.code] ||
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
          to="/diagnostic-terms"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('diagnosticTerm.import.back')}
        </Link>
        <h1 className="text-xl font-medium text-balance text-foreground">
          {t('diagnosticTerm.import.title')}
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
                    <FileText aria-hidden="true" />
                    {t('diagnosticTerm.import.file')}
                    <input
                      type="file"
                      accept=".asc"
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
                  {t('diagnosticTerm.import.fileHint')}
                </p>
                <p
                  id={fileErrorId}
                  aria-live="polite"
                  className="text-sm text-destructive empty:hidden"
                >
                  {shownFileErrorCode ? t(`diagnosticTerm.errors.${shownFileErrorCode}`) : null}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="dictionaryVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('diagnosticTerm.import.dictionaryVersion')}</FormLabel>
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
                        {t('diagnosticTerm.import.dictionaryVersionHint')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="encoding"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('diagnosticTerm.import.encoding')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                        <FormControl>
                          <SelectTrigger className="min-h-11 w-full" clearable={false}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {IMPORT_ENCODINGS.map((encoding) => (
                            <SelectItem key={encoding} value={encoding}>
                              {encoding}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t('diagnosticTerm.import.encodingHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-col gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="w-fit"
                  aria-expanded={advancedOpen}
                  aria-controls={advancedId}
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('motion-safe:transition-transform', advancedOpen && 'rotate-180')}
                  />
                  {t('diagnosticTerm.import.advanced')}
                </Button>
                {advancedOpen && (
                  <div id={advancedId} className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="source"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('diagnosticTerm.fields.source')}</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={busy}
                          >
                            <FormControl>
                              <SelectTrigger className="min-h-11 w-full" clearable={false}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TERM_SOURCES.map((source) => (
                                <SelectItem key={source} value={source}>
                                  {t(`diagnosticTerm.sources.${source}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="termGroup"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('diagnosticTerm.fields.termGroup')}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              autoComplete="off"
                              spellCheck={false}
                              disabled={busy}
                              className="min-h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>

              {importFailed && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {t(`diagnosticTerm.errors.${IMPORT_FAILED_CODE}`)}
                </p>
              )}

              <div aria-live="polite" className="empty:hidden">
                {busy && (
                  <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
                    <Loader2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
                    />
                    {t('diagnosticTerm.import.running')}
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
                  {t('diagnosticTerm.import.simulate')}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  className="sm:flex-1"
                  disabled={!file || busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('diagnosticTerm.import.run')}
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
            counters={REPORT_COUNTER_KEYS.map((key) => ({
              key,
              label: t(`common.importReport.${key}`),
              value: report[key],
            }))}
            rejectedTotal={report.invalid + report.duplicated}
            dryRun={report.dryRun}
            rejected={report.errors}
            rejectedColumns={rejectedColumns}
          />
          {!report.dryRun && (
            <Button asChild variant="outline" size="touch" className="w-fit">
              <Link to="/diagnostic-terms">{t('diagnosticTerm.import.report.viewTerms')}</Link>
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('diagnosticTerm.import.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('diagnosticTerm.import.confirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirmed}>
              {t('diagnosticTerm.import.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

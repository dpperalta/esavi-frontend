import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { RejectedWhodrugProduct, WhodrugProductSyncReport } from '@/contracts/whodrugProduct';
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
import { Button } from '@/shared/components/ui/button';
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
import { ROLE_LEVELS } from '@/shared/config/roles';
import { useCan } from '@/shared/hooks/useCan';
import { cn } from '@/shared/lib/utils';
import { useSyncWhodrugProducts, useWhodrugProductList } from './api';
import {
  SYNC_DEFAULT_VALUES,
  syncWhodrugProductsSchema,
  type SyncWhodrugProductsFormValues,
  toSyncWhodrugProductsPayload,
} from './schemas';

const LIST_PATH = '/whodrug-products';
const CONFIG_PATH = '/system-configs?scope=WHODRUG';

// SPEC FE25d §3.5: the codes this page answers with an inline alert instead of a toast. The first
// two are what every deployment's first sync hits — the switch is seeded off and the credentials
// empty — so they carry the way to the configuration.
const ALERT_CODES = {
  WHODPROD_007_DISABLED: { tone: 'warning', withConfigLink: true },
  WHODPROD_007_NOT_CONFIGURED: { tone: 'warning', withConfigLink: true },
  WHODPROD_007_ALREADY_RUNNING: { tone: 'warning', withConfigLink: false },
  WHODPROD_007_DOWNLOAD_FAILED: { tone: 'destructive', withConfigLink: false },
  WHODPROD_007_SYNC_FAILED: { tone: 'destructive', withConfigLink: false },
} as const;

type AlertCode = keyof typeof ALERT_CODES;

function isAlertCode(code: string | undefined): code is AlertCode {
  return code !== undefined && code in ALERT_CODES;
}

// §3.6: the order the report paints its counters in. `downloaded`, `flattened` and `deactivated`
// are the sync's own; the other five are the labels every import already shares.
type SyncCounterKey = Exclude<keyof WhodrugProductSyncReport, 'dryRun' | 'errors'>;

const REPORT_COUNTERS: { key: SyncCounterKey; labelKey: string }[] = [
  { key: 'downloaded', labelKey: 'whodrugProduct.sync.counters.downloaded' },
  { key: 'flattened', labelKey: 'whodrugProduct.sync.counters.flattened' },
  { key: 'inserted', labelKey: 'common.importReport.inserted' },
  { key: 'updated', labelKey: 'common.importReport.updated' },
  { key: 'unchanged', labelKey: 'common.importReport.unchanged' },
  { key: 'deactivated', labelKey: 'whodrugProduct.sync.counters.deactivated' },
  { key: 'invalid', labelKey: 'common.importReport.invalid' },
  { key: 'duplicated', labelKey: 'common.importReport.duplicated' },
];

function EmptyCell() {
  const { t } = useTranslation();
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t('whodrugProduct.sheet.emptyValue')}</span>
    </>
  );
}

// SPEC FE25d §3.1: SUPERADMIN only, reached from the list header. The `007` downloads the whole
// standard synchronously, so the request can take minutes.
export function WhodrugProductSyncPage() {
  const { t } = useTranslation();
  const isSuperAdmin = useCan(ROLE_LEVELS.SUPERADMIN);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const form = useForm<SyncWhodrugProductsFormValues>({
    resolver: zodResolver(syncWhodrugProductsSchema),
    defaultValues: SYNC_DEFAULT_VALUES,
  });

  // ESAVI-WHODPROD-002B — `{ limit: 1, offset: 0 }`, the same key family as the list (§3.4).
  const mirrorProbe = useWhodrugProductList({ page: 1, pageSize: 1 });
  const isMirrorEmpty = mirrorProbe.data?.count === 0;

  // ESAVI-WHODPROD-007
  const sync = useSyncWhodrugProducts();
  const { reset: resetSync, data: report, isPending: busy, submittedAt } = sync;

  const rejectedColumns: ImportReportColumn<RejectedWhodrugProduct>[] = [
    {
      key: 'drugCode',
      header: t('whodrugProduct.sync.columns.drugCode'),
      render: (row) =>
        row.drugCode ? <span className="font-mono text-xs">{row.drugCode}</span> : <EmptyCell />,
    },
    {
      key: 'reason',
      header: t('whodrugProduct.sync.columns.reason'),
      render: (row) => t(`whodrugProduct.sync.reasons.${row.reason}`),
    },
    {
      key: 'column',
      header: t('whodrugProduct.sync.columns.column'),
      // Only VALUE_TOO_LONG names a column; the other four reasons already say which one.
      render: (row) =>
        row.reason === 'VALUE_TOO_LONG' && row.column ? (
          <span className="font-mono text-xs">{row.column}</span>
        ) : (
          <EmptyCell />
        ),
    },
  ];

  // §3.5: a report must never describe a version other than the one about to be synced, so any
  // field change drops it (same as FE25b and FE25c).
  useEffect(() => {
    const subscription = form.watch(() => resetSync());
    return () => subscription.unsubscribe();
  }, [form, resetSync]);

  const apiError = sync.error instanceof EsaviApiError ? sync.error : null;
  const alertCode = isAlertCode(apiError?.code) ? apiError.code : null;
  const alert = alertCode ? ALERT_CODES[alertCode] : null;

  function runSync(dryRun: boolean) {
    void form.handleSubmit((values) => {
      sync.mutate(toSyncWhodrugProductsPayload(values, dryRun), {
        onError: (error) => {
          if (!(error instanceof EsaviApiError)) {
            toast.error(t('common.errors.unexpected'));
            return;
          }
          if (isAlertCode(error.code)) {
            return;
          }
          toast.error(getErrorMessage(error));
        },
      });
    })();
  }

  function handleSyncConfirmed() {
    setConfirmOpen(false);
    runSync(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          to={LIST_PATH}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('whodrugProduct.sync.back')}
        </Link>
        <h1 className="text-xl font-medium text-balance text-foreground">
          {t('whodrugProduct.sync.title')}
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
              <FormField
                control={form.control}
                name="dictionaryVersion"
                render={({ field }) => (
                  <FormItem className="sm:max-w-md">
                    <FormLabel>{t('whodrugProduct.sync.dictionaryVersion')}</FormLabel>
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
                      {t('whodrugProduct.sync.dictionaryVersionHint')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {alertCode && alert && (
                <div
                  role="alert"
                  className={cn(
                    'flex flex-col gap-2 rounded-lg border p-3 text-sm',
                    alert.tone === 'warning'
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : 'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  <p>{t(`whodrugProduct.errors.${alertCode}`)}</p>
                  {alert.withConfigLink && isSuperAdmin && (
                    <Link
                      to={CONFIG_PATH}
                      className="inline-flex min-h-11 w-fit items-center font-medium underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-0"
                    >
                      {t('whodrugProduct.sync.configLink')}
                    </Link>
                  )}
                </div>
              )}

              <div aria-live="polite" className="empty:hidden">
                {busy && (
                  <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
                    <Loader2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
                    />
                    {t('whodrugProduct.sync.running')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="sm:flex-1"
                  disabled={busy}
                  onClick={() => runSync(true)}
                >
                  {t('whodrugProduct.sync.simulate')}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  className="sm:flex-1"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('whodrugProduct.sync.run')}
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
            counters={REPORT_COUNTERS.map(({ key, labelKey }) => ({
              key,
              label: t(labelKey),
              value: report[key],
            }))}
            rejectedTotal={report.invalid + report.duplicated}
            dryRun={report.dryRun}
            rejected={report.errors}
            rejectedColumns={rejectedColumns}
          />
          {!report.dryRun && (
            <Button asChild variant="outline" size="touch" className="w-fit">
              <Link to={LIST_PATH}>{t('whodrugProduct.sync.viewProducts')}</Link>
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('whodrugProduct.sync.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('whodrugProduct.sync.confirmBody')}</AlertDialogDescription>
            {isMirrorEmpty && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {t('whodrugProduct.sync.confirmFirstRun')}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSyncConfirmed}>
              {t('whodrugProduct.sync.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

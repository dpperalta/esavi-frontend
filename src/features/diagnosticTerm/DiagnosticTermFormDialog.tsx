import { Info } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TERM_SOURCES } from '@/contracts/common';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import {
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
import { diagnosticTermResource } from './api';
import {
  createDiagnosticTermSchema,
  diagnosticTermErrorFieldMap,
  REVIEW_STATUSES,
  type ReviewStatus,
  toDiagnosticTermPayload,
  updateDiagnosticTermSchema,
  type DiagnosticTermFormValues,
} from './schemas';

interface DiagnosticTermFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create".
  diagnosticTermId: string | null;
}

function toReviewStatus(value: string | undefined): ReviewStatus | '' {
  return REVIEW_STATUSES.find((status) => status === value) ?? '';
}

export function DiagnosticTermFormDialog({
  open,
  onOpenChange,
  diagnosticTermId,
}: DiagnosticTermFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = diagnosticTermId !== null;
  // ESAVI-DIAGTERM-003 — edit mode only; `enabled: !!id` inside the factory skips it on create.
  const existing = diagnosticTermResource.useOne(diagnosticTermId ?? '');
  // ESAVI-DIAGTERM-001 / ESAVI-DIAGTERM-004
  const create = diagnosticTermResource.useCreate();
  const update = diagnosticTermResource.useUpdate();
  const mutation = isEditing ? update : create;

  // The list page never unmounts this dialog, so a failed mutation's `error` would outlive the
  // close and be re-applied to the next, blank form (CONVENTIONS.md §10.7).
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  // DIAGTERM_003_NOT_FOUND: toast and close rather than leave a form that can never load.
  const loadError = open && existing.error instanceof EsaviApiError ? existing.error : null;
  useEffect(() => {
    if (!loadError) {
      return;
    }
    toast.error(getErrorMessage(loadError));
    handleOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  function handleSubmit(values: DiagnosticTermFormValues) {
    if (isEditing && diagnosticTermId) {
      // The full object travels, minus `source`; the backend does the differential update
      // (CONVENTIONS.md §6.5).
      update.mutate(
        { id: diagnosticTermId, data: toDiagnosticTermPayload(values, 'update') },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(toDiagnosticTermPayload(values, 'create'), {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
    if (error.code === 'DIAGTERM_004_NOT_FOUND') {
      handleOpenChange(false);
    }
  }

  // The backend's `CODE_EXISTS` message doesn't say the pair may belong to a deactivated term,
  // which the listing hides by default (SPEC FE25b §3.5). Memoized: <ResourceForm> re-applies the
  // error whenever the object identity changes.
  const rawError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  const mutationError = useMemo(() => {
    if (!rawError || !diagnosticTermErrorFieldMap[rawError.code]) {
      return rawError;
    }
    return new EsaviApiError(
      t(`diagnosticTerm.errors.${rawError.code}`),
      rawError.status,
      rawError.code,
    );
  }, [rawError, t]);

  const detail = existing.data;
  const isLoadingDetail = isEditing && !detail;
  const storedReviewStatus = toReviewStatus(detail?.metadata?.reviewStatus);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Full screen below md, same as DiluentFormDialog; the action bar of <ResourceForm> is sticky. */}
      <DialogContent className="flex h-dvh max-h-dvh max-w-full flex-col overflow-y-auto rounded-none sm:max-w-full md:h-auto md:max-h-[85dvh] md:max-w-lg md:rounded-xl">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'diagnosticTerm.form.editTitle' : 'diagnosticTerm.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {detail?.metadata?.autoCreated && (
          <div
            role="note"
            className="flex gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>{t('diagnosticTerm.form.autoCreatedNotice')}</p>
          </div>
        )}

        <ResourceForm<DiagnosticTermFormValues>
          // Remounting once the `003` arrives is the `reset(detail)` of §3.4: <ResourceForm>
          // snapshots `defaultValues` on mount.
          key={`${diagnosticTermId ?? 'create'}:${isLoadingDetail ? 'loading' : 'ready'}`}
          schema={isEditing ? updateDiagnosticTermSchema : createDiagnosticTermSchema}
          defaultValues={{
            source: detail?.source ?? 'LOCAL',
            code: detail?.code ?? '',
            name: detail?.name ?? '',
            termGroup: detail?.termGroup ?? '',
            ...(isEditing ? { reviewStatus: storedReviewStatus } : {}),
          }}
          onSubmit={handleSubmit}
          error={mutationError}
          errorFieldMap={diagnosticTermErrorFieldMap}
          onUnmappedError={handleUnmappedError}
          isSubmitting={mutation.isPending}
          submitDisabled={isLoadingDetail}
          onCancel={() => handleOpenChange(false)}
        >
          {(form) => (
            <fieldset disabled={isLoadingDetail} aria-busy={isLoadingDetail} className="contents">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) =>
                  isEditing ? (
                    <FormItem>
                      <FormLabel>{t('diagnosticTerm.fields.source')}</FormLabel>
                      <FormControl>
                        <Input readOnly value={t(`diagnosticTerm.sources.${field.value}`)} />
                      </FormControl>
                      <FormDescription>{t('diagnosticTerm.form.sourceReadOnly')}</FormDescription>
                    </FormItem>
                  ) : (
                    <FormItem>
                      <FormLabel>{t('diagnosticTerm.fields.source')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="min-h-11 w-full md:min-h-8" clearable={false}>
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
                  )
                }
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('diagnosticTerm.fields.code')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" spellCheck={false} {...field} />
                    </FormControl>
                    <FormDescription>{t('diagnosticTerm.form.codeHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('diagnosticTerm.fields.name')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
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
                      <Input autoComplete="off" spellCheck={false} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isEditing && (
                <FormField
                  control={form.control}
                  name="reviewStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('diagnosticTerm.fields.reviewStatus')}</FormLabel>
                      {/* "Sin marcar" is the placeholder of the empty value, never an option:
                          once a row is marked there is no way back (SPEC FE25b §3.5, §6). */}
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="min-h-11 w-full md:min-h-8" clearable={false}>
                            <SelectValue placeholder={t('diagnosticTerm.form.reviewStatusUnset')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REVIEW_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {t(`diagnosticTerm.reviewStatuses.${status}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </fieldset>
          )}
        </ResourceForm>
      </DialogContent>
    </Dialog>
  );
}

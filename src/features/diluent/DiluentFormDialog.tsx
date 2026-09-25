import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { diluentResource } from './api';
import {
  createDiluentSchema,
  diluentErrorFieldMap,
  toDiluentPayload,
  type DiluentFormValues,
} from './schemas';

// The free-text fallback of the notification step hangs on this row (DiluentFormRow.tsx). It is a
// convention of this deployment, not of the contract, so the dialog warns and never blocks
// (SPEC FE25a §6).
const FREE_TEXT_DILUENT_CODE = 'OTHER';

interface DiluentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create".
  diluentId: string | null;
}

export function DiluentFormDialog({ open, onOpenChange, diluentId }: DiluentFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = diluentId !== null;
  // ESAVI-DILUENT-003 — edit mode only; `enabled: !!id` inside the factory skips it on create.
  const existing = diluentResource.useOne(diluentId ?? '');
  // ESAVI-DILUENT-001 / ESAVI-DILUENT-004
  const create = diluentResource.useCreate();
  const update = diluentResource.useUpdate();
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

  // DILUENT_003_NOT_FOUND: the row was deactivated or removed from under this tab — toast and
  // close rather than leave a form that can never load (SPEC FE25a §3.5).
  const loadError = open && existing.error instanceof EsaviApiError ? existing.error : null;
  useEffect(() => {
    if (!loadError) {
      return;
    }
    toast.error(getErrorMessage(loadError));
    handleOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  function handleSubmit(values: DiluentFormValues) {
    const payload = toDiluentPayload(values);
    if (isEditing && diluentId) {
      // The full object travels; the backend does the differential update (CONVENTIONS.md §6.5).
      update.mutate(
        { id: diluentId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(payload, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  // The backend's `CODE_EXISTS` message doesn't say the code may belong to a deactivated diluent,
  // which the listing hides by default (SPEC FE25a §7). The field gets the client text instead.
  // Memoized: <ResourceForm> re-applies the error whenever the object identity changes.
  const rawError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  const mutationError = useMemo(() => {
    if (!rawError || !diluentErrorFieldMap[rawError.code]) {
      return rawError;
    }
    return new EsaviApiError(t(`diluent.errors.${rawError.code}`), rawError.status, rawError.code);
  }, [rawError, t]);

  const isLoadingDetail = isEditing && !existing.data;
  const isFreeTextRow = existing.data?.code === FREE_TEXT_DILUENT_CODE;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Full screen below md (SPEC FE25a §3.7); the action bar of <ResourceForm> is sticky. */}
      <DialogContent className="flex h-dvh max-h-dvh max-w-full flex-col overflow-y-auto rounded-none sm:max-w-full md:h-auto md:max-h-[85dvh] md:max-w-md md:rounded-xl">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'diluent.form.editTitle' : 'diluent.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {isFreeTextRow && (
          <div
            role="note"
            className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>{t('diluent.form.otherWarning')}</p>
          </div>
        )}

        <ResourceForm<DiluentFormValues>
          // Remounting once the `003` arrives is the `reset(detail)` of §3.4: <ResourceForm>
          // snapshots `defaultValues` on mount.
          key={`${diluentId ?? 'create'}:${isLoadingDetail ? 'loading' : 'ready'}`}
          schema={createDiluentSchema}
          defaultValues={{
            code: existing.data?.code ?? '',
            name: existing.data?.name ?? '',
            description: existing.data?.description ?? '',
            composition: existing.data?.composition ?? '',
          }}
          onSubmit={handleSubmit}
          error={mutationError}
          errorFieldMap={diluentErrorFieldMap}
          onUnmappedError={handleUnmappedError}
          isSubmitting={mutation.isPending || isLoadingDetail}
          onCancel={() => handleOpenChange(false)}
        >
          {(form) => (
            <fieldset disabled={isLoadingDetail} aria-busy={isLoadingDetail} className="contents">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('diluent.fields.code')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" spellCheck={false} {...field} />
                    </FormControl>
                    <FormDescription>{t('diluent.form.codeHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('diluent.fields.name')}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('diluent.fields.description')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="composition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('diluent.fields.composition')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>
          )}
        </ResourceForm>
      </DialogContent>
    </Dialog>
  );
}

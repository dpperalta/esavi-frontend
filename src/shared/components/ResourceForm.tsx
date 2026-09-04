import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactNode } from 'react';
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ZodType } from 'zod';
import type { EsaviApiError } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/button';
import { Form } from '@/shared/components/ui/form';

export interface ResourceFormProps<TFieldValues extends FieldValues> {
  schema: ZodType<TFieldValues>;
  defaultValues: DefaultValues<TFieldValues>;
  onSubmit: (values: TFieldValues) => void;
  // The mutation's current error (CONVENTIONS.md §8: mapped to its field, never a generic toast).
  error?: EsaviApiError | null;
  errorFieldMap?: Partial<Record<string, Path<TFieldValues>>>;
  // Called when `error.code` isn't in `errorFieldMap` — the caller's cue to show the toast
  // (`getErrorMessage`, CONVENTIONS.md §6.2). Never called for a mapped code.
  onUnmappedError?: (error: EsaviApiError) => void;
  isSubmitting?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: (form: UseFormReturn<TFieldValues>) => ReactNode;
}

// React Hook Form + Zod, always (CONVENTIONS.md §8) — the entity's fields are the caller's
// concern via `children`; this owns the form instance, the error→field mapping, and the
// mobile action bar.
export function ResourceForm<TFieldValues extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  error,
  errorFieldMap,
  onUnmappedError,
  isSubmitting = false,
  onCancel,
  submitLabel = 'common.actions.save',
  cancelLabel = 'common.actions.cancel',
  children,
}: ResourceFormProps<TFieldValues>) {
  const { t } = useTranslation();
  // `onTouched`: no error hasta que el usuario sale del campo por primera vez (no se le grita en
  // la primera tecla de un campo obligatorio); `reValidateMode: 'onChange'` es lo que hace que un
  // error ya mostrado desaparezca en cuanto el valor vuelve a ser válido, sin esperar a un nuevo
  // blur ni a un nuevo submit.
  const form = useForm<TFieldValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  useEffect(() => {
    if (!error) {
      return;
    }
    const field = errorFieldMap?.[error.code];
    if (field) {
      form.setError(field, { type: 'server', message: error.message });
    } else {
      onUnmappedError?.(error);
    }
    // Re-runs only when a new error object arrives — `form` and `onUnmappedError` are stable
    // enough for this and re-including them would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        {children(form)}
        {/* `sticky`, never `fixed`: inside a <DialogContent> (which is `-translate-*`) a fixed
            box anchors to the dialog, not the viewport, and freezes over the last fields.
            `bg-popover` because every consumer is a <Dialog>, whose surface is that token —
            `--background` is a darker shade in the dark theme and would read as a band. */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t bg-popover py-3 md:static md:z-auto md:border-0 md:bg-transparent md:py-0">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              {t(cancelLabel)}
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {t(submitLabel)}
          </Button>
        </div>
      </form>
    </Form>
  );
}

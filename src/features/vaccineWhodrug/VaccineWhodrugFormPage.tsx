import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { VaccineWhodrugDetail } from '@/contracts/declared/vaccineWhodrug';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { NumberField } from '@/shared/components/NumberField';
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
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';
import { vaccineWhodrugResource } from './api';
import {
  createVaccineWhodrugSchema,
  EXTERNAL_ID_MAX,
  EXTERNAL_ID_MIN,
  toVaccineWhodrugFormValues,
  toVaccineWhodrugPayload,
  VACCINE_WHODRUG_DEFAULT_VALUES,
  vaccineWhodrugErrorFieldMap,
  type VaccineWhodrugFormValues,
} from './schemas';
import { VACCINE_WHODRUG_SECTIONS, type VaccineWhodrugField } from './sections';

const LIST_PATH = '/whodrug-vaccines';

// §3.5: the `text` columns that can hold a paragraph get a textarea; the rest are single-line.
const TEXTAREA_FIELDS = new Set<VaccineWhodrugField>([
  'ingredient',
  'ingredientTranslation',
  'noDose',
  'diluent',
  'maHolders',
  'notes',
]);

const REQUIRED_FIELDS = new Set<VaccineWhodrugField>(['drugCode', 'drugName']);

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true">
      <Skeleton className="h-7 w-72 max-w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        {VACCINE_WHODRUG_SECTIONS.map((section) => (
          <Skeleton key={section.key} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

interface VaccineWhodrugFormProps {
  vaccineWhodrugId: string | null;
  detail: VaccineWhodrugDetail | null;
}

// SPEC FE25c §3.1: one page for create and edit, told apart by `:id`. Split from the page so the
// form mounts only once the 003 answered, and `useForm` starts from the row instead of resetting.
function VaccineWhodrugForm({ vaccineWhodrugId, detail }: VaccineWhodrugFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = vaccineWhodrugId !== null;
  const [exitTarget, setExitTarget] = useState<string | null>(null);

  const form = useForm<VaccineWhodrugFormValues>({
    resolver: zodResolver(createVaccineWhodrugSchema),
    defaultValues: detail ? toVaccineWhodrugFormValues(detail) : VACCINE_WHODRUG_DEFAULT_VALUES,
  });
  const { isDirty } = form.formState;

  // ESAVI-WHODRUG-001 / ESAVI-WHODRUG-004
  const create = vaccineWhodrugResource.useCreate();
  const update = vaccineWhodrugResource.useUpdate();
  const saving = create.isPending || update.isPending;

  // §3.5: closing or reloading the tab with unsaved changes asks the browser's own question.
  // In-app navigation (sidebar, back button) is out of scope (§2, §6).
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  function leaveTo(path: string) {
    if (isDirty) {
      setExitTarget(path);
      return;
    }
    navigate(path);
  }

  function handleSaveError(error: Error) {
    if (!(error instanceof EsaviApiError)) {
      toast.error(t('common.errors.unexpected'));
      return;
    }
    const field = vaccineWhodrugErrorFieldMap[error.code];
    if (field) {
      form.setError(
        field,
        { type: 'server', message: t(`vaccineWhodrug.errors.${error.code}`) },
        { shouldFocus: true },
      );
      return;
    }
    toast.error(getErrorMessage(error));
    // §3.5: the row vanished under the form (deactivated or deleted from another tab).
    if (error.code === 'WHODRUG_004_NOT_FOUND') {
      navigate(LIST_PATH);
    }
  }

  function handleSaved(saved: VaccineWhodrugDetail, values: VaccineWhodrugFormValues) {
    toast.success(t(isEdit ? 'common.toast.updated' : 'common.toast.created'));
    // §3.5: `isDirty` back to false before leaving, so nothing asks for confirmation.
    form.reset(values);
    navigate(`${LIST_PATH}/${saved.vaccineWhodrugId}`);
  }

  const onSubmit = form.handleSubmit((values) => {
    // The whole object travels on PUT too; the backend computes the diff (CONVENTIONS.md §6.5).
    const payload = toVaccineWhodrugPayload(values);
    if (vaccineWhodrugId) {
      update.mutate(
        { id: vaccineWhodrugId, data: payload },
        { onSuccess: (saved) => handleSaved(saved, values), onError: handleSaveError },
      );
    } else {
      create.mutate(payload, {
        onSuccess: (saved) => handleSaved(saved, values),
        onError: handleSaveError,
      });
    }
  });

  const cancelTarget = vaccineWhodrugId ? `${LIST_PATH}/${vaccineWhodrugId}` : LIST_PATH;

  function renderControl(fieldName: VaccineWhodrugField) {
    const label = t(`vaccineWhodrug.fields.${fieldName}`);
    const isRequired = REQUIRED_FIELDS.has(fieldName);

    return (
      <FormField
        key={fieldName}
        control={form.control}
        name={fieldName}
        render={({ field }) => {
          if (fieldName === 'isPreferred') {
            return (
              <FormItem className="flex min-h-11 flex-row items-center justify-between gap-3">
                <FormLabel>{label}</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value === true}
                    onCheckedChange={field.onChange}
                    disabled={saving}
                  />
                </FormControl>
              </FormItem>
            );
          }

          return (
            <FormItem className={cn(TEXTAREA_FIELDS.has(fieldName) && 'md:col-span-2')}>
              <FormLabel>{label}</FormLabel>
              {fieldName === 'externalId' ? (
                <FormControl>
                  <NumberField
                    value={typeof field.value === 'number' ? field.value : null}
                    onChange={field.onChange}
                    ariaLabel={label}
                    min={EXTERNAL_ID_MIN}
                    max={EXTERNAL_ID_MAX}
                    disabled={saving}
                  />
                </FormControl>
              ) : fieldName === 'isGeneric' ? (
                <Select
                  value={String(field.value)}
                  onValueChange={field.onChange}
                  disabled={saving}
                >
                  <FormControl>
                    <SelectTrigger className="min-h-11 w-full" clearable={false}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">{t('vaccineWhodrug.filters.yes')}</SelectItem>
                    <SelectItem value="false">{t('vaccineWhodrug.filters.no')}</SelectItem>
                    <SelectItem value="unknown">
                      {t('vaccineWhodrug.form.genericUnknown')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : TEXTAREA_FIELDS.has(fieldName) ? (
                <FormControl>
                  <Textarea
                    {...field}
                    value={String(field.value ?? '')}
                    rows={3}
                    disabled={saving}
                  />
                </FormControl>
              ) : (
                <FormControl>
                  <Input
                    {...field}
                    value={String(field.value ?? '')}
                    autoComplete="off"
                    spellCheck={false}
                    aria-required={isRequired || undefined}
                    disabled={saving}
                    className="min-h-11"
                  />
                </FormControl>
              )}
              {fieldName === 'diluent' && (
                <FormDescription>{t('vaccineWhodrug.form.diluentHint')}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => leaveTo(LIST_PATH)}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('vaccineWhodrug.detail.back')}
        </button>
        <h1 className="text-xl font-medium text-balance break-words text-foreground">
          {t(isEdit ? 'vaccineWhodrug.form.editTitle' : 'vaccineWhodrug.form.createTitle')}
        </h1>
        {detail && <p className="text-sm break-words text-muted-foreground">{detail.drugName}</p>}
      </div>

      {/* §3.5: the import overwrites 24 columns of this row and keeps only `notes`. */}
      {detail && detail.externalId !== null && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('vaccineWhodrug.form.importedWarning')}
        </p>
      )}

      <Form {...form}>
        <form noValidate onSubmit={onSubmit} aria-busy={saving} className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            {VACCINE_WHODRUG_SECTIONS.map((section) => (
              <fieldset
                key={section.key}
                disabled={saving}
                className={cn(
                  'min-w-0 rounded-xl border bg-card p-4',
                  section.key === 'notes' && 'md:col-span-2',
                )}
              >
                {/* float + w-full keeps the legend inside the bordered box instead of on its edge. */}
                <legend className="float-left mb-4 w-full font-heading text-base font-medium">
                  {t(`vaccineWhodrug.sections.${section.key}`)}
                </legend>
                <div className="clear-both grid gap-4 md:grid-cols-2">
                  {section.fields.map(renderControl)}
                </div>
              </fieldset>
            ))}
          </div>

          {/* §3.7: fixed to the bottom on mobile, inline from md up. */}
          <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={saving}
              onClick={() => leaveTo(cancelTarget)}
            >
              {t('vaccineWhodrug.form.cancel')}
            </Button>
            <Button type="submit" size="touch" disabled={saving}>
              {saving && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
              {t('vaccineWhodrug.form.save')}
            </Button>
          </div>
        </form>
      </Form>

      <AlertDialog
        open={exitTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExitTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('vaccineWhodrug.form.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('vaccineWhodrug.form.unsavedBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('vaccineWhodrug.form.unsavedStay')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (exitTarget) navigate(exitTarget);
              }}
            >
              {t('vaccineWhodrug.form.unsavedDiscard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function VaccineWhodrugFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const vaccineWhodrugId = id ?? null;
  // ESAVI-WHODRUG-003 — edit only; `useOne('')` stays disabled on create.
  const vaccine = vaccineWhodrugResource.useOne(vaccineWhodrugId ?? '');

  if (!vaccineWhodrugId) {
    return <VaccineWhodrugForm vaccineWhodrugId={null} detail={null} />;
  }

  if (vaccine.isLoading) {
    return <FormSkeleton />;
  }

  // WHODRUG_003_NOT_FOUND — also what ADMIN gets for an inactive row (§3.1, §3.6).
  if (vaccine.error instanceof EsaviApiError && vaccine.error.status === 404) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('vaccineWhodrug.detail.notFound')}</p>
        <Button type="button" variant="outline" size="touch" onClick={() => navigate(LIST_PATH)}>
          {t('vaccineWhodrug.detail.back')}
        </Button>
      </div>
    );
  }

  if (vaccine.isError || !vaccine.data) {
    const message =
      vaccine.error instanceof EsaviApiError
        ? getErrorMessage(vaccine.error)
        : t('common.errors.unexpected');
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
        <Button type="button" variant="outline" size="touch" onClick={() => void vaccine.refetch()}>
          {t('common.table.retry')}
        </Button>
      </div>
    );
  }

  // Keyed by id so moving between two rows' edit pages starts a fresh form.
  return (
    <VaccineWhodrugForm
      key={vaccineWhodrugId}
      vaccineWhodrugId={vaccineWhodrugId}
      detail={vaccine.data}
    />
  );
}

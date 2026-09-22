import { useTranslation } from 'react-i18next';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { CreateSystemConfigInput, SystemConfigValueType } from '@/contracts/systemConfig';
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
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { systemConfigResource } from './api';
import {
  createSystemConfigSchema,
  createUpdateSystemConfigSchema,
  systemConfigErrorFieldMap,
  type SystemConfigFormValues,
} from './schemas';
import { SystemConfigValueField } from './SystemConfigValueField';

export interface SystemConfigFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` significa «crear» — mismo precedente que `EventFormDialog`.
  systemConfigId: string | null;
}

const SYSTEM_CONFIG_VALUE_TYPES: readonly SystemConfigValueType[] = [
  'string',
  'number',
  'boolean',
  'json',
  'array',
];

// `json`/`array` guardan el texto crudo en el formulario (SPEC FE19 §3.5); el resto viaja tal
// cual. `undefined`/`null` en un tipo `json`/`array` se muestra como el vacío de ese tipo, nunca
// como la cadena `"null"`.
function toFormValue(value: unknown, valueType: SystemConfigValueType): unknown {
  if (valueType === 'json' || valueType === 'array') {
    if (value === undefined || value === null) {
      return valueType === 'array' ? '[]' : '{}';
    }
    return JSON.stringify(value, null, 2);
  }
  return value;
}

// El inverso de `toFormValue`: lo que viaja en el `POST`/`PUT` es el valor real, nunca el texto
// crudo de `json`/`array` — el `JSON.parse` ya lo validó el schema (`schemas.ts`,
// `validateValueAgainstType`), así que aquí no puede fallar.
function toPayloadValue(value: unknown, valueType: SystemConfigValueType): unknown {
  if ((valueType === 'json' || valueType === 'array') && typeof value === 'string') {
    return JSON.parse(value);
  }
  return value;
}

function isRoleForbidden(error: EsaviApiError): boolean {
  return error.code === 'AUTH_ROLE_FORBIDDEN';
}

interface SystemConfigFormFieldsProps {
  form: UseFormReturn<SystemConfigFormValues>;
  isEditing: boolean;
}

// SPEC FE19 §3.5 — `.superRefine()` sólo deja marcadores planos (CONVENTIONS.md §8: el schema
// nunca escribe texto traducido); un error mapeado del backend o nativo de Zod ya llega traducido
// y no está en este mapa, así que se muestra tal cual. `t()` con una clave inexistente devuelve la
// propia cadena de entrada (i18next sin `parseMissingKeyHandler`), así que envolver un mensaje ya
// traducido en `t()` es inocuo.
const VALUE_ERROR_KEYS: Record<string, string> = {
  required: 'errors.validation.required',
  invalidJson: 'systemConfig.validation.invalidJson',
  invalidArray: 'systemConfig.validation.invalidArray',
};

const CHANGE_REASON_ERROR_KEYS: Record<string, string> = {
  changeReasonRequired: 'systemConfig.validation.changeReasonRequired',
};

function resolveFieldErrorKey(
  message: string | undefined,
  knownMarkers: Record<string, string>,
): string | undefined {
  if (!message) return undefined;
  return knownMarkers[message] ?? message;
}

function SystemConfigFormFields({ form, isEditing }: SystemConfigFormFieldsProps) {
  const { t } = useTranslation();
  const valueType = form.watch('valueType');

  return (
    <>
      <FormField
        control={form.control}
        name="code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('systemConfig.field.code')}</FormLabel>
            <FormControl>
              <Input {...field} disabled={isEditing} />
            </FormControl>
            <FormDescription>{t('systemConfig.help.code')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('systemConfig.field.name')}</FormLabel>
            <FormControl>
              <Input {...field} />
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
            <FormLabel>{t('systemConfig.field.description')}</FormLabel>
            <FormControl>
              <Textarea {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="scope"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('systemConfig.field.scope')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={isEditing} />
            </FormControl>
            <FormDescription>{t('systemConfig.help.scope')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="valueType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('systemConfig.field.valueType')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger aria-label={t('systemConfig.field.valueType')}>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {SYSTEM_CONFIG_VALUE_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`systemConfig.valueType.${option}`)}
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
        name="value"
        render={({ field, fieldState }) => {
          const errorKey = resolveFieldErrorKey(fieldState.error?.message, VALUE_ERROR_KEYS);
          return (
            <FormItem>
              <FormLabel>{t('systemConfig.field.value')}</FormLabel>
              <FormControl>
                <SystemConfigValueField
                  valueType={valueType}
                  value={field.value}
                  onChange={field.onChange}
                  ariaLabel={t('systemConfig.field.value')}
                />
              </FormControl>
              {errorKey && <p className="text-sm text-destructive">{t(errorKey)}</p>}
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="isEncrypted"
        render={({ field }) => (
          <div className="flex flex-col gap-1">
            <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
              <Switch
                checked={field.value === true}
                onCheckedChange={field.onChange}
                aria-label={t('systemConfig.field.isEncrypted')}
                disabled={isEditing}
              />
              {t('systemConfig.field.isEncrypted')}
            </label>
            <p className="text-xs text-muted-foreground">{t('systemConfig.help.isEncrypted')}</p>
          </div>
        )}
      />

      <FormField
        control={form.control}
        name="isEditable"
        render={({ field }) => (
          <FormItem>
            <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
              <FormControl>
                <Switch
                  checked={field.value !== false}
                  onCheckedChange={field.onChange}
                  aria-label={t('systemConfig.field.isEditable')}
                />
              </FormControl>
              {t('systemConfig.field.isEditable')}
            </label>
            <p className="text-xs text-muted-foreground">{t('systemConfig.help.isEditable')}</p>
            <FormMessage />
          </FormItem>
        )}
      />

      {isEditing && (
        <FormField
          control={form.control}
          name="changeReason"
          render={({ field, fieldState }) => {
            const errorKey = resolveFieldErrorKey(fieldState.error?.message, CHANGE_REASON_ERROR_KEYS);
            return (
              <FormItem>
                <FormLabel>{t('systemConfig.field.changeReason')}</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ''} />
                </FormControl>
                {errorKey && <p className="text-sm text-destructive">{t(errorKey)}</p>}
              </FormItem>
            );
          }}
        />
      )}
    </>
  );
}

// SPEC FE19 §4 paso 5 — el diálogo de alta y edición. En edición carga por `useOne` (`003`), la
// única lectura que trae el valor descifrado (§3.5): abrir con la fila del listado enviaría
// `value: null` en el `PUT` de una fila cifrada.
export function SystemConfigFormDialog({
  open,
  onOpenChange,
  systemConfigId,
}: SystemConfigFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = systemConfigId !== null;
  const existing = systemConfigResource.useOne(systemConfigId ?? '');
  const create = systemConfigResource.useCreate();
  const update = systemConfigResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — el llamador nunca desmonta este diálogo, sólo alterna `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: SystemConfigFormValues) {
    const payload: Partial<CreateSystemConfigInput> = {
      code: values.code.trim(),
      name: values.name.trim(),
      description: values.description ?? null,
      scope: values.scope || undefined,
      valueType: values.valueType,
      value: toPayloadValue(values.value, values.valueType),
      isEncrypted: values.isEncrypted ?? false,
      isEditable: values.isEditable ?? true,
    };

    if (isEditing && systemConfigId) {
      update.mutate(
        { id: systemConfigId, data: { ...payload, changeReason: values.changeReason ?? null } },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }

    create.mutate(payload as CreateSystemConfigInput, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    if (isRoleForbidden(error)) {
      toast.error(t('systemConfig.roleForbidden'));
      return;
    }
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  const readyToRender = !isEditing || !!existing.data;
  const existingValueType = (existing.data?.valueType as SystemConfigValueType) ?? 'json';
  const originalFormValue = toFormValue(existing.data?.value, existingValueType);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'systemConfig.form.editTitle' : 'systemConfig.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<SystemConfigFormValues>
            key={systemConfigId ?? 'create'}
            schema={isEditing ? createUpdateSystemConfigSchema({ originalValue: originalFormValue }) : createSystemConfigSchema}
            defaultValues={{
              code: existing.data?.code ?? '',
              name: existing.data?.name ?? '',
              description: existing.data?.description ?? null,
              scope: existing.data?.scope ?? '',
              valueType: existingValueType,
              value: isEditing ? originalFormValue : '{}',
              isEncrypted: existing.data?.isEncrypted ?? false,
              isEditable: existing.data?.isEditable ?? true,
              changeReason: null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={systemConfigErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => <SystemConfigFormFields form={form} isEditing={isEditing} />}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}

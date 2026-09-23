import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ZodType } from 'zod';
import type { CreateAppRoleInput } from '@/contracts/appRole';
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
import { Textarea } from '@/shared/components/ui/textarea';
import { useOwnRoleLevel } from '@/shared/hooks/useOwnRoleLevel';
import { appRoleResource } from './api';
import { RoleLevelField } from './RoleLevelField';
import {
  appRoleErrorFieldMap,
  createAppRoleSchema,
  updateAppRoleSchema,
  type AppRoleFormValues,
} from './schemas';
import { toConstantCase } from './toConstantCase';

interface AppRoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create". Mirrors every other FormDialog of this repository.
  roleId: string | null;
}

export function AppRoleFormDialog({ open, onOpenChange, roleId }: AppRoleFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = roleId !== null;
  const maxLevel = useOwnRoleLevel();
  // ESAVI-APPROLE-003 — only in edit mode; `enabled: !!id` inside the factory skips the request
  // while creating.
  const existing = appRoleResource.useOne(roleId ?? '');
  // ESAVI-APPROLE-001 / ESAVI-APPROLE-004
  const create = appRoleResource.useCreate();
  const update = appRoleResource.useUpdate();
  const mutation = isEditing ? update : create;

  // Same reset-on-close pattern as every other form dialog (CONVENTIONS.md §10.7): the list page
  // keeps this mounted and only toggles `open`, so a stale 409 would otherwise be reapplied to
  // the next attempt's blank form.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: AppRoleFormValues) {
    if (isEditing && roleId) {
      // The whole object travels; the backend writes only what really changed
      // (CONVENTIONS.md §6.5), so reopening a role and saving it untouched writes nothing.
      update.mutate(
        { id: roleId, data: values },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(values as CreateAppRoleInput, {
      onSuccess: () => {
        toast.success(t('common.toast.created'));
        handleOpenChange(false);
      },
    });
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  // Waits for the row before mounting the form — `ResourceForm` snapshots `defaultValues` once.
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'appRole.form.editTitle' : 'appRole.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<AppRoleFormValues>
            key={roleId ?? 'create'}
            // Editing validates the four fields as optional, as ESAVI-APPROLE-004 accepts them
            // (SPEC FE21 §3.5); the cast states what the generic cannot, the same precedent as
            // CatalogItemFormDialog: the runtime schema enforces the difference, not this type.
            schema={
              (isEditing
                ? updateAppRoleSchema(maxLevel)
                : createAppRoleSchema(maxLevel)) as ZodType<AppRoleFormValues>
            }
            defaultValues={{
              code: existing.data?.code ?? '',
              name: existing.data?.name ?? '',
              description: existing.data?.description ?? '',
              level: existing.data?.level ?? undefined,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={appRoleErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {(form) => (
              <>
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('appRole.columns.code')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} autoComplete="off" />
                      </FormControl>
                      {field.value && (
                        <FormDescription>
                          {t('appRole.form.normalizedPreview', {
                            value: toConstantCase(String(field.value).trim()),
                          })}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('appRole.columns.name')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} autoComplete="off" />
                      </FormControl>
                      {/* `name` goes through toConstantCase too, not toTitleCase: in this table
                          it is the key roleValidation.middleware.ts compares
                          (appRole.service.ts:35-37). */}
                      {field.value && (
                        <FormDescription>
                          {t('appRole.form.normalizedPreview', {
                            value: toConstantCase(String(field.value).trim()),
                          })}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('appRole.columns.description')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <RoleLevelField
                        value={typeof field.value === 'number' ? field.value : null}
                        onChange={field.onChange}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </ResourceForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

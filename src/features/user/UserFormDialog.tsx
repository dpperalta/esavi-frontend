import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { userResource } from './api';
import { UserRoleCheckboxGroup } from './UserRoleCheckboxGroup';
import {
  createUserSchema,
  updateUserSchema,
  userErrorFieldMap,
  userUpdateErrorFieldMap,
  type UserFormValues,
  type UserUpdateFormValues,
} from './schemas';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` means "create". The two modes are two different operations, not one form with a flag:
  // ESAVI-USER-001 takes a password and the roles, ESAVI-USER-004 answers 400 if either travels.
  userId: string | null;
}

// The five fields ESAVI-USER-004 accepts, which are also five of the seven of the alta — written
// once and mounted under either `<ResourceForm>`. `useFormContext` is what lets one field set serve
// two form shapes: the create values are assignable to the update ones, so no cast is needed.
function UserIdentityFields() {
  const { t } = useTranslation();
  const form = useFormContext<UserUpdateFormValues>();

  return (
    <>
      <FormField
        control={form.control}
        name="firstName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('user.field.firstName')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} autoComplete="given-name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="lastName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('user.field.lastName')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} autoComplete="family-name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('user.field.email')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('user.field.username')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} autoComplete="off" spellCheck={false} />
            </FormControl>
            <FormDescription>{t('user.form.usernameHint')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('user.field.phone')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

export function UserFormDialog({ open, onOpenChange, userId }: UserFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = userId !== null;
  // ESAVI-USER-003 — only in edit mode; `enabled: !!id` inside the factory skips it while creating.
  const existing = userResource.useOne(userId ?? '');
  // ESAVI-USER-001 / ESAVI-USER-004
  const create = userResource.useCreate();
  const update = userResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7: the list page never unmounts this dialog, so a failed mutation's `error`
  // outlives the close and would be re-applied to the fresh form on the next open.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleCreate(values: UserFormValues) {
    const { roleIds, ...rest } = values;
    // ESAVI-USER-001 creates the user and its assignments in one transaction, so the alta needs no
    // second call to /api/user-roles and cannot end up half done (§6).
    create.mutate(
      { ...rest, roleId: roleIds },
      {
        onSuccess: () => {
          toast.success(t('common.toast.created'));
          handleOpenChange(false);
        },
      },
    );
  }

  function handleUpdate(values: UserUpdateFormValues) {
    if (!userId) {
      return;
    }
    // The full object travels: the backend writes only what actually changed, so reopening and
    // saving without touching anything adds no audit entry (CONVENTIONS.md §6.5).
    update.mutate(
      { id: userId, data: values },
      {
        onSuccess: () => {
          toast.success(t('common.toast.updated'));
          handleOpenChange(false);
        },
      },
    );
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  // <ResourceForm> snapshots `defaultValues` once, so the row has to be there before it mounts.
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'user.form.editTitle' : 'user.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {!readyToRender && (
          <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        )}

        {readyToRender && isEditing && (
          <ResourceForm<UserUpdateFormValues>
            key={userId}
            schema={updateUserSchema}
            defaultValues={{
              firstName: existing.data?.firstName ?? '',
              lastName: existing.data?.lastName ?? '',
              email: existing.data?.email ?? '',
              username: existing.data?.username ?? '',
              phone: existing.data?.phone ?? '',
            }}
            onSubmit={handleUpdate}
            error={mutationError}
            errorFieldMap={userUpdateErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {/* No password field and no role selector: ESAVI-USER-004 rejects both with a 400, and
                the roles are changed from the ficha's own block (§2). */}
            {() => <UserIdentityFields />}
          </ResourceForm>
        )}

        {readyToRender && !isEditing && (
          <ResourceForm<UserFormValues>
            key="create"
            schema={createUserSchema}
            defaultValues={{
              firstName: '',
              lastName: '',
              email: '',
              password: '',
              username: '',
              phone: '',
              roleIds: [],
            }}
            onSubmit={handleCreate}
            error={mutationError}
            errorFieldMap={userErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
          >
            {(form) => (
              <>
                <UserIdentityFields />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('user.form.password')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" autoComplete="new-password" />
                      </FormControl>
                      <FormDescription>
                        {t('user.form.passwordHint')} {t('user.form.requiresPasswordChange')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roleIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('user.field.roles')}</FormLabel>
                      <UserRoleCheckboxGroup value={field.value} onChange={field.onChange} />
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

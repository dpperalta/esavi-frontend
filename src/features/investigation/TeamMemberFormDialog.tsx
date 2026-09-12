import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CreateInvestigationTeamMemberInput } from '@/contracts/investigationTeamMember';
import { investigationTeamMemberResource } from '@/features/investigation/api';
import {
  teamMemberErrorFieldMap,
  teamMemberSaveSchema,
  type TeamMemberFormValues,
} from '@/features/investigation/schemas';
import { getErrorMessage } from '@/shared/api/errorMessages';
import { EsaviApiError } from '@/shared/api/types';
import { ResourceForm } from '@/shared/components/ResourceForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';

export interface TeamMemberFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investigationId: string;
  // `null` means "create" — same precedent as `PregnancyComplicationFormDialog`.
  memberId: string | null;
}

interface TeamMemberFormFieldsProps {
  form: UseFormReturn<TeamMemberFormValues>;
}

function TeamMemberFormFields({ form }: TeamMemberFormFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <FormField
        control={form.control}
        name="fullName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.team.field.fullName')}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="institutionName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.team.field.institutionName')}</FormLabel>
            <FormControl>
              <Input
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
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
            <FormLabel>{t('investigation.team.field.email')}</FormLabel>
            <FormControl>
              <Input
                type="email"
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="phone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.team.field.phone')}</FormLabel>
            <FormControl>
              <Input
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('investigation.fields.notes')}</FormLabel>
            <FormControl>
              <Textarea
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
                onBlur={field.onBlur}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

// Create/edit dialog for section A2 (SPEC FE13a §3.5 D). No variant for the duplicate case:
// a normalized `fullName` repeated among active members is a `409` the backend decides, and the
// dialog stays open with the server's message anchored on that field — never "similar", because
// that's not what the guard promises (§3.5 D).
export function TeamMemberFormDialog({
  open,
  onOpenChange,
  investigationId,
  memberId,
}: TeamMemberFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = memberId !== null;
  const existing = investigationTeamMemberResource.useOne(memberId ?? '');
  const create = investigationTeamMemberResource.useCreate();
  const update = investigationTeamMemberResource.useUpdate();
  const mutation = isEditing ? update : create;

  // CONVENTIONS.md §10.7 — the caller never unmounts this dialog, only toggles `open`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      create.reset();
      update.reset();
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: TeamMemberFormValues) {
    const payload: Partial<CreateInvestigationTeamMemberInput> = {
      fullName: values.fullName.trim(),
      institutionName: values.institutionName ?? null,
      email: values.email ?? null,
      phone: values.phone ?? null,
      notes: values.notes ?? null,
    };

    if (isEditing && memberId) {
      update.mutate(
        { id: memberId, data: payload },
        {
          onSuccess: () => {
            toast.success(t('common.toast.updated'));
            handleOpenChange(false);
          },
        },
      );
      return;
    }
    create.mutate(
      { ...payload, investigationId } as CreateInvestigationTeamMemberInput,
      {
        onSuccess: () => {
          toast.success(t('common.toast.created'));
          handleOpenChange(false);
        },
      },
    );
  }

  function handleUnmappedError(error: EsaviApiError) {
    toast.error(getErrorMessage(error));
  }

  const mutationError = mutation.error instanceof EsaviApiError ? mutation.error : null;
  const readyToRender = !isEditing || !!existing.data;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'investigation.team.form.editTitle' : 'investigation.team.form.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {readyToRender && (
          <ResourceForm<TeamMemberFormValues>
            key={memberId ?? 'create'}
            schema={teamMemberSaveSchema}
            defaultValues={{
              fullName: existing.data?.fullName ?? '',
              institutionName: existing.data?.institutionName ?? null,
              email: existing.data?.email ?? null,
              phone: existing.data?.phone ?? null,
              notes: existing.data?.notes ?? null,
            }}
            onSubmit={handleSubmit}
            error={mutationError}
            errorFieldMap={teamMemberErrorFieldMap}
            onUnmappedError={handleUnmappedError}
            isSubmitting={mutation.isPending}
            onCancel={() => handleOpenChange(false)}
            submitLabel="common.satelliteList.save"
            cancelLabel="common.satelliteList.cancel"
          >
            {(form) => <TeamMemberFormFields form={form} />}
          </ResourceForm>
        )}
        {!readyToRender && <p className="py-4 text-sm text-muted-foreground">{t('common.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}

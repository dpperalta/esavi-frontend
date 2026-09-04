import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseFormReturn } from 'react-hook-form';
import { CatalogSelect } from '@/shared/components/CatalogSelect';
import { DateField } from '@/shared/components/DateField';
import { GeoLocationPicker } from '@/shared/components/GeoLocationPicker';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { generateProvisionalDocument } from './provisionalDocument';
import type { PatientFormValues } from './schemas';

interface NoDocumentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

// A descendant of `documentNumber`'s own `<FormItem>` (rendered right after `<FormMessage>`
// below), so `useFormField()` resolves to the very id `<FormControl>` gave that field's `<Input>`
// via Radix `Slot` — the checkbox's `aria-controls` points at the real id instead of a second,
// hand-picked one that would silently drift from it (SPEC FE10 §3.7).
function NoDocumentCheckbox({ checked, onCheckedChange }: NoDocumentCheckboxProps) {
  const { t } = useTranslation();
  const { formItemId } = useFormField();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="patientForm-noDocument"
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        aria-controls={formItemId}
      />
      <Label htmlFor="patientForm-noDocument">{t('patient.form.noDocument')}</Label>
    </div>
  );
}

export interface PatientFormProps {
  form: UseFormReturn<PatientFormValues>;
  // Fired once, right when the checkbox mints a fresh `PROV-` — the caller (`PatientStep`, which
  // owns the confirmation dialog of SPEC FE10 §3.6) reacts to it. This component stays blind to
  // dialogs on purpose, so the same fields serve the inline alta and the edit modal alike (§3.1).
  onProvisionalDocumentGenerated?: (documentNumber: string) => void;
}

// The nine fields of SPEC FE10 §3.5 plus the "sin documento" checkbox, shared verbatim by the
// inline alta of `PatientStep` and the edit modal of `PatientFormDialog` (§3.1): a copy here would
// duplicate the validation, not just the markup. `healthSystemCode` is deliberately absent — it is
// never asked (§3.5).
export function PatientForm({ form, onProvisionalDocumentGenerated }: PatientFormProps) {
  const { t } = useTranslation();
  // Component-level state, not a form field (SPEC FE10 §3.4): the checkbox only decides whether
  // `documentNumber` is editable, it never travels in the request on its own.
  const [noDocument, setNoDocument] = useState(false);

  function handleNoDocumentChange(checked: boolean) {
    setNoDocument(checked);
    if (checked) {
      const provisional = generateProvisionalDocument();
      form.setValue('documentNumber', provisional, { shouldValidate: true });
      onProvisionalDocumentGenerated?.(provisional);
    } else {
      form.setValue('documentNumber', '', { shouldValidate: true });
    }
  }

  return (
    <>
      <FormField
        control={form.control}
        name="names"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.names')}</FormLabel>
            <FormControl>
              <Input {...field} maxLength={200} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="lastNames"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.lastNames')}</FormLabel>
            <FormControl>
              <Input {...field} maxLength={200} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="documentNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.documentNumber')}</FormLabel>
            <FormControl>
              <Input {...field} disabled={noDocument} maxLength={100} />
            </FormControl>
            <FormMessage />
            <NoDocumentCheckbox checked={noDocument} onCheckedChange={handleNoDocumentChange} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="passportNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.passportNumber')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} maxLength={100} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="birthDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.birthDate')}</FormLabel>
            <FormControl>
              <DateField
                value={field.value ?? null}
                onChange={(nextValue) => field.onChange(nextValue)}
                ariaLabel={t('patient.fields.birthDate')}
                allowFuture={false}
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
            <FormLabel>{t('patient.fields.email')}</FormLabel>
            <FormControl>
              <Input type="email" {...field} value={field.value ?? ''} maxLength={255} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="phoneNumber"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.phoneNumber')}</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} maxLength={50} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="sexItemId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.sexItemId')}</FormLabel>
            <FormControl>
              <CatalogSelect
                typeCode="sex"
                emit="id"
                value={field.value ?? null}
                onChange={field.onChange}
                ariaLabel={t('patient.fields.sexItemId')}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="residenceGeoLocationId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('patient.fields.residenceGeoLocationId')}</FormLabel>
            <FormControl>
              <GeoLocationPicker value={field.value ?? null} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

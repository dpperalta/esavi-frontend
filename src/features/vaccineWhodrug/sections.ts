import type { VaccineWhodrugFormValues } from './schemas';

export type VaccineWhodrugField = keyof VaccineWhodrugFormValues;

export interface VaccineWhodrugSection {
  key:
    | 'identification'
    | 'classification'
    | 'composition'
    | 'countryRegistration'
    | 'presentation'
    | 'notes';
  fields: VaccineWhodrugField[];
}

// SPEC FE25c §3.5: the 28 columns in six sections, shared by the detail page and the form page so
// both read the same order.
export const VACCINE_WHODRUG_SECTIONS: VaccineWhodrugSection[] = [
  {
    key: 'identification',
    fields: [
      'drugCode',
      'drugName',
      'externalId',
      'drugRecNo',
      'drugRecNoSeq',
      'medicinalProductId',
    ],
  },
  {
    key: 'classification',
    fields: ['atcs', 'icd11', 'icd11Term', 'abbreviation', 'isGeneric', 'isPreferred'],
  },
  {
    key: 'composition',
    fields: ['ingredient', 'ingredientTranslation', 'noDose', 'diluent'],
  },
  {
    key: 'countryRegistration',
    fields: [
      'language',
      'languageCode',
      'iso3Code',
      'countryMedicinalProductId',
      'maHolders',
      'maHoldersMedicinalProductId',
    ],
  },
  {
    key: 'presentation',
    fields: [
      'form',
      'formTranslations',
      'strength',
      'formMedicinalProductId',
      'strengthMedicinalProductId',
    ],
  },
  { key: 'notes', fields: ['notes'] },
];

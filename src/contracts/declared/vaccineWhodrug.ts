// NOT a mirror: the backend returns the flattened Sequelize instance directly (no response
// literal `contracts:sync` could copy), with `sysDetails` excluded before it leaves the service
// (`stripSysDetails`, esavi-backend/src/services/vaccineWhodrug.service.ts). Reconciled by hand
// against esavi-backend/src/models/vaccineWhodrug.model.ts if the backend changes.

// GET /api/whodrug-vaccines/:id (ESAVI-WHODRUG-003) — the full row `<WhodrugTreePicker>` resolves
// once a level's option carries a `vaccineWhodrugId` (`matchCount === 1`). `whoCode`/`vaccineCode`/
// `vaccineName` (SPEC FE12c §3.5) copy from `drugCode`/`drugCode`/`drugName` respectively — never
// this interface's own field names, which stay the dictionary's.
export interface VaccineWhodrugDetail {
  vaccineWhodrugId: string;
  externalId: number | null;
  drugCode: string | null;
  drugRecNo: string | null;
  drugRecNoSeq: string | null;
  drugName: string;
  language: string | null;
  medicinalProductId: string | null;
  atcs: string | null;
  icd11: string | null;
  icd11Term: string | null;
  abbreviation: string | null;
  ingredient: string | null;
  ingredientTranslation: string | null;
  languageCode: string | null;
  iso3Code: string | null;
  countryMedicinalProductId: string | null;
  maHolders: string | null;
  maHoldersMedicinalProductId: string | null;
  form: string | null;
  formTranslations: string | null;
  formMedicinalProductId: string | null;
  strength: string | null;
  strengthMedicinalProductId: string | null;
  noDose: string | null;
  diluent: string | null;
  isGeneric: boolean | null;
  isPreferred: boolean;
  notes: string | null;
  metadata: object | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

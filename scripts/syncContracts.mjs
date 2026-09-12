// Copies types from ../esavi-backend/src/types to src/contracts/, as-is — no curating exports,
// no infrastructure (ARCHITECTURE.md §10). A backend change shows up whole in the diff.
//
// src/contracts/declared/ is NEVER touched here: those are shapes the backend builds as
// literals (no `interface` to copy, see CONVENTIONS.md §9 and SPEC FE01 §3.3) and are
// reconciled by hand.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC_DIR = path.resolve(__dirname, '../../esavi-backend/src');
const BACKEND_TYPES_DIR = path.join(BACKEND_SRC_DIR, 'types');
const BACKEND_CONSTANTS_DIR = path.join(BACKEND_SRC_DIR, 'constants');
const CONTRACTS_DIR = path.resolve(__dirname, '../src/contracts');

// Which backend file produces which frontend contract. Grows as each spec declares, in its
// §3.3, which types it consumes — never synced ahead of time for something nobody uses yet.
const SYNC_MAP = [
  { source: 'user/user.types.ts', dest: 'user.ts' },
  { source: 'common/audit.types.ts', dest: 'common.ts' },
  { source: 'catalog/catalogType.types.ts', dest: 'catalogType.ts' },
  { source: 'catalog/catalogItem.types.ts', dest: 'catalogItem.ts' },
  { source: 'geography/geoLevelType.types.ts', dest: 'geoLevelType.ts' },
  { source: 'geography/geoLocation.types.ts', dest: 'geoLocation.ts' },
  { source: 'geography/geoImport.types.ts', dest: 'geoImport.ts' },
  { source: 'healthFacility/healthFacility.types.ts', dest: 'healthFacility.ts' },
  { source: 'caseWorkflow/caseWorkflow.types.ts', dest: 'caseWorkflow.ts' },
  { source: 'esaviCase/esaviCase.types.ts', dest: 'esaviCase.ts' },
  { source: 'patient/patient.types.ts', dest: 'patient.ts' },
  { source: 'notifier/notifier.types.ts', dest: 'notifier.ts' },
  { source: 'classification/classification.types.ts', dest: 'classification.ts' },
  { source: 'notification/notification.types.ts', dest: 'notification.ts' },
  { source: 'severeNotification/severeNotification.types.ts', dest: 'severeNotification.ts' },
  {
    source: 'nonSevereNotification/nonSevereNotification.types.ts',
    dest: 'nonSevereNotification.ts',
  },
  { source: 'notificationEvent/notificationEvent.types.ts', dest: 'notificationEvent.ts' },
  {
    source: 'notificationMedication/notificationMedication.types.ts',
    dest: 'notificationMedication.ts',
  },
  { source: 'notificationVaccine/notificationVaccine.types.ts', dest: 'notificationVaccine.ts' },
  { source: 'notificationDiluent/notificationDiluent.types.ts', dest: 'notificationDiluent.ts' },
  { source: 'vaccineWhodrug/vaccineWhodrug.types.ts', dest: 'vaccineWhodrug.ts' },
  {
    source: 'notificationPregnancy/notificationPregnancy.types.ts',
    dest: 'notificationPregnancy.ts',
  },
  {
    source: 'notificationPregnancyComplication/notificationPregnancyComplication.types.ts',
    dest: 'notificationPregnancyComplication.ts',
  },
  {
    source: 'notificationMedicalHistory/notificationMedicalHistory.types.ts',
    dest: 'notificationMedicalHistory.ts',
  },
  { source: 'investigation/investigation.types.ts', dest: 'investigation.ts' },
  { source: 'investigation/investigationSource.types.ts', dest: 'investigationSource.ts' },
  {
    source: 'investigation/investigationTeamMember.types.ts',
    dest: 'investigationTeamMember.ts',
  },
  { source: 'investigation/investigationAutopsy.types.ts', dest: 'investigationAutopsy.ts' },
];

// notification.types.ts and severeNotification.types.ts are the first mirrored files that import
// a type from outside src/types/ — AnswerOption and NotificationType both live in
// src/constants/*.constants.ts, not next to the interface that uses them. Copying those `import`
// lines verbatim would point at a path this side of the two repos does not have. Each entry
// below rewrites one such import once the copy lands (SPEC FE12a §4, paso 3).
// `from` matches with or without the trailing `\r` — esavi-backend's source files are CRLF.
const IMPORT_REWRITES = [
  {
    // AnswerOption is shared by seven tables of the schema (SPEC FE12a §3.3), so it gets one
    // canonical home in common.ts (see EXTRA_ENUM_APPENDS) and every mirrored file imports it
    // from there instead of from the backend's constants module.
    from: /import \{ AnswerOption \} from '\.\.\/\.\.\/constants\/enums\.constants';\r?\n/,
    to: "import type { AnswerOption } from './common';\n",
  },
  {
    // NotificationType has exactly one consumer, notification.ts itself, so it is inlined there
    // (EXTRA_ENUM_APPENDS) instead of imported — no `import` line survives for it.
    from: /import \{ NotificationType \} from '\.\.\/\.\.\/constants\/notification\.constants';\r?\n/,
    to: '',
  },
  {
    // TermSource lives in the same shared constants file as AnswerOption (SPEC FE12b §4 paso 2),
    // so it gets the same treatment: one canonical home in common.ts, imported from there instead
    // of from the backend's constants module.
    from: /import \{ TermSource \} from '\.\.\/\.\.\/constants\/enums\.constants';\r?\n/,
    to: "import type { TermSource } from './common';\n",
  },
];

// Enums declared in esavi-backend/src/constants/, not in src/types/, so `SYNC_MAP` cannot mirror
// them file-for-file the way it mirrors an interface. Each entry pulls one
// `export const X_S = [...] as const` + its paired `export type Y = (typeof X_S)[number]` out of
// a constants file and appends it, verbatim, to an already-synced contract — never introducing a
// `src/contracts/enums.ts` that nothing besides these two would import.
const EXTRA_ENUM_APPENDS = [
  {
    source: 'enums.constants.ts',
    typeName: 'AnswerOption',
    dest: 'common.ts',
    note: 'shared by seven tables of the schema — SPEC FE12a §3.3',
  },
  {
    source: 'notification.constants.ts',
    typeName: 'NotificationType',
    dest: 'notification.ts',
    note: 'the only consumer is this file — inlined instead of imported — SPEC FE12a §4 paso 3',
  },
  {
    source: 'enums.constants.ts',
    typeName: 'TermSource',
    dest: 'common.ts',
    note: 'shared home for enums declared alongside AnswerOption — SPEC FE12b §4 paso 2',
  },
];

function buildHeader(sourceRelPath) {
  return (
    '// Generated by `npm run contracts:sync` — DO NOT EDIT BY HAND.\n' +
    `// Mirror of esavi-backend/src/types/${sourceRelPath}\n` +
    '// Anything hand-written goes in src/contracts/declared/ (CONVENTIONS.md §3, §9).\n\n'
  );
}

// Pulls `export const CONST_NAME = [...] as const;` + `export type TypeName =
// (typeof CONST_NAME)[number];` out of a backend constants file, wherever the two lines sit
// relative to each other, and returns them as one block ready to append.
function extractEnumPair(constantsContent, typeName, sourceLabel) {
  const typeMatch = constantsContent.match(
    new RegExp(`export type ${typeName} = \\(typeof (\\w+)\\)\\[number\\];`),
  );
  if (!typeMatch) {
    console.error(`contracts:sync — no encuentro "export type ${typeName}" en ${sourceLabel}.`);
    process.exit(1);
  }
  const constName = typeMatch[1];
  const constMatch = constantsContent.match(
    new RegExp(`export const ${constName} = (\\[[^\\]]*\\]) as const;`),
  );
  if (!constMatch) {
    console.error(`contracts:sync — no encuentro "export const ${constName}" en ${sourceLabel}.`);
    process.exit(1);
  }
  return (
    `export const ${constName} = ${constMatch[1]} as const;\n\n` +
    `export type ${typeName} = (typeof ${constName})[number];\n`
  );
}

if (!existsSync(BACKEND_TYPES_DIR)) {
  console.error(`contracts:sync — no encuentro esavi-backend/src/types en ${BACKEND_TYPES_DIR}.`);
  console.error(
    'esavi-backend debe estar clonado como carpeta hermana de esavi-frontend (CLAUDE.md).',
  );
  process.exit(1);
}

const contents = new Map();
let synced = 0;

for (const { source, dest } of SYNC_MAP) {
  const sourcePath = path.join(BACKEND_TYPES_DIR, source);
  if (!existsSync(sourcePath)) {
    console.error(`contracts:sync — no existe src/types/${source} en esavi-backend.`);
    process.exit(1);
  }
  let content = readFileSync(sourcePath, 'utf-8');
  for (const rewrite of IMPORT_REWRITES) {
    content = content.replace(rewrite.from, rewrite.to);
  }
  contents.set(dest, buildHeader(source) + content);
  synced++;
}

for (const { source, typeName, dest, note } of EXTRA_ENUM_APPENDS) {
  const sourcePath = path.join(BACKEND_CONSTANTS_DIR, source);
  if (!existsSync(sourcePath)) {
    console.error(`contracts:sync — no existe src/constants/${source} en esavi-backend.`);
    process.exit(1);
  }
  const existing = contents.get(dest);
  if (existing === undefined) {
    console.error(`contracts:sync — EXTRA_ENUM_APPENDS apunta a "${dest}", que no está en SYNC_MAP.`);
    process.exit(1);
  }
  const constantsContent = readFileSync(sourcePath, 'utf-8');
  const block = extractEnumPair(constantsContent, typeName, `src/constants/${source}`);
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  contents.set(
    dest,
    `${existing}${separator}// Mirrors esavi-backend/src/constants/${source} (${note}).\n${block}`,
  );
}

for (const [dest, content] of contents) {
  writeFileSync(path.join(CONTRACTS_DIR, dest), content);
  console.log(`✔ ${dest}`);
}

console.log(`\ncontracts:sync — ${synced} archivo(s) sincronizado(s).`);
process.exit(0);

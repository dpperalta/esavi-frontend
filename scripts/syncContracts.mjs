// Copia tipos desde ../esavi-backend/src/types a src/contracts/, tal cual — sin curar exports,
// sin infraestructura (ARCHITECTURE.md §10). Un cambio en el backend se ve entero en el diff.
//
// src/contracts/declared/ NUNCA se toca aquí: son formas que el backend construye como
// literales (sin `interface` que copiar, ver CONVENTIONS.md §9 y §3.3 de SPEC FE01) y se
// reconcilian a mano.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_TYPES_DIR = path.resolve(__dirname, '../../esavi-backend/src/types');
const CONTRACTS_DIR = path.resolve(__dirname, '../src/contracts');

// Qué archivo del backend produce qué contrato del frontend. Se amplía a medida que cada spec
// declara, en su §3.3, qué tipos consume — nunca se sincroniza por adelantado lo que nadie usa.
const SYNC_MAP = [
  { source: 'user/user.types.ts', dest: 'user.ts' },
  { source: 'common/audit.types.ts', dest: 'common.ts' },
];

function buildHeader(sourceRelPath) {
  return (
    '// Generado por `npm run contracts:sync` — NO EDITAR A MANO.\n' +
    `// Espejo de esavi-backend/src/types/${sourceRelPath}\n` +
    '// Lo escrito a mano va en src/contracts/declared/ (CONVENTIONS.md §3, §9).\n\n'
  );
}

if (!existsSync(BACKEND_TYPES_DIR)) {
  console.error(`contracts:sync — no encuentro esavi-backend/src/types en ${BACKEND_TYPES_DIR}.`);
  console.error(
    'esavi-backend debe estar clonado como carpeta hermana de esavi-frontend (CLAUDE.md).',
  );
  process.exit(1);
}

let synced = 0;
for (const { source, dest } of SYNC_MAP) {
  const sourcePath = path.join(BACKEND_TYPES_DIR, source);
  if (!existsSync(sourcePath)) {
    console.error(`contracts:sync — no existe src/types/${source} en esavi-backend.`);
    process.exit(1);
  }
  const content = readFileSync(sourcePath, 'utf-8');
  writeFileSync(path.join(CONTRACTS_DIR, dest), buildHeader(source) + content);
  console.log(`✔ ${dest} ← esavi-backend/src/types/${source}`);
  synced++;
}

console.log(`\ncontracts:sync — ${synced} archivo(s) sincronizado(s).`);
process.exit(0);

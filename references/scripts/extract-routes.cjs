const fs = require('fs');
// ROUTE_RULES moved out of the role test into its own setup module; the older path is kept
// as a fallback so the script still works against an earlier checkout of the backend.
const SOURCES = ['tests/setup/routeRules.ts', 'tests/auth/roles.test.ts'];
const sourcePath = SOURCES.find((p) => fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes('ROUTE_RULES'));
if (!sourcePath) {
  console.error('ROUTE_RULES not found in any of:', SOURCES.join(', '));
  process.exit(1);
}
const src = fs.readFileSync(sourcePath, 'utf8');
const start = src.indexOf('const ROUTE_RULES');
const end = src.indexOf('\n];', start);
const block = src.slice(start, end);
const re = /\{\s*method:\s*'(\w+)',\s*path:\s*[`']([^`']+)[`'],\s*minRole:\s*'(\w+)',\s*code:\s*'([^']+)'/g;
const rows = [];
let m;
while ((m = re.exec(block))) {
  rows.push({ method: m[1].toUpperCase(), path: m[2].replace(/\$\{\s*UUID\s*\}/g, ':id'), minRole: m[3], code: m[4] });
}
const groups = new Map();
for (const r of rows) {
  const g = (r.code.match(/^ESAVI-([A-Z0-9]+)-/) || [null, 'OTROS'])[1];
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
}
let out = '';
for (const [g, rs] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  out += `\n### ${g}\n\n| Método | Ruta | Rol mínimo | Código |\n|---|---|---|---|\n`;
  for (const r of rs) out += `| \`${r.method}\` | \`${r.path}\` | ${r.minRole} | \`${r.code}\` |\n`;
}
fs.writeFileSync(process.argv[2], out);
console.log('fuente:', sourcePath, '| rutas:', rows.length, '| grupos:', groups.size);

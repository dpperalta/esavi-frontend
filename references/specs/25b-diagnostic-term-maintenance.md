# SPEC FE25b — Mantenimiento e importación de términos diagnósticos

> **Estado:** Aprobado
> **Depende de:** SPEC FE25a (patrón de listado + diálogo + auditoría de catálogos clínicos), SPEC FE07 (flujo simular → importar), SPEC FE02 (fábrica de recursos), SPEC F15 del backend (CRUD de `diagnosticTerm` y resolución implícita `006`), SPEC F17 del backend (importación `.asc`)
> **Fecha:** 2026-09-25
> **Objetivo:** Dar al maestro de términos diagnósticos una pantalla en `/diagnostic-terms` para buscar, filtrar, mantener y revisar los términos, y otra en `/diagnostic-terms/import` para cargar el diccionario MedDRA desde un `.asc`.

---

## 1. Por qué existe este spec

Es el consumo de `ESAVI-DIAGTERM-001`…`005B` (SPEC F15 del backend) y de `ESAVI-DIAGTERM-007` (SPEC F17). Es el segundo de los cuatro specs de catálogos clínicos (FE25a–d).

**A — El maestro crece solo y nadie lo ve.** Cada vez que se notifica un evento, una complicación del embarazo o un diagnóstico de investigación sin término codificado, el backend resuelve el término con el `006`. Si el par `(source, code)` no existe, lo crea con `source: 'LOCAL'` y `metadata.reviewStatus: 'PENDING'`. En el cliente no hay ninguna pantalla que liste `diagnosticTerm`: los satélites (`investigationDiagnostic`, `notificationEvent`…) solo lo reciben embebido. Los términos pendientes se acumulan sin que ningún ADMIN pueda encontrarlos. SPEC F15 §6 lo dice: sin una vía para que `PENDING` llegue a `APPROVED`, «la cola de revisión solo crece y el marcador es decorativo».

**B — El diccionario licenciado no se puede cargar desde la aplicación.** El `007` existe desde SPEC F17, pero sin cliente. Sin él, el catálogo solo tiene los términos `LOCAL` autogenerados, y la codificación MedDRA de los eventos no tiene contra qué resolver.

**C — El menú promete una pantalla que no existe.** `navigation.ts` declara `nav.items.diagnosticTerm → /diagnostic-terms` con `disabled: true`.

**D — Dos asimetrías del backend que la pantalla tiene que absorber por diseño:**
- El `003` responde 404 a ADMIN sobre una fila inactiva, aunque el `002B` se la liste. Es el mismo hallazgo C de SPEC FE25a.
- El filtro `reviewStatus` solo lo lee el `002B`. En el `002A` se ignora en silencio: un ADMIN que filtrara por «Pendiente» sobre el listado público vería **todos** los términos activos, sin aviso de que el filtro no se aplicó.

---

## 2. Alcance

**Dentro:**

- **La pantalla `/diagnostic-terms`** con `DiagnosticTermListPage.tsx`, que tiene en `searchParams`:
  - la búsqueda `q` (`name`/`code`);
  - los filtros `source` (select de cuatro valores) y `termGroup` (texto, coincidencia exacta);
  - la paginación `page`;
  - el toggle `includeInactive`, solo para ADMIN.
- **Filtro «Estado de revisión»** (`reviewStatus`: `PENDING` o `APPROVED`), solo para ADMIN. Como solo lo lee el `002B`, elegirlo pone además `includeInactive=true` en la URL, y el toggle se ve activado.
- **Badge «Pendiente»** en las filas con `metadata.reviewStatus === 'PENDING'`.
- **`DiagnosticTermFormDialog.tsx`**: un solo diálogo para crear (`001`) y editar (`004`).
  - `source` se elige al crear y se muestra de solo lectura al editar.
  - `code`, `name` y `termGroup` se pueden escribir.
  - Al editar hay un select `reviewStatus`. Arranca en «Sin marcar» si la fila no tiene marca, y en ese caso la clave no se envía.
- **`DiagnosticTermAuditSheet.tsx`** con `<AuditTrail>`, solo para SUPERADMIN.
- **Acciones de fila:** la regla de SPEC FE25a §3.1. «Editar» para ADMIN en filas activas y para SUPERADMIN en cualquiera. «Auditoría» y «Reactivar» para SUPERADMIN. «Dar de baja» para ADMIN.
- **La página `/diagnostic-terms/import`** con `DiagnosticTermImportPage.tsx`, bajo `<RequireRole level={SUPERADMIN}>`. Se llega desde un botón «Importar diccionario» en la cabecera del listado, visible solo para SUPERADMIN, y no tiene entrada de menú.
  - A la vista: fichero `.asc`, `dictionaryVersion` y `encoding`.
  - En «Opciones avanzadas», ya rellenos: `source` (`MEDDRA`) y `termGroup` (`LLT`).
  - Flujo «Simular» → informe → «Importar» con confirmación → informe definitivo.
  - Aviso de no cerrar la pestaña mientras corre la petición.
- **`DiagnosticTermImportReport.tsx`**, un componente puro local a la feature. Pinta los seis contadores y hasta 20 líneas rechazadas con `line`, `reason` y `raw`.
- **`api.ts`** con `diagnosticTermResource` y `importApi.ts` con la mutación del `007`.
- **`schemas.ts`**, con los schemas del formulario y del formulario de importación.
- **Contratos:**
  - La entrada `diagnosticTerm/diagnosticTerm.types.ts` en `SYNC_MAP`, que trae los inputs, los filtros y el informe.
  - `contracts/declared/diagnosticTerm.ts` con la forma de la fila.
- **Ruta y menú:** `/diagnostic-terms` bajo `USER` y `/diagnostic-terms/import` bajo `SUPERADMIN`. En `navigation.ts`, `nav.items.diagnosticTerm` deja de estar `disabled`.
- **El bloque i18n `diagnosticTerm.*`** en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **Vacunas WHODrug (SPEC FE25c) y productos WHODrug (SPEC FE25d).**
- **La gobernanza del catálogo:** aprobación en lote, fusión de términos duplicados, promoción de `LOCAL` a `MEDDRA` y notificación de pendientes. Son el spec de gobernanza que SPEC F15 dejó pendiente, y el backend todavía no tiene esas rutas.
- **Un `<ImportReport>` compartido en `shared/`.** Se decide en SPEC FE25c, cuando haya dos usos reales.
- **La jerarquía MedDRA** (`pt`, `hlt`, `soc` como árbol). La importación de otros niveles se hace cambiando `termGroup`, como catálogos planos.
- **Importación asíncrona con barra de progreso real.** El `007` es síncrono y no expone progreso.
- **Deshacer una importación.** El backend no tiene esa operación.
- **Búsqueda parcial por `termGroup`.** El backend solo filtra por igualdad.
- **Página de detalle del término.**

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/diagnostic-terms` | `features/diagnosticTerm/DiagnosticTermListPage.tsx` | `<RequireRole level={USER}>` |
| Importación | `/diagnostic-terms/import` | `features/diagnosticTerm/DiagnosticTermImportPage.tsx` | `<RequireRole level={SUPERADMIN}>` |
| Crear / editar | (diálogo sobre el listado) | `features/diagnosticTerm/DiagnosticTermFormDialog.tsx` | acción visible con `useCan(ADMIN)` |
| Auditoría | (panel lateral sobre el listado) | `features/diagnosticTerm/DiagnosticTermAuditSheet.tsx` | acción visible con `useCan(SUPERADMIN)` |

**Menú.** En `nav.groups.clinicalCatalogs`, la entrada `nav.items.diagnosticTerm` pierde `disabled: true`. Conserva el icono `Stethoscope`, la ruta `/diagnostic-terms` y `minLevel: USER`, que es el rol real de `ESAVI-DIAGTERM-002A`. La importación **no** tiene `NavItem`.

**Orden en el router.** `/diagnostic-terms/import` se declara antes que `/diagnostic-terms`, con el mismo criterio que SPEC FE07 §4 paso 8.

**Cabecera del listado:**
- «Crear término» con `useCan(ADMIN)`.
- «Importar diccionario» con `useCan(SUPERADMIN)`, que navega a `/diagnostic-terms/import`.

**Acciones de fila.** Van en `DiagnosticTermRowActions` y siguen la misma regla que SPEC FE25a §3.1:

| Acción | Visible si | Ruta |
|---|---|---|
| Editar | `useCan(ADMIN)` y fila activa, **o** `useCan(SUPERADMIN)` | `003` + `004` |
| Ver auditoría | `useCan(SUPERADMIN)` | `003` |
| Dar de baja | `useCan(ADMIN)` y fila activa | `005A` |
| Reactivar | `useCan(SUPERADMIN)` y fila inactiva | `005B` |

**Página de importación.** Tiene un enlace «Volver a términos diagnósticos». Si la sesión no es SUPERADMIN, el guard redirige sin pantalla en blanco.

### 3.2 Endpoints consumidos

```
GET    /api/diagnostic-terms                ESAVI-DIAGTERM-002A  USER        listado de activos
GET    /api/diagnostic-terms/admin          ESAVI-DIAGTERM-002B  ADMIN       con inactivos; único que filtra reviewStatus
GET    /api/diagnostic-terms/:id            ESAVI-DIAGTERM-003   USER        diálogo de edición y auditoría
POST   /api/diagnostic-terms                ESAVI-DIAGTERM-001   ADMIN       crear
PUT    /api/diagnostic-terms/:id            ESAVI-DIAGTERM-004   ADMIN       actualizar (incluye reviewStatus)
DELETE /api/diagnostic-terms/:id            ESAVI-DIAGTERM-005A  ADMIN       dar de baja
PATCH  /api/diagnostic-terms/activate/:id   ESAVI-DIAGTERM-005B  SUPERADMIN  reactivar
POST   /api/diagnostic-terms/import         ESAVI-DIAGTERM-007   SUPERADMIN  importación .asc (multipart)
```

No se consumen `005C`, porque la tabla está en `preventPhysicalDelete`, ni `006`, que es un servicio interno sin ruta HTTP.

**Parámetros del listado.**

| Parámetro | Listados | Regla |
|---|---|---|
| `limit`, `offset` | ambos | paginación |
| `name`, `code` | ambos | mínimo 2 caracteres; `Op.or` entre los dos (`diagnosticTerm.service.ts:33`) |
| `source` | ambos | `MEDDRA`, `WHODRUG`, `LOCAL` u `OTHER` |
| `termGroup` | ambos | igualdad exacta sobre el valor con `trim` |
| `reviewStatus` | **solo `002B`** | igualdad sobre `metadata.reviewStatus`; el `002A` lo ignora en silencio |

No se usa `search`. El orden es `name ASC`, fijo.

**Cuerpo del `007`** (`multipart/form-data`):

| Campo | Regla |
|---|---|
| `file` | `.asc`, máx. 20 MB |
| `source` | `TERM_SOURCES`; por defecto `MEDDRA` |
| `termGroup` | por defecto `LLT` |
| `dictionaryVersion` | máx. 50 |
| `encoding` | `utf8` o `latin1` |
| `dryRun` | `'true'` o `'false'`, como texto de campo de formulario, igual que en `geoLocation/importApi.ts` |

### 3.3 Tipos del contrato

- **`contracts/diagnosticTerm.ts`**, con `npm run contracts:sync` y una entrada nueva en `SYNC_MAP` que lee `diagnosticTerm/diagnosticTerm.types.ts`. Trae:
  - `CreateDiagnosticTermInput` (`source?`, `code`, `name`, `termGroup?`, `reviewStatus?`, `isActive?`);
  - `DiagnosticTermListFilters` e `ImportDiagnosticTermsInput`;
  - `DiagnosticTermImportReport` y `RejectedDiagnosticTermRow`.

  `ResolveDiagnosticTermInput` y `ParsedDiagnosticTermRow` también llegan, pero no se usan.
- **`contracts/declared/diagnosticTerm.ts`**, la forma de la fila de `002A`, `002B` y `003`: `diagnosticTermId`, `source: TermSource`, `code: string | null`, `name`, `termGroup: string | null`, `metadata: { autoCreated?: boolean; createdFrom?: string; reviewStatus?: string; dictionaryVersion?: string } | null`, `isActive`, `createdAt`, `updatedAt`, `deletedAt` y `appDetails`. Se reconcilia contra `esavi-backend/src/models/diagnosticTerm.model.ts`, siguiendo el precedente de `contracts/declared/diluent.ts`.
- **El update es `Partial<CreateDiagnosticTermInput>`.** El formulario nunca envía `source` en el `PUT`.

### 3.4 Contrato de estado

**Listado:**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Búsqueda | URL | `searchParams.q` | Con debounce. Viaja como `name=q&code=q`. Con menos de 2 caracteres no se envía. Al cambiar, se borra `page`. |
| Fuente | URL | `searchParams.source` | Uno de los cuatro. Si falta, no se filtra. |
| Grupo de término | URL | `searchParams.termGroup` | Texto exacto, con debounce. |
| Estado de revisión | URL | `searchParams.reviewStatus` | `PENDING` o `APPROVED`, solo con ADMIN. **Al ponerlo, se pone también `includeInactive=true`. Al quitar el toggle, se quita también `reviewStatus`.** Así, un `reviewStatus` en la URL implica siempre `002B`. |
| Página | URL | `searchParams.page` | Si falta, vale 1. Se borra al cambiar cualquier filtro. |
| Toggle «mostrar inactivos» | URL | `searchParams.includeInactive=true` | Solo con ADMIN. Decide entre `002A` y `002B`. |
| Tamaño de página | Zustand | `preferences.pageSize` | Preferencia global que ya existe. |
| Listado | TanStack Query | `['diagnosticTerm', 'list', { limit, offset, includeInactive, filters }]` | `staleTime` de **5 min**; ver la nota de abajo. |
| Fila del diálogo y de la auditoría | TanStack Query | `['diagnosticTerm', 'detail', id]` | |
| Valores del formulario | React Hook Form | `useForm` | `reset(detail)` al llegar el `003`. `reviewStatus` sale de `detail.metadata?.reviewStatus`. |
| Diálogo, id, confirmaciones y búferes de tecleo | Componente | `useState` | Efímeros. |

**Importación:**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Fichero elegido | Componente | `useState<File \| null>` | Un `File` no se serializa: no puede ir a la URL ni a un store. |
| `dictionaryVersion`, `encoding`, `source`, `termGroup` | React Hook Form | `useForm` | Valores por defecto `utf8`, `MEDDRA` y `LLT`. |
| «Opciones avanzadas» abierto | Componente | `useState` | Efímero. |
| Informe (simulado o definitivo) | TanStack Query | `useMutation().data` | Nunca se copia a `useState`. Se pinta mientras la mutación lo conserve. |
| Petición en curso | TanStack Query | `useMutation().isPending` | Deshabilita los botones y muestra el aviso de no cerrar la pestaña. |
| Confirmación abierta | Componente | `useState` | Efímero. |

**Invalidación:**
- Tras `001`, `004`, `005A` y `005B`, la fábrica invalida `['diagnosticTerm']`.
- Tras el `007` con `dryRun: false`, `importApi.ts` invalida `['diagnosticTerm']`.
- Con `dryRun: true` no se invalida nada.

**Nota sobre el `staleTime` de 5 min, que es una excepción razonada.** Los catálogos usan 30 min (`CONVENTIONS.md` §6.3) porque solo cambian cuando alguien los mantiene. Este maestro, en cambio, **crece desde otras pantallas**: el `006` crea términos al guardar notificaciones e investigaciones, y esas mutaciones no invalidan `['diagnosticTerm']`. Con 30 min, un ADMIN que revisa la cola de pendientes no vería los términos creados en la última media hora. Con 5 min el retraso queda acotado, sin acoplar las features de notificación e investigación a esta clave.

### 3.5 Formularios y validación

**Formulario del término**: `features/diagnosticTerm/schemas.ts`, con `createDiagnosticTermSchema` y `updateDiagnosticTermSchema`.

| Campo | Control | Crear | Editar | Regla |
|---|---|---|---|---|
| `source` | `<Select>` de `TERM_SOURCES` | sí; por defecto `LOCAL` | solo lectura, no se envía | El backend lo ignora en el `PUT`. |
| `code` | `<Input>` | obligatorio | obligatorio | `trim`, no vacío, máx. 100. El backend lo guarda en `CONSTANT_CASE`. |
| `name` | `<Input>` | obligatorio | obligatorio | `trim`, no vacío, **máx. 500**. Se guarda literal. |
| `termGroup` | `<Input>` | opcional | opcional, anulable | Máx. 250. Vacío se envía como `null` en el `PUT` y se omite en el `POST`. |
| `reviewStatus` | `<Select>` `PENDING` / `APPROVED` | no aparece | opcional | Arranca con `metadata?.reviewStatus`. Si la fila no tiene marca, muestra «Sin marcar» y la clave **no se envía**. Una vez marcada, «Sin marcar» ya no se ofrece. |

- **`isActive` no está en el formulario.** El ciclo de vida va por `005A`/`005B`.
- **Normalización visible.** Hay una ayuda fija bajo `code`, como en SPEC FE25a.
- **En el `PUT` va el objeto completo, menos `source`.** Reenviarlo no daría error, pero enviar lo que no se puede cambiar confunde al leer el payload.
- **Un término autogenerado se reconoce** por `metadata.autoCreated`. El diálogo lo indica con una línea informativa («Creado automáticamente desde una notificación»), sin bloquear nada.

**Errores del servidor, formulario del término:**

| `code` | Destino |
|---|---|
| `DIAGTERM_001_CODE_EXISTS`, `DIAGTERM_004_CODE_EXISTS` | Campo `code`. El texto aclara que el par fuente + código puede estar ocupado por un término dado de baja. |
| `DIAGTERM_003_NOT_FOUND`, `DIAGTERM_004_NOT_FOUND` | Toast, y el diálogo se cierra. |
| `DIAGTERM_005A_NOT_FOUND`, `DIAGTERM_005B_NOT_FOUND`, `DIAGTERM_005A_ALREADY_INACTIVE`, `DIAGTERM_005B_ALREADY_ACTIVE` | Toast. |
| Cualquier otro, incluido `UNKNOWN_ERROR` | Toast genérico por `code`. Nunca se muestra `errors`. |

**Formulario de importación**: `importDiagnosticTermsSchema`.

| Campo | Control | Regla |
|---|---|---|
| `file` | Selector de fichero, `accept=".asc"` | Obligatorio. Máx. 20 MB, comprobado en el cliente **antes** de enviar, para no subir un fichero que el servidor va a rechazar. |
| `dictionaryVersion` | `<Input>` | Opcional, máx. 50. Ayuda: «Ejemplo: 27.1». |
| `encoding` | `<Select>` `utf8` / `latin1` | Por defecto `utf8`. Ayuda: «Si los acentos salen mal en la simulación, prueba latin1». |
| `source` (avanzadas) | `<Select>` de `TERM_SOURCES` | Por defecto `MEDDRA`. |
| `termGroup` (avanzadas) | `<Input>` | Por defecto `LLT`, máx. 250. |

- «Simular» envía `dryRun=true`. «Importar» abre la confirmación y envía `dryRun=false`. Los dos envían **los mismos valores del formulario**.
- Si el usuario cambia el fichero o cualquier campo después de simular, el informe simulado se descarta con `mutation.reset()`. Así ningún informe describe un fichero distinto del que se va a importar.

**Errores del servidor, importación:**

| `code` | Destino |
|---|---|
| `DIAGTERM_007_FILE_REQUIRED` | Campo `file` |
| `DIAGTERM_007_FILE_TOO_LARGE` (413) | Campo `file` |
| `DIAGTERM_007_FILE_INVALID` | Campo `file`: «No se encontró ninguna línea válida; comprueba que es un `.asc` de MedDRA». |
| `DIAGTERM_007_IMPORT_FAILED` | Alert en la página: «La importación falló y se revirtió el lote en curso; puede que otra importación esté corriendo». |
| Cualquier otro | Toast genérico por `code`. |

### 3.6 Estados de la pantalla

**Listado:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de `<ResourceTable>` | — |
| Vacío (sin datos) | Texto. Con SUPERADMIN, botón «Importar diccionario»; con ADMIN, «Crear término». | `diagnosticTerm.list.empty` |
| Vacío (con filtros) | Texto y «Limpiar filtros», que borra `q`, `source`, `termGroup`, `reviewStatus` y `page`, pero **no** `includeInactive` | `diagnosticTerm.list.emptyFiltered`, `diagnosticTerm.list.clearFilters` |
| Error | Mensaje por `code` y «Reintentar» | `common.table.retry` |
| Sin permiso | No se llega. Las acciones que el rol no permite no se renderizan. | — |

**Importación:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Inicial | Formulario; «Simular» e «Importar» deshabilitados sin fichero | — |
| En curso | Botones deshabilitados, indicador indeterminado y aviso «No cierres esta pestaña; un diccionario completo puede tardar varios minutos» | `diagnosticTerm.import.running` |
| Informe simulado | `DiagnosticTermImportReport` con la marca «Simulación: no se escribió nada» | `diagnosticTerm.import.report.dryRunNotice` |
| Informe definitivo | `DiagnosticTermImportReport` sin la marca, y un enlace «Ver términos» | `diagnosticTerm.import.report.viewTerms` |
| Error | Según la tabla de §3.5 | — |
| Sin permiso | El guard SUPERADMIN redirige; el botón de acceso no se renderiza | — |

**El informe.** Muestra los seis contadores (`read`, `inserted`, `updated`, `unchanged`, `invalid`, `duplicated`). Si `invalid + duplicated > errors.length`, añade la nota «Se muestran los primeros 20 rechazos». La tabla de rechazos tiene tres columnas: `line`, `reason` (traducido por clave, uno por cada valor de `RejectedDiagnosticTermRow.reason`) y `raw` en monoespaciada y truncado.

### 3.7 Responsividad y accesibilidad

- **Tarjetas por debajo de `md`:**
  - `primary` → `name`;
  - `secondary` → `code`;
  - `meta` → `source`, más el badge «Pendiente» si corresponde.

  Las filas inactivas llevan `isRowInactive`.
- **Columnas en escritorio:** `name`, `code`, `source`, `termGroup`, revisión (badge), estado y acciones.
- **Filtros en móvil.** Colapsan en un `Sheet` con un contador de filtros activos. La búsqueda queda fuera del `Sheet`, a todo el ancho.
- **Importación en móvil.** Los formularios se apilan. La tabla de rechazos del informe hace scroll horizontal **dentro de su contenedor**, nunca el body.
- **Objetivos táctiles de 44px y `dvh`.**
- **Anuncio de estado.** El aviso de «en curso» está en una región `aria-live="polite"`, y el informe recibe el foco al llegar.

### 3.8 Claves i18n nuevas

Van en un bloque nuevo `diagnosticTerm`, en los tres idiomas.

| Grupo | Claves |
|---|---|
| `list.*` | `title`, `empty`, `emptyFiltered`, `clearFilters`, `create`, `import` |
| `filters.*` | `search`, `searchHint`, `source`, `sourceAll`, `termGroup`, `termGroupHint`, `reviewStatus`, `reviewStatusAll`, `reviewStatusForcesInactive` |
| `form.*` | `createTitle`, `editTitle`, `codeHint`, `sourceReadOnly`, `autoCreatedNotice`, `reviewStatusUnset` |
| `fields.*` | `source`, `code`, `name`, `termGroup`, `reviewStatus`, `isActive` |
| `sources.*` | `MEDDRA`, `WHODRUG`, `LOCAL`, `OTHER` |
| `reviewStatuses.*` | `PENDING`, `APPROVED` |
| `status.*` | `active`, `inactive`, `pending` |
| `actions.menu` | `aria-label` del menú de fila |
| `import.*` | `title`, `back`, `file`, `fileHint`, `dictionaryVersion`, `dictionaryVersionHint`, `encoding`, `encodingHint`, `advanced`, `simulate`, `run`, `confirmTitle`, `confirmBody`, `confirmAction`, `running` |
| `import.report.*` | `title`, `dryRunNotice`, `viewTerms`, `read`, `inserted`, `updated`, `unchanged`, `invalid`, `duplicated`, `truncatedNotice`, `columns.line`, `columns.reason`, `columns.raw` |
| `import.reasons.*` | `EMPTY_CODE`, `EMPTY_NAME`, `CODE_TOO_LONG`, `NAME_TOO_LONG`, `MISSING_FIELDS`, `DUPLICATE_IN_FILE` |
| `errors.*` | los ocho `DIAGTERM_00X_…` del término y los cuatro `DIAGTERM_007_…` |

`nav.items.diagnosticTerm` ya existe.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y se puede committear por separado. Antes del paso 6 se cargan `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` (`CONVENTIONS.md` §10.6).

1. **Contratos.**
   - Se añade `{ source: 'diagnosticTerm/diagnosticTerm.types.ts', dest: 'diagnosticTerm.ts' }` a `SYNC_MAP` y se ejecuta `npm run contracts:sync`.
   - Se crea `contracts/declared/diagnosticTerm.ts` con la fila de §3.3.

   *Verificación:* `contracts/diagnosticTerm.ts` exporta `CreateDiagnosticTermInput` y `DiagnosticTermImportReport`, y `TermSource` se importa desde `common`, sin duplicarse. `npx tsc --noEmit -p tsconfig.app.json` no da errores nuevos.

2. **Recurso y mutación de importación.**
   - `features/diagnosticTerm/api.ts`: `diagnosticTermResource` con `inactiveMode: 'adminPath'`, `adminPath: 'diagnostic-terms/admin'`, `staleTime` de 5 min y las ocho rutas citadas con su código.
   - `importApi.ts`: `useImportDiagnosticTerms()`, que construye el `FormData` y envía `dryRun` como texto. Solo invalida `['diagnosticTerm']` cuando `dryRun` es falso.
   - Se prueban en `api.test.tsx` e `importApi.test.tsx`.

   *Verificación:* con `dryRun: true` no se invalida ninguna clave. Con `dryRun: false` se invalida `['diagnosticTerm']`. El cuerpo lleva `file`, `encoding`, `source`, `termGroup` y `dryRun`.

3. **Schemas.** En `schemas.ts`:
   - `createDiagnosticTermSchema`, `updateDiagnosticTermSchema` e `importDiagnosticTermsSchema`;
   - `toDiagnosticTermPayload`, que quita `source` al editar, convierte `termGroup` vacío en `null` y omite `reviewStatus` si no está marcado;
   - `diagnosticTermErrorFieldMap` y `diagnosticTermImportErrorFieldMap`.

   Se prueban en `schemas.test.ts`.
   *Verificación:* los tests cubren `name` de 501 caracteres, `code` vacío, un fichero de 21 MB rechazado en el cliente, un payload de edición sin `source`, y un `reviewStatus` sin marcar que no aparece en el payload.

4. **Claves i18n.** Las de §3.8, en los tres idiomas.
   *Verificación:* `npm run i18n:check` sale en 0.

5. **`DiagnosticTermImportReport.tsx`.** Componente puro que recibe el informe, con la nota de truncado y los motivos traducidos.
   *Verificación:* con `invalid: 30` y 20 errores muestra la nota de truncado; con `dryRun: true` muestra la marca de simulación.

6. **`DiagnosticTermImportPage.tsx`.**
   - El formulario de §3.5, con «Opciones avanzadas» colapsado.
   - Simular, confirmar e importar.
   - `mutation.reset()` al cambiar el fichero o cualquier campo.
   - El aviso `aria-live` mientras corre y el foco al informe cuando llega.
   - Se prueba en `DiagnosticTermImportPage.test.tsx`.

   *Verificación:*
   - «Simular» envía `dryRun=true` y pinta el informe.
   - Cambiar el fichero lo borra.
   - «Importar» sin confirmar no envía nada.
   - Un 413 pinta el error bajo `file`.

7. **`DiagnosticTermFormDialog.tsx` y `DiagnosticTermAuditSheet.tsx`.** El diálogo de §3.5, con `source` de solo lectura al editar, el select `reviewStatus` y el aviso de término autogenerado. La auditoría sigue la forma de `DiluentAuditSheet`.
   *Verificación:*
   - Un 409 `DIAGTERM_004_CODE_EXISTS` pinta el error bajo `code`.
   - Una fila con `metadata: {}` muestra «Sin marcar», y guardar sin tocarlo no envía `reviewStatus`.
   - Una fila `PENDING` no ofrece «Sin marcar».

8. **`DiagnosticTermListPage.tsx` y `DiagnosticTermRowActions`.**
   - Búsqueda, `source`, `termGroup`, `reviewStatus`, `page` e `includeInactive` en `searchParams`.
   - El acoplamiento `reviewStatus` ↔ `includeInactive` de §3.4.
   - El badge «Pendiente», las tarjetas y las acciones por rol y estado.
   - Los botones de cabecera.
   - Se prueba en `DiagnosticTermListPage.test.tsx`.

   *Verificación:*
   - Elegir «Pendiente» pone `includeInactive=true` y la petición va a `/api/diagnostic-terms/admin?reviewStatus=PENDING`.
   - Apagar el toggle quita `reviewStatus`.
   - Con USER no se ven el filtro de revisión, el toggle, «Crear» ni «Importar».
   - Con ADMIN, una fila inactiva no ofrece «Editar».

9. **Ruta y menú.**
   - `/diagnostic-terms/import` bajo `<RequireRole level={SUPERADMIN}>`, declarada antes que `/diagnostic-terms`, que va bajo `USER`.
   - Se quita `disabled: true` de `nav.items.diagnosticTerm`.
   - Se añade `router.diagnosticTerm.test.tsx`.

   *Verificación:* con USER, el sidebar lleva a `/diagnostic-terms`. Con ADMIN, `/diagnostic-terms/import` redirige. Con SUPERADMIN, abre.

---

## 5. Criterios de aceptación

- [ ] Las ocho rutas de §3.2 se consumen, y cada una aparece citada con su código `ESAVI-DIAGTERM-*` en `api.ts`, en `importApi.ts` o en el componente que la usa.
- [ ] Existen los seis artefactos de `CONVENTIONS.md` §5 que aplican, más `importApi.ts`, `DiagnosticTermImportPage.tsx` y `DiagnosticTermImportReport.tsx`. No hay `DetailPage`, por la decisión de §6.
- [ ] `SYNC_MAP` incluye `diagnosticTerm`, y `npm run contracts:sync` no deja diferencias.
- [ ] Aplicar búsqueda, `source` y `termGroup` y recargar conserva la vista. El enlace la reproduce en otra sesión.
- [ ] La búsqueda envía `name` y `code`, nunca `search`.
- [ ] Una URL con `reviewStatus` siempre lleva `includeInactive=true`, y la petición va a `/admin`. No existe ninguna combinación que envíe `reviewStatus` al `002A`.
- [ ] Con ADMIN, una fila inactiva no ofrece «Editar». Con SUPERADMIN, sí.
- [ ] Editar una fila sin marca de revisión y guardar sin tocar ese campo produce un `PUT` sin `reviewStatus`. Ningún `PUT` lleva `source`.
- [ ] Un 409 `CODE_EXISTS` pinta el error bajo `code`.
- [ ] Un fichero de más de 20 MB se rechaza en el cliente, sin petición.
- [ ] Simular no invalida caché. Importar sí, y al volver al listado aparecen los términos nuevos sin recargar.
- [ ] Cambiar el fichero después de simular borra el informe simulado.
- [ ] Con ADMIN, el botón «Importar diccionario» no se renderiza y `/diagnostic-terms/import` redirige.
- [ ] `grep -rn "response.data.data" src/features/diagnosticTerm/` no devuelve resultados.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El listado, el diálogo, la auditoría, la página de importación y el informe se ven correctos en `dark`, y `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/diagnosticTerm/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `name`, `code` y `source` + badge. El body no hace scroll horizontal en 375px, tampoco con el informe de importación abierto.
- [ ] **Rol bajo.** Con `USER`, el menú ofrece `/diagnostic-terms`, y la pantalla no ofrece el filtro de revisión, el toggle, «Crear», «Importar» ni acciones de fila. Un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders, `aria-label` y los motivos de rechazo. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: el informe solo en `useMutation().data`, el fichero solo en el componente, y ningún filtro fuera de `searchParams`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** una página de importación propia, a la que se llega desde la cabecera del listado y sin entrada de menú. Es una operación anual de SUPERADMIN, y SPEC FE25c tendrá otra igual: dos entradas más ensuciarían el grupo de catálogos clínicos.
- **No:** una entrada de menú como `geoBulkImport`. Aquella importación carga dos entidades y tiene plantillas descargables para ADMIN. Esta es de una sola entidad y solo para SUPERADMIN.
- **Sí:** `source` y `termGroup` en «Opciones avanzadas», con `MEDDRA` y `LLT` ya puestos. El caso real es `llt.asc`, y cambiarlos solo sirve para cargar otros niveles como catálogos planos.
- **Sí:** la cola de revisión mínima: filtro, badge y select en el diálogo. Sin ella, la marca `PENDING` del `006` no la ve nadie.
- **No:** aprobación en lote ni fusión de duplicados. Necesitan rutas que el backend no tiene; son el spec de gobernanza de SPEC F15.
- **Sí:** elegir `reviewStatus` pone también `includeInactive=true`, y quitar el toggle quita `reviewStatus`. El `002A` ignora el filtro en silencio. Acoplarlos en la URL hace imposible una vista que parezca filtrada y no lo esté.
- **No:** ocultar el filtro de revisión hasta que el toggle esté activo. Esconde la función detrás de un control que no tiene nada que ver con ella.
- **Sí:** `reviewStatus` sin marcar no se envía, y una vez marcado no se puede volver a «Sin marcar». El backend rechaza el vacío, y no existe una operación que borre la clave.
- **Sí:** `staleTime` de 5 min, excepción a los 30 min de §6.3. El maestro crece desde otras features por el `006`, sin invalidar esta clave.
- **No:** que las mutaciones de notificación e investigación invaliden `['diagnosticTerm']`. Acoplaría tres features a una clave ajena por un efecto secundario del servidor.
- **Sí:** un `DiagnosticTermImportReport` local a la feature. **No:** un `<ImportReport>` en `shared/` todavía. Se extrae con dos usos reales, y la decisión queda para SPEC FE25c.
- **Sí:** descartar el informe simulado al cambiar el fichero o cualquier campo. Un informe que describe otro fichero invita a importar a ciegas.
- **Sí:** comprobar los 20 MB en el cliente. Ahorra subir un fichero que el servidor va a rechazar con 413. El 413 del servidor sigue mapeado por si el límite cambia.
- **No:** página de detalle. Las columnas caben en la tabla y en el diálogo.
- **No:** enviar `source` en el `PUT`. El backend lo ignora, pero un payload con un campo que no se puede cambiar confunde al depurar.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Un `llt.asc` completo (unas 90 000 líneas) tarda minutos, y un proxy intermedio corta la petición antes de que llegue el informe | `client.ts` no tiene timeout. El aviso pide no cerrar la pestaña. SPEC F17 §7 deja la medición con el fichero real como tarea del backend; si no cabe, la solución es la cola asíncrona, que es otro spec. |
| El usuario cierra la pestaña durante la importación | El backend procesa por lotes con transacción propia, así que lo ya escrito queda escrito. Volver a importar es seguro: la actualización es diferencial y cuenta `unchanged`. |
| Dos SUPERADMIN importan a la vez y uno recibe `IMPORT_FAILED` | El mensaje de §3.5 menciona esa causa. Basta con reintentar. |
| Un fichero `latin1` importado como `utf8` escribe miles de acentos rotos | La ayuda del campo `encoding` indica comprobarlo en la simulación. `raw` en la tabla de rechazos y los nombres del informe lo hacen visible antes de importar. |
| Un ADMIN no ve un término creado hace menos de 5 min | Límite aceptado del `staleTime`. Recargar la pestaña lo trae. |

---

## 8. Impacto en pantallas existentes

| Archivo | Antes | Después |
|---|---|---|
| `shared/config/navigation.ts` | `nav.items.diagnosticTerm` con `disabled: true` | Navegable a `/diagnostic-terms` |
| `scripts/syncContracts.mjs` | Sin `diagnosticTerm` en `SYNC_MAP` | Con la entrada; genera `contracts/diagnosticTerm.ts` |
| `app/router.tsx` | — | Dos rutas nuevas; la de importación va antes que la del listado |

Los satélites que embeben `diagnosticTerm` (`investigationDiagnostic`, `notificationEvent`, `notificationPregnancyComplication`, `investigationPregnancyCondition`) **no cambian**. Siguen leyendo el término embebido en su propia respuesta.

---

## Lo que **no** está en este spec

- Vacunas WHODrug (SPEC FE25c) y productos WHODrug (SPEC FE25d).
- La gobernanza del catálogo: aprobación en lote, fusión de duplicados, promoción de `LOCAL` a `MEDDRA` y aviso de pendientes.
- Un `<ImportReport>` compartido.
- La jerarquía MedDRA como árbol.
- Importación asíncrona con progreso real y deshacer una importación.
- Búsqueda parcial por `termGroup`.
- Página de detalle del término.

Cada uno de esos, si aterriza, va en su propio spec.

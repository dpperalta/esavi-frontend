# SPEC FE25c — Mantenimiento e importación de vacunas WHODrug

> **Estado:** Aprobado
> **Depende de:** SPEC FE25a (patrón de catálogos clínicos), SPEC FE25b (flujo de importación; queda enmendado por este spec, §8), SPEC FE12c (`<WhodrugTreePicker>` y `useVaccineWhodrugTree`), SPEC FE02 (fábrica de recursos), SPEC F18 del backend (CRUD de `vaccineWhodrug`), SPEC F19 del backend (importación `.xlsx`)
> **Fecha:** 2026-09-25
> **Objetivo:** Dar al diccionario de vacunas WHODrug un listado, un detalle de solo lectura, un formulario en página y una importación `.xlsx`, y extraer `<ImportReport>` como primitiva compartida con SPEC FE25b.

---

## 1. Por qué existe este spec

Es el consumo de `ESAVI-WHODRUG-001`…`005B` (SPEC F18 del backend) y de `ESAVI-WHODRUG-007` (SPEC F19). Es el tercero de los cuatro specs de catálogos clínicos (FE25a–d).

**A — El diccionario se consulta, pero no se puede mantener.** `<WhodrugTreePicker>` recorre `006A`–`006E` y resuelve la vacuna con el `003` desde el paso de notificación (SPEC FE12c). Todo lo demás está sin cliente:
- las filas llegan solo por el `007`, que tampoco tiene cliente;
- una presentación que falte no se puede añadir;
- una errata del volcado no se puede corregir;
- una vacuna retirada no se puede dar de baja.

**B — El menú promete una pantalla que no existe.** `navigation.ts` declara `nav.items.whodrugVaccine → /whodrug-vaccines` con `disabled: true`.

**C — Una fila, 28 columnas.** Ningún catálogo del repositorio tiene esta anchura. No cabe en un diálogo ni en una tabla: necesita una página de detalle por secciones y un formulario en página propia. Es la primera entidad de mantenimiento que los tiene.

**D — Lo que se edita a mano puede perderse.** La importación actualiza por `externalId` y sobrescribe 24 columnas de cada fila del diccionario. Solo sobreviven `notes` e `isActive` (SPEC F19 §3.5). Una corrección manual sobre una fila importada desaparece en la siguiente carga, sin aviso, si la pantalla no lo explica.

**E — La caché del detalle ya existe con otra clave.** `useVaccineWhodrugTree.ts:75` guarda el `003` en `['whodrugVaccine', 'detail', id]`. Un recurso nuevo con otra clave crearía una segunda copia del mismo detalle. Además, sus mutaciones no refrescarían los niveles del árbol que usa la notificación.

**F — El informe de importación ya tiene dos usos.** SPEC FE25b dejó `DiagnosticTermImportReport` local a su feature, a la espera del segundo uso. Es éste: los dos informes comparten contadores, marca de simulación, nota de truncado y tabla de rechazos. FE25b ya estaba implementado cuando este spec se aprobó (corrección del 2026-09-26), así que la extracción migra su informe a la primitiva y borra el componente local.

---

## 2. Alcance

**Dentro:**

- **El listado `/whodrug-vaccines`**, con `VaccineWhodrugListPage.tsx`. En `searchParams` lleva:
  - la búsqueda `q`, que viaja como `name`/`code`;
  - `iso3Code`, texto exacto;
  - `isPreferred` e `isGeneric`, con los valores Todos / Sí / No;
  - `page`;
  - `includeInactive`, solo para ADMIN.

  Las columnas y la tarjeta son las de §3.7, con el badge «Preferido».
- **El detalle `/whodrug-vaccines/:id`**, con `VaccineWhodrugDetailPage.tsx`: las 28 columnas en seis secciones, de solo lectura, visible con USER. Lleva «Editar» para quien puede editar esa fila y «Ver auditoría» para SUPERADMIN.
- **El formulario en página** para `/whodrug-vaccines/new` y `/whodrug-vaccines/:id/edit`, con `VaccineWhodrugFormPage.tsx` y `<RequireRole level={ADMIN}>`. Tiene:
  - las mismas seis secciones;
  - `isGeneric` con tres estados;
  - `externalId` entero;
  - el error de `EXTERNAL_ID_EXISTS` en su campo;
  - un aviso no bloqueante al editar una fila con `externalId`.
- **La confirmación al salir con cambios sin guardar**, local a la página: `beforeunload` más una confirmación en «Cancelar» y «Volver al listado».
- **`VaccineWhodrugAuditSheet.tsx`**, solo para SUPERADMIN.
- **Acciones de fila:** la regla de SPEC FE25a §3.1. «Ver» es para todos, y es también el clic en la fila.
- **La importación `/whodrug-vaccines/import`**, con `VaccineWhodrugImportPage.tsx` y `<RequireRole level={SUPERADMIN}>`.
  - Se llega desde un botón en la cabecera del listado.
  - El formulario tiene el fichero `.xlsx` y `dictionaryVersion`.
  - El flujo es simular, confirmar e importar, y el informe muestra la hoja leída y las cabeceras ausentes y desconocidas.
- **`<ImportReport>` en `shared/components/`**, la **primitiva 14**. Pinta:
  - los seis contadores;
  - la marca de simulación;
  - la nota de truncado;
  - una tabla de rechazos con columnas configurables;
  - un hueco (`children`) para lo propio de cada importación.

  Es un componente puro, sin llamadas.
- **La enmienda a SPEC FE25b y la migración de su código:** una nota tras su header, y `DiagnosticTermImportPage` pasa a usar `<ImportReport>`; `DiagnosticTermImportReport.tsx` y sus claves duplicadas se eliminan.
- **Las actualizaciones de la lista canónica:** en `ARCHITECTURE.md` §4.3 y en `CLAUDE.md`, la cifra «trece» pasa a «catorce» y se añade `<ImportReport>`.
- **`api.ts`** con `vaccineWhodrugResource` y `key: 'whodrugVaccine'`, e **`importApi.ts`** con la mutación del `007`.
- **`schemas.ts`**, con los schemas del formulario y de la importación.
- **`contracts/declared/vaccineWhodrug.ts`** gana `appDetails`.
- **Ruta y menú:** se declaran cinco rutas, y `nav.items.whodrugVaccine` deja de estar `disabled`.
- **El bloque i18n `vaccineWhodrug.*`** y **`common.importReport.*`** para la primitiva, en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **Productos WHODrug**, el listado y la sincronización de `WHODPROD`. Van en SPEC FE25d.
- **Las rutas `006A`–`006E`**, que ya consume `<WhodrugTreePicker>`.
- **Filtrar por `language`.** El diccionario real es de un solo idioma.
- **Bloquear la navegación interna con cambios sin guardar** (sidebar o botón atrás). Exige migrar `app/router.tsx` a `createBrowserRouter` para usar `useBlocker`, lo que afecta a todas las rutas y merece su propio spec.
- **Fusionar entradas duplicadas.** SPEC F19 la deja fuera.
- **Elegir la hoja del libro**, el **versionado de diccionarios** y **deshacer una importación**. El backend no tiene esas operaciones.
- **Reactivar por importación.** El backend no lo hace a propósito.
- **Filtrar `isGeneric IS NULL`.** El backend no lo admite.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/whodrug-vaccines` | `features/vaccineWhodrug/VaccineWhodrugListPage.tsx` | `<RequireRole level={USER}>` |
| Alta | `/whodrug-vaccines/new` | `features/vaccineWhodrug/VaccineWhodrugFormPage.tsx` | `<RequireRole level={ADMIN}>` |
| Importación | `/whodrug-vaccines/import` | `features/vaccineWhodrug/VaccineWhodrugImportPage.tsx` | `<RequireRole level={SUPERADMIN}>` |
| Detalle | `/whodrug-vaccines/:id` | `features/vaccineWhodrug/VaccineWhodrugDetailPage.tsx` | `<RequireRole level={USER}>` |
| Edición | `/whodrug-vaccines/:id/edit` | `features/vaccineWhodrug/VaccineWhodrugFormPage.tsx` | `<RequireRole level={ADMIN}>` |
| Auditoría | (panel lateral sobre el detalle y sobre el listado) | `features/vaccineWhodrug/VaccineWhodrugAuditSheet.tsx` | acción visible con `useCan(SUPERADMIN)` |

**Orden en el router.** `/new` y `/import` se declaran antes que `/:id`, para que ningún segmento literal se lea como un id.

**Menú.** La entrada `nav.items.whodrugVaccine` pierde `disabled: true`. Conserva el icono `Syringe`, la ruta `/whodrug-vaccines` y `minLevel: USER`, que es el rol de `ESAVI-WHODRUG-002A`. Ni la importación ni el alta tienen `NavItem`.

**Cabecera del listado:**
- «Crear vacuna», con `useCan(ADMIN)`, que lleva a `/new`.
- «Importar diccionario», con `useCan(SUPERADMIN)`, que lleva a `/import`.

**Acciones de fila.** Van en `VaccineWhodrugRowActions`.

| Acción | Visible si | Ruta |
|---|---|---|
| Ver (y clic o Enter en la fila) | fila activa, **o** `useCan(SUPERADMIN)` | `003` |
| Editar | `useCan(ADMIN)` y fila activa, **o** `useCan(SUPERADMIN)` | `003` + `004` |
| Ver auditoría | `useCan(SUPERADMIN)` | `003` |
| Dar de baja | `useCan(ADMIN)` y fila activa | `005A` |
| Reactivar | `useCan(SUPERADMIN)` y fila inactiva | `005B` |

**«Ver» sigue la misma regla que «Editar».** El detalle también lee el `003`, y a un ADMIN le responde 404 sobre una fila inactiva que el `002B` sí le muestra. USER no ve filas inactivas, así que para él la condición siempre se cumple. Una fila inactiva vista por ADMIN no es navegable: no tiene cursor de enlace ni responde a Enter.

**Página de detalle.**
- Cabecera con `drugName`, `drugCode`, el badge de estado y el badge «Preferido».
- Botones: «Editar» (misma regla), «Ver auditoría» (SUPERADMIN) y «Volver al listado».
- Debajo, las seis secciones de §3.5, con los campos vacíos como «—».

**Página del formulario.** La misma para crear y editar; la distingue la presencia de `:id`.
- Sus botones son «Guardar» y «Cancelar».
- Al guardar, navega al detalle de la fila guardada.
- Al cancelar, vuelve al detalle si edita o al listado si crea. Pide confirmación si hay cambios sin guardar.

### 3.2 Endpoints consumidos

```
GET    /api/whodrug-vaccines                ESAVI-WHODRUG-002A  USER        listado de activos
GET    /api/whodrug-vaccines/admin          ESAVI-WHODRUG-002B  ADMIN       listado con inactivos (toggle)
GET    /api/whodrug-vaccines/:id            ESAVI-WHODRUG-003   USER        detalle, formulario de edición y auditoría
POST   /api/whodrug-vaccines                ESAVI-WHODRUG-001   ADMIN       crear
PUT    /api/whodrug-vaccines/:id            ESAVI-WHODRUG-004   ADMIN       actualizar
DELETE /api/whodrug-vaccines/:id            ESAVI-WHODRUG-005A  ADMIN       dar de baja
PATCH  /api/whodrug-vaccines/activate/:id   ESAVI-WHODRUG-005B  SUPERADMIN  reactivar
POST   /api/whodrug-vaccines/import         ESAVI-WHODRUG-007   SUPERADMIN  importación .xlsx (multipart)
```

**Lo que no se consume aquí:**
- `006A`–`006E` (`abbreviations`, `drug-names`, `ma-holders`, `forms` y `strengths`). Son del `<WhodrugTreePicker>`, y esta pantalla no los usa.
- `005C`, porque la tabla está en `preventPhysicalDelete`.

**Parámetros del listado.**

| Parámetro | Regla |
|---|---|
| `limit`, `offset` | Paginación. |
| `name`, `code` | Mínimo 2 caracteres. `name` va contra `drugName` y `code` contra `drugCode`, con `Op.or`. |
| `iso3Code` | Igualdad exacta, con `trim`. |
| `isPreferred`, `isGeneric` | `'true'` o `'false'`. Si falta, no se filtra. |

`language` existe en el backend pero no se expone. No se usa `search`. El orden es `drugName ASC`.

**Cuerpo del `007`** (`multipart/form-data`):

| Campo | Regla |
|---|---|
| `file` | `.xlsx`, máx. 20 MB |
| `dictionaryVersion` | opcional, máx. 100 |
| `dryRun` | `'true'` o `'false'` |

### 3.3 Tipos del contrato

- **`contracts/vaccineWhodrug.ts`** ya está en `SYNC_MAP`. Aporta:
  - `CreateVaccineWhodrugInput`, con 28 campos y `isActive?`;
  - `VaccineWhodrugListFilters` e `ImportVaccineWhodrugsInput`;
  - `VaccineWhodrugImportReport` y `RejectedVaccineWhodrugRow`.

  Antes de empezar se ejecuta `npm run contracts:sync` para confirmar que no hay diferencias.
- **`contracts/declared/vaccineWhodrug.ts`** conserva `VaccineWhodrugDetail` y **gana `appDetails: AppDetails[] | null`**, que el backend ya devuelve y el contrato declarado omitía. La misma interfaz sirve de fila del listado, porque `002A`/`002B` devuelven la fila completa. Al reconciliar contra `vaccineWhodrug.model.ts` se confirma que `metadata` sigue siendo `object | null`.
- **El update es `Partial<CreateVaccineWhodrugInput>`.**

### 3.4 Contrato de estado

**Listado:**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Búsqueda | URL | `searchParams.q` | Con debounce. Viaja como `name=q&code=q`. Con menos de 2 caracteres no se envía. |
| País | URL | `searchParams.iso3Code` | Texto exacto, con debounce. |
| Preferido | URL | `searchParams.isPreferred` | `true` o `false`. Si falta, vale «Todos». |
| Genérico | URL | `searchParams.isGeneric` | `true` o `false`. Si falta, vale «Todos». |
| Página | URL | `searchParams.page` | Se borra al cambiar cualquier filtro. |
| Toggle «mostrar inactivos» | URL | `searchParams.includeInactive=true` | Solo con ADMIN. |
| Tamaño de página | Zustand | `preferences.pageSize` | Preferencia global que ya existe. |
| Listado | TanStack Query | `['whodrugVaccine', 'list', { limit, offset, includeInactive, filters }]` | `staleTime` de 30 min: catálogo sin escrituras implícitas. |

**Detalle y formulario:**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Id de la fila | URL | `:id` del path | |
| Fila | TanStack Query | `['whodrugVaccine', 'detail', id]` | **La misma entrada** que `useVaccineWhodrugTree.ts:75`. Las dos `queryFn` devuelven `VaccineWhodrugDetail` desenvuelto, así que cualquiera de las dos la puede llenar. |
| Valores del formulario | React Hook Form | `useForm` | `reset(detail)` al llegar el `003`. En alta, `isPreferred: false` e `isGeneric: null`. |
| Hay cambios sin guardar | React Hook Form | `formState.isDirty` | Es lo que activa `beforeunload` y la confirmación. No se copia a `useState`. |
| Confirmaciones abiertas, auditoría abierta | Componente | `useState` | Efímeros. |

**Importación.** Mismo contrato que SPEC FE25b §3.4, con estas diferencias:
- el fichero va en `useState<File | null>`;
- `dictionaryVersion` va en `useForm`;
- el informe es `useMutation().data`;
- no hay «Opciones avanzadas» ni `encoding`.

**Invalidación.**
- Tras `001`, `004`, `005A` y `005B`, la fábrica invalida `['whodrugVaccine']`.
- Tras el `007` con `dryRun: false`, `importApi.ts` invalida `['whodrugVaccine']`.

Como la clave raíz es compartida, las dos cosas refrescan también `['whodrugVaccine', 'level', …]`, los niveles del árbol que usa la notificación. Una vacuna nueva o dada de baja aparece o desaparece del `<WhodrugTreePicker>` sin recargar.

**La clave `whodrugVaccine` es una desviación razonada.** No coincide con la carpeta `vaccineWhodrug/`, que lleva el nombre de la entidad del backend. Se elige para compartir caché con el hook que ya existe (§1 E).

### 3.5 Formularios y validación

**Formulario de la vacuna** — `features/vaccineWhodrug/schemas.ts`, `createVaccineWhodrugSchema` y `updateVaccineWhodrugSchema`. Los límites son los del validador del backend (`vaccineWhodrug.validator.ts`).

| Sección | Campo | Control | Regla |
|---|---|---|---|
| Identificación | `drugCode` | `<Input>` | **Obligatorio**, `trim`, máx. 250 |
| | `drugName` | `<Input>` | **Obligatorio**, `trim`, sin límite |
| | `externalId` | `<NumberField>` entero | Opcional, anulable; único |
| | `drugRecNo`, `drugRecNoSeq` | `<Input>` | Máx. 50 |
| | `medicinalProductId` | `<Input>` | Máx. 250 |
| Clasificación | `atcs`, `icd11`, `abbreviation` | `<Input>` | Máx. 250 |
| | `icd11Term` | `<Input>` | Máx. 500 |
| | `isGeneric` | `<Select>` Sí / No / Sin dato | Tres estados; «Sin dato» se envía como `null` |
| | `isPreferred` | `<Switch>` | Booleano, nunca `null` |
| Composición | `ingredient`, `ingredientTranslation`, `noDose`, `diluent` | `<Textarea>` | Sin límite |
| País y registro | `language` | `<Input>` | Máx. 10 |
| | `languageCode` | `<Input>` | Máx. 100 |
| | `iso3Code`, `countryMedicinalProductId`, `maHoldersMedicinalProductId` | `<Input>` | Máx. 250 |
| | `maHolders` | `<Textarea>` | Sin límite |
| Presentación | `form`, `formTranslations`, `strength` | `<Input>` | Sin límite |
| | `formMedicinalProductId`, `strengthMedicinalProductId` | `<Input>` | Máx. 250 |
| Notas | `notes` | `<Textarea>` | Sin límite; sobrevive a la reimportación |

- **Los 26 opcionales:** si quedan vacíos, se envían como `null`. En el `PUT` va el objeto completo y el backend hace el diff.
- **`isActive` no está en el formulario.**
- **Sin normalización.** `drugCode` y `drugName` se guardan tal cual, solo con `trim`. No hay ayuda de normalización, a diferencia de FE25a y FE25b.
- **`diluent` es texto libre**, no una FK a `diluentCatalog`. La etiqueta lo dice («Diluyente, tal como figura en el diccionario») para que nadie espere un selector.
- **Aviso de fila importada.** Si el `003` trae `externalId !== null`, sobre el formulario aparece un `<Alert>` no bloqueante: «Esta vacuna viene del diccionario WHODrug. La próxima importación sobrescribirá los cambios, salvo las notas».
- **Confirmación al salir.** Con `isDirty`:
  - `beforeunload` activo;
  - «Cancelar» y «Volver al listado» abren un `AlertDialog` antes de navegar.

  Con el guardado bien terminado, `isDirty` vuelve a `false` antes de navegar.

**Errores del servidor, formulario:**

| `code` | Destino |
|---|---|
| `WHODRUG_001_EXTERNAL_ID_EXISTS`, `WHODRUG_004_EXTERNAL_ID_EXISTS` | Campo `externalId`. El texto aclara que puede pertenecer a una vacuna dada de baja |
| `WHODRUG_003_NOT_FOUND` | Estado «no existe» de la página (§3.6) |
| `WHODRUG_004_NOT_FOUND` | Toast y navegación al listado |
| `WHODRUG_005A_NOT_FOUND`, `WHODRUG_005B_NOT_FOUND`, `WHODRUG_005A_ALREADY_INACTIVE`, `WHODRUG_005B_ALREADY_ACTIVE` | Toast |
| Cualquier otro, incluido `UNKNOWN_ERROR` | Toast genérico por `code`; nunca `errors` |

**Formulario de importación** — `importVaccineWhodrugsSchema`.

| Campo | Control | Regla |
|---|---|---|
| `file` | Selector, `accept=".xlsx"` | Obligatorio; máx. 20 MB, comprobado en el cliente |
| `dictionaryVersion` | `<Input>` | Opcional, máx. 100; ayuda «Ejemplo: WHODrug Global 2025 Sep 1» |

Simular, confirmar e importar, y el descarte del informe al cambiar un campo, igual que SPEC FE25b §3.5.

**Errores del servidor, importación:**

| `code` | Destino |
|---|---|
| `WHODRUG_007_FILE_REQUIRED` | Campo `file` |
| `WHODRUG_007_FILE_TOO_LARGE` (413) | Campo `file` |
| `WHODRUG_007_FILE_INVALID` | Campo `file`: «El fichero no es un `.xlsx` válido, le faltan las cabeceras obligatorias (`id`, `drugCode`, `drugName`, `ingredientTranslations`) o no tiene filas válidas» |
| `WHODRUG_007_IMPORT_FAILED` | Alert en la página, con el mismo texto que FE25b |
| Cualquier otro | Toast genérico por `code` |

### 3.6 Estados de la pantalla

**Listado:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de `<ResourceTable>` | — |
| Vacío (sin datos) | Texto, con «Importar diccionario» para SUPERADMIN y «Crear vacuna» para ADMIN | `vaccineWhodrug.list.empty` |
| Vacío (con filtros) | Texto y «Limpiar filtros», que borra `q`, `iso3Code`, `isPreferred`, `isGeneric` y `page`, pero no `includeInactive` | `vaccineWhodrug.list.emptyFiltered`, `vaccineWhodrug.list.clearFilters` |
| Error | Mensaje por `code` y «Reintentar» | `common.table.retry` |
| Sin permiso | No se llega; las acciones que el rol no permite no se renderizan | — |

**Detalle y formulario:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de las seis secciones | — |
| No existe (404) | «La vacuna no existe o está dada de baja» y «Volver al listado» | `vaccineWhodrug.detail.notFound` |
| Error | Mensaje por `code` y «Reintentar» | `common.table.retry` |
| Sin permiso | El guard ADMIN de `/new` y `/:id/edit` redirige | — |

**Importación:** los mismos estados que SPEC FE25b §3.6, sin el de «codificación». El aviso de «en curso» es más corto, porque el fichero real tarda segundos: «Importando… no cierres esta pestaña».

### 3.7 Responsividad y accesibilidad

- **Tarjetas** por debajo de `md`:
  - `primary`: `drugName`;
  - `secondary`: `drugCode`;
  - `meta`: `maHolders · strength`.

  Las filas inactivas llevan `isRowInactive`.
- **Columnas de escritorio:** `drugName`, `drugCode`, `maHolders`, `strength`, `iso3Code`, «Preferido» (badge), estado y acciones.
- **Filtros en móvil:** van en un `Sheet` con contador; la búsqueda queda fuera, a todo el ancho.
- **Detalle y formulario:**
  - Secciones apiladas en una columna por debajo de `md`, y en dos por encima.
  - En móvil, la barra de «Guardar»/«Cancelar» queda fija abajo.
  - Cada sección es un `<fieldset>` con `<legend>` por i18n.
- **Accesibilidad:**
  - Objetivos táctiles de 44px y `dvh`.
  - La fila navegable es alcanzable con Tab y se abre con Enter; la inactiva que ADMIN no puede abrir no recibe foco.
  - Al llegar, el aviso de fila importada se anuncia con `role="status"`.

### 3.8 Claves i18n nuevas

**Bloque `vaccineWhodrug`**, en los tres idiomas:

| Grupo | Claves |
|---|---|
| `list.*` | `title`, `empty`, `emptyFiltered`, `clearFilters`, `create`, `import` |
| `filters.*` | `search`, `searchHint`, `iso3Code`, `iso3CodeHint`, `isPreferred`, `isGeneric`, `all`, `yes`, `no` |
| `detail.*` | `title`, `notFound`, `back`, `edit`, `audit`, `empty` (el «—» accesible) |
| `form.*` | `createTitle`, `editTitle`, `save`, `cancel`, `importedWarning`, `unsavedTitle`, `unsavedBody`, `unsavedDiscard`, `unsavedStay`, `genericUnknown`, `diluentHint` |
| `sections.*` | `identification`, `classification`, `composition`, `countryRegistration`, `presentation`, `notes` |
| `fields.*` | los 28 nombres de campo, más `isActive` |
| `status.*` | `active`, `inactive`, `preferred` |
| `actions.menu`, `actions.view` | `aria-label` del menú; la acción «Ver» |
| `import.*` | `title`, `back`, `file`, `fileHint`, `dictionaryVersion`, `dictionaryVersionHint`, `simulate`, `run`, `confirmTitle`, `confirmBody`, `confirmAction`, `running`, `viewVaccines` |
| `import.report.*` | `sheet`, `missingOptionalHeaders`, `unknownHeaders`, `columns.row`, `columns.reason`, `columns.column` |
| `import.reasons.*` | `INVALID_EXTERNAL_ID`, `EMPTY_DRUG_CODE`, `EMPTY_DRUG_NAME`, `VALUE_TOO_LONG`, `DUPLICATE_IN_FILE` |
| `errors.*` | los ocho `WHODRUG_00X_…` del formulario y los cuatro `WHODRUG_007_…` |

**Bloque `common.importReport`**, nuevo, de la primitiva: `title`, `dryRunNotice`, `truncatedNotice`, `read`, `inserted`, `updated`, `unchanged`, `invalid`, `duplicated`, `rejectedTitle`, `noRejected`.

**Efecto en FE25b.** Las claves de `diagnosticTerm.import.report.*` que duplican las de `common.importReport` (`title`, `dryRunNotice`, los seis contadores y `truncatedNotice`) **se eliminan**. Quedan solo `viewTerms` y las tres columnas propias.

### 3.9 Primitiva `<ImportReport>`

`shared/components/ImportReport.tsx`. Es un componente puro: recibe el informe y lo pinta, sin llamar a nada.

| Prop | Tipo | Uso |
|---|---|---|
| `counters` | `{ read, inserted, updated, unchanged, invalid, duplicated }` | Los seis contadores, siempre en ese orden |
| `dryRun` | `boolean` | Muestra la marca «Simulación: no se escribió nada» |
| `rejected` | `T[]` | Las filas rechazadas, ya truncadas a 20 por el backend |
| `rejectedColumns` | `{ key, header, render(row: T) }[]` | Las columnas de la tabla de rechazos, que cada importación declara |
| `children` | `ReactNode` | Lo propio de cada importación: la hoja y las cabeceras en WHODrug, nada en FE25b |

**Reglas de la primitiva:**
- **Nota de truncado.** Aparece cuando `invalid + duplicated > rejected.length`.
- **Sin rechazos.** Con cero rechazos, la tabla no se pinta; aparece «No se rechazó ninguna fila».
- **Scroll.** La tabla de rechazos hace scroll horizontal dentro de su contenedor.
- **Foco y anuncio.** El título recibe el foco al montarse y se anuncia con `aria-live`.
- **Sin textos propios.** No traduce `reason` por su cuenta: cada consumidor lo hace en su `render`.

**No sirve para `GeoImportReport`**, que informa dos hojas con contadores separados (SPEC FE07). No se migra: su forma es otra.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y se puede committear por separado. **Antes del paso 1**, porque ya produce interfaz, se cargan `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` (`CONVENTIONS.md` §10.6).

1. **Primitiva `<ImportReport>`.**
   - Se escribe `shared/components/ImportReport.tsx` con el contrato de §3.9, junto con su test `ImportReport.test.tsx`.
   - Se añaden las claves `common.importReport.*` en los tres idiomas.
   - Se registra la primitiva 14 en `ARCHITECTURE.md` §4.3, como un tercer bloque («Las que salieron de los catálogos clínicos»), y `CLAUDE.md` pasa de «trece» a «catorce».

   *Verificación:*
   - Con `invalid: 30`, `duplicated: 0` y 20 rechazos aparece la nota de truncado.
   - Con cero rechazos aparece «No se rechazó ninguna fila».
   - Con `dryRun: true` aparece la marca.
   - `children` se pinta entre los contadores y la tabla.
   - `grep -n "trece" CLAUDE.md` ya no devuelve la frase de las primitivas.

2. **Migración de FE25b y enmienda de su spec.** FE25b ya está implementado (corrección del 2026-09-26), así que este paso migra su código:
   - `DiagnosticTermImportPage` usa `<ImportReport>` con columnas `line`, `reason` y `raw`. El enlace «Ver términos» pasa a la página, debajo del informe. El informe lleva `key={submittedAt}` para que cada respuesta lo vuelva a montar y el foco vaya a su título;
   - se eliminan `DiagnosticTermImportReport.tsx` y su test; lo que probaban lo cubren el test de la primitiva y el de la página;
   - se eliminan las claves duplicadas de `diagnosticTerm.import.report.*` (§3.8).

   Tras el header de `25b-diagnostic-term-maintenance.md` se inserta una nota «**Enmendado por SPEC FE25c (2026-09-25).**» que lo recoge y deja su paso 5 sustituido. El cuerpo del spec no se reescribe.
   *Verificación:* los tests de `features/diagnosticTerm/` pasan; ningún archivo de `src/` define el componente `DiagnosticTermImportReport` (el tipo homónimo de `contracts/diagnosticTerm.ts` es del contrato y se queda); `npm run i18n:check` sale en 0; la nota está justo después del bloque de metadatos de FE25b.

3. **Contratos.**
   - `contracts/declared/vaccineWhodrug.ts` gana `appDetails: AppDetails[] | null`.
   - Se reconcilia contra `vaccineWhodrug.model.ts`.
   - Se ejecuta `npm run contracts:sync`.

   *Verificación:* `npm run contracts:sync` no deja diferencias, y `npx tsc --noEmit -p tsconfig.app.json` no da errores nuevos (`useVaccineWhodrugTree` sigue compilando).

4. **Recurso y mutación de importación.**
   - `features/vaccineWhodrug/api.ts` declara `vaccineWhodrugResource` con `key: 'whodrugVaccine'`, `path: 'whodrug-vaccines'`, `idField: 'vaccineWhodrugId'`, `inactiveMode: 'adminPath'`, `adminPath: 'whodrug-vaccines/admin'` y `staleTime` de 30 min. Cita las ocho rutas con su código, y anota que `006A`–`006E` viven en `useVaccineWhodrugTree`.
   - `importApi.ts` declara `useImportVaccineWhodrugs()`.
   - Se añaden `api.test.tsx` e `importApi.test.tsx`.

   *Verificación:*
   - Con una entrada ya presente en `['whodrugVaccine', 'level', …]`, una mutación `004` la marca como inválida.
   - Con `dryRun: true` no se invalida nada.
   - `useOne(id)` y `useVaccineWhodrugTree` leen la misma entrada de caché.

5. **Schemas.** `schemas.ts` contiene:
   - los schemas del formulario y de la importación;
   - `toVaccineWhodrugPayload`, que convierte el vacío en `null` en los 26 opcionales y «Sin dato» en `null` en `isGeneric`;
   - `vaccineWhodrugErrorFieldMap` y `vaccineWhodrugImportErrorFieldMap`.

   Se prueba en `schemas.test.ts`.
   *Verificación:* los tests cubren estos casos:
   - `drugCode` de 251 caracteres;
   - `drugName` vacío;
   - `externalId: 1.5`;
   - `isGeneric: 'unknown'` convertido en `null`;
   - `isPreferred` que nunca sale `null`;
   - un `.xlsx` de 21 MB rechazado.

6. **Claves i18n** del bloque `vaccineWhodrug` (§3.8), en los tres idiomas.
   *Verificación:* `npm run i18n:check` sale en 0.

7. **Detalle y auditoría.**
   - `VaccineWhodrugDetailPage.tsx` pinta las seis secciones con «—» en los campos vacíos.
   - Botones «Editar» y «Ver auditoría» según §3.1, y el estado 404.
   - `VaccineWhodrugAuditSheet.tsx`.
   - Se prueba en `VaccineWhodrugDetailPage.test.tsx`.

   *Verificación:*
   - Con USER no aparecen «Editar» ni «Auditoría».
   - Con ADMIN y una fila activa aparece «Editar».
   - Un 404 muestra «no existe» con el enlace de vuelta.

8. **Formulario en página.**
   - `VaccineWhodrugFormPage.tsx` crea o edita según `:id`, con las seis secciones como `<fieldset>`.
   - Muestra el aviso de fila importada y mapea los errores a su campo.
   - Tiene `beforeunload` con `isDirty` y la confirmación en «Cancelar» y «Volver».
   - Al guardar, navega al detalle.
   - Se prueba en `VaccineWhodrugFormPage.test.tsx`.

   *Verificación:*
   - Un 409 `WHODRUG_004_EXTERNAL_ID_EXISTS` pinta el error bajo `externalId`.
   - Una fila con `externalId` muestra el aviso, y una sin él no.
   - Tocar un campo y pulsar «Cancelar» abre la confirmación; sin tocar nada, navega directamente.
   - El `PUT` lleva los 28 campos.

9. **Importación.**
   - `VaccineWhodrugImportPage.tsx` tiene el fichero y `dictionaryVersion`.
   - El informe usa `<ImportReport>` con columnas `row`, `reason` y `column`. En `children` van la hoja y las listas `missingOptionalHeaders` y `unknownHeaders`, cada una solo si no está vacía.
   - Se prueba en `VaccineWhodrugImportPage.test.tsx`.

   *Verificación:*
   - «Simular» envía `dryRun=true` y pinta la hoja leída.
   - Con `unknownHeaders: ['foo']` se ve la lista.
   - Cambiar el fichero borra el informe.
   - Un `FILE_INVALID` pinta el error bajo `file`.

10. **Listado.**
    - `VaccineWhodrugListPage.tsx` y `VaccineWhodrugRowActions`, con los filtros de §3.4 en `searchParams`, las columnas, la tarjeta y los badges.
    - La fila es navegable según §3.1.
    - Los botones de cabecera.
    - Se prueba en `VaccineWhodrugListPage.test.tsx`.

    *Verificación:*
    - `isPreferred=true` en la URL filtra, y recargar conserva todos los filtros.
    - Con ADMIN, una fila inactiva no ofrece «Ver» ni «Editar», y no navega con Enter.
    - Con USER no se ven el toggle, «Crear» ni «Importar».

11. **Rutas y menú.**
    - Cinco rutas en `app/router.tsx`, con `/new` e `/import` antes que `/:id`, cada una con el guard de §3.1.
    - `nav.items.whodrugVaccine` deja de estar `disabled`.
    - Se añade `router.vaccineWhodrug.test.tsx`.

    *Verificación:*
    - Con USER, `/whodrug-vaccines/new` redirige y `/whodrug-vaccines/<id>` abre.
    - Con ADMIN, `/whodrug-vaccines/import` redirige.
    - `/whodrug-vaccines/import` nunca se interpreta como un id.

---

## 5. Criterios de aceptación

- [ ] Las ocho rutas de §3.2 se consumen, y cada una aparece citada con su código `ESAVI-WHODRUG-*` en `api.ts`, en `importApi.ts` o en el componente que la usa.
- [ ] Existen estos seis artefactos de `CONVENTIONS.md` §5:
  - tipos;
  - `api.ts`;
  - `schemas.ts`;
  - `ListPage` y `DetailPage`;
  - rutas;
  - `NavItem` sin `disabled`.

  Además existen `VaccineWhodrugFormPage.tsx`, `VaccineWhodrugImportPage.tsx` e `importApi.ts`.
- [ ] `<ImportReport>` existe en `shared/components/` y está registrado en `ARCHITECTURE.md` §4.3. `CLAUDE.md` cita catorce primitivas.
- [ ] SPEC FE25b lleva la nota de enmienda, `DiagnosticTermImportPage` usa `<ImportReport>`, y ningún archivo de `src/` define el componente `DiagnosticTermImportReport` (el tipo del contrato con ese nombre se queda).
- [ ] `useOne(id)` del recurso y `useVaccineWhodrugTree` leen la misma entrada `['whodrugVaccine', 'detail', id]`.
- [ ] Editar una vacuna refresca los niveles del `<WhodrugTreePicker>` sin recargar.
- [ ] Aplicar la búsqueda, `iso3Code`, `isPreferred` e `isGeneric` y recargar conserva la vista. El enlace la reproduce en otra sesión.
- [ ] La búsqueda envía `name` y `code`, nunca `search`. Ninguna petición envía `language`.
- [ ] Con ADMIN, una fila inactiva no ofrece «Ver» ni «Editar». Con SUPERADMIN, sí.
- [ ] Un `PUT` lleva los 28 campos. Los opcionales vacíos van como `null`, y `isGeneric` «Sin dato» va como `null`.
- [ ] Una fila con `externalId` muestra el aviso de sobrescritura en el formulario.
- [ ] Con cambios sin guardar, «Cancelar» pide confirmación y cerrar la pestaña dispara el diálogo nativo del navegador. Tras guardar, no pide nada.
- [ ] El informe de importación muestra la hoja leída y, si las hay, las cabeceras ausentes y desconocidas.
- [ ] Un `.xlsx` de más de 20 MB se rechaza en el cliente, sin petición.
- [ ] `grep -rn "response.data.data" src/features/vaccineWhodrug/ src/shared/components/ImportReport.tsx` no devuelve resultados.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El listado, el detalle, el formulario, la importación y `<ImportReport>` se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/vaccineWhodrug/ src/shared/components/ImportReport.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `drugName`, `drugCode` y `maHolders · strength`. El detalle y el formulario apilan las secciones en una columna. El body no hace scroll horizontal en 375px, tampoco con el informe abierto.
- [ ] **Rol bajo.** Con `USER`, el menú ofrece `/whodrug-vaccines` y el detalle de solo lectura, pero no ofrece el toggle, «Crear», «Importar», «Editar» ni «Auditoría». `/new` y `/:id/edit` redirigen. Un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos las etiquetas de sección, los placeholders, los `aria-label` y los motivos de rechazo. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4:
  - `isDirty` solo en React Hook Form;
  - el informe solo en `useMutation().data`;
  - la fila solo en la caché compartida;
  - ningún filtro fuera de `searchParams`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** `key: 'whodrugVaccine'`, distinta del nombre de la carpeta. Comparte la entrada de detalle con `useVaccineWhodrugTree`, y la invalidación refresca el árbol de la notificación.
- **No:** `key: 'vaccineWhodrug'`. Habría dos copias del mismo detalle, y el árbol no se enteraría de las ediciones.
- **Sí:** una página de detalle de solo lectura para USER. Con 28 columnas, el listado muestra una fracción, y USER no tiene formulario donde ver el resto.
- **Sí:** el formulario en página propia, no en diálogo. Veintiocho campos en seis secciones no caben en un modal utilizable en móvil.
- **Sí:** «Ver» sigue la misma regla que «Editar». El detalle lee el `003`, que da 404 a ADMIN sobre filas inactivas.
- **Sí:** el aviso no bloqueante al editar filas con `externalId`. La importación sobrescribe 24 columnas y solo respeta `notes` e `isActive`.
- **No:** bloquear la edición de filas importadas. Corregir una errata urgente antes de la próxima carga es legítimo, y el aviso deja la decisión informada.
- **Sí:** la confirmación al salir cubre `beforeunload` y los botones propios de la página.
- **No:** bloquear la navegación interna (sidebar, botón atrás). `useBlocker` exige un *data router*, y `app/router.tsx` usa `<BrowserRouter>`. Migrar afecta a todas las rutas y a sus tests; es su propio spec.
- **Sí:** extraer `<ImportReport>` ahora, con el segundo uso, y migrar a ella el informe de FE25b, que ya estaba implementado. Dejar el duplicado habría contradicho `CONVENTIONS.md` §3: un componente sube a `shared/` con su segundo consumidor y se mueve, no se copia.
- **No:** migrar `GeoImportReport` a la primitiva. Informa dos hojas con contadores separados: no es la misma forma.
- **Sí:** la primitiva no traduce `reason`: cada consumidor lo hace en su `render`. Los motivos son propios de cada importación, y una primitiva que conozca los de todas deja de ser genérica.
- **No:** el filtro `language`. El diccionario real es de un solo idioma.
- **No:** ayuda de normalización en `drugCode`. El backend lo guarda literal, solo con `trim` (SPEC F18 §6), a diferencia de FE25a y FE25b.
- **Sí:** `staleTime` de 30 min. Este catálogo, a diferencia de `diagnosticTerm`, no crece por escrituras implícitas desde otras features.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Un ADMIN corrige una fila importada y la próxima importación deshace el cambio | Aviso de §3.5. `notes` sobrevive y sirve para dejar constancia de la corrección. |
| Dos `queryFn` distintas escriben la misma entrada de caché y acaban devolviendo formas distintas | Ambas devuelven `VaccineWhodrugDetail` ya desenvuelto. El test del paso 4 lo fija. Si una cambia, el test falla. |
| Un usuario pierde cambios al pulsar el sidebar con el formulario a medias | Límite aceptado (§6). `beforeunload` y los botones propios cubren los casos más comunes. |
| La migración de FE25b cambia su comportamiento visible | Ocurrió: FE25b ya estaba implementado. La migración conserva contadores, marcas, columnas y el enlace «Ver términos»; solo cambia dónde cae el foco (el título, no la región). Lo fijan los tests de la página. |
| Invalidar `['whodrugVaccine']` entera tras cada mutación dispara muchas recargas de niveles del árbol | Solo se recargan las consultas **montadas**. En esta pantalla el árbol no está montado, así que se marcan como obsoletas sin coste inmediato. |

---

## 8. Impacto en pantallas existentes

| Archivo | Antes | Después |
|---|---|---|
| `shared/config/navigation.ts` | `nav.items.whodrugVaccine` con `disabled: true` | Navegable a `/whodrug-vaccines` |
| `contracts/declared/vaccineWhodrug.ts` | Sin `appDetails` | Con `appDetails: AppDetails[] \| null` |
| `shared/hooks/useVaccineWhodrugTree.ts` | Única dueña de `['whodrugVaccine', …]` | Sin cambios de código; comparte la entrada de detalle con el recurso y recibe sus invalidaciones |
| `references/ARCHITECTURE.md` §4.3 | Trece primitivas | Catorce, con `<ImportReport>` |
| `CLAUDE.md` | «hoy son trece» | «hoy son catorce», con `<ImportReport>` en la enumeración |
| `references/specs/25b-diagnostic-term-maintenance.md` | `DiagnosticTermImportReport` local | Nota de enmienda: usa `<ImportReport>` |
| `features/diagnosticTerm/DiagnosticTermImportPage.tsx` | Pinta `DiagnosticTermImportReport` y mueve el foco con un `ref` | Pinta `<ImportReport>` con `key={submittedAt}` y «Ver términos» debajo |
| `features/diagnosticTerm/DiagnosticTermImportReport.tsx` y su test | Existen | Eliminados |
| `app/router.tsx` | — | Cinco rutas nuevas |

---

## Lo que **no** está en este spec

- Productos WHODrug: listado y sincronización (SPEC FE25d).
- Las rutas `006A`–`006E`, que siguen en `<WhodrugTreePicker>`.
- Migrar el router a `createBrowserRouter` para bloquear la navegación interna con cambios sin guardar.
- El filtro `language` y el filtro `isGeneric IS NULL`.
- La fusión de entradas duplicadas, el versionado del diccionario, elegir la hoja del libro, deshacer una importación y reactivar por importación.
- Migrar `GeoImportReport` a `<ImportReport>`.

Cada uno de esos, si aterriza, va en su propio spec.

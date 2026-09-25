# SPEC FE25d — Inspección y sincronización de medicamentos WHODrug

> **Estado:** Aprobado
> **Depende de:** SPEC FE25c (`<ImportReport>`; queda enmendado por este spec, §8), SPEC FE25b (flujo simular → ejecutar), SPEC FE19 (pantalla de `systemConfig`, destino del enlace de configuración), SPEC FE12b (`<WhodrugProductSearchField>`, consumidor del `006`), SPEC F56 del backend (`whodrugProduct`: espejo, buscador y sincronización)
> **Fecha:** 2026-09-25
> **Objetivo:** Dar al ADMIN un listado de inspección del espejo WHODrug en `/whodrug-products`, y al SUPERADMIN una página en `/whodrug-products/sync` para sincronizarlo con el API de la UMC.

---

## 1. Por qué existe este spec

Es el consumo de `ESAVI-WHODPROD-002B` y `ESAVI-WHODPROD-007`, especificados en el SPEC F56 del backend. Cierra la serie de catálogos clínicos (FE25a–d).

**A — El buscador de medicación concomitante busca en una tabla que nadie puede llenar.** `<WhodrugProductSearchField>` consume el `006` desde el paso de notificación (SPEC FE12b). Pero `whodrugProduct` solo se llena con el `007`, que no tiene cliente. Sin sincronización, el buscador responde vacío en todo despliegue, y la medicación se sigue escribiendo como texto libre, que es justo lo que SPEC F56 venía a resolver.

**B — Lo que entró no se puede comprobar.** SPEC F56 §3.5 creó el `002B` para eso, en sus propias palabras: poder comprobar qué entró en la última descarga «sin abrir una consola de `psql`». Hoy solo se puede con la consola.

**C — No es un catálogo como los otros tres.** `whodrugProduct` es un espejo de solo lectura de un estándar externo:
- no tiene `001`, `002A`, `003`, `004` ni `005`;
- su único listado es el `002B`, de ADMIN, y **siempre** incluye las filas retiradas del estándar.

Por eso la fábrica `createResource` no encaja: declararía mutaciones y una lectura por id sobre rutas que no existen. Tampoco hay entrada de menú, porque `navigation.ts` nunca la declaró.

**D — La sincronización nace apagada y depende de otra pantalla.** `ESAVI_WHODRUG_ENABLED` se siembra en `false`, y las credenciales se siembran vacías. La primera sincronización de cualquier despliegue responde 503. Sin un camino claro hacia la configuración (SPEC FE19), el SUPERADMIN ve un error que no sabe resolver.

**E — El informe no cuenta lo mismo.** La sincronización informa `downloaded`, `flattened` y `deactivated`, y no tiene `read`. La primitiva `<ImportReport>` de SPEC FE25c fijó seis contadores concretos. Como FE25c sigue en `Borrador`, se generaliza ahora en vez de crear un informe paralelo.

---

## 2. Alcance

**Dentro:**

- **El listado `/whodrug-products`**, con `WhodrugProductListPage.tsx` y `<RequireRole level={ADMIN}>`.
  - En `searchParams` lleva `name` (nombre comercial), `ingredient` (principio activo, original o traducido) y `page`.
  - No hay toggle: las filas retiradas se ven siempre, con el badge «Retirado del estándar».
- **`WhodrugProductSheet.tsx`**: un panel lateral que pinta la fila del listado por secciones, con la auditoría (`appDetails`) al final, solo para SUPERADMIN.
- **La página `/whodrug-products/sync`**, con `WhodrugProductSyncPage.tsx` y `<RequireRole level={SUPERADMIN}>`.
  - Se llega desde un botón «Sincronizar» en la cabecera del listado.
  - El formulario tiene un solo campo, `dictionaryVersion`.
  - Flujo: «Simular» y «Sincronizar», este último con confirmación. Si el espejo está vacío, la confirmación recomienda simular primero.
  - Muestra un aviso de no cerrar la pestaña mientras corre.
  - Los 503 `DISABLED` y `NOT_CONFIGURED` llevan un enlace a `/system-configs?scope=WHODRUG`.
- **`api.ts`**, con `useWhodrugProductList(params)` escrito a mano y `useSyncWhodrugProducts()`. **No usa `createResource`**, y es una desviación declarada.
- **`schemas.ts`**, con el schema del formulario de sincronización.
- **La generalización de `<ImportReport>`.** `counters` pasa a ser `{ key, label, value }[]`, y la nota de truncado usa un `rejectedTotal` explícito.
- **La enmienda a SPEC FE25c:** una nota tras su header que refleja la generalización.
- **Contratos:** `whodrugProduct/whodrugProduct.types.ts` entra en `SYNC_MAP`, y `contracts/declared/whodrugProduct.ts` gana la forma de la fila del `002B`.
- **Menú:** una entrada nueva, `nav.items.whodrugProduct`, en `clinicalCatalogs`, con icono `Pill` y `minLevel: ADMIN`. Además, las dos rutas de la pantalla.
- **El bloque i18n `whodrugProduct.*`** y `nav.items.whodrugProduct`, en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **El buscador `006`**, que ya consume `<WhodrugProductSearchField>` y no cambia.
- **Enlazar `notificationMedication` con el catálogo** mediante FK o resolución. SPEC F56 lo deja para otro spec.
- **Editar, dar de baja o reactivar filas a mano.** El backend no tiene esas rutas: la sincronización es la única escritura.
- **Programar la sincronización** (cron, aviso de estándar caducado) y la **sincronización asíncrona con progreso**. El backend no las tiene.
- **Enriquecer `vaccineWhodrug`** con las filas `J07` del espejo.
- **Filtrar por país, por ATC o por estado.** El `002B` no admite esos filtros.
- **Editar la configuración de WHODrug desde esta pantalla.** Se enlaza a SPEC FE19, que ya la resuelve.
- **Una página de detalle.** No existe un `003`, y la fila del listado ya viene completa.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/whodrug-products` | `features/whodrugProduct/WhodrugProductListPage.tsx` | `<RequireRole level={ADMIN}>` |
| Sincronización | `/whodrug-products/sync` | `features/whodrugProduct/WhodrugProductSyncPage.tsx` | `<RequireRole level={SUPERADMIN}>` |
| Fila | (panel lateral sobre el listado) | `features/whodrugProduct/WhodrugProductSheet.tsx` | la abre cualquiera que vea el listado |

**Orden en el router.** `/whodrug-products/sync` se declara antes que `/whodrug-products`.

**Menú.** Se añade una entrada nueva en `nav.groups.clinicalCatalogs`, **después** de `nav.items.whodrugVaccine`:

| Clave | Icono | Ruta | `minLevel` |
|---|---|---|---|
| `nav.items.whodrugProduct` | `Pill` | `/whodrug-products` | `ROLE_LEVELS.ADMIN` |

El `minLevel` es el rol real de `ESAVI-WHODPROD-002B`, el único listado. La sincronización no tiene `NavItem`.

**Cabecera del listado.** Tiene un solo botón, «Sincronizar con WHODrug», visible con `useCan(SUPERADMIN)`, que navega a `/sync`.

**La fila.** No hay menú de acciones, porque no existe ninguna mutación por fila. Hacer clic en la fila, o pulsar Enter, abre `WhodrugProductSheet`. El panel pinta seis secciones:

| Sección | Campos |
|---|---|
| Medicamento | `drugName`, `drugCode`, `optionName`, `medicinalProductId`, `isGeneric`, `isPreferred` |
| Clasificación | `atcs`, `drugAtcs` |
| Composición | `ingredient`, `ingredientTranslations`, `languageCode` |
| País y registro | `iso3Code`, `countryMedicinalProductId`, `maHolders`, `maHoldersMedicinalProductId` |
| Presentación | `form`, `formMedicinalProductId`, `strength`, `strengthMedicinalProductId` |
| Procedencia | `metadata`, como lista de pares clave–valor sin suponer sus claves; `rowHash`; `createdAt`, `updatedAt` y `deletedAt` |

Al final del panel va `<AuditTrail>` con `appDetails`, solo con `useCan(SUPERADMIN)`. Así se ven la retirada y la reactivación que escribe el `007`.

**No se muestra `optionNameSearch`.** Es una columna técnica del buscador: el mismo texto que `optionName`, en minúsculas y sin tildes.

### 3.2 Endpoints consumidos

```
GET   /api/whodrug-products/admin   ESAVI-WHODPROD-002B  ADMIN       listado de inspección (incluye retiradas)
POST  /api/whodrug-products/sync    ESAVI-WHODPROD-007   SUPERADMIN  sincronización con el API regional-drugs
```

**`GET /api/whodrug-products/search` (`ESAVI-WHODPROD-006`) no se consume aquí.** Es de `<WhodrugProductSearchField>`, que no cambia.

**Parámetros del `002B`:**

| Parámetro | Regla |
|---|---|
| `limit`, `offset` | `limit` entre 1 y 100 |
| `name` | Mínimo **3** caracteres; `Op.iLike` sobre `drugName` |
| `ingredient` | Mínimo **3** caracteres; `Op.iLike` sobre `ingredient` **o** `ingredientTranslations` |

- `name` e `ingredient` se combinan con AND.
- El orden es `drugName ASC, drugCode ASC`, fijo.
- **No tiene ni `code` ni `search`.** Es la excepción de SPEC F52: aquí el segundo filtro es `ingredient`.

**Cuerpo del `007`.** Es `application/json`, **no multipart**: `{ dictionaryVersion?: string, dryRun?: boolean }`. Aquí `dryRun` va como booleano de JSON, no como texto.

### 3.3 Tipos del contrato

- **`contracts/whodrugProduct.ts`**, con `npm run contracts:sync` y una entrada nueva en `SYNC_MAP` que lee `whodrugProduct/whodrugProduct.types.ts`. Trae:
  - `SyncWhodrugProductsInput`;
  - `WhodrugProductSyncReport` y `RejectedWhodrugProduct`;
  - `WhodrugProductListFilters`.

  `WhodrugProductFlatRow`, los siete `WhodrugApi*`, `WhodrugDownloadConfig` y `WhodrugSearchPolicy` también llegan, pero no se usan: son tipos internos del backend. Y `WhodrugSearchOption` duplica `WhodrugProductSearchRow`, así que tampoco se usa.
- **`contracts/declared/whodrugProduct.ts`** conserva `WhodrugProductSearchRow` y `WhodrugProductSearchResult`, y **gana `WhodrugProductRow`**, la forma de la fila del `002B` según SPEC F56 §3.7:
  - `whodrugProductId`, `rowHash`, `drugCode`, `drugName`, `drugAtcs`, `medicinalProductId`, `atcs`;
  - `ingredient`, `ingredientTranslations`, `languageCode`;
  - `iso3Code`, `countryMedicinalProductId`, `maHolders`, `maHoldersMedicinalProductId`;
  - `form`, `formMedicinalProductId`, `strength`, `strengthMedicinalProductId`;
  - `isGeneric: boolean`, `isPreferred: boolean`;
  - `optionName`, `optionNameSearch`, `metadata: Record<string, unknown>`;
  - `isActive`, `createdAt`, `updatedAt`, `deletedAt`, `appDetails`.

  Se reconcilia contra `esavi-backend/src/models/whodrugProduct.model.ts`.
- **`PaginatedResponse<WhodrugProductRow>`** para `{ count, rows }`, desde `contracts/declared/pagination.ts`.

### 3.4 Contrato de estado

**Listado:**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Nombre comercial | URL | `searchParams.name` | Con debounce. Con menos de 3 caracteres no se envía. Al cambiar, se borra `page`. |
| Principio activo | URL | `searchParams.ingredient` | Igual que `name`. |
| Página | URL | `searchParams.page` | Si falta, vale 1. |
| Tamaño de página | Zustand | `preferences.pageSize` | Preferencia global que ya existe. |
| Listado | TanStack Query | `['whodrugProduct', 'list', { limit, offset, name, ingredient }]` | `staleTime` de 30 min: solo lo cambia el `007`, que invalida la clave. |
| Fila abierta en el panel | Componente | `useState<string \| null>` con el `whodrugProductId` | **Solo el id.** La fila se toma de `listQuery.data.rows` en cada render, sin copiarla. Si la página cambia y el id ya no está en `rows`, el panel se cierra. |
| Búferes de tecleo | Componente | `useState` | La fuente de verdad es `searchParams`. |

**Sincronización:**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `dictionaryVersion` | React Hook Form | `useForm` | Opcional. |
| ¿El espejo está vacío? | TanStack Query | `['whodrugProduct', 'list', { limit: 1, offset: 0 }]` → `count === 0` | Decide si la confirmación recomienda simular. Es otra entrada de la misma familia de claves, no una copia. |
| Informe (simulado o definitivo) | TanStack Query | `useMutation().data` | Nunca en `useState`. |
| Petición en curso | TanStack Query | `useMutation().isPending` | Deshabilita los botones y muestra el aviso. |
| Confirmación abierta | Componente | `useState` | Efímero. |

**Invalidación.** Tras el `007` con `dryRun: false`, `useSyncWhodrugProducts` invalida `['whodrugProduct']` entera. Eso refresca:
- el listado;
- la comprobación de espejo vacío;
- **`['whodrugProduct', 'search', …]`** del `<WhodrugProductSearchField>` (`notification/api.ts:500`), así que el buscador de la notificación ofrece lo sincronizado sin recargar.

Con `dryRun: true` no se invalida nada.

**Excepción declarada: sin `createResource`.** `useWhodrugProductList` se escribe a mano con `useQuery` sobre `client.get('whodrug-products/admin', { params })`. `CONVENTIONS.md` §5 prohíbe los hooks de CRUD escritos a mano, pero aquí no hay CRUD: solo una lectura de administración. La fábrica exigiría `path` y `002A`, y expondría `useCreate`, `useUpdate`, `useRemove` y `useOne` sobre rutas que no existen.

### 3.5 Formularios y validación

**Formulario de sincronización.** Vive en `features/whodrugProduct/schemas.ts`, como `syncWhodrugProductsSchema`.

| Campo | Control | Regla |
|---|---|---|
| `dictionaryVersion` | `<Input>` | Opcional. Ayuda: «Ejemplo: WHODrug Global 2025 Sep 1» |

- **«Simular»** envía `{ dictionaryVersion, dryRun: true }`.
- **«Sincronizar»** abre la confirmación y envía `{ dictionaryVersion, dryRun: false }`.
- **Cambiar `dictionaryVersion` tras simular** descarta el informe simulado con `mutation.reset()`.
- **La confirmación** dice «Se descargará el estándar completo; puede tardar varios minutos. Las filas que ya no estén en el estándar se marcarán como retiradas». Si el espejo está vacío (§3.4), añade: «Es la primera sincronización: se recomienda simular antes».

**Filtros del listado.** No usan schema Zod: son dos cajas de texto con debounce, y la regla del mínimo de 3 caracteres se aplica al escribir en la URL. Por debajo del mínimo, la ayuda del campo dice «Escribe al menos 3 caracteres» y el parámetro no se envía.

**Errores del servidor.** Los códigos se añaden a `shared/api/errorMessages.ts`, junto a los `WHODPROD_006_*` que ya existen:

| `code` | Estado | Destino |
|---|---|---|
| `WHODPROD_007_DISABLED` | 503 | Alert en la página: «La sincronización con WHODrug está desactivada en este despliegue», con el enlace «Revisar la configuración de WHODrug» → `/system-configs?scope=WHODRUG` |
| `WHODPROD_007_NOT_CONFIGURED` | 503 | Alert: «Faltan las credenciales o la URL de WHODrug», con el mismo enlace |
| `WHODPROD_007_DOWNLOAD_FAILED` | 502 | Alert: «No se pudo descargar el estándar desde la UMC (error, formato inesperado o tiempo agotado). No se escribió nada» |
| `WHODPROD_007_ALREADY_RUNNING` | 409 | Alert: «Ya hay una sincronización en curso; espera a que termine» |
| `WHODPROD_007_SYNC_FAILED` | 500 | Alert: «La sincronización falló; los lotes ya escritos se conservan y puedes volver a lanzarla» |
| `WHODPROD_002B_FETCH_FAILED` | 500 | Estado de error del listado |
| Cualquier otro | — | Toast genérico por `code`. Nunca se muestra `errors` |

El enlace a `/system-configs` solo se renderiza con `useCan(SUPERADMIN)`. Siempre se cumple, porque la página es SUPERADMIN, pero la condición queda explícita.

### 3.6 Estados de la pantalla

**Listado:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de `<ResourceTable>` | — |
| Vacío (sin datos) | «El espejo de WHODrug está vacío; aún no se ha sincronizado». Con SUPERADMIN, además, el botón «Sincronizar» | `whodrugProduct.list.empty` |
| Vacío (con filtros) | Texto y «Limpiar filtros», que borra `name`, `ingredient` y `page` | `whodrugProduct.list.emptyFiltered`, `whodrugProduct.list.clearFilters` |
| Error | Mensaje por `code` y «Reintentar» | `common.table.retry` |
| Sin permiso | No se llega: el `NavItem` y la ruta son ADMIN | — |

**Sincronización:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Inicial | El formulario y los dos botones habilitados | — |
| En curso | Botones deshabilitados, indicador indeterminado y aviso «No cierres esta pestaña; descargar y procesar el estándar completo puede tardar varios minutos» | `whodrugProduct.sync.running` |
| Informe simulado o definitivo | `<ImportReport>` con los contadores de la sincronización. El definitivo lleva además el enlace «Ver medicamentos» | `whodrugProduct.sync.viewProducts` |
| Error | Según la tabla de §3.5 | — |
| Sin permiso | El guard SUPERADMIN redirige, y el botón de acceso no se renderiza | — |

**Contadores que pasa a `<ImportReport>`,** en este orden: `downloaded`, `flattened`, `inserted`, `updated`, `unchanged`, `deactivated`, `invalid` y `duplicated`.
- `rejectedTotal` = `invalid + duplicated`.
- La tabla de rechazos tiene tres columnas:
  - `drugCode` («—» si es `null`);
  - `reason`, traducido;
  - `column`, solo en `VALUE_TOO_LONG`.

### 3.7 Responsividad y accesibilidad

- **Tarjetas por debajo de `md`:**
  - `primary` → `drugName`;
  - `secondary` → `ingredientTranslations`;
  - `meta` → `drugCode · iso3Code`.

  Las filas retiradas llevan `isRowInactive` y el badge.
- **Columnas en escritorio:** `drugName`, `drugCode`, `ingredientTranslations`, `atcs`, `iso3Code`, `maHolders`, `form · strength` y estado. Los textos largos se truncan, con el texto completo en `title`.
- **Filtros en móvil:** los dos campos se apilan a todo el ancho, sin `Sheet`, porque son solo dos.
- **Panel lateral:** a pantalla completa por debajo de `md`, con las secciones como `<section>` y un encabezado por i18n.
- **Accesibilidad:**
  - Objetivos táctiles de 44px y `dvh`.
  - La fila es alcanzable con Tab y abre el panel con Enter.
  - Al cerrar el panel, el foco vuelve a la fila.
  - El aviso de «en curso» está en `aria-live="polite"`.

### 3.8 Claves i18n nuevas

**Bloque `whodrugProduct`,** en los tres idiomas:

| Grupo | Claves |
|---|---|
| `list.*` | `title`, `empty`, `emptyFiltered`, `clearFilters`, `sync` |
| `filters.*` | `name`, `nameHint`, `ingredient`, `ingredientHint`, `minChars` |
| `sheet.*` | `title`, `close`, `audit`, `emptyValue` |
| `sections.*` | `product`, `classification`, `composition`, `countryRegistration`, `presentation`, `provenance` |
| `fields.*` | las 18 columnas del estándar, más `optionName`, `rowHash`, `metadata`, `createdAt`, `updatedAt`, `deletedAt` e `isActive` |
| `status.*` | `active`, `retired`, `generic`, `preferred` |
| `sync.*` | `title`, `back`, `dictionaryVersion`, `dictionaryVersionHint`, `simulate`, `run`, `confirmTitle`, `confirmBody`, `confirmFirstRun`, `confirmAction`, `running`, `viewProducts`, `configLink` |
| `sync.counters.*` | `downloaded`, `flattened`, `deactivated` (los otros cinco los pone `common.importReport`) |
| `sync.columns.*` | `drugCode`, `reason`, `column` |
| `sync.reasons.*` | `EMPTY_DRUG_CODE`, `EMPTY_DRUG_NAME`, `EMPTY_OPTION_NAME`, `VALUE_TOO_LONG`, `DUPLICATE_IN_DOWNLOAD` |
| `errors.*` | los cinco `WHODPROD_007_*` y `WHODPROD_002B_FETCH_FAILED` |

**Otras claves:**
- **`nav.items.whodrugProduct`**: «Medicamentos WHODrug».
- **`common.importReport.read`** se mantiene, y se usa en FE25b y en FE25c. La sincronización no lo pasa.

### 3.9 Generalización de `<ImportReport>` (enmienda a SPEC FE25c §3.9)

| Prop | Antes (FE25c) | Después |
|---|---|---|
| `counters` | `{ read, inserted, updated, unchanged, invalid, duplicated }` | `{ key: string; label: string; value: number }[]`, pintados en el orden recibido |
| Regla de truncado | `invalid + duplicated > rejected.length` | Nueva prop `rejectedTotal: number`; la nota aparece si `rejectedTotal > rejected.length` |
| `dryRun`, `rejected`, `rejectedColumns`, `children` | — | Sin cambios |

- **Cada consumidor** construye su lista de contadores con sus etiquetas. Las comunes salen de `common.importReport.*`, y las propias de su bloque.
- **FE25b y FE25c** pasan sus seis contadores y `rejectedTotal = invalid + duplicated`, así que su comportamiento no cambia.
- **La primitiva** sigue sin saber qué importación pinta.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y se puede committear por separado. Antes del paso 1 se cargan `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` (`CONVENTIONS.md` §10.6).

**Orden entre specs.** Conviene implementar FE25c antes que este. Si FE25c ya está implementado cuando se ejecute este spec, el paso 1 modifica el componente y a sus consumidores. Si no, el paso 1 solo deja la nota, y FE25c nace ya generalizado.

1. **Generalizar `<ImportReport>` y enmendar SPEC FE25c.**
   - En la cabecera de `25c-whodrug-vaccine-maintenance.md` se inserta la nota «**Enmendado por SPEC FE25d (2026-09-25).**» con la tabla de §3.9. La nota incluye una línea que la hace extensiva al uso de FE25b.
   - Si `shared/components/ImportReport.tsx` ya existe:
     - `counters` pasa a ser una lista;
     - se añade `rejectedTotal`;
     - se adaptan sus consumidores existentes y `ImportReport.test.tsx`.

   *Verificación:*
   - La nota está tras el header de FE25c, y su estado no cambia.
   - Si el componente existe, sus tests pasan con contadores en lista.
   - Con `rejectedTotal: 30` y 20 rechazos aparece la nota de truncado.
   - Los contadores se pintan en el orden recibido.

2. **Contratos.**
   - Se añade `{ source: 'whodrugProduct/whodrugProduct.types.ts', dest: 'whodrugProduct.ts' }` a `SYNC_MAP` y se ejecuta `npm run contracts:sync`.
   - `WhodrugProductRow` va en `contracts/declared/whodrugProduct.ts`, reconciliada contra `whodrugProduct.model.ts`.

   *Verificación:*
   - `contracts/whodrugProduct.ts` exporta `WhodrugProductSyncReport` y `SyncWhodrugProductsInput`.
   - `npx tsc --noEmit -p tsconfig.app.json` no da errores nuevos.
   - `WhodrugProductSearchField` sigue compilando.

3. **Consultas.** En `features/whodrugProduct/api.ts`:
   - `useWhodrugProductList({ page, pageSize, name, ingredient })` (`ESAVI-WHODPROD-002B`). No envía `name` ni `ingredient` si tienen menos de 3 caracteres, y usa `staleTime` de 30 min.
   - `useSyncWhodrugProducts()` (`ESAVI-WHODPROD-007`), un `POST` JSON que invalida `['whodrugProduct']` solo cuando `dryRun` es falso.
   - Un comentario que declara la excepción a `createResource` y cita `006` como consumido por `notification/api.ts`.
   - Se prueba en `api.test.tsx`.

   *Verificación:*
   - `name: 'pa'` no aparece en la query y `name: 'par'` sí.
   - Con `dryRun: true` no se invalida nada.
   - Con `dryRun: false` se marca inválida `['whodrugProduct', 'search', 'ibu']`.

4. **Schemas y mapa de errores.**
   - `schemas.ts` con `syncWhodrugProductsSchema`.
   - Los seis códigos de §3.5 se añaden a `shared/api/errorMessages.ts`.
   - Se prueba en `schemas.test.ts`.

   *Verificación:* `dictionaryVersion` vacío se omite del payload, y cada código nuevo resuelve a una clave existente.

5. **Claves i18n** de §3.8, más `nav.items.whodrugProduct`, en los tres idiomas.
   *Verificación:* `npm run i18n:check` sale en 0.

6. **`WhodrugProductSheet.tsx`.**
   - Recibe la fila por props y pinta las seis secciones, con «—» en los campos vacíos.
   - `metadata` se muestra como pares clave–valor.
   - `<AuditTrail>` aparece solo con SUPERADMIN.
   - El foco vuelve a la fila al cerrar.
   - Se prueba en `WhodrugProductSheet.test.tsx`.

   *Verificación:*
   - Con ADMIN no aparece la auditoría, y con SUPERADMIN sí.
   - Una fila con `metadata: { dictionaryVersion: 'X' }` muestra el par.
   - `optionNameSearch` no aparece.

7. **`WhodrugProductListPage.tsx`.**
   - `name`, `ingredient` y `page` en `searchParams`, con debounce y la ayuda de 3 caracteres.
   - Las columnas, la tarjeta, `isRowInactive` y el badge «Retirado del estándar».
   - El panel se abre con el id en `useState` y la fila se resuelve desde `rows`.
   - El botón «Sincronizar» aparece con SUPERADMIN.
   - Se prueba en `WhodrugProductListPage.test.tsx`.

   *Verificación:*
   - Escribir «para» en principio activo envía `ingredient=para` una sola vez, y recargar lo conserva.
   - Con ADMIN no se ve «Sincronizar».
   - Cambiar de página con el panel abierto lo cierra.
   - No se renderiza ningún toggle de inactivos.

8. **`WhodrugProductSyncPage.tsx`.**
   - `dictionaryVersion`, «Simular», «Sincronizar» con confirmación, y la recomendación de simular si el espejo está vacío.
   - El aviso `aria-live` mientras corre la petición.
   - `<ImportReport>` con los ocho contadores y las tres columnas de rechazo.
   - Los alerts de §3.5, con el enlace a `/system-configs?scope=WHODRUG`.
   - Se prueba en `WhodrugProductSyncPage.test.tsx`.

   *Verificación:*
   - Un 503 `WHODPROD_007_DISABLED` muestra el alert con el enlace a `/system-configs?scope=WHODRUG`.
   - Con `count: 0` en el `002B`, la confirmación recomienda simular; con `count: 5`, no.
   - «Simular» envía `dryRun: true` como booleano JSON.
   - Un 409 `ALREADY_RUNNING` muestra su alert.

9. **Rutas y menú.**
   - `/whodrug-products/sync` bajo `<RequireRole level={SUPERADMIN}>`, declarada antes que `/whodrug-products`, que va bajo ADMIN.
   - `nav.items.whodrugProduct` en `clinicalCatalogs`, tras `whodrugVaccine`, con `Pill` y `minLevel: ADMIN`.
   - Se añade `router.whodrugProduct.test.tsx`.

   *Verificación:*
   - Con USER, el ítem no aparece y `/whodrug-products` redirige.
   - Con ADMIN, el ítem aparece y `/whodrug-products/sync` redirige.
   - Con SUPERADMIN, las dos rutas abren.

---

## 5. Criterios de aceptación

- [ ] Las dos rutas de §3.2 se consumen, y cada una aparece citada con su código `ESAVI-WHODPROD-*` en `api.ts`. El `006` sigue consumido solo por `notification/api.ts`.
- [ ] Artefactos de `CONVENTIONS.md` §5:
  - tipos (`SYNC_MAP` más `WhodrugProductRow`);
  - `api.ts` con la excepción declarada;
  - `schemas.ts`;
  - `WhodrugProductListPage.tsx`;
  - rutas;
  - `NavItem`.

  Además, `WhodrugProductSheet.tsx` y `WhodrugProductSyncPage.tsx`. No hay `DetailPage`, porque no existe `003`.
- [ ] `grep -n "createResource" src/features/whodrugProduct/` no devuelve resultados.
- [ ] `<ImportReport>` recibe `counters` como lista y `rejectedTotal`, y FE25c lleva la nota de enmienda.
- [ ] Aplicar `name` e `ingredient` y recargar conserva la vista, y el enlace la reproduce en otra sesión. Con menos de 3 caracteres no se envía el parámetro.
- [ ] Las filas retiradas aparecen con tinte y badge, sin toggle.
- [ ] El panel lateral muestra la fila del listado, sin ninguna petición adicional.
- [ ] El `POST` del `007` es JSON, con `dryRun` booleano.
- [ ] Un 503 `DISABLED` o `NOT_CONFIGURED` ofrece el enlace a `/system-configs?scope=WHODRUG`.
- [ ] Tras una sincronización real, el listado y el buscador de medicación de la notificación muestran lo sincronizado sin recargar.
- [ ] Con el espejo vacío, la confirmación recomienda simular.
- [ ] `grep -rn "response.data.data" src/features/whodrugProduct/` no devuelve resultados.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El listado, el panel, la página de sincronización y el informe se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/whodrugProduct/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `drugName`, `ingredientTranslations` y `drugCode · iso3Code`. El panel ocupa toda la pantalla, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER`, el menú no ofrece «Medicamentos WHODrug» y `/whodrug-products` redirige. Con `ADMIN`, no se ofrece «Sincronizar» y `/sync` redirige. Un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible queda fuera de i18n, incluidos los contadores, los motivos de rechazo, los `aria-label` y los textos de los alerts. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4:
  - el panel guarda solo el id;
  - el informe vive solo en `useMutation().data`;
  - ningún filtro queda fuera de `searchParams`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** entrada de menú nueva con `minLevel: ADMIN`, que es el rol del `002B`, el único listado. USER no tiene nada que ver aquí: su contacto con el catálogo es el buscador de la notificación.
- **Sí:** hooks escritos a mano, sin `createResource`. No hay CRUD, y la fábrica declararía mutaciones y un `useOne` sobre rutas inexistentes.
- **No:** forzar `createResource` con opciones vacías. Una API que ofrece `useCreate` sobre un espejo de solo lectura invita a usarla.
- **Sí:** un panel lateral alimentado por la fila del listado. No existe un `003`, y la fila del `002B` ya viene completa.
- **No:** una página de detalle. Sin `003` no hay forma de cargarla por URL sin volver a listar.
- **Sí:** guardar solo el id de la fila abierta y resolverla desde `rows` en cada render. Copiar la fila a `useState` crearía una segunda capa.
- **Sí:** mostrar siempre las filas retiradas, con badge y sin toggle. El `002B` no tiene variante sin inactivos, y ver lo que la última sincronización retiró es parte de la inspección.
- **Sí:** los dos filtros separados, `name` e `ingredient`, combinados con AND, como los aplica el backend.
- **No:** una sola caja que envíe los dos parámetros, como en FE25a–c. Aquí el backend los combina con AND, no con OR, y una caja única exigiría coincidir en ambos.
- **Sí:** la sincronización en su propia página, a la que se llega desde la cabecera, igual que las importaciones de FE25b y FE25c.
- **Sí:** «Sincronizar» disponible sin haber simulado, y la confirmación recomienda simular cuando el espejo está vacío. Una simulación también descarga el volcado entero, y obligarla duplicaría una espera de minutos en cada ejecución.
- **Sí:** enlazar a `/system-configs?scope=WHODRUG` ante `DISABLED` y `NOT_CONFIGURED`. El interruptor se siembra apagado, y la primera sincronización de todo despliegue acaba ahí.
- **No:** activar WHODrug o editar sus credenciales desde esta pantalla. SPEC FE19 ya resuelve la configuración, con su historial y su auditoría.
- **Sí:** generalizar `<ImportReport>` con contadores en lista y `rejectedTotal`, y enmendar FE25c mientras sigue en `Borrador`.
- **No:** un `WhodrugProductSyncReport` local. Duplicaría la tabla de rechazos, el truncado y la marca de simulación a los dos días de extraerlos.
- **Sí:** los códigos nuevos en `shared/api/errorMessages.ts`, junto a los `WHODPROD_006_*`. Es el mapa que ya existe para esta familia.
- **No:** mostrar `optionNameSearch`. Es una columna técnica del buscador y no aporta nada a la inspección.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| La sincronización tarda más que el timeout de un proxy intermedio y el cliente no recibe el informe | `client.ts` no tiene timeout, y el aviso pide no cerrar la pestaña. El backend procesa por lotes con transacción propia, así que lo escrito queda escrito y relanzar es seguro. La salida asíncrona es un spec del backend (SPEC F56 §7). |
| El usuario cierra la pestaña y relanza mientras la primera sigue corriendo en el servidor | El 409 `ALREADY_RUNNING` lo explica. Hay que esperar a que termine. |
| Una sincronización con una descarga parcial retira en masa filas que sí están en el estándar | Riesgo del backend: un cuerpo que no es un array se rechaza con 502 antes de escribir. En el cliente, la confirmación avisa de las retiradas y el informe muestra `deactivated`. Simular antes lo hace visible. |
| El `002B` con cientos de miles de filas y filtros de `iLike` responde lento | Los filtros exigen 3 caracteres y `limit` está limitado a 100. Es un listado de inspección de baja frecuencia. |
| Enmendar FE25c después de que alguien haya empezado a implementarlo | El paso 1 cubre los dos casos: si el componente existe, lo adapta con sus consumidores. |

---

## 8. Impacto en pantallas existentes

| Archivo | Antes | Después |
|---|---|---|
| `shared/config/navigation.ts` | Sin entrada de medicamentos | `nav.items.whodrugProduct`, ADMIN, en `clinicalCatalogs` |
| `scripts/syncContracts.mjs` | Sin `whodrugProduct` en `SYNC_MAP` | Con la entrada |
| `contracts/declared/whodrugProduct.ts` | Solo la forma del `006` | Gana `WhodrugProductRow` |
| `shared/api/errorMessages.ts` | Dos `WHODPROD_006_*` | Seis códigos más, del `007` y del `002B` |
| `shared/components/ImportReport.tsx` (si existe) | `counters` fijos | `counters` en lista y `rejectedTotal` |
| `references/specs/25c-whodrug-vaccine-maintenance.md` | §3.9 con contadores fijos | Nota de enmienda en la cabecera |
| `shared/components/WhodrugProductSearchField.tsx` | — | Sin cambios de código. Recibe la invalidación tras sincronizar |
| `app/router.tsx` | — | Dos rutas nuevas |

---

## Lo que **no** está en este spec

- El buscador `006` y cualquier cambio en `<WhodrugProductSearchField>`.
- Enlazar `notificationMedication` con el catálogo.
- Editar, dar de baja o reactivar productos a mano.
- Programar la sincronización y la sincronización asíncrona con progreso.
- Enriquecer `vaccineWhodrug` con las filas `J07`.
- Filtrar por país, ATC o estado.
- Editar la configuración de WHODrug desde esta pantalla.
- Una página de detalle del producto.

Cada uno de esos, si aterriza, va en su propio spec.

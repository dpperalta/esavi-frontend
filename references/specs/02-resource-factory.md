# SPEC FE02 — Fábrica de recursos y primitivas de pantalla

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell y autenticación)
> **Fecha:** 2026-08-31
> **Objetivo:** Escribir una sola vez el CRUD que comparten las ~45 entidades del backend —`createResource`, `<ResourceTable>`, `<ResourceForm>`, `<AuditTrail>`— y validarlo construyendo `catalogType` de punta a punta.

---

## 1. Por qué existe este spec

SPEC FE01 dejó el shell en pie: cliente HTTP con envelope desenvuelto, cola de refresh, `<RequireRole>`, `useCan()`, sidebar por rol, temas y preferencias. Lo que **no** dejó, y lo declaró explícitamente en su sección final, es `createResource` y las primitivas compartidas. Hoy `src/features/` tiene dos carpetas —`auth` y `home`— y ninguna consume una entidad de negocio: `src/shared/api/client.ts` nunca ha hecho un `GET` de listado paginado.

Ese es el problema que resuelve este spec. `ARCHITECTURE.md` §4 es tajante: con ~45 entidades de contrato idéntico, la decisión central no es la librería de UI, es **no escribir 45 veces el mismo CRUD**. Y §12 avisa de la consecuencia de equivocarse: «si la fábrica de recursos y las primitivas salen bien, los hitos 2 y 3 son configuración; si salen mal, se arrastra el error 45 veces».

Se construye contra `catalogType` porque es la entidad más pequeña del inventario —`code`, `name`, `description`, `sortOrder`— y porque es dependencia de `catalogItem`, que a su vez alimenta `<CatalogSelect>` y decenas de campos del modelo. Validar la fábrica con la entidad más simple es lo que permite que FE03, FE04 y FE05 sean declaraciones.

**Cinco hallazgos verificados contra el backend cambian el diseño que asume `ARCHITECTURE.md` §4.2.** Se documentan aquí porque cada uno, ignorado, produce un error replicado 45 veces:

**A — El listado no devuelve un array, devuelve `{ count, rows }`.** Los servicios usan `findAndCountAll` y el controlador mete ese objeto entero en `data` (`esavi-backend/src/services/catalogType.service.ts:73`, `catalogType.controller.ts:35`). El envelope real de un listado es `{ ok, message, data: { count, rows } }`. Sin `count` no hay paginación en servidor, así que la forma es la correcta — pero tiparla como `T[]` rompe la primera pantalla.

**B — Hay dos patrones de listado, no uno.** El inventario tiene 40 entidades con el par `002A` / `002B` sobre `/…` y `/…/admin`. Tres no lo tienen: `ESAVI-CATTYPE-002`, `ESAVI-GEOLOC-002` y `ESAVI-GEOLVL-002` son ruta única, y el controlador decide por rol con `canViewInactive(req.user)` (`geoLocation.controller.ts:34`). En esas tres el cliente **no puede ofrecer toggle de inactivos**: el servidor ya decidió y no acepta que lo contradigas. `ARCHITECTURE.md` §4.2 asume `adminPath` siempre. Las tres excepciones son justo del hito 2.

**C — `canViewInactive` es SUPERADMIN, no ADMIN.** `esavi-backend/src/helpers/permissions.helper.ts:24` compara contra `[SUPERADMIN]`. Pero las rutas `/admin` del inventario exigen **ADMIN**. De ahí que en las entidades duales un ADMIN sí vea inactivas —lo permite el guard de ruta, y el servicio `002B` no vuelve a filtrar— y en las tres de ruta única no las vea nunca. Replicar «SUPERADMIN» a secas sería tan erróneo como replicar «ADMIN».

**D — El listado hijo va por FK en la ruta, no por query.** `catalog-items/type/:id`, `catalog-items/admin/type/:id`, `health-facilities/location/:id`. La fábrica necesita el concepto de listado con padre desde el primer día, con la clave de caché de `CONVENTIONS.md` §6.3: `['catalogItem', 'byType', typeId]`.

**E — El listado de `catalogType` no acepta búsqueda ni orden.** `catalogTypeListValidator` sólo admite `limit` y `offset`; el orden lo fija el servidor (`sortOrder ASC`, más `name ASC` en la variante admin). Y `CONVENTIONS.md` §6.5 prohíbe filtrar u ordenar en memoria. `<ResourceTable>` nace, por tanto, sin buscador y sin cabeceras ordenables.

---

## 2. Alcance

**Dentro:**

- **`createResource`** en `src/shared/api/createResource.ts`: fábrica que devuelve `useList`, `useOne`, `useCreate`, `useUpdate`, `useDeactivate` y `useActivate`, con las invalidaciones de caché ya cableadas.
- **Los dos patrones de listado del hallazgo B**, declarados con `inactiveMode: 'adminPath' | 'serverDecides'`, y el listado con padre del hallazgo D.
- **`PaginatedResponse<T>`** en `src/contracts/declared/pagination.ts` — la forma `{ count, rows }` del hallazgo A.
- **`<ResourceTable>`** en `src/shared/components/ResourceTable.tsx`: paginación en servidor, los cuatro estados de pantalla, toggle de inactivos según patrón y rol, colapso a tarjetas por debajo de `md` con campos marcados, y el hueco previsto —desactivado— para búsqueda y orden.
- **`<ResourceForm>`** en `src/shared/components/ResourceForm.tsx`: React Hook Form + Zod, con mapeo de los `code` de error del backend a sus campos.
- **`<AuditTrail>`** en `src/shared/components/AuditTrail.tsx`: lector del array `appDetails` de cualquier fila, en panel lateral.
- **`shared/api/errorMessages.ts`**: mapa de `code` a clave i18n para el toast, con reserva al `message` ya traducido del backend.
- **`catalogType` de punta a punta**: los seis artefactos de `CONVENTIONS.md` §5, listado en `/catalog-types`, formulario en diálogo, auditoría en panel lateral, baja y reactivación.
- **`pageSize` en `preferencesStore`** con selector de 10/25/50/100 en `<ResourceTable>`.
- Los componentes de shadcn que faltan y que las primitivas necesitan: `table`, `alert-dialog`, `select`, `textarea`, `form`, `pagination`, `switch`.
- Claves i18n en `common.*` para todo lo que pinta la primitiva, y en `catalogType.*` para lo propio de la entidad, **en los tres idiomas**.

**Fuera de alcance (otros specs):**

- **`<CatalogSelect>`** — nace en FE03, con `catalogItem`, que es lo que la alimenta.
- **`<GeoLocationPicker>`** — nace en FE04, con `geoLocation`. Escribir hoy dos primitivas contra un backend que nunca se ha consumido es adivinar.
- **`catalogItem`**, con su maestro-detalle, su listado por `/type/:id` y su importador `ESAVI-CATITEM-006` — FE03.
- **Búsqueda por texto y orden por columna** en `<ResourceTable>`. El hueco existe en la API de la primitiva; el comportamiento llega cuando algún endpoint lo soporte (hallazgo E).
- **Selección múltiple y acciones en lote.** Ningún endpoint del inventario acepta un lote.
- **`tableColumns` y `density`** en preferencias. SPEC FE01 ya los aplazó; sólo entra `pageSize`.
- **El purgado `005C`** (`DELETE /purge/:id`, SUPERADMIN), que existe en algunas entidades pero no en `catalogType`.
- **La paleta de comandos**, que sigue pendiente desde FE01.

---

## 3. Diseño

### 3.1 La fábrica de recursos

`src/shared/api/createResource.ts`. Una entidad nueva es una declaración, no una carpeta de archivos.

```ts
interface ResourceConfig<T> {
  key: string;            // 'catalogType' — primera posición de toda clave de caché
  path: string;           // 'catalog-types' — el kebab-plural vive aquí y en ningún otro sitio
  idField: keyof T;       // 'catalogTypeId' — el backend no usa `id`
  inactiveMode: 'adminPath' | 'serverDecides';
  adminPath?: string;     // obligatorio con 'adminPath'; prohibido con 'serverDecides'
  parent?: { operation: string; segment: string; adminSegment?: string };
  staleTime?: number;     // 30 min en catálogos (CONVENTIONS.md §6.3)
  hasActivate?: boolean;  // false cuando la entidad no expone 005B
}
```

**`idField` no es un detalle.** La clave primaria del backend es `catalogTypeId`, `healthFacilityId`, `esaviCaseId` — nunca `id`, aunque la ruta sea `/:id`. `<ResourceTable>` la necesita para la `key` de React y para construir los enlaces.

**Los dos modos de inactivas** son el hallazgo B:

| `inactiveMode` | Qué hace `useList` | Toggle en `<ResourceTable>` |
|---|---|---|
| `'adminPath'` | Llama a `path` o a `adminPath` según el toggle | Visible desde nivel ADMIN |
| `'serverDecides'` | Llama siempre a `path`; el backend decide por rol | **No existe** |

Con `'serverDecides'` la tabla muestra, sólo para SUPERADMIN, una nota fija (`common.table.serverDecidesInactive`) explicando que el listado ya incluye las inactivas y no se puede desactivar esa vista. Es la única forma honesta de explicar por qué aparecen filas dadas de baja sin un control que las quite.

Hooks devueltos, con su código de operación citado en la declaración (`CONVENTIONS.md` §6.4):

| Hook | Verbo | Operación |
|---|---|---|
| `useList(params)` | `GET` | `002` / `002A` / `002B` según modo |
| `useOne(id)` | `GET /:id` | `003` |
| `useCreate()` | `POST` | `001` |
| `useUpdate()` | `PUT /:id` | `004` |
| `useDeactivate()` | `DELETE /:id` | `005A` |
| `useActivate()` | `PATCH /activate/:id` | `005B`, sólo si `hasActivate` |

`useList(params)` recibe `{ page, pageSize, includeInactive, parentId }` y traduce a `limit` = `pageSize`, `offset` = `(page - 1) * pageSize`. **El cliente nunca pagina en memoria.**

**Las cuatro mutaciones invalidan la clave raíz `[key]`**, no claves enumeradas una a una. Es lo que hace que la primera posición sea el nombre de la entidad del backend (`CONVENTIONS.md` §6.3): invalidar `['catalogType']` alcanza a la vez el listado, el detalle y cualquier listado por padre, sin que la fábrica sepa qué pantallas existen.

**El `PUT` envía el objeto completo.** El backend hace el update diferencial (`CONVENTIONS.md` §6.5); la fábrica no calcula ningún diff, y **nunca incluye `isActive` en el cuerpo** — ver §7.

### 3.2 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/catalog-types` | `features/catalogType/CatalogTypeListPage.tsx` | `<RequireRole level={USER}>` |

No hay página de detalle. El formulario de alta y edición es un diálogo (`CatalogTypeFormDialog.tsx`) y la auditoría un panel lateral (`CatalogTypeAuditSheet.tsx`), ambos abiertos desde el listado. Con cuatro campos, una página de detalle es un clic de más.

En `shared/config/navigation.ts`, `nav.items.catalogType` ya existe en el grupo **Administración** con icono `ListTree` y `minLevel: ROLE_LEVELS.USER` — coincide con el rol real de `ESAVI-CATTYPE-002`. El único cambio es **quitarle `disabled: true`**: pasa a ser la primera entrada navegable del menú además de Inicio.

### 3.3 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
GET    /api/catalog-types              ESAVI-CATTYPE-002    USER        listado; el backend
                                                                        decide activas vs todas
GET    /api/catalog-types/:id          ESAVI-CATTYPE-003    USER        detalle
POST   /api/catalog-types              ESAVI-CATTYPE-001    ADMIN       crear
PUT    /api/catalog-types/:id          ESAVI-CATTYPE-004    ADMIN       actualizar
DELETE /api/catalog-types/:id          ESAVI-CATTYPE-005A   ADMIN       baja lógica
PATCH  /api/catalog-types/activate/:id ESAVI-CATTYPE-005B   SUPERADMIN  reactivar
```

`catalogType` es una de las tres entidades de **ruta única** del hallazgo B: no hay `002A`/`002B`, así que su declaración es `inactiveMode: 'serverDecides'` y no lleva `adminPath`. El **modo `'adminPath'` se implementa igual y se prueba con MSW**, porque lo usan las otras 40 entidades y FE03 lo estrena de verdad con `catalogItem`.

`ESAVI-CATTYPE-003` no lo consume el listado —la fila ya trae todos los campos— pero `useOne` se implementa y se cubre con test: FE03 lo necesita.

### 3.4 Tipos del contrato

```ts
// contracts/catalogType.ts — generado por `npm run contracts:sync`
// espejo de esavi-backend/src/types/catalog/catalogType.types.ts
export interface CreateCatalogTypeInput {
  code?: string;
  name: string;
  description?: string | null;
  sortOrder?: number | null;
}
```

El *input* llega por sync. **La fila no**, porque el backend no la exporta como tipo: vive en el modelo Sequelize. Se declara a mano, con su origen anotado, igual que hizo FE01 con `contracts/declared/auth.ts`:

```ts
// contracts/declared/catalogType.ts
// Forma de la fila de esavi-backend/src/models/catalogType.model.ts — el backend no la
// exporta como tipo. Revisar si el modelo cambia.
export interface CatalogType {
  catalogTypeId: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number | null;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}
```

```ts
// contracts/declared/pagination.ts — hallazgo A
export interface PaginatedResponse<T> {
  count: number;
  rows: T[];
}
```

El *update* es `Partial<CreateCatalogTypeInput>`, igual que en el backend. `AppDetails` ya existe en `contracts/common.ts`, sincronizado.

### 3.5 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Página actual | URL | `searchParams.page`, 1 si falta | Sobrevive al refresco y se comparte por enlace |
| `pageSize` | Zustand | `preferences.pageSize`, por defecto 10 | Es preferencia del usuario, no de la vista; `DEFAULT_LIMIT` del backend |
| Listado | TanStack Query | `['catalogType', 'list', { limit, offset, includeInactive }]` | `staleTime` 30 min (catálogo) |
| Detalle | TanStack Query | `['catalogType', 'detail', id]` | `staleTime` 30 min |
| Listado por padre (FE03) | TanStack Query | `['catalogItem', 'byType', typeId, { limit, offset }]` | Forma declarada aquí, consumida en FE03 |
| Toggle «mostrar inactivos» | URL | `searchParams.includeInactive` | Sólo en modo `'adminPath'`; en `catalogType` **no existe** |
| Diálogo de formulario abierto y fila en edición | Componente | `useState` en `CatalogTypeListPage` | Efímero; guarda el `catalogTypeId`, **no una copia de la fila** |
| Panel de auditoría abierto | Componente | `useState` en `CatalogTypeListPage` | Efímero |
| Valores tecleados en el formulario | React Hook Form | `useForm` de `<ResourceForm>` | No es estado de servidor: es el borrador del formulario |
| Diálogo de confirmación de baja | Componente | `useState` del `<AlertDialog>` | Efímero |

Cuatro puntos explícitos, porque son los que se olvidan:

- **Ninguna fila se copia a `useState`.** El diálogo de edición guarda el `catalogTypeId` y lee la fila de la caché de Query; `<ResourceForm>` recibe `defaultValues` una vez y a partir de ahí el dueño del estado es React Hook Form.
- **`page` va en la URL y `pageSize` no.** No es una incoherencia: la página es *dónde estoy mirando* y se comparte por enlace; el tamaño es *cómo me gusta ver las tablas* y me sigue entre pantallas. `CONVENTIONS.md` §7 los coloca exactamente así.
- **`staleTime` de 30 minutos en toda la entidad**, por ser catálogo (`CONVENTIONS.md` §6.3).
- **Toda mutación invalida `['catalogType']` entera.** Tras crear, actualizar, dar de baja o reactivar, listado y detalle se refrescan juntos; no hay ventana en la que la tabla diga una cosa y el panel de auditoría otra.

### 3.6 Formularios y validación

Un solo formulario, `features/catalogType/schemas.ts`, con `createCatalogTypeSchema` y `updateCatalogTypeSchema = createCatalogTypeSchema.partial()`. Los límites salen de `catalogType.validator.ts` y del DDL, no de lo que parezca razonable.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `code` | `<Input>` | no | Máx. 100. Si viaja vacío no se envía; el backend lo acuña desde `name` |
| `name` | `<Input>` | sí | Máx. 200, no vacío tras `trim` |
| `description` | `<Textarea>` | no | Máx. 500 (`STRING(500)` del DDL; el validador no lo comprueba, la columna sí) |
| `sortOrder` | `<Input type="number">` | no | Entero ≥ 0 |

**`code` es visible y opcional en creación**, con texto de ayuda (`catalogType.form.codeHelp`) diciendo que se genera desde el nombre si se deja vacío. **En edición es visible con aviso** (`catalogType.form.codeWarning`): cambiarlo mueve el identificador contra el que resuelven otras tablas y el importador. Ocultarlo en creación obligaría a entrar a editar justo después para fijarlo.

`catalogType` es la excepción a la normalización de `CLAUDE.md`: su `code` se guarda en **camelCase**, no en `CONSTANT_CASE`. El campo se muestra tal como vuelve del servidor tras guardar, sin que el cliente intente predecir la normalización.

**El `PUT` nunca lleva `isActive`**, aunque `updateCatalogTypeValidator` lo acepte. Ver §7.

Errores del backend mapeados a su campo por `code`, en `features/catalogType/schemas.ts`:

| `code` | Campo |
|---|---|
| `CATTYPE_001_CODE_EXISTS`, `CATTYPE_004_CODE_EXISTS` | `code` |
| `CATTYPE_001_CODE_NOT_VALID`, `CATTYPE_004_CODE_NOT_VALID` | `code` |
| `CATTYPE_001_CODE_NOT_DERIVABLE`, `CATTYPE_004_CODE_NOT_DERIVABLE` | `name` — el código se acuña del nombre, y es el nombre lo que hay que corregir |

Los demás —`CATTYPE_001_CREATION_FAILED`, `CATTYPE_004_UPDATE_FAILED`, `CATTYPE_004_NOT_FOUND`— van al toast por `code`. **`errors` no se muestra jamás** (`CONVENTIONS.md` §6.2).

`shared/api/errorMessages.ts` traduce `code` a clave i18n para el toast, con reserva al `message` del backend, que **ya viene traducido** por el `?lang=` del interceptor. Un `code` sin mapear no produce un toast mudo ni un texto en inglés.

Toasts de éxito, genéricos y compartidos por las 45 entidades: `common.toast.created`, `common.toast.updated`, `common.toast.deactivated`, `common.toast.activated`.

### 3.7 Estados de la pantalla

Los cuatro los pinta `<ResourceTable>`, no la entidad. Sus claves viven en `common.*` y las heredan las 45 entidades; `emptyKey` es una prop opcional para la entidad que quiera su propio texto.

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de tabla, tantas filas como `pageSize`, con las cabeceras ya visibles | — |
| Vacío | Icono, texto y botón «Crear», este último sólo si `useCan(ADMIN)` | `common.table.empty` |
| Vacío filtrado | No aplica en FE02: `catalogType` no tiene filtros (hallazgo E). La prop y la clave existen para FE03 | `common.table.emptyFiltered` |
| Error | Mensaje resuelto por `code` desde `errorMessages.ts` + botón reintentar | `common.table.error` |
| Sin permiso | No se llega: `<RequireRole level={USER}>` redirige y el `NavItem` no se pinta para `ANALYTICS` | — |

`common.table.serverDecidesInactive` es la nota del modo `'serverDecides'` (§3.1), visible sólo para SUPERADMIN.

### 3.8 Acciones de fila y autorización

El menú de fila se compone con `useCan()`, y cada acción **sólo aparece si el rol alcanza el de su ruta**:

| Acción | Rol mínimo real | Visible cuando |
|---|---|---|
| Editar | ADMIN (`004`) | `useCan(ADMIN)` |
| Ver auditoría | SUPERADMIN (política del cliente, no de la ruta — ver nota) | `useCan(SUPERADMIN)` |
| Dar de baja | ADMIN (`005A`) | `useCan(ADMIN)` y la fila está activa |
| Reactivar | SUPERADMIN (`005B`) | `useCan(SUPERADMIN)` y la fila está inactiva |

**«Ver auditoría» es la única acción de esta tabla cuyo rol mínimo no sale de `API-ROUTES.md`.** `ESAVI-CATTYPE-003` (el `GET` que trae la fila, incluido `appDetails`) exige sólo `USER`; ocultar el menú a quien no es `SUPERADMIN` es una decisión de producto (`CONVENTIONS.md` §10.4: "ver la auditoría exige SUPERADMIN, sin excepción por entidad"), no una réplica de un rol de ruta. Riesgo derivado en §7.

Baja y reactivación piden confirmación con `<AlertDialog>`.

**Un ADMIN nunca ve el botón de reactivar en esta entidad**, y no porque se le oculte a propósito: en modo `'serverDecides'` no ve ninguna fila inactiva (hallazgo C), así que la condición no llega a evaluarse. No se muestra deshabilitado con tooltip — explicar un botón que nunca se puede pulsar es peor que no tenerlo.

El botón «Crear» de la cabecera exige `useCan(ADMIN)`, el rol de `001`.

### 3.9 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`, dentro de `<ResourceTable>`. Los campos que sobreviven los marca cada entidad en su definición de columnas, con `card: 'primary' | 'secondary' | 'meta'`. Tomar «las tres primeras columnas» sería frágil: reordenar la tabla cambiaría la tarjeta sin que nadie lo pida.
- En `catalogType`: `name` es `primary`, `code` es `secondary`, `sortOrder` es `meta`. `description` no aparece en la tarjeta.
- El diálogo de formulario ocupa el ancho completo por debajo de `md`, con la barra de acciones fija abajo.
- El panel de auditoría es un `<Sheet>` lateral en escritorio e inferior en móvil.
- La tabla va dentro de un contenedor con `overflow-x: auto`; **el body nunca hace scroll horizontal**.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- El menú de fila y el `<AlertDialog>` son primitivas de Radix vía shadcn: foco, teclado y ARIA ya resueltos.
- Los iconos decorativos llevan `aria-hidden`; el botón de menú de fila, que es sólo un icono, lleva `aria-label` por i18n.
- La paginación anuncia la página actual con `aria-current`.

### 3.10 Claves i18n nuevas

En los **tres** archivos (`es`, `en`, `nl`). Las de `common.*` las hereda toda entidad futura.

| Clave | Uso |
|---|---|
| `common.table.empty` | Estado vacío genérico |
| `common.table.emptyFiltered` | Estado vacío con filtros (lo estrena FE03) |
| `common.table.error` | Estado de error, con botón reintentar |
| `common.table.retry` | Texto del botón reintentar |
| `common.table.showInactive` | Etiqueta del toggle, modo `'adminPath'` |
| `common.table.serverDecidesInactive` | Nota del modo `'serverDecides'` |
| `common.table.pageSize` | Etiqueta del selector 10/25/50/100 |
| `common.table.pageStatus` | «Página {{page}} de {{pages}} · {{count}} registros» |
| `common.table.rowActions` | `aria-label` del menú de fila |
| `common.actions.create` · `edit` · `deactivate` · `activate` · `audit` · `cancel` · `save` | Acciones compartidas |
| `common.confirm.deactivate` · `common.confirm.activate` | Texto de los `<AlertDialog>` |
| `common.toast.created` · `updated` · `deactivated` · `activated` | Éxito de mutación |
| `common.errors.unexpected` | Reserva cuando el `code` no está mapeado y no hay `message` |
| `common.audit.title` · `empty` · `columns.*` | Panel de `<AuditTrail>` |
| `catalogType.list.title` · `empty` | Pantalla y `NavItem` |
| `catalogType.form.createTitle` · `editTitle` | Título del diálogo |
| `catalogType.fields.code` · `name` · `description` · `sortOrder` · `isActive` | Etiquetas y cabeceras |
| `catalogType.form.codeHelp` · `codeWarning` | Ayuda y aviso del campo `code` |
| `catalogType.errors.CATTYPE_001_CODE_EXISTS` y las demás de §3.6 | Mensajes por `code` |

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y arrancable, y puede committearse solo.

1. **Piezas prestadas.** Instalar los componentes de shadcn que faltan: `table`, `alert-dialog`, `select`, `textarea`, `form`, `pagination`, `switch`. Conservan el kebab-case de su CLI (`CONVENTIONS.md` §4).
   *Verificación:* `npm run check` sale en 0 y los archivos nuevos están sólo bajo `src/shared/components/ui/`.

2. **Tipos del contrato.** `npm run contracts:sync` trae `contracts/catalogType.ts`. A mano: `contracts/declared/pagination.ts` con `PaginatedResponse<T>` y `contracts/declared/catalogType.ts` con la fila, cada uno con su origen anotado en el backend.
   *Verificación:* el diff de `contracts/` se revisa a ojo; `PaginatedResponse` tiene `count` y `rows`, no un array suelto.

3. **Mensajes de error por código.** `shared/api/errorMessages.ts`: mapa de `code` a clave i18n, con reserva al `message` del backend y, si tampoco lo hay, a `common.errors.unexpected`.
   *Verificación:* test unitario con un `EsaviApiError` de `code` desconocido, que devuelve el `message`; y con `message` vacío, que devuelve la clave de reserva.

4. **`pageSize` en preferencias.** Añadirlo a `preferences.types.ts` y a `preferencesStore` con valor por defecto 10, el `DEFAULT_LIMIT` del backend.
   *Verificación:* cambiar el valor y recargar lo conserva; `localStorage` guarda el campo nuevo sin romper el `persist` existente de FE01.

5. **La fábrica.** `shared/api/createResource.ts` con la interfaz de §3.1: los seis hooks, los dos `inactiveMode`, el listado por padre, `idField` y las invalidaciones a la clave raíz.
   *Verificación:* tests con MSW que cubren los dos modos. En `'adminPath'`, `includeInactive: true` con nivel ADMIN pega a `/…/admin` y con nivel USER pega a `/…`; en `'serverDecides'`, `includeInactive` no cambia la URL. `page: 3` con `pageSize: 25` produce `?limit=25&offset=50`. Una mutación invalida el listado y el detalle a la vez.

6. **`<ResourceTable>`.** `shared/components/ResourceTable.tsx`: paginación en servidor, selector 10/25/50/100, los cuatro estados de §3.7, toggle según modo y rol, nota de `'serverDecides'`, colapso a tarjetas por `card: 'primary' | 'secondary' | 'meta'`, y las props `searchable` y `sortable` declaradas y **fijadas a `false`** (hallazgo E).
   *Verificación:* con `count: 0` sale el estado vacío; en 375px la tabla es tarjetas y el body no hace scroll horizontal; con nivel USER en modo `'adminPath'` el toggle no se renderiza.

7. **`<ResourceForm>`.** `shared/components/ResourceForm.tsx`: React Hook Form + Zod, barra de acciones fija abajo en móvil, y mapeo de `code` de error a campo mediante una prop `errorFieldMap`.
   *Verificación:* test que devuelve un `409` con `CATTYPE_001_CODE_EXISTS` y comprueba que el mensaje aparece bajo el campo `code`, no en un toast.

8. **`<AuditTrail>`.** `shared/components/AuditTrail.tsx`: lee el array `appDetails` de cualquier fila y lo pinta como lista cronológica con fecha, usuario, método y detalle. Estado vacío cuando el array es `null`.
   *Verificación:* test con una fila de tres entradas y otra con `appDetails: null`, que no revienta.

9. **Declaración del recurso.** `features/catalogType/api.ts` con un solo `createResource<CatalogType>({ … })` y los códigos `ESAVI-CATTYPE-*` citados en comentario (`CONVENTIONS.md` §6.4).
   *Verificación:* el archivo no importa `axios`, no usa `useQuery` a mano y cabe en una pantalla.

10. **Schemas.** `features/catalogType/schemas.ts` con `createCatalogTypeSchema`, `updateCatalogTypeSchema` y el `errorFieldMap` de §3.6.
    *Verificación:* `name` vacío falla; `sortOrder: -1` falla; `code` ausente pasa y **no viaja** en el cuerpo del `POST`.

11. **Pantallas.** `CatalogTypeListPage.tsx` con `<ResourceTable>`, `CatalogTypeFormDialog.tsx` con `<ResourceForm>` y `CatalogTypeAuditSheet.tsx` con `<AuditTrail>`. El menú de fila con las cuatro acciones de §3.8 tras su `useCan()`.
    *Verificación:* crear un tipo lo hace aparecer en la tabla sin recargar; con nivel USER no hay botón «Crear» ni «Editar»; `page=2` en la URL sobrevive al refresco y el enlace reproduce la misma vista.

12. **Ruta y navegación.** La ruta `/catalog-types` en `app/router.tsx` envuelta en `<RequireRole level={ROLE_LEVELS.USER}>`, y quitar `disabled: true` de `nav.items.catalogType` en `shared/config/navigation.ts`.
    *Verificación:* el enlace del sidebar navega; con rol `ANALYTICS` la entrada no aparece y entrar por URL redirige sin pantalla en blanco.

13. **Claves i18n.** Las de §3.10 en `es`, `en` y `nl`.
    *Verificación:* `npm run i18n:check` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las seis rutas de §3.3 se consumen desde `features/catalogType/api.ts` y ninguna otra.
- [ ] `createResource` cubre los dos `inactiveMode`: en `'adminPath'` con nivel ADMIN y toggle activo pega a `/…/admin`; en `'serverDecides'` la URL no cambia nunca.
- [ ] `page: 3` con `pageSize: 25` produce `?limit=25&offset=50`; ninguna paginación ocurre en memoria.
- [ ] Los seis artefactos de `CONVENTIONS.md` §5 existen para `catalogType`.
- [ ] Una mutación invalida `['catalogType']` entera: tras crear, la tabla y el panel de auditoría muestran lo mismo sin recargar.
- [ ] Un `409` con `CATTYPE_001_CODE_EXISTS` marca el campo `code` del formulario y **no** abre un toast genérico.
- [ ] `errors` del envelope no llega a ninguna vista: `grep -rn "\.errors" src/` no devuelve accesos a la propiedad del error de API.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `grep -rn "isActive" src/features/catalogType/` no aparece en el cuerpo de ningún `PUT`.
- [ ] Guardar sin tocar nada no genera entrada de auditoría nueva: el backend hace el update diferencial y el cliente no calcula diff.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/catalogType/ src/shared/components/ResourceTable.tsx src/shared/components/ResourceForm.tsx src/shared/components/AuditTrail.tsx`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `name`, `code` y `sortOrder` (§3.9) y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` no hay botón «Crear», «Editar», «Dar de baja» ni «Reactivar», y el listado se ve entero; con `ANALYTICS` la entrada del menú no aparece y entrar por URL redirige sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`; las claves de §3.10 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.5: ninguna fila copiada a `useState`, `page` en `searchParams`, `pageSize` en `preferencesStore`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** `catalogType` de punta a punta dentro de este spec, no infraestructura pura. Una fábrica sin consumidor no se puede verificar, y los criterios de aceptación habrían quedado en «pasan los tests unitarios».
- **Sí:** el modo `'adminPath'` se implementa y se prueba con MSW aunque `catalogType` no lo use. Lo necesitan las otras 40 entidades, y descubrirlo en FE03 obligaría a reabrir la fábrica con una pantalla ya encima.
- **No:** `<CatalogSelect>` y `<GeoLocationPicker>` en este spec, pese a que `ARCHITECTURE.md` §4.3 las lista junto a las otras tres. Sus datos llegan en FE03 y FE04; escribirlas hoy es diseñar contra un backend que nunca se ha consumido.
- **Sí:** el hueco de `searchable` y `sortable` en la API de `<ResourceTable>`, fijado a `false`. Añadir la prop después obligaría a tocar 45 declaraciones; dejarla declarada no cuesta nada.
- **No:** buscar y ordenar en memoria mientras el backend no lo soporte. Ordenar la página actual da un orden falso —parece global y es de diez filas— y `CONVENTIONS.md` §6.5 lo prohíbe.
- **Sí:** `page` en `searchParams` y `pageSize` en `preferencesStore`. La página es dónde estoy mirando y se comparte por enlace; el tamaño es cómo me gusta ver las tablas y me sigue entre pantallas.
- **Sí:** selector de 10/25/50/100. El tope es `MAX_LIMIT` del backend, no un número elegido a ojo: pedir 200 devuelve `400`.
- **No:** página de detalle para `catalogType`. Con cuatro campos, diálogo para editar y panel lateral para la auditoría bastan. Las entidades grandes estrenarán la página de detalle cuando tengan campos que la justifiquen.
- **Sí:** el campo `code` visible y opcional en creación, con ayuda. Ocultarlo obligaría a entrar a editar justo después para fijarlo, que es peor.
- **Sí:** marcar los campos de la tarjeta móvil con `card: 'primary' | 'secondary' | 'meta'`. Tomar las tres primeras columnas ataría el diseño móvil al orden de la tabla de escritorio.
- **No:** mostrar «Reactivar» deshabilitado con tooltip para un ADMIN. En modo `'serverDecides'` no ve ninguna fila inactiva, así que el botón nunca aparecería en un sitio donde tuviera sentido pulsarlo.
- **No:** replicar `canViewInactive` como SUPERADMIN en el cliente. El rol efectivo del toggle sale de la ruta `/admin`, que pide ADMIN; el helper del backend gobierna sólo las tres entidades de ruta única, donde el cliente no decide nada (hallazgos B y C).

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `updateCatalogTypeValidator` acepta `isActive`, así que un ADMIN podría reactivar por `PUT` saltándose el `PATCH /activate/:id` de SUPERADMIN | El cliente nunca incluye `isActive` en el cuerpo, y el schema Zod de update no declara el campo. Es un hueco del backend y merece anotarse allí; este spec no lo explota |
| El tipo de la fila se declara a mano en `contracts/declared/catalogType.ts` y puede desincronizarse del modelo Sequelize | El archivo lleva anotado su origen. Si el backend llega a exportar la fila en `src/types/`, se retira el declarado y pasa a sync |
| `idField` distinto por entidad (`catalogTypeId`, `healthFacilityId`, …) invita a un `id` por defecto que funcionaría en cero entidades | Es obligatorio en `ResourceConfig` y sin valor por defecto: olvidarlo no compila |
| `'serverDecides'` sorprende a un SUPERADMIN, que ve filas dadas de baja sin control para quitarlas | La nota `common.table.serverDecidesInactive`, visible sólo con ese rol, explica por qué |
| La primitiva se copia en vez de ampliarse cuando una entidad necesite una variante | `CONVENTIONS.md` §10.4 lo prohíbe explícitamente, y §8 de este spec deja constancia de que las cuatro pasan a ser de todos |
| `ESAVI-CATTYPE-003` exige sólo `USER`, así que `appDetails` ya viaja al cliente para cualquier `USER` que abra el diálogo de edición o que la caché de Query conserve del listado — ocultar «Ver auditoría» a quien no es `SUPERADMIN` es UX (`CONVENTIONS.md` §11: "el backend sigue siendo la única autoridad"), no impide leer la respuesta cruda con las herramientas de desarrollador | Fuera de alcance de este spec: la restricción real exige que el backend excluya `appDetails` de `003` para roles por debajo de `SUPERADMIN`, o una ruta separada. Se anota aquí para que quien toque `esavi-backend` lo vea |

---

## 8. Impacto en pantallas existentes

- **`shared/config/navigation.ts`** — `nav.items.catalogType` pierde `disabled: true` y pasa a ser la primera entrada navegable del menú además de Inicio. El `minLevel` no cambia: ya era `USER`, el rol real de `ESAVI-CATTYPE-002`.
- **`shared/stores/preferencesStore.ts` y `preferences.types.ts`** — ganan `pageSize`. El `persist` de FE01 debe tolerar un `localStorage` sin ese campo, escrito por una sesión anterior.
- **`shared/components/`** — `<ResourceTable>`, `<ResourceForm>` y `<AuditTrail>` nacen aquí y **a partir de este spec son de todos**. Una feature que necesite una variante añade una prop; no hace una copia local (`CONVENTIONS.md` §10.4).
- **`shared/api/`** — `createResource.ts` y `errorMessages.ts` se suman a `client.ts` y `tokenStore.ts`. Ninguno de los dos existentes se modifica.

---

## Lo que **no** está en este spec

- `<CatalogSelect>` y `<GeoLocationPicker>`.
- `catalogItem`, su maestro-detalle y su importador.
- Búsqueda por texto y orden por columna en los listados.
- Selección múltiple y acciones en lote.
- `tableColumns` y `density` en preferencias.
- El purgado `005C`.
- La paleta de comandos.

Cada uno de esos, si aterriza, va en su propio spec.

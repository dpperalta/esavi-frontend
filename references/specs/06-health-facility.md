# SPEC FE06 — Unidades de salud (`healthFacility`)

> **Estado:** Implementado
> **Depende de:** SPEC FE02 (fábrica de recursos y primitivas), SPEC FE03 (`inactiveMode: 'adminPath'` + `parent`, precedente de pantalla sin listado plano), SPEC FE04 (`<GeoLocationPicker>` y el CRUD de `geoLocation`), SPEC FE05 (combos limpiables), SPEC F51 del backend (búsqueda por nombre o código)
> **Fecha:** 2026-09-01
> **Objetivo:** Construir el CRUD de `healthFacility` — la unidad de salud donde se reporta cada caso ESAVI — en una sola pantalla con dos modos, listado por ubicación y búsqueda por nombre o código, y estrenar `<CatalogSelect typeCode="…">`.

---

## 1. Por qué existe este spec

SPEC FE04 cerró la geografía y dejó `healthFacility` explícitamente fuera: *«Depende de `geoLocation` y de `catalogItem` (su tipo), pero es su propia entidad con su propio CRUD — spec aparte»*. Éste es ese spec. Con él queda completo el grupo «Geografía y unidades» del menú (`ARCHITECTURE.md` §5.2) y queda en pie la FK que `esaviCase` necesitará para decir dónde se reportó cada caso (`DOMAIN-MODEL.md` §1).

**Nueve hallazgos verificados contra el backend deciden el diseño, y ninguno es el que parecería razonable suponer:**

**A — No existe listado plano, igual que `catalogItem`.** El inventario sólo ofrece listado por FK (`/location/:id`) y búsqueda (`/search`). No hay `GET /api/health-facilities`. La pantalla no puede abrir mostrando datos: exige elegir una ubicación o escribir una búsqueda. `useList` nunca se invoca en esta entidad; sólo `useListByParent` y un hook propio para `006`.

**B — El listado sí es dual, a diferencia de toda la geografía de FE04.** `healthFacility.routes.ts:26,30` declara `/location/:id` (USER) y `/admin/location/:id` (ADMIN) como dos rutas distintas, no una sola con `canViewInactive`. Es `inactiveMode: 'adminPath'` con toggle visible, el mismo modo que `catalogItem` en FE03.

**C — En la búsqueda el toggle no puede existir.** `healthFacility.controller.ts:176` pasa `isAdmin(req.user)`, **no** `canViewInactive`, con un comentario propio que lo justifica contra los criterios de F51. No hay una segunda ruta de búsqueda: un ADMIN ve inactivas siempre que busca, y el cliente no tiene nada que elegir.

**D — El listado por ubicación no trae relaciones ni excluye `sysDetails`.** `getHealthFacilitiesByGeoLocationService` y su gemelo de admin son un `findAndCountAll` pelado: sin `include`, y sin el `attributes: { exclude: ['sysDetails'] }` que `003` y `006` sí llevan. La fila del listado trae `facilityTypeItemId` crudo y arrastra `sysDetails`, que el cliente ni declara ni muestra.

**E — Los ciclos sí los valida el backend, al contrario que en `geoLocation`.** `updateHealthFacilityService` rechaza el auto-padre (`HFAC_004_SELF_PARENT`) y recorre la cadena de ancestros hasta 50 saltos para detectar `A → B → A` (`HFAC_004_CIRCULAR_PARENT`). El cliente no necesita el `excludeSubtreeOf` que FE04 tuvo que construir para el picker.

**F — La baja lógica falla si quedan hijos activos:** `409 HFAC_005A_HAS_ACTIVE_CHILDREN`. Es un error de negocio esperable, no un fallo, y necesita su mensaje propio.

**G — El tipo de unidad está atado a un catálogo concreto.** `healthFacility.service.ts:11` fija `HEALTH_FACILITY_TYPE_CATALOG_CODE = 'healthFacilityType'`, y el trigger `TRG_healthFacility_validateCatalogs` lo exige también en la base. Un `catalogItem` de cualquier otro tipo da `404 HFAC_001_FACILITY_TYPE_NOT_FOUND`. Es el primer consumidor real de `<CatalogSelect typeCode="…">`, la primitiva que `ARCHITECTURE.md` §4.3 reserva desde el hito 1.

**H — Ningún campo opcional se puede vaciar con un `PUT`.** El servicio construye el objeto diferencial con `campo ? campo : undefined` en los doce campos: mandar `''` o `null` en `phone` no borra el teléfono guardado, lo deja intacto. El formulario no puede ofrecer «quitar el valor» de nada.

**I — `latitude` y `longitude` vuelven como texto.** Son `DECIMAL(10,7)` y `pg` los entrega como string; el propio servicio lo documenta al explicar por qué el update diferencial los compara numéricamente (`'-0.2299000'` contra `-0.2299`). El tipo declarado de la fila dice `string | null`, no `number | null`.

---

## 2. Alcance

**Dentro:**

- **`healthFacility` de punta a punta**: los seis artefactos de `CONVENTIONS.md` §5 — `contracts/healthFacility.ts` + `contracts/declared/healthFacility.ts`, `features/healthFacility/api.ts`, `schemas.ts`, `HealthFacilityListPage.tsx`, la ruta en `app/router.tsx` y el `NavItem` ya existente.
- **Una sola pantalla con dos modos excluyentes**, ambos en `searchParams`:
  - **Modo ubicación** — `<GeoLocationPicker>` elige `geoLocationId` y `useListByParent` consume `002A`/`002B`, con toggle de inactivos visible sólo con `useCan(ADMIN)`.
  - **Modo búsqueda** — `q` con dos caracteres o más consume `006`, mandando el término como `name` y como `code` a la vez, más `geoLocationId` como `AND` si hay una ubicación elegida.
  - **Sin ubicación ni `q`**, panel de invitación, calcado de `catalogItem.list.noTypeSelected`.
- **`useHealthFacilitySearch`** en `features/healthFacility/api.ts`: hook propio para `006`, con clave `['healthFacility', 'search', { name, code, geoLocationId, limit, offset }]`. No se toca `createResource` (§3.3).
- **`<CatalogSelect typeCode="…">`**, en `features/catalogItem/CatalogSelect.tsx`: resuelve el `catalogType` por su `code`, lista sus `catalogItem` activos y devuelve el `catalogItemId` elegido. Primitiva reutilizable por las decenas de campos de catálogo del modelo (`DOMAIN-MODEL.md` §5); su primer consumidor es el campo `facilityTypeItemId` de este spec.
- **Formulario con doce campos** (§3.7), en `<Dialog>`, sin `isActive`.
- **Combo de unidad padre restringido a la ubicación elegida en el propio formulario** (`002A` sobre esa `geoLocationId`).
- **Columna «Tipo» resuelta con un mapa cliente** derivado de la query del catálogo `healthFacilityType` que `<CatalogSelect>` ya cachea (hallazgo D), sin una petición por fila.
- **Auditoría en `<Sheet>`** sobre `<AuditTrail>`, protegida con `useCan(ROLE_LEVELS.SUPERADMIN)` como en las 45 entidades (`CONVENTIONS.md` §10.4).
- **Marcado de lo inactivo** con `isRowInactive` en `<ResourceTable>` — badge más tinte `bg-destructive/5`, igual que FE03 y FE04.
- **Claves i18n** en `healthFacility.*`, `catalogItem.select.*` y las de `common.*` que falten, en los tres idiomas.
- **Quitar `disabled: true`** de `nav.items.healthFacility` en `shared/config/navigation.ts:149`. Ni el `minLevel` ni el icono cambian.

**Fuera de alcance (otros specs o no aplican):**

- **La página de detalle jerárquica.** `003` es el único endpoint que trae `parent`, `children`, `geoLocation` y `facilityType`, pero se consume como lectura auxiliar, no como pantalla. Ver las unidades dependientes de una unidad es su propio spec.
- **`<HealthFacilitySelect>` para `esaviCase`.** La entidad que lo necesitará no existe todavía en el cliente. `<CatalogSelect>` sí nace en este spec porque tiene consumidor hoy; un selector de unidades sin consumidor sería especulación.
- **Un mapa para `latitude`/`longitude`.** No hay componente de mapa en el repositorio, misma decisión que FE04 con `geoPolygon`.
- **`sysDetails`**, que el listado devuelve por omisión (hallazgo D) y que el cliente ni declara ni muestra. Que el backend deje de enviarlo en `002A`/`002B` es trabajo de `esavi-backend`.
- **Búsqueda jerárquica por territorio.** `006` filtra `geoLocationId` por igualdad exacta, no por subárbol — al contrario que el filtro de casos de SPEC F48. Buscar «todas las unidades de una provincia y sus cantones» no es una operación que la API ofrezca.
- **Vaciar un campo opcional desde el formulario** (hallazgo H). Es una limitación del `PUT` del backend, documentada en §6 y anotada como riesgo en §7; no se repara desde el cliente.
- **El purgado físico** y cualquier ruta `005C`, que esta entidad no tiene en el inventario.
- **Importación masiva de unidades.** No hay endpoint que consumir.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado y búsqueda | `/health-facilities` | `features/healthFacility/HealthFacilityListPage.tsx` | `<RequireRole level={USER}>` |

Sin página de detalle (§2): formulario en `<Dialog>` (`HealthFacilityFormDialog.tsx`), auditoría en `<Sheet>` (`HealthFacilityAuditSheet.tsx`), ambos abiertos desde el listado.

En `shared/config/navigation.ts:149`, `nav.items.healthFacility` ya existe con `icon: Building2`, `path: '/health-facilities'` y `minLevel: ROLE_LEVELS.USER` — coincide con el rol real de `ESAVI-HFAC-002A`. El único cambio es quitarle `disabled: true`.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/health-facilities                    ESAVI-HFAC-001   ADMIN       crear
GET    /api/health-facilities/location/:id       ESAVI-HFAC-002A  USER        activas por ubicación
GET    /api/health-facilities/admin/location/:id ESAVI-HFAC-002B  ADMIN       por ubicación, incluye inactivas
GET    /api/health-facilities/search             ESAVI-HFAC-006   USER        búsqueda por nombre o código
GET    /api/health-facilities/:id                ESAVI-HFAC-003   USER        detalle
PUT    /api/health-facilities/:id                ESAVI-HFAC-004   ADMIN       actualizar
DELETE /api/health-facilities/:id                ESAVI-HFAC-005A  ADMIN       baja lógica
PATCH  /api/health-facilities/activate/:id       ESAVI-HFAC-005B  SUPERADMIN  reactivar
```

Las ocho se consumen. `003` se consume como lectura auxiliar del formulario de edición, no como pantalla (§2).

La declaración, en `features/healthFacility/api.ts`:

```ts
export const healthFacilityResource = createResource<
  HealthFacility,
  CreateHealthFacilityInput,
  Partial<CreateHealthFacilityInput>
>({
  key: 'healthFacility',
  path: 'health-facilities',
  idField: 'healthFacilityId',
  inactiveMode: 'adminPath',
  // Exigido por `assertConfig` con `inactiveMode: 'adminPath'`, aunque esta entidad nunca
  // llame a `useList` — no existe listado plano (hallazgo A). Mismo caso que `catalogItem`.
  adminPath: 'health-facilities/admin',
  parent: {
    operation: 'byLocation',
    segment: 'location/:parentId',
    adminSegment: 'admin/location/:parentId',
  },
  staleTime: 30 * 60 * 1000,
});
```

**El prefijo de error coincide con el código de operación** (`HFAC_*` frente a `ESAVI-HFAC-*`), al contrario de lo que pasaba con `GEOTYPE_*` en FE04. Aquí el `errorFieldMap` sí puede derivarse del inventario sin sorpresas, y aun así se verifica contra `healthFacility.service.ts`.

### 3.3 El hook de búsqueda — `useHealthFacilitySearch`

`createResource` no sabe de rutas de búsqueda: `useList` siempre pega a `config.path`. `006` tampoco encaja en `filters`, porque no es un filtro de listado sino una operación con reglas propias — al menos un criterio de texto, mínimo dos caracteres, `OR` entre columnas e inactivas decididas por rol sin toggle. Vive en `features/healthFacility/api.ts` como hook propio, junto a la declaración del recurso:

```ts
// ESAVI-HFAC-006 — búsqueda por nombre o código. `name` recorre name/officialName/shortName,
// `code` recorre localCode, y los cuatro predicados se unen con OR en el servidor.
export function useHealthFacilitySearch(params: HealthFacilitySearchParams) { … }
```

Reglas que el hook respeta:

- **Clave de caché** `['healthFacility', 'search', { name, code, geoLocationId, limit, offset }]` — entidad, operación, argumento (`CONVENTIONS.md` §6.3). Las mutaciones de la fábrica invalidan `['healthFacility']`, así que la búsqueda se invalida con ellas sin enumerar nada.
- **`enabled` sólo con dos caracteres o más.** Por debajo, el validador responde `400`; el hook no dispara.
- **El mismo término viaja como `name` y como `code`.** El backend los une con `OR`, así que un solo campo de búsqueda expresa «el nombre o el código contiene X», exactamente como resolvió FE04 con `geoLocation`.
- **`geoLocationId` se manda si hay ubicación elegida**, y actúa como `AND` exacto. No es jerárquico (§2).
- **Ningún parámetro de inactivas.** No existe (hallazgo C).
- `staleTime` de 30 minutos, igual que el resto de la entidad.

### 3.4 `<CatalogSelect typeCode="…">` — la primitiva

`features/catalogItem/CatalogSelect.tsx`, misma ubicación por feature que `CatalogTypeSelect` en FE03 y consumida desde otras features por su ruta completa, como ya hace `CatalogItemListPage.tsx:25`.

```ts
interface CatalogSelectProps {
  typeCode: string;            // 'healthFacilityType' en este spec
  value: string;               // '' cuando no hay elección — nunca undefined (FE05 §3.1)
  onValueChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  id?: string;
}
```

**Resolución en dos saltos.** Primero `catalogTypeResource.useList({ pageSize: 100 })` — la misma entrada de caché que ya usa `<CatalogTypeSelect>`, así que React Query la deduplica — y de ahí se busca el `catalogTypeId` cuyo `code` es `typeCode`. Después `catalogItemResource.useListByParent(catalogTypeId, { pageSize: 100 })` (`ESAVI-CATITEM-002A`), que sólo arranca cuando el primero resolvió: `useListByParent` ya trae `enabled: !!parentId`.

**El tipo no aparece por su código, sino por su nombre.** El usuario elige «Centro de salud», no `HEALTH_CENTER`.

**Estados propios:** carga (`<Skeleton>` a la altura del control), error (mensaje inline por `code` con botón de reintentar, sin tumbar el formulario que lo contiene), y **tipo de catálogo no encontrado** — si ningún `catalogType` tiene ese `code`, el combo se pinta deshabilitado con `catalogItem.select.unknownType`, en vez de quedarse cargando para siempre. Es el aviso que hace visible el día en que alguien renombre el catálogo en la base.

Sin autodespliegue ni preselección, y limpiable con la «×» de FE05.

### 3.5 Tipos del contrato

`CreateHealthFacilityInput` y `HealthFacilitySearchInput` llegan por `npm run contracts:sync` desde `esavi-backend/src/types/healthFacility/`. Las filas se declaran a mano, con su origen anotado, igual que en FE03 y FE04:

```ts
// contracts/declared/healthFacility.ts
// Origin: esavi-backend/src/models/healthFacility.model.ts
// ESAVI-HFAC-002A/002B return this shape with no relations at all and without excluding
// sysDetails (finding D). sysDetails is deliberately not declared: the client never reads it.
// latitude/longitude are DECIMAL(10,7) and pg hands them back as strings (finding I).
export interface HealthFacility {
  healthFacilityId: string;
  geoLocationId: string | null;
  facilityTypeItemId: string | null;
  parentHealthFacilityId: string | null;
  localCode: string | null;
  name: string;
  officialName: string | null;
  shortName: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// Shape of ESAVI-HFAC-006's rows — the search includes two relations the listing never has.
export interface HealthFacilitySearchRow extends HealthFacility {
  geoLocation: { geoLocationId: string; name: string } | null;
  facilityType: { catalogItemId: string; name: string } | null;
}

// Shape of ESAVI-HFAC-003 — the only read that includes the hierarchy.
export interface HealthFacilityDetail extends HealthFacility {
  geoLocation: { geoLocationId: string; name: string; level: number } | null;
  facilityType: { catalogItemId: string; code: string; name: string } | null;
  parent: { healthFacilityId: string; name: string; localCode: string | null } | null;
  children: { healthFacilityId: string; name: string; localCode: string | null; isActive: boolean }[];
}
```

El tipo de actualización es `Partial<CreateHealthFacilityInput>`. `HealthFacilitySearchRow` extiende la fila base, así que **la tabla trabaja siempre sobre `HealthFacility`** y no cambia de tipo según el modo: la columna «Tipo» se resuelve con el mapa cliente en los dos casos, y la columna «Ubicación» sólo se pinta en modo búsqueda, leyendo `geoLocation.name` de la respuesta ampliada.

### 3.6 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Ubicación elegida | URL | `searchParams.geoLocationId` | Filtro del modo ubicación y `AND` opcional del modo búsqueda |
| Término de búsqueda | URL | `searchParams.q` | Debounce antes de escribir en la URL; el hook no dispara por debajo de 2 caracteres |
| Toggle «mostrar inactivos» | URL | `searchParams.includeInactive` | Decide `002A` vs `002B`. Sólo existe en modo ubicación y sólo se renderiza con `useCan(ADMIN)` |
| Página | URL | `searchParams.page` | 1 si falta |
| **Modo de la pantalla** | Derivado | `q.length >= 2 ? 'search' : geoLocationId ? 'location' : 'empty'` | **No es un parámetro propio**: un `mode` en la URL podría contradecir a `q` y a `geoLocationId` |
| `pageSize` | Zustand | `preferences.pageSize` | Compartido con el resto de entidades |
| Listado por ubicación | TanStack Query | `['healthFacility', 'byLocation', geoLocationId, { limit, offset, includeInactive, filters }]` | `useListByParent`; `staleTime` 30 min |
| Resultado de la búsqueda | TanStack Query | `['healthFacility', 'search', { name, code, geoLocationId, limit, offset }]` | `useHealthFacilitySearch` (§3.3) |
| Detalle de la fila en edición | TanStack Query | `['healthFacility', 'detail', id]` | `003`, sólo al abrir el diálogo de edición |
| Tipos de catálogo del combo | TanStack Query | `['catalogType', 'list', { limit: 100, offset: 0, includeInactive: false }]` | Misma entrada que `<CatalogTypeSelect>`; React Query la deduplica |
| Ítems del catálogo `healthFacilityType` | TanStack Query | `['catalogItem', 'byType', typeId, { limit: 100, offset: 0, includeInactive: false }]` | La carga `<CatalogSelect>`, y de ella sale el mapa de la columna «Tipo» |
| Mapa `facilityTypeItemId → name` | Derivado, en el render | `useMemo` sobre la query anterior | No es estado nuevo: se deriva de una query ya en caché |
| Unidades candidatas a padre | TanStack Query | `['healthFacility', 'byLocation', <geoLocationId del formulario>, { limit: 100, offset: 0, includeInactive: false }]` | `002A` sobre la ubicación elegida en el formulario, no sobre la del listado |
| Diálogo de formulario y fila en edición | Componente | `useState` en `HealthFacilityListPage` | Guarda el id, nunca una copia de la fila |
| Panel de auditoría abierto | Componente | `useState` | Efímero |
| Confirmación de baja o reactivación | Componente | `useState` del `<AlertDialog>` | Efímero |
| Valores del formulario | React Hook Form | `useForm` de `<ResourceForm>` | Borrador, no estado de servidor |

Puntos que se rompen si no se respetan:

- **Los cuatro parámetros de la pantalla van en `searchParams`.** `/health-facilities?geoLocationId=<id>&includeInactive=true&page=2` se comparte por enlace, sobrevive al refresco y responde al botón de atrás.
- **El modo se deriva, no se guarda.** Guardarlo permitiría un estado imposible: modo búsqueda con `q` vacío.
- **Cambiar la ubicación, el término o el toggle devuelve `page` a 1.**
- **La ubicación del formulario es independiente de la del listado.** Crear una unidad en otra ubicación distinta de la filtrada es legítimo; el combo de padre sigue a la del formulario, no a la de la URL.
- **Ninguna fila se copia a `useState`.** El diálogo de edición recibe un id y lee `003`; el mapa de tipos se recalcula con `useMemo` desde una query cacheada.
- **Toda mutación invalida `['healthFacility']`**, la clave raíz, como ya hace la fábrica — lo que invalida a la vez el listado por ubicación y la búsqueda.

### 3.7 Formularios y validación

**Formulario de unidad de salud** — `features/healthFacility/schemas.ts`, `createHealthFacilitySchema` y `updateHealthFacilitySchema`. Los límites salen de `healthFacility.validator.ts` **cruzados con el DDL**: donde el validador dice 255 y la columna es `STRING(250)`, el schema usa 250 (§7).

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `geoLocationId` | `<GeoLocationPicker>` | sí | FK; `HFAC_001_GEOLOCATION_NOT_FOUND` si no existe o está inactiva |
| `name` | `<Input>` | sí | Máx. 250, no vacío tras `trim`. El backend lo normaliza a `Title Case` |
| `facilityTypeItemId` | `<CatalogSelect typeCode="healthFacilityType">` | no | Sólo ítems de ese catálogo; otro tipo da `404` |
| `parentHealthFacilityId` | `<Select>` sobre las unidades activas de la ubicación elegida | no | Vacío = unidad raíz |
| `localCode` | `<Input>` | no | Máx. 200; **único global**, no por ubicación. El backend lo normaliza a `CONSTANT_CASE` |
| `officialName` | `<Input>` | no | Máx. 250 |
| `shortName` | `<Input>` | no | Máx. 100 |
| `address` | `<Input>` | no | Máx. 250 |
| `latitude` | `<Input type="number">` | no | -90 a 90, hasta 7 decimales |
| `longitude` | `<Input type="number">` | no | -180 a 180, hasta 7 decimales |
| `phone` | `<Input>` | no | Máx. 50 |
| `email` | `<Input type="email">` | no | Formato de correo, máx. 250 |

`isActive` no es campo del formulario (§2): el ciclo de vida vive en `005A`/`005B`.

El rango de latitud y longitud es **validación de cliente únicamente** — el backend sólo comprueba que sean decimales de hasta 7 posiciones, sin rango. Mismo criterio que FE04.

Errores mapeados a su campo:

| `code` | Campo |
|---|---|
| `HFAC_001_GEOLOCATION_NOT_FOUND`, `HFAC_004_GEOLOCATION_NOT_FOUND` | `geoLocationId` |
| `HFAC_001_FACILITY_TYPE_NOT_FOUND`, `HFAC_004_FACILITY_TYPE_NOT_FOUND` | `facilityTypeItemId` |
| `HFAC_001_PARENT_HEALTH_FACILITY_NOT_FOUND`, `HFAC_004_PARENT_HEALTH_FACILITY_NOT_FOUND` | `parentHealthFacilityId` |
| `HFAC_004_SELF_PARENT`, `HFAC_004_CIRCULAR_PARENT` | `parentHealthFacilityId` |
| `HFAC_001_LOCAL_CODE_EXISTS`, `HFAC_004_LOCAL_CODE_EXISTS` | `localCode` |

Al toast, por `code`: `HFAC_003_NOT_FOUND`, `HFAC_004_NOT_FOUND`, `HFAC_005A_NOT_FOUND`, `HFAC_005B_NOT_FOUND`, `HFAC_005A_ALREADY_INACTIVE`, `HFAC_005B_ALREADY_ACTIVE` y, sobre todo, **`HFAC_005A_HAS_ACTIVE_CHILDREN`** (hallazgo F), que necesita un mensaje propio: la unidad no se puede dar de baja mientras tenga unidades dependientes activas. `errors` no se muestra nunca.

**El `PUT` viaja completo** — el backend hace el update diferencial (`CONVENTIONS.md` §6.5) y compara las coordenadas numéricamente, así que reabrir el formulario y guardar sin tocar nada no produce `UPDATE` ni entrada de auditoría.

**Ningún campo opcional se puede vaciar** (hallazgo H). Mandar `''` en `phone` deja el valor anterior intacto. El formulario no ofrece ninguna afordancia de borrado que el backend no pueda cumplir; queda documentado en §6 y como riesgo en §7.

El diálogo llama a `create.reset()` y `update.reset()` al cerrarse, cableado en `onOpenChange`, en `onCancel` y en el `onSuccess` de ambas mutaciones — `CONVENTIONS.md` §10.7, la lista nunca lo desmonta.

### 3.8 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Sin ubicación ni búsqueda | Panel de invitación: elegir una ubicación o escribir un término | `healthFacility.list.noSelection` |
| Carga | Skeleton de la tabla, `pageSize` filas, con la cabecera ya tintada | — |
| Vacío en modo ubicación | Texto + botón «Crear unidad» si `useCan(ADMIN)` | `healthFacility.list.emptyLocation` |
| Vacío en modo búsqueda | Texto + botón «Limpiar búsqueda» | `healthFacility.list.emptySearch` |
| Error | Mensaje del `EsaviApiError` por `code` + botón reintentar | `common.table.error` |
| Sin permiso | No se llega: `<RequireRole level={USER}>` redirige, y el `NavItem` no aparece por debajo de `USER` | — |

Distinguir los dos vacíos es lo que evita el callejón sin salida: buscar «hospit» sin resultados y ver el mismo texto que una ubicación sin unidades haría creer que no hay datos.

### 3.9 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`, dentro de `<ResourceTable>`. Los tres campos que sobreviven: **nombre** (primario), **código local** (secundario) y **tipo** (meta).
- El `<GeoLocationPicker>`, el campo de búsqueda y el toggle de inactivos colapsan a ancho completo, apilados antes de la tabla.
- Cada `<Select>` del picker y el `<CatalogSelect>` ocupan el ancho completo por debajo de `md`.
- Diálogo de formulario a ancho completo por debajo de `md`, con la barra de acciones fija abajo — lo resuelve `<ResourceForm>`.
- Auditoría en `<Sheet>` lateral en escritorio, inferior en móvil.
- Tabla en contenedor `overflow-x: auto`; el body nunca hace scroll horizontal.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- El campo de búsqueda lleva `aria-label` por i18n y anuncia el mínimo de dos caracteres con un texto de ayuda asociado, no con un `placeholder`.
- Los iconos sin texto de las acciones de fila llevan `aria-label` por i18n.
- Las filas inactivas llevan `isRowInactive`: badge `destructive` más tinte `bg-destructive/5` en la fila entera y en la tarjeta (`CONVENTIONS.md` §10.1).

### 3.10 Claves i18n nuevas

En `es`, `en` y `nl`:

| Clave | Uso |
|---|---|
| `healthFacility.list.title` | Título de la pantalla |
| `healthFacility.list.noSelection` | Panel de invitación |
| `healthFacility.list.emptyLocation`, `emptySearch` | Los dos vacíos de §3.8 |
| `healthFacility.list.clearSearch` | Botón del vacío de búsqueda |
| `healthFacility.filters.location`, `search`, `searchHint` | Etiquetas del picker, del buscador y su ayuda de 2 caracteres |
| `healthFacility.form.createTitle`, `editTitle` | Diálogo |
| `healthFacility.fields.geoLocationId`, `name`, `facilityTypeItemId`, `parentHealthFacilityId`, `localCode`, `officialName`, `shortName`, `address`, `latitude`, `longitude`, `phone`, `email`, `isActive` | Etiquetas y cabeceras |
| `healthFacility.columns.type`, `location` | Cabeceras de las dos columnas resueltas (§3.5) |
| `healthFacility.parent.placeholder`, `parent.needsLocation` | Combo de padre, y su estado cuando aún no hay ubicación elegida |
| `healthFacility.status.active`, `inactive` | Distintivo |
| `healthFacility.errors.HFAC_001_LOCAL_CODE_EXISTS` y las demás de §3.7, incluida `HFAC_005A_HAS_ACTIVE_CHILDREN` | Mensajes por `code` |
| `catalogItem.select.label`, `select.placeholder`, `select.unknownType` | La primitiva `<CatalogSelect>` (§3.4) |

`npm run i18n:check` exige paridad exacta en los tres archivos.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y arrancable, y puede committearse solo. Primero los tipos, luego la primitiva compartida (que no depende de esta entidad y la heredarán decenas de campos), después la capa de API, el formulario, la pantalla y por último ruta, navegación e i18n.

1. **Tipos del contrato.** `npm run contracts:sync` trae `contracts/healthFacility.ts` con `CreateHealthFacilityInput` y `HealthFacilitySearchInput`. A mano, `contracts/declared/healthFacility.ts` con `HealthFacility`, `HealthFacilitySearchRow` y `HealthFacilityDetail` según §3.5.
   *Verificación:* `latitude` y `longitude` son `string | null`, no `number | null` (hallazgo I); `sysDetails` no aparece declarado; `HealthFacility` no declara `geoLocation` ni `facilityType`, que sólo existen en los otros dos tipos. `npm run check` en 0.

2. **`<CatalogSelect typeCode="…">`.** `features/catalogItem/CatalogSelect.tsx` según §3.4: resolución en dos saltos, estados de carga, error y tipo desconocido, limpiable con la «×» de FE05.
   *Verificación:* test con MSW: con `typeCode="healthFacilityType"` pide primero `catalog-types?limit=100` y después `catalog-items/type/<id>?limit=100`, en ese orden; si ningún tipo tiene ese `code`, el combo queda deshabilitado con `catalogItem.select.unknownType` y **no** dispara la segunda petición; las opciones muestran el `name` del ítem, no su `code`.

3. **Recurso, búsqueda y schemas.** `features/healthFacility/api.ts` con la declaración de §3.2 y `useHealthFacilitySearch` de §3.3; `features/healthFacility/schemas.ts` con los límites y el `errorFieldMap` de §3.7.
   *Verificación:* test con MSW: `useListByParent(id, { includeInactive: true })` con rol ADMIN pega a `health-facilities/admin/location/<id>` y con rol USER a `health-facilities/location/<id>`; `useHealthFacilitySearch` con un término de un carácter no dispara ninguna petición, y con dos pega a `health-facilities/search?name=<q>&code=<q>`; `name` de 251 caracteres falla la validación del cliente; `latitude: 91` falla; `isActive` no es campo del schema.

4. **Formulario y auditoría.** `HealthFacilityFormDialog.tsx` sobre `<ResourceForm>` con los doce campos de §3.7, `<GeoLocationPicker>` para `geoLocationId`, `<CatalogSelect>` para `facilityTypeItemId` y el combo de padre restringido a la ubicación del formulario; `HealthFacilityAuditSheet.tsx` sobre `<AuditTrail>`, tras `useCan(ROLE_LEVELS.SUPERADMIN)`.
   *Verificación:* sin ubicación elegida, el combo de padre se muestra deshabilitado con `healthFacility.parent.needsLocation` y no pide nada; cambiar la ubicación recarga sus candidatos; un `409` con `HFAC_001_LOCAL_CODE_EXISTS` marca `localCode` y no abre un toast genérico; un `409` con `HFAC_004_CIRCULAR_PARENT` marca `parentHealthFacilityId`; cerrar y reabrir el diálogo tras un error no reaplica ese error sobre el formulario nuevo (`CONVENTIONS.md` §10.7).

5. **`HealthFacilityListPage`.** Los dos modos de §3.6 derivados de `searchParams`, el panel de invitación, el toggle de inactivos condicionado a `useCan(ADMIN)` **y** al modo ubicación, las columnas de §3.5 con el mapa de tipos por `useMemo`, y el reseteo de `page` al cambiar cualquier parámetro.
   *Verificación:* `?geoLocationId=<id>&includeInactive=true&page=2` sobrevive al refresco y se reproduce en otra pestaña; escribir dos caracteres en el buscador oculta el toggle de inactivos (hallazgo C) y cambia la petición a `006`; borrar el término vuelve al listado por ubicación; con rol `USER` el toggle no se renderiza en ningún modo; con la query del catálogo aún cargando, la columna «Tipo» no revienta y luego resuelve el nombre.

6. **Ruta y navegación.** `/health-facilities` en `app/router.tsx` bajo `<RequireRole level={ROLE_LEVELS.USER}>`; quitar `disabled: true` de `nav.items.healthFacility` en `shared/config/navigation.ts:149`.
   *Verificación:* el enlace del sidebar navega y aparece también en la paleta de comandos; con rol `ANALYTICS` la entrada no aparece y entrar por URL redirige sin pantalla en blanco.

7. **Claves i18n.** Las de §3.10 en `es`, `en` y `nl`.
   *Verificación:* `npm run i18n:check` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las ocho rutas `ESAVI-HFAC-*` de §3.2 se consumen desde `features/healthFacility/api.ts`, y ninguna otra.
- [ ] `grep -rn "health-facilities" src/ --include=*.tsx` no devuelve resultados: ninguna ruta HTTP escrita fuera de `api.ts` (`CONVENTIONS.md` §4).
- [ ] Los seis artefactos de `CONVENTIONS.md` §5 existen para `healthFacility`.
- [ ] Sin ubicación ni término, la pantalla muestra `healthFacility.list.noSelection` y **no dispara ninguna petición** de listado ni de búsqueda.
- [ ] Con rol ADMIN y el toggle activo, el listado pega a `health-facilities/admin/location/<id>`; con rol USER, a `health-facilities/location/<id>` y el toggle no se renderiza.
- [ ] Escribir dos caracteres en el buscador cambia la petición a `health-facilities/search?name=<q>&code=<q>` y **oculta el toggle de inactivos** (hallazgo C).
- [ ] Un solo carácter en el buscador no dispara ninguna petición — el `400 HFAC_006_SEARCH_CRITERIA_REQUIRED` nunca llega al usuario.
- [ ] Con una ubicación elegida y un término activo, la búsqueda manda además `geoLocationId` como filtro exacto.
- [ ] `?geoLocationId=<id>&includeInactive=true&page=2` reproduce exactamente la misma vista tras un refresco y al abrirse en otra pestaña.
- [ ] Cambiar la ubicación, el término o el toggle deja `searchParams.page` en 1.
- [ ] No existe un `searchParams.mode`: el modo se deriva de `q` y `geoLocationId` (§3.6).
- [ ] `<CatalogSelect typeCode="healthFacilityType">` resuelve el tipo en dos saltos y, si ningún `catalogType` tiene ese `code`, queda deshabilitado con `catalogItem.select.unknownType` en vez de cargando indefinidamente.
- [ ] El combo de unidad padre lista sólo unidades activas de la `geoLocationId` elegida en el formulario, no de la del listado.
- [ ] Un `409` con `HFAC_001_LOCAL_CODE_EXISTS` marca `localCode`; uno con `HFAC_004_CIRCULAR_PARENT` o `HFAC_004_SELF_PARENT` marca `parentHealthFacilityId`.
- [ ] Un `409` con `HFAC_005A_HAS_ACTIVE_CHILDREN` muestra su mensaje propio por `code`, no el genérico de fallo de baja.
- [ ] `grep -rn "\.errors" src/features/healthFacility/` no devuelve accesos a esa propiedad del error de API.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `grep -rn "isActive" src/features/healthFacility/schemas.ts` no devuelve resultados: no es campo del formulario.
- [ ] Guardar sin tocar nada no genera entrada de auditoría nueva (update diferencial del backend, coordenadas incluidas).
- [ ] La columna «Tipo» muestra un nombre legible, no un UUID, una vez resuelto el mapa; la columna «Ubicación» sólo aparece en modo búsqueda.
- [ ] Las filas inactivas reciben `isRowInactive`: badge más tinte `bg-destructive/5`, en tabla y en tarjeta.
- [ ] La auditoría sólo es alcanzable con `SUPERADMIN` (`CONVENTIONS.md` §10.4).
- [ ] Las claves nuevas existen en `es`, `en` y `nl`; `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|text-(red|green)-[0-9]|#[0-9a-fA-F]{3,6}" src/features/healthFacility/ src/features/catalogItem/CatalogSelect.tsx`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con nombre, código local y tipo (§3.9); el picker, el buscador y los combos van a ancho completo; el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` no hay botón «Crear», «Editar», «Dar de baja», «Reactivar» ni toggle de inactivos, y el listado se ve completo; con `ANALYTICS` la entrada del menú no aparece y entrar por URL redirige sin pantalla en blanco; un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders, la ayuda de los dos caracteres y los `aria-label`; las claves de §3.10 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.6: `geoLocationId`, `q`, `includeInactive` y `page` en `searchParams`, `pageSize` en `preferencesStore`, ninguna fila copiada a `useState`, el mapa de tipos derivado por `useMemo` y el modo derivado, no almacenado.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** una sola pantalla con dos modos derivados de `searchParams`, en vez de dos pantallas (listado y buscador). Es el mismo dato con las mismas acciones, la misma tabla y la misma auditoría; separarlas habría duplicado todo eso para cambiar sólo qué endpoint alimenta las filas.
- **Sí:** el modo se **deriva** de `q` y `geoLocationId` en vez de guardarse como parámetro propio. Un `mode` en la URL permite un estado imposible —modo búsqueda con `q` vacío— y sería un segundo sitio donde vive el mismo hecho, justo lo que prohíbe `CONVENTIONS.md` §7.
- **Sí:** el hook de `006` vive en `features/healthFacility/api.ts`, fuera de `createResource`. La búsqueda tiene reglas que la fábrica no puede expresar sin deformarse: mínimo de dos caracteres, `OR` entre cuatro columnas y visibilidad de inactivas decidida por rol sin toggle. Se descartó extender la fábrica con un `searchPath` genérico que hoy usaría una sola entidad, y se descartó un segundo `createResource` sobre `/search`, que habría heredado mutaciones sin sentido sobre esa ruta.
- **Sí:** el toggle de inactivos **desaparece** al entrar en modo búsqueda (hallazgo C). Dejarlo deshabilitado con una explicación obliga a redactar un texto sobre una asimetría interna del backend; dejarlo activo y sin efecto es un control decorativo, que es exactamente lo que `CONVENTIONS.md` §10.4 quiere evitar.
- **Sí:** `<CatalogSelect>` vive en `features/catalogItem/`, no en `shared/components/`, pese a que `ARCHITECTURE.md` §4.3 la enumere entre las primitivas. Es el precedente exacto de `<CatalogTypeSelect>`, que vive en `features/catalogType/` y se consume desde `CatalogItemListPage.tsx:25`: un combo sobre los datos de una entidad pertenece a esa entidad, y llevarlo a `shared/` obligaría a que `shared/` importara de dos features.
- **Sí:** el combo de unidad padre se restringe a las unidades de la ubicación elegida en el formulario, aunque el backend admita un padre de cualquier ubicación. Es el caso real —una unidad depende de otra de su territorio— y es lo único que la API permite sin construir un segundo buscador dentro del formulario. **El cliente es aquí más restrictivo que el servidor, y se dice expresamente.**
- **No:** una página de detalle con las unidades dependientes. `003` es el único endpoint que trae la jerarquía, y montarle una pantalla convertía este spec en dos. Se consume como lectura auxiliar del formulario de edición y la jerarquía queda para su propio spec.
- **No:** replicar en el cliente la prevención de ciclos. A diferencia de `geoLocation` en FE04, aquí el backend sí valida el auto-padre y recorre los ancestros (hallazgo E): el cliente se limita a mapear `HFAC_004_SELF_PARENT` y `HFAC_004_CIRCULAR_PARENT` al campo del padre. Duplicar esa lógica habría sido escribir un `excludeSubtreeOf` para resolver un problema ya resuelto.
- **No:** ofrecer una forma de vaciar un campo opcional (hallazgo H). El servicio ignora los valores vacíos, así que un botón «quitar teléfono» mentiría: parecería funcionar y el dato seguiría ahí tras recargar. Se documenta la limitación y se anota como riesgo hacia `esavi-backend`, que es donde tiene arreglo.
- **Sí:** la columna «Tipo» se resuelve con un mapa cliente derivado de la query del catálogo, en los **dos** modos, aunque `006` ya devuelva `facilityType` incluido. Una sola ruta de código para pintar la columna vale más que ahorrar un `useMemo` en la mitad de los casos, y evita que la tabla cambie de forma según el modo.
- **Sí:** el schema usa 250 caracteres donde el validador dice 255, porque la columna es `STRING(250)`. Seguir al validador dejaría pasar un valor que la base rechaza más tarde y peor.
- **No:** declarar `sysDetails` en el tipo de la fila, aunque `002A`/`002B` lo devuelvan (hallazgo D). Declararlo lo convertiría en parte del contrato del cliente y alguien acabaría leyéndolo; que el backend deje de enviarlo es la corrección real.
- **Sí:** `latitude` y `longitude` se declaran `string | null` (hallazgo I). Declararlos `number` habría sido el error razonable: el modelo dice `DECIMAL`, pero `pg` entrega texto, y el `any` implícito de esa suposición se paga en la primera comparación.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Ningún campo opcional se puede vaciar con un `PUT` (hallazgo H): `healthFacility.service.ts` construye el objeto diferencial con `campo ? campo : undefined`, así que borrar un teléfono, una dirección o un correo ya guardados es imposible desde la API | El formulario no ofrece esa afordancia (§6). La vía correcta es distinguir en el servicio `undefined` (no enviado) de `null`/`''` (borrado explícito), y es trabajo de `esavi-backend` |
| `002A`/`002B` devuelven `sysDetails`, que `003` y `006` sí excluyen (hallazgo D). Es información interna viajando al cliente en el endpoint más consultado de la entidad | El tipo declarado no lo incluye y el cliente nunca lo lee. Anotado hacia `esavi-backend`: falta el `attributes: { exclude: ['sysDetails'] }` en los dos servicios de listado |
| El validador acepta 255 caracteres en `name`, `officialName` y `address`, pero las columnas son `STRING(250)`. Un valor de 253 pasa la validación y falla en la base con un error de driver, no de negocio | El schema del cliente usa 250. Anotado hacia `esavi-backend` para alinear validador y DDL; mientras tanto, el cliente es el único que impide ese rango |
| `<CatalogSelect>` depende de que exista un `catalogType` con `code: 'healthFacilityType'`, valor fijado a la vez en `healthFacility.service.ts:11` y en el trigger `TRG_healthFacility_validateCatalogs`. Si el catálogo no está sembrado o cambia de código, el campo de tipo deja de funcionar | El combo detecta ese caso y se deshabilita con `catalogItem.select.unknownType` en vez de quedarse cargando (§3.4). Es un fallo visible, no silencioso |
| Los tipos de unidad se piden con `limit: 100`; un catálogo con más ítems mostraría una lista truncada sin avisar | Es el mismo límite y el mismo compromiso que `<CatalogTypeSelect>` en FE03. Si algún catálogo pasa de 100 ítems, la salida es un combo con búsqueda (`cmdk`), que ya está anotado fuera de alcance en FE05 |
| La búsqueda con `geoLocationId` filtra por igualdad exacta, no por subárbol. Un usuario que elija una provincia en el picker y busque esperará las unidades de sus cantones, y verá cero | El texto de ayuda del buscador y el vacío de búsqueda lo explican. La resolución jerárquica existe en el backend para el filtro de casos (SPEC F48) pero `006` no la usa; ampliarla es trabajo de `esavi-backend` |
| Un ADMIN que busca ve unidades inactivas siempre, sin control ni indicación, mientras que en el listado por ubicación debe activar el toggle (hallazgo C) | Las filas inactivas se distinguen a simple vista por el tinte y el badge de `isRowInactive` (§3.9), que es lo que hace que la asimetría no se lea como un error de datos |

---

## 8. Impacto en pantallas existentes

- **`features/catalogItem/`** — gana `CatalogSelect.tsx`, componente nuevo. `CatalogItemListPage` y `CatalogItemFormDialog` no cambian.
- **`shared/config/navigation.ts`** — `nav.items.healthFacility` pierde `disabled: true` (línea 149). Ni el `minLevel`, ni el icono, ni la ruta cambian.
- **`app/router.tsx`** — se añade `/health-facilities` bajo `<RequireRole level={ROLE_LEVELS.USER}>`.
- **`shared/api/createResource.ts`** — **no se toca**. A diferencia de FE04, que tuvo que añadirle `filters`, esta entidad cabe entera en la fábrica tal como está; lo que no cabe vive fuera, en `useHealthFacilitySearch` (§3.3).
- **`shared/components/`** — `<GeoLocationPicker>`, `<ResourceTable>`, `<ResourceForm>` y `<AuditTrail>` se consumen tal como están; ninguna cambia.

---

## Lo que **no** está en este spec

- La página de detalle jerárquica con las unidades dependientes de una unidad.
- `<HealthFacilitySelect>` para `esaviCase`.
- Un mapa para `latitude` y `longitude`.
- `sysDetails`, ni declarado ni mostrado.
- La búsqueda jerárquica por territorio en `ESAVI-HFAC-006`.
- Vaciar un campo opcional desde el formulario.
- El purgado físico.
- La importación masiva de unidades de salud.

Cada uno de esos, si aterriza, va en su propio spec.

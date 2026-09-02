# SPEC FE04 — Geografía: `geoLevelType` + `geoLocation` + `<GeoLocationPicker>`

> **Estado:** Implementado
> **Depende de:** SPEC FE02 (fábrica de recursos y primitivas), SPEC FE03 (precedente de patrón `serverDecides` sin toggle, vía `catalogType`)
> **Fecha:** 2026-09-01
> **Objetivo:** Construir el CRUD de `geoLevelType` y `geoLocation` — la jerarquía territorial autorreferente que el resto del dominio (`healthFacility`, filtros de casos F48) cuelga — y estrenar `<GeoLocationPicker>`, la primitiva de cascada jerárquica que ARCHITECTURE.md §4.3 reserva desde el hito 1.

---

## 1. Por qué existe este spec

SPEC FE03 cerró `catalogItem` y dejó explícitamente fuera `geoLocation`, `geoLevelType` y `<GeoLocationPicker>` — "el resto del hito 2". Son la pieza que falta para que `healthFacility` (que apunta a `geoLocation`) y los filtros territoriales de casos (SPEC F48, jerárquicos sobre `geoLocationId`) tengan algo con qué trabajar.

**Tres hallazgos verificados contra el backend deciden el diseño, y ninguno es el que parecería razonable suponer:**

**A — No hay maestro-detalle en la API, a diferencia de `catalogItem`.** `GET /api/geo-locations` es una única ruta con `geoLevelId` y `parentId` como *query params opcionales* (`geoLocation.controller.ts`), no un listado por padre con segmento de ruta. La pantalla es una tabla plana con filtros, no una vista de dos niveles.

**B — Las dos entidades son de ruta única (`serverDecides`), igual que `catalogType`.** Ni `geoLevelType.routes.ts` ni `geoLocation.routes.ts` tienen un segundo `GET .../admin`: el controlador decide activos-vs-todos con `canViewInactive(req.user)`, que exige SUPERADMIN (`permissions.helper.ts`). `createResource` ya tiene este modo probado con `catalogType` — no hace falta tocar la fábrica para esto.

**C — El prefijo de código de error de `geoLevelType` no coincide con su código de operación.** El inventario cita `ESAVI-GEOLVL-*`, pero el servicio y el controlador emiten `GEOTYPE_*` (`GEOTYPE_001_CODE_EXISTS`, `GEOTYPE_004_NOT_FOUND`, etc. — ver `geoLevelType.service.ts`, `geoLevelType.controller.ts`). Un `errorFieldMap` que copie el prefijo del código de operación, como haría uno razonable, mapea códigos que el backend nunca emite. `geoLocation` no tiene este problema: sus códigos son `GEOLOC_*`, coincidentes.

**Dos piezas nuevas que este spec sí construye, porque ningún spec anterior las necesitaba:**

- **Filtros genéricos en `createResource`.** `geoLevelId`/`parentId` de `geoLocation` no caben en el `limit`/`offset` que `useList` conoce hoy. Se añade un `filters` opcional a `ListParams` — pieza reutilizable, no específica de geografía.
- **`<GeoLocationPicker>`.** Cascada nivel por nivel sobre `geoLocation`, sin forma de pedir "solo raíces" al backend (hallazgo D, más abajo) — así que el primer nivel se resuelve por `geoLevelTypeId`, no por `parentId` vacío.

**D — El backend no admite filtrar por `parentGeoLocationId IS NULL`.** `geoLocation.controller.ts` solo aplica el filtro de padre si `req.query.parentId` llega no vacío; omitirlo devuelve **todas** las filas, no solo las raíz. `<GeoLocationPicker>` no puede abrir su primer nivel pidiendo "sin padre": pide por `geoLevelTypeId` igual al `geoLevelType` de menor `sortOrder` (asumiendo que ese nivel — país, o el que sea el más alto sembrado — sólo contiene raíces). Es una suposición razonable pero no garantizada por una restricción de base de datos; queda anotada como riesgo hacia `esavi-backend`.

**E — El backend no impide ciclos en `parentGeoLocationId`.** `updateGeoLocationService` valida que el padre exista y esté activo, pero nunca que no sea la propia fila o uno de sus descendientes. Se decidió que el cliente lo evite por construcción: al editar, `<GeoLocationPicker>` excluye el subárbol de la fila en edición (§3 más abajo).

**F — `GET /api/geo-locations` ganó búsqueda de texto parcial.** `ESAVI-GEOLOC-002` acepta ahora `name` y `code` como query params opcionales, `ILIKE '%…%'` (`geoLocation.controller.ts`, `buildTextWhereConditions` en `geoLocation.service.ts`): `name` contra la columna `name`, `code` contra `externalCode` **o** `isoCode`. Los dos se combinan entre sí con `OR`, no con `AND` — un solo campo de búsqueda en la UI manda el mismo término como `name` y `code` a la vez (§3.3).

---

## 2. Alcance

**Dentro:**

- **`geoLevelType` de punta a punta**: los seis artefactos de `CONVENTIONS.md` §5, pantalla en `/geo-level-types`, CRUD plano calcado del patrón `catalogType` (`serverDecides`, sin toggle).
- **`geoLocation` de punta a punta**: los seis artefactos, pantalla en `/geo-locations`, tabla plana con filtros de `geoLevelTypeId`, `parentGeoLocationId` y búsqueda de texto (`name`/`code`) en `searchParams` (hallazgo A).
- **Filtros genéricos en `createResource`**: `ListParams.filters?: Record<string, string>`, propagados por `useList` y `useListByParent` como query params adicionales junto a `limit`/`offset`. Pieza de `shared/`, no específica de geografía.
- **`<GeoLocationPicker>`**, en `shared/components/`: cascada de `<Select>` nivel por nivel sobre `geoLocation`, primer nivel resuelto por `geoLevelTypeId` (hallazgo D), sin autodespliegue ni preselección. Dos consumidores dentro de este spec:
  - El campo `parentGeoLocationId` del formulario de `geoLocation` (con `excludeSubtreeOf` en edición, hallazgo E).
  - El filtro de padre en `GeoLocationListPage`.
- **Tipos del contrato**: `contracts/geoLevelType.ts` y `contracts/geoLocation.ts` vía `npm run contracts:sync` (`CreateGeoLevelTypeInput`, `CreateGeoLocationInput` ya existen en el backend); `contracts/declared/geoLevelType.ts` y `contracts/declared/geoLocation.ts` a mano, con la forma de fila (el backend no exporta la fila como tipo), siguiendo el precedente de `catalogType`.
- **Formulario de `geoLocation`** con los nueve campos de `CreateGeoLocationInput` menos `geoPolygon` y `level` (§3.5): `geoLevelTypeId`, `parentGeoLocationId`, `name`, `externalCode`, `officialName`, `shortName`, `isoCode`, `latitude`, `longitude`.
- **Marcado en rojo semántico de lo inactivo**, token `destructive`, en ambas tablas — mismo criterio que FE03.
- **Formulario en `<Dialog>` y auditoría en `<Sheet>`**, abiertos desde el listado, sin página de detalle — mismo patrón que `catalogType`/`catalogItem`.
- **Claves i18n** en `geoLevelType.*`, `geoLocation.*` y las de `common.*` que falten, en los tres idiomas.
- **Quitar `disabled: true`** de `nav.items.geoLevelType` y `nav.items.geoLocation` en `shared/config/navigation.ts` (el `minLevel: USER` ya coincide con el rol real de lectura y no cambia).

**Fuera de alcance (otros specs o no aplican):**

- **`healthFacility`.** Depende de `geoLocation` y de `catalogItem` (su tipo), pero es su propia entidad con su propio CRUD — spec aparte.
- **El filtro `geoLocationId` de casos (SPEC F48)**, aunque `<GeoLocationPicker>` nace preparado para ser su consumidor futuro: F48 exige resolución jerárquica de descendientes en el backend (`WITH RECURSIVE`), que ya existe del lado del servidor pero cuyo consumo desde el formulario de filtros de casos es un spec propio, sobre una entidad (`esaviCase`) que aún no existe en el cliente.
- **`geoPolygon`.** `DataTypes.GEOMETRY("MULTIPOLYGON", 4326)`, sin componente de mapa en el repositorio. `ARCHITECTURE.md` ya lo anota como "si algún día se quiere mapa".
- **`level` como campo editable.** Lo calcula el backend (`parent.level + 1`, o `1` si no hay padre) salvo que se envíe explícitamente; no se ofrece en el formulario, ni en creación ni en edición.
- **Prevención de ciclos en el backend.** Anotado como riesgo hacia `esavi-backend` (hallazgo E); el cliente mitiga por construcción en `<GeoLocationPicker>`, no repara el servicio.
- **`appUserGeoLocation`** (cobertura territorial por usuario) y su `ESAVI-USERGEO-008` recursivo — otra entidad, otro spec.
- **El purgado y la exposición de `sysDetails`.**
- **Corregir el prefijo `GEOTYPE_*` vs `ESAVI-GEOLVL-*`** (hallazgo C). Es un problema de nomenclatura de `esavi-backend`; aquí sólo se documenta y el `errorFieldMap` usa los códigos reales.
- **Importadores de datos geográficos** (`canImportGeographyData` existe en `permissions.helper.ts` pero no hay ruta de importación en el inventario para `geoLocation`) — no hay endpoint que consumir.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado de niveles | `/geo-level-types` | `features/geoLevelType/GeoLevelTypeListPage.tsx` | `<RequireRole level={USER}>` |
| Listado de ubicaciones | `/geo-locations` | `features/geoLocation/GeoLocationListPage.tsx` | `<RequireRole level={USER}>` |

Sin página de detalle en ninguna de las dos: formulario en `<Dialog>`, auditoría en `<Sheet>`, ambos abiertos desde el listado.

En `shared/config/navigation.ts`, `nav.groups.geography` ya existe con `nav.items.geoLevelType` (`icon: Layers`, `path: '/geo-level-types'`) y `nav.items.geoLocation` (`icon: MapPin`, `path: '/geo-locations'`), ambos `minLevel: ROLE_LEVELS.USER` — coincide con el rol real de `ESAVI-GEOLVL-002`/`ESAVI-GEOLOC-002`. El único cambio es quitarles `disabled: true`.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
# GEOLVL
POST   /api/geo-level-types              ESAVI-GEOLVL-001   ADMIN       crear
GET    /api/geo-level-types              ESAVI-GEOLVL-002   USER        listado (activos o todos, según rol)
GET    /api/geo-level-types/:id          ESAVI-GEOLVL-003   USER        detalle
PUT    /api/geo-level-types/:id          ESAVI-GEOLVL-004   ADMIN       actualizar
DELETE /api/geo-level-types/:id          ESAVI-GEOLVL-005A  ADMIN       baja lógica
PATCH  /api/geo-level-types/activate/:id ESAVI-GEOLVL-005B  SUPERADMIN  reactivar

# GEOLOC
POST   /api/geo-locations                ESAVI-GEOLOC-001   ADMIN       crear
GET    /api/geo-locations                ESAVI-GEOLOC-002   USER        listado (activos o todos, según rol; filtros geoLevelId/parentId/name/code)
GET    /api/geo-locations/:id            ESAVI-GEOLOC-003   USER        detalle (incluye geoLevelType, parent, children)
PUT    /api/geo-locations/:id            ESAVI-GEOLOC-004   ADMIN       actualizar
DELETE /api/geo-locations/:id            ESAVI-GEOLOC-005A  ADMIN       baja lógica
PATCH  /api/geo-locations/activate/:id   ESAVI-GEOLOC-005B  SUPERADMIN  reactivar
```

No hay `002A`/`002B` en ninguna de las dos (hallazgo B): una sola ruta, el controlador decide activos-vs-todos con `canViewInactive(req.user)`, que exige SUPERADMIN.

Las declaraciones, en `features/geoLevelType/api.ts` y `features/geoLocation/api.ts`:

```ts
// features/geoLevelType/api.ts
export const geoLevelTypeResource = createResource<GeoLevelType, CreateGeoLevelTypeInput, Partial<CreateGeoLevelTypeInput>>({
  key: 'geoLevelType',
  path: 'geo-level-types',
  idField: 'geoLevelTypeId',
  inactiveMode: 'serverDecides',
  staleTime: 30 * 60 * 1000,
});

// features/geoLocation/api.ts
export const geoLocationResource = createResource<GeoLocation, CreateGeoLocationInput, Partial<CreateGeoLocationInput>>({
  key: 'geoLocation',
  path: 'geo-locations',
  idField: 'geoLocationId',
  inactiveMode: 'serverDecides',
  staleTime: 30 * 60 * 1000,
});
```

### 3.3 Extensión de `createResource`: filtros genéricos

`shared/api/createResource.ts` gana un campo opcional en `ListParams`:

```ts
export interface ListParams {
  page?: number;
  pageSize: number;
  includeInactive?: boolean;
  filters?: Record<string, string>;
}
```

`useList` y `useListByParent` mandan `...filters` junto a `limit`/`offset` en `params` de `client.get`, y `filters` entra en la `queryKey` para que cambiar un filtro invalide la caché correcta: `[config.key, 'list', { limit, offset, includeInactive, filters }]`. Valores `undefined` no se serializan — un filtro sin elegir no manda `?geoLevelId=`. Ningún consumidor existente pasa `filters`, así que el cambio es aditivo y no toca `catalogType` ni `catalogItem`.

`geoLocationResource.useList` se consume así, desde `GeoLocationListPage`:

```ts
geoLocationResource.useList({
  page,
  pageSize,
  filters: {
    ...(geoLevelId && { geoLevelId }),
    ...(parentId && { parentId }),
    ...(q && { name: q, code: q }),
  },
});
```

**Búsqueda de texto (`name`/`code`, hallazgo F).** `GET /api/geo-locations` gana dos query params opcionales, `name` y `code`, con `ILIKE '%…%'` (`geoLocation.controller.ts`, `buildTextWhereConditions` en `geoLocation.service.ts`): `name` filtra contra la columna `name`; `code` filtra contra `externalCode` **o** `isoCode`. Los dos se combinan entre sí con `OR`, no con `AND` — mandar el mismo término como `name` y `code` a la vez, como hace el ejemplo de arriba, produce "nombre contiene X **o** código (externo o ISO) contiene X", un único campo de búsqueda con esa semántica, sin distinguir en la UI si el match vino del nombre o del código. `geoLevelId`/`parentId` siguen siendo filtros exactos, AND-eados por separado con ese OR de texto.

### 3.4 Tipos del contrato

`CreateGeoLevelTypeInput` y `CreateGeoLocationInput` llegan por `npm run contracts:sync` desde `esavi-backend/src/types/geography/`. Las filas se declaran a mano — el backend no las exporta como tipo — con su origen anotado, igual que `contracts/declared/catalogType.ts`:

```ts
// contracts/declared/geoLevelType.ts
// Origin: esavi-backend/src/models/geoLevelType.model.ts
export interface GeoLevelType {
  geoLevelTypeId: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// contracts/declared/geoLocation.ts
// Origin: esavi-backend/src/models/geoLocation.model.ts
// ESAVI-GEOLOC-002/002 (list) never includes geoLevelType/parent/children — only
// ESAVI-GEOLOC-003 (detail) does. The list row's geoLevelTypeId is a bare FK.
export interface GeoLocation {
  geoLocationId: string;
  geoLevelTypeId: string | null;
  parentGeoLocationId: string | null;
  name: string;
  officialName: string | null;
  shortName: string | null;
  isoCode: string | null;
  externalCode: string;
  level: number;
  latitude: number | null;
  longitude: number | null;
  sortOrder: number | null;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// Shape of ESAVI-GEOLOC-003's response — the only read that includes relations.
export interface GeoLocationDetail extends GeoLocation {
  geoLevelType: { geoLevelTypeId: string; code: string; name: string } | null;
  parent: { geoLocationId: string; name: string; level: number; externalCode: string } | null;
  children: { geoLocationId: string; name: string; level: number; externalCode: string }[];
}
```

El tipo de actualización es `Partial<CreateGeoLevelTypeInput>` y `Partial<CreateGeoLocationInput>`, sin `geoPolygon` en el schema de formulario aunque el tipo lo declare (§2, fuera de alcance).

### 3.5 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Página de `geoLevelType` | URL | `searchParams.page` | 1 si falta |
| Listado de `geoLevelType` | TanStack Query | `['geoLevelType', 'list', { limit, offset, includeInactive: false }]` | `serverDecides`: `includeInactive` siempre `false` en la queryKey — no hay toggle, la fábrica no lo expone |
| Filtro `geoLevelTypeId` de `geoLocation` | URL | `searchParams.geoLevelId` | Se comparte por enlace |
| Filtro `parentGeoLocationId` de `geoLocation` | URL | `searchParams.parentId` | Idem |
| Búsqueda de texto de `geoLocation` | URL | `searchParams.q` | Un solo campo; se manda como `name` y `code` a la vez (§3.3, hallazgo F). Debounce antes de escribir en `searchParams`, mismo criterio que cualquier filtro de texto |
| Página de `geoLocation` | URL | `searchParams.page` | Vuelve a 1 al cambiar cualquier filtro, incluida la búsqueda |
| `pageSize` | Zustand | `preferences.pageSize` | Compartido con el resto de entidades |
| Listado de `geoLocation` | TanStack Query | `['geoLocation', 'list', { limit, offset, includeInactive: false, filters: { geoLevelId, parentId, name, code } }]` | `staleTime` 30 min (catálogo, `CONVENTIONS.md` §7) |
| Lista de tipos para el combo de filtro y el lookup de nombres | TanStack Query | `['geoLevelType', 'list', { limit: 100, offset: 0, includeInactive: false }]` | Misma entrada de caché que usa `GeoLevelTypeListPage` si `pageSize` coincidiera; en la práctica es una consulta distinta con `limit: 100`, igual que `CatalogTypeSelect` en FE03 |
| Mapa `geoLevelTypeId → name` para la columna "Nivel" | Derivado, en el render | `useMemo` sobre la respuesta de arriba | No es estado nuevo: se deriva de una query ya en caché, nunca se copia a `useState` |
| Cascada de `<GeoLocationPicker>` (nivel actual seleccionado por columna) | Componente | `useState` dentro del propio picker | Efímero: la selección final sale por `onChange(geoLocationId)`, el picker no persiste su estado interno |
| Diálogo de formulario y fila en edición | Componente | `useState` en cada `ListPage` | Guarda el id, nunca una copia de la fila |
| Panel de auditoría abierto | Componente | `useState` | Efímero |
| Confirmación de baja/reactivación | Componente | `useState` del `<AlertDialog>` | Efímero |
| Valores del formulario | React Hook Form | `useForm` de `<ResourceForm>` | Borrador, no estado de servidor |

Puntos que se rompen si no se respetan:

- **`geoLevelId`, `parentId` y `q` van en `searchParams`, no en un store ni en el estado del picker.** Es lo que hace que `/geo-locations?geoLevelId=<id>` sea compartible y sobreviva al refresco.
- **Cambiar cualquier filtro, incluida la búsqueda, resetea `page` a 1.**
- **`q` se traduce a `filters: { name: q, code: q }` en la llamada a `useList`, nunca a un único `filters.search`** que el backend no reconoce (§3.3, hallazgo F).
- **El mapa de nombres de nivel no es una copia del servidor**: se recalcula en cada render desde la query de `geoLevelType` ya cacheada, con `useMemo`. Si esa query aún no resolvió, la columna muestra el id crudo mientras carga, nunca un placeholder que se quede pegado.
- **Toda mutación invalida su propia clave raíz** (`['geoLevelType']` o `['geoLocation']`), como ya hace la fábrica — nunca claves enumeradas a mano.

### 3.6 Formularios y validación

**`geoLevelType`** — `features/geoLevelType/schemas.ts`, límites de `geoLevelType.validator.ts`:

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `code` | `<Input>` | sí | Máx. 100, no vacío tras `trim`. El backend lo normaliza a mayúsculas |
| `name` | `<Input>` | sí | Máx. 150, no vacío tras `trim` |
| `sortOrder` | `<Input type="number">` | sí | Entero ≥ 1 (el validador exige `min: 1`, no 0 como `catalogType`) |

Errores mapeados: `GEOTYPE_001_CODE_EXISTS`, `GEOTYPE_004_CODE_EXISTS` → `code` (hallazgo C: prefijo `GEOTYPE_`, no `GEOLVL_`). El resto (`GEOTYPE_004_NOT_FOUND`, `GEOTYPE_005A_ALREADY_INACTIVE`, `GEOTYPE_005B_ALREADY_ACTIVE`) va al toast por `code`.

**`geoLocation`** — `features/geoLocation/schemas.ts`, límites de `geoLocation.validator.ts`:

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `geoLevelTypeId` | `<Select>` sobre el combo de niveles | sí | FK; `GEOLOC_001_GEOLEVELTYPE_NOT_FOUND` si no existe o está inactivo |
| `parentGeoLocationId` | `<GeoLocationPicker>` | no | Vacío = raíz. En edición excluye el propio subárbol (§3.7, hallazgo E) |
| `name` | `<Input>` | sí | Máx. 150, no vacío tras `trim`. Único entre hermanos del mismo padre (`GEOLOC_001_NAME_EXISTS`/`004`) |
| `externalCode` | `<Input>` | sí | Máx. 100, no vacío tras `trim`, único global (`GEOLOC_001_EXTERNAL_CODE_EXISTS`/`004`) |
| `officialName` | `<Input>` | no | Sin validador propio; se replica el máximo del modelo, 250 |
| `shortName` | `<Input>` | no | Máx. 100 |
| `isoCode` | `<Input>` | no | Máx. 10 |
| `latitude` | `<Input type="number">` | no | -90 a 90 |
| `longitude` | `<Input type="number">` | no | -180 a 180 |

`level` y `geoPolygon` no son campos del formulario (§2). `sortOrder` tampoco: a diferencia de `geoLevelType`, `CreateGeoLocationInput` lo declara opcional y el servicio lo calcula solo (`max` entre hermanos) si no llega — se mantiene fuera para no ofrecer un control que compite con ese cálculo.

Errores mapeados a su campo:

| `code` | Campo |
|---|---|
| `GEOLOC_001_GEOLEVELTYPE_NOT_FOUND`, `GEOLOC_004_GEOLEVELTYPE_NOT_FOUND` | `geoLevelTypeId` |
| `GEOLOC_001_PARENT_GEOLOCATION_NOT_FOUND`, `GEOLOC_004_PARENT_GEOLOCATION_NOT_FOUND` | `parentGeoLocationId` |
| `GEOLOC_001_NAME_EXISTS`, `GEOLOC_004_NAME_EXISTS` | `name` |
| `GEOLOC_001_EXTERNAL_CODE_EXISTS`, `GEOLOC_004_EXTERNAL_CODE_EXISTS` | `externalCode` |

`GEOLOC_004_NOT_FOUND`, `GEOLOC_005A_ALREADY_INACTIVE`, `GEOLOC_005B_ALREADY_ACTIVE` van al toast por `code`. `errors` no se muestra nunca. El `PUT` viaja completo (update diferencial en servidor); ni `geoLevelType`/`parentGeoLocationId` en `geoLocation` se preprocesan en el cliente cuando no cambian.

### 3.7 `<GeoLocationPicker>` — diseño de la primitiva

`shared/components/GeoLocationPicker.tsx`. Cascada de `<Select>`, uno por nivel, apilados verticalmente.

**Props:**

```ts
interface GeoLocationPickerProps {
  value: string | null;              // geoLocationId elegido, o null
  onChange: (geoLocationId: string | null) => void;
  excludeSubtreeOf?: string;         // geoLocationId a excluir junto con sus descendientes (hallazgo E)
}
```

**Primer nivel (hallazgo D).** El backend no filtra `parentGeoLocationId IS NULL`. El picker pide el `geoLevelType` de menor `sortOrder` (una consulta a `['geoLevelType', 'list', ...]`, ya en caché por el resto de la pantalla) y usa su `geoLevelTypeId` como filtro: `geoLocationResource.useList({ filters: { geoLevelId: rootLevelTypeId } })`. Es una suposición sobre los datos sembrados, no una garantía del esquema — anotada como riesgo (§7).

**Niveles siguientes.** Cada `<Select>` elegido dispara la consulta del nivel siguiente con `filters: { parentId: <geoLocationId elegido> }`. Elegir un valor en un nivel intermedio limpia (no oculta) los niveles posteriores — mismo criterio que un combo dependiente, para que no queden seleccionados un padre y un "nieto" incoherente entre sí.

**Sin autodespliegue ni preselección**, igual que `<CatalogTypeSelect>` de FE03: el primer `<Select>` arranca vacío y no se auto-resuelve hasta que el usuario elige.

**Sin precarga de la cadena de ancestros en edición** (decisión confirmada): al editar una fila con `parentGeoLocationId` ya asignado, el picker **no** resuelve automáticamente la cascada completa desde la raíz. Se muestra el valor plano (nombre del padre actual, de solo lectura) con un botón «Cambiar», que al pulsarse abre la cascada vacía para elegir un padre nuevo desde el nivel raíz. Evita la complejidad de reconstruir N niveles de ancestros con N consultas encadenadas en el primer render del formulario.

**`excludeSubtreeOf` (hallazgo E).** Cuando se edita una fila, `GeoLocationFormDialog` pasa el propio `geoLocationId` como `excludeSubtreeOf`. El picker filtra esa fila de las opciones de cada nivel que carga. **No** resuelve el subárbol completo por adelantado (eso exigiría `ESAVI-USERGEO-008`-style recursión que no existe para `geoLocation`): filtra únicamente por igualdad de id en las opciones que ya carga nivel por nivel, lo que basta para impedir seleccionar la propia fila como su padre, pero **no impide** elegir un nieto lejano que el picker nunca listó en esa rama porque el usuario no navegó hasta ahí — el ciclo real solo era alcanzable navegando exactamente hacia el descendiente en cuestión, y ahí sí queda bloqueado.

**Estados propios:** carga (skeleton de un `<Select disabled>` por nivel visible), error (mensaje inline con reintentar, sin tumbar el formulario que lo contiene), vacío en un nivel (nivel sin hijos: el `<Select>` de ese nivel no se pinta, el anterior queda como selección final).

### 3.8 Estados de la pantalla

| Estado | `GeoLevelTypeListPage` | `GeoLocationListPage` | Clave i18n |
|---|---|---|---|
| Carga | Skeleton, `pageSize` filas | Igual | — |
| Vacío sin filtros | Botón «Crear» si `useCan(ADMIN)` | Igual | `geoLevelType.list.empty` / `geoLocation.list.empty` |
| Vacío con filtros | — (no hay filtros en esta pantalla) | Botón «Limpiar filtros» | `geoLocation.list.emptyFiltered` |
| Error | Mensaje por `code` + reintentar | Igual | `common.table.error` |
| Sin permiso | `<RequireRole level={USER}>` redirige | Igual | — |

### 3.9 Responsividad y accesibilidad

- **`GeoLevelTypeListPage`**: tarjeta con `name` como `primary`, `code` como `secondary`, `sortOrder` como `meta`.
- **`GeoLocationListPage`**: tarjeta con `name` como `primary`, el nombre de nivel resuelto vía el mapa de §3.5 como `secondary`, `externalCode` como `meta`.
- Los dos combos de filtro (`geoLevelTypeId`, `<GeoLocationPicker>` de padre) y el campo de búsqueda (`q`) colapsan a ancho completo por debajo de `md`, apilados antes de la tabla.
- `<GeoLocationPicker>`: cada `<Select>` de nivel ocupa el ancho completo por debajo de `md`, apilados verticalmente (ya lo son en escritorio también — no hay versión horizontal).
- Diálogo de formulario a ancho completo por debajo de `md`, barra de acciones fija abajo — resuelto por `<ResourceForm>`.
- Auditoría en `<Sheet>` lateral en escritorio, inferior en móvil.
- Tablas en contenedor `overflow-x: auto`; el body nunca hace scroll horizontal.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- Cada `<Select>` del picker lleva `aria-label` por i18n indicando su nivel (`geoLocation.picker.levelLabel`, interpolado con el nombre del nivel).

### 3.10 Claves i18n nuevas

En `es`, `en` y `nl`:

| Clave | Uso |
|---|---|
| `geoLevelType.list.title`, `geoLevelType.list.empty` | Título/estado vacío |
| `geoLevelType.form.createTitle`, `editTitle` | Diálogo |
| `geoLevelType.fields.code`, `name`, `sortOrder`, `isActive` | Etiquetas y cabeceras |
| `geoLevelType.status.active`, `inactive` | Distintivo |
| `geoLevelType.errors.GEOTYPE_001_CODE_EXISTS` y las demás de §3.6 | Mensajes por `code` |
| `geoLocation.list.title`, `empty`, `emptyFiltered` | Título/estados |
| `geoLocation.filters.geoLevelType`, `parent`, `search` | Etiquetas de los combos de filtro y del campo de búsqueda |
| `geoLocation.form.createTitle`, `editTitle` | Diálogo |
| `geoLocation.fields.geoLevelTypeId`, `parentGeoLocationId`, `name`, `externalCode`, `officialName`, `shortName`, `isoCode`, `latitude`, `longitude`, `isActive` | Etiquetas y cabeceras |
| `geoLocation.form.changeParent` | Botón «Cambiar» sobre el padre de solo lectura |
| `geoLocation.status.active`, `inactive` | Distintivo |
| `geoLocation.errors.GEOLOC_001_NAME_EXISTS` y las demás de §3.6 | Mensajes por `code` |
| `geoLocation.picker.levelLabel` | `aria-label` de cada `<Select>` del picker, interpolado con el nombre del nivel |
| `geoLocation.picker.emptyLevel` | Nivel sin hijos |
| `geoLocation.picker.loadError` | Error inline de un nivel |

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y arrancable, y puede committearse solo. Primero la pieza compartida (afecta a toda la fábrica), luego `geoLevelType` (la más simple, valida el patrón `serverDecides` + `filters` sin la complejidad del picker), luego `geoLocation` y `<GeoLocationPicker>` juntos (se necesitan mutuamente), y al final ruta, navegación e i18n.

1. **Filtros genéricos en `createResource`.** `ListParams.filters?: Record<string, string>` en `shared/api/createResource.ts`, propagado por `useList` y `useListByParent` a `params` de `client.get` y a la `queryKey`.
   *Verificación:* test con MSW en `createResource.test.tsx`: `useList({ page: 1, pageSize: 10, filters: { geoLevelId: 'x' } })` pega a `?limit=10&offset=0&geoLevelId=x`; sin `filters`, la URL no lleva esas claves. Los tests existentes de `catalogType`/`catalogItem` siguen en verde sin tocarlos.

2. **Tipos del contrato de `geoLevelType`.** `npm run contracts:sync` trae `contracts/geoLevelType.ts`. A mano, `contracts/declared/geoLevelType.ts` según §3.4.
   *Verificación:* `npm run check` en 0; el diff de `contracts/` se revisa a ojo.

3. **`geoLevelType` de punta a punta.** `features/geoLevelType/api.ts` (declaración de §3.2), `schemas.ts` (§3.6), `GeoLevelTypeFormDialog.tsx`, `GeoLevelTypeAuditSheet.tsx`, `GeoLevelTypeListPage.tsx` — calcados de `catalogType` con los campos y límites propios.
   *Verificación:* test con MSW: `useList` con nivel USER y con SUPERADMIN confirma que no hay toggle expuesto (`inactiveMode: 'serverDecides'`, como en `catalogType`); un `409` con `GEOTYPE_001_CODE_EXISTS` marca el campo `code` y no abre un toast genérico; `sortOrder: 0` falla la validación del cliente (mínimo 1, no 0).

4. **Tipos del contrato de `geoLocation`.** `npm run contracts:sync` trae `contracts/geoLocation.ts`. A mano, `contracts/declared/geoLocation.ts` con `GeoLocation` y `GeoLocationDetail` de §3.4.
   *Verificación:* `level` es `number` no opcional; `GeoLocation` (fila de listado) no declara `geoLevelType`, `parent` ni `children` — esos campos solo existen en `GeoLocationDetail`. `npm run check` en 0.

5. **`geoLocation` — recurso y schemas.** `features/geoLocation/api.ts` (§3.2) y `features/geoLocation/schemas.ts` (§3.6), con el `errorFieldMap` ceñido a los códigos `GEOLOC_*` reales.
   *Verificación:* test con MSW: `useList` con `filters: { geoLevelId, parentId }` pega a la URL correcta; `externalCode` vacío falla; `latitude: 91` falla; `level` y `geoPolygon` no son campos del schema.

6. **`<GeoLocationPicker>`.** `shared/components/GeoLocationPicker.tsx` según §3.7: primer nivel por `geoLevelTypeId` de menor `sortOrder`, niveles siguientes por `parentId`, `excludeSubtreeOf`, sin autodespliegue ni precarga de ancestros en edición.
   *Verificación:* test con MSW: abre con el primer `<Select>` pidiendo `geo-locations?geoLevelId=<id-del-nivel-raíz>`; elegir una opción dispara la consulta del nivel siguiente con `parentId`; con `excludeSubtreeOf` fijado, esa fila no aparece entre las opciones del nivel donde vive; un nivel sin hijos no pinta un `<Select>` vacío.

7. **Formulario y auditoría de `geoLocation`.** `GeoLocationFormDialog.tsx` sobre `<ResourceForm>` con los nueve campos de §3.6, `<GeoLocationPicker>` para `parentGeoLocationId` (con el botón «Cambiar» de §3.7 en edición) y `<Select>` sobre el combo de `geoLevelType` para `geoLevelTypeId`; `GeoLocationAuditSheet.tsx` sobre `<AuditTrail>`.
   *Verificación:* crear sin `parentGeoLocationId` no lo manda en el `POST`; un `409` con `GEOLOC_001_NAME_EXISTS` marca `name`; en edición, el picker con `excludeSubtreeOf` no ofrece la propia fila.

8. **`GeoLocationListPage`.** Tabla plana con los filtros de §3.5 en `searchParams` (`geoLevelId`, `parentId`, `q` con debounce), columna "Nivel" resuelta vía el mapa `geoLevelTypeId → name` de §3.5, tarjeta responsive de §3.9, reseteo de `page` al cambiar cualquier filtro.
   *Verificación:* `?geoLevelId=<id>&q=<texto>&page=2` sobrevive al refresco y se reproduce en otra pestaña; cambiar el filtro de padre o el término de búsqueda deja `page` en 1; buscar por `q` pega a `geo-locations?name=<texto>&code=<texto>`; con la query de `geoLevelType` aún cargando, la columna "Nivel" muestra el id crudo sin reventar y luego resuelve el nombre.

9. **Rutas y navegación.** `/geo-level-types` y `/geo-locations` en `app/router.tsx`, ambas bajo `<RequireRole level={ROLE_LEVELS.USER}>`; quitar `disabled: true` de `nav.items.geoLevelType` y `nav.items.geoLocation`.
   *Verificación:* ambos enlaces del sidebar navegan; con rol `ANALYTICS` ninguna de las dos entradas aparece y entrar por URL redirige sin pantalla en blanco.

10. **Claves i18n.** Las de §3.10 en `es`, `en` y `nl`.
    *Verificación:* `npm run i18n:check` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las doce rutas `ESAVI-GEOLVL-*`/`ESAVI-GEOLOC-*` de §3.2 se consumen desde `features/geoLevelType/api.ts` y `features/geoLocation/api.ts`, y ninguna otra.
- [ ] `createResource().useList` con `filters` produce query params adicionales sin romper los consumidores existentes de `catalogType`/`catalogItem` (sus tests siguen en verde sin modificarlos).
- [ ] Ninguna de las dos pantallas expone un toggle de "mostrar inactivos": `inactiveMode: 'serverDecides'` en ambas declaraciones.
- [ ] `?geoLevelId=<id>&parentId=<id>&q=<texto>&page=2` reproduce exactamente la misma vista de `GeoLocationListPage` tras un refresco y al abrirse en otra pestaña.
- [ ] Cambiar el filtro de nivel, de padre o el término de búsqueda deja `searchParams.page` en 1.
- [ ] Buscar por `q=<texto>` pega a `geo-locations?name=<texto>&code=<texto>` (más `geoLevelId`/`parentId` si están activos) — nunca a un único `search=<texto>` que el backend no reconoce.
- [ ] `<GeoLocationPicker>` pide su primer nivel filtrando por el `geoLevelTypeId` de menor `sortOrder`, nunca con `parentId` vacío.
- [ ] Con `excludeSubtreeOf` fijado en edición, la fila que se edita no aparece entre las opciones de `<GeoLocationPicker>` en el nivel donde vive.
- [ ] Los seis artefactos de `CONVENTIONS.md` §5 existen para `geoLevelType` y para `geoLocation`.
- [ ] Una mutación de cada entidad invalida su propia clave raíz (`['geoLevelType']` o `['geoLocation']`) y ninguna otra.
- [ ] Un `409` con `GEOTYPE_001_CODE_EXISTS` marca el campo `code` del formulario de `geoLevelType` — no `GEOLVL_001_CODE_EXISTS`, que el backend nunca emite.
- [ ] Un `409` con `GEOLOC_001_NAME_EXISTS` o `GEOLOC_001_EXTERNAL_CODE_EXISTS` marca el campo correspondiente del formulario de `geoLocation`.
- [ ] `grep -rn "\.errors" src/features/geoLevelType/ src/features/geoLocation/` no devuelve accesos a la propiedad del error de API.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `grep -rnE "geoPolygon|\blevel\b" src/features/geoLocation/schemas.ts` no encuentra `geoPolygon` ni `level` como campos del schema de formulario.
- [ ] Guardar sin tocar nada no genera entrada de auditoría nueva en ninguna de las dos entidades (update diferencial del backend).
- [ ] La columna "Nivel" de `GeoLocationListPage` muestra un nombre legible, no un UUID, una vez resuelto el mapa de `geoLevelType`.
- [ ] Vacío con filtros activos en `geoLocation` pinta `geoLocation.list.emptyFiltered` con botón de limpiar, no el vacío genérico.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** Ambas pantallas se ven correctas en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|text-(red|green)-[0-9]|#[0-9a-fA-F]{3,6}" src/features/geoLevelType/ src/features/geoLocation/ src/shared/components/GeoLocationPicker.tsx`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** Las tablas colapsan a tarjetas según §3.9; `<GeoLocationPicker>` apila sus niveles a ancho completo; el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` no hay botón «Crear», «Editar», «Dar de baja» ni «Reactivar» en ninguna de las dos pantallas, y el listado se ve completo (sin filas ocultas: `serverDecides` ya excluye inactivas para quien no es SUPERADMIN). Con `ANALYTICS` ninguna entrada del menú aparece y entrar por URL redirige sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders, `aria-label` del picker y el texto del distintivo; las claves de §3.10 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.5: `geoLevelId`/`parentId`/`page` en `searchParams`, `pageSize` en `preferencesStore`, ninguna fila copiada a `useState`, el mapa de nombres de nivel derivado por `useMemo` y no duplicado en estado propio.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** dos pantallas planas, sin maestro-detalle. El inventario no ofrece un listado por padre para `geoLocation` (hallazgo A): `geoLevelId`/`parentId` son filtros opcionales sobre una única ruta, no un segmento de URL como `catalogItem`. Copiar el patrón de FE03 aquí habría sido inventar una forma de API que no existe.
- **Sí:** extender `createResource` con `filters` genérico, en vez de un hook a medida fuera de la fábrica. Es la opción que deja a `<GeoLocationPicker>` — que repite la misma forma de consulta en cascada — dentro del patrón que gobierna las demás 40+ entidades, y queda disponible para cualquier filtro simple futuro sin volver a tocar la fábrica.
- **Sí:** el primer nivel de `<GeoLocationPicker>` se resuelve por `geoLevelTypeId` de menor `sortOrder`, no por `parentId` vacío. Es la única vía posible: el backend no admite filtrar `parentGeoLocationId IS NULL` (hallazgo D). Queda anotado como riesgo porque depende de que los datos sembrados respeten esa convención, no de una restricción de esquema.
- **Sí:** `<GeoLocationPicker>` excluye el subárbol de la fila en edición filtrando por igualdad de id en cada nivel que carga, en vez de resolver la jerarquía completa por adelantado. El backend no expone un endpoint recursivo para `geoLocation` (a diferencia de `appUserGeoLocation`/`008`), así que replicar esa recursión en el cliente para una primitiva de formulario es más costoso de lo que el caso de uso justifica. Se acepta la limitación: un ciclo hacia una rama nunca visitada por el usuario en esa sesión de edición no queda bloqueado por el cliente, solo el que se alcanzaría navegando hacia él.
- **No:** precargar la cascada completa de ancestros al editar una fila con padre ya asignado. Exigiría resolver N niveles con N consultas encadenadas antes del primer render útil del formulario. Se prefiere mostrar el padre actual de solo lectura con un botón «Cambiar» que abre la cascada vacía — más simple y consistente con que el picker nunca se autodespliega ni preselecciona (mismo criterio que `<CatalogTypeSelect>` de FE03).
- **Sí:** la columna "Nivel" de `GeoLocationListPage` resuelve el nombre contra un mapa derivado de la query de `geoLevelType`, ya en caché para el combo de filtro, en vez de pedir el detalle (`003`, que sí incluye la relación) por cada fila. Evita N+1 peticiones sobre una tabla paginada.
- **No:** modificar `getActiveGeoLocationsService`/`getAllGeoLocationsService` en el backend para que hagan `include` de `geoLevelType`. Es un cambio de `esavi-backend`, fuera de este repositorio; el mapa cliente es la mitigación disponible hoy.
- **Sí:** `errorFieldMap` de `geoLevelType` usa el prefijo real `GEOTYPE_*`, no `GEOLVL_*` (hallazgo C), pese a que el código de operación del inventario sea `ESAVI-GEOLVL-*`. Mapear el prefijo "esperable" produce un `errorFieldMap` que nunca dispara, igual que el hallazgo E de FE03 con los códigos fantasma de `catalogItem`.
- **No:** ofrecer `level` como campo editable, aunque el backend lo acepte en el `POST`/`PUT`. El servicio lo calcula automáticamente a partir del padre; exponerlo invita a introducir una jerarquía inconsistente con la que el propio backend mantiene.
- **No:** `geoPolygon` en el formulario. No hay componente de mapa en el repositorio y `ARCHITECTURE.md` ya lo deja para si algún día se necesita.
- **Sí:** las dos entidades comparten el patrón `serverDecides` sin toggle, calcado de `catalogType` en FE02/FE03 en vez de inventar un tercer modo. El backend ya decide por rol (`canViewInactive`), y añadir un control de cliente que no cambia nada en la petición sería un control decorativo.
- **Sí:** la búsqueda de `geoLocation` es un único campo de texto (`searchParams.q`) que se traduce a `filters: { name: q, code: q }`, no dos campos separados de nombre y código (hallazgo F). El backend ya combina `name`/`code` con `OR`, así que separar los campos en la UI sugeriría una precisión (AND entre nombre y código) que la API no ofrece; un solo campo es honesto con el comportamiento real y más simple de operar.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `<GeoLocationPicker>` asume que el `geoLevelType` de menor `sortOrder` contiene únicamente ubicaciones raíz (`parentGeoLocationId: null`), porque el backend no permite filtrar por padre nulo (hallazgo D). Si algún día se siembra una fila de ese nivel con padre asignado, el picker la trataría igual como raíz | Es una suposición sobre los datos, no sobre el esquema — no hay forma de validarla desde el cliente. Anotado hacia `esavi-backend`: la vía correcta es que `GET /api/geo-locations` admita un valor explícito para "sin padre" (`parentId=null` o un flag `rootsOnly`) |
| El backend no impide ciclos en `parentGeoLocationId` (hallazgo E); la mitigación del picker (`excludeSubtreeOf`) solo cubre las ramas que el usuario navegó en esa sesión de edición, no el subárbol completo | Documentado como límite conocido en §6. La vía correcta es una validación de ciclo en `updateGeoLocationService`, fuera de este repositorio |
| El prefijo de error de `geoLevelType` (`GEOTYPE_*`) no coincide con su código de operación (`ESAVI-GEOLVL-*`) — cualquiera que lea el inventario sin revisar el controlador mapeará mal | El `errorFieldMap` usa los códigos reales, verificados contra `geoLevelType.controller.ts` y `geoLevelType.service.ts`. Anotado hacia `esavi-backend` para alinear el prefijo con el del inventario |
| `GET /api/geo-locations` no incluye `geoLevelType` ni `parent` en el listado — solo el detalle (`003`) los trae | La columna "Nivel" se resuelve con un mapa cliente derivado del combo de filtro (§3.5/§6), aceptando que se muestre el id crudo mientras esa query resuelve |
| `officialName` no tiene validador propio en `createGeoLocationValidator`/`updateGeoLocationValidator` (a diferencia de `shortName`/`isoCode`), aunque el modelo lo limita a `STRING(250)` | El formulario replica el límite del modelo (250) como validación de cliente únicamente; si el backend lo amplía o lo recorta, el cliente queda desalineado hasta que se revise |
| `externalCode` es requerido por el validador (`notEmpty`) pero opcional en `CreateGeoLocationInput` — el tipo y la regla de negocio real no coinciden | El schema del cliente sigue al validador (obligatorio), no al tipo. Anotado por si `esavi-backend` alinea el tipo más adelante |

---

## 8. Impacto en pantallas existentes

- **`shared/api/createResource.ts`** — gana `ListParams.filters?: Record<string, string>`, propagado por `useList` y `useListByParent`. Cambio aditivo: ningún consumidor existente (`catalogType`, `catalogItem`) pasa `filters`, así que su comportamiento no cambia y sus tests no se tocan.
- **`shared/config/navigation.ts`** — `nav.items.geoLevelType` y `nav.items.geoLocation` pierden `disabled: true`. Ningún `minLevel` cambia.
- **`app/router.tsx`** — se añaden `/geo-level-types` y `/geo-locations` bajo `<RequireRole level={ROLE_LEVELS.USER}>`.
- **`shared/components/`** — gana `GeoLocationPicker.tsx`, primitiva nueva. `<ResourceTable>`, `<ResourceForm>` y `<AuditTrail>` se consumen tal como están; ninguna cambia.

---

## Lo que **no** está en este spec

- `healthFacility`, aunque depende de `geoLocation` y quedará listo para consumirla.
- El filtro `geoLocationId` de casos (SPEC F48) — `<GeoLocationPicker>` queda preparado como futuro consumidor, pero su integración es de un spec sobre `esaviCase`, que aún no existe en el cliente.
- `geoPolygon`, como campo visible o editable.
- `level` como campo editable del formulario.
- Prevención de ciclos del lado del servidor.
- `appUserGeoLocation` y su cobertura territorial por usuario.
- El purgado y la exposición de `sysDetails`.
- Corregir el prefijo `GEOTYPE_*` vs `ESAVI-GEOLVL-*` en el backend.
- Importadores de datos geográficos.

Cada uno de esos, si aterriza, va en su propio spec.

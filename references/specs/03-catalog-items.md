# SPEC FE03 — Catálogos: tipos e ítems (maestro-detalle)

> **Estado:** Implementado
> **Depende de:** SPEC FE02 (fábrica de recursos y primitivas)
> **Fecha:** 2026-08-31
> **Objetivo:** Construir la pantalla de `catalogItem` como maestro-detalle sobre `catalogType`, estrenando el modo `adminPath` de `createResource` sobre un listado por padre y respetando el candado de `value` que impuso SPEC F46.

---

## 1. Por qué existe este spec

SPEC FE02 dejó la fábrica en pie y la validó con `catalogType`, la entidad más pequeña del inventario. Pero la validó a medias, y lo dijo: `catalogType` es una de las tres entidades de **ruta única**, así que el modo `'adminPath'` —el que usan las otras 40 entidades— se implementó y se probó con MSW, sin ninguna pantalla que lo ejerciera. El listado por padre corrió la misma suerte: `useListByParent` existe, tiene tests, y **ningún consumidor**.

`catalogItem` es la entidad que ejerce las dos cosas a la vez, y no por casualidad: es la primera del hito 2 que cuelga de otra. Es también la que cierra el catálogo de configuración —los valores que después rellenan los desplegables de una notificación, de una investigación y de una ficha de paciente—, así que sin ella los hitos 3 y 4 no tienen datos con los que trabajar.

**Cinco hallazgos verificados contra el backend y el inventario deciden el diseño.** Se documentan aquí porque tres de ellos contradicen lo que parecería razonable suponer:

**A — No existe un listado plano de `catalogItem`.** El inventario no tiene `GET /api/catalog-items`. Las dos únicas lecturas de listado son por padre: `ESAVI-CATITEM-002A` sobre `/type/:id` y `ESAVI-CATITEM-002B` sobre `/admin/type/:id`. **El maestro-detalle no es una preferencia de producto: es la única forma en que la API se deja consumir.** Sin un `catalogTypeId` no hay nada que pedir, y el servicio responde `CATITEM_002A_CATTYPEID_REQUIRED` si falta. Consecuencia directa: la entrada de menú `nav.items.catalogItem → /catalog-items`, hoy `disabled: true`, no puede llevar a una tabla sin más — necesita un tipo seleccionado antes de existir.

**B — Es la primera entidad `'adminPath'` real, y encima sobre el listado por padre.** Su declaración combina las dos piezas que FE02 escribió sin estrenar: `inactiveMode: 'adminPath'` y `parent: { operation: 'byType', segment: 'type/:parentId', adminSegment: 'admin/type/:parentId' }`. Si la fábrica tiene un error en esa combinación, esta pantalla es donde aparece — y arreglarlo aquí es arreglarlo para las 40 entidades restantes.

**C — Cinco filas del catálogo están congeladas (SPEC F46).** `ageUnit`/`YEARS`, `MONTHS`, `DAYS`; `outcome`/`DEATH`; `investigationStatus`/`UNKNOWN`. Son los valores que el código fuente del backend resuelve por nombre, y el candado existe porque un país que recodifica su catálogo los borraría sin enterarse. Tres consecuencias que la interfaz no puede ignorar:

- Un `PUT` que cambie `value` sobre una fila congelada responde **200 y no escribe nada, en silencio**. No hay error que mostrar: hay un campo que no se debe ofrecer.
- Un `DELETE` sobre una fila congelada responde **409 `CATITEM_005A_VALUE_LOCKED`**.
- `isValueLocked` no es editable por API en ninguna puerta, pero **sí se expone en `002A`, `002B` y `003`**, y F46 §3.8 dice para qué: «el servidor calla, pero el contrato lo dice, así que la interfaz puede deshabilitar el campo y el usuario nunca cree que guardó algo que no se guardó». Este spec cobra esa promesa.

**D — `value` es obligatorio en creación y los límites no son los de `catalogType`.** `name` admite 250 caracteres, no 200; `value` es `notEmpty` con máximo 250 y el backend lo normaliza a `CONSTANT_CASE`; `description` es `text` en el DDL, sin tope que replicar; `code` sigue siendo opcional, máximo 100, y se acuña en camelCase desde el `name` cuando falta. Copiar el schema de `catalogType` produciría un formulario que rechaza entradas legales.

**E — Dos códigos de error declarados que nadie emite.** Las enmiendas de SPEC F20 declaran `CATITEM_00X_CODE_NOT_VALID` y `CATITEM_00X_CODE_NOT_DERIVABLE`, y sus claves i18n están en los tres idiomas del backend — pero `grep -rn "CODE_NOT_VALID\|CODE_NOT_DERIVABLE" src/` en `esavi-backend` **no devuelve nada**. Lo mismo ocurre con las equivalentes de `catalogType`, que SPEC FE02 §3.6 ya mapeó en su `errorFieldMap` creyéndolas reales. El `errorFieldMap` de este spec se ciñe a los códigos que el backend lanza de verdad, y la divergencia queda anotada como riesgo hacia el otro repositorio.

---

## 2. Alcance

**Dentro:**

- **`catalogItem` de punta a punta**: los seis artefactos de `CONVENTIONS.md` §5, con la pantalla en `/catalog-items` y el tipo en `searchParams.typeId`.
- **La declaración del recurso con `inactiveMode: 'adminPath'` y `parent`**, primer uso real de las dos piezas que FE02 dejó probadas y sin consumidor (hallazgo B).
- **Tipos del contrato**: `contracts/catalogItem.ts` por `npm run contracts:sync` —`CreateCatalogItemInput` ya existe en el backend— y `contracts/declared/catalogItem.ts` con la forma de la fila, incluido `isValueLocked`, siguiendo el precedente de `contracts/declared/catalogType.ts`.
- **`<CatalogTypeSelect>` en `features/catalogType/`**, no en `features/catalogItem/`: es un combo sobre datos de `catalogType`, y ponerlo en la feature de su propia entidad es lo que permite que la reutilice cualquier pantalla futura que necesite elegir un tipo. Una petición con `limit: 100`, `staleTime` de 30 minutos, distintivo `destructive` en las opciones inactivas y aviso visible cuando `count > 100`.
- **El tratamiento del candado de `value`** (hallazgo C): campo deshabilitado con explicación en edición, icono de candado en la columna `value`, y la acción «Dar de baja» ausente en las filas congeladas.
- **Marcado en rojo semántico de todo lo inactivo**, en la tabla de ítems y en las opciones del combo de tipos, con el token `destructive` — nunca un color literal.
- **Formulario en `<Dialog>` y auditoría en `<Sheet>`**, abiertos desde el listado, con baja y reactivación tras `<AlertDialog>`. Sin página de detalle.
- **El atajo «Ver ítems»** en el menú de fila de `CatalogTypeListPage`, que navega a `/catalog-items?typeId=<id>`.
- **El cambio de `variant="secondary"` a `variant="destructive"`** en el distintivo de fila inactiva de `CatalogTypeListPage`, para que las dos pantallas del hito 2 digan lo mismo con el mismo color.
- **Claves i18n** en `catalogItem.*` y las de `common.*` que falten, **en los tres idiomas**.
- **Quitar `disabled: true`** de `nav.items.catalogItem` en `shared/config/navigation.ts`.

**Fuera de alcance (otros specs):**

- **`<CatalogSelect>`.** SPEC FE02 la aplazó a este spec «con `catalogItem`, que es lo que la alimenta», pero el argumento se sostiene mal al aterrizar: FE03 no tiene ningún desplegable de catálogo que llenar, así que la primitiva nacería otra vez sin consumidor —exactamente el motivo por el que FE02 aplazó `<GeoLocationPicker>`—. Y hay una decisión de forma que sólo el primer consumidor real puede cerrar: el endpoint lista por `catalogTypeId`, no por `code`, así que una prop `typeCode` obliga a dos consultas encadenadas. Nace con la primera pantalla que necesite elegir un valor de catálogo.
- **El importador `ESAVI-CATITEM-006`.** Es SUPERADMIN, `multipart/form-data` con un `.xlsx`, tiene modo `dryRun` y devuelve un informe con ocho contadores y hasta veinte filas rechazadas. Es una pantalla entera y una primitiva de subida de ficheros que no existe: va en su propio spec.
- **`metadata`.** El `jsonb` de negocio que el `001` y el `004` escriben. No se muestra, no se envía y el `PUT` no lo incluye. Un editor de JSON crudo en un formulario de catálogo abre una puerta a datos que nadie valida, y hoy no hay ningún consumidor en el cliente que lo lea.
- **Carga incremental del combo de tipos.** `useInfiniteQuery` sobre `limit`/`offset` es la vía prevista y encaja sin forzar nada, pero con ~18 tipos sembrados resuelve un problema que aún no existe; el aviso de `count > 100` es lo que lo hará visible el día que exista.
- **Búsqueda por texto y orden por columna.** Sigue vigente el hallazgo E de FE02: `catalogItemListValidator` sólo admite `limit` y `offset`, y `CONVENTIONS.md` §6.5 prohíbe ordenar o filtrar en memoria. Las props de `<ResourceTable>` siguen en `false`.
- **Corregir los códigos de error fantasma del hallazgo E.** Es trabajo de `esavi-backend`; aquí sólo se anota.
- **`geoLocation`, `geoLevelType` y `healthFacility`**, el resto del hito 2, y `<GeoLocationPicker>` con ellos.
- **El purgado `005C`** y la exposición de `sysDetails`.
- **La paleta de comandos**, pendiente desde FE01.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado de ítems por tipo | `/catalog-items` | `features/catalogItem/CatalogItemListPage.tsx` | `<RequireRole level={USER}>` |

Una sola pantalla, con el tipo seleccionado en `searchParams.typeId`. No hay página de detalle: formulario en `CatalogItemFormDialog.tsx` y auditoría en `CatalogItemAuditSheet.tsx`, ambos abiertos desde el listado, igual que en `catalogType`.

La pantalla tiene **dos composiciones según haya tipo o no**, y la distinción no es cosmética:

- **Sin `typeId`**: se pinta el combo de tipos y un panel de invitación. `<ResourceTable>` **no se monta**. Es lo que garantiza que `useListByParent` nunca se dispare sin padre, y que el `CATITEM_002A_CATTYPEID_REQUIRED` del backend sea inalcanzable desde esta pantalla. El combo se queda inerte esperando el clic: no se despliega solo ni preselecciona el primer tipo.
- **Con `typeId`**: combo arriba, tabla debajo.

En `shared/config/navigation.ts`, `nav.items.catalogItem` ya existe en el grupo **Administración** con icono `ListChecks`, `path: '/catalog-items'` y `minLevel: ROLE_LEVELS.USER` — coincide con el rol real de `ESAVI-CATITEM-002A`. El único cambio es **quitarle `disabled: true`**.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
GET    /api/catalog-items/type/:id        ESAVI-CATITEM-002A  USER        listado activos por tipo
GET    /api/catalog-items/admin/type/:id  ESAVI-CATITEM-002B  ADMIN       listado con inactivos
GET    /api/catalog-items/:id             ESAVI-CATITEM-003   USER        detalle
POST   /api/catalog-items                 ESAVI-CATITEM-001   ADMIN       crear
PUT    /api/catalog-items/:id             ESAVI-CATITEM-004   ADMIN       actualizar
DELETE /api/catalog-items/:id             ESAVI-CATITEM-005A  ADMIN       baja lógica
PATCH  /api/catalog-items/activate/:id    ESAVI-CATITEM-005B  SUPERADMIN  reactivar
```

Y del maestro, ya consumido por FE02 y aquí reutilizado sin cambios:

```
GET    /api/catalog-types                 ESAVI-CATTYPE-002   USER        combo de tipos
```

`ESAVI-CATITEM-006` está en el inventario y **no se consume en este spec** (§2).

La declaración, en `features/catalogItem/api.ts`:

```ts
createResource<CatalogItem, CreateCatalogItemInput, UpdateCatalogItemInput>({
  key: 'catalogItem',
  path: 'catalog-items',
  idField: 'catalogItemId',
  inactiveMode: 'adminPath',
  adminPath: 'catalog-items/admin',
  parent: {
    operation: 'byType',
    segment: 'type/:parentId',
    adminSegment: 'admin/type/:parentId',
  },
  staleTime: 30 * 60 * 1000,
})
```

`adminPath` es obligatorio con `inactiveMode: 'adminPath'` —`assertConfig` lo exige— aunque esta entidad sólo liste por padre y por tanto nunca lo use: `useList` no se invoca aquí, sólo `useListByParent`. La alternativa sería relajar la aserción de la fábrica, y no compensa tocar una pieza que gobierna 40 entidades para acomodar una.

### 3.3 Tipos del contrato

`CreateCatalogItemInput` llega por `npm run contracts:sync` desde `esavi-backend/src/types/catalog/catalogItem.types.ts`. La fila **no**, porque el backend no la exporta como tipo: se declara a mano con su origen anotado, igual que `contracts/declared/catalogType.ts`.

```ts
// contracts/declared/catalogItem.ts
// Shape of the row in esavi-backend/src/models/catalogItem.model.ts — the backend doesn't
// export it as a type. Revisit if the model changes.
export interface CatalogItem {
  catalogItemId: string;
  catalogTypeId: string;
  code: string;
  name: string;
  value: string | null;
  // SPEC F46: never editable through the API, exposed on 002A/002B/003 so the UI can
  // disable the field instead of silently discarding what the user typed.
  isValueLocked: boolean;
  description: string | null;
  sortOrder: number;
  metadata: object | null;
  isActive: boolean;
  deletedAt: string | null;
  appDetails: AppDetails[] | null;
}
```

El tipo de actualización es `Partial<CreateCatalogItemInput>` **menos `catalogTypeId`** (§3.5): mover un ítem de tipo no se ofrece.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Tipo seleccionado | URL | `searchParams.typeId` | Es la identidad de la vista: sin él no hay listado. Compartible por enlace, y es lo que recibe el atajo desde `catalogType` |
| Página actual | URL | `searchParams.page`, 1 si falta | Vuelve a 1 al cambiar de tipo y al cambiar el toggle |
| Toggle «mostrar inactivos» | URL | `searchParams.includeInactive` | Primer uso real: modo `adminPath`, visible desde ADMIN |
| `pageSize` | Zustand | `preferences.pageSize` | Preferencia del usuario, ya existente desde FE02 |
| Listado de ítems | TanStack Query | `['catalogItem', 'byType', typeId, { limit, offset, includeInactive }]` | `staleTime` 30 min; `enabled: !!parentId` |
| Detalle de ítem | TanStack Query | `['catalogItem', 'detail', id]` | `staleTime` 30 min |
| Tipos del combo | TanStack Query | `['catalogType', 'list', { limit: 100, offset: 0, includeInactive: false }]` | Entrada de caché distinta de la del listado de tipos, que usa `pageSize`. Es deliberado: son dos consultas con `limit` distinto, no un dato duplicado |
| Diálogo de formulario y fila en edición | Componente | `useState` en `CatalogItemListPage` | Guarda el `catalogItemId`, **nunca una copia de la fila** |
| Panel de auditoría abierto | Componente | `useState` | Efímero |
| Confirmación de baja o reactivación | Componente | `useState` del `<AlertDialog>` | Efímero |
| Valores tecleados en el formulario | React Hook Form | `useForm` de `<ResourceForm>` | Borrador del formulario, no estado de servidor |

Cuatro puntos, porque son los que se rompen:

- **`typeId` va en la URL, no en un `useState`.** Es lo que hace funcionar el atajo desde el listado de tipos, lo que sobrevive al refresco y lo que permite mandar por chat «mira los ítems de `outcome`».
- **Ninguna fila se copia a `useState`.** El diálogo guarda el id y lee la fila de la caché de Query.
- **Cambiar de tipo resetea `page`.** Sin eso, saltar de un tipo de 40 ítems a uno de 3 estando en la página 3 deja una tabla vacía que parece un error.
- **Toda mutación invalida `['catalogItem']` entera.** La fábrica ya lo hace: alcanza a la vez el listado por padre y el detalle, sin enumerar claves.

### 3.5 Formularios y validación

Un solo formulario, `features/catalogItem/schemas.ts`. Los límites salen de `catalogItem.validator.ts` y del DDL (hallazgo D), **no de los de `catalogType`**.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `code` | `<Input>` | no | Máx. 100. Si viaja vacío no se envía; el backend lo acuña desde `name` en camelCase |
| `name` | `<Input>` | sí | Máx. **250**, no vacío tras `trim` |
| `value` | `<Input>` | **sí en creación** | Máx. 250, no vacío tras `trim`. El backend lo normaliza a `CONSTANT_CASE`; se muestra tal como vuelve |
| `description` | `<Textarea>` | no | Columna `text`, sin tope que replicar |
| `sortOrder` | `<Input type="number">` | no | Entero ≥ 0 (`smallint`, tope 32767) |

**`catalogTypeId` no es un campo del formulario.** En creación se toma de `searchParams.typeId` y viaja en el `POST`. En edición **no viaja**: el `004` acepta cambiarlo, pero mover un ítem a otro tipo lo haría desaparecer de la tabla que el usuario está mirando, sin explicación y sin deshacer. Si alguna vez hace falta, es una acción propia con su confirmación, no un desplegable escondido en un formulario de edición.

**El `PUT` nunca lleva `isActive`, `metadata`, `isValueLocked` ni `catalogTypeId`.** El primero tiene su `PATCH`; los tres siguientes están fuera de alcance o no son editables por API.

Errores mapeados a su campo, ceñidos a los que el backend **emite de verdad** (hallazgo E):

| `code` | Campo |
|---|---|
| `CATITEM_001_CODE_EXISTS`, `CATITEM_004_CODE_EXISTS` | `code` |

Los demás van al toast por `code` a través de `getErrorMessage`: `CATITEM_001_CATTYPE_NOT_FOUND` y `CATITEM_004_CATTYPE_NOT_FOUND` (el tipo no es un campo del formulario, así que marcarlo no tendría dónde), `CATITEM_004_NOT_FOUND`, `CATITEM_005A_VALUE_LOCKED`, `CATITEM_005A_ALREADY_INACTIVE`, `CATITEM_005B_ALREADY_ACTIVE`. **`errors` no se muestra jamás.**

Toastes de éxito: los genéricos de `common.toast.*` que FE02 dejó compartidos.

### 3.6 El candado de `value`

El tratamiento del hallazgo C, en los tres sitios donde se nota:

| Dónde | Comportamiento |
|---|---|
| Columna `value` de la tabla | Icono de candado junto al valor cuando `isValueLocked`, con `aria-label` por i18n (`catalogItem.valueLocked.badge`) |
| Formulario de edición | El `<Input>` de `value` va `disabled` y `readOnly`, con texto de ayuda `catalogItem.form.valueLockedHelp` explicando que el sistema usa ese valor y que **`code` y `name` sí se pueden cambiar** |
| Menú de fila | «Dar de baja» **no aparece** en una fila congelada, ni siquiera para ADMIN |
| Formulario de creación | Sin efecto: un ítem nunca nace congelado, y `isValueLocked` no viaja en el `POST` |

El schema de update **no declara `value`** cuando la fila está congelada: el campo no entra en el cuerpo, así que el ignorado silencioso del backend no llega a ocurrir. Es la diferencia entre no enviar lo que no se puede guardar y enviarlo confiando en que el servidor lo descarte.

Aun así, `CATITEM_005A_VALUE_LOCKED` se mapea al toast. La acción no se ofrece, pero el 409 sigue siendo alcanzable —una pestaña abierta desde antes de un despliegue que congeló más filas— y un error sin mensaje es peor que uno improbable.

### 3.7 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Sin tipo seleccionado | Panel con icono y texto invitando a elegir un tipo. **Sin botón «Crear»**: no hay `catalogTypeId` que enviar. La tabla no se monta | `catalogItem.list.noTypeSelected` |
| Carga | Skeleton de `<ResourceTable>`, tantas filas como `pageSize` | — |
| Vacío | Tipo elegido y sin ítems; botón «Crear» si `useCan(ADMIN)` | `catalogItem.list.empty` |
| Error | Mensaje resuelto por `code` + botón reintentar | `common.table.error` |
| Sin permiso | No se llega: `<RequireRole level={USER}>` redirige y el `NavItem` no se pinta para `ANALYTICS` | — |

`isFiltered` de `<ResourceTable>` se queda en `false` y `emptyFilteredKey` sin usar: el tipo es el **padre** del listado, no un filtro, y el toggle de inactivos sólo puede añadir filas, nunca dejar la tabla vacía cuando había algo.

Si el combo no encuentra el `typeId` de la URL —un enlace viejo a un tipo borrado— se pinta el estado «sin tipo seleccionado» con un aviso `catalogItem.list.unknownType`, y no una tabla vacía que parecería un catálogo sin ítems.

### 3.8 Acciones de fila y autorización

| Acción | Rol mínimo real | Visible cuando |
|---|---|---|
| Editar | ADMIN (`001`/`004`) | `useCan(ADMIN)` |
| Ver auditoría | SUPERADMIN (política de cliente, `CONVENTIONS.md` §10.4) | `useCan(SUPERADMIN)` |
| Dar de baja | ADMIN (`005A`) | `useCan(ADMIN)`, fila activa **y no congelada** |
| Reactivar | SUPERADMIN (`005B`) | `useCan(SUPERADMIN)` y fila inactiva |

El botón «Crear» de la cabecera exige `useCan(ADMIN)` **y** un `typeId` seleccionado.

**Aquí sí ocurre lo que en `catalogType` era inalcanzable:** un ADMIN puede activar el toggle, ver filas inactivas y no tener forma de reactivarlas, porque el `005B` es SUPERADMIN. Se mantiene la decisión de FE02: la acción **no se pinta deshabilitada con tooltip**. Un botón que nunca se puede pulsar explica menos de lo que estorba, y el distintivo rojo de la fila ya dice cuál es su estado.

### 3.9 Marcado de lo inactivo

En las dos pantallas del hito 2, con el token semántico `destructive` — nunca un color literal, que rompería el tema oscuro sin avisar:

- **Fila inactiva de la tabla**: `<Badge variant="destructive">` con el texto «Inactivo».
- **Opción inactiva del combo de tipos**: texto en `text-destructive` más el mismo distintivo.
- **`CatalogTypeListPage`** pasa de `variant="secondary"` a `variant="destructive"` (§8).

**El color nunca va solo.** El distintivo lleva siempre su etiqueta de texto traducida: un usuario con daltonismo, o una impresión en blanco y negro, siguen leyendo el estado. Es requisito de `CONVENTIONS.md` §10 y la razón por la que esto es un `<Badge>` y no una fila teñida.

### 3.10 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`, con `name` como `primary`, `value` como `secondary` y `code` como `meta`. `sortOrder`, `description` y el estado no entran en la tarjeta; el distintivo de inactivo sí, junto al `primary`.
- El combo de tipos ocupa el ancho completo por debajo de `md` y queda pegado arriba, antes de la tabla.
- El diálogo de formulario ocupa el ancho completo por debajo de `md`, con la barra de acciones fija abajo — ya resuelto por `<ResourceForm>`.
- El panel de auditoría es un `<Sheet>` lateral en escritorio e inferior en móvil.
- La tabla va en un contenedor con `overflow-x: auto`; **el body nunca hace scroll horizontal**.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- El icono de candado lleva `aria-label` por i18n; los decorativos, `aria-hidden`.
- El combo es el `<Select>` de shadcn sobre Radix: teclado, foco y ARIA ya resueltos.

### 3.11 Claves i18n nuevas

En los **tres** archivos (`es`, `en`, `nl`).

| Clave | Uso |
|---|---|
| `catalogItem.list.title` | Título de pantalla y `NavItem` |
| `catalogItem.list.noTypeSelected` | Panel de invitación, sin tipo elegido |
| `catalogItem.list.unknownType` | El `typeId` de la URL no existe en el combo |
| `catalogItem.list.empty` | Tipo elegido, sin ítems |
| `catalogItem.form.createTitle` · `editTitle` | Título del diálogo |
| `catalogItem.fields.code` · `name` · `value` · `description` · `sortOrder` · `isActive` | Etiquetas y cabeceras |
| `catalogItem.form.codeHelp` · `codeWarning` | Ayuda y aviso del campo `code`, en línea con `catalogType` |
| `catalogItem.form.valueLockedHelp` | Por qué `value` está deshabilitado |
| `catalogItem.valueLocked.badge` | `aria-label` del icono de candado |
| `catalogItem.status.active` · `inactive` | Texto del distintivo |
| `catalogItem.errors.CATITEM_001_CODE_EXISTS` y las demás de §3.5 | Mensajes por `code` |
| `catalogType.select.label` · `placeholder` | Etiqueta y marcador del combo |
| `catalogType.select.tooManyTypes` | Aviso cuando `count > 100` |
| `catalogType.actions.viewItems` | El atajo «Ver ítems» en el menú de fila |

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y arrancable, y puede committearse solo. El orden es el de los seis artefactos de `CONVENTIONS.md` §5.

1. **Tipos del contrato.** `npm run contracts:sync` trae `contracts/catalogItem.ts` con `CreateCatalogItemInput`. A mano, `contracts/declared/catalogItem.ts` con la fila de §3.3, incluido `isValueLocked` y con su origen anotado en el modelo Sequelize.
   *Verificación:* el diff de `contracts/` se revisa a ojo; `value` es `string | null` y `isValueLocked` es `boolean` no opcional. `npm run check` en 0.

2. **Declaración del recurso.** `features/catalogItem/api.ts` con un solo `createResource<CatalogItem, …>({ … })` según §3.2 y los ocho códigos `ESAVI-CATITEM-*` citados en comentario, incluido el `006` marcado como no consumido.
   *Verificación:* el archivo no importa `axios`, no usa `useQuery` a mano y cabe en una pantalla. Test con MSW: `useListByParent(typeId, { page: 2, pageSize: 25, includeInactive: false })` pega a `/catalog-items/type/<id>?limit=25&offset=25`; con `includeInactive: true` y nivel ADMIN pega a `/catalog-items/admin/type/<id>`; con `includeInactive: true` y nivel USER **vuelve a la ruta pública**, no a la `/admin`.

3. **Schemas.** `features/catalogItem/schemas.ts` con `createCatalogItemSchema`, `updateCatalogItemSchema` —que omite `value` cuando la fila está congelada y nunca declara `catalogTypeId`, `isActive`, `metadata` ni `isValueLocked`— y el `errorFieldMap` de §3.5.
   *Verificación:* `name` vacío falla y con 251 caracteres también; `value` vacío falla en creación; `sortOrder: -1` falla; `code` ausente pasa y **no viaja** en el cuerpo del `POST`. Un `updateCatalogItemSchema` construido sobre una fila congelada no acepta `value`.

4. **`<CatalogTypeSelect>`.** `features/catalogType/CatalogTypeSelect.tsx`: una petición con `limit: 100`, opciones inactivas en `text-destructive` con su distintivo, aviso `catalogType.select.tooManyTypes` cuando `count > 100`, y estados de carga y error propios.
   *Verificación:* test con MSW devolviendo `count: 150` que comprueba que el aviso se pinta; otro con una fila `isActive: false` que comprueba el distintivo. Con nivel USER el backend no devuelve inactivos y el combo no falla por ello.

5. **Formulario en diálogo.** `features/catalogItem/CatalogItemFormDialog.tsx` sobre `<ResourceForm>`, con los cinco campos de §3.5, el `catalogTypeId` tomado de la URL en creación, y el tratamiento del candado de §3.6.
   *Verificación:* un `409` con `CATITEM_001_CODE_EXISTS` marca el campo `code` y **no** abre un toast; sobre una fila con `isValueLocked: true` el input de `value` está deshabilitado, el texto de ayuda es visible y el cuerpo del `PUT` no contiene la clave `value`.

6. **Panel de auditoría.** `features/catalogItem/CatalogItemAuditSheet.tsx` sobre `<AuditTrail>`, leyendo `appDetails` de la fila.
   *Verificación:* abre con una fila de varias entradas y con `appDetails: null` sin reventar; sólo se ofrece con `useCan(SUPERADMIN)`.

7. **Pantalla.** `features/catalogItem/CatalogItemListPage.tsx`: combo arriba, `<ResourceTable>` debajo, las dos composiciones de §3.1, el menú de fila de §3.8, el toggle de inactivos en `searchParams.includeInactive` y el reseteo de `page` al cambiar de tipo o de toggle.
   *Verificación:* sin `typeId` la tabla no se monta y no sale ninguna petición a `/catalog-items`; elegir un tipo la monta; cambiar de tipo estando en `page=3` deja la URL en `page=1`; `?typeId=<id>&page=2` sobrevive al refresco y el enlace reproduce la misma vista; un `typeId` inexistente pinta `catalogItem.list.unknownType`.

8. **Ruta y navegación.** La ruta `/catalog-items` en `app/router.tsx` envuelta en `<RequireRole level={ROLE_LEVELS.USER}>`, y quitar `disabled: true` de `nav.items.catalogItem`.
   *Verificación:* el enlace del sidebar navega; con rol `ANALYTICS` la entrada no aparece y entrar por URL redirige sin pantalla en blanco.

9. **Impacto en `catalogType`.** El atajo «Ver ítems» en `CatalogTypeRowActions`, que navega a `/catalog-items?typeId=<id>`, y el distintivo de fila inactiva de `variant="secondary"` a `variant="destructive"`.
   *Verificación:* el atajo aparece para cualquier nivel que llegue a la pantalla —el destino exige lo mismo, `USER`— y lleva al tipo correcto; `CatalogTypeListPage.test.tsx` se actualiza y queda en verde.

10. **Claves i18n.** Las de §3.11 en `es`, `en` y `nl`.
    *Verificación:* `npm run i18n:check` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las siete rutas `ESAVI-CATITEM-*` de §3.2 se consumen desde `features/catalogItem/api.ts` y ninguna otra; `ESAVI-CATITEM-006` no se consume desde ninguna parte.
- [ ] Sin `typeId` en la URL no sale **ninguna** petición a `/api/catalog-items`: la tabla no se monta y `CATITEM_002A_CATTYPEID_REQUIRED` es inalcanzable desde la pantalla.
- [ ] `useListByParent` con `includeInactive: true` y nivel ADMIN pega a `/catalog-items/admin/type/:id`; con nivel USER pega a `/catalog-items/type/:id`.
- [ ] `page: 2` con `pageSize: 25` produce `?limit=25&offset=25`; ninguna paginación ocurre en memoria.
- [ ] Cambiar de tipo o de toggle deja `searchParams.page` en 1.
- [ ] `?typeId=<id>&page=2&includeInactive=true` reproduce exactamente la misma vista tras un refresco y al abrirse en otra pestaña.
- [ ] Los seis artefactos de `CONVENTIONS.md` §5 existen para `catalogItem`.
- [ ] Una mutación invalida `['catalogItem']` entera: tras crear, la tabla se refresca sin recargar.
- [ ] Un `409` con `CATITEM_001_CODE_EXISTS` marca el campo `code` y **no** abre un toast genérico.
- [ ] Sobre una fila con `isValueLocked: true`: el input de `value` está deshabilitado, «Dar de baja» no aparece en el menú, y el cuerpo del `PUT` no contiene la clave `value`.
- [ ] Sobre una fila no congelada, el mismo `PUT` **sí** envía `value`.
- [ ] `grep -rn "isActive\|metadata\|isValueLocked\|catalogTypeId" src/features/catalogItem/schemas.ts` no devuelve ninguno de los cuatro en el schema de update.
- [ ] `grep -rn "\.errors" src/features/catalogItem/` no devuelve accesos a la propiedad del error de API.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] Guardar sin tocar nada no genera entrada de auditoría nueva: el backend hace el update diferencial y el cliente no calcula diff.
- [ ] El combo pinta `catalogType.select.tooManyTypes` cuando la respuesta trae `count > 100`.
- [ ] Un `typeId` que no está en el combo pinta `catalogItem.list.unknownType`, no una tabla vacía.
- [ ] El atajo «Ver ítems» de `CatalogTypeListPage` navega a `/catalog-items?typeId=<id>` con el tipo correcto.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|text-(red|green)-[0-9]|#[0-9a-fA-F]{3,6}" src/features/catalogItem/ src/features/catalogType/CatalogTypeSelect.tsx`
      no devuelve resultados. El rojo de lo inactivo es `destructive`, no un color literal.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `name`, `value` y `code` (§3.10), el combo ocupa el ancho completo y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` no hay botón «Crear», «Editar», «Dar de baja» ni «Reactivar», no se pinta el toggle de inactivos, y el listado se ve entero. Con `ADMIN` el toggle sí aparece y las filas inactivas no ofrecen «Reactivar». Con `ANALYTICS` la entrada del menú no aparece y entrar por URL redirige sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders, `aria-label` del candado y el texto del distintivo; las claves de §3.11 están en los tres idiomas.
- [ ] **El color nunca va solo.** Todo distintivo `destructive` lleva su etiqueta de texto traducida.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: ninguna fila copiada a `useState`, `typeId`, `page` e `includeInactive` en `searchParams`, `pageSize` en `preferencesStore`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** maestro-detalle con el tipo en `searchParams.typeId` y una sola pantalla. No es una elección de producto entre varias: el inventario no tiene listado plano de `catalogItem` (hallazgo A), así que sin un tipo seleccionado no hay petición posible.
- **Sí:** una sola pantalla `/catalog-items` con combo, en vez de una página anidada `/catalog-types/:id/items`. La anidada es más fiel a la jerarquía pero obliga a pasar por el maestro en cada cambio de tipo; el combo permite saltar de `outcome` a `sex` en un clic, y la URL sigue siendo compartible. Se conserva además la entrada de menú que ya existía.
- **Sí:** el atajo «Ver ítems» en el listado de tipos, pese a que el combo lo hace innecesario. Cuesta una línea y es el recorrido natural justo después de crear un tipo.
- **No:** `<CatalogSelect>` en este spec, pese a que SPEC FE02 §2 la asignó aquí. El argumento de FE02 —«nace con `catalogItem`, que es lo que la alimenta»— se cae al aterrizar: FE03 no tiene ningún desplegable de catálogo que rellenar, así que la primitiva nacería sin consumidor, que es exactamente el motivo por el que FE02 aplazó `<GeoLocationPicker>`. Y hay una decisión de forma que sólo un consumidor real puede cerrar: el endpoint lista por `catalogTypeId` y no por `code`, así que una prop `typeCode` cuesta dos consultas encadenadas.
- **Sí:** `<CatalogTypeSelect>` vive en `features/catalogType/`, no en `features/catalogItem/`. Es un combo sobre datos de `catalogType`; ponerlo en la feature de su entidad es lo que permite reutilizarlo desde cualquier pantalla futura sin que dependa del consumidor que lo estrenó.
- **Sí:** una sola petición de `limit: 100` para el combo, con aviso visible si `count > 100`. Con ~18 tipos sembrados, `useInfiniteQuery` resolvería hoy un problema que no existe; el aviso es lo que lo hará visible el día que exista, en vez de esconder tipos en silencio.
- **No:** buscador dentro del combo. El listado de `catalogType` no acepta búsqueda en servidor y `CONVENTIONS.md` §6.5 prohíbe filtrar en memoria. Es el mismo hallazgo E de FE02 y la misma respuesta.
- **Sí:** no montar `<ResourceTable>` mientras no haya `typeId`, en vez de montarla en estado vacío. Es lo que garantiza que la consulta por padre nunca se dispare sin padre, y evita pintar un botón «Crear» que no tendría `catalogTypeId` que enviar.
- **Sí:** el combo se queda inerte esperando el clic, sin autodesplegarse ni preseleccionar el primer tipo. Preseleccionar haría que la pantalla abriera siempre sobre un catálogo arbitrario y que la URL cambiara sin que nadie la tocara.
- **Sí:** el candado de `value` se respeta **no enviando el campo**, no confiando en que el servidor lo descarte. El ignorado del `004` es silencioso y responde 200: un cliente que envía y confía no puede distinguir un guardado de un descarte.
- **Sí:** exponer el candado en la tabla y en el formulario, aunque el backend ya se proteja solo. Es literalmente lo que SPEC F46 §3.8 pidió del cliente al exponer `isValueLocked` en las tres lecturas.
- **No:** ofrecer «Dar de baja» sobre una fila congelada y manejar el 409. Provocar un error que se sabe de antemano no es informar, es hacer trabajar al usuario para descubrir una regla que ya conocíamos. El `CATITEM_005A_VALUE_LOCKED` se mapea igual, porque el 409 sigue siendo alcanzable desde una pestaña vieja.
- **No:** mostrar «Reactivar» deshabilitado con tooltip para un ADMIN que sí ve filas inactivas. Es el primer sitio donde la situación es real —en `catalogType` era inalcanzable—, y se mantiene la decisión de FE02: el distintivo rojo ya dice el estado, y un botón que nunca se puede pulsar estorba más de lo que explica.
- **No:** ofrecer el cambio de `catalogTypeId` en el formulario de edición, aunque el `004` lo acepte. Mover un ítem a otro tipo lo haría desaparecer de la tabla que el usuario está mirando, sin explicación y sin deshacer. Si hace falta, es una acción propia con confirmación.
- **No:** `metadata` en el formulario. Un editor de JSON crudo en un formulario de catálogo es una puerta a datos que nadie valida, y hoy ningún consumidor del cliente los lee.
- **Sí:** el rojo de lo inactivo es el token `destructive` y va siempre acompañado de su etiqueta de texto. Un `text-red-600` rompería el tema oscuro sin avisar, y el color solo deja fuera a quien no lo distingue.
- **Sí:** cambiar el distintivo de `CatalogTypeListPage` de `secondary` a `destructive` dentro de este spec. Dos pantallas del mismo hito diciendo lo mismo con colores distintos enseñan al usuario que el color no significa nada.
- **No:** el importador `ESAVI-CATITEM-006` aquí. Subida de fichero, modo en seco, informe de ocho contadores y tabla de rechazos son una pantalla entera y una primitiva que no existe; meterlo duplicaría el tamaño del spec y retrasaría el CRUD que los hitos 3 y 4 necesitan.
- **Sí:** ceñir el `errorFieldMap` a los códigos que el backend emite de verdad (hallazgo E). Mapear códigos declarados pero no implementados da una falsa sensación de cobertura y esconde que el 400 real llega por otro camino.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `catalogItem` estrena el modo `'adminPath'` y el listado por padre a la vez. Un error en esa combinación de `createResource` afectaría a las 40 entidades restantes, no sólo a esta pantalla | Los tests con MSW del paso 2 cubren las cuatro combinaciones de modo y rol antes de que exista pantalla. Es el motivo de que ese paso vaya antes que las páginas y no después |
| `adminPath: 'catalog-items/admin'` es obligatorio por `assertConfig` y esta entidad **nunca lo usa**: sólo lista por padre. Un valor declarado y muerto invita a que alguien lo cambie sin consecuencia visible | Queda anotado en el comentario de la declaración. La alternativa —relajar la aserción de la fábrica que gobierna 40 entidades para acomodar una— es peor |
| SPEC F46 puede congelar más filas en un despliegue futuro. Una pestaña abierta desde antes seguiría ofreciendo «Dar de baja» sobre una fila que ya no lo admite | `CATITEM_005A_VALUE_LOCKED` está mapeado al toast aunque la acción no se ofrezca. Es la razón de mapear un código que en teoría es inalcanzable |
| El backend declara `CATITEM_00X_CODE_NOT_VALID` y `CODE_NOT_DERIVABLE` con claves i18n en tres idiomas y **no los emite desde ningún archivo de `src/`** (hallazgo E). Un `code` que no acuñe identificador válido llega hoy por un camino que este spec no conoce | El `errorFieldMap` cubre sólo los códigos reales, y lo no mapeado cae al toast por `message`, que el backend ya traduce. **Anotado para `esavi-backend`:** o se implementan los códigos que sus specs declaran, o se retiran las claves. Alcanza también al `errorFieldMap` de `catalogType`, que SPEC FE02 §3.6 escribió creyéndolos reales |
| El tipo de la fila se declara a mano en `contracts/declared/catalogItem.ts` y puede desincronizarse del modelo Sequelize, que es de dónde salió `isValueLocked` | El archivo lleva anotado su origen, igual que el de `catalogType`. Si el backend llega a exportar la fila en `src/types/`, se retira el declarado y pasa a sync |
| `value` es `allowNull: false` en el modelo y admite `null` en el DDL — contradicción que SPEC F20 dejó anotada sin resolver. El tipo declarado lo tipa `string \| null`, así que la tabla debe tolerar la celda vacía | La columna `value` renderiza vacío sin reventar cuando llega `null`, y el formulario lo exige en creación porque el validador lo exige. Es la lectura conservadora de las dos fuentes |
| El combo carga 100 tipos y la pantalla los pide en cada visita si la caché expiró; con `staleTime` de 30 min es barato, pero el día que haya cientos de tipos el aviso avisa y nadie actúa | El aviso es visible al usuario, no un `console.warn`. Cuando aparezca, `useInfiniteQuery` es la vía prevista (§2) |
| «Ver auditoría» sigue oculta a quien no es SUPERADMIN por política de cliente, mientras `ESAVI-CATITEM-003` y los dos listados devuelven `appDetails` a cualquier `USER` | Idéntico al riesgo que SPEC FE02 §7 anotó para `catalogType`, y con la misma respuesta: es UX, no seguridad. La restricción real exige que el backend excluya `appDetails` por debajo de SUPERADMIN. Se anota otra vez porque ya son dos entidades |

---

## 8. Impacto en pantallas existentes

- **`features/catalogType/CatalogTypeListPage.tsx`** — gana el atajo «Ver ítems» en el menú de fila y cambia el distintivo de fila inactiva de `variant="secondary"` a `variant="destructive"`. `CatalogTypeListPage.test.tsx` se actualiza en el mismo paso.
- **`features/catalogType/CatalogTypeSelect.tsx`** — archivo nuevo dentro de una feature existente. **A partir de este spec es de todos**: cualquier pantalla que necesite elegir un `catalogType` lo consume, no lo copia (`CONVENTIONS.md` §10.4).
- **`shared/config/navigation.ts`** — `nav.items.catalogItem` pierde `disabled: true`. El `minLevel` no cambia: ya era `USER`, el rol real de `ESAVI-CATITEM-002A`.
- **`app/router.tsx`** — se añade `/catalog-items` bajo `<RequireRole level={ROLE_LEVELS.USER}>`.
- **`shared/components/`** — **ninguna primitiva cambia.** `<ResourceTable>`, `<ResourceForm>` y `<AuditTrail>` se consumen tal como FE02 las dejó, y `createResource` no se toca: sus dos piezas sin estrenar —`adminPath` y `parent`— se usan por primera vez sin necesitar modificación. Si algo hubiera que ampliar, sería una prop nueva y nunca una copia local.

---

## Lo que **no** está en este spec

- `<CatalogSelect>` y `<GeoLocationPicker>`.
- El importador `ESAVI-CATITEM-006` y la primitiva de subida de ficheros.
- `metadata`, como campo visible o editable.
- Mover un ítem de un `catalogType` a otro.
- Carga incremental o búsqueda en el combo de tipos.
- Búsqueda por texto y orden por columna en los listados.
- `geoLocation`, `geoLevelType` y `healthFacility` — el resto del hito 2.
- El purgado `005C` y la exposición de `sysDetails`.
- La paleta de comandos.

Cada uno de esos, si aterriza, va en su propio spec.

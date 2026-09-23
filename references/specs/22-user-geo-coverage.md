# SPEC FE22 — Cobertura geográfica del usuario

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell, autenticación y `useCan`), SPEC FE02 (capa de recurso genérica, con listado por padre), SPEC FE04 (`<GeoLocationPicker>`), **SPEC FE20 (gestión de usuarios: el bloque vive en `/users/:id`)**, SPEC FE10 (que ya consume `ESAVI-USERGEO-008`), SPEC F01 del backend (`appUserGeoLocation`: las diez operaciones, la vigencia y la cobertura efectiva)
> **Fecha:** 2026-09-23
> **Objetivo:** Dar a un ADMIN el bloque de la ficha de usuario donde asigna, reasigna, cierra y fecha el territorio que cada usuario cubre.

---

## 1. Por qué existe este spec

**La tabla que vincula usuario y territorio se escribe hoy por SQL.** El SPEC F01 del backend construyó `appUserGeoLocation` entera —diez operaciones, vigencia temporal, reasignación transaccional, asignación masiva y cobertura efectiva— y el cliente consume **una**: `ESAVI-USERGEO-008`, en `features/userGeoLocation/api.ts:9`, para cruzar la búsqueda de unidades de salud contra la cobertura de quien abre un caso (SPEC FE10 §3.1). El comentario de ese archivo lo dice con todas las letras: «cualquier otra operación de `appUserGeoLocation` pertenece a quien construya las pantallas de gestión de usuarios». Este spec es ese momento.

**Es la tercera pata de la administración de usuarios, y la única que responde «hasta dónde».** FE20 decide quién existe, FE21 cuánta autoridad tiene cada rol, y aquí se decide sobre qué territorio. Las tres viven en la misma ficha porque para quien administra son el mismo acto: dar de alta a alguien y dejarlo operativo.

**Sin esta pantalla, el `008` que ya usamos miente por omisión.** `CaseOpeningStep` filtra las unidades de salud por la cobertura del usuario. Si esa cobertura nunca se pudo escribir desde la aplicación, el filtro se apoya en filas que alguien insertó a mano, o en ninguna. El consumidor existe desde FE10; el productor, hasta ahora, no.

**Y es la primera entidad del cliente con vigencia temporal real.** En `appUserRole` se decidió que `isActive` gobernara sola y que `validFrom`/`validTo` quedaran sin uso. Aquí no: el backend escribe `validTo = now()` al cerrar, tiene un `CHECK` que exige `validTo > validFrom`, y construyó el `004` únicamente para editar esas dos fechas. La consecuencia para la interfaz es que «activa» y «vigente» son dos estados distintos, y que una fila puede estar activa sin cubrir nada. Esa distinción es la que este spec tiene que hacer visible.

**Lo que este spec no cambia.** `resolveUserCoverageService` y el `008` siguen exactamente igual; aquí se reutiliza el hook que FE10 ya escribió. La autorización geográfica del backend —filtrar casos y notificaciones por la cobertura de quien pregunta— sigue siendo un cambio transversal que el SPEC F01 §1 dejó fuera de su propio alcance, y que no se toca desde el cliente.

---

## 2. Alcance

**Dentro:**

- **Bloque «Cobertura geográfica» en `/users/:id`**, tercera tarjeta de la ficha de FE20, visible con `ADMIN` como el resto de la página.
- **Listado de asignaciones por usuario** sobre `ESAVI-USERGEO-002A` y `ESAVI-USERGEO-002B`, declarado como listado por padre en `createResource` (`ResourceParentConfig`), con paginación y orden `validFrom DESC`.
- **Un solo toggle «mostrar cerradas y vencidas»**, que salta de `002A?current=true` a `002B?current=false`. El estado de cada fila se distingue por su badge: vigente, vencida o cerrada.
- **Añadir ubicaciones con `ESAVI-USERGEO-007`**: `<GeoLocationPicker>` para elegir una, lista previa para acumular varias, y un solo guardado todo-o-nada. `001` **no** se consume.
- **Vigencia visible y editable**: `validFrom` y `validTo` se muestran en cada fila y se editan con `ESAVI-USERGEO-004`, que sólo acepta esas dos fechas.
- **Cerrar** con `ESAVI-USERGEO-005A`, que escribe `validTo = now()` junto con `isActive: false` y `deletedAt`.
- **Reabrir** con `ESAVI-USERGEO-005B`. El botón **no se renderiza** salvo `SUPERADMIN`.
- **Reasignar** con `ESAVI-USERGEO-006`: acción de fila «Mover a otra ubicación», con el aviso de que la asignación actual se cerrará en la misma transacción.
- **Cobertura efectiva** con `ESAVI-USERGEO-008`, reutilizando `useUserGeoCoverage` de `features/userGeoLocation/api.ts`: «cubre N ubicaciones», con desplegable de la expansión completa.
- **Tipos del contrato**: `CreateAppUserGeoLocationInput`, `BulkAssignGeoLocationsInput` y `ReassignGeoLocationInput` por `contracts:sync`; la forma de la respuesta, en `contracts/declared/userGeoLocation.ts`, que ya existe.
- **Claves i18n nuevas** en los tres archivos de idioma.

**Fuera de alcance (otros specs):**

- **`ESAVI-USERGEO-003`** (obtener por id). La ficha ya tiene la fila entera desde el listado; el `003` sólo añadiría el `user` anidado, que es el de la página.
- **`ESAVI-USERGEO-001`** (alta de una sola). El `007` cubre el caso de una y el de varias con la misma forma y una sola transacción.
- **Pantalla propia `/user-geo-locations`.** La cobertura no se consulta sin el usuario delante.
- **«Qué usuarios cubren este territorio»** — la vista inversa. El backend no la tiene: el SPEC F01 §2 decidió dejar el `002` en una sola dirección para no estirar la convención con un `002C`.
- **`Sheet` de auditoría por asignación.** El `validTo` y el badge de cada fila ya cuentan lo esencial.
- **Filtrar casos, notificaciones o listados por la cobertura del usuario.** Es el cambio transversal que el SPEC F01 §1 dejó fuera de su propio alcance, y vive en el backend.
- **Mapa.** La cobertura se elige por cascada jerárquica, no sobre un mapa; `<MapPointPicker>` es para el punto de un caso, no para un territorio.
- **Asignar cobertura durante el alta del usuario.** `ESAVI-USER-001` no la acepta, y forzarla partiría el alta en dos escrituras sin transacción.
- **Exportar.**

---

## 3. Diseño

### 3.1 Pantallas y componentes

**No hay ruta nueva.** Todo vive en la ficha de FE20, `/users/:id`, bajo `<RequireRole level={ADMIN}>`.

| Componente | Archivo | Qué es |
|---|---|---|
| Bloque de la ficha | `features/userGeoLocation/UserGeoCoverageCard.tsx` | Lista de asignaciones, toggle, resumen de cobertura |
| Diálogo de añadir | `features/userGeoLocation/AddGeoAssignmentsDialog.tsx` | `<GeoLocationPicker>` + lista previa + guardado por `007` |
| Diálogo de vigencia | `features/userGeoLocation/GeoAssignmentValidityDialog.tsx` | `validFrom` y `validTo` sobre `004` |
| Diálogo de reasignación | `features/userGeoLocation/ReassignGeoDialog.tsx` | `<GeoLocationPicker>` destino, sobre `006` |
| Expansión de cobertura | `features/userGeoLocation/CoverageSummary.tsx` | «Cubre N ubicaciones» + desplegable, sobre `008` |

**La carpeta `features/userGeoLocation/` ya existe**, con `api.ts` y el hook `useUserGeoCoverage` de FE10. Este spec la amplía; no la crea.

**Navegación.** Nada. El bloque se alcanza desde la ficha de usuario, y esa entrada la publica FE20.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/user-geo-locations/bulk                ESAVI-USERGEO-007  ADMIN       añadir una o varias
GET    /api/user-geo-locations/user/:id            ESAVI-USERGEO-002A USER        vigentes y activas
GET    /api/user-geo-locations/admin/user/:id      ESAVI-USERGEO-002B ADMIN       incluye cerradas y vencidas
PUT    /api/user-geo-locations/:id                 ESAVI-USERGEO-004  ADMIN       editar vigencia
PATCH  /api/user-geo-locations/reassign/:id        ESAVI-USERGEO-006  ADMIN       mover a otra ubicación
DELETE /api/user-geo-locations/:id                 ESAVI-USERGEO-005A ADMIN       cerrar
PATCH  /api/user-geo-locations/activate/:id        ESAVI-USERGEO-005B SUPERADMIN  reabrir
GET    /api/user-geo-locations/user/:id/coverage   ESAVI-USERGEO-008  USER        cobertura efectiva (ya consumido)
```

Ocho de las diez.

**Qué no se consume, y por qué:**

- **`ESAVI-USERGEO-001`.** El `007` hace lo mismo para una sola ubicación, con la misma semántica de reactivación y dentro de una transacción. Dos caminos para el mismo acto sería un camino de más que probar.
- **`ESAVI-USERGEO-003`.** El listado ya trae la fila completa; el `003` sólo añade el `user` anidado, que es el de la página.

**Tres notas de comportamiento:**

1. **El `007` aborta con `409 USERGEO_007_ASSIGNMENT_EXISTS` si alguno de los pares ya está activo**, y no escribe nada. Por eso el picker del diálogo excluye lo ya asignado (§3.5).
2. **`002A` lleva `?current=true` por defecto y `002B` `?current=false`.** El toggle no sólo cambia de ruta: cambia también la dimensión de vigencia.
3. **`004` sólo acepta `validFrom` y `validTo`.** `userId` y `geoLocationId` en el cuerpo dan `400`; cambiar de ubicación es `006`.

### 3.3 Tipos del contrato

Del backend, por `npm run contracts:sync` (`src/types/user/appUserGeoLocation.types.ts`):

```ts
// contracts/appUserGeoLocation.ts
export interface CreateAppUserGeoLocationInput {
  userId: string; geoLocationId: string;
  validFrom?: string | Date; validTo?: string | Date | null; isActive?: boolean;
}
export interface BulkAssignGeoLocationsInput {
  userId: string; geoLocationIds: string[];
  validFrom?: string | Date; validTo?: string | Date | null;
}
export interface ReassignGeoLocationInput { geoLocationId: string; }
```

En `contracts/declared/userGeoLocation.ts` —el archivo que FE10 ya creó, con `UserGeoCoverage` intacto— se añaden:

```ts
export interface GeoAssignment {
  userGeoLocationId: string; userId: string; geoLocationId: string;
  validFrom: string; validTo: string | null;
  assignedByUserId: string | null; isActive: boolean;
  createdAt: string; updatedAt: string | null; deletedAt: string | null;
  appDetails: AppDetails[] | null;
  geoLocation: { geoLocationId: string; name: string; level: number; parentGeoLocationId: string | null };
}

// 002A/002B responden { count, user, rows }: el usuario una vez, no por fila.
export interface GeoAssignmentListResponse {
  count: number;
  user: { userId: string; username: string | null; firstName: string | null; lastName: string | null; email: string };
  rows: GeoAssignment[];
}

// 004 no acepta nada más. userId y geoLocationId dan 400.
export interface UpdateGeoValidityInput { validFrom?: string; validTo?: string | null; }
```

**`validFrom` y `validTo` son `timestamptz`, no `date`.** Llevan hora y zona, a diferencia de las fechas del expediente. Se tipan como `string` ISO 8601 completo, y §3.5 fija cómo se componen desde un selector de día.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Toggle «mostrar cerradas y vencidas» | URL | `searchParams.coverageAll` | Decide `002A?current=true` vs `002B?current=false`. Nombre propio para no chocar con el `includeInactive` del listado de usuarios |
| Página del bloque | Componente | `useState` | El bloque vive dentro de una ficha que ya tiene su propia URL; su página no se comparte por enlace |
| Asignaciones | TanStack Query | `['userGeoLocation', 'byUser', userId, { page, pageSize, coverageAll }]` | Listado por padre de `createResource` |
| Cobertura efectiva | TanStack Query | `['userGeoLocation', 'coverage', userId]` | **Ya existe**: `useUserGeoCoverage`, `staleTime` 30 min |
| Ubicaciones elegidas en el diálogo | Componente | `useState<GeoLocationOption[]>` | Borrador del formulario, se descarta al guardar |
| Fechas del diálogo de vigencia | React Hook Form | — | |
| Diálogos abiertos, fila en confirmación | Componente | `useState` | Efímero |

**La primera posición de la clave es `userGeoLocation`, no `appUserGeoLocation`.** `CONVENTIONS.md` §6.3 pide el nombre del backend, pero FE10 ya publicó `['userGeoLocation', 'coverage', userId]` en código en producción. Renombrarlo obligaría a tocar un hook que funciona para no ganar nada; la excepción se declara aquí y se queda.

**Invalidaciones — el punto que más importa de esta tabla.** Tras `007`, `004`, `005A`, `005B` y `006` se invalida **`['userGeoLocation']` entera**, no sólo el listado. Eso arrastra `['userGeoLocation', 'coverage', userId]`, que tiene `staleTime` de 30 minutos y alimenta el filtro de unidades de salud del wizard de FE10. Sin esa invalidación, un administrador amplía la cobertura de alguien y ese alguien sigue media hora sin poder abrir casos donde ya debería.

**Nada de `assigned` ni de `coverage` se copia a `useState`.** El desplegable de la expansión lee directamente de la query; es una lista de sólo lectura.

### 3.5 Formularios y validación

**Diálogo de añadir** — `features/userGeoLocation/schemas.ts`, `bulkAssignGeoSchema`, sobre `ESAVI-USERGEO-007`:

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `geoLocationIds` | `<GeoLocationPicker>` + lista previa | sí | Mínimo uno, **sin repetidos** — el validador del backend los rechaza con `400` |
| `validFrom` | `<DateField>` | no | Si falta, el servicio pone `now()` |
| `validTo` | `<DateField>` | no | Nulo = vigencia abierta. Si viene, posterior a `validFrom` |

**El picker excluye lo ya asignado.** Las ubicaciones con una asignación **activa** no se ofrecen, y las que ya están en la lista previa tampoco. Es lo que evita el `409 USERGEO_007_ASSIGNMENT_EXISTS` que aborta el lote entero. Una ubicación con asignación **cerrada** sí se ofrece: el `007` la reactiva, que es el comportamiento correcto.

**`validFrom` y `validTo` se aplican al lote completo.** El `007` las acepta una vez, no por ubicación. Si se necesitan vigencias distintas, son dos guardados.

**Diálogo de vigencia** — `updateGeoValiditySchema`, sobre `ESAVI-USERGEO-004`. Sólo `validFrom` y `validTo`; `userId` y `geoLocationId` en el cuerpo dan `400`. El `004` exige además que la fila esté **activa**: sobre una cerrada responde `409 USERGEO_004_ALREADY_INACTIVE`, así que la acción no se ofrece en esas filas.

**Composición de las fechas.** Las dos columnas son `timestamptz`. El selector elige un día y el cliente compone:

- `validFrom` → **00:00:00.000 local** del día elegido.
- `validTo` → **23:59:59.999 local** del día elegido.

Ambas se serializan en ISO 8601 con desfase. Así «desde el 1 hasta el 1» es un día completo y no un rango vacío que el `CHECK (validTo > validFrom)` rechazaría. **La hora no se expone en la interfaz**: quien asigna territorios piensa en días.

**Validación en el cliente antes de enviar:** `validTo` posterior a `validFrom` comparando los dos instantes ya compuestos, no los días. Ahorra un viaje; el `409 USERGEO_00X_INVALID_DATE_RANGE` se sigue manejando.

**Diálogo de reasignación** — sobre `ESAVI-USERGEO-006`, con `reassignGeoSchema`: un solo `geoLocationId` destino, elegido con `<GeoLocationPicker>`, que excluye la ubicación de origen y las que el usuario ya tiene activas. El diálogo dice explícitamente que la asignación actual **se cerrará** y que las dos escrituras ocurren en una transacción.

**Errores del servidor mapeados:**

| `code` | Dónde se muestra |
|---|---|
| `USERGEO_007_GEOLOC_NOT_FOUND` | Bajo la lista previa: alguna ubicación dejó de estar activa |
| `USERGEO_007_ASSIGNMENT_EXISTS` | Toast de «vuelve a intentarlo», tras invalidar el listado |
| `USERGEO_007_INVALID_DATE_RANGE`, `USERGEO_004_INVALID_DATE_RANGE` | Campo `validTo` |
| `USERGEO_004_ALREADY_INACTIVE` | Toast: la asignación ya está cerrada |
| `USERGEO_006_SAME_GEOLOCATION` | Campo del picker destino |
| `USERGEO_006_ASSIGNMENT_EXISTS` | Campo del picker destino: el usuario ya cubre esa ubicación |
| `USERGEO_006_ALREADY_INACTIVE` | Toast: no se reasigna desde una asignación cerrada |
| `USERGEO_005A_ALREADY_INACTIVE`, `USERGEO_005B_ALREADY_ACTIVE` | Toast, tras invalidar |

**Cerrar no tiene guardas.** El backend no comprueba si es la última asignación del usuario, así que se puede dejar a alguien sin cobertura. El diálogo de confirmación lo advierte cuando es la última activa —**advertencia, no bloqueo**: replicar una guarda que el servidor no tiene sería inventarse una regla.

### 3.6 Estados del bloque

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de tres filas | — |
| Vacío | «Este usuario no tiene cobertura asignada» + botón «Añadir ubicaciones» | `userGeoLocation.empty` |
| Vacío con el toggle activo | «Ni vigentes ni cerradas» | `userGeoLocation.emptyAll` |
| Error | Mensaje derivado del `code` + reintentar | `userGeoLocation.error` |
| Sin permiso | No se llega: el bloque vive dentro del guard `ADMIN` de la ficha | — |
| Cobertura efectiva cargando | Skeleton del resumen, sin bloquear la lista | — |
| Cobertura efectiva vacía | «No cubre ninguna ubicación» | `userGeoLocation.coverage.empty` |

**Tres badges de fila, no dos.** Es la distinción que justifica este spec:

| Badge | Condición | Clave |
|---|---|---|
| Vigente | `isActive` y (`validTo` nulo o futuro) | `userGeoLocation.badges.current` |
| Vencida | `isActive` y `validTo` en el pasado | `userGeoLocation.badges.expired` |
| Cerrada | `isActive: false` | `userGeoLocation.badges.closed` |

Una fila **vencida** está activa y no cubre nada. Si sólo hubiera dos badges, sería indistinguible de una vigente y nadie entendería por qué el usuario no ve sus casos.

### 3.7 Responsividad y accesibilidad

- El bloque es una lista dentro de la ficha, no una tabla propia. Por debajo de `md` cada fila muestra: **nombre de la ubicación**, **nivel** y **rango de vigencia**; el badge acompaña al nombre.
- Los tres diálogos ocupan el ancho completo por debajo de `md`, y el `<GeoLocationPicker>` apila sus niveles en vertical.
- La lista previa del diálogo de añadir permite retirar un elemento con un botón de 44px y `aria-label` propio.
- El desplegable de la expansión de cobertura es un `<details>` accesible, con el recuento en el resumen.
- Los tres estados de fila **no se distinguen sólo por color**: cada badge lleva su texto.
- Las fechas se formatean con `date-fns` y el locale activo, como en `<AuditTrail>`.

### 3.8 Claves i18n nuevas

| Clave | Uso |
|---|---|
| `userGeoLocation.title` | Título del bloque |
| `userGeoLocation.empty`, `.emptyAll`, `.error` | Estados |
| `userGeoLocation.showAll` | Toggle «mostrar cerradas y vencidas» |
| `userGeoLocation.badges.current`, `.expired`, `.closed` | Los tres estados de fila |
| `userGeoLocation.columns.location`, `.level`, `.validity`, `.assignedBy` | Etiquetas de fila |
| `userGeoLocation.validity.open` | «Sin fecha de fin» |
| `userGeoLocation.add.title`, `.picker`, `.selected`, `.remove`, `.submit` | Diálogo de añadir |
| `userGeoLocation.add.alreadyAssigned` | Por qué una ubicación no aparece en el picker |
| `userGeoLocation.validity.title`, `.from`, `.to`, `.submit` | Diálogo de vigencia |
| `userGeoLocation.reassign.title`, `.warning`, `.submit` | Diálogo de reasignación |
| `userGeoLocation.close.title`, `.confirm`, `.lastOneWarning` | Confirmación de cierre |
| `userGeoLocation.coverage.title`, `.count`, `.empty`, `.expand` | Resumen de cobertura efectiva |
| `userGeoLocation.errors.geoNotFound`, `.assignmentExists`, `.invalidDateRange` | Mapeo de `code` |
| `userGeoLocation.errors.sameGeoLocation`, `.alreadyInactive`, `.alreadyActive` | Los `409` restantes |

Van en `es`, `en` y `nl`; `npm run i18n:check` exige paridad exacta.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y arrancable, y puede committearse solo. Los pasos 1 a 4 amplían la base sin que cambie nada en pantalla; del 5 al 9 el bloque crece operación a operación. **FE20 tiene que estar implementado antes del paso 6**: sin la ficha, el bloque no tiene dónde montarse.

1. **Tipos del contrato.** `npm run contracts:sync` para traer `CreateAppUserGeoLocationInput`, `BulkAssignGeoLocationsInput` y `ReassignGeoLocationInput`. A mano, en `contracts/declared/userGeoLocation.ts`: `GeoAssignment`, `GeoAssignmentListResponse` y `UpdateGeoValidityInput`, **sin tocar `UserGeoCoverage`**, que FE10 ya usa.
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` en 0; `git diff` sobre `UserGeoCoverage` no devuelve nada.

2. **Declaración del recurso.** En `features/userGeoLocation/api.ts`, junto al `useUserGeoCoverage` que ya está: un `createResource` con `ResourceParentConfig` —`operation: 'byUser'`, `segment: 'user-geo-locations/user/:parentId'`, `adminSegment: 'user-geo-locations/admin/user/:parentId'`— y `key: 'userGeoLocation'`, con los códigos `ESAVI-USERGEO-*` citados en comentario.
   *Verificación:* `useListByParent(userId, …)` pide `/api/user-geo-locations/user/:id` con `ADMIN` y el toggle apagado, y `/admin/user/:id` con él encendido; `useUserGeoCoverage` sigue funcionando sin cambios.

3. **El parámetro `current` y los tres hooks restantes.** `current` viaja como query param, con `true` en la ruta pública y `false` en la de administración. Más `useUpdateGeoValidity()` sobre `004`, `useReassignGeoLocation()` sobre `006` y `useBulkAssignGeoLocations()` sobre `007`. Los cinco mutadores invalidan **`['userGeoLocation']` entera**.
   *Verificación:* tras un `007`, MSW registra una refetch de `coverage` además de la del listado — es lo que impide que el wizard de FE10 se quede media hora desactualizado.

4. **Schemas Zod y composición de fechas.** `features/userGeoLocation/schemas.ts` con `bulkAssignGeoSchema`, `updateGeoValiditySchema` y `reassignGeoSchema`, más el helper que compone `validFrom` a 00:00 local y `validTo` a 23:59:59.999 local.
   *Verificación:* elegir el mismo día en las dos fechas produce un rango de 24 horas menos un milisegundo, no un rango vacío; `validTo` anterior a `validFrom` falla en el cliente.

5. **Claves i18n.** Las de §3.8 en `es.json`, `en.json` y `nl.json`.
   *Verificación:* `npm run i18n:check` en 0.

6. **El bloque, en sólo lectura.** `features/userGeoLocation/UserGeoCoverageCard.tsx` montado como tercera tarjeta de `UserDetailPage.tsx`: lista de asignaciones, los tres badges de §3.6, el toggle, y `CoverageSummary.tsx` con la expansión del `008`.
   *Verificación:* una fila activa con `validTo` en el pasado se pinta como **vencida**, no como vigente; el desplegable muestra los descendientes y su recuento coincide con `count`.

7. **Añadir ubicaciones.** `AddGeoAssignmentsDialog.tsx`: `<GeoLocationPicker>`, lista previa, exclusión de lo ya asignado activo y de lo ya elegido, fechas opcionales y guardado por `007`.
   *Verificación:* elegir dos ubicaciones produce **una** llamada a `/bulk` con dos ids; una ubicación con asignación activa no aparece en el picker; una con asignación cerrada sí, y guardarla la reactiva.

8. **Vigencia y cierre.** `GeoAssignmentValidityDialog.tsx` sobre `004`, y la confirmación de cierre sobre `005A` con el aviso de última asignación activa. El botón «Reabrir» (`005B`) sólo con `useCan(SUPERADMIN)`.
   *Verificación:* la acción de editar vigencia no se ofrece en filas cerradas; cerrar la única asignación activa muestra el aviso y **deja confirmar**; con `ADMIN` el botón de reabrir no está en el DOM.

9. **Reasignación.** `ReassignGeoDialog.tsx` sobre `006`, con el picker de destino que excluye el origen y lo ya cubierto, y el aviso de que la asignación actual se cerrará.
   *Verificación:* reasignar produce **una** llamada a `/reassign/:id`; tras ella el origen aparece como cerrado y el destino como vigente, sin recargar la página.

10. **Pruebas.** `api.test.tsx` ampliado, `schemas.test.ts`, `UserGeoCoverageCard.test.tsx`, `AddGeoAssignmentsDialog.test.tsx`, `GeoAssignmentValidityDialog.test.tsx` y `ReassignGeoDialog.test.tsx`, con MSW.
    *Verificación:* `npm run check` en 0.

---

## 5. Criterios de aceptación

**Listado y estados**

- [ ] Las ocho rutas de §3.2 se consumen; `ESAVI-USERGEO-001` y `ESAVI-USERGEO-003` no aparecen en `src/features/userGeoLocation/`.
- [ ] Con el toggle apagado la petición va a `/api/user-geo-locations/user/:id` con `current=true`; encendido, a `/admin/user/:id` con `current=false`.
- [ ] Una fila activa con `validTo` en el pasado se pinta como **vencida**, distinta de una vigente y de una cerrada.
- [ ] Los tres badges llevan texto: ninguno depende sólo del color.
- [ ] El toggle vive en `searchParams.coverageAll` y sobrevive al refresco de `/users/:id`.
- [ ] La paginación del bloque **no** aparece en la URL.

**Añadir**

- [ ] Elegir dos ubicaciones produce **una** llamada a `POST /api/user-geo-locations/bulk` con dos `geoLocationIds`.
- [ ] Una ubicación con asignación activa no se ofrece en el picker; una con asignación cerrada sí, y guardarla la reactiva en vez de duplicarla.
- [ ] Una ubicación ya presente en la lista previa no se puede añadir dos veces.
- [ ] Si llega `409 USERGEO_007_ASSIGNMENT_EXISTS`, se invalida el listado y se pide reintentar; no se pinta como error de campo.
- [ ] Guardar sin fechas manda el lote sin `validFrom` ni `validTo`, y el backend pone `now()`.

**Vigencia, cierre y reasignación**

- [ ] Elegir el mismo día en `validFrom` y `validTo` produce un rango de 24 horas menos un milisegundo; el backend responde `200`, no `409`.
- [ ] `validTo` anterior a `validFrom` se detiene en el cliente, y el `409 INVALID_DATE_RANGE` se pinta bajo `validTo` si llega igualmente.
- [ ] La acción de editar vigencia no se ofrece en filas cerradas.
- [ ] Cerrar la única asignación activa muestra el aviso **y permite confirmar**: no hay bloqueo que el backend no tenga.
- [ ] Cerrar escribe `validTo`: tras la operación la fila muestra fecha de fin, no «sin fecha de fin».
- [ ] Con `ADMIN` el botón «Reabrir» no está en el DOM; con `SUPERADMIN` sí.
- [ ] Reasignar produce **una** llamada a `PATCH /reassign/:id`; después el origen consta cerrado y el destino vigente, sin recargar.
- [ ] El picker de destino no ofrece la ubicación de origen ni las que el usuario ya cubre.

**Cobertura efectiva**

- [ ] El resumen muestra `count` y el desplegable lista `coverage`, que **incluye** los nodos de `assigned`.
- [ ] Tras un `007`, un `005A` o un `006`, la query `['userGeoLocation', 'coverage', userId]` se refetch a pesar de su `staleTime` de 30 minutos.
- [ ] Un usuario sin asignaciones muestra `userGeoLocation.coverage.empty`, no un error.

**Cierre**

- [ ] **Tema oscuro.** El bloque se ve correcto en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/userGeoLocation/` no devuelve resultados.
- [ ] **Por debajo de `md`.** Cada fila muestra ubicación, nivel y rango de vigencia, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` y con `ANALYTICS` no se llega a `/users/:id`, y un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4, con las dos excepciones declaradas: la página del bloque y el primer segmento de la clave.
- [ ] `UserGeoCoverage` y `useUserGeoCoverage` siguen con la misma firma, y el wizard de FE10 no cambia.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` también.

---

## 6. Decisiones tomadas y descartadas

**Sobre el alcance**

- **Sí:** bloque en `/users/:id` y no pantalla propia. La cobertura de un usuario no se consulta sin el usuario delante, y el grupo de Administración ya tiene seis entradas.
- **Sí:** `007` para todo, también para una sola ubicación. Hace lo mismo que el `001`, con la misma semántica de reactivación y dentro de una transacción. Dos caminos para el mismo acto es un camino de más que probar.
- **No:** `003`. El listado ya trae la fila completa; el `003` sólo añade el `user` anidado, que es el de la página.
- **No:** la vista inversa «qué usuarios cubren este territorio». El backend no la tiene: el SPEC F01 §2 dejó el `002` en una sola dirección para no estirar la convención con un `002C`.
- **No:** asignar cobertura durante el alta del usuario. `ESAVI-USER-001` no la acepta, y añadirla partiría el alta en dos escrituras sin transacción.

**Sobre la vigencia**

- **Sí:** exponer y editar `validFrom` y `validTo`. El backend construyó el `004`, el `CHECK` y el cierre con `validTo = now()` exactamente para esto; ocultarlo dejaría tres columnas gobernadas a ciegas.
- **Sí:** tres badges y no dos. Una fila activa con `validTo` vencido no cubre nada, y si se pintara como vigente nadie entendería por qué el usuario no ve sus casos. Es la diferencia que justifica el spec.
- **Sí:** el selector elige días y el cliente compone las horas — 00:00 y 23:59:59.999 locales. Quien asigna territorios piensa en días, y «del 1 al 1» tiene que ser un día completo, no un rango vacío que el `CHECK` rechaza.
- **No:** exponer la hora. Sería precisión que nadie va a usar y una fuente de rangos inválidos por un minuto de diferencia.
- **Sí:** `validFrom`/`validTo` aplicadas al lote completo en el `007`. Es lo que el endpoint acepta; vigencias distintas son dos guardados.

**Sobre las escrituras**

- **Sí:** excluir del picker lo que ya está asignado y activo. El `007` aborta el lote entero con `409` si un solo par ya está activo: evitarlo en el picker es más barato que explicarlo después.
- **Sí:** ofrecer en el picker lo que está **cerrado**. El `007` lo reactiva, que es exactamente lo que se quiere.
- **Sí:** exponer `006`. Cerrar y volver a añadir a mano son dos escrituras sin transacción, y el backend ya resolvió el caso.
- **Sí:** avisar al cerrar la última asignación activa, **sin bloquear**. El backend no tiene esa guarda; inventarla en el cliente sería una regla que sólo existe en la mitad del sistema.
- **Sí:** invalidar `['userGeoLocation']` entera tras cada mutación. Es lo que arrastra la query de cobertura, que tiene `staleTime` de 30 minutos y alimenta el wizard de FE10.

**Sobre las convenciones**

- **Sí:** mantener `userGeoLocation` como primera posición de la clave de caché, aunque `CONVENTIONS.md` §6.3 pida el nombre del backend (`appUserGeoLocation`). FE10 ya lo publicó así en código que funciona; renombrarlo no gana nada.
- **Sí:** la página del bloque en `useState` y no en la URL. El bloque vive dentro de una ficha que ya tiene su enlace; su paginación no se comparte.
- **No:** un `Sheet` de auditoría por asignación. El `validTo` y el badge de cada fila cuentan lo esencial, y la ficha ya tiene el `<AuditTrail>` del usuario.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| La query de cobertura tiene `staleTime` de 30 minutos y alimenta el filtro de unidades de salud del wizard. Sin invalidarla, ampliar la cobertura de alguien no surte efecto en media hora | Los cinco mutadores invalidan `['userGeoLocation']` entera, no sólo el listado. Hay un criterio de aceptación específico para esto |
| El `007` aborta el lote entero si un solo par ya está activo, y el picker puede ir desfasado respecto al servidor | El picker excluye lo ya asignado; si el `409` llega igualmente, se invalida y se pide reintentar. No se reintenta solo |
| `validFrom`/`validTo` son `timestamptz` y el resto del expediente usa `date`. Es fácil que alguien aplique aquí la regla de `YYYY-MM-DD` | §3.3 y §3.5 lo dicen explícitamente, y el helper de composición vive en un solo sitio con su test |
| La exclusión del picker es por **id**, y `<GeoLocationPicker>` no resuelve subárboles: asignar un cantón cuya provincia ya está asignada es posible y no da error | Es correcto a nivel de datos —son pares distintos— y la cobertura efectiva no cambia, porque el cantón ya estaba dentro. El resumen del `008` lo hace visible: `count` no sube |
| Cerrar deja a un usuario sin cobertura y el wizard de FE10 deja de ofrecerle unidades de salud | El aviso de última asignación activa lo anticipa. No se bloquea porque el backend no lo bloquea |
| FE22 depende de que FE20 esté implementado, no sólo escrito | El paso 6 del plan lo dice, y el bloque no tiene otra pantalla donde montarse |

---

## 8. Impacto en pantallas existentes

- **`features/user/UserDetailPage.tsx` (SPEC FE20)** — gana una tercera tarjeta. Es el único punto de montaje, y FE20 ya lo dejó previsto en su §6.
- **`features/userGeoLocation/api.ts`** — hoy tiene un solo hook. Gana la declaración del recurso y tres mutadores. **`useUserGeoCoverage` no cambia de firma**, y su `staleTime` tampoco: lo que cambia es que ahora algo lo invalida.
- **`features/esaviCase/` (SPEC FE10)** — no se toca, pero **se beneficia**: el `CaseOpeningStep` deja de trabajar con una cobertura que nadie podía actualizar.
- **`contracts/declared/userGeoLocation.ts`** — `UserGeoCoverage` se queda intacto; se añaden tres interfaces.
- **Ninguna primitiva de `shared/` se modifica.** `<GeoLocationPicker>` y `<DateField>` se usan tal cual, con las props que ya tienen.

---

## Lo que **no** está en este spec

- Una pantalla propia en `/user-geo-locations`.
- `ESAVI-USERGEO-001` y `ESAVI-USERGEO-003`.
- La vista inversa: qué usuarios cubren un territorio. El backend no la expone.
- Filtrar casos, notificaciones o listados por la cobertura de quien pregunta. Es un cambio transversal del backend, fuera incluso del SPEC F01.
- Elegir cobertura sobre un mapa.
- Asignar cobertura durante el alta del usuario.
- Vigencias distintas para cada ubicación de un mismo lote.
- Exponer la hora de `validFrom` y `validTo`.
- Un `Sheet` de auditoría por asignación.
- Exportar.

Cada uno de esos, si aterriza, va en su propio spec.

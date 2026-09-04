# SPEC FE09 — Listado y detalle de casos ESAVI

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell y autenticación), SPEC FE02 (fábrica de recursos y primitivas), SPEC FE08 (armazón del wizard: `features/esaviCase/api.ts`, `useCaseWorkflow`), **SPEC F06 del backend** (`esaviCase`), **SPEC F44** (`caseWorkflow`), **SPEC F48** (filtros de fecha y geografía), **SPEC F49** (alcance geográfico del usuario), **SPEC F52** (filtro `code`)
> **Fecha:** 2026-09-03
> **Objetivo:** La opción «Ver/editar» del menú: el listado de casos con sus catorce filtros en la URL, una bandeja por estado del proceso, y la página de resumen de sólo lectura desde la que se abre el expediente.

---

## 1. Por qué existe este spec

Es el segundo de los siete specs que implementan `references/CASE-PROCESS.md` (§9 de ese documento), y va segundo por una razón que ese mismo documento declara: con FE08 y FE09 **las dos entradas del menú están vivas** y un expediente es reanudable de punta a punta, aunque los pasos todavía no guarden nada.

**A — «Ver/editar» está en el menú y no lleva a ninguna parte.** `shared/config/navigation.ts:57-63` declara `nav.items.caseBrowse` con `disabled: true` y el comentario que lo explica: *«stays disabled until FE09 builds the listing behind it»*. Hoy la única forma de llegar a un expediente es haberlo creado en esta misma sesión: `/esavi-cases/:id/wizard` exige un `caseId` que ninguna pantalla entrega. Un caso capturado ayer es, en la práctica, inalcanzable.

**B — Catorce filtros implementados en el backend y ningún cliente que los use.** El SPEC F48 amplió `ESAVI-CASE-002A` de cuatro filtros a doce y el F52 añadió el decimotercero y el decimocuarto —`code` sobre `caseCode`, «el único dato que trae el formulario en papel cuando alguien llama preguntando por un expediente» (F52 §32)—. Las dos preguntas que la vigilancia epidemiológica hace primero —por fecha de evento y por territorio— tienen respuesta en la API desde el 2026-08-30 y no tienen ningún control en pantalla.

**C — El alcance geográfico ya gobierna, y la interfaz no lo cuenta.** Desde el SPEC F49, un `USER` sin filas vigentes en `appUserGeoLocation` recibe `200` con `count: 0` —**nunca `403`**— y `ESAVI-CASE-003` le responde `404` para cualquier caso. Es el comportamiento correcto y es indistinguible de «no hay datos». Sin una pantalla que lo nombre, un usuario recién creado abre el listado, ve el vacío y concluye que el sistema está vacío. El texto de ese estado es de este spec porque no hay ningún otro sitio donde ponerlo.

**D — El estado del expediente no se puede filtrar por el listado de casos, y hay que decirlo aquí.** `CASE-PROCESS.md:2327` pide para FE09 un «filtro por estado del workflow», pero el SPEC F48 lo excluye explícitamente del backend: *«Filtrar por el estado del flujo (`caseWorkflow`)… ninguno entra aquí»*. `ESAVI-CASE-002A` no acepta `statusCode` y no lo va a aceptar sin un spec del otro repositorio. Lo que sí existe es `ESAVI-CASEFLOW-002A`, con `statusCode`, `openedFrom` y `openedTo` (`contracts/caseWorkflow.ts`, `CaseWorkflowListFilters`). Este spec entrega el filtro pedido **contra el endpoint que lo sirve**, en una segunda pestaña con sus propias columnas, en vez de inventarlo sobre el que no.

**E — `<DateField>` no puede esperar a FE10.** `ARCHITECTURE.md` §4.3 la declara primitiva y `CASE-PROCESS.md` §9 se la asigna a FE10. Pero esta pantalla necesita **nueve** entradas de fecha antes que eso, y escribirlas como campos sueltos aquí significa reescribirlas después. Se adelanta a FE09, con la regla temporal por parámetro como manda §4.3 — porque los filtros, a diferencia del cuerpo del expediente, **no heredan «no futura»** (F48 §3.7): «de marzo en adelante» es una consulta legítima. El mismo argumento vale para `<CatalogSelect>`, que FE06 ya tuvo que resolver a mano.

---

## 2. Alcance

**Dentro:**

- **Dos rutas nuevas** en `app/router.tsx`, ambas bajo `<RequireRole level={USER}>` — el rol mínimo real de `ESAVI-CASE-002A`, `ESAVI-CASE-003` y `ESAVI-CASEFLOW-002A` (`API-ROUTES.md:89`, `:91`, `:100`):
  - `/esavi-cases` — el listado, con las dos pestañas de `?tab=`.
  - `/esavi-cases/:id` — la página de resumen de sólo lectura.
- **Pestaña «Por caso»** (`?tab=cases`, la de por defecto) — `<ResourceTable>` sobre `ESAVI-CASE-002A` / `002B` con los **catorce filtros** en `searchParams`: los trece del SPEC F48 más `code` del SPEC F52.
- **Pestaña «Bandeja por estado»** (`?tab=workflow`) — `ESAVI-CASEFLOW-002A` / `002B` con `statusCode`, `openedFrom` y `openedTo`. Columnas propias y **filtros que no se traducen entre pestañas**: `statusCode` no existe en `002A` y `geoLocationId` no existe en `CASEFLOW-002A`.
- **`useCaseWorkflowList(...)`** en `features/caseWorkflow/api.ts` — el listado que FE08 no declaró, escrito a mano por la misma razón que los otros dos hooks de ese archivo.
- **Los tres controles segmentados de fecha** — *Exacta · Rango* por cada una de `reportDate`, `eventDate` y `reportFillingDate`, que hacen **inalcanzable por construcción** la combinación que el backend rechaza con `400` (F48 §3.3). Sólo queda `From > To` como regla Zod.
- **`<DateField>` en `shared/components/`** — la primitiva de `ARCHITECTURE.md` §4.3, adelantada desde FE10 (§1E). Recorte a `YYYY-MM-DD` y **la regla temporal por parámetro**: aquí se instancia con futuro permitido, porque los filtros no heredan `isNotFutureDate` (F48 §3.7). A partir de este spec es de todos y no se copia.
- **`<CatalogSelect>` en `shared/components/`** — la primitiva de `ARCHITECTURE.md` §4.3, adelantada por la misma razón: la resolución de dos saltos `catalogType` → `catalogItem` ya está escrita a mano en `HealthFacilityListPage.tsx:117-131`, y una segunda copia la convertiría en patrón. La consume el filtro `statusCode` de la bandeja, sobre el catálogo `caseWorkflowStatus`.
- **Tres componentes de shadcn que no están instalados**: `tabs`, `calendar` y `popover`.
- **Página de resumen** `/esavi-cases/:id` — `ESAVI-CASE-003` para identidad, paciente, unidad de salud y las tres fechas; `useCaseWorkflow(caseId)` (`CASEFLOW-006`, reutilizado de FE08) para el estado del expediente; `<AuditTrail>` sobre `appDetails`, restringido a `SUPERADMIN` (`CONVENTIONS.md` §10.4); y el botón **«Abrir expediente»**, etiquetado según el estado y deshabilitado con `CLOSED`.
- **La pantalla de no encontrado del detalle**, con texto neutro y una salida: un caso ajeno y un caso inexistente son la misma respuesta byte a byte (F49 §122), así que la pantalla no finge distinguirlos y en cambio dice qué hacer.
- **El estado vacío que nombra el alcance geográfico** — §1C. Distinto del vacío con filtros, que lleva su botón de limpiar.
- **El enlace «casos de este paciente»** — `/esavi-cases?patientId=<id>` desde el menú de fila y desde el detalle, con una **cápsula con el nombre del paciente y una X** para quitarlo.
- **Ciclo de vida desde el listado**: desactivar (`005A`, ADMIN) y reactivar (`005B`, SUPERADMIN), con el menú de fila y el diálogo de confirmación de siempre. Más el toggle de «mostrar inactivos», que `createResource` ya resuelve eligiendo `002B`.
- **Dos tipos en `contracts/declared/`** — `EsaviCaseListRow` y `CaseWorkflowListRow`. Ninguno es espejo: el backend los construye como literales y `contracts:sync` no los puede copiar, igual que `EsaviCaseDetail` y `CaseWorkflowDetail` en FE08.
- **El cambio de menú**: `nav.items.caseBrowse` pierde su `disabled: true`.
- **Las claves `esaviCase.list.*`, `esaviCase.detail.*` y `caseWorkflow.list.*`** en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **`ESAVI-CASE-004`.** Editar un caso es entrar al wizard, y el paso 2 de **FE10** es quien lo escribe. Dos puertas de edición sobre la misma fila es la contradicción que después nadie sabe reproducir.
- **`ESAVI-CASE-001`.** Crear es «Registrar», la otra entrada del menú, ya viva desde FE08. El listado enlaza a ella y no la duplica.
- **Un filtro de estado del workflow dentro de la pestaña «Por caso».** No existe en el backend (§1D). Queda anotado como **dependencia del otro repositorio**: un spec que añada `workflowStatusCode` a `ESAVI-CASE-002A`/`002B` con su `include` sobre `caseWorkflow`. Hasta entonces, las dos preguntas se hacen en dos pestañas.
- **Enriquecer cada fila del listado con su workflow** llamando a `CASEFLOW-006` por caso. Es una petición por fila y por página; se descarta explícitamente en §6.
- **Ordenación por columna.** `LIST_ORDER` es fijo en el backend —`reportDate DESC, caseCode DESC` para casos, `openedAt DESC` para workflows— y cambiarlo altera la paginación (F48 §2). La tabla no ofrece cabeceras ordenables que no existen.
- **`ESAVI-CASEFLOW-003`, `005A`, `005B`, `008`–`011`.** Cerrar, reabrir, validar y activar/desactivar el registro del flujo. El cierre es de **FE14** con sus cuatro precondiciones; los demás viajan con él.
- **Los seis formularios del expediente** — FE10 a FE14. Este spec no escribe un solo campo del caso.
- **Una pantalla de pacientes.** `nav.items.patient` sigue `disabled: true`; el enlace `?patientId=` nace y muere dentro de esta feature.
- **Exportación a CSV o Excel**, y cualquier agregado, conteo por territorio o serie temporal. El SPEC F48 los declara fuera y no hay endpoint (`GET /api/esavi-cases/stats` no existe).
- **Filtrar por la geografía de residencia del paciente.** Otro filtro, otra semántica, otro spec — y hoy no está en la API.
- **Selección múltiple y acciones en lote.**

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado (dos pestañas) | `/esavi-cases` | `features/esaviCase/EsaviCaseListPage.tsx` | `<RequireRole level={USER}>` |
| Resumen del caso | `/esavi-cases/:id` | `features/esaviCase/EsaviCaseDetailPage.tsx` | `<RequireRole level={USER}>` |

**El orden de las rutas importa.** `/esavi-cases/new` (FE08) y `/esavi-cases/:id` compiten por el mismo segmento: `new` se declara **antes**, o `NewCasePage` deja de ser alcanzable y `EsaviCaseDetailPage` pide el caso `"new"`. React Router v7 resuelve por especificidad y prefiere el segmento estático, pero la prueba de router que lo fija es un paso del plan (§4) y no una confianza.

Piezas nuevas, todas en `features/esaviCase/` salvo las dos primitivas:

| Archivo | Qué es |
|---|---|
| `EsaviCaseListPage.tsx` | Las dos pestañas, la barra de filtros y la cápsula de paciente |
| `EsaviCaseFilters.tsx` | Los catorce controles de la pestaña «Por caso», incluido el panel plegable de fechas |
| `CaseWorkflowInbox.tsx` | La tabla de la pestaña «Bandeja por estado» y sus tres filtros |
| `EsaviCaseDetailPage.tsx` | Resumen, estado del expediente, auditoría y «Abrir expediente» |
| `EsaviCaseNotFound.tsx` | La pantalla neutra del `404` del `003` |
| `schemas.ts` | `esaviCaseFiltersSchema` y `caseWorkflowFiltersSchema` |
| `shared/components/DateField.tsx` | La primitiva de `ARCHITECTURE.md` §4.3, adelantada (§1E) |
| `shared/components/CatalogSelect.tsx` | La primitiva de `ARCHITECTURE.md` §4.3, adelantada (§1E) |

**Menú** — `shared/config/navigation.ts:57-63`, grupo *Casos*. Una sola línea cambia:

| Clave i18n | Ruta | Icono | `minLevel` | Antes | Después |
|---|---|---|---|---|---|
| `nav.items.caseBrowse` | `/esavi-cases` | `FileText` | `USER` | `disabled: true` | viva |

`USER` es el rol mínimo real de `ESAVI-CASE-002A` (`API-ROUTES.md:89`), no una estimación. **La pestaña no viaja en el menú:** `nav.items.caseBrowse` apunta a `/esavi-cases` sin `?tab=`, y la pantalla resuelve el defecto.

### 3.2 Endpoints consumidos

Copiados textualmente de `references/API-ROUTES.md`:

```
GET    /api/esavi-cases                 ESAVI-CASE-002A      USER        listado de casos (activos)
GET    /api/esavi-cases/admin           ESAVI-CASE-002B      ADMIN       idem, incluye inactivos
GET    /api/esavi-cases/:id             ESAVI-CASE-003       USER        resumen del caso + appDetails
DELETE /api/esavi-cases/:id             ESAVI-CASE-005A      ADMIN       borrado lógico
PATCH  /api/esavi-cases/activate/:id    ESAVI-CASE-005B      SUPERADMIN  reactivar
GET    /api/case-workflows              ESAVI-CASEFLOW-002A  USER        bandeja por estado (activos)
GET    /api/case-workflows/admin        ESAVI-CASEFLOW-002B  ADMIN       idem, incluye inactivos
GET    /api/case-workflows/case/:id     ESAVI-CASEFLOW-006   USER        estado del expediente en el detalle
```

Más los dos que consume `<CatalogSelect>` por dentro: `ESAVI-CATTYPE-002A` y `ESAVI-CATITEM-002A`.

Lo que **no** se consume aquí y por qué:

- **`ESAVI-CASE-001`** — «Registrar» es la otra entrada del menú y es de FE08. El listado enlaza a `/esavi-cases/new`.
- **`ESAVI-CASE-004`** — fuera de alcance por decisión (§2): la edición del caso es el paso 2 del wizard, en FE10.
- **`ESAVI-CASEFLOW-003`** — obtener un flujo por su PK. Ninguna pantalla de este spec tiene un `caseWorkflowId` en la mano: la bandeja entra por el caso y el detalle usa el `006`, que es la operación escrita para eso.
- **`ESAVI-CASEFLOW-005A` / `005B`** — activan y desactivan el **registro** del flujo, que no es cerrar ni reabrir un expediente. Es la confusión que el SPEC F44 más quiere evitar (`CASE-PROCESS.md` §3), y ninguna pantalla de este spec las ofrece.
- **`ESAVI-CASEFLOW-007`–`011`** — completar etapa es de FE08; cerrar, reabrir y validar son de FE14.
- **`ESAVI-PATIENT-003`** — resolver el nombre del paciente de la cápsula `?patientId=`. **No hace falta:** la fila del listado ya trae `patient.names` y `patient.lastNames` descifrados (F48 §3.9), y la cápsula se pinta con el nombre de la primera fila de la respuesta. Con `count: 0` la cápsula muestra el filtro sin nombre y su X sigue funcionando, que es lo único que importa en ese estado.

**Dos notas del contrato que gobiernan estas llamadas:**

**El listado dual lo elige `createResource`,** por nivel de rol y por el toggle de inactivos (`inactiveMode: 'adminPath'`, ya declarado en `features/esaviCase/api.ts`). Un `USER` nunca llega al `002B` aunque manipule la URL: el `canViewAdminPath` del factory lo impide antes, y el backend lo impediría después.

**El alcance geográfico del SPEC F49 se aplica en el servidor y no se replica aquí.** El cliente no conoce la cobertura del usuario ni la pide: manda los filtros que el usuario eligió y pinta lo que vuelve. Un `geoLocationId` fuera del alcance devuelve `200` con `count: 0`, **no `403`** (F49 §108), y por tanto no hay ningún caso de error que manejar — sólo el estado vacío de §3.6.

### 3.3 Tipos del contrato

**Nada que traer con `contracts:sync`.** Los dos tipos generados que esta pantalla usa ya existen: `EsaviCaseListFilters` (los catorce filtros, `contracts/esaviCase.ts`) y `CaseWorkflowListFilters` (`contracts/caseWorkflow.ts`). Ninguno cambia.

**Dos tipos escritos a mano en `contracts/declared/`.** Ninguno es espejo: el backend construye las respuestas como literales de retorno, sin `interface` que `contracts:sync` pueda copiar — la misma situación que FE08 §3.3 declaró para `EsaviCaseDetail` y `CaseWorkflowDetail`.

**`EsaviCaseListRow`** — nuevo en `contracts/declared/esaviCase.ts`. Origen: `esaviCase.service.ts`, `LIST_ATTRIBUTES` + `toEsaviCaseListRow`, cuya forma el SPEC F48 §3.9 declara textualmente.

```ts
export interface EsaviCaseListRow {
  caseId: string;
  caseCode: string;
  reportDate: string | null;
  eventDate: string | null;
  isActive: boolean;
  patient: { patientId: string; names: string; lastNames: string; healthSystemCode: string | null };
  healthFacility: {
    healthFacilityId: string;
    localCode: string;
    name: string;
    geoLocation: { geoLocationId: string; name: string } | null;
  };
}
```

**No es un `Partial<EsaviCaseDetail>`.** La fila del listado tiene un campo que el detalle no tiene —`healthFacility.geoLocation`, que el F48 añadió— y le faltan seis que el detalle sí trae: `countryIsoCode`, `reportFillingDate`, `notificationOrganization`, `details`, `appDetails` y los tres sellos. Y `patient` difiere: el listado no devuelve `documentNumber`. Declararlo derivado del detalle sería declarar una relación que no existe.

**`CaseWorkflowListRow`** — nuevo en `contracts/declared/caseWorkflow.ts`. Origen: `caseWorkflow.service.ts:300-327`, `toCaseWorkflowResponse`, que es el **mismo mapper** del `003`, del `006` y de cada fila del `002A`/`002B`. Por tanto se declara como la forma completa y `CaseWorkflowDetail` pasa a ser un alias suyo, no un tipo paralelo que haya que mantener en dos sitios.

```ts
export interface CaseWorkflowListRow {
  caseWorkflowId: string;
  caseId: string;
  caseCode: string | null;
  status: CatalogRef;
  previousStatus: CatalogRef | null;
  openedAt: string;
  closedAt: string | null;
  lastReopenedAt: string | null;
  reopenCount: number;
  stages: Record<StageAlias, CaseWorkflowStageEntry>;
  totalDurationMinutes: number | null;
  isActive: boolean;
  createdAt: string; updatedAt: string | null; deletedAt: string | null;
  appDetails: AppDetails[];
}
```

**Reconcilia lo que FE08 declaró de menos.** `CaseWorkflowDetail` (`contracts/declared/caseWorkflow.ts`) omite hoy seis campos que el backend sí devuelve —`totalDurationMinutes`, `isActive`, los tres sellos y `appDetails`— y no conocía `caseCode`. Un subconjunto no rompe una lectura, pero obliga a redeclarar el tipo cada vez que alguien necesita uno de los seis. Se completa aquí, una vez.

**`caseCode` es `string | null` y el `null` significa algo.** El backend lo resuelve como `(workflow.case)?.caseCode ?? null`: es `null` sólo si el `include` del caso no cargó, que en `002A`/`006` no debería ocurrir. La bandeja lo pinta con un marcador de ausencia en vez de con la cadena vacía, y **no** lo trata como error.

**Un cambio en la fábrica de recursos, con valor por defecto.** `createResource<T, TCreateInput, TUpdateInput>` usa hoy el mismo `T` para `useOne` y para las filas de `useList` (`createResource.ts:68-97`). Con `esaviCaseResource` declarado como `createResource<EsaviCaseDetail, …>`, el listado quedaría tipado como si sus filas fueran detalles: `row.appDetails` compilaría y llegaría `undefined` en ejecución. Se añade un cuarto parámetro:

```ts
createResource<T, TCreateInput = Partial<T>, TUpdateInput = Partial<T>, TListRow = T>
```

`useList` y `useListByParent` pasan a devolver `PaginatedResponse<TListRow>`. **Por defecto es `T`, así que ninguna de las declaraciones existentes cambia** —`catalogItem`, `catalogType`, `geoLevelType`, `geoLocation`, `healthFacility`— y `esaviCase` pasa a declarar `createResource<EsaviCaseDetail, CreateEsaviCaseInput, Partial<CreateEsaviCaseInput>, EsaviCaseListRow>`. Es la ampliación que FE08 §7 dejó anunciada: *«FE09 la extiende, no la reescribe»*.

### 3.4 Contrato de estado

**Dieciocho parámetros en la URL, dos claves de caché por pestaña, cero datos del servidor en `useState` y cero en Zustand.**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Pestaña activa | URL | `searchParams.tab` — `cases` \| `workflow` | Ausente = `cases`. Un valor desconocido se trata como `cases`, sin redirección |
| Filtro de código | URL | `searchParams.code` | Debounce 400 ms antes de escribir en la URL, mínimo 2 caracteres (F52) |
| Filtros de FK | URL | `patientId`, `healthFacilityId`, `geoLocationId` | UUID. `geoLocationId` es siempre jerárquico (F48 §3.4) |
| Filtros de fecha | URL | 9 params: `reportDate`/`From`/`To` y los de `eventDate` y `reportFillingDate` | `YYYY-MM-DD`. Por columna viaja **la exacta o el rango, nunca ambos** |
| Filtros de la bandeja | URL | `statusCode`, `openedFrom`, `openedTo` | Sólo se leen con `tab=workflow` |
| Mostrar inactivos | URL | `searchParams.includeInactive` | Decide `002A` vs `002B` en las dos pestañas. `createResource` lo ignora sin rol ADMIN |
| Página | URL | `searchParams.page` | 1-indexada; se traduce a `limit`/`offset` en la fábrica |
| Modo de cada columna de fecha | **Derivado** | `exact` si viaja la exacta; `range` si viaja algún extremo; si no, `useState` local | Ver la nota de abajo |
| Listado de casos | TanStack Query | `['esaviCase', 'list', { limit, offset, includeInactive, filters }]` | La clave la construye `createResource`; `filters` son los catorce |
| Bandeja | TanStack Query | `['caseWorkflow', 'list', { limit, offset, includeInactive, filters }]` | Hook a mano, misma forma de clave por coherencia |
| Resumen del caso | TanStack Query | `['esaviCase', 'detail', caseId]` | `useOne` del recurso. Siempre por `config.path`: el detalle no tiene ruta `/admin` |
| Estado del expediente en el detalle | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | `useCaseWorkflow` de FE08, sin `staleTime` — reutilizado tal cual |
| Tamaño de página | Zustand | `preferences.pageSize` | Persistido, por defecto 10. Es preferencia de usuario, no filtro: no va en la URL |
| Diálogo de confirmación abierto | Componente | `useState` | Efímero. Guarda el `caseId` y la acción, nunca la fila |
| Panel de fechas plegado/desplegado | Componente | `useState` | Efímero. El contador de filtros activos se deriva de `searchParams` |

**El modo de cada columna de fecha es derivado, y por eso no está en la URL.** Se calcula así: si viaja la fecha exacta → `exact`; si viaja `From` o `To` → `range`; si no viaja ninguno → lo que diga un `useState` local, que empieza en `exact`. **El `useState` sólo gobierna cuando no hay ningún dato que pueda contradecirlo**, así que no hay dos capas para el mismo dato y el botón de atrás no puede dejar el control desincronizado del filtro. Cambiar de modo **borra los parámetros del modo abandonado** en la misma escritura de `searchParams`, y ésa es la razón por la que la combinación que el backend rechaza con `400` es inalcanzable por construcción (§3.5).

**Nada del servidor se copia.** La cápsula de paciente muestra `patient.names` de la primera fila de la respuesta, leída de la caché en el render — no se guarda. El nombre del paciente **no es** un filtro: el filtro es `patientId`, y es lo único que viaja en la URL.

**`staleTime`: ninguno declarado, en ninguna de las cuatro consultas.** No es un olvido. Los casos son datos de captura activa —otro usuario puede estar registrando ahora mismo el caso que este listado no muestra— y el `<CatalogSelect>` del filtro de estado es el único catálogo de la pantalla, con su `staleTime` propio ya definido donde vive esa primitiva.

**Qué invalida qué.** `useDeactivate` y `useActivate` de la fábrica invalidan `[config.key]` entero, es decir **todas** las claves de `esaviCase`: listado y detalle a la vez. Es lo correcto aquí y se declara: desactivar desde el listado con el toggle de inactivos puesto tiene que mover la fila en el sitio, no dejarla mintiendo hasta el siguiente refresco. La bandeja **no se invalida** con esas dos mutaciones —son claves distintas— y no hace falta: `005A` sobre un caso no toca su `caseWorkflow`.

### 3.5 Filtros y validación

**La barra de filtros no es un `<ResourceForm>`.** No hay `POST` ni `PUT`: los controles escriben en `searchParams` y la URL es el único estado. Lo que sí hay es un schema Zod, y su trabajo es el contrario del habitual — **no valida lo que el usuario escribe, valida lo que viene en la URL**:

```ts
// features/esaviCase/schemas.ts
esaviCaseFiltersSchema    // parsea searchParams → EsaviCaseListFilters
caseWorkflowFiltersSchema // parsea searchParams → CaseWorkflowListFilters
```

Una URL puede llegar editada a mano, pegada de un chat o generada por una versión anterior de la pantalla. El schema descarta lo que no encaja —un `reportDate=ayer`, un `patientId` que no es UUID, un `page=-3`— y lo deja **fuera de la petición** en vez de reenviarlo al backend para cobrar un `400`. Un parámetro inválido se ignora en silencio, igual que hace `express-validator` con una query no declarada (F52 §558); no se muestra error por una URL que el usuario no escribió.

**Pestaña «Por caso»** — catorce controles:

| Filtro | Control | Regla |
|---|---|---|
| `code` | `<Input>` con debounce 400 ms | 2–200 caracteres. Por debajo de 2 no se escribe en la URL (F52) |
| `patientId` | Cápsula de sólo lectura con X | No se elige aquí: llega por el enlace «casos de este paciente» |
| `healthFacilityId` | `<EntitySearchSelect>` — **no existe aún**; hasta que llegue (FE10), el selector de unidad de salud se resuelve con `ESAVI-HFAC-006`, el mismo endpoint que ya usa `HealthFacilityListPage` | UUID |
| `geoLocationId` | `<GeoLocationPicker>` | Ya existe. Siempre jerárquico: incluye descendientes |
| `reportDate` · `eventDate` · `reportFillingDate` | Segmentado *Exacta · Rango* + uno o dos `<DateField>` | `YYYY-MM-DD`, futuro permitido |

**Pestaña «Bandeja por estado»** — tres controles: `statusCode` (`<CatalogSelect typeCode="caseWorkflowStatus">`), `openedFrom` y `openedTo` (`<DateField>`).

**Las cuatro reglas que el backend rechaza con `400`, y cómo se impiden:**

1. **Exacta y rango sobre la misma columna** (F48 §3.3) — **imposible por construcción**: el segmentado deja un solo formulario visible por columna y borra los parámetros del otro al cambiar de modo (§3.4). No hay mensaje de error porque no hay estado en el que aparezca.
2. **`From` posterior a `To`** — única regla que queda en el schema, tres veces. Se muestra bajo el par de campos y **no se escribe la URL** hasta que se resuelve. Comparación lexicográfica sobre `YYYY-MM-DD`, sin construir ningún `Date`: es lo que hace el validador del backend y por la misma razón.
3. **La exclusión es por columna, no global.** `?reportDate=2026-03-01&eventDateFrom=2026-02-01` es válida y frecuente. Los tres segmentados son independientes y la interfaz no los acopla.
4. **`limit` entre 1 y 100** — lo garantiza `preferences.pageSize`, que no ofrece valores fuera de rango.

**Errores del servidor mapeados en `shared/api/errorMessages.ts`:**

| `code` | Dónde aparece | Tratamiento |
|---|---|---|
| `CASEFLOW_002_STATUS_NOT_FOUND` | Bandeja, `404` | El `statusCode` de la URL no existe en el catálogo. **No es un error de red:** se limpia el filtro y se avisa en línea, junto al selector |
| `CASE_005A_*`, `CASE_005B_*` | Desactivar / reactivar | Toast por `code` |
| Sin `code` (`400` de `validateFields`) | Cualquier listado | Respaldado con `'UNKNOWN_ERROR'` por `client.ts`. Sólo alcanzable si el schema dejó pasar algo: es una traza de bug, no un flujo |

**Ninguna comparación de `code` asume que el valor exista**, y `errors` no se muestra nunca al usuario.

**Un detalle del contrato que la bandeja tiene que declarar:** `openedFrom`/`openedTo` se comparan contra `openedAt`, que es un **timestamp**, no una columna `date` — el backend hace `new Date(filters.openedTo)` (`caseWorkflow.service.ts:341-343`). Un `openedTo=2026-03-01` se convierte en la medianoche de ese día y **excluye los expedientes abiertos durante el 1 de marzo**. La etiqueta del campo dice «abiertos antes de», no «hasta», para que el control no prometa lo que el backend no hace. Es la diferencia con los nueve filtros de la otra pestaña, donde las tres columnas sí son `date` y el rango es inclusivo en los dos extremos.

### 3.6 Estados de la pantalla

**Listado** — las dos pestañas comparten los cinco:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de tabla, tantas filas como `pageSize` | — |
| Vacío sin filtros | Texto + **la frase del alcance geográfico** + botón «Registrar un caso» | `esaviCase.list.empty` |
| Vacío con filtros | Texto + botón «Limpiar filtros», que borra los filtros y **conserva `tab` y `pageSize`** | `esaviCase.list.emptyFiltered` |
| Error | Mensaje resuelto por `code` + botón reintentar | `esaviCase.list.error` |
| Sin permiso | No se llega: `<RequireRole level={USER}>` redirige y el `NavItem` no se pinta para `ANALYTICS` | — |

**El vacío sin filtros nombra el alcance** (§1C). Texto: *«No hay casos a tu alcance. Si crees que deberías ver casos aquí, es posible que tu cobertura geográfica no esté asignada — pídeselo a un administrador.»* No es una hipótesis decorativa: con el SPEC F49, un usuario sin filas vigentes en `appUserGeoLocation` recibe exactamente esta respuesta y **no hay ninguna señal en la API que la distinga de «no hay datos»** (F49 §84, §108). La frase es la única forma que tiene el usuario de saber que existe esa posibilidad.

**Detalle** — cuatro:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de la cabecera y de las dos tarjetas | — |
| No encontrado (`404` del `003`) | Pantalla neutra + botón «Volver al listado» | `esaviCase.detail.notFound` |
| Error | Mensaje por `code` + reintentar | `esaviCase.detail.error` |
| Expediente cerrado | El resumen se pinta igual; «Abrir expediente» entra en **sólo lectura** y lo dice | `esaviCase.detail.closed` |

**La pantalla de no encontrado dice más de lo que el `404` distingue, a propósito.** Texto: *«Este caso no existe o está fuera de tu alcance. Si necesitas acceder a él, pide a un administrador que revise tu cobertura geográfica.»* El backend devuelve la misma respuesta byte a byte en los dos casos y sólo el log los separa (F49 §122), así que la pantalla **no finge distinguirlos**. Pero las dos situaciones tienen salidas distintas para el usuario —una no tiene ninguna, la otra es una gestión de cinco minutos con un ADMIN—, y callarse la segunda convierte un problema resoluble en un callejón sin salida.

**El estado del expediente en el detalle tiene su propia carga.** `useCaseWorkflow(caseId)` es una segunda consulta: mientras responde, el bloque de estado muestra su skeleton y **«Abrir expediente» permanece deshabilitado**. Si falla, el botón se habilita hacia `/esavi-cases/:id/wizard` sin etiqueta de estado — el wizard vuelve a pedir el workflow y resuelve él la reanudación (FE08 §3.2). Un fallo al leer el estado no puede bloquear el acceso al expediente.

### 3.7 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`, con el colapso que `<ResourceTable>` ya implementa (`ARCHITECTURE.md` §8). Los tres campos que sobreviven:
  - **Por caso:** `caseCode`, `reportDate` y **el paciente**. La unidad de salud queda en el detalle.
  - **Bandeja:** `caseCode`, `status.name` y `openedAt`. El progreso de etapas queda fuera: son cuatro marcas que no se leen en una tarjeta.
- **Los filtros colapsan en un `Sheet` inferior** por debajo de `md`, con **contador de filtros activos** en el botón que lo abre, derivado de `searchParams`. Por encima de `md` la barra es fija y el panel de fechas es un plegable dentro de ella.
- **Las pestañas son `tabs` de shadcn** (Radix): rol `tablist`, flechas izquierda/derecha para moverse, y cambiar de pestaña **reemplaza** la entrada del historial en vez de apilarla — el botón de atrás vuelve a la pantalla anterior, no a la otra pestaña.
- **El segmentado *Exacta · Rango* es un `radiogroup`**, no dos botones. Tiene etiqueta accesible por columna («Modo del filtro de fecha de reporte») y se recorre con las flechas; cambiar de opción mueve el foco al primer campo de fecha que aparece.
- **La cápsula de paciente** tiene nombre accesible en su X: «Quitar el filtro de paciente», no «Cerrar».
- **`<DateField>` se apoya en `<input type="date">`** para el teclado y en `calendar` + `popover` para el ratón, no al revés: se teclea `2026-03-01` sin abrir nada. Formato `YYYY-MM-DD` en el valor; la presentación la decide el idioma activo.
- **El toggle de inactivos y el menú de fila** sólo se pintan con el rol que los puede usar (`useCan`), y `<ResourceTable>` ya lo resuelve.

---

## 4. Plan de implementación

Catorce pasos. Los cinco primeros son de contrato y de primitivas: ninguna pantalla se escribe hasta que la fábrica devuelve el tipo correcto.

1. **Los tres componentes de shadcn que faltan.** `npx shadcn@latest add tabs calendar popover`.
   *Verificación:* `npm run check` pasa con los tres importados en un archivo de prueba; los tokens de color de los tres son semánticos y ninguno introduce un literal (`CONVENTIONS.md` §14).

2. **`contracts/declared/esaviCase.ts` — `EsaviCaseListRow`.** Con el comentario de origen: `esaviCase.service.ts`, `LIST_ATTRIBUTES` + `toEsaviCaseListRow`, forma declarada en el SPEC F48 §3.9. No deriva de `EsaviCaseDetail` (§3.3).
   *Verificación:* `healthFacility.geoLocation` es `| null`; `patient` **no** tiene `documentNumber`; ningún campo del detalle se cuela.

3. **`contracts/declared/caseWorkflow.ts` — `CaseWorkflowListRow` y la reconciliación.** El tipo completo del mapper compartido, con `caseCode: string | null` y los seis campos que FE08 declaró de menos; `CaseWorkflowDetail` pasa a ser alias de `CaseWorkflowListRow`.
   *Verificación:* `CaseWizardHeader`, `CaseWizardStepper` y `useCaseWorkflow` siguen compilando sin cambios — el tipo creció, no se estrechó. `npm test` de `features/caseWorkflow` y de `features/esaviCase` en verde sin tocar sus pruebas.

4. **`createResource` — el cuarto parámetro `TListRow = T`.** `useList` y `useListByParent` devuelven `PaginatedResponse<TListRow>`.
   *Verificación:* las cinco declaraciones existentes —`catalogItem`, `catalogType`, `geoLevelType`, `geoLocation`, `healthFacility`— compilan **sin editarlas**; `createResource.test.tsx` pasa sin cambios; un `createResource<A,…,B>` de prueba tipa las filas como `B` y el `useOne` como `A`.

5. **`features/esaviCase/api.ts` — el cuarto argumento.** `createResource<EsaviCaseDetail, CreateEsaviCaseInput, Partial<CreateEsaviCaseInput>, EsaviCaseListRow>`. Los códigos `ESAVI-CASE-002A/002B/003/005A/005B` ya están citados en la cabecera del archivo; se añade la línea del `TListRow`.
   *Verificación:* `row.appDetails` **no compila** sobre una fila del listado; `useOne(...).data.appDetails` sí. `CaseWizardHeader` sigue en verde.

6. **`features/caseWorkflow/api.ts` — `useCaseWorkflowList`.** A mano, como los otros dos hooks del archivo y por la misma razón ya escrita ahí. Clave `['caseWorkflow','list',{limit,offset,includeInactive,filters}]`, `002A`/`002B` elegido por `useCan(ADMIN)` + toggle, códigos citados.
   *Verificación:* con rol `USER` y `includeInactive=true` en la URL, la petición sale contra `/case-workflows` y **no** contra `/case-workflows/admin`; los tres filtros viajan como query params; la clave cambia cuando cambia cualquiera de ellos.

7. **`shared/components/DateField.tsx`.** La primitiva de `ARCHITECTURE.md` §4.3: valor `YYYY-MM-DD`, `<input type="date">` para el teclado, `calendar` + `popover` para el ratón, y **la regla temporal por parámetro** — `allowFuture`, aquí siempre `true` (F48 §3.7).
   *Verificación:* teclear `2026-03-01` fija el valor sin abrir el calendario; con `allowFuture: false` una fecha futura se rechaza y con `true` se acepta; el valor emitido nunca lleva hora ni zona; navegable sólo con teclado.

8. **`shared/components/CatalogSelect.tsx`.** `typeCode` → `catalogType` → `catalogItem`, los dos saltos que hoy están escritos a mano en `HealthFacilityListPage.tsx:117-131`. `staleTime` largo: es un catálogo. Se declaran `ESAVI-CATTYPE-002A` y `ESAVI-CATITEM-002A` en el archivo.
   *Verificación:* `<CatalogSelect typeCode="caseWorkflowStatus">` pinta los estados del flujo; dos instancias con el mismo `typeCode` comparten entrada de caché y hacen **una** petición por salto; un `typeCode` inexistente deja el selector vacío y deshabilitado, sin romper la pantalla. **FE06 no se migra en este spec** — queda anotado en §8.

9. **`features/esaviCase/schemas.ts`.** `esaviCaseFiltersSchema` y `caseWorkflowFiltersSchema`: parsean `searchParams` y descartan lo inválido; la única regla activa es `From ≤ To`, tres veces.
   *Verificación:* `?reportDate=ayer&patientId=abc&page=-3` produce un objeto de filtros vacío y `page: 1`, sin lanzar; `?reportDateFrom=2026-03-05&reportDateTo=2026-03-01` marca error y **no** produce petición; `?code=a` (un carácter) se descarta y `?code=ab` se conserva.

10. **`features/esaviCase/EsaviCaseFilters.tsx`.** Los catorce controles: `code` con debounce, `<GeoLocationPicker>`, unidad de salud, la cápsula de paciente, y los tres segmentados con sus `<DateField>` dentro del plegable.
    *Verificación:* cambiar de *Exacta* a *Rango* borra el parámetro exacto de la URL en la **misma** navegación; el contador de filtros activos coincide con el número de parámetros de filtro presentes; el botón atrás del navegador restaura el modo correcto de las tres columnas.

11. **`features/esaviCase/EsaviCaseListPage.tsx`.** Las dos pestañas con `?tab=`, `<ResourceTable>` sobre `useList`, el menú de fila —«Ver detalle», «Abrir expediente», «Ver casos de este paciente», desactivar, reactivar—, el toggle de inactivos y los cinco estados de §3.6.
    *Verificación:* los catorce filtros viajan al `002A`; con `includeInactive` y rol ADMIN la petición va a `/esavi-cases/admin`; el vacío sin filtros muestra la frase del alcance y el vacío con filtros el botón de limpiar; `isRowInactive` tiñe la fila inactiva (`CONVENTIONS.md` §10.1); cambiar de pestaña **reemplaza** la entrada del historial.

12. **`features/esaviCase/CaseWorkflowInbox.tsx`.** Tabla de la bandeja: `caseCode`, `status.name`, `openedAt` y el progreso derivado de `stages` — cuántas de las cuatro etapas tienen `endedAt`. Filtros `statusCode` (`<CatalogSelect>`), `openedFrom` y `openedTo`, este último etiquetado «abiertos antes de» (§3.5).
    *Verificación:* `caseCode: null` se pinta como ausencia, no como cadena vacía ni como error; un `statusCode` inexistente en la URL produce `CASEFLOW_002_STATUS_NOT_FOUND`, se limpia el filtro y se avisa en línea **sin** pantalla de error; la fila enlaza a `/esavi-cases/:caseId`.

13. **`features/esaviCase/EsaviCaseDetailPage.tsx` y `EsaviCaseNotFound.tsx`.** Resumen del `003`, bloque de estado del `006` con su propio skeleton, `<AuditTrail>` bajo `useCan(SUPERADMIN)`, «Abrir expediente» etiquetado por estado, y la pantalla neutra del `404`.
    *Verificación:* un `404` del `003` muestra la pantalla neutra con su salida y **no** el estado de error genérico; mientras el `006` carga, «Abrir expediente» está deshabilitado; si el `006` falla, el botón se habilita igual y navega al wizard; con `CLOSED` el botón dice «Ver expediente (sólo lectura)»; un `USER` no ve `<AuditTrail>`.

14. **Router, menú, códigos y los tres idiomas.** `/esavi-cases` y `/esavi-cases/:id` bajo `<RequireRole level={USER}>`, con `new` declarado **antes** de `:id`; `nav.items.caseBrowse` pierde `disabled: true`; `CASEFLOW_002_STATUS_NOT_FOUND` y los códigos de `005A`/`005B` en `errorMessages.ts`; las claves `esaviCase.list.*`, `esaviCase.detail.*`, `caseWorkflow.list.*` y `common.*` nuevas en `es.json`, `en.json` y `nl.json`.
    *Verificación:* `/esavi-cases/new` sigue abriendo `NewCasePage` y no el detalle con `id="new"` — prueba explícita en `router.esaviCase.test.tsx`; un `ANALYTICS` no ve la entrada del menú y es redirigido si teclea la ruta; **ninguna clave i18n falta en ninguno de los tres archivos** y no queda un solo texto literal visible.

---

## 5. Criterios de aceptación

**Listado, pestaña «Por caso»**

- [ ] `/esavi-cases` abre con `tab=cases` sin que el parámetro esté en la URL, y `?tab=basura` se comporta igual que su ausencia, **sin redirigir**.
- [ ] Los catorce filtros viajan al `002A` como query params y **los catorce están en `searchParams`**: copiar la URL y abrirla en otra pestaña reproduce la misma tabla.
- [ ] `?code=ab` filtra; `?code=a` se descarta sin petición; teclear no dispara una petición por carácter (debounce 400 ms).
- [ ] `?geoLocationId=<provincia>` devuelve los casos de sus cantones y parroquias, no sólo los de la provincia — es jerárquico en el servidor y el cliente no lo replica.
- [ ] `?geoLocationId=<territorio ajeno>` responde página vacía, **nunca un error de permiso**.
- [ ] Con rol ADMIN y el toggle puesto, la petición sale a `/esavi-cases/admin`; con rol USER y `?includeInactive=true` en la URL, sale a `/esavi-cases`.
- [ ] La fila inactiva lleva badge **y** el tinte `bg-destructive/5` vía `isRowInactive`.
- [ ] Desactivar una fila refresca listado y detalle a la vez, sin recargar la página.
- [ ] «Ver casos de este paciente» navega a `/esavi-cases?patientId=<id>` y la cápsula muestra el nombre del paciente; su X lo quita y deja el resto de filtros intactos.
- [ ] No existe ninguna acción que dispare `ESAVI-CASE-004`: `grep -rn "esaviCaseResource.useUpdate" src/features/esaviCase/` no devuelve nada fuera del wizard.

**Los tres segmentados de fecha**

- [ ] **No hay ninguna secuencia de clics que produzca un `400`** por combinar exacta y rango sobre la misma columna: cambiar de modo borra los parámetros del modo abandonado en la misma escritura de la URL.
- [ ] `From` posterior a `To` muestra el error en línea y **no** produce petición.
- [ ] `?reportDate=2026-03-01&eventDateFrom=2026-02-01` es aceptada por la pantalla: la exclusión es por columna, no global.
- [ ] Llegar con `?reportDateFrom=…` en la URL abre esa columna en modo *Rango*; el botón atrás devuelve el control al modo que corresponde al estado anterior de la URL.
- [ ] Una fecha futura en cualquiera de los nueve filtros se acepta: los filtros no heredan «no futura».

**Listado, pestaña «Bandeja por estado»**

- [ ] `?tab=workflow&statusCode=IN_INVESTIGATION` lista sólo los expedientes en ese estado.
- [ ] Un `statusCode` inexistente produce `CASEFLOW_002_STATUS_NOT_FOUND`, se limpia el filtro y se avisa junto al selector — **la tabla no se sustituye por una pantalla de error**.
- [ ] `caseCode: null` se pinta como ausencia explícita, nunca como cadena vacía y nunca como error.
- [ ] El campo de límite superior se etiqueta «abiertos antes de», y su comportamiento coincide con lo que hace el backend sobre un `timestamp`.
- [ ] El progreso muestra cuántas de las cuatro etapas tienen `endedAt`, leído de `stages` y no de otra petición.

**Detalle**

- [ ] `/esavi-cases/new` abre `NewCasePage`, no el detalle.
- [ ] Un `404` del `003` muestra la pantalla neutra con su salida hacia el listado, y su texto menciona la posibilidad de pedir cobertura a un administrador.
- [ ] «Abrir expediente» está deshabilitado mientras el `006` carga, **se habilita igual si el `006` falla**, y con `CLOSED` anuncia el modo de sólo lectura.
- [ ] `<AuditTrail>` sólo lo ve `SUPERADMIN`.
- [ ] Ningún campo del `003` se copia a `useState` ni a un store.

**Contrato, primitivas y cierre**

- [ ] `EsaviCaseListRow` y `CaseWorkflowListRow` reflejan la respuesta real, verificada contra `esaviCase.service.ts` y `caseWorkflow.service.ts`. **Ningún campo inventado.**
- [ ] `row.appDetails` no compila sobre una fila del listado.
- [ ] Las cinco declaraciones de `createResource` existentes compilan sin ser editadas.
- [ ] `<DateField>` y `<CatalogSelect>` viven en `shared/components/` y **no** tienen copia dentro de `features/`.
- [ ] `grep -rn "catalogTypeResource.useList" src/features/` devuelve **sólo** `HealthFacilityListPage.tsx`, la copia preexistente que §8 deja anotada — no una segunda.

**Cierre (`CONVENTIONS.md` §14)**

- [ ] Se cargaron `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` antes de generar la interfaz (§10.6).
- [ ] Los seis artefactos de la entidad están, y las claves i18n en **los tres** idiomas.
- [ ] El `minLevel` del `NavItem` y el `level` de los dos `<RequireRole>` son `USER`, el rol mínimo real de `API-ROUTES.md:89` y `:91`.
- [ ] Los códigos `ESAVI-CASE-002A/002B/003/005A/005B`, `ESAVI-CASEFLOW-002A/002B/006`, `ESAVI-CATTYPE-002A` y `ESAVI-CATITEM-002A` aparecen citados donde se consumen.
- [ ] Ningún color literal, ningún texto literal visible, ningún `any` en el límite con la API.
- [ ] Ningún `response.data.data`, ningún `axios` fuera de `client.ts`, ningún `localStorage` de tokens fuera de `TokenStore`.
- [ ] Los filtros van en `searchParams`; nada remoto copiado a `useState` o a un store.
- [ ] Probado por debajo de `md`: las dos tablas colapsan a tarjetas —paciente en una, estado en la otra— y el body no hace scroll horizontal.
- [ ] Probado en tema oscuro.
- [ ] Probado con `USER` y con `ANALYTICS`, no sólo con `SUPERADMIN`.
- [ ] `npm run check` pasa.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** dos pestañas en vez de un filtro de estado en el listado de casos. `CASE-PROCESS.md` §9 pide el filtro, el SPEC F48 lo excluye del backend y `ESAVI-CASE-002A` no lo acepta. Se entrega contra el endpoint que sí lo sirve —`CASEFLOW-002A`, con `statusCode`— en vez de inventarlo sobre el que no. Coste asumido: dos tablas con contratos distintos y filtros que no se traducen entre ellas.

- **No:** enriquecer cada fila del listado con su workflow llamando a `CASEFLOW-006` por caso. Diez peticiones por página para pintar una columna. Se descartó al proponerla y se deja escrito para que no vuelva.

- **No:** resolver el `caseCode` de la bandeja con un `useOne` por fila. Misma aritmética, dirección contraria. **Dejó de hacer falta durante la redacción de este spec:** `toCaseWorkflowResponse` ahora emite `caseCode` al primer nivel, del mismo `include` que ya resolvía las etapas, así que la bandeja lo tiene sin ninguna consulta extra. El spec se escribió con la forma antigua verificada, se detectó la ausencia antes de declarar el tipo y el backend la cubrió.

- **Sí:** el cuarto parámetro `TListRow = T` en `createResource`, con valor por defecto. La alternativa era declarar `esaviCaseResource` sobre la fila del listado y castear el detalle, o al revés — en los dos casos, un `as` en el límite con la API, que es justo lo que `CONVENTIONS.md` prohíbe. El defecto hace que las cinco declaraciones existentes no se toquen.

- **Sí:** adelantar `<DateField>` desde FE10. Nueve entradas de fecha en esta pantalla, y `ARCHITECTURE.md` §4.3 ya la declara primitiva con la regla temporal por parámetro. Escribirla aquí para filtros y allí para el expediente sería escribirla dos veces, que es lo que §4.3 prohíbe explícitamente.

- **Sí:** adelantar también `<CatalogSelect>`. FE06 ya tiene la resolución de dos saltos escrita a mano; una segunda copia la habría convertido en patrón en vez de en deuda.

- **Sí:** el modo *Exacta · Rango* es derivado de la URL, con un `useState` que sólo gobierna cuando no hay ningún parámetro que pueda contradecirlo. Guardar el modo en `searchParams` habría añadido tres parámetros que no son filtros y que pueden contradecir a los que sí lo son. Ponerlo entero en `useState` habría roto el botón de atrás.

- **Sí:** el segmentado en vez de cuatro reglas de validación. La combinación que el backend rechaza con `400` deja de ser un error que el usuario tiene que leer y pasa a ser un estado que no existe. Queda una regla, `From ≤ To`, que sí necesita mensaje porque sí es un error de captura.

- **Sí:** nombrar el alcance geográfico en el estado vacío. La API no distingue «no hay casos» de «no tienes cobertura asignada» y no debe hacerlo (F49 §108). La pantalla no inventa la distinción: menciona la posibilidad. Sin esa frase, el primer día de un usuario nuevo es una pantalla vacía sin explicación.

- **Sí:** una sola pantalla de no encontrado, con el texto que apunta al administrador. Dos pantallas habrían fingido una distinción que el cliente no puede hacer; el texto seco «No encontrado» habría convertido en callejón sin salida una gestión de cinco minutos.

- **No:** replicar el alcance geográfico en el cliente. `useCan()` oculta lo que el usuario no puede hacer, pero el alcance territorial no es un nivel de rol: es una consulta contra `appUserGeoLocation` que sólo el backend puede resolver. El cliente manda filtros y pinta lo que vuelve.

- **No:** ordenación por columna. `LIST_ORDER` es fijo en los dos servicios y el SPEC F48 declara que cambiarlo altera la paginación de los clientes existentes. Cabeceras ordenables que no ordenan es peor que no tenerlas.

- **No:** exponer `ESAVI-CASE-004` desde el listado o el detalle. Editar un caso es entrar al wizard. Dos puertas sobre la misma fila, con dos validaciones distintas, es el bug que después nadie reproduce.

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| La bandeja y el listado son dos tablas con contratos distintos bajo una misma pantalla. Un usuario puede filtrar en una, cambiar de pestaña y creer que sus filtros siguen puestos | Cada pestaña ignora los parámetros de la otra **y** el contador de filtros activos se calcula sobre los suyos. Los parámetros de la pestaña inactiva permanecen en la URL para que volver los recupere |
| `caseCode` en la bandeja es `string \| null` porque depende de un `include`. Un cambio futuro en `DETAIL_INCLUDE` del backend lo dejaría `null` en todas las filas sin ningún error | La columna pinta ausencia y no rompe; el criterio de aceptación lo fija. La causa quedaría visible en una tabla entera sin códigos, no escondida en un `catch` |
| `EsaviCaseListRow` y `CaseWorkflowListRow` son tipos escritos a mano contra literales del backend: `contracts:sync` no los protege | El comentario de origen de cada uno nombra archivo y función. Es la misma exposición que FE08 aceptó para `EsaviCaseDetail`, y §8 la deja anotada como deuda común, no como problema de este spec |
| El cuarto parámetro de `createResource` toca el artefacto de FE02, del que cuelgan cinco entidades | Valor por defecto `T`: las cinco declaraciones no se editan, y el paso 4 del plan lo verifica antes de que ninguna pantalla dependa del cambio |
| `openedTo` compara contra un `timestamp` y excluye el día indicado, a diferencia de los nueve filtros de la otra pestaña | La etiqueta dice «abiertos antes de» en vez de «hasta». Se prefirió declarar el comportamiento real a corregirlo en el cliente sumando un día, que habría escondido la asimetría |

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `shared/api/createResource.ts` | Cuarto parámetro de tipo `TListRow = T`. **Sin cambios de comportamiento**: las cinco entidades existentes no se editan |
| `contracts/declared/caseWorkflow.ts` | `CaseWorkflowDetail` pasa a ser alias de `CaseWorkflowListRow` y gana `caseCode` y los seis campos que FE08 declaró de menos. El tipo crece; nada que hoy compile deja de compilar |
| `features/esaviCase/api.ts` | Gana el cuarto argumento de tipo. La declaración que FE08 dejó «cerrada» se extiende, como ese spec previó |
| `shared/config/navigation.ts:57-63` | `nav.items.caseBrowse` pierde `disabled: true` |
| `app/router.tsx` | Dos rutas nuevas. `/esavi-cases/new` se declara antes que `/esavi-cases/:id` |
| `features/healthFacility/HealthFacilityListPage.tsx:117-131` | **No se toca en este spec.** Queda con su resolución de catálogo a mano, ahora duplicada por `<CatalogSelect>`. Migrarla es una línea y un spec de limpieza; hacerlo aquí ampliaría el alcance a una pantalla que este spec no construye |

---

## Lo que **no** está en este spec

- La edición del caso (`ESAVI-CASE-004`) — **FE10**, paso 2 del wizard.
- Los seis formularios del expediente — **FE10** a **FE14**.
- Cerrar, reabrir y validar un expediente (`CASEFLOW-008`–`011`) — **FE14**.
- Un filtro de estado del workflow dentro del listado de casos. **Dependencia del backend**: un spec que añada `workflowStatusCode` a `ESAVI-CASE-002A`/`002B`. Hasta entonces, la bandeja.
- La pantalla de pacientes (`nav.items.patient`, hoy `disabled: true`) y el filtro por geografía de residencia del paciente.
- Exportación a CSV o Excel, agregados, conteos por territorio y series temporales. No hay endpoint.
- Ordenación por columna y selección múltiple.
- La migración de `HealthFacilityListPage` a `<CatalogSelect>`.

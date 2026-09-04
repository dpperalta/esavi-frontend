# SPEC FE10 — Paciente y apertura del caso

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell y autenticación), SPEC FE02 (fábrica de recursos y primitivas), SPEC FE08 (armazón del wizard: `steps.ts`, `CaseWizardPage`, `CaseWizardStepper`, `NewCasePage`), SPEC FE09 (listado y detalle, `<DateField>`, `<CatalogSelect>`), **SPEC F05 del backend** (`patient`), **SPEC F07** (`notifier`), **SPEC F45** (búsqueda de paciente por nombre), **SPEC F11** (`patientId` inmutable en `ESAVI-CASE-004`), **SPEC F49** (alcance geográfico), **SPEC F43** (precedencia `systemConfig` sobre entorno)
> **Fecha:** 2026-09-03
> **Objetivo:** Los dos pasos que ocurren antes de que el caso exista: elegir o crear al paciente, y abrir el expediente con su unidad de salud y sus notificadores.

---

## 1. Por qué existe este spec

Es el tercero de los siete specs que implementan `references/CASE-PROCESS.md` (§9 de ese documento), y el primero que escribe datos del expediente. Va aquí porque **los pasos 1 y 2 son los únicos que ocurren sin `caseId`**: todo lo que sigue —FE11 a FE14— entra por una URL que ya lo lleva, y esa URL no existe hasta que este spec la produce.

**A — «Registrar» está en el menú desde FE08 y no registra nada.** `NewCasePage.tsx:30` navega al wizard con `'00000000-0000-0000-0000-000000000000'`, un UUID de ceros puesto como banco de pruebas del punto de navegación. La entrada del menú es real, el rol es real y la pantalla a la que lleva es un recuadro punteado con un botón que miente. Es el único placeholder declarado que queda del armazón.

**B — No existe `features/patient/`, y sin paciente no hay `POST` posible.** `ESAVI-CASE-001` exige `patientId` y `healthFacilityId`, y son los dos únicos obligatorios del caso. El paciente no se elige de un desplegable: sus columnas personales están cifradas una a una, así que **no hay búsqueda parcial** —`006` es coincidencia exacta y `007` exige tokens completos del nombre (`CASE-PROCESS.md` §5.1)— y el paso 1 es un formulario de búsqueda explícito, no un autocompletado.

**C — El selector de unidad de salud ofrece exactamente lo que el `POST` va a rechazar.** `ESAVI-HFAC-006` no filtra por alcance geográfico; `ESAVI-CASE-001` sí lo valida y responde `404 CASE_001_FACILITY_OUT_OF_SCOPE`. Es decir: la lista muestra la tabla nacional entera y el error dice «no encontrada» sobre una unidad que el usuario está viendo. El hueco lo cierra el cliente con `ESAVI-USERGEO-008`, y no hay otra forma de cerrarlo (`CASE-PROCESS.md` §5.2).

**D — La cobertura vacía es una trampa silenciosa, y no es un error del wizard.** `resolveUserGeoScopeIds` devuelve `null` —sin restricción— para ADMIN y superiores, pero `[]` para un `USER` sin filas vigentes en `appUserGeoLocation`. Con `[]`, **toda** unidad queda fuera de alcance: ese usuario no puede abrir ningún caso y lee «unidad de salud no encontrada» pruebe la que pruebe. Es un problema de alta de usuarios que sólo esta pantalla puede nombrar, y tiene que detectarlo al entrar al paso, no al fallar el `POST`.

**E — `<EntitySearchSelect>` no existe y ya tiene una copia.** `CASE-PROCESS.md` §9 se la asigna a este spec, y FE09 tuvo que escribir el buscador de unidad de salud a mano mientras tanto: `EsaviCaseFilters.tsx:144` lo declara textualmente *«Ad-hoc stand-in for `<EntitySearchSelect>` (not built until FE10)»*. La primitiva nace aquí y ese provisional se sustituye en este mismo spec, antes de que la copia se convierta en patrón (`CONVENTIONS.md` §10.4).

**F — La irreversibilidad del paso 2 no está dicha en ninguna parte.** `ESAVI-CASE-004` hizo `patientId` inmutable (SPEC F11 §3.1): el `004` ni lo lee, y un caso abierto contra la persona equivocada **no tiene arreglo desde el wizard** — la salida es desactivar el caso con `ESAVI-CASE-005A`, que exige ADMIN. El aviso tiene que estar **antes** del `POST`, que es donde deja de ser reversible.

---

## 2. Alcance

**Dentro:**

- **La ruta del alta, con sus dos pasos en la URL** — `/esavi-cases/new/:step?` con `patient` y `case-opening`, bajo `<RequireRole level={USER}>`, el rol mínimo real de `ESAVI-PATIENT-001` y `ESAVI-CASE-001` (`API-ROUTES.md:505`, `:88`). El paciente elegido viaja en `?patientId=` para sobrevivir a una recarga; sin `:step`, la ruta resuelve `patient`.
- **La reentrada a los dos pasos desde el wizard** — `steps.ts` deja de marcarlos inalcanzables, y `CaseWizardPage` y `CaseWizardStepper` los aceptan como destino. Son artefactos de FE08 y este spec los modifica (§8).
- **Paso 1 — Paciente.** Búsqueda por identificador (`006`, que cubre `documentNumber`, `passportNumber` **y** `healthSystemCode`) y por nombre (`007`, con su `inactiveCount`), en un solo campo con selector de modo; alta inline (`001`); edición en modal (`004`); casilla **«sin documento»** que genera `PROV-YYYYMMDD-XXXX` en el cliente; y el `409` de documento duplicado tratado **como hallazgo, no como error**, con su doble camino.
- **Paso 2 — Apertura del caso.** Formulario del caso (`001` al abrir, `004` en reentrada), selector de unidad de salud filtrado por cobertura, bloqueo declarado cuando la cobertura está vacía, y la lista de notificadores con su modal (`NOTIFIER-001`, `-002A`, `-004`; el borrado `005A` oculto con `useCan(ADMIN)` hasta que baje el rol).
- **`countryIsoCode` resuelto por configuración**, nunca preguntado: `ESAVI-SYSCONF-006` sobre `ESAVI_APP_COUNTRY_ISO_CODE`, con `VITE_ESAVI_APP_COUNTRY_ISO_CODE` de respaldo — las dos variables ya existen en `.env.example` y `.env.development` y este spec sólo las consume.
- **`<EntitySearchSelect>` en `shared/components/`** — la primitiva de `ARCHITECTURE.md` §4.3 que `CASE-PROCESS.md` §9 asigna a este spec. **Y la sustitución del provisional de FE09** (`EsaviCaseFilters.tsx:144`) por ella, en este mismo spec.
- **Dos features nuevas** — `features/patient/` y `features/notifier/`, cada una con su `createResource` y sus `schemas.ts`; más los dos hooks de búsqueda a mano (`006` y `007`), que la fábrica no cubre.
- **Dos entradas nuevas en `contracts:sync`** (`patient.types.ts`, `notifier.types.ts`) y las respuestas declaradas a mano en `contracts/declared/`, que el backend construye como literales.
- **La barra de acciones de estos dos pasos** — *Continuar* en el paso 1; *Crear caso* al abrir y *Guardar · Siguiente* en reentrada en el paso 2. **Sin «Completar etapa» en ninguno de los dos**: no tienen `stage` y `ESAVI-CASEFLOW-007` no los admite.
- **Las claves `patient.*`, `notifier.*` y `caseWizard.steps.*` nuevas** en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **El paso 3 y los siguientes** — FE11 a FE14. Este spec termina en el `POST` del caso y en la redirección a `classification`.
- **Una pantalla de pacientes.** `ESAVI-PATIENT-002A`/`002B` no se consumen y `nav.items.patient` sigue `disabled: true`; al paciente se llega sólo desde el wizard.
- **`ESAVI-PATIENT-005A`/`005B` y `NOTIFIER-005B`/`005C`.** Desactivar, reactivar y purgar no se ofrecen desde aquí.
- **La fusión de pacientes duplicados.** El `409 PATIENT_004_DOCUMENT_EXISTS` sobre un `PROV-` es exactamente el caso «este provisional y aquel real son la misma persona», y **no hay endpoint que fusione**: la pantalla lo nombra y para ahí (`CASE-PROCESS.md` §5.1).
- **Cambiar de paciente con el caso ya creado.** No es una decisión de diseño: `ESAVI-CASE-004` ignora `patientId` (SPEC F11 §3.1). La pantalla avisa antes, no lo implementa después.
- **`draftsStore`.** Decidido en la ronda de preguntas: el paso 1 sobrevive en la URL y el paso 2 son ocho campos. El búfer se gana su sitio en FE12/FE13, con noventa campos por pantalla.
- **Crear la fila `systemConfig`** (`ESAVI-SYSCONF-001`, SUPERADMIN) y **bajar el rol de `ESAVI-NOTIFIER-005A`**. Son las dos dependencias del otro repositorio que `CASE-PROCESS.md` §10.1 y §10.2 dejan anotadas; este spec funciona sin ellas y lo dice.
- **Ordenación de resultados de búsqueda.** Los apellidos están cifrados: ordenar alfabéticamente es imposible y el backend devuelve por fecha, más reciente primero (§5.1). No se ofrecen cabeceras que no ordenan.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Alta · paso 1 | `/esavi-cases/new/patient` (y `/esavi-cases/new` sin `:step`) | `features/patient/PatientStep.tsx` | `<RequireRole level={USER}>` |
| Alta · paso 2 | `/esavi-cases/new/case-opening?patientId=` | `features/esaviCase/CaseOpeningStep.tsx` | `<RequireRole level={USER}>` |
| Reentrada · paso 1 | `/esavi-cases/:id/wizard/patient` | el mismo `PatientStep`, en modo reentrada | `<RequireRole level={USER}>` |
| Reentrada · paso 2 | `/esavi-cases/:id/wizard/case-opening` | el mismo `CaseOpeningStep`, en modo reentrada | `<RequireRole level={USER}>` |

**Los dos pasos tienen un solo componente cada uno, con dos modos, no cuatro pantallas.** La diferencia entre alta y reentrada es de dónde sale la identidad (`?patientId=` frente a `esaviCase.patient`) y qué escribe el botón (`POST` frente a `PUT`), no de qué campos se pintan. Duplicarlos garantizaría que las reglas de fecha se corrigieran en uno solo.

Piezas nuevas:

| Archivo | Qué es |
|---|---|
| `features/patient/api.ts` | `createResource` + los dos hooks de búsqueda a mano (`006`, `007`) |
| `features/patient/schemas.ts` | `createPatientSchema`, `updatePatientSchema`, `patientErrorFieldMap` |
| `features/patient/PatientStep.tsx` | El paso 1: búsqueda, resultados, alta inline, paciente elegido |
| `features/patient/PatientSearchPanel.tsx` | El campo único con selector de modo y su ayuda contextual |
| `features/patient/PatientForm.tsx` | El formulario de doce columnas, compartido por el alta inline y el modal de edición |
| `features/patient/PatientFormDialog.tsx` | El modal de edición (`004`), con el reset de mutaciones de `CONVENTIONS.md` §10.7 |
| `features/patient/provisionalDocument.ts` | El generador `PROV-YYYYMMDD-XXXX` y su alfabeto Crockford |
| `features/notifier/api.ts`, `schemas.ts` | La entidad `notifier` completa |
| `features/notifier/NotifierList.tsx`, `NotifierFormDialog.tsx` | El patrón canónico lista + modal, que nace aquí |
| `features/esaviCase/CaseOpeningStep.tsx` | El paso 2: caso, unidad de salud y notificadores |
| `features/esaviCase/ScopedHealthFacilitySelect.tsx` | `<EntitySearchSelect>` sobre `HFAC-006`, cruzado con la cobertura |
| `features/userGeoLocation/api.ts` | Sólo `useUserGeoCoverage` (`USERGEO-008`) |
| `shared/components/EntitySearchSelect.tsx` | La primitiva de `ARCHITECTURE.md` §4.3 |

**Una nota sobre `features/userGeoLocation/`:** `CONVENTIONS.md` §3 dice que una feature no importa de otra, y `features/esaviCase/` va a importar de ella. El repositorio ya resolvió esto igual dos veces —`EsaviCaseFilters` importa `useHealthFacilitySearch` de `features/healthFacility/`, y `shared/components/CatalogSelect` importa de `catalogItem` y `catalogType`—, así que **se sigue el precedente y no se inventa una tercera forma**: la entidad del backend tiene su carpeta, y quien la consume la importa. Lo que no se hace es copiar el hook.

**`NewCasePage.tsx` desaparece como página.** Su único contenido real era el punto de navegación tras crear el caso, y ese punto pasa a `CaseOpeningStep`. La ruta `/esavi-cases/new` sigue existiendo y sigue siendo la del menú.

### 3.2 Endpoints consumidos

Copiados textualmente de `references/API-ROUTES.md`:

```
POST   /api/patients                        ESAVI-PATIENT-001   USER   alta de paciente
GET    /api/patients/search/:id             ESAVI-PATIENT-006   USER   documento, pasaporte o healthSystemCode
GET    /api/patients/search-by-name?name=   ESAVI-PATIENT-007   USER   tokens completos del nombre
GET    /api/patients/:id                    ESAVI-PATIENT-003   USER   paciente elegido, en reentrada
PUT    /api/patients/:id                    ESAVI-PATIENT-004   USER   edición desde el wizard
POST   /api/esavi-cases                     ESAVI-CASE-001      USER   abre el expediente (+ caseWorkflow)
PUT    /api/esavi-cases/:id                 ESAVI-CASE-004      USER   edición del caso en reentrada
POST   /api/notifiers                       ESAVI-NOTIFIER-001  USER   añadir notificador
GET    /api/notifiers?caseId=               ESAVI-NOTIFIER-002A USER   la lista del caso
PUT    /api/notifiers/:id                   ESAVI-NOTIFIER-004  USER   editar notificador
DELETE /api/notifiers/:id                   ESAVI-NOTIFIER-005A ADMIN  quitar notificador (deuda §10.2)
GET    /api/health-facilities/search        ESAVI-HFAC-006      USER   selector de unidad de salud
GET    /api/user-geo-locations/user/:id/coverage  ESAVI-USERGEO-008  USER  cobertura del usuario
GET    /api/system-configs/code/:code       ESAVI-SYSCONF-006   USER   ESAVI_APP_COUNTRY_ISO_CODE
```

Más los que consumen por dentro las primitivas ya escritas: `ESAVI-CATTYPE-002` y `ESAVI-CATITEM-002A` (`<CatalogSelect>`, para `sexItemId` y `professionItemId`), y `ESAVI-GEOLOC-002` (`<GeoLocationPicker>`, para `residenceGeoLocationId` y el `geoLocationId` del notificador).

Lo que **no** se consume aquí y por qué:

- **`ESAVI-PATIENT-002A`/`002B`** — el listado de pacientes no tiene pantalla (§2). Al paciente se llega buscándolo, nunca paginando.
- **`ESAVI-CASEFLOW-007`** — «completar etapa» no aplica: los pasos 1 y 2 no tienen `stage` y el `PATCH` sólo admite los cuatro valores de `CaseWorkflowStage`.
- **`ESAVI-CASEFLOW-001`** — el `caseWorkflow` **nace solo**, dentro de la transacción de `ESAVI-CASE-001` (`CASE-PROCESS.md` §5.2). El cliente nunca lo crea.
- **`ESAVI-NOTIFIER-003`** — obtener un notificador por su PK. La lista `002A` ya trae la fila entera; el modal edita lo que la lista le pasa.

**Tres notas del contrato que gobiernan estas llamadas:**

**El `POST` del caso son dos escrituras, y la segunda puede fallar sola.** `notifier.caseId` es `NOT NULL`, así que el notificador no viaja en el cuerpo del caso: se encadena. El caso creado **no se deshace** si el notificador falla (§5.2) — se permanece en el paso, con el caso ya identificado y el notificador reintentable desde su lista.

**`toEsaviCaseResponse` elimina `patientId` y `healthFacilityId`** y devuelve en su lugar los objetos `patient` y `healthFacility` resueltos. El wizard lee de ahí, nunca de los ids que envió.

**`006` y `007` filtran por `isActive` salvo con rol suficiente, pero `007` cuenta los inactivos siempre.** `searchPatientsByNameService` calcula `inactiveCount` con cualquier rol, a propósito (SPEC F45 §3.3): sin ese número, un `USER` que no ve inactivos duplicaría al paciente en silencio.

### 3.3 Tipos del contrato

**Dos entradas nuevas en `contracts:sync`.** `scripts/syncContracts.mjs` gana `patient/patient.types.ts → patient.ts` y `notifier/notifier.types.ts → notifier.ts`. De ahí salen `CreatePatientInput`, `CreateNotifierInput` y `NotifierListFilters`, que ya existen en el backend y no se escriben aquí.

**Seis tipos declarados a mano en `contracts/declared/`.** Ninguno es espejo: los servicios construyen las respuestas como literales de retorno, y `contracts:sync` no los puede copiar. Cada uno lleva su comentario de origen — archivo y función — porque es lo único que los protege.

**`PatientListRow`** — origen `patient.service.ts`, `LIST_ATTRIBUTES` + `SEX_INCLUDE` + `LIST_RESIDENCE_INCLUDE` + `toPatientListRow`. La forma que devuelven `006` y `007`. La PII llega **descifrada**: `names`, `lastNames` y `documentNumber` son texto claro en la respuesta aunque estén cifrados en la columna.

```ts
patientId, names, lastNames, documentNumber: string | null, birthDate: string | null,
healthSystemCode: string | null, isActive,
sex: { catalogItemId, code, name, value: string | null } | null,
residence: { geoLocationId, name } | null
```

**`PatientDetail`** — origen `toPatientResponse` + `DETAIL_EXCLUDE` + `RESIDENCE_INCLUDE`. Lo que devuelven `001`, `003` y `004`. **No tiene `sexItemId`, `residenceGeoLocationId` ni `nameTokens`**: el servicio los borra y devuelve los objetos resueltos. Añade sobre la fila de listado `passportNumber`, `email`, `phoneNumber`, los tres sellos y `appDetails`, y su `residence` trae además `geoLevelTypeId` y `level`.

**`PatientNameSearchResponse`** — **`PaginatedResponse<T>` no le sirve.** `007` devuelve `{ count, inactiveCount, rows }`, con un tercer campo que ninguna otra respuesta del sistema tiene:

```ts
export interface PatientNameSearchResponse {
  count: number;
  inactiveCount: number;
  rows: PatientListRow[];
}
```

`006`, en cambio, sí es `PaginatedResponse<PatientListRow>` — no calcula inactivos.

**`NotifierListRow` y `NotifierDetail`** — origen `notifier.service.ts`, `LIST_ATTRIBUTES` + los tres includes, y `toNotifierResponse`. Con un detalle que la pantalla tiene que saber: **`toNotifierResponse` borra `caseId`** y devuelve `case: { caseId, caseCode, reportDate }`. Un notificador no lleva el id de su caso al primer nivel; quien lo necesite lo lee de `case.caseId`. `details` **no está en `LIST_ATTRIBUTES`**: la lista no lo trae y el modal lo tiene sólo tras el `PUT`, así que la lista no puede pintarlo.

**`UserGeoCoverage`** — origen `appUserGeoLocation.service.ts`, `resolveUserCoverageService`. **Tampoco es `{ count, rows }`**, y es el hallazgo que más afecta al paso 2:

```ts
export interface UserGeoCoverage {
  assigned: { geoLocationId: string; name: string; level: number }[];
  coverage: { geoLocationId: string; name: string; level: number; parentGeoLocationId: string | null }[];
  count: number;
}
```

`assigned` son las filas de `appUserGeoLocation`; `coverage` es la expansión recursiva completa **e incluye a las asignadas**. El filtro del selector cruza contra `coverage`, nunca contra `assigned`: quien tiene «Pichincha» asignada puede notificar en un hospital de un cantón, que está en `coverage` y no en `assigned`.

**`SystemConfigDetail`** — origen `systemConfig.service.ts`, `shapeSingleSystemConfig`. Se declara **completo**, no como el subconjunto que hace falta hoy: FE08 declaró `CaseWorkflowDetail` con seis campos de menos y FE09 tuvo que reconciliarlo (SPEC FE09 §3.3). `value` es `unknown` en el modelo y lo sigue siendo aquí — quién lo interpreta es `valueType`, y el cliente comprueba antes de leerlo como texto.

**Ningún tipo del contrato se redefine en una feature** (`CONVENTIONS.md` §9): `features/patient/schemas.ts` deriva su tipo de formulario de `CreatePatientInput`, no lo reescribe.

### 3.4 Contrato de estado

**Cuatro datos en la URL, siete claves de caché, cero datos del servidor en `useState` y cero en Zustand.**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Paso activo del alta | URL | `/esavi-cases/new/:step` — `patient` \| `case-opening` | Ausente = `patient`. Un valor desconocido se trata como `patient`, sin redirección — mismo criterio que el `?tab=` de FE09 |
| Paciente elegido durante el alta | URL | `?patientId=` | Es lo único que hay que reanudar tras un F5: sin él, el paso 2 no tiene qué enviar |
| Paso activo en reentrada | URL | `/esavi-cases/:id/wizard/:step` | Ya lo resuelve FE08; este spec sólo añade dos slugs válidos |
| Término y modo de búsqueda | **`useState`** | `identifier` \| `name` + el texto | **Excepción declarada de §7** — ver abajo |
| Resultados de `006` | TanStack Query | `['patient', 'searchByIdentifier', identifier]` | `enabled` sólo con identificador no vacío |
| Resultados de `007` | TanStack Query | `['patient', 'searchByName', name]` | `enabled` sólo con nombre no vacío; el mínimo real lo impone el backend |
| Paciente en reentrada | TanStack Query | `['patient', 'detail', patientId]` | `useOne` del recurso |
| Cobertura del usuario | TanStack Query | `['userGeoLocation', 'coverage', userId]` | `staleTime` alto |
| Código de país | TanStack Query | `['systemConfig', 'byCode', 'ESAVI_APP_COUNTRY_ISO_CODE']` | `staleTime` alto. El `404` cae al respaldo de entorno, no a un error |
| Búsqueda de unidad de salud | TanStack Query | `['healthFacility', 'search', { name, code, limit, offset }]` | `useHealthFacilitySearch` de FE06, reutilizado sin tocar |
| Caso en reentrada | TanStack Query | `['esaviCase', 'detail', caseId]` | `useOne`, ya existe |
| Notificadores del caso | TanStack Query | `['notifier', 'list', { limit, offset, includeInactive, filters }]` | `filters.caseId`; la clave la construye `createResource` |
| Lo tecleado en los cuatro formularios | React Hook Form | — | Nada en Zustand. Sin `draftsStore` (§2) |
| Casilla «sin documento» y el `PROV-` generado | Componente | `useState` | Efímero: el valor viaja en el `POST` y a partir de ahí es del servidor |
| Modal abierto (paciente, notificador) | Componente | `useState` | Guarda el id y la acción, nunca la fila |

**La excepción de §7, declarada y acotada.** La norma del repositorio es que los filtros viven en `searchParams`. Aquí **el término de búsqueda es un dato personal** —una cédula o un apellido— y la URL sobrevive en el historial, en el título de la pestaña, en una captura de pantalla y en cualquier registro que el navegador guarde. Se queda en `useState`. Lo que sí viaja en la URL es `?patientId=`, que es un UUID opaco y no identifica a nadie fuera del sistema. La consecuencia se asume entera: **recargar en mitad de una búsqueda la pierde**, y volver a teclearla es barato comparado con dejar documentos de identidad en el historial del navegador.

**Nada del servidor se copia.** El paciente elegido se lee de la caché por su `patientId`; los formularios de edición se inicializan desde la query y React Hook Form es el único dueño de lo tecleado — nunca un `useState` paralelo que se sincronice a mano.

**`staleTime`: dos altos, el resto ninguno.** Cobertura y código de país son configuración —cambian cuando un administrador los cambia, no durante un alta— y se cachean largo. **Las búsquedas de paciente no llevan `staleTime` a propósito**: entre dos búsquedas del mismo documento puede haberse creado el paciente que la primera no encontró, que es exactamente lo que pasa con dos personas capturando a la vez.

**Qué invalida qué.** `POST`/`PUT` de paciente invalidan `['patient']` entero; las tres mutaciones de notificador invalidan `['notifier']`; el `POST` del caso invalida `['esaviCase']`. **El `POST` del caso no invalida `['patient']`** — no lo toca, y hacerlo tiraría la búsqueda que el usuario acaba de resolver.

### 3.5 Formularios y validación

Cuatro formularios, todos React Hook Form + Zod, con los límites copiados de los validadores del backend — no de lo que parezca razonable.

**Paso 1 — Paciente** (`createPatientValidator` / `updatePatientValidator`):

| Campo | Widget | Obligatorio | Regla |
|---|---|---|---|
| `names` | `<Input>` | **Sí** | `trim`, 1–200 |
| `lastNames` | `<Input>` | **Sí** | `trim`, 1–200 |
| `documentNumber` | `<Input>` + casilla **«sin documento»** | **Sí** | `trim`, 1–100. **El DDL lo admite nulo y el validador lo exige** — el caso testigo de §5.0 |
| `passportNumber` | `<Input>` | No | ≤100 |
| `birthDate` | `<DateField allowFuture={false}>` | No | No futura |
| `email` | `<Input type="email">` | No | Email válido, ≤255 |
| `phoneNumber` | `<Input>` | No | ≤50 |
| `sexItemId` | `<CatalogSelect typeCode="sex">` | No | UUID de `catalogItem` |
| `residenceGeoLocationId` | `<GeoLocationPicker>` | No | UUID |
| `healthSystemCode` | — | **No se pregunta** | Lo genera el backend y descarta sin error lo que llegue con ese nombre (§8) |

**`<CatalogSelect>` necesita una prop, y es un cambio a una primitiva ya escrita.** FE09 la dejó emitiendo el **`code`** del ítem, porque su único consumidor era el filtro `statusCode` de la bandeja, que viaja por la URL. Aquí `sexItemId` y `professionItemId` son **`catalogItemId`**, que es lo que el validador exige. La salida correcta es la que manda `CONVENTIONS.md` §10.4 —una prop en la primitiva, nunca una copia—: `<CatalogSelect emit="id" | "code">`, con `code` por defecto para no tocar el consumidor de FE09. Queda declarado en §8.

**Paso 2 — Caso** (`createEsaviCaseValidator` / `updateEsaviCaseValidator`):

| Campo | Widget | Obligatorio | Regla |
|---|---|---|---|
| `patientId` | — | **Sí** | Del `?patientId=` o de `esaviCase.patient`. Nunca es un campo, y en el `004` **ni se envía**: es inmutable (SPEC F11 §3.1) |
| `healthFacilityId` | `<ScopedHealthFacilitySelect>` | **Sí** | UUID, filtrado por cobertura |
| `reportDate` | `<DateField allowFuture={false}>` | No | No futura. `DEFAULT current_date` en el DDL |
| `eventDate` | `<DateField allowFuture={false}>` | No | No futura **y ≤ `reportDate`** |
| `reportFillingDate` | `<DateField allowFuture={false}>` | No | No futura |
| `notificationOrganization` | `<Input>` | No | ≤250 |
| `details` | `<Textarea>` | No | Texto libre, sin límite |
| `countryIsoCode` | — | **No se pregunta** | `systemConfig`, con respaldo de entorno |

**Paso 2 — Notificador**, en modal (`createNotifierValidator`):

| Campo | Widget | Obligatorio | Regla |
|---|---|---|---|
| `firstName` | `<Input>` | **Sí** | `trim`, **2**–150 |
| `lastName` | `<Input>` | **Sí** | `trim`, **2**–150. Segundo caso de validador ≠ DDL |
| `professionItemId` | `<CatalogSelect typeCode="profession" emit="id">` | No | UUID |
| `geoLocationId` | `<GeoLocationPicker>` | No | UUID |
| `room` | `<Input>` | No | ≤50 |
| `address` | `<Input>` | No | ≤250 |
| `phoneNumber` | `<Input>` | No | ≤50 |
| `email` | `<Input type="email">` | No | Email válido, **sin máximo declarado** |
| `details` | `<Textarea>` | No | Texto libre |
| `caseId` | — | **Sí al crear** | Del contexto. En el `004` **no se envía**: el servicio lo ignora y el validador ni lo declara |

**Las dos reglas cruzadas, y por qué no basta con el orden de los campos:**

1. **`eventDate ≤ reportDate`** — comparación lexicográfica sobre `YYYY-MM-DD`, igual que el backend, sin construir ningún `Date`. Va en el schema con `.superRefine()`, marcada sobre `eventDate`.
2. **Cuando `reportDate` no viaja en el cuerpo, el servicio compara contra el valor almacenado.** En reentrada el formulario puede enviar `eventDate` sin tocar `reportDate`, así que el cliente valida contra **el valor del formulario**, que es el almacenado, y no asume que el orden visual de los campos garantice nada (§5.2).

**El identificador provisional.** Formato `PROV-YYYYMMDD-XXXX`, con `XXXX` en alfabeto **Crockford Base32** (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — sin `I`, `L`, `O` ni `U`, para sobrevivir a ser dictado por teléfono). Se genera **en el cliente**: no hay endpoint que lo mine. Sobrevive intacto a `normalizeDocument`, que es `trim().toUpperCase()`, y por eso `006` lo encuentra después por coincidencia exacta. Un `409` sobre un `PROV-` **no es un hallazgo sino una colisión**: se regenera y se reintenta, hasta tres veces.

**Errores del servidor, mapeados campo a campo** (`schemas.ts` de cada feature) — códigos copiados de los servicios, con una asimetría real que hay que respetar:

| `code` | Destino |
|---|---|
| `PATIENT_001_SEX_NOT_FOUND`, `PATIENT_004_SEX_NOT_FOUND` | campo `sexItemId` |
| `PATIENT_001_GEOLOC_NOT_FOUND`, `PATIENT_004_GEOLOC_NOT_FOUND` | campo `residenceGeoLocationId` |
| `PATIENT_004_DOCUMENT_EXISTS` | campo `documentNumber`, con el texto de fusión manual (§2) |
| `PATIENT_001_DOCUMENT_EXISTS` | **No es de campo**: es el hallazgo de §3.6 |
| `NOTIFIER_001_PROFESSION_NOT_FOUND`, `NOTIFIER_004_PROFESSION_NOT_FOUND` | campo `professionItemId` |
| `NOTIFIER_001_GEOLOCATION_NOT_FOUND`, `NOTIFIER_004_GEOLOCATION_NOT_FOUND` | campo `geoLocationId` |
| `CASE_001_FACILITY_NOT_FOUND`, `CASE_001_FACILITY_OUT_OF_SCOPE` | campo `healthFacilityId` |
| `CASE_001_PATIENT_NOT_FOUND` | **No es de campo**: el paciente no se elige en el paso 2. Toast, y vuelta al paso 1 |
| `CASE_004_INVALID_DATE_RANGE` | campo `eventDate` |
| `CASE_001_LOCALCODE_MISSING`, `CASE_001_CODE_EXISTS` | Toast por `code`: no hay campo que marcar, el `caseCode` lo genera el backend |
| `NOTIFIER_001_CASE_NOT_FOUND` | Toast. Sólo alcanzable si el caso se desactivó entre las dos escrituras |

**Nota que evita un bug garantizado:** el paciente escribe `PATIENT_001_GEOLOC_NOT_FOUND` y el notificador `NOTIFIER_001_GEOLOCATION_NOT_FOUND`. **`GEOLOC` en uno, `GEOLOCATION` en el otro** — la asimetría existe en el backend y el mapa la copia como está; deducir uno del otro produce un código que nunca coincide y un error que nunca se muestra.

### 3.6 Estados de la pantalla

**Paso 1 — Paciente:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Inicial | El campo con su selector de modo y la ayuda que cambia con él. **Sin botón de alta**: el alta sólo se ofrece después de una búsqueda sin resultados (§5.1) | `patient.search.idle` |
| Buscando | Skeleton de la lista de resultados | — |
| Con resultados | Tarjetas de elección, cada una con *Usar este paciente* | — |
| Sin resultados | Texto + botón **Crear paciente**, que despliega el formulario inline | `patient.search.empty` |
| Sin activos pero con inactivos | Aviso propio con el número que trae `inactiveCount`, y el alta **sigue disponible al lado** | `patient.search.inactiveFound` |
| Error de búsqueda | Mensaje por `code` + reintentar | `patient.search.error` |
| Alta con identificador provisional | **Diálogo** con el `PROV-` en grande y botón de copiar; hay que cerrarlo para continuar | `patient.provisional.*` |
| Documento duplicado (`409`) | Tarjeta *este paciente ya existe* con *Usarlo*, o el texto del titular no disponible | `patient.duplicate.*` |

**Paso 2 — Apertura del caso:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Cobertura vacía | **Bloquea el paso entero.** El formulario no se pinta | `esaviCase.opening.noCoverage` |
| Cargando la cobertura | Skeleton sólo en el selector de unidad; el resto del formulario ya se llena | — |
| Listo | Formulario del caso + lista de notificadores | — |
| Caso creado, notificador fallido | Cabecera con el `caseCode` ya asignado, error que nombra qué falló y notificador reintentable desde su lista. **El caso no se deshace** | `esaviCase.opening.notifierFailed` |
| Sin notificadores | La lista vacía dice que hace falta uno **para continuar**, no para guardar | `notifier.list.emptyRequired` |
| Sin permiso | No se llega: `<RequireRole level={USER}>` redirige | — |

**Tres textos que este spec fija literalmente**, porque son la única vez que el sistema los dice:

- **Cobertura vacía:** «No tienes territorio asignado. Pide a un administrador que te asigne cobertura geográfica: sin ella no puedes abrir casos.» — es una trampa de alta de usuarios (§1D), y el mensaje del backend diría «unidad de salud no encontrada».
- **Antes del `POST`, la irreversibilidad:** «El paciente no se podrá cambiar después. Un caso abierto contra la persona equivocada sólo puede darse de baja, y eso exige un administrador.» — va **antes**, que es donde todavía se puede corregir (§1F).
- **Duplicado no encontrable:** «Ese documento ya está registrado en un paciente que no está disponible. Pide a un administrador que lo revise.» — el único caso en que alguien lee «documento ya registrado» sin poder ver al titular.

### 3.7 Responsividad y accesibilidad

- **Los resultados de búsqueda son tarjetas, no `<ResourceTable>`.** No es un listado paginado sino una **elección entre pocos**, y `<ResourceTable>` traería paginación, toggle de inactivos y tamaño de página que aquí no significan nada. Tres campos por tarjeta: **nombre completo, documento y `healthSystemCode`**; por debajo de `md` se apilan sin cambiar de contenido.
- **La lista de notificadores tampoco es `<ResourceTable>`**, por lo mismo: son dos o tres filas dentro de un formulario. Muestra nombre, apellido y profesión, con *Editar* siempre y *Quitar* sólo con `useCan(ADMIN)` mientras `005A` siga exigiéndolo.
- **El selector de modo de búsqueda es un `radiogroup`**, no dos botones — mismo patrón que el segmentado *Exacta · Rango* de FE09, con flechas para recorrerlo y etiqueta accesible propia.
- **La casilla «sin documento» es un `<Checkbox>`** —que **no está instalado**, y este spec lo trae— con `aria-controls` sobre el campo que deshabilita, para que un lector de pantalla anuncie qué desactivó.
- **El diálogo del identificador provisional** devuelve el foco al cerrarse, muestra el `PROV-` como texto seleccionable y anuncia el resultado del botón *Copiar* con `role="status"`.
- **Las unidades fuera de cobertura se pintan `aria-disabled` con la razón en texto**, nunca sólo atenuadas: el color no es la explicación, y la explicación es justo lo que evita el `404` incomprensible de §1C.
- **`<EntitySearchSelect>` es un combobox** con navegación por teclado y `aria-expanded`/`aria-activedescendant` resueltos por Radix, no reimplementados.
- El wizard ya va a una columna por debajo de `md` (FE08); estos dos pasos heredan ese comportamiento y no lo redefinen.

---

## 4. Plan de implementación

Catorce pasos. Los seis primeros no pintan nada: contratos, primitivas y capa de API. Ninguna pantalla se escribe hasta que hay con qué.

1. **Contratos.** Dos entradas nuevas en `scripts/syncContracts.mjs` (`patient/patient.types.ts`, `notifier/notifier.types.ts`), `npm run contracts:sync`, y los seis tipos declarados a mano de §3.3 con su comentario de origen.
   *Verificación:* el diff de `contracts/` sólo añade; `PatientNameSearchResponse` tiene `inactiveCount` y **no** extiende `PaginatedResponse`; `UserGeoCoverage` tiene `assigned` y `coverage` y **no** tiene `rows`; `NotifierListRow` **no** tiene `caseId` al primer nivel.

2. **`<Checkbox>` de shadcn.** `npx shadcn@latest add checkbox` — no está instalado y la casilla «sin documento» lo necesita.
   *Verificación:* `npm run check` pasa; sus clases son tokens semánticos, sin literal de color.

3. **`shared/components/EntitySearchSelect.tsx`.** La primitiva de `ARCHITECTURE.md` §4.3: campo de texto con debounce, resultados en popover, selección que emite un id, valor resuelto en chip con *Cambiar*, y **una prop para marcar opciones no elegibles con su razón** — que es lo que el paso 2 necesita y lo que impide una copia local después.
   *Verificación:* por debajo del mínimo de caracteres no dispara petición; navegable sólo con teclado; una opción no elegible no se puede seleccionar y su razón se lee, no se deduce del color.

4. **Cerrar la deuda de FE09.** `EsaviCaseFilters.tsx:144` sustituye su buscador ad-hoc por `<EntitySearchSelect>`, y `<CatalogSelect>` gana `emit="id" | "code"` con `code` por defecto.
   *Verificación:* `grep -rn "EntitySearchSelect" src/features/` no devuelve ninguna implementación, sólo consumos; las pruebas de `EsaviCaseFilters` y `CaseWorkflowInbox` pasan **sin tocarlas**, porque el defecto de `emit` conserva el comportamiento de FE09.

5. **`features/patient/api.ts` y `schemas.ts`.** `createResource` para `001`/`003`/`004`, más `usePatientSearchByIdentifier` (`006`) y `usePatientSearchByName` (`007`) a mano — la fábrica no tiene noción de una ruta de búsqueda. Códigos citados, `staleTime` ausente a propósito (§3.4).
   *Verificación:* `007` tipa su respuesta con `inactiveCount`; ninguna de las dos búsquedas dispara con el campo vacío; el `PUT` no envía `healthSystemCode`.

6. **`features/notifier/api.ts` y `schemas.ts`, `features/userGeoLocation/api.ts`, `features/systemConfig/api.ts`.** El recurso de notificador con su filtro `caseId`; `useUserGeoCoverage` (`008`); y `useCountryIsoCode` (`006` de SYSCONF) **con la precedencia de §10.1**: `systemConfig` gana, un `404` cae a `VITE_ESAVI_APP_COUNTRY_ISO_CODE`, cualquier otro error es un problema real.
   *Verificación:* con la fila ausente (`404`), `useCountryIsoCode` devuelve `ECU` sin propagar error; con un `500` sí propaga; la clave de notificadores cambia con el `caseId`.

7. **`features/patient/provisionalDocument.ts`.** El generador `PROV-YYYYMMDD-XXXX` con alfabeto Crockford y la regla de regeneración.
   *Verificación:* mil identificadores generados no contienen `I`, `L`, `O` ni `U`; el formato sobrevive a `trim().toUpperCase()` sin cambiar; la función de reintento se agota a las tres.

8. **`PatientForm.tsx` y `PatientFormDialog.tsx`.** Los diez campos de §3.5, el schema Zod con sus límites, el mapa de errores y la casilla «sin documento». El diálogo lleva el reset de mutaciones de `CONVENTIONS.md` §10.7.
   *Verificación:* marcar «sin documento» deshabilita el campo y lo rellena; un `PATIENT_001_GEOLOC_NOT_FOUND` marca `residenceGeoLocationId` y no un toast; cerrar el diálogo tras un `409` y reabrirlo no reaplica el error viejo.

9. **`PatientSearchPanel.tsx` y `PatientStep.tsx`.** El campo con selector de modo, los ocho estados de §3.6, el alta inline, el diálogo del `PROV-` y el doble camino del `409`.
   *Verificación:* el alta **no** se ofrece antes de una búsqueda; `inactiveCount > 0` con `count: 0` muestra el aviso propio y no «no existe»; el `409` dispara `006` y, si encuentra al titular, ofrece usarlo sin repetir el formulario; elegir un paciente escribe `?patientId=` y nada más en la URL.

10. **`NotifierList.tsx` y `NotifierFormDialog.tsx`.** El patrón canónico lista + modal, que nace aquí para las diez tablas `N` que vienen después.
    *Verificación:* *Quitar* no se pinta sin `useCan(ADMIN)`; el `PUT` no envía `caseId`; la lista lee `case.caseId` y no un `caseId` plano que no existe.

11. **`ScopedHealthFacilitySelect.tsx`.** `<EntitySearchSelect>` sobre `HFAC-006`, cruzado con `coverage`. **El filtro se aplica sólo con nivel exactamente `USER`**: con ADMIN o superior no se filtra, porque el backend tampoco lo hace.
    *Verificación:* con `USER` y cobertura de un cantón, una unidad de otro cantón aparece **deshabilitada y con su razón**, no oculta; con `ADMIN` sin filas de cobertura, todas las unidades siguen elegibles; el filtro cruza contra `coverage`, no contra `assigned`.

12. **`CaseOpeningStep.tsx`.** El formulario del caso, el bloqueo por cobertura vacía, el aviso de irreversibilidad antes del `POST`, la cadena `CASE-001` → `NOTIFIER-001`, y la redirección `navigate(..., { replace: true })` a `classification`.
    *Verificación:* con cobertura vacía y rol `USER` el formulario no se pinta; el fallo del `POST` del notificador deja el caso creado y visible, con reintento; tras crear, el botón atrás **no** vuelve a ofrecer crear el caso; en reentrada el `PUT` no envía `patientId`.

13. **La reentrada.** `steps.ts` deja de tratar `patient` y `case-opening` como inalcanzables, y `CaseWizardPage` y `CaseWizardStepper` los aceptan como destino, en modo edición.
    *Verificación:* `/esavi-cases/:id/wizard/patient` abre el paso 1 con la identidad en sólo lectura y *Editar paciente* disponible; **no** ofrece cambiar de paciente; `resolveResumeStep` sigue devolviendo `classification` como mínimo y ninguna prueba de FE08 cambia de resultado.

14. **Router, rutas del alta, i18n y cierre.** `/esavi-cases/new/:step?` sustituye a `NewCasePage`; las claves `patient.*`, `notifier.*`, `esaviCase.opening.*` y `caseWizard.steps.*` en `es`, `en` y `nl`; los códigos de §3.5 en `errorMessages.ts`.
    *Verificación:* `/esavi-cases/new` resuelve el paso 1 sin `:step`; `/esavi-cases/new/basura` se comporta como `patient` **sin redirigir**; `npm run i18n:check` con paridad exacta; no queda un solo texto literal visible.

---

## 5. Criterios de aceptación

**Paso 1 — Paciente**

- [ ] El alta **no** se ofrece antes de una búsqueda: el botón *Crear paciente* sólo existe en el estado «sin resultados».
- [ ] `006` encuentra por documento, por pasaporte **y por `healthSystemCode`**; los tres con coincidencia exacta.
- [ ] Escribir medio apellido en modo nombre no encuentra nada, y la ayuda del campo lo dice **antes** de buscar, no después.
- [ ] `count: 0` con `inactiveCount: 2` muestra el aviso con el número y **no** el texto de «no existe».
- [ ] Marcar «sin documento» genera un `PROV-YYYYMMDD-XXXX` sin `I`, `L`, `O` ni `U`, y el alta termina con el diálogo que lo muestra y hay que cerrar.
- [ ] Un `409 PATIENT_001_DOCUMENT_EXISTS` **no repinta el formulario con un error de campo**: dispara `006` y ofrece al titular, o dice que no está disponible.
- [ ] Un `409` sobre un `PROV-` regenera el identificador y reintenta, hasta tres veces.
- [ ] Elegir un paciente escribe `?patientId=` en la URL, y **el término tecleado no aparece en ella**.

**Paso 2 — Apertura del caso**

- [ ] Con rol `USER` y cobertura vacía, el paso **no pinta el formulario** y muestra el texto de territorio sin asignar.
- [ ] Con rol `ADMIN` sin filas en `appUserGeoLocation`, todas las unidades siguen elegibles: el filtro **no** se aplica por encima de `USER`.
- [ ] Una unidad fuera de cobertura aparece **deshabilitada con su razón visible**, nunca oculta ni sólo atenuada.
- [ ] El filtro cruza contra `coverage`, no contra `assigned`: con «Pichincha» asignada, un hospital de un cantón de Pichincha es elegible.
- [ ] `countryIsoCode` viaja en el `POST` sin haberse preguntado; con la fila `systemConfig` ausente sale del entorno y **no** se muestra ningún error.
- [ ] El aviso de irreversibilidad del paciente aparece **antes** del `POST`.
- [ ] Si el `POST` del notificador falla, el caso creado **no se deshace**: se ve su `caseCode`, el error nombra qué falló y el notificador se reintenta desde la lista.
- [ ] Sin ningún notificador se puede **guardar** el caso, y **no** se puede avanzar al paso 3.
- [ ] Tras crear, el botón atrás del navegador no vuelve a ofrecer crear el caso.
- [ ] Ninguna de las dos pantallas muestra «Completar etapa».

**Reentrada**

- [ ] `/esavi-cases/:id/wizard/patient` abre el paso 1 con la identidad en sólo lectura y permite **editar** al paciente, nunca sustituirlo.
- [ ] `/esavi-cases/:id/wizard/case-opening` edita las tres fechas, `notificationOrganization` y `details` con `ESAVI-CASE-004`, y **no envía `patientId`**.
- [ ] `resolveResumeStep` sigue devolviendo `classification` como destino mínimo, y ninguna prueba de FE08 cambia de resultado.

**Contrato y primitivas**

- [ ] `PatientNameSearchResponse` declara `inactiveCount`; `UserGeoCoverage` declara `assigned` y `coverage` y **no** `rows`. Ningún campo inventado: los seis tipos se verifican contra su servicio.
- [ ] `NotifierListRow` no tiene `caseId` al primer nivel, y ningún componente lo busca ahí.
- [ ] `<EntitySearchSelect>` vive en `shared/components/` y **no tiene copia dentro de `features/`**: `EsaviCaseFilters` la consume, no la reimplementa.
- [ ] `<CatalogSelect emit="code">` sigue siendo el comportamiento por defecto, y las pruebas de FE09 pasan sin ser editadas.
- [ ] `grep -rn "PATIENT_001_GEOLOCATION_NOT_FOUND\|NOTIFIER_001_GEOLOC_NOT_FOUND" src/` no devuelve nada: los dos códigos se escriben como el backend los emite, no por simetría.

**Cierre (`CONVENTIONS.md` §14)**

- [ ] Se cargaron `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` antes de generar interfaz (§10.6).
- [ ] Los seis artefactos de cada entidad nueva están, y las claves i18n en **los tres** idiomas.
- [ ] El `level` de los `<RequireRole>` es `USER`, el rol mínimo real de `API-ROUTES.md:505` y `:88`.
- [ ] Los códigos `ESAVI-PATIENT-001/003/004/006/007`, `ESAVI-CASE-001/004`, `ESAVI-NOTIFIER-001/002A/004/005A`, `ESAVI-HFAC-006`, `ESAVI-USERGEO-008` y `ESAVI-SYSCONF-006` aparecen citados donde se consumen.
- [ ] Ningún color literal, ningún texto literal visible, ningún `any` en el límite con la API.
- [ ] Ningún `response.data.data`, ningún `axios` fuera de `client.ts`.
- [ ] Nada remoto copiado a `useState` ni a un store; **`draftsStore` sigue sin usarse**.
- [ ] Probado por debajo de `md`, en tema oscuro, y con `USER` **y** con `ADMIN` — la asimetría del filtro de cobertura sólo se ve probando los dos.
- [ ] `npm run check` pasa.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** un solo spec para los dos pasos. Es lo que manda `CASE-PROCESS.md` §9 y la razón se sostiene sola: el paso 1 entregado aparte no produce nada más que pacientes huérfanos y una pantalla que no lleva a ninguna parte. Coste asumido: es el spec más grande de los siete.

- **Sí:** los dos pasos del alta en la URL (`/esavi-cases/new/:step`), con el paciente en `?patientId=`. La alternativa —estado local— pierde el paciente elegido en cada recarga, y la búsqueda que lo encontró no es barata de repetir cuando hace falta el documento exacto.

- **No:** el término de búsqueda en `searchParams`, pese a que §7 de las convenciones lo pediría. **Es un dato personal** —una cédula, un apellido— y la URL sobrevive en el historial, en el título de la pestaña y en cualquier captura. Se queda en `useState` y la excepción va escrita en §3.4, no implícita en el código.

- **Sí:** un campo único con selector de modo *Identificador · Nombre*. Descartado el campo que adivina —se equivoca con un `PROV-2026...`, que parece un nombre tanto como un documento— y los dos campos visibles a la vez, que invitan a llenar ambos sin decir cuál manda.

- **Sí:** el `409 PATIENT_001_DOCUMENT_EXISTS` tratado como hallazgo, con `006` disparado detrás. Es un paciente que existe, no un formulario mal llenado, y repintarlo con un error de campo obliga al usuario a resolver a mano lo que el sistema ya sabe.

- **Sí:** el alta sigue disponible junto al aviso de pacientes inactivos. Bloquearla convertiría un dato desactivado en un callejón sin salida para quien está capturando un caso ahora; el aviso da la información y deja la decisión donde debe estar.

- **Sí:** diálogo —y no bloque en pantalla— para el identificador provisional. Es el único dato de la sesión que se pierde para siempre si nadie lo anota, y un bloque se pasa por alto al pulsar *Continuar*.

- **Sí:** unidades fuera de cobertura **deshabilitadas con su razón**, no ocultas. Ocultarlas produce exactamente el diagnóstico equivocado —«el hospital no está registrado»— y es el mismo problema que §1C describe, movido de sitio en vez de resuelto.

- **Sí:** el filtro de cobertura sólo con nivel exactamente `USER`. Aplicarlo por rol es replicar lo que hace `resolveUserGeoScopeIds`; aplicarlo a todos dejaría a un ADMIN sin filas en `appUserGeoLocation` sin poder elegir ninguna unidad, cuando el `POST` se las aceptaría todas.

- **Sí:** caso y primer notificador como un formulario único que encadena los dos `POST`. Es lo que §5.2 autoriza y evita una pantalla intermedia vacía; el precio —que la segunda escritura falle sola— se paga nombrándolo, no deshaciendo el caso.

- **Sí:** el mínimo de un notificador bloquea **avanzar**, no **guardar**. Es la aplicación literal de §4.6: quien abre un ESAVI rara vez tiene delante los datos del notificador, y exigirlo para guardar obligaría a inventarlos.

- **No:** «Completar etapa» en estos dos pasos. No tienen `stage` y `ESAVI-CASEFLOW-007` sólo admite los cuatro valores de `CaseWorkflowStage`; un botón que la interfaz no puede cumplir es peor que su ausencia.

- **Sí:** abrir `patient` y `case-opening` a la reentrada, tocando artefactos de FE08. Sin eso, añadir un notificador olvidado exigiría abrir otro caso — y §5.2 los declara una lista viva, no un dato de alta.

- **Sí:** migrar aquí el buscador ad-hoc de FE09. Su propio comentario lo declara provisional «hasta que llegue FE10»; dejarlo sería convertir en patrón lo que `CONVENTIONS.md` §10.4 prohíbe, y la sustitución es de una línea.

- **Sí:** `<CatalogSelect emit="id" | "code">` con `code` por defecto. La alternativa era resolver `code` → `catalogItemId` en cada consumidor, que duplica la resolución de dos saltos que la primitiva existe para evitar.

- **No:** `draftsStore`. El paso 1 sobrevive en la URL y el paso 2 son ocho campos; el búfer se gana su sitio en FE12/FE13, donde una pestaña cerrada cuesta noventa campos.

- **No:** `<ResourceTable>` ni para los resultados de búsqueda ni para los notificadores. Traería paginación, toggle de inactivos y tamaño de página a dos sitios donde ninguna de las tres cosas significa nada. La primitiva se escribe una vez, pero eso no la vuelve obligatoria donde no encaja.

- **Sí:** declarar `SystemConfigDetail` completo aunque hoy sólo se lea `value`. FE08 declaró `CaseWorkflowDetail` con seis campos de menos y FE09 tuvo que reconciliarlo; el subconjunto no ahorra nada y cobra intereses.

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El `PROV-` se genera en el cliente y **nada garantiza su unicidad**: no hay endpoint que lo mine | Regeneración ante `409`, hasta tres veces. Con cuatro símbolos Crockford son ~1M de combinaciones por día, así que la colisión es improbable y el reintento la cubre; el criterio de aceptación la fija como comportamiento, no como esperanza |
| La cadena de dos `POST` puede dejar un caso sin notificador, y **no se puede deshacer**: revertir exigiría `ESAVI-CASE-005A`, que es ADMIN | Es un estado válido, no un error: §3.6 le da pantalla propia, con el `caseCode` visible y el notificador reintentable desde su lista. Lo que no se hace es fingir que el caso no existe |
| El filtro de cobertura replica en el cliente una decisión del servidor (`resolveUserGeoScopeIds`), y podrían separarse | Se replica **sólo el umbral de rol**; la expansión recursiva la sigue haciendo `008`. Si el backend cambia el umbral, el síntoma es visible —unidades elegibles que el `POST` rechaza— y no silencioso |
| La fila `systemConfig` del código de país **no existe todavía** (§10.1) | El respaldo de entorno ya está escrito en los dos `.env`, y la precedencia también. Un `404` del `006` es un camino previsto y no un error que el usuario vea |
| `ESAVI-NOTIFIER-005A` exige ADMIN: **un `USER` puede añadir y no puede quitar**, ni lo que acaba de añadir por error (§10.2) | El botón se oculta con `useCan(ADMIN)` y la interfaz **lo dice** en vez de dejar la lista sin explicación. Cuando el rol baje, el cambio es quitar el guard |
| Este spec toca `steps.ts` y `CaseWizardPage`, que son de FE08 y de los que cuelga todo el wizard | Los dos slugs **se añaden, ninguno se quita**: `resolveResumeStep` no cambia de comportamiento y las pruebas de FE08 lo fijan antes de que nada dependa del cambio (paso 13) |
| La PII llega descifrada al cliente y se pinta en pantalla | Fuera del alcance de este spec cambiarlo — es el contrato del backend. Lo que sí está en su mano es **no meterla en la URL**, y §3.4 lo declara |

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `features/esaviCase/NewCasePage.tsx` | **Desaparece como página.** Su único contenido real era el punto de navegación tras crear el caso, que pasa a `CaseOpeningStep`. La ruta `/esavi-cases/new` sigue existiendo y sigue siendo la del menú |
| `features/esaviCase/steps.ts` | `patient` y `case-opening` dejan de estar excluidos de `REACHABLE_WIZARD_STEPS`. **Siguen pintándose como «Completado»** —estar en el wizard significa que el caso existe—, pero pasan a ser navegables |
| `features/esaviCase/CaseWizardPage.tsx`, `CaseWizardStepper.tsx` | Aceptan los dos slugs como destino y como enlace. Sin cambios en la reanudación: `resolveResumeStep` sigue devolviendo `classification` como mínimo |
| `shared/components/CatalogSelect.tsx` | Prop `emit="id" \| "code"`, con `code` por defecto. **Sin cambio de comportamiento**: el consumidor de FE09 no se toca |
| `features/esaviCase/EsaviCaseFilters.tsx:144` | Su buscador ad-hoc se sustituye por `<EntitySearchSelect>`. Es la deuda que FE09 dejó anotada, y se cierra aquí |
| `scripts/syncContracts.mjs` | Dos entradas nuevas en `SYNC_MAP` |
| `app/router.tsx` | `/esavi-cases/new/:step?` sustituye a `/esavi-cases/new`, dentro del mismo `<RequireRole level={USER}>` |
| `shared/api/errorMessages.ts` | Los códigos de `patient`, `notifier` y los dos nuevos de `esaviCase` (§3.5) |
| `shared/config/navigation.ts` | **No cambia.** Las dos entradas de casos ya están vivas desde FE08 y FE09 |

---

## Lo que **no** está en este spec

- **El paso 3 y los siguientes** — `FE11` a `FE14`. Este spec termina en la redirección a `classification`.
- **Una pantalla de pacientes.** `nav.items.patient` sigue `disabled: true`; `ESAVI-PATIENT-002A`/`002B` no se consumen.
- **Desactivar, reactivar o purgar** pacientes y notificadores (`PATIENT-005A/005B`, `NOTIFIER-005B/005C`).
- **La fusión de dos pacientes duplicados.** No hay endpoint: la pantalla nombra el caso y para ahí.
- **Cambiar de paciente con el caso creado.** No es una decisión de diseño sino el contrato: `ESAVI-CASE-004` ignora `patientId`.
- **`draftsStore`** y el autoguardado por sección — se ganan su sitio en `FE12`/`FE13`.
- **Crear la fila `systemConfig` del código de país** y **bajar el rol de `ESAVI-NOTIFIER-005A`**. Son las dos dependencias del otro repositorio (`CASE-PROCESS.md` §10.1 y §10.2); este spec funciona sin ellas.
- **Ordenación alfabética de resultados de paciente.** Imposible: los apellidos están cifrados y `ORDER BY` ordenaría por el texto cifrado.

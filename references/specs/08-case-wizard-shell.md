# SPEC FE08 — Armazón del wizard del caso

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell y autenticación), SPEC FE02 (fábrica de recursos y primitivas), **SPEC F44 del backend** (`caseWorkflow`, sus doce operaciones y el bloque `stages`)
> **Fecha:** 2026-09-03
> **Objetivo:** El armazón navegable del expediente —ruta, stepper de cuatro grupos y seis pasos, barra de acciones y reanudación desde `ESAVI-CASEFLOW-006`— sin un solo formulario dentro.

---

## 1. Por qué existe este spec

Es el lado cliente del **SPEC F44** del backend, implementado y con sus nueve rutas vivas en `references/API-ROUTES.md:100-110`. Y es el primero de los siete specs que implementan `references/CASE-PROCESS.md` (§9 de ese documento).

**A — El grupo *Casos* del menú lleva a ninguna parte.** `navigation.ts:51-56` declara `nav.items.esaviCase` con `disabled: true`, igual que `patient` y `finalClassification`. Hoy la aplicación gestiona catálogos y geografía —lo que valida la capa genérica (`ARCHITECTURE.md` §12, hitos 1 y 2)— y no tiene por dónde empezar el trabajo para el que existe: registrar un ESAVI.

**B — Sin armazón, cada spec de formulario tendría que inventarse el suyo.** Los pasos 1 a 6 son 27 tablas y unas 320 columnas repartidas en siete specs (`CASE-PROCESS.md` §5.0). Todos necesitan lo mismo: saber en qué paso está el expediente, si la fila de la etapa se crea o se actualiza, si el caso admite escrituras, y dónde pintar «Guardar». Construir eso una vez es la misma decisión que `createResource` resolvió para las 45 entidades (`ARCHITECTURE.md` §4).

**C — La regla que hace posible reanudar ya está servida y hoy no la lee nadie.** `ESAVI-CASEFLOW-006` devuelve `stages.<fase>.{exists, id}` para las cuatro etapas en una sola petición, y su alcance lo declara con estas palabras: *«para que un cliente que retoma un expediente sepa en una sola llamada si cada etapa se crea con `POST` o se actualiza con `PUT /:id`»* (F44 §3.7). Sin esa lectura, la alternativa es adivinar —o cuatro `GET` por apertura de pantalla—, y adivinar aquí significa un `POST` que choca contra un `UNIQUE`.

**D — El bloqueo de un expediente cerrado vive entero en este repositorio.** Verificado en `CASE-PROCESS.md` §4.5: sólo la **creación** de una fase comprueba `CLOSED`, a través del `012`. Los `PUT /:id` de las cuatro etapas no miran el workflow, así que una escritura sobre un caso cerrado se acepta hoy sin protestar. Deshabilitar el wizard es experiencia de usuario y, a diferencia de `useCan()`, **aquí el backend no es la red de seguridad**. Está pedido como §10.3 de ese documento; hasta que baje, es de este spec.

**E — «Obligatorio» no puede significar «no se guarda».** `CASE-PROCESS.md` §4.6 lo llama la regla más importante del proceso: nadie tiene toda la información cuando abre un caso, y un formulario a medio llenar tiene que poder guardarse. Eso se traduce en **dos esquemas Zod por formulario** —`saveSchema` y `completeSchema`— y en dos botones distintos. Es una decisión de armazón, no de cada paso: si cada spec la reinterpreta, siete pantallas discreparán sobre qué bloquea qué.

---

## 2. Alcance

**Dentro:**

- **Dos rutas nuevas** en `app/router.tsx`, ambas bajo `<RequireRole level={USER}>` — el rol mínimo real de `ESAVI-CASE-001` y de las seis operaciones de `caseWorkflow` que la pantalla toca:
  - `/esavi-cases/new` — aloja los pasos 1 y 2, los únicos que ocurren sin `caseId`, y **redirige** a `/esavi-cases/:id/wizard/classification` en cuanto exista el caso.
  - `/esavi-cases/:id/wizard/:step` — los seis pasos, con `:step` en slug inglés: `patient`, `case-opening`, `classification`, `notification`, `investigation`, `final-classification`. `/esavi-cases/:id/wizard` sin paso **reanuda**: redirige al paso que corresponde según `stages`.
- **`useCaseWorkflow(caseId)`** — el hook que consume `ESAVI-CASEFLOW-006` y expone estado, sellos y `stages` ya interpretados: por etapa, si se crea o se actualiza y con qué `id`.
- **`useCompleteStage(caseId)`** — `ESAVI-CASEFLOW-007`, con la invalidación del workflow cableada.
- **Cabecera del expediente** — `ESAVI-CASE-003` para código de caso, paciente y unidad de salud, junto al estado del workflow y su `openedAt`.
- **El stepper**: cuatro grupos (*Paciente · Notificación · Investigación · Cierre*) con los seis pasos dentro, en columna izquierda en escritorio y como acordeón en móvil. Cada paso muestra su estado derivado de `stages` — sin iniciar, iniciado, completado — y su candado cuando no está desbloqueado.
- **Las reglas de desbloqueo de §3.5**, que cuelgan de la precondición real de cada etapa y no del paso anterior en pantalla.
- **La barra de acciones**: **Guardar** (`POST` o `PUT` según `exists`), **Completar etapa** (`007`) y **Siguiente**. Fija abajo en móvil.
- **El contrato del paso** — un contexto donde cada paso registra su `save()`, su `isDirty` y sus pendientes de `completeSchema`. FE08 lo define y no lo usa: los seis pasos son marcadores de posición.
- **Sólo lectura con `CLOSED`** — campos deshabilitados, sin «Guardar» ni «Completar etapa», y un aviso que nombra la salida en vez de un botón que el usuario no puede pulsar.
- **El slice `drafts`** en `shared/stores/draftsStore.ts`, con clave `caseId + step`, vacío de contenido de negocio y borrado en cuanto responde el `PUT`.
- **Los códigos `CASEFLOW_00*` en `shared/api/errorMessages.ts`**, y las dos pantallas distintas de los dos `404` del `006`.
- **El cambio de menú**: `nav.items.esaviCase` se sustituye por **Registrar** (`/esavi-cases/new`, viva) y **Ver/editar** (`/esavi-cases`, `disabled: true` hasta FE09).
- **`contracts/caseWorkflow.ts`**, traído con `npm run contracts:sync`, y las claves `caseWizard.*` en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **Los seis formularios.** FE10 (pasos 1 y 2), FE11 (paso 3), FE12a/b (paso 4), FE13a–d (paso 5), FE14 (paso 6). Este spec no escribe un solo campo del expediente.
- **El listado de casos** — FE09, con los trece filtros del SPEC F48.
- **Cerrar (`008`), reabrir (`009`) y la validación (`010`/`011`).** El cierre es de FE14 con sus cuatro precondiciones; los otros tres viajan con él. **Consecuencia asumida:** hasta FE14 nadie puede cerrar ni reabrir un expediente desde la interfaz, y el modo de sólo lectura sólo se prueba contra un caso cerrado desde fuera.
- **Las primitivas del expediente** — `<AnswerOptionField>`, `<SatelliteList>`, `<DateField>`, `<TimeField>`, `<NumberField>`, `<SearchableSelect>`, `<MapPointPicker>`, `<WhodrugTreePicker>`, `<MeddraSearchField>`. Cada una llega con el spec que primero la necesita (`CASE-PROCESS.md` §9).
- **`leaflet` y `VITE_MAP_TILE_URL`** — única dependencia externa nueva del proceso, y es de FE13d.
- **La fila `systemConfig` del código de país** (`CASE-PROCESS.md` §10.1): la consume el paso 2, en FE10.
- **`<AuditTrail>` del expediente.** El wizard no muestra historial; el detalle del caso es de FE09.
- **Trabajo sin conexión**, descartado por decisión explícita (`ARCHITECTURE.md` §3.4).

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Alta de expediente | `/esavi-cases/new` | `features/esaviCase/NewCasePage.tsx` | `<RequireRole level={USER}>` |
| Wizard del expediente | `/esavi-cases/:id/wizard/:step` | `features/esaviCase/CaseWizardPage.tsx` | `<RequireRole level={USER}>` |
| Reanudación | `/esavi-cases/:id/wizard` | redirección, sin componente | idem |

Piezas del armazón, todas en `features/esaviCase/`:

| Archivo | Qué es |
|---|---|
| `steps.ts` | La declaración de los seis pasos: slug, grupo, etapa del workflow y regla de desbloqueo. Dato, no JSX — igual que `navigation.ts` (`CONVENTIONS.md` §10.5) |
| `CaseWizardContext.tsx` | El contrato del paso: `save()`, `isDirty`, `pending[]` |
| `CaseWizardHeader.tsx` | Código de caso, paciente, unidad de salud, estado y `openedAt` |
| `CaseWizardStepper.tsx` | Cuatro grupos, seis pasos, estado y candado por paso |
| `CaseWizardActionBar.tsx` | Guardar · Completar etapa · Siguiente |

Y `features/caseWorkflow/api.ts` con los dos hooks del workflow.

**Los seis pasos**, con su slug y su etapa:

| # | Grupo | Paso | Slug | Etapa (`CaseWorkflowStage`) |
|---|---|---|---|---|
| 1 | Paciente | Paciente | `patient` | — |
| 2 | Notificación | Apertura del caso | `case-opening` | — |
| 3 | Notificación | Clasificación inicial | `classification` | `CLASSIFICATION` |
| 4 | Notificación | Ficha de notificación | `notification` | `NOTIFICATION` |
| 5 | Investigación | Investigación | `investigation` | `INVESTIGATION` |
| 6 | Cierre | Clasificación final | `final-classification` | `FINAL_CLASSIFICATION` |

Los pasos 1 y 2 no tienen etapa porque ocurren antes de que exista el `caseWorkflow` (`CASE-PROCESS.md` §1); viven en `/esavi-cases/new` y **no** son alcanzables por `/esavi-cases/:id/wizard/:step`. Un `:step` desconocido —o `patient` / `case-opening` con `:id`— redirige a la reanudación en vez de mostrar la pantalla de 404 del router.

**Menú** — grupo *Casos* de `ARCHITECTURE.md` §5.2, sustituyendo el `nav.items.esaviCase` de `navigation.ts:51-56`:

| Clave i18n | Ruta | Icono | `minLevel` | Estado |
|---|---|---|---|---|
| `nav.items.caseRegister` | `/esavi-cases/new` | `FilePlus2` | `USER` | viva |
| `nav.items.caseBrowse` | `/esavi-cases` | `FileText` | `USER` | `disabled: true` hasta FE09 |

`USER` es el rol mínimo real de `ESAVI-CASE-001` y de `ESAVI-CASE-002A` (`API-ROUTES.md:88-89`), no una estimación.

### 3.2 Endpoints consumidos

```
GET    /api/case-workflows/case/:id                 ESAVI-CASEFLOW-006  USER   estado, sellos y stages
PATCH  /api/case-workflows/case/:id/complete-stage   ESAVI-CASEFLOW-007  USER   sella <etapa>EndedAt
GET    /api/esavi-cases/:id                          ESAVI-CASE-003      USER   cabecera del expediente
```

Tres, y ninguno más. Lo que **no** se consume aquí y por qué:

- **`ESAVI-CASEFLOW-008` / `009` / `010` / `011`** — cerrar, reabrir y la validación. Van con FE14 (`CASE-PROCESS.md` §9), que es quien tiene las cuatro precondiciones de cierre.
- **`ESAVI-CASEFLOW-002A` / `002B` / `003`** — listar workflows y obtener uno por su PK. El wizard entra siempre por el caso, nunca por el flujo; `006` es la operación escrita para esto.
- **`ESAVI-CASEFLOW-005A` / `005B`** — activan y desactivan el **registro** del flujo, que no es cerrar ni reabrir. Es justo la confusión que el SPEC F44 más quiere evitar (`CASE-PROCESS.md` §3), y ninguna pantalla de este spec las ofrece.
- **`ESAVI-CASE-001`** — lo dispara el paso 2, en FE10. Este spec sólo define la redirección posterior.
- **No existe `ESAVI-CASEFLOW-001` ni `004` con ruta HTTP.** El `001` es interno de la transacción de `ESAVI-CASE-001` y el `004` no existe a propósito: ningún campo de `caseWorkflow` lo escribe un humano (F44 §3.4). El armazón no puede, ni debe, crear un flujo.

### 3.3 Tipos del contrato

**Sincronizado** — añadir al `SYNC_MAP` de `scripts/syncContracts.mjs`:

```ts
{ source: 'caseWorkflow/caseWorkflow.types.ts', dest: 'caseWorkflow.ts' },
{ source: 'esaviCase/esaviCase.types.ts',       dest: 'esaviCase.ts' },
```

Trae `CaseWorkflowStage`, `CompleteCaseWorkflowStageInput`, `CaseWorkflowStageDuration`, `CreateEsaviCaseInput` y `EsaviCaseListFilters`. Los dos últimos no los usa este spec: llegan enteros porque `contracts:sync` copia el archivo tal cual, sin curar exports (`ARCHITECTURE.md` §10).

**Declarado a mano** — `contracts/declared/caseWorkflow.ts` y `contracts/declared/esaviCase.ts`, porque el backend construye las dos respuestas como literales y no hay `interface` que copiar (mismo caso que `declared/auth.ts`):

```ts
// GET /api/case-workflows/case/:id (ESAVI-CASEFLOW-006) — origen: SPEC F44 §3.7
export interface CaseWorkflowStageEntry extends CaseWorkflowStageDuration {
  exists: boolean;
  id: string | null;      // PK del satélite, o null si la etapa no se ha iniciado
}

export interface CaseWorkflowDetail {
  caseWorkflowId: string;
  caseId: string;
  status: { catalogItemId: string; code: string; name: string };
  previousStatus: { catalogItemId: string; code: string; name: string } | null;
  openedAt: string;
  closedAt: string | null;
  lastReopenedAt: string | null;
  reopenCount: number;
  stages: Record<'classification' | 'notification' | 'investigation' | 'finalClassification',
                 CaseWorkflowStageEntry>;
}
```

`CaseWorkflowStageDuration` **sí** está en el tipo sincronizado; `exists` e `id` no, y por eso la entrada se extiende aquí. Que sean campos separados es deliberado en el backend: un `startedAt` sellado con `id: null` es una fila purgada, y esconder los dos detrás de un solo booleano oculta el síntoma (F44 §3.7).

`declared/esaviCase.ts` recoge la fila que devuelve el `003`, tal como la deja `toEsaviCaseResponse` (`esavi-backend/src/services/esaviCase.service.ts:40-53,118-126`): `caseId`, `caseCode`, `reportDate`, `eventDate`, `countryIsoCode`, `reportFillingDate`, `notificationOrganization`, `details`, `isActive`, `createdAt`, `updatedAt`, `deletedAt`, `appDetails`, más `patient` (`patientId`, `names`, `lastNames`, `documentNumber`, `healthSystemCode`) y `healthFacility` (`healthFacilityId`, `localCode`, `name`). **Sin `patientId` ni `healthFacilityId` sueltos, sin `sysDetails` y sin `geoLocationId` dentro de `healthFacility`**: el servicio los quita antes de responder.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId`, paso actual | URL | segmentos de `/esavi-cases/:id/wizard/:step` | nunca en un store |
| Workflow (estado, sellos, `stages`) | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | sin `staleTime`; se invalida tras `007` y tras cualquier `POST`/`PUT` de etapa que dispare un spec posterior |
| Cabecera del caso | TanStack Query | `['esaviCase', 'detail', caseId]` | `staleTime` por defecto; se invalida si un spec de paso llega a tocar `esaviCase` (paso 2, en FE10) |
| Lo tecleado sin guardar de cada paso | Zustand `drafts` | `drafts[caseId][step]` | se borra al responder el `PUT`; nunca sustituye a la fila real (`ARCHITECTURE.md` §3.4) |
| `isDirty`, pendientes de `completeSchema`, función `save()` del paso activo | React Context (`CaseWizardContext`) | en memoria, remontado por paso | no persiste; cada paso lo rellena al montarse |
| Diálogo «hay cambios sin guardar» | Componente | `useState` | efímero |

Dos puntos que el spec resuelve explícitamente:

- **`['caseWorkflow', 'byCase', caseId]` es la única fuente de verdad sobre qué botón mostrar.** Ningún componente decide «crear vs actualizar» a partir de un flag local: siempre lee `stages.<etapa>.exists`. Guardar sin invalidar esta clave después de un `007` deja el stepper mintiendo sobre qué etapa ya se completó.
- **`drafts` no es progreso.** Es el búfer contra el cierre accidental de la pestaña entre el último `PUT` exitoso y el siguiente. Un paso que lo usa para "recordar lo tecleado" y no lo borra al guardar rompe la regla de `ARCHITECTURE.md` §3.4 tan pronto como el usuario recarga y ve datos viejos donde ya hay una fila real.

### 3.5 Formularios y validación

Este spec no declara ningún campo — no hay entidad que llenar. Lo que sí fija es **el patrón que los seis pasos deben seguir**, porque es una regla de armazón y no de cada paso (§1, hallazgo E):

- **Cada paso declara dos schemas Zod**: `<step>SaveSchema` y `<step>CompleteSchema`, en su propio `features/esaviCase/schemas/<step>.schema.ts` (fuera de este spec). `<step>CompleteSchema` extiende a `<step>SaveSchema` — nunca lo reemplaza — porque todo lo bloqueante de guardado también es obligatorio de proceso (`CASE-PROCESS.md` §4.6).
- **El contrato que expone `CaseWizardContext`** por paso activo:

```ts
interface CaseWizardStepHandle {
  save: () => Promise<void>;      // corre <step>SaveSchema; POST o PUT según stages.<etapa>.exists
  isDirty: boolean;                // gobierna el diálogo de "cambios sin guardar" de la acción Siguiente
  getPendingFields: () => string[]; // campos de <step>CompleteSchema que faltan; [] si ninguno
}
```

Cada paso lo registra al montarse y lo desregistra al desmontarse; `CaseWizardActionBar` sólo lo consume — no conoce Zod ni la forma de ningún campo.

- **`save()` nunca calcula el diff.** Se envía el objeto completo del formulario; el backend hace el update diferencial (`CONVENTIONS.md` §6.5, §8). Este spec no valida esa regla porque no tiene formulario propio, pero la deja escrita porque es la restricción que los seis specs siguientes heredan de aquí.
- **Los errores del backend se mapean al campo del paso activo**, nunca a un toast genérico salvo que `errorMessages.ts` no tenga campo destino — el mismo patrón de `CONVENTIONS.md` §8 y §6.4, aplicado ahora a los códigos `CASEFLOW_007_*` (tabla en §3.6).

No hay combinaciones que el backend rechace con `400` en este spec — no hay filtros ni fechas cruzadas que declarar; eso lo trae cada paso.

### 3.6 Estados de la pantalla

Aplican a `CaseWizardPage` como conjunto — el wizard es una sola vista con pasos internos, no seis pantallas con sus cuatro estados cada una:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton del stepper + cabecera, mientras `006` y `003` están en vuelo | — |
| Vacío | No aplica: un `caseId` válido siempre tiene cabecera y workflow | — |
| Error — `CASEFLOW_006_CASE_NOT_FOUND` | Pantalla dedicada: «Este caso no existe» + botón al listado | `caseWizard.error.caseNotFound` |
| Error — `CASEFLOW_006_NOT_FOUND` | Pantalla dedicada distinta: «Este caso no tiene expediente de flujo» + texto que nombra el caso y pide avisar a un administrador — es el síntoma de un caso anterior a F44, no un dato ausente del usuario | `caseWizard.error.workflowMissing` |
| Error — cualquier otro `code` de `006`/`003`/`007` | Mensaje por `code` vía `errorMessages.ts` + botón reintentar | `caseWizard.error.generic` |
| Sin permiso | No se llega: el guard redirige. `nav.items.caseRegister` no aparece bajo `USER`'s mínimo (que es el mismo, así que en la práctica todo `USER` autenticado lo ve) | — |
| `CLOSED` | Wizard completo en sólo lectura: campos deshabilitados, sin «Guardar» ni «Completar etapa», banner fijo con «Pide a un administrador que reabra el expediente» | `caseWizard.readOnly.closedBanner` |

Los dos errores de `006` se distinguen por `code`, nunca por `message` — es la razón de que F44 los haya separado (§3.5 de ese spec).

**Mapeo de códigos de `caseWorkflow` relevantes para el armazón:**

| `code` | Origen | Qué hace el cliente |
|---|---|---|
| `CASEFLOW_006_CASE_NOT_FOUND` | `006` | pantalla dedicada, arriba |
| `CASEFLOW_006_NOT_FOUND` | `006` | pantalla dedicada, arriba |
| `CASEFLOW_007_STAGE_NOT_STARTED` | `007` | no debería llegar: el botón está deshabilitado mientras `exists === false` (§3.5, §4). Si llega, toast genérico y refresco del workflow |
| `CASEFLOW_007_STAGE_ALREADY_COMPLETED` | `007` | igual: prevenido en el cliente; si llega, toast + refresco |
| `CASEFLOW_007_CASE_CLOSED` | `007` | toast + fuerza el modo `CLOSED` sin esperar al próximo `006` |

Los tres genéricos (`caseWorkflow.stageCompletedFailed`, `.getFailed`, etc. de F44 §3.6) van al catálogo general de `errorMessages.ts`, sin fila propia aquí.

### 3.7 Responsividad y accesibilidad

- **Stepper en columna izquierda en escritorio**, con los cuatro grupos siempre expandidos — ningún acordeón por encima de `md`, porque los segmentos con preguntas grandes van sin colapsar también en web.
- **Por debajo de `md`, acordeón**: los cuatro grupos colapsables, el paso activo siempre expandido. Sigue siendo el mismo componente — sin duplicar el stepper por breakpoint.
- **Barra de acciones fija abajo en móvil** (`ARCHITECTURE.md` §8.2), estática en el flujo en escritorio.
- **Candado de paso bloqueado**: icono + `aria-label` por i18n explicando qué falta, no sólo opacidad — un candado mudo no dice al usuario qué etapa completar primero.
- **El estado de cada paso en el stepper** (sin iniciar / iniciado / completado) se comunica con icono **y** texto, nunca sólo color (`CONVENTIONS.md` §10.3).
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- El stepper es navegable con teclado: cada paso desbloqueado es un elemento enfocable que activa con Enter/Espacio; un paso bloqueado no es un `tabIndex` alcanzable.
- El banner de sólo lectura (`CLOSED`) usa `role="status"`, no un toast que desaparece.

### 3.8 Claves i18n nuevas

Todas bajo el espacio `caseWizard.*`:

| Clave | Uso |
|---|---|
| `nav.items.caseRegister` | `NavItem` — «Registrar» |
| `nav.items.caseBrowse` | `NavItem` — «Ver/editar» |
| `caseWizard.groups.notification` | Encabezado de grupo del stepper |
| `caseWizard.groups.investigation` | Encabezado de grupo del stepper |
| `caseWizard.groups.closure` | Encabezado de grupo del stepper |
| `caseWizard.steps.patient` | Etiqueta del paso 1 |
| `caseWizard.steps.caseOpening` | Etiqueta del paso 2 |
| `caseWizard.steps.classification` | Etiqueta del paso 3 |
| `caseWizard.steps.notification` | Etiqueta del paso 4 |
| `caseWizard.steps.investigation` | Etiqueta del paso 5 |
| `caseWizard.steps.finalClassification` | Etiqueta del paso 6 |
| `caseWizard.stepStatus.notStarted` | Estado del paso en el stepper |
| `caseWizard.stepStatus.inProgress` | Estado del paso en el stepper |
| `caseWizard.stepStatus.completed` | Estado del paso en el stepper |
| `caseWizard.stepLocked.aria` | `aria-label` del candado, con el nombre de la etapa previa interpolado |
| `caseWizard.actions.save` | Botón Guardar |
| `caseWizard.actions.completeStage` | Botón Completar etapa |
| `caseWizard.actions.next` | Botón Siguiente |
| `caseWizard.actions.unsavedChangesTitle` | Título del diálogo de confirmación |
| `caseWizard.actions.unsavedChangesBody` | Cuerpo del diálogo de confirmación |
| `caseWizard.actions.pendingFieldsTitle` | Título del listado de pendientes al completar etapa |
| `caseWizard.header.status` | Etiqueta de estado en la cabecera |
| `caseWizard.header.openedAt` | Etiqueta de fecha de apertura |
| `caseWizard.readOnly.closedBanner` | Banner de sólo lectura |
| `caseWizard.error.caseNotFound` | Pantalla dedicada, `CASEFLOW_006_CASE_NOT_FOUND` |
| `caseWizard.error.workflowMissing` | Pantalla dedicada, `CASEFLOW_006_NOT_FOUND` |
| `caseWizard.error.generic` | Error genérico con botón reintentar |
| `caseWizard.newCase.title` | Título de `/esavi-cases/new` |

`npm run i18n:check` exige paridad exacta en `es`, `en` y `nl`.

---

## 4. Plan de implementación

1. **Tipos.** Añadir `caseWorkflow/caseWorkflow.types.ts` y `esaviCase/esaviCase.types.ts` al `SYNC_MAP` de `scripts/syncContracts.mjs`; correr `npm run contracts:sync`. Crear `contracts/declared/caseWorkflow.ts` (`CaseWorkflowStageEntry`, `CaseWorkflowDetail`) y `contracts/declared/esaviCase.ts` (la forma de §3.3) a mano.
   *Verificación:* `npm run build` en 0; `contracts/caseWorkflow.ts` y `contracts/esaviCase.ts` existen con cabecera generada; los dos `declared/*.ts` no la llevan.

2. **`drafts` store.** `shared/stores/draftsStore.ts`, Zustand sin `persist` — es un búfer de sesión, no una preferencia — con `get(caseId, step)`, `set(caseId, step, value)`, `clear(caseId, step)`.
   *Verificación:* test unitario: `set` seguido de `clear` deja `get` en `undefined`; dos `caseId` distintos no se pisan.

3. **`features/caseWorkflow/api.ts`.** Hooks escritos a mano —no `createResource`, ver §6— `useCaseWorkflow(caseId)` sobre `006` con clave `['caseWorkflow', 'byCase', caseId]` y `useCompleteStage(caseId)` sobre `007`, invalidando esa misma clave `onSuccess`.
   *Verificación:* test con MSW: `useCaseWorkflow` devuelve `stages` tal como los sirve el mock; `useCompleteStage` invalida y el siguiente `useCaseWorkflow` refetch.

4. **`features/esaviCase/api.ts`.** `createResource<EsaviCaseDetail, CreateEsaviCaseInput>({ key: 'esaviCase', path: 'esavi-cases', adminPath: 'esavi-cases/admin', idField: 'caseId', inactiveMode: 'adminPath', hasActivate: true })`. Este spec sólo consume `useOne(caseId)`; el resto de la declaración queda lista para que FE09 la reutilice sin redeclarar (§6).
   *Verificación:* `useOne(caseId)` contra el mock del `003` devuelve la forma de `declared/esaviCase.ts`.

5. **`features/esaviCase/steps.ts`.** La tabla de §3.1 como dato tipado: slug, grupo, etapa (o `null` para los pasos 1–2), y una función `isStepUnlocked(step, stages)` que implementa las reglas de §3.5 — cada paso cuelga de su precondición real, no del paso anterior en pantalla.
   *Verificación:* test unitario: paso 6 desbloqueado con `notification.exists === true` y `investigation.exists === false`; paso 5 marcado `not-applicable` cuando `requestInvestigation === false` (una vez ese campo llegue con FE12a — hasta entonces el test cubre sólo el desbloqueo por `stages`).

6. **`CaseWizardContext.tsx`.** El contrato de §3.5: `registerStep(handle)` / `unregisterStep()`, expone `activeStep`, `isDirty`, `pendingFields`.
   *Verificación:* test con un paso de prueba que registra un `handle` falso; desmontarlo limpia el contexto.

7. **`CaseWizardHeader.tsx`, `CaseWizardStepper.tsx`, `CaseWizardActionBar.tsx`.** Presentacionales, consumen `useCaseWorkflow`, `esaviCase.useOne` y el contexto. La barra: Guardar llama a `handle.save()`; Completar etapa deshabilitado mientras `!stages.<etapa>.exists`, y si `pendingFields.length > 0` lista los campos en vez de bloquear en silencio (§3.5, §14); Siguiente pregunta si `isDirty` antes de navegar.
   *Verificación:* con rol `USER` y un paso sin registrar (placeholder de este spec), la barra no lanza; con `stages.classification.exists === false` el botón «Completar etapa» está deshabilitado.

8. **Las dos pantallas de error de `006`.** Componentes dedicados para `CASEFLOW_006_CASE_NOT_FOUND` y `CASEFLOW_006_NOT_FOUND` (§3.6), montados donde `CaseWizardPage` detecta el `code` antes de pintar el resto.
   *Verificación:* mock del `006` con cada código por separado renderiza la pantalla correspondiente, no la genérica.

9. **`CaseWizardPage.tsx`.** Ensambla cabecera + stepper + `<Outlet>` de paso (placeholder de `<div>` con el nombre del slug hasta que FE10–FE14 lo rellenen) + barra. Lee `:id` y `:step` de la URL; si `:step` es inválido o corresponde a un paso bloqueado, redirige al último paso desbloqueado.
   *Verificación:* navegar a un `:step` bloqueado a mano redirige; con `CLOSED` todo el árbol se renderiza en sólo lectura y sin las dos primeras acciones de la barra.

10. **`NewCasePage.tsx` y la redirección.** Placeholder de los pasos 1–2 (contenido real de FE10); expone el punto donde, cuando `ESAVI-CASE-001` responda con `caseId`, se navega a `/esavi-cases/:id/wizard/classification`.
    *Verificación:* con un `caseId` fijo escrito a mano en el placeholder, el botón de prueba navega a la ruta esperada.

11. **`errorMessages.ts`.** Las cinco entradas de §3.6.
    *Verificación:* `getErrorMessage({ code: 'CASEFLOW_007_CASE_CLOSED' })` devuelve la clave esperada.

12. **Ruta.** Las dos entradas de §3.1 en `app/router.tsx`, dentro de `<RequireRole level={ROLE_LEVELS.USER}>`.
    *Verificación:* navegar a `/esavi-cases/new` y a `/esavi-cases/<id>/wizard/classification` sin sesión redirige a `/login`; con `USER` autenticado, ambas rutas resuelven.

13. **Navegación.** Sustituir `nav.items.esaviCase` (`navigation.ts:51-56`) por las dos entradas de §3.1.
    *Verificación:* con rol `USER`, el sidebar muestra «Registrar» navegable y «Ver/editar» marcado «próximamente»; ningún rol ve el `NavItem` viejo.

14. **Claves i18n.** Las de §3.8 en `es.json`, `en.json`, `nl.json`.
    *Verificación:* `npm run i18n:check` en 0.

15. **Tests de integración del armazón.** `CaseWizardPage.test.tsx`: reanudación (`/wizard` sin paso redirige según `stages`), bloqueo de paso, `CLOSED` en sólo lectura, las dos pantallas de error.
    *Verificación:* `npm test -- CaseWizardPage` en 0.

---

## 5. Criterios de aceptación

- [ ] Las tres rutas de §3.2 se consumen y responden con lo esperado.
- [ ] `/esavi-cases/new` y `/esavi-cases/:id/wizard/:step` existen, con guard `USER`, y `/esavi-cases/:id/wizard` sin paso redirige según `stages`.
- [ ] Un `caseId` que no existe muestra la pantalla de `CASEFLOW_006_CASE_NOT_FOUND`; un caso sin flujo muestra la de `CASEFLOW_006_NOT_FOUND` — pantallas distintas, verificable comparando el texto renderizado.
- [ ] El paso 6 se desbloquea con `stages.notification.exists === true`, sin depender de `stages.investigation.exists`.
- [ ] «Completar etapa» está deshabilitado mientras `stages.<etapa>.exists === false`.
- [ ] Un caso `CLOSED` renderiza el wizard en sólo lectura: sin «Guardar» ni «Completar etapa», con el banner de §3.6.
- [ ] `grep -rn "response.data.data" src/features/esaviCase src/features/caseWorkflow` no devuelve resultados.
- [ ] `contracts/caseWorkflow.ts` y `contracts/esaviCase.ts` existen y `contracts/declared/caseWorkflow.ts` / `declared/esaviCase.ts` no llevan cabecera generada.
- [ ] Las claves nuevas existen en es, en y nl; `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** El wizard se ve correcto en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/esaviCase/` no devuelve resultados.
- [ ] **Por debajo de `md`.** El stepper colapsa a acordeón con el paso activo expandido y la barra queda fija abajo; el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` el wizard funciona con normalidad — es el rol mínimo real de las tres rutas; no aplica un caso de rol insuficiente porque ningún nivel por debajo de `USER` existe en `ROLE_LEVELS`.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos `aria-label` del candado y del banner de sólo lectura; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: el workflow y la cabecera nunca copiados a `useState`, `drafts` vacío tras cada `PUT` exitoso (verificable en un paso de prueba una vez FE10 lo implemente).

---

## 6. Decisiones tomadas y descartadas

- **Sí:** `/esavi-cases/new` como ruta hermana, no un `:id` opcional en `/esavi-cases/:id/wizard/:step`. Un `:id` opcional obliga a que cada componente de paso compruebe si existe antes de leer `useCaseWorkflow`, y duplica la lógica de redirección en dos sitios.

- **Sí:** slug en inglés para `:step`, no número. Un enlace guardado (`.../wizard/notification`) sigue siendo válido si algún spec posterior parte un paso; un `.../wizard/4` no.

- **Sí:** stepper de cuatro grupos con los seis pasos dentro, replicando el agrupamiento conceptual de `CASE-PROCESS.md` §1.1, aunque la URL siga siendo de seis pasos. Es lo que el usuario del proceso entiende por "notificar".

- **Sí:** desbloqueo por precondición real de cada etapa (`stages.<etapa-previa>.exists`), no por cadena estricta 3→4→5→6. Una cadena estricta encierra un caso grave sin investigación: exige `finalClassification` para cerrar (`CASE-PROCESS.md` §4.4) sin exigir `investigation`, y el paso 5 no puede ser peaje del 6.

- **Sí:** `CaseWizardContext` como contrato entre el armazón y los pasos, en vez de que cada paso pinte su propia barra de acciones. Es la misma decisión que llevó a `<ResourceTable>` (`ARCHITECTURE.md` §4): una barra por spec habría discrepado en seis formas distintas sobre cuándo deshabilitar «Completar etapa».

- **Sí:** `009` (reabrir), `010`/`011` (validación) y `008` (cerrar) quedan **todos** para FE14, no sólo el cierre. Se asume el riesgo: hasta FE14 nadie puede probar el modo de sólo lectura desde la propia interfaz — sólo cerrando el caso por fuera (Postman, la base). La alternativa —traer `009` aquí— habría dividido la autoridad sobre `caseWorkflow` entre dos specs sin necesidad real.

- **Sí:** `features/caseWorkflow/api.ts` con hooks escritos a mano, no `createResource`. La fábrica asume `list/one/create/update/deactivate/activate` sobre una ruta con `:id` propio; `caseWorkflow` no tiene `001` ni `004` con ruta HTTP, se lee por `caseId` en vez de por su propio PK (`006`), y sus escrituras son cuatro `PATCH` de acción (`007`–`011`), no un CRUD. Forzarlo en `createResource` habría exigido añadir parámetros de un solo uso a una fábrica que hoy sirve 45 entidades regulares.

- **Sí:** `features/esaviCase/api.ts` se crea en este spec, aunque el "dueño" natural del listado sea FE09. El artefacto pertenece a la entidad, no al spec que la lista; FE09 lo reutiliza sin redeclarar (`CONVENTIONS.md` §5). La alternativa —que FE08 llame a `client.get()` directamente para el `003`— habría sido axios fuera de `createResource`, que es justo lo que la capa genérica prohíbe.

- **No:** `staleTime` en `['caseWorkflow', 'byCase', caseId]`. El estado del expediente cambia con cada acción de la barra y una lectura obsoleta muestra un paso desbloqueado que en realidad no lo está — el costo de refetch es menor que el de una decisión de UI incorrecta sobre qué botón mostrar.

- **No:** meter la cabecera (`ESAVI-CASE-003`) dentro de `useCaseWorkflow`. Son dos preocupaciones distintas —identidad del caso vs. estado del proceso— y fusionarlas habría acoplado un hook que FE09 también necesita a la forma específica del wizard.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El bloqueo de `CLOSED` vive sólo en el cliente (§1, hallazgo D) hasta que baje `CASE-PROCESS.md` §10.3. Un usuario con las herramientas de desarrollo abiertas puede forzar un `PUT` sobre un caso cerrado | Aceptado como riesgo conocido y documentado, igual que lo hace `CASE-PROCESS.md`. No es competencia de este spec cerrarlo — es una dependencia del backend |
| Sin FE14, el modo de sólo lectura de este spec no tiene forma de probarse end-to-end desde la interfaz (nadie puede cerrar un caso) | El test de integración de §4 paso 15 usa un mock del `006` con `status.code === 'CLOSED'`, sin depender de que `008` exista en el cliente |
| `features/esaviCase/api.ts` se declara con una superficie mínima (`useOne`); si FE09 necesita cambiar `inactiveMode` o `hasActivate` una vez conozca el comportamiento real de `002A`/`002B` para `esaviCase`, el cambio toca un archivo que este spec ya dejó "cerrado" | Documentado en §6 como decisión abierta a ampliación; FE09 la extiende, no la reescribe |

---

## 8. Impacto en pantallas existentes

**`shared/config/navigation.ts`** — el `NavItem` `nav.items.esaviCase` (líneas 51–56) se elimina y se sustituye por `nav.items.caseRegister` y `nav.items.caseBrowse` (§3.1). Ningún otro grupo del menú cambia.

**`src/locales/{es,en,nl}.json`** — la clave `nav.items.esaviCase`, si existe, se retira junto con el `NavItem`; `npm run i18n:check` la marcaría huérfana si quedara.

Ninguna pantalla ya construida (catálogos, geografía, autenticación) cambia de comportamiento.

---

## Lo que **no** está en este spec

- Los seis formularios del wizard: paciente, apertura del caso, clasificación inicial, ficha de notificación, investigación y clasificación final.
- El listado de casos con los trece filtros del SPEC F48.
- Cerrar (`008`), reabrir (`009`) y pedir/resolver validación (`010`/`011`).
- Las diez primitivas del expediente (`<AnswerOptionField>`, `<SatelliteList>`, `<DateField>`, `<TimeField>`, `<NumberField>`, `<SearchableSelect>`, `<MapPointPicker>`, `<WhodrugTreePicker>`, `<MeddraSearchField>`).
- `leaflet` y `VITE_MAP_TILE_URL`.
- La fila `systemConfig` del código de país.
- `<AuditTrail>` del expediente.
- Trabajo sin conexión.

Cada uno de esos, si aterriza, va en su propio spec.

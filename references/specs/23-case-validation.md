# SPEC FE23 — Pedir y resolver la validación del expediente

> **Estado:** Aprobado
> **Depende de:** SPEC FE08 (armazón del asistente, `CaseWizardHeader`), SPEC FE09 (`EsaviCaseDetailPage` y la bandeja por estado), SPEC FE14b (`ClosureStep`, línea `notPendingValidation`, `invalidateWorkflowTransition`, patrón `ReopenCaseButton`), SPEC F44 del backend (`ESAVI-CASEFLOW-010`/`-011`)
> **Fecha:** 2026-09-24
> **Objetivo:** Añadir al expediente las acciones de pedir y resolver la validación, de modo que un caso en `PENDING_VALIDATION` tenga salida desde la interfaz.

---

## 1. Por qué existe este spec

Es el consumo de `ESAVI-CASEFLOW-010` (pedir validación, USER) y `ESAVI-CASEFLOW-011` (resolver validación, USER), especificados en el SPEC F44 del backend. Implementa `CASE-PROCESS.md` §4.3. FE14b lo dejó fuera a propósito: dijo que iba «a la pantalla del expediente», pero ningún spec lo recogió.

**A — `PENDING_VALIDATION` bloquea el cierre, pero no hay forma de salir de él.** El estado bloquea el cierre: `closeReadiness.ts:113` marca la línea `notPendingValidation` como incumplida, y el `008` responde `409 CASEFLOW_008_PENDING_VALIDATION`. Pero en toda la interfaz no hay ningún botón que llame al `011`. La línea se pinta con `links: []` (`closeReadiness.ts:116`), y el riesgo nº 2 de FE14b lo dejó anotado: *«un caso en `PENDING_VALIDATION` no tiene salida en la interfaz»*.

**B — Tampoco se puede entrar en ese estado.** El cliente no llama nunca al `010`. Hoy a `PENDING_VALIDATION` sólo se llega por API, así que la bandeja por estado (FE09) ofrece un filtro que ningún usuario puede llenar desde la interfaz.

**C — El estado no se explica en ningún sitio.** `CaseWizardHeader.tsx:41` y `EsaviCaseDetailPage.tsx:68` pintan `status.name` y nada más. Quien lee «Pendiente de validación» no sabe dos cosas:

- **A qué estado volverá el caso.** Está en `previousStatus`, que el contrato ya trae (`contracts/declared/caseWorkflow.ts`) y nadie pinta.
- **Que puede seguir trabajando.** El backend admite escrituras en ese estado, y avanzar de fase mueve `previousStatus`, no el estado (F44 §3.5).

---

## 2. Alcance

**Dentro:**

- `useRequestValidation(caseId)` y `useResolveValidation(caseId)` en `features/caseWorkflow/api.ts`, sobre `010` y `011`. Sin body. Si salen bien, llaman a `invalidateWorkflowTransition`; ante un `409` propio, releen el workflow.
- Un único componente, `features/caseWorkflow/CaseValidationActions.tsx`. Pinta «Pedir validación» o «Resolver validación» según el estado, con su `AlertDialog` de confirmación, y no pinta nada con `CLOSED`. Admite `mode="resolveOnly"` para el uso de «Cierre».
- **Dónde se monta** ese componente:
  - en `WorkflowStatusBlock` de `EsaviCaseDetailPage`, junto al badge;
  - en `CaseWizardHeader`, junto al badge;
  - dentro de la línea `notPendingValidation` de `ClosureStep` cuando está incumplida, sólo con «Resolver validación».
- **El badge en revisión**, en el detalle y en el asistente: «Pendiente de validación · venía de {{previous}}», con `previousStatus.name`.
- **Aviso en el asistente** con `PENDING_VALIDATION`: un aviso informativo (`role="status"`) que no bloquea, en todos los pasos menos «Cierre», porque ahí ya lo dice la propia línea.
- Los `code` de `010` y `011` en `shared/api/errorMessages.ts`, y las claves nuevas en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **Desactivar y reactivar el registro del flujo** (`ESAVI-CASEFLOW-005A`/`-005B`). Va en SPEC FE24.
- **`ESAVI-CASEFLOW-003`** (leer el workflow por su propio id). Ninguna pantalla de este spec lo necesita: `006` ya devuelve todo por `caseId`. Se decide en FE24.
- **Motivo o comentario de la validación.** `010` no acepta body. Si hace falta, es una petición al backend.
- **Restringir «Resolver» a ADMIN.** El rol real es USER. La petición de subir `011` a ADMIN se anota en `CASE-PROCESS.md` §10, como dependencia del backend, sin cambiar la interfaz.
- **Una bandeja de «pendientes de validación».** El filtro de estado de `CaseWorkflowInbox` ya la cubre, así que no cambia.
- **Notificar a un revisor.** No existe endpoint de notificaciones.

---

## 3. Diseño

Es un spec de ampliación: no hay rutas nuevas ni formularios. Se usan las sub-secciones que aplican.

### 3.1 Pantallas y rutas

No hay vistas, rutas ni entradas de navegación nuevas. El componente se monta en tres sitios que ya existen:

| Dónde | Archivo | Qué pinta | Guard |
|---|---|---|---|
| Detalle del caso | `features/esaviCase/EsaviCaseDetailPage.tsx` (`WorkflowStatusBlock`) | Badge ampliado + `<CaseValidationActions caseId>` | El de la ruta, sin cambios (`USER`) |
| Cabecera del asistente | `features/esaviCase/CaseWizardHeader.tsx` | Badge ampliado + `<CaseValidationActions caseId>` | Ídem |
| Paso «Cierre» | `features/esaviCase/ClosureStep.tsx`, línea `notPendingValidation` | `<CaseValidationActions caseId mode="resolveOnly">`, sólo con la línea incumplida | Ídem |

Además, un aviso nuevo en `CaseWizardPage.tsx`, justo debajo de la cabecera, con la misma posición y la misma forma que el aviso de `CLOSED`.

**Qué acción se ve.** Se decide sólo por `status.code`, leído de `006`:

| `status.code` | Acción | Rol |
|---|---|---|
| `OPEN`, `IN_CLASSIFICATION`, `IN_NOTIFICATION`, `IN_INVESTIGATION`, `IN_FINAL_CLASSIFICATION`, `REOPENED` | «Pedir validación» | USER |
| `PENDING_VALIDATION` | «Resolver validación» | USER |
| `CLOSED` | Ninguna | — |

**No se llama a `useCan()`.** Las dos rutas son USER, que es el nivel mínimo para entrar al expediente. En `mode="resolveOnly"`, el componente no pinta nada fuera de `PENDING_VALIDATION`.

### 3.2 Endpoints consumidos

```
PATCH  /api/case-workflows/case/:id/request-validation   ESAVI-CASEFLOW-010   USER   pedir validación
PATCH  /api/case-workflows/case/:id/resolve-validation   ESAVI-CASEFLOW-011   USER   resolver validación
GET    /api/case-workflows/case/:id                      ESAVI-CASEFLOW-006   USER   ya consumido (FE08): estado y previousStatus
```

- **Sin body** en los dos `PATCH`. F44 prohíbe que viaje un `statusItemId` desde el cliente.
- **Los dos devuelven el workflow completo en `data`**, con la misma forma que `006` (F44 §3.7). El cliente no lo usa para escribir en caché: invalida y relee (§3.4).
- **No se consumen:**
  - `ESAVI-CASEFLOW-003`: todo se lee por `caseId` con `006`.
  - `005A`/`005B`: van en SPEC FE24.

### 3.3 Tipos del contrato

No hay tipos nuevos. Se usa `CaseWorkflowDetail` de `contracts/declared/caseWorkflow.ts`, que ya declara lo que este spec pinta:

```ts
status: CatalogRef;                  // { catalogItemId, code, name }
previousStatus: CatalogRef | null;   // only filled while PENDING_VALIDATION (F44 §3.2)
```

`previousStatus` puede llegar a `null` con `PENDING_VALIDATION` en un solo caso: la incoherencia que después provoca el `500` del `011`. En ese caso, el badge omite «· venía de…» y enseña sólo el nombre del estado.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Estado del flujo y `previousStatus` | TanStack Query | `['caseWorkflow','byCase',caseId]` (`006`) | Ya existe. Sin `staleTime` (FE08 §6). Es la **única** fuente que decide qué botón y qué aviso se ven |
| Estado de las dos mutaciones | TanStack Query | `useMutation` de `useRequestValidation` / `useResolveValidation` | `isPending` deshabilita el botón de confirmar |
| Diálogo de confirmación abierto | Componente | `useState` en `CaseValidationActions` | Efímero |

**Nada nuevo en la URL, en Zustand ni en `draftsStore`.** No hay nada que teclear. Tampoco se copia el `data` de la respuesta a `useState` ni a la caché con `setQueryData`: se invalida y se relee, igual que al cerrar y reabrir.

**Qué invalida qué:**

| Tras | Se invalida |
|---|---|
| `200` de `010` o `011` | `invalidateWorkflowTransition`: `['caseWorkflow','byCase',caseId]`, `['caseWorkflow','list']` y `['esaviCase']` |
| `409 CASEFLOW_010_ALREADY_PENDING`, `409 CASEFLOW_010_CASE_CLOSED`, `409 CASEFLOW_011_NOT_PENDING` | `['caseWorkflow','byCase',caseId]`: otra pestaña u otro usuario se adelantó, y releer muestra el botón correcto (o la sólo lectura, si el caso se cerró) |
| Cualquier otro error | Nada |

Con tres montajes, puede haber hasta **dos instancias** del componente a la vez en «Cierre» (cabecera y línea). Cada una tiene su propio `useMutation`. Se sincronizan porque las dos leen la misma clave de `006`.

### 3.5 Errores del servidor

No hay formulario, así que tampoco hay schema Zod. Los `code` de F44, todos en `shared/api/errorMessages.ts`:

| `code` | Status | Qué hace el cliente |
|---|---|---|
| `CASEFLOW_010_NOT_FOUND` | 404 | Toast |
| `CASEFLOW_010_ALREADY_PENDING` | 409 | Toast + relee `byCase` |
| `CASEFLOW_010_CASE_CLOSED` | 409 | Toast + relee `byCase`: el asistente pasa a sólo lectura |
| `CASEFLOW_010_STATUS_NOT_FOUND` | 500 | Toast (catálogo sin sembrar) |
| `CASEFLOW_010_REQUEST_FAILED` | 500 | Toast |
| `CASEFLOW_011_NOT_FOUND` | 404 | Toast |
| `CASEFLOW_011_NOT_PENDING` | 409 | Toast + relee `byCase` |
| `CASEFLOW_011_PREVIOUS_STATUS_MISSING` | 500 | Toast. Incoherencia de datos: no se reintenta |
| `CASEFLOW_011_STATUS_NOT_FOUND` | 500 | Toast |
| `CASEFLOW_011_RESOLVE_FAILED` | 500 | Toast |

El diálogo se cierra **con éxito y con error**, como en `ReopenCaseButton`. La relectura del estado ya explica lo que pasó. Nunca se muestra `errors`.

### 3.6 Estados de la vista

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga de `006` | El skeleton que ya existe en cada montaje. El botón no se pinta hasta tener `status` | — |
| Error de `006` | Lo que ya hace cada montaje (FE08, FE09). El componente no se pinta | — |
| Enviando | Botón de confirmar del diálogo deshabilitado mientras `isPending` | — |
| Sin permiso | No aplica: USER es el nivel mínimo de la ruta del expediente. Un `403 AUTH_ROLE_FORBIDDEN` inesperado va al toast por `code` | — |

### 3.7 Responsividad y accesibilidad

- Los botones usan `size="touch"` (44 px), igual que `ReopenCaseButton`. En la cabecera y en el detalle, badge y botón van en una fila con `flex-wrap`: a 375 px el botón baja de línea y no provoca scroll horizontal.
- «Venía de {{previous}}» forma parte del **texto** del badge, no de un `title` ni de un tooltip. Así lo leen los lectores de pantalla y se ve en móvil.
- El aviso del asistente lleva `role="status"`, igual que el aviso de `CLOSED`.
- En «Cierre», el botón queda dentro del `<li>` de la línea, debajo del texto, con el mismo espaciado que los enlaces de las otras líneas.

### 3.8 Claves i18n nuevas

Van a los tres archivos de idioma. El texto es el de `es`; `en` y `nl` llevan su traducción.

| Clave | Uso |
|---|---|
| `caseWorkflow.validation.request.action` | «Pedir validación» |
| `caseWorkflow.validation.request.confirmTitle` | «¿Enviar el expediente a validación?» |
| `caseWorkflow.validation.request.confirmBody` | «El expediente seguirá editable, pero no se podrá cerrar hasta que alguien resuelva la validación.» |
| `caseWorkflow.validation.request.confirmAction` | «Enviar a validación» |
| `caseWorkflow.validation.request.success` | «Expediente enviado a validación» |
| `caseWorkflow.validation.resolve.action` | «Resolver validación» |
| `caseWorkflow.validation.resolve.confirmTitle` | «¿Resolver la validación?» |
| `caseWorkflow.validation.resolve.confirmBody` | «El expediente volverá al estado {{previous}}.» |
| `caseWorkflow.validation.resolve.confirmAction` | «Resolver» |
| `caseWorkflow.validation.resolve.success` | «Validación resuelta» |
| `caseWorkflow.validation.statusWithPrevious` | «{{status}} · venía de {{previous}}» |
| `caseWizard.readOnly.pendingValidationBanner` | «Este expediente está pendiente de validación. Puedes seguir trabajando, pero no se podrá cerrar hasta resolverla.» |
| `caseWorkflow.errors.CASEFLOW_010_*` (5) y `caseWorkflow.errors.CASEFLOW_011_*` (5) | Los diez `code` de §3.5 |

---

## 4. Plan de implementación

**1. Capa de API y errores.** En `features/caseWorkflow/api.ts`, añadir:

- `useRequestValidation(caseId)` sobre `010`;
- `useResolveValidation(caseId)` sobre `011`.

Cada uno cita su código y hace un `PATCH` sin body. Si sale bien, llama a `invalidateWorkflowTransition`. En `onError`, ante los tres `409` de §3.4, invalida `['caseWorkflow','byCase',caseId]` con `isConflictOf`. Los diez `code` de §3.5 van a `shared/api/errorMessages.ts` con sus claves.

*Verificación:* `api.test.tsx` con MSW y el envelope real comprueba:

- los dos `PATCH` salen sin body y a la ruta correcta;
- un `200` invalida las tres claves;
- un `409 CASEFLOW_010_ALREADY_PENDING` y un `409 CASEFLOW_011_NOT_PENDING` invalidan sólo `byCase`;
- un `500 CASEFLOW_011_PREVIOUS_STATUS_MISSING` no invalida nada;
- `getErrorMessage` devuelve la clave propia de cada uno de los diez.

**2. `CaseValidationActions`.** Componente nuevo en `features/caseWorkflow/CaseValidationActions.tsx`, calcado de `ReopenCaseButton`:

- Lee `useCaseWorkflow(caseId)` y elige la acción según la tabla de §3.1.
- Abre un `AlertDialog` y lanza la mutación. El diálogo se cierra con éxito y con error; si hay éxito, muestra el toast `success`.
- Con `mode="resolveOnly"`, sólo pinta «Resolver validación».
- El cuerpo del diálogo de resolver interpola `previousStatus.name`.

*Verificación:* `CaseValidationActions.test.tsx` comprueba:

- con `IN_NOTIFICATION` pinta «Pedir validación», y con `REOPENED` también;
- con `PENDING_VALIDATION` pinta «Resolver validación», y el diálogo nombra el estado anterior;
- con `CLOSED` no pinta nada;
- en `resolveOnly` con `IN_NOTIFICATION` no pinta nada;
- confirmar lanza un único `PATCH`, y el botón de confirmar queda deshabilitado mientras `isPending`.

**3. Badge con estado anterior.** En `WorkflowStatusBlock` (`EsaviCaseDetailPage.tsx`) y en `CaseWizardHeader.tsx`:

- Con `PENDING_VALIDATION` y `previousStatus` no nulo, el badge usa `caseWorkflow.validation.statusWithPrevious`.
- En cualquier otro caso, sigue mostrando `status.name`.
- Se monta `<CaseValidationActions caseId>` junto al badge, en una fila con `flex-wrap`.

*Verificación:* los tests de ambos archivos pintan «Pendiente de validación · venía de En notificación» con esos datos, y sólo «Pendiente de validación» con `previousStatus: null`. El botón aparece en los dos sitios. En el detalle, con `CLOSED`, siguen apareciendo sólo `ReopenCaseButton` y «Ver expediente».

**4. Aviso del asistente.** En `CaseWizardPage.tsx`, con `PENDING_VALIDATION` y `step !== 'closure'`, se pinta un aviso `role="status"` con `caseWizard.readOnly.pendingValidationBanner`, con las mismas clases que el aviso de `CLOSED`. El asistente sigue editable.

*Verificación:* el test muestra el aviso en `notification` y no en `closure`. Los campos del paso siguen habilitados, y «Guardar» lanza su `PUT`.

**5. Línea de «Cierre».** En `ClosureStep.tsx`, la línea `notPendingValidation` incumplida renderiza `<CaseValidationActions caseId mode="resolveOnly">` debajo de su texto. `closeReadiness.ts` no cambia: la línea sigue con `links: []`, porque la acción no es un enlace a un paso.

*Verificación:* con `PENDING_VALIDATION`, el test de `ClosureStep` encuentra «Resolver validación» dentro del `<li>` de esa línea. Tras resolver, y releer con MSW, la línea pasa a cumplida y el botón desaparece.

**6. i18n y documentación.** Se añaden las claves de §3.8 a `es.json`, `en.json` y `nl.json`. En `CASE-PROCESS.md` §10 va una entrada nueva: la petición al backend de subir `ESAVI-CASEFLOW-011` a ADMIN, con su razón (hoy quien pide la revisión puede resolverla él mismo). En FE14b, el riesgo nº 2 recibe una nota que remite a FE23.

*Verificación:* `npm run i18n:check` sale en 0, y la entrada de §10 cita `ESAVI-CASEFLOW-011` y SPEC FE23.

---

## 5. Criterios de aceptación

- [ ] Las dos rutas de §3.2 se consumen. `010` y `011` salen **sin body**, cada una con su código citado en `api.ts`.
- [ ] Con cualquier estado abierto, incluido `REOPENED`, el detalle y la cabecera del asistente ofrecen «Pedir validación». Con `PENDING_VALIDATION` ofrecen «Resolver validación». Con `CLOSED`, ninguna de las dos.
- [ ] Pedir la validación desde el asistente hace, **sin recargar**, estas cuatro cosas:
  - cambia el badge a «Pendiente de validación · venía de …»;
  - muestra el aviso;
  - deja el paso editable;
  - marca como incumplida la línea `notPendingValidation` de «Cierre».
- [ ] Resolverla desde la línea de «Cierre» devuelve el caso al estado de `previousStatus`. La línea pasa a cumplida y «Cerrar expediente» se habilita si no queda otro bloqueo.
- [ ] Un caso que avanzó de fase durante la revisión vuelve, al resolverla, a la fase **nueva**: el badge ya la mostraba en «venía de …» antes de resolver.
- [ ] Con dos pestañas abiertas, resolver en una y confirmar en la otra produce un toast de `CASEFLOW_011_NOT_PENDING`. La segunda pestaña relee y muestra «Pedir validación».
- [ ] Los diez `code` de §3.5 tienen entrada en `errorMessages.ts`, y ningún toast muestra `errors`.
- [ ] Pedir la validación sobre un caso que otra pestaña acaba de cerrar produce un toast de `CASEFLOW_010_CASE_CLOSED`, y el asistente pasa a sólo lectura sin recargar.
- [ ] `CASE-PROCESS.md` §10 recoge la petición de subir `011` a ADMIN.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` también.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El badge, el aviso y los diálogos se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/caseWorkflow/ src/features/esaviCase/` no devuelve resultados nuevos.
- [ ] **Por debajo de `md`.** A 375 px, el badge largo («… · venía de En clasificación final») envuelve sin cortarse, el botón baja de línea, cada botón mide al menos 44 px y el body no hace scroll horizontal. Esto vale en el detalle, en la cabecera del asistente y en «Cierre».
- [ ] **Rol bajo.** Con `USER` se ven y funcionan las dos acciones, porque es su rol real. Un `403` inesperado va al toast sin dejar la pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos los `aria-label`. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** El estado y `previousStatus` se leen sólo de `['caseWorkflow','byCase',caseId]`. La respuesta de `010`/`011` no se copia a `useState` ni a `setQueryData`, y no hay nada en Zustand ni en la URL.

---

## 6. Decisiones tomadas y descartadas

- **Sí: dos specs, FE23 para la validación y FE24 para el ciclo de vida del registro.** Son independientes, tocan pantallas distintas, y F44 insiste en que no se confundan. Con un solo spec, pedir una revisión quedaría al lado de desactivar un registro, que es justo la confusión que F44 quiere evitar.
- **Sí: «Resolver validación» visible desde USER, que es el rol real del `011`.** *Descartado:* ocultarlo por debajo de ADMIN sólo en la UI. Escondería la acción a quien sí puede usarla y no protegería nada, porque la API la seguiría aceptando. La política de fondo, que quien pide la revisión no debería resolverla, se pide al backend (`CASE-PROCESS.md` §10).
- **Sí: un único componente en tres sitios** (detalle, cabecera del asistente y línea de «Cierre»), como `ReopenCaseButton` en FE14b. *Descartado:* ponerlo sólo en el detalle. Quien trabaja el caso está en el asistente, y tendría que salir de él para desbloquear el cierre.
- **Sí: el botón dentro de la línea `notPendingValidation`, no un enlace.** La acción no tiene paso propio. Un enlace que navegara a la cabecera de la misma pantalla sería un destino inventado. `closeReadiness.ts` no cambia: la regla es la misma, y lo único que cambia es cómo se pinta.
- **Sí: en «Cierre» se aceptan dos botones iguales**, uno en la cabecera y otro en la línea. La cabecera es la misma en todos los pasos, y la línea está donde se lee el bloqueo. Quitar el de la cabecera sólo en ese paso haría que la cabecera dejara de comportarse igual en todo el asistente. Los dos leen la misma clave, así que no se desincronizan.
- **Sí: confirmación sin motivo.** `010` no acepta body, y el rastro de quién y cuándo queda en `appDetails`. *Descartado:* un campo de texto que no viajaría a ningún sitio.
- **Sí: el asistente sigue editable en `PENDING_VALIDATION`, con un aviso informativo.** Es lo que hace el backend: avanzar de fase mueve `previousStatus` (F44 §3.5). *Descartado:* ponerlo en sólo lectura. El estado dejaría de servir para lo que sirve, que es revisar sin frenar el trabajo.
- **Sí: «venía de {{previous}}» dentro del texto del badge.** Enseña a qué estado volverá el caso sin abrir el diálogo, y funciona igual en móvil y con lector de pantalla. *Descartado:* un tooltip, que no existe en táctil.
- **Sí: invalidar y releer en lugar de `setQueryData` con la respuesta.** Mantiene la simetría con `008`/`009`, y una sola forma de actualizar el workflow. La llamada extra a `006` es barata.
- **No: bandeja propia de «pendientes de validación».** `CaseWorkflowInbox` ya filtra por `statusCode=PENDING_VALIDATION`, y se comparte por enlace.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Quien pide la validación puede resolverla él mismo al instante, así que la revisión no garantiza que la haga otra persona | Se pide al backend en `CASE-PROCESS.md` §10. `appDetails` registra quién hizo cada una, y `<AuditTrail>` lo muestra a SUPERADMIN |
| `previousStatus` a `null` con `PENDING_VALIDATION` (datos incoherentes) | El badge omite «venía de», y el `011` responde `500 PREVIOUS_STATUS_MISSING` con su toast. No se reintenta: es un problema de datos del backend |
| Nadie se entera de que hay un caso pendiente de revisión | Fuera de alcance: no hay endpoint de notificaciones. La bandeja por estado es, hoy, la forma de encontrarlos |

---

## 8. Impacto en pantallas existentes

| Archivo | Antes | Después |
|---|---|---|
| `EsaviCaseDetailPage.tsx` (`WorkflowStatusBlock`) | Badge con `status.name` y `ReopenCaseButton` con `CLOSED` | Badge con «venía de …» en revisión, más `<CaseValidationActions>` |
| `CaseWizardHeader.tsx` | Badge con `status.name` | Ídem |
| `CaseWizardPage.tsx` | Aviso sólo con `CLOSED` | Además, aviso informativo con `PENDING_VALIDATION`, fuera de «Cierre» |
| `ClosureStep.tsx` | Línea `notPendingValidation` sin salida | Con el botón «Resolver validación» dentro de la línea |
| `features/caseWorkflow/api.ts` | `008`, `009`, `007` | Además, `010` y `011` |
| `14b-case-close-reopen.md` | Riesgo nº 2 abierto | Nota que remite a FE23 |

---

## Lo que **no** está en este spec

- Desactivar y reactivar el registro del flujo (`ESAVI-CASEFLOW-005A`/`-005B`): SPEC FE24.
- Leer el workflow por su propio id (`ESAVI-CASEFLOW-003`).
- Motivo o comentario de la validación.
- Restringir la resolución a ADMIN en la interfaz.
- Notificar a un revisor.

Cada uno de esos, si aterriza, va en su propio spec.

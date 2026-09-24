# SPEC FE24 — Desactivar y reactivar el registro de flujo del expediente

> **Estado:** Borrador
> **Depende de:** SPEC FE08 (asistente y `CaseWorkflowErrorScreen`), SPEC FE09 (`CaseWorkflowInbox`, el patrón del menú de fila de `EsaviCaseListPage`), SPEC FE23 (el workflow en `['caseWorkflow','byCase',caseId]` como fuente única del estado), SPEC F44 del backend (`ESAVI-CASEFLOW-005A`/`-005B`)
> **Fecha:** 2026-09-24
> **Objetivo:** Dar al ADMIN y al SUPERADMIN la desactivación y la reactivación del registro de flujo desde la bandeja por estado, con avisos que expliquen lo que esa desactivación provoca.

---

## 1. Por qué existe este spec

Es el consumo de `ESAVI-CASEFLOW-005A` (desactivar, ADMIN) y `ESAVI-CASEFLOW-005B` (reactivar, SUPERADMIN), especificados en el SPEC F44 del backend. FE09 y FE14b los dejaron fuera a propósito: activan y desactivan el **registro** del flujo, que no es cerrar ni reabrir el expediente (`CASE-PROCESS.md` §3).

**A — La bandeja lista registros inactivos, pero no deja actuar sobre ellos.** `CaseWorkflowInbox.tsx:42` ya elige `002B` con `includeInactive`, pero el `<ResourceTable>` no recibe `onIncludeInactiveChange`, así que el toggle nunca se pinta y sólo se llega a esa vista escribiendo en la URL. Tampoco hay `rowActions` ni `isRowInactive`. Un registro de flujo sólo se desactiva o se reactiva por API.

**B — Desactivar el registro esconde el expediente también a quien lo desactivó.** `canViewInactive` es sólo SUPERADMIN (`esavi-backend/src/helpers/permissions.helper.ts:24`). `006` filtra por `isActive` a cualquier otro rol (`caseWorkflow.service.ts:482`). Así que, tras un `005A`:

- ni USER ni ADMIN pueden abrir el asistente de ese caso;
- el ADMIN que lo desactivó sigue viendo la fila en la bandeja (`002B` es ADMIN y no filtra), pero no puede entrar en ella ni deshacer la acción, porque `005B` es SUPERADMIN.

Nada de esto se avisa antes de confirmar.

**C — El error que ven después es falso.** El `404 CASEFLOW_006_NOT_FOUND` de un registro desactivado es idéntico al de un caso sin flujo. `CaseWorkflowErrorScreen` muestra `caseWizard.error.workflowMissing` («Este caso no tiene expediente de flujo», `es.json:772`), que afirma algo que en este caso no es cierto.

**D — El SUPERADMIN trabaja sin saberlo.** Para él, `006` devuelve el registro inactivo con `200`, y las transiciones y los `POST` de fase no filtran `isActive` (`caseWorkflow.service.ts:959`). El asistente se comporta como siempre, sobre un expediente que nadie más puede ver.

---

## 2. Alcance

**Dentro:**

- `useDeactivateCaseWorkflow()` y `useActivateCaseWorkflow()` en `features/caseWorkflow/api.ts`, escritos a mano, sobre `005A` y `005B`. Reciben `{ caseWorkflowId, caseId }`. Tanto si salen bien como si llega un `409` de estado ya alcanzado, invalidan `['caseWorkflow','list']` y `['caseWorkflow','byCase',caseId]`.
- **En `CaseWorkflowInbox`:**
  - el toggle «Mostrar inactivos», conectado a `searchParams.includeInactive` y visible desde ADMIN;
  - `isRowInactive`;
  - un menú de fila con «Desactivar registro de flujo» (ADMIN, filas activas) y «Reactivar registro de flujo» (SUPERADMIN, filas inactivas), cada uno con su `AlertDialog` de confirmación.
- **Aviso en el asistente** cuando `006` devuelve `isActive: false`. En la práctica sólo lo ve un SUPERADMIN, porque es el único a quien `006` le devuelve la fila. Lleva el botón «Reactivar registro».
- **Reescritura de `caseWizard.error.workflowMissing` y `workflowMissingDescription`**, para que el mensaje valga tanto para un flujo inexistente como para uno desactivado.
- Los `code` de `005A` y `005B` en `shared/api/errorMessages.ts`, y las claves nuevas en `es`, `en` y `nl`.
- **Entrada en `CASE-PROCESS.md` §10:** petición al backend de que `canViewInactive` incluya a ADMIN en `caseWorkflow`, o de que `005A` pase a SUPERADMIN.

**Fuera de alcance (otros specs):**

- **`ESAVI-CASEFLOW-003`.** Ninguna pantalla lo necesita: la fila de `002B` y `006` ya traen todo.
- **Acciones en el detalle del caso.** `EsaviCaseDetailPage` no cambia. Con el registro inactivo, un USER o un ADMIN ven el `006` fallido que ya se maneja allí (FE09), y el SUPERADMIN reactiva desde el asistente o desde la bandeja.
- **Distinguir en el cliente «flujo inexistente» de «flujo desactivado».** Llegan con el mismo `code`, así que sólo el backend podría separarlos.
- **Cerrar o reabrir el expediente** (`008`/`009`): es FE14b. **Pedir o resolver la validación** (`010`/`011`): es FE23.
- **Desactivación en masa** desde la bandeja.

---

## 3. Diseño

Es un spec de ampliación, así que sólo aparecen las sub-secciones que aplican.

### 3.1 Pantallas y rutas

No hay rutas ni entradas de navegación nuevas.

| Dónde | Archivo | Qué cambia | Visible para |
|---|---|---|---|
| Bandeja por estado | `features/esaviCase/CaseWorkflowInbox.tsx` | Toggle de inactivos, `isRowInactive`, `rowActions` con `CaseWorkflowRowActions` (en el mismo archivo, como `EsaviCaseRowActions`) y un `AlertDialog` a nivel de pestaña | Toggle desde ADMIN; «Desactivar» desde ADMIN; «Reactivar» sólo SUPERADMIN |
| Asistente | `features/esaviCase/CaseWizardPage.tsx` | Aviso de registro desactivado, con `<ReactivateCaseWorkflowButton>` | Quien reciba `isActive: false` en `006` (en la práctica, SUPERADMIN) |
| Error del asistente | `features/esaviCase/CaseWorkflowErrorScreen.tsx` | Sólo cambian los textos de `workflowMissing*` | Quien reciba `404 CASEFLOW_006_NOT_FOUND` |

**Qué acción aparece en cada fila:**

| Fila | ADMIN | SUPERADMIN |
|---|---|---|
| `isActive: true` | «Desactivar registro de flujo» | «Desactivar registro de flujo» |
| `isActive: false` | Nada | «Reactivar registro de flujo» |

Las acciones se muestran u ocultan con `useCan(ROLE_LEVELS.ADMIN)` y `useCan(ROLE_LEVELS.SUPERADMIN)`, que son los roles reales de `005A` y `005B`. Con USER, la columna de acciones no se pinta.

**Componente nuevo `features/caseWorkflow/ReactivateCaseWorkflowButton.tsx`.** Un botón con su diálogo, al estilo de `ReopenCaseButton`. No pinta nada sin SUPERADMIN. Se monta en el aviso del asistente. La bandeja no lo usa: sigue el patrón de su pestaña, con menú de fila y un único diálogo.

**Avisos del asistente.** Van apilados debajo de la cabecera, en este orden: registro desactivado, `CLOSED` (FE14b) y `PENDING_VALIDATION` (FE23). El de registro desactivado sale en todos los pasos, incluido «Cierre».

### 3.2 Endpoints consumidos

```
DELETE /api/case-workflows/:id            ESAVI-CASEFLOW-005A   ADMIN        desactivar el registro
PATCH  /api/case-workflows/activate/:id   ESAVI-CASEFLOW-005B   SUPERADMIN   reactivar el registro
GET    /api/case-workflows/admin          ESAVI-CASEFLOW-002B   ADMIN        ya consumido (FE09): ahora con toggle visible
GET    /api/case-workflows/case/:id       ESAVI-CASEFLOW-006    USER         ya consumido (FE08): isActive decide el aviso
```

- `:id` es el **`caseWorkflowId`**, no el `caseId`. Sale de la fila de `002A`/`002B`, o de `006` en el asistente.
- `005A` y `005B` responden `{ ok, message }` **sin `data`**, así que no hay nada que leer de la respuesta.
- **No se consume:** `ESAVI-CASEFLOW-003` (§2).

### 3.3 Tipos del contrato

No hay tipos nuevos. `CaseWorkflowListRow` / `CaseWorkflowDetail` (`contracts/declared/caseWorkflow.ts`) ya traen lo necesario: `caseWorkflowId`, `caseId`, `isActive` y `deletedAt`. El cuerpo de la respuesta de las dos mutaciones se ignora.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Toggle «Mostrar inactivos» | URL | `searchParams.includeInactive` (`'true'`) | Ya lo parsea `caseWorkflowFiltersSchema`. Al cambiarlo se borra `page`. Con USER se ignora (`useCaseWorkflowList` ya lo resuelve) |
| Página y filtros de la bandeja | URL | Los de FE09, sin cambios | — |
| Listado de la bandeja | TanStack Query | `['caseWorkflow','list',{…}]` | Ya existe, sin `staleTime` |
| Workflow del caso (`isActive` para el aviso) | TanStack Query | `['caseWorkflow','byCase',caseId]` | Ya existe. Fuente única del aviso |
| Fila objetivo del diálogo y acción | Componente | `useState<{ caseWorkflowId, caseId, action } \| null>` en `CaseWorkflowInbox` | Efímero, igual que `confirmTarget` en `EsaviCaseListPage` |
| Diálogo de reactivar en el asistente | Componente | `useState` en `ReactivateCaseWorkflowButton` | Efímero |
| Estado de las mutaciones | TanStack Query | `useMutation` | `isPending` deshabilita el botón de confirmar |

Nada va a Zustand ni a `draftsStore`, y no se copia ninguna fila a `useState`: el diálogo guarda sólo ids.

**Qué invalida qué:**

| Tras | Se invalida |
|---|---|
| `200` de `005A` o `005B` | `['caseWorkflow','list']` y `['caseWorkflow','byCase',caseId]` |
| `409 CASEFLOW_005A_ALREADY_INACTIVE` / `409 CASEFLOW_005B_ALREADY_ACTIVE` | Las mismas dos: otra persona se adelantó, y la relectura pinta la fila en su estado real |
| Cualquier otro error | Nada |

**`['esaviCase']` no se invalida.** El `005A` sobre el flujo no toca la fila del caso, que es la misma regla de FE09 §3.4, en sentido inverso.

### 3.5 Errores del servidor

No hay formulario. Los `code`, todos en `shared/api/errorMessages.ts`:

| `code` | Status | Qué hace el cliente |
|---|---|---|
| `CASEFLOW_005A_NOT_FOUND` | 404 | Toast |
| `CASEFLOW_005A_ALREADY_INACTIVE` | 409 | Toast + invalida (§3.4) |
| `CASEFLOW_005A_DELETE_FAILED` | 500 | Toast |
| `CASEFLOW_005B_NOT_FOUND` | 404 | Toast |
| `CASEFLOW_005B_ALREADY_ACTIVE` | 409 | Toast + invalida |
| `CASEFLOW_005B_ACTIVATE_FAILED` | 500 | Toast |
| `AUTH_ROLE_FORBIDDEN` | 403 | Toast por `code`. Ocurre si el rol cambió con la pestaña abierta |

El diálogo se cierra **con éxito y con error**, como en `ReopenCaseButton`. Nunca se muestra `errors`.

### 3.6 Estados de la vista

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | La bandeja, igual que en FE09. En el asistente, el aviso no se pinta hasta tener `006` | — |
| Vacío con el toggle encendido | El estado vacío de FE09 | `caseWorkflow.list.empty` / `emptyFiltered` |
| Error | La bandeja, igual que en FE09. El asistente, con `404 CASEFLOW_006_NOT_FOUND`, muestra la pantalla con los textos nuevos | `caseWizard.error.workflowMissing*` |
| Enviando | Botón de confirmar deshabilitado mientras `isPending` | — |
| Sin permiso | USER: sin toggle y sin columna de acciones. ADMIN: sin «Reactivar» | — |

### 3.7 Responsividad y accesibilidad

- Por debajo de `md`, la bandeja ya colapsa a tarjetas (FE09: código, estado y fecha de apertura). El menú de fila va en la tarjeta, como en el resto de listados de `<ResourceTable>`, y la tarjeta inactiva lleva el mismo tinte.
- El disparador del menú lleva un `aria-label` por i18n. Los elementos del menú y los botones de los diálogos miden al menos 44 px (`size="touch"`).
- El aviso del asistente lleva `role="status"`, como los otros dos. A 375 px, el botón baja de línea.

### 3.8 Claves i18n nuevas y modificadas

Van a los tres archivos de idioma. El texto es el de `es`; `en` y `nl` llevan su traducción.

| Clave | Texto (es) |
|---|---|
| `caseWorkflow.lifecycle.deactivate.action` | «Desactivar registro de flujo» |
| `caseWorkflow.lifecycle.deactivate.confirmTitle` | «¿Desactivar el registro de flujo?» |
| `caseWorkflow.lifecycle.deactivate.confirmBody` | «Nadie, salvo un superadministrador, podrá abrir este expediente, incluido tú. Sólo un superadministrador puede reactivarlo. Esto no cierra el caso: para eso está “Cerrar expediente”.» |
| `caseWorkflow.lifecycle.deactivate.confirmAction` | «Desactivar registro» |
| `caseWorkflow.lifecycle.deactivate.success` | «Registro de flujo desactivado» |
| `caseWorkflow.lifecycle.activate.action` | «Reactivar registro de flujo» |
| `caseWorkflow.lifecycle.activate.confirmTitle` | «¿Reactivar el registro de flujo?» |
| `caseWorkflow.lifecycle.activate.confirmBody` | «El expediente volverá a estar visible para todos los usuarios, en el estado en que quedó.» |
| `caseWorkflow.lifecycle.activate.confirmAction` | «Reactivar registro» |
| `caseWorkflow.lifecycle.activate.success` | «Registro de flujo reactivado» |
| `caseWorkflow.list.rowActions` | `aria-label` del menú de fila: «Acciones del registro» |
| `caseWizard.readOnly.inactiveWorkflowBanner` | «El registro de flujo de este expediente está desactivado. Sólo los superadministradores pueden verlo.» |
| `caseWizard.error.workflowMissing` *(modificada)* | «Este expediente no tiene un registro de flujo activo» |
| `caseWizard.error.workflowMissingDescription` *(modificada)* | «El caso {{caseCode}} no tiene un registro de flujo activo: puede no existir o estar desactivado. Pide a un superadministrador que lo revise.» |
| `caseWorkflow.errors.CASEFLOW_005A_*` (3) y `caseWorkflow.errors.CASEFLOW_005B_*` (3) | Los seis `code` de §3.5 |

El botón del aviso reutiliza `caseWorkflow.lifecycle.activate.confirmAction`, «Reactivar registro». La etiqueta del toggle reutiliza la clave común «Mostrar inactivos» que ya usa `<ResourceTable>`.

---

## 4. Plan de implementación

**1. Capa de API y errores.** En `features/caseWorkflow/api.ts` se añaden dos hooks, `useDeactivateCaseWorkflow()` (`005A`, `DELETE`) y `useActivateCaseWorkflow()` (`005B`, `PATCH` sin body):

- los dos citan su código;
- los dos reciben `{ caseWorkflowId, caseId }`;
- si salen bien, invalidan las dos claves de §3.4;
- en `onError`, con `isConflictOf`, invalidan esas mismas claves ante el `409` de estado ya alcanzado.

Los seis `code` de §3.5 se añaden a `shared/api/errorMessages.ts` con sus claves.

*Verificación:* `api.test.tsx`, con MSW y el envelope real `{ ok, message }` sin `data`, comprueba:

- el `DELETE` sale a `/case-workflows/<caseWorkflowId>` y el `PATCH` a `/case-workflows/activate/<caseWorkflowId>`, nunca con el `caseId`;
- un `200` invalida `list` y `byCase`, y no invalida `['esaviCase']`;
- un `409 CASEFLOW_005A_ALREADY_INACTIVE` invalida las mismas dos;
- un `500 CASEFLOW_005B_ACTIVATE_FAILED` no invalida nada;
- `getErrorMessage` devuelve la clave propia de cada uno de los seis `code`.

**2. Toggle de inactivos en la bandeja.** En `CaseWorkflowInbox.tsx` se añade `handleIncludeInactiveChange`: escribe o borra `includeInactive` y borra `page`. Se pasan al `<ResourceTable>` `includeInactive`, `onIncludeInactiveChange` e `isRowInactive={(row) => !row.isActive}`.

*Verificación:* los tests de la bandeja comprueban que:

- con ADMIN el toggle se pinta, y al encenderlo la petición va a `/case-workflows/admin` y la URL lleva `includeInactive=true` sin `page`;
- con USER el toggle no se pinta;
- una fila `isActive: false` lleva el tinte.

**3. Menú de fila y diálogo.** En `CaseWorkflowInbox.tsx` se añaden `CaseWorkflowRowActions`, con la tabla de §3.1, y el `AlertDialog` de la pestaña con `confirmTarget`, que guarda sólo ids. El diálogo usa los textos de `caseWorkflow.lifecycle.*`. Al confirmar se lanza la mutación. El diálogo se cierra con éxito y con error, y con éxito se muestra el toast `success`.

*Verificación:* los tests comprueban que:

- con ADMIN, una fila activa ofrece «Desactivar registro de flujo» y una inactiva no ofrece nada;
- con SUPERADMIN, una fila inactiva ofrece «Reactivar registro de flujo»;
- con USER no hay columna de acciones;
- el diálogo de desactivar contiene el aviso completo;
- confirmar lanza un único `DELETE`, y el botón de confirmar queda deshabilitado mientras `isPending`.

**4. `ReactivateCaseWorkflowButton`.** Es un componente nuevo en `features/caseWorkflow/`, calcado de `ReopenCaseButton`, sobre `useActivateCaseWorkflow`. Sin SUPERADMIN no pinta nada.

*Verificación:* su test comprueba que con ADMIN no pinta nada, y que con SUPERADMIN pinta el botón, abre el diálogo y lanza un único `PATCH` con el `caseWorkflowId`.

**5. Aviso en el asistente.** En `CaseWizardPage.tsx`, cuando `workflow.data.isActive === false`, se pinta el aviso `role="status"` con `caseWizard.readOnly.inactiveWorkflowBanner` y `<ReactivateCaseWorkflowButton>`. Aparece en todos los pasos y va antes de los avisos de `CLOSED` y `PENDING_VALIDATION`.

*Verificación:* el test comprueba que con `isActive: false` el aviso sale en `notification` y en `closure`, que con `CLOSED` además los dos avisos salen en el orden de §3.1, y que tras reactivar (con MSW releyendo `isActive: true`) el aviso desaparece.

**6. Textos del error y documentación.**

- Se reescriben `caseWizard.error.workflowMissing` y `workflowMissingDescription`, y se añaden las claves de §3.8, en `es.json`, `en.json` y `nl.json`.
- Se añade una entrada en `CASE-PROCESS.md` §10 con la petición al backend: que `canViewInactive` incluya a ADMIN en `caseWorkflow`, o que `005A` pase a SUPERADMIN. La entrada lleva la razón de §1B.

*Verificación:* `npm run i18n:check` sale en 0, y el test de `CaseWorkflowErrorScreen` con `CASEFLOW_006_NOT_FOUND` muestra «Este expediente no tiene un registro de flujo activo».

---

## 5. Criterios de aceptación

- [ ] Se consumen las dos rutas de §3.2, cada una con su código citado en `api.ts`, y las dos usan el `caseWorkflowId` en la URL.
- [ ] Con ADMIN, en la bandeja:
  - encender «Mostrar inactivos» muestra las filas desactivadas con tinte;
  - recargar la página conserva la vista;
  - el enlace copiado reproduce la misma vista.
- [ ] Un ADMIN desactiva una fila activa: el diálogo muestra el aviso completo y, al confirmar, la fila desaparece con el toggle apagado o queda con tinte con el toggle encendido, sin recargar.
- [ ] Después de eso, ese mismo ADMIN abre el asistente del caso y ve «Este expediente no tiene un registro de flujo activo», no el texto anterior que hablaba de un expediente inexistente.
- [ ] Un SUPERADMIN abre el asistente de ese caso: ve el aviso de registro desactivado en todos los pasos, reactiva desde el aviso, y el aviso desaparece sin recargar.
- [ ] Con dos pestañas abiertas, desactivar en una y confirmar la desactivación en la otra produce el toast de `CASEFLOW_005A_ALREADY_INACTIVE`, y la segunda pestaña pinta la fila ya inactiva.
- [ ] Desactivar o reactivar no invalida `['esaviCase']`.
- [ ] Los seis `code` de §3.5 tienen entrada en `errorMessages.ts`, y ningún toast muestra `errors`.
- [ ] `CASE-PROCESS.md` §10 recoge la petición sobre `canViewInactive` / `005A`.
- [ ] `npm run check` y `npx tsc --noEmit -p tsconfig.app.json` salen en 0.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El tinte de fila inactiva, el aviso y los diálogos se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/caseWorkflow/ src/features/esaviCase/` no devuelve resultados nuevos.
- [ ] **Por debajo de `md`.** A 375 px:
  - la bandeja colapsa a tarjetas con los tres campos de FE09, con el menú de fila y el tinte de las inactivas;
  - el aviso del asistente envuelve sin cortarse;
  - cada elemento del menú y cada botón mide al menos 44 px;
  - el body no hace scroll horizontal.
- [ ] **Rol bajo.** Con `USER` no aparecen ni el toggle ni la columna de acciones. Con `ADMIN` no aparece «Reactivar». Un `403` inesperado va al toast sin dejar la pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluido el `aria-label` del menú de fila. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** El toggle vive sólo en `searchParams`. `isActive` se lee sólo de las claves de TanStack Query de §3.4. El diálogo guarda ids, no filas. Nada va a Zustand.

---

## 6. Decisiones tomadas y descartadas

- **Sí: las acciones van en la bandeja por estado, y en ningún otro listado ni en el detalle.** La bandeja es la única vista donde el flujo aparece como **registro**, con su `caseWorkflowId` y su propio `isActive`. Si estuvieran en el listado de casos o en el detalle, quedarían al lado de «Cerrar» y «Reabrir», y eso reproduce la confusión que F44 más quiere evitar.
- **Sí: se muestran según el rol real de cada ruta**, `005A` para ADMIN y `005B` para SUPERADMIN, aunque la combinación deje al ADMIN sin forma de deshacer lo que hizo. *Descartado:* ocultar «Desactivar» por debajo de SUPERADMIN sólo en la interfaz, porque escondería una acción a quien sí puede ejecutarla y no protegería nada. El desajuste se pide al backend (`CASE-PROCESS.md` §10).
- **Sí: el diálogo de desactivar explica la consecuencia completa**, también la que afecta a quien confirma. Sin ese aviso, el primer ADMIN que lo use descubrirá el efecto al volver a abrir el caso.
- **Sí: se reescribe `workflowMissing` para que valga en los dos casos.** El cliente no puede distinguir «no existe» de «desactivado», porque llegan con el mismo `code`. Un mensaje que afirma lo que no puede saber es peor que uno que reconoce las dos posibilidades. *Descartado:* averiguar la causa con una segunda llamada, `002B` filtrado por `caseId`. Sólo funcionaría con ADMIN, añade una petición a una pantalla de error y no resuelve nada para USER.
- **Sí: aviso con «Reactivar» en el asistente para SUPERADMIN.** Es el único rol que trabaja sobre un registro inactivo, y el backend no lo frena. *Descartado:* dejar al SUPERADMIN sin ninguna señal.
- **Sí: hooks escritos a mano en `features/caseWorkflow/api.ts`, no `createResource`.** Es la misma razón de FE08 §6: el workflow se lee por `caseId`, sus escrituras son acciones, y las dos claves que hay que invalidar no son `[config.key]`.
- **Sí: invalidar también ante el `409` de estado ya alcanzado.** Significa que otra persona se adelantó, y releer es la explicación más clara.
- **No: invalidar `['esaviCase']`.** El `005A` del flujo no toca la fila del caso.
- **No: consumir `ESAVI-CASEFLOW-003`.** Ninguna vista lee un flujo por su propio id.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Un ADMIN desactiva un flujo y se queda sin acceso al expediente y sin forma de deshacerlo | El diálogo lo dice antes de confirmar, y se pide al backend que ajuste `canViewInactive` o el rol de `005A` (§10) |
| Un registro desactivado sin querer queda invisible para todos hasta que intervenga un SUPERADMIN | El SUPERADMIN lo encuentra en la bandeja con el toggle encendido, o en el asistente por el aviso. Además, `<AuditTrail>` registra quién lo desactivó |
| Alguien usa «Desactivar registro» creyendo que así cierra el caso | El texto nunca dice «caso» ni «cerrar» como acción, el diálogo remite a «Cerrar expediente», y la acción sólo existe en la bandeja |

---

## 8. Impacto en pantallas existentes

| Archivo | Antes | Después |
|---|---|---|
| `CaseWorkflowInbox.tsx` | Sin toggle visible, sin tinte y sin acciones | Con toggle (ADMIN), tinte, menú de fila y diálogo |
| `CaseWizardPage.tsx` | Avisos de `CLOSED` y (FE23) `PENDING_VALIDATION` | Además, el aviso de registro desactivado, primero en la pila |
| `CaseWorkflowErrorScreen.tsx` | «Este caso no tiene expediente de flujo» | «Este expediente no tiene un registro de flujo activo», sin cambios de código |
| `features/caseWorkflow/api.ts` | `006`–`011` y `002A`/`002B` | Además, `005A` y `005B` |

---

## Lo que **no** está en este spec

- `ESAVI-CASEFLOW-003`.
- Acciones sobre el registro de flujo en el detalle del caso o en el listado de casos.
- Distinguir en el cliente un flujo inexistente de uno desactivado.
- Desactivación en masa.
- Cerrar, reabrir y validar el expediente (FE14b, FE23).

Cada uno de esos, si aterriza, va en su propio spec.

# SPEC FE17 — Expediente cerrado rechazado por el servidor

> **Estado:** Aprobado
> **Depende de:** SPEC F61 del backend (guardia `assertCaseIsOpen`, en la rama `spec-61-closed-case-write-guard`, todavía sin fusionar), SPEC FE08 (armazón del wizard), SPEC FE11 (manejo de `CASEFLOW_012_CASE_CLOSED`), SPEC FE14b (cierre, reapertura y modo de sólo lectura)
> **Fecha:** 2026-09-21
> **Objetivo:** Cuando el servidor rechaza con un 409 `*_CASE_CLOSED` una escritura sobre un expediente cerrado, el wizard pasa a sólo lectura sin error genérico, y el paso de apertura del caso deja de estar editable con el caso cerrado.

---

## 1. Por qué existe este spec

El SPEC F61 del backend cierra el pedido de `CASE-PROCESS.md` §10.3. Si el `caseWorkflow` está `CLOSED`, las 85 escrituras sobre el contenido del expediente responden `409` con un `code` de la forma `<PREFIJO>_<op>_CASE_CLOSED` (`esavi-backend/references/CONVENTIONS.md` §11, «Expediente cerrado»). El cliente tiene tres desajustes frente a ese contrato.

**A — Sólo un código de los 85 tiene comportamiento propio.** `ClassificationStep.tsx:269`, `FinalClassificationStep.tsx:338` y `NotificationStep.tsx:585` interceptan `CASEFLOW_012_CASE_CLOSED` y marcan el caso como `CLOSED` en la caché, cada uno con su copia del mismo bloque. Con los códigos nuevos (`NOTIFEVT_004_CASE_CLOSED`, `INVDIAG_005A_CASE_CLOSED`, …) no pasa nada parecido. El toast sale bien, porque `getErrorMessage` recurre al `message` del servidor, pero el wizard sigue editable. El usuario puede volver a guardar y recibir el mismo 409 hasta que algo vuelva a pedir `ESAVI-CASEFLOW-006`. `QueryClient` se crea sin `MutationCache` (`providers.tsx:9`), así que no hay ningún sitio común donde reaccionar.

**B — Un diálogo abierto sobrevive a la carrera.** Las listas de satélites dejan de ofrecer «Añadir», «Editar» y «Retirar» cuando reciben `readOnly`/`disabled`. Pero si el diálogo ya estaba abierto cuando otra persona cerró el caso, sigue abierto y habilitado, y cada «Guardar» termina en otro 409.

**C — El paso de apertura del caso no mira `CLOSED`.** `CaseOpeningStep.tsx` no lee el estado del flujo, y `NotifierList` (`CaseOpeningStep.tsx:333`) no recibe `readOnly`. Con el caso cerrado siguen habilitados el `PUT` de `ESAVI-CASE-004` y las cuatro escrituras de `notifier`. Los otros cuatro pasos con contenido sí pasan a sólo lectura. Con F61 esto ya no es un hueco de seguridad, porque el servidor rechaza. Queda como incumplimiento de `CASE-PROCESS.md` §4.5: el wizard entero es de sólo lectura, sin botones que el usuario no puede usar.

**Y la documentación queda desfasada.** `CASE-PROCESS.md` §4.5 (la nota «El bloqueo es del cliente, no del backend»), §6.3 y §10.3 describen el estado anterior a F61.

**Lo que este spec no cambia.** Los formularios siguen deshabilitándose con `CLOSED` (punto 2 del aviso del backend). El 409 no sustituye al modo de sólo lectura: es la red para quien se lo salte o para la carrera con un `ESAVI-CASEFLOW-008` simultáneo.

---

## 2. Alcance

**Dentro:**

- **Un manejador global de `_CASE_CLOSED`** en el `MutationCache` del `QueryClient`. Si el `code` de un `EsaviApiError` cumple `/_CASE_CLOSED$/`, invalida `['caseWorkflow']` entero. No muestra toast, porque el toast sigue en el `catch` de cada mutación.
- **Sacar la creación del `QueryClient` de `providers.tsx`** a una función propia, para que los tests creen el mismo cliente con el mismo manejador.
- **Quitar el caso especial de `CASEFLOW_012_CASE_CLOSED` de los tres pasos que lo copian** (`ClassificationStep`, `FinalClassificationStep` y `NotificationStep`). Desaparecen el parche de caché y el `if`. `CASEFLOW_012_CASE_CLOSED` conserva su entrada en `ERROR_CODE_KEYS` y su texto propio.
- **Cerrar el diálogo abierto** cuando la lista que lo abrió pasa a `readOnly`/`disabled`. Aplica a todas las listas de satélites de notificación e investigación y a `NotifierList`.
- **Sólo lectura en `CaseOpeningStep`**, igual que en los otros cuatro pasos: el formulario del caso deshabilitado, sin «Guardar», y `NotifierList` con `readOnly`.
- **Conservar `draftsStore` ante un 409.** El borrador no se borra. Si un ADMIN reabre el caso, `resolveDraftConflict` resuelve el conflicto como ya lo hace.
- **Tests con MSW** para tres escrituras: una cabecera de fase (`PUT`), un satélite con `DELETE` y el `PUT` de `ESAVI-CASE-004`.
- **Comprobación manual contra el backend local** en la rama `spec-61-closed-case-write-guard`, recorriendo las escrituras que el aviso enumera.
- **Actualizar `CASE-PROCESS.md`:** §4.5, §6.3 y §10.3 (pasa a **resuelto**, con referencia a SPEC F61), más el recuento de §10.

**Fuera de alcance (otros specs):**

- **Marcar el caso como cerrado en la caché al instante** mediante `meta: { caseId }` en cada mutación. Se descartó (opción B): cuesta unos 40 cambios para ahorrar una petición de `006`.
- **Registrar los 85 códigos en `ERROR_CODE_KEYS`.** El `message` del servidor ya viene traducido y dice qué hacer (`CONVENTIONS.md` §6.2).
- **`patient`.** F61 no lo congela, porque se comparte entre casos, y este spec no cambia cómo se comporta `PatientStep` con el caso cerrado.
- **Cambios en «Reabrir».** `ReopenCaseButton` (SPEC FE14b) y el aviso de `CaseWizardPage.tsx:132` ya cubren los puntos 2 y 3 del aviso del backend.
- **Acciones del listado de casos** (`ESAVI-CASE-005A`/`005B`). F61 no las alcanza.
- **Commitear la regeneración de `API-ROUTES.md` de SPEC F60.** Es un cambio aparte, sin commitear, que no tiene que ver con este spec.

---

## 3. Diseño

Es un spec transversal de ampliación, así que no hay pantallas nuevas. Se usan las subsecciones que aplican, con tablas de antes y después.

### 3.1 Qué cambia

| Pieza | Antes | Después |
|---|---|---|
| `QueryClient` | `new QueryClient()` sin opciones (`app/providers.tsx:9`) | Lo crea `createAppQueryClient()` en `shared/api/queryClient.ts`, con un `MutationCache` cuyo `onError` reconoce `_CASE_CLOSED`. `providers.tsx` y los tests usan esa misma función |
| 409 `*_CASE_CLOSED` en cualquier escritura del expediente | Toast con el `message` del servidor; el wizard sigue editable | Mismo toast, y además se invalida `['caseWorkflow']` entero. La consulta montada vuelve a pedir `ESAVI-CASEFLOW-006`, recibe `CLOSED` y el paso pasa a sólo lectura |
| `CASEFLOW_012_CASE_CLOSED` en `ClassificationStep`, `FinalClassificationStep` y `NotificationStep` | Cada uno con su `if` que marca `CLOSED` en la caché | Sin rama propia: lo cubre el manejador global. Conserva su texto en `ERROR_CODE_KEYS` |
| Diálogo de formulario o confirmación de retirar abierto cuando la lista pasa a sólo lectura | Sigue abierto y habilitado | Se cierra. `useCloseWhenReadOnly(readOnly, close)` en `shared/hooks/`, usado por las doce listas |
| `CaseOpeningStep` con `CLOSED` | Editable: «Guardar» y las escrituras de `notifier` habilitadas | Formulario deshabilitado y sin «Guardar». Queda «Siguiente». `NotifierList` recibe `readOnly` |
| `draftsStore` ante un 409 | — | Se conserva y no se borra (decisión 5) |

**Cómo reconoce el manejador el error.** Un `EsaviApiError` cuyo `code` cumple `/_CASE_CLOSED$/`. Lo decide un predicado puro, `isCaseClosedError(error)`, exportado junto al manejador. Lee `code` como si pudiera faltar (`CONVENTIONS.md` §6.2), porque un `'UNKNOWN_ERROR'` o un error que no sea `EsaviApiError` no cumplen el patrón y no disparan nada. El mismo sufijo ya cubre `CASEFLOW_007`, `_010` y `_012`, así que un solo predicado vale para los tres anteriores y los 85 nuevos.

**Por qué el manejador no muestra toast.** Cada `catch` del expediente ya muestra `toast.error(getErrorMessage(err))`, y con un código no registrado `getErrorMessage` devuelve el `message` del servidor tal cual. Si el global también lo mostrara, saldría dos veces. El reparto queda así: **el `catch` local muestra el toast y el global se ocupa del estado**.

**Las doce listas afectadas.** Son estas:

- Notificación: `EventList`, `MedicationList`, `VaccineList`, `DiluentList`, `MedicalHistoryList` y `PregnancyComplicationList`.
- Investigación: `TeamMemberList`, `DiagnosticList`, `EvaluationInstitutionList`, `VaccineAdministeredList` y `NewbornConditionList`.
- Apertura del caso: `NotifierList`.

`DiluentList` no tiene diálogo propio: edita en línea (`expanded`) y vive dentro de `VaccineFormDialog`. El hook cierra su fila expandida y su confirmación de retirar.

### 3.2 Endpoints consumidos

No se consume ningún endpoint nuevo. Se usan estos dos, copiados de `API-ROUTES.md`:

```
GET    /api/case-workflows/case/:id          ESAVI-CASEFLOW-006   USER    lo vuelve a pedir la invalidación
PATCH  /api/case-workflows/case/:id/reopen   ESAVI-CASEFLOW-009   ADMIN   sin cambios (ReopenCaseButton, SPEC FE14b)
```

Las escrituras que pueden responder `409 *_CASE_CLOSED` son las 85 de SPEC F61. Ya las consumen FE10–FE14b y este spec no cambia ninguna llamada. Las que sí gana en sólo lectura `CaseOpeningStep`:

```
PUT    /api/esavi-cases/:id                  ESAVI-CASE-004       USER
POST   /api/notifiers                        ESAVI-NOTIFIER-001   USER
PUT    /api/notifiers/:id                    ESAVI-NOTIFIER-004   USER
DELETE /api/notifiers/:id                    ESAVI-NOTIFIER-005A  USER
```

`ESAVI-NOTIFIER-005B` (SUPERADMIN) no lo expone esta pantalla, y este spec no cambia eso.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Estado del flujo (`CLOSED` o no) | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | **La única fuente.** El 409 no lo copia a ningún otro sitio: invalida la clave y deja que el `006` diga la verdad |
| `isClosed` en cada paso | Derivado en render | `workflow.data.status.code === 'CLOSED'` | Se deriva, no se guarda. `CaseOpeningStep` lo obtiene de `useCaseWorkflowByCase(caseId)`, la misma clave que el resto |
| Diálogo abierto y fila a retirar | Componente | `useState` de cada lista | Efímero. `useCloseWhenReadOnly` lo limpia al pasar a sólo lectura |
| Lo tecleado sin guardar | Zustand | `draftsStore`, `(caseId, stage)` | **Se conserva ante el 409.** Tras reabrir, `resolveDraftConflict` decide igual que hoy |
| El 409 en sí | Ninguna | — | No se guarda: el toast es efímero y el estado se lee del `006` |

**Qué invalida qué.** Un 409 `*_CASE_CLOSED` invalida `['caseWorkflow']` entero: `byCase` de cualquier caso más el listado de la bandeja. TanStack sólo vuelve a pedir las consultas montadas, que en el wizard son el `006` del caso abierto. No se invalidan las claves de la entidad que falló, porque el 409 no cambió nada en la base (SPEC F61, punto 3).

**Una excepción consciente.** Entre el 409 y la respuesta del `006` pasa un intervalo corto, del orden de la latencia de una petición, en el que el paso todavía se ve editable. Se acepta a cambio de no pasar `meta: { caseId }` por unas 40 mutaciones (decisión 1).

### 3.5 Errores

| Code | Dónde se maneja | Qué pasa |
|---|---|---|
| Cualquiera que cumpla `/_CASE_CLOSED$/` | `MutationCache.onError` (global) | Invalida `['caseWorkflow']` |
| El mismo | `catch` local de cada mutación | `toast.error(getErrorMessage(err))`, que muestra el `message` del servidor |
| `CASEFLOW_012_CASE_CLOSED` y `CASEFLOW_007_CASE_CLOSED` | Igual que los demás | Muestran su texto propio de `ERROR_CODE_KEYS` |

Ningún `errorFieldMap` lleva un código `_CASE_CLOSED`: no es un error de campo.

### 3.6 Estados de la pantalla

No hay estados nuevos. Después del 409, el paso muestra el mismo modo `CLOSED` que ya definen SPEC FE14b y `CaseWizardPage.tsx:132`, incluido su aviso: «Reabrir» para ADMIN y «pide a un administrador» para USER. En `CaseOpeningStep` se ve el mismo aviso, que ya se pinta para todo paso distinto de `closure`.

### 3.7 Accesibilidad

- El aviso de sólo lectura ya es `role="status"`, así que el cambio de modo se anuncia.
- Al cerrarse un diálogo, Radix devuelve el foco al elemento que lo abrió. Si ese botón desaparece porque la lista pasó a sólo lectura, el foco no puede volver a él. `useCloseWhenReadOnly` no gestiona el foco. Queda anotado en §7.

### 3.8 Claves i18n nuevas

Ninguna. El texto del 409 lo da el servidor, y el aviso de sólo lectura y los textos de `CASEFLOW_012` y `CASEFLOW_007` ya existen.

---

## 4. Plan de implementación

Cada paso termina en verde: `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint` y los tests del paso. `npm run build` no sirve como comprobación de tipos: su `tsc --noEmit` no revisa nada.

**1. `createAppQueryClient()` e `isCaseClosedError()`.** Nuevo archivo `shared/api/queryClient.ts` con:

- el predicado puro `isCaseClosedError(error: unknown): boolean`, que es `EsaviApiError` y `code` que cumple `/_CASE_CLOSED$/`;
- la función que construye el `QueryClient` con `MutationCache({ onError })`. Si el error cumple el predicado, `queryClient.invalidateQueries({ queryKey: ['caseWorkflow'] })`. No muestra toast.

Comentario con la cita a SPEC F61 y a `ESAVI-CASEFLOW-006`.

*Verificación:* `queryClient.test.ts` comprueba lo siguiente:

- el predicado es verdadero con `NOTIFEVT_004_CASE_CLOSED` y `CASEFLOW_012_CASE_CLOSED`;
- es falso con `CASE_CLOSED_X`, `UNKNOWN_ERROR`, un `Error` sin `code` y `undefined`;
- una mutación que falla con `INVDIAG_005A_CASE_CLOSED` invalida `['caseWorkflow','byCase','c1']` y `['caseWorkflow','list',{}]`;
- una que falla con `INVDIAG_005A_NOT_FOUND` no invalida nada.

**2. `providers.tsx` usa `createAppQueryClient()`.** Sustituye el `new QueryClient()` de la línea 9. No cambia nada más. Los tests existentes que crean su propio `QueryClient` se quedan como están. Sólo los de este spec usan `createAppQueryClient()`.

*Verificación:* la suite completa sigue en verde.

**3. Los tres pasos sin caso especial.** En `ClassificationStep`, `FinalClassificationStep` y `NotificationStep` se quita la rama de `CASEFLOW_012_CASE_CLOSED`: el comentario, el `if`, el `setQueryData` y el `return`. El código pasa por el `toast.error(getErrorMessage(err))` general (en `NotificationStep`, con el mismo `return false` de siempre). `ERROR_CODE_KEYS` conserva `CASEFLOW_012_CASE_CLOSED`, pero su comentario pasa a decir que el comportamiento lo pone el manejador global. `CaseWorkflowDetail` deja de importarse en los tres.

*Verificación:* el test de `FinalClassificationStep` que ya cubría el 012 y uno nuevo en `ClassificationStep`, ambos montados con `createAppQueryClient()`, ven el paso en sólo lectura después del 409, porque el `006` que sigue a la invalidación devuelve `CLOSED`. `NotificationStep` no tenía test del 012 y queda cubierto por el del paso 7.

**4. `useCloseWhenReadOnly(readOnly, close)`.** Nuevo en `shared/hooks/`. Llama a `close()` cuando `readOnly` pasa de `false` a `true`. No hace nada al montar con `true`, ni al volver a `false`.

*Verificación:* `useCloseWhenReadOnly.test.ts` cubre las tres transiciones con `renderHook`.

**5. Las once listas de notificación e investigación usan el hook.** `close` pone el diálogo en `{ open: false, … }` y `removeTarget` en `null`. En `DiluentList`, además, `expanded` en `null`. `readOnly` o `disabled` según como la lista llame hoy a su prop, sin renombrarla.

*Verificación:* un test por familia (`EventList` y `DiagnosticList`). Con el diálogo abierto, un `rerender` con `readOnly`/`disabled` en `true` lo cierra.

**6. `CaseOpeningStep` en sólo lectura.** Lee `useCaseWorkflow(caseId)` (`caseWorkflow/api.ts`) cuando hay caso. Con `CLOSED`:

- el formulario del caso queda dentro de un `<fieldset disabled>`;
- `<ResourceForm>` gana la prop opcional `hideActions`, que no pinta su barra de acciones, y aquí se pone en `true`. Es retrocompatible: ningún otro llamador la pasa;
- «Guardar» no se pinta;
- «Siguiente» sigue.

`NotifierList` gana la prop `readOnly`: sin «Añadir», «Editar» ni «Retirar», y con `useCloseWhenReadOnly`. En la creación (todavía sin caso) no hay flujo que leer y nada cambia.

*Verificación:* test de `CaseOpeningStep` con el flujo `CLOSED`: campos deshabilitados, sin «Guardar», y `NotifierList` sin acciones.

**7. Tests de integración del 409.** Con MSW y `createAppQueryClient()`, en tres escrituras:

- `PUT` de una cabecera: `NOTIFCN_004_CASE_CLOSED` en `NotificationStep`;
- `DELETE` de un satélite: `INVDIAG_005A_CASE_CLOSED` en `DiagnosticList` dentro de `InvestigationStep`;
- `PUT` de `ESAVI-CASE-004`: `CASE_004_CASE_CLOSED` en `CaseOpeningStep`.

En los tres, el primer `006` devuelve `OPEN` y el siguiente `CLOSED`.

*Verificación:* los tres comprueban un solo toast con el `message` del servidor, una nueva petición al `006` y el paso en sólo lectura. El segundo, además, que el diálogo de confirmación se cerró.

**8. `CASE-PROCESS.md`.**

- §4.5: la nota «El bloqueo es del cliente, no del backend» pasa a decir que desde SPEC F61 el servidor rechaza con `409 *_CASE_CLOSED`, y que la interfaz sigue deshabilitando los formularios;
- §6.3: se ajusta en el mismo sentido;
- §10.3 pasa a **resuelto**, con fecha 2026-09-21 y referencia a SPEC F61;
- se actualiza el recuento de la cabecera de §10 y la fila de la tabla de `:26`.

*Verificación:* `grep -n "no mira el workflow\|no consultan el .caseWorkflow" references/CASE-PROCESS.md` no devuelve la afirmación antigua sin matizar.

**9. Comprobación manual contra el backend.** Con `esavi-backend` en `spec-61-closed-case-write-guard` y un caso cerrado, hay que saltarse la interfaz para provocar el 409. La forma más directa: abrir el wizard en dos pestañas, cerrar el caso en una y escribir en la otra. Se prueban:

- añadir un diagnóstico;
- retirar una vacuna administrada;
- editar un miembro del equipo;
- editar un evento de notificación;
- guardar la clasificación final;
- guardar la apertura del caso.

*Verificación:* en cada una, un solo toast con el texto del servidor, el paso en sólo lectura y ningún error genérico. Se apunta el resultado en la nota de implementación del spec.

---

## 5. Criterios de aceptación

- [ ] `isCaseClosedError` es verdadero con cualquier `code` que termine en `_CASE_CLOSED` y falso con `undefined`, con `'UNKNOWN_ERROR'` y con un error que no sea `EsaviApiError`.
- [ ] Un 409 `*_CASE_CLOSED` en cualquier escritura del expediente produce **un solo** toast, con el `message` del servidor (o el texto propio en `CASEFLOW_007` y `_012`), y una nueva petición a `ESAVI-CASEFLOW-006`.
- [ ] Tras esa petición, el paso activo queda en sólo lectura y muestra el aviso de `CaseWizardPage.tsx:132`: «Reabrir» con ADMIN y «pide a un administrador» con USER.
- [ ] Un error que no cumple el sufijo (`INVDIAG_005A_NOT_FOUND`, un `403`, un `500`) no invalida `['caseWorkflow']`.
- [ ] `grep -rn "CASEFLOW_012_CASE_CLOSED" src/features/esaviCase/*Step.tsx` no devuelve resultados, y `ERROR_CODE_KEYS` conserva la entrada.
- [ ] Con un diálogo de formulario o de confirmación abierto, el paso de la lista a sólo lectura lo cierra. Vale para las doce listas de §3.1.
- [ ] `CaseOpeningStep` con `CLOSED` tiene el formulario deshabilitado, no pinta «Guardar» y `NotifierList` no ofrece «Añadir», «Editar» ni «Retirar». «Siguiente» sigue funcionando.
- [ ] Tras un 409, `useDraftsStore.getState().get(caseId, stage)` conserva lo tecleado.
- [ ] Tras reabrir con `ESAVI-CASEFLOW-009`, las mismas escrituras vuelven a funcionar sin recargar la página.
- [ ] `CASE-PROCESS.md` §10.3 figura como **resuelto** con referencia a SPEC F61, y §4.5 ya no afirma que el backend acepte escrituras sobre un caso cerrado.
- [ ] Las seis comprobaciones manuales del paso 9 están hechas contra el backend en `spec-61-closed-case-write-guard` y su resultado está en la nota de implementación.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque de cierre:**

- [ ] **Tema oscuro.** Los pasos en sólo lectura se ven correctos en `dark`, y `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/shared/hooks/useCloseWhenReadOnly.ts src/shared/api/queryClient.ts src/features/esaviCase/CaseOpeningStep.tsx src/features/notifier/` no devuelve resultados.
- [ ] **Por debajo de `md`.** `CaseOpeningStep` en sólo lectura no hace scroll horizontal a 375px, y la barra fija de `<ResourceForm>` no aparece, mientras que «Siguiente» sigue visible.
- [ ] **Rol bajo.** Con `USER` y el caso cerrado, ningún paso ofrece «Reabrir», y un 409 provocado por la carrera termina en el aviso, no en una pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible nuevo fuera de i18n. Este spec no añade claves, y `npm run i18n:check` sale en 0.
- [ ] **Estado en una sola capa.** `CLOSED` sólo se lee de `['caseWorkflow','byCase',caseId]`: ni el manejador ni ninguna lista lo copian a `useState` ni a un store.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** reaccionar al 409 en el `MutationCache` global (decisión 1, opción A). Un solo punto cubre las 85 escrituras y las que se añadan después. La forma del `code` es un contrato del backend (`CONVENTIONS.md` §11 del backend), así que el sufijo es estable.
- **No:** pasar `meta: { caseId }` en cada mutación para marcar `CLOSED` en la caché al instante (opción B). Son unos 40 cambios para ahorrar una petición al `006`, y cada escritura nueva tendría que acordarse de ponerlo.
- **Sí:** invalidar `['caseWorkflow']` entero en lugar de `byCase` de un caso concreto. El manejador global no conoce el `caseId`. Sólo se vuelven a pedir las consultas montadas, así que invalidar de más cuesta, como mucho, la bandeja si estuviera montada.
- **Sí:** dejar el toast en el `catch` local. `getErrorMessage` ya devuelve el `message` del servidor con los códigos no registrados, y si el global también lo mostrara saldría dos veces.
- **No:** registrar los 85 códigos en `ERROR_CODE_KEYS`. El servidor manda el texto traducido y con la salida («Reábralo antes de continuar»). Un texto propio sería una segunda traducción de lo mismo (`CONVENTIONS.md` §6.2).
- **Sí:** quitar el caso especial de `CASEFLOW_012` de los tres pasos que lo copiaban (decisión 2; el spec listaba sólo `ClassificationStep` y el resto se encontró en la implementación). Con el manejador global sobra, y dos caminos para el mismo efecto acaban divergiendo. Conserva su texto propio porque ya existe y es el que ve el usuario.
- **Sí:** cerrar el diálogo abierto cuando la lista pasa a sólo lectura (decisión 3). Dejarlo abierto con el formulario deshabilitado lleva a un callejón sin salida, y dejarlo habilitado lleva a otro 409 en cada intento.
- **Sí:** un hook compartido, `useCloseWhenReadOnly`, y no la misma lógica escrita en doce listas. Se repite doce veces, así que es una pieza de `shared/`.
- **Sí:** meter en este spec la sólo lectura de `CaseOpeningStep` (decisión 4). Es el único paso con contenido que no la tenía, y sin ella el punto 4 del aviso del backend falla justo ahí.
- **Sí:** conservar `draftsStore` ante el 409 (decisión 5). Si un ADMIN reabre el caso, `resolveDraftConflict` recupera lo tecleado, y borrarlo lo perdería sin remedio.
- **No:** quitar el modo de sólo lectura de la interfaz porque ahora el servidor ya rechaza. El 409 es la red, no la experiencia (punto 2 del aviso).

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Probar contra un backend sin F61: las escrituras se aceptan y el manejador nunca se dispara | El paso 9 se hace con `esavi-backend` en `spec-61-closed-case-write-guard`. Hasta que F61 llegue a `main`, se confirma con el equipo de backend en qué ambiente está |
| Un `catch` local que intercepta el error antes y hace `return` sin toast | El manejador global corre igual, porque `MutationCache.onError` se ejecuta aunque el llamador capture el error. Sólo faltaría el toast. Los tests del paso 7 cubren las tres familias de escritura |
| Al cerrarse el diálogo, el botón que lo abrió ya no existe y el foco cae en `body` | El aviso `role="status"` anuncia el cambio. Si en la revisión con teclado resulta molesto, mover el foco al aviso va en un spec aparte |
| Con `CLOSED`, un paso que restaura el borrador al montar muestra valores no guardados en un formulario deshabilitado | Es el comportamiento actual de SPEC FE14a y este spec no lo cambia. Queda anotado para revisarlo aparte |
| Un código futuro con sufijo `_CASE_CLOSED` que no signifique «expediente cerrado» | El sufijo es norma del backend (§11, «Expediente cerrado»). Un uso distinto rompería esa norma, no este cliente |

---

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `app/providers.tsx` | Usa `createAppQueryClient()` |
| `features/esaviCase/ClassificationStep.tsx`, `FinalClassificationStep.tsx` y `NotificationStep.tsx` | Pierden la rama de `CASEFLOW_012_CASE_CLOSED` |
| `shared/api/errorMessages.ts` | Sólo cambia el comentario de `CASEFLOW_012_CASE_CLOSED` |
| `features/esaviCase/CaseOpeningStep.tsx` | Modo de sólo lectura con `CLOSED` |
| `features/notifier/NotifierList.tsx` | Gana la prop `readOnly` |
| `shared/components/ResourceForm.tsx` | Gana la prop opcional `hideActions`. Ningún llamador actual cambia |
| Las once listas de notificación e investigación | Llaman a `useCloseWhenReadOnly`. Sus props no cambian |
| `references/CASE-PROCESS.md` | §4.5, §6.3, §10.3, cabecera de §10 y tabla de `:26` |

---

## Lo que **no** está en este spec

- Marcar el caso como cerrado en la caché al instante con `meta: { caseId }`.
- Textos propios para los 85 códigos `_CASE_CLOSED`.
- El comportamiento de `patient` con el caso cerrado.
- Cambios en «Reabrir» o en su aviso.
- Mover el foco al aviso cuando un diálogo se cierra por la carrera.
- La restauración de borradores en un paso `CLOSED`.
- Commitear la regeneración de `API-ROUTES.md` de SPEC F60.

Cada uno de esos, si aterriza, va en su propio spec.

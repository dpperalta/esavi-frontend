# SPEC FE14b — Cerrar y reabrir el expediente

> **Estado:** Implementado
> **Depende de:** SPEC FE08 (armazón del asistente, `steps.ts`, `CaseWizardActionBar`, sólo lectura con `CLOSED`), SPEC FE14a (`isStepRequired`, banderas del stepper, paso 6), SPEC FE12a (`notification.outcome`, `notificationType`, `takesMedication`), SPEC FE13a (`investigationAutopsy`), SPEC FE13e (`investigationCommunity`), SPEC F44 del backend (`ESAVI-CASEFLOW-008`/`-009`)
> **Fecha:** 2026-09-17
> **Objetivo:** Añadir al asistente un paso «Cierre» que liste, precondición por precondición, lo que bloquea o avisa antes de cerrar el expediente, y dar al ADMIN la acción de reabrirlo.

---

## 1. Por qué existe este spec

Es el consumo de `ESAVI-CASEFLOW-008` (cerrar, USER) y `ESAVI-CASEFLOW-009` (reabrir, ADMIN), especificados en el SPEC F44 del backend. Implementa `CASE-PROCESS.md` §4.4 y §4.5, y el apartado «El cierre» de §5.6. FE14a lo dejó fuera a propósito: el formulario escribe una fila, y el cierre lee diez tablas para decidir qué bloquea y qué avisa.

**A — Ningún expediente puede terminar.** El cliente no llama nunca al `008`. `CaseWizardPage.tsx:127` ya pinta la sólo lectura con `CLOSED`, y `EsaviCaseDetailPage.tsx:62` ya distingue el estado cerrado. Pero a ese estado hoy sólo se llega desde fuera de la interfaz. Lo mismo pasa con la salida: el aviso de `CaseWizardPage.tsx:132` dice «pide a un administrador que lo reabra», y el administrador no tiene dónde hacerlo.

**B — El cierre no pertenece a ningún paso existente.** Un caso no grave y sin investigación se cierra **sin paso 6** (§4.4), así que el botón no puede vivir en `FinalClassificationStep`. Tampoco cabe en la barra genérica: `CaseWizardActionBar` está atada a la `stage` del paso activo, y cerrar no es completar una etapa (`007` sólo sella `endedAt`, §4.2).

**C — El backend comprueba que las filas existan, no que sean coherentes.** El `008` rechaza con `409` seis situaciones: ya cerrado, en validación, y cuatro filas requeridas que faltan. Pero §5.6 aplazó hasta el cierre cinco incoherencias que el servidor no mira, con la promesa de resolverlas aquí:

- Dos **bloquean**: una autopsia bajo un desenlace que no es muerte, y la gravedad de la clasificación contradicha por la rama de la notificación.
- Dos **avisan**: `takesMedication` distinto de `'YES'` con medicación cargada, y los afectados del conglomerado que no suman el total.
- Una no necesita nada: las complicaciones del embarazo, que la derivación de FE12d ya impide.

Si el cliente no las evalúa, nadie lo hace.

**D — «Existe» no significa lo mismo para el asistente y para el cierre.** `stages.<fase>.exists` del `006` cuenta también las filas desactivadas. El `008` sólo cuenta las **activas** (`CASE-PROCESS.md` §6.2). Una pantalla que se fiara de `exists` mostraría «listo para cerrar» y recibiría un `409` que nadie sabría explicar. Además, varios `006` devuelven la fila inactiva a un ADMIN, así que la comprobación tiene que mirar `isActive`.

**E — «Siguiente» no salta los pasos ocultos.** `CaseWizardActionBar.tsx:57` toma `CASE_WIZARD_STEPS[currentIndex + 1]` sin mirar `isStepRequired`. Hasta ahora el paso 6 era el último y no se notaba. Con un paso posterior, un caso sin investigación pulsaría «Siguiente» desde la notificación hacia un paso oculto, y la redirección de reanudación lo devolvería atrás.

---

## 2. Alcance

**Dentro:**

- **Un paso «Cierre» en el asistente.** El slug `closure` se añade a `CASE_WIZARD_STEPS`, en el grupo `closure` (el que ya existe, rotulado «Cierre») y **detrás** de `final-classification`, con `stage: null`.
  - **Siempre desbloqueado y siempre requerido.** No tiene precondición propia, como `classification`: la lista es la que explica qué falta.
  - **La reanudación no aterriza en él mientras el expediente esté abierto.** Con `CLOSED`, sí: un caso cerrado se abre en su resumen.
  - **Su estado en el stepper** es «Completado» con `CLOSED` y «Sin iniciar» en cualquier otro estado.
- **`ClosureStep.tsx`** en `features/esaviCase/`, montado desde `CaseWizardPage`. Tiene dos modos:
  - **Expediente abierto:** la lista completa de precondiciones ✓/✗, después las incoherencias que bloquean y después los avisos. Cada línea incumplida lleva su razón y el enlace al paso que la corrige. Al final, «Cerrar expediente», deshabilitado mientras quede algún bloqueo.
  - **Expediente `CLOSED`:** un resumen con `closedAt`, `reopenCount` y `lastReopenedAt`, y la acción de reabrir según el rol.
- **Las precondiciones del `008`, replicadas sobre filas activas** (`CASE-PROCESS.md` §4.4). Sólo se listan las que aplican al caso, cada una con el motivo de que se exija:
  - `classification` y `notification`, siempre.
  - `investigation`, si `notification.requestInvestigation === true`.
  - `finalClassification`, si `classification.isSeriousEvent === true` o `requestInvestigation === true`. `null` cuenta como no grave.
  - Estado distinto de `PENDING_VALIDATION`.
- **Una fila desactivada no cumple la precondición**, aunque `stages.<fase>.exists` sea `true`. La línea dice que la fila está dada de baja y que la reactiva un administrador, en vez de mandar a un paso que no puede resolverlo (§6.2).
- **Las dos incoherencias que bloquean** (`CASE-PROCESS.md` §5.6):
  - **Autopsia activa bajo un desenlace que no es muerte**, incluido el desenlace sin declarar. Dos enlaces: «Corregir el desenlace» al paso 4 y «Revisar la autopsia» al paso 5.
  - **Gravedad contradicha:** `(classification.isSeriousEvent === true) !== (notification.notificationType === 'SEVERE')`. Enlace al paso 3, con el texto de que corregirla exige que un SUPERADMIN purgue la rama de la notificación (§6.1).
- **Los dos avisos, que no bloquean:**
  - `takesMedication !== 'YES'` con al menos una medicación activa. Enlace al paso 4.
  - `affectedVaccinated + affectedUnvaccinated + affectedUnknown !== similarEventCount`, **sólo con los cuatro valores presentes**, el mismo criterio de FE13e. Enlace al paso 5.
- **La lógica de evaluación, como función pura** en `features/caseWorkflow/closeReadiness.ts`. Recibe las lecturas ya resueltas y devuelve las líneas. No llama a nada, y es lo que se testea regla por regla.
- **Las lecturas, reutilizadas sin escribir ninguna nueva:** `useCaseWorkflow`, las de clasificación, notificación, investigación, clasificación final, autopsia, comunidad y medicación por caso. Cada una se habilita sólo si su fase existe.
- **Cerrar:** `PATCH …/close` (`008`) tras un `AlertDialog` que dice que el expediente queda en sólo lectura y que sólo un administrador lo reabre. Si hay avisos, los repite. Los seis `409` se mapean por `code` aunque la pantalla los prevenga.
- **Reabrir:** `PATCH …/reopen` (`009`) tras un `AlertDialog`. Es un único componente, `ReopenCaseButton.tsx` en `features/caseWorkflow/`, visible sólo con `useCan(ADMIN)` y montado en tres sitios:
  - el resumen del paso «Cierre»;
  - el aviso de sólo lectura de `CaseWizardPage`;
  - el bloque de estado de `EsaviCaseDetailPage`.

  Con USER, los tres sitios mantienen el texto de pedírselo a un administrador.
- **«Siguiente» salta los pasos que el caso no requiere.** `CaseWizardActionBar` busca el siguiente paso con `isStepRequired`, así que desde el último paso requerido lleva a «Cierre». La barra genérica **no** se pinta en «Cierre», igual que en `patient` y `case-opening`.
- **Invalidaciones tras cerrar o reabrir:** `['caseWorkflow','byCase',caseId]`, `['caseWorkflow','list']` y `['esaviCase']`.
- **Los `code` de `008` y `009`** en `shared/api/errorMessages.ts`, y las claves nuevas en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **Pedir y resolver validación (`ESAVI-CASEFLOW-010`/`-011`).** Aquí `PENDING_VALIDATION` sólo bloquea con su razón. Resolverla es una acción de la pantalla del expediente.
- **Reactivar filas desactivadas** (el `005B` de cada entidad). La línea nombra el problema y quién lo resuelve, pero no ofrece la acción.
- **Que el backend compruebe `CLOSED` en los `PUT` de fase** (`CASE-PROCESS.md` §10.3). La sólo lectura sigue siendo del cliente.
- **Que el backend adopte las incoherencias de §5.6.** Son criterio de este proceso, no del modelo.
- **Un motivo de reapertura.** El `009` no acepta body, y un texto que no se guarda no es un motivo.
- **El historial de cierres y reaperturas** más allá de los tres campos del resumen. `appDetails` es de `<AuditTrail>` y exige SUPERADMIN.
- **Cerrar desde el listado de casos**, uno o varios a la vez.
- **El botón «Anterior» del asistente.** Sigue pendiente desde FE11 y va en su propio spec.
- **Rediseñar el stepper** más allá de añadir el paso.

---

## 3. Diseño

### 3.1 Pantallas y archivos

**Ninguna ruta nueva.** El paso se alcanza en `/esavi-cases/:id/wizard/closure` a través de la ruta `:step?` que ya existe (`app/router.tsx:60`), con el mismo guard USER de FE08. Tampoco hay `NavItem` nuevo: se entra desde el asistente.

**Archivos nuevos:**

| Archivo | Qué es |
|---|---|
| `features/esaviCase/ClosureStep.tsx` | El paso. Modo abierto (lista y «Cerrar expediente») y modo `CLOSED` (resumen y reabrir) |
| `features/caseWorkflow/closeReadiness.ts` | Función pura `evaluateCloseReadiness(input)`: recibe las lecturas resueltas y devuelve las líneas y `canClose`. Sin hooks ni llamadas |
| `features/caseWorkflow/useCloseReadiness.ts` | Hook que monta las ocho lecturas de §3.2, cada una habilitada por su fase, y se las pasa a la función pura |
| `features/caseWorkflow/ReopenCaseButton.tsx` | Botón y `AlertDialog` del `009`. No renderiza nada sin `useCan(ADMIN)` |
| `closeReadiness.test.ts`, `ClosureStep.test.tsx`, `ReopenCaseButton.test.tsx` | Junto a cada archivo |

**Archivos que cambian:**

| Archivo | Antes | Después |
|---|---|---|
| `features/esaviCase/steps.ts` | Seis slugs; `resolveResumeStep(stages, flags)` recorre todos | Séptimo slug `closure` (grupo `closure`, `stage: null`). `isStepUnlocked` e `isStepRequired` devuelven `true` para él. `resolveResumeStep(stages, flags, isClosed = false)` lo salta salvo con `isClosed` |
| `features/esaviCase/CaseWizardStepper.tsx` | El estado de un paso sale de `stages` | `closure` pinta «Completado» con `CLOSED` y «Sin iniciar» en otro caso. Etiqueta `caseWizard.steps.closure` |
| `features/esaviCase/CaseWizardActionBar.tsx` | `nextStep = CASE_WIZARD_STEPS[currentIndex + 1]` (línea 57) | El siguiente paso **requerido** según `isStepRequired` y las banderas |
| `features/esaviCase/CaseWizardPage.tsx` | Seis ramas; barra genérica salvo en `patient` y `case-opening`; aviso de cerrado sólo con texto | Monta `ClosureStep`. La barra tampoco se pinta en `closure`. El aviso incluye `<ReopenCaseButton>`. `resolveResumeStep` recibe `isClosed` |
| `features/esaviCase/EsaviCaseDetailPage.tsx` | `WorkflowStatusBlock` con estado y botón de abrir | Añade `<ReopenCaseButton>` cuando el estado es `CLOSED` |
| `features/caseWorkflow/api.ts` | `useCaseWorkflow`, `useCompleteStage`, `useCaseWorkflowList` | Añade `useCloseCase(caseId)` y `useReopenCase(caseId)` |
| `shared/api/errorMessages.ts` | Sin códigos de `008`/`009` | Los ocho de `008` y los tres de `009` (§3.5) |
| `locales/{es,en,nl}.json` | — | Claves de §3.8 |

### 3.2 Endpoints consumidos

**Escrituras** — copiadas de `API-ROUTES.md`:

```
PATCH  /api/case-workflows/case/:id/close    ESAVI-CASEFLOW-008   USER    cerrar el expediente
PATCH  /api/case-workflows/case/:id/reopen   ESAVI-CASEFLOW-009   ADMIN   reabrir el expediente
```

Ninguna de las dos lleva body. Las dos responden con el workflow completo (`toCaseWorkflowResponse`, `caseWorkflow.service.ts:747` y `:772`).

**Lecturas** — todas existen ya, con su hook y su clave:

```
GET  /api/case-workflows/case/:id                ESAVI-CASEFLOW-006  USER  useCaseWorkflow
GET  /api/classifications/case/:id               ESAVI-CLASSIF-006   USER  useClassificationByCase
GET  /api/notifications/case/:id                 ESAVI-NOTIFCN-006   USER  useNotificationByCase
GET  /api/investigations/case/:id                ESAVI-INVESTGN-006  USER  useInvestigationByCase
GET  /api/final-classifications/case/:id         ESAVI-FINCLASS-006  USER  useFinalClassificationByCase
GET  /api/investigation-autopsies/case/:id       ESAVI-INVAUT-006    USER  useInvestigationAutopsyByCase
GET  /api/investigation-communities/case/:id     ESAVI-INVCOMM-006   USER  useInvestigationCommunityByCase
GET  /api/notification-medications/case/:id      ESAVI-NOTIFMED-006  USER  useNotificationMedicationsByCase
```

**Cómo responden los `006` a una fila desactivada**, verificado en los cuatro servicios de fase: con USER, `404 <PREFIJO>_006_NOT_FOUND`; con ADMIN, devuelven la fila con `isActive: false` (`canViewInactive`). Autopsia, comunidad y medicación siguen el mismo criterio. Por eso la comprobación de «fila activa» acepta las dos formas: con la fase existente, un `_006_NOT_FOUND` o un `isActive === false` significan «dada de baja».

**No se consumen:**

- `ESAVI-CASEFLOW-010`/`-011` (validación): van a la pantalla del expediente.
- `ESAVI-CASEFLOW-005A`/`-005B`: desactivan el **registro** del workflow, que no es cerrar ni reabrir (`CASE-PROCESS.md` §3).
- `ESAVI-CASEFLOW-007`: el `008` ya sella la última fase abierta.
- Los `005B` de cada entidad: reactivar filas queda fuera (§2).

### 3.3 Tipos del contrato

**Ningún archivo nuevo en `contracts/`.** Las respuestas de `008` y `009` son `CaseWorkflowDetail` (`contracts/declared/caseWorkflow.ts`), que ya declara lo que usa el resumen: `status`, `closedAt`, `lastReopenedAt` y `reopenCount`. Las lecturas usan los tipos declarados que ya consumen sus pasos, y estos son los campos que lee la evaluación:

| Tipo | Campos |
|---|---|
| `ClassificationDetail` | `isSeriousEvent`, `isActive` |
| `NotificationDetail` | `requestInvestigation`, `notificationType`, `takesMedication`, `outcome.value`, `isActive` |
| `InvestigationDetail`, `FinalClassificationDetail` | `isActive` |
| `InvestigationAutopsyDetail` | `isActive` |
| `InvestigationCommunityDetail` | `similarEventCount`, `affectedVaccinated`, `affectedUnvaccinated`, `affectedUnknown`, `isActive` |
| `NotificationMedicationDetail` | `isActive` |

**Tipos del cliente**, en `closeReadiness.ts`. No van a `contracts/` (`CONVENTIONS.md` §9):

```ts
type CloseCheckId =
  | 'notPendingValidation' | 'classification' | 'notification'
  | 'investigation' | 'finalClassification'
  | 'autopsyWithoutDeath' | 'severityMismatch'
  | 'medicationAnswer' | 'communityCount';

type CloseCheckKind = 'precondition' | 'blocker' | 'warning';
type CloseCheckState = 'met' | 'unmet' | 'deactivated';

interface CloseCheckLine {
  id: CloseCheckId;
  kind: CloseCheckKind;
  state: CloseCheckState;
  links: { step: CaseWizardStepSlug; labelKey: string }[];
}

interface CloseReadiness {
  status: 'loading' | 'error' | 'ready';
  lines: CloseCheckLine[];
  canClose: boolean;   // ready y ninguna línea precondition/blocker en unmet o deactivated
}
```

Cada fila llega a la función pura como `Row | null | 'deactivated'`:

- `null`: la fase no existe.
- `'deactivated'`: existe pero no está activa.
- `Row`: la fila activa.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId` y paso activo | URL | `:id` y `:step` del path | Como en FE08 |
| Workflow | TanStack Query | `['caseWorkflow','byCase',caseId]` | Sin `staleTime`. Decide el modo del paso y el aviso de cerrado |
| Clasificación | TanStack Query | `['classification','byCase',caseId]` | `enabled` con `stages.classification.exists`. Misma clave que FE11 y el stepper |
| Notificación | TanStack Query | `['notification','byCase',caseId]` | `enabled` con `stages.notification.exists` |
| Investigación | TanStack Query | `['investigation','byCase',caseId]` | `enabled` con `stages.investigation.exists` |
| Clasificación final | TanStack Query | `['finalClassification','byCase',caseId]` | `enabled` con `stages.finalClassification.exists` |
| Autopsia | TanStack Query | `['investigationAutopsy','byCase',caseId]` | `enabled` con `stages.investigation.exists`. `INVAUT_006_NOT_FOUND` → `null`, ya en el hook |
| Comunidad | TanStack Query | `['investigationCommunity','byCase',caseId]` | `enabled` con `stages.investigation.exists`. `INVCOMM_006_NOT_FOUND` → `null`, ya en el hook |
| Medicación | TanStack Query | `['notificationMedication','byCase',caseId]` | `enabled` con `stages.notification.exists`. Se filtran las `isActive` |
| Líneas y `canClose` | Derivado en render | `evaluateCloseReadiness(...)` | **No se guarda en ningún sitio.** Se recalcula de las lecturas en cada render |
| Diálogo de cerrar / reabrir abierto | Componente | `useState` | Efímero |
| Estado de las dos mutaciones | TanStack Query | `useMutation` de `useCloseCase` / `useReopenCase` | `isPending` deshabilita el botón de confirmar |
| Rol | Store de sesión | `useCan(ROLE_LEVELS.ADMIN)` | Sólo decide si se pinta `ReopenCaseButton` |

**Ninguna lectura lleva `staleTime`.** Todas se invalidan con las escrituras de su paso, así que la caché que deja un paso ya es correcta al entrar en «Cierre», y el montaje relee igualmente. **Nada va a `draftsStore`**: el paso no tiene nada que teclear.

**Qué invalida qué:**

| Tras | Se invalida |
|---|---|
| `008` con éxito | `['caseWorkflow','byCase',caseId]`, `['caseWorkflow','list']`, `['esaviCase']` |
| `009` con éxito | Las mismas tres |
| `008` con cualquier `409 CASEFLOW_008_*` | Las tres anteriores **y** las siete lecturas de fase del caso. El `409` significa que la lista local estaba desactualizada; releer la corrige sin recargar |
| `009` con `409 CASEFLOW_009_NOT_CLOSED` | `['caseWorkflow','byCase',caseId]`: otro administrador ya lo reabrió |

**Una excepción declarada:** la lista de líneas se deriva, no se guarda. No es un dato de ninguna capa, y memorizarla en `useState` sería exactamente la copia de datos remotos que §7 prohíbe.

### 3.5 Reglas de evaluación y mapeo de errores

**El paso no tiene formulario.** No hay campos, schema Zod ni `draftsStore`. Lo que en otro spec sería la validación son las reglas de `evaluateCloseReadiness`, y se testean una por una.

**Las reglas**, en el orden en que se pintan:

| `id` | Tipo | Aplica si | Se cumple si | Enlaces |
|---|---|---|---|---|
| `notPendingValidation` | precondition | Siempre | `status.code !== 'PENDING_VALIDATION'` | — (§2, fuera de alcance) |
| `classification` | precondition | Siempre | Fila activa | Paso 3 |
| `notification` | precondition | Siempre | Fila activa | Paso 4 |
| `investigation` | precondition | `notification.requestInvestigation === true` | Fila activa | Paso 5 |
| `finalClassification` | precondition | `isSeriousEvent === true` **o** `requestInvestigation === true` | Fila activa | Paso 6 |
| `autopsyWithoutDeath` | blocker | Hay autopsia activa | `notification.outcome?.value === 'DEATH'` | Paso 4 «Corregir el desenlace» y paso 5 «Revisar la autopsia» |
| `severityMismatch` | blocker | Hay clasificación y notificación activas | `(isSeriousEvent === true) === (notificationType === 'SEVERE')` | Paso 3 |
| `medicationAnswer` | warning | Hay al menos una medicación activa | `takesMedication === 'YES'` | Paso 4 |
| `communityCount` | warning | Hay comunidad activa y los cuatro contadores no son `null` | `affectedVaccinated + affectedUnvaccinated + affectedUnknown === similarEventCount` | Paso 5 |

**Tres criterios que no se deducen de la tabla:**

- **Una regla que no aplica no se pinta.** El motivo de las que sí aplican va en la propia línea: «Requerida porque el evento es grave». Si las dos banderas son `true`, se nombran las dos.
- **Una precondición incumplida arrastra sus incoherencias.** Sin notificación activa no se evalúan `autopsyWithoutDeath`, `severityMismatch` ni `medicationAnswer`: falta el dato contra el que comparar, y la línea que manda es la precondición. Lo mismo pasa con `communityCount` sin investigación activa.
- **`canClose` es `true` sólo con `status === 'ready'`** y ninguna línea `precondition` o `blocker` en `unmet` o `deactivated`. Los `warning` nunca lo impiden.

**`status` de la evaluación:**

- `loading` mientras cualquier lectura habilitada no ha resuelto.
- `error` si alguna falla con algo distinto de su `_006_NOT_FOUND`. Ese código, con la fase existente, se lee como `'deactivated'`.
- `ready` en cualquier otro caso.

**Errores de `008`** (`caseWorkflow.service.ts:639-750`). Todos van al toast por `code` y ninguno a un campo:

| `code` | Status | Qué hace además el cliente |
|---|---|---|
| `CASEFLOW_008_NOT_FOUND` | 404 | Nada: `CaseWizardPage` ya pinta su pantalla de error si el `006` falla |
| `CASEFLOW_008_ALREADY_CLOSED` | 409 | Invalida (§3.4). El paso pasa al modo cerrado solo |
| `CASEFLOW_008_PENDING_VALIDATION` | 409 | Invalida. La lista vuelve con esa línea incumplida |
| `CASEFLOW_008_CLASSIFICATION_REQUIRED` | 409 | Invalida |
| `CASEFLOW_008_NOTIFICATION_REQUIRED` | 409 | Invalida |
| `CASEFLOW_008_INVESTIGATION_REQUIRED` | 409 | Invalida |
| `CASEFLOW_008_FINAL_CLASSIFICATION_REQUIRED` | 409 | Invalida |
| `CASEFLOW_008_CLOSE_FAILED` | 500 | Nada. Texto genérico |

**Errores de `009`:**

| `code` | Status | Qué hace además el cliente |
|---|---|---|
| `CASEFLOW_009_NOT_FOUND` | 404 | Nada |
| `CASEFLOW_009_NOT_CLOSED` | 409 | Invalida `['caseWorkflow','byCase',caseId]`. Otro administrador ya lo reabrió |
| `CASEFLOW_009_REOPEN_FAILED` | 500 | Nada. Texto genérico |
| `AUTH_ROLE_FORBIDDEN` | 403 | Toast con `caseWorkflow.reopen.forbidden`. Sólo llega si el rol cambió con la pestaña abierta |

Los diálogos se cierran con éxito y también con error. Un `409` deja la pantalla con la lista ya releída, que es la explicación.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de cinco líneas y el botón deshabilitado | — |
| Error de una lectura | El mensaje del `EsaviApiError` por `code` y «Reintentar», que relee las lecturas fallidas. Botón deshabilitado | `caseWorkflow.close.loadError` |
| Abierto, con bloqueos | Lista completa. Botón deshabilitado con el motivo visible debajo, no sólo en `title` | `caseWorkflow.close.blockedHint` |
| Abierto, listo para cerrar | Lista completa, todas las líneas cumplidas y el botón habilitado. Los avisos, si los hay, siguen visibles | `caseWorkflow.close.ready` |
| Cerrando | El botón de confirmar del diálogo deshabilitado mientras `isPending` | — |
| Cerrado, ADMIN | Resumen con `closedAt`, `reopenCount` y `lastReopenedAt` («Nunca» si es `null`), y `<ReopenCaseButton>` | `caseWorkflow.closed.*` |
| Cerrado, USER | El mismo resumen, y en lugar del botón el texto de pedírselo a un administrador | `caseWorkflow.closed.askAdmin` |
| Sin permiso | No se llega: el guard USER de FE08. `ANALYTICS` no entra al asistente | — |

**`REOPENED` no tiene estado propio.** El paso se comporta como con cualquier estado abierto. El resumen de cierre desaparece, pero `reopenCount` sigue en el `006` para la próxima vez que se cierre.

### 3.7 Responsividad y accesibilidad

- **Una sola columna** en todos los anchos dentro del área de contenido del asistente. Cada línea apila icono y texto arriba y sus enlaces debajo.
- **Por debajo de `md`, «Cerrar expediente» va fijo abajo** con las mismas clases que `CaseWizardActionBar`, para que el botón principal del paso esté donde en todos los demás.
- **Los enlaces son `<Button variant="link">` con `navigate`**, con 44px de objetivo táctil. Van al paso con la misma comprobación de cambios sin guardar que «Siguiente»: aquí nunca la hay, porque el paso no tiene nada que teclear.
- **El estado de cada línea no depende del color.** El icono (`CheckCircle2`, `XCircle`, `AlertTriangle`) va con `aria-hidden`, y un texto `sr-only` dice «Cumplido», «Pendiente» o «Aviso». Los colores son tokens: `success`, `destructive` y `warning` (`CONVENTIONS.md` §10.1).
- **Estructura:** un `<h2>` por bloque («Requisitos», «Incoherencias que bloquean», «Avisos») y cada bloque es un `<ul>`. Un bloque sin líneas no se pinta.
- **El botón deshabilitado lleva `aria-describedby`** apuntando al texto del motivo.
- **Los dos diálogos son `AlertDialog`** de shadcn, con el foco en «Cancelar» al abrir: las dos acciones son difíciles de deshacer para quien las pulsa.
- **Tras cerrar o reabrir**, el foco va al `<h2>` del modo nuevo (`tabIndex={-1}`), y el cambio se anuncia en una región `aria-live="polite"`.

### 3.8 Claves i18n nuevas

En `es`, `en` y `nl`. Se muestra el texto en español:

| Clave | Uso |
|---|---|
| `caseWizard.steps.closure` | «Cierre del expediente», etiqueta del paso en el stepper |
| `caseWizard.readOnly.closedBannerAdmin` | «Este expediente está cerrado.» — el aviso con ADMIN, junto al botón |
| `caseWorkflow.close.title` · `.intro` | Título del paso y una frase sobre qué se revisa antes de cerrar |
| `caseWorkflow.close.sections.preconditions` · `.blockers` · `.warnings` | Los tres `<h2>` |
| `caseWorkflow.close.state.met` · `.unmet` · `.warning` | Texto `sr-only` de cada línea |
| `caseWorkflow.close.checks.notPendingValidation` | «El expediente no está pendiente de validación» |
| `caseWorkflow.close.checks.classification` · `.notification` · `.investigation` · `.finalClassification` | Nombre de cada precondición |
| `caseWorkflow.close.reasons.always` · `.investigationRequested` · `.seriousEvent` · `.seriousAndInvestigated` | El motivo de que se exija |
| `caseWorkflow.close.rowMissing` · `.rowDeactivated` | «Todavía no se ha registrado.» · «Está dada de baja. Un administrador tiene que reactivarla.» |
| `caseWorkflow.close.checks.autopsyWithoutDeath` · `.autopsyWithoutOutcome` | «Hay una autopsia registrada, pero el desenlace del caso es «{{outcome}}».» · la variante sin desenlace |
| `caseWorkflow.close.checks.severityMismatch` · `.severityMismatchHint` | «La clasificación inicial dice {{classification}} y la notificación {{notification}}.» · «Corregirlo exige que un SUPERADMIN elimine la ficha de la notificación.» |
| `caseWorkflow.close.severity.serious` · `.notSerious` | «grave» · «no grave», para `{{classification}}` y `{{notification}}` |
| `caseWorkflow.close.checks.medicationAnswer` | «Hay {{count}} medicaciones registradas, pero la pregunta sobre medicación dice «{{answer}}».» |
| `caseWorkflow.close.unanswered` | «sin responder», para `{{answer}}` cuando `takesMedication` es `null` |
| `caseWorkflow.close.checks.communityCount` | «Los afectados suman {{breakdown}} y el total declarado es {{declared}}.» |
| `caseWorkflow.close.links.classification` · `.notification` · `.investigation` · `.finalClassification` · `.fixOutcome` · `.reviewAutopsy` | Texto de los enlaces |
| `caseWorkflow.close.loadError` · `.ready` · `.blockedHint` | Estados de §3.6 |
| `caseWorkflow.close.action` · `.confirmTitle` · `.confirmBody` · `.confirmWarnings` · `.confirmAction` · `.success` | Botón, diálogo y toast del `008` |
| `caseWorkflow.closed.title` · `.closedAt` · `.reopenCount` · `.lastReopenedAt` · `.never` · `.askAdmin` | Resumen del modo cerrado |
| `caseWorkflow.reopen.action` · `.confirmTitle` · `.confirmBody` · `.confirmAction` · `.success` · `.forbidden` | Botón, diálogo y toasts del `009` |
| `caseWorkflow.errors.CASEFLOW_008_NOT_FOUND` … `CASEFLOW_008_CLOSE_FAILED` (8) | Toasts de §3.5 |
| `caseWorkflow.errors.CASEFLOW_009_NOT_FOUND` · `_NOT_CLOSED` · `_REOPEN_FAILED` | Toasts de §3.5 |

**Las etiquetas de respuesta se reutilizan:** `{{answer}}`, cuando `takesMedication` tiene valor, se rellena con `common.answerOption.*`, que ya existe (`AnswerOptionField.tsx:30-34`). Las de gravedad no existían como claves sueltas, y por eso se añaden `caseWorkflow.close.severity.*`. `{{outcome}}` es el `name` del catálogo, que llega traducido del backend.

---

## 4. Plan de implementación

Nueve pasos. Cada uno deja el repositorio compilando, arrancable y con sus tests en verde. **Cada paso añade sus claves i18n en los tres idiomas**, no al final: `npm run i18n:check` tiene que pasar en cada commit. El cierre de cada paso es `npx tsc --noEmit -p tsconfig.app.json`, filtrado a los archivos tocados (`CONVENTIONS.md` §13), más los tests de esos archivos.

Los pasos 4 a 6 generan interfaz: antes de escribirlos se cargan `ui-ux-pro-max` y `ui-styling`, y `web-design-guidelines` al cerrar cada uno (`CONVENTIONS.md` §10.6).

**1. La capa de API y los errores.** En `features/caseWorkflow/api.ts`, `useCloseCase(caseId)` sobre `008` y `useReopenCase(caseId)` sobre `009`, cada uno citando su código. Con éxito invalidan las tres claves de §3.4. `useCloseCase` invalida además las siete lecturas de fase ante cualquier `409 CASEFLOW_008_*`, y `useReopenCase` el workflow ante `CASEFLOW_009_NOT_CLOSED`. Los once `code` de §3.5 van a `shared/api/errorMessages.ts` con sus claves.
*Verificación:* un test con MSW y el envelope real comprueba que el `PATCH` sale sin body. Un `200` invalida las tres claves; un `409 CASEFLOW_008_INVESTIGATION_REQUIRED` invalida las diez; un `409 CASEFLOW_009_NOT_CLOSED` invalida sólo el workflow. `getErrorMessage` devuelve la clave propia de cada uno de los once.

**2. La evaluación, como función pura.** `features/caseWorkflow/closeReadiness.ts` con los tipos de §3.3 y `evaluateCloseReadiness`, con las nueve reglas de §3.5, sus motivos, sus enlaces y el arrastre de las precondiciones.
*Verificación:* `closeReadiness.test.ts` con un caso por fila de la tabla de §3.5 y por criterio:
- no grave sin investigación: sólo dos precondiciones, sin paso 6;
- `isSeriousEvent: null` con `SEVERE`: bloquea;
- autopsia con `outcome: null`: bloquea con la variante sin desenlace;
- `communityCount` con un contador `null`: no se pinta;
- sin notificación activa: no hay incoherencias;
- un `warning` no cambia `canClose`;
- una fila `'deactivated'`: impide cerrar.

**3. Las lecturas.** `features/caseWorkflow/useCloseReadiness.ts` monta los ocho hooks de §3.2 con su `enabled` de §3.4. Traduce cada respuesta a `Row | null | 'deactivated'` (un `_006_NOT_FOUND` con la fase existente, o `isActive === false`), filtra la medicación activa y resuelve `status`.
*Verificación:* con MSW:
- un caso con sólo clasificación y notificación hace exactamente tres peticiones: workflow, clasificación y notificación;
- `CLASSIF_006_NOT_FOUND` con `stages.classification.exists` da `'deactivated'`;
- una fila con `isActive: false` da lo mismo;
- un `500` en la comunidad da `status: 'error'`.

**4. `ReopenCaseButton`.** En `features/caseWorkflow/`: botón, `AlertDialog` con foco en «Cancelar» y `useReopenCase`. Sin `useCan(ADMIN)` no renderiza nada. Con éxito muestra el toast y cierra el diálogo; con error muestra el toast por `code` y lo cierra igual.
*Verificación:* con USER no hay botón en el DOM. Con ADMIN, confirmar hace un `PATCH …/reopen`, y cancelar no hace ninguno. Un `403 AUTH_ROLE_FORBIDDEN` muestra `caseWorkflow.reopen.forbidden`.

**5. `ClosureStep`, modo abierto.** En `features/esaviCase/`: los tres bloques con sus `<h2>` y sus `<ul>`, cada línea con icono, texto `sr-only`, motivo y enlaces. «Cerrar expediente» con su motivo en `aria-describedby`, y fijo abajo por debajo de `md`. `AlertDialog` de confirmación que repite los avisos. Estados de carga y error de §3.6. Todavía no se monta en `CaseWizardPage`: el test lo renderiza solo.
*Verificación:*
- con un bloqueo, el botón está deshabilitado y el motivo se lee junto a él;
- con sólo avisos, está habilitado y el diálogo los repite;
- confirmar hace un `PATCH …/close`;
- el enlace «Revisar la autopsia» navega a `/esavi-cases/:id/wizard/investigation`;
- con una lectura en error aparece «Reintentar» y el botón sigue deshabilitado.

**6. `ClosureStep`, modo cerrado.** Con `status.code === 'CLOSED'`, el resumen de `closedAt`, `reopenCount` y `lastReopenedAt`, formateados con date-fns, y `<ReopenCaseButton>` o el texto `askAdmin` según el rol. Foco al `<h2>` del modo nuevo y anuncio en `aria-live` al cambiar de modo.
*Verificación:* con `CLOSED` y USER se ven los tres datos y `askAdmin`, sin botón. Con ADMIN está el botón. `lastReopenedAt: null` se pinta como «Nunca». Tras un cierre con éxito, el foco queda en el título del resumen.

**7. El paso en el asistente.** En `steps.ts`:
- el slug `closure` en `CASE_WIZARD_STEPS`, detrás de `final-classification`;
- `isStepUnlocked` e `isStepRequired` devuelven `true` para él;
- `resolveResumeStep(stages, flags, isClosed = false)` lo salta salvo con `isClosed`.

En `CaseWizardStepper`, su etiqueta y su estado (Completado con `CLOSED`). En `CaseWizardPage`, se monta `ClosureStep`, no se pinta la barra genérica en `closure`, se pasa `isClosed` a `resolveResumeStep` y se añade `<ReopenCaseButton>` al aviso de cerrado, con `closedBannerAdmin` para ADMIN. Se ajustan `steps.test.ts`, `CaseWizardStepper.test.tsx` y `CaseWizardPage.test.tsx`, que hoy cuentan seis pasos.
*Verificación:*
- el stepper pinta «Cierre del expediente» sin candado en un caso recién abierto;
- `/wizard` sin `:step` sobre un caso abierto no aterriza en `closure`, y sobre uno `CLOSED` sí;
- en `closure` no hay «Guardar» ni «Completar etapa»;
- el aviso de cerrado muestra «Reabrir» con ADMIN y el texto de siempre con USER.

**8. «Siguiente» salta los pasos que el caso no requiere.** `CaseWizardActionBar` busca el siguiente paso con `isStepRequired` y las banderas de `useCaseWizardStepFlags`, en vez de `currentIndex + 1`.
*Verificación:*
- en un caso no grave y sin investigación, «Siguiente» desde `notification` navega a `closure`;
- en uno grave sin investigación, navega a `final-classification`;
- desde `final-classification`, a `closure`;
- con las banderas todavía cargando, navega al paso inmediato, el mismo criterio de «no ocultar mientras carga» de FE14a.

**9. La pantalla del expediente.** `WorkflowStatusBlock` de `EsaviCaseDetailPage` monta `<ReopenCaseButton>` cuando el estado es `CLOSED`.
*Verificación:* con `CLOSED` y ADMIN, el botón está junto a la insignia y reabrir cambia la insignia sin recargar. Con USER no está. Con un estado abierto no está para ningún rol.

---

## 5. Criterios de aceptación

- [ ] Un caso **no grave y sin investigación** muestra en «Cierre» sólo las precondiciones de clasificación y notificación, y se cierra sin haber pasado por el paso 6.
- [ ] Un caso **grave sin investigación** lista la clasificación final con el motivo «el evento es grave», y no lista la investigación.
- [ ] Un caso **no grave con investigación** lista la investigación y la clasificación final, las dos con el motivo «se solicitó una investigación».
- [ ] Con cualquier precondición o incoherencia bloqueante incumplida, «Cerrar expediente» está deshabilitado y el motivo se lee junto al botón. **Ningún** `PATCH …/close` sale de la pantalla en ese estado.
- [ ] Con sólo avisos, el botón está habilitado y el diálogo de confirmación los repite.
- [ ] Una fase con `exists: true` y fila desactivada aparece como «dada de baja» e impide cerrar. Da igual cómo llegue: un `404 <PREFIJO>_006_NOT_FOUND` con USER o `isActive: false` con ADMIN.
- [ ] Una autopsia activa con desenlace distinto de `DEATH`, **o sin desenlace**, bloquea y ofrece los dos enlaces: paso 4 y paso 5.
- [ ] `isSeriousEvent: null` con `notificationType: 'SEVERE'` bloquea. `isSeriousEvent: true` con `'SEVERE'` no bloquea.
- [ ] Una medicación activa con `takesMedication` distinto de `'YES'` avisa y no bloquea. Con la medicación dada de baja no avisa.
- [ ] Los afectados que no suman el total avisan y no bloquean, pero sólo con los cuatro contadores presentes.
- [ ] Con `PENDING_VALIDATION` la línea correspondiente está incumplida y el botón deshabilitado.
- [ ] Confirmar el cierre hace **un** `PATCH /api/case-workflows/case/:id/close` sin body. Sin recargar, el paso pasa al resumen, el stepper marca «Cierre» como completado y el resto del asistente queda en sólo lectura.
- [ ] Un `409 CASEFLOW_008_*` muestra su toast por `code` y relee las diez claves de §3.4. La lista refleja el estado del servidor sin recargar.
- [ ] Con `CLOSED`, el resumen muestra `closedAt`, `reopenCount` y `lastReopenedAt`, o «Nunca» si es `null`.
- [ ] Con `CLOSED` y rol **USER**, ni el paso «Cierre», ni el aviso del asistente, ni `EsaviCaseDetailPage` ofrecen «Reabrir». Los tres dicen que hay que pedírselo a un administrador.
- [ ] Con `CLOSED` y rol **ADMIN**, los tres sitios ofrecen «Reabrir». Confirmar hace **un** `PATCH …/reopen`, el asistente vuelve a ser editable sin recargar y `reopenCount` sube en uno.
- [ ] Un `409 CASEFLOW_009_NOT_CLOSED` relee el workflow y deja de ofrecer «Reabrir».
- [ ] `/esavi-cases/:id/wizard` sin `:step` **no** aterriza en `closure` si el caso está abierto, y **sí** si está `CLOSED`.
- [ ] En `closure` no se pinta `CaseWizardActionBar`: no hay «Guardar», «Completar etapa» ni «Siguiente».
- [ ] En un caso no grave y sin investigación, «Siguiente» desde `notification` lleva a `closure`, sin pasar por la redirección de reanudación.
- [ ] Entrar a «Cierre» en un caso con sólo clasificación y notificación hace exactamente tres lecturas: workflow, clasificación y notificación.
- [ ] `closeReadiness.ts` no importa `react`, `@tanstack/react-query` ni `client`: `grep -nE "from '(react|@tanstack|@/shared/api/client)" src/features/caseWorkflow/closeReadiness.ts` no devuelve resultados.
- [ ] `grep -rn "complete-stage" src/features/esaviCase/ClosureStep.tsx src/features/caseWorkflow/useCloseReadiness.ts` no devuelve resultados: el cierre no llama al `007`.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no añade errores en los archivos tocados.

**Bloque de cierre — se verifica a mano:**

- [ ] **Tema oscuro.** Los tres bloques, sus iconos de estado, los diálogos y el resumen de cerrado se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/caseWorkflow/ src/features/esaviCase/ClosureStep.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** Este paso no tiene tabla: a 375 px no hay scroll horizontal, los textos largos de las incoherencias envuelven sin cortarse, cada enlace mide al menos 44 px y «Cerrar expediente» queda fijo abajo.
- [ ] **Rol bajo.** Con `USER` el cierre funciona de punta a punta, porque el `008` y las ocho lecturas son `USER`, y en ningún sitio se ofrece «Reabrir». Un `403` inesperado en el `009` se muestra como toast, sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos los `aria-label`, los textos `sr-only` y los diálogos. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Las ocho lecturas viven en TanStack Query. Las líneas y `canClose` se derivan en render y no se guardan en `useState` ni en un store. Los diálogos abiertos son `useState` del componente. Nada va a `draftsStore`.

---

## 6. Decisiones tomadas y descartadas

- **Sí: un paso «Cierre» propio, detrás del paso 6.** Es la única ubicación que sirve a un caso sin paso 6, y tiene sitio para una línea por regla con sus enlaces. *Descartados:*
  - Un diálogo lanzado desde la cabecera del asistente: con varios bloqueos y dos enlaces cada uno, el diálogo queda apretado y se cierra al seguir un enlace.
  - Una acción en `EsaviCaseDetailPage`: obliga a salir del asistente para terminar lo que se hizo dentro de él.
  - El botón en `FinalClassificationStep`: un caso no grave y sin investigación no tiene paso 6.
- **Sí: «Cierre» siempre desbloqueado.** La lista explica qué falta, y un candado la escondería justo a quien más la necesita. *Descartado:* desbloquearlo con la notificación, como los pasos 5 y 6.
- **Sí: la reanudación no aterriza en «Cierre» con el expediente abierto, y sí con `CLOSED`.** Siempre desbloqueado y siempre requerido, sería el paso «más avanzado» de todos los casos, y cada entrada al asistente acabaría en una lista en vez de en el trabajo pendiente. Un caso cerrado, en cambio, no tiene trabajo pendiente, y su resumen es lo más útil.
- **Sí: la lista completa ✓/✗, no sólo lo que falla.** Deja ver qué se exige a este caso y por qué: un caso grave sin investigación entiende por qué le piden el paso 6 y no el 5. *Descartado:* mostrar sólo lo pendiente. Es más corto, pero no explica nada cuando todo está bien.
- **Sí: `null` cuenta como no grave en la incoherencia de gravedad**, así que `null` con `SEVERE` bloquea. Es el mismo criterio que usa el `008` para decidir si exige el paso 6, y dos criterios distintos para la misma bandera en la misma pantalla harían que un caso «no grave» para el cierre fuera «sin declarar» para la incoherencia. *Descartado:* bloquear sólo `true`/`false` explícitos.
- **Sí: los avisos sólo se muestran**, en la lista y en el diálogo. Son datos legítimamente incompletos (§5.6). *Descartado:* una casilla «he revisado los avisos». Un gesto obligatorio que no se guarda en ningún sitio no deja constancia de nada.
- **Sí: la autopsia sin muerte ofrece dos enlaces.** §5.6 admite las dos salidas —corregir el desenlace o retirar la autopsia— y elegir una por el usuario presupone qué pasó. *Descartado:* enlazar sólo al paso 4.
- **Sí: una fila desactivada impide cerrar y dice quién la resuelve**, sin ofrecer reactivarla. El `005B` de cada entidad es de ADMIN o SUPERADMIN, y una acción por entidad dentro de la lista es otro spec. *Descartado:* fiarse de `stages.<fase>.exists`, que cuenta las desactivadas y mostraría «listo para cerrar» ante un `409` seguro (§6.2).
- **Sí: una precondición incumplida arrastra sus incoherencias.** Sin notificación activa no hay desenlace, ni gravedad declarada, ni `takesMedication` contra los que comparar. Evaluarlas contra `null` pintaría bloqueos falsos encima del verdadero.
- **Sí: la evaluación es una función pura, y las lecturas un hook aparte.** Las nueve reglas se testean sin MSW ni render, y el hook se testea sólo por qué pide y cómo traduce. *Descartado:* evaluar dentro del componente, que obliga a montar la pantalla para probar cada combinación.
- **Sí: se reutilizan los ocho hooks de lectura existentes, sin endpoint agregado.** Comparten clave con sus pasos, así que su caché ya está caliente al llegar. *Descartado:* pedir al backend un «¿se puede cerrar?». Obligaría al `008` a adoptar criterios de interfaz que §5.6 dice explícitamente que no le corresponden.
- **Sí: un `409` del `008` relee las diez claves.** Significa que la pantalla estaba desactualizada —otra pestaña, otro usuario—, y releer lo explica mejor que un texto. *Descartado:* mostrar sólo el toast, que dejaría una lista diciendo «listo» junto a un error diciendo lo contrario.
- **Sí: `ReopenCaseButton` es un componente de `features/caseWorkflow/`, montado en tres sitios.** Un solo diálogo, un solo texto y un solo mapeo de errores. No es una primitiva de `shared/`: pertenece a una entidad. *Descartado:* reabrir sólo desde el asistente, o sólo desde el detalle. El aviso de cerrado ya nombra la salida en los dos.
- **No: un motivo de reapertura.** El `009` no acepta body. Un campo cuyo texto no se guarda da la falsa impresión de que queda constancia.
- **Sí: «Siguiente» salta los pasos no requeridos, en este spec.** Con un paso detrás del 6 el defecto deja de ser invisible: un caso sin investigación rebotaría desde la notificación contra la redirección. *Descartado:* dejarlo para el spec del botón «Anterior», que sólo retrasaría un fallo que este spec introduce.
- **Sí: sin diálogo de cambios sin guardar al salir de «Cierre».** El paso no tiene nada que teclear, así que no puede haber cambios.
- **No: tocar los borradores de otros pasos al cerrar.** `draftsStore` es un búfer por paso contra el cierre de la pestaña. El expediente cerrado ya los ignora al pasar a sólo lectura.

---

## 7. Riesgos identificados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **El bloqueo de `CLOSED` es sólo del cliente.** Los `PUT` de fase y de `esaviCase` aceptan escrituras sobre un caso cerrado (`CASE-PROCESS.md` §6.3). Una pestaña abierta antes del cierre puede seguir guardando | Fuera de alcance: está pedido en §10.3. Todas las invalidaciones del cierre incluyen el workflow, así que cualquier pestaña que relea pasa a sólo lectura. El riesgo queda en la ventana entre el cierre y la siguiente lectura de esa pestaña |
| 2 | **Un caso en `PENDING_VALIDATION` no tiene salida en la interfaz.** La línea bloquea, pero la pantalla que resuelve la validación (`011`) no existe todavía | Hoy ese estado sólo se alcanza por API, porque tampoco hay pantalla para pedir validación (`010`). El motivo de la línea dice que hay que resolver la validación, sin enlace. Cuando llegue el spec de validación, se añade el enlace |
| 3 | **Las incoherencias viven sólo en el cliente.** Un cierre directo contra el `008` las salta | Es la decisión de §5.6: son criterio del proceso, no del modelo. El spec no promete lo contrario, y §6 lo dice |
| 4 | **La incoherencia de gravedad no tiene arreglo para un USER.** Corregirla exige que un SUPERADMIN purgue la rama de la notificación (§6.1) | La línea lo dice en su texto de ayuda, en vez de mandar al paso 3 a descubrirlo. Con §6.1 aplicada desde FE11 —la compuerta de gravedad bloqueada con la notificación creada—, sólo debería aparecer en casos anteriores a esa regla |
| 5 | **`REOPENED` puede durar indefinidamente.** Sólo lo abandona la creación de una fase nueva (SPEC F44). Un caso reabierto con todas sus filas ya creadas sigue en `REOPENED` hasta el siguiente cierre | No se trata como estado especial (§3.6): el paso se comporta como con cualquier estado abierto. El listado mostrará «Reabierto» en vez de la fase, y eso es comportamiento del backend, no de este spec |
| 6 | **El paso «Cierre» añade hasta ocho lecturas** al entrar | Todas comparten clave con su paso y ya están en caché en un recorrido normal. Las que dependen de una fase no se piden si la fase no existe. El paso 3 del plan cuenta las peticiones de un caso mínimo |
| 7 | **Cambiar `CASE_WIZARD_STEPS` rompe los tests que cuentan seis pasos**, y la reanudación podría aterrizar en «Cierre» | El paso 7 del plan ajusta los tres archivos de test y añade el caso explícito de que la reanudación no aterriza en `closure` con el caso abierto |
| 8 | **Un ADMIN reabre desde el detalle con el asistente abierto en otra pestaña** | La otra pestaña sigue en sólo lectura hasta releer el workflow. Es el caso inverso del riesgo 1, y además el seguro: sólo impide escribir |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes | Después |
|---|---|---|
| `steps.ts` | Seis slugs. `resolveResumeStep(stages, flags)` recorre todos | Séptimo slug `closure`, siempre desbloqueado y requerido. `resolveResumeStep(stages, flags, isClosed = false)` lo salta salvo con `isClosed`. Los tres parámetros son compatibles con los llamadores actuales |
| `CaseWizardStepper.tsx` | Seis pasos; el grupo «Cierre» contiene sólo la clasificación final | Siete. «Cierre del expediente» va dentro del grupo «Cierre», detrás de la clasificación final, y se marca «Completado» con `CLOSED` |
| `CaseWizardActionBar.tsx` | «Siguiente» va al paso inmediato de `CASE_WIZARD_STEPS`, requerido o no | Va al siguiente paso **requerido**. Con las banderas cargando, al inmediato, como antes |
| `CaseWizardPage.tsx` | Seis ramas. Aviso de cerrado sólo con texto. La barra genérica se oculta en `patient` y `case-opening` | Monta `ClosureStep`. El aviso incluye «Reabrir» con ADMIN. La barra también se oculta en `closure`. La reanudación recibe `isClosed` |
| `EsaviCaseDetailPage.tsx` | Estado y botón «Abrir / Ver expediente» | Añade «Reabrir» con `CLOSED` y ADMIN. Nada más cambia |
| `features/caseWorkflow/api.ts` | Tres hooks | Cinco: `useCloseCase` y `useReopenCase` |
| `shared/api/errorMessages.ts` | Sin códigos de `008`/`009` | Once códigos nuevos |
| `steps.test.ts`, `CaseWizardStepper.test.tsx`, `CaseWizardPage.test.tsx`, `CaseWizardActionBar.test.tsx` | Asumen seis pasos y «Siguiente» al paso inmediato | Se ajustan a siete pasos y se añaden los casos de reanudación con `CLOSED` y de «Siguiente» saltando pasos ocultos |
| Pasos 3, 4, 5 y 6 | — | **No cambian.** Su sólo lectura con `CLOSED` ya existe desde FE08, y el cierre la activa sin tocarlos |

**Consecuencia para el spec de validación (`010`/`011`):** hereda la línea `notPendingValidation` de «Cierre», y tendrá que añadirle el enlace a su pantalla.

**Consecuencia para el spec del botón «Anterior»:** tendrá que saltar los pasos no requeridos con el mismo criterio que «Siguiente» adopta aquí.

---

## Lo que **no** está en este spec

- Pedir y resolver validación (`ESAVI-CASEFLOW-010`/`-011`) — la pantalla del expediente.
- Reactivar filas desactivadas desde la lista de cierre (el `005B` de cada entidad).
- La comprobación de `CLOSED` en los `PUT` de fase desde el backend (`CASE-PROCESS.md` §10.3).
- Que el backend adopte las incoherencias de §5.6.
- Un motivo de reapertura.
- El historial de cierres y reaperturas más allá de `closedAt`, `reopenCount` y `lastReopenedAt`.
- Cerrar desde el listado de casos, uno o varios a la vez.
- El botón «Anterior» del asistente.
- Cualquier rediseño del stepper más allá de añadir el paso.

Cada uno de esos, si aterriza, va en su propio spec.

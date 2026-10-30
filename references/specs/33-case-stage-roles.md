# SPEC FE33 — Roles por etapa del caso: NOTIFIER, INVESTIGATOR y EVALUATOR

> **Estado:** Aprobado
> **Depende de:** SPEC F64 del backend (roles por etapa del caso), SPEC FE08 (shell del asistente), SPEC FE10 (alta del caso y alcance geográfico), SPEC FE14b (cierre y reapertura), SPEC FE23 (validación del caso)
> **Fecha:** 2026-10-30
> **Objetivo:** Que el cliente refleje los tres roles nuevos del recorrido del caso: cada paso del asistente se puede editar o queda en solo lectura según el nivel del usuario, y `USER` pasa a ser un rol de consulta.

> **Nota de implementación (2026-10-30)** — rama `spec-33-case-stage-roles`. Diferencias entre el texto y lo implementado; mandan sobre el cuerpo cuando lo contradicen.
>
> - **El filtro geográfico (paso 11) se adelantó al paso 1.** Bajar `USER` a 20 dejaba en rojo dos tests que simulaban `USER` en 25 contra la comparación `=== ROLE_LEVELS.USER`, y el plan exige que cada paso quede en verde.
> - **`PatientStep` recibe `readOnly` por prop, no llama al hook.** Vive en `features/patient` y `CONVENTIONS.md` §3 prohíbe importar de `features/esaviCase`; `CaseWizardPage` calcula `useStepReadOnly('patient', id)` y se lo pasa.
> - **`NotificationStep` no lleva `fieldset disabled`.** Nunca lo tuvo con el caso cerrado: su solo lectura son las listas de satélites sin acciones, `revealAll` y la barra sin «Guardar» ni «Completar etapa» (paso 7). Envolver el paso entero deshabilitaría «Ver auditoría» dentro de las listas, que `SUPERADMIN` sigue usando con el caso cerrado. Los campos de cabecera se pueden teclear pero nada se guarda — el mismo comportamiento que con el caso cerrado. La verificación del paso 5 («`fieldset` deshabilitado» en los cuatro pasos) se cumple en `CaseOpeningStep` y `ClassificationStep`; en `PatientStep` se cumple ocultando «Editar paciente».
> - **`ClassificationStep` no tenía modo de solo lectura**, ni siquiera con el caso cerrado. Ahora lleva el `fieldset disabled` de `isReadOnly`, así que también un caso cerrado lo muestra deshabilitado.
> - **`InvestigationStep` crea su cabecera con un `POST` al entrar** (`ESAVI-INVESTGN-001`, SPEC FE13a), y el spec no lo preveía. En solo lectura ese `POST` ya no se dispara —un `NOTIFIER` recibía un `403` sólo por mirar—, y la rama «la investigación no existe y no puedo crearla» pinta un estado vacío con una clave nueva, `investigation.readOnly.notStarted`, en es/en/nl. Se suma a las dos claves de §3.8.
> - **`ClosureStep` oculta «Cerrar expediente» con `isReadOnly` del paso `closure`** desde el paso 6, no con un `useCan(EVALUATOR)` aparte en el paso 8: es el mismo umbral (`STEP_MIN_LEVEL.closure`) y una sola fuente.
> - **`caseWizard.readOnly.stageForbiddenBanner` se añadió en el paso 7**, no en el 12: el aviso la necesitaba para renderizar. El paso 12 queda con `CASEFLOW_007_STAGE_FORBIDDEN`.
> - **Los textos de «pedir la reapertura» nombran al evaluador.** `caseWizard.readOnly.closedBanner` y `caseWorkflow.closed.askAdmin` decían «un administrador»; con F64 reabre `EVALUATOR`, así que pasan a «un evaluador o administrador» (y sus equivalentes en en/nl). Decisión del usuario durante el paso 7.
> - **`<RequireRole>` no pinta una pantalla «sin permiso»: redirige a `/`.** §3.1, §3.6, el paso 9 y §5 dicen que un `USER` en `/esavi-cases/new` «ve la pantalla sin permiso»; lo que hace la primitiva compartida —sin cambios en este spec— es `<Navigate to="/" replace />`. El criterio se verifica como «un `USER` en `/esavi-cases/new` termina en `/` sin ver el formulario» (`router.esaviCase.test.tsx`).
> - **Los avisos «NeedsAdmin» del paso 4 desaparecen.** Sin los tres `useCan(ADMIN)` de §1 D, `notification.medications.gateLockedNeedsAdmin`, `notification.medicalHistory.gateLockedNeedsAdmin` y `notification.pregnancy.gate.blocked.complicationsNeedsAdmin` quedaron sin uso y se borraron de es/en/nl; siempre se muestra la variante que pide retirar las filas una a una.
> - **Siete textos más que contradecían F64 se corrigieron** (decisión del usuario durante el paso 10): los toasts de `403` de los satélites (`notification.satellites.adminRequiredEdit` y `…adminRequiredDelete`, `notification.medicalHistory.roleForbidden.delete`, `notification.pregnancy.complications.roleForbidden.delete`) dicen «Tu rol no puede…» en vez de «exige un administrador en este despliegue»; `investigation.newbornCondition.outcomeLocked.description_one/_other` pide retirarlas en vez de nombrar al administrador (`INVPREG-005A` es `INVESTIGATOR`), y `caseWorkflow.close.confirmBody` nombra al evaluador. Las claves conservan su nombre (`adminRequired*`) para no tocar a sus consumidores.
> - **Seis secciones del paso 5 también creaban su fila al montarse** (`AdministrationErrorSection`, `ClinicalEvaluationSection`, `ColdChainSection`, `CommunitySection`, `MedicalHistorySection`, `VaccinationContextSection`). Lo destapó la verificación manual del paso 13: con el paso en solo lectura todas se revelan a la vez y cada una lanzaba su `POST` — `409` con el caso cerrado (ya pasaba antes de FE33) y `403` con un rol por debajo de `INVESTIGATOR`. Ahora el efecto no crea con `disabled`, que es el `isReadOnly` del paso, y lo tiene como dependencia; `InvestigationStep.test.tsx` lo fija.
> - **El `NavItem` «Registrar» sí cambia de `minLevel`.** §3.1 decía «ningún `NavItem` cambia de `minLevel`», y era falso: `nav.items.caseRegister` apunta a `/esavi-cases/new`, que ahora exige `NOTIFIER`. Con `USER` el menú lateral (y la paleta, que sale del mismo array) ofrecía un enlace que acababa en `/`. Lo destapó la verificación manual con un `USER` real; `navigation.ts` lo sube a `NOTIFIER`, como pide `CONVENTIONS.md` §5, y `navigation.test.ts` lo fija.
> - **`canWriteStep` no tiene consumidor en producción.** `useStepReadOnly` pasa por `useCan(STEP_MIN_LEVEL[slug])` para no saltarse `CONVENTIONS.md` §11; `canWriteStep` queda como función pura probada.

---

## 1. Por qué existe este spec

Es el consumo del SPEC F64 del backend, ya implementado. F64 añade `NOTIFIER` (25), `INVESTIGATOR` (30) y `EVALUATOR` (40), baja `USER` de 25 a 20 como rol de solo lectura, cambia el rol mínimo de 77 códigos y añade el error `CASEFLOW_007_STAGE_FORBIDDEN`. Sin este spec, el cliente se desalinea en cinco puntos:

**A — `ROLE_LEVELS` no conoce los roles nuevos.** `src/shared/config/roles.ts:3-8` tiene cuatro niveles y `USER` en 25. Un `EVALUATOR` resuelve su nivel por `role.level`, así que `useCan` acierta. Pero cualquier comparación con `ROLE_LEVELS.USER` usa el umbral viejo, y el fallback por nombre devuelve 0 para los tres roles nuevos.

**B — El asistente ofrece escribir a quien la API se lo rechaza.** Los pasos solo pasan a solo lectura con el caso cerrado (`isClosed`: `CaseOpeningStep.tsx:54`, `CaseWizardActionBar.tsx:53`, `InvestigationStep.tsx:360`, `FinalClassificationStep.tsx:584`). Un `USER` ve todos los formularios editables, un `NOTIFIER` ve la investigación editable, y un `INVESTIGATOR` ve la clasificación final editable. Todos terminan en `403`.

**C — Las acciones del flujo usan umbrales viejos.**

- «Reabrir» exige `ADMIN` (`CaseWizardPage.tsx:72`, `ClosureStep.tsx:421`, `ReopenCaseButton.tsx:31`), pero F64 la bajó a `EVALUATOR`.
- «Nuevo caso» se habilita con `USER` (`EsaviCaseListPage.tsx:81`).
- `CaseValidationActions.tsx:40` no comprueba rol porque «las dos rutas son USER». Ahora pedir validación es `NOTIFIER` y resolverla es `EVALUATOR`.

**D — Los controles de retirar del paso 4 llevan desfasados desde F60.** `NotifierList.tsx:83`, `NotificationStep.tsx:380` y `PregnancyBlockDialog.tsx:47` esconden o reformulan acciones tras `useCan(ADMIN)`, suponiendo que los `005A` siguen en `ADMIN`. Desde F60 eran `USER`, y con F64 son `NOTIFIER`.

**E — El filtro geográfico deja fuera a los roles nuevos.** `CaseOpeningStep.tsx:66` y `HealthFacilitySelect.tsx:39` filtran por cobertura solo si el nivel es exactamente `USER`. El backend acota a todo el que no es admin (`resolveUserGeoScopeIds`, `geoScope.service.ts:57`). Un `NOTIFIER` vería establecimientos que después la API le rechaza.

---

## 2. Alcance

**Dentro:**

- **Escalera de roles.**
  - `ROLE_LEVELS` en `src/shared/config/roles.ts` con los siete niveles de F64.
  - La línea de la escalera en `references/CONVENTIONS.md` §11.
  - Los tests de `roles.test.ts`.
- **Nivel mínimo por paso.** Un mapa total sobre `CASE_WIZARD_STEPS` en `steps.ts` (`STEP_MIN_LEVEL`) y una función pura `canWriteStep(slug, level)`. Las etapas con nombre siguen a `STAGE_MIN_ROLE` del backend.
- **Solo lectura por rol en el asistente.** `isClosed` se generaliza a `isReadOnly = isClosed || !canWriteStep`, que alimenta el mismo mecanismo de hoy:
  - `fieldset disabled` y `hideActions`;
  - sin «Guardar» ni «Completar etapa» en la barra de acciones;
  - satélites con `disabled`.

  Afecta a los siete pasos con formulario y a la barra de acciones.
- **Aviso nuevo** `caseWizard.readOnly.stageForbiddenBanner`. Si el caso está cerrado, manda el aviso de cerrado y no se apilan los dos.
- **Acciones del flujo.**
  - Reabrir y cerrar: `EVALUATOR`.
  - Resolver validación: `EVALUATOR`.
  - Pedir validación: `NOTIFIER`.
- **Alta.**
  - «Nuevo caso» y la creación de paciente se ocultan por debajo de `NOTIFIER`.
  - Las cuatro rutas `/esavi-cases/new*` (`router.tsx:118-121`) quedan bajo `<RequireRole level={ROLE_LEVELS.NOTIFIER}>`.
- **Satélites del paso 4.** Los tres `useCan(ADMIN)` de §1 D dejan de existir: retirar sigue a `isReadOnly` del paso. Se actualiza el comentario de `notifier/api.ts:10`.
- **Error nuevo.** `CASEFLOW_007_STAGE_FORBIDDEN` en `errorMessages` y en es/en/nl. Se muestra como toast de rechazo, sin redirigir.
- **Filtro geográfico.** `CaseOpeningStep.tsx:66` y `HealthFacilitySelect.tsx:39` pasan a `nivel < ADMIN`.
- **Inventario.** Se regenera `references/API-ROUTES.md` con `extract-routes.cjs` y se añade su nota de cambios.

**Fuera de alcance:**

- **Operaciones de supervisión.** Retirar (`005A` en `ADMIN`), ver retirados (`002B`), restaurar (`005B`) y auditoría siguen con sus umbrales; F64 no las toca.
- **Rutas que no son del caso.** Catálogos, geografía, MedDRA, WHODrug y usuarios siguen en el literal `USER`, ahora 20. No hace falta tocarlas.
- **Asignar roles.** Los roles nuevos ya aparecen en `UserRoleCheckboxGroup` y en la pantalla de roles, porque salen de `ESAVI-APPROLE-002A`. No hay pantalla ni etiqueta nueva.
- **Ocultar pasos en el indicador de pasos** (descartado en §6).
- **Permisos no anidados** (por ejemplo, un evaluador que no notifica). El modelo sigue siendo la escalera numérica; un rol así exige otro spec en los dos repositorios.
- **La migración de datos de F64** (`grant-evaluator-to-users.ts`). Es del backend y el cliente no hace nada con ella.

---

## 3. Diseño

Es un spec de ampliación transversal. No hay entidad ni pantalla nueva, así que las secciones 3.1 a 3.8 se reducen a lo que cambia, con tablas de antes y después.

### 3.1 Pantallas y rutas

| Ruta | Antes | Después |
|---|---|---|
| `/esavi-cases`, `/esavi-cases/:id`, `/esavi-cases/:id/wizard/:step?` | `USER` (25) | `USER` (20), sin cambios: solo lectura |
| `/esavi-cases/new`, `/new/patient`, `/new/case-opening`, `/new/:step` (`router.tsx:118-121`) | `USER` | `<RequireRole level={ROLE_LEVELS.NOTIFIER}>` |

Ningún `NavItem` cambia de `minLevel`.

### 3.2 Endpoints consumidos

No se consume ninguna ruta nueva. Solo cambia el rol mínimo de las que ya se consumen. Va la tabla resumida por familia; la lista completa de los 77 códigos es F64 §8.1 y queda en `API-ROUTES.md` al regenerarlo.

| Familia | Códigos | Antes | Después |
|---|---|---|---|
| Alta y pasos 1–4 | `PATIENT-001/004`, `CASE-001/004`, `NOTIFIER-001/004/005A`, `CLASSIF-001/004`, `NOTIFCN`, `SEVNOT`, `NSEVNOT` (`001/004`), `NOTIFEVT`, `NOTIFMED`, `NOTIFVAC`, `NOTIFDIL`, `NOTIFPRG`, `PREGCOMP`, `MEDHIST` (`001/004/005A`) | `USER` | `NOTIFIER` |
| Paso 5 | `INVESTGN-001/004/005A`, los satélites `INV*` (`001/004`, y `005A` donde existe), `EVALINST-001/004/005A` | `USER` | `INVESTIGATOR` |
| Paso 6 | `FINCLASS-001`, `FINCLASS-004` | `USER` | `EVALUATOR` |
| Flujo del caso | `CASEFLOW-007` complete-stage (+ comprobación por etapa) | `USER` | `NOTIFIER` |
| | `CASEFLOW-010` request-validation | `USER` | `NOTIFIER` |
| | `CASEFLOW-008` close · `CASEFLOW-011` resolve-validation | `USER` | `EVALUATOR` |
| | `CASEFLOW-009` reopen | `ADMIN` | `EVALUATOR` |
| Lecturas del caso | todos los `002A`, `003`, `006` y `/case/:id` | `USER` 25 | `USER` 20 (mismo literal) |

**Error nuevo de `ESAVI-CASEFLOW-007`:** `403 CASEFLOW_007_STAGE_FORBIDDEN`, con `{ stage }`. `INVESTIGATION` exige 30 y `FINAL_CLASSIFICATION` exige 40.

### 3.3 Tipos del contrato

No cambia ningún tipo: ningún `data` cambia. `RoleName` se amplía solo porque deriva de `ROLE_LEVELS`.

| Constante | Antes | Después |
|---|---|---|
| `ROLE_LEVELS` | `SUPERADMIN 100 · ADMIN 50 · USER 25 · ANALYTICS 10` | `SUPERADMIN 100 · ADMIN 50 · EVALUATOR 40 · INVESTIGATOR 30 · NOTIFIER 25 · USER 20 · ANALYTICS 10` |

El orden de declaración sigue la escalera. `getEffectiveLevel` no cambia: el fallback por nombre ya resuelve los tres roles nuevos al aparecer en la constante.

### 3.4 Contrato de estado

No aparece ningún dato nuevo. La tabla fija dónde vive lo que esta funcionalidad lee:

| Dato | Capa | Clave o fuente | Notas |
|---|---|---|---|
| Nivel efectivo del usuario | TanStack Query (derivado) | `['user','me']` → `getEffectiveLevel(user.roles)` | Nunca se copia a `useState` ni a un store |
| Estado del caso (`isClosed`, `PENDING_VALIDATION`) | TanStack Query | clave de `useCaseWorkflow(caseId)` (`ESAVI-CASEFLOW-006`) | Sin cambios |
| `isReadOnly` del paso | Derivado en el render | `useStepReadOnly(slug, caseId)` | No se guarda: se recalcula a partir de las dos filas anteriores |
| Paso activo | `searchParams` / ruta | `:step` de la URL | Sin cambios |

Zustand no se toca. Un dato que no aparece aquí no existe.

### 3.5 Lógica de autorización (en lugar de «Formularios»)

**`STEP_MIN_LEVEL`** en `steps.ts`, total sobre `CaseWizardStepSlug`. Los valores son `ROLE_LEVELS.*`, nunca un número escrito a mano:

| Paso | Nivel para escribir | Corresponde en F64 §3.5 |
|---|---|---|
| `patient` | `NOTIFIER` | `PATIENT-001/004` |
| `case-opening` | `NOTIFIER` | `CASE-001/004` |
| `classification` | `NOTIFIER` | etapa `CLASSIFICATION` |
| `notification` | `NOTIFIER` | etapa `NOTIFICATION` |
| `investigation` | `INVESTIGATOR` | etapa `INVESTIGATION` |
| `final-classification` | `EVALUATOR` | etapa `FINAL_CLASSIFICATION` |
| `closure` | `EVALUATOR` | `CASEFLOW-008` |

- **`canWriteStep(slug, level)`** es una función pura: `level >= STEP_MIN_LEVEL[slug]`.
- **`useStepReadOnly(slug, caseId)`** vive en `features/esaviCase/` y devuelve `{ isReadOnly, reason: 'closed' | 'role' | null }`.
  - `'closed'` tiene prioridad sobre `'role'`.
  - Sustituye la derivación local de `isClosed` en cada paso (`CaseOpeningStep.tsx:54`, `NotificationStep.tsx:1458`, `FinalClassificationStep.tsx:584`, la prop `isClosed` de `InvestigationStep`, etc.).
  - Las props y los atributos que hoy reciben `isClosed` (`disabled`, `readOnly`, `hideActions`, `revealAllRef`) pasan a recibir `isReadOnly`.
- **`CaseWizardActionBar`**: «Guardar» y «Completar etapa» se ocultan con `isReadOnly` del paso activo, no solo con `isClosed`. La lista de campos pendientes también se oculta.

**Acciones del flujo:**

| Componente | Antes | Después |
|---|---|---|
| `ReopenCaseButton.tsx:31`, `CaseWizardPage.tsx:72`, `ClosureStep.tsx:421` | `useCan(ADMIN)` | `useCan(EVALUATOR)` |
| Botón «Cerrar» en `ClosureStep` | sin control | `useCan(EVALUATOR)` |
| `CaseValidationActions`: pedir | sin control | `useCan(NOTIFIER)` |
| `CaseValidationActions`: resolver | sin control | `useCan(EVALUATOR)` |
| `EsaviCaseListPage.tsx:81` («Nuevo caso») | `useCan(USER)` | `useCan(NOTIFIER)` |
| `NotifierList.tsx:83`, `NotificationStep.tsx:380`, `PregnancyBlockDialog.tsx:47` | `useCan(ADMIN)` | se elimina; manda `isReadOnly` del paso 4 |
| `CaseOpeningStep.tsx:66`, `HealthFacilitySelect.tsx:39` | `nivel === USER` | `nivel < ADMIN` |

Con el modo «resumen», `CaseValidationActions` no muestra nada si el usuario no puede la acción que tocaría. No se muestra un botón deshabilitado.

**Manejo de errores:** `CASEFLOW_007_STAGE_FORBIDDEN` va a `errorMessages` como un código más y sale como toast de error. No redirige ni invalida la sesión. `AUTH_ROLE_FORBIDDEN` mantiene su tratamiento actual.

### 3.6 Estados de la pantalla

| Estado | Antes | Después |
|---|---|---|
| Carga, vacío, error | — | sin cambios |
| Sin permiso en una ruta `/esavi-cases/new*` | formulario que termina en `403` | la pantalla «sin permiso» de `<RequireRole>` |
| Paso sin nivel suficiente | editable, `403` al guardar | solo lectura con el aviso `stageForbiddenBanner` |
| Paso sin nivel y caso cerrado | — | solo el aviso de cerrado |
| Caso pendiente de validación | aviso `pendingValidationBanner` | sin cambios; convive con `stageForbiddenBanner` porque no es de solo lectura |

### 3.7 Responsividad y accesibilidad

Ninguna maqueta cambia. El aviso usa el mismo componente y los mismos tokens que `closedBanner`, con `role="status"`. Un `fieldset disabled` ya anuncia el estado a los lectores de pantalla, igual que con el caso cerrado.

### 3.8 Claves i18n nuevas

En es, en y nl:

- `caseWizard.readOnly.stageForbiddenBanner`, del tipo «Tu rol puede consultar esta etapa, pero no editarla».
- `errors.CASEFLOW_007_STAGE_FORBIDDEN`, del tipo «Tu rol no puede completar esta etapa». Va en el mismo espacio de nombres que los otros `CASEFLOW_007_*` (`es.json:582-584`).

---

## 4. Plan de implementación

Cada paso deja el repositorio en verde (`npm run check` y `npx tsc --noEmit -p tsconfig.app.json`).

1. **Escalera de roles.** `src/shared/config/roles.ts` pasa a los siete niveles de §3.3, en orden de escalera. Se actualiza la línea de `references/CONVENTIONS.md` §11. `roles.test.ts` añade los casos de los tres roles nuevos con `level: null`, para que se use el valor de la constante, y de `USER` en 20.
   *Verificación:* `getEffectiveLevel([{ name: 'INVESTIGATOR', level: null }])` da 30, y `[{ name: 'USER', level: null }]` da 20.

2. **Regenerar `API-ROUTES.md`.** Con `references/scripts/extract-routes.cjs`, según `references/README.md`. Se añade la nota de cambios en la cabecera: F64, 77 códigos.
   *Verificación:* `ESAVI-CASEFLOW-009` aparece con `EVALUATOR`, `ESAVI-INVTEAM-005A` con `INVESTIGATOR` y `ESAVI-PATIENT-001` con `NOTIFIER`. El total de rutas no cambia.

3. **`STEP_MIN_LEVEL` y `canWriteStep`** en `steps.ts`, según §3.5. `steps.test.ts` comprueba que el mapa es total sobre `CASE_WIZARD_STEPS` y recorre la tabla de §3.5 con el nivel justo por debajo y con el mínimo.
   *Verificación:* `canWriteStep('investigation', 25)` da `false`, `canWriteStep('investigation', 30)` da `true` y `canWriteStep('closure', 30)` da `false`.

4. **`useStepReadOnly(slug, caseId)`** en `features/esaviCase/`, con un test por cada combinación de `reason`.
   *Verificación:* un caso cerrado con nivel 100 da `'closed'`; un caso abierto con nivel 25 en `investigation` da `'role'`; un caso cerrado con nivel 25 en `investigation` da `'closed'`; un caso abierto con nivel 40 en `investigation` da `null`.

5. **Pasos 1 a 4 sobre `isReadOnly`.** `PatientStep`, `CaseOpeningStep`, `ClassificationStep` y `NotificationStep` dejan de derivar `isClosed` y usan el hook. Las props que reciben `isClosed` pasan a `isReadOnly`, incluidas las listas de satélites del paso 4 (`MedicalHistoryList`, `EventList`, etc.).
   *Verificación:* con un usuario `USER` en un caso abierto, los cuatro pasos se ven con el `fieldset` deshabilitado y sin botones de acción. Los tests de caso cerrado de cada paso siguen pasando sin cambios.

6. **Pasos 5 y 6 y cierre sobre `isReadOnly`.** `InvestigationStep` (todas las props `disabled={isClosed}`), `FinalClassificationStep` y `ClosureStep`.
   *Verificación:* un `NOTIFIER` ve la investigación en solo lectura y un `INVESTIGATOR` la puede editar. Un `INVESTIGATOR` ve la clasificación final en solo lectura y un `EVALUATOR` la puede editar.

7. **Barra de acciones y aviso.** `CaseWizardActionBar` oculta «Guardar», «Completar etapa» y los campos pendientes con `isReadOnly`. `CaseWizardPage` muestra `stageForbiddenBanner` cuando `reason === 'role'`, en el mismo lugar que `closedBanner`.
   *Verificación:* con `reason === 'closed'` solo aparece el aviso de cerrado. Con `'role'` solo aparece el de rol. «Anterior» y «Siguiente» siguen disponibles en los dos casos.

8. **Acciones del flujo.** Se aplican las filas de reabrir, cerrar, pedir validación y resolver validación de la tabla de §3.5. Se reescribe el comentario de `CaseValidationActions.tsx:40`.
   *Verificación:* un `INVESTIGATOR` ve «Pedir validación» pero no «Resolver», ni «Cerrar», ni «Reabrir». Un `EVALUATOR` y un `ADMIN` ven las cuatro.

9. **Alta.** Las cuatro rutas `/esavi-cases/new*` pasan a `<RequireRole level={ROLE_LEVELS.NOTIFIER}>` en `router.tsx`, y `EsaviCaseListPage.tsx:81` pasa a `useCan(NOTIFIER)`. Se ajusta `router.esaviCase.test.tsx`.
   *Verificación:* un `USER` que navega a `/esavi-cases/new` ve la pantalla «sin permiso», y el listado no le muestra «Nuevo caso».

10. **Satélites del paso 4.** Se eliminan `canRemove` (`NotifierList.tsx:83`), `canAdminSatellites` (`NotificationStep.tsx:380`) y `canAdminComplications` (`PregnancyBlockDialog.tsx:47`). Retirar y las frases que dependían de esos permisos pasan a seguir a `isReadOnly` del paso. Se corrigen los comentarios que citan `005A` en `ADMIN`, incluido `notifier/api.ts:10`.
    *Verificación:* un `NOTIFIER` ve «Quitar» en notificadores y en complicaciones del embarazo. `grep -rn "useCan(ROLE_LEVELS.ADMIN)" src/features/notifier src/features/notification src/features/esaviCase/NotificationStep.tsx` no devuelve nada.

11. **Filtro geográfico.** `CaseOpeningStep.tsx:66` y `HealthFacilitySelect.tsx:39` pasan a `getEffectiveLevel(user.roles) < ROLE_LEVELS.ADMIN`, y se reescribe el comentario que dice «exactamente USER».
    *Verificación:* un `EVALUATOR` con cobertura asignada ve solo los establecimientos de su territorio. Un `ADMIN` los ve todos.

12. **Error y claves i18n.** `CASEFLOW_007_STAGE_FORBIDDEN` en los tres idiomas, junto a los otros `CASEFLOW_007_*`, más `caseWizard.readOnly.stageForbiddenBanner`. Se añade un caso a `errorMessages.test.ts`.
    *Verificación:* `npm run i18n:check` sale en 0, y el test resuelve el código al mensaje en español.

13. **Verificación manual con roles.** Contra el backend en marcha, con cuatro usuarios: `USER`, `NOTIFIER`, `INVESTIGATOR` y `EVALUATOR`. Se usa una sola sesión de navegador por usuario: clonar el `storageState` revoca las sesiones, por la detección de reutilización de F42.
    *Verificación:* se recorre la tabla de §5 sin ningún `403` en la consola de red.

---

## 5. Criterios de aceptación

**Matriz por rol.** Caso abierto, no grave con investigación solicitada, con todos los pasos visibles:

| Rol | Pasos 1–4 | Paso 5 | Paso 6 | Completar etapa | Pedir validación | Resolver, cerrar, reabrir | Nuevo caso |
|---|---|---|---|---|---|---|---|
| `USER` (20) | lectura | lectura | lectura | — | — | — | — |
| `NOTIFIER` (25) | edita | lectura | lectura | etapas 3–4 | sí | — | sí |
| `INVESTIGATOR` (30) | edita | edita | lectura | etapas 3–5 | sí | — | sí |
| `EVALUATOR` (40) | edita | edita | edita | todas | sí | sí | sí |
| `ADMIN` (50) | edita | edita | edita | todas | sí | sí | sí |

- [ ] Cada celda de la matriz se cumple en la verificación manual del paso 13, sin ningún `403` en la consola de red.
- [ ] `ROLE_LEVELS` tiene los siete niveles de §3.3, y `CONVENTIONS.md` §11 dice lo mismo.
- [ ] `STEP_MIN_LEVEL` es total sobre `CASE_WIZARD_STEPS`, y sus valores salen de `ROLE_LEVELS`: `grep -nE "STEP_MIN_LEVEL.*[0-9]{2}" src/features/esaviCase/steps.ts` no devuelve nada.
- [ ] Ningún paso deriva `isClosed` por su cuenta: `grep -rn "status.code === 'CLOSED'" src/features/esaviCase/*Step.tsx` no devuelve nada.
- [ ] Ninguna comparación de nivel exacto queda en `src/`: `grep -rn "=== ROLE_LEVELS" src/` no devuelve nada.
- [ ] `grep -rn "useCan(ROLE_LEVELS.ADMIN)" src/features/esaviCase/CaseWizardPage.tsx src/features/esaviCase/ClosureStep.tsx src/features/caseWorkflow/ReopenCaseButton.tsx` no devuelve nada.
- [ ] Un `USER` en `/esavi-cases/new` ve la pantalla «sin permiso», no el formulario.
- [ ] Con caso cerrado y rol insuficiente se muestra solo el aviso de cerrado.
- [ ] Forzar un `CASEFLOW_007_STAGE_FORBIDDEN` (MSW en el test de la barra de acciones) muestra el toast traducido y no redirige.
- [ ] Un `EVALUATOR` con cobertura geográfica ve el selector de establecimientos filtrado.
- [ ] `API-ROUTES.md` está regenerado, con la nota de cambios de F64.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El aviso `stageForbiddenBanner` se ve correcto en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/esaviCase/ src/features/caseWorkflow/` no devuelve resultados nuevos.
- [ ] **Por debajo de `md`.** En 375 px, el aviso y el paso en solo lectura no provocan scroll horizontal, y la barra de acciones fija abajo sigue funcionando con solo «Anterior» y «Siguiente».
- [ ] **Rol bajo.** Con `USER` el menú no ofrece nada que la ruta rechace, y un `403` inesperado se maneja sin pantalla en blanco. Con `ANALYTICS` el menú del caso no aparece.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n. Las dos claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** El nivel del usuario y `isReadOnly` se derivan en el render, según §3.4. Nada se copia a `useState` ni a un store.

---

## 6. Decisiones tomadas y descartadas

**Modelo**

- **Sí:** se replica la escalera numérica de F64 sin cambiar el modelo. `useCan(level)` sigue siendo el único consumidor, y los tres roles nuevos son tres umbrales más.
- **No:** permisos por etapa en el cliente (`roles.includes('INVESTIGATOR')`). El backend autoriza por nivel; un cliente que autorizara por nombre se desalinearía con el primer rol creado desde la pantalla de roles con un nivel intermedio.
- **Sí:** el nivel mínimo de cada paso se declara una sola vez (`STEP_MIN_LEVEL`) y copia `STAGE_MIN_ROLE` del backend. Repartir `useCan(...)` paso por paso multiplicaría los sitios que hay que tocar con el próximo cambio de roles.

**Solo lectura**

- **Sí:** el paso sin nivel suficiente se muestra en solo lectura, reutilizando el mecanismo del caso cerrado. Las lecturas siguen en `USER`, así que el dato llega y ocultarlo no protege nada. El Notificador sigue viendo el estado del caso que abrió.
- **No:** ocultar los pasos 5 y 6 en el indicador de pasos. Rompe la vista del recorrido completo y no añade seguridad.
- **Sí:** un único `useStepReadOnly` con `reason`, en lugar de que cada paso combine `isClosed` y `useCan`. La prioridad «cerrado antes que rol» queda en un solo sitio y tiene su test.
- **Sí:** el aviso de cerrado y el de rol no se apilan. Con el caso cerrado, el rol no cambia nada de lo que el usuario puede hacer en ese paso.
- **Sí:** el aviso de validación pendiente convive con el de rol. No significa solo lectura, sino que hay una revisión en curso.

**Acciones**

- **Sí:** las acciones que el rol no permite se ocultan, no se deshabilitan, igual que con el resto de `useCan` del repositorio. Un botón deshabilitado sin explicación invita a pensar que es un fallo.
- **Sí:** las rutas de alta van bajo `<RequireRole level={NOTIFIER}>`, además de ocultar el botón. Un `USER` que llega por URL o por un enlace guardado ve «sin permiso» y no un formulario que acaba en `403`.
- **Sí:** los tres `useCan(ADMIN)` del paso 4 desaparecen en vez de bajar a `useCan(NOTIFIER)`. El paso 4 entero ya exige `NOTIFIER`, así que una segunda comprobación igual sería redundante y podría divergir.
- **Sí:** `CASEFLOW_007_STAGE_FORBIDDEN` es un toast de rechazo, no una pérdida de acceso. Es lo que F64 §8.2 pide: el usuario sigue pudiendo leer la pantalla.

**Filtro geográfico**

- **Sí:** se corrige aquí con `nivel < ADMIN`. El error lo destapa F64, y dejarlo para otro spec publicaría los roles nuevos con un selector que ofrece establecimientos que la API rechaza.
- **No:** replicar `isAdmin` por nombre de rol. El backend lo compara por nombre, pero el cliente ya razona por nivel en todo lo demás. Los dos criterios solo divergen con un rol personalizado de nivel ≥ 50 que no se llame `ADMIN` ni `SUPERADMIN`; queda como riesgo en §7.

**Alcance**

- **No:** tocar retirar (`005A` en `ADMIN`), ver retirados, restaurar ni auditoría. F64 no los cambia.
- **No:** ninguna etiqueta i18n para los nombres de rol. Salen del backend (`appRole.name`), igual que hoy.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| **Un rol personalizado de nivel ≥ 50 que no es `ADMIN`.** El backend lo acota por territorio (`isAdmin` por nombre) y el cliente no le filtra los establecimientos. | Hoy no existe ninguno. Se documenta en el comentario de `CaseOpeningStep.tsx:66`. Si se crea, la solución es del backend (que `isAdmin` razone por nivel), no del cliente. |
| **Base sin la migración de F64.** Si `grant-evaluator-to-users.ts` no se ejecutó, `USER` sigue en 25 en la base y `role.level` manda sobre la constante. Esos usuarios siguen escribiendo los pasos 1–4 y el cliente les muestra los pasos 5–6 en solo lectura, coherente con el backend. | Ninguna en el cliente: refleja lo que diga `role.level`. La verificación manual del paso 13 se hace contra una base migrada. |
| **Antiguos `USER` con dos roles.** La migración da `EVALUATOR` sin quitar `USER`. `getEffectiveLevel` toma el máximo, así que ven 40. | Ninguna necesaria; es lo que F64 busca. Se anota para que nadie lo tome por un fallo al probar. |
| **`isReadOnly` sustituye a `isClosed` en muchas props.** Una prop que se quede en `isClosed` deja un control editable para un rol insuficiente. | El criterio de §5 con `grep "status.code === 'CLOSED'"` sobre los pasos, y los tests de solo lectura por rol del paso 5 y 6. |
| **Toast de `STAGE_FORBIDDEN` en vez de un aviso previo.** Si `STEP_MIN_LEVEL` y `STAGE_MIN_ROLE` se separan con un cambio futuro del backend, el usuario verá el botón y recibirá el toast. | El comentario de `STEP_MIN_LEVEL` cita `STAGE_MIN_ROLE` de `caseWorkflow.service.ts` como su fuente. |

---

## 8. Impacto en pantallas existentes

| Pantalla | Qué cambia |
|---|---|
| Listado de casos | «Nuevo caso» desde `NOTIFIER` |
| Alta del caso (`/esavi-cases/new*`) | Protegida con `NOTIFIER`; el selector de establecimientos filtra a todo el que no es admin |
| Detalle del caso | «Reabrir» desde `EVALUATOR` |
| Asistente, siete pasos | Solo lectura por rol y aviso nuevo; barra de acciones sin «Guardar» ni «Completar etapa» en solo lectura |
| Paso 4 | «Quitar» notificador y complicaciones del embarazo, visible para quien edita el paso |
| Validación (cabecera y paso de cierre) | Pedir desde `NOTIFIER`; resolver desde `EVALUATOR` |
| Cierre | Cerrar y reabrir desde `EVALUATOR` |

---

## Lo que **no** está en este spec

- Cambiar el modelo a permisos por etapa (roles no anidados).
- Mover las operaciones de supervisión: `005A` en `ADMIN`, `002B`, `005B` y auditoría.
- Hacer que `isAdmin` del backend razone por nivel.
- Etiquetas o descripciones de rol en el cliente.
- Ocultar pasos en el indicador de pasos.

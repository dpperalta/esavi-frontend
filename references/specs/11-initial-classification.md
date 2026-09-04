# SPEC FE11 — Paso 3: Clasificación inicial

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell y autenticación), SPEC FE02 (fábrica de recursos y primitivas), SPEC FE08 (armazón del wizard: `steps.ts`, `CaseWizardContext`, `CaseWizardPage`), SPEC FE10 (patrón de paso del wizard, `<CatalogSelect emit>`), **SPEC F09 del backend** (CRUD de `classification`), **SPEC F44** (`ESAVI-CASEFLOW-012`, avance de etapa), `esavi-backend/src/helpers/severity.helper.ts` (matriz de coherencia)
> **Fecha:** 2026-09-04
> **Objetivo:** El formulario del paso 3 del wizard — clasificación inicial de gravedad — con su compuerta derivada, sus ocho criterios ternarios y la edad calculada o de respaldo.

---

## 1. Por qué existe este spec

Es el consumo cliente de SPEC F09 del backend (`classification`), y el tercero de los siete specs que implementan `references/CASE-PROCESS.md` (§5.3 de ese documento, cerrada). FE08 dejó el slug `classification` declarado en `steps.ts` con su etapa (`CaseWorkflowStage.CLASSIFICATION`) y su lugar en el stepper, pero el `<Outlet>` de ese paso es hoy un `<div>` con el nombre del slug — el placeholder explícito del paso 9 de FE08.

**A — Es el primer paso donde «obligatorio» no es una lista de campos, sino una matriz.** Los ocho criterios de gravedad no son preguntas independientes: `hasAnySeriousCriterion` deriva `isSeriousEvent` de ellos, y `findSeverityViolation` rechaza tres estados incoherentes (`SERIOUS_FLAG_REQUIRED`, `SERIOUS_WITHOUT_CRITERION`, `OTHER_CONDITION_WITHOUT_DESCRIPTION`). Un formulario que pinte los nueve booleanos como campos sueltos deja que el usuario arme un 400 sin saber por qué, y en el `PUT` ese 400 ni siquiera lleva un `code` distinto por violación (`CLASSIF_004_SEVERITY_INCOHERENT` es uno solo para las tres). La pantalla tiene que impedir el estado antes de enviarlo, no traducir el error después.

**B — La edad no se pregunta, pero la pantalla no sabe de entrada si puede calcularla.** `resolveAgeForCase` sólo calcula cuando `patient.birthDate` **y** `esaviCase.eventDate` existen los dos; si falta uno, usa lo que llegue en el cuerpo. La cabecera del wizard (`ESAVI-CASE-003`, `declared/esaviCase.ts`) ya trae `eventDate`, pero no expone `birthDate` — el paciente resuelto en la cabecera del caso sólo lleva `names`, `lastNames`, `documentNumber` y `healthSystemCode`. Sin una lectura adicional del paciente, el cliente no puede decidir si mostrar el campo de sólo lectura o el editable, y lo adivinaría mal la mitad de las veces.

**C — Crear la clasificación es también avanzar la etapa, y puede fallar por eso.** `createClassificationService` es transaccional con `ESAVI-CASEFLOW-012`: si el expediente está `CLOSED`, la fila de clasificación nunca se crea aunque los datos fueran válidos. Es un error que no tiene campo que marcar —no es un dato mal capturado— y el armazón de FE08 ya debería haber bloqueado el paso antes de llegar aquí (modo sólo lectura con `CLOSED`), así que si aparece es una carrera entre dos pestañas, no el camino normal.

---

## 2. Alcance

**Dentro:**

- **`features/classification/api.ts` y `schemas.ts`** — la declaración del recurso y el schema Zod único (save y complete son el mismo, §6) con la matriz de coherencia replicada.
- **`features/esaviCase/ClassificationStep.tsx`** — sustituye el placeholder `<div>` del slug `classification` en el `<Outlet>` de `CaseWizardPage` (FE08, paso 9). Registra su `CaseWizardStepHandle` (`save`, `isDirty`, `getPendingFields`) en `CaseWizardContext`.
- **La compuerta «¿Es grave?»** como estado de interfaz derivado de `isSeriousEvent` al leer, con confirmación antes de limpiar los ocho criterios al pasar de «Sí» a «No».
- **Los ocho criterios** como `RadioGroup` Sí/No de dos vías (sin retorno a `null` una vez tocados), visibles sólo con la compuerta en «Sí».
- **`otherSeriousConditionDescription`** obligatoria y visible sólo con `causedOtherCondition = true`.
- **El campo edad**: lectura de `['patient', 'detail', patientId]` (`ESAVI-PATIENT-003`, ya declarado en `features/patient/api.ts` por FE10) cruzada con `eventDate` de la cabecera del caso, para decidir modo sólo lectura (texto resuelto) o editable (`<Input type="number">` + `<CatalogSelect typeCode="ageUnit" emit="id">`).
- **`firstConsultationDate`** con `<DateField allowFuture={false}>`.
- **La lectura de la clasificación existente** (`ESAVI-CLASSIF-006`), habilitada sólo cuando `stages.classification.exists === true` (de `useCaseWorkflow`, FE08).
- **`contracts/declared/classification.ts`** con la forma de `toClassificationResponse` (§3.3).
- Las claves `classification.*` nuevas en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **`notes`** — dejado explícitamente como deuda técnica (decisión de esta ronda): no se pinta ningún control para él. La columna existe en el backend y no se envía ni se muestra hasta que un spec posterior la resuelva (posiblemente junto con una decisión de texto enriquecido que toque también a `esaviCase.details`, `notifier.notes` y demás `notes` del proceso).
- **El paso 4 y siguientes** — FE12 en adelante.
- **Listado o administración de clasificaciones** — `002A`/`002B`/`003`/`005A`/`005B`/`005C` no se consumen (§1).
- **Cerrar (`008`), reabrir (`009`) y el modo `CLOSED`** — ya resueltos por FE08; este spec no toca el armazón más allá de llenar el `<Outlet>`.
- **Reconciliar `isSeriousEvent` con `notification.notificationType`** — es la deuda del propio backend (SPEC F44, §6.1 de `CASE-PROCESS.md`); FE12 hereda `isSeriousEvent` ya derivado y bloqueado, no se resuelve aquí.

---

## 3. Diseño

### 3.1 Pantallas y rutas

Sin ruta nueva. `/esavi-cases/:id/wizard/classification` ya existe (FE08); este spec sólo reemplaza el contenido del paso en el `<Outlet>`.

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Paso 3 — Clasificación inicial | `/esavi-cases/:id/wizard/classification` | `features/esaviCase/ClassificationStep.tsx` | `<RequireRole level={USER}>` (heredado del wizard, sin cambio) |

Piezas nuevas:

| Archivo | Qué es |
|---|---|
| `features/classification/api.ts` | `createResource` + `useClassificationByCase` (`006`, la fábrica no tiene noción de lectura por FK) |
| `features/classification/schemas.ts` | `classificationSchema` único, con la matriz de coherencia en `.superRefine()` |
| `features/esaviCase/ClassificationStep.tsx` | El paso 3 completo: compuerta, ocho criterios, edad, fecha de primera consulta |
| `features/esaviCase/SeverityCriteriaGroup.tsx` | Los ocho `RadioGroup` Sí/No con su lógica de «sin retorno a null», extraído del paso para no inflar `ClassificationStep.tsx` |

**No se toca `steps.ts`.** El slug, el grupo y la etapa ya los declaró FE08; este spec sólo llena el `<Outlet>` que faltaba.

### 3.2 Endpoints consumidos

Copiados textualmente de `references/API-ROUTES.md:141-149`:

```
POST  /api/classifications                ESAVI-CLASSIF-001  USER  crea la clasificación (+ avanza CLASSIFICATION)
GET   /api/classifications/case/:id       ESAVI-CLASSIF-006  USER  lectura por caso, en reentrada
PUT   /api/classifications/:id            ESAVI-CLASSIF-004  USER  edición en reentrada
```

Más el que consume por dentro la resolución de edad: **`ESAVI-PATIENT-003`** (`GET /api/patients/:id`, USER), ya declarado en `features/patient/api.ts` por FE10 — se reutiliza `patientResource.useOne(patientId)`, no se redeclara.

Lo que **no** se consume aquí y por qué:

- **`ESAVI-CLASSIF-002A`/`002B`** — no hay listado de clasificaciones; se llega siempre por el caso (§2).
- **`ESAVI-CLASSIF-003`** — lectura por PK propia. `006` (por `caseId`) cubre toda la reentrada; no hace falta la PK de la fila para nada que esta pantalla haga.
- **`ESAVI-CLASSIF-005A`/`005B`/`005C`** — la clasificación es dato obligatorio del expediente, no una entidad administrable aparte; no se ofrece baja, reactivación ni purga desde el wizard.

**Una nota que gobierna el orden de las dos llamadas:** el `POST` es transaccional con `ESAVI-CASEFLOW-012` (§1C) — si falla por `CASEFLOW_012_CASE_CLOSED`, no queda fila de clasificación creada a medias. No hay una segunda escritura encadenada como en FE10 (caso + notificador): aquí es una sola tabla, una sola llamada.

### 3.3 Tipos del contrato

**Una entrada nueva en `contracts:sync`.** `scripts/syncContracts.mjs` gana `{ source: 'classification/classification.types.ts', dest: 'classification.ts' }`. De ahí sale `CreateClassificationInput` (los 16 campos + `caseId` + `isActive`) y `ClassificationListFilters`, que no se usa aquí (§3.2) pero llega entero porque `contracts:sync` copia el archivo tal cual.

**Un tipo declarado a mano en `contracts/declared/classification.ts`.** `toClassificationResponse` construye la respuesta como literal (quita `sysDetails`, `caseId`, `ageUnitItemId` y añade `case` y `ageUnit` resueltos) — no hay `interface` que copiar, mismo caso que `declared/esaviCase.ts`:

```ts
// GET .../classifications/case/:id (006), POST (001), PUT (004) — origen:
// esavi-backend/src/services/classification.service.ts:73-79 (toClassificationResponse),
// DETAIL_EXCLUDE, CASE_INCLUDE, AGE_UNIT_INCLUDE
export interface ClassificationDetail {
  classificationId: string;
  age: number | null;
  firstConsultationDate: string | null;
  isSeriousEvent: boolean | null;
  causedDeath: boolean | null;
  causedDisability: boolean | null;
  causedCongenitalAnomaly: boolean | null;
  causedFetalDeath: boolean | null;
  causedLifeThreatening: boolean | null;
  causedHospitalization: boolean | null;
  causedAbortion: boolean | null;
  causedOtherCondition: boolean | null;
  otherSeriousConditionDescription: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetails[];
  case: { caseId: string; caseCode: string; reportDate: string | null; eventDate: string | null };
  ageUnit: { catalogItemId: string; code: string; name: string; value: string | null } | null;
}
```

**Ningún tipo del contrato se redefine en la feature** (`CONVENTIONS.md` §9): `features/classification/schemas.ts` deriva el tipo de formulario de `CreateClassificationInput`, no lo reescribe.

### 3.4 Contrato de estado

**Cero datos del servidor en `useState`, cero en Zustand fuera de `drafts`.**

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId`, paso activo | URL | heredado de `/esavi-cases/:id/wizard/:step` (FE08) | sin cambio |
| Workflow (`stages.classification.exists/id`) | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | ya existe (FE08); decide `POST` vs `PUT` y si se llama a `006` |
| Clasificación existente | TanStack Query | `['classification', 'byCase', caseId]` | `enabled: stages.classification.exists === true`; sin `staleTime`, se invalida tras `001`/`004` |
| Paciente (para `birthDate`) | TanStack Query | `['patient', 'detail', patientId]` | `patientId` sale de la cabecera del caso (`esaviCase.patient.patientId`); `staleTime` por defecto — no cambia durante el wizard |
| Cabecera del caso (`eventDate`) | TanStack Query | `['esaviCase', 'detail', caseId]` | ya existe (FE08), reutilizada sin nueva llamada |
| Catálogo `ageUnit` | TanStack Query | Interno de `<CatalogSelect typeCode="ageUnit">` | `staleTime` 30 min, primitiva ya escrita |
| Compuerta «¿es grave?», los ocho criterios, `otherSeriousConditionDescription`, `firstConsultationDate`, edad editable | React Hook Form | — | Nada en Zustand. `draftsStore` sigue sin usarse (§6) |
| Modo de edad (calculada / editable) | Derivado en render | — | `Boolean(patient?.birthDate) && Boolean(esaviCase?.eventDate)`; no se persiste en ningún lado |
| Diálogo de confirmación (compuerta Sí→No) | Componente | `useState` | efimero |
| `isDirty`, pendientes, `save()` | `CaseWizardContext` | en memoria, remontado por paso | contrato de FE08, sin cambios |

**Qué invalida qué.** `001`/`004` invalidan `['classification']` completo y `['caseWorkflow', 'byCase', caseId]` (el `POST` avanza la etapa: sin invalidar esto el stepper seguiría mostrando el paso 3 como no iniciado). Ninguno de los dos toca `['esaviCase']` ni `['patient']`.

**La excepción del modo de edad, declarada y acotada.** El modo (calculada/editable) **no es un dato que se guarde en ningún lado**: se recalcula en cada render a partir de dos queries ya cacheadas (`patient`, `esaviCase`). No hay `useState` de por medio porque no hay nada que un usuario pueda tocar para cambiarlo — lo decide el dato, no la interacción.

### 3.5 Formularios y validación

Un solo formulario, React Hook Form + Zod (`classificationSchema` en `features/classification/schemas.ts`). **`saveSchema === completeSchema`** (decisión confirmada): el backend no declara más bloqueantes de proceso que los de guardado.

| Campo | Widget | Obligatorio | Regla |
|---|---|---|---|
| Compuerta «¿Es grave?» | `RadioGroup` Sí/No | **Sí** (bloqueante) | Estado de interfaz, no columna. Deriva `isSeriousEvent` al enviar |
| Los ocho criterios (`caused*`) | `RadioGroup` Sí/No, dos vías, sin retorno a `null` | Condicional | Visibles sólo con la compuerta en «Sí»; **al menos uno** debe quedar en `true` para poder guardar |
| `otherSeriousConditionDescription` | `<Textarea>`, sin máximo | Condicional | Visible y obligatoria sólo con `causedOtherCondition = true` |
| `age` + `ageUnitItemId` | Texto de sólo lectura, o `<Input type="number">` + `<CatalogSelect typeCode="ageUnit" emit="id">` | No | Sólo lectura si `patient.birthDate` **y** `esaviCase.eventDate` existen; editables juntos si falta alguno. `min 0, max 32767` |
| `firstConsultationDate` | `<DateField allowFuture={false}>` | No | No futura |

**La matriz de coherencia va en `.superRefine()`**, replicando `findSeverityViolation` exactamente: compuerta «Sí» sin ningún criterio en `true` marca error sobre el grupo de criterios; `causedOtherCondition = true` sin descripción marca error sobre `otherSeriousConditionDescription`. **Nunca debería llegar un 400 real del backend** por esta regla —si llega, es un mensaje genérico a toast, porque `CLASSIF_004_SEVERITY_INCOHERENT` no distingue cuál de las tres violaciones fue.

**Al pasar la compuerta de «Sí» a «No» con algún criterio ya marcado**, `AlertDialog` de confirmación (decisión confirmada) antes de limpiar los ocho a `null` y ocultar la sección.

**`age`/`ageUnitItemId` no viajan en el `PUT`/`POST` cuando el modo es de sólo lectura** —el backend los ignora igual, pero no tiene sentido enviar un valor que el formulario ni pintó.

**Al reentrar**, la compuerta se deriva de `classification.isSeriousEvent`: `true` → «Sí» con los criterios visibles y precargados; `false` → «No»; sin fila aún (`stages.classification.exists === false`) → sin responder, ningún lado marcado.

**Errores del backend mapeados:**

| `code` | Destino |
|---|---|
| `CLASSIF_001_CASE_NOT_FOUND` | Toast. No debería alcanzarse —`caseId` sale del wizard, no de un campo |
| `CLASSIF_001_CASE_ALREADY_CLASSIFIED` | Toast + refresco de `['classification']` y `['caseWorkflow']` — dos pestañas, no un error de campo |
| `CLASSIF_00X_AGEUNIT_NOT_FOUND` | Campo `ageUnitItemId` |
| `CLASSIF_00X_AGEUNIT_CATALOG_MISSING` | Toast — precondición de despliegue, no de captura |
| `CLASSIF_00X_INVALID_AGE_RANGE` | Toast — conflicto entre `birthDate` y `eventDate`, ninguno de los dos es campo de este formulario |
| `CLASSIF_004_NOT_FOUND` | Toast + refresco de `['caseWorkflow']` |
| `CLASSIF_004_SEVERITY_INCOHERENT` | Toast genérico — no debería alcanzarse (§6.4) |
| `CASEFLOW_012_CASE_CLOSED` | Toast + fuerza el modo `CLOSED` del armazón sin esperar al próximo `006` de workflow |

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton del formulario mientras `['classification','byCase']` (si aplica) y `['patient','detail']` están en vuelo | — |
| Vacío (alta) | Formulario en blanco, compuerta sin responder, criterios ocultos | — |
| Con datos (reentrada) | Formulario precargado, compuerta derivada de `isSeriousEvent` | — |
| Compuerta «Sí» sin criterios marcados | El botón Guardar/Completar etapa no se bloquea visualmente con `disabled`, sino que al intentar enviar el `.superRefine()` marca el grupo de criterios con el mensaje — igual que cualquier otro campo obligatorio de RHF | `classification.criteria.atLeastOneRequired` |
| Sección de «otra condición» | Aparece sólo con `causedOtherCondition = true`; al ocultarse limpia su texto | — |
| Error — `CASEFLOW_012_CASE_CLOSED` | Toast + el armazón conmuta a sólo lectura sin esperar refetch | `classification.error.caseClosed` |
| Error — cualquier otro `code` | Toast por `code` vía `errorMessages.ts` | `classification.error.generic` |
| Sin permiso | No se llega: hereda el guard del wizard (FE08) | — |
| `CLOSED` (heredado del armazón) | Formulario deshabilitado, sin Guardar ni Completar etapa — ya resuelto por FE08, este paso no reimplementa el bloqueo | — |

No hay estado «vacío con filtros» ni paginación: es un formulario 1:1 con el caso, no un listado.

### 3.7 Responsividad y accesibilidad

- **Una columna, en escritorio y en móvil.** No hay tabla que colapsar: es un formulario único. Hereda el comportamiento de una columna del wizard por debajo de `md` (FE08), sin redefinirlo.
- **Cada `RadioGroup` de los ocho criterios es un `radiogroup` con `aria-label` propio** (el texto del criterio), navegable con flechas, igual que el selector de modo de búsqueda de FE10.
- **La compuerta «¿Es grave?» es también un `radiogroup`**, con su propio `aria-label` distinto al de los criterios para que un lector de pantalla no las confunda.
- **El `AlertDialog` de confirmación** (compuerta Sí→No) devuelve el foco al control que lo abrió al cerrarse, con Cancelar como acción por defecto.
- **El texto de «calculado automáticamente» junto a la edad de sólo lectura** va asociado al campo con `aria-describedby`, no sólo visualmente al lado.
- **La sección condicional de «otra condición»** usa `aria-live="polite"` al aparecer, para que se anuncie sin robar el foco.
- Objetivos táctiles de 44px; `dvh`, nunca `vh` (heredado del wizard).

### 3.8 Claves i18n nuevas

Todas bajo `classification.*`:

| Clave | Uso |
|---|---|
| `classification.gate.label` | Etiqueta de la compuerta «¿Es grave?» |
| `classification.gate.yes` / `.no` | Opciones de la compuerta |
| `classification.gate.confirmClearTitle` | Título del `AlertDialog` al pasar de Sí a No |
| `classification.gate.confirmClearBody` | Cuerpo del `AlertDialog` |
| `classification.criteria.causedDeath` … `.causedOtherCondition` | Las ocho etiquetas de criterio |
| `classification.criteria.atLeastOneRequired` | Error de `.superRefine()` cuando la compuerta es «Sí» sin ningún criterio |
| `classification.otherCondition.description` | Etiqueta del `<Textarea>` condicional |
| `classification.otherCondition.descriptionRequired` | Error cuando falta con `causedOtherCondition = true` |
| `classification.age.calculatedNote` | Texto «calculado automáticamente desde…» |
| `classification.age.label` / `.unitLabel` | Etiquetas del modo editable |
| `classification.firstConsultationDate.label` | Etiqueta de la fecha |
| `classification.error.caseClosed` | Toast de `CASEFLOW_012_CASE_CLOSED` |
| `classification.error.generic` | Toast genérico por `code` |

`npm run i18n:check` exige paridad exacta en `es`, `en` y `nl`.

---

## 4. Plan de implementación

1. **Contratos.** Entrada `classification/classification.types.ts` en `scripts/syncContracts.mjs`, `npm run contracts:sync`, y `contracts/declared/classification.ts` (§3.3) a mano.
   *Verificación:* el diff de `contracts/` sólo añade; `ClassificationDetail` no tiene `caseId` ni `ageUnitItemId` al primer nivel.

2. **`features/classification/api.ts` y `schemas.ts`.** `createResource` para `001`/`004`, más `useClassificationByCase` (`006`) a mano. `classificationSchema` con la matriz de coherencia en `.superRefine()`, replicando `findSeverityViolation` exactamente.
   *Verificación:* un objeto con la compuerta en «Sí» y ningún criterio en `true` falla la validación del lado cliente; uno con `causedOtherCondition: true` y descripción vacía también; ninguno de los dos llega a disparar el `POST`.

3. **`SeverityCriteriaGroup.tsx`.** Los ocho `RadioGroup` Sí/No de dos vías, cada uno con su `aria-label`, visibles sólo con la compuerta en «Sí», sin opción de volver a `null` una vez tocado.
   *Verificación:* seleccionar «Sí» y luego «No» dos veces no deja el control en un tercer estado; no hay forma de deseleccionar con teclado ni con clic.

4. **La resolución del modo de edad.** Hook o cálculo derivado en `ClassificationStep.tsx` a partir de `patientResource.useOne(patientId)` (`ESAVI-PATIENT-003`, reutilizado) y `esaviCase.eventDate` (ya en caché por FE08). Texto de sólo lectura con `age` + `ageUnit.name` cuando ambos existen; `<Input type="number">` + `<CatalogSelect typeCode="ageUnit" emit="id">` en caso contrario.
   *Verificación:* con `birthDate` y `eventDate` presentes el campo es de sólo lectura y no dispara la query de `catalogItem`; con cualquiera ausente es editable y valida `0–32767`.

5. **`ClassificationStep.tsx`.** Ensambla la compuerta, `SeverityCriteriaGroup`, la sección condicional de «otra condición», la edad y `firstConsultationDate`. Registra `save()` (`POST` o `PUT` según `stages.classification.exists`), `isDirty` y `getPendingFields()` en `CaseWizardContext`. Lee `['classification','byCase',caseId]` sólo si `stages.classification.exists === true`.
   *Verificación:* con `exists: false` el formulario nace en blanco sin llamar a `006`; con `exists: true` precarga y deriva la compuerta de `isSeriousEvent`; `save()` invalida `['classification']` y `['caseWorkflow','byCase',caseId]`.

6. **El `AlertDialog` de confirmación.** Cableado en el cambio de la compuerta de «Sí» a «No» cuando hay al menos un criterio ya marcado; limpia los ocho a `null` sólo si se confirma.
   *Verificación:* cancelar el diálogo no toca los criterios; confirmar los limpia y oculta la sección.

7. **`ClassificationStep.tsx` reemplaza el placeholder.** Se quita el `<div>` del slug `classification` en el `<Outlet>` de `CaseWizardPage` (FE08, paso 9) y se monta el componente real.
   *Verificación:* navegar a `/esavi-cases/:id/wizard/classification` pinta el formulario, no el placeholder; ninguna prueba de `CaseWizardPage.test.tsx` de FE08 cambia de resultado para los otros cinco pasos.

8. **Mapeo de errores y claves i18n.** Las entradas de §3.5 en `errorMessages.ts`; las claves de §3.8 en `es`, `en` y `nl`.
   *Verificación:* `npm run i18n:check` en 0; `getErrorMessage({code:'CASEFLOW_012_CASE_CLOSED'})` devuelve la clave esperada.

9. **Tests de integración.** `ClassificationStep.test.tsx`: alta sin datos previos, reentrada con `isSeriousEvent: true` precargando criterios, bloqueo de guardado con compuerta «Sí» sin criterios, limpieza tras confirmar el `AlertDialog`, modo de edad según `birthDate`/`eventDate`.
   *Verificación:* `npm test -- ClassificationStep` en 0.

---

## 5. Criterios de aceptación

- [ ] Las tres rutas de §3.2 se consumen y responden con lo esperado.
- [ ] Con la compuerta en «Sí» y ningún criterio marcado, el envío se bloquea en el cliente —nunca llega un `POST`/`PUT`— y el error se ve sobre el grupo de criterios.
- [ ] `causedOtherCondition = true` sin descripción bloquea igual, marcado sobre `otherSeriousConditionDescription`.
- [ ] Un criterio tocado (Sí o No) no tiene forma de volver a «sin marcar» desde la interfaz.
- [ ] Pasar la compuerta de «Sí» a «No» con criterios marcados exige confirmar en un `AlertDialog`; cancelar no los toca, confirmar los limpia a `null` y oculta la sección.
- [ ] Con `patient.birthDate` **y** `esaviCase.eventDate` presentes, la edad se muestra de sólo lectura con el valor resuelto por el backend; con cualquiera ausente, es editable y valida `0–32767`.
- [ ] En modo de sólo lectura, `age` y `ageUnitItemId` no viajan en el cuerpo del `POST`/`PUT`.
- [ ] Al reentrar con `stages.classification.exists === true`, la compuerta se deriva de `isSeriousEvent` sin quedar sin responder.
- [ ] Con `stages.classification.exists === false`, el formulario nace en blanco sin llamar a `ESAVI-CLASSIF-006`.
- [ ] Guardar exitosamente invalida `['classification']` y `['caseWorkflow', 'byCase', caseId]`; el stepper refleja el paso como iniciado sin recargar la página.
- [ ] Un `409 CASEFLOW_012_CASE_CLOSED` en el `POST` conmuta el armazón a sólo lectura sin esperar el próximo `006` de workflow.
- [ ] `grep -rn "response.data.data" src/features/classification src/features/esaviCase` no devuelve resultados.
- [ ] Ningún control para `notes` aparece en la pantalla (deuda técnica declarada, §2).
- [ ] Las claves nuevas existen en `es`, `en` y `nl`; `npm run i18n:check` sale en 0.

**Cierre (`CONVENTIONS.md` §14):**

- [ ] Se cargaron `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` antes de generar interfaz.
- [ ] Los seis artefactos de la entidad `classification` están completos.
- [ ] El `level` del `<RequireRole>` sigue siendo `USER`, heredado sin cambio del wizard.
- [ ] Los códigos `ESAVI-CLASSIF-001/004/006` y `ESAVI-PATIENT-003` aparecen citados donde se consumen.
- [ ] Ningún color literal, ningún texto literal visible, ningún `any` en el límite con la API.
- [ ] Ningún `response.data.data`, ningún `axios` fuera de `client.ts`.
- [ ] Nada remoto copiado a `useState` ni a un store; `draftsStore` sigue sin usarse.
- [ ] Probado por debajo de `md`, en tema oscuro, y con rol `USER`.
- [ ] `npm run check` pasa.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** fetch adicional a `ESAVI-PATIENT-003` sólo para leer `birthDate` y decidir el modo de la edad. La alternativa —asumir siempre editable— dejaría que el usuario teclee un número que el backend descarta en silencio cuando sí puede calcular, sin ninguna explicación en pantalla.

- **Sí:** `completeSchema === saveSchema`. El backend no declara ningún bloqueante de proceso adicional a los de guardado (compuerta + al menos un criterio); inventar uno de producto (p. ej. exigir `firstConsultationDate` para completar) no tiene respaldo en `CASE-PROCESS.md` §5.3 y se descarta.

- **Sí:** `AlertDialog` bloqueante al pasar la compuerta de «Sí» a «No» con criterios marcados, no un toast con deshacer. Es pérdida de datos tecleados —ocho controles, no uno— y sigue el mismo patrón que el aviso de irreversibilidad de FE10.

- **No:** control para `notes`. Se deja como deuda técnica explícita: introducir texto enriquecido es una decisión de stack transversal (afecta a todos los `notes` del proceso desde FE10 en adelante) que no le corresponde resolver a un spec de un solo paso. `otherSeriousConditionDescription` sí se implementa como `<Textarea>` plano porque es parte de una regla bloqueante del backend, no un campo libre.

- **Sí:** `RadioGroup` de dos opciones (Sí/No) para los ocho criterios, sin construir un componente de switch de tres estados a mano. Radix no tiene un control nativo de tres estados, y un `RadioGroup` sin selección inicial reproduce exactamente la regla —null hasta tocar, sin retorno— sin código adicional.

- **Sí:** edad calculada como texto de sólo lectura, no como `<Input>`/`<CatalogSelect>` deshabilitados. Evita que el `<CatalogSelect>` dispare su query de catálogo cuando no hay nada que elegir, y es más claro que un control deshabilitado con un valor que nadie puede tocar.

- **Sí:** la lectura de `ESAVI-CLASSIF-006` se activa sólo con `stages.classification.exists === true`. Sigue el patrón de FE08 §3.4 —`stages` es la única fuente de verdad— y evita un `404 CLASSIF_006_NOT_FOUND` que nunca debería leerse como error.

- **No:** una segunda escritura encadenada como en FE10. Aquí es una sola tabla y un solo `POST`/`PUT`; encadenar algo más complicaría sin necesidad un paso que el backend ya resuelve en una transacción.

- **No:** reconciliar aquí `isSeriousEvent` con `notification.notificationType`. Es deuda explícita del backend (SPEC F44); FE12 hereda `isSeriousEvent` ya derivado y bloqueado, y este spec no intenta cerrar una discrepancia que no le pertenece.

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `CLASSIF_004_SEVERITY_INCOHERENT` no distingue cuál de las tres violaciones de la matriz ocurrió, así que si el cliente deja pasar un caso que el `.superRefine()` no cubrió, el usuario ve un error genérico sin saber qué corregir | El `.superRefine()` replica exactamente `findSeverityViolation`; el riesgo residual es una divergencia futura entre el helper del backend y el schema del cliente si uno cambia sin el otro. Se documenta como acoplamiento explícito, no oculto |
| `notes` queda sin interfaz de captura: cualquier valor que ya existiera en una fila (ninguna aún, la tabla es nueva desde FE08) no se vería ni se podría editar desde el wizard | No aplica hoy —no hay filas con `notes`— pero queda anotado para cuando se resuelva la deuda de texto enriquecido: un spec futuro debe cubrir `notes` en todas las entidades del proceso, no sólo aquí |
| El modo de edad depende de una segunda query (`patient`) además de la cabecera del caso; si `patientId` aún no resolvió, el formulario podría parpadear entre modo editable y de sólo lectura | El cálculo del modo espera a que ambas queries (`esaviCase`, `patient`) estén resueltas antes de pintar el campo de edad; mientras tanto se muestra el skeleton de §3.6, nunca el modo editable como valor por defecto |
| Este spec depende de que FE08 haya dejado el `<Outlet>` exactamente como un `<div>` reemplazable sin lógica propia | Verificado en §1 y en el código actual; el paso 7 del plan de implementación lo confirma antes de escribir nada más |

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `features/esaviCase/CaseWizardPage.tsx` | El `<Outlet>` del slug `classification` deja de renderizar el `<div>` placeholder de FE08 (paso 9) y monta `ClassificationStep.tsx`. Los otros cinco slugs no cambian |
| `features/patient/api.ts` | Sin cambios de código: `patientResource.useOne` se reutiliza tal cual la dejó FE10 |

Ningún otro archivo de FE08 o FE10 cambia. `steps.ts`, `CaseWizardContext.tsx`, `CaseWizardStepper.tsx` y `CaseWizardActionBar.tsx` quedan intactos: el contrato que exponen ya cubre lo que este paso necesita.

---

## Lo que **no** está en este spec

- **`notes`.** Deuda técnica declarada: sin control de captura hasta que se decida cómo tratar texto enriquecido en todo el proceso.
- **El paso 4 y siguientes** — FE12 en adelante.
- **Listado o administración de clasificaciones** — `ESAVI-CLASSIF-002A/002B/003/005A/005B/005C`.
- **Reconciliar `isSeriousEvent` con `notification.notificationType`** — deuda del backend (SPEC F44), no de este spec.
- **Cerrar, reabrir y el modo `CLOSED`** — ya resueltos por FE08.

Cada uno de esos, si aterriza, va en su propio spec.

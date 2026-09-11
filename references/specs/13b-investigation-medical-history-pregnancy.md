# SPEC FE13b — Paso 5: antecedentes de la persona vacunada y bloque de embarazo

> **Estado:** Borrador
> **Depende de:** SPEC FE08 (armazón del asistente, `CaseWizardActionBar`, sólo lectura si `CLOSED`), SPEC FE12a (la cadena guardar/completar de un paso y `<AnswerOptionField>`), SPEC FE12d (`usePregnancyGate`, `usePregnancyBlockGuard`, `<MeddraSearchField>` y el modal de complicación que este spec replica), SPEC FE12f (`useProgressiveSections`), SPEC FE13a (la cabecera de la investigación y `InvestigationStep.tsx`, donde este spec añade secciones), SPEC F58 del backend (la investigación y sus satélites)
> **Fecha:** 2026-09-10
> **Objetivo:** Añadir al paso 5 las secciones B, B1 y B2 del formulario — antecedentes del paciente, bloque de embarazo y afecciones del recién nacido — sobre `investigationMedicalHistory` y su nieta `investigationPregnancyCondition`.

---

## 1. Por qué existe este spec

**A — FE13a abre el paso 5 y se detiene en el equipo investigador.** Deja `InvestigationStep.tsx` montado con tres secciones —fuentes, información básica y equipo—, la cabecera creada al entrar, el revelado progresivo de FE12f funcionando y los cuatro contratos sincronizados. Lo que sigue en el formulario es la sección B, y hoy no hay nada detrás de ella.

**B — Es la primera nieta del expediente, y el orden de creación se estrena aquí.** `CASE-PROCESS.md` §5.5.0 avisa de la trampa y §5.5.3 la cobra: `investigationPregnancyCondition.investigationId` **no apunta a la investigación**, apunta a la PK de `investigationMedicalHistory`, que vale ese mismo UUID. Un `POST` con un id correcto sobre una investigación correcta responde `404 INVPREG_00X_MEDICAL_HISTORY_NOT_FOUND` si la ficha de antecedentes no existe. Lo que aquí se decida —la madre se crea al revelarse la sección, el mensaje dice **qué ficha** falta, y no se encadenan dos escrituras en un botón— lo repite FE13c con `evaluationInstitution`.

**C — La compuerta de embarazo se aplica por segunda vez, y ahora anidada.** §7.4 decide si el bloque **existe** para este paciente; dentro, `isPregnancyConfirmed` decide si sus nueve columnas **se guardan**, con comparación **estricta contra `'YES'`** — las otras cinco formas del `answerOption`, el `null` incluido, cierran el bloque por igual. Y con una asimetría que el paso 4 no tenía: en `gestationalWeeks` y `birthWeightGrams` el **`0` es un valor legítimo del `CHECK`**, así que «con contenido» no es «truthy» y el formulario tiene que distinguir campo vacío de campo a cero al enviar.

**D — `usePregnancyBlockGuard` hoy sólo mira el paso 4, y eso deja la regla de §7.4 a medias.** El guard cuenta las columnas de `notificationPregnancy` y sus complicaciones (`usePregnancyBlockGuard.ts:36-60`) para impedir que el paso 1 corrija el sexo del paciente sobre un bloque de embarazo lleno. En cuanto este spec escriba embarazo en la investigación, ese mismo cambio volvería a ser guardable y produciría exactamente el dato incoherente que el guard existe para evitar. Este spec lo amplía.

**E — El formulario y el modelo no coinciden en cuatro puntos, y el spec los resuelve uno por uno.** `ESAVI-FORM.md` es la fuente de las etiquetas y del orden, no de las reglas (`references/README.md`), y en la sección B1 se separa del DDL cuatro veces: las etiquetas de `deliveryItemId` y `birthItemId` están cruzadas respecto a los catálogos sembrados, el rango de edad dice 12–50 donde §7.4 dice 15–49, las observaciones de B aparecen condicionadas a `YES` donde §5.5.3 lo prohíbe explícitamente, y `wasBreastfed` no está. Las cuatro se cierran en §6 con su razón.

---

## 2. Alcance

**Dentro:**

- **La fila `investigationMedicalHistory` se crea al revelarse la sección B**, con un `POST { investigationId }` a secas (`ESAVI-INVMEDH-001`). Ninguna de sus quince columnas de datos es obligatoria, así que la ficha existe desde el primer segundo y la lista de B2 queda operativa sin esperar a un guardado.
- **Sección B — «Información pertinente sobre la persona vacunada antes de la inmunización»**: las dos banderas `answerOption` variante `unknown` y sus dos observaciones, **siempre visibles y nunca limpiadas** (excepción declarada a §7.3), más `notes`.
- **Sección B1 — «Preguntas para mujeres»**: `isPregnancyConfirmed` (variante `full`) y las nueve columnas que gobierna, `wasBreastfed` incluida, con los cuatro `<CatalogSelect>` sembrados y los dos `<NumberField>` con sus rangos del `CHECK` — `gestationalWeeks` 0–45 y `birthWeightGrams` 0–6000, **el 0 válido en los dos**.
- **La compuerta de §7.4 por `usePregnancyGate`, sin reimplementarla**, con sus tres estados: oculta, visible normal y visible marcada **«Si aplica»**.
- **La compuerta interior estricta**: sin `isPregnancyConfirmed === 'YES'` las nueve columnas se ocultan y el `PUT` envía **los nueve `null` explícitos**, de modo que el cuerpo declare el estado resultante y no dependa de qué omitió el formulario.
- **Sección B2 — «Afecciones médicas del recién nacido»**: `<SatelliteList>` sobre `investigationPregnancyCondition` con `<MeddraSearchField>`, resolución contra `diagnosticTerm` con sus tres ramas, y la guarda de duplicado sobre `diagnosticTermId` leída del `409`. **Visible sólo con `pregnancyOutcome.value === '2'`** (`LIVE_BORN_WITH_COMPLICATIONS`), y con el cambio de desenlace **bloqueado** mientras haya condiciones cargadas.
- **La ampliación de `usePregnancyBlockGuard`** para que cuente también las columnas de embarazo de `investigationMedicalHistory` y sus condiciones activas, con el diálogo enumerando **los dos bloques por separado**, cada uno con su «Vaciar» y su escritura propia (`ESAVI-NOTIFPRG-004` y `ESAVI-INVMEDH-004`).
- **El revelado progresivo de FE12f** extendido: B y B1 llevan «Guardar y continuar»; B2 se revela con el último avance y por debajo manda `CaseWizardActionBar`. Con un paciente varón, B1 y B2 no existen y B queda como única sección de este spec, sin botón intermedio propio.
- **Los dos contratos sincronizados** —`investigationMedicalHistory` e `investigationPregnancyCondition`— más sus dos respuestas declaradas a mano en `contracts/declared/`.
- **Las claves i18n nuevas bajo `investigation.*`**, en los tres idiomas.
- **Tests**: el schema con la compuerta estricta y el cero legítimo, la lista de B2 con su `409`, el guard ampliado, y el recorrido de integración de las tres secciones — alta, reentrada, cambio de desenlace con condiciones cargadas y expediente cerrado.

**Fuera de alcance (otros specs):**

- **La sección C entera** — `investigationClinicalEvaluation`, `evaluationInstitution` e `investigationDiagnostic`. Es **FE13c**, y con ella se cierra §5.5.3. El corte de §5.5.3 en dos specs se decide aquí y se justifica en §6: cuatro tablas y 46 columnas en un solo spec no las ejecuta nadie.
- **§5.5.4 y §5.5.5** — el acto de vacunación y la cadena de frío (FE13d), el error de administración y la comunidad (FE13e). El reparto queda corrido una letra respecto a lo que anunció FE13a §2.
- **Borrar una condición del recién nacido.** `ESAVI-INVPREG-005A` exige **ADMIN** mientras las catorce entidades del paso 5 escriben como USER. El comportamiento objetivo queda declarado en §3.5 y **bloqueado por la deuda de §10** de `CASE-PROCESS.md`, igual que el equipo investigador en FE13a. Hasta que la ruta baje a USER, el botón no se pinta.
- **Retirar o purgar la ficha de antecedentes.** No hay `005A` ni `005B`: la tabla no tiene `isActive` y sólo existe `005C`, purga física, SUPERADMIN. El asistente **crea y limpia; no borra** (§5.5.0).
- **Bajar la compuerta de §7.4 a 12 años.** El 12 de `ESAVI-FORM.md` B1 es un error textual del formulario, confirmado por el usuario; `PREGNANCY_MIN_AGE` se queda en 15 y `usePregnancyGate` se consume tal cual. Cambiar la constante afectaría a tres bloques en dos pasos y sería un spec de la compuerta, no éste.
- **Cruzar `gestationalWeeks` con `pregnancyOutcomeItemId`,** o cualquier otra regla obstétrica que el backend no impone. Cuarenta semanas con desenlace «Aborto» es una captura que el validador acepta, y el cliente no inventa la prohibición.
- **Propagar nada desde o hacia el paso 4.** `notificationPregnancy` y `investigationMedicalHistory` son dos tablas de dos pasos distintos: una condición detectada en la investigación no aparece en la notificación ni al revés (§5.5.3). Lo único que las cruza es el guard, y sólo para **bloquear**, nunca para copiar.
- **`<AuditTrail>` sobre la ficha y sus condiciones.** El array `appDetails` viaja en las respuestas; la pantalla de auditoría del expediente es un spec propio.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** Tercer uso, misma decisión que FE13a: escribir la norma es un cambio de `CONVENTIONS.md`.

---

## 3. Diseño

### 3.1 Pantallas y archivos

**No hay ruta nueva ni pantalla nueva.** El paso 5 ya está enrutado por FE08 en `/esavi-cases/:id/wizard/investigation` y FE13a lo pobló con `InvestigationStep.tsx`. Este spec añade tres secciones detrás de las tres que ya hay.

| Archivo | Qué es |
|---|---|
| `features/investigation/MedicalHistorySection.tsx` | **Nuevo.** Sección B — las dos banderas, sus dos observaciones y `notes` |
| `features/investigation/PregnancySection.tsx` | **Nuevo.** Sección B1 — `isPregnancyConfirmed` y las nueve columnas que gobierna |
| `features/investigation/NewbornConditionList.tsx` | **Nuevo.** Sección B2 — `<SatelliteList>` sobre las condiciones |
| `features/investigation/NewbornConditionFormDialog.tsx` | **Nuevo.** Alta y edición de una condición |
| `features/investigation/api.ts` | **Cambia.** Dos entidades más sobre la base que dejó FE13a |
| `features/investigation/schemas.ts` | **Cambia.** Dos schemas y los predicados de la compuerta |
| `features/esaviCase/InvestigationStep.tsx` | **Cambia.** Monta las tres secciones y amplía `useProgressiveSections` de tres identificadores a seis |
| `shared/hooks/usePregnancyBlockGuard.ts` | **Cambia.** Cuenta también el embarazo del paso 5 (§8) |

**`PregnancySection.tsx` convive con el del paso 4**, que vive en `features/esaviCase/` y escribe `notificationPregnancy`. Son dos ficheros con el mismo nombre en dos carpetas y **nunca se importan juntos**: cada paso monta el suyo. No se unifican — las tablas, las columnas y las compuertas interiores son distintas.

`shared/config/navigation.ts` **no cambia**.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/investigation-medical-histories                     ESAVI-INVMEDH-001   USER   crear la ficha (lleva investigationId en el cuerpo)
GET    /api/investigation-medical-histories/case/:id            ESAVI-INVMEDH-006   USER   leer por caso — devuelve un objeto, no una lista
PUT    /api/investigation-medical-histories/:id                 ESAVI-INVMEDH-004   USER   actualizar (:id ES el investigationId)

POST   /api/investigation-pregnancy-conditions                  ESAVI-INVPREG-001   USER   añadir una condición
GET    /api/investigation-pregnancy-conditions/investigation/:id ESAVI-INVPREG-002A  USER   listar las activas (:id ES el investigationId, y apunta a la MADRE)
PUT    /api/investigation-pregnancy-conditions/:id              ESAVI-INVPREG-004   USER   editar una condición

GET    /api/case-workflows/case/:id                             ESAVI-CASEFLOW-006  USER   ya consumido por FE08
GET    /api/catalog-items?typeCode=gestationMethod              ESAVI-CATITEM-002A  USER   vía <CatalogSelect>
GET    /api/catalog-items?typeCode=deliveryType                 ESAVI-CATITEM-002A  USER   vía <CatalogSelect>
GET    /api/catalog-items?typeCode=birthCondition               ESAVI-CATITEM-002A  USER   vía <CatalogSelect>
GET    /api/catalog-items?typeCode=pregnancyOutcome             ESAVI-CATITEM-002A  USER   vía <CatalogSelect> y la compuerta de B2
```

Más lo que el guard ampliado ya consume hoy y sigue consumiendo: `ESAVI-NOTIFPRG-004` para vaciar el bloque del paso 4, y ahora `ESAVI-INVMEDH-004` para vaciar el del paso 5.

**Lo que no se consume y por qué:**

- `ESAVI-INVMEDH-002A` / `-002B` y `ESAVI-INVPREG-002B`: listados de backoffice. El asistente entra por caso o por investigación.
- `ESAVI-INVMEDH-003`: el `-006` por caso ya trae el objeto, y su `:id` **es** el `investigationId`, así que no hay nada que resolver aparte.
- `ESAVI-INVPREG-003`: la lista del `002A` trae la fila completa; el diálogo de edición la recibe por props.
- `ESAVI-INVMEDH-005C`, `ESAVI-INVPREG-005C`: purga física, SUPERADMIN.
- `ESAVI-INVPREG-005A` / `-005B`: ADMIN. El borrado de una condición está bloqueado por la deuda de §10 (§2).

**Los cuatro catálogos están sembrados en `esaviapp.sql`** —`gestationMethod` 7, `deliveryType` 5, `birthCondition` 4, `pregnancyOutcome` 7 (líneas 1846-1875)—, como afirma `CASE-PROCESS.md` §5.5.3. El comentario de `investigationMedicalHistory.service.ts:18-19` dice lo contrario («NONE of the four catalogTypes is seeded by the DDL»): **está desactualizado y manda el DDL**. No hay dependencia abierta de §10.5 en este spec.

**La lista de B2 se pide por `/investigation/:id`, y ese `:id` es el de la madre.** Vale lo mismo que el `investigationId` porque la PK de `investigationMedicalHistory` *es* ese UUID, pero la ruta resuelve contra la ficha de antecedentes: sin ficha no hay lista, y el `POST` responde `404 INVPREG_00X_MEDICAL_HISTORY_NOT_FOUND` (§5.5.0).

### 3.3 Tipos del contrato

Dos entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`, traídas con `npm run contracts:sync`:

```js
{ source: 'investigation/investigationMedicalHistory.types.ts',    dest: 'investigationMedicalHistory.ts' },
{ source: 'investigation/investigationPregnancyCondition.types.ts', dest: 'investigationPregnancyCondition.ts' },
```

Traen `CreateInvestigationMedicalHistoryInput`, `CreateInvestigationPregnancyConditionInput` y sus `*ListFilters`. El update es `Partial<Create…Input>`, igual que en el backend.

**Las dos respuestas se declaran a mano** en `contracts/declared/`, con el mismo motivo de FE12a y FE13a — el backend las construye como literales y `contracts:sync` no las puede copiar:

```ts
// contracts/declared/investigationMedicalHistory.ts
// origen: investigationMedicalHistory.service.ts (toInvestigationMedicalHistoryResponse)
export interface InvestigationMedicalHistory {
  investigationId: string;                  // PK = FK
  investigation: {
    investigationId: string;
    isActive: boolean;
    investigationStartDate: string | null;
    status: CatalogItemRef | null;
    case: { caseId: string; caseCode: string; eventDate: string | null };
  };
  hasPriorHospitalizationHistory: AnswerOption | null;
  priorHospitalizationObservations: string | null;
  hasFamilyHistory: AnswerOption | null;
  familyHistoryObservations: string | null;
  isPregnancyConfirmed: AnswerOption | null;
  gestationalWeeks: number | null;
  gestationMethodItemId: string | null;
  deliveryItemId: string | null;
  birthItemId: string | null;
  pregnancyOutcomeItemId: string | null;
  hasPregnancyRiskFactor: AnswerOption | null;
  riskFactorDescription: string | null;
  birthWeightGrams: string | null;          // numeric(8,2) — llega como cadena, '3250.00'
  wasBreastfed: AnswerOption | null;
  notes: string | null;
  gestationMethod: CatalogItemRef | null;   // resuelto: catalogItemId, code, name
  delivery: CatalogItemRef | null;
  birth: CatalogItemRef | null;
  pregnancyOutcome: CatalogItemRef | null;
  deletedAt: string | null;                 // no hay isActive: la tabla no tiene esa columna
  appDetails: AppDetail[];
}
```

**Esta respuesta trae las claves crudas *y* los objetos resueltos**, a diferencia de la cabecera de FE13a, que sólo trae los objetos. El formulario lee y envía las claves (`gestationMethodItemId`…), y los objetos sólo sirven para pintar el nombre sin pedir el catálogo aparte.

**Y los cuatro objetos resueltos traen `catalogItemId`, `code` y `name` — no `value`.** Es el detalle que decide la compuerta de B2: `CASE-PROCESS.md` §7.2 prohíbe decidir contra `code`, así que la comparación `pregnancyOutcome.value === '2'` **se resuelve contra el catálogo cargado por `<CatalogSelect>`**, no contra el objeto de la respuesta. Es la misma técnica que FE13a usó para `status.value === 'DEATH'`.

**`birthWeightGrams` llega como cadena y es deliberado** (`investigationMedicalHistory.service.ts:64-67`): convertirlo en el backend obligaría a reconvertirlo antes de comparar en el update diferencial. El cliente lo parsea al construir `defaultValues` y lo envía como número; `'0.00'` tiene que producir `0`, no `null`.

```ts
// contracts/declared/investigationPregnancyCondition.ts
// origen: investigationPregnancyCondition.service.ts
export interface InvestigationPregnancyCondition {
  pregnancyConditionId: string;
  investigationId: string;                  // apunta a la MADRE, no a la investigación
  medicalHistory: { investigationId: string; deletedAt: string | null; investigation: { investigationId: string; isActive: boolean } };
  diagnosticTermId: string | null;
  diagnosticTerm: { diagnosticTermId: string; source: string; code: string; name: string; termGroup: string | null; isActive: boolean } | null;
  conditionRaw: string | null;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  appDetails: AppDetail[];
}
```

`conditionName`, `conditionCode` y `source` **son campos aceptados que no son columnas**: alimentan la resolución contra `diagnosticTerm` y no vuelven en el `GET`. Lo que se muestra es `conditionRaw ?? diagnosticTerm.name`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId`, slug del paso | URL | `useParams` de `/esavi-cases/:id/wizard/:step` | Lo resuelve FE08 |
| Etapas del expediente | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | `ESAVI-CASEFLOW-006`. Da `stages.investigation.exists` y el `id`. Ya la puebla FE08 |
| Cabecera de la investigación | TanStack Query | `['investigation', 'byCase', caseId]` | **Ya existe**, la puebla FE13a. De ahí sale el `investigationId` que este spec necesita |
| Ficha de antecedentes | TanStack Query | `['investigationMedicalHistory', 'byCase', caseId]` | `ESAVI-INVMEDH-006`. Devuelve **un objeto**, no una lista. `enabled` con la cabecera resuelta |
| Condiciones del recién nacido | TanStack Query | `['investigationPregnancyCondition', 'byMedicalHistory', investigationId]` | `002A`: sólo las activas. **La clave dice `byMedicalHistory` a propósito**, aunque la ruta sea `/investigation/:id` y el valor sea el mismo UUID: es la forma de que la trampa de la nieta se lea en el código |
| Compuerta de §7.4 | TanStack Query | `usePregnancyGate(caseId)` | **No se recalcula.** Lee `['esaviCase','detail',caseId]`, `['patient','detail',patientId]`, `['classification','byCase',caseId]` y `['systemConfig','byCode','PREGNANCY_FEMALE_SEX_ITEM']`, todas ya pobladas por pasos anteriores |
| Catálogos `gestationMethod`, `deliveryType`, `birthCondition`, `pregnancyOutcome` | TanStack Query | `['catalogItem', 'byType', <typeCode>]` | `<CatalogSelect>`, `staleTime` 30 min. **El de `pregnancyOutcome` es además la fuente del `value` que abre B2** |
| Búsqueda de término MedDRA | TanStack Query | `['meddra', 'search', term]` | Dentro de `<MeddraSearchField>`, con rebote y mínimo de tres caracteres |
| Valores de B y B1 | React Hook Form | `useForm<MedicalHistoryFormValues>`, un solo formulario para las dos secciones | **Nada del servidor se copia a `useState` ni a un store**: `defaultValues` se construye del `GET` y RHF es el dueño desde ahí |
| Valores del diálogo de condición | React Hook Form | `useForm<NewbornConditionFormValues>` | Se monta y se destruye con el diálogo |
| Borrador contra el cierre de pestaña | Zustand | `drafts[caseId]['investigation']` | El mismo búfer de FE12a y FE13a, ampliado con los campos de B y B1. Se borra en cuanto responde el `PUT` |
| Índice de la última sección revelada | Componente | `useProgressiveSections` (`useState`) | **No se persiste.** Al recargar mandan los datos (FE12f) |
| Diálogo de condición abierto y condición en edición | Componente | `useState` | Efímero, no sale de `NewbornConditionList` |
| Diálogo del guard de embarazo | Componente | `useState` en `usePregnancyBlockGuard` | Ya existe; este spec le añade el segundo bloque a enumerar |

**Las seis cosas que este contrato resuelve explícitamente:**

- **B y B1 son un solo formulario y una sola escritura.** Son secciones distintas en pantalla porque el revelado progresivo las separa, pero escriben quince columnas de la **misma fila**, así que comparten `useForm` y el «Guardar y continuar» de B1 manda el mismo `PUT` que el de B. Partirlas en dos formularios obligaría a decidir cuál gana cuando los dos tocan `notes`, y la respuesta correcta es que no hay dos.
- **La compuerta interior no tiene bandera.** Que las nueve columnas se vean se deriva **en render** de `watch('isPregnancyConfirmed') === 'YES'`. No hay `showPregnancyFields` en ningún sitio, igual que FE13a no tiene `showAutopsy`.
- **La compuerta de B2 tampoco.** Que la lista exista se deriva en render de `pregnancyOutcomeItemId` resuelto contra `['catalogItem','byType','pregnancyOutcome']` → `value === '2'`. **Contra `value`, nunca contra `code`** (§7.2), y por el catálogo cargado, porque el objeto resuelto de la respuesta no trae `value` (§3.3).
- **Qué invalida qué.** El `PUT` de la ficha invalida `['investigationMedicalHistory','byCase',caseId]`; cualquier alta o edición de condición invalida `['investigationPregnancyCondition','byMedicalHistory',investigationId]`. El **`POST` de la ficha invalida sólo su propia clave**: a diferencia del `POST` de la cabecera en FE13a, **no toca `['caseWorkflow','byCase',caseId]`**, porque `stages` tiene exactamente cuatro entradas —una por fase— y ninguna se mueve cuando nace un satélite.
- **El guard no copia nada, sólo cuenta.** `usePregnancyBlockGuard` lee las dos consultas de embarazo por su clave de caché y deriva `hasPregnancyData`; no mantiene un espejo, y su «Vaciar» invalida la clave del bloque que acaba de vaciar.
- **`staleTime`.** Los cuatro catálogos, 30 minutos. Las dos consultas del expediente se invalidan tras cada mutación y no llevan `staleTime` propio.

**La excepción declarada, y es la misma de FE13a:** el índice de sección revelada es estado de componente que sobrevive a un cambio de sección pero no a una recarga. Persistirlo obligaría a decidir qué manda cuando los datos y el recorrido no coinciden, y la respuesta correcta —«mandan los datos»— ya es lo que ocurre sin persistir nada.

### 3.5 Formularios y validación

Dos schemas en `features/investigation/schemas.ts`. **Obligatorio significa «el backend lo rechaza»**, no «parece razonable». Los códigos de error van verificados contra el servicio del backend, no contra la abreviatura `00X` de `CASE-PROCESS.md`: son plantillas con la operación dentro (`INVMEDH_${op}_…`), así que **el mismo error tiene código distinto en el `001` y en el `004`**.

**A — Ficha de antecedentes** (`medicalHistorySaveSchema`). Secciones B y B1, un solo formulario.

| Campo | Sección | Control | Obligatorio | Regla |
|---|---|---|---|---|
| `hasPriorHospitalizationHistory` | B | `<AnswerOptionField variant="unknown">` | no | Nace sin tocar. `null` es «no se recogió» |
| `priorHospitalizationObservations` | B | `<Textarea>` | no | **Siempre visible.** No cuelga de su bandera, y no se limpia nunca |
| `hasFamilyHistory` | B | `<AnswerOptionField variant="unknown">` | no | Ídem |
| `familyHistoryObservations` | B | `<Textarea>` | no | **Siempre visible.** Ídem |
| `notes` | B | `<Textarea>` | no | Texto libre. Cierra la sección B |
| `isPregnancyConfirmed` | B1 | `<AnswerOptionField variant="full">` | no | **Gobierna las nueve siguientes.** Primera aparición de `full` en el repositorio junto con `wasBreastfed` |
| `gestationalWeeks` | B1 | `<NumberField min={0} max={45}>` | no | Entero, réplica del `CHECK` (`esaviapp.sql:1045`). **El 0 es válido** |
| `gestationMethodItemId` | B1 | `<CatalogSelect typeCode="gestationMethod">` | no | 7 ítems sembrados |
| `hasPregnancyRiskFactor` | B1 | `<AnswerOptionField variant="unknown">` | no | Gobierna la explicación **en pantalla**; el backend no lo impone |
| `riskFactorDescription` | B1 | `<Textarea>` | no | Visible con la bandera en `'YES'`; se limpia al apagarla (§7.3) |
| `deliveryItemId` | B1 | `<CatalogSelect typeCode="deliveryType">` | no | **Etiqueta «El parto fue:»** — 5 ítems: *Parto normal, Cesárea, Parto instrumentado…* |
| `birthItemId` | B1 | `<CatalogSelect typeCode="birthCondition">` | no | **Etiqueta «El nacimiento fue:»** — 4 ítems: *A término, Prematuro, Postérmino…* |
| `birthWeightGrams` | B1 | `<NumberField min={0} max={6000}>` | no | `numeric(8,2)`, `isFloat` en el validador. **El 0 es válido**. Llega como cadena y se parsea |
| `pregnancyOutcomeItemId` | B1 | `<CatalogSelect typeCode="pregnancyOutcome">` | no | 7 ítems. **Abre B2 con `value === '2'`** |
| `wasBreastfed` | B1 | `<AnswerOptionField variant="full">` | no | La décima pregunta de B1, que el formulario en papel no recoge (§6) |

**Ninguna columna de datos bloquea el guardado.** El único obligatorio es `investigationId`, que sale del contexto — por eso la ficha se crea vacía al revelarse la sección.

**Las etiquetas de `deliveryItemId` y `birthItemId` van emparejadas con su catálogo, no con la tabla de `ESAVI-FORM.md` B1**, que las cruza. Los ítems sembrados lo desmienten sin margen: `deliveryType` enumera formas de parto y `birthCondition` enumera condiciones del nacimiento (`esaviapp.sql:1866-1875`). Y el orden de pantalla sigue al formulario —factor de riesgo antes que parto—, porque en el orden sí manda él.

**La compuerta interior, y las tres cosas que el formulario tiene que hacer bien:**

1. **La comparación es estricta contra `'YES'`.** `'NO'`, `'UNKNOWN'`, `'NOT_APPLICABLE'`, `'NO_ANSWER'` y `null` cierran el bloque por igual. El predicado se escribe `isPregnancyConfirmed === 'YES'`, nunca por veracidad: los cinco textos del ENUM son *truthy* y la regla funcionaría por accidente.
2. **«Con contenido» no es «presente», y el `0` sí es contenido.** `hasContent` del backend (`investigationMedicalHistory.service.ts:181-186`) trata `null` y la cadena en blanco como ausencia, y **cualquier número, el `0` incluido, como contenido**. Un `gestationalWeeks: 0` sobre el bloque cerrado es `400`. `<NumberField>` ya distingue `''` de `0` (`NumberField.tsx:41-52`), así que basta con no reconstruir el valor con `Number(x) || null` en ningún sitio.
3. **Al cerrarse el bloque se envían los nueve `null` explícitos.** El backend admitiría omitirlos —lo que no viaja se fuerza a `null` sin error—, pero entonces el cuerpo dependería de qué omitió el formulario. Con los nueve `null` el `PUT` declara el estado resultante, y el update diferencial evita el `UPDATE` si ya estaban vacíos.

**El orden de validación del backend, que decide dónde se ancla cada error:** primero la regla del bloque, después las cuatro claves de catálogo, y **sólo se resuelven las que viajan con contenido** (`:250-253`). Una clave que el cierre del bloque va a poner a `null` no se consulta.

**Errores mapeados a campo** — el sufijo es lo que se compara, porque el prefijo lleva la operación:

| Código | Ancla |
|---|---|
| `INVMEDH_001_PREGNANCY_FIELDS_NOT_ALLOWED` · `INVMEDH_004_…` | `isPregnancyConfirmed`, con el campo ofensor del mensaje señalado también |
| `INVMEDH_00X_GESTATION_METHOD_NOT_FOUND` | `gestationMethodItemId` |
| `INVMEDH_00X_DELIVERY_NOT_FOUND` | `deliveryItemId` |
| `INVMEDH_00X_BIRTH_NOT_FOUND` | `birthItemId` |
| `INVMEDH_00X_PREGNANCY_OUTCOME_NOT_FOUND` | `pregnancyOutcomeItemId` |
| `INVMEDH_001_ALREADY_EXISTS` (409) | **Ninguna.** No es un error del usuario: la ficha ya existía. La pantalla **refresca `['investigationMedicalHistory','byCase',caseId]` y sigue**, sin toast. Es la carrera de dos pestañas sobre el mismo caso |
| `INVMEDH_006_NOT_FOUND` (404) | **Ninguna.** Es «la ficha aún no está», el estado normal antes del `POST` de apertura |
| `INVMEDH_006_INVESTIGATION_NOT_FOUND` (404) | **Ninguna.** Falta la cabecera: la pantalla manda al principio del paso, que es donde FE13a la crea |

El resto va al toast por `code`, y `errors` no se muestra nunca.

**B — Condición del recién nacido** (`newbornConditionSaveSchema`). Sección B2, diálogo.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `conditionName` | `<MeddraSearchField>` | **sí** (≤500) | Es el único bloqueante. En el `004` es **opcional pero no anulable**: se corrige, no se borra |
| `conditionCode` | — | no (≤100) | Lo pone la selección del término; dispara la resolución |
| `source` | — | no | Lo pone la selección. Una fuente externa sin importar da `404` |
| `notes` | `<Textarea>` | no | Texto libre |

**Es el modal de `PregnancyComplicationFormDialog` menos el `<CatalogSelect>` de tipo.** Mismo `<MeddraSearchField>`, misma resolución, mismas tres ramas. Lo que **no** se comparte es el estado: son dos tablas de dos pasos distintos y ninguna precarga a la otra.

| Código | Ancla |
|---|---|
| `INVPREG_001_MEDICAL_HISTORY_NOT_FOUND` · `INVPREG_004_…` (404) | **Ninguna.** Mensaje propio: «falta la ficha de antecedentes», con botón **«Crear la ficha»** que lanza el `POST` de apertura. **No se reintenta solo** ni se encadenan dos escrituras en un botón (§5.5.3) |
| `INVPREG_00X_DIAGTERM_NOT_FOUND` (404) | `conditionName` — la fuente externa no está importada |
| `INVPREG_00X_ALREADY_EXISTS` (409) | `conditionName` — el término ya está entre las condiciones **activas** de esta ficha. **Sin tipo en el par**, a diferencia del paso 4 |

**Se envía el objeto completo en el `PUT`** y el backend hace el update diferencial; el cliente no calcula ningún diff (`CONVENTIONS.md` §6.5). Y `conditionName` **sólo viaja si el usuario cambió el texto**: lo que se muestra es `conditionRaw ?? diagnosticTerm.name`, y reenviar el nombre del maestro sin querer lo convertiría en un `conditionRaw` que dice lo mismo.

**C — La compuerta de B2 y el bloqueo del desenlace.** La lista existe sólo con `pregnancyOutcome.value === '2'`. Si hay condiciones activas y el usuario cambia el desenlace a otro, **el guardado se impide** antes de enviar, con un diálogo que dice cuántas condiciones hay y que sólo un ADMIN puede retirarlas hoy (§2). Es la forma de §7.3 y §7.4, aplicada aquí porque no hay borrado que ofrecer: la alternativa —dejar guardar— produce filas que ningún desenlace justifica y que la pantalla ya no muestra.

### 3.6 Estados de la pantalla

Las tres secciones viven dentro del paso 5, así que el guard, la carga del expediente y el «sólo lectura si `CLOSED`» son los de FE08 y FE13a. Lo que este spec declara es lo suyo:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga de la ficha | Skeleton de las dos secciones, con la altura de los controles reales | — |
| Ficha inexistente (antes del `POST`) | **No es un estado visible.** La sección B se revela y la ficha se crea en el mismo momento; hasta que el `POST` resuelve, los controles están deshabilitados | — |
| El `POST` de apertura falla | Mensaje en el lugar de la sección con botón **«Reintentar»**. Sin ficha no hay nada que rellenar, y no se pinta un formulario que no se puede guardar | `investigation.medicalHistory.openFailed` |
| Compuerta de §7.4 cerrada | **B1 y B2 no existen.** Ni encabezado, ni aviso, ni «no aplica»: un paciente varón no ve un solo campo de embarazo | — |
| Compuerta de §7.4 sin confirmar | B1 y B2 visibles, con la marca **«Si aplica»** junto al encabezado de B1 | `investigation.pregnancy.ifApplicable` |
| Bloque interior cerrado | Las nueve columnas ocultas, sólo `isPregnancyConfirmed` a la vista. Al abrirlo, `aria-live="polite"` | — |
| B2 cerrada por desenlace | La sección no se pinta. Si hay condiciones activas y el desenlace cambia, salta el diálogo de §3.5 C | `investigation.newbornCondition.outcomeLocked` |
| B2 vacía | Texto y botón **«Añadir afección»** | `investigation.newbornCondition.empty` |
| Falta la ficha al añadir condición (`404`) | Mensaje **«Falta la ficha de antecedentes»** con botón «Crear la ficha» | `investigation.newbornCondition.missingHistory` |
| Error de guardado | Mensaje del `EsaviApiError` por `code`; los de §3.5 anclados al campo, el resto en toast | `investigation.medicalHistory.saveError` |
| Expediente cerrado (`CLOSED`) | Todo en sólo lectura, sin botón de añadir ni de guardar. Lo impone FE08 | — |
| Sin permiso | No se llega: el guard del paso redirige | — |

**«Si aplica» no es un `NOT_APPLICABLE` puesto por la pantalla.** Es una marca visual sobre un bloque que se muestra sin poder confirmar que aplica —sexo desconocido o edad incalculable—; la respuesta la sigue dando el investigador, y `NOT_APPLICABLE` es una de las cuatro opciones del control precisamente para eso (§5.5.3).

**No hay «vacío con filtros»**: B2 no tiene filtros. La distinción que §3.6 del template exige no aplica, y se dice para que el silencio no se confunda con el olvido.

### 3.7 Responsividad y accesibilidad

- **B2 → tarjetas** por debajo de `md`. Los **dos** campos que sobreviven: **término** (`conditionRaw ?? diagnosticTerm.name`) y **notas truncadas**. La tabla no tiene más: ni tipo, ni fecha.
- **Las dos secciones colapsan a una columna** por debajo de `md`. Los `<AnswerOptionField>` pasan de fila horizontal a lista vertical, que es como ya se comportan en el paso 4.
- **Cada sección es un `<fieldset>` con `<legend>`**, y el bloque de las nueve columnas otro anidado dentro de B1: es lo que permite a un lector de pantalla anunciar que los campos pertenecen al embarazo confirmado.
- **Lo que aparece por un cambio en otro control va en `aria-live="polite"`**: las nueve columnas al confirmar el embarazo, `riskFactorDescription` al marcar el factor de riesgo y la sección B2 al elegir el desenlace.
- **Las dos observaciones de B no se anuncian nunca como novedad**: están siempre en el DOM, que es justo la decisión de §3.5.
- Objetivos táctiles de 44 px; `dvh`, nunca `vh`. La barra de acciones queda fija abajo, como en el resto del asistente.
- El diálogo de condición atrapa el foco, se cierra con `Esc` y devuelve el foco al botón que lo abrió. Los iconos sin texto llevan `aria-label` por i18n.

### 3.8 Claves i18n nuevas

Todas bajo `investigation.*`, en los **tres** archivos de idioma. `npm run i18n:check` exige paridad exacta.

| Clave | Uso |
|---|---|
| `investigation.medicalHistory.title` | Encabezado de la sección B |
| `investigation.medicalHistory.hasPriorHospitalizationHistory` | «Antecedentes de hospitalización en los 30 días previos a la vacunación actual» |
| `investigation.medicalHistory.priorHospitalizationObservations` | «Observaciones del antecedente de hospitalización» |
| `investigation.medicalHistory.hasFamilyHistory` | «Antecedentes familiares de otra enfermedad (relevantes para un ESAVI) o alergia» |
| `investigation.medicalHistory.familyHistoryObservations` | «Observaciones de antecedentes familiares» |
| `investigation.medicalHistory.notes` | Observaciones de la ficha |
| `investigation.medicalHistory.openFailed` | El `POST` de apertura falló |
| `investigation.medicalHistory.saveError` | Error de guardado de la ficha |
| `investigation.pregnancy.title` | Encabezado de la sección B1 — «Preguntas para mujeres» |
| `investigation.pregnancy.hint` | Texto informativo: «Principalmente entre 12 y 49 años, o cuando exista sospecha de embarazo» |
| `investigation.pregnancy.ifApplicable` | La marca «Si aplica» |
| `investigation.pregnancy.isPregnancyConfirmed` | «Confirme si la mujer estaba embarazada en el momento de la vacuna» |
| `investigation.pregnancy.gestationalWeeks` | «Semanas de gestación» |
| `investigation.pregnancy.gestationMethod` | «¿Cuál método usó para el cálculo de la edad gestacional?» |
| `investigation.pregnancy.hasPregnancyRiskFactor` | «¿Se identificó algún factor de riesgo de complicaciones obstétricas graves?» |
| `investigation.pregnancy.riskFactorDescription` | «Explique cuál fue el factor de riesgo» |
| `investigation.pregnancy.delivery` | «El parto fue:» |
| `investigation.pregnancy.birth` | «El nacimiento fue:» |
| `investigation.pregnancy.birthWeightGrams` | «Peso al nacer (en gramos)» |
| `investigation.pregnancy.pregnancyOutcome` | «¿Cuál fue el desenlace del embarazo?» |
| `investigation.pregnancy.wasBreastfed` | «¿Recibió lactancia materna?» |
| `investigation.newbornCondition.title` | Encabezado de la sección B2 — «Afecciones médicas del recién nacido» |
| `investigation.newbornCondition.term` | «Describa la afección médica del recién nacido» |
| `investigation.newbornCondition.add` | Botón «Añadir afección» |
| `investigation.newbornCondition.empty` | Estado vacío de la lista |
| `investigation.newbornCondition.duplicate` | El `409` sobre el término |
| `investigation.newbornCondition.termNotImported` | El `404` de la fuente externa |
| `investigation.newbornCondition.missingHistory` | El `404` de la nieta, con su botón |
| `investigation.newbornCondition.outcomeLocked` | Diálogo que impide cambiar el desenlace con condiciones cargadas |
| `investigation.pregnancy.blockGuard.title` | Título del diálogo del guard ampliado |
| `investigation.pregnancy.blockGuard.investigationBlock` | La entrada del paso 5 en la enumeración del guard |
| `investigation.pregnancy.blockGuard.clearInvestigation` | Su botón «Vaciar» |

**El texto informativo de B1 se copia del formulario, con el rango tal cual: «Principalmente entre 12 y 49 años».** Es una orientación al investigador, no la compuerta —que sigue en 15–49 (§6)—, y por eso no se toca: el papel dice 12 y quien rellena el papel lee eso.

---

## 4. Plan de implementación

Nueve pasos. Cada uno deja el proyecto compilando, arrancable y committeable solo.

**Las claves i18n van en los tres idiomas dentro del paso que las usa**, no en un paso final: `npm run i18n:check` exige paridad exacta y un paso que añadiera claves sólo en `es` dejaría el árbol roto hasta el siguiente.

1. **Contratos.** Dos entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`, `npm run contracts:sync`, y las dos respuestas declaradas a mano en `contracts/declared/investigationMedicalHistory.ts` y `contracts/declared/investigationPregnancyCondition.ts`, con la cita del servicio de origen en el encabezado.
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` sale en 0; `git diff` sobre `src/contracts/` no muestra ediciones a mano dentro de los dos archivos generados.

2. **Capa de API.** En `features/investigation/api.ts`, sobre lo que dejó FE13a: `useInvestigationMedicalHistoryByCase(caseId, enabled)` (`ESAVI-INVMEDH-006`), el recurso de la ficha con `useCreate` (`-001`) y `useUpdate` (`-004`) —con el `:id` = `investigationId`—, y el de las condiciones con `useNewbornConditionsByMedicalHistory(investigationId, enabled)` (`ESAVI-INVPREG-002A`), `useCreate` (`-001`) y `useUpdate` (`-004`). Cada hook cita su código de operación.
   *Verificación:* un test de `api.test.tsx` con MSW comprueba que el `POST` de la ficha lleva `investigationId` en el cuerpo, que el `PUT` lo usa como `:id` en la ruta, y que la lista de condiciones pide `/investigation/:id` con ese mismo valor.

3. **El guard, antes que cualquier escritura nueva.** Ampliar `shared/hooks/usePregnancyBlockGuard.ts` para que lea también la ficha de antecedentes y sus condiciones activas, y para que `hasPregnancyData` cuente las diez columnas de embarazo del paso 5 —`isPregnancyConfirmed` y las nueve que gobierna— además de las del paso 4. El diálogo enumera **los dos bloques por separado**, cada uno con su «Vaciar» y su escritura propia. Va antes que las secciones a propósito: si fuera después, existiría una versión del repositorio capaz de escribir embarazo en la investigación y ciega a él desde el paso 1.
   *Verificación:* con una ficha que tenga `isPregnancyConfirmed: 'YES'` y dos condiciones, `PatientStep` impide guardar un cambio de sexo a `MALE` y el diálogo lista los dos bloques; «Vaciar» el del paso 5 manda **un solo** `PUT` a `ESAVI-INVMEDH-004` con los diez campos en `null` y no toca el del paso 4.

4. **Schemas y predicados.** `medicalHistorySaveSchema`, `newbornConditionSaveSchema` y los predicados de la compuerta en `features/investigation/schemas.ts`: `isPregnancyBlockOpen(value) === (value === 'YES')` y el equivalente de `hasContent` del backend, con el `0` contando como contenido. Más el constructor del cuerpo del `PUT` que emite los nueve `null` explícitos cuando el bloque está cerrado.
   *Verificación:* `schemas.test.ts` cubre los cinco cierres del `answerOption` (`'NO'`, `'UNKNOWN'`, `'NOT_APPLICABLE'`, `'NO_ANSWER'`, `null`), `gestationalWeeks: 0` y `birthWeightGrams: 0` como contenido, `''` y `null` como ausencia, y los bordes 45 y 6000.

5. **Sección B y apertura de la ficha.** `MedicalHistorySection.tsx`, montada en `InvestigationStep.tsx`, que pasa de tres identificadores de sección a cuatro. Al revelarse la sección, `POST { investigationId }` si la ficha no existe; los controles quedan deshabilitados hasta que resuelve, y un `409 INVMEDH_001_ALREADY_EXISTS` refresca la consulta y sigue sin toast. Las dos observaciones se pintan siempre.
   *Verificación:* entrar al paso con la investigación ya creada y avanzar a B lanza exactamente un `POST`; recargar no lanza otro; con la ficha ya creada no hay `POST` ninguno; apagar una bandera **no** borra su observación.

6. **Sección B1.** `PregnancySection.tsx` con `usePregnancyGate(caseId)` decidiendo entre oculta, normal y «Si aplica»; el bloque interior derivado en render; las nueve columnas con sus controles y rangos; el `PUT` con los nueve `null` al cerrarse. `InvestigationStep` pasa a cinco identificadores, y a cuatro cuando la compuerta está cerrada.
   *Verificación:* con paciente varón no se renderiza ni el encabezado de B1 y el stepper de secciones tiene una menos; con sexo desconocido aparece «Si aplica»; poner `isPregnancyConfirmed` en `'NO'` con semanas cargadas manda los nueve `null` y el servidor no devuelve `400`; `gestationalWeeks: 0` con el bloque abierto se guarda como `0` y no como `null`.

7. **Sección B2.** `NewbornConditionList.tsx` con `<SatelliteList>` y `NewbornConditionFormDialog.tsx` con `<MeddraSearchField>`, tomando `PregnancyComplicationFormDialog` como plantilla y quitándole el `<CatalogSelect>` de tipo. La lista se pinta sólo con `pregnancyOutcome.value === '2'`, resuelto contra el catálogo cargado. Sin botón de borrar (§2). El `404` de la nieta trae su mensaje propio con «Crear la ficha».
   *Verificación:* elegir el desenlace «Nacido vivo con afección médica al nacer» revela la sección y cualquier otro la oculta; añadir dos veces el mismo término da el `409` anclado en el campo; un término de fuente externa sin importar da el `404` con su mensaje; forzando el `404` de la madre, el botón «Crear la ficha» lanza el `POST` y el usuario reintenta el alta él mismo.

8. **Bloqueo del cambio de desenlace.** En la cadena de guardado de B1: si hay condiciones activas y el desenlace resultante no es `value === '2'`, el guardado se detiene antes de enviar con el diálogo de §3.5 C, que dice cuántas condiciones hay y quién puede retirarlas.
   *Verificación:* con dos condiciones cargadas, cambiar el desenlace a «Nacido vivo sano» y pulsar «Guardar» no manda ninguna petición y abre el diálogo; sin condiciones, el mismo cambio se guarda sin fricción.

9. **Tests de cierre.** Los cuatro de §2: el schema con la compuerta y el cero (ya en el paso 4, aquí se completa con los casos cruzados), la lista de B2 con su `409`, el guard ampliado, y el recorrido de integración de las tres secciones — alta desde cero, reentrada con todo revelado, cambio de desenlace con condiciones cargadas, y expediente `CLOSED` en sólo lectura.
   *Verificación:* `npm run check` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las **seis rutas** de §3.2 se consumen: `INVMEDH-001/-006/-004` e `INVPREG-001/-002A/-004`, más los cuatro catálogos.
- [ ] Ninguna ruta fuera del inventario: `grep -rnE "investigation-medical-histories|investigation-pregnancy-conditions" src/` sólo devuelve las seis formas de §3.2.
- [ ] Cada hook nuevo de `api.ts` cita su código `ESAVI-*` en un comentario.
- [ ] Avanzar a la sección B crea la ficha con **un solo** `POST`; recargar no crea otra; un `409 INVMEDH_001_ALREADY_EXISTS` refresca y sigue sin toast.
- [ ] Las dos observaciones de B **se muestran siempre** y no se limpian al apagar su bandera.
- [ ] Con paciente varón, B1 y B2 **no se renderizan**: `queryByText` de sus encabezados no encuentra nada.
- [ ] Con sexo desconocido o edad incalculable, B1 aparece con la marca «Si aplica».
- [ ] La compuerta interior es **estricta**: `'NO'`, `'UNKNOWN'`, `'NOT_APPLICABLE'`, `'NO_ANSWER'` y `null` ocultan las nueve columnas por igual.
- [ ] Cerrar el bloque envía los **nueve `null` explícitos** y el servidor no responde `400`.
- [ ] `gestationalWeeks: 0` y `birthWeightGrams: 0` con el bloque abierto se guardan como `0`; con el bloque cerrado el formulario no los envía y no producen `PREGNANCY_FIELDS_NOT_ALLOWED`.
- [ ] `grep -rn "Number(.*) || null\|Number(.*) ?? null" src/features/investigation/` no devuelve resultados — es la forma que convierte el `0` en ausencia.
- [ ] «El parto fue:» está sobre `deliveryItemId` y «El nacimiento fue:» sobre `birthItemId`; los desplegables muestran, respectivamente, *Parto normal* y *A término*.
- [ ] B2 se pinta sólo con `pregnancyOutcome.value === '2'`, y la comparación va contra `value`: `grep -rn "LIVE_BORN_WITH_COMPLICATIONS" src/features/investigation/` no devuelve resultados.
- [ ] Con condiciones activas, cambiar el desenlace y guardar **no manda ninguna petición** y abre el diálogo de bloqueo.
- [ ] Añadir dos veces el mismo término da `INVPREG_001_ALREADY_EXISTS` anclado en `conditionName`; el mapeo funciona también con el prefijo `_004_`.
- [ ] El `404 INVPREG_00X_MEDICAL_HISTORY_NOT_FOUND` muestra «Falta la ficha de antecedentes» con su botón, **sin reintentar solo**.
- [ ] La condición muestra `conditionRaw ?? diagnosticTerm.name`, y `conditionName` viaja en el `PUT` **sólo** si el usuario cambió el texto.
- [ ] Con datos de embarazo en los dos pasos, `PatientStep` impide el cambio de sexo y el diálogo lista **los dos bloques por separado**, cada uno con su «Vaciar» y su escritura.
- [ ] Vaciar el bloque del paso 5 manda un solo `PUT` a `ESAVI-INVMEDH-004` y no toca `notificationPregnancy`.
- [ ] Con expediente `CLOSED`, ni «Guardar», ni «Añadir afección», ni el diálogo de condición.
- [ ] Ningún dato del servidor en `useState` ni en un store: `grep -rn "useState" src/features/investigation/` sólo aparece en el diálogo abierto, la condición en edición y el índice de sección.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] Las 32 claves de §3.8 existen en `es`, `en` y `nl`; `npm run i18n:check` sale en 0.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** Las tres secciones se ven correctas en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/investigation/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** B2 colapsa a tarjetas con los **dos** campos de §3.7, las dos secciones caen a una columna y el body no hace scroll horizontal en 375 px.
- [ ] **Rol bajo.** Con `USER` las tres secciones se escriben completas —las seis rutas son `USER`— y el botón de borrar una condición **no se pinta**, porque `INVPREG-005A` es ADMIN. Un `403` inesperado no deja pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, `placeholder` y `aria-label` incluidos.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState` ni en un store, y el `investigationId` de la clave de las condiciones sale de la cabecera, no se guarda aparte.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** partir §5.5.3 en dos specs. FE13a anunció «FE13b, FE13c y FE13d» para los cuatro bloques que quedaban, pero §5.5.3 sola son cuatro tablas y 46 columnas —más que FE13a entera—, y el corte por las letras del formulario (B/B1/B2 aquí, C en FE13c) cae justo donde caen las dos madres: una nieta por spec. El reparto queda corrido una letra: FE13d el acto de vacunación, FE13e el error y la comunidad.
- **No:** meter la sección C aquí «porque las dos nietas se decidieron juntas». Se **decidieron** juntas en `CASE-PROCESS.md`, y por eso el documento las mantiene en la misma sesión; implementarlas juntas es otra cosa. Lo que había que no perder —el orden madre→nieta y el `404` que parece un fallo del servidor— viaja en §1 B y en §3.5, y FE13c lo cita en vez de redescubrirlo.
- **Sí:** la compuerta se queda en **15–49** y `usePregnancyGate` se consume sin tocarlo. El 12 de `ESAVI-FORM.md` B1 es un error textual del formulario, confirmado por el usuario. Cambiar `PREGNANCY_MIN_AGE` afectaría a tres bloques en dos pasos y obligaría a reescribir §7.4 en cuatro sitios: eso es un spec de la compuerta, no éste.
- **Sí:** el texto informativo de B1 conserva el «12 y 49 años» del papel. Es orientación para quien rellena, no la regla, y hacerlo coincidir con la constante desalinearía la pantalla del formulario impreso que el investigador tiene delante.
- **Sí:** las etiquetas de parto y nacimiento se emparejan con el **catálogo**, no con la columna que les asigna `ESAVI-FORM.md` B1. Los ítems sembrados no dejan margen: `deliveryType` enumera formas de parto, `birthCondition` condiciones del nacimiento. Respetar el cruce del formulario habría puesto «El parto fue:» sobre un desplegable de *A término / Prematuro*.
- **Sí:** las dos observaciones de B **siempre visibles y nunca limpiadas**, aunque el formulario las condicione a `YES`. Es la excepción a §7.3 que el backend declara con todas las letras: una nota que explica *por qué* la respuesta es `UNKNOWN` es exactamente cuando el texto libre vale más. La diferencia con `otherDescription` es de naturaleza —allí el texto **es** la respuesta, aquí la **comenta**—, y sólo lo primero se limpia al apagar.
- **Sí:** `wasBreastfed` se pinta, aunque el formulario no la recoja. Es una de las nueve columnas que la compuerta gobierna, con validador y variante `full` propia; una columna que la pantalla nunca puede escribir es peor que una pregunta de más, y su ausencia del papel se lee como omisión, no como decisión.
- **No:** pintar también las columnas que `CASE-PROCESS.md` §5.5.3 no lista como pedidas. `wasBreastfed` entra porque el formulario la omitió y el modelo la pide; no es una puerta abierta a rellenar el DDL a mano.
- **Sí:** B2 oculta salvo con `pregnancyOutcome.value === '2'`, **y el cambio de desenlace bloqueado** mientras haya condiciones. Se consideró mostrarla siempre —más simple, y deja filas sin desenlace que las justifique— y ocultarla avisando sin bloquear —deja las filas cargadas fuera de la vista, que es peor: nadie las puede retirar y nadie las ve—. La forma que se elige es la de §7.3 y §7.4, ya usada en el paso 4.
- **Sí:** los **nueve `null` explícitos** al cerrarse el bloque. El backend acepta omitirlos y los fuerza él solo, pero entonces el cuerpo depende de qué omitió el formulario y el spec no puede afirmar qué se guardó. Con los nueve `null`, el `PUT` declara el estado resultante y el update diferencial evita el `UPDATE` si ya estaban vacíos.
- **Sí:** el `404` de la nieta se muestra con un botón «Crear la ficha» y el usuario reintenta el alta. **No:** crear la madre y reintentar solo. Son dos escrituras encadenadas dentro de un botón y la segunda puede fallar sola, que es justo lo que §5.5.3 desaconseja; y el mensaje explícito es lo que el documento pide, porque un `404` sobre un id correcto es el error más desconcertante del paso 5.
- **Sí:** el guard enumera los dos bloques **por separado**, con un «Vaciar» cada uno. Una sola acción con dos escrituras encadenadas dejaría al usuario sin saber cuál de las dos falló, y el diálogo ya está construido para enumerar qué hay cargado.
- **Sí:** el guard se amplía **antes** de las secciones (paso 3 de §4). Si fuera después, existiría un commit capaz de escribir embarazo en la investigación y ciego a él desde el paso 1 — el dato incoherente entraría por la puerta que el guard existe para cerrar.
- **Sí:** B y B1 comparten `useForm` y una sola escritura. Son quince columnas de la misma fila; dos formularios obligarían a decidir cuál gana cuando los dos tocan `notes`, y la respuesta correcta es que no hay dos.
- **Sí:** la clave de caché de las condiciones se llama `byMedicalHistory` aunque la ruta sea `/investigation/:id` y el UUID sea el mismo. Es la única forma de que la trampa de la nieta se lea en el código; una clave `byInvestigation` invitaría a pedir la lista con el id de la cabecera sin madre creada.
- **No:** el botón de borrar una condición. `ESAVI-INVPREG-005A` es ADMIN mientras las catorce entidades del paso 5 escriben como USER. Se acumula a la deuda de §10 de `CASE-PROCESS.md`, igual que el equipo investigador en FE13a: pintar un botón que da `403` a quien cargó la fila es peor que no pintarlo.
- **No:** unificar `PregnancySection.tsx` con el del paso 4. Comparten el nombre y la compuerta exterior, y nada más: otras tablas, otras columnas, otra compuerta interior. Lo que sí está compartido —`usePregnancyGate`, `usePregnancyBlockGuard`, `<AnswerOptionField>`— vive en `shared/` y no se escribe dos veces (`CONVENTIONS.md` §10.4).
- **No:** cruzar `gestationalWeeks` con `pregnancyOutcomeItemId` ni con `birthWeightGrams`. Cuarenta semanas con desenlace «Aborto» es una captura que el validador acepta, y una regla obstétrica inventada en el cliente rechazaría datos correctos que el backend guarda. El cliente valida lo que el servidor rechaza, nada más.
- **No:** precargar la condición del recién nacido desde `notificationPregnancyComplication`. Son dos tablas de dos pasos distintos y §5.5.3 lo dice explícitamente: lo que se detecta en la investigación no aparece en la notificación ni al revés. Lo único que las cruza es el guard, y sólo para bloquear.
- **No:** persistir el índice de sección revelada. Tercera vez que se decide igual (FE12f, FE13a, aquí): persistirlo obligaría a decidir qué manda cuando los datos y el recorrido no coinciden, y la respuesta correcta —«mandan los datos»— es lo que ya ocurre sin persistir nada.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El `POST` de apertura se dispara dos veces al revelarse la sección — carrera de un doble render o de dos pestañas — y la segunda da `409`, porque **el hueco es único por investigación y no se libera nunca** (§5.5.0) | El `409 INVMEDH_001_ALREADY_EXISTS` no es un error del usuario: refresca `['investigationMedicalHistory','byCase',caseId]` y sigue, sin toast. La mutación se dispara una sola vez por revelado y los controles quedan deshabilitados hasta que resuelve |
| `birthWeightGrams` llega como cadena (`'3250.00'`) y `'0.00'` parseado con `Number(x) || null` se convertiría en ausencia, colando un cero por el bloque cerrado o borrando un peso legítimo | El parseo va en el constructor de `defaultValues`, con `''` → `null` y todo lo demás por `Number()`; hay criterio de aceptación con `grep` sobre esa forma exacta |
| El objeto resuelto de la respuesta no trae `value`, así que una implementación apresurada compararía `pregnancyOutcome.code === 'LIVE_BORN_WITH_COMPLICATIONS'` y rompería §7.2 | La comparación va contra el catálogo cargado por `<CatalogSelect>`; hay criterio de aceptación con `grep` sobre el `code` |
| Cerrar la compuerta de §7.4 desde el paso 1 sobre datos de embarazo cargados en los **dos** pasos deja al usuario ante dos diálogos y dos escrituras, y puede parecer que el bloqueo no cede | El diálogo enumera los dos bloques con su contenido y su botón; el bloqueo cede cuando los dos están vacíos, y «vacío» es sin datos, con fila o sin ella — la fila 1:1 nunca se borra |
| El `409` de una condición duplicada corre **después** de la resolución del término, así que un texto libre nunca choca y dos textos iguales entran como filas distintas | Es el comportamiento del backend y no se combate desde el cliente: sin término resuelto no hay identidad que comparar. La lista muestra `conditionRaw` para que el duplicado se vea |

---

## 8. Impacto en pantallas existentes

| Qué cambia | Cómo |
|---|---|
| `shared/hooks/usePregnancyBlockGuard.ts` | Deja de mirar sólo el paso 4. Añade `['investigationMedicalHistory','byCase',caseId]` y `['investigationPregnancyCondition','byMedicalHistory',investigationId]` a su lectura, `hasPregnancyData` pasa a ser la disyunción de los dos bloques, y el diálogo enumera dos entradas con dos botones. **Sus dos consumidores —`PatientStep` y `CaseOpeningStep`— no cambian de firma**: siguen llamando `usePregnancyBlockGuard(caseId)` |
| `features/esaviCase/InvestigationStep.tsx` | Pasa de tres identificadores de sección a seis, o a cuatro con la compuerta de §7.4 cerrada. El `lastWithButton` de `useProgressiveSections` se mueve de la segunda sección a B1 |
| `src/contracts/` | Dos archivos generados nuevos y dos declarados. Nada existente se reescribe |
| Los tres archivos de idioma | 32 claves nuevas bajo `investigation.*`. Ninguna se renombra |

**Ninguna primitiva de `shared/components/` gana props en este spec.** `<AnswerOptionField>`, `<SatelliteList>`, `<NumberField>`, `<CatalogSelect>` y `<MeddraSearchField>` se consumen tal como están, lo que es la comprobación de que las siete primitivas de `ARCHITECTURE.md` §4.3 estaban bien dimensionadas.

---

## Lo que **no** está en este spec

- **La sección C del formulario** — `investigationClinicalEvaluation`, `evaluationInstitution` e `investigationDiagnostic`. Es **FE13c**, y con ella se cierra §5.5.3. Arrastra tres cosas que este spec no resuelve: el primer campo cifrado de un satélite de investigación, los `maxLength` de **120** que no son el `varchar(n)` de la columna, y la pregunta 7 del formulario —«¿la institución de la primera atención es distinta de la del tratamiento definitivo?»— mapeada a `evaluationInstitutionTypeItemId`, que es **columna por fila de institución** y cuyo catálogo sembrado no tiene ningún ítem que signifique «distinta». Ese desajuste se decide allí.
- **§5.5.4 y §5.5.5** — el acto de vacunación con la cadena de frío (FE13d), el error de administración con la investigación comunitaria (FE13e).
- **Bajar la compuerta de embarazo a 12 años**, si alguna vez se decide que 12 es el dato clínico correcto. Sería un spec de la compuerta: una constante, tres bloques en dos pasos, `CASE-PROCESS.md` §7.4 y sus tests de borde.
- **Que un USER pueda retirar una condición que él cargó.** Depende de que `ESAVI-INVPREG-005A` baje a USER, que es la deuda de §10 de `CASE-PROCESS.md`, común con `INVTEAM-005A` de FE13a y con los cuatro satélites del paso 4.
- **`<AuditTrail>` sobre la ficha y sus condiciones.** El `appDetails` viaja en las dos respuestas y no se consume aquí.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** Tercer uso, y sigue siendo un cambio de la norma, no de un spec.

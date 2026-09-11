# SPEC FE13c — Paso 5: evaluación clínica, instituciones evaluadoras y diagnósticos

> **Estado:** Borrador
> **Depende de:** SPEC FE08 (armazón del asistente, `CaseWizardActionBar`, sólo lectura si `CLOSED`), SPEC FE12a (la cadena guardar/completar de un paso y `<AnswerOptionField>`), SPEC FE12b (el diálogo de `notificationEvent` y la resolución contra `diagnosticTerm` que este spec replica), SPEC FE12f (`useProgressiveSections`), SPEC FE13a (la cabecera de la investigación, `InvestigationStep.tsx` y el patrón de fila 1:1 sin `isActive`), SPEC FE13b (la primera nieta del expediente y el orden de creación madre → hija), SPEC F58 del backend (la investigación y sus satélites)
> **Fecha:** 2026-09-10
> **Objetivo:** Cerrar la sección C del formulario de investigación — la primera evaluación clínica, la lista de instituciones que evaluaron al paciente y la lista de diagnósticos finales o presuntivos.

---

## 1. Por qué existe este spec

**A — FE13b termina en las afecciones del recién nacido y la sección C queda sin nada detrás.** FE13a abrió el paso 5 con las fuentes, la información básica y el equipo; FE13b añadió B, B1 y B2 sobre `investigationMedicalHistory`. Lo siguiente del formulario es la sección C —la primera evaluación clínica— y con ella se cierra §5.5.3 del `CASE-PROCESS.md`. Este spec es el último tramo del paciente en la investigación.

**B — Es la segunda nieta del expediente, y la que confirma que el patrón de FE13b era un patrón.** `evaluationInstitution.investigationId` **no apunta a la investigación**: apunta a la PK de `investigationClinicalEvaluation`, que vale ese mismo UUID (§5.5.3). Un `POST` con un id correcto sobre una investigación correcta responde `404 EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` si la ficha de evaluación no existe. La regla ya decidida en FE13b se aplica igual: la madre se crea **al revelarse la sección**, con `POST { investigationId }` a secas; el mensaje dice **qué ficha** falta, no «no encontrado»; y no se encadenan dos escrituras dentro del botón de añadir.

**C — La pregunta C.7 del formulario no coincide con el modelo, y la decisión ya está tomada.** `ESAVI-FORM.md` C.7 pregunta *«¿La institución en la que fue atendido por primera vez es diferente a la institución en donde recibió el tratamiento definitivo?»* y la mapea a `evaluationInstitutionTypeItemId`, con 7.1–7.3 condicionadas a `DIFFERENT`. Pero esa columna es **por fila de `evaluationInstitution`**, no una pregunta del formulario, y hoy está sembrada con `HOSPITAL`, `HEALTH_CENTER`, `LABORATORY`, `PRIVATE_PRACTICE` y `OTHER` — un tipo de establecimiento, no una comparación. La sección se construye como **lista de instituciones evaluadoras** con el selector **por fila**, que es lo que el caso real necesita: un paciente atendido en un hospital y derivado a otro deja dos filas, cada una con su relación declarada. La corrección de la semilla a «La misma» / «Diferente» es trabajo del backend y queda anotada en §7; la pantalla no la espera porque **nunca compara contra `code` ni contra literales** (§7.2).

**D — Tres pares bandera/explicación, seis códigos distintos, y el primero que incumple corta.** `sourceOther`/`otherDescription`, `suspectedChildAbuse`/`childAbuseExplanation` y `suspectedDomesticViolence`/`domesticViolenceExplanation` tienen la misma regla evaluada sobre el estado resultante, pero cada uno con su par `..._{REQUIRED,NOT_ALLOWED}` (§5.5.3). Un cuerpo que rompe dos pares recibe sólo el error del primero, así que el formulario **valida los tres antes de enviar** en vez de descubrirlos de uno en uno. Y los seis booleanos son tri-estado: sobre las dos sospechas, «no hay sospecha de maltrato» y «no se evaluó» son afirmaciones distintas y sólo una de las dos se puede defender después.

**E — Es la primera vez en el proceso del caso en que el límite de pantalla no es el de la columna.** `personName` y `personContact` son `varchar(250)` en el DDL y se guardan **cifrados**: lo que tiene que caber en los 250 es el criptograma, más largo que su texto. Un `maxLength` de 250 sobre el texto en claro dejaría pasar valores que Postgres rechaza, y el error saldría del driver como un **500** en vez de del validador como un `400`. El formulario replica **120** en los dos, **250** en `institutionName`, y ninguno en `clinicalDetailsPersonName`, que es `text`. Copiar el `varchar(n)`, que es lo que este repositorio ha venido haciendo, aquí produce exactamente el error que se quería evitar.

**F — Los diagnósticos son la contrapartida de `notificationEvent`, y esa distancia es el sentido del paso 5.** El paso 4 registra lo que el notificador **vio**; `investigationDiagnostic` registra a qué **concluyó** el investigador (§5.5.6). Nada las ata: sin FK, sin comparación en el servidor y **sin precarga desde el paso 4** — un diagnóstico que contradice el evento notificado es un registro legítimo y es justamente el que la vigilancia necesita ver. La lista trae además dos reglas propias que ninguna otra del expediente tiene: el duplicado corre sobre **el término solo, no sobre `(término, tipo)`**, de modo que confirmar un diagnóstico presuntivo es un `PUT` sobre la fila que ya existe y no un alta; y la tabla **no es nieta** — cuelga de `investigation` directamente, así que su lista funciona aunque la evaluación clínica no exista.

---

## 2. Alcance

**Dentro:**

- **La fila `investigationClinicalEvaluation` se crea al revelarse la sección C**, con un `POST { investigationId }` a secas (`ESAVI-INVCLIEV-001`). Ninguna de sus dieciséis columnas de datos es obligatoria, así que la ficha existe desde el primer segundo y la lista de instituciones queda operativa sin esperar a un guardado — la misma regla que FE13b aplicó a los antecedentes.
- **Sección C — «Detalles de la primera evaluación clínica del ESAVI»** (`ESAVI-FORM.md` C.1–C.16): `receivedMedicalAttention` (`answerOption`, variante `unknown`, **no gobierna nada**), las cuatro fuentes booleanas tri-estado con `otherDescription` detrás de `sourceOther`, las dos sospechas con sus explicaciones, `clinicalDetailsPersonName`, `familyClinicalDetails`, `completeClinicalSummary`, `signsAndSymptoms`, `otherSocialBackground` y `notes`.
- **Los tres pares bandera/explicación validados los tres antes de enviar**, cada uno con su mensaje propio de los seis códigos, y con la limpieza de §7.3 al apagar la bandera: el texto se oculta y viaja como `null` explícito.
- **Sección «Instituciones que evaluaron al paciente»** (C.7): `<SatelliteList>` sobre `evaluationInstitution` con diálogo de alta y edición — `<EntitySearchSelect>` de unidad de salud, `institutionName`, `personName`, `personContact`, `<CatalogSelect typeCode="evaluationInstitutionType">` **por fila** y `notes`. Los cinco campos **siempre visibles**, sin condicionar a ningún valor del selector.
- **La guarda de identificación validada en el cliente antes de enviar**: al menos uno de `healthFacilityId` o `institutionName`, con el mensaje puesto en los dos campos. Y la guarda de duplicado sobre `healthFacilityId` entre las activas, leída del `409` — **los nombres libres no entran**, ni cuando coinciden.
- **Los tres límites de pantalla del bloque cifrado**: **120** en `personName` y `personContact`, **250** en `institutionName`, ninguno en `clinicalDetailsPersonName`. Con su contador visible en los dos de 120, porque el usuario no puede adivinar por qué se corta antes de los 250 del DDL.
- **Sección «Diagnóstico final o presuntivo»** (C.17): `<SatelliteList>` sobre `investigationDiagnostic` con `<MeddraSearchField>`, resolución contra `diagnosticTerm` con sus tres ramas y su `404 INVDIAG_00X_DIAGTERM_NOT_FOUND`, `diagnosticDate` con la única regla de **no futura**, `<CatalogSelect typeCode="diagnosticType">` **sin valor por defecto** y `notes`. Se muestra `diagnosticRaw ?? diagnosticTerm.name` y `diagnosticName` se envía **sólo si el usuario cambia el texto**.
- **La guarda de duplicado de diagnósticos sobre el término solo**, leída del `409`, con el mensaje diciendo que el diagnóstico ya está en la lista y que **cambiar de presuntivo a confirmado se hace editando la fila existente**, no añadiendo otra.
- **Las tres lecturas del paso**: `ESAVI-INVCLIEV-006` y `ESAVI-INVDIAG-006` por caso, `ESAVI-EVALINST-002A` por investigación. Los dos `404` distinguibles del `006` de diagnósticos —`CASE_NOT_FOUND` e `INVESTIGATION_NOT_FOUND`— se traducen a dos mensajes distintos, porque son dos acciones distintas del usuario (§5.5.6).
- **El revelado progresivo de FE12f** extendido con tres identificadores más: C lleva «Guardar y continuar», las instituciones también, y los diagnósticos se revelan con el último avance; por debajo manda `CaseWizardActionBar`. Al reentrar en un paso que ya existía, todo visible y ningún botón intermedio.
- **Los tres contratos sincronizados** —`investigationClinicalEvaluation`, `evaluationInstitution`, `investigationDiagnostic`— más sus tres respuestas declaradas a mano en `contracts/declared/`.
- **Las claves i18n nuevas bajo `investigation.*`**, en los tres idiomas.
- **Tests**: el schema con los tres pares cruzados y el corte en el primero, los dos límites de 120, la guarda de identificación, la lista de diagnósticos con su `409` y su fecha futura, y el recorrido de integración de las tres secciones — alta, reentrada, apagado de una bandera con explicación escrita y expediente cerrado.

**Fuera de alcance (otros specs):**

- **§5.5.4 y §5.5.5** — el acto de vacunación y la cadena de frío (FE13d), el error de administración y la investigación comunitaria (FE13e), más la sección H de notas. Con este spec se cierra §5.5.3 y §5.5.6; el resto del paso 5 queda intacto.
- **Corregir la semilla de `evaluationInstitutionType`.** Hoy trae cinco tipos de establecimiento donde la pregunta C.7 pide «La misma» / «Diferente». **Es trabajo del backend**, queda declarado como dependencia en §7 y **no bloquea este spec**: `<CatalogSelect>` pinta lo que haya sembrado y ninguna regla del cliente compara contra `code`.
- **Retirar, reactivar o borrar en las dos listas.** `ESAVI-EVALINST-005A` e `ESAVI-INVDIAG-005A`/`-005B` exigen **ADMIN** mientras las catorce entidades del paso 5 escriben como USER. El comportamiento objetivo queda declarado en §3.5 y **bloqueado por la deuda de §10** de `CASE-PROCESS.md`, igual que el equipo investigador en FE13a y las condiciones del recién nacido en FE13b. Hasta que las rutas bajen a USER, el botón no se pinta.
- **Retirar o purgar la ficha de evaluación clínica.** No hay `005A` ni `005B`: la tabla no tiene `isActive` y sólo existe `005C`, purga física, SUPERADMIN. El asistente **crea y limpia; no borra** (§5.5.0).
- **Reordenar las filas de cualquiera de las dos listas.** `sortOrder` lo pone un disparador y **no se envía nunca**; el orden es el de creación.
- **Cruzar `diagnosticDate` con `investigationStartDate`, `hospitalizationDate` o `eventDate`.** Es una decisión declarada del backend, no un olvido: un diagnóstico anterior al inicio de la investigación es normal. **El cliente tampoco la inventa** (§5.5.6).
- **Precargar diagnósticos desde `notificationEvent`.** Nada ata las dos tablas, y la distancia entre lo que se vio y lo que se concluyó es el sentido del paso 5. Ni precarga, ni sugerencia, ni aviso de discrepancia.
- **Condicionar los datos de la institución al valor del selector.** `ESAVI-FORM.md` condiciona 7.1–7.3 a «Diferente»; el backend no impone nada y la guarda de identificación corre siempre. Decidido en §6: ocultarlos perdería el nombre de la institución justo en el caso más frecuente.
- **Validar el alcance geográfico de `healthFacilityId`.** El backend no lo comprueba en esta tabla (§5.5.3) y el cliente no añade una restricción que nadie impone.
- **Los listados `002B` con inactivas.** Son ADMIN y pertenecen a una pantalla de administración del expediente, no al asistente.
- **Buscar u ordenar por los campos cifrados.** `clinicalDetailsPersonName`, `personName` y `personContact` no admiten filtro útil ni `ORDER BY`; las dos listas salen por `createdAt DESC` y no llevan buscador.
- **`<AuditTrail>` sobre la evaluación y sus dos listas.** El array `appDetails` viaja en las respuestas; la pantalla de auditoría del expediente es un spec propio.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** Cuarto uso, misma decisión que FE13a y FE13b: escribir la norma es un cambio de `CONVENTIONS.md`, no de este spec.

---

## 3. Diseño

### 3.1 Pantallas y archivos

**No hay ruta nueva ni pantalla nueva.** El paso 5 ya está enrutado por FE08 en `/esavi-cases/:id/wizard/investigation`, con el guard `<RequireRole level={USER}>` del asistente; FE13a lo pobló con `InvestigationStep.tsx` y FE13b le añadió tres secciones. Este spec añade tres más detrás.

| Archivo | Qué es |
|---|---|
| `features/investigation/ClinicalEvaluationSection.tsx` | **Nuevo.** Sección C — las dieciséis columnas de la evaluación, con los tres pares bandera/explicación |
| `features/investigation/EvaluationInstitutionList.tsx` | **Nuevo.** C.7 — `<SatelliteList>` sobre las instituciones evaluadoras |
| `features/investigation/EvaluationInstitutionFormDialog.tsx` | **Nuevo.** Alta y edición de una institución |
| `features/investigation/DiagnosticList.tsx` | **Nuevo.** C.17 — `<SatelliteList>` sobre los diagnósticos |
| `features/investigation/DiagnosticFormDialog.tsx` | **Nuevo.** Alta y edición de un diagnóstico, con el campo del término |
| `features/investigation/api.ts` | **Cambia.** Tres entidades más sobre la base de FE13a y FE13b |
| `features/investigation/schemas.ts` | **Cambia.** Tres schemas y los predicados de los tres pares |
| `features/esaviCase/InvestigationStep.tsx` | **Cambia.** Monta las tres secciones y amplía `useProgressiveSections` de seis identificadores a nueve |

`shared/config/navigation.ts` **no cambia**: el paso 5 se alcanza desde el asistente, no desde el menú. **Ninguna primitiva nueva de `shared/`**: este spec es el primero del paso 5 que se construye entero con las trece de `ARCHITECTURE.md` §4.3 ya escritas.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/investigation-clinical-evaluations             ESAVI-INVCLIEV-001   USER   crear la ficha (lleva investigationId en el cuerpo)
GET    /api/investigation-clinical-evaluations/case/:id    ESAVI-INVCLIEV-006   USER   leer la ficha por caso
PUT    /api/investigation-clinical-evaluations/:id         ESAVI-INVCLIEV-004   USER   actualizar (:id es el investigationId)

POST   /api/evaluation-institutions                        ESAVI-EVALINST-001   USER   crear una institución (lleva investigationId en el cuerpo)
GET    /api/evaluation-institutions/investigation/:id      ESAVI-EVALINST-002A  USER   listar las activas de la ficha
PUT    /api/evaluation-institutions/:id                    ESAVI-EVALINST-004   USER   actualizar

POST   /api/investigation-diagnostics                      ESAVI-INVDIAG-001    USER   crear un diagnóstico
GET    /api/investigation-diagnostics/case/:id             ESAVI-INVDIAG-006    USER   listar los diagnósticos por caso
PUT    /api/investigation-diagnostics/:id                  ESAVI-INVDIAG-004    USER   actualizar

GET    /api/meddra/search                                  ESAVI-MEDDRA-006     USER   sugerencias del término del diagnóstico
GET    /api/health-facilities/search                       ESAVI-HFAC-006       USER   unidad de salud de la institución
GET    /api/catalog-items/type/:id                         ESAVI-CATITEM-002A   USER   los dos catálogos de este spec
```

**Lo que no se consume, y por qué:**

- **`ESAVI-INVCLIEV-002A`, `-002B` y `-003`.** El asistente entra por el caso, no por la investigación ni por el id de la ficha: `006` resuelve la lectura en una llamada y es el único que el paso necesita.
- **`ESAVI-EVALINST-002B` y `ESAVI-INVDIAG-002B`.** Son ADMIN y traen las retiradas; el asistente sólo trabaja con las activas.
- **`ESAVI-EVALINST-003` y `ESAVI-INVDIAG-003`.** El diálogo de edición se abre con la fila que ya trajo el listado; una segunda lectura por id no añade nada.
- **`ESAVI-EVALINST-005A`, `ESAVI-INVDIAG-005A` y `-005B`.** Exigen ADMIN — deuda de §10, declarada en §3.5 y fuera de alcance.
- **`ESAVI-INVCLIEV-005C`, `ESAVI-EVALINST-005C`, `ESAVI-INVDIAG-005C`.** Purga física, SUPERADMIN. No se expone en el asistente.
- **`ESAVI-INVDIAG-002A`.** Redundante con el `006` para esta pantalla: los dos devuelven lo mismo, pero el `006` sube desde el caso y así el paso no necesita conocer el `investigationId` antes de leer. Se declara consumido sólo como respaldo del filtro por investigación en pantallas futuras.

**Dos `404` que la pantalla tiene que distinguir**, y son de dos entidades distintas:

| Código | Qué significa | Qué hace la pantalla |
|---|---|---|
| `EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` | El `investigationId` es correcto y **falta la ficha de evaluación clínica** | Mensaje que nombra la ficha, y la crea con `INVCLIEV-001` antes de reintentar el alta |
| `INVDIAG_006_CASE_NOT_FOUND` | El caso no existe | Error del expediente; el asistente no debería haber llegado ahí |
| `INVDIAG_006_INVESTIGATION_NOT_FOUND` | El caso existe y **falta la investigación** | Estado vacío con la acción de crear la investigación — no es un error |

### 3.3 Tipos del contrato

Los tres salen de `../esavi-backend/src/types/investigation/` con `npm run contracts:sync`, y las tres respuestas se declaran a mano en `contracts/declared/` como en todo el paso 5 — el backend tipa la entrada, no la salida:

```ts
// contracts/investigationClinicalEvaluation.ts — espejo de investigationClinicalEvaluation.types.ts
export interface CreateInvestigationClinicalEvaluationInput {
  investigationId: string;          // PK = FK, la envía el cliente
  receivedMedicalAttention?: AnswerOption | null;
  sourceExam?: boolean | null;      // …las cuatro fuentes y otherDescription
  suspectedChildAbuse?: boolean | null;
  childAbuseExplanation?: string | null;
  suspectedDomesticViolence?: boolean | null;
  domesticViolenceExplanation?: string | null;
  clinicalDetailsPersonName?: string | null;   // cifrado en la base; en claro en el HTTP
  familyClinicalDetails?: string | null;
  completeClinicalSummary?: string | null;
  signsAndSymptoms?: string | null;
  otherSocialBackground?: string | null;
  notes?: string | null;
}

// contracts/evaluationInstitution.ts
export interface CreateEvaluationInstitutionInput {
  investigationId: string;          // nombra la ficha de evaluación, no la investigación
  healthFacilityId?: string | null;
  institutionName?: string | null;
  personName?: string | null;       // cifrado
  personContact?: string | null;    // cifrado
  evaluationInstitutionTypeItemId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

// contracts/investigationDiagnostic.ts
export interface CreateInvestigationDiagnosticInput {
  investigationId: string;          // nombra la investigación; N por investigación
  diagnosticName: string;           // obligatorio; no es columna — alimenta diagnosticRaw
  diagnosticCode?: string | null;   // no es columna — dispara la resolución
  source?: TermSource | null;       // no es columna
  diagnosticDate?: string | null;   // 'YYYY-MM-DD'
  diagnosticTypeItemId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}
```

Tres cosas que el tipo dice y el formulario tiene que respetar:

- **`sortOrder`, `diagnosticTermId` y `diagnosticRaw` no están en ningún input**, deliberadamente. El primero lo pone un disparador; los otros dos los deriva la resolución. **El cliente no los envía nunca**, ni siquiera cuando los recibe en el `GET`.
- **`clinicalDetailsPersonName` es `string` a la ida y `string` a la vuelta, las dos veces en claro.** El criptograma no cruza la frontera HTTP ni aparece en ninguna interfaz. Vuelve en `Title Case` (§8), y el formulario tiene que aceptar que lo enviado vuelva distinto sin marcarlo como cambio del usuario.
- **El `PUT` usa `Partial<CreateXInput>` y se envía el objeto completo.** El backend hace el update diferencial (`CONVENTIONS.md` §6.5); volver a una sección sin tocar nada no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría.

Las tres respuestas declaradas añaden lo que el `GET` trae y el input no: `createdAt`, `updatedAt`, `isActive` donde existe, `appDetails`, y en los diagnósticos el `diagnosticTerm` anidado con su `name` y su `code` — que es lo que se pinta, no `diagnosticName`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Id del caso | URL | `params.id` de `/esavi-cases/:id/wizard/investigation` | Lo fija FE08; este spec no lo toca |
| Etapas del expediente | TanStack Query | `caseWorkflowByCaseKey(caseId)` | `ESAVI-CASEFLOW-006`. De ahí sale `investigation.id`, el único identificador que este spec necesita |
| Ficha de evaluación clínica | TanStack Query | `investigationClinicalEvaluationByCaseKey(caseId)` | `ESAVI-INVCLIEV-006`. Sin `staleTime`: las dos mutaciones invalidan esta clave |
| Instituciones evaluadoras | TanStack Query | `evaluationInstitutionsByInvestigationKey(investigationId)` | `ESAVI-EVALINST-002A`. Devuelve `{ count, rows }` sin paginación en pantalla |
| Diagnósticos | TanStack Query | `investigationDiagnosticsByCaseKey(caseId)` | `ESAVI-INVDIAG-006`. Ídem; la lectura sube del caso y no necesita el `investigationId` |
| Sugerencias del término | TanStack Query | `['meddra', 'search', term]` | `staleTime` 5 min, igual que FE12b: detrás hay una API de pago limitada |
| Unidades de salud del buscador | TanStack Query | `['healthFacility', 'search', term]` | `ESAVI-HFAC-006`, con el debounce de `<EntitySearchSelect>` |
| Catálogo `evaluationInstitutionType` | TanStack Query | `['catalogItem', 'byType', 'evaluationInstitutionType']` | `staleTime` 30 min |
| Catálogo `diagnosticType` | TanStack Query | `['catalogItem', 'byType', 'diagnosticType']` | `staleTime` 30 min |
| Valores de los tres formularios | React Hook Form | `useForm` de cada sección o diálogo | **No es una copia del servidor**: es el estado del formulario, sembrado con `defaultValues` y resembrado con `reset` cuando llega la fila |
| Secciones reveladas | Componente | `useProgressiveSections` en `InvestigationStep.tsx` | Nueve identificadores tras este spec. Efímero: al reentrar en un paso que ya existe, todas visibles |
| Diálogo abierto y fila en edición | Componente | `useState` en cada lista | Efímero, no sale del componente |
| Borrador contra el cierre de pestaña | Zustand | `drafts` | El búfer de `ARCHITECTURE.md` §3.4, ya existente; se borra en cuanto responde el `PUT` |

**Lo que este spec declara explícitamente que *no* hace:**

- **Nada del servidor se copia a `useState` ni a un store.** Las tres listas se leen de su clave y se vuelven a leer tras cada escritura; no hay array local de instituciones ni de diagnósticos.
- **El `investigationId` no se guarda en ningún sitio.** Sale de `caseWorkflowByCaseKey`, que ya está en caché desde FE08. Duplicarlo en el store sería el mismo dato en dos capas.
- **Ningún filtro en la URL**, porque no hay filtros: las dos listas traen todas las filas activas en una página.

**Qué invalida qué:**

| Escritura | Invalida |
|---|---|
| `INVCLIEV-001` / `-004` | `investigationClinicalEvaluationByCaseKey(caseId)` |
| `EVALINST-001` / `-004` | `evaluationInstitutionsByInvestigationKey(investigationId)` |
| `INVDIAG-001` / `-004` | `investigationDiagnosticsByCaseKey(caseId)` |
| Completar el paso (FE12a) | `caseWorkflowByCaseKey(caseId)` |

**`INVCLIEV-001` invalida además la clave de las instituciones**, aunque no cree ninguna: es lo que convierte el `404` de la nieta en una lista operativa sin recargar la pantalla.

### 3.5 Formularios y validación

**A — Evaluación clínica** (`investigationClinicalEvaluationSaveSchema`). Sección C, orden de `ESAVI-FORM.md` C.1–C.16.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `receivedMedicalAttention` | `<AnswerOptionField variant="unknown">` | no | **No gobierna nada**: lo que sigue se ve siempre |
| `sourceExam`, `sourceDocuments`, `sourceVerbalAutopsy` | `<Switch>` tri-estado | no | Dentro de un `<fieldset>` con `<legend>` «Fuente de información» |
| `sourceOther` | `<Switch>` tri-estado | no | **Gobierna `otherDescription`** |
| `otherDescription` | `<Textarea>` | con `sourceOther === true` | Se oculta y viaja como `null` si la bandera no es `true` |
| `clinicalDetailsPersonName` | `<Input>` | no | Cifrado. Sin `maxLength` — la columna es `text` |
| `suspectedChildAbuse` | `<Switch>` tri-estado | no | **Gobierna su explicación** |
| `childAbuseExplanation` | `<Textarea>` | con la bandera en `true` | Ídem |
| `suspectedDomesticViolence` | `<Switch>` tri-estado | no | **Gobierna su explicación** |
| `domesticViolenceExplanation` | `<Textarea>` | con la bandera en `true` | Ídem |
| `otherSocialBackground`, `signsAndSymptoms`, `familyClinicalDetails`, `completeClinicalSummary`, `notes` | `<Textarea>` | no | Texto libre sin tope |

**Los tres pares se validan a la vez, no de uno en uno.** El backend corta en el primero que incumple, así que un cuerpo con dos pares rotos devuelve un solo error y el usuario descubriría el segundo en el siguiente intento. El schema declara los tres `superRefine` y `<ResourceForm>` pinta los tres mensajes en el mismo envío.

Errores mapeados al campo — la `X` es el número de operación, `001` al crear y `004` al actualizar:

| Código | Campo |
|---|---|
| `INVCLIEV_00X_OTHER_DESCRIPTION_REQUIRED` / `_NOT_ALLOWED` | `otherDescription` |
| `INVCLIEV_00X_CHILD_ABUSE_EXPLANATION_REQUIRED` / `_NOT_ALLOWED` | `childAbuseExplanation` |
| `INVCLIEV_00X_DOMESTIC_VIOLENCE_EXPLANATION_REQUIRED` / `_NOT_ALLOWED` | `domesticViolenceExplanation` |

**Los tres booleanos de bandera son tri-estado y el `null` significa algo.** Sobre las dos sospechas la diferencia deja de ser técnica: «no hay sospecha de maltrato» y «no se evaluó» son afirmaciones distintas y sólo una de las dos se puede defender después. El `<Switch>` tiene por tanto el tercer estado visible y una acción de «sin comprobar» que lo devuelve a `null`.

**B — Institución evaluadora** (`evaluationInstitutionSaveSchema`). Diálogo de alta y edición.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `evaluationInstitutionTypeItemId` | `<CatalogSelect typeCode="evaluationInstitutionType">` | no | La pregunta C.7, **por fila**. Nunca se compara contra `code` |
| `healthFacilityId` | `<EntitySearchSelect>` sobre `ESAVI-HFAC-006` | condicional | Uno de los dos. **Sin validación de alcance geográfico** |
| `institutionName` | `<Input maxLength={250}>` | condicional | El otro de los dos. En claro |
| `personName` | `<Input maxLength={120}>` | no | **Cifrado.** Contador visible |
| `personContact` | `<Input maxLength={120}>` | no | **Cifrado.** Contador visible |
| `notes` | `<Textarea>` | no | |

**La guarda de identificación se valida antes de enviar**: al menos uno de `healthFacilityId` o `institutionName`, con el mensaje puesto en los dos campos. Es una regla de servicio, no de validador —en el `004` depende del estado almacenado, no sólo del cuerpo—, así que el cliente valida sobre **el estado resultante** de la fila, no sobre lo que el usuario acaba de teclear.

**Y los 120 no son el `varchar(n)`.** Es la única vez en el proceso del caso en que el tope de pantalla es menor que el de la columna, y la razón está en §1.E. Un comentario en el schema lo dice, porque el próximo que lea `varchar(250)` en el DDL va a querer «corregirlo».

| Código | Campo |
|---|---|
| `EVALINST_00X_...` identificación (`400`) | `healthFacilityId` y `institutionName` |
| `EVALINST_00X_ALREADY_EXISTS` (`409`) | `healthFacilityId` — «esta unidad de salud ya está en la lista» |
| `EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` (`404`) | Sin campo: mensaje que nombra la ficha; la pantalla la crea y reintenta |

**C — Diagnóstico** (`investigationDiagnosticSaveSchema`). Diálogo de alta y edición, el de `notificationEvent` menos el `isOtherEsavi`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `diagnosticName` | `<MeddraSearchField>` | **sí** | ≤500. Elegir sugerencia fija `source: 'MEDDRA'`; escribir a mano lo deja en `'LOCAL'` o sin `source` |
| `diagnosticCode` | Derivado del campo del término | no | ≤100. Dispara la resolución |
| `diagnosticDate` | `<DateField>` | no | `'YYYY-MM-DD'`. **No futura**, y nada más |
| `diagnosticTypeItemId` | `<CatalogSelect typeCode="diagnosticType">` | no | Tres ítems sembrados. **Sin valor por defecto** |
| `notes` | `<Textarea>` | no | |

**Lo que se pinta en la lista es `diagnosticRaw ?? diagnosticTerm.name`**, y **`diagnosticName` sólo viaja si el usuario cambia el texto**: el `GET` no lo trae, así que reenviarlo tal cual en cada edición reescribiría `diagnosticRaw` con el nombre del maestro y borraría lo que el investigador había escrito. Es la trampa que FE12b cerró y aquí se cierra igual.

**`diagnosticName` es opcional pero no anulable en el `004`**: se corrige, no se borra.

**El tipo no se preselecciona.** «Presuntivo» y «sin declarar» no son lo mismo (§5.5.6), y un `<CatalogSelect>` con el primer ítem puesto convertiría todos los diagnósticos sin revisar en presuntivos.

| Código | Campo |
|---|---|
| `INVDIAG_00X_DIAGTERM_NOT_FOUND` (`404`) | `diagnosticName` — fuente externa no importada |
| `INVDIAG_00X_ALREADY_EXISTS` (`409`) | `diagnosticName` — «ya está en la lista; para confirmarlo, **edite el diagnóstico existente**» |
| `INVDIAG_00X_INVALID_DIAGNOSTIC_TYPE` (`400`) | `diagnosticTypeItemId` |
| Fecha futura (`400`) | `diagnosticDate` |

**Ninguna de las tres fechas cruzadas se valida**, ni en el cliente ni en el servidor: `investigationStartDate`, `hospitalizationDate` y `eventDate` no limitan a `diagnosticDate` (§5.5.6).

**Expediente cerrado.** Con el caso en `CLOSED`, las tres secciones se pintan en sólo lectura y los dos «Añadir» desaparecen, por el mecanismo que FE08 ya dejó en `InvestigationStep.tsx`. Este spec no añade guarda propia.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de los tres bloques, con tres filas en cada lista | — |
| Ficha de evaluación inexistente | No es un estado visible: al revelarse la sección se crea con `INVCLIEV-001` y el formulario aparece vacío | — |
| Instituciones vacías | Texto + botón «Añadir institución» | `investigation.evaluationInstitution.empty` |
| Diagnósticos vacíos | Texto + botón «Añadir diagnóstico» | `investigation.diagnostic.empty` |
| Investigación inexistente (`INVDIAG_006_INVESTIGATION_NOT_FOUND`) | Estado vacío con la acción de crear la investigación. **No es un error** | `investigation.diagnostic.noInvestigation` |
| Error | Mensaje del `EsaviApiError` por `code` + botón reintentar. **Nunca se muestra `errors`** | `investigation.clinicalEvaluation.error` y las dos de lista |
| Sin permiso | No se llega: el guard `<RequireRole level={USER}>` de FE08 redirige | — |

No hay «vacío con filtros»: ninguna de las dos listas tiene filtros.

### 3.7 Responsividad y accesibilidad

- **Las dos listas colapsan a tarjetas por debajo de `md`.** Instituciones: **nombre** (`institutionName ?? healthFacility.name`), **tipo** y **persona de contacto**. Diagnósticos: **término** (`diagnosticRaw ?? diagnosticTerm.name`), **tipo** y **fecha**. El resto queda en el diálogo de edición.
- Los dos diálogos son pantalla completa por debajo de `md`, con la barra de acciones fija abajo — el patrón que FE12b dejó.
- **Los tres `<fieldset>` de la sección C llevan `<legend>`**: fuentes de información, sospechas y relato clínico. Sin ellos los `<Switch>` tri-estado quedan sueltos para un lector de pantalla.
- Los `<Switch>` tri-estado anuncian los tres valores por `aria-checked="mixed"`, y el estado «sin comprobar» tiene texto propio: no se distingue del «no» sólo por color.
- Los dos contadores de 120 caracteres son `aria-live="polite"` y sólo hablan al acercarse al tope.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`. Los iconos sin texto llevan `aria-label` por i18n.

### 3.8 Claves i18n nuevas

Todas bajo `investigation.*`, en los **tres** archivos (`es`, `en`, `nl`). `npm run i18n:check` exige paridad exacta.

| Clave | Uso |
|---|---|
| `investigation.clinicalEvaluation.title` | Título de la sección C |
| `investigation.clinicalEvaluation.sourcesLegend` | `<legend>` del grupo de fuentes |
| `investigation.clinicalEvaluation.fields.*` | Las dieciséis etiquetas, con el texto literal de `ESAVI-FORM.md` C.1–C.16 |
| `investigation.clinicalEvaluation.errors.*` | Los seis códigos de los tres pares |
| `investigation.evaluationInstitution.title` | Título de la lista C.7, con el texto literal de la pregunta como descripción |
| `investigation.evaluationInstitution.fields.*` | Las seis etiquetas del diálogo |
| `investigation.evaluationInstitution.errors.identification` | La guarda de identificación |
| `investigation.evaluationInstitution.errors.alreadyExists` | El `409` sobre la unidad de salud |
| `investigation.evaluationInstitution.errors.missingClinicalEvaluation` | El `404` que nombra la ficha |
| `investigation.diagnostic.title` | Título de la lista C.17 |
| `investigation.diagnostic.fields.*` | Las cinco etiquetas del diálogo |
| `investigation.diagnostic.errors.alreadyExists` | El `409`, con la instrucción de editar la fila existente |
| `investigation.diagnostic.errors.futureDate` | La fecha futura |
| `investigation.diagnostic.errors.noInvestigation` | El `404` de investigación inexistente |

---

## 4. Plan de implementación

Diez pasos. Cada uno deja el repositorio compilando y con sus tests en verde; el cierre de cada paso es `npx tsc --noEmit -p tsconfig.app.json` más `npm run test`.

**1. Los contratos.** Tres entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs` —`investigationClinicalEvaluation`, `evaluationInstitution`, `investigationDiagnostic`— y `npm run contracts:sync`. Después, las tres respuestas en `contracts/declared/`, reconciliadas campo a campo contra los servicios del backend, con el `diagnosticTerm` anidado declarado en la del diagnóstico.
*Verificación:* los tres archivos sincronizados aparecen sin editar a mano; `tsc` pasa; ningún campo de las tres interfaces declaradas carece de origen citado en el comentario de cabecera; `sortOrder`, `diagnosticTermId` y `diagnosticRaw` no aparecen en ningún tipo de entrada.

**2. La capa de API.** `features/investigation/api.ts`: los tres recursos con `createResource`, los tres helpers de clave de §3.4 y las tres consultas con su `enabled`. Cada hook cita su código `ESAVI-*`. El `POST` de la evaluación y el de la institución llevan el `investigationId` en el cuerpo; el `PUT` de la evaluación va contra `/:investigationId`.
*Verificación:* tests con MSW — el `GET` de la evaluación no se dispara sin `caseId`; el `POST` de la evaluación invalida **también** la clave de las instituciones; el alta de institución invalida su lista y el alta de diagnóstico la suya; ningún cuerpo lleva `sortOrder`.

**3. Los schemas.** `features/investigation/schemas.ts`: los tres de §3.5. Los tres `superRefine` de los pares bandera/explicación evaluados a la vez, la guarda de identificación sobre el **estado resultante**, los dos topes de 120 con su comentario, y la fecha no futura.
*Verificación:* tests de tabla — un cuerpo que rompe dos pares produce **dos** errores del schema, no uno; una explicación con la bandera en `null` no valida; una institución sin unidad de salud y sin nombre no valida, y con sólo uno de los dos sí; 121 caracteres en `personContact` no validan y 120 sí; la fecha de mañana no valida y la de hoy sí.

**4. Sección C — Evaluación clínica.** `ClinicalEvaluationSection.tsx` con las dieciséis columnas en el orden de `ESAVI-FORM.md`, los tres `<fieldset>` con `<legend>`, los seis `<Switch>` tri-estado y la limpieza de las tres explicaciones al apagar su bandera.
*Verificación:* test — un interruptor sin tocar envía `null` y no `false`; apagar una sospecha oculta su explicación y el cuerpo la lleva como `null` explícito; `receivedMedicalAttention` en `NO` **no oculta nada**; el nombre cifrado vuelve en `Title Case` y la pantalla muestra lo devuelto, no lo escrito.

**5. La ficha se crea al revelarse la sección.** El `POST { investigationId }` de `INVCLIEV-001` disparado por el revelado, con el estado de error propio si falla, y la traducción del `404 EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` a un mensaje que nombra la ficha y la crea antes de reintentar el alta.
*Verificación:* test de integración — revelar la sección en una investigación sin ficha dispara **un solo** `POST`; revelarla en una que ya la tiene no dispara ninguno; con el `POST` en error no se pinta el formulario y hay botón de reintentar; el `404` de la nieta no muestra «no encontrado» sino el texto de la ficha.

**6. C.7 — Instituciones evaluadoras.** `EvaluationInstitutionList.tsx` sobre `<SatelliteList>` y `EvaluationInstitutionFormDialog.tsx` con los seis campos **siempre visibles**, los dos contadores de 120 y **sin botón de borrar** (§2).
*Verificación:* test — el alta invalida la lista; el `409` deja el diálogo abierto con el error anclado en `healthFacilityId`; dos filas con el mismo `institutionName` libre y sin unidad de salud **se aceptan las dos**; el selector de tipo pinta lo que devuelve el catálogo sin comparar contra ningún literal; en móvil la tarjeta muestra los tres campos de §3.7.

**7. C.17 — Diagnósticos.** `DiagnosticList.tsx` y `DiagnosticFormDialog.tsx` con `<MeddraSearchField>`, `source` en `MEDDRA`/`LOCAL`, `<DateField>`, el `<CatalogSelect>` **sin preselección** y sin botón de borrar.
*Verificación:* test — abrir la edición y guardar sin tocar el término **no envía `diagnosticName`**; cambiar el texto sí lo envía; la lista pinta `diagnosticRaw ?? diagnosticTerm.name`; el `409` propone editar la fila existente y no ofrece añadir; el desplegable de tipo abre sin valor marcado; una fecha anterior al inicio de la investigación **se acepta**.

**8. Montaje, revelado progresivo y borrador.** `InvestigationStep.tsx` monta las tres secciones y amplía `useProgressiveSections` de seis identificadores a nueve; el borrador de `draftsStore` bajo la clave `'investigation'`, con el mismo rebote y la misma resolución de conflicto que FE12a y FE13a.
*Verificación:* test — en un paso nuevo, tras B2 sólo se revela C y un botón; al reentrar en un paso existente se ven las nueve secciones y ningún botón intermedio; con el expediente en `CLOSED` las tres secciones son de sólo lectura y los dos «Añadir» no se pintan.

**9. i18n y mensajes de error.** Las claves de §3.8 en `es.json`, `en.json` y `nl.json`, con el texto literal de `ESAVI-FORM.md` como origen del español, y las entradas nuevas de `shared/api/errorMessages.ts` para los diez códigos de §3.5.
*Verificación:* `npm run i18n:check` en verde; ningún literal en los componentes; los diez códigos tienen mensaje propio y ninguno cae en el genérico; `errors` no aparece en ninguna vista.

**10. El recorrido completo.** Test de integración del tramo: alta desde cero, reentrada, apagado de una bandera con explicación escrita, `409` en las dos listas, y expediente `CLOSED`.
*Verificación:* los cinco casos pasan; `npx tsc --noEmit -p tsconfig.app.json` limpio; `npm run lint` limpio.

---

## 5. Criterios de aceptación

- [ ] Las nueve rutas de §3.2 se consumen y responden con lo esperado; ninguna otra se llama.
- [ ] Cada hook de `features/investigation/api.ts` cita su código `ESAVI-*` en un comentario.
- [ ] Revelar la sección C en una investigación sin ficha dispara **un solo** `POST /api/investigation-clinical-evaluations`; revelarla en una que ya la tiene no dispara ninguno.
- [ ] Un `404 EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` muestra un mensaje que **nombra la ficha de evaluación clínica**; la palabra «no encontrado» a secas no aparece en ninguna vista.
- [ ] Un cuerpo que rompe los tres pares bandera/explicación muestra **los tres** mensajes a la vez, cada uno anclado en su campo.
- [ ] Apagar `sourceOther`, `suspectedChildAbuse` o `suspectedDomesticViolence` oculta su explicación y el `PUT` la lleva como `null` explícito.
- [ ] Un `<Switch>` sin tocar envía `null`, no `false`; los tres estados son distinguibles sin depender del color.
- [ ] `personName` y `personContact` cortan en **120** caracteres; `institutionName` en **250**; `clinicalDetailsPersonName` no tiene tope.
- [ ] Una institución sin `healthFacilityId` y sin `institutionName` no se envía: el error aparece en los dos campos antes de la petición.
- [ ] Dos instituciones con el mismo nombre libre y sin unidad de salud se guardan las dos; dos con la misma unidad de salud dan `409` anclado en ese campo.
- [ ] Abrir un diagnóstico existente y guardarlo sin tocar el término **no envía `diagnosticName`**; la lista sigue mostrando `diagnosticRaw ?? diagnosticTerm.name`.
- [ ] El `<CatalogSelect>` de `diagnosticType` abre **sin valor seleccionado**.
- [ ] Un diagnóstico con fecha de mañana no se envía; uno con fecha anterior al inicio de la investigación **sí**.
- [ ] El `409` de diagnóstico duplicado dice que se edite la fila existente y no ofrece añadir otra.
- [ ] Ningún cuerpo enviado contiene `sortOrder`, `diagnosticTermId` ni `diagnosticRaw`.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `npm run i18n:check` sale en 0.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0 — **no basta `npm run build`**, que no comprueba tipos del proyecto de aplicación.
- [ ] `npm run check` sale en 0.

**Bloque de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/investigation/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** Las dos listas colapsan a tarjetas con los tres campos de §3.7
      y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` las tres secciones son plenamente utilizables y **no se pinta
      ningún botón de borrar**; ninguna acción visible produce un `403`.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders
      y `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en
      `useState` ni en un store, y el `investigationId` se lee de `caseWorkflowByCaseKey`
      en vez de guardarse.

---

## 6. Decisiones tomadas y descartadas

**1. La pregunta C.7 se descarta como pregunta y se convierte en una columna por fila.** `ESAVI-FORM.md` la mapea a `evaluationInstitutionTypeItemId` con 7.1–7.3 condicionadas a `DIFFERENT`, pero esa columna pertenece a `evaluationInstitution` y hoy está sembrada con cinco tipos de establecimiento. La sección se construye como **lista**, con el selector en cada fila. Es lo que el caso real necesita: un paciente atendido en un hospital y derivado a otro deja **dos filas**, cada una declarando su relación con el tratamiento definitivo. Descartadas: conservar la pregunta como bandera de pantalla sin columna detrás —añadiría un estado que ninguna tabla respalda— y dejar la sección fuera del spec hasta corregir la semilla.

**2. Los datos de la institución no se condicionan al valor del selector.** El formulario los condiciona a «Diferente»; el backend no impone nada y la guarda de identificación corre siempre. Ocultarlos perdería el nombre de la institución justo en el caso más frecuente —«la misma»—, que es exactamente el registro que la investigación quiere conservar. §7.3 ampara ocultar lo que el servidor prohíbe guardar, y aquí no prohíbe nada.

**3. La corrección de la semilla es una dependencia del backend y no bloquea.** `<CatalogSelect typeCode="evaluationInstitutionType">` pinta lo que haya sembrado y ninguna regla del cliente compara contra `code` (§7.2), así que la pantalla funciona con los cinco tipos actuales y seguirá funcionando con «La misma» / «Diferente» sin tocar una línea. Descartado marcar el spec como bloqueado: haría esperar tres secciones por un cambio de datos.

**4. Los diagnósticos entran en este spec.** En el modelo cuelgan de `investigation` y no de la evaluación clínica, así que técnicamente podrían ir a cualquier spec del paso 5; en el formulario son la fila C.17. Se quedan aquí porque cierran la sección C y porque llevarlos a FE13d, que ya trae el acto de vacunación y la cadena de frío, dejaría un spec desproporcionado y otro de una sola lista. Con esto quedan cerradas §5.5.3 y §5.5.6.

**5. Tres identificadores de revelado, no dos.** Las instituciones podrían revelarse dentro del bloque C, ahorrando un botón. Se descartó: dejaría una lista con altas debajo de un formulario que todavía no se ha guardado, y el usuario no sabría si lo que añade se conserva.

**6. Los topes de pantalla de los dos campos cifrados son 120, no los 250 del DDL.** Es la primera vez en el proceso del caso en que el límite visible no es el de la columna, y contradice lo que este repositorio ha venido haciendo. La razón es que lo que tiene que caber en `varchar(250)` es el criptograma. Descartado copiar el `varchar(n)`: produciría un **500** del driver en vez de un `400` del validador, que es exactamente el error que la regla quería evitar.

**7. Los tres pares bandera/explicación se validan a la vez en el cliente.** El backend corta en el primero que incumple. Descartado delegar en él: el usuario descubriría el segundo error después de corregir el primero, y el tercero después del segundo — tres viajes para un formulario que se puede validar entero antes de salir.

**8. `diagnosticType` no se preselecciona.** «Presuntivo» es el primer ítem del catálogo y sería el valor por defecto natural. Se descarta porque ausente ≠ presuntivo (§5.5.6): preseleccionarlo convertiría en presuntivos todos los diagnósticos que nadie revisó.

**9. `receivedMedicalAttention` no gobierna nada.** Es la primera pregunta de la sección y parece la compuerta natural de todo lo que sigue. El backend no la trata así, y ocultar la lista de instituciones con la respuesta en `NO` inventaría una regla del cliente. Todo lo de la sección C se ve siempre.

**10. `diagnosticName` viaja sólo si el usuario cambia el texto.** El `GET` no lo trae; reenviarlo tal cual en cada edición reescribiría `diagnosticRaw` con el nombre del maestro y borraría lo que el investigador escribió. Es la misma trampa que FE12b cerró en `notificationEvent`, y se cierra igual.

**11. No hay precarga ni comparación con los eventos del paso 4.** Se valoró sugerir los `notificationEvent` del caso al abrir el diálogo de diagnóstico. Descartado: nada ata las dos tablas y la distancia entre lo que se vio y lo que se concluyó **es** el sentido del paso 5. Un diagnóstico que contradice el evento notificado es un registro legítimo, y una sugerencia lo empujaría a parecerse al evento.

**12. Los diagnósticos se leen por `006` (desde el caso) y no por `002A` (desde la investigación).** Las dos devuelven lo mismo, pero el `006` sube del caso a la investigación por `UQ_investigation_case` y evita que la pantalla necesite conocer el `investigationId` antes de leer. Además distingue los dos `404`, y esa diferencia es una acción distinta del usuario en cada caso.

**13. Sin botón de borrar en ninguna de las dos listas.** `EVALINST-005A` e `INVDIAG-005A` exigen ADMIN mientras el paso 5 escribe como USER. Misma decisión que FE13a con el equipo investigador y FE13b con las condiciones del recién nacido: el botón no se pinta hasta que la ruta baje de rol. Descartado pintarlo y dejar que falle con `403`, y descartado ofrecerlo sólo a ADMIN — sería una función que aparece y desaparece según quién mire la misma pantalla.

**14. Los tres campos de la tarjeta en móvil.** Instituciones: nombre, tipo y persona de contacto. Diagnósticos: término, tipo y fecha. Se descartó llevar `notes` a la tarjeta en las dos: es el campo más largo y el que menos identifica una fila.

---

## 7. Riesgos identificados

**A — La semilla de `evaluationInstitutionType` no dice lo que la pregunta necesita.** Hoy trae `HOSPITAL`, `HEALTH_CENTER`, `LABORATORY`, `PRIVATE_PRACTICE` y `OTHER`; la pregunta C.7 pide «La misma» / «Diferente». **Es una dependencia declarada del otro repositorio** —`esaviapp.sql`, `upsertCatalogItem`— y el usuario la corregirá allí. No bloquea: la pantalla pinta lo que devuelva `ESAVI-CATITEM-002A` y nunca compara contra `code`. El riesgo real es el intermedio: mientras la semilla vieja siga puesta, el desplegable ofrece tipos de establecimiento bajo una etiqueta que pregunta por una comparación. **Mitigación:** la etiqueta de la sección explica qué se está declarando, y la fila de la lista muestra el valor tal cual venga.

**B — Los 120 caracteres son un número que el cliente no puede verificar.** Depende de cuánto crece el texto al cifrarse, y eso vive en el backend. Si el esquema de cifrado cambia, el tope puede quedarse corto —error `500` del driver— o largo sin que nadie lo note. **Mitigación:** el número va en una constante con nombre y con el razonamiento en comentario, no repetido en tres sitios, y el test lo fija; si el backend publica alguna vez el máximo real, se cambia en un solo lugar.

**C — El spec asume FE13a y FE13b implementados.** `InvestigationStep.tsx`, `features/investigation/api.ts` y `schemas.ts` no existen hoy: los crea FE13a y los amplía FE13b. Implementar FE13c antes obligaría a inventar esos tres archivos y a rehacerlos después. **Mitigación:** el orden `FE13a → FE13b → FE13c` es una precondición del spec, no una recomendación.

**D — El número de operación de los diez códigos no está cerrado en la documentación.** `CASE-PROCESS.md` los escribe como `INVCLIEV_00X_...`, con la `X` valiendo `001` al crear y `004` al actualizar. Si `errorMessages.ts` registra sólo una de las dos formas, la mitad de los errores caerá en el mensaje genérico. **Mitigación:** las entradas se registran para las dos operaciones desde el primer momento, y el test recorre la lista de los diez códigos en sus dos variantes.

**E — El reintento automático tras el `404` de la nieta puede chocar con una ficha ya creada.** La pantalla responde al `EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` creando la evaluación y reintentando el alta; si otra pestaña la creó entre medias, el `POST` de la madre responde error de fila existente. **Mitigación:** ese caso se trata como éxito —se relee la ficha y se reintenta el alta una sola vez—, igual que FE13a resolvió el `409` de `investigationSource`. Un segundo fallo no reintenta: se muestra el error.

**F — Detrás de `ESAVI-MEDDRA-006` hay una API de pago limitada a 60 peticiones por 15 minutos.** La lista de diagnósticos añade un segundo consumidor del buscador en el mismo expediente. **Mitigación:** se reutiliza `useMeddraSearch` tal cual, con su `staleTime` de 5 minutos y el mínimo de tres caracteres; no se declara un hook propio ni se baja el debounce.

---

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `src/shared/api/errorMessages.ts` | **Ya existe.** Diez códigos nuevos, cada uno en sus dos variantes de operación (§7.D). No se toca ninguno de los registrados |
| `src/locales/{es,en,nl}.json` | **Ya existen.** Claves nuevas bajo `investigation.*`; ninguna clave existente se renombra ni se borra |
| `scripts/syncContracts.mjs` | **Ya existe.** Tres entradas nuevas en el `SYNC_MAP` |
| `features/esaviCase/InvestigationStep.tsx` | **Lo crea FE13a.** Aquí monta tres secciones más y `useProgressiveSections` pasa de seis identificadores a nueve |
| `features/investigation/api.ts` y `schemas.ts` | **Los crea FE13a, los amplía FE13b.** Aquí crecen con tres entidades y tres schemas |

**Ninguna pantalla ya construida cambia de comportamiento.** El paso 5 sólo se alcanza desde el asistente, `shared/config/navigation.ts` no se toca, y ninguna primitiva de `shared/components/` se modifica — este spec es el primero del paso 5 que se construye entero con las trece de `ARCHITECTURE.md` §4.3 tal como están.

---

## Lo que **no** está en este spec

- **El resto del paso 5**: el acto de vacunación y la cadena de frío (FE13d), el error de administración y la investigación comunitaria (FE13e), y la sección H de notas.
- **El paso 6**, la clasificación final y el cierre del expediente (FE14).
- **Corregir la semilla de `evaluationInstitutionType`.** Es del otro repositorio (§7.A).
- **Bajar a USER las rutas `005A` de las dos listas.** Deuda de `CASE-PROCESS.md` §10; hasta entonces, sin botón de borrar.
- **La pantalla de auditoría del expediente**, `<AuditTrail>` sobre estas tres tablas incluido.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** Cuarto uso, misma decisión que FE13a y FE13b.

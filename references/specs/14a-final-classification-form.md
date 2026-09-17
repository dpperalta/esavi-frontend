# SPEC FE14a — Paso 6: el formulario de clasificación final

> **Estado:** Aprobado
> **Depende de:** SPEC FE08 (armazón del asistente, `CaseWizardActionBar`, `CaseWizardStepHandle`, sólo lectura si `CLOSED`), SPEC FE11 (`classification.isSeriousEvent`), SPEC FE12a (`notification.requestInvestigation`, borrador en `draftsStore` y su resolución de conflicto), SPEC FE13a (el `<Switch>` tri-estado de las fuentes), SPEC F41 del backend (CRUD de la clasificación final), SPEC F44 del backend (el avance de fase `ESAVI-CASEFLOW-012`)
> **Fecha:** 2026-09-12
> **Objetivo:** Sustituir el marcador de posición del paso 6 por el formulario del veredicto de causalidad —tres importancias y los bloques A, B, C y D— y hacer que el stepper sólo muestre los pasos 5 y 6 cuando el caso los requiere.

---

## 1. Por qué existe este spec

Es el formulario del paso 6 descrito en `CASE-PROCESS.md` §5.6, consumo de `ESAVI-FINCLASS-001/-004/-006` (SPEC F41 del backend). El cierre del expediente y su reapertura, que dependen de que esta fila exista, van en **SPEC FE14b**.

**A — El veredicto de causalidad no tiene pantalla.** El slug `final-classification` existe en `steps.ts` desde FE08, pero `CaseWizardPage` pinta un marcador de posición. Un caso grave, o uno investigado, no puede cerrarse sin esta fila (`CASE-PROCESS.md` §4.4). Hoy sólo se crea desde fuera de la interfaz.

**B — Crear la fila mueve el expediente, así que no se crea al entrar.** El `001` llama a `ESAVI-CASEFLOW-012` en su propia transacción. Sella `finalClassificationStartedAt`, cierra la etapa de investigación si seguía abierta y pasa el caso a `IN_FINAL_CLASSIFICATION`. FE13a crea su cabecera al entrar porque ahí la fila no tiene efectos laterales. Aquí sí los tiene: una visita de consulta sellaría el fin de una investigación todavía en curso. La fila nace con el primer «Guardar».

**C — Dos reglas entre columnas de la misma fila, y ningún `UNIQUE` puede expresarlas.**
- **Precedencia:** las tres `importance*` no repiten `catalogItemId`, y los `null` no compiten.
- **Bloque D:** `dIsUnclassifiable === true` prohíbe las otras **diez** columnas. La bandera no está en la lista, y `false` ofende igual que `true`.

El servidor comprueba primero la prohibición de D y después la precedencia. El formulario hace imposibles los dos estados: libera la posición repetida y limpia lo que D oculta.

**D — El stepper pinta seis pasos para todos los casos.** `CaseWizardStepper.tsx:113` sólo mira si el paso está desbloqueado (`isStepUnlocked` en `steps.ts`), nunca si el caso lo requiere. `CASE-PROCESS.md` §5.6 dice que el paso 6 sólo existe si `classification.isSeriousEvent === true` o `notification.requestInvestigation === true`, y el 5 sólo con `requestInvestigation`. Mostrarlos siempre invita a crear una clasificación final que el cierre no exige, y que además movería el estado del caso (B).

**E — `false` y `null` son la distinción que más pesa del expediente.** `aIsRelatedToStress: false` afirma que el bloque A se evaluó y se descartó; `null`, que no se evaluó. Este spec usa el mismo `<Switch>` de FE13a, que nace sin tocar (`null`) y sólo escribe `false` si se apaga a mano. En pantalla los dos estados se ven iguales; la diferencia se conserva en el dato. La decisión y su coste van en §6.

---

## 2. Alcance

**Dentro:**

- **`features/finalClassification/`** con su recurso sobre `ESAVI-FINCLASS-001/-004` y la lectura por caso `ESAVI-FINCLASS-006`, más la entrada `finalClassification` en el `SYNC_MAP` de `scripts/syncContracts.mjs`.
- **`FinalClassificationStep.tsx`** en `features/esaviCase/`, montado desde `CaseWizardPage` en lugar del marcador de posición del slug `final-classification`. Es un único formulario, sin revelado progresivo y sin botones por sección.
- **El orden y las etiquetas literales de `ESAVI-FORM.md`**, «Formulario de Clasificación Final», bloque por bloque:
  - Importancia A y después A1–A4.
  - Importancia B y después B1–B2.
  - Importancia C y después C.
  - D.
  - Al final, `notes`.
- **Tres `<CatalogSelect typeCode="finalClassificationImportance">`**, uno encima de cada bloque. Elegir una posición que ya tiene otro bloque deja ese otro selector en `null`. Bajo él aparece, con `aria-live`, «Esta posición pasó al bloque A»; el aviso se retira al volver a elegir.
- **Ocho `<Switch>` tri-estado**, el mismo control de las fuentes de FE13a: nacen en `null` y escriben `false` sólo si se apagan a mano.
- **El bloque D como compuerta de cierre.** Con `dIsUnclassifiable === true` se ocultan los bloques A, B y C y sus tres importancias. Sus diez columnas se envían como `null` explícito (`CASE-PROCESS.md` §7.3).
- **`notes` siempre visible**, con la etiqueta «Observaciones». Con D activo lleva un texto de ayuda que remite a la instrucción de D: especificar ahí la información que falta para clasificar.
- **La fila nace con el primer «Guardar».** Si `stages.finalClassification.exists === false` se hace `POST { caseId, ... }`; después, `PUT /:id`. El cliente **no** llama a `ESAVI-CASEFLOW-012`: lo hace el `001`. Tras el `POST` se invalida `['caseWorkflow','byCase',caseId]`.
- **El handle del paso en `CaseWizardActionBar`**, como en los pasos 3 y 4: «Guardar», «Completar etapa» y la lista de pendientes.
- **«Completar etapa» exige un veredicto:** `dIsUnclassifiable === true`, o al menos uno de los siete booleanos de A, B y C en `true`. Sin veredicto, la barra lo lista como pendiente en vez de apagar el botón en silencio.
- **Borrador contra el cierre accidental de la pestaña** en `draftsStore`, bajo la clave `'finalClassification'`. Mismo rebote y misma resolución de conflicto contra `updatedAt` que FE12a. Se borra en cuanto responde el `POST` o el `PUT`.
- **Mapeo de errores al campo o al aviso:**
  - `FINCLASS_00X_IMPORTANCE_DUPLICATED`, `_IMPORTANCE_NOT_FOUND`, `_UNCLASSIFIABLE_FIELDS_NOT_ALLOWED` y `_CASE_NOT_FOUND`.
  - `FINCLASS_001_CASE_ALREADY_FINAL_CLASSIFIED`: relee `['finalClassification','byCase',caseId]` y sigue con `PUT`, en vez de duplicar.
  - Los `CASEFLOW_012_*` que llegan dentro del `001`.
- **Sólo lectura con `CLOSED`** (FE08): campos deshabilitados y la barra sin «Guardar» ni «Completar etapa».
- **El stepper oculta los pasos que el caso no requiere:**
  - **Paso 5 visible** si `notification.requestInvestigation === true` **o** `stages.investigation.exists`.
  - **Paso 6 visible** si `classification.isSeriousEvent === true` **o** `requestInvestigation === true` **o** `stages.finalClassification.exists`.
  - Mientras cargan esas lecturas no se oculta nada.
  - `resolveResumeStep` salta los pasos ocultos, y una URL a un paso oculto redirige al paso de reanudación.

**Fuera de alcance (otros specs):**

- **Cerrar el expediente (`ESAVI-CASEFLOW-008`) y reabrirlo (`-009`, ADMIN)**, con sus cuatro precondiciones de §4.4 y las cinco incoherencias diferidas de §5.6. Todo eso es **SPEC FE14b**.
- **Pedir y resolver validación (`ESAVI-CASEFLOW-010`/`-011`).** Son acciones del expediente, no del paso 6. Van a la pantalla del expediente, como ya dejó dicho FE13e, y no a FE14b.
- **`ESAVI-FINCLASS-002A`/`-002B`/`-003`.** El asistente entra por el caso: el `006` resuelve la lectura en una llamada.
- **`ESAVI-FINCLASS-005A`/`-005B`/`-005C`.** La fila se limpia con `PUT` y no se borra. Además `005A` es ADMIN, `005B` SUPERADMIN y `005C` una purga física.
- **Un control de tres opciones Sí / No / Sin evaluar**, o volver a `null` un `<Switch>` ya tocado. Se descartó a favor del `<Switch>` de FE13a (§6).
- **Comprobar `CLOSED` en `ESAVI-FINCLASS-004` desde el backend.** Ya está pedido en `CASE-PROCESS.md` §10.3. Aquí la regla sigue siendo del cliente.
- **Los pasos 5 que faltan (FE13b–e).** El paso 6 se desbloquea con `notification.exists` (FE08 §6) y no pasa por el 5.
- **`<AuditTrail>` sobre `finalClassification`.** Es un spec de la pantalla de auditoría.
- **Rediseñar el stepper** más allá de ocultar pasos: agrupación, iconos y textos siguen como en FE08.

---

## 3. Diseño

### 3.1 Pantallas y archivos

No hay ruta nueva. El paso vive en `/esavi-cases/:id/wizard/final-classification`, que ya existe desde FE08, bajo el guard del asistente (`<RequireRole level={USER}>`). `shared/config/navigation.ts` **no cambia**.

| Archivo | Cambio |
|---|---|
| `scripts/syncContracts.mjs` | **Modificado.** Entrada `finalClassification` en el `SYNC_MAP` |
| `contracts/finalClassification.ts` | **Nuevo, sincronizado.** `CreateFinalClassificationInput` |
| `contracts/declared/finalClassification.ts` | **Nuevo.** `FinalClassificationDetail`, reconciliado contra `finalClassification.service.ts` |
| `features/finalClassification/api.ts` | **Nuevo.** `finalClassificationResource`, `finalClassificationByCaseKey` y `useFinalClassificationByCase` |
| `features/finalClassification/schemas.ts` | **Nuevo.** `finalClassificationSaveSchema`, los predicados de precedencia y de D, y `hasVerdict` |
| `features/finalClassification/ImportanceSelect.tsx` | **Nuevo.** Un `<CatalogSelect>` con el aviso «Esta posición pasó al bloque X». Es local: sólo tiene tres usos, los tres en este archivo de pantalla |
| `features/esaviCase/FinalClassificationStep.tsx` | **Nuevo.** El formulario, el handle del paso y el borrador |
| `features/esaviCase/CaseWizardPage.tsx` | **Modificado.** Monta el paso y deja de redirigir a un paso no requerido |
| `features/esaviCase/steps.ts` | **Modificado.** `isStepRequired(slug, stages, flags)`; `resolveResumeStep` recibe `flags` |
| `features/esaviCase/CaseWizardStepper.tsx` | **Modificado.** Lee las dos banderas y no pinta los pasos no requeridos |
| `locales/{es,en,nl}.json` | **Modificado.** Claves de §3.8 |

**Ninguna primitiva nueva de `shared/`.** `<CatalogSelect>` y el `<Switch>` de shadcn bastan.

### 3.2 Endpoints consumidos

```
POST   /api/final-classifications            ESAVI-FINCLASS-001  USER  alta; avanza el workflow en su transacción
PUT    /api/final-classifications/:id        ESAVI-FINCLASS-004  USER  corrección; objeto completo
GET    /api/final-classifications/case/:id   ESAVI-FINCLASS-006  USER  lectura por caso
GET    /api/case-workflows/case/:id          ESAVI-CASEFLOW-006  USER  ya consumido (FE08): `stages.finalClassification`
GET    /api/classifications/case/:id         ESAVI-CLASSIF-006   USER  ya consumido (FE11): `isSeriousEvent`, para el stepper
GET    /api/notifications/case/:id           ESAVI-NOTIFCN-006   USER  ya consumido (FE12a): `requestInvestigation`, para el stepper
```

Las tres importancias usan las lecturas de catálogo que `<CatalogSelect>` ya hace, con `typeCode="finalClassificationImportance"`.

**No se consumen:**
- **`ESAVI-CASEFLOW-012`.** No tiene ruta HTTP, y lo invoca el `001`.
- **`FINCLASS-002A`/`-002B`/`-003`.** El asistente entra por el caso.
- **`FINCLASS-005A`/`-005B`/`-005C`.** Se limpia con `PUT` (§2).
- **`CASEFLOW-008`/`-009`.** Son SPEC FE14b.

### 3.3 Tipos del contrato

```ts
// contracts/finalClassification.ts — espejo de esavi-backend/src/types/finalClassification/
export interface CreateFinalClassificationInput {
  caseId: string;
  importanceAItemId?: string | null;  // … B, C
  aIsRelatedToVaccineProduct?: boolean | null;  // … los ocho booleanos
  notes?: string | null;
}

// contracts/declared/finalClassification.ts — forma de toFinalClassificationResponse
export interface FinalClassificationDetail {
  finalClassificationId: string;
  case: { caseId: string; caseCode: string; isActive: boolean };
  importanceA: CatalogItemRef | null;  // { catalogItemId, code, name, value } — ídem B, C
  aIsRelatedToVaccineProduct: boolean | null;  // … los ocho, devueltos tal cual, null incluido
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  appDetails: AppDetail[];
}
```

**La respuesta no trae `caseId` ni las tres `importance*ItemId` crudas.** El servicio las borra y devuelve los objetos resueltos. El formulario deriva `importanceAItemId` de `importanceA?.catalogItemId` en un único punto de mapeo, y **nunca reenvía los objetos** en el `PUT`. El update usa `Partial<CreateFinalClassificationInput>` y el cliente no envía `caseId`, porque el `004` lo ignora. En el paso 1 del plan se comprueba campo a campo contra el modelo que `isActive`, `deletedAt` y `appDetails` existen en la respuesta.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Existe la fila | TanStack Query | `['caseWorkflow','byCase',caseId]` → `stages.finalClassification.exists` | Decide `POST` o `PUT`. Se invalida tras el `POST` |
| Clasificación final | TanStack Query | `['finalClassification','byCase',caseId]` | `enabled` sólo con `exists`. Sin `staleTime`; se invalida tras `001`/`004` |
| `isSeriousEvent` | TanStack Query | `['classification','byCase',caseId]` | Misma clave que FE11, así que la caché se comparte. `enabled` con `stages.classification.exists` |
| `requestInvestigation` | TanStack Query | `['notification','byCase',caseId]` | Misma clave que FE12a. `enabled` con `stages.notification.exists` |
| Ítems de importancia | TanStack Query | La clave de `<CatalogSelect>` para `finalClassificationImportance` | Catálogo: `staleTime` del recurso de catálogo |
| Valores editables | React Hook Form | `useForm<FinalClassificationFormValues>` | La «copia editable» es el formulario, no un `useState` |
| Aviso «esta posición pasó al bloque X» | Componente | `useState` en `FinalClassificationStep` | Efímero. Se retira al volver a elegir en ese selector |
| Borrador | Zustand | `drafts[caseId]['finalClassification']` con `baseUpdatedAt` | Rebote de 500 ms. Se borra al responder `001`/`004` |
| Qué pasos requiere el caso | Derivado en render | `isStepRequired(slug, stages, flags)` | **No se guarda en ningún sitio**: sale de las dos lecturas y de `stages` |

**Qué invalida qué:**
- **`001`:** `['finalClassification','byCase',caseId]` y `['caseWorkflow','byCase',caseId]`. El estado del caso y los sellos de fase acaban de cambiar.
- **`004`:** `['finalClassification','byCase',caseId]`.
- Ninguno toca la clasificación ni la notificación.

**`flags` mientras cargan.** Si la lectura está habilitada y todavía pendiente, `flags` vale `null` e `isStepRequired` devuelve `true`: no se oculta nada. Una lectura deshabilitada porque la etapa no existe **no** está pendiente. Su bandera cuenta como `null`, y `null` es «no grave» o «sin investigación» (§4.4).

### 3.5 Formularios y validación

**Formulario del paso** — `features/finalClassification/schemas.ts`, `finalClassificationSaveSchema`. Guardar sólo exige `caseId`, que viene del contexto y no es un campo: **ningún control bloquea el guardado**.

| Campo | Control | Visible | Regla |
|---|---|---|---|
| `importanceAItemId` | `<ImportanceSelect>` | `dIsUnclassifiable !== true` | Posición no repetida con B ni C |
| `aIsRelatedToVaccineProduct` … `aIsRelatedToStress` | 4 × `<Switch>` | Ídem | Tri-estado |
| `importanceBItemId` | `<ImportanceSelect>` | Ídem | Ídem |
| `bIsConsistentTemporalRelation`, `bHasDeterminantFactor` | 2 × `<Switch>` | Ídem | Tri-estado |
| `importanceCItemId` | `<ImportanceSelect>` | Ídem | Ídem |
| `cHasCoincidentCause` | `<Switch>` | Ídem | Tri-estado |
| `dIsUnclassifiable` | `<Switch>` | Siempre | Encenderlo limpia las diez columnas a `null` en ese mismo instante |
| `notes` | `<Textarea>` | Siempre | Sin longitud máxima. Con D encendido, texto de ayuda |

**La precedencia, en el cliente.** Al elegir en un selector una posición que tiene otro bloque:
1. El otro pasa a `null` con `shouldDirty`.
2. Bajo el otro aparece el aviso.

El formulario nunca llega a tener dos importancias iguales. Aun así, el schema conserva el `superRefine` de precedencia como red, anclado en las importancias repetidas.

**El bloque D, en el cliente.** Encender D pone a `null` las diez columnas y las oculta. Apagarlo vuelve a mostrar los bloques vacíos: **no restaura** lo que había. Es la misma dirección que el forzado del `004` en el servidor. El `superRefine` de D rechaza cualquiera de las diez distinta de `null` con D en `true`, y ancla el error en `dIsUnclassifiable`.

**«Completar etapa».** `hasVerdict(values)` devuelve `true` si `dIsUnclassifiable === true` o si alguno de los siete booleanos de A, B y C es `true`. Si no, `getPendingFields()` devuelve `finalClassification.pending.verdict`. No hay un segundo schema.

**Errores del servidor:**

| `code` | Destino |
|---|---|
| `FINCLASS_00X_UNCLASSIFIABLE_FIELDS_NOT_ALLOWED` | Error en `dIsUnclassifiable` |
| `FINCLASS_00X_IMPORTANCE_DUPLICATED` | Error en las importancias con valor |
| `FINCLASS_00X_IMPORTANCE_NOT_FOUND` | Error en las importancias con valor e invalidación del catálogo. El bloque va dentro del `message`, que no se parsea |
| `FINCLASS_001_CASE_ALREADY_FINAL_CLASSIFIED` | Relee `['finalClassification','byCase',caseId]` e invalida el workflow. El siguiente «Guardar» es `PUT` |
| `CASEFLOW_012_CASE_CLOSED` | Invalida el workflow, así que el asistente pasa a sólo lectura, y muestra un aviso por `code` |
| `FINCLASS_00X_CASE_NOT_FOUND`, `CASEFLOW_012_NOT_FOUND`, `CASEFLOW_012_ADVANCE_FAILED` y el resto | Aviso por `getErrorMessage` |

Los códigos con número de operación desconocido para esta pantalla (`00X`) se comparan por sufijo, como en FE13a.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de cuatro bloques mientras el workflow o el `006` cargan | — |
| Sin fila todavía (`exists === false`) | El formulario vacío, con los ocho `<Switch>` en `null`. **No es un estado vacío**: es el alta | — |
| Error del `006` | Mensaje por `code` y botón «Reintentar». Nunca el formulario a medias | `finalClassification.error.loadFailed` |
| Fila desactivada (`exists === true` y `FINCLASS_006_NOT_FOUND`) | Aviso sin formulario: la clasificación final está desactivada y sólo un superadministrador puede reactivarla. Un `POST` daría `409`: el `UNIQUE` no mira `isActive` | `finalClassification.error.inactive` |
| `CLOSED` | Formulario completo en sólo lectura y el banner de FE08 | — |
| Sin permiso | No se llega: las seis rutas son `USER` y el asistente ya exige `USER` | — |
| Paso no requerido | No se llega: el stepper no lo pinta y la URL redirige al paso de reanudación | — |

### 3.7 Responsividad y accesibilidad

- **Una columna en todos los anchos.** Los cuatro bloques son tarjetas con borde, con su selector de importancia arriba.
- Por debajo de `md`, las etiquetas largas de B1 o de D envuelven. El `<Switch>` queda alineado arriba, no centrado con el párrafo.
- **Objetivos táctiles de 44 px** en cada fila de `<Switch>`: la etiqueta entera es pulsable.
- **Cada bloque es un `<fieldset>` con su `<legend>`**, que es el título literal de `ESAVI-FORM.md`.
- Dos cosas aparecen por un cambio en otro control y van en `aria-live="polite"`: los bloques que D oculta y el aviso de posición liberada.
- Con `CLOSED`, cada control deshabilitado apunta con `aria-describedby` al banner de FE08, que dice por qué.
- **Sin literales de color:** sólo tokens.

### 3.8 Claves i18n nuevas

Los textos en español salen literalmente de `ESAVI-FORM.md`, salvo los marcados como propios.

| Clave | Uso |
|---|---|
| `finalClassification.title` | Título del paso |
| `finalClassification.blockA.legend` | «Orden A: Importancia» |
| `finalClassification.blockA.importance` | «Importancia A» |
| `finalClassification.blockA.vaccineTitle` | «Importancia A: Con asociación causal congruente con la vacuna» |
| `finalClassification.blockA.processTitle` | «A. Con asociación causal congruente con el proceso de vacunación» |
| `finalClassification.fields.aIsRelatedToVaccineProduct` | A1 |
| `finalClassification.fields.aIsRelatedToQualityDeviation` | A2 |
| `finalClassification.fields.aIsRelatedToProgrammaticError` | A3 |
| `finalClassification.fields.aIsRelatedToStress` | A4 |
| `finalClassification.blockB.legend` | «Orden B: Importancia» |
| `finalClassification.blockB.importance` | «Importancia B» |
| `finalClassification.blockB.title` | «Indeterminado» |
| `finalClassification.fields.bIsConsistentTemporalRelation` | B1 |
| `finalClassification.fields.bHasDeterminantFactor` | B2 |
| `finalClassification.blockC.legend` | «Orden C: Importancia» |
| `finalClassification.blockC.importance` | «Importancia C» |
| `finalClassification.blockC.title` | «Sin asociación causal congruente con la vacuna o el proceso de vacunación» |
| `finalClassification.fields.cHasCoincidentCause` | C |
| `finalClassification.blockD.legend` | «Orden D: No clasificable» |
| `finalClassification.fields.dIsUnclassifiable` | D, texto literal |
| `finalClassification.fields.notes` | «Observaciones» *(propio)* |
| `finalClassification.help.notesUnclassifiable` | Ayuda de `notes` con D encendido *(propio)* |
| `finalClassification.importance.released` | «Esta posición pasó al bloque {{block}}» *(propio)* |
| `finalClassification.pending.verdict` | Pendiente de «Completar etapa» *(propio)* |
| `finalClassification.error.importanceDuplicated` | Error de precedencia del schema *(propio)* |
| `finalClassification.error.unclassifiableFieldsNotAllowed` | Error de D del schema *(propio)* |
| `finalClassification.error.loadFailed` | Error del `006` *(propio)* |
| `finalClassification.error.inactive` | Fila desactivada *(propio)* |
| `finalClassification.draft.restored` / `.discarded` | Mismo texto que `notification.draft.*` |

---

## 4. Plan de implementación

Diez pasos. Cada uno deja el repositorio compilando y con sus tests en verde. El cierre de cada paso es `npx tsc --noEmit -p tsconfig.app.json` más los tests de los archivos tocados.

**1. Los contratos.** Entrada `finalClassification` en el `SYNC_MAP` de `scripts/syncContracts.mjs` y `npm run contracts:sync`. Después, `contracts/declared/finalClassification.ts`, reconciliado campo a campo contra `toFinalClassificationResponse`, `DETAIL_INCLUDE` y `DETAIL_EXCLUDE` del servicio.
*Verificación:* el archivo sincronizado aparece sin editar a mano. `FinalClassificationDetail` no declara `caseId` ni las tres `importance*ItemId`. Cada campo cita su origen en el comentario de cabecera.

**2. La capa de API.** `features/finalClassification/api.ts`:
- `finalClassificationResource`, sobre `001`/`004`.
- `finalClassificationByCaseKey`.
- `useFinalClassificationByCase(caseId, enabled)`, sobre el `006`.

Cada uno cita su código `ESAVI-*`. El `POST` invalida también `['caseWorkflow','byCase',caseId]`.
*Verificación:* tests con MSW.
- Con `enabled: false` no sale el `GET`.
- Tras el `POST` se invalidan las dos claves.
- El `PUT` va a `/:finalClassificationId`.
- `FINCLASS_006_NOT_FOUND` llega al llamador como error con ese `code`, sin tragárselo.

**3. Los schemas.** `features/finalClassification/schemas.ts`:
- `finalClassificationSaveSchema`, con los dos `superRefine`: prohibición de D y precedencia.
- `hasVerdict`.
- El mapeo `toFormValues(detail)`, de objetos resueltos a ids.
*Verificación:* tests de tabla.
- `A=1, B=2, C=null` valida; `A=1, B=1` no.
- Tres importancias en `null` validan.
- D en `true` con un `false` en A no valida; con los diez en `null`, sí.
- `hasVerdict` es `false` con todo en `null` o todo en `false`, y `true` con D o con un solo `true`.
- `toFormValues` nunca devuelve un objeto en una clave.

**4. `isStepRequired` y el paso de reanudación.** En `steps.ts`, `isStepRequired(slug, stages, flags)` con las tres condiciones de §2 y la regla de carga de §3.4. `resolveResumeStep(stages, flags)` salta los pasos no requeridos.
*Verificación:* tests de tabla.
- Caso no grave y sin investigación: no requiere ni el 5 ni el 6.
- Grave sin investigación: requiere el 6 y no el 5.
- No grave con `requestInvestigation`: requiere los dos.
- Con `stages.finalClassification.exists`, el 6 se requiere aunque las dos banderas sean `false`.
- Con `flags === null`, todo se requiere.
- La reanudación nunca devuelve un paso no requerido.

**5. El stepper y la redirección.** `CaseWizardStepper.tsx` lee `useClassificationByCase` y `useNotificationByCase`, habilitadas por `stages`, y no pinta los pasos no requeridos. `CaseWizardPage.tsx` redirige una URL a un paso no requerido, pero sólo con `flags` ya resueltos.
*Verificación:* test de integración.
- Un caso no grave sin investigación no muestra los pasos 5 y 6.
- Entrar a `/wizard/final-classification` en ese caso redirige al paso de reanudación.
- Mientras la clasificación carga, el stepper muestra los seis pasos y no redirige.

**6. `<ImportanceSelect>`.** `features/finalClassification/ImportanceSelect.tsx`: `<CatalogSelect typeCode="finalClassificationImportance">` con su etiqueta y el aviso de posición liberada en `aria-live`.
*Verificación:* test.
- Pinta los tres ítems del catálogo.
- Con `releasedTo` informado muestra «Esta posición pasó al bloque A».
- Elegir un valor emite su `catalogItemId`.
- `disabled` no admite interacción.

**7. El formulario del paso.** `features/esaviCase/FinalClassificationStep.tsx`, montado desde `CaseWizardPage` para el slug `final-classification`:
- Los cuatro bloques en el orden y con las etiquetas de `ESAVI-FORM.md`.
- La liberación de posición y la compuerta D con su limpieza.
- `notes` con su ayuda bajo D.
- Los estados de §3.6.
*Verificación:* test.
- Elegir en B la posición de A deja A en `null` con el aviso.
- Encender D oculta A, B y C y deja sus diez valores en `null`; apagarlo no los restaura.
- Un `<Switch>` sin tocar sale como `null` y apagado a mano como `false`.
- Con `exists === true` y `FINCLASS_006_NOT_FOUND` no se pinta el formulario.

**8. Guardar, completar y los errores.** El handle en `CaseWizardActionBar`, registrado con referencias como en FE12a §4 paso 10:
- `save` hace `POST` o `PUT` según `exists`.
- `isDirty`.
- `getPendingFields` con `hasVerdict`.

Además, el mapeo de errores de §3.5.
*Verificación:* test.
- Con `exists === false`, el primer «Guardar» dispara un solo `POST` y el siguiente un `PUT`.
- **Entrar al paso sin tocar nada no dispara ningún `POST`.**
- «Completar etapa» sin veredicto lista el pendiente.
- `CASE_ALREADY_FINAL_CLASSIFIED` relee y el siguiente guardado es `PUT`.
- `IMPORTANCE_DUPLICATED` queda anclado en las importancias.
- `CASEFLOW_012_CASE_CLOSED` deja el asistente en sólo lectura.

**9. El borrador.** `draftsStore` bajo `'finalClassification'`, con el rebote y la resolución de conflicto de FE12a. Se borra al responder `001`/`004`.
*Verificación:* test.
- Un borrador con `baseUpdatedAt` distinto del `updatedAt` de la fila se descarta con aviso.
- Uno coincidente se restaura y precarga un `<Switch>`.
- Tras un `PUT` correcto el borrador ya no existe.

**10. i18n.** Las claves de §3.8 en `es.json`, `en.json` y `nl.json`, con el texto literal de `ESAVI-FORM.md` como origen del español.
*Verificación:*
- `npm run i18n:check` sale en 0.
- Ningún literal en los componentes nuevos.
- Las etiquetas de B1 y de D aparecen completas, sin recortar.

---

## 5. Criterios de aceptación

- [ ] Entrar al paso 6 de un caso sin clasificación final **no dispara ningún** `ESAVI-FINCLASS-001`. El primer «Guardar» dispara **uno**, y los siguientes van a `ESAVI-FINCLASS-004`.
- [ ] Tras el `001`, `['caseWorkflow','byCase',caseId]` se invalida y el stepper refleja el paso 6 como iniciado sin recargar. El cliente no llama a ningún otro endpoint del workflow.
- [ ] Un `409 FINCLASS_001_CASE_ALREADY_FINAL_CLASSIFIED` relee la fila y el siguiente «Guardar» es un `PUT`, no un segundo `POST`.
- [ ] Ningún cuerpo de `001`/`004` lleva `importanceA`, `importanceB`, `importanceC` ni `case` como objeto. Las tres importancias viajan como `catalogItemId`.
- [ ] Elegir en un bloque la posición que tiene otro deja ese otro selector en `null` y muestra «Esta posición pasó al bloque X». El formulario nunca envía dos importancias iguales.
- [ ] Encender D oculta los bloques A, B y C, y el cuerpo siguiente lleva sus diez columnas en `null`. Apagarlo no restaura los valores anteriores.
- [ ] Un `<Switch>` sin tocar viaja como `null`; apagado a mano, como `false`. Los dos estados se distinguen al releer la fila.
- [ ] `notes` es visible con D encendido y con D apagado. Con D encendido lleva su texto de ayuda.
- [ ] «Completar etapa» sin veredicto lista `finalClassification.pending.verdict` en la barra. Con D encendido, o con un solo booleano de A, B o C en `true`, no lista nada.
- [ ] `FINCLASS_00X_IMPORTANCE_DUPLICATED` y `_UNCLASSIFIABLE_FIELDS_NOT_ALLOWED` quedan anclados en su campo, no en un aviso genérico.
- [ ] Con `CLOSED`, todos los controles están deshabilitados y la barra no ofrece «Guardar» ni «Completar etapa».
- [ ] Un caso con `isSeriousEvent !== true` y `requestInvestigation !== true` no muestra los pasos 5 ni 6 en el stepper, y `/wizard/final-classification` redirige al paso de reanudación.
- [ ] Un caso grave sin investigación muestra el paso 6 y no el 5.
- [ ] Un caso cuya fila de clasificación final ya existe muestra el paso 6 aunque las dos banderas hayan pasado a `false`.
- [ ] Mientras la clasificación o la notificación cargan, el stepper no oculta ningún paso y la página no redirige.
- [ ] Con `exists === true` y `FINCLASS_006_NOT_FOUND`, no se pinta el formulario y aparece `finalClassification.error.inactive`.
- [ ] Un borrador con `baseUpdatedAt` distinto del `updatedAt` de la fila se descarta con aviso. Tras un guardado correcto, `drafts[caseId]['finalClassification']` no existe.
- [ ] `grep -rn "complete-stage\|advance" src/features/finalClassification/` no devuelve resultados.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no añade errores en los archivos tocados.

**Bloque de cierre — se verifica a mano:**

- [ ] **Tema oscuro.** Los cuatro bloques, el aviso de posición liberada y la ayuda de `notes` se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/finalClassification/ src/features/esaviCase/FinalClassificationStep.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** A 375 px no hay scroll horizontal. Las etiquetas de B1 y de D envuelven sin cortarse, y cada fila de `<Switch>` mide al menos 44 px de alto.
- [ ] **Rol bajo.** Con `USER` el paso completo funciona de punta a punta, porque las seis rutas de §3.2 son `USER`. Ningún `403` aparece en el recorrido normal.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos `aria-label` y los avisos. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** La fila, la clasificación y la notificación viven en TanStack Query. Los valores editables viven en el `useForm`. Los pasos requeridos se derivan en render y no se guardan. `drafts` sólo guarda valores del formulario y se borra al responder el guardado.

---

## 6. Decisiones tomadas y descartadas

- **Sí: FE14 se parte en dos.** FE14a es el formulario del paso 6. FE14b es cerrar (`008`) y reabrir (`009`), con las cuatro precondiciones de §4.4 y las cinco incoherencias de §5.6. Tienen naturalezas distintas. El formulario escribe una fila; el cierre la lee junto con otras nueve tablas y decide qué bloquea y qué avisa. Además, el cierre tiene que alcanzarse también desde casos que **no** tienen paso 6.
- **No: meter la validación (`010`/`011`) en FE14b.** Es una acción del expediente, no del cierre. Va a la pantalla del expediente, como ya dejó dicho FE13e.
- **Sí: la fila nace con el primer «Guardar», no al entrar al paso.** El `001` avanza el workflow, sella el fin de la investigación si seguía abierta y mueve el caso a `IN_FINAL_CLASSIFICATION`. *Descartado:* crearla al entrar, como la cabecera de FE13a. Allí la fila no tiene efectos laterales; aquí una visita de consulta cambiaría el estado del expediente.
- **Sí: un `<Switch>` tri-estado, el mismo de FE13a.** Es la decisión del usuario, y conserva un único control para los booleanos tri-estado del paso 5 y del 6. **Coste asumido:** en pantalla, `null` («no se evaluó») y `false` («se evaluó y se descartó») se ven iguales. Un `<Switch>` ya tocado no vuelve a `null`. La diferencia se conserva en el dato y en el cuerpo del guardado, no a la vista. *Descartados:*
  - Un control de tres opciones Sí / No / Sin evaluar, el único que muestra y deshace el `null`.
  - El `RadioGroup` Sí/No de FE11.
- **Sí: un selector de importancia encima de cada bloque, que libera la posición repetida.** Respeta el orden y las etiquetas literales de `ESAVI-FORM.md`, y cumple la regla de precedencia sin que el `PUT` falle. *Descartado:* un control único de ordenación A/B/C antes de los bloques. `CASE-PROCESS.md` §5.6 lo sugiere («es un orden»), pero se aparta del formulario oficial.
- **No: deshabilitar en cada selector las posiciones ocupadas.** Obligaría a vaciar un bloque antes de poder reasignar su posición: dos gestos para un cambio de orden.
- **Sí: apagar D no restaura lo que había.** Los valores se limpiaron al encenderlo y ya salieron como `null` si hubo un guardado entre medias. Restaurarlos desde memoria haría que el formulario mostrara un veredicto que la base ya no tiene.
- **Sí: «Completar etapa» exige un veredicto**: D encendido, o al menos un `true` en A, B o C. *Descartados:*
  - No exigir nada: se podría «terminar» una clasificación sin veredicto.
  - Exigir además las importancias de los bloques con algún `true`: obliga a ordenar bloques que el clasificador quizá no puede comparar.
- **Sí: `notes` siempre visible, con ayuda bajo D.** La etiqueta literal de D pide «especificar la información adicional requerida», y `notes` es la única columna de texto. *Descartado:* mostrar `notes` sólo con D encendido. El backend no las ata, y un texto escrito con D apagado se perdería de la vista.
- **Sí: el stepper oculta los pasos 5 y 6 cuando el caso no los requiere.** Es la regla de `CASE-PROCESS.md` §5.6, y evita crear una clasificación final que el cierre no pide y que movería el estado del caso. *Descartados:*
  - Mostrar el paso 6 siempre, con un aviso de «no requerido».
  - Dejarlo para un spec del armazón.
- **Sí: un paso con fila ya creada sigue visible aunque las banderas cambien.** Ocultarlo dejaría datos guardados sin forma de verlos ni corregirlos desde el asistente.
- **Sí: mientras cargan las dos lecturas no se oculta nada.** Ocultar primero y mostrar después haría parpadear el stepper en cada entrada al asistente.
- **Sí: un único formulario con handle en `CaseWizardActionBar`, sin revelado progresivo.** Son 13 columnas en cuatro bloques cortos, más cerca del paso 3 que del 5. *Descartado:* `useProgressiveSections` con un botón por bloque. El veredicto se lee entero, y un bloque escondido hasta pulsar esconde precisamente la comparación que el clasificador tiene que hacer.
- **Sí: `<ImportanceSelect>` es local a `features/finalClassification/`.** Tiene tres usos, los tres en la misma pantalla. No es una primitiva: `ARCHITECTURE.md` §4.3 exige más de una pantalla.

---

## 7. Riesgos identificados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **El stepper añade dos lecturas a cada entrada al asistente.** Clasificación y notificación se piden aunque el paso activo no las use | Comparten clave con FE11 y FE12a, así que en una reanudación normal ya están en caché. Sólo se piden si su etapa existe. El test del paso 5 del plan cuenta las peticiones |
| 2 | **Una lectura que falla deja el stepper sin banderas** y, por la regla de carga, mostrando los seis pasos | Es el fallo seguro: mostrar de más no pierde datos. El paso 6 sigue gobernado por su propio `exists`. El error de la lectura lo pinta el paso que la necesita, no el stepper |
| 3 | **Cambiar la gravedad o `requestInvestigation` con el usuario en el paso 6** lo deja en un paso que ya no se requiere | Si la fila existe, el paso sigue siendo requerido. Si no existe, la redirección sólo actúa al cambiar de paso o al recargar, nunca a mitad de edición |
| 4 | **Un `<Switch>` apagado a mano se lee como «no evaluado»**, porque en pantalla `false` y `null` son iguales (§6) | Es el coste asumido. El test del paso 7 comprueba que el cuerpo distingue los dos. La vista de sólo lectura de FE14b puede mostrar la diferencia sin tocar este control |
| 5 | **El catálogo `finalClassificationImportance` sin sembrar** deja los tres selectores vacíos sin explicación | `<CatalogSelect>` pinta su estado vacío. El guardado sigue funcionando, porque las importancias no bloquean. Un `IMPORTANCE_NOT_FOUND` se ancla en su campo e invalida el catálogo |
| 6 | **El `004` fuerza a `null` las diez columnas si D resulta `true`**, aunque el cliente no las envíe | El cliente ya las envía en `null`, así que el forzado del servidor y la limpieza del cliente llegan al mismo destino. No hay estado que reconciliar tras la respuesta |
| 7 | **Un `409` del `012` llega con código `CASEFLOW`, no `FINCLASS`**, y un mapeo que sólo mire `FINCLASS_*` lo trataría como error genérico | §3.5 mapea los `CASEFLOW_012_*` explícitamente, y el test del paso 8 cubre `CASE_CLOSED` |
| 8 | **Una fila desactivada deja el paso sin salida para un USER.** `exists` es `true`, el `006` da `404` y el `POST` daría `409` (`CASE-PROCESS.md` §6.2) | Estado propio en §3.6, con el motivo y el rol que puede resolverlo, en vez de un formulario que falla al guardar |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes | Después |
|---|---|---|
| `CaseWizardStepper.tsx` | Pinta los seis pasos a todos los casos, bloqueados o no según `isStepUnlocked` | Oculta los pasos 5 y 6 si el caso no los requiere. Mientras cargan las banderas pinta los seis, como hoy |
| `steps.ts` | `resolveResumeStep(stages)` | `resolveResumeStep(stages, flags)`, que salta los pasos no requeridos. Se añade `isStepRequired`. `isStepUnlocked` no cambia |
| `CaseWizardPage.tsx` | Marcador de posición para `final-classification`. Redirige sólo pasos inválidos o bloqueados | Monta `FinalClassificationStep`. También redirige los pasos no requeridos, con `flags` resueltos |
| `CaseWizardStepper.test.tsx`, `CaseWizardPage.test.tsx` y `steps.test.ts` | Asumen seis pasos siempre visibles | Se ajustan los mocks: clasificación y notificación con banderas que requieren los dos pasos, para que los tests existentes sigan viendo seis. Se añaden los casos de ocultación del paso 5 del plan |
| `InvestigationStep.tsx` y los pasos 3 y 4 | — | **No cambian.** El paso 5 sigue desbloqueándose con `notification.exists`: ocultarlo no es bloquearlo |

**Consecuencia para FE13b–e:** heredan el paso 5 condicionado a `requestInvestigation` o a `stages.investigation.exists`. No les exige nada, pero sus tests de integración tienen que mockear una notificación con `requestInvestigation: true`.

---

## Lo que **no** está en este spec

- Cerrar el expediente (`ESAVI-CASEFLOW-008`) y reabrirlo (`-009`), con las cuatro precondiciones y las cinco incoherencias diferidas — **SPEC FE14b**.
- Pedir y resolver validación (`ESAVI-CASEFLOW-010`/`-011`) — la pantalla del expediente.
- Desactivar, reactivar o purgar la clasificación final (`ESAVI-FINCLASS-005A`/`-005B`/`-005C`).
- Un control tri-estado de tres opciones, o devolver un `<Switch>` a `null`.
- La comprobación de `CLOSED` en `ESAVI-FINCLASS-004` desde el backend (`CASE-PROCESS.md` §10.3).
- Los pasos 5 que faltan (FE13b–e).
- `<AuditTrail>` sobre `finalClassification`.
- Cualquier rediseño del stepper más allá de ocultar los pasos no requeridos.

Cada uno de esos, si aterriza, va en su propio spec.

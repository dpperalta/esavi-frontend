# SPEC FE12d — Paso 4: embarazo y complicaciones

> **Estado:** Borrador
> **Depende de:** SPEC FE08 (armazón del wizard), SPEC FE10 (paciente y apertura del caso — de ahí salen `sexItemId`, `birthDate` y `eventDate`, y este spec les añade un bloqueo), SPEC FE11 (la edad calculada por el backend, que la compuerta lee y no recalcula), SPEC FE12a (la cabecera y la rama — sin su fila no hay `notificationId`, y de ella sale `hasPregnancyComplications`, que este spec convierte en derivado; también la compuerta de §7.4 y `useCatalogItemsByTypeCode`), SPEC FE12b (de ahí salen `<SatelliteList>` y `<MeddraSearchField>`, que este spec consume sin volver a escribirlas). Del backend: SPEC F25 (notificationPregnancy), SPEC F27 (notificationPregnancyComplication), SPEC F15 (diagnosticTerm y su resolución), SPEC F55 (búsqueda de términos MedDRA) y SPEC F26 (systemConfig).
> **Fecha:** 2026-09-05
> **Objetivo:** El bloque de embarazo del paso 4 —formulario 1:1 y su lista anidada de complicaciones— detrás de la compuerta de §7.4, con el rango de Naegele y las dos declaraciones de complicaciones derivadas de las filas.

---

## 1. Por qué existe este spec

**Es el último de los tres specs en que se partió el paso 4** (`CASE-PROCESS.md` §9, decidido el 2026-09-04). El corte es `FE12b` (eventos y medicación) → `FE12c` (vacunas y diluyentes) → **`FE12d`**, y va al final por un motivo concreto: **es el único bloqueado además por datos**. Sin la fila `systemConfig` `PREGNANCY_FEMALE_SEX_ITEM` (§10.6), `ESAVI-NOTIFPRG-001` responde `500` en cada intento y el bloque entero es inservible. Aislarlo impide que ese bloqueo arrastre a los otros dos.

**Es el lado cliente de dos specs del backend** —SPEC F25 y SPEC F27— y de tres reglas que no viven en ninguno de los dos:

- **La compuerta de §7.4.** Ningún paciente varón ve un campo de embarazo, y la sección no existe para él: no es una opción «no aplica» dentro del formulario. FE12a ya la aplicó a las dos columnas de la rama grave; este spec la extiende a las dieciséis columnas restantes y **cierra su reverso**, que hasta hoy no tenía dueño (abajo).
- **La derivación de §6.5.** Las complicaciones del embarazo se declaran en **tres sitios** del paso 4 y el esquema no obliga a que coincidan: `severeNotification.hasPregnancyComplications`, `notificationPregnancy.hasComplications` y las filas contables de `notificationPregnancyComplication`. Nada impide hoy un `'NO'` con tres complicaciones cargadas. **Las filas mandan y los dos `answerOption` se derivan de ellas.**
- **El rango de Naegele.** Entre `lastMenstruationDate` y `probableDeliveryDate` tiene que haber entre 266 y 294 días, ambos inclusive, y un solo error cubre también el parto anterior a la menstruación.

**Y convierte en bloqueo una regla que la referencia dejaba en advertencia.** `CASE-PROCESS.md` §7.4 dice que corregir el sexo a `MALE`, o una fecha de nacimiento que saque la edad de 15–49, oculta un bloque de embarazo que puede estar lleno — y que **ese borrado se avisa, nunca se hace en silencio**. Este spec lo resuelve al revés y mejor, igual que FE12b hizo con `takesMedication`: **mientras haya datos de embarazo, el cambio no se puede guardar**. Primero se vacían, viéndolos; después se corrige el paciente. No hay borrado que avisar porque no hay borrado.

**La fila de embarazo no se borra nunca desde el asistente, y ésa es la regla más fácil de romper de la sección.** `UQ_notificationPregnancy_notification` no filtra por `deletedAt`: una fila desactivada sigue ocupando el hueco y el `001` responde `409` incluso sobre ella. La vuelta atrás es `ESAVI-NOTIFPRG-005B`, **rol SUPERADMIN**. Por eso vaciar el bloque es un `PUT` que conserva el `pregnancyId`, su auditoría y la posibilidad de volver — **jamás un `DELETE`**.

**Es también el único de los tres specs del paso 4 cuyas dos entidades ya escriben con rol `USER`** en `001` y `004`. De §10.4 sólo le alcanza `PREGCOMP-005A`, que sigue en ADMIN: se puede añadir una complicación y no retirarla. Eso deja de ser una molestia y pasa a ser un callejón cuando el bloqueo del párrafo anterior entra en juego, y por eso este spec vuelve a pedir §10.4 en vez de darla por conocida.

---

## 2. Alcance

**Dentro:**

- **`notificationPregnancy` completo**: sus cinco columnas pedidas —`wasPregnantAtVaccination`, `wasPregnantAtEsavi`, `lastMenstruationDate`, `probableDeliveryDate`, `hasComplications`— más `notes`, con `wasPregnantAtVaccination` obligatoria en el `001` y anulable en el `004`, y las tres `answerOption` en variante `unknown`.
- **El rango de Naegele reactivo**: 266–294 días inclusive entre menstruación y parto probable, **revalidado en cuanto se toca cualquiera de las dos fechas**, no sólo al enviar. Y la fecha de parto **sugerida a `+280 días`, nunca impuesta**: se propone si el campo está vacío o si conserva la sugerencia anterior, y no se toca si el usuario escribió otra cosa.
- **`notificationPregnancyComplication` completo**: `complicationTypeItemId` obligatorio contra `<CatalogSelect typeCode="pregnancyComplicationType" emit="id">`, la resolución del término con la misma tabla de `source` de FE12b, `notes`, y la guarda de duplicado `(término, tipo)` entre las **activas** del mismo embarazo.
- **La lista de complicaciones anidada dentro del bloque de embarazo**, contra `pregnancyId`, con la **fase 2** que el asistente ya usa dos veces: sin fila de embarazo guardada, la lista se muestra deshabilitada con su explicación; al guardarla, se habilita sobre el `pregnancyId` devuelto.
- **La compuerta de §7.4 aplicada al bloque entero**, reutilizando la que FE12a dejó escrita —sexo por `catalogItem.value === 'FEMALE'`, edad leída de `classification` y **nunca recalculada**—, incluida la marca «Si aplica» cuando el sexo o la edad no constan.
- **El pre-vuelo de `PREGNANCY_FEMALE_SEX_ITEM`** con `ESAVI-SYSCONF-006`: si la fila falta, el bloque sale deshabilitado con su explicación y no se intenta escribir. Y el mapeo del `500 NOTIFPRG_001_SEX_CONFIG_MISSING` como red de seguridad, por si la fila desaparece entre la lectura y el guardado.
- **La alineación de la compuerta con el ítem del servidor.** Con la fila leída, el cliente compara `patient.sexItemId` contra **ese `catalogItemId`**, que es lo que compara el `001`, en vez de contra `value === 'FEMALE'`. Es la discrepancia que §7.2 advierte y que se manifiesta como un `400 PATIENT_NOT_FEMALE` sobre un bloque que la pantalla mostraba abierto.
- **La derivación de §6.5 en sus dos mitades**: con al menos una complicación activa, `notificationPregnancy.hasComplications` y `severeNotification.hasPregnancyComplications` se ponen a `YES` y se muestran **bloqueados con su explicación**; sin ninguna, quedan editables. La descripción de la rama grave sigue siendo texto libre y **no se deriva**: es el resumen, no el recuento.
- **El bloqueo de los pasos 1 y 2** (§8): mientras haya datos de embarazo, no se puede guardar un cambio que cierre la compuerta —sexo a `MALE`, o `birthDate`/`eventDate` que dejen la edad fuera de 15–49—. **Las dos exclusiones bloquean por igual.** El diálogo nombra lo que hay, dice quién puede retirarlo, y ofrece **«Vaciar el bloque de embarazo»**, que lanza un solo `NOTIFPRG-004` de limpieza.
- **La corrección de `CASE-PROCESS.md` §7.4**: deja de decir «ese borrado se avisa» y pasa a decir «el cambio no se puede guardar mientras haya datos». Es la misma forma que FE12b aplicó a §5.4b y §7.3 con `takesMedication`.
- **Bajas de complicación con `PREGCOMP-005A`**, con diálogo de confirmación que nombra la fila. **La fila de embarazo no se da de baja nunca**: `NOTIFPRG-005A` no se consume.
- **Mapeo de los códigos de error** de las dos entidades a campo o a toast, incluido el `409 NOTIFPRG_001_ALREADY_EXISTS` sobre una fila retirada, que dice que reactivarla exige un SUPERADMIN y **no se reintenta**.
- **El aviso de rol de §10.4** en el `005A` de complicaciones: retirar exige administrador en este despliegue, aunque crear y corregir no.
- **Las claves i18n nuevas** en `es`, `en` y `nl`.
- **Tests de integración** del bloque en sus dos fases, de la compuerta en las cinco filas de la tabla de §7.4, de la derivación de §6.5 y del bloqueo de los pasos 1 y 2.

**Fuera de alcance (otros specs):**

- **El bloque de embarazo del paso 5** — `investigationMedicalHistory.isPregnancyConfirmed` y sus nueve columnas, e `investigationPregnancyCondition`. Están detrás de **esta misma compuerta**, anidados bajo una segunda propia, y usan la variante `full` de `<AnswerOptionField>`. Es FE13, y consume la compuerta que este spec deja cerrada sin volver a escribirla.
- **Sembrar `PREGNANCY_FEMALE_SEX_ITEM`.** Es §10.6, dependencia del otro repositorio. Este spec detecta su ausencia y la explica; no la resuelve, y **no se bloquea por ella**: todo lo demás del paso 4 sigue funcionando.
- **Reactivar una fila de embarazo retirada.** `NOTIFPRG-005B` es SUPERADMIN y no entra en el asistente. Se explica y se deriva a un administrador.
- **Dar de baja la fila de embarazo.** `NOTIFPRG-005A` existe y **este spec no lo consume nunca**, por la restricción `UNIQUE` que no filtra por `deletedAt`.
- **Reactivaciones y purgas de complicaciones.** Los `005B` y `005C` son SUPERADMIN.
- **Listados con inactivas y detalle por id.** `PREGCOMP-002B` es ADMIN y el asistente no muestra filas retiradas; los dos `003` no añaden nada sobre lo que ya trajo la lista.
- **Revisar los términos acuñados** por la rama `LOCAL` en `diagnosticTerm`. Es la pantalla de administración del catálogo, igual que en FE12b.
- **Reordenar filas.** `sortOrder` lo asigna un disparador y ningún servicio lo escribe.
- **Persistir el contenido del modal de complicación en `draftsStore`.** Igual que FE12b y FE12c. El formulario 1:1 de embarazo **sí** entra en el borrador de la cabecera, porque se guarda encadenado con ella (§3.4).
- **Nuevos obligatorios de proceso bajo «Completar etapa».** El embarazo es condicional por definición: exigirlo convertiría una compuerta en un requisito, y una mujer en edad fértil cuyo embarazo no se preguntó es un dato ausente legítimo.
- **La comprobación de `CLOSED` en el servidor** (§10.3). Sigue viviendo entera en el cliente, igual que en FE11, FE12a, FE12b y FE12c.

---

## 3. Diseño

### 3.1 Pantallas y rutas

**No hay ruta nueva ni entrada de menú nueva.** El bloque vive dentro del paso 4 que FE12a construyó, en la ruta que declaró FE08.

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Bloque de embarazo | `/esavi-cases/:id/wizard/notification` | `features/notification/PregnancySection.tsx` | el de `CaseWizardPage` (FE08), `<RequireRole level={USER}>` |
| Lista de complicaciones | ídem, **dentro del bloque de embarazo** | `features/notification/PregnancyComplicationList.tsx` | ídem |
| Alta/edición de complicación | ídem, en modal | `features/notification/PregnancyComplicationFormDialog.tsx` | ídem |

**El bloque de embarazo no es una lista y no lleva `<SatelliteList>`.** Es un formulario 1:1 con la notificación (`CASE-PROCESS.md` §5.4b), y **se guarda encadenado a la barra de acciones del paso** —cabecera → rama → embarazo—, igual que la rama grave en FE12a. No tiene botón de guardar propio: un segundo botón en el mismo paso enseña que hay dos cosas que guardar, y no las hay.

**La complicación sí abre modal**, con `<SatelliteList>` en su forma canónica. Es una lista dentro de un formulario, no dentro de otro modal: no hay el problema de foco que obligó a los diluyentes de FE12c a editarse en línea.

**El guard heredado es `USER` y no se estrecha.** Las dos entidades ya escriben con `USER` en `001` y `004`; sólo `PREGCOMP-005A` sigue en ADMIN, y el `403` se explica (§3.6) en vez de esconder el botón.

### 3.2 Endpoints consumidos

**Escrituras y lecturas propias**, copiadas textualmente de `references/API-ROUTES.md`, regenerado el 2026-09-05:

```
POST   /api/notification-pregnancies                            ESAVI-NOTIFPRG-001   USER    crear el bloque
GET    /api/notification-pregnancies/notification/:id           ESAVI-NOTIFPRG-006   USER    leer el bloque
PUT    /api/notification-pregnancies/:id                        ESAVI-NOTIFPRG-004   USER    actualizar y limpiar

POST   /api/notification-pregnancy-complications                ESAVI-PREGCOMP-001   USER    crear complicación
GET    /api/notification-pregnancy-complications/pregnancy/:id  ESAVI-PREGCOMP-002A  USER    complicaciones del embarazo
PUT    /api/notification-pregnancy-complications/:id            ESAVI-PREGCOMP-004   USER    actualizar
DELETE /api/notification-pregnancy-complications/:id            ESAVI-PREGCOMP-005A  ADMIN   baja lógica

GET    /api/system-configs/code/:code                           ESAVI-SYSCONF-006    USER    PREGNANCY_FEMALE_SEX_ITEM
```

> **`ESAVI-NOTIFPRG-006` es por `notificationId`, no por `caseId`.** Es la única de las seis satélites del paso 4 que se lee así: las otras cinco tienen `006` por caso o, como `NOTIFDIL`, un `002A` por su padre. El id sale de `['notification','byCase',caseId]`, que ya trajo FE12a, y por eso el bloque **no se renderiza hasta que la cabecera existe**.

> **§10.4 sólo alcanza a `PREGCOMP-005A`.** Los `001` y los `004` de las dos entidades ya son `USER`, a diferencia de las cuatro satélites clínicas de FE12b y FE12c. Lo que sigue vedado a quien notifica es **retirar** una complicación que acaba de escribir — y con el bloqueo de §8 eso deja de ser una molestia y pasa a ser un callejón.

> **El inventario escribe la ruta del `006` de `systemConfig` con un código de ejemplo** (`/api/system-configs/code/ESAVI_APP_DEFAULT_LIMIT`). El parámetro es el `code`; aquí se pide `PREGNANCY_FEMALE_SEX_ITEM`. Es la misma lectura que §10.1 declaró para el código de país.

**Qué no se consume, y por qué:**

- **`ESAVI-NOTIFPRG-005A`.** Existe, es ADMIN, y **este spec no lo llama jamás**. `UQ_notificationPregnancy_notification` no filtra por `deletedAt`: una fila retirada sigue ocupando el hueco y el `001` responde `409` sobre ella. Vaciar el bloque es un `PUT`.
- **`ESAVI-NOTIFPRG-005B` y `005C`, `ESAVI-PREGCOMP-005B` y `005C`.** Reactivar y purgar son SUPERADMIN y no entran en el asistente. El `005B` de embarazo sí se **nombra** en un mensaje de error (§3.5), como salida que pide administrador.
- **`ESAVI-NOTIFPRG-003` y `ESAVI-PREGCOMP-003`.** El bloque se lee por su padre y la complicación se edita con lo que ya trajo la lista; una segunda lectura de lo mismo no añade nada.
- **`ESAVI-PREGCOMP-002B`.** Es ADMIN e incluye inactivas, y el asistente no muestra filas retiradas.
- **`ESAVI-DIAGTERM-*` directamente.** El término se resuelve en el servidor a partir de `complicationCode` y `source`; el cliente no abre esa puerta, igual que en FE12b.

**Lecturas que ya implementaron specs anteriores:**

```
GET  /api/case-workflows/case/:id       ESAVI-CASEFLOW-006   USER   estado y stages (FE08)
GET  /api/notifications/case/:id        ESAVI-NOTIFCN-006    USER   notificationId (FE12a)
GET  /api/severe-notifications/case/:id ESAVI-SEVNOT-006     USER   hasPregnancyComplications, para derivarlo (FE12a)
GET  /api/classifications/case/:id      ESAVI-CLASSIF-006    USER   la edad, que no se recalcula (FE11)
GET  /api/patients/:id                  ESAVI-PATIENT-003    USER   sexItemId (FE10)
GET  /api/esavi-cases/:id               ESAVI-CASE-003       USER   eventDate (FE09/FE10)
GET  /api/catalog-types                 ESAVI-CATTYPE-002    USER   typeCode -> catalogTypeId
GET  /api/catalog-items/type/:id        ESAVI-CATITEM-002A   USER   sex, pregnancyComplicationType
GET  /api/meddra/search                 ESAVI-MEDDRA-006     USER   <MeddraSearchField> (FE12b)
```

### 3.3 Tipos del contrato

**Dos archivos nuevos por `contracts:sync`**, con dos entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`:

```ts
// contracts/notificationPregnancy.ts — espejo de esavi-backend/src/types/notificationPregnancy/
export interface CreateNotificationPregnancyInput {
  notificationId: string;                        // el padre, inmutable en el 004
  wasPregnantAtVaccination: AnswerOption;        // OBLIGATORIA en el 001; un null explícito da 400
  wasPregnantAtEsavi?: AnswerOption | null;
  lastMenstruationDate?: string | null;          // YYYY-MM-DD; gobierna el rango gestacional
  probableDeliveryDate?: string | null;          // YYYY-MM-DD; ídem
  hasComplications?: AnswerOption | null;        // derivada de las filas cuando hay alguna (§6.5)
  notes?: string | null;
  isActive?: boolean;
}
```

**`wasPregnantAtVaccination` es la única `answerOption` obligatoria de todo el proceso**, y sólo en el `001`: en el `004` vuelve a admitir `null`, deliberadamente, para retirar una respuesta dada por error sin destruir el `pregnancyId` ni su auditoría. `Partial<CreateNotificationPregnancyInput>` en el update lo expresa tal cual.

```ts
// contracts/notificationPregnancyComplication.ts
export interface CreateNotificationPregnancyComplicationInput {
  pregnancyId: string;              // el padre, inmutable en el 004
  complicationTypeItemId: string;   // OBLIGATORIO. El DDL lo admite nulo y el validador lo exige
  complicationName: string;         // OBLIGATORIO. Campo aceptado que NO es columna
  complicationCode?: string | null; // campo aceptado que NO es columna; dispara la resolución
  source?: 'MEDDRA' | 'WHODRUG' | 'LOCAL' | 'OTHER';  // campo aceptado que NO es columna
  notes?: string | null;
  isActive?: boolean;
}
```

**Tres campos que se envían y no se guardan**, y el formulario tiene que saberlo al releer:

| Se envía | Dónde acaba |
|---|---|
| `complicationName` | En **`complicationRawName`**, y **sólo si difiere** del nombre del maestro |
| `complicationCode` | En `diagnosticTerm`, vía la resolución. En la fila queda `diagnosticTermId` |
| `source` | En ninguna parte. Decide la rama de la resolución y se descarta |

**Y una diferencia con `notificationEvent` que hay que tener presente:** allí el maestro reescribe `esaviName` y la fila guarda el nombre canónico. **Aquí no hay columna equivalente**: la tabla no guarda el nombre del término, se lee del `diagnosticTerm` incluido en la respuesta. Al releer, el campo del término muestra **`complicationRawName` cuando existe** y, si no, el nombre del término resuelto.

**En el `004`, `complicationTypeItemId` y `complicationName` son opcionales pero no anulables** — un `null` explícito da 400. Es lo contrario de `NOTIFPRG-004`: allí se retira una respuesta dada por error; aquí un `null` borraría una clasificación obligatoria y dejaría una fila que el `001` habría rechazado. Se corrige mandando la correcta, no borrándola.

`AnswerOption` ya está declarado en `contracts/common.ts` desde FE12a. El update de las dos entidades usa `Partial<CreateEntityInput>`, igual que en el backend.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId` y paso activo | URL | params de `/esavi-cases/:id/wizard/:step` | los declaró FE08 |
| Estado del expediente y `stages` | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | sólo lectura aquí |
| Cabecera de la notificación | TanStack Query | `['notification', 'byCase', caseId]` | de aquí sale `notificationId` |
| Ficha grave | TanStack Query | `['severeNotification', 'byCase', caseId]` | de aquí sale `hasPregnancyComplications`, que §6.5 deriva |
| Clasificación del paso 3 | TanStack Query | `['classification', 'byCase', caseId]` | de aquí sale **la edad**; no se recalcula (§7.4) |
| Paciente | TanStack Query | `['patient', 'detail', patientId]` | `sexItemId` y `birthDate`, para la compuerta |
| El caso | TanStack Query | `['esaviCase', 'detail', caseId]` | `eventDate`, que entra en la edad |
| **Fila de configuración del sexo femenino** | TanStack Query | `['systemConfig', 'byCode', 'PREGNANCY_FEMALE_SEX_ITEM']` | `staleTime` **30 min**. Un `404` es «no sembrada», no un error |
| Bloque de embarazo | TanStack Query | `['notificationPregnancy', 'byNotification', notificationId]` | sin `staleTime`; se invalida tras cada escritura |
| Complicaciones | TanStack Query | `['notificationPregnancyComplication', 'byPregnancy', pregnancyId]` | `enabled` sólo con `pregnancyId`; sin `staleTime` |
| Ítems de `sex` y `pregnancyComplicationType` | TanStack Query | `['catalogItem', 'byType', catalogTypeId]` | `staleTime` 30 min |
| **Valores del bloque de embarazo** | React Hook Form | el `useForm` de `NotificationStep` | **no tiene formulario propio**: va encadenado con la cabecera y la rama |
| Borrador sin guardar | Zustand `draftsStore` | `drafts[caseId]['notification']` | los seis campos del bloque entran en el borrador que FE12a declaró |
| Valores del modal de complicación | React Hook Form | `useForm` de `PregnancyComplicationFormDialog` | |
| Qué complicación se está editando | Componente | `useState` de la lista | efímero; **el id, no la fila** |
| Diálogo de confirmación de baja | Componente | `useState` | efímero |
| **Última fecha de parto sugerida** | Componente | `useRef` de la sección | **excepción razonada**, abajo |
| Compuerta abierta, cerrada o «Si aplica» | derivado en render | sexo + edad (§7.4) | no es estado |
| Bloque deshabilitado por configuración | derivado en render | el `006` de `systemConfig` dio `404` | no es estado |
| Habilitación de la lista de complicaciones | derivado en render | el bloque **tiene `pregnancyId`** | no es estado — es la fase 2 |
| Los dos `answerOption` bloqueados | derivado en render | hay ≥1 complicación activa | no es estado (§6.5) |

**Los cuatro puntos obligatorios:**

**1 · Nada del servidor en `useState`.** La lista guarda **el id de la complicación que edita**, no una copia de la fila. Y hay **una excepción que hay que razonar**: la última fecha de parto sugerida vive en un `useRef` de la sección. No es un dato del servidor ni un valor del formulario — es la memoria de qué escribió el propio componente, y sin ella no se puede distinguir «el usuario conserva mi sugerencia» de «el usuario escribió justo esa fecha», que es lo que decide si se re-sugiere o no se toca (§3.5).

**2 · Ningún filtro fuera de `searchParams`.** Esta pantalla no tiene filtros, paginación ni orden: el orden de las complicaciones lo fija el disparador de `sortOrder` y no se puede cambiar. La regla no aplica, y se dice en vez de callarla.

**3 · `staleTime` por naturaleza del dato.** Las lecturas del expediente no llevan `staleTime` y se invalidan tras cada escritura. Los dos catálogos heredan los 30 minutos de `catalogItemResource`. **La fila de `systemConfig` lleva 30 minutos** por el mismo motivo: la siembra la hace un SUPERADMIN en el despliegue, no durante una sesión.

**4 · Qué invalida qué.**

- **Del bloque de embarazo** (`001`/`004`): sólo `['notificationPregnancy','byNotification',notificationId]`.
- **Tras el `001`**, además, la clave de complicaciones **pasa a estar habilitada**. No es una invalidación: es que `enabled` se vuelve cierto porque ya hay `pregnancyId`.
- **De una complicación** (`001`/`004`/`005A`): sólo `['notificationPregnancyComplication','byPregnancy',pregnancyId]`.
- **No se invalida `['caseWorkflow','byCase',caseId]`.** Un satélite no sella ninguna marca del expediente; la que sella `notificationStartedAt` es la cabecera, y es de FE12a.
- **No se invalida `['notification','byCase',caseId]` ni `['severeNotification','byCase',caseId]`.** Ninguna respuesta suya depende del embarazo — la derivación de §6.5 va por el formulario, no por la caché (abajo).
- **Nada invalida los catálogos ni la fila de `systemConfig`.**

**Y una decisión sobre §6.5 que conviene ver aquí, porque es la que decide si hay escrituras extra.**

La derivación **no dispara ningún `PUT` propio**. Al aparecer la primera complicación activa, los dos `<AnswerOptionField>` —el de `hasComplications` y el de `hasPregnancyComplications` de la rama grave— pasan a `'YES'` **como valor del formulario** y se bloquean con su explicación; los dos viajan en el guardado normal del paso, que ya escribe la rama y el bloque encadenados. No hay una segunda escritura que el usuario no pidió y que pueda fallar por su cuenta — que es exactamente lo que FE12c rechazó al no encadenar diluyentes tras el `POST` de la vacuna.

**La contrapartida, dicha en voz alta:** entre crear la primera complicación y guardar el paso, la base puede tener un `'NO'` con una fila cargada. Es la incoherencia que §6.5 describe, dura lo que tarda un clic en «Guardar», y **la pantalla la muestra**: los dos campos ya dicen `'YES'` bloqueados, así que lo que el usuario ve es lo que se va a guardar.

**La alternativa era escribir los dos `PUT` al crear la complicación.** Se descarta: son dos escrituras sobre dos tablas distintas que el usuario no pidió, y si la segunda falla queda una rama grave diciendo `'YES'` sobre un bloque que dice `'NO'` — peor que la incoherencia que se quería cerrar.

### 3.5 Formularios y validación

**Bloque de embarazo** — `features/notification/schemas.ts`, `notificationPregnancySchema`, encadenado al `useForm` de `NotificationStep`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `wasPregnantAtVaccination` | `<AnswerOptionField variant="unknown">` | **sí en el alta** | La única `answerOption` obligatoria del proceso. **No se exige que sea `'YES'`**: `NO` y `UNKNOWN` valen |
| `wasPregnantAtEsavi` | `<AnswerOptionField variant="unknown">` | no | |
| `lastMenstruationDate` | `<DateField allowFuture={false}>` | no | `YYYY-MM-DD`. Gobierna el rango gestacional y la sugerencia |
| `probableDeliveryDate` | `<DateField>` | no | `YYYY-MM-DD`. **Futura permitida** — una gestación en curso tiene el parto por delante |
| `hasComplications` | `<AnswerOptionField variant="unknown">` | no | **Derivado y bloqueado** con ≥1 complicación activa (§6.5) |
| `notes` | `<Textarea>` | no | Texto libre |

**`wasPregnantAtVaccination` es obligatoria en el `001` y anulable en el `004`**, y el schema lo expresa con dos variantes, no con una sola relajada. Retirar una respuesta dada por error es legítimo sobre una fila que ya existe; crearla sin responder, no.

**Rango de Naegele, reactivo.** Entre `lastMenstruationDate` y `probableDeliveryDate` tiene que haber **entre 266 y 294 días, ambos inclusive** → `400 NOTIFPRG_00X_DELIVERY_DATE_OUT_OF_RANGE`. Sin una de las dos fechas no hay regla. **Se revalida en cuanto se toca cualquiera de los dos campos**, no al enviar: el error aparece junto a la fecha que lo produce y desaparece al corregirla, sin esperar a un guardado que va a fallar. Un solo mensaje cubre también el parto anterior a la menstruación, igual que el backend.

**La fecha de parto se propone, no se calcula.** Con `lastMenstruationDate` informada, el campo ofrece **`+280 días`** como valor sugerido y editable. Calcularla en firme escondería la tolerancia de ±14 días, que es precisamente lo que el backend acepta. Y al cambiar la menstruación después:

| Estado del campo de parto | Qué pasa |
|---|---|
| Vacío | Se rellena con la nueva sugerencia |
| Conserva exactamente la sugerencia anterior | Se sustituye por la nueva |
| Cualquier otro valor | **No se toca** |

La sugerencia anterior se recuerda en el `useRef` de §3.4. Sobrescribir una fecha tecleada es la forma más rápida de que nadie vuelva a confiar en el campo.

**La compuerta de §7.4, aplicada al bloque entero.** Se oculta cuando **conste que no aplica**, no se muestra sólo cuando conste que aplica:

| Sexo del paciente | Edad | Bloque |
|---|---|---|
| Femenino | 15–49 | Visible, normal |
| Femenino | desconocida | Visible, **«Si aplica»** |
| Desconocido o sin informar | 15–49 o desconocida | Visible, **«Si aplica»** |
| Masculino | cualquiera | **Oculto** — no existe en el DOM |
| cualquiera | conocida, fuera de 15–49 | **Oculto** |

La edad sale de `['classification','byCase',caseId]`, calculada por el backend. **No se reimplementa el cálculo:** dos implementaciones divergen justo en los bordes, y 15 y 49 son bordes. La marca «Si aplica» es texto visible por i18n, no un `title` ni un color.

**Y el sexo se compara contra el `catalogItemId` de la fila de configuración, no contra `value === 'FEMALE'`.** Es lo que compara `ESAVI-NOTIFPRG-001`, y hacerlo igual cierra la discrepancia que §7.2 advierte: un despliegue cuya fila apunta a un ítem distinto del que lleva `value === 'FEMALE'` produciría un `400 PATIENT_NOT_FEMALE` sobre un bloque que la pantalla mostraba abierto. **Si la fila no está sembrada, se cae a `value === 'FEMALE'`** para decidir la visibilidad — pero el bloque sale deshabilitado igualmente (§3.6), así que la comparación sólo decide si se explica el problema o no se muestra nada.

**Formulario de complicación** — `notificationPregnancyComplicationSchema`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `complicationName` | `<MeddraSearchField>` | **sí** | Campo aceptado que no es columna. Acaba en `complicationRawName` **sólo si difiere** del maestro |
| `complicationCode` | derivado del buscador, o `<Input>` | no | **Es lo que dispara la resolución** |
| `complicationTypeItemId` | `<CatalogSelect typeCode="pregnancyComplicationType" emit="id">` | **sí** | 3 ítems sembrados. **El DDL lo admite nulo y el validador lo exige** |
| `notes` | `<Textarea>` | no | Texto libre |

**`source`, con la misma tabla de FE12b:**

| Cómo se rellenó el término | `source` | Efecto |
|---|---|---|
| Elegido en el buscador de MedDRA | **`MEDDRA`** | Busca `(MEDDRA, code)`. **Nunca acuña**: `404` si el diccionario no está importado |
| Escrito a mano con código | **`LOCAL` explícito** | Resolución implícita: si el término no existe, **se acuña** `autoCreated`/`PENDING` |
| Escrito a mano sin código | — | `diagnosticTermId: null`, nombre en texto libre |

**Al releer, el campo del término muestra `complicationRawName` cuando existe** y, si no, el nombre del `diagnosticTerm` incluido en la respuesta. **Aquí no hay `esaviName`**: la tabla no guarda el nombre canónico, a diferencia de `notificationEvent`.

**Guarda de duplicados:** el par `(diagnosticTermId, complicationTypeItemId)` no se repite entre las complicaciones **activas** del mismo embarazo → `409 PREGCOMP_00X_ALREADY_EXISTS`. Sólo corre si el término tiene valor: dos complicaciones de texto libre del mismo tipo son registros distintos por definición. **El cliente no la adelanta**: es una regla de negocio sin índice detrás, y replicarla obligaría a comparar ids resueltos que el cliente no siempre tiene.

**Códigos de error mapeados a campo:**

| Código | Destino |
|---|---|
| `NOTIFPRG_00X_DELIVERY_DATE_OUT_OF_RANGE` | `probableDeliveryDate` |
| `NOTIFPRG_001_PATIENT_NOT_FEMALE` | **Toast propio**, que dice qué sexo tiene registrado el paciente y ofrece corregirlo en el paso 1 |
| `NOTIFPRG_001_SEX_CONFIG_MISSING` (500) | **Toast propio**: el registro de embarazo no está configurado en este despliegue. **No se presenta como fallo del servidor** |
| `NOTIFPRG_001_ALREADY_EXISTS` (409) | **Toast propio**: existe un bloque retirado para esta notificación y reactivarlo exige un SUPERADMIN (`005B`). **No se reintenta ni se ofrece crear otro** |
| `PREGCOMP_00X_ALREADY_EXISTS` | `complicationName`, nombrando el tipo con el que ya está registrada |
| `PREGCOMP_00X_DIAGTERM_NOT_FOUND` | El buscador, con la acción de guardarlo como texto libre — igual que en FE12b |
| El `404` del tipo de complicación | `complicationTypeItemId`. **El sufijo exacto se copia del servicio al implementar**, no se inventa aquí |
| `AUTH_ROLE_FORBIDDEN` en `PREGCOMP-005A` | Aviso de §10.4: **retirar** una complicación exige administrador en este despliegue, aunque crearla y corregirla no |

**Se envía el objeto completo en el `PUT`.** El backend hace el update diferencial; el cliente no calcula el diff.

### 3.6 Estados de la pantalla

**Bloque de embarazo** (dentro de `NotificationStep`):

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Sin cabecera de notificación | El bloque **no se renderiza**. Sin `notificationId` no hay padre | — |
| Compuerta cerrada | **No existe en el DOM.** No basta con ocultarlo con CSS | — |
| Compuerta abierta sin confirmar | El bloque normal, con la marca **«Si aplica»** visible junto al título | `notification.pregnancy.ifApplicable` |
| Configuración sin sembrar (§10.6) | El bloque **deshabilitado con su explicación**: el registro de embarazo no está configurado en este despliegue y hay que pedirlo a un administrador | `notification.pregnancy.notConfigured` |
| Carga | Skeleton de los seis campos | — |
| Alta (sin fila todavía) | Campos vacíos y la lista de complicaciones deshabilitada con su explicación | `notification.pregnancy.complications.needsParent` |
| Error de lectura | Mensaje del `EsaviApiError` por `code` + botón reintentar | `notification.pregnancy.error` |
| Sin permiso | No se llega: el guard del asistente redirige | — |

**El bloque deshabilitado por configuración no es una pantalla rota, y tampoco un error del usuario.** Es un despliegue sin sembrar, y el resto del paso 4 sigue funcionando entero: la explicación lo dice y no bloquea nada más.

**Lista de complicaciones**, dentro del bloque:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Bloque sin guardar | Sección **deshabilitada con su explicación**: hay que guardar el bloque antes de añadir complicaciones | `notification.pregnancy.complications.needsParent` |
| Carga | Skeleton de 2 filas | — |
| Vacío | **Sólo el título y el botón «Añadir complicación»**, sin ilustración ni estado vacío — el patrón de `<SatelliteList>` | — |
| Catálogo de tipos sin ítems | `<CatalogSelect>` deshabilitado con su explicación. **Y la complicación no se puede guardar**: el tipo es obligatorio | reutiliza las de `CatalogSelect` |
| Error | Mensaje por `code` + reintentar | `notification.pregnancy.complications.error` |

**No hay «vacío con filtros»**: esta lista no tiene filtros ni paginación.

> **El catálogo `pregnancyComplicationType` es el único de los tres bloqueantes del paso 4.** `pharmaceuticalForm` y `administrationRoute` (§10.5) dejan guardar la medicación sin ellos porque sus FK son nullables; aquí `complicationTypeItemId` es **obligatorio en el validador**, así que un catálogo vacío impide registrar complicaciones. La referencia lo da por sembrado con tres ítems; si en el despliegue no lo estuviera, la explicación del selector deshabilitado tiene que decir que **sin esos ítems no hay complicación que registrar**, no sólo que el desplegable está vacío.

**Expediente `CLOSED`:** todo el bloque es de solo lectura —sin editar, sin añadir, sin borrar—, igual que el resto del asistente (§4.5). La comprobación vive entera en el cliente, como en FE11, FE12a, FE12b y FE12c.

### 3.7 Responsividad y accesibilidad

- **Lista de complicaciones → tarjetas** por debajo de `md`, dentro de `<SatelliteList>`. Los dos campos que sobreviven: **el nombre de la complicación y su tipo**. Son los dos que la identifican, y el tipo es obligatorio, así que ninguna tarjeta sale a medias. Un campo sin valor no se renderiza: nada de rellenos.
- **El modal de complicación pasa a hoja completa** por debajo de `md`: lleva un buscador con desplegable, y un diálogo centrado deja el listado de coincidencias sin sitio.
- **Los dos `<DateField>` se apilan** en móvil, con el error del rango debajo del segundo, que es donde el usuario está mirando cuando aparece.
- La barra de acciones del modal queda **fija abajo**.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- **La marca «Si aplica» es texto, no un icono ni un color.** Un lector de pantalla tiene que anunciarla junto al título de la sección, porque cambia el significado de todo lo que hay debajo.
- **El bloqueo de los dos `answerOption` por §6.5 se explica en el propio campo**, con `aria-describedby`, no sólo deshabilitando el control. Un campo deshabilitado sin motivo es indistinguible de un fallo.
- **El error del rango gestacional se anuncia con una región viva** al aparecer: se produce al tocar una fecha, no al enviar, y sin anuncio el usuario que no ve la pantalla sigue escribiendo.
- Las acciones de editar y eliminar de cada fila llevan `aria-label` por i18n **nombrando la fila** — «Eliminar la complicación Preeclampsia», no «Eliminar».
- El diálogo de vaciado del bloque (§8) **nombra qué se va a limpiar y qué queda**, no sólo pregunta si se está seguro.

### 3.8 Claves i18n nuevas

Van a los **tres** archivos de idioma. `npm run i18n:check` exige paridad exacta.

| Clave | Uso |
|---|---|
| `notification.pregnancy.sectionTitle` | Título del bloque |
| `notification.pregnancy.ifApplicable` | La marca «Si aplica» — **ya existe desde FE12a**, se reutiliza |
| `notification.pregnancy.notConfigured` | §10.6: el registro de embarazo no está configurado en este despliegue |
| `notification.pregnancy.field.wasPregnantAtVaccination` · `.wasPregnantAtEsavi` · `.lastMenstruationDate` · `.probableDeliveryDate` · `.hasComplications` · `.notes` | Etiquetas |
| `notification.pregnancy.field.probableDeliveryDate.suggested` | Ayuda que explica que la fecha es una sugerencia editable de +280 días |
| `notification.pregnancy.error.deliveryDateOutOfRange` | Rango de Naegele, con los dos límites |
| `notification.pregnancy.error.patientNotFemale` | El `400`, nombrando el sexo registrado y ofreciendo corregirlo en el paso 1 |
| `notification.pregnancy.error.alreadyExists` | El `409` sobre una fila retirada, con la salida por SUPERADMIN |
| `notification.pregnancy.error` | Error de lectura del bloque |
| `notification.pregnancy.derived.hasComplications` | Por qué el campo está bloqueado: hay complicaciones registradas (§6.5) |
| `notification.pregnancy.complications.title` · `.add` · `.error` | La lista |
| `notification.pregnancy.complications.needsParent` | Sección deshabilitada mientras el bloque no esté guardado |
| `notification.pregnancy.complications.field.complicationName` · `.complicationCode` · `.complicationTypeItemId` · `.notes` | Etiquetas |
| `notification.pregnancy.complications.error.alreadyExists` | Duplicado `(término, tipo)` |
| `notification.pregnancy.complications.error.typeCatalogEmpty` | El catálogo sin ítems impide registrar |
| `notification.pregnancy.complications.delete.confirm` | Diálogo de baja, nombrando la fila |
| `notification.pregnancy.complications.roleForbidden.delete` | El aviso de §10.4 para el `005A` |
| `notification.pregnancy.gate.blocked.sex` | Paso 1: no se puede cambiar el sexo con datos de embarazo cargados |
| `notification.pregnancy.gate.blocked.age` | Pasos 1 y 2: ídem por fecha de nacimiento o fecha del evento |
| `notification.pregnancy.gate.blocked.complications` | Cuántas complicaciones quedan y **quién puede retirarlas** |
| `notification.pregnancy.gate.clearBlock` | Botón «Vaciar el bloque de embarazo» |
| `notification.pregnancy.gate.cleared` | Confirmación tras el `PUT` de limpieza |

La clave de la rama grave `notification.severe.hasPregnancyComplications` **ya existe** desde FE12a; este spec sólo le añade la explicación del bloqueo, que es `notification.pregnancy.derived.hasComplications`, compartida por los dos campos.

---

## 4. Plan de implementación

Quince pasos. Cada uno deja el proyecto compilando y arrancable, y cada uno se puede committear solo.

1. **Corregir `CASE-PROCESS.md` §7.4.** La nota final dice que el borrado del bloque «se avisa, nunca se hace en silencio». Pasa a decir que **el cambio no se puede guardar mientras haya datos de embarazo**, con la referencia a §8 de este spec. Es la misma corrección de referencia que FE12b hizo con `takesMedication`, y va primero para que nadie implemente la versión antigua.
   *Verificación:* `grep -n "ese borrado se avisa" references/CASE-PROCESS.md` no devuelve nada, y §7.4 cita `SPEC FE12d`.

2. **Contratos.** Dos entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs` —`notificationPregnancy`, `notificationPregnancyComplication`— y `npm run contracts:sync`.
   *Verificación:* los dos archivos existen en `src/contracts/` y `npm run build` sale en 0. `CreateNotificationPregnancyInput.wasPregnantAtVaccination` **no** es opcional; el input de complicación **sí** declara `complicationName`, `complicationCode` y `source`, que no son columnas.

3. **Lectura de `systemConfig` por código.** Hook `useSystemConfigByCode(code)` sobre `ESAVI-SYSCONF-006`, con `staleTime` de 30 minutos y **el `404` tratado como «no sembrada», no como error**. Se estrena con `PREGNANCY_FEMALE_SEX_ITEM` y queda disponible para el código de país de §10.1.
   *Verificación:* con la fila ausente el hook resuelve a «no configurada» sin propagar un error a la pantalla; con la fila presente devuelve el `catalogItemId`; una segunda montura dentro de la ventana no repite la petición.

4. **Declaración de los dos recursos.** `features/notification/api.ts` gana `notificationPregnancyResource` (por `notificationId`, `ESAVI-NOTIFPRG-006`) y `notificationPregnancyComplicationResource` (por `pregnancyId`, `ESAVI-PREGCOMP-002A`), con los códigos de operación citados en cada hook.
   *Verificación:* `grep -rn "ESAVI-NOTIFPRG\|ESAVI-PREGCOMP" src/features/notification/api.ts` devuelve los siete códigos de §3.2 y **ningún `005A` de embarazo**; el hook de complicaciones acepta `enabled` y no dispara sin `pregnancyId`.

5. **Schemas Zod.** `notificationPregnancySchema` en sus **dos variantes** —`wasPregnantAtVaccination` obligatoria en el alta, anulable en la edición— y `notificationPregnancyComplicationSchema` con sus dos obligatorios. El rango de Naegele como refinamiento sobre el objeto completo, con los dos límites inclusive.
   *Verificación:* pruebas unitarias: 266 y 294 días pasan, 265 y 295 fallan; el parto anterior a la menstruación da el mismo error; sin una de las dos fechas no hay error; el schema de alta rechaza `wasPregnantAtVaccination` ausente y el de edición lo admite `null`.

6. **La compuerta, extraída a un hook.** `usePregnancyGate(caseId)` devuelve `'hidden' | 'visible' | 'ifApplicable'` a partir del sexo, la edad de `classification` y la fila de configuración. **Sustituye la implementación en línea que FE12a dejó en `NotificationStep`**, que pasa a consumirlo. Compara contra el `catalogItemId` de la configuración y **cae a `value === 'FEMALE'`** si la fila no está sembrada.
   *Verificación:* pruebas de las cinco filas de la tabla de §3.5; con la configuración apuntando a un ítem distinto del que lleva `value === 'FEMALE'`, la compuerta sigue al servidor; las dos columnas de embarazo de la rama grave siguen ocultándose exactamente como antes del cambio.

7. **El bloque, solo lectura y campos.** `PregnancySection.tsx` con los seis campos encadenados al `useForm` de `NotificationStep`, detrás de la compuerta, con la marca «Si aplica» y el estado deshabilitado por configuración ausente. Sin complicaciones y sin escritura todavía.
   *Verificación:* con paciente masculino **ningún campo de embarazo existe en el DOM**; con femenino sin fecha de nacimiento aparece marcado «Si aplica»; sin la fila de `systemConfig` el bloque sale deshabilitado con su explicación y el resto del paso 4 sigue utilizable.

8. **Guardado encadenado.** El `001` o el `004` según exista la fila, dentro de la cadena cabecera → rama → embarazo de la barra de acciones, con el mapeo de los cuatro errores propios: rango, `PATIENT_NOT_FEMALE`, `SEX_CONFIG_MISSING` y el `409` sobre fila retirada.
   *Verificación:* guardar el paso con el bloque relleno produce **una** escritura de embarazo; reentrar y guardar sin tocar nada **no produce `updatedAt`** (update diferencial); el `409` muestra el mensaje de SUPERADMIN y **no reintenta**.

9. **Lista de complicaciones, fase 2.** `PregnancyComplicationList.tsx` y `PregnancyComplicationFormDialog.tsx` sobre `<SatelliteList>`: deshabilitada mientras no haya `pregnancyId`, habilitada en cuanto el `001` responde, con `<MeddraSearchField>`, el `<CatalogSelect>` del tipo y la tabla de `source`.
   *Verificación:* con el bloque sin guardar la sección sale deshabilitada con su explicación; guardarlo la habilita **sin recargar el paso**; al releer una fila con `complicationRawName`, el campo del término muestra ese texto y no el del maestro.

10. **Bajas.** `PREGCOMP-005A` con diálogo de confirmación que nombra la fila, y el aviso de §10.4 sobre el `403`.
    *Verificación:* dar de baja una complicación invalida sólo su clave; con rol `USER` el `403` muestra el aviso que menciona al administrador, no un error genérico.

11. **La derivación de §6.5.** Con ≥1 complicación activa, `hasComplications` y `hasPregnancyComplications` pasan a `'YES'` en el formulario y se bloquean con su explicación; sin ninguna, vuelven a ser editables. **Sin `PUT` propio.**
    *Verificación:* crear la primera complicación pone los dos campos en `'YES'` bloqueados **sin disparar ninguna escritura**; guardar el paso los persiste; borrar la última los devuelve a editables sin recargar; la descripción de la rama grave **sigue siendo libre**.

12. **La sugerencia de la fecha de parto.** `+280 días` al informar la menstruación, con la regla de tres casos de §3.5 y el `useRef` de la sugerencia anterior, más la revalidación del rango al tocar cualquiera de las dos fechas.
    *Verificación:* con el campo vacío se rellena; con la sugerencia anterior intacta se sustituye; con una fecha tecleada a mano **no se toca**; corregir una fecha fuera de rango borra el error sin enviar nada.

13. **El bloqueo de los pasos 1 y 2.** `PatientStep` y `CaseOpeningStep` (FE10) impiden guardar un cambio de `sexItemId`, `birthDate` o `eventDate` que cierre la compuerta mientras haya datos de embarazo. El diálogo nombra lo que hay, dice quién puede retirarlo y ofrece **«Vaciar el bloque de embarazo»**, que lanza un solo `NOTIFPRG-004` de limpieza.
    *Verificación:* con el bloque relleno, cambiar el sexo a masculino **no guarda** y explica por qué; «Vaciar el bloque» lo limpia con una escritura y entonces sí guarda; con dos complicaciones activas el diálogo las cuenta y **no ofrece vaciar hasta que se retiren**; con rol `USER` el texto menciona al administrador; una `birthDate` que deja la edad en 50 bloquea igual que el sexo.

14. **i18n.** Las claves de §3.8 en `es`, `en` y `nl`.
    *Verificación:* `npm run i18n:check` sale en 0.

15. **Tests de integración.** Con MSW: el bloque en sus dos fases, las cinco filas de la compuerta, la configuración ausente, la derivación de §6.5, el rango de Naegele en sus bordes y el bloqueo de los pasos 1 y 2 en sus tres disparadores.
    *Verificación:* `npm test` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las ocho rutas de §3.2 se consumen con su código de operación citado en la declaración del recurso o en el hook.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] **`ESAVI-NOTIFPRG-005A` no se llama nunca.** `grep -rn "notification-pregnancies" src/` no muestra ningún `DELETE` sobre la fila de embarazo.
- [ ] El bloque **no se renderiza** sin fila de `notification`.
- [ ] Con paciente de sexo masculino, **ningún** campo de embarazo existe en el DOM — no basta con que esté oculto.
- [ ] Con edad conocida fuera de 15–49, el bloque tampoco existe; con edad desconocida o sexo sin informar, aparece marcado «Si aplica».
- [ ] La edad **no se recalcula**: `grep -rn "birthDate" src/features/notification/` no muestra ninguna aritmética de fechas; el valor sale de `['classification','byCase',caseId]`.
- [ ] Con la fila `PREGNANCY_FEMALE_SEX_ITEM` ausente, el bloque sale deshabilitado con su explicación, **no se intenta escribir**, y el resto del paso 4 sigue utilizable.
- [ ] Con la fila presente, la compuerta compara contra su `catalogItemId` y no contra `value === 'FEMALE'`.
- [ ] `wasPregnantAtVaccination` ausente impide el alta; sobre una fila existente se puede dejar en `null` y guardar.
- [ ] 266 y 294 días entre menstruación y parto se guardan; 265 y 295 no. El error aparece **al tocar la fecha**, no al enviar.
- [ ] Informar la menstruación con el campo de parto vacío lo rellena a `+280`; cambiarla con una fecha tecleada a mano **no la toca**.
- [ ] Con el bloque sin guardar, la lista de complicaciones sale deshabilitada; guardarlo la habilita **sin recargar el paso**.
- [ ] Crear la primera complicación pone `hasComplications` y `hasPregnancyComplications` en `'YES'` bloqueados **sin disparar ninguna escritura**; borrar la última los devuelve a editables sin recargar.
- [ ] `pregnancyComplicationsDescription` de la rama grave **sigue siendo texto libre** y no se deriva.
- [ ] Al releer una complicación con `complicationRawName`, el campo del término muestra ese texto y no el del maestro.
- [ ] Un término elegido en el buscador viaja con `source: 'MEDDRA'`; escrito a mano con código, con `LOCAL` explícito; sin código, sin `source`.
- [ ] El `409 NOTIFPRG_001_ALREADY_EXISTS` muestra el mensaje que nombra al SUPERADMIN y **no reintenta ni ofrece crear otro bloque**.
- [ ] Con datos de embarazo cargados, cambiar el sexo a masculino en el paso 1 **no guarda**; «Vaciar el bloque de embarazo» lo limpia con **una sola** escritura y entonces sí guarda.
- [ ] Con complicaciones activas, el diálogo las cuenta y no ofrece vaciar hasta que se retiren; con rol `USER` el texto menciona al administrador.
- [ ] Una `birthDate` o un `eventDate` que dejen la edad fuera de 15–49 bloquean igual que el sexo.
- [ ] En el paso 2, el bloqueo de la compuerta y el **aviso no bloqueante** de las vacunas (FE12c) conviven sin mezclarse: el primero impide guardar, el segundo no.
- [ ] Un `403` en `PREGCOMP-005A` muestra el aviso de §10.4, no un error genérico.
- [ ] `grep -n "ese borrado se avisa" references/CASE-PROCESS.md` no devuelve nada.
- [ ] Las claves nuevas existen en `es`, `en` y `nl`; `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** El bloque y el modal se ven correctos en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/notification/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** La lista de complicaciones colapsa a tarjetas con los dos campos de §3.7, el modal pasa a hoja completa, las dos fechas se apilan, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` el bloque se usa entero —crear y corregir embarazo y complicaciones funcionan— y el `403` del `005A` se explica sin pantalla en blanco. Con `ANALYTICS` no se llega: el guard del asistente redirige.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos la marca «Si aplica», la explicación del campo bloqueado, los placeholders y los `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState` —la lista guarda el id de la complicación, no la fila—, y el `useRef` de la última sugerencia es la excepción razonada, no una copia del servidor.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** el bloque de embarazo **encadenado a la barra de acciones del paso**, sin botón de guardar propio. Es la forma que FE12a dejó para la rama grave, y un segundo botón en el mismo paso enseña al usuario que hay dos cosas que guardar cuando no las hay.
- **No:** un formulario independiente con su propio «Guardar». Habría hecho el bloque autónomo frente al `500` de §10.6, y a cambio habría partido en dos el guardado del paso — un precio más alto que el problema que resolvía.
- **Sí:** **pre-vuelo de `PREGNANCY_FEMALE_SEX_ITEM` con `ESAVI-SYSCONF-006` y, además, el mapeo del `500`.** Lo primero evita ofrecer un formulario condenado; lo segundo cubre el hueco entre la lectura y el guardado. Una sola de las dos deja un caso descubierto.
- **Sí:** comparar el sexo contra el `catalogItemId` de esa fila, no contra `value === 'FEMALE'`. Es lo que compara el `001`, y hacerlo distinto produce la discrepancia de §7.2: un `400 PATIENT_NOT_FEMALE` sobre un bloque que la pantalla mostraba abierto. Con la fila ausente se cae a `value`, que es lo único que queda.
- **Sí:** la derivación de §6.5 **en sus dos mitades** —`notificationPregnancy.hasComplications` y `severeNotification.hasPregnancyComplications`—, aunque la segunda esté en una pantalla que ya existe. FE12a lo dejó anunciado en su §8; derivar sólo una deja la contradicción viva en la mitad más visible.
- **No:** derivar también `pregnancyComplicationsDescription`. Es el resumen, no el recuento: un texto que describe qué pasó no se reconstruye contando filas.
- **Sí:** la derivación **por formulario, sin `PUT` propio**. Los dos valores viajan en el guardado normal del paso, que ya escribe la rama y el bloque encadenados.
- **No:** disparar los dos `PUT` al crear la primera complicación. Son dos escrituras sobre dos tablas que el usuario no pidió, y si la segunda falla queda una rama diciendo `'YES'` sobre un bloque que dice `'NO'` — peor que la incoherencia que se quería cerrar. Es el mismo argumento con el que FE12c rechazó encadenar diluyentes tras el `POST` de la vacuna.
- **Sí:** **bloquear** el cambio que cierra la compuerta, en vez de avisar y limpiar. Corrige `CASE-PROCESS.md` §7.4 igual que FE12b corrigió §7.3 con `takesMedication`: si no hay borrado, no hay nada que avisar.
- **Sí:** que bloqueen **las dos exclusiones** de §7.4, el sexo y la edad. El dato que queda huérfano es el mismo, y una regla que sólo cubre la mitad de sus disparadores se rompe por la otra mitad.
- **No:** que el bloqueo dependa del rol. Se consideró dejar pasar al `USER` que no puede borrar complicaciones, y se descartó: si dependiera del rol, un `USER` produciría exactamente el dato incoherente que al `ADMIN` se le impide producir. Lo que cambia por rol es **el texto**, que nombra la salida.
- **Sí:** el botón «Vaciar el bloque de embarazo» dentro del diálogo del paso 1, con **una sola** escritura `NOTIFPRG-004`. Una escritura sobre una fila que ya existe no puede fallar a medias.
- **No:** que ese botón borre también las complicaciones. Serían N bajas en cascada con `PREGCOMP-005A`, que además es ADMIN: puede fallar a mitad y dejar filas que el usuario cree retiradas. Se retiran una a una, viéndolas, igual que la medicación en FE12b.
- **Sí:** **no llamar nunca a `NOTIFPRG-005A`.** `UQ_notificationPregnancy_notification` no filtra por `deletedAt`, así que una fila retirada sigue ocupando el hueco y sólo un SUPERADMIN puede devolverla. Vaciar con `PUT` conserva el `pregnancyId`, la auditoría y la posibilidad de volver.
- **Sí:** la fecha de parto **sugerida, no calculada**, y con la regla de tres casos. Calcularla en firme escondería la tolerancia de ±14 días, que es justo lo que el backend acepta; sobrescribir lo tecleado destruye la confianza en el campo.
- **Sí:** el rango gestacional **revalidado al tocar cualquiera de las dos fechas**. El error nace de una relación entre dos campos, y esperar al envío lo muestra lejos de donde se produjo.
- **No:** adelantar en el cliente la guarda de duplicados `(término, tipo)`. No hay índice único detrás —es una regla de negocio— y replicarla exigiría comparar ids resueltos que el cliente no siempre tiene. El `409` se explica cuando llega.
- **No:** añadir obligatorios de proceso bajo «Completar etapa». El embarazo es condicional por definición: exigirlo convertiría una compuerta en un requisito, y listarlo como pendiente empuja a rellenarlo con un `UNKNOWN` que no significa nada.
- **Sí:** extraer la compuerta a `usePregnancyGate(caseId)` y hacer que FE12a la consuma. La usan tres bloques en dos pasos —la rama grave, éste y el del paso 5— y `CONVENTIONS.md` §10.4 prohíbe escribirla dos veces.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| **No está verificado si `NOTIFPRG-006` devuelve filas inactivas.** Si no las devuelve, la pantalla cree que no hay bloque y descubre lo contrario con un `409` al guardar | El `409` está mapeado con su mensaje propio y no reintenta, así que el caso está cubierto en el peor supuesto. Se comprueba contra el backend real en el paso 8 del plan; si el `006` sí las devuelve, el aviso aparece **antes** de escribir y el spec gana una nota de implementación |
| El catálogo `pregnancyComplicationType` es el único bloqueante de los tres de §10.5–§10.6: sin sus ítems no hay complicación que registrar, porque el tipo es obligatorio | La referencia lo da por sembrado con tres ítems. Si no lo estuviera, el selector deshabilitado explica que sin esos ítems no hay nada que registrar, y el bloque de embarazo **sigue guardándose** sin complicaciones |
| El bloqueo de los pasos 1 y 2 puede dejar a un `USER` sin salida: no puede retirar complicaciones (`PREGCOMP-005A` es ADMIN) y no puede corregir el paciente | El mensaje nombra la salida —un administrador— en vez de dejar el guardado fallando sin explicación, y §10.4 se vuelve a pedir en §8. Es la razón por la que este spec la reabre en lugar de darla por conocida |
| La derivación de §6.5 deja una ventana en que la base tiene `'NO'` con filas cargadas | Dura lo que tarda un clic en «Guardar», y la pantalla ya muestra `'YES'` bloqueado: lo que el usuario ve es lo que se va a guardar. La alternativa costaba dos escrituras no pedidas |
| `usePregnancyGate` cambia una regla que FE12a ya dejó funcionando sobre dos columnas de la rama grave | El paso 6 del plan verifica que esas dos columnas se ocultan exactamente como antes del cambio, con las cinco filas de la tabla de §3.5 |
| El paso 2 acaba con dos reglas de distinta dureza sobre `eventDate`: el aviso de vacunas de FE12c y este bloqueo | Se declara en §8 con las dos nombradas, para que la implementación no las funda en un solo diálogo. El aviso deja guardar; el bloqueo, no |

---

## 8. Impacto en pantallas existentes

| Pieza | Qué cambia |
|---|---|
| `features/notification/NotificationStep.tsx` (FE12a) | Gana `<PregnancySection>` detrás de la compuerta, encadenada al `useForm` y a la cadena de guardado: cabecera → rama → embarazo |
| El `<AnswerOptionField>` de `hasPregnancyComplications` (FE12a) | **Deja de ser una pregunta libre.** Con ≥1 complicación activa pasa a `'YES'` bloqueado, con la explicación de §6.5. Es el único campo de la rama grave que este spec toca; `pregnancyComplicationsDescription` no cambia |
| La compuerta de §7.4 en línea de `NotificationStep` (FE12a) | Se **sustituye** por `usePregnancyGate(caseId)`, que además compara contra el `catalogItemId` de la configuración. Las dos columnas de la rama grave siguen ocultándose igual |
| `features/patient/PatientStep.tsx` (FE10) | Gana el bloqueo de §7.4: no se guarda un cambio de `sexItemId` o `birthDate` que cierre la compuerta mientras haya datos de embarazo. Diálogo con el recuento, el texto por rol y el botón «Vaciar el bloque de embarazo» |
| El `<DateField>` de `eventDate` en `CaseOpeningStep` (FE10) | Gana **el segundo** de sus dos controles cruzados. FE12c le puso un **aviso no bloqueante** sobre las vacunas; éste le pone un **bloqueo** sobre el embarazo. Son dos reglas distintas y **no se funden en un solo diálogo** |
| `features/notification/api.ts` | Dos recursos nuevos. **Ninguno declara `005A` para el embarazo**, deliberadamente |
| `shared/hooks/useSystemConfigByCode.ts` | **Nuevo.** A partir de aquí es de todos: §10.1 lo necesita para el código de país, y cualquier lectura de configuración por código pasa por él. No se copia |
| `<SatelliteList>` (FE12b) y `<MeddraSearchField>` (FE12b) | Se consumen **sin cambios**. Si hiciera falta una variante, es una prop nueva, nunca una copia local |
| `<AnswerOptionField>` (FE12a) | Gana la capacidad de mostrarse **bloqueado con una explicación**, por `aria-describedby`. Es una prop, no una variante: la reutiliza el campo de `takesMedication` que FE12b ya deshabilita |
| `references/CASE-PROCESS.md` | §7.4 deja de decir que el borrado del bloque «se avisa» y pasa a decir que el cambio no se puede guardar mientras haya datos |
| `references/CASE-PROCESS.md` §10.4 | Se vuelve a pedir, con el argumento nuevo: `PREGCOMP-005A` en ADMIN deja de ser una molestia y pasa a ser un callejón sin salida en cuanto el bloqueo de §7.4 entra en juego |

**Y lo que este spec cierra del paso 4:** con FE12a, FE12b, FE12c y éste, las seis satélites de la notificación están construidas y las 64 columnas de §5.4b tienen pantalla. Lo siguiente es FE13, que consume `usePregnancyGate` para el bloque de embarazo del paso 5 —nueve columnas bajo una segunda compuerta propia— sin volver a escribirla.

---

## Lo que **no** está en este spec

- El bloque de embarazo del paso 5: `isPregnancyConfirmed`, sus nueve columnas e `investigationPregnancyCondition` (FE13).
- Sembrar `PREGNANCY_FEMALE_SEX_ITEM`. Es §10.6, del otro repositorio.
- Dar de baja o reactivar la fila de embarazo. `NOTIFPRG-005A` no se llama nunca y `005B` es SUPERADMIN.
- Reactivaciones y purgas de complicaciones.
- Revisar los términos acuñados por la rama `LOCAL` en `diagnosticTerm`.
- Reordenar filas de satélite.
- Nuevos obligatorios de proceso bajo «Completar etapa».
- La comprobación de `CLOSED` en el servidor.

Cada uno de esos, si aterriza, va en su propio spec.

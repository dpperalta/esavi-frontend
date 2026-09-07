# SPEC FE12a — Paso 4: notificación, cabecera y rama

> **Estado:** Aprobado
> **Depende de:** SPEC FE08 (armazón del wizard), SPEC FE10 (paciente y apertura del caso — de ahí salen el sexo y la fecha del evento), SPEC FE11 (clasificación inicial — de ahí sale la gravedad). Del backend: SPEC F10 (notification), SPEC F13 (severeNotification), SPEC F14 (nonSevereNotification), SPEC F44 (case-workflow) y SPEC F46 (`code` frente a `value` en `catalogItem`).
> **Fecha:** 2026-09-04
> **Objetivo:** El paso 4 del wizard — la cabecera de la notificación y su ficha grave o no grave — con la gravedad derivada del paso 3 y sin los seis satélites.

---

## 1. Por qué existe este spec

**Hoy el paso 4 es un recuadro punteado con la palabra `notification` dentro.** `CaseWizardPage.tsx:132-136` pinta ese marcador para todo paso que no sea `patient`, `case-opening` ni `classification`. Un caso se abre, se clasifica y llega al paso 4 sin nada que rellenar: el expediente se queda en `IN_CLASSIFICATION` para siempre.

**Sin la cabecera no hay fase de notificación.** `notificationStartedAt` lo sella la creación de la fila de `notification`, no el hecho de visitar el paso (`CASE-PROCESS.md` §2). Mientras el `POST` de `ESAVI-NOTIFCN-001` no salga, `stages.notification.exists` es `false`, «Completar etapa» está deshabilitado y el estado del expediente no avanza. Es el mismo mecanismo que FE11 ya montó para la clasificación.

**Es el lado cliente de tres specs del backend** — SPEC F10 para la cabecera, F13 y F14 para las dos ramas — y de una regla que no está en ninguno de los tres validadores: la de fallecimiento, que vive en `notification.service.ts:168-189` porque depende del `value` del `catalogItem` que hay detrás de `outcomeItemId` y el validador sólo ve un UUID opaco.

**Tres cosas que este spec deja construidas para los que vienen después:**

- **`<AnswerOptionField>`**, la primitiva de `ARCHITECTURE.md` §4.3 que aquí aparece siete veces y en el resto del expediente cuarenta. FE12b y los cuatro specs de FE13 la consumen sin volver a escribirla.
- **`useCatalogItemsByTypeCode`**, el hook que permite comparar contra `catalogItem.value` en vez de contra `code` o `name`. Lo necesita `outcome → DEATH` aquí mismo, `sex → FEMALE` para la compuerta de embarazo, y `CASE-PROCESS.md` §7.2 anticipa un tercer caso en el paso 5.
- **La respuesta a `requestInvestigation`**, que decide si el paso 5 existe para este caso. No se deriva de la gravedad, y es deliberado: un evento no grave puede investigarse y uno grave puede no requerirlo.

**Y cierra un callejón sin salida que hoy está abierto.** Derivar `notificationType` de `classification.isSeriousEvent` (§6.1) sólo funciona si el paso 3 deja de admitir cambios de gravedad en cuanto existe la notificación: `ESAVI-NOTIFCN-004` ignora `notificationType` llegue o no, y las dos ramas no tienen `005A` ni `005B` —sólo `005C`, purga física de SUPERADMIN—. Sin ese cierre, un usuario puede volver al paso 3, marcar el caso como grave y quedarse con una ficha de no grave colgando para siempre, sin que nada se lo diga.

---

## 2. Alcance

**Dentro:**

- **`features/esaviCase/NotificationStep.tsx`**, que sustituye el marcador de `CaseWizardPage.tsx:132-136` para el paso `notification`.
- **La cabecera**: las nueve columnas de `notification` que se piden (`esaviDescription`, `hasRelevantMedicalHistory`, `takesMedication`, `outcomeItemId`, `requestInvestigation`, `deathDate`, `autopsyRequested`, `verbalAutopsyPerformed`, `notes`). `caseId` y `notificationType` son derivados y no se muestran como campos editables.
- **La rama grave**: las siete columnas de `severeNotification` que se piden, con las dos de embarazo detrás de la compuerta de §7.4.
- **La rama no grave**: las doce columnas de `nonSevereNotification` que se piden, incluidos los seis `verified*` y la unidad de vacunación **sin filtro de cobertura geográfica**.
- **La cadena cabecera → rama** en un solo «Guardar»: `POST` de la cabecera, y con el `notificationId` devuelto, `POST` de la rama. Si la segunda falla, la cabecera queda creada y la rama se reintenta en su sitio.
- **Dos esquemas Zod**: `notificationSaveSchema` (sólo `esaviDescription`) y `notificationCompleteSchema` (los obligatorios de proceso), según `CASE-PROCESS.md` §4.6.
- **La sección de fallecimiento**, que aparece con `outcome.value === 'DEATH'` y al desaparecer limpia sus tres campos a `null` en el mismo `PUT`.
- **`<AnswerOptionField>`** en `shared/components/`, variantes `unknown` y `full`, como `<Select>` de tres opciones.
- **`useCatalogItemsByTypeCode`** en `shared/`, del que pasa a tirar también `<CatalogSelect>` sin cambiar su comportamiento.
- **`ScopedHealthFacilitySelect` → `HealthFacilitySelect`** con una prop `scoped` (por defecto `true`; `false` en la unidad de vacunación).
- **El congelado de la compuerta de gravedad del paso 3** cuando `stages.notification.exists === true`, con su explicación en pantalla (§6.1).
- **La corrección del patrón de estado de FE11**: `classificationId` deja de vivir en `useState` y pasa a leerse de la caché.
- **`persist` en `draftsStore`**, con su regla de conflicto y su limpieza al cerrar sesión.
- **Mapeo de los códigos de error** de las tres entidades a campo o a toast, y las claves i18n nuevas en `es`, `en` y `nl`.
- **La corrección de `CASE-PROCESS.md`** §5.4 y §7.3, que afirman que la regla de `pregnancyComplicationsDescription` no la impone el backend cuando `severeNotification.service.ts:131-157` sí la impone.
- **Tests de integración** de `NotificationStep`.

**Fuera de alcance (otros specs):**

- **Los seis satélites del paso 4** — `notificationEvent`, `notificationVaccine`, `notificationDiluent`, `notificationMedication`, `notificationPregnancy` y `notificationPregnancyComplication`. Son FE12b, con sus 64 columnas y sus dos niveles de anidamiento.
- **Y por tanto las cuatro primitivas que sólo ellos necesitan**: `<SatelliteList>`, `<WhodrugTreePicker>`, `<MeddraSearchField>` y `<SearchableSelect>`.
- **Derivar `hasPregnancyComplications` de las filas de complicación** (§6.5). Hoy es una pregunta libre; FE12b la convierte en derivada y bloqueada cuando existan filas. Se pidió adelantarlo y se aplazó: `notificationPregnancyComplication` exige un `pregnancyId` que sólo existe tras `ESAVI-NOTIFPRG-001`, bloqueado a su vez por la fila `systemConfig` `PREGNANCY_FEMALE_SEX_ITEM` de §10.6.
- **El paso 5**, aunque `requestInvestigation` decida si existe. Es FE13a–d.
- **Bajas, reactivaciones y purgas** de las tres entidades: los `005A`, `005B` y `005C` no se exponen. Cambiar la gravedad de un caso ya notificado exige un SUPERADMIN y se resuelve fuera del asistente.
- **Los listados de notificaciones** `ESAVI-NOTIFCN-002A`/`002B` y el detalle por id `003`. Esta pantalla lee siempre por caso, con los tres `006`.
- **La comprobación de `CLOSED` en el servidor** (§10.3). Sigue viviendo entera en el cliente, igual que en FE11.

---

## 3. Diseño

### 3.1 Pantallas y rutas

**No hay ruta nueva ni entrada de menú nueva.** El paso vive dentro de la ruta del asistente que FE08 ya declaró, y el menú ya ofrece «Registrar» y «Ver/editar».

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Paso 4 del asistente | `/esavi-cases/:id/wizard/notification` | `features/esaviCase/NotificationStep.tsx` | el de `CaseWizardPage` (FE08), `<RequireRole level={USER}>` |

`USER` es el rol mínimo real de las nueve rutas de §3.2, así que el guard heredado del asistente es exacto y no hace falta estrecharlo. Un `ANALYTICS` (nivel 10) no llega: el guard del asistente ya lo rechaza.

### 3.2 Endpoints consumidos

**Escrituras y lecturas propias del paso**, copiadas de `references/API-ROUTES.md`:

```
POST /api/notifications                        ESAVI-NOTIFCN-001    USER   crear cabecera
GET  /api/notifications/case/:id               ESAVI-NOTIFCN-006    USER   leer cabecera del caso
PUT  /api/notifications/:id                    ESAVI-NOTIFCN-004    USER   actualizar cabecera

POST /api/severe-notifications                 ESAVI-SEVNOT-001     USER   crear ficha grave
GET  /api/severe-notifications/case/:id        ESAVI-SEVNOT-006     USER   leer ficha grave
PUT  /api/severe-notifications/:id             ESAVI-SEVNOT-004     USER   actualizar ficha grave

POST /api/non-severe-notifications             ESAVI-NSEVNOT-001    USER   crear ficha no grave
GET  /api/non-severe-notifications/case/:id    ESAVI-NSEVNOT-006    USER   leer ficha no grave
PUT  /api/non-severe-notifications/:id         ESAVI-NSEVNOT-004    USER   actualizar ficha no grave
```

**Lecturas de otras entidades que el paso necesita**, todas ya implementadas por specs anteriores:

```
GET  /api/case-workflows/case/:id              ESAVI-CASEFLOW-006   USER   estado y stages (FE08)
GET  /api/classifications/case/:id             ESAVI-CLASSIF-006    USER   isSeriousEvent y edad (FE11)
GET  /api/esavi-cases/:id                      ESAVI-CASE-003       USER   eventDate (FE09/FE10)
GET  /api/patients/:id                         ESAVI-PATIENT-003    USER   sexItemId (FE10)
GET  /api/catalog-types                        ESAVI-CATTYPE-002    USER   typeCode -> catalogTypeId
GET  /api/catalog-items/type/:id               ESAVI-CATITEM-002A   USER   outcome, vaccinationSite, sex
GET  /api/health-facilities/search             ESAVI-HFAC-006       USER   unidad de vacunación
GET  /api/geo-locations                        ESAVI-GEOLOC-002     USER   <GeoLocationPicker>
```

**Qué no se consume, y por qué:**

- **`ESAVI-NOTIFCN-003`** (detalle por id). Esta pantalla siempre parte del `caseId` de la URL, así que el `006` es la lectura correcta: devuelve la fila del caso sin que el cliente tenga que guardar un id en ninguna parte.
- **`ESAVI-NOTIFCN-002A`/`002B`** (listados). No hay pantalla de listado de notificaciones en este spec.
- **`005A`, `005B` y `005C`** de las tres entidades. Ni el asistente da de baja notificaciones ni purga ramas; la purga es SUPERADMIN y se hace fuera.
- **De los dos `006` de rama se llama sólo uno**, el que corresponde a `notificationType`. La rama contraria no existe por definición y pedirla es un `404` garantizado en cada carga del paso.

### 3.3 Tipos del contrato

**Tres archivos nuevos por `contracts:sync`**, añadiendo tres entradas al `SYNC_MAP` de `scripts/syncContracts.mjs`:

```ts
// contracts/notification.ts — espejo de esavi-backend/src/types/notification/
export interface CreateNotificationInput {
  caseId: string;
  notificationType: 'SEVERE' | 'NON_SEVERE';
  esaviDescription: string;
  hasRelevantMedicalHistory?: AnswerOption | null;
  takesMedication?: AnswerOption | null;
  outcomeItemId?: string | null;
  requestInvestigation?: boolean;   // el único booleano opcional sin `| null`
  deathDate?: string | null;
  autopsyRequested?: boolean | null;
  verbalAutopsyPerformed?: boolean | null;
  notes?: string | null;
  isActive?: boolean;
}
```

`severeNotification.ts` y `nonSevereNotification.ts` traen `CreateSevereNotificationInput` y `CreateNonSevereNotificationInput`. En las dos, `notificationId` es obligatorio **porque es la PK que envía el cliente**, y es inmutable después: el servicio del `004` lo ignora aunque llegue.

El ENUM `AnswerOption` (`'YES' | 'NO' | 'UNKNOWN' | 'NOT_APPLICABLE' | 'NO_ANSWER'`) se declara una vez en `contracts/common.ts` — lo comparten siete tablas del esquema y va a reaparecer en FE12b y en los cuatro specs de FE13.

**Tres archivos escritos a mano en `contracts/declared/`**, porque el backend construye estas respuestas como literales y `contracts:sync` nunca escribe en esa carpeta. Lo que hay que saber de ellas, verificado en los servicios:

| Respuesta | Qué excluye | Qué resuelve en su lugar |
|---|---|---|
| `NotificationDetail` | `caseId`, `outcomeItemId` | `case { caseId, caseCode, reportDate, eventDate }` y **`outcome { catalogItemId, code, name, value }`** |
| `SevereNotificationDetail` | — | `notification { notificationId, notificationType, esaviDescription, isActive, case {...} }` |
| `NonSevereNotificationDetail` | `vaccinationHealthFacilityId`, `vaccinationSiteItemId`, `vaccinationGeoLocationId` | `vaccinationHealthFacility { healthFacilityId, name, localCode }`, `vaccinationSite { catalogItemId, code, name }`, `vaccinationGeoLocation { geoLocationId, name, level }` |

**Tres consecuencias prácticas de esa forma:**

- **`outcome.value` viaja en la respuesta.** Al releer una notificación guardada, la pantalla sabe si el desenlace es muerte sin resolver nada. El hook `useCatalogItemsByTypeCode` hace falta para el otro momento — mientras el usuario **elige** en el desplegable y todavía no hay respuesta del servidor.
- **La respuesta devuelve objetos y el formulario necesita ids.** Al reentrar hay que mapear `vaccinationHealthFacility.healthFacilityId` de vuelta al campo, y el `name` sirve de `resolvedLabel` del selector. Es el mismo mapeo que `CaseOpeningStep` hace con la unidad de salud del caso.
- **`nonSevereNotification` no tiene `isActive`.** La tabla no lleva esa columna: el estado real es el `isActive` de la cabecera.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId` y paso activo | URL | params de `/esavi-cases/:id/wizard/:step` | los declaró FE08 |
| Estado del expediente y `stages` | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | sin `staleTime`; se invalida tras cada escritura |
| Gravedad y edad del paso 3 | TanStack Query | `['classification', 'byCase', caseId]` | sólo lectura; de `isSeriousEvent` sale `notificationType` |
| `eventDate` del caso | TanStack Query | `['esaviCase', 'detail', caseId]` | |
| `sexItemId` del paciente | TanStack Query | `['patient', 'detail', patientId]` | compuerta de §7.4 |
| Cabecera | TanStack Query | `['notification', 'byCase', caseId]` | |
| Ficha grave | TanStack Query | `['severeNotification', 'byCase', caseId]` | `enabled` sólo con `SEVERE` |
| Ficha no grave | TanStack Query | `['nonSevereNotification', 'byCase', caseId]` | `enabled` sólo con `NON_SEVERE` |
| Ítems de `outcome`, `vaccinationSite` y `sex` | TanStack Query | `['catalogItem', 'byType', catalogTypeId]` | `staleTime` 30 min |
| Valores del formulario | React Hook Form | `useForm` de `NotificationStep` | |
| `notificationId` recién creado | TanStack Query | `setQueryData(['notification','byCase',caseId], created)` | nunca `useState` |
| **Borrador sin guardar** | **Zustand `draftsStore`, persistido** | `drafts[caseId]['notification']` | desviación razonada; contrato abajo |
| Visibilidad de la sección de fallecimiento | derivado en render | `outcome.value === 'DEATH'` | no es estado |
| Apertura de la compuerta de embarazo | derivado en render | sexo + edad (§7.4) | no es estado |
| Diálogo de confirmación | Componente | `useState` | efímero |

**Los cuatro puntos obligatorios:**

**1 · Nada del servidor en `useState`.** `notificationId` es el caso que lo tensa: entre el `POST` de la cabecera y el de la rama hace falta ya. Se escribe en la caché con `setQueryData` en cuanto responde el `001` y de ahí lo lee la rama. **Y este spec corrige el mismo patrón en FE11**: `ClassificationStep.tsx:219` guarda `classificationId` en `useState` sembrado desde la respuesta del `POST`, y pasa a leerlo de su caché igual que aquí.

**2 · Ningún filtro fuera de `searchParams`.** Esta pantalla no tiene filtros ni paginación. La regla no aplica y se dice, en vez de callarla.

**3 · `staleTime` por naturaleza del dato.** Los tres catálogos heredan los 30 minutos de `catalogItemResource`. Las seis lecturas del expediente no llevan `staleTime` y se invalidan tras cada escritura.

**4 · Qué invalida qué.** Tras el `POST`/`PUT` de la cabecera: `['notification','byCase',caseId]` y `['caseWorkflow','byCase',caseId]` — el `001` sella `notificationStartedAt`, y `stages.notification.exists` es justo lo que lee §6.1 para congelar la compuerta del paso 3. Tras el `POST`/`PUT` de la rama: sólo su clave; la rama no toca el workflow.

#### El borrador persistido — desviación razonada de `ARCHITECTURE.md` §3.4

`draftsStore` gana `persist`. La norma lo desaconsejaba porque *«un borrador que sobreviva a una recarga competiría con la fila que ya responde a la misma pregunta»*; se acepta la desviación y se cierra esa competencia con una regla de conflicto explícita, porque perder lo tecleado al cerrar la pestaña es un daño concreto y la competencia es evitable.

**Qué se guarda:** `{ values, baseUpdatedAt, savedAt }`. `values` son los del formulario; `baseUpdatedAt` es el `updatedAt` de la fila desde la que se empezó a editar, o `null` si todavía no había fila.

**Cuándo:** en cada cambio del formulario, con rebote de 500 ms — `persist` escribe en `localStorage` en cada `set`, y sin rebote sería una escritura por tecla.

**Cuándo se lee:** sólo al montar el paso. Nunca después.

**Cuándo se borra:** en cuanto el `POST` o el `PUT` responde correctamente.

**La regla de conflicto — gana la fila:**

| Al montar | Qué se hace |
|---|---|
| No hay borrador | Se usa la fila |
| Hay borrador y `baseUpdatedAt` coincide con el `updatedAt` de la fila | **Se restaura el borrador** sobre los valores de la fila, con un aviso de que hay cambios sin guardar recuperados |
| Hay borrador y el `updatedAt` de la fila es distinto | **Gana la fila.** El borrador se descarta y se avisa de que se descartaron cambios sin guardar porque el caso se editó en otro sitio |
| Hay borrador sin fila y ahora existe fila | Ídem: gana la fila |

Así el borrador sólo restaura cuando nadie tocó la fila mientras tanto, que es el caso normal, y nunca pisa lo que el servidor ya sabe.

**Y se borra al cerrar sesión.** `esaviDescription` es texto clínico libre sobre un paciente identificado. Persistido en `localStorage`, sobreviviría al logout en un puesto compartido, así que el store se limpia en el mismo sitio donde se limpia el token (`TokenStore`, `ARCHITECTURE.md` §11.1).

### 3.5 Formularios y validación

**Un solo `useForm` para las tres tablas.** El usuario ve un formulario; el reparto en tres filas es del modelo. Los valores se separan al construir los cuerpos de cada petición.

#### Los dos esquemas — `features/notification/schemas.ts`

| Esquema | Qué exige | Cuándo corre |
|---|---|---|
| `notificationSaveSchema` | Sólo `esaviDescription`: `trim` y no vacío | Al pulsar **Guardar** |
| `notificationCompleteSchema` | Lo anterior más los obligatorios de proceso marcados abajo | Al pulsar **Completar etapa** |

`caseId` y `notificationType` no están en ninguno de los dos: son derivados y no se editan. Los campos que faltan para completar la etapa **no bloquean el guardado**: se listan en la barra de acciones, que es lo que `CaseWizardActionBar` ya hace con `getPendingFields()`.

#### Cabecera — `notification`

| Campo | Control | Guardar | Completar | Regla |
|---|---|---|---|---|
| `esaviDescription` | `<Textarea>` | **sí** | sí | `trim`, no vacío. Sin él no hay fila que crear |
| `hasRelevantMedicalHistory` | `<AnswerOptionField variant="unknown">` | no | sí | |
| `takesMedication` | `<AnswerOptionField variant="unknown">` | no | sí | gobierna la lista de medicación de FE12b |
| `outcomeItemId` | `<CatalogSelect typeCode="outcome" emit="id">` | no | sí | gobierna la sección de fallecimiento **por `value`** |
| `requestInvestigation` | dos opciones Sí/No, nacen sin responder | no | sí | mientras no se responda **no viaja en el cuerpo**; nunca se envía `null` |
| `deathDate` | `<DateField allowFuture={false}>` | no | sí, con muerte | no futura y no anterior a `case.eventDate` |
| `autopsyRequested` | switch | no | sí, con muerte | `false` cuenta como respondido |
| `verbalAutopsyPerformed` | switch | no | no | opcional incluso con muerte |
| `notes` | `<Textarea>` | no | no | |

> **`deathDate` no anterior a `eventDate` es regla del cliente.** El servicio incluye `eventDate` en la respuesta precisamente para eso — *«es la fecha contra la que un cliente contrasta `deathDate`, aunque este spec no lo valide en el servidor»* (`notification.service.ts:30-32`). Ahorra un dato imposible que nadie detectaría después.

#### Rama grave — `severeNotification`

| Campo | Control | Guardar | Completar | Regla |
|---|---|---|---|---|
| `hasPreviousEventHistory` | `<AnswerOptionField variant="unknown">` | no | sí | |
| `hasAllergyToOtherVaccines` | ídem | no | sí | |
| `hasAllergyToMedications` | ídem | no | sí | |
| `hasAllergyToPreviousSameVaccine` | ídem | no | sí | |
| `hasPregnancyComplications` | ídem | no | sí, si la compuerta está abierta | sólo mujer en edad fértil (§7.4) |
| `pregnancyComplicationsDescription` | `<Textarea>` | no | sí, con `'YES'` | condicional estricta; el backend la impone |
| `notes` | `<Textarea>` | no | no | |

#### Rama no grave — `nonSevereNotification`

| Campo | Control | Guardar | Completar | Regla |
|---|---|---|---|---|
| `vaccinationHealthFacilityId` | `<HealthFacilitySelect scoped={false}>` | no | sí | **sin filtro de cobertura**: el backend sólo comprueba `isActive` |
| `vaccinationSiteItemId` | `<CatalogSelect typeCode="vaccinationSite" emit="id">` | no | sí | |
| `vaccinationCenterAddress` | `<Input maxLength={250}>` | no | no | único campo con longitud declarada |
| `vaccinationGeoLocationId` | `<GeoLocationPicker>` | no | sí | |
| `verifiedPhysicalDocument` … `verifiedOtherSource` | seis switches | no | **al menos uno** | no excluyentes; `null` y `false` son equivalentes para el servidor |
| `otherSourceDescription` | `<Textarea>` | no | sí, con `verifiedOtherSource === true` | condicional estricta contra `true` |
| `notes` | `<Textarea>` | no | no | |

#### Las tres reglas condicionales, y qué significa «limpiar» en cada una

Las tres tienen la misma forma de §7.3 — se muestra, y al ocultarse se limpia — pero **el valor de limpieza no es el mismo**, y confundirlo produce un `400`:

| Bloque | Se muestra con | Al ocultarse se pone a | Si no |
|---|---|---|---|
| Fallecimiento (3 campos) | `outcome.value === 'DEATH'` | **`null`, nunca `false`** | `NOTIFCN_00X_DEATH_FIELDS_NOT_ALLOWED` |
| `pregnancyComplicationsDescription` | `hasPregnancyComplications === 'YES'` | `null` | `SEVNOT_00X_PREGNANCY_DESCRIPTION_NOT_ALLOWED` |
| `otherSourceDescription` | `verifiedOtherSource === true` | `null` | `NSEVNOT_00X_OTHER_SOURCE_DESCRIPTION_NOT_ALLOWED` |

> **`autopsyRequested` es el que engaña.** `isInformed` en el servicio es `value !== undefined && value !== null` (`notification.service.ts:169`), así que un switch apagado vale `false` y **cuenta como informado**. Bajo muerte eso es correcto —un «no se solicitó autopsia» es una respuesta—, pero al cambiar el desenlace a «Recuperado» hay que mandar `null`: apagar el switch dejaría `false` y el `PUT` respondería `400`.

**La regla de muerte se evalúa sobre el estado resultante, no sobre el cuerpo** (`notification.service.ts:371-384`). Como `CONVENTIONS.md` §6.5 manda enviar el objeto completo en el `PUT`, los tres campos viajan en `null` en la misma petición que mueve el desenlace, y eso los limpia. No hay que calcular ningún diff.

#### Errores del backend mapeados

**Al campo:**

| Código | Campo |
|---|---|
| `NOTIFCN_001_OUTCOME_NOT_FOUND`, `NOTIFCN_004_OUTCOME_NOT_FOUND` | `outcomeItemId` |
| `NOTIFCN_001_DEATH_FIELDS_REQUIRED`, `NOTIFCN_004_DEATH_FIELDS_REQUIRED` | `deathDate` |
| `SEVNOT_001_PREGNANCY_DESCRIPTION_REQUIRED`, `SEVNOT_004_…` | `pregnancyComplicationsDescription` |
| `SEVNOT_001_PREGNANCY_DESCRIPTION_NOT_ALLOWED`, `SEVNOT_004_…` | ídem |
| `NSEVNOT_001_OTHER_SOURCE_DESCRIPTION_REQUIRED`, `NSEVNOT_004_…` | `otherSourceDescription` |
| `NSEVNOT_001_OTHER_SOURCE_DESCRIPTION_NOT_ALLOWED`, `NSEVNOT_004_…` | ídem |
| `NSEVNOT_001_HEALTH_FACILITY_NOT_FOUND`, `NSEVNOT_004_…` | `vaccinationHealthFacilityId` |
| `NSEVNOT_001_VACCINATION_SITE_NOT_FOUND`, `NSEVNOT_004_…` | `vaccinationSiteItemId` |
| `NSEVNOT_001_GEOLOCATION_NOT_FOUND`, `NSEVNOT_004_…` | `vaccinationGeoLocationId` |

**Con comportamiento propio, no sólo texto:**

| Código | Qué hace la pantalla |
|---|---|
| `SEVNOT_001_ALREADY_EXISTS`, `NSEVNOT_001_ALREADY_EXISTS` | **Se trata como éxito**: la rama ya estaba creada por un intento anterior cuya respuesta se perdió. Se relee con su `006` y se sigue |
| `NOTIFCN_001_CASE_ALREADY_NOTIFIED` | El caso ya tiene notificación: se invalida `['notification','byCase',caseId]` y se recarga, en vez de insistir |
| `SEVNOT_001_NOTIFICATION_NOT_SEVERE`, `NSEVNOT_001_NOTIFICATION_NOT_NON_SEVERE` | La rama no corresponde al tipo. Se invalida el workflow y la clasificación: significa que la gravedad no es la que esta pestaña creía |
| `NOTIFCN_004_DEATH_FIELDS_NOT_ALLOWED` | Al campo `outcomeItemId`, no a `deathDate`: lo que sobra es la combinación, y el campo que el usuario acaba de tocar es el desenlace |

**Al toast, por `code`**, en `shared/api/errorMessages.ts`: los `_CREATION_FAILED`, `_UPDATE_FAILED`, `_NOT_FOUND` y `_CASE_NOT_FOUND` de las tres entidades. Ninguno debería alcanzarse en uso normal, así que comparten un texto genérico por entidad en vez de uno por código — el mismo criterio que FE11 aplicó a los `CLASSIF_*`.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Esqueleto del formulario mientras resuelven workflow, clasificación, caso, paciente y las lecturas del paso | — |
| Sin notificación todavía | El formulario en blanco, con `notificationType` ya resuelto y la rama que corresponde visible. **No es un estado vacío con ilustración**: es el estado normal de la primera visita | — |
| Con notificación | El formulario relleno desde los `006`, más el borrador si la regla de conflicto lo restaura | — |
| Error de lectura | Mensaje del `EsaviApiError` por `code` y botón de reintentar | `notification.error.load` |
| Caso cerrado | Formulario entero en sólo lectura y el aviso que ya pinta `CaseWizardPage` (FE08). Ni «Guardar» ni «Completar etapa» | reutiliza las de FE08 |
| **Clasificación desactivada** (§6.2) | **No se muestra el formulario.** Aviso de que la clasificación del caso está dada de baja y de que hace falta reactivarla antes de notificar, indicando que la reactivación es de un administrador | `notification.blocked.classificationInactive` |
| Catálogo `outcome` sin sembrar | `<CatalogSelect>` deshabilitado con su explicación, no un desplegable vacío. Es comportamiento de la primitiva, no un parche de este paso | reutiliza las de `CatalogSelect` |
| Sin permiso | No se llega: el guard del asistente ya rechaza por debajo de `USER` | — |

**El estado bloqueado por clasificación desactivada no ofrece el botón de reactivar.** `ESAVI-CLASSIF-005B` es SUPERADMIN, y pintar un botón que va a dar `403` a casi todo el mundo es peor que explicar qué falta y a quién pedírselo. El aviso nombra la acción; no la ejecuta.

### 3.7 Responsividad y accesibilidad

- **Una sola columna por debajo de `md`**, y dos por encima para los bloques de campos cortos (fechas, switches). Las áreas de texto ocupan el ancho completo en los dos casos.
- **Un solo scroll con secciones**, no pestañas: *Descripción y antecedentes* → *Desenlace* (con la sección de fallecimiento) → *Investigación* → *Ficha grave / no grave* → *Observaciones*. Con pestañas, «Completar etapa» listaría campos pendientes escondidos detrás de una pestaña cerrada.
- **La barra de acciones ya queda fija abajo** por debajo de `md`; la pinta `CaseWizardActionBar` y este paso no la toca.
- Objetivos táctiles de 44 px en switches y opciones; `dvh`, nunca `vh`.
- **La sección de fallecimiento aparece dentro de una región `aria-live="polite"`.** Aparece por un cambio en otro control, y sin anuncio un lector de pantalla no se entera de que acaban de aparecer tres campos obligatorios.
- **El bloque de embarazo lleva su marca «Si aplica» como texto visible**, no como `title` ni como color: es información, no decoración.
- Cada `<AnswerOptionField>` lleva su etiqueta asociada; los seis switches de verificación van dentro de un `fieldset` con `legend`, que es lo que dice que las seis son una misma pregunta.
- `<CatalogSelect>`, `<HealthFacilitySelect>` y `<GeoLocationPicker>` ya traen su `ariaLabel` por i18n.

### 3.8 Claves i18n nuevas

Todas bajo `notification.*`, en `es`, `en` y `nl`:

| Grupo | Claves |
|---|---|
| Cabecera | `notification.fields.esaviDescription`, `.hasRelevantMedicalHistory`, `.takesMedication`, `.outcomeItemId`, `.requestInvestigation`, `.notes` |
| Ayuda | `notification.help.requestInvestigation` — explica que no depende de la gravedad |
| Fallecimiento | `notification.death.sectionTitle`, `.deathDate`, `.autopsyRequested`, `.verbalAutopsyPerformed` |
| Rama grave | `notification.severe.sectionTitle`, `.hasPreviousEventHistory`, `.hasAllergyToOtherVaccines`, `.hasAllergyToMedications`, `.hasAllergyToPreviousSameVaccine`, `.hasPregnancyComplications`, `.pregnancyComplicationsDescription` |
| Rama no grave | `notification.nonSevere.sectionTitle`, `.vaccinationHealthFacilityId`, `.vaccinationSiteItemId`, `.vaccinationCenterAddress`, `.vaccinationGeoLocationId`, `.verificationLegend`, y las seis `.verified*` |
| Embarazo | `notification.pregnancy.ifApplicable` — la marca «Si aplica» de §7.4 |
| Validación | `notification.validation.esaviDescriptionRequired`, `.deathDateBeforeEventDate`, `.deathDateFuture`, `.atLeastOneVerificationSource`, `.pregnancyDescriptionRequired`, `.otherSourceDescriptionRequired` |
| Pendientes | `notification.pending.*` — el texto de cada campo en la lista de «Completar etapa» |
| Bloqueos y avisos | `notification.blocked.classificationInactive`, `notification.draft.restored`, `notification.draft.discarded` |
| Errores | `notification.error.load`, `notification.error.generic`, `notification.error.severeGeneric`, `notification.error.nonSevereGeneric` |
| Paso 3 congelado | `classification.gate.lockedByNotification` — vive bajo `classification.*` porque es texto de esa pantalla |
| `<AnswerOptionField>` | `common.answerOption.yes`, `.no`, `.unknown`, `.notApplicable`, `.noAnswer` — bajo `common` porque las consumen cuarenta columnas |

**Las cinco de `common.answerOption` incluyen `noAnswer` aunque este cliente no lo ofrezca nunca.** Por §7.1, el campo renderiza al leer cualquier valor que encuentre, incluido uno cargado por otro cliente; sin la clave, esa fila mostraría el desplegable en blanco y lo perdería en el siguiente `PUT`.

---

## 4. Plan de implementación

Dieciséis pasos. Los dos primeros corrigen; el resto amplía. Cada uno deja el proyecto compilando y se puede committear solo. **Las claves i18n nuevas de cada paso se añaden en los tres idiomas dentro de ese mismo paso**, no al final.

1. **Corregir `CASE-PROCESS.md`.** §5.4 y §7.3 afirman que la regla de `pregnancyComplicationsDescription` no la impone el backend. `severeNotification.service.ts:131-157` la impone en `001` y `004`, simétrica y sobre el estado resultante. Se corrigen las dos líneas y se añade la referencia al servicio.
   *Verificación:* `grep -n "Regla del cliente" references/CASE-PROCESS.md` no devuelve la línea de `pregnancyComplicationsDescription`.

2. **Sacar `classificationId` de `useState` en FE11.** `ClassificationStep.tsx:219` copia un dato remoto a estado local. Pasa a escribirse en la caché con `setQueryData(['classification','byCase',caseId], created)` y a leerse de ahí.
   *Verificación:* `npx vitest run src/features/esaviCase/ClassificationStep.test.tsx` sigue en verde; crear una clasificación y editarla sin recargar sigue haciendo `PUT` y no un segundo `POST`.

3. **Contratos.** Tres entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`, `npm run contracts:sync`, y los tres `declared/` escritos a mano con las respuestas de §3.3. `AnswerOption` se declara en `contracts/common.ts`.
   *Verificación:* `npx tsc --noEmit` en 0; `git diff --stat` no toca contratos de otras entidades.

4. **`useCatalogItemsByTypeCode`.** Hook en `shared/hooks/`, con la resolución de dos saltos (`CATTYPE-002` → `CATITEM-002A`) y las filas completas, `value` incluido. `<CatalogSelect>` pasa a consumirlo.
   *Verificación:* `npx vitest run src/shared/components/CatalogSelect.test.tsx` en verde sin tocar el test; dos `<CatalogSelect>` del mismo `typeCode` siguen costando una petición por salto, no dos.

5. **`<AnswerOptionField>`.** En `shared/components/`, `<Select>` de tres opciones con variantes `unknown` y `full`, y la regla de §7.1: al leer renderiza cualquier valor que encuentre, incluido `NO_ANSWER`. Sus cinco claves van bajo `common.answerOption.*`.
   *Verificación:* test propio que monta el campo con `NO_ANSWER` en variante `unknown` y comprueba que lo muestra en vez de quedar en blanco.

6. **`ScopedHealthFacilitySelect` → `HealthFacilitySelect`** con prop `scoped` (por defecto `true`). `CaseOpeningStep` pasa a usar el nombre nuevo sin cambiar comportamiento.
   *Verificación:* `npx vitest run src/features/esaviCase/ScopedHealthFacilitySelect.test.tsx src/features/esaviCase/CaseOpeningStep.test.tsx` en verde; con `scoped={false}` una unidad fuera de cobertura aparece elegible.

7. **`draftsStore` con `persist`** y limpieza al cerrar sesión, junto al `TokenStore`. Más el helper de la regla de conflicto por `baseUpdatedAt`.
   *Verificación:* test del store que cubre los cuatro casos de la tabla de §3.4; cerrar sesión deja `localStorage` sin la clave de borradores.

8. **`features/notification/api.ts`.** Tres declaraciones de recurso y tres hooks `byCase`, con los códigos `ESAVI-*` citados. Los dos de rama, `enabled` según `notificationType`.
   *Verificación:* `npx tsc --noEmit` en 0; con un caso `SEVERE`, la pestaña de red no muestra llamada a `/api/non-severe-notifications/case/:id`.

9. **`features/notification/schemas.ts`.** Los dos esquemas de §3.5, los tres mapas de error a campo y las tres reglas condicionales como predicados puros.
   *Verificación:* tests de los predicados con los casos frontera: muerte sin `autopsyRequested`, `autopsyRequested: false` bajo recuperación, descripción de embarazo bajo `'NO'`.

10. **`NotificationStep` — cabecera y cadena de guardado.** Sustituye el marcador de `CaseWizardPage.tsx:132-136`. Formulario de la cabecera, `notificationType` derivado y bloqueado, `POST`/`PUT`, `setQueryData` del id, registro en `CaseWizardContext` con `save`, `isDirty` y `getPendingFields`.
    *Verificación:* con una clasificación grave, guardar crea la fila y el stepper marca el paso 4 empezado; volver a entrar la recupera.

    > **Registrar el paso con el patrón de refs.** FE11 encontró aquí un bucle infinito de render: el `useEffect` de registro dependía de un valor recalculado en cada render que el propio efecto provocaba. `ClassificationStep.tsx` lo resolvió con `useRef` actualizadas en render y un `useEffect` que sólo depende de valores estables. Este paso lo replica desde el principio en vez de volver a descubrirlo.

11. **Sección de fallecimiento.** Aparece con `outcome.value === 'DEATH'` resuelto por el hook del paso 4, dentro de `aria-live="polite"`, y **al ocultarse pone los tres campos a `null`**.
    *Verificación:* elegir «Fallecido», rellenar los tres, cambiar a «Recuperado» y guardar responde `200`, no `400 DEATH_FIELDS_NOT_ALLOWED`.

12. **Las dos ramas.** `SevereNotificationFields` y `NonSevereNotificationFields`, la segunda parte de la cadena de guardado con el `notificationId` de la caché, y el tratamiento de `ALREADY_EXISTS` como éxito con relectura por `006`.
    *Verificación:* si el `POST` de la rama falla, la cabecera sigue creada y visible y el reintento la completa; un segundo `POST` de rama no muestra error.

13. **Compuerta de embarazo.** La tabla de §7.4 con el sexo del paciente por `value === 'FEMALE'` y la edad de la clasificación, incluida la marca «Si aplica».
    *Verificación:* con paciente masculino no existe ningún campo de embarazo en el DOM; con femenino sin fecha de nacimiento aparece marcado «Si aplica».

14. **Congelar la compuerta de gravedad del paso 3.** En `ClassificationStep`, con `stages.notification.exists === true` la compuerta pasa a sólo lectura con su explicación; el resto de la clasificación sigue editable.
    *Verificación:* creada la notificación, el radio de gravedad del paso 3 está deshabilitado y `firstConsultationDate` no.

15. **Mapeo de errores y cierre de i18n.** Las entradas de `shared/api/errorMessages.ts` de las tres entidades y la revisión de paridad.
    *Verificación:* `npm run i18n:check` en 0.

16. **Tests de integración de `NotificationStep`.** Con MSW y `onUnhandledRequest: 'error'`, montando el paso junto a `CaseWizardProvider` y `CaseWizardActionBar`: la cadena completa, el fallo de la rama con reintento, la regla de fallecimiento en los dos sentidos, la compuerta de embarazo y el bloqueo por clasificación desactivada.
    *Verificación:* `npm run check` en 0.

---

## 5. Criterios de aceptación

- [ ] Las nueve rutas de §3.2 se consumen y responden lo esperado.
- [ ] Con un caso `SEVERE`, la pantalla **no** llama a `GET /api/non-severe-notifications/case/:id`, y al revés.
- [ ] Un solo «Guardar» hace `POST` de la cabecera y `POST` de la rama con el `notificationId` devuelto.
- [ ] Si el `POST` de la rama falla, la cabecera **sigue creada y visible**, y el reintento la completa sin volver a crear la cabecera.
- [ ] Un `SEVNOT_001_ALREADY_EXISTS` no muestra error: se relee con el `006` y la pantalla sigue.
- [ ] `notificationType` no es editable en ningún punto y sale de `classification.isSeriousEvent`.
- [ ] Creada la notificación, la compuerta de gravedad del paso 3 está deshabilitada con su explicación, y `firstConsultationDate` y `notes` siguen editables.
- [ ] Con desenlace `DEATH` aparecen los tres campos de fallecimiento dentro de una región `aria-live`.
- [ ] Cambiar el desenlace de `DEATH` a otro y guardar responde `200`: los tres viajan en `null`, no en `false`.
- [ ] `pregnancyComplicationsDescription` es obligatoria con `'YES'` y rechazada con cualquier otra respuesta, en los dos sentidos.
- [ ] `otherSourceDescription` es obligatoria con `verifiedOtherSource === true` y rechazada con `false` o `null`.
- [ ] Con paciente de sexo masculino, **ningún** campo de embarazo existe en el DOM — no basta con que esté oculto.
- [ ] Con paciente femenino sin fecha de nacimiento, el bloque aparece marcado «Si aplica».
- [ ] «Guardar» funciona con sólo `esaviDescription` rellenado, y los campos que faltan se listan bajo «Completar etapa» en vez de deshabilitarlo en silencio.
- [ ] El borrador se restaura cuando el `updatedAt` de la fila coincide con `baseUpdatedAt`, y se descarta con aviso cuando no.
- [ ] Cerrar sesión deja `localStorage` sin la clave de borradores.
- [ ] `<AnswerOptionField>` en variante `unknown` muestra un `NO_ANSWER` que venga del servidor, en vez de quedar en blanco.
- [ ] La unidad de vacunación ofrece unidades fuera de la cobertura geográfica del usuario; la del paso 2 sigue sin ofrecerlas.
- [ ] `grep -rn "useState" src/features/notification/` no devuelve ninguna copia de dato remoto, y `classificationId` ya no está en `useState` en `ClassificationStep.tsx`.
- [ ] `grep -n "Regla del cliente" references/CASE-PROCESS.md` ya no devuelve la línea de `pregnancyComplicationsDescription`.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/notification/ src/features/esaviCase/NotificationStep.tsx src/shared/components/AnswerOptionField.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** El formulario queda en una sola columna, la barra de acciones permanece accesible y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` el paso 4 es completamente utilizable —las nueve rutas son `USER`—, y con `ANALYTICS` el asistente no es alcanzable. Un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4. La única excepción es el borrador persistido, que está declarado y razonado allí.

> **Dos adaptaciones del bloque obligatorio.** El ítem de `md` habla de formulario y no de tabla, porque aquí no hay tabla; se mantuvo lo verificable —una columna y sin scroll horizontal en 375px— y se cambió el sujeto. Y el de rol bajo dice lo contrario de lo habitual: como las nueve rutas son `USER`, lo que hay que verificar es que un `USER` pueda hacerlo **todo**, no que se le oculte algo.

---

## 6. Decisiones tomadas y descartadas

**Estructura y alcance**

- **Sí:** una sola carpeta `features/notification/` para las tres entidades. Nunca se usan por separado y ninguna de las dos ramas tiene pantalla propia; tres carpetas serían tres `api.ts` que siempre se importan juntos.
- **No:** incluir `notificationPregnancyComplication`. Se pidió durante el diseño y se aplazó a FE12b: sus filas exigen un `pregnancyId` que sólo produce `ESAVI-NOTIFPRG-001`, bloqueado a su vez por la fila `systemConfig` `PREGNANCY_FEMALE_SEX_ITEM` que §10.6 da por no sembrada. Además invertiría el diseño de `hasPregnancyComplications`, que por §6.5 pasa a derivado en cuanto existen filas.
- **No:** exponer bajas, reactivaciones ni purgas. Cambiar la gravedad de un caso ya notificado exige purgar la rama con `005C`, que es SUPERADMIN, y meter esa acción en el asistente invita a usarla.

**El guardado**

- **Sí:** las dos escrituras en un solo «Guardar», con la cabecera superviviente si la rama falla. Es el precedente que FE10 ya dejó probado en la cadena `CASE-001` → `NOTIFIER-001`.
- **No:** deshabilitar la rama hasta que exista la cabecera. Obligaría a guardar dos veces para llenar algo que el usuario ve como un formulario único.
- **Sí:** tratar `SEVNOT_001_ALREADY_EXISTS` y su gemelo como éxito, releyendo con el `006`. Es el reintento cuya primera respuesta se perdió: mostrar un error por algo que ya está guardado enseña lo contrario de lo que pasó.
- **Sí:** dos esquemas Zod, `save` y `complete`, según `CASE-PROCESS.md` §4.6.
- **No:** hacer `requestInvestigation` bloqueante de guardado. Se planteó y se descartó: la columna tiene `DEFAULT false` y el backend no la pide, así que bloquear el guardado dejaría sin salida a quien ya escribió la descripción del ESAVI y todavía no sabe si hará falta investigar. Queda como obligatorio de proceso.
- **No:** derivar `requestInvestigation` de la gravedad. Un evento no grave puede investigarse y uno grave puede no requerirlo, y ésos son justo los dos casos que importa poder registrar.

**Los controles**

- **Sí:** `<AnswerOptionField>` como `<Select>` de tres opciones. Hay precedente de una aplicación anterior con esa forma y el usuario ya la reconoce.
- **No:** grupos de radios. Se propuso por coherencia con los criterios de gravedad de FE11, y con siete campos seguidos el alto de la pantalla se dispara.
- **Sí:** switches de dos estados para los seis `verified*`. Ninguna regla del servidor distingue `null` de `false` en esas columnas, así que el tercer estado sería complejidad sin consumidor.
- **Sí:** una prop `scoped` en `HealthFacilitySelect` en vez de un componente nuevo para la unidad de vacunación. Es lo que pide `CONVENTIONS.md` §10.4 frente a copiar una primitiva.
- **Sí:** al menos una fuente de verificación para completar la etapa, aunque el backend no lo exija. Una notificación no grave sin ninguna no dice de dónde salió el dato, que es el sentido del bloque.
- **Sí:** un solo scroll con secciones. Con pestañas, «Completar etapa» listaría campos pendientes escondidos detrás de una pestaña cerrada.

**Los catálogos y la edad**

- **Sí:** comparar siempre por `catalogItem.value`. El `code` y el `name` pertenecen al país y se recodifican con su catálogo oficial; el `value` pertenece al código fuente y está congelado por `isValueLocked` (SPEC F46). Comparar por `code` funciona en desarrollo y se rompe en el primer despliegue de otro país.
- **Sí:** un hook `useCatalogItemsByTypeCode` compartido, del que también tira `<CatalogSelect>`. Hacen falta dos comparaciones por `value` en este spec y `CASE-PROCESS.md` §7.2 anticipa una tercera en el paso 5.
- **Sí:** leer la edad de `classification`, que la calculó el backend. `CASE-PROCESS.md` §7.4 lo prohíbe expresamente recalcularla: dos implementaciones divergen justo en los bordes, y 15 y 49 son bordes.

**El estado**

- **Sí:** `notificationId` en la caché con `setQueryData`, nunca en `useState`. Con dos escrituras encadenadas, esa copia sería además el enlace entre ambas.
- **Sí:** corregir el mismo patrón en `ClassificationStep`. Se planteó dejarlo como deuda anotada y se decidió arreglarlo aquí, para que el paso 10 no copie el `useState` «por consistencia».
- **Sí:** `persist` en `draftsStore`, aceptando la desviación de `ARCHITECTURE.md` §3.4. Se prefiere una desviación declarada del contrato a que el usuario pierda lo tecleado al cerrar la pestaña.
- **Sí:** la fila gana en el conflicto, comparando `baseUpdatedAt` contra el `updatedAt` actual. «Gana siempre» convertiría el borrador persistido en algo que nunca restaura nada.
- **Sí:** borrar los borradores al cerrar sesión. `esaviDescription` es texto clínico sobre un paciente identificado y `localStorage` sobrevive al logout en un puesto compartido. No salió en la conversación; se añadió al escribir §3.4.
- **No:** guardar el progreso del asistente como borrador. Vive en filas reales de la base; el borrador es sólo el hueco entre teclear y guardar.

**La documentación**

- **Sí:** corregir `CASE-PROCESS.md` §5.4 y §7.3 en este spec. Afirman que la regla de `pregnancyComplicationsDescription` no la impone el backend, y `severeNotification.service.ts:131-157` la impone en las dos direcciones. Una referencia que dice «el servidor no lo impone» sobre algo que responde `400` cuesta una sesión de depuración a quien la lea.
- **Sí:** mandar `NOTIFCN_004_DEATH_FIELDS_NOT_ALLOWED` al campo `outcomeItemId` y no a `deathDate`. Lo que sobra es la combinación, y si el error aparece sobre una fecha que el usuario ya no ve, no hay forma de entenderlo.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Un switch apagado vale `false`, y `false` **cuenta como informado** para el backend (`notification.service.ts:169`). Limpiar la sección de fallecimiento apagando los switches daría `400 DEATH_FIELDS_NOT_ALLOWED` | Limpiar es poner a `null`, escrito en §3.5 y cubierto por un test de predicado en el paso 9 y por uno de integración en el 11 |
| La compuerta de gravedad del paso 3 se congela con `stages.notification.exists`, y por §6.2 ese campo **cuenta también filas desactivadas**. Una notificación dada de baja dejaría la compuerta congelada sin notificación viva que lo justifique | Es el comportamiento correcto: la rama sigue existiendo y sólo un `005C` de SUPERADMIN la retira. El texto del congelado dice qué hace falta para deshacerlo, en vez de sugerir que se arregla solo |
| El borrador persistido guarda texto clínico en `localStorage` y la sesión puede terminar sin logout explícito —por expiración del refresh— | Los borradores se limpian en el mismo punto que el `TokenStore`, que incluye el camino de expiración, no sólo el botón de cerrar sesión |
| La cabecera se crea, la rama falla y el usuario se va. Al volver hay cabecera sin rama, y un `PUT` de rama sobre algo que no existe daría `404` | La pantalla decide `POST` o `PUT` por lo que devuelve el `006` de la rama, no por si existe la cabecera |
| **`CASE-PROCESS.md` §5.4 resultó inexacto en un punto verificable.** Puede haber más afirmaciones del mismo tipo que no se detectaron | Los pasos 9, 11 y 12 contrastan cada regla condicional contra el servicio antes de implementarla, que es como apareció ésta |
| Dos pestañas: en una se cambia la gravedad del paso 3 antes de que la otra cree la rama, y el `POST` responde `NOTIFICATION_NOT_SEVERE` | Ese código invalida workflow y clasificación: la pestaña obsoleta se entera de que la gravedad ya no es la que creía, en vez de reintentar |

---

## 8. Impacto en pantallas existentes

| Archivo | Qué cambia |
|---|---|
| `features/esaviCase/CaseWizardPage.tsx` | `notification` sale de la condición del marcador y pasa a renderizar `<NotificationStep>` |
| `features/esaviCase/ClassificationStep.tsx` | La compuerta de gravedad se congela con la notificación creada (§6.1), y `classificationId` deja de vivir en `useState` |
| `features/esaviCase/ScopedHealthFacilitySelect.tsx` | Se renombra a `HealthFacilitySelect` y gana la prop `scoped`, por defecto `true` |
| `features/esaviCase/CaseOpeningStep.tsx` | Sólo el import y el nombre; su comportamiento no cambia |
| `shared/components/CatalogSelect.tsx` | Pasa a consumir `useCatalogItemsByTypeCode`. Sin cambio de comportamiento ni de props |
| `shared/stores/draftsStore.ts` | Gana `persist`, el campo `baseUpdatedAt` y la limpieza al cerrar sesión |
| `contracts/common.ts` | Gana el tipo `AnswerOption` |
| `shared/api/errorMessages.ts` | Entradas de las tres entidades nuevas |
| `references/CASE-PROCESS.md` | Se corrigen §5.4 y §7.3 sobre la regla de `pregnancyComplicationsDescription` |

**Y lo que FE12b le hará a esta pantalla**, para que no aparezca como sorpresa: `hasPregnancyComplications` dejará de ser una pregunta libre y pasará a derivarse de las filas de `notificationPregnancyComplication` —bloqueada y con su explicación cuando haya al menos una—, según `CASE-PROCESS.md` §6.5. La descripción seguirá siendo texto libre: es el resumen, no el recuento.

---

## Lo que **no** está en este spec

- Los seis satélites del paso 4: eventos, vacunas, diluyentes, medicación concomitante, embarazo y sus complicaciones.
- Las cuatro primitivas que sólo ellos necesitan: `<SatelliteList>`, `<WhodrugTreePicker>`, `<MeddraSearchField>` y `<SearchableSelect>`.
- Derivar `hasPregnancyComplications` de las filas de complicación.
- El paso 5, la investigación, aunque `requestInvestigation` decida si existe.
- Bajas, reactivaciones y purgas de las tres entidades.
- Los listados de notificaciones y el detalle por id.
- La comprobación de caso cerrado en el servidor.

Cada uno de esos, si aterriza, va en su propio spec.

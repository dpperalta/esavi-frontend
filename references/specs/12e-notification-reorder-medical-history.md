# SPEC FE12e — Paso 4: orden del formulario y antecedentes médicos

> **Estado:** Implementado
> **Depende de:** SPEC FE08 (armazón del wizard), SPEC FE12a (la cabecera y las dos ramas, que este spec reordena y disuelve), SPEC FE12b (de ahí salen `<SatelliteList>`, `<MeddraSearchField>` y el patrón de compuerta de `takesMedication`, que aquí se repite con cinco banderas), SPEC FE12c (las vacunas y los diluyentes, que cambian de posición y de rama), SPEC FE12d (el bloque de embarazo, que recibe un campo de la rama grave). Del backend: SPEC F57 (`notificationMedicalHistory`), SPEC F15 (`diagnosticTerm` y su resolución) y SPEC F55 (búsqueda de términos MedDRA).
> **Fecha:** 2026-09-09
> **Objetivo:** Alinear el paso 4 con el orden y las etiquetas del formulario en producción, disolviendo el bloque de rama, y añadir la séptima lista satélite — los antecedentes médicos de la notificación.

---

## 1. Por qué existe este spec

**A — La pantalla no está en el orden del formulario que la gente rellena hoy.** `NotificationStep.tsx:743-1004` pinta descripción → banderas → eventos → medicación → vacunas → desenlace → muerte → investigación → bloque de rama → notas. `ESAVI-FORM.md` —adoptado el 2026-09-08 como fuente de etiquetas y de orden de pantalla— pide antecedentes → antecedentes médicos → farmacológicos → embarazo → vacunas → eventos → descripción → desenlace. Las dos diferencias que más pesan: **la descripción del ESAVI baja al penúltimo lugar** y **las vacunas van antes que los eventos**. Quien transcribe desde el papel salta hacia arriba y hacia abajo en cada caso.

**B — Falta el séptimo satélite del paso 4, y no es que estuviera aplazado: es que nació después.** `notificationMedicalHistory` entró en el backend el 2026-09-08 (SPEC F57), con las nueve rutas de `ESAVI-MEDHIST-*`. La tabla de `CASE-PROCESS.md` §9 lo atribuye a **FE12b**, pero FE12b es del 2026-09-04 y **no lo menciona ni una vez**: la fila de la tabla se escribió cuatro días después que el spec que describe. No hay `MedicalHistoryList.tsx` en `src/features/notification/`, y ningún spec de la serie `12a`–`12d` lo declara en su alcance. Es una lista real, con endpoints reales, que hoy no tiene dueño.

**C — El bloque de rama se pinta entero en una posición, y el formulario lo reparte.** `NotificationStep.tsx:969-986` renderiza `<SevereNotificationFields>` o `<NonSevereNotificationFields>` como un bloque cerrado entre el embarazo y las notas. El formulario coloca sus campos en tres sitios distintos: las cuatro banderas graves suben a la primera sección junto a `hasRelevantMedicalHistory` y `takesMedication`, `pregnancyComplicationsDescription` baja pegado a las complicaciones del embarazo, y en la rama no grave el sitio de vacunación y la verificación quedan entre el embarazo y las vacunas. Mantener el bloque compacto y reordenarlo entero era la alternativa barata; se descartó porque deja la pantalla a medio camino entre dos criterios.

**D — Y hay una lista que se pinta donde el formulario no la pide.** `<DiluentList>` aparece hoy en las dos ramas (`VaccineFormDialog.tsx`); el formulario grave pide los diluyentes y el no grave no. El backend no lo impide, así que la corrección es de cliente.

**Este spec no deja ninguna primitiva nueva.** Consume las trece de `ARCHITECTURE.md` §4.3 tal como están: `<SatelliteList>` y `<MeddraSearchField>` para la lista nueva, `<AnswerOptionField>` para las banderas que cambian de sitio. Es el último spec del paso 4, y el que lo cierra contra el formulario real.

---

## 2. Alcance

**Dentro:**

- **El reorden completo del paso 4 en las dos ramas**, siguiendo el orden de `ESAVI-FORM.md` sección por sección, con **encabezados de sección visibles** con el texto del formulario y sin el prefijo «Sección N» — la numeración es didáctica y además difiere entre ramas.
- **La disolución de `SevereNotificationFields.tsx` y `NonSevereNotificationFields.tsx`.** Sus campos se reparten en las secciones que les corresponden; los dos archivos dejan de existir como bloque único.
- **El texto literal del formulario como etiqueta de todos los campos del paso 4**, en los tres idiomas. Cambian los valores de `es`, `en` y `nl`; **las claves i18n no se renombran**.
- **`notificationMedicalHistory` completo** — la séptima lista satélite: `<SatelliteList>` con modal, `historyName` obligatorio contra `<MeddraSearchField>`, `historyCode` opcional, la resolución del término con las mismas tres ramas de `source` de FE12b, `notes`, y la guarda de duplicado por `diagnosticTermId` entre las activas de la misma notificación.
- **Su compuerta, que es de cliente y no existe en el backend**: en la rama **grave** la lista se abre si cualquiera de las **cinco** banderas es `'YES'` (`hasRelevantMedicalHistory` más las cuatro de `severeNotification`); en la rama **no grave**, sólo `hasRelevantMedicalHistory` la abre. El texto del formulario en la rama no grave está copiado del grave y este spec lo corrige.
- **El cierre de la compuerta bloqueado con filas activas**, en la forma de FE12b pero adaptada a cinco banderas: se puede mover cualquiera **mientras al menos una siga en `'YES'`**; la última que quede en `'YES'` se deshabilita con su explicación. Y el tercer estado de FE12b: con filas activas y ninguna bandera en `'YES'`, la lista **se muestra igual** con el aviso de discrepancia.
- **Los diluyentes ocultos en la rama no grave.** El formulario no los pide ahí y no hay filas cargadas que esconder.
- **`pregnancyComplicationsDescription` dentro del bloque de embarazo**, visible sólo en rama grave y sólo con complicaciones declaradas. Es columna de `severeNotification` y por eso `<PregnancySection>` pasa a recibir un campo que sólo aplica a una rama; la razón queda escrita en §6.
- **Los tres campos de notas al final de su propia sección**: `pregnancyNotes` cierra el embarazo, `severeNotes`/`nonSevereNotes` cierran la última sección propia de su rama, y `notes` de la cabecera cierra el paso.
- **Mapeo de los códigos de error de `MEDHIST`** a campo o a toast, incluido el `409` de duplicado, el `404` del término no encontrado y el `403` del `005A`.
- **Bajas con `MEDHIST-005A`**, con diálogo que nombra la fila y el aviso de rol de §10.4.
- **La corrección de `CASE-PROCESS.md` §9**: la fila de la tabla que atribuye `notificationMedicalHistory` a **FE12b** pasa a atribuirlo a **FE12e**, que es donde se implementa.
- **Las claves i18n nuevas** en `es`, `en` y `nl`.
- **Tests de integración** del orden resultante en las dos ramas, de la compuerta en sus tres estados y con sus cinco banderas, y de la lista nueva.

**Fuera de alcance (otros specs):**

- **El paso 5 entero.** `investigationMedicalHistory` **no es este dato** —es un cuestionario 1:1 de banderas, no una lista de términos (`CASE-PROCESS.md` línea 944)— y no se sincroniza con éste en ninguna dirección. Es FE13.
- **El rango de edad de la compuerta de embarazo del paso 5** (12–49 en el texto, 12–50 en la condición del formulario) y la incoherencia interna del documento. Se decide al escribir FE13; el paso 4 se queda en 15–49 como está.
- **Bloquear `DEATH` en la notificación no grave.** El «debería» del formulario es una observación, no una definición: una muerte mal clasificada se corrige en el paso 3, no impidiendo guardar el paso 4. Queda anotado como deuda.
- **Reactivar y purgar antecedentes.** `MEDHIST-005B` es SUPERADMIN y `005C` también; el asistente no los ofrece ni los nombra como acción disponible.
- **El listado con inactivos `MEDHIST-002B`** (ADMIN) y **el detalle por id `003`**. La lista se lee por caso y la fila se edita con lo que ya trajo.
- **Un obligatorio de proceso nuevo.** Cero antecedentes es una respuesta legítima aunque la compuerta esté abierta, igual que FE12b decidió con la medicación.
- **Revisar los términos acuñados** por la rama `LOCAL` en `diagnosticTerm`. Es la pantalla de administración del catálogo, igual que en FE12b y FE12d.
- **Reordenar filas.** `sortOrder` lo asigna `TRG_notificationMedicalHistory_setSortOrder` y ningún servicio lo escribe.
- **Persistir el contenido del modal de antecedente en `draftsStore`.** Igual que las cuatro listas anteriores.
- **El orden de los pasos 1, 2, 3, 5 y 6.** Este spec sólo toca el paso 4.
- **La comprobación de `CLOSED` en el servidor** (§10.3). Sigue viviendo entera en el cliente.

---

## 3. Diseño

### 3.1 Pantallas y rutas

**No hay ruta nueva ni entrada de menú nueva.** Todo ocurre dentro del paso 4 que FE12a construyó, en la ruta que declaró FE08.

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Paso 4 reordenado | `/esavi-cases/:id/wizard/notification` | `features/esaviCase/NotificationStep.tsx` | el de `CaseWizardPage` (FE08), `<RequireRole level={USER}>` |
| Lista de antecedentes | ídem, sección 2 | `features/notification/MedicalHistoryList.tsx` | ídem |
| Alta/edición de antecedente | ídem, en modal | `features/notification/MedicalHistoryFormDialog.tsx` | ídem |
| Antecedentes de vacunación (no grave) | ídem, sección 5 | `features/esaviCase/VaccinationBackgroundSection.tsx` | ídem |
| Verificación de la vacunación (no grave) | ídem, sección 6 | `features/esaviCase/VerificationSourceSection.tsx` | ídem |

**Dos archivos dejan de existir:** `SevereNotificationFields.tsx` y `NonSevereNotificationFields.tsx`. Las cuatro banderas de la rama grave pasan a estar en línea en la sección 1 de `NotificationStep.tsx`, junto a las dos de la cabecera; los doce campos de la rama no grave se parten en los dos componentes de sección de la tabla.

**El orden resultante, rama grave** — nueve secciones:

| # | Sección | Contenido |
|---|---|---|
| 1 | Antecedentes de la persona vacunada | `hasRelevantMedicalHistory`, `hasPreviousEventHistory`, `hasAllergyToOtherVaccines`, `hasAllergyToMedications`, `hasAllergyToPreviousSameVaccine`, `takesMedication`, y `severeNotes` al final |
| 2 | Antecedentes médicos | `<MedicalHistoryList>`, detrás de la compuerta de las cinco banderas |
| 3 | Antecedentes farmacológicos | `<MedicationList>`, detrás de `takesMedication` |
| 4 | Datos de embarazo | `<PregnancySection>`: las cinco preguntas, la lista de complicaciones, `pregnancyComplicationsDescription` y `pregnancyNotes` |
| 5 | Selección de vacunas | `<VaccineList>` **con diluyentes** |
| 6 | Eventos adversos | `<EventList>` |
| 7 | Descripción del ESAVI | `esaviDescription` |
| 8 | Desenlace | `outcomeItemId`, la sección de fallecimiento, `requestInvestigation` |
| 9 | — | `notes` de la cabecera cierra el paso, sin encabezado propio |

**El orden resultante, rama no grave** — once secciones:

| # | Sección | Contenido |
|---|---|---|
| 1 | Antecedentes de la persona vacunada | `hasRelevantMedicalHistory`, `takesMedication` |
| 2 | Antecedentes médicos | `<MedicalHistoryList>`, detrás de `hasRelevantMedicalHistory` **a secas** |
| 3 | Antecedentes farmacológicos | `<MedicationList>` |
| 4 | Datos de embarazo | `<PregnancySection>` **sin** `pregnancyComplicationsDescription` |
| 5 | Antecedentes de vacunación o inmunización | `vaccinationSiteItemId`, `vaccinationCenterAddress`, `vaccinationGeoLocationId`, `vaccinationHealthFacilityId` |
| 6 | ¿Cómo se verificó la información de la vacunación? | los seis `verified*`, `otherSourceDescription`, y `nonSevereNotes` al final |
| 7 | Selección de vacunas | `<VaccineList>` **sin diluyentes** |
| 8 | Eventos adversos | `<EventList>` |
| 9 | Descripción del ESAVI | `esaviDescription` |
| 10 | Desenlace | `outcomeItemId`, la sección de fallecimiento, `requestInvestigation` |
| 11 | — | `notes` de la cabecera cierra el paso |

**`severeNotes` va al final de la sección 1 y no al final del embarazo**, aunque el último campo propio de la rama grave sea `pregnancyComplicationsDescription`. El bloque de embarazo ya tiene su `pregnancyNotes`, y dos campos de notas seguidos en la misma caja son indistinguibles para quien rellena. La sección 1 es donde viven cuatro de los cinco campos de la rama.

**Dentro de cada sección se respeta el orden de las filas del formulario**, incluidos dos cambios respecto de lo implementado: en el embarazo, `wasPregnantAtEsavi` va **antes** de `wasPregnantAtVaccination`; en los antecedentes de vacunación, el establecimiento va **último**, no primero.

### 3.2 Endpoints consumidos

**Nuevos en este spec**, copiados textualmente de `references/API-ROUTES.md` (regenerado el 2026-09-08):

```
POST   /api/notification-medical-histories             ESAVI-MEDHIST-001   USER    crear antecedente
GET    /api/notification-medical-histories/case/:id    ESAVI-MEDHIST-006   USER    antecedentes del caso
PUT    /api/notification-medical-histories/:id         ESAVI-MEDHIST-004   USER    actualizar
DELETE /api/notification-medical-histories/:id         ESAVI-MEDHIST-005A  ADMIN   baja lógica
```

**El `006` por caso, no el `002A` por notificación.** Es lo que ya hacen las tres listas hermanas del mismo paso —`NOTIFEVT-006`, `NOTIFMED-006`, `NOTIFVAC-006`— y ahorra esperar a que resuelva el `notificationId`. Distingue los dos eslabones rotos con códigos propios (`404 MEDHIST_006_CASE_NOT_FOUND` y `404 MEDHIST_006_NOTIFICATION_NOT_FOUND`), y **una notificación sin antecedentes responde `200` con página vacía, nunca `404`**.

**Qué no se consume, y por qué:**

- **`ESAVI-MEDHIST-002A` y `002B`.** El `002A` es la misma lista por el otro padre y el `006` ya la da; el `002B` es ADMIN e incluye retiradas, y el asistente no las muestra.
- **`ESAVI-MEDHIST-003`.** La fila se edita con lo que ya trajo la lista.
- **`ESAVI-MEDHIST-005B` y `005C`.** Reactivar es **SUPERADMIN** y purgar también. No se ofrecen ni se nombran como acción disponible: la salida se explica sin prometer un botón que va a responder `403`.
- **`ESAVI-DIAGTERM-*` directamente.** El término se resuelve en el servidor a partir de `historyCode` y `source`; el cliente no abre esa puerta, igual que en FE12b y FE12d.

**Lecturas y escrituras que ya implementaron specs anteriores**, y que este spec sólo reordena en pantalla:

```
GET  /api/case-workflows/case/:id        ESAVI-CASEFLOW-006   USER   estado y stages (FE08)
GET  /api/notifications/case/:id         ESAVI-NOTIFCN-006    USER   cabecera y notificationId (FE12a)
GET  /api/severe-notifications/case/:id  ESAVI-SEVNOT-006     USER   las cuatro banderas de la compuerta (FE12a)
GET  /api/non-severe-notifications/case/:id ESAVI-NSEVNOT-006 USER   la rama no grave (FE12a)
GET  /api/notification-events/case/:id   ESAVI-NOTIFEVT-006   USER   eventos (FE12b)
GET  /api/notification-medications/case/:id ESAVI-NOTIFMED-006 USER  medicación (FE12b)
GET  /api/notification-vaccines/case/:id ESAVI-NOTIFVAC-006   USER   vacunas (FE12c)
GET  /api/meddra/search                  ESAVI-MEDDRA-006     USER   <MeddraSearchField> (FE12b)
```

**Ningún endpoint de las cuatro entidades reordenadas cambia.** El reorden es de pantalla; las escrituras encadenadas de FE12a y FE12d se conservan intactas.

### 3.3 Tipos del contrato

**Un archivo nuevo por `contracts:sync`**, con una entrada nueva en el `SYNC_MAP` de `scripts/syncContracts.mjs`:

```ts
// contracts/notificationMedicalHistory.ts — espejo de esavi-backend/src/types/notificationMedicalHistory/
export interface CreateNotificationMedicalHistoryInput {
  notificationId: string;           // el padre, inmutable en el 004 (el servicio lo descarta sin 400)
  historyName: string;              // OBLIGATORIO (≤500, trim, no vacío). Campo aceptado que NO es columna
  historyCode?: string | null;      // ≤100. Campo aceptado que NO es columna; dispara la resolución
  source?: 'MEDDRA' | 'WHODRUG' | 'LOCAL' | 'OTHER';  // campo aceptado que NO es columna
  notes?: string | null;
  isActive?: boolean;
}
```

**Tres campos que se envían y no se guardan**, igual que en `notificationPregnancyComplication`:

| Se envía | Dónde acaba |
|---|---|
| `historyName` | En **`historyRaw`**, y **sólo si difiere** del nombre del maestro |
| `historyCode` | En `diagnosticTerm`, vía la resolución. En la fila queda `diagnosticTermId` |
| `source` | En ninguna parte. Decide la rama de la resolución y se descarta |

**La respuesta del `GET` no trae `historyName`**: trae `historyRaw` y `diagnosticTerm` por separado. El nombre efectivo que se muestra es **`historyRaw ?? diagnosticTerm.name`**, y `historyName` **se envía sólo cuando el usuario lo cambia** — un `PUT` que lo reenvía siempre sobrescribiría el texto del notificador con un eco del `GET`. Es la regla de `CASE-PROCESS.md` línea 961 y el cliente no debe deshacerla.

**En el `004`, `historyName` es opcional pero no anulable** — un `null` explícito da `400`, porque borraría el único texto que identifica la fila. `notes` sí es anulable. Es la misma asimetría de `PREGCOMP-004`.

El update usa `Partial<CreateNotificationMedicalHistoryInput>`, igual que en el backend.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId` y paso activo | URL | params de `/esavi-cases/:id/wizard/:step` | los declaró FE08 |
| Estado del expediente y `stages` | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | sólo lectura aquí |
| Cabecera de la notificación | TanStack Query | `['notification', 'byCase', caseId]` | de aquí salen `notificationId` y `hasRelevantMedicalHistory` |
| Ficha grave | TanStack Query | `['severeNotification', 'byCase', caseId]` | de aquí salen **cuatro de las cinco** banderas de la compuerta |
| Ficha no grave | TanStack Query | `['nonSevereNotification', 'byCase', caseId]` | sus doce columnas, ahora en dos secciones |
| **Antecedentes médicos** | TanStack Query | `['notificationMedicalHistory', 'byCase', caseId]` | sin `staleTime`; se invalida tras cada escritura |
| Eventos, medicación, vacunas | TanStack Query | las claves que declararon FE12b y FE12c | **no cambian**: el reorden es de pantalla |
| Bloque de embarazo y complicaciones | TanStack Query | las claves de FE12d | ídem |
| Valores del paso | React Hook Form | el `useForm` de `NotificationStep` | las cinco banderas viven aquí mientras se editan |
| Valores del modal de antecedente | React Hook Form | `useForm` de `MedicalHistoryFormDialog` | |
| Qué antecedente se está editando | Componente | `useState` de la lista | efímero; **el id, no la fila** |
| Diálogo de confirmación de baja | Componente | `useState` | efímero |
| Borrador sin guardar | Zustand `draftsStore` | `drafts[caseId]['notification']` | **no cambia**: los mismos campos, en otro orden en pantalla |
| Compuerta de antecedentes abierta o cerrada | derivado en render | las banderas de la rama + hay filas activas | no es estado |
| Qué bandera queda bloqueada | derivado en render | la **única** en `'YES'` con filas activas | no es estado |
| Aviso de discrepancia | derivado en render | hay filas y ninguna bandera en `'YES'` | no es estado |
| Diluyentes visibles | derivado en render | `notificationType === 'SEVERE'` | no es estado |

**Los cuatro puntos obligatorios:**

**1 · Nada del servidor en `useState`.** La lista guarda **el id del antecedente que edita**, no una copia de la fila. El nombre efectivo (`historyRaw ?? diagnosticTerm.name`) se calcula en render desde la fila de la caché, nunca se copia al montar.

**2 · Ningún filtro fuera de `searchParams`.** Esta pantalla no tiene filtros, paginación ni orden: el orden de los antecedentes lo fija `TRG_notificationMedicalHistory_setSortOrder` y no se puede cambiar. La regla no aplica, y se dice en vez de callarla.

**3 · `staleTime` por naturaleza del dato.** La lista de antecedentes no lleva `staleTime` y se invalida tras cada escritura, como las cuatro listas hermanas. Los catálogos heredan sus 30 minutos.

**4 · Qué invalida qué.**

- **De un antecedente** (`001`/`004`/`005A`): sólo `['notificationMedicalHistory','byCase',caseId]`.
- **No se invalida `['notification','byCase',caseId]` ni `['severeNotification','byCase',caseId]`.** La compuerta, el bloqueo de la bandera y el aviso de discrepancia se derivan **en render** de la propia query de antecedentes, que acaba de invalidarse. Es la misma razón que FE12b dio para `takesMedication`: refrescar la cabecera para enterarse de algo que la otra query ya sabe es el camino corto a que las dos digan cosas distintas.
- **No se invalida `['caseWorkflow','byCase',caseId]`.** Un satélite no sella ninguna marca del expediente.
- **El reorden no cambia ninguna invalidación existente.** Ni una clave de caché, ni una cadena de escritura, ni el borrador.

### 3.5 Formularios y validación

**Sección 1 — las banderas y el cierre de la compuerta.**

Las seis (rama grave) o dos (rama no grave) son `<AnswerOptionField variant="unknown">`, exactamente como hoy. Lo que cambia es el bloqueo:

| Situación | Qué se puede hacer |
|---|---|
| Sin antecedentes activos | Las seis se mueven libremente |
| Con antecedentes activos y **dos o más** banderas en `'YES'` | Todas se mueven libremente: quitar una no cierra la compuerta |
| Con antecedentes activos y **una sola** bandera en `'YES'` | **Esa bandera queda deshabilitada**, con el texto que dice qué hacer para cambiarla |
| Con antecedentes activos y **ninguna** en `'YES'` | Las seis libres, y la lista **se muestra igual** con el aviso de discrepancia |

**Se bloquea el cierre de la compuerta, no las banderas.** Deshabilitar las cinco en bloque impediría corregir una alergia mal marcada por un antecedente que nada tiene que ver con ella. La última que queda en `'YES'` es la única cuyo cambio dejaría filas huérfanas, y es la única que se toca.

El texto del bloqueo tiene **dos versiones según el rol**, como en FE12b: quien es `ADMIN` puede borrar las filas y se le dice eso; un `USER` no puede (`MEDHIST-005A` es ADMIN) y se le dice que hace falta un administrador.

**Formulario de antecedente** — `features/notification/schemas.ts`, `notificationMedicalHistorySchema`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `historyName` | `<MeddraSearchField>` | **sí** | ≤500, `trim`, no vacío. Acaba en `historyRaw` **sólo si difiere** del maestro |
| `historyCode` | derivado del buscador, o `<Input>` | no | ≤100. **Es lo que dispara la resolución** |
| `notes` | `<Textarea>` | no | Texto libre, anulable |

**`source`, con la misma tabla de FE12b y FE12d:**

| Cómo se rellenó el término | `source` | Efecto |
|---|---|---|
| Elegido en el buscador de MedDRA | **`MEDDRA`** | Busca `(MEDDRA, code)`. **Nunca acuña**: `404` si el diccionario no está importado |
| Escrito a mano con código | **`LOCAL` explícito** | Resolución implícita: si el término no existe, **se acuña** `autoCreated`/`PENDING` |
| Escrito a mano sin código | — | `diagnosticTermId: null`, nombre en texto libre |

**Al editar, el campo del término muestra el nombre efectivo** —`historyRaw` si existe, si no el del `diagnosticTerm`— y **`historyName` viaja en el `PUT` sólo si el usuario lo cambió**. Sin esa regla, reentrar y guardar sin tocar nada reescribiría el texto del notificador con el nombre del maestro.

**Guarda de duplicados:** `diagnosticTermId` no se repite entre los antecedentes **activos** de la misma notificación → `409 MEDHIST_00X_ALREADY_EXISTS`. Corre **después** de la resolución y sólo si el término tiene valor. **El cliente no la adelanta**, por la misma razón que en FE12d: obligaría a comparar ids resueltos que el cliente no siempre tiene.

**Códigos de error mapeados:**

| Código | Destino |
|---|---|
| `MEDHIST_00X_ALREADY_EXISTS` (409) | `historyName`, nombrando el antecedente ya registrado |
| `MEDHIST_00X_DIAGTERM_NOT_FOUND` (404) | El buscador, con la acción de guardarlo como texto libre — igual que en FE12b |
| `MEDHIST_006_CASE_NOT_FOUND` / `MEDHIST_006_NOTIFICATION_NOT_FOUND` (404) | Estado de error de la sección, con reintentar. **No es «no hay antecedentes»** |
| `AUTH_ROLE_FORBIDDEN` en `005A` | Aviso de §10.4: **retirar** un antecedente exige administrador en este despliegue, aunque crearlo y corregirlo no |

**Se envía el objeto completo en el `PUT`** salvo `historyName`, que es la excepción razonada de arriba. El backend hace el update diferencial; el cliente no calcula el diff.

**Y ninguna validación de las cuatro entidades reordenadas cambia.** El rango de Naegele, la coherencia de fechas de las vacunas, la regla de fallecimiento y las dos reglas de «otro» siguen exactamente como están: cambian de sitio en pantalla, no de contenido.

### 3.6 Estados de la pantalla

**Sección de antecedentes médicos:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Sin cabecera de notificación | La sección **no se renderiza**. Sin `notificationId` no hay padre | — |
| Compuerta cerrada y sin filas | **No existe en el DOM.** No basta con ocultarla con CSS | — |
| Compuerta cerrada y con filas activas | Se muestra igual, con el **aviso de discrepancia** encima de la lista | `notification.medicalHistory.mismatch` |
| Carga | Skeleton de 2 filas | — |
| Vacío | Sólo el título y el botón «Añadir antecedente» — el patrón de `<SatelliteList>` | — |
| Error | Mensaje del `EsaviApiError` por `code` + botón reintentar | `notification.medicalHistory.error` |
| Sin permiso | No se llega: el guard del asistente redirige | — |

**No hay «vacío con filtros»**: esta lista no tiene filtros ni paginación.

**Expediente `CLOSED`:** la sección pasa a sólo lectura —sin «Añadir», sin acciones de fila—, igual que las cuatro listas hermanas. La comprobación vive entera en el cliente (§10.3).

**Y los estados de las secciones reordenadas no cambian.** Cada una conserva los suyos, declarados en FE12a–FE12d; lo único que cambia es dónde aparecen.

### 3.7 Responsividad y accesibilidad

- **Lista de antecedentes → tarjetas** por debajo de `md`, dentro de `<SatelliteList>`. Los dos campos que sobreviven: **el nombre efectivo del antecedente y sus notas**. Un campo sin valor no se renderiza: nada de rellenos.
- **El modal de antecedente pasa a hoja completa** por debajo de `md`: lleva un buscador con desplegable, igual que el de complicaciones de FE12d.
- **Los encabezados de sección son encabezados de verdad** (`<h3>` bajo el título del paso), no `<span>` en negrita. El reorden sólo sirve si un lector de pantalla puede saltar de sección en sección.
- **El orden del DOM es el orden visual.** Nada de reordenar con `order` de CSS: quien navega con teclado o con lector recorrería el paso en el orden viejo.
- **La bandera bloqueada lleva su explicación como texto asociado**, con `aria-describedby`, no sólo el atributo `disabled`. Un control gris sin motivo es indistinguible de un fallo.
- **El aviso de discrepancia se anuncia con una región viva**: aparece al mover una bandera, no al enviar.
- Las acciones de editar y eliminar de cada fila llevan `aria-label` por i18n **nombrando la fila** — «Eliminar el antecedente Diabetes mellitus», no «Eliminar».
- La barra de acciones del modal queda **fija abajo**. Objetivos táctiles de 44px; `dvh`, nunca `vh`.

### 3.8 Claves i18n nuevas

Van a los **tres** archivos de idioma. `npm run i18n:check` exige paridad exacta.

| Clave | Uso |
|---|---|
| `notification.section.background` | Encabezado «Antecedentes de la persona vacunada» |
| `notification.section.medicalHistory` | Encabezado «Antecedentes médicos» |
| `notification.section.medication` | Encabezado «Antecedentes farmacológicos» |
| `notification.section.pregnancy` | Encabezado «Datos de embarazo» — **ya existe** como `notification.pregnancy.sectionTitle`, se reutiliza |
| `notification.section.vaccinationBackground` | Encabezado «Antecedentes de vacunación o inmunización» (no grave) |
| `notification.section.verification` | Encabezado «¿Cómo se verificó la información de la vacunación?» (no grave) |
| `notification.section.vaccines` | Encabezado «Selección de vacunas» |
| `notification.section.events` | Encabezado «Eventos adversos» |
| `notification.section.description` | Encabezado «Descripción del ESAVI» |
| `notification.section.outcome` | Encabezado «Desenlace» |
| `notification.medicalHistory.title` · `.add` · `.error` | La lista |
| `notification.medicalHistory.field.historyName` · `.historyCode` · `.notes` | Etiquetas del modal |
| `notification.medicalHistory.error.alreadyExists` | Duplicado por término |
| `notification.medicalHistory.error.diagTermNotFound` | El `404` del buscador, con la salida de texto libre |
| `notification.medicalHistory.mismatch` | Hay antecedentes y ninguna bandera dice que los haya |
| `notification.medicalHistory.gateLocked` | Bandera bloqueada, versión ADMIN |
| `notification.medicalHistory.gateLockedNeedsAdmin` | Ídem, versión USER |
| `notification.medicalHistory.delete.confirm` | Diálogo de baja, nombrando la fila |
| `notification.medicalHistory.roleForbidden.delete` | El aviso de §10.4 para el `005A` |

**Y todas las etiquetas del paso 4 cambian de valor**, en los tres idiomas, para adoptar el texto literal del formulario. **Ninguna clave se renombra**: el cambio es de traducción, no de estructura, y por eso no aparece una por una en esta tabla.

---

## 4. Plan de implementación

Trece pasos. Cada uno deja el proyecto compilando y arrancable, y cada uno se puede committear solo. Los que corrigen van antes que los que amplían: el reorden se hace sobre lo que ya existe, y la lista nueva entra en un paso 4 que ya está en su orden definitivo.

1. **Corregir `CASE-PROCESS.md` §9.** La fila de la tabla que atribuye `notificationMedicalHistory` a **FE12b** pasa a atribuirlo a **FE12e**, y la descripción de FE12b deja de mencionarlo. Va primero para que nadie lo busque donde no está.
   *Verificación:* la fila de FE12b nombra dos tablas, no tres; existe una fila `FE12e` que nombra `notificationMedicalHistory` y el reorden.

2. **Contratos.** Una entrada nueva en el `SYNC_MAP` de `scripts/syncContracts.mjs` —`notificationMedicalHistory`— y `npm run contracts:sync`.
   *Verificación:* `src/contracts/notificationMedicalHistory.ts` existe y `npx tsc --noEmit -p tsconfig.app.json` sale en 0. `CreateNotificationMedicalHistoryInput.historyName` **no** es opcional, y el input declara `historyCode` y `source`, que no son columnas.

3. **Declaración del recurso.** `features/notification/api.ts` gana `notificationMedicalHistoryResource`, leído por caso (`ESAVI-MEDHIST-006`), con los códigos de operación citados en cada hook.
   *Verificación:* `grep -rn "ESAVI-MEDHIST" src/features/notification/api.ts` devuelve los cuatro códigos de §3.2 y **ningún `005B`, `005C`, `002A`, `002B` ni `003`**.

4. **Schema Zod.** `notificationMedicalHistorySchema` con `historyName` obligatorio (≤500, `trim`, no vacío), `historyCode` opcional (≤100) y `notes` anulable, más la variante de edición en la que `historyName` es opcional **pero no anulable**.
   *Verificación:* pruebas unitarias: un `historyName` de espacios falla; uno de 501 caracteres falla; el schema de edición admite `historyName` ausente y **rechaza `null` explícito**; `notes: null` pasa en los dos.

5. **Etiquetas literales del formulario.** Los valores de `es`, `en` y `nl` de todos los campos del paso 4 pasan al texto de `ESAVI-FORM.md`. **Sin tocar estructura ni claves.**
   *Verificación:* `npm run i18n:check` sale en 0; la etiqueta de `hasRelevantMedicalHistory` en `es` es la pregunta completa del formulario; ningún archivo bajo `src/features/` cambió en este commit salvo los tres de idioma.

6. **Disolver `NonSevereNotificationFields`.** Se parte en `VaccinationBackgroundSection.tsx` (sitio, dirección, localidad, establecimiento) y `VerificationSourceSection.tsx` (los seis `verified*`, `otherSourceDescription` y `nonSevereNotes`). Se renderizan seguidas, en la misma posición de hoy: **el reorden llega en el paso 8**.
   *Verificación:* `NonSevereNotificationFields.tsx` ya no existe; la rama no grave se guarda y se relee exactamente igual que antes; sus tests siguen pasando tras redirigirlos a los dos componentes nuevos.

7. **Disolver `SevereNotificationFields`.** Las cuatro banderas pasan en línea a la sección de la cabecera, `pregnancyComplicationsDescription` pasa a `<PregnancySection>` —visible sólo en rama grave y sólo con complicaciones declaradas— y `severeNotes` queda al final de la sección de banderas. El archivo desaparece.
   *Verificación:* `SevereNotificationFields.tsx` ya no existe; con paciente masculino **ningún campo de embarazo existe en el DOM**, incluida la descripción; la derivación de §6.5 de FE12d sigue bloqueando los dos `answerOption` en `'YES'` con complicaciones cargadas.

8. **El reorden y los encabezados.** `NotificationStep.tsx` pinta las nueve secciones de la rama grave o las once de la no grave, en el orden de §3.1, con `<h3>` por sección y el orden interno de cada una — incluidos `wasPregnantAtEsavi` antes de `wasPregnantAtVaccination` y el establecimiento el último de los antecedentes de vacunación.
   *Verificación:* en rama grave, el orden del DOM es banderas → antecedentes → medicación → embarazo → vacunas → eventos → descripción → desenlace → notas; en no grave aparecen además las dos secciones de vacunación entre embarazo y vacunas; recorrer el paso con Tab respeta ese orden y `grep -rn "order-\[" src/features/esaviCase/` no devuelve nada.

9. **Diluyentes fuera de la rama no grave.** `<DiluentList>` deja de renderizarse cuando `notificationType === 'NON_SEVERE'`.
   *Verificación:* con un caso no grave, el modal de vacuna no ofrece diluyentes y `NOTIFDIL-001` no se llama nunca; con un caso grave todo sigue igual.

10. **Lista de antecedentes.** `MedicalHistoryList.tsx` y `MedicalHistoryFormDialog.tsx` sobre `<SatelliteList>`, en la sección 2, con `<MeddraSearchField>`, la tabla de `source` y la regla del nombre efectivo. **Todavía sin compuerta**: visible en cuanto hay `notificationId`.
    *Verificación:* añadir un antecedente desde el buscador guarda con `source: 'MEDDRA'`; escrito a mano con código acuña el término; sin código guarda texto libre; al reeditar, el campo muestra `historyRaw` y guardar sin tocarlo **no envía `historyName`** ni produce `updatedAt`.

11. **La compuerta.** Los tres estados de §3.6 —abierta, no renderizada, visible con aviso de discrepancia— con la regla de cinco banderas en grave y una en no grave, más el bloqueo de la **última** que quede en `'YES'`, con la frase que corresponda al rol.
    *Verificación:* con cinco banderas en `'NO'` y sin filas, la sección no existe en el DOM; con una en `'YES'` aparece; con dos en `'YES'` y filas cargadas, **ninguna** está deshabilitada; al bajar una de las dos, la que queda se deshabilita y explica por qué; con filas y ninguna en `'YES'`, la lista se muestra con el aviso; en rama no grave sólo `hasRelevantMedicalHistory` abre y cierra.

12. **Bajas.** `MEDHIST-005A` con diálogo de confirmación que nombra la fila, y el aviso de §10.4 sobre el `403`.
    *Verificación:* dar de baja un antecedente invalida **sólo** su clave; con rol `USER` el `403` muestra el aviso que menciona al administrador, no un error genérico; borrada la última fila, la bandera bloqueada vuelve a ser editable **sin recargar**.

13. **Tests de integración.** Del orden resultante en las dos ramas, de la compuerta en sus cuatro filas de §3.5, de la lista nueva en sus tres ramas de `source`, y de los diluyentes ausentes en no grave.
    *Verificación:* `npm run check` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las cuatro rutas de `MEDHIST` de §3.2 se consumen; `grep -rn "ESAVI-MEDHIST" src/` **no** devuelve `002A`, `002B`, `003`, `005B` ni `005C`.
- [ ] En rama grave, el orden del DOM del paso 4 es: banderas → antecedentes médicos → farmacológicos → embarazo → vacunas → eventos → descripción → desenlace → notas.
- [ ] En rama no grave aparecen además «Antecedentes de vacunación» y «¿Cómo se verificó…?» entre el embarazo y las vacunas, en ese orden.
- [ ] `SevereNotificationFields.tsx` y `NonSevereNotificationFields.tsx` **no existen**.
- [ ] Cada sección tiene su `<h3>` con el texto del formulario, sin prefijo «Sección N».
- [ ] Las etiquetas de los campos del paso 4 son el texto literal de `ESAVI-FORM.md` en los tres idiomas.
- [ ] En el embarazo, `wasPregnantAtEsavi` va antes que `wasPregnantAtVaccination`; en los antecedentes de vacunación, el establecimiento va el último.
- [ ] Con un caso **no grave**, el modal de vacuna no ofrece diluyentes y `NOTIFDIL-001` no se llama.
- [ ] Con cinco banderas en `'NO'` y sin antecedentes, la sección de antecedentes médicos **no existe en el DOM**.
- [ ] Con **dos** banderas en `'YES'` y antecedentes cargados, ninguna está deshabilitada; al bajar una, la que queda se deshabilita y muestra por qué.
- [ ] Con antecedentes cargados y ninguna bandera en `'YES'`, la sección **se muestra** con el aviso de discrepancia.
- [ ] En rama no grave, sólo `hasRelevantMedicalHistory` abre y cierra la sección de antecedentes.
- [ ] Un antecedente elegido en el buscador guarda con `source: 'MEDDRA'`; escrito a mano con código acuña el término; sin código queda como texto libre.
- [ ] Reeditar un antecedente y guardar sin tocar el nombre **no envía `historyName`** y no produce `updatedAt`.
- [ ] Con rol `USER`, el `403` del `005A` muestra el aviso que menciona al administrador.
- [ ] Borrado el último antecedente, la bandera bloqueada vuelve a ser editable **sin recargar**.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] Las claves nuevas existen en `es`, `en` y `nl`; `npm run i18n:check` sale en 0.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** El paso 4 se ve correcto en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/notification/ src/features/esaviCase/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** La lista de antecedentes colapsa a tarjetas con los dos campos de §3.7, el modal pasa a hoja completa y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` el asistente sigue siendo utilizable entero: se crean antecedentes y no se ofrece reactivar; el `403` del `005A` se explica sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos los diez encabezados de sección, los placeholders y los `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: la lista guarda el id del antecedente que edita y no la fila, la compuerta y el bloqueo se derivan en render, y ninguna clave de caché existente cambió.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** reordenar el paso 4 exactamente como el formulario, incluidas las dos diferencias que más chocan — la descripción del ESAVI al penúltimo lugar y las vacunas antes que los eventos. Quien transcribe desde el papel lo hace de arriba abajo, y una sola inversión obliga a saltar en cada caso.
- **Sí:** disolver los dos bloques de rama y repartir sus campos. Se consideró mantenerlos compactos y sólo reubicarlos enteros: es la mitad del trabajo y deja la pantalla a medio camino entre dos criterios, que es exactamente lo que este spec existe para cerrar.
- **Sí:** adoptar el texto literal del formulario en todos los campos, no sólo donde el significado cambie. `ESAVI-FORM.md` es fuente de etiquetas o no lo es; aplicarlo a la mitad crea dos criterios conviviendo y nadie sabrá después cuál regía cada campo.
- **Sí:** encabezados de sección visibles, **sin el prefijo «Sección N»**. La numeración del documento es didáctica y además difiere entre ramas — la sección 5 es «Selección de vacunas» en grave y «Antecedentes de vacunación» en no grave. Un número que dice cosas distintas según el caso es peor que ningún número.
- **Sí:** bloquear **el cierre** de la compuerta, no las cinco banderas. Deshabilitarlas en bloque, como se hace con `takesMedication`, impediría corregir una alergia mal marcada por culpa de un antecedente que nada tiene que ver. La última que queda en `'YES'` es la única cuyo cambio dejaría filas huérfanas.
- **Sí:** conservar el tercer estado de FE12b — con filas y ninguna bandera en `'YES'`, la lista se muestra con el aviso de discrepancia. El bloqueo evita crear esa incoherencia desde la pantalla, pero no la que ya esté en la base por otra vía.
- **Sí:** leer los antecedentes con el `006` por caso. Es lo que hacen las tres listas hermanas del mismo paso, y evita esperar a que resuelva el `notificationId` para lanzar la consulta.
- **Sí:** `pregnancyComplicationsDescription` dentro de `<PregnancySection>`, aunque sea columna de `severeNotification` y obligue a un componente compartido a recibir un campo de una sola rama. El formulario lo pide pegado a las complicaciones porque es su resumen; separarlo de ellas para respetar la frontera de la tabla sería ordenar la pantalla por el esquema en vez de por la lectura.
- **Sí:** `severeNotes` al final de la sección de banderas, no al final del embarazo. El bloque de embarazo ya tiene su `pregnancyNotes`, y dos campos de notas seguidos en la misma caja son indistinguibles para quien rellena.
- **Sí:** ocultar los diluyentes en la rama no grave sin excepción. El formulario no los pide ahí y no hay filas cargadas en producción que quedaran escondidas; la variante «ocultar salvo que ya existan filas» añade un estado que nunca se alcanzaría.
- **No:** exigir al menos un antecedente cuando la compuerta esté abierta. Cero es una respuesta legítima —el notificador declara que hay antecedentes y puede no conocer el término—, y es la misma razón por la que FE12b no exigió medicación.
- **No:** bloquear `DEATH` en la notificación no grave. El «debería» del formulario es una observación clínica correcta, no una definición del esquema: una muerte mal clasificada se corrige en el paso 3 cambiando la gravedad, no impidiendo guardar el paso 4. Queda como deuda anotada.
- **No:** derivar los antecedentes de la notificación desde `investigationMedicalHistory` del paso 5, ni al revés. Comparten media palabra del nombre y nada más: uno es un cuestionario 1:1 de banderas sobre la investigación, el otro una lista de términos sobre la notificación, escritos por dos personas en dos momentos distintos.
- **No:** ofrecer «reactivar» un antecedente retirado. `MEDHIST-005B` es SUPERADMIN; un botón que responde `403` es peor que su ausencia, y la salida se explica en texto.
- **No:** adelantar en el cliente la guarda de duplicados por `diagnosticTermId`. Corre después de la resolución, y el cliente no siempre tiene el id resuelto con el que comparar. Es la misma decisión de FE12d.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Cambiar todas las etiquetas del paso 4 rompe en masa los tests que buscan por texto visible | El paso 5 del plan es **sólo traducciones** y se committea solo: un fallo ahí es de texto, nunca de estructura, y se distingue del que traiga el reorden |
| El reorden mueve todo lo que FE12a–FE12d dejaron probado, y los tests que asumen posición fallan a la vez | Los tests apuntan a etiqueta y rol accesible, no a índice; los pasos 6 a 8 separan disolver de reordenar, así que un fallo señala cuál de los dos lo produjo |
| Un caso reclasificado de grave a no grave conserva la fila de `severeNotification` con sus cuatro banderas en `'YES'`, y la compuerta de antecedentes quedaría abierta por banderas que ya no se muestran | La compuerta lee **sólo las banderas de la rama activa**: en no grave, las cuatro de `severeNotification` no cuentan aunque la fila exista. Y si hay filas, aparece el aviso de discrepancia, que es exactamente lo que hay que ver |
| Con `MEDHIST-005A` en ADMIN, un `USER` que dejó una bandera sola en `'YES'` con filas cargadas no puede volver atrás | La frase del bloqueo lo dice con `useCan(ADMIN)` y menciona al administrador, en vez de pedir una acción que responderá `403`. Es §10.4 otra vez, y desaparece cuando se atienda |
| Los diez encabezados nuevos son texto visible y es el sitio más fácil donde colar un literal | El criterio de «Sin literales» de §5 los nombra explícitamente, y `npm run i18n:check` exige los tres idiomas |

---

## 8. Impacto en pantallas existentes

Este spec **no añade pantallas**: reescribe una que ya existe.

| Archivo | Qué le pasa |
|---|---|
| `features/esaviCase/NotificationStep.tsx` | Se reordena entero; recibe en línea las cuatro banderas de la rama grave y pinta los diez encabezados de sección |
| `features/esaviCase/SevereNotificationFields.tsx` | **Se elimina.** Sus campos se reparten entre la sección 1, `<PregnancySection>` y el final de la sección 1 |
| `features/esaviCase/NonSevereNotificationFields.tsx` | **Se elimina.** Se parte en `VaccinationBackgroundSection.tsx` y `VerificationSourceSection.tsx` |
| `features/esaviCase/PregnancySection.tsx` | Gana `pregnancyComplicationsDescription`, visible sólo en rama grave y sólo con complicaciones declaradas; cambia el orden de sus dos primeras preguntas |
| `features/notification/VaccineFormDialog.tsx` | `<DiluentList>` deja de renderizarse en rama no grave |
| `features/notification/api.ts` | Gana `notificationMedicalHistoryResource` |
| `features/notification/schemas.ts` | Gana `notificationMedicalHistorySchema` en sus dos variantes |
| `src/i18n/es.json`, `en.json`, `nl.json` | Cambian de valor **todas** las etiquetas del paso 4 y entran las claves de §3.8. Ninguna clave se renombra |
| `references/CASE-PROCESS.md` | §9: la fila de FE12b deja de nombrar `notificationMedicalHistory` y aparece la fila de FE12e |

**Ningún otro paso del asistente cambia.** El bloqueo de los pasos 1 y 2 que dejó FE12d sigue igual, las cadenas de escritura de FE12a y FE12d no se tocan, y ninguna clave de caché se renombra.

---

## Lo que **no** está en este spec

- El paso 5 y `investigationMedicalHistory`, que comparte media palabra del nombre y ningún dato.
- El rango de edad de la compuerta de embarazo del paso 5 (12–49 en el texto, 12–50 en la condición) y la incoherencia interna de `ESAVI-FORM.md`.
- Bloquear el desenlace `DEATH` en la notificación no grave.
- Reactivar y purgar antecedentes médicos: `MEDHIST-005B` y `005C` son SUPERADMIN.
- El listado con inactivos `MEDHIST-002B` y el detalle por id `MEDHIST-003`.
- Un obligatorio de proceso nuevo bajo «Completar etapa».
- Revisar los términos acuñados por la rama `LOCAL` en `diagnosticTerm`.
- Reordenar filas dentro de las listas satélite.
- Persistir el contenido del modal de antecedente en `draftsStore`.
- El orden de los pasos 1, 2, 3, 5 y 6.

Cada uno de esos, si aterriza, va en su propio spec.

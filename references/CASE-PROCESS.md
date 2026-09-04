# El proceso de registro de un caso ESAVI

> **Fuentes:** `esavi-backend/esaviapp.sql` (DDL), `esavi-backend/src/services/*.service.ts`, `esavi-backend/src/validators/*.validator.ts`, `esavi-backend/references/functional/specs/` — y, para los dos componentes de §5.4b, los plugins DHIS2 en producción de `references/external/who-drug/` y `references/external/meddra/`
> **Fecha:** 2026-09-03 · **Estado:** **completo** — los seis pasos recorridos columna a columna. Lo que queda abierto son las seis peticiones de §10, que no dependen de este repositorio

Las reglas del recorrido que va del paciente al expediente cerrado. **No describe pantallas**: cada spec `FE08`–`FE14` diseña la suya y **cita** este documento en lugar de copiarlo. Una condición escrita en cuatro sitios está desactualizada en tres.

---

## Estado

**El documento está completo.** §1 a §10, y **§5 recorrido entero** — los seis pasos, 27 tablas y unas 320 columnas contrastadas una a una contra su validador y su servicio del backend.

**No queda ninguna sesión de redacción pendiente.** Lo que sigue es escribir los specs `FE08`–`FE14` (§9), y ninguno reabre esto: lo citan.

**Lo que sí queda abierto, y no depende de este repositorio** — las seis peticiones de §10:

| Pieza | Estado |
|---|---|
| Cuatro entidades del paso 4 exigen ADMIN para escribir | **§10.4** — pedido. El paso 5 entero escribe como `USER`, y eso lo refuerza. **Bloquea `FE12b`** |
| `pharmaceuticalForm`, `administrationRoute` y `diluentCatalog` sin sembrar | **§10.5** — precondición de datos |
| `PREGNANCY_FEMALE_SEX_ITEM` sin sembrar | **§10.6** — sin ella, el bloque de embarazo da `500` |
| Fila `systemConfig` con el código de país | **§10.1** — decidida, con respaldo en `.env` |
| `ESAVI-NOTIFIER-005A` debe admitir USER | **§10.2** — pedido |
| Comprobación de `CLOSED` en los cuatro `PUT` de fase | **§10.3** — pedido |

**Antes de implementar, leer en este orden:** §5.0 (el método y qué va al spec), el §5.x del paso que toque, y §7 entero (las reglas transversales, que son las que se rompen). §6 se lee una vez y se recuerda: las seis contradicciones del modelo aparecen repartidas por todos los pasos.

**El método está en §5.0 y se sigue sin excepción:** cada columna se contrasta contra su **validador** y su **servicio** del backend antes de escribir nada sobre ella. Los pasos 1 a 4 no dejaron sorpresas precisamente por eso — `isSeriousEvent` parece un interruptor y es un derivado, `age` parece un campo y es un cálculo, `documentNumber` y `notifier.lastName` son nulables en el DDL y obligatorios en el validador, `complicationName` parece una columna y no lo es. Ninguno se habría descubierto leyendo sólo `esaviapp.sql`.

**Fuentes a abrir en cada sesión, en este orden:** `esavi-backend/esaviapp.sql` (DDL) → `esavi-backend/src/validators/<tabla>.validator.ts` → `esavi-backend/src/services/<tabla>.service.ts` → y, si aparece una regla que no cuadra, el spec funcional en `esavi-backend/references/functional/specs/`.

**Y cuando el paso toque un componente que ya existe en DHIS2, `references/external/` manda sobre la invención.** Son los plugins en producción: el comportamiento que la gente ya usa. §5.4b replicó de ahí el árbol de WHODrug y el buscador de MedDRA — orden de los niveles, cuándo se colapsa uno, debounce, qué se muestra en la lista — en vez de deducirlo del endpoint. La investigación puede tener más casos así; se mira antes de diseñar, no después.

**Nada de esto se implementa todavía.** Ningún spec `FE08`–`FE14` está escrito y no hay código del wizard. El orden y las dependencias están en §9.

---

## 1. El recorrido: seis pasos, cuatro fases

El wizard tiene **seis pasos**. El backend conoce **cuatro fases** (`CaseWorkflowStage`). No coinciden, y la diferencia es deliberada:

| Paso del wizard | Fase del workflow | Fila que escribe |
|---|---|---|
| 1. Paciente | — | `patient` |
| 2. Apertura del caso | — (aquí **nace** el workflow) | `esaviCase` + `caseWorkflow` + `notifier` |
| 3. Clasificación inicial | `CLASSIFICATION` | `classification` |
| 4. Notificación | `NOTIFICATION` | `notification` + rama + 6 satélites |
| 5. Investigación | `INVESTIGATION` | `investigation` + 8 satélites 1:1 + 2 listas + 2 nietas |
| 6. Clasificación final | `FINAL_CLASSIFICATION` | `finalClassification` |

Los pasos 1 y 2 no tienen fase porque ocurren **antes de que exista el `caseWorkflow`**: la fila nace dentro de la transacción de `ESAVI-CASE-001`. Hasta ese momento no hay expediente que gobernar.

Los pasos 4 y 5 son condicionales sólo en su **contenido**, no en su existencia (§5).

### 1.1 El stepper agrupa: notificar es más que el paso 4

Para el ciclo de vigilancia, **todo lo anterior a la investigación es notificar** — abrir el caso, clasificarlo inicialmente y llenar la ficha son un solo acto, aunque sean tres tablas y tres fases. Conceptualmente son distintos; en el proceso son un momento.

El stepper lo refleja agrupando, sin cambiar ni las fases ni las escrituras:

```
Paciente
Notificación ──┬── 2. Apertura del caso
               ├── 3. Clasificación inicial
               └── 4. Ficha de notificación
Investigación ──── 5. Investigación
Cierre ─────────── 6. Clasificación final
```

De ahí sale una consecuencia concreta: `esaviCase.reportFillingDate` y `notificationOrganization` **se llenan en el paso 2** aunque su nombre suene a ficha. Son columnas de `esaviCase`, y bajo esta agrupación el usuario no percibe el salto.

---

## 2. Dónde nace cada fila, y en qué orden es posible

El orden no es una preferencia de diseño: lo imponen las claves foráneas `NOT NULL`.

```
patient                         independiente, reutilizable entre casos
   ↓ patientId
esaviCase ─────┬─→ caseWorkflow  misma transacción, ESAVI-CASE-001
               └─→ notifier      caseId NOT NULL → escritura aparte, posterior
   ↓ caseId
classification · notification · investigation · finalClassification
   ↓                ↓                ↓
   —          rama + 6 satélites   8 sat. 1:1 + 2 listas + 2 nietas
```

**Consecuencias que afectan al wizard:**

- **El paso 2 son dos escrituras, no una.** `notifier.caseId` es `NOT NULL`, así que el notificador **no puede viajar en el `POST` del caso**: es un `POST /api/notifiers` (`ESAVI-NOTIFIER-001`) posterior. La pantalla puede presentarlos como un solo formulario, pero guarda en dos llamadas y la segunda puede fallar sola.
- **Un paciente puede existir sin caso.** Abandonar el wizard entre el paso 1 y el 2 deja un paciente huérfano. Es tolerable —es una fila legítima, buscable y reutilizable— y se mitiga haciendo del paso 1 una búsqueda primero y un alta después (§5).
- **Las cuatro fases sólo dependen del caso.** Ninguna depende de otra: el esquema no impide crear la investigación sin notificación. Lo impide el cliente, y las precondiciones de cierre (§4.4).

---

## 3. Los ocho estados del expediente

`caseWorkflow.statusItemId` → catálogo `caseWorkflowStatus`.

| Estado | Significado | Quién lo escribe |
|---|---|---|
| `OPEN` | Caso creado, sin fase iniciada | `ESAVI-CASE-001` |
| `IN_CLASSIFICATION` | | `POST` de la fase (`012`) |
| `IN_NOTIFICATION` | | `POST` de la fase (`012`) |
| `IN_INVESTIGATION` | | `POST` de la fase (`012`) |
| `IN_FINAL_CLASSIFICATION` | | `POST` de la fase (`012`) |
| `PENDING_VALIDATION` | Requiere revisión. **Reversible** | `ESAVI-CASEFLOW-010` / `011` |
| `CLOSED` | Expediente cerrado | `ESAVI-CASEFLOW-008` |
| `REOPENED` | Reabierto por ADMIN | `ESAVI-CASEFLOW-009` |

**El estado lo mueve la creación de una fase, nunca su terminación.** `ESAVI-CASEFLOW-012` no tiene ruta HTTP: lo invocan los cuatro servicios de fase dentro de su propia transacción. Una fase que no puede mover el workflow tampoco se crea.

**`PENDING_VALIDATION` no detiene el trabajo.** Si el expediente avanza de fase mientras espera revisión, `012` mueve `previousStatusItemId` en lugar de `statusItemId`: el `011` devuelve el caso a la fase **que alcanzó**, no a la que tenía cuando se pidió la revisión.

**No confundir con `investigation.statusItemId`.** Ése es el catálogo `investigationStatus` —*Recuperado*, *Fallecido*, *No recuperado*— y es el **desenlace clínico del paciente**. Son ortogonales: un caso cerrado puede tener al paciente sin recuperar.

**Ni con `ESAVI-CASEFLOW-005A`/`005B`.** Ésos activan y desactivan el **registro** del workflow, como en cualquier otra entidad. Cerrar es `008`, reabrir es `009`. Es la confusión que el SPEC F44 más quiere evitar.

---

## 4. Guardar, completar, cerrar: qué hace y qué **no** hace cada acción

### 4.1 Guardar (guardado parcial)

`POST` la primera vez, `PUT /:id` las siguientes. Cuál toca lo dice `ESAVI-CASEFLOW-006` sin adivinar: `stages.<fase>.exists === false` → `POST`; `true` → `PUT` sobre el `id` devuelto.

- **El primer `POST` de una fase es lo que la inicia.** No existe ni hace falta un botón «iniciar etapa»: `012` sella `<fase>StartedAt` —sólo si era `NULL`, así que reintentar nunca reescribe el instante original—, mueve el estado y deja auditoría.
- **Guardar de más es gratis.** El backend hace update diferencial (`CONVENTIONS.md` §11): un `PUT` que no cambia nada no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría. El botón puede apretarse sin miedo y el autoguardado por sección es viable.
- **No calcular el diff en el cliente.** Se envía el objeto completo.

### 4.2 Completar etapa

`PATCH /api/case-workflows/case/:id/complete-stage` (`ESAVI-CASEFLOW-007`), body `{ stage }` con uno de los cuatro valores de `CaseWorkflowStage`.

Hace **una sola cosa**: sellar `<fase>EndedAt`.

Lo que **no** hace, y la interfaz no debe prometer:

- **No toca `statusItemId`.** Una clasificación terminada no mete el expediente en notificación; eso lo hace el `POST` de la notificación.
- **No desbloquea nada.** El cierre (§4.4) comprueba que las filas **existan y estén activas**, nunca que tengan `endedAt`.
- **No es imprescindible.** `012` sella la fase **inmediatamente anterior** al entrar en una nueva, si quedó abierta. Saltarse el botón no deja sellos huérfanos ni duraciones incalculables.

Entonces, ¿para qué sirve? Para dos cosas: sellar la **última** fase —a la que ninguna posterior va a cerrar— y registrar el instante en que **una persona** dio la fase por terminada, en lugar del instante en que alguien empezó la siguiente. Es el insumo de `durationMinutes`, que se calcula al leer y no se almacena.

Sus tres `409`:

| `code` | Cuándo | Qué hace el cliente |
|---|---|---|
| `CASEFLOW_007_STAGE_NOT_STARTED` | La fila de la fase no existe | **Prevenirlo**: botón deshabilitado mientras `exists === false` |
| `CASEFLOW_007_STAGE_ALREADY_COMPLETED` | Ya tiene `endedAt` | Prevenirlo igual; si llega, refrescar el workflow |
| `CASEFLOW_007_CASE_CLOSED` | Expediente cerrado | Todo el wizard en sólo lectura |

### 4.3 Pedir y resolver validación

`010` marca `PENDING_VALIDATION` guardando el estado actual en `previousStatusItemId`; `011` lo restaura. Se puede pedir desde cualquier estado abierto. Son dos operaciones y no un interruptor, para que el código de operación diga qué se intentó.

`CASEFLOW_011_PREVIOUS_STATUS_MISSING` es un **500**: incoherencia de datos que `010` hace imposible.

### 4.4 Cerrar el expediente

`PATCH /api/case-workflows/case/:id/close` (`ESAVI-CASEFLOW-008`). Cuatro precondiciones sobre filas **activas** del caso:

| Fase | Obligatoria para cerrar |
|---|---|
| `classification` | siempre |
| `notification` | siempre |
| `investigation` | si `notification.requestInvestigation === true` |
| `finalClassification` | si `classification.isSeriousEvent === true` **o** `requestInvestigation === true` |

Un caso **no grave y sin investigación se cierra sin clasificación final**. Un caso grave se clasifica formalmente aunque nunca se investigara; uno no grave que **sí** se investigó arrastra su clasificación final.

**La gravedad se lee de `classification.isSeriousEvent`, no de `notification.notificationType`.** Decisión del backend, y su motivo importa: hacer depender el cierre de un dato posterior al que lo origina invierte el flujo. `NULL` cuenta como *no grave*.

El cierre además sella con el mismo instante la **última** fase que quedara abierta —sólo la última: sellarlas todas inventaría un final para fases en las que el expediente nunca entró.

Sus cinco `409`: `ALREADY_CLOSED`, `PENDING_VALIDATION`, `CLASSIFICATION_REQUIRED`, `NOTIFICATION_REQUIRED`, `INVESTIGATION_REQUIRED`, `FINAL_CLASSIFICATION_REQUIRED` (con prefijo `CASEFLOW_008_`). El cliente replica las cuatro condiciones para deshabilitar «Cerrar» **con la razón visible**, y aun así los mapea todos: la comprobación local es experiencia de usuario, la autoridad es el servidor.

### 4.5 Quién puede editar, y cuándo deja de poder

**Regla de negocio: un expediente completado no se edita.** Para volver a editarlo, un ADMIN tiene que reabrirlo.

«Completado» significa aquí **`CLOSED`**, el estado que escribe `ESAVI-CASEFLOW-008`. No significa «etapa completada»: sellar una fase con `007` es documental y no bloquea nada (§4.2). La distinción no es un matiz de vocabulario, es la diferencia entre una regla implementable y una trampa:

| | Bloquea la edición | Cómo se revierte |
|---|---|---|
| Fase completada (`<fase>EndedAt`) | **No** | **No hay endpoint.** `007` rechaza `ALREADY_COMPLETED` y nada limpia el sello |
| Expediente cerrado (`CLOSED`) | **Sí** | `ESAVI-CASEFLOW-009`, rol **ADMIN** |

Si el bloqueo colgara de la fase completada, cualquiera podría dejar su propio expediente inservible con un clic y sin salida. Cuelga del cierre, que sí tiene marcha atrás.

**Reabrir es la operación de «descompletar» y ya existe.** `PATCH /api/case-workflows/case/:id/reopen` exige que el estado sea `CLOSED` (`409 CASEFLOW_009_NOT_CLOSED` si no lo está), lo pasa a `REOPENED`, sella `lastReopenedAt` e incrementa `reopenCount`. Un expediente reabierto se edita con normalidad y se vuelve a cerrar con `008`. **El contador y la fecha ya instrumentan la regla**: cuántas veces se descompletó un caso y cuándo fue la última es dato consultable, no hay que añadir nada.

> **El bloqueo es del cliente, no del backend.** Verificado: sólo la **creación** de una fase comprueba `CLOSED`, y lo hace a través de `012`. Los `PUT /:id` de `classification`, `notification`, `investigation`, `finalClassification` y `esaviCase` **no miran el workflow**: una escritura sobre un caso cerrado se acepta hoy sin protestar. Deshabilitar los formularios es entonces experiencia de usuario, exactamente igual que `useCan()` — y a diferencia de los roles, aquí el backend **no** es la red de seguridad. Si esta regla importa de verdad, es una dependencia del otro repositorio: la comprobación de `CLOSED` tendría que bajar a los cuatro `004`.

Cuando el expediente está `CLOSED`, el wizard entero es de sólo lectura: campos deshabilitados, sin «Guardar», sin «Completar etapa», y un aviso que nombra la salida —«pide a un administrador que reabra el expediente»— en vez de un botón que el usuario no puede pulsar.

### 4.6 «Obligatorio» no significa «bloquea el guardado»

**Regla general del wizard, y probablemente la más importante de este documento.** Nadie tiene toda la información en el instante en que abre un caso. Un formulario a medio llenar tiene que poder guardarse y continuarse después, aunque le falten campos obligatorios.

Hay entonces **dos niveles de obligatoriedad**, y confundirlos es lo que convierte un wizard en un interrogatorio:

| Nivel | Qué es | Cuándo se valida | Si falta |
|---|---|---|---|
| **Bloqueante de guardado** | Lo que el DDL o el validador exigen para que la fila **exista** | Al pulsar **Guardar** | No hay nada que guardar. El campo se marca y el `POST` no sale |
| **Obligatorio de proceso** | Lo que el proceso ESAVI exige para dar la etapa por terminada | Al pulsar **Completar etapa**, y al **Cerrar** | La fila se guarda igual, incompleta y visible. Sólo se bloquea el avance |

Los bloqueantes de guardado son pocos y están todos identificados en §5: `patient.names`, `lastNames`, `documentNumber`; `esaviCase.patientId`, `healthFacilityId`; `notifier.caseId`, `firstName`, `lastName`; la matriz de coherencia de gravedad de `classification` (§5.3); `notification.notificationType`, `esaviDescription`. **Todo lo demás del modelo es nulable**, y esa nulabilidad es deliberada — `investigation` sólo exige `caseId` justamente para poder llenarse por partes.

Consecuencias de implementación:

- **Cada formulario lleva dos esquemas Zod**, no uno: `saveSchema` con sólo los bloqueantes, y `completeSchema` con los obligatorios de proceso. El botón decide cuál corre.
- **La marca visual de «obligatorio» es la misma**, pero el mensaje no: «falta para guardar» y «falta para completar la etapa» son cosas distintas y el usuario tiene que poder distinguirlas.
- **Al pulsar «Completar etapa» con campos pendientes**, la pantalla los lista en vez de deshabilitar el botón en silencio. Un botón apagado sin explicación es la peor versión de esta regla.
- **Las filas incompletas aparecen en el listado**, y eso ya está resuelto en el modelo: el estado del expediente lo nombra (`IN_NOTIFICATION`, `IN_INVESTIGATION`). En vigilancia, un caso incompleto pero visible vale más que uno completo que nadie ve todavía (`ARCHITECTURE.md` §3.4).

---

## 5. Las condiciones, paso a paso

> **Sección cerrada.** Se redactó un paso por sesión, y cada bloque es el insumo directo de las §3.4 y §3.5 del spec correspondiente.

### 5.0 Qué se decide aquí y qué se decide en el spec

Los seis pasos tocan **27 tablas y unas 320 columnas de negocio**. Volcarlas aquí una a una sería reescribir el DDL y adelantar el spec; no volcarlas deja las decisiones sin sitio. El corte:

**Aquí, tabla por tabla** — sólo lo que **una persona tuvo que decidir** y no se lee del esquema:

| Bloque | Qué recoge |
|---|---|
| Tablas que toca el paso | Cardinalidad (1:1 o N) y códigos `ESAVI-*` |
| Obligatorios de verdad | El validador y el DDL **no coinciden** — `patient.documentNumber` es el caso testigo (§5.1) |
| Campos que no se piden | Derivados o generados por el backend (§8) |
| Campos condicionales | Cuáles aparecen según el valor de otro, y de cuál |
| Variante de `answerOption` | `unknown`, `noAnswer` o `full` por campo (§7) |
| Presentación de las tablas `N` | **Patrón canónico: lista con «Añadir», y cada alta o edición en un modal** (§5.2). Sólo se documenta la desviación |
| Decisiones abiertas | Lo que falta preguntar |

**En el spec, §3.5** — la tabla completa campo a campo: etiqueta i18n, widget, esquema Zod, mensaje de error. Es mecánico una vez fijadas las reglas de arriba, y ahí sí van los 320.

**El criterio, en una línea: si se puede leer del DDL, no va aquí.**

#### Método a partir del paso 4: columna por columna, sin asumir

Los tres primeros pasos enseñaron que **el comportamiento no se deduce del nombre de la columna**. `classification.isSeriousEvent` parece un interruptor y es un derivado; `age` parece un campo y es un cálculo; `patient.documentNumber` es nulable en el DDL y obligatorio en el validador; `notifier.lastName`, igual. Cada uno de esos se descubrió leyendo el servicio, no la tabla.

Así que de §5.4 en adelante **se repasa una a una cada columna** contra su validador y su servicio, y de cada una se responde:

1. ¿Se pide, o lo escribe el backend? (§8)
2. ¿Lo exige el validador aunque el DDL lo admita nulo? ¿Es bloqueante de guardado o de proceso? (§4.6)
3. ¿Depende de otra columna para mostrarse o para ser obligatoria?
4. Si es `answerOption`, ¿qué variante? (§7). Si es `boolean`, ¿admite `null` y significa algo?
5. ¿Es derivado de otra tabla, y se recalcula solo?

**Ninguna columna se da por entendida sin haber mirado su servicio.** Es más lento y es la razón por la que estos tres pasos no dejaron sorpresas para la implementación.

Lo que sigue yendo al spec y no aquí: la etiqueta i18n, el widget concreto, el esquema Zod y el texto de cada mensaje de error.

Reparto y tamaño, para saber a qué nos comprometemos:

| Paso | Tablas | Columnas | Sesiones estimadas |
|---|---|---|---|
| 1 · Paciente | 1 | 12 | ✅ cerrado |
| 2 · Apertura del caso | 3 | 21 | ✅ cerrado |
| 3 · Clasificación inicial | 1 | 16 | ✅ cerrado |
| 4 · Notificación | 9 | 97 | ✅ cerrado (2 sesiones: §5.4 y §5.4b) |
| 5 · Investigación | **14** | ~160 | Mapa y cabecera cerrados; **4 sesiones**, repartidas en §5.5.0 |
| 6 · Clasificación final | 1 | 14 | ✅ cerrado |

### 5.1 Paso 1 — Paciente · **cerrado**

**Entidad:** `patient` · **Endpoints:** `ESAVI-PATIENT-006`, `-007`, `-001`, `-004`, `-003`

#### La restricción que decide la pantalla

Las columnas personales están **cifradas una a una**, y eso elimina la búsqueda parcial:

| Endpoint | Busca por | Forma de coincidencia |
|---|---|---|
| `GET /api/patients/search/:identifier` (`006`) | `documentNumber` **o** `passportNumber` | **Exacta**. Normaliza y cifra el valor antes de comparar |
| `GET /api/patients/search-by-name?name=` (`007`) | `nameTokens` con `@>` | **Tokens completos**. «Perez» encuentra, «Per» no |

Consecuencia: el paso 1 **no es un `<EntitySearchSelect>` con debounce de dos caracteres**. Es un formulario de búsqueda explícito, y el usuario tiene que saber que escribir medio apellido no sirve.

Además, ordenar alfabéticamente es imposible: los apellidos están cifrados. El listado sale por fecha, más reciente primero.

#### Campos obligatorios al crear (`createPatientValidator`)

`names`, `lastNames` y **`documentNumber`** — el DDL lo admite nulo, pero el validador lo exige. Todo lo demás es opcional: `birthDate`, `passportNumber`, `email`, `phoneNumber`, `sexItemId` (`<CatalogSelect typeCode="sex">`), `residenceGeoLocationId` (`<GeoLocationPicker>`). `healthSystemCode` **no se envía**: lo genera el backend y descarta sin error lo que llegue con ese nombre (§8).

`UQ_patient_documentNumber` es único: un alta con documento repetido responde `409 PATIENT_001_DOCUMENT_EXISTS`. **Ese 409 no es un error del usuario, es un hallazgo**: el paciente ya existe y hay que ofrecer usarlo, no repetir el formulario. La comprobación **no filtra por `isActive`**, así que el choque puede ser contra un paciente desactivado — que no aparece en `002A` ni en las búsquedas. Es el único caso en que el usuario ve «documento ya registrado» sin poder encontrar al titular; el mensaje tiene que decirlo.

#### Paciente sin documento: identificador provisional

**Decidido.** El validador exige `documentNumber` y no hay forma de crear un paciente sin él, así que el formulario lleva una casilla **«sin documento»** que deshabilita el campo y lo rellena con un identificador provisional generado en el cliente.

Formato: `PROV-YYYYMMDD-XXXX`, donde `XXXX` son cuatro símbolos del alfabeto **Crockford Base32** (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — sin `I`, `L`, `O` ni `U`, para que sobreviva a ser dictado por teléfono o copiado de un impreso). Es el mismo alfabeto que `generateHealthSystemCode`, y se reutiliza a propósito.

Por qué ese formato funciona contra el backend:

- `normalizeDocument` es `trim().toUpperCase()`: guiones y letras sobreviven intactos, y `ESAVI-PATIENT-006` lo encuentra por coincidencia exacta como a cualquier otro documento.
- El prefijo `PROV-` lo hace reconocible a simple vista, que es lo que permite sustituirlo después.

Reglas que arrastra:

| Regla | Motivo |
|---|---|
| El identificador se genera en el cliente, **no** en el servidor | No existe endpoint que lo mine. Es la única identidad de este documento que no la escribe el backend |
| Un `409 PATIENT_001_DOCUMENT_EXISTS` sobre un `PROV-` se reintenta **regenerando**, hasta 3 veces | Sin unicidad garantizada por construcción, la colisión es improbable pero posible, y aquí sí es un error de máquina, no un hallazgo |
| El identificador se muestra en grande al terminar el alta | Es lo único con lo que ese paciente se vuelve a encontrar: por nombre hace falta el token completo (§5.1), y nadie recuerda cuatro caracteres aleatorios |
| Se sustituye por el documento real vía `ESAVI-PATIENT-004` cuando aparezca | El `004` comprueba unicidad excluyendo la propia fila y responde `409 PATIENT_004_DOCUMENT_EXISTS` si el documento real ya está en otro paciente — que es exactamente el caso «este provisional y aquel real son la misma persona», y pide fusión manual, no un `PUT` |

#### Condiciones

| Condición | Regla |
|---|---|
| Salida del paso | Un `patientId` resuelto, venga de búsqueda o de alta |
| Buscar antes de crear | El alta sólo se ofrece **después** de una búsqueda sin resultados |
| Documento duplicado (`409`) | Se resuelve ofreciendo el paciente existente, no reintentando el alta. Excepción: sobre un `PROV-`, se regenera |
| Sin documento | Casilla «sin documento» → `PROV-YYYYMMDD-XXXX` generado en el cliente |
| **Editar el paciente desde el wizard** | **Sí.** `ESAVI-PATIENT-004` se consume desde el paso 1, sin salir del wizard |
| **Cambiar de paciente con el caso ya creado** | **No.** En reentrada el paso 1 es de sólo lectura sobre la identidad: se edita al paciente, nunca se sustituye. `esaviCase.patientId` no se toca |
| Paciente huérfano por abandono | Aceptado (§2). Sin limpieza automática |

**La consecuencia de no poder cambiar de paciente hay que asumirla entera:** un caso abierto contra la persona equivocada **no tiene arreglo desde el wizard**. La salida es administrativa — desactivar el caso (`ESAVI-CASE-005A`, rol ADMIN) y abrir otro. La pantalla debe hacer esa irreversibilidad visible **antes** del `POST` del paso 2, no después, porque es ahí donde deja de ser reversible.

**El backend respalda esta regla, no hay que sostenerla sola.** `ESAVI-CASE-004` hizo `patientId` **inmutable** en el SPEC F11 §3.1: el `004` ya ni siquiera lo lee, y un `patientId` desconocido en el cuerpo tampoco provoca un `404` — se ignora en silencio, como todo campo inmutable (`CONVENTIONS.md` §11). El motivo del backend es el mismo que el nuestro, escrito en `esaviCase.service.ts:440`: *«un caso no cambia de paciente — se crea otro»*. Y hay una razón técnica añadida: cambiar de paciente cambiaría la `birthDate` de la que se deriva `classification.age`, y el F11 cerró ese tercer camino de propagación eliminándolo.

### 5.2 Paso 2 — Apertura del caso · **cerrado**

**Tablas:** `esaviCase` (10 columnas), `notifier` (11), `caseWorkflow` (nace solo)
**Endpoints:** `ESAVI-CASE-001`, `ESAVI-NOTIFIER-001` y `-002A`, `ESAVI-HFAC-006`, `ESAVI-USERGEO-008`

#### Es el paso que crea el expediente, y son dos escrituras

```
POST /api/esavi-cases        → esaviCase + caseWorkflow   (una transacción)
POST /api/notifiers          → notifier                    (caseId NOT NULL)
```

`notifier.caseId` es `NOT NULL`, así que el notificador **no puede viajar en el `POST` del caso**. La pantalla puede presentarlos como un formulario único, pero **la segunda llamada puede fallar sola** y dejar un caso sin notificador. No es un estado inválido —nada lo prohíbe, ver más abajo—, pero sí es un estado que la interfaz tiene que saber mostrar y reintentar.

`assertCaseIsValid` exige que el caso esté `isActive: true`, y `ESAVI-NOTIFIER-004` **ignora `caseId` llegue o no en el cuerpo**: un notificador no se mueve de caso, nunca.

#### Obligatorios de verdad

| Tabla | Exige el validador | Nota |
|---|---|---|
| `esaviCase` | `patientId`, `healthFacilityId` | Todo lo demás opcional |
| `notifier` | `caseId`, `firstName`, **`lastName`** | El DDL admite `lastName` nulo; el validador lo exige, «un notificador con sólo el nombre no identifica a nadie». Segundo caso testigo de que **validador ≠ DDL** |

Opcionales de `esaviCase`: `reportDate`, `eventDate`, `reportFillingDate`, `notificationOrganization` (≤250), `details`. `countryIsoCode` no se pregunta (más abajo).
Opcionales de `notifier`: `professionItemId` (`<CatalogSelect typeCode="profession">`), `geoLocationId`, `room`, `address`, `phoneNumber`, `email`.

**Obligatorio de proceso, no de guardado (§4.6): al menos un notificador.** El backend no lo exige nunca —no está entre las precondiciones de cierre de §4.4—, así que hoy un caso se abre, se completa y se cierra sin uno solo. Lo exige este cliente, y lo exige **para completar la etapa**, no para guardar: el caso se crea y se continúa después, porque quien abre un ESAVI rara vez tiene los datos del notificador delante en ese instante.

#### Los notificadores son una lista

`notifier.caseId` **no tiene `UNIQUE`**: un caso admite varios, y se recuperan con `GET /api/notifiers?caseId=` (`002A`) — no hay ruta `/case/:id`.

Presentación: **lista con «Añadir notificador», y cada alta o edición en un modal.** Es el **patrón canónico de este wizard para toda tabla de cardinalidad `N`** (§5.0), y aquí aparece por primera vez: la lista muestra nombre, apellido y profesión; el modal lleva el formulario completo; borrar es `ESAVI-NOTIFIER-005A` (rol ADMIN — un USER no puede quitar el que añadió, conviene saberlo antes de diseñar el botón).

#### `countryIsoCode` se fija por configuración

No se pregunta en el formulario: es un sistema nacional y repetir el país en cada caso es ruido. Se resuelve al arranque y viaja en el `POST` sin que el usuario lo vea.

**Dependencia pendiente:** hoy **no existe la fila**. El mecanismo sí — `systemConfig` es clave/valor global y `ESAVI-SYSCONF-006` (`GET /api/system-configs/code/:code`, rol USER) la lee — pero ninguna semilla de `esaviapp.sql` define un código de país. Hace falta que un SUPERADMIN cree la fila (`ESAVI-SYSCONF-001`). Preferible a una variable `VITE_*` porque cambiarla no exige volver a desplegar; si la fila no puede crearse a tiempo, la variable de entorno es el respaldo y queda anotado como deuda.

#### Las tres fechas y sus reglas cruzadas

| Campo | Regla |
|---|---|
| `reportDate` | `DEFAULT current_date`. No futura |
| `eventDate` | No futura, y **≤ `reportDate`** |
| `reportFillingDate` | No futura |

La comprobación cruzada la repite el servicio contra el estado resultante: si `reportDate` no viaja en el cuerpo, el validador no tiene contra qué comparar y el servicio resuelve el valor almacenado. En el cliente, `<DateField>` con validación cruzada en Zod, y no confiar en que el orden lo garantice la pantalla.

**`reportDate` no es un campo cualquiera:** entra en el `caseCode` (§8). Cambiarla después por `ESAVI-CASE-004` **no** regenera el código, así que el identificador puede quedar diciendo una fecha y la fila otra.

#### La unidad de salud: el punto delicado del paso

**No existe «la unidad del usuario».** `appUser` no tiene `healthFacilityId`; lo que tiene es un **alcance geográfico** en `appUserGeoLocation`. La unidad se elige siempre.

Y elegirla tiene una asimetría que hay que resolver en el cliente:

| | Comportamiento |
|---|---|
| `POST /api/esavi-cases` | **Sí** valida el alcance. Unidad inactiva o fuera del alcance → `404 CASE_001_FACILITY_NOT_FOUND` / `CASE_001_FACILITY_OUT_OF_SCOPE` |
| `ESAVI-HFAC-002A` y `-006` | **No** filtran por alcance. Ofrecen la tabla nacional entera |

Es decir: **el selector ofrece unidades que el `POST` va a rechazar, con un mensaje que dice «no encontrada»**. El cliente tiene que cerrar ese hueco por su cuenta — obtener la cobertura con `ESAVI-USERGEO-008` (que la expande recursivamente) y descartar de los resultados las unidades cuyo `geoLocationId` no esté en ella.

Dos detalles más del selector:

- **`geoLocationId` de `HFAC-006` es igualdad exacta, no jerárquica** — a diferencia del filtro de casos del SPEC F48. Elegir «Pichincha» devuelve **cero** unidades, porque apuntan al nivel más fino. Si se usa la cascada geográfica, hay que bajar hasta la hoja.
- Por eso el camino natural es **buscar por nombre o código** con `HFAC-006` (mínimo 2 caracteres, `<EntitySearchSelect>`) y filtrar por cobertura, dejando la cascada como alternativa.

**El alcance vacío bloquea el paso entero.** `resolveUserGeoScopeIds` devuelve `null` para ADMIN y superiores —sin restricción— pero `[]` para un USER sin asignaciones activas en `appUserGeoLocation`. Con `[]`, **toda** unidad queda fuera de alcance y ese usuario no puede abrir ningún caso, leyendo «unidad de salud no encontrada» pruebe la que pruebe. Es una trampa de alta de usuarios, no un error del wizard: la pantalla debe detectar la cobertura vacía **al entrar al paso** y decirlo con esas palabras — «no tienes territorio asignado, pide a un administrador que te asigne cobertura».

#### Lo que devuelve el `POST`

`toEsaviCaseResponse` **elimina `patientId` y `healthFacilityId`** y devuelve en su lugar los objetos `patient` y `healthFacility` resueltos. El wizard lee de ahí, no de los ids que envió.

#### Condiciones

| Condición | Regla |
|---|---|
| Salida del paso | Un `caseId`. A partir de aquí la URL lo lleva y todo es reanudable |
| Redirección tras el `POST` | `navigate(/esavi-cases/:id/wizard/classification, { replace: true })` — atrás no debe ofrecer crear el caso otra vez |
| Irreversibilidad | Antes del `POST`, avisar de que el paciente ya no se podrá cambiar (§5.1) |
| Cobertura geográfica vacía | Se detecta al entrar y bloquea el paso con mensaje propio |
| Unidad fuera de alcance | Se previene filtrando el selector; el `404` se mapea igualmente |
| Notificadores | Lista con modal. **Uno como mínimo para completar la etapa**, ninguno para guardar (§4.6) |
| `countryIsoCode` | No se pregunta. Sale de `systemConfig` |
| `reportFillingDate`, `notificationOrganization` | Se llenan aquí, presentados bajo el grupo «Notificación» del stepper (§1.1) |
| Fallo del `POST` del notificador | El caso ya existe y **no se deshace**: se permanece en el paso, con el caso identificado, un error que nombra qué falló, y el notificador reintentable |

#### Deuda que deja este paso

Las dos están resueltas como decisión y anotadas en §10: la fila `systemConfig` del código de país (con `VITE_ESAVI_APP_COUNTRY_ISO_CODE` ya escrito como respaldo) y la bajada de rol de `ESAVI-NOTIFIER-005A` a USER.

### 5.3 Paso 3 — Clasificación inicial · **cerrado**

**Tabla:** `classification` (16 columnas) · **Endpoints:** `ESAVI-CLASSIF-001`, `-004`, `-006`
**Fuentes adicionales:** SPEC F09 (CRUD), SPEC F11 (recálculo de edad), `src/helpers/severity.helper.ts`

Una tabla y 16 columnas, pero es el paso que más lógica de negocio esconde: **casi nada de lo que parece un campo lo es.**

#### `isSeriousEvent` no se pregunta: se deriva

Los nueve booleanos de la tabla no son nueve preguntas. **Ocho son criterios y el noveno es la conclusión.**

Criterios: `causedDeath`, `causedDisability`, `causedCongenitalAnomaly`, `causedFetalDeath`, `causedLifeThreatening`, `causedHospitalization`, `causedAbortion`, `causedOtherCondition`.

La regla, implementada tanto en el `001` como en el `004` (`classification.service.ts:245` y `:460`):

```
algún criterio en true  →  isSeriousEvent = true, se envíe lo que se envíe
```

El comentario del servicio dice por qué: *«pedirle al cliente que lo repita sólo abre la puerta a que se contradiga»*. Así que **el formulario no lleva un interruptor grave/no grave**. Lleva los ocho criterios, y la gravedad aparece como una consecuencia en lectura — un aviso derivado, no un campo.

La matriz de coherencia completa, con sus tres violaciones (`severity.helper.ts`):

| Estado | Resultado |
|---|---|
| ≥1 criterio en `true` | `isSeriousEvent` se deriva a `true`. Válido |
| 0 criterios y `isSeriousEvent = false` | Válido — es la declaración explícita de «no es grave» |
| 0 criterios y `isSeriousEvent = true` | **`SERIOUS_WITHOUT_CRITERION`** — «una clasificación grave sin causa no es información, es una casilla marcada» |
| 0 criterios y `isSeriousEvent` ausente o `null` | **`SERIOUS_FLAG_REQUIRED`** — si no, un registro vacío se guardaría como clasificación válida y el caso contaría como clasificado |
| `causedOtherCondition = true` sin descripción | **`OTHER_CONDITION_WITHOUT_DESCRIPTION`** |

**`null` y `undefined` no son «no».** `hasAnySeriousCriterion` compara estrictamente contra `true`: un criterio sin informar no hace grave el evento, pero tampoco cuenta como negado. Los ocho criterios son entonces **ternarios** —sí / no / sin informar—, no casillas de dos estados. Un `<Checkbox>` pierde el tercer estado y convierte «no lo sé» en «no».

#### Traducción a pantalla: una compuerta, y detrás los ocho criterios

La pantalla **sí** pregunta por la gravedad, pero lo que pregunta no es el campo: es una **compuerta**.

```
¿El caso es grave?   ( ) Sí   ( ) No        ← estado de interfaz, no columna

  Sí → se despliegan los ocho criterios; al menos uno debe marcarse
  No → los criterios no se muestran nunca; quedan todos en null
```

| Respuesta | Qué se envía | Qué guarda el backend |
|---|---|---|
| **No** | Los ocho criterios en `null`, `isSeriousEvent: false` | 0 criterios + `false` → válido |
| **Sí** + ≥1 criterio | Los criterios marcados | Deriva `isSeriousEvent = true` |
| **Sí** + 0 criterios | — | **`SERIOUS_WITHOUT_CRITERION`, 400.** Lo previene el cliente |

**La condición que impone el backend: con la compuerta en «Sí», al menos un criterio es obligatorio.** No es una preferencia de diseño — la matriz rechaza el estado, y sin este bloqueo el usuario recibe un 400 que no sabe interpretar. Es **bloqueante de guardado** (§4.6): con «Sí» y ningún criterio no hay `POST`.

**Cambiar la compuerta de «Sí» a «No» limpia los criterios**, poniéndolos de vuelta en `null`. Si se conservaran marcados, el servicio volvería a derivar `isSeriousEvent = true` y la pantalla diría una cosa y la fila otra. Conviene confirmarlo con el usuario antes de borrar, no hacerlo en silencio.

**Al reentrar al paso**, la compuerta se deriva de lo guardado: `isSeriousEvent === true` → «Sí» con los criterios visibles; `false` → «No». Nunca queda sin responder en una fila ya guardada, porque la matriz no lo permite.

#### Los ocho criterios: switches que nacen sin tocar

Cada criterio es un **switch de `true`/`false` que arranca en `null`**. No es lo mismo marcar «No» que no haber tocado nunca el control: el primero dice «se evaluó y no ocurrió», el segundo «no se evaluó». `hasAnySeriousCriterion` compara estrictamente contra `true`, así que epidemiológicamente los dos son «no grave», pero informan cosas distintas y la tabla los distingue.

**Consecuencia asumida: desde la interfaz no se vuelve a `null`.** Un switch de dos posiciones no tiene tercera; una vez tocado, el criterio queda en `true` o `false` para siempre. Se acepta — el caso de «lo marqué por error y quiero dejarlo sin informar» es raro, y añadir un tercer estado visible encarecería los ocho controles para resolverlo.

> Ojo con la primitiva: **estas columnas son `boolean` con `null`, no `answerOption`** (§7). El estado sin informar se representa con `null`, no con un valor del ENUM. Es un componente hermano de `<AnswerOptionField>`, no el mismo.

La descripción de «otra condición» aparece sólo con `causedOtherCondition = true`, y ahí es obligatoria.

#### `age` y `ageUnitItemId` son derivados, con un respaldo

**No se capturan: se calculan** desde `patient.birthDate` y `esaviCase.eventDate` con `resolveAgeAtEvent` (SPEC F09, el primer dato derivado del repositorio).

| Situación | Comportamiento |
|---|---|
| Existen `birthDate` **y** `eventDate` | El servicio calcula. **Lo que llegue en el cuerpo se ignora** |
| Falta alguna de las dos | Se usan los del cuerpo. Son el respaldo declarado |

Y si viajan, **viajan juntos**: `isAgeAndUnitTogether` rechaza uno sin el otro — *«un número sin unidad es menos útil que ningún número: obliga a adivinar, y quien adivine elegirá años»*.

En pantalla: el campo de edad es **de sólo lectura y calculado** cuando ambas fechas existen, con la explicación de dónde sale; y **editable** —número + `<CatalogSelect typeCode="ageUnit">`— sólo cuando falta alguna. Cambiar el modo sin avisar es lo que hace que alguien teclee una edad y no entienda por qué no se guardó.

**La edad se mantiene sola.** El SPEC F11 propaga el recálculo dentro de la misma transacción cuando `ESAVI-PATIENT-004` cambia `birthDate` o `ESAVI-CASE-004` cambia `eventDate`, y anota la auditoría con el código de **la operación que la cambió**, no con `ESAVI-CLASSIF-004`. El cliente no tiene que hacer nada — pero sí debe saber que **la edad mostrada puede cambiar sin que nadie tocara la clasificación**, y refrescar la consulta tras editar el paciente o el caso.

Dos errores del recálculo que hay que mapear porque abortan el `PUT` entero: `409` si el `eventDate` resultante precede al `birthDate`, y `404` `<ENTITY>_004_AGE_RECALC_CATALOG_MISSING` si falta el ítem `YEARS`, `MONTHS` o `DAYS` del catálogo `ageUnit`.

#### El resto de la tabla

`firstConsultationDate` (no futura), `otherSeriousConditionDescription` (condicional, arriba) y `notes`. Nada más: no hay ningún otro campo libre.

#### Una clasificación por caso

`UQ_classification_case`. Un segundo `POST` responde `409` con el mensaje `caseAlreadyClassified`. Con `ESAVI-CASEFLOW-006` esto no debería ocurrir —`stages.classification.exists` lo dice antes—, pero el `409` se mapea igual: dos pestañas abiertas bastan.

#### Condiciones

| Condición | Regla |
|---|---|
| Bloqueante de guardado (§4.6) | `caseId`; compuerta respondida; y con «Sí», **al menos un criterio marcado** |
| Compuerta «¿es grave?» | Estado de interfaz, **no columna**. Al reentrar se deriva de `isSeriousEvent` |
| `isSeriousEvent` | **Nunca es un control.** Derivado de los criterios, o `false` cuando la compuerta dice «No» |
| Los ocho criterios | Visibles **sólo** con la compuerta en «Sí». Switch `true`/`false` que nace en `null`; sin retorno a `null` |
| Compuerta de «Sí» a «No» | Limpia los criterios a `null`, con confirmación previa |
| `age`, `ageUnitItemId` | Sólo lectura si hay `birthDate` y `eventDate`; editables juntos si falta alguna |
| `firstConsultationDate` | Se llena en este paso. No futura |
| Efecto sobre el paso 4 | La gravedad de aquí manda: `notification.notificationType` llega derivado y bloqueado (§6.1) |

### 5.4 Paso 4 — Notificación · **cerrado** (parte A; los satélites, en §5.4b)

**Parte A — cabecera y rama.** Tablas: `notification` (12), `severeNotification` (8), `nonSevereNotification` (13).
**Endpoints:** `ESAVI-NOTIFCN-001/-004/-006`, `ESAVI-SEVNOT-001/-004/-006`, `ESAVI-NSEVNOT-001/-004/-006`

#### `notification` — columna por columna

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `notificationId` | No | PK generada |
| `caseId` | No | Sale de la URL. **Inmutable en el `004`**: el servicio lo ignora |
| `notificationType` | **No — derivado** | `ENUM('SEVERE','NON_SEVERE')` `NOT NULL`. Sale de `classification.isSeriousEvent` (§6.1). **Inmutable en el `004`** |
| `esaviDescription` | Sí | `TEXT NOT NULL`, `trim` y no vacío. **Bloqueante de guardado** (§4.6) |
| `hasRelevantMedicalHistory` | Sí | `answerOption`, variante `unknown` (§7.1) |
| `takesMedication` | Sí | `answerOption`, variante `unknown` (§7.1). **Gobierna la lista de medicación concomitante** (§5.4b) |
| `outcomeItemId` | Sí | `<CatalogSelect typeCode="outcome">`. **Gobierna la regla de fallecimiento** |
| `requestInvestigation` | Sí | `boolean` con `DEFAULT false`. **Nunca se guarda `null`**: enviarlo nulo es un error, no una forma de limpiarlo. **Decide si existe el paso 5** |
| `deathDate` | Condicional | Ver la regla de fallecimiento |
| `autopsyRequested` | Condicional | Ídem |
| `verbalAutopsyPerformed` | Condicional | Ídem |
| `notes` | Sí | Texto libre |

Una notificación por caso: `assertCaseIsNotNotified` responde `409` al segundo `POST`.

#### La regla de fallecimiento

No está en el validador porque depende del **`value` del `catalogItem`** que hay detrás de `outcomeItemId`, y el validador sólo ve un UUID opaco. Vive en el servicio y responde `400`:

| Desenlace | `deathDate` | `autopsyRequested` | `verbalAutopsyPerformed` |
|---|---|---|---|
| `value === 'DEATH'` | **Obligatorio** | **Obligatorio** | Opcional |
| Cualquier otro, o sin informar | **Prohibido** | **Prohibido** | **Prohibido** |

Los tres bajo un desenlace que no es muerte se **rechazan**, no se ignoran: *«una fecha de fallecimiento guardada bajo un desenlace de recuperación es una contradicción que nadie detectaría jamás»*. Códigos: `NOTIFCN_00X_DEATH_FIELDS_REQUIRED` y `NOTIFCN_00X_DEATH_FIELDS_NOT_ALLOWED`.

En pantalla, la sección de fallecimiento **aparece y desaparece con el desenlace**, y al desaparecer **limpia sus tres campos** — igual que la compuerta de gravedad de §5.3. Si se quedaran con valor, el `PUT` daría 400.

> **Se compara `catalogItem.value`, no `code`.** El cliente tiene que resolver cuál de los seis ítems del catálogo `outcome` lleva `value === 'DEATH'`, no adivinarlo por el nombre ni por el orden.

#### La rama: `severeNotification` / `nonSevereNotification`

Las dos son 1:1 con **PK = FK**, y de ahí sale la primera regla práctica:

**`notificationId` lo envía el cliente.** La columna no tiene `DEFAULT gen_random_uuid()`: el `POST` de la rama lleva en el cuerpo el id de la cabecera que acaba de crearse.

**El servidor comprueba que la rama corresponda al tipo.** Una cabecera `NON_SEVERE` rechaza un detalle grave con `SEVNOT_001_NOTIFICATION_NOT_SEVERE`, y al revés con `NSEVNOT_001_NOTIFICATION_NOT_NON_SEVERE`. La rama no se elige: la impone la cabecera.

##### `severeNotification` — 8 columnas

| Columna | ¿Se pide? | Regla |
|---|---|---|
| `notificationId` | No visible | PK = FK, la envía el cliente |
| `hasPreviousEventHistory` | Sí | `answerOption` |
| `hasAllergyToOtherVaccines` | Sí | `answerOption` |
| `hasAllergyToMedications` | Sí | `answerOption` |
| `hasAllergyToPreviousSameVaccine` | Sí | `answerOption` |
| `hasPregnancyComplications` | Sí | `answerOption` |
| `pregnancyComplicationsDescription` | Condicional | **Regla del cliente, no del backend.** Visible y obligatoria sólo con `hasPregnancyComplications === 'YES'`; en cualquier otro caso oculta y limpiada. El servidor no la impone —se puede guardar una descripción bajo un `NO` sin que proteste—, así que la asimetría con `otherSourceDescription` la cierra el formulario (§7.3) |
| `notes` | Sí | Texto libre |

Cinco `answerOption` seguidas: es el bloque que más justifica `<AnswerOptionField>`. **Las cinco usan la variante `unknown`** (`YES` · `NO` · `UNKNOWN`), igual que las dos de la cabecera.

Y las dos últimas filas **sólo existen para una mujer en edad fértil** (§7.4): en un paciente varón no se muestran, no se envían y no se guardan. `NOT_APPLICABLE` no hace falta — no ofrecer la pregunta es más limpio que ofrecer una opción para decir que sobraba.

##### `nonSevereNotification` — 13 columnas

| Columna | ¿Se pide? | Regla |
|---|---|---|
| `notificationId` | No visible | PK = FK, la envía el cliente |
| `vaccinationHealthFacilityId` | Sí | Unidad donde se vacunó. Sólo se comprueba `isActive` — **no valida alcance geográfico**, a diferencia de `esaviCase` (§5.2) |
| `vaccinationSiteItemId` | Sí | `<CatalogSelect typeCode="vaccinationSite">`, 8 ítems |
| `vaccinationCenterAddress` | Sí | ≤250. Único campo de la tabla con longitud declarada |
| `vaccinationGeoLocationId` | Sí | `<GeoLocationPicker>` |
| `verifiedPhysicalDocument` | Sí | `boolean` nulable |
| `verifiedElectronicRecord` | Sí | `boolean` nulable |
| `verifiedVerbalReport` | Sí | `boolean` nulable |
| `verifiedClinicalRecord` | Sí | `boolean` nulable |
| `verifiedUnknown` | Sí | `boolean` nulable |
| `verifiedOtherSource` | Sí | `boolean` nulable. **Gobierna `otherSourceDescription`** |
| `otherSourceDescription` | Condicional | Ver abajo |
| `notes` | Sí | Texto libre |

**Regla de «otra fuente», simétrica en los dos sentidos:** con `verifiedOtherSource === true` la descripción es **obligatoria** (`NSEVNOT_00X_OTHER_SOURCE_DESCRIPTION_REQUIRED`); sin ella —`false` **o** `null`— una descripción presente se **rechaza**. La comparación es estricta contra `true`, así que aquí `false` y `null` se comportan igual, a diferencia de los criterios de gravedad de §5.3.

Los seis `verified*` son las fuentes de verificación del dato, no son excluyentes entre sí, y son `boolean` nulables: mismo tratamiento que los criterios de §5.3 —switch que nace en `null`— salvo que aquí `null` y `false` no se distinguen para ninguna regla del servidor.

#### Ciclo de vida de la rama: no hay borrado lógico

Ni `severeNotification` ni `nonSevereNotification` tienen `005A` ni `005B`. Sólo existe `005C`, **purga física, rol SUPERADMIN**. Es lo que hace irreversible el cambio de gravedad (§6.1).

#### Condiciones

| Condición | Regla |
|---|---|
| Bloqueante de guardado | `caseId`, `notificationType` (derivado) y `esaviDescription` |
| Orden dentro del paso | Primero la cabecera —crea la fila y sella `notificationStartedAt`—, después la rama con el `notificationId` devuelto |
| Rama visible | La impone `notificationType`; el usuario no la elige |
| Sección de fallecimiento | Aparece sólo con desenlace `DEATH`; al desaparecer limpia sus tres campos |
| `requestInvestigation` | **Pregunta explícita del formulario**, independiente de la gravedad. Nunca `null`. Marca si el paso 5 existe |
| Descripción de otra fuente | Obligatoria con `verifiedOtherSource === true`, prohibida en cualquier otro caso |
| Bloque de embarazo | Sólo para mujer en edad fértil (§7.4) |
| Variantes de `answerOption` | Las siete usan `unknown` (§7.1) |

**`requestInvestigation` no se deriva de la gravedad, y es deliberado.** Los dos cruces raros ocurren y el formulario tiene que admitirlos: un evento **no grave** puede investigarse, y un evento **grave** puede no requerir investigación —porque ya se investigó dentro de otro evento, por ejemplo—. Derivarla de `isSeriousEvent` ahorraría una pregunta y haría imposible registrar los dos casos que más importan cuando aparecen. Es una casilla, con su explicación al lado.

### 5.4b Paso 4 — Satélites de la notificación · **cerrado**

**Tablas:** `notificationEvent` (13), `notificationVaccine` (14) → `notificationDiluent` (10), `notificationMedication` (11), `notificationPregnancy` (8) → `notificationPregnancyComplication` (8). Sesenta y cuatro columnas y dos niveles de anidamiento.

**Endpoints:** `ESAVI-NOTIFEVT-001/-002A/-003/-004/-005A/-006`, `ESAVI-NOTIFVAC-*` y `ESAVI-NOTIFMED-*` con la misma forma, `ESAVI-NOTIFDIL-001/-002A/-003/-004/-005A` (sin `006`), `ESAVI-NOTIFPRG-001/-003/-004/-006` y `ESAVI-PREGCOMP-001/-002A/-003/-004/-005A`.

#### Lo primero, porque condiciona todo lo demás: cuatro de las seis exigen ADMIN

| Tabla | `POST` | `PUT` | `DELETE` lógico |
|---|---|---|---|
| `notificationEvent` | **ADMIN** | **ADMIN** | **ADMIN** |
| `notificationVaccine` | **ADMIN** | **ADMIN** | **ADMIN** |
| `notificationDiluent` | **ADMIN** | **ADMIN** | **ADMIN** |
| `notificationMedication` | **ADMIN** | **ADMIN** | **ADMIN** |
| `notificationPregnancy` | USER | USER | ADMIN |
| `notificationPregnancyComplication` | USER | USER | ADMIN |

La cabecera del paso 4 y sus dos ramas son **USER** (`NOTIFCN-001/-004`, `SEVNOT`, `NSEVNOT`). Los eventos, las vacunas, los diluyentes y la medicación concomitante —el contenido clínico del paso— **no**. Un USER puede describir el ESAVI en texto libre y no puede decir qué vacuna lo causó.

**Es un bloqueo duro del paso 4, no una molestia de permisos.** Está pedido al backend —§10.4, el mismo 2026-09-03 en que se cerró esta sección— y **el diseño de `FE12b` asume que las seis escrituras son `USER`**: no se replica en el cliente una restricción que está en vías de desaparecer. Mientras no llegue, el paso 4 lo completa un ADMIN.

#### `sortOrder` no se envía nunca, y no se reordena desde la pantalla

Las cinco tablas con `sortOrder` lo reciben de un disparador —`TRG_<tabla>_setSortOrder`, bajo cerrojo consultivo— que asigna `MAX + 1` dentro del mismo padre. Ningún validador lo declara y **ningún servicio lo escribe en el `004`**: enviarlo no da 400, se descarta en silencio.

Consecuencia para la pantalla: **el orden de la lista es el de creación y no se puede cambiar**. No hay endpoint que reordene, y un índice único parcial por padre (`UQ_<tabla>_parent_sortOrder`, sólo sobre filas no borradas) haría fallar cualquier intento de escribirlo a mano. Si el funcional pide arrastrar filas, es una petición al otro repositorio, no un `PUT`.

#### El patrón de pantalla: cuatro listas, un formulario 1:1 y una lista anidada

Todas siguen el patrón canónico de §5.0 —lista con «Añadir», alta y edición en modal— con dos desviaciones que sí hay que documentar:

| Bloque | Forma |
|---|---|
| Eventos, vacunas, medicación | Lista + modal, contra la notificación |
| Diluyentes | **Lista anidada dentro del modal de su vacuna.** Cuelgan de `vaccineId`, no de la notificación: no hay lista de diluyentes del caso, y `NOTIFDIL` es la única de las seis **sin `006` por caso** |
| Embarazo | **No es lista: es un formulario 1:1** con la notificación |
| Complicaciones del embarazo | Lista + modal **dentro del bloque de embarazo**, contra `pregnancyId` |

Un diluyente no existe sin vacuna y una complicación no existe sin la fila de embarazo. El orden de creación no es negociable: primero el padre, y su id vuelve en la respuesta.

---

#### `notificationEvent` — columna por columna

Los diagnósticos del ESAVI. Son **N**, y es la única de las seis que acuña términos en el catálogo clínico.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `eventId` | No | PK generada |
| `notificationId` | No | Del contexto. **Inmutable en el `004`** |
| `diagnosticTermId` | **No — derivado** | Lo devuelve la resolución. **Ningún validador lo declara**: es la única puerta al término y el cliente no la abre |
| `sortOrder` | No | Disparador |
| `esaviName` | **Sí — obligatorio** | ≤250, `trim`, no vacío. Es lo que escribió el notificador |
| `esaviCode` | Sí | ≤250. **Es lo que dispara la resolución** |
| `esaviRawName` | **No — derivado** | Ver abajo |
| `isMainEsavi` | Sí | `boolean NOT NULL DEFAULT false`. **No es tri-estado** |
| `startDate` | Sí | Fecha de inicio del evento |
| `startTime` | Sí | `HH:MM` o `HH:MM:SS`; el servicio rellena los segundos |
| `isOtherEsavi` | Sí | `boolean NOT NULL DEFAULT false`. **Gobierna las dos reglas de abajo** |
| `otherDescription` | Condicional | ≤500 |
| `notes` | Sí | Texto libre |

**`source` es un campo aceptado que no es columna.** Vale `MEDDRA`, `WHODRUG`, `LOCAL` u `OTHER`, decide qué rama de la resolución se toma y se descarta después. Lo mismo en `PREGCOMP-001/-004`.

##### La resolución del término: tres ramas y tres derivadas

`esaviCode` + `source` deciden qué pasa con el catálogo `diagnosticTerm`:

| Llega | Rama | Efecto |
|---|---|---|
| Sin `esaviCode` | Ninguna | `diagnosticTermId: null`, `esaviRawName: null`. El nombre es texto libre y no hay de qué divergir |
| Código + `LOCAL`, o **sin `source`** | Resolución implícita (`ESAVI-DIAGTERM-006`) | Si el término no existe, **se acuña** marcado `autoCreated`/`PENDING` |
| Código + fuente externa (`MEDDRA`, `WHODRUG`, `OTHER`) | Búsqueda por `(source, code)` | **Nunca crea.** Si no está importado → `404 NOTIFEVT_00X_DIAGTERM_NOT_FOUND` |

Y en las tres, **el maestro manda sobre el nombre**: `esaviName` acaba siendo el del catálogo, y `esaviRawName` guarda lo que el notificador escribió **sólo si difiere**. Un `esaviName` que vuelve distinto del enviado no es un error: es esta regla.

> **Consecuencia directa sobre `<MeddraSearchField>`.** `ESAVI-MEDDRA-006` consulta la API licenciada, no la base: un término elegido ahí **puede no existir en `diagnosticTerm`**. Enviarlo con `source: 'MEDDRA'` da 404 si nadie importó el diccionario (`ESAVI-DIAGTERM-007`, SUPERADMIN). Enviarlo **sin `source`** lo acuña como `LOCAL` con el código de MedDRA — que es un término local disfrazado, y contamina el maestro.
>
> **Decidido, y es la regla del campo entera:** `source: 'MEDDRA'` cuando el término venga del buscador de MedDRA, y **`LOCAL` explícito** cuando el usuario lo escriba a mano con código. El `404` de la primera rama se trata como lo que es —«este despliegue no tiene MedDRA importado»—, no como un error del usuario, y el texto libre sin código sigue disponible mientras tanto. La tabla completa está en `<MeddraSearchField>`, más abajo.

El `004` sólo vuelve a resolver **si el código cambia de valor**, no si la clave viaja. Reenviar el `GET` entero no toca el catálogo ni produce `updatedAt`. Y hay una trampa que el servicio ya evita y el cliente no debe deshacer: **reenviar `esaviName` igual al almacenado no cuenta como renombrado**. Si el formulario muestra `esaviName` —la palabra del maestro— y el usuario no la toca, el `PUT` la devuelve idéntica y `esaviRawName` sobrevive. Mostrar `esaviRawName` en el campo editable cuando existe es lo correcto; mostrarlo y enviarlo como `esaviName` sin más, no.

##### Las dos reglas de «otro evento»

Con `isOtherEsavi === true`:

- `otherDescription` es **obligatoria** → `NOTIFEVT_00X_OTHER_DESCRIPTION_REQUIRED`
- `esaviCode` y `diagnosticTermId` están **prohibidos** → `NOTIFEVT_00X_OTHER_ESAVI_CONFLICT`

Con `isOtherEsavi === false`, una descripción presente se **rechaza** → `NOTIFEVT_00X_OTHER_DESCRIPTION_NOT_ALLOWED`.

En pantalla es un conmutador: «otro» oculta y limpia el buscador de términos, y «catalogado» oculta y limpia la descripción. Las dos direcciones limpian (§7.3). Se evalúa sobre el **estado resultante**, así que marcar «otro» en un evento que ya tenía código da 400 aunque el `PUT` no mande el código.

##### `isMainEsavi` admite varios, y el cliente no lo restringe

**El DDL no impone unicidad y el SPEC F16 lo declara explícitamente fuera de alcance:** caben dos eventos principales, o ninguno.

**Decidido: el cliente tampoco lo restringe.** Es una **casilla por fila**, no un radio de la lista, y marcar una no desmarca ninguna otra. Es la definición del funcional, no una omisión del esquema.

La tentación es hacer un radio «porque suena a que sólo puede haber uno», y el coste de esa suposición no es cosmético: obligaría a escribir sobre una fila hermana —un segundo `PUT` que desmarca la anterior— y a inventar el comportamiento del caso en que esa segunda escritura falle. Se anota aquí precisamente para que ningún spec lo reinvente.

> **Si el funcional cambia y pide «uno solo», es un cambio con dos mitades.** La regla no puede vivir sólo en la pantalla: la base seguiría admitiendo dos, y cualquier otro cliente —o una carga masiva— los produciría. Se pide la restricción al backend y se replica aquí, en ese orden.

---

#### `notificationVaccine` — columna por columna

Las vacunas administradas. Son **N**, y ninguna de sus once columnas de datos es obligatoria en el DDL.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `vaccineId` | No | PK generada |
| `notificationId` | No | Del contexto. **Inmutable** |
| `vaccineWhodrugId` | Sí | `<WhodrugTreePicker>`. `404 NOTIFVAC_00X_WHODRUG_NOT_FOUND` si la entrada no existe o está inactiva |
| `sortOrder` | No | Disparador |
| `isSuspected` | Sí | `boolean NOT NULL DEFAULT false`. La vacuna sospechosa del evento |
| `whoCode` | Sí | ≤250. **Copia de lo notificado, no derivada** |
| `vaccineCode` | Sí | ≤250. Ídem |
| `vaccineName` | Sí | ≤500. Ídem. **Gobierna la guarda de contenido mínimo** |
| `vaccinationDate` | Sí | **Gobierna la coherencia temporal** |
| `vaccinationTime` | Sí | `HH:MM` admitido |
| `doseNumber` | Sí | Entero ≥ 0, **sin techo** |
| `batchNumber` | Sí | ≤100. El lote |
| `expirationDate` | Sí | Sin regla cruzada en el servidor |
| `notes` | Sí | Texto libre |

**Guarda de contenido mínimo:** al menos uno de `vaccineWhodrugId` o `vaccineName` → `400 NOTIFVAC_00X_VACCINE_REQUIRED`. Es lo único que impide una fila que dice «hubo una vacuna» sin decir cuál. Se evalúa sobre el estado resultante: un `PUT` que borra el nombre de una fila sin código da 400.

**Coherencia temporal:** `vaccinationDate` no puede ser **posterior** a `esaviCase.eventDate` → `400 NOTIFVAC_00X_VACCINATION_AFTER_EVENT`. El mismo día vale —la reacción inmediata es el caso agudo, no la excepción—. No se aplica si falta cualquiera de las dos fechas, que es lo normal: las vacunas se cargan antes de que el caso tenga `eventDate`.

> **`eventDate` se edita en el paso 2 y esta regla vive en el paso 4.** Adelantar la fecha del evento puede invalidar vacunas ya guardadas, y el 400 aparecerá en un paso que el usuario no está mirando. El `<DateField>` de `eventDate` valida contra las vacunas ya cargadas y avisa antes de guardar, igual que la compuerta de embarazo avisa antes de borrar (§7.4).

**Los tres textos son copia, y el cliente los rellena.** El SPEC F22 §6 lo declara sin ambigüedad: elegir una entrada del maestro **no** rellena `whoCode`, `vaccineCode` ni `vaccineName` — el servicio no los toca nunca, ni en el `001` ni en el `004`. Existen para conservar lo que el notificador leyó en el carné aunque el maestro se renombre después.

**Decidido: elegir en `<WhodrugTreePicker>` envía el estándar completo.** No sólo la FK — la FK **y** los tres textos, copiados de la fila del maestro y editables después. Guardarlos vacíos junto a una FK produce una fila legal e ilegible en cuanto el diccionario cambie, que es precisamente lo que las tres columnas existen para evitar.

La correspondencia, contra las columnas de `vaccineWhodrug`:

| Se guarda en | Sale de | Por qué |
|---|---|---|
| `vaccineWhodrugId` | `vaccineWhodrugId` | La FK que resuelve el árbol, y **la identidad**: es lo que permite recuperar la fila exacta del maestro |
| `whoCode` | `drugCode` | El código del diccionario de la OMS |
| `vaccineCode` | **`drugCode`, el mismo** | Ídem — **decidido: los dos guardan el mismo código** |
| `vaccineName` | `drugName` | El nombre comercial, `NOT NULL` en el maestro |

**Que `whoCode` y `vaccineCode` guarden lo mismo es deliberado, no un descuido.** La identidad de la fila del maestro la lleva **`vaccineWhodrugId`**, que es lo que la recupera de forma única; los dos textos existen para sobrevivir a que esa FK deje de servir. `drugCode` es el código con el que la vacuna se reconoce en los dos sitios, y repartir un código distinto en cada columna sería inventar una distinción que el dominio no hace.

> **Lo que sí distingue a las dos columnas es el origen, no el valor.** `vaccineCode` es editable y **el notificador puede sobrescribirlo con el código nacional** que figura en el carné, cuando lo hay. `whoCode` no: es la palabra del diccionario. Si el `vaccineCode` que se lee difiere del `whoCode`, es porque alguien lo corrigió a mano, y eso es información.

Y para una vacuna **sin codificar** —el maestro vacío, o una vacuna que el diccionario no lista— los dos quedan vacíos y sólo viaja `vaccineName` en crudo. La guarda de contenido mínimo no pide más.

Y el resto de lo que el usuario vio al elegir —titular, forma, potencia, ingrediente, dosis, diluyente— **no tiene columna en `notificationVaccine`**. No se pierde: se lee del maestro por la FK cada vez que se muestra la fila, que es lo correcto mientras la FK exista. Lo que se copia son sólo los tres textos, y se copian precisamente para el día en que la FK no baste.

> **La vacuna sin codificar sigue siendo válida y es el caso frecuente.** Con el maestro vacío —o con una vacuna que el diccionario no lista— se escribe `vaccineName` a mano y la fila queda sin FK. La guarda de contenido mínimo es exactamente eso: **codificada o cruda**, nunca ninguna de las dos.

---

#### `notificationDiluent` — columna por columna

Cuelga de la **vacuna**, no de la notificación. Diez columnas, **ninguna obligatoria en el DDL** —ni siquiera un booleano con defecto—, y **sin `notes`**: es la única de las seis que no lo tiene.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `diluentId` | No | PK generada |
| `vaccineId` | No | Del modal de la vacuna. **Inmutable** |
| `diluentCatalogId` | Sí | `<CatalogSelect>` sobre `ESAVI-DILUENT-002A`. `404` si no existe o está inactivo |
| `sortOrder` | No | Disparador |
| `batchNumber` | Sí | ≤250 — **más ancho que el de la vacuna**, que es 100 |
| `expirationDate` | Sí | Sin regla cruzada |
| `reconstitutionDate` | Sí | **Gobierna la coherencia temporal** |
| `reconstitutionTime` | Sí | `HH:MM` admitido. **No entra en ninguna comparación** |
| `diluentName` | Sí | ≤250. Copia de lo transcrito del vial |
| `diluentCode` | Sí | ≤250. Ídem |

**Guarda de contenido mínimo:** al menos uno de `diluentCatalogId` o `diluentName` → `400 NOTIFDIL_00X_DILUENT_REQUIRED`.

> **«Se reconstituyó y no sé con qué» se registra con una entrada «Desconocido» del maestro, no relajando la guarda.** Es la decisión del SPEC F23 y es la que hace que la ignorancia sea un valor contable en vez de una fila vacía indistinguible de un error de carga. Si esa entrada no está sembrada, este caso no se puede registrar — va a §10.5.

**Coherencia temporal:** `reconstitutionDate` no puede ser **posterior** a `notificationVaccine.vaccinationDate` → `400 NOTIFDIL_00X_RECONSTITUTION_AFTER_VACCINATION`. Un solo salto, contra el padre directo; la coherencia con `eventDate` sale por transitividad. **Compara sólo fechas, nunca horas**, aunque las dos tablas guarden una.

**Visibilidad heredada de dos niveles.** Un diluyente cuya vacuna —o cuya notificación— está desactivada responde 404 para USER y ADMIN. No es un fallo del cliente: es la regla, y el mensaje tiene que decir que el padre no está disponible, no que el diluyente no exista.

---

#### `notificationMedication` — columna por columna

La medicación concomitante. Son **N**.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `medicationId` | No | PK generada |
| `notificationId` | No | Del contexto. **Inmutable** |
| `sortOrder` | No | Disparador |
| `medicationName` | **Sí — obligatorio** | ≤250, `trim`, no vacío |
| `medicationCode` | Sí | ≤250. **Sin maestro detrás**: no se normaliza a `CONSTANT_CASE` y no se valida |
| `dose` | Sí | ≤100, texto libre |
| `pharmaceuticalFormItemId` | Sí | `<CatalogSelect typeCode="pharmaceuticalForm">`. **Catálogo sin sembrar** → §10.5 |
| `administrationRouteItemId` | Sí | `<CatalogSelect typeCode="administrationRoute">`. Ídem |
| `startDate` | Sí | Sin regla cruzada |
| `isOtherMedication` | Sí | `boolean NOT NULL DEFAULT false` |
| `otherMedicationText` | Condicional | Texto libre, sin longitud declarada |

**Regla de «otra medicación», simétrica:** con `isOtherMedication === true` el texto es **obligatorio** (`NOTIFMED_00X_OTHER_TEXT_REQUIRED`); con `false`, un texto presente se **rechaza** (`NOTIFMED_00X_OTHER_TEXT_NOT_ALLOWED`).

**Y aquí `medicationCode` no entra en la regla**, a diferencia de `esaviCode` en `notificationEvent`. No es un descuido: allí el código es la puerta a un maestro clínico y declarar «otro» significa que el maestro no lo nombra; aquí no hay maestro, y una medicación ausente del formulario perfectamente puede llevar el código impreso en la caja.

> **Los dos catálogos están comentados en `esaviapp.sql` (`:1721-1724`).** Sin sembrarlos, los dos `<CatalogSelect>` salen vacíos y cualquier `POST` que mande una de las dos claves responde `404 NOTIFMED_00X_..._NOT_FOUND`. Los dos son nullables, así que la medicación se registra igual sin forma ni vía — pero el formulario tiene que aguantar el catálogo vacío sin parecer roto (§10.5).

##### `notification.takesMedication` gobierna esta lista

**Decidido: la lista sólo se muestra con `takesMedication === 'YES'`.** Es §7.3 aplicada entre dos tablas y a través de un paso: la pregunta está en la cabecera de la notificación, la respuesta en su propia fila, y las medicaciones cuelgan de la misma notificación. Comparación **estricta contra `'YES'`**, como todas las de `answerOption` — `NO`, `UNKNOWN`, `NOT_APPLICABLE`, `NO_ANSWER` y el `null` cierran la lista por igual.

**Y aquí ocultar no puede limpiar, que es lo que hace este caso distinto de todos los anteriores.** Las filas ya cargadas no se borran al cerrar la compuerta:

- `ESAVI-NOTIFMED-005A` es **ADMIN** (§10.4), así que un USER **no puede** borrarlas aunque quisiera.
- Y aunque pudiera, borrar N filas al cambiar una respuesta es una cascada de escrituras que puede fallar a medias y dejar la mitad de la lista viva.

**Entonces: se avisa antes de guardar el cambio de respuesta**, diciendo cuántas medicaciones van a quedar ocultas, y las filas se quedan. Es el tercer caso de la escala de §7.3 —el mismo que el bloque de autopsia—: hay compuertas que sólo se pueden avisar.

> **La incoherencia resultante es visible y buscada.** Un `takesMedication: 'NO'` con tres medicaciones guardadas no es un fallo silencioso: la pantalla lo dice al ocurrir y el paso 6 lo vuelve a decir al cerrar. Lo que no hace el formulario es destruir datos clínicos para que una respuesta cuadre.

---

#### `notificationPregnancy` — columna por columna

**1:1 con la notificación**, y detrás de la compuerta de §7.4.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `pregnancyId` | No | PK generada |
| `notificationId` | No | Del contexto. **Inmutable** |
| `wasPregnantAtVaccination` | **Sí — obligatorio en el `001`** | `answerOption`, variante `unknown`. **Un `null` explícito da 400** |
| `wasPregnantAtEsavi` | Sí | `answerOption`, variante `unknown` |
| `lastMenstruationDate` | Sí | **Gobierna el rango gestacional** |
| `probableDeliveryDate` | Sí | Ídem |
| `hasComplications` | Sí | `answerOption`, variante `unknown` |
| `notes` | Sí | Texto libre |

**`wasPregnantAtVaccination` se exige, pero no se exige que sea `YES`.** `NO`, `UNKNOWN` y `NO_ANSWER` valen: exigir `YES` convertiría la tabla en un registro de embarazos confirmados y perdería el caso que más importa —vacunar a alguien cuyo embarazo se desconocía—. En el `004` **vuelve a ser anulable**, deliberadamente: una respuesta dada por error se retira sin destruir el `pregnancyId` ni su auditoría.

**Rango gestacional (Naegele ±14 días):** entre `lastMenstruationDate` y `probableDeliveryDate` tiene que haber **entre 266 y 294 días, ambos inclusive** → `400 NOTIFPRG_00X_DELIVERY_DATE_OUT_OF_RANGE`. Un solo error cubre también el caso de un parto anterior a la menstruación. No se aplica si falta una de las dos.

**Decisión de pantalla: la fecha probable de parto se propone, no se calcula sola.** Con `lastMenstruationDate` informada, el campo ofrece `+280 días` como valor sugerido y editable. Calcularla en firme escondería el rango de tolerancia, que es precisamente lo que el backend acepta.

##### La regla del sexo femenino, y el 500 que hay que saber leer

**Sólo corre en el `001`.** El servicio lee de `systemConfig` la fila `PREGNANCY_FEMALE_SEX_ITEM` / `GLOBAL`, que contiene el `catalogItemId` del sexo femenino **de esa instalación**, y compara contra `patient.sexItemId`:

| Situación | Respuesta |
|---|---|
| `sexItemId` coincide | 201 |
| `sexItemId` **nulo** | 201 — un sexo desconocido no prueba que no haya embarazo |
| `sexItemId` no coincide | `400 NOTIFPRG_001_PATIENT_NOT_FEMALE` |
| La fila de configuración falta, está inactiva, no es `string`, está cifrada o apunta a nada | **`500 NOTIFPRG_001_SEX_CONFIG_MISSING`** |

**Ese 500 no es un fallo del servidor y no se le muestra como tal al usuario.** Es un despliegue sin sembrar, y el bloque de embarazo entero es inservible hasta que alguien cargue la fila. El cliente lo detecta por su `code` y muestra «el registro de embarazo no está configurado en este despliegue», no un error genérico. Va a §10.6.

> **Ojo con la compuerta de §7.4 y esta regla juntas.** §7.4 muestra el bloque marcado «Si aplica» cuando el sexo es `UNKNOWN` o no está informado. Con `sexItemId` **nulo** el `001` pasa; con `sexItemId` apuntando al ítem `UNKNOWN` del catálogo, **no** — es un valor que no coincide, y responde 400. Son dos cosas distintas que la pantalla presenta igual, y el 400 hay que explicarlo diciendo qué sexo tiene registrado el paciente y ofreciendo corregirlo en el paso 1.

##### El `UNIQUE` que no filtra por `deletedAt`: la fila de embarazo no se borra nunca desde el asistente

`UQ_notificationPregnancy_notification` es una restricción de columna **sin `WHERE deletedAt IS NULL`**. Una fila desactivada **sigue ocupando el hueco**, y el `001` responde `409 NOTIFPRG_001_ALREADY_EXISTS` incluso sobre una fila borrada lógicamente. La vuelta atrás es `ESAVI-NOTIFPRG-005B`, **rol SUPERADMIN**.

Y `005A` es **ADMIN**, así que un USER tampoco puede borrarla.

**Regla que sale de ahí, y es la más fácil de romper de esta sección:** cuando la compuerta de embarazo se cierra —se corrige el sexo, o la fecha de nacimiento deja la edad fuera de rango (§7.4)— **el bloque se limpia con un `PUT`, jamás con un `DELETE`**. Borrarla es un camino de ida que necesita a un SUPERADMIN para deshacerse, y la propia §7.4 avisa de ese borrado antes de hacerlo. Limpiar con `004` conserva el `pregnancyId`, la auditoría y la posibilidad de volver.

---

#### `notificationPregnancyComplication` — columna por columna

Cuelga de la fila de embarazo. Son **N**, y comparte con `notificationEvent` la resolución contra el catálogo clínico.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `complicationId` | No | PK generada |
| `pregnancyId` | No | Del bloque de embarazo. **Inmutable** |
| `diagnosticTermId` | **No — derivado** | Lo devuelve la resolución. Ningún validador lo declara |
| `complicationTypeItemId` | **Sí — obligatorio** | `<CatalogSelect typeCode="pregnancyComplicationType">`, 3 ítems sembrados. **El DDL lo admite nulo y el validador lo exige** |
| `complicationRawName` | **No — derivado** | Lo que escribió el notificador, y sólo si difiere del maestro |
| `sortOrder` | No | Disparador |
| `metadata` | **No** | Fuera del alcance del SPEC F27. Ningún validador lo nombra |
| `notes` | Sí | Texto libre |

**`complicationName` y `complicationCode` son campos aceptados que no son columnas de esta tabla**, igual que `source`. Alimentan la resolución; el nombre acaba en `complicationRawName` sólo si diverge, y el código vive en `diagnosticTerm`. Es el tercer caso del documento en que **lo que se envía no es lo que se guarda**, y el formulario tiene que saberlo al releer.

**La resolución es la misma de `notificationEvent`**, con las mismas tres ramas y el mismo `404 PREGCOMP_00X_DIAGTERM_NOT_FOUND` para una fuente externa no importada. La diferencia: aquí no hay `esaviName` que el maestro reescriba — la tabla no guarda el nombre canónico, se lee del término incluido en la respuesta.

**Guarda de duplicados:** el par `(diagnosticTermId, complicationTypeItemId)` no se repite entre las complicaciones **activas** del mismo embarazo → `409 PREGCOMP_00X_ALREADY_EXISTS`. Sólo corre si el término tiene valor: dos complicaciones de texto libre del mismo tipo son registros distintos por definición.

**Y sólo mira filas activas, a propósito.** No hay índice único detrás: es una regla de negocio, y una regla inventada no debe ser más estricta que las de la base. Desactivar una complicación y volver a cargarla es el camino natural de corrección. Compárese con el `409` de `notificationPregnancy`, que **sí** salta sobre una fila inactiva porque allí hay una restricción real que iba a rechazar el `INSERT` de todos modos.

**La asimetría del `004` respecto a `NOTIFPRG-004`, que es deliberada:** `complicationTypeItemId` y `complicationName` son opcionales pero **no anulables** — un `null` explícito da 400. Allí se retiraba una **respuesta** dada por error; aquí un `null` borraría una **clasificación obligatoria** y dejaría en la base una fila que el `001` habría rechazado. Corregir una tipificación equivocada se hace mandando la correcta, no borrándola.

---

#### Los dos componentes propios

**Los dos ya existen, y no aquí.** `references/external/who-drug/capture-plugin/` y `references/external/meddra/capture-plugin/` son los plugins DHIS2 en producción, y **el comportamiento que replicamos es el suyo** — no una interpretación nuestra del endpoint. Lo que cambia es de dónde salen los datos: allí, un backend externo alcanzado por una *route* de DHIS2; aquí, `ESAVI-WHODRUG-006A`…`E` y `ESAVI-MEDDRA-006`.

Se anota tanto lo que se copia como lo que **no**: los plugins escriben en `dataElements` de DHIS2 mediante «huecos» de vacuna (`useVaccineSlots`) y botones de asignación. Eso es del modelo de DHIS2 y **no se replica**: aquí el destino es una fila de `notificationVaccine` o de `notificationEvent`, y el patrón es el de §5.4b — lista con «Añadir» y modal.

> **`references/external/` está en `.gitignore` y no viaja con el repositorio.** Lo que sigue está escrito para poder implementarse **sin abrir los plugins**: cada regla dice qué hace y por qué, no «hazlo como el plugin». Las citas a ficheros concretos —`WhoDrugCascade.js`, `useMedDRASearch.js`— son para quien sí los tenga a mano, no una dependencia. Si al implementar `FE12b` la carpeta no está, no falta nada.

##### `<WhodrugTreePicker>` — `ESAVI-WHODRUG-006A`…`006E`

Cinco niveles encadenados, cada uno un `GET` distinto, y cada nivel exige **todos** sus ancestros. Las etiquetas son las del plugin (`WhoDrugCascade.js`), en español y por i18n:

| Nivel | Endpoint | Etiqueta | Columna que agrupa |
|---|---|---|---|
| 1 | `006A` | Abreviatura | `abbreviation` |
| 2 | `006B` | Nombre comercial de la vacuna | `drugName` |
| 3 | `006C` | Titular de la vacuna | `maHolders` |
| 4 | `006D` | Forma / presentación | **`formTranslations`**, no `form` |
| 5 | `006E` | Potencia | `strength` |

**Se despliega de arriba abajo, y elegir un nivel borra todos los de abajo.** Es la mecánica exacta de `applySelection`/`clearFromLevel` del plugin: elegir una abreviatura nueva vacía nombre, titular, forma y potencia. Sin eso quedan combinaciones imposibles en pantalla que el nivel siguiente ya no sostiene.

Cada respuesta es `{ count, total, options[] }`, y cada opción trae tres campos:

| Campo | Qué significa |
|---|---|
| `value` | El texto del nivel. **Puede ser `null`**: cuatro de las cinco columnas lo admiten |
| `matchCount` | Cuántas filas del diccionario cuelgan de esta opción |
| `vaccineWhodrugId` | **El id, y sólo cuando `matchCount === 1`.** En cualquier otro caso es `null` |

**El `count` es lo que decide si hay que seguir bajando**, que es como funciona el plugin hoy: su `isLeafLevel` es `count === total` — cada opción del nivel corresponde a una única fila— y cuando además el nivel tiene **una sola opción**, no dibuja el desplegable y baja solo.

**Nuestro backend afina esa señal y hay que aprovecharla.** El plugin sólo sabe si el nivel entero está resuelto; aquí `matchCount` viene **por opción**, y `vaccineWhodrugId` llega ya resuelto en cuanto vale 1. De ahí las dos reglas del componente:

- **Una opción con `matchCount === 1` termina el árbol ahí mismo**, en cualquiera de los cinco niveles: el id ya está, no hace falta una llamada más ni bajar por niveles que no discriminan nada.
- **`count === total` colapsa el nivel entero.** Si además tiene una sola opción, se elige sola y no se dibuja — igual que el plugin.

`matchCount` se muestra junto a cada opción. Es lo que le dice al usuario cuánto le queda por concretar, y es la diferencia entre bajar cinco niveles a ciegas y ver que la primera opción ya es única.

**Al resolverse el id, se lee la fila entera con `ESAVI-WHODRUG-003`.** Los cinco endpoints del árbol devuelven texto agrupado, no la fila: para el panel de información y para los tres textos de §5.4b hace falta el `003`. El plugin no necesita ese paso porque su backend le devuelve la fila completa en cada nivel; el nuestro no, y omitirlo es la equivocación fácil de este componente.

**Panel de información**, con las mismas filas que `getVaccineInfoRows` del plugin, y una advertencia de nombres — las columnas de nuestro DDL **no se llaman igual**:

| Fila | Columna de `vaccineWhodrug` |
|---|---|
| Abreviatura · Nombre comercial · Titular | `abbreviation` · `drugName` · `maHolders` |
| Forma/presentación | `formTranslations ?? form` |
| Potencia | `strength` |
| Ingrediente | **`ingredientTranslation`** (singular) `?? ingredient` — el plugin escribe `ingredientTranslations` |
| Dosis, si hay | **`noDose`** (singular) — el plugin escribe `noDoses` |
| Diluyente, si hay | `diluent` |

Un campo vacío se muestra como «no existe información adicional», no se oculta: la fila ausente y el dato ausente se leen igual y no lo son.

> **`vaccineWhodrug.diluent` es texto del diccionario, no una clave a `diluentCatalog`.** Sirve para que el usuario sepa qué diluyente esperaba esa vacuna; **no** rellena ni preselecciona la fila de `notificationDiluent`, que es otro dato —el lote concreto que se usó— y vive en otra tabla.

**Asignar sólo la abreviatura.** El plugin lo ofrece como acción propia, y aquí traduce directo: cuando el usuario sabe qué vacuna fue pero no puede concretar la presentación, se guarda `vaccineName` con la abreviatura y **sin FK**. Es la rama «cruda» de la guarda de contenido mínimo, no un caso degradado.

**El valor `null` viaja hacia abajo como `__NULL__`.** Es el centinela que el servicio reserva —no aparece en el diccionario— y sin él las filas detrás de una opción vacía serían inalcanzables. El componente lo manda tal cual y **no** lo muestra: en pantalla es «sin especificar».

Tres parámetros más, comunes a los cinco niveles: `country` (ISO3; ausente, no filtra por país), `language` (`es`/`en`/`nl`; por defecto el del store de preferencias) y `search`, con **mínimo dos caracteres**, que filtra la misma columna que agrupa. Los valores de ancestro viajan **exactos**, tal como los devolvió el nivel anterior: sin `trim`, sin normalizar, sin recodificar.

Y `isActive` es siempre `true` sin variante de administración: una entrada retirada no se puede elegir hoy, aunque una fila guardada ayer siga apuntando a ella.

> **Dos cosas del plugin que aquí no hay que copiar.** Su `useWhoDrugQuery` cancela por número de secuencia y su backend interpola los cinco parámetros en el SQL —cinco puntos de inyección que nuestro servicio cerró a propósito—. Lo primero lo hace TanStack Query sola; lo segundo ya está resuelto en el otro lado.

##### `<MeddraSearchField>` — `ESAVI-MEDDRA-006`

`GET /api/meddra/search?term=`, y **`term` es el único parámetro**: versión, tamaño y niveles viajan en la configuración del servidor y no se abren al cliente — es una API licenciada que se paga por llamada.

Comportamiento, copiado de `useMedDRASearch.js` y `MedDRASearchField.js`:

- **Mínimo 3 caracteres** (no 2 como el resto) y **debounce de 400 ms**, los dos del plugin. Por debajo del mínimo se vacían resultados y error, no se consulta.
- Es un campo de texto con desplegable, no un `<select>`: se escribe y las coincidencias caen debajo, **con la parte coincidente resaltada**.
- **En la lista se muestra el nombre, no el código.** El plugin llegó a mostrar `pcode - name` y lo dejó comentado en las dos capas; se replica su decisión final. El código viaja igual y se guarda igual.
- Elegido un término, el campo muestra su nombre, se cierra el desplegable y se limpia la consulta. «Limpiar» deshace la elección.
- Devuelve `{ count, rows: [{ code, name, termGroup }] }`, con `termGroup` en `LLT`·`PT`·`HLT`·`HLGT`·`SOC`.
- El servidor cachea cinco minutos por término e idioma. **El cliente no vuelve a cachear** por su cuenta más allá de lo que haga TanStack Query con su clave.

**Qué `source` se envía, que es la decisión que cierra el campo:**

| Cómo se rellenó el término | `source` | Efecto en `diagnosticTerm` |
|---|---|---|
| Elegido en el buscador de MedDRA | **`MEDDRA`** | Se busca `(MEDDRA, code)`. **No acuña**: `404` si el diccionario no está importado |
| Escrito a mano con código | **`LOCAL`** | Resolución implícita: si el término no existe, **se acuña** marcado `autoCreated`/`PENDING` |
| Escrito a mano sin código | — | No hay resolución. `diagnosticTermId: null` y el nombre es texto libre |

`LOCAL` se envía **explícito**, no por omisión. El servicio trata «sin `source`» y `LOCAL` igual, pero mandarlo escrito es lo que hace legible en el cuerpo de qué rama viene el término — y lo que impide que un término de MedDRA acabe acuñado como local por haberse olvidado el campo.

Cuatro errores que no son fallos del usuario y **no se muestran como tales**:

| `code` | Qué pasó |
|---|---|
| `MEDDRA_006_DISABLED` (503) | El despliegue tiene MedDRA apagado |
| `MEDDRA_006_NOT_CONFIGURED` (503) | Faltan credenciales |
| `MEDDRA_006_TIMEOUT` (504) | La API externa no contestó en 10 s |
| `MEDDRA_006_SEARCH_FAILED` / `MEDDRA_006_AUTH_FAILED` (502) | La API externa falló |

En los cuatro el campo **degrada a texto libre sin código**, que es un registro perfectamente válido (`diagnosticTermId: null`), y lo dice. Bloquear el formulario porque un diccionario externo está caído perdería la notificación entera.

---

#### Condiciones

| Condición | Regla |
|---|---|
| Rol para escribir | **ADMIN** en eventos, vacunas, diluyentes y medicación; USER en embarazo y complicaciones. Bloqueo abierto en §10.4 |
| Orden de creación | Notificación → vacuna → diluyente; notificación → embarazo → complicación. El id del padre vuelve en la respuesta |
| `sortOrder` | Nunca se envía; el orden es el de creación y no se reordena |
| Bloqueantes de guardado | `esaviName` (evento), `medicationName` (medicación), `complicationTypeItemId` y `complicationName` (complicación), `wasPregnantAtVaccination` en el `001` (embarazo) |
| Contenido mínimo | Vacuna: `vaccineWhodrugId` **o** `vaccineName`. Diluyente: `diluentCatalogId` **o** `diluentName` |
| Coherencia temporal | `vaccinationDate ≤ eventDate`; `reconstitutionDate ≤ vaccinationDate`. Mismo día válido; sin regla si falta una fecha |
| Rango gestacional | 266–294 días entre menstruación y parto probable, inclusive |
| Evento principal | **Varios admitidos.** Casilla por fila, no radio: el cliente no restringe lo que el esquema no restringe |
| «Otro» evento | Descripción obligatoria; `esaviCode` y término prohibidos. Se evalúa sobre el estado resultante |
| «Otra» medicación | Texto obligatorio con `true`, prohibido con `false`. `medicationCode` no entra en la regla |
| `source` del término | **`MEDDRA`** si viene del buscador —nunca acuña, `404` si no está importado—; **`LOCAL` explícito** si se escribe a mano con código; ninguno si no hay código |
| Textos de la vacuna | Elegir en el árbol envía **la FK y los tres textos**: `whoCode` y `vaccineCode` ← **el mismo `drugCode`**, `vaccineName` ← `drugName`. La identidad la lleva `vaccineWhodrugId`. El servicio no los deriva jamás |
| Fin del árbol WHODrug | Una opción con `matchCount === 1` resuelve el id en cualquier nivel; `count === total` colapsa el nivel. Después, `ESAVI-WHODRUG-003` para la fila entera |
| Fila de embarazo | **Se limpia con `PUT`, nunca con `DELETE`.** El `UNIQUE` no filtra por `deletedAt` y volver atrás exige SUPERADMIN |
| Duplicado de complicación | `(término, tipo)` no se repite entre las **activas** del mismo embarazo |
| Variantes de `answerOption` | Las tres de `notificationPregnancy` usan `unknown` (§7.1) |
| Catálogos sin sembrar | `pharmaceuticalForm`, `administrationRoute` y `diluentCatalog`. El formulario aguanta el catálogo vacío (§10.5) |

### 5.5 Paso 5 — Investigación · **cerrado**

Trece entidades, unas 160 columnas, cinco sesiones. §5.5.0 fija el mapa y §5.5.1 a §5.5.5 lo recorren entero.

**Los cinco hallazgos que ninguna otra parte del documento tenía**, y que son la razón de leer el servicio y no la tabla:

| Hallazgo | Dónde |
|---|---|
| Las dos nietas cuelgan de un satélite 1:1 y **su columna se llama `investigationId` igual** — el `404` llega con un id correcto | §5.5.0, §5.5.3 |
| Los ocho satélites 1:1 **no tienen `isActive`**: se crean y se limpian, no se borran | §5.5.0 |
| Tres familias de columnas cuyo **nombre engaña**: `storage*`, `*InThermos`, `syringesKeyFindings` | §5.5.4, §5.5.5 |
| **Dos compuertas que se leen al revés**: el `'NO'` del vial exige el contador, y el `'NO'` de las jeringas abre el bloque | §5.5.4, §5.5.5 |
| `investigationCovidHistory` está en el DDL y **es obsoleta** | §5.5.0, §10.7 |

#### 5.5.0 El mapa: catorce tablas, cuatro formas, y una que no existe

El paso 5 es el bloque más grande del expediente: **una cabecera y trece satélites**, unas 160 columnas. Antes de mirar una sola columna hay que ver la forma, porque de ella sale todo lo demás.

**Cuatro formas, no trece casos distintos:**

| Forma | Cuántas | Qué las distingue |
|---|---|---|
| **Cabecera** | 1 | `investigation`. PK propia, 1:1 con el caso vía `UQ_investigation_case` |
| **Satélite 1:1** | 8 | **PK = FK**: su clave primaria *es* `investigationId`. Sin `isActive` |
| **Satélite N** | 2 | PK propia + `investigationId`, con `sortOrder` |
| **Nieta** | 2 | Cuelgan de un satélite 1:1, **no de la investigación** |

Y la lista completa, con lo que decide cada una:

| Tabla | Forma | Cols. | Código | Cuelga de |
|---|---|---|---|---|
| `investigation` | Cabecera | 10 | `INVESTGN` | `esaviCase` (1:1) |
| `investigationSource` | 1:1 | 10 | `INVSRC` | `investigation` |
| `investigationAutopsy` | 1:1 | 9 | `INVAUT` | `investigation` |
| `investigationMedicalHistory` | 1:1 | 16 | `INVMEDH` | `investigation` |
| `investigationClinicalEvaluation` | 1:1 | 17 | `INVCLIEV` | `investigation` |
| `investigationVaccinationContext` | 1:1 | 12 | `INVVACTX` | `investigation` |
| `investigationColdChain` | 1:1 | 16 | `INVCOLD` | `investigation` |
| `investigationAdministrationError` | 1:1 | 27 | `INVADMER` | `investigation` |
| `investigationCommunity` | 1:1 | 11 | `INVCOMM` | `investigation` |
| `investigationTeamMember` | N | 7 | `INVTEAM` | `investigation` |
| `investigationVaccineAdministered` | N | 5 | `INVVACAD` | `investigation` |
| `investigationPregnancyCondition` | **Nieta** | 5 | `INVPREG` | **`investigationMedicalHistory`** |
| `evaluationInstitution` | **Nieta** | 8 | `EVALINST` | **`investigationClinicalEvaluation`** |
| `investigationCovidHistory` | — | 11 | **ninguno** | **Obsoleta.** Sin endpoints y sin bloque en el asistente — ver abajo |

##### La trampa de las dos nietas: la columna se llama `investigationId` y no apunta a la investigación

`evaluationInstitution.investigationId` **no** es una clave ajena a `investigation`. Apunta a `investigationClinicalEvaluation`, cuya PK es ese mismo UUID. Igual `investigationPregnancyCondition.investigationId`, que apunta a `investigationMedicalHistory`.

El backend lo dice con todas las letras en `evaluationInstitution.service.ts:125-127`: *«la columna se llama `investigationId` y no apunta a `investigation`: apunta a la clave primaria de la evaluación clínica, que es el mismo UUID»*.

**Consecuencia práctica, y es la que hay que tener presente al construir la pantalla:** una investigación viva sin fila de evaluación clínica **no admite instituciones**, y responde `404 EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` con un id que existe y es válido. Lo mismo con las condiciones del embarazo y los antecedentes médicos.

Que el id coincida hace la trampa peor, no mejor: el `POST` lleva un UUID correcto, el usuario está en la investigación correcta, y el 404 parece un fallo del servidor. **El orden de creación es obligatorio y no negociable:** primero el satélite 1:1, después su nieta.

##### Los ocho satélites 1:1 no tienen `isActive`, y eso cambia su ciclo de vida

Ninguna de las ocho declara la columna. Sólo tienen `deletedAt`. Y en las rutas se ve la consecuencia: **no hay `005A` ni `005B`** — sólo `005C`, purga física, rol SUPERADMIN.

Es exactamente la forma de `severeNotification` y `nonSevereNotification` (§5.4), y arrastra la misma regla: **una vez creada la fila, no se retira desde el asistente**. Si la sección deja de aplicar, se limpian sus campos con el `PUT`; borrarla no es una opción disponible.

Y hay un detalle que lo hace más estricto que en el paso 4: como la PK es el `investigationId`, **el hueco es único por investigación y no se libera nunca**. Un segundo `POST` sobre la misma investigación responde `409`, incluso si la fila anterior estuviera marcada como borrada.

**Regla del paso 5, entonces, y es la misma de §7.3 llevada al extremo:** el asistente **crea** filas 1:1 y las **limpia**; no las borra. El único `DELETE` que un USER ve en todo el paso es el de los cuatro satélites con identidad propia — los dos `N` y las dos nietas —, y aun ésos son `005A` con rol ADMIN.

##### Las escrituras del paso 5 son todas `USER`, y eso refuerza §10.4

Las trece entidades implementadas tienen `POST` y `PUT` en **`USER`**. Ni una en ADMIN.

**Es la prueba que le faltaba a §10.4.** Trece entidades del paso 5 escriben como `USER`; ocho del paso 4 también; y sólo cuatro del paso 4 —`NOTIFEVT`, `NOTIFVAC`, `NOTIFDIL`, `NOTIFMED`— piden ADMIN. No es una política de seguridad graduada por sensibilidad del dato: la investigación es más sensible que la lista de vacunas administradas, y va en `USER`. Es la deriva de cuatro specs de CRUD que eligieron rol por su cuenta, y §10.4 lo pide corregido con este dato a favor.

Los `005A` sí son ADMIN en las cuatro entidades con identidad propia, y los `005B` reparten entre ADMIN y SUPERADMIN sin criterio visible. Es el mismo problema de §10.2 —se puede añadir y no quitar lo recién añadido— repetido cuatro veces; se acumula a la misma petición.

##### `investigationCovidHistory` está en la base, no tiene API, y **es obsoleta**

**Diecisiete columnas en `esaviapp.sql`, y ni servicio, ni validador, ni ruta, ni código `ESAVI-*`.** Once de ellas son datos —historia de COVID, si fue asintomático, fecha de inicio de síntomas, confirmación diagnóstica, gravedad, fecha de muestra, participación en ensayo clínico y nivel de gravedad más alto— y tres son claves de catálogo, sin sembrar.

**Preguntado y respondido (§10.7): es una tabla que el modelo dejó atrás.** No es una entidad pendiente, nadie le debe endpoints, y **no hay bloque de COVID en el asistente** — ni ahora ni previsto.

**Entonces las trece entidades implementadas son *todo* el paso 5.** No queda una decimocuarta esperando, y el reparto de abajo está completo.

> **Y es el aviso que este mapa tenía que dejar por escrito.** Una tabla en el esquema no es una obligación de implementarla. Leer el DDL como si fuera la especificación habría metido un bloque de once campos en el paso 5, más una petición de endpoints y de tres catálogos en §10, por un vestigio. La única forma de distinguir «pendiente» de «abandonada» era preguntar.

##### El reparto de las sesiones que quedan

Se agrupa por afinidad clínica, no por tamaño: las secciones que el investigador rellena juntas se deciden juntas, porque sus reglas cruzadas son las que producen los errores.

| Sesión | Bloque | Tablas | Cols. |
|---|---|---|---|
| ✅ | **§5.5.1 — Cabecera** | `investigation` | 10 |
| ✅ | **§5.5.2 — Quién investiga y con qué** | `investigationSource`, `investigationTeamMember`, `investigationAutopsy` | 26 |
| ✅ | **§5.5.3 — El paciente** | `investigationMedicalHistory` + `investigationPregnancyCondition`, `investigationClinicalEvaluation` + `evaluationInstitution` | 46 |
| ✅ | **§5.5.4 — El acto de vacunación** | `investigationVaccinationContext`, `investigationVaccineAdministered`, `investigationColdChain` | 33 |
| ✅ | **§5.5.5 — El error y la comunidad** | `investigationAdministrationError`, `investigationCommunity` | 38 |

Las dos nietas van **en la misma sesión que su madre**, por lo de arriba: separarlas es lo que hace que el orden de creación se olvide.

`investigationAdministrationError` lleva sola 27 columnas de datos —la tabla más ancha del expediente— y casi todas son `answerOption` con su texto de hallazgos. Comparte sesión con `investigationCommunity` porque las dos son bloques de conclusión, y porque la segunda es corta.

#### 5.5.1 La cabecera — `investigation` · **cerrada**

**Tabla:** `investigation` (10 columnas de datos) · **Endpoints:** `ESAVI-INVESTGN-001`, `-002A`, `-003`, `-004`, `-006`, `-005A`, `-005B`, `-005C`

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No | PK generada |
| `caseId` | No | Del contexto. **Inmutable en el `004`**: el servicio lo ignora |
| `statusItemId` | Sí | `<CatalogSelect typeCode="investigationStatus">`. **Nunca se guarda vacío** — ver abajo |
| `vaccinationSiteItemId` | Sí | `<CatalogSelect typeCode="vaccinationSite">`, los mismos 8 ítems de `nonSevereNotification` (§5.4) |
| `vaccinationHealthFacilityId` | Sí | `<EntitySearchSelect>`. Sólo se comprueba `isActive`: **no valida alcance geográfico**, igual que en §5.4 y a diferencia de `esaviCase` (§5.2) |
| `vaccinationGeoLocationId` | Sí | `<GeoLocationPicker>` |
| `hospitalizationDate` | Sí | **No futura**, comprobado en el validador |
| `investigationStartDate` | Sí | **No futura**. Sin orden cruzado con la anterior |
| `vaccinationLatitude` | Sí | `numeric(10,7)`. **Máximo 7 decimales**, comprobado en el validador |
| `vaccinationLongitude` | Sí | Ídem |
| `notes` | Sí | Texto libre |

**Una investigación por caso:** `UQ_investigation_case` **no filtra por `isActive`**, así que un caso cuya investigación fue desactivada **sigue ocupado** y el segundo `POST` responde `409 INVESTGN_001_CASE_ALREADY_INVESTIGATED`. Es la misma forma que `notificationPregnancy` (§5.4b) y arrastra la misma regla: **desde el asistente no se borra, se limpia**. La vuelta atrás es `ESAVI-INVESTGN-005B`, rol SUPERADMIN.

##### `statusItemId` se rellena solo, y el 500 que puede dar

El DDL lo admite nulo y **la aplicación nunca lo deja vacío**: sin `statusItemId`, o con un `null` explícito, el servicio pone el ítem `value: '0'` —«Desconocido»— del catálogo `investigationStatus`.

| Situación | Respuesta |
|---|---|
| Llega un `statusItemId` del catálogo correcto | Se guarda |
| Llega uno de **otro** catálogo, o inactivo | `404 INVESTGN_00X_STATUS_NOT_FOUND` |
| No llega, o llega `null` | Se guarda el `'0'` por defecto |
| No llega **y el ítem `'0'` no está sembrado** | **`500 INVESTGN_00X_DEFAULT_STATUS_MISSING`** |

El ítem por defecto se busca **por `value: '0'` con `isValueLocked: true`**, que es la forma canónica del SPEC F46 y confirma §7.2 una vez más: la lógica va contra `value`, nunca contra `code`. Y no filtra por `isActive`, porque un ítem bloqueado no se puede retirar.

**Ese 500 es un despliegue sin sembrar**, como los de §10.6, y se trata igual: se detecta por su `code` y se dice lo que es. Los seis ítems de `investigationStatus` **sí** están sembrados en `esaviapp.sql`, así que hoy no ocurre — pero el catálogo es editable, y el ítem `'0'` es el único que no se puede tocar sin romper el `001`.

> **En pantalla, el estado no es un campo obligatorio.** El desplegable ofrece los seis ítems y admite quedarse vacío, porque el servidor ya sabe qué poner. Marcarlo obligatorio en el cliente obligaría al investigador a elegir «Desconocido» a mano — que es exactamente lo que el respaldo del servidor existe para evitar.

##### Lo que devuelve el `003`, y por qué el `PUT` no reenvía las claves

La respuesta **excluye las cinco claves ajenas en crudo** y devuelve en su lugar los objetos resueltos: `case`, `status`, `vaccinationSite`, `vaccinationHealthFacility` y `vaccinationGeoLocation`.

**Un cliente que reenvía la respuesta de su `GET` no manda ningún `*ItemId`.** Y el `004` está escrito contando con eso: sólo resuelve el estado si `statusItemId` llega definido, así que un `PUT` que devuelve el objeto entero no lo toca ni lo reescribe al valor por defecto. Es correcto, y es frágil de la manera habitual — el formulario tiene que **desplegar** el objeto resuelto a su clave al enviar, no reenviar el objeto.

Es el mismo trabajo que ya hacen `<CatalogSelect>` y `<EntitySearchSelect>`: reciben el objeto para pintar la etiqueta y emiten el id. Se anota aquí porque es la primera tabla del expediente cuyo `003` **no** devuelve las claves crudas, y quien escriba el formulario sin mirarlo mandará `status: { ... }` y verá cómo no pasa nada.

##### Condiciones

| Condición | Regla |
|---|---|
| Existe el paso 5 | Sólo si `notification.requestInvestigation === true` (§5.4) |
| Bloqueante de guardado | Sólo `caseId`, que sale del contexto. **Ninguna columna de datos es obligatoria** |
| Una por caso | `409 INVESTGN_001_CASE_ALREADY_INVESTIGATED`, y el `UNIQUE` no filtra por `isActive` |
| Estado | Se rellena solo con el ítem `value: '0'` si no viaja. No se marca obligatorio en pantalla |
| Fechas | Las dos «no futuras». **Sin orden cruzado entre ellas** ni contra `eventDate` |
| Coordenadas | Máximo 7 decimales, o `400` |
| Unidad de salud | Sin validación de alcance geográfico, a diferencia del paso 2 |
| Reenvío del `GET` | El `003` devuelve objetos resueltos, no claves. El formulario emite ids |
| Ciclo de vida | Se limpia con `PUT`, no se borra. `005B` es SUPERADMIN |

#### 5.5.2 Quién investiga y con qué · **cerrado**

**Tablas:** `investigationSource` (10, 1:1), `investigationTeamMember` (7, N), `investigationAutopsy` (9, 1:1)
**Endpoints:** `ESAVI-INVSRC-001/-002A/-002B/-003/-004/-005C/-006`, `ESAVI-INVTEAM-001/-002A/-002B/-003/-004/-005A/-005B/-005C/-006`, `ESAVI-INVAUT-001/-002A/-002B/-003/-004/-005C/-006`

Las tres abren la investigación: de dónde sale la información, quién la recoge y —si el paciente murió— qué se hizo con el cuerpo. Es el bloque más pequeño del paso 5 y el que fija los patrones que los otros tres repiten.

##### El patrón de los satélites 1:1, que aquí se ve entero

`investigationSource` e `investigationAutopsy` son las dos primeras filas 1:1 del paso, y valen de plantilla para las ocho:

| Rasgo | Consecuencia |
|---|---|
| **PK = FK.** `investigationId` es la clave primaria y la ajena a la vez | El `POST` **lo lleva en el cuerpo**: la columna no tiene `DEFAULT gen_random_uuid()`. Y el `:id` de las rutas **es el `investigationId`**, no un id propio |
| **`004` lo ignora** | Reenviar el `GET` entero no da 400. Mover la fila a otra investigación es imposible por diseño |
| **Sin `isActive`** | No hay `005A` ni `005B`. Sólo `005C`, purga física, SUPERADMIN |
| **El `409` no mira `deletedAt`** | Una fila sellada sigue ocupando su `investigationId`. `409 INV<ENT>_001_ALREADY_EXISTS`, con el `investigationId` en el mensaje |
| **`002A`/`002B` duales** | La visibilidad se hereda de `investigation.isActive`, así que los dos listados devuelven conjuntos distintos |
| **`006` por caso** | Recorre `caso → investigación → satélite` y devuelve **un objeto**, no una lista |

**El `409` es lo que decide la pantalla, y es el mismo error de §5.4b con la fila de embarazo.** El formulario no pregunta «¿creo o actualizo?»: lo dice `ESAVI-CASEFLOW-006` con su `exists` por satélite (`ARCHITECTURE.md` §3.4), con la salvedad de §6.2 — `exists: true` no significa «utilizable». Y cuando la sección deja de aplicar, **se limpian sus campos con el `PUT`**; borrarla no está disponible para nadie por debajo de SUPERADMIN.

---

##### `investigationSource` — columna por columna

De dónde salió la información de la investigación. Ocho casillas no excluyentes y su descripción.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, **la envía el cliente** |
| `history` | Sí | `boolean` nulable |
| `interviewVaccinatedPerson` | Sí | Ídem |
| `interviewHealthWorker` | Sí | Ídem |
| `vaccinationRecord` | Sí | Ídem |
| `autopsyRecord` | Sí | Ídem |
| `verbalAutopsyRecord` | Sí | Ídem |
| `investigationReport` | Sí | Ídem |
| `other` | Sí | `boolean` nulable. **Gobierna `otherDescription`** |
| `otherDescription` | Condicional | `text`, sin longitud declarada |
| `notes` | Sí | Texto libre |

**Ninguna columna es obligatoria.** La fila se crea vacía y se completa después, que es el patrón de casi todo el paso 5 — y la excepción, `investigationAutopsy`, está más abajo.

**Los ocho son `boolean` y no `answerOption`**, y son **tri-estado**: `null` es «el formulario no lo recogió» y `false` es un «no» deliberado. Mismo tratamiento que los seis `verified*` de §5.4 y que los ocho criterios de gravedad de §5.3 — interruptor que nace sin tocar, no casilla que nace desmarcada.

**Regla de «otra fuente», y es asimétrica entre el `001` y el `004`:**

| Operación | Con `other === true` | Sin `other === true` |
|---|---|---|
| `001` | Descripción **obligatoria** (`INVSRC_001_OTHER_DESCRIPTION_REQUIRED`) | Descripción presente → **400** (`..._NOT_ALLOWED`) |
| `004` | Ídem, evaluado sobre el **estado resultante** | Descripción **que viaja con contenido** → 400. **Una descripción heredada se limpia sola, sin error** |

**Esa asimetría es deliberada y hay que aprovecharla, no replicarla a mano.** El `004` resuelve un huérfano que no creó —la descripción la guardó una petición anterior— y la borra sin preguntar; el `001` no tiene huérfano que resolver y por eso es estricto. Lo que **no** se perdona en ninguno de los dos es un cuerpo que apaga la fuente y la describe a la vez: eso se contradice, y tragárselo perdería el texto en silencio.

Para el formulario: al desmarcar «otra fuente», **se limpia el campo y se deja de enviar** — la §7.3 de siempre. Mandar `otherDescription: null` explícito también vale y llega al mismo sitio; lo que da 400 es apagar la casilla y mandar el texto.

---

##### `investigationTeamMember` — columna por columna

El equipo investigador. Lista con «Añadir», el patrón canónico de §5.0.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationTeamMemberId` | No | PK generada. **Aquí el `:id` sí es un id propio**, a diferencia de sus dos hermanas |
| `investigationId` | No | Del contexto. **Inmutable en el `004`** |
| `fullName` | **Sí — obligatorio** | ≤250. Única columna `NOT NULL` de datos. **Se normaliza a `Title Case`** |
| `institutionName` | Sí | ≤500. **No** se normaliza: `MINSAL` no debe volver `Minsal` |
| `email` | Sí | `citext`, formato validado, **sin longitud máxima**. Se guarda en minúsculas |
| `phone` | Sí | ≤50, **texto libre**: el dominio recoge extensiones, varios números en un campo y prefijos escritos de cualquier manera |
| `sortOrder` | No | Disparador (§5.4b) |
| `notes` | Sí | Texto libre |

**`fullName` vuelve distinto de como se envió.** `normalizeName` es `toTitleCase(trim(...))`, así que `ANA PÉREZ` se guarda `Ana Pérez`. Es el caso general de §8 —«lo enviado puede volver distinto»— y aquí importa el doble, porque ese valor normalizado es el que compara la guarda de duplicados.

**Guarda de duplicados sobre texto libre:** `fullName` normalizado no se repite entre los miembros **activos** de la misma investigación → `409 INVTEAM_00X_ALREADY_EXISTS`. No hay `UNIQUE` detrás; es regla de negocio, y por eso mira sólo filas activas: desactivar y volver a cargar es el camino natural de corrección.

> **Y no es deduplicación, aunque lo parezca.** Es coincidencia exacta sobre texto normalizado: **`Juan Pérez` y `Juan Perez` son dos personas distintas** para esta guarda. El backend lo declara sin disimulo. El formulario no debe prometer más de lo que hay — nada de «ya existe un miembro parecido».

**En el `004`, `fullName` es opcional pero no anulable:** un `null` explícito da 400. Se corrige, no se borra. Es la misma forma que `complicationTypeItemId` en §5.4b y que `deathDate` aquí al lado.

---

##### `investigationAutopsy` — columna por columna

**La excepción del paso 5: es el único satélite que no se abre vacío.** Los demás son formularios que se rellenan con el tiempo; éste es el registro de un hecho, y sin el hecho no existe la fila.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, la envía el cliente |
| `isDeath` | **No — se envía fijo `true`** | `NOT NULL DEFAULT true` en el DDL, **y el validador exige que llegue y valga exactamente `true`**. En el `004` se ignora |
| `deathDate` | **Sí — obligatorio** | **No futura.** En el `004` es corregible pero **no anulable** |
| `deathTime` | Sí | `HH:mm` o `HH:mm:ss`. **Primera columna `time` del repositorio** |
| `isAutopsyPerformed` | Sí | `boolean` tri-estado. **Gobierna `autopsyDate`** |
| `isAutopsyScheduled` | Sí | `boolean` tri-estado. **Gobierna `scheduledAutopsyDate`** |
| `autopsyDate` | Condicional | **No futura** |
| `scheduledAutopsyDate` | Condicional | **Sin restricción temporal alguna** — la única fecha del expediente sin ninguna |
| `autopsyComments` | Sí | Texto libre |
| `notes` | Sí | Texto libre |

**`isDeath` no se replica como defecto y ésa es la decisión que más protege.** El DDL pone `DEFAULT true` y el validador **lo exige explícito**: un defecto silencioso marcaría como fallecido a un paciente vivo porque el cliente olvidó la clave, y ése es el peor error posible de esta entidad. El formulario lo manda siempre `true` y **nunca lo ofrece**: una fila de autopsia sólo existe sobre una muerte.

**Las cuatro reglas de coherencia**, todas sobre el estado resultante y todas `400`:

| # | Regla | Código |
|---|---|---|
| 1 | `isAutopsyPerformed` e `isAutopsyScheduled` **no pueden ser los dos `true`** | `INVAUT_00X_AUTOPSY_FLAGS_EXCLUSIVE` |
| 2 | Sin `isAutopsyPerformed === true`, `autopsyDate` está prohibida | `INVAUT_00X_AUTOPSY_DATE_NOT_ALLOWED` |
| 3 | Sin `isAutopsyScheduled === true`, `scheduledAutopsyDate` está prohibida | `INVAUT_00X_SCHEDULED_AUTOPSY_DATE_NOT_ALLOWED` |
| 4 | `autopsyDate` **no puede ser anterior** a `deathDate` | `INVAUT_00X_AUTOPSY_DATE_BEFORE_DEATH` |

**Con la bandera en `true`, su fecha sigue siendo opcional.** «Se hizo la autopsia pero no sé cuándo» es un estado real; exigirla obligaría a inventar un dato.

**`scheduledAutopsyDate` no tiene ninguna restricción temporal, y es a propósito.** Puede ser futura —está programada—, puede ser pasada —se programó y no se hizo— y **puede ser anterior a la muerte**. Es la única fecha del expediente sin regla, y el `<DateField>` tiene que saberlo: aplicarle «no futura» por inercia rompería el caso normal.

**La regla 4 puede saltar sin que ninguna de sus dos fechas viaje.** Corregir sólo `deathDate` basta para dejar detrás una `autopsyDate` ya guardada. Es la única regla del bloque que se dispara desde un campo que no es el suyo, y el mensaje de error lleva las dos fechas interpoladas precisamente por eso.

**El `004` limpia las fechas él solo cuando su bandera deja de ser `true`.** No es una limpieza posterior: el `null` entra en el diff siempre, así que apagar una bandera que ya estaba apagada **no** produce `UPDATE` ni entrada de auditoría. En pantalla es §7.3 —ocultar limpia—, y aquí el servidor lo respalda en vez de castigarlo.

> **Cuidado con la asimetría entre el `001` y el `004`, que es al revés de lo intuitivo.** En el `001`, mandar una fecha con la bandera apagada es **400**. En el `004`, esa misma fecha **se descarta en silencio** si estaba almacenada, y sólo da 400 si viaja con contenido en el cuerpo. Un formulario que limpia al ocultar no nota la diferencia; uno que reenvía el `GET` entero, tampoco. Notarla es señal de que se está enviando algo que la pantalla no muestra.

##### La muerte se declara dos veces, y nadie las cruza — con razón

`notification.deathDate` (paso 4, §5.4) e `investigationAutopsy.deathDate` (paso 5) son la misma fecha en dos tablas, y **el backend no comprueba que coincidan**. Tampoco comprueba que exista la notificación de fallecimiento: se puede crear una autopsia sobre un caso cuyo desenlace es «Recuperado».

**Y aquí el backend suelto tiene razón, que es lo que distingue este caso de §6.1.** Un paciente puede morir **después** de notificar. Una notificación con desenlace «Recuperando» seguida de una muerte a los diez días no es una incoherencia que haya que impedir: es la historia real del caso, y es exactamente el desenlace que la vigilancia no puede permitirse perder.

- El bloque de autopsia **está siempre disponible**, con cualquier desenlace del paso 4 y también sin desenlace declarado.
- `deathDate` llega **precargada** desde `notification.deathDate` si la hay, vacía si no, y es editable siempre.
- Crearlo bajo un desenlace que no es muerte, o editar la fecha hasta que difiera, **avisa y ofrece corregir el paso 4**. **El aviso no bloquea**: primero se sabe que el paciente murió, después se actualiza el expediente, y ése es el orden del trabajo real.
- Corregir el desenlace a «Fallecido» obliga además a rellenar `deathDate` y `autopsyRequested` en el paso 4, que bajo otro desenlace estaban **prohibidos** con `400` (§5.4). El aviso lleva allí con esos campos señalados.

Lo que no se hace es propagar solo: son dos escrituras y la segunda puede fallar sola. Todo el razonamiento está en §6.6.

---

##### Condiciones

| Condición | Regla |
|---|---|
| Orden de creación | Los tres cuelgan de `investigation`: primero la cabecera (§5.5.1), después cualquiera de ellos |
| Bloqueantes de guardado | `investigationId` en los tres. Además `fullName` (equipo), y `isDeath: true` + `deathDate` (autopsia) |
| Filas 1:1 | El `POST` lleva el `investigationId` en el cuerpo; el `:id` de las rutas **es** ese id. Se limpian con `PUT`, no se borran |
| Bloque de autopsia visible | **Siempre** — el paciente puede morir después de notificar (§6.6). Con un desenlace que no sea muerte se avisa y se ofrece corregir el paso 4, pero **no se bloquea**. `isDeath` se envía fijo `true` y no se ofrece |
| Banderas de autopsia | Excluyentes entre sí; cada una gobierna su fecha; con la bandera en `true` la fecha sigue siendo opcional |
| `scheduledAutopsyDate` | **Sin restricción temporal.** Puede ser futura, pasada y anterior a la muerte |
| `autopsyDate` | No futura, y **no anterior** a `deathDate` — regla que salta al corregir sólo la fecha de muerte |
| «Otra fuente» | Descripción obligatoria con `other === true`. El `004` limpia la heredada sola; enviarla apagada es 400 |
| Nombres del equipo | `fullName` vuelve en `Title Case`; `institutionName` **no** se normaliza; `email` en minúsculas |
| Duplicado de miembro | Coincidencia **exacta** sobre `fullName` normalizado entre los activos. No es deduplicación |
| No anulables en el `004` | `deathDate` y `fullName`: se corrigen, no se borran |
| Tri-estado | Las ocho fuentes y las dos banderas de autopsia: `null` ≠ `false` |

#### 5.5.3 El paciente · **cerrado**

**Tablas:** `investigationMedicalHistory` (16, 1:1) → `investigationPregnancyCondition` (5, N), `investigationClinicalEvaluation` (17, 1:1) → `evaluationInstitution` (8, N)
**Endpoints:** `ESAVI-INVMEDH-001/-002A/-002B/-003/-004/-005C/-006`, `ESAVI-INVPREG-001/-002A/-002B/-003/-004/-005A/-005B/-005C`, `ESAVI-INVCLIEV-001/-002A/-002B/-003/-004/-005C/-006`, `ESAVI-EVALINST-001/-002A/-002B/-003/-004/-005A/-005B/-005C`

Quién es el paciente y qué se le encontró. **Las dos únicas nietas del expediente están aquí**, y por eso las cuatro tablas van juntas: separarlas es lo que hace que el orden de creación se olvide.

##### Las dos nietas, y el `404` que parece un fallo del servidor

Ya avisado en §5.5.0 y aquí es donde se cobra. Ninguna de las dos cuelga de `investigation`:

```
investigation
├── investigationMedicalHistory     (1:1, PK = investigationId)
│   └── investigationPregnancyCondition   (N)  → FK a investigationMedicalHistory
└── investigationClinicalEvaluation (1:1, PK = investigationId)
    └── evaluationInstitution             (N)  → FK a investigationClinicalEvaluation
```

**La columna de la nieta se llama `investigationId` y vale lo mismo que el id de la investigación** —porque la PK de su madre *es* ese id—, así que el `POST` sale con un UUID correcto sobre una investigación correcta y **responde 404 si la madre no existe**:

| Nieta | Falta la madre → | Código |
|---|---|---|
| `investigationPregnancyCondition` | `investigationMedicalHistory` | `404 INVPREG_00X_MEDICAL_HISTORY_NOT_FOUND` |
| `evaluationInstitution` | `investigationClinicalEvaluation` | `404 EVALINST_00X_CLINICAL_EVALUATION_NOT_FOUND` |

**Regla de pantalla: la madre se crea al abrir el bloque, no al primer «Añadir».** Las dos madres admiten `POST { investigationId }` a secas —todas sus columnas de datos son opcionales— así que abrir la sección crea la fila vacía y las listas quedan operativas desde el primer momento. Encadenar «crear madre + crear hija» dentro del botón de añadir funciona y falla peor: son dos escrituras y la segunda puede fallar sola.

**Y la madre no se borra nunca**, por lo de §5.5.0: es 1:1 sin `isActive`. Una vez abierto el bloque, la fila se queda aunque quede vacía. Eso está bien —una fila con quince nulos no afirma nada— y es la razón de que abrirla temprano no cueste nada.

> **Los dos mensajes de error tienen que decir *qué* falta, no «no encontrado».** Un `404` sobre un id que el usuario ve en la barra de direcciones y que sí existe es el error más desconcertante del paso 5. El texto dice que falta la ficha de antecedentes o la de evaluación clínica, y la pantalla la crea.

---

##### `investigationMedicalHistory` — columna por columna

Antecedentes del paciente, con el bloque de embarazo dentro.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, la envía el cliente |
| `hasPriorHospitalizationHistory` | Sí | `answerOption`, variante **`unknown`** |
| `priorHospitalizationObservations` | Sí | Texto libre. **No condicionado por su bandera** — ver abajo |
| `hasFamilyHistory` | Sí | `answerOption`, variante **`unknown`** |
| `familyHistoryObservations` | Sí | Texto libre. Ídem |
| `isPregnancyConfirmed` | Sí | `answerOption`, variante **`full`**. **Gobierna las nueve columnas siguientes** |
| `gestationalWeeks` | Condicional | Entero **0–45**, réplica del `CHECK`. **El 0 es válido** |
| `gestationMethodItemId` | Condicional | `<CatalogSelect typeCode="gestationMethod">`, 7 ítems |
| `deliveryItemId` | Condicional | `<CatalogSelect typeCode="deliveryType">`, 5 ítems |
| `birthItemId` | Condicional | `<CatalogSelect typeCode="birthCondition">`, 4 ítems |
| `pregnancyOutcomeItemId` | Condicional | `<CatalogSelect typeCode="pregnancyOutcome">`, 7 ítems |
| `hasPregnancyRiskFactor` | Condicional | `answerOption`, variante **`unknown`** |
| `riskFactorDescription` | Condicional | Texto libre |
| `birthWeightGrams` | Condicional | `numeric(8,2)`, **0–6000**. El 0 es válido |
| `wasBreastfed` | Condicional | `answerOption`, variante **`full`** |
| `notes` | Sí | Texto libre |

**Los cuatro catálogos están sembrados** —a diferencia de los tres de §10.5— con 7, 5, 4 y 7 ítems. No hay dependencia abierta aquí.

##### `full` aparece por primera vez, y sólo en dos columnas

Hasta aquí las diecisiete `answerOption` del expediente usaban `unknown`. Este bloque estrena `full` —`YES` · `NO` · `UNKNOWN` · `NOT_APPLICABLE`— y lo hace en dos sitios donde «no corresponde» es una respuesta que alguien va a necesitar dar:

| Columna | Variante | Por qué |
|---|---|---|
| `isPregnancyConfirmed` | **`full`** | §7.4 muestra el bloque marcado «Si aplica» cuando el sexo o la edad no constan. `NOT_APPLICABLE` es exactamente la respuesta de ese caso, y sin ella el investigador tiene que elegir entre mentir con un `NO` y dejarlo en blanco |
| `wasBreastfed` | **`full`** | Vive dentro del bloque de embarazo: con una gestación en curso todavía no hay lactancia que declarar, y eso no es un `NO` |
| `hasPriorHospitalizationHistory`, `hasFamilyHistory`, `hasPregnancyRiskFactor` | `unknown` | Las tres tienen respuesta objetiva y siempre aplican a quien se pregunta. Añadirles `NOT_APPLICABLE` sólo daría una cuarta opción para decir lo mismo que `UNKNOWN` |

`NO_ANSWER` sigue sin asignar en todo el documento, y esa columna del ENUM sigue esperando un caso real. Que no aparezca no es un descuido: significa que ninguna pregunta del expediente distingue todavía «se preguntó y no contestó» de «no se sabe».

##### La compuerta de embarazo del paso 5: nueve columnas y un `'YES'` estricto

`isPregnancyConfirmed` gobierna **nueve** columnas. Y la comparación es **estricta contra `'YES'`**, no por veracidad:

> Sobre un `answerOption` el «no» tiene **cinco** formas: `NO`, `UNKNOWN`, `NOT_APPLICABLE`, `NO_ANSWER` y el `null` de «nunca se preguntó». **Las cinco cierran el bloque por igual.** Escribir la regla contra la veracidad del valor funcionaría por accidente —los cinco textos del ENUM son *truthy*— y se rompería en silencio el día que alguien mire `if (isPregnancyConfirmed)`.

La regla, con la misma asimetría de §5.5.2:

| Operación | Con `'YES'` | Sin `'YES'` |
|---|---|---|
| `001` | Las nueve admitidas, ninguna obligatoria | Una que viaje **con contenido** → `400 INVMEDH_001_PREGNANCY_FIELDS_NOT_ALLOWED` |
| `004` | Ídem, sobre el **estado resultante** | La que no viaja **se fuerza a `null` sin error**; la que viaja con contenido → 400 |

**Y «con contenido» no es «presente»:** un `null` explícito nunca ofende —es el mismo destino al que llega el forzado—, una cadena en blanco tampoco, **y el `0` sí lo es**. En `gestationalWeeks` y `birthWeightGrams` el cero es un valor legítimo del `CHECK`, y comprobar por veracidad lo dejaría colarse por el bloque cerrado. El formulario tiene que distinguir «campo vacío» de «campo a cero» al enviar.

**Esta compuerta es distinta de la de §7.4 y las dos conviven.** La de §7.4 decide si el bloque de embarazo **se muestra** —sexo y edad del paciente—; ésta decide si sus campos **se guardan** —lo que el investigador confirmó—. Un paciente que pasa la primera puede tener `isPregnancyConfirmed: 'NO'` y entonces las nueve columnas siguen cerradas. Se aplican en ese orden: primero se ve el bloque, dentro está la pregunta, y detrás de la pregunta los nueve campos.

##### Las observaciones **no** cuelgan de su bandera, y es deliberado

`priorHospitalizationObservations` y `familyHistoryObservations` no están condicionadas por `hasPriorHospitalizationHistory` ni por `hasFamilyHistory`. El backend lo dice donde se ve: *«no está atada a su bandera: una nota que explica **por qué** la respuesta es `UNKNOWN` es exactamente cuando el texto libre vale más»*.

**Es la excepción a §7.3 y hay que respetarla.** El reflejo de este documento es «bandera apagada → oculta y limpia el texto», y aquí sería un error: el caso en que más falta hace escribir es precisamente aquel en que no se pudo responder. Los dos textos **se muestran siempre**, con la respuesta puesta o sin ella.

La diferencia con `otherDescription` (§5.5.2) es de naturaleza, no de estilo: allí el texto **es** el contenido de la respuesta —dice cuál es la otra fuente—, aquí el texto **comenta** la respuesta. Lo primero se limpia al apagar; lo segundo, no.

---

##### `investigationPregnancyCondition` — columna por columna

Condiciones del embarazo. Nieta de los antecedentes médicos, y **gemela de `notificationPregnancyComplication`** (§5.4b) hasta en la letra.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `pregnancyConditionId` | No | PK generada. **El `:id` sí es propio** |
| `investigationId` | No | Del contexto. Apunta a **la madre**. Inmutable |
| `diagnosticTermId` | **No — derivado** | Lo devuelve la resolución. Ningún validador lo declara |
| `conditionRaw` | **No — derivado** | Lo que escribió el investigador, y **sólo si difiere** del maestro |
| `sortOrder` | No | Disparador |
| `notes` | Sí | Texto libre |

**`conditionName` (≤500) y `conditionCode` (≤100) son campos aceptados que no son columnas**, más `source`. Misma mecánica de §5.4b: alimentan la resolución contra `diagnosticTerm`, con las mismas tres ramas y el mismo `404 INVPREG_00X_DIAGTERM_NOT_FOUND` para una fuente externa no importada.

**Guarda de duplicados, y aquí es más simple que en su gemela:** el `diagnosticTermId` no se repite entre las condiciones **activas** de la misma ficha → `409 INVPREG_00X_ALREADY_EXISTS`. **Sin `complicationTypeItemId` en el par**, porque esta tabla no tipifica: es sólo el término. Sólo corre con término resuelto — dos condiciones de texto libre son registros distintos por definición.

**En el `004`, `conditionName` es opcional pero no anulable.** Tercera aparición del mismo patrón: se corrige, no se borra.

> **Lo que el cliente puede reutilizar sin pensarlo, y lo que no.** El modal de esta lista es el de `notificationPregnancyComplication` menos el `<CatalogSelect>` de tipo: mismo `<MeddraSearchField>`, mismo `source`, misma resolución. Lo que **no** se comparte es el estado — son dos tablas de dos pasos distintos, y una condición del embarazo detectada en la investigación no aparece en la notificación ni al revés.

---

##### `investigationClinicalEvaluation` — columna por columna

La evaluación clínica. Diecisiete columnas, siete de ellas texto libre sin longitud máxima.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, la envía el cliente |
| `receivedMedicalAttention` | Sí | `answerOption`, variante **`unknown`**. **No gobierna nada** |
| `sourceExam` | Sí | `boolean` tri-estado |
| `sourceDocuments` | Sí | Ídem |
| `sourceVerbalAutopsy` | Sí | Ídem |
| `sourceOther` | Sí | Ídem. **Gobierna `otherDescription`** |
| `otherDescription` | Condicional | Texto libre |
| `suspectedChildAbuse` | Sí | `boolean` tri-estado. **Gobierna su explicación** |
| `childAbuseExplanation` | Condicional | Texto libre |
| `suspectedDomesticViolence` | Sí | `boolean` tri-estado. **Gobierna su explicación** |
| `domesticViolenceExplanation` | Condicional | Texto libre |
| `clinicalDetailsPersonName` | Sí | **Cifrado.** `Title Case` antes de cifrar |
| `familyClinicalDetails` | Sí | Texto libre |
| `completeClinicalSummary` | Sí | Texto libre |
| `signsAndSymptoms` | Sí | Texto libre |
| `otherSocialBackground` | Sí | Texto libre |
| `notes` | Sí | Texto libre |

**Tres pares bandera/explicación con la misma regla**, evaluada sobre el estado resultante y con la asimetría `001`/`004` de siempre:

| Bandera | Explicación | Códigos |
|---|---|---|
| `sourceOther` | `otherDescription` | `INVCLIEV_00X_OTHER_DESCRIPTION_{REQUIRED,NOT_ALLOWED}` |
| `suspectedChildAbuse` | `childAbuseExplanation` | `..._CHILD_ABUSE_EXPLANATION_{...}` |
| `suspectedDomesticViolence` | `domesticViolenceExplanation` | `..._DOMESTIC_VIOLENCE_EXPLANATION_{...}` |

**Seis códigos distintos, no dos con el campo interpolado**, porque son tres conceptos y el mensaje que el usuario necesita leer es distinto en cada uno. Y **el primer par que incumple corta**: un cuerpo que rompe dos pares recibe el error del primero en ese orden, así que el formulario valida los tres antes de enviar en vez de descubrirlos de uno en uno.

**Los seis booleanos son tri-estado**, con la misma lectura de siempre: `false` es «se comprobó y no», `null` es «no se comprobó». Sobre las dos sospechas esa diferencia deja de ser técnica — «no hay sospecha de maltrato» y «no se evaluó» son afirmaciones distintas, y sólo una de las dos se puede defender después.

##### `clinicalDetailsPersonName` está cifrado, y eso cierra tres puertas

Es **el primer campo cifrado de un satélite de investigación**, y el mismo tratamiento que los datos personales del paciente (§5.1):

- **`trim` + `Title Case` antes de cifrar.** Sin ese paso, `juan` y `Juan` producirían criptogramas distintos y el diff inventaría un cambio en cada apertura del formulario. **Vuelve normalizado**, como todo lo de §8.
- **No se puede buscar ni parcial ni exactamente de forma útil**, y no hay filtro de listado sobre él — ni lo habrá.
- **No se puede ordenar por él**: un `ORDER BY` sobre la columna ordena por el criptograma. Los dos listados salen por `createdAt DESC`, la misma limitación que los apellidos del paciente.

Un `null` se guarda como `null`, nunca como el cifrado de la cadena vacía.

---

##### `evaluationInstitution` — columna por columna

Las instituciones que evaluaron al paciente. Nieta de la evaluación clínica, lista con «Añadir».

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `evaluationInstitutionId` | No | PK generada. **El `:id` sí es propio** |
| `investigationId` | No | Del contexto. Apunta a **la madre**. Inmutable |
| `sortOrder` | No | Disparador |
| `healthFacilityId` | Sí | `<EntitySearchSelect>`. **Sin validación de alcance geográfico** |
| `institutionName` | Sí | **≤250**, en claro |
| `personName` | Sí | **≤120 — cifrado** |
| `personContact` | Sí | **≤120 — cifrado** |
| `evaluationInstitutionTypeItemId` | Sí | `<CatalogSelect typeCode="evaluationInstitutionType">`, 5 ítems sembrados |
| `notes` | Sí | Texto libre |

**Los máximos de 120 no son un capricho y el formulario tiene que replicarlos.** Las tres columnas son `varchar(250)` en el DDL, pero dos se guardan **cifradas**, y lo que tiene que caber en los 250 es el criptograma, que es más largo que su texto. Un `maxLength` de 250 sobre el texto en claro dejaría pasar valores que Postgres rechaza, y el error saldría del driver como un **500** en vez de del validador como un 400.

> Es la primera vez en el documento en que **el límite de la pantalla no es el de la columna**. Copiar el `varchar(n)` del DDL, que es lo que este documento ha venido diciendo, aquí produce el error exacto que se quería evitar.

**Guarda de identificación:** al menos uno de `healthFacilityId` o `institutionName` → `400 EVALINST_00X_...`. Es la forma «codificada o cruda» de §5.4b, aplicada por tercera vez: una institución que no dice cuál es no es un registro.

**Guarda de duplicados, y sólo sobre la clave:** `healthFacilityId` no se repite entre las instituciones **activas** de la misma ficha → `409`. **Los nombres libres no entran**, ni siquiera cuando coinciden: sin identidad que comparar, dos textos iguales pueden ser dos sedes distintas, y convertir eso en `409` bloquearía un registro legítimo.

---

##### Condiciones

| Condición | Regla |
|---|---|
| Orden de creación | `investigation` → madre 1:1 → nieta. **La madre se crea al abrir el bloque**, no al primer «Añadir» |
| `404` de las nietas | El id es correcto y la madre falta. El mensaje dice **qué ficha** falta, y la pantalla la crea |
| Bloqueantes de guardado | `investigationId` en las cuatro. Además `conditionName` (condición) y la guarda de identificación (institución) |
| Compuerta de embarazo del paso 5 | `isPregnancyConfirmed === 'YES'` **estricto**; las otras cinco formas cierran las nueve columnas |
| «Con contenido» ≠ «presente» | `null` y cadena en blanco no ofenden; **el `0` sí**. Vale para `gestationalWeeks` y `birthWeightGrams` |
| Dos compuertas de embarazo | §7.4 decide si el bloque **se ve**; `isPregnancyConfirmed` decide si sus campos **se guardan**. En ese orden |
| Observaciones de antecedentes | **No cuelgan de su bandera.** Excepción declarada a §7.3: comentan la respuesta, no la contienen |
| Tres pares bandera/explicación | Obligatoria con la bandera en `true`, prohibida si no. **El primer par que incumple corta**: validar los tres antes de enviar |
| Duplicado de condición | Sólo `diagnosticTermId`, entre las activas. **Sin tipo en el par**, a diferencia de §5.4b |
| Duplicado de institución | Sólo `healthFacilityId`. **Los nombres libres no entran** |
| Campos cifrados | `clinicalDetailsPersonName`, `personName`, `personContact`. Ni búsqueda ni orden; vuelven normalizados |
| Longitud en pantalla | **120** en los dos cifrados de la institución, **250** en `institutionName`. No es el `varchar(n)` |
| Tri-estado | Los seis booleanos de la evaluación clínica: `false` ≠ `null`, y sobre las sospechas la diferencia es sustantiva |
| Variantes de `answerOption` | **`full`** en `isPregnancyConfirmed` y `wasBreastfed` — primera aparición—; `unknown` en las otras cuatro (§7.1) |

#### 5.5.4 El acto de vacunación · **cerrado**

**Tablas:** `investigationVaccinationContext` (12, 1:1), `investigationVaccineAdministered` (5, N), `investigationColdChain` (16, 1:1)
**Endpoints:** `ESAVI-INVVACTX-001/-002A/-002B/-003/-004/-005C/-006`, `ESAVI-INVVACAD-001/-002A/-002B/-003/-004/-005A/-005B/-005C/-006`, `ESAVI-INVCOLD-001/-002A/-002B/-003/-004/-005C/-006`

Qué pasó el día de la vacunación: en qué momento, con qué vacunas, y si la cadena de frío aguantó. **Es el bloque de las compuertas mal leídas** — tres, y las tres se leen al revés si uno se fía del nombre de la columna.

---

##### `investigationVaccinationContext` — columna por columna

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, la envía el cliente |
| `momentItemId` | Sí | `<CatalogSelect typeCode="vaccinationMoment">`, **3 ítems** sembrados |
| `multidoseItemId` | Sí | **El mismo catálogo `vaccinationMoment`** — ver abajo |
| `vaccinatedPerVialCount` | Sí | Entero **0–32767**. El 0 es válido |
| `vaccinatedPerBatchCount` | Sí | Ídem |
| `locations` | Sí | Texto libre, sin longitud |
| `isCluster` | Sí | `answerOption`. **Gobierna las cuatro siguientes** |
| `clusterIdentificationNumber` | Condicional | ≤100. **Único `varchar(n)` de la tabla** |
| `clusterAdditionalCaseCount` | Condicional | Entero 0–32767 |
| `clusterUsedSameVial` | Condicional | `answerOption`. **Y a su vez gobierna la última** |
| `clusterSameVialCount` | Condicional | Entero 0–32767 |
| `notes` | Sí | Texto libre |

**Los cuatro contadores llevan techo de 32767, y no sale de ningún `CHECK`.** Los `CHECK` del DDL sólo cubren el suelo con `>= 0`; el techo es del tipo `smallint`, y **si el validador no lo replicara, un 40000 llegaría a Postgres y volvería como un 500**. El `<NumberField>` de estos cuatro lleva `max={32767}`, no porque lo diga el esquema sino porque lo dice el tipo.

**Y el 0 pasa y tiene que seguir pasando.** «De ese vial no se vacunó a nadie más» es una respuesta, no una ausencia. Cuarto sitio del documento donde comprobar por veracidad destruiría un dato legítimo.

##### Dos columnas, un solo catálogo, dos errores distintos

`momentItemId` y `multidoseItemId` apuntan **al mismo catálogo `vaccinationMoment`** —tres ítems: primeras horas, últimas horas, desconocido— y el servicio los valida por separado con **dos códigos de error distintos**.

Es correcto y hay que replicarlo: son dos preguntas —en qué momento de la jornada se vacunó, y en qué momento se usó el vial multidosis— que se responden con la misma escala. **Compartir el catálogo es una decisión de datos; compartir el mensaje sería una decisión de interfaz, y la peor de las dos**: el usuario tiene dos desplegables en pantalla y necesita saber cuál rechazar.

##### La compuerta del conglomerado, y la regla del vial que se lee al revés

`isCluster` gobierna cuatro columnas, con **`'YES'` estricto**: `NO`, `UNKNOWN`, `NOT_APPLICABLE`, `NO_ANSWER` y el `null` cierran el bloque por igual. Un número de conglomerado registrado bajo `isCluster: 'UNKNOWN'` no describe nada — si no se sabe si hay conglomerado, no hay conglomerado que identificar.

Con el bloque **abierto** las cuatro son opcionales y **no hay lado obligatorio**: un investigador puede saber que el caso pertenece a un conglomerado antes de que ese conglomerado tenga identificador asignado. Con el bloque **cerrado** las cuatro están prohibidas, con la asimetría `001`/`004` ya conocida — en el `001` siempre 400; en el `004`, 400 sólo si el campo viaja con contenido, y el que no viaja se fuerza a `null` sin error.

**Un solo código de error para las cuatro** (`INVVACTX_00X_CLUSTER_FIELDS_NOT_ALLOWED`), y es la decisión contraria a la de los tres pares de §5.5.3. Ahí eran tres conceptos distintos; aquí el bloque es **un solo concepto** —«esto no es un conglomerado»— repartido en cuatro columnas, y el mensaje que el usuario necesita leer es el mismo sea cual sea el campo que sobra.

> **Y ahora la regla que casi nadie implementa bien a la primera: es el `'NO'` el que exige el contador, no el `'YES'`.**
>
> Con el bloque abierto y `clusterUsedSameVial === 'NO'`, **`clusterSameVialCount` es obligatorio** (`INVVACTX_00X_CLUSTER_SAME_VIAL_COUNT_REQUIRED`). Con `'YES'`, no.
>
> Se lee como un error del esquema y no lo es — está escrito literalmente en el comentario del DDL (`esaviapp.sql:1144`), y tiene sentido clínico: **cuando *no* todos los casos del conglomerado compartieron el vial, el dato que falta es cuántos sí lo hicieron**, porque ése es el subconjunto con exposición común. Cuando todos lo compartieron, el número ya está en `clusterAdditionalCaseCount`.
>
> El formulario tiene que decirlo en la etiqueta —«¿cuántos usaron el mismo vial?»— y no dejarlo a la interpretación. **Y el `0` satisface la obligación**: «ninguno de los otros casos usó el mismo vial» es una respuesta. La comprobación es contra `null`, nunca contra veracidad.

**El orden de los dos errores importa.** Un cuerpo con `isCluster: 'NO'` y `clusterUsedSameVial: 'NO'` recibe el 400 de la prohibición, no el del contador: el bloque cerrado gana, y el error devuelto es el del problema de fuera.

---

##### `investigationVaccineAdministered` — columna por columna

Las vacunas administradas ese día, más allá de la sospechosa. Lista con «Añadir», y **la tabla más estrecha del expediente**.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `vaccineAdministeredId` | No | PK generada. **El `:id` sí es propio** |
| `investigationId` | No | Del contexto. **Inmutable** |
| `sortOrder` | No | Disparador |
| `vaccineWhodrugId` | **Sí — obligatorio** | `<WhodrugTreePicker>` (§5.4b). `404` si no existe o está inactiva |
| `doseNumber` | Sí | Entero **0–32767**. El techo lo pone el `smallint`, no el `CHECK` |
| `notes` | Sí | Texto libre |

**Aquí no hay rama cruda, y es la diferencia con `notificationVaccine`.** `vaccineWhodrugId` es **obligatorio**: no hay `vaccineName` en texto libre, ni `whoCode`, ni `vaccineCode`. Esta tabla **sólo admite vacunas codificadas**.

> **Consecuencia dura, y hay que decirla en la pantalla:** con el maestro `vaccineWhodrug` vacío —o con una vacuna que el diccionario no lista— **esta lista no se puede rellenar en absoluto**. En `notificationVaccine` la vacuna sin codificar se notificaba por nombre (§5.4b); aquí no hay salida. Si el despliegue no ha importado el diccionario (`ESAVI-WHODRUG-007`, SUPERADMIN), la sección se muestra deshabilitada con su explicación, no como una lista vacía que no acepta nada.

**Cómo se exige `vaccineWhodrugId`, que cambia entre las dos operaciones:** en el `001` lo exige **el validador** —el cuerpo es el estado completo, la clave falta y el dato falta—; en el `004` el validador lo admite nulo y **lo rechaza el servicio** sobre el estado resultante, porque ahí «ausente» significa «no lo toques» y sólo el servicio sabe qué hay guardado. El 400 llega igual por las dos vías; lo que cambia es cuál de las dos capas puede distinguir una clave ausente de un `null` explícito.

**Unicidad del trío `(investigationId, vaccineWhodrugId, doseNumber)`** entre las filas **activas** → `409`. Dos detalles:

- **El `null` de `doseNumber` entra en la comparación.** Dos filas de la misma vacuna sin número de dosis **son la misma fila dos veces**. En pantalla: añadir la misma vacuna sin dosis dos veces da 409, y el mensaje tiene que explicar que lo que colisiona es la vacuna, no la dosis.
- **La guarda corre también en el `005B`**, la reactivación. Es la tercera puerta por la que un duplicado entra en la lista viva: una fila retirada puede haber visto su trío ocupado mientras estaba fuera. `005B` es **ADMIN** (§10.4), así que el USER no lo verá — pero el mensaje existe.

---

##### `investigationColdChain` — columna por columna

Almacenamiento y transporte. Dieciséis columnas, **diez de ellas respuestas**, y con una asimetría de tipos que el backend comprueba y no suaviza.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, la envía el cliente |
| `storageTemperatureMonitored` | Sí | **`boolean`** tri-estado. **Gobierna la siguiente, y sólo la siguiente** |
| `storageRangeDeviation` | Condicional | **`boolean`** tri-estado |
| `storageProcedureFollowed` | Sí | `answerOption`. **Fuera del bloque** |
| `storageOtherObjectPresent` | Sí | `answerOption`. Ídem |
| `storagePartiallyReconstitutedVaccine` | Sí | `answerOption`. Ídem |
| `storageVaccineNotUsable` | Sí | `answerOption`. Ídem |
| `storageDiluentNotUsable` | Sí | `answerOption`. Ídem |
| `storageKeyFindings` | Sí | Texto libre. Ídem |
| `transportUsedThermos` | Sí | `answerOption`. **Excluyente con `transportUsedColdPack`** |
| `transportSetInThermos` | Sí | `answerOption`. **No cuelga de nada** — ver abajo |
| `transportReturnedInThermos` | Sí | `answerOption`. Ídem |
| `transportUsedColdPack` | Sí | `answerOption`. **Excluyente con `transportUsedThermos`** |
| `transportTypeThermo` | Sí | ≤250. **Único `varchar(n)` de la tabla.** No cuelga de nada |
| `transportKeyFindings` | Sí | Texto libre |
| `notes` | Sí | Texto libre |

**Las dos primeras son `boolean` y las otras ocho `answerOption`, y no se traduce entre ellas.** Enviar `'YES'` a un booleano es 400, y enviar `true` a un `answerOption` también. Es la mezcla de tipos más traicionera del expediente —dieciséis columnas de aspecto uniforme, dos de otro tipo— y `<AnswerOptionField>` no sirve para las dos primeras: ahí va el interruptor tri-estado de §5.3.

##### El bloque de almacenamiento gobierna **una** columna, no seis

`storageTemperatureMonitored` abre **sólo** `storageRangeDeviation`. Las otras seis columnas de almacenamiento —el procedimiento, los cuatro hallazgos de la nevera y el texto libre— **no están en el bloque**: se observan sin termómetro y no las toca nadie.

Es el error de lectura más probable de esta tabla: el prefijo `storage` invita a agrupar las siete y condicionarlas todas. Sólo una depende del termómetro, porque **sin medición no hay desviación que derivar**.

Y la compuerta es un **`boolean`**, así que el «no» tiene **dos** formas —`false` («no se monitorizó») y `null` («no se sabe»)—, y las dos cierran igual. **Sólo `true` abre.**

> **Y aquí `false` es contenido.** Con el bloque abierto, `storageRangeDeviation: false` —«se monitorizó y no hubo desviación»— es **el hallazgo más frecuente del formulario**. Comprobar por veracidad lo tiraría y haría inexpresable el caso normal. Es el mismo error del `0` de los contadores, con otro tipo.

##### La exclusión del transporte: tres casos, y sólo uno es error

`transportUsedThermos` y `transportUsedColdPack` describen el mismo hecho —en qué contenedor viajó la vacuna— y no pueden resultar `'YES'` los dos. Pero el backend distingue tres situaciones y **sólo rechaza una**:

| Caso | Qué pasa | Respuesta |
|---|---|---|
| **Conflicto** — las dos claves **viajan** en el cuerpo y las dos son `'YES'` | El cliente afirma dos cosas incompatibles en la misma petición | **`400 INVCOLD_00X_TRANSPORT_CONTAINER_CONFLICT`** |
| **Relevo** — una viaja en `'YES'` y la otra **no viaja** pero está guardada en `'YES'` | **Gana la del cuerpo**; la almacenada se fuerza a `'NO'` | 200, en silencio |
| **Empate heredado** — ninguna viaja y las dos están guardadas en `'YES'` | **Gana el termo** por precedencia | 200, en silencio |

**El relevo no aplica la precedencia, y es deliberado.** Lo que el cliente acaba de afirmar pesa más que lo que había: si el termo ganara también aquí, un `PUT { transportUsedColdPack: 'YES' }` revertiría en silencio el cambio que el cliente acaba de pedir.

**El empate heredado se repara solo en vez de dar 400, y también es deliberado.** Un 400 dejaría esa fila **congelada**: ningún `PUT` podría tocarla nunca más, ni siquiera uno que sólo cambia `notes`. Sólo puede ocurrir sobre filas cargadas antes de este spec o escritas por SQL directo — la aplicación nunca lo produce.

**Para el formulario, todo esto se reduce a una regla y un aviso:** los dos campos se presentan como **excluyentes en pantalla** —marcar uno pone el otro en `'NO'`—, que es lo que impide el conflicto antes de que salga la petición. Y si al abrir la ficha llegan los dos en `'YES'` —una fila heredada—, se muestra el empate resuelto y se avisa de que el próximo guardado lo corrige.

##### Las tres columnas cuyo nombre miente

`transportSetInThermos`, `transportReturnedInThermos` y `transportTypeThermo` **no cuelgan de `transportUsedThermos`** pese a llamarse como se llaman. Describen el contenedor que se usó —**termo o paquete frío**— y no pertenecen a ningún bloque condicional. Ni el validador ni el servicio las atan a ninguna de las dos banderas.

Ocultarlas con el termo, que es lo que el nombre pide a gritos, **perdería los tres datos en todo caso de paquete frío**. Se muestran siempre, y sus etiquetas i18n **no dicen «termo»**: dicen «contenedor».

##### Las once `answerOption` del bloque: todas `unknown`

Dos en el contexto —`isCluster`, `clusterUsedSameVial`— y nueve en la cadena de frío. **Las once usan `unknown`**, y las dos alternativas se descartan con motivo:

**`full` no entra, aunque el transporte lo pedía.** La tentación es dar `NOT_APPLICABLE` a las cuatro columnas de transporte, para el caso de una vacunación intramuros donde el vial nunca sale de la nevera. Pero **ese dato ya está registrado**: `investigation.vaccinationSiteItemId` distingue «Intramuros - Puesto fijo» de las seis modalidades extramuros (§5.5.1). Ofrecer `NOT_APPLICABLE` sería pedir por segunda vez algo que el expediente ya sabe, y §6 enseña lo que pasa cuando un dato se declara dos veces.

**`noAnswer` tampoco.** Estas once no se le preguntan a un paciente: el investigador **observa** la nevera y **revisa** el registro de transporte. Cuando no consigue el dato, el resultado es «no se sabe», no «se preguntó y no contestó».

> **Y con esto `noAnswer` sigue sin un solo caso en veintisiete columnas.** Queda §5.5.5, con unas quince `answerOption`. Si tampoco aparece allí, la conclusión ya no es «todavía no ha salido» sino que **la variante sobra**: `<AnswerOptionField>` se escribe con dos, y el quinto valor del ENUM queda como algo que la base admite y este cliente no ofrece — que es exactamente lo que §7.1 dice que hay que dejar escrito en algún sitio.

---

##### Condiciones

| Condición | Regla |
|---|---|
| Orden de creación | Las tres cuelgan de `investigation`: primero la cabecera (§5.5.1) |
| Bloqueantes de guardado | `investigationId` en las tres. Además `vaccineWhodrugId` en cada vacuna administrada |
| Techo de los contadores | **32767** en los cuatro de contexto y en `doseNumber`. Sale del `smallint`, no del `CHECK`. Sin él, un 40000 es un `500` |
| El `0` y el `false` son contenido | `0` en los cinco contadores, `false` en `storageRangeDeviation`. Comprobar por veracidad destruye el caso normal |
| Compuerta del conglomerado | `isCluster === 'YES'` **estricto**. Cuatro columnas, **un solo código de error**, sin lado obligatorio |
| Vial compartido | **Es el `'NO'` el que exige `clusterSameVialCount`**, no el `'YES'`. El `0` satisface. La etiqueta lo dice |
| Prioridad de errores | Bloque cerrado gana sobre regla del vial: el 400 devuelto es el de fuera |
| Dos columnas, un catálogo | `momentItemId` y `multidoseItemId` sobre `vaccinationMoment`, con **dos códigos de error distintos** |
| Vacuna administrada | **Sólo codificada.** Sin maestro importado, la sección se deshabilita con su explicación — no hay rama cruda |
| Duplicado de vacuna | Trío `(investigación, vacuna, dosis)` entre las activas, **con el `null` de la dosis incluido** |
| Tipos de la cadena de frío | Las dos primeras `boolean`, las otras ocho `answerOption`. **No se traduce entre ellas** |
| Bloque de almacenamiento | Gobierna **sólo** `storageRangeDeviation`. Las otras seis `storage*` no cuelgan de nada |
| Exclusión del transporte | Excluyentes en pantalla. Conflicto → 400; relevo y empate heredado los resuelve el servidor |
| Los tres nombres que mienten | `transportSetInThermos`, `transportReturnedInThermos` y `transportTypeThermo` **no** cuelgan del termo. Etiqueta: «contenedor» |
| Variantes de `answerOption` | **Las once usan `unknown`.** `full` se descarta porque el sitio de vacunación ya distingue intramuros de extramuros (§7.1) |

#### 5.5.5 El error y la comunidad · **cerrado**

**Tablas:** `investigationAdministrationError` (27, 1:1), `investigationCommunity` (11, 1:1)
**Endpoints:** `ESAVI-INVADMER-001/-002A/-002B/-003/-004/-005C/-006`, `ESAVI-INVCOMM-001/-002A/-002B/-003/-004/-005C/-006`

Si hubo error en la administración, y si el evento se repitió en el entorno. **Cierra el paso 5.**

---

##### `investigationAdministrationError` — columna por columna

**Veintiséis columnas de datos: la tabla más ancha del expediente.** Cuatro bloques, y sólo el primero tiene compuerta.

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, la envía el cliente |
| `usedAutoDisableSyringes` | Sí | `answerOption`. **Sólo el `'NO'` abre el bloque** — ver abajo |
| `usedGlassSyringes` | Condicional | **`boolean`** tri-estado |
| `usedDisposableSyringes` | Condicional | **`boolean`** tri-estado |
| `usedRecycledDisposableSyringes` | Condicional | **`boolean`** tri-estado |
| `usedOtherSyringes` | Condicional | **`boolean`** tri-estado. **Y gobierna la siguiente** |
| `otherSyringesDescription` | Condicional | Texto libre. **Nunca obligatoria** |
| `syringesKeyFindings` | Sí | Texto libre. **Fuera del bloque** |
| `reconstitutionUsedSameSyringe` | Sí | `answerOption` |
| `reconstitutionUsedSameSyringeDifferentVaccine` | Sí | `answerOption` |
| `reconstitutionUsedDifferentSyringeSameVial` | Sí | `answerOption` |
| `reconstitutionUsedDifferentSyringeDifferentVaccine` | Sí | `answerOption` |
| `reconstitutionFollowedManufacturerRecommendation` | Sí | `answerOption` |
| `reconstitutionKeyFindings` | Sí | Texto libre |
| `hadPrescriptionError` + `prescriptionErrorNotes` | Sí | `answerOption` + texto. **Independientes** |
| `hadContaminatedVaccine` + `contaminatedVaccineNotes` | Sí | Ídem |
| `hadAbnormalVaccineConditions` + `abnormalConditionsNotes` | Sí | Ídem |
| `hadPreparationError` + `preparationErrorNotes` | Sí | Ídem |
| `hadHandlingError` + `handlingErrorNotes` | Sí | Ídem |
| `hadImproperAdministration` + `improperAdministrationNotes` | Sí | Ídem |
| `notes` | Sí | Texto libre |

**Ninguno de los diez textos tiene longitud máxima**, y es la diferencia con la cadena de frío, que tenía uno. Los diez son `text` en el DDL sin techo declarado, e inventarle uno al formulario crearía un 400 que la base no respalda.

**Cuatro `boolean` entre doce `answerOption`**, con la misma mezcla de §5.5.4 y la misma regla: no se traduce entre ellos. `'YES'` a un booleano es 400, `true` a un `answerOption` también.

##### La compuerta que se abre con el «no» — la única del expediente

`usedAutoDisableSyringes` es un `answerOption`, y **sólo `'NO'` abre el bloque**. `YES`, `UNKNOWN`, `NOT_APPLICABLE`, `NO_ANSWER` y el `null` lo cierran, los cinco por igual.

Clínicamente es directo: **si se usaron jeringas autodestructibles no hay nada más que preguntar**, y si no se sabe o no aplica, no hay tipo que declarar. El bloque existe para capturar *qué se usó en su lugar*.

> **Es la inversión que el propio backend declara como riesgo, y aquí es donde se paga.** Las otras cuatro compuertas de la investigación —§5.5.3 dos veces, §5.5.4 dos veces— abren con la **afirmación**. Escribir `=== 'YES'` aquí por inercia deja pasar todos los casos menos uno: el que envía `'YES'` con un tipo de jeringa declarado. Es decir, **funciona en las pruebas y falla en el dato que importa**.

Y con el bloque abierto hay una regla que no tiene ninguna otra compuerta del documento:

**Regla de mínimo — al menos uno de los cuatro tipos tiene que resultar `true`** → `400 INVADMER_00X_SYRINGE_TYPE_REQUIRED`. Es la primera regla de mínimo del repositorio, y el motivo es que un bloque abierto y vacío no registra nada: dice que no se usaron autodestructibles y calla sobre lo que sí se usó, que es exactamente el dato que el bloque existe para capturar.

**El `false` no cuenta como declaración.** Los cuatro en `false` dan el mismo 400 que los cuatro ausentes. Y la regla se evalúa sobre el **estado resultante**, así que un `PUT { notes: 'x' }` sobre una fila ya poblada no falla.

##### La salida del bloque, que hay que implementar bien o la fila se queda encerrada

Con el bloque cerrado los cinco campos están prohibidos, con una asimetría **más fina** que la de §5.5.3 y §5.5.4:

| Valor enviado | En el `001` | En el `004` |
|---|---|---|
| `true`, o texto no vacío | **400** | **400** |
| **`false`** | **400** | **Legal** |
| `null`, o ausente | Legal | Legal — se fuerza a `null` sin error |

**Ese `false` legal en el `004` es la puerta de salida, y es deliberado.** Para cerrar un bloque cuyo último tipo en `true` se está apagando, hay que enviar ese `false` **junto con la bandera, en la misma petición**. Si el `004` lo rechazara, la fila no tendría forma legal de salir sin dos viajes de ida y vuelta.

**Para el formulario:** al cambiar `usedAutoDisableSyringes` de `'NO'` a cualquier otro valor, se envía **en el mismo `PUT`** la bandera nueva y los cuatro tipos a `false` o a `null`. No dos peticiones.

##### `otherSyringesDescription` es el único «otro» que no se exige — y no lo exigimos

`usedOtherSyringes: true` **sin descripción es válido** en el `001` y en el `004`. El bloque anidado **abre** la columna, no la reclama. Con `false` o `null`, la descripción está prohibida.

**Decidido: el cliente tampoco la exige.** Rompe el patrón de los otros cinco «otro» del expediente —`otherDescription` del evento (§5.4b), de la fuente y de la evaluación clínica (§5.5.2, §5.5.3), `otherMedicationText` (§5.4b) y `otherSourceDescription` (§5.4)—, todos obligatorios, y aun así se respeta el servidor.

El motivo: **este documento sólo endurece al backend cuando su omisión produce un dato contradictorio**, como en `pregnancyComplicationsDescription` (§5.4), donde una descripción bajo un «no» sería una contradicción que nadie detectaría. Aquí no la hay — «se usó otro tipo de jeringa» ya es información completa aunque no se detalle cuál, y el detalle puede llegar después. Ser más estricto que la API sin ese motivo es inventar una fricción que no defiende nada.

##### Los tres bloques sin compuerta, que son la mayoría de la tabla

**Veintiuna de las veintiséis columnas no cuelgan de nada.** Ni el validador ni el servicio las atan:

- **`syringesKeyFindings`** está fuera del bloque de jeringas pese al prefijo. Tercer nombre engañoso del paso 5, después de los `storage*` y los `*InThermos` (§5.5.4).
- **Las cinco de reconstitución no son excluyentes entre sí.** Las cinco pueden resultar `'YES'` a la vez, y es correcto: describen prácticas distintas observadas en la misma jornada, no opciones de una lista.
- **Las seis parejas `had*` / `*Notes` son doce columnas independientes.** Nada ata una nota a su respuesta, y **un `'NO'` con el motivo escrito es un registro válido** — el mismo criterio de §5.5.3 con las observaciones de antecedentes: la nota comenta la respuesta, no la contiene.

**Es el reflejo más caro de este bloque.** Agrupar por prefijo y condicionar por parejas ocultaría veintiuna columnas que deben verse siempre.

---

##### `investigationCommunity` — columna por columna

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `investigationId` | No visible | PK = FK, la envía el cliente |
| `patientLatitude` | Sí | `numeric(10,7)`, **7 decimales y rango ±90** — el único del expediente con rango |
| `patientLongitude` | Sí | Ídem, **±180** |
| `hadSimilarEvent` | Sí | `answerOption`. **Sólo `'YES'` abre el bloque** |
| `similarEventDescription` | Condicional | **Obligatoria con el bloque abierto** |
| `similarEventCount` | Condicional | Entero **0–32767**. Opcional |
| `affectedVaccinated` | Condicional | Ídem |
| `affectedUnvaccinated` | Condicional | Ídem |
| `affectedUnknown` | Condicional | Ídem |
| `otherComments` | Sí | Texto libre, sin longitud |
| `notes` | Sí | Texto libre, sin longitud |

**El bloque vuelve a la polaridad normal:** `hadSimilarEvent === 'YES'` estricto, y las otras cinco formas lo cierran. Después de la inversión de las jeringas, conviene decirlo — las dos compuertas están en la misma sesión y se leen seguidas.

**Y aquí sí hay lado obligatorio, a diferencia del conglomerado de §5.5.4:** con el bloque abierto, `similarEventDescription` es **obligatoria** (`INVCOMM_00X_SIMILAR_EVENT_DESCRIPTION_REQUIRED`); los cuatro contadores siguen opcionales, porque el desglose puede no existir cuando se abre la investigación.

**El orden de los dos errores está fijado y hay que conocerlo:** primero la prohibición, después la obligación. Un cuerpo con `hadSimilarEvent: 'NO'` y una descripción recibe `SIMILAR_EVENT_FIELDS_NOT_ALLOWED` y **nunca** `..._DESCRIPTION_REQUIRED` — con el bloque cerrado la obligación ni se evalúa.

> **Y de ahí sale la única forma de vaciar la descripción.** Un `PUT { similarEventDescription: null }` sobre una fila con el bloque abierto da **400**: la obligación sigue en pie. Para borrarla hay que **cerrar la bandera en la misma petición**; entonces la obligación no aplica y los cinco campos se fuerzan a `null` sin error. El formulario lo hace solo al apagar la compuerta (§7.3), pero quien depure un 400 aquí tiene que saber por qué.

##### Los cuatro contadores no se cruzan en el servidor, y el formulario avisa

`affectedVaccinated + affectedUnvaccinated + affectedUnknown` **no** tiene que sumar `similarEventCount`. El backend no lo comprueba y los cuatro son independientes.

**Decidido: con los cuatro informados y la suma distinta, se muestra la diferencia y se deja guardar.** No se bloquea y no se calcula el total.

Los dos motivos: el desglose **puede llegar incompleto** —el informante sabe que hubo doce casos y sólo ha podido clasificar a nueve—, y derivar `similarEventCount` de los otros tres lo haría **imposible de registrar**. Bloquear obligaría a inventar un número, que es peor que un total que no cuadra y se ve.

##### Las coordenadas del domicilio, con mapa

**Únicas coordenadas del expediente con rango validado en el servidor** (±90, ±180). El backend lo declara como desviación deliberada: `numeric(10,7)` admite hasta `999.9999999`, así que una latitud de 500 entraría sin queja de Postgres y se guardaría como un domicilio imposible.

> **Y `investigation.vaccinationLatitude`/`Longitude` (§5.5.1) no tiene ese rango**: sólo comprueba los siete decimales. **Decidido: lo valida el cliente y no se pide al backend.** Una coordenada imposible es un error de captura, no una vía de ataque, y §10 ya lleva seis peticiones abiertas. Se anota la asimetría y se aplica el rango en las dos entidades desde el formulario.

**Se captura con un mapa** — `<MapPointPicker>`, componente nuevo:

| Decisión | Qué |
|---|---|
| Base | **Leaflet** (~40 KB) con teselas raster de **OpenStreetMap**. Sin clave de API y sin coste |
| Teselas configurables | La URL va en **`VITE_MAP_TILE_URL`**, con OSM por defecto. Un despliegue en red cerrada apunta a su propio servidor **sin tocar código** — es la misma forma de §10.1 con el código de país |
| Atribución | **Obligatoria y visible**, es condición de uso de OSM. No se oculta ni se reduce a un icono |
| Alcance | **Sólo `investigationCommunity`.** `investigation` se queda con dos campos numéricos y validación de rango; `<GeoLocationPicker>` y `healthFacility` no lo usan |
| Precarga | El marcador **entra precargado** con las coordenadas del `geoLocation` de residencia del paciente (§5.1) y se arrastra para afinar |

> **La precarga tiene un riesgo asumido y el formulario lo compensa.** El `geoLocation` de residencia es una división administrativa: sus coordenadas son un centroide, no una casa. Si nadie mueve el marcador, se guarda el centro de un cantón como domicilio del paciente. **Mientras el marcador no se haya movido se muestra distinto y con su aviso** —«posición aproximada, tomada de la residencia registrada»—, y el aviso desaparece en cuanto se arrastra. Es señal de pantalla, no una columna: no hay dónde guardar «esto es aproximado».

---

##### Las trece `answerOption` del bloque, y el veredicto sobre `noAnswer`

Doce en el error de administración —la bandera de jeringas, las cinco de reconstitución y las seis `had*`— y una en la comunidad. **Las trece usan `unknown`.**

**Y con esto se cierra el reparto del expediente: `noAnswer` no aparece ni una vez en cuarenta columnas.**

Ya no es «todavía no ha salido». El motivo quedó visible en §5.5.4 y aquí se confirma: **estas preguntas no se le hacen a nadie**. El investigador observa la nevera, revisa el registro de transporte, examina las jeringas del puesto, lee la historia clínica. Cuando no consigue el dato, el resultado es «no se sabe» — no «se preguntó y no contestó». `NO_ANSWER` describe una entrevista, y la investigación de un ESAVI casi no tiene entrevistas con respuesta registrable como tal.

**Decidido, y va a §7.1: `<AnswerOptionField>` se escribe con dos variantes, `unknown` y `full`.** `NO_ANSWER` queda como un valor que la base admite, que el campo **renderiza si lo encuentra al leer** —la regla de §7.1 sobre valores fuera de la combinación— y que este cliente no ofrece nunca.

---

##### Condiciones

| Condición | Regla |
|---|---|
| Orden de creación | Las dos cuelgan de `investigation`: primero la cabecera (§5.5.1) |
| Bloqueantes de guardado | Sólo `investigationId`. **Ninguna columna de datos es obligatoria** al crear |
| Compuerta de jeringas | **Sólo `'NO'` abre.** Única inversión del expediente: escribir `=== 'YES'` funciona en todo menos en el caso que importa |
| Mínimo de jeringas | Con el bloque abierto, **al menos un tipo en `true`**. El `false` no cuenta como declaración |
| Salir del bloque | El `false` es legal en el `004` y 400 en el `001`. Se envían bandera y tipos **en el mismo `PUT`** |
| `otherSyringesDescription` | **Nunca obligatoria**, ni en el servidor ni en el cliente. Único «otro» del expediente que no se exige |
| Sin compuerta | `syringesKeyFindings`, las cinco de reconstitución y las doce de las seis parejas: **veintiuna columnas siempre visibles** |
| Reconstitución | Las cinco pueden ser `'YES'` a la vez. No son excluyentes |
| Parejas `had*` / `*Notes` | Independientes. **Un `'NO'` con el motivo escrito es válido** |
| Compuerta de evento similar | `'YES'` estricto, polaridad normal. Con el bloque abierto, `similarEventDescription` **obligatoria** |
| Prioridad de errores | Prohibición antes que obligación. Vaciar la descripción exige **cerrar la bandera en la misma petición** |
| Contadores | No se cruzan en el servidor. El formulario **avisa si no suman y no bloquea**; `similarEventCount` no se deriva |
| Coordenadas | Rango ±90/±180. En `investigationCommunity` lo valida el servidor; en `investigation` **sólo el cliente** |
| Mapa | `<MapPointPicker>`: Leaflet + OSM, teselas en `VITE_MAP_TILE_URL`, atribución visible. **Sólo aquí** |
| Precarga del marcador | Desde el `geoLocation` de residencia, **marcado como aproximado** hasta que se arrastre |
| Variantes de `answerOption` | Las trece usan `unknown`. **`noAnswer` no se implementa** (§7.1) |


### 5.6 Paso 6 — Clasificación final y cierre · **cerrado**

**Tabla:** `finalClassification` (14 columnas, 1:1 con el caso) · **Endpoints:** `ESAVI-FINCLASS-001/-002A/-002B/-003/-004/-005A/-005B/-005C/-006`, y `ESAVI-CASEFLOW-008` para cerrar

La tabla más corta de §5 y el paso que más arrastra: aquí se emite el veredicto de causalidad y se cierra el expediente.

#### El paso 6 no siempre existe

`ESAVI-CASEFLOW-008` sólo exige la clasificación final **si `classification.isSeriousEvent === true` o `notification.requestInvestigation === true`** (§4.4). Un caso **no grave y sin investigación se cierra sin pasar por aquí**.

El stepper lo refleja: el paso 6 aparece o no según esas dos banderas, igual que el paso 5 aparece según `requestInvestigation`. Y las dos se leen de filas que el usuario ya escribió — no se pregunta nada nuevo para decidirlo.

> **La gravedad se lee de `classification.isSeriousEvent`, no de `notification.notificationType`**, y `NULL` cuenta como no grave (§4.4). Es la sexta y última vez que §6.1 decide algo, y el backend está del mismo lado.

---

#### `finalClassification` — columna por columna

| Columna | ¿Se pide? | Regla verificada |
|---|---|---|
| `finalClassificationId` | No | PK generada |
| `caseId` | No | Del contexto. **Inmutable en el `004`** |
| `importanceAItemId` | Sí | `<CatalogSelect typeCode="finalClassificationImportance">`, **3 ítems** sembrados |
| `importanceBItemId` | Sí | Ídem |
| `importanceCItemId` | Sí | Ídem |
| `aIsRelatedToVaccineProduct` | Sí | `boolean` tri-estado |
| `aIsRelatedToQualityDeviation` | Sí | Ídem |
| `aIsRelatedToProgrammaticError` | Sí | Ídem |
| `aIsRelatedToStress` | Sí | Ídem |
| `bIsConsistentTemporalRelation` | Sí | Ídem |
| `bHasDeterminantFactor` | Sí | Ídem |
| `cHasCoincidentCause` | Sí | Ídem |
| `dIsUnclassifiable` | Sí | Ídem. **Cierra las diez columnas anteriores** |
| `notes` | Sí | Texto libre, **sin longitud máxima** |

**Es el algoritmo de causalidad de la OMS, en cuatro bloques**, y las once columnas de arriba no son once preguntas sueltas:

| Bloque | Columnas | Qué afirma |
|---|---|---|
| **A** | `aIsRelatedTo` × 4 | Relacionado con la vacunación: producto, desviación de calidad, error programático o estrés |
| **B** | `bIsConsistentTemporalRelation`, `bHasDeterminantFactor` | Indeterminado: hay relación temporal pero la evidencia no basta |
| **C** | `cHasCoincidentCause` | Coincidente: otra causa lo explica |
| **D** | `dIsUnclassifiable` | **No clasificable**: no hay información suficiente para evaluar nada |

**Los ocho booleanos son tri-estado, y aquí la distinción es la que más pesa de todo el expediente.** `aIsRelatedToStress: false` afirma que el bloque A **se evaluó y se descartó**; `null` afirma que no se evaluó. En un veredicto de causalidad no son lo mismo, y el que se publica es el primero.

**Los tres `importance*` no son tres campos independientes.** El clasificador no marca tres cosas: **ordena los bloques A, B y C por fuerza de la evidencia**, y cada `catalogItem` es una posición —`1`, `2`, `3`, con `value` `MAX`, `MED` y `MIN`—. En pantalla es un orden, no tres desplegables sueltos.

##### La regla de precedencia: no se repite posición

**Los tres `importance*` no pueden llevar el mismo `catalogItemId`** → `400 FINCLASS_00X_IMPORTANCE_DUPLICATED`.

Sólo entran en la comparación los que tienen valor: **`A=1, B=2, C=null` es válido**, y una fila con los tres en `null` también. La comparación es **por `catalogItemId`**, no por `code` ni por `value` — la regla es «no repitas posición», no «no repitas número».

> **Es la primera regla de unicidad del repositorio entre columnas de la misma fila**, y ningún `UNIQUE` de Postgres puede expresarla. Vive en el servicio, así que el formulario la replica: al elegir una posición ya tomada, se libera del otro selector en vez de dejar que el `PUT` falle.

##### El bloque D cierra los otros tres, y la lista tiene diez columnas, no once

Con `dIsUnclassifiable === true`, las **diez** columnas restantes están prohibidas → `400 FINCLASS_00X_UNCLASSIFIABLE_FIELDS_NOT_ALLOWED`.

**Diez y no once: la propia bandera no está en la lista.** Meterla haría que marcarla se prohibiera a sí misma y **el bloque D quedaría inalcanzable**. Es el tipo de detalle que sólo se ve leyendo el servicio, y el comentario del backend lo dice con esas palabras.

**Y el `false` ofende igual que el `true`.** La comprobación es `!== undefined && !== null`: un `aIsRelatedToStress: false` bajo el bloque D afirma que A se evaluó y se descartó, cuando D afirma que **no se pudo evaluar nada**. Son contradictorios, y por eso los dos valores están vedados. Enviarlos como `null` explícito no es error — es el mismo destino al que llega el forzado del `004`.

**El orden de los dos errores está fijado:** primero la prohibición de D, después la precedencia. Un cuerpo con `dIsUnclassifiable: true` y dos importancias repetidas recibe `UNCLASSIFIABLE_FIELDS_NOT_ALLOWED` y **nunca** `IMPORTANCE_DUPLICATED`. El error devuelto es el del problema de fuera, como en §5.5.4 y §5.5.5.

En pantalla, D es una compuerta que **oculta y limpia los otros tres bloques** (§7.3) — y aquí el servidor respalda la limpieza, no la castiga.

##### Una por caso, y el `UNIQUE` no mira `deletedAt`

`UQ_finalClassification_case` **no filtra por `isActive`**: un caso cuya clasificación final fue desactivada **sigue ocupado**, y el segundo `POST` responde `409 FINCLASS_001_CASE_ALREADY_FINAL_CLASSIFIED`.

Es la tercera aparición de la misma forma —`notificationPregnancy` (§5.4b), `investigation` (§5.5.1)— y arrastra la misma regla: **se limpia con `PUT`, no se borra**. Con una diferencia a favor: aquí `005A` es **ADMIN** y `005B` **SUPERADMIN**, así que un USER no tiene ni la puerta de salida ni la de vuelta.

##### El `001` mueve el workflow él solo

**Crear la clasificación final avanza la fase**, en la misma transacción: el servicio llama a `advanceCaseWorkflowStageService` (`ESAVI-CASEFLOW-012`), que sella `finalClassificationStartedAt`, cierra la etapa de investigación si quedaba abierta y mueve el expediente a `IN_FINAL_CLASSIFICATION`.

**El cliente no llama al `012` por su cuenta en este paso.** Es la única fase del asistente donde el avance viene incluido, y llamarlo aparte produciría un segundo sello sobre una fase ya sellada.

Y si el workflow no puede avanzar, **no hay clasificación final**: la transacción revierte las dos escrituras. Es correcto y conviene saberlo — un `409` del `012` llega con código de `CASEFLOW`, no de `FINCLASS`, y el formulario tiene que mapear los dos.

---

#### El cierre: lo que el paso 6 sí bloquea

`PATCH /api/case-workflows/case/:id/close` (`ESAVI-CASEFLOW-008`). Las cuatro precondiciones, sus seis `409` y el sellado de la última fase abierta están en **§4.4** y no se repiten aquí.

Lo que sí es de este paso: **las incoherencias que los pasos anteriores dejaron pasar a propósito**. El documento las fue difiriendo con la promesa de que el cierre las recogía; ésta es la lista, y es la deuda saldada.

| Incoherencia | Dónde se dejó pasar | Qué hace el paso 6 |
|---|---|---|
| Autopsia registrada bajo un desenlace que no es muerte | §6.6 — el paciente puede morir después de notificar | **Bloquea.** A esta altura ya no queda nada por saberse: o se corrige el desenlace, o se retira la autopsia |
| `takesMedication` distinto de `'YES'` con medicación cargada | §5.4b — no se borran filas al cambiar una respuesta | **Avisa y no bloquea.** El dato clínico es correcto; lo que está mal es la respuesta, y corregirla es un clic |
| Los tres `affected*` no suman `similarEventCount` | §5.5.5 — el desglose puede llegar incompleto | **Avisa y no bloquea.** Puede seguir siendo incompleto el día del cierre |
| Gravedad inicial cambiada con la notificación ya creada | §6.1 — la rama no se puede rehacer sin SUPERADMIN | **Bloquea.** Un caso grave con ficha de no grave no se archiva |
| Complicaciones del embarazo declaradas en tres sitios | §6.5 — las filas mandan y los dos `answerOption` se derivan | **Nada.** La derivación ya lo impide en el formulario |

**El criterio que separa las dos columnas, y es una regla y no una lista:** se **bloquea** lo que ya no puede resolverse por sí solo —una contradicción entre dos hechos registrados— y se **avisa** de lo que sigue siendo un dato legítimamente incompleto. Bloquear lo segundo obligaría a inventar información para poder archivar, que es la peor forma de cerrar un expediente de vigilancia.

> **Y ninguna de estas cinco la comprueba el backend.** `ESAVI-CASEFLOW-008` verifica que las filas **existan**, no que sean coherentes entre sí. Las cinco viven enteras en el cliente, igual que la regla de §4.5 sobre `CLOSED` — con la diferencia de que aquéllas ya están pedidas (§10.3) y éstas no: son criterio de este proceso, no del modelo, y pedirlas al backend sería pedirle que adopte nuestras decisiones de interfaz.

**La pantalla de cierre las lista todas antes de dejar pulsar**, con las bloqueantes separadas de las avisadas y cada una con su enlace al paso que la corrige. Un botón apagado sin explicación es la peor versión de esta regla (§4.2).

---

#### Condiciones

| Condición | Regla |
|---|---|
| Existe el paso 6 | Sólo si `classification.isSeriousEvent === true` **o** `notification.requestInvestigation === true` (§4.4). `NULL` cuenta como no grave |
| Bloqueante de guardado | Sólo `caseId`. **`POST { caseId }` es un alta válida** y devuelve 201 con las doce columnas de datos en `null` |
| Una por caso | `409 FINCLASS_001_CASE_ALREADY_FINAL_CLASSIFIED`, y el `UNIQUE` **no filtra por `isActive`** |
| Ciclo de vida | Se limpia con `PUT`, no se borra. `005A` es ADMIN y `005B` SUPERADMIN |
| Avance de fase | **Lo hace el `001`**, en su transacción. El cliente **no** llama al `012` aquí, y mapea también los `CASEFLOW_012_*` |
| Precedencia | Los tres `importance*` no repiten `catalogItemId`. Los `null` no compiten. Se compara por id, no por `code` ni `value` |
| Bloque D | `dIsUnclassifiable === true` prohíbe **diez** columnas — la bandera no se prohíbe a sí misma. **El `false` ofende igual que el `true`** |
| Prioridad de errores | Prohibición de D antes que precedencia |
| Tri-estado | Los ocho booleanos: `false` es «se evaluó y se descartó», `null` es «no se evaluó». En un veredicto de causalidad no es lo mismo |
| Cierre | §4.4 para las precondiciones. **Las cinco incoherencias diferidas se resuelven aquí**, y ninguna la comprueba el backend |
| Bloquear o avisar | Se bloquea la contradicción entre dos hechos registrados; se avisa del dato legítimamente incompleto |

---

## 6. Contradicciones conocidas del modelo

Ninguna es un error del cliente. Las seis existen en el esquema y el cliente tiene que decidir qué hace con ellas.

### 6.1 La gravedad se declara dos veces

`classification.isSeriousEvent` (paso 3) y `notification.notificationType` `ENUM('SEVERE','NON_SEVERE') NOT NULL` (paso 4). **El esquema no obliga a que coincidan.** El SPEC F44 lo dejó anotado sin resolver, pendiente de una corrección sobre F09 y F10.

**Regla de este cliente: la clasificación manda**, alineado con lo que ya hace el cierre (§4.4). En el paso 4, `notificationType` llega **derivado y bloqueado**. Dos campos editables producen casos graves con ficha de no grave.

**Y no hay marcha atrás, verificado en §5.4.** Una vez creada la notificación, cambiar la gravedad es imposible para un USER:

| Pieza | Por qué bloquea |
|---|---|
| `notification.notificationType` | **Inmutable en `ESAVI-NOTIFCN-004`**: el servicio lo ignora llegue o no |
| `severeNotification` / `nonSevereNotification` | **No tienen `005A` ni `005B`.** Sólo `005C`, purga física, rol **SUPERADMIN** |

Mientras tanto, `ESAVI-CLASSIF-004` **sí** deja cambiar los criterios de gravedad del paso 3 en cualquier momento. O sea: se puede volver atrás y convertir el caso en grave, y la notificación se queda diciendo `NON_SEVERE` para siempre, con la ficha equivocada colgando.

**Regla que se impone entonces:** en cuanto `stages.notification.exists === true`, la **compuerta de gravedad del paso 3 pasa a sólo lectura**. Lo que quede por corregir después necesita a un SUPERADMIN que purgue la rama, y eso se dice en la pantalla en vez de dejar que el usuario descubra el callejón. El resto de la clasificación —`firstConsultationDate`, `notes`, la edad derivada— sigue editable: sólo se congela lo que la notificación ya no puede seguir.

### 6.2 `exists` no significa «utilizable»

`stages.<fase>.exists` de `ESAVI-CASEFLOW-006` cuenta también las filas **desactivadas** —responde *«¿colisionaría un `POST`?»*—, mientras que el cierre mira sólo filas **activas** —*«¿se hizo este paso?»*—.

Un caso al que un ADMIN desactivó la clasificación llega al wizard con `exists: true` y aun así no puede cerrarse. Ahí el wizard **no debe hacer `POST` ni `PUT`**: debe ofrecer **reactivar** (el `005B` de esa entidad). Sin esto es un `409` que nadie sabe explicar.

Anomalías equivalentes que `006` deja visibles a propósito, en lugar de esconderlas en un booleano: un `startedAt` con `id: null`, y un `id` sin `startedAt`.

### 6.3 Un caso cerrado sigue aceptando escrituras

Los cuatro `PUT` de fase y el de `esaviCase` no consultan el `caseWorkflow`. La regla de §4.5 vive entera en el cliente y el backend no la respalda. Documentado aquí para que quien lo descubra no crea que es un bug del frontend, y para que quien evalúe el backend sepa dónde tendría que bajar la comprobación.

### 6.4 El esquema no impone el orden de las fases

`012` sella la fase anterior y mueve el estado, pero **no rechaza** una investigación sin notificación. El orden lo sostiene el cliente y, al final, las precondiciones de cierre. Es una regla de proceso sin respaldo en el esquema, y el SPEC F44 §3.5 lo dice explícitamente para quien la evalúe más adelante.

### 6.5 Las complicaciones del embarazo se declaran tres veces

Tres sitios distintos del paso 4 dicen si hubo complicaciones, y **el esquema no obliga a que coincidan**:

| Dónde | Qué es |
|---|---|
| `severeNotification.hasPregnancyComplications` + `pregnancyComplicationsDescription` | Un `answerOption` y un texto, **sólo en la rama grave** |
| `notificationPregnancy.hasComplications` | Un `answerOption`, en las dos ramas |
| Filas de `notificationPregnancyComplication` | Los hechos: término clínico y tipo, **contables** |

Nada impide un `hasComplications: 'NO'` con tres complicaciones cargadas, ni al revés.

**Regla de este cliente: las filas mandan, y los dos `answerOption` se derivan de ellas.** Con al menos una complicación activa, los dos se ponen a `YES` y se muestran bloqueados con su explicación; sin ninguna, quedan editables — «no hubo» y «no se sabe» son respuestas distintas y ninguna fila las expresa. La descripción de la rama grave sigue siendo texto libre y no se deriva: es el resumen, no el recuento.

Es la misma decisión que §6.1 —un dato con dos declaraciones editables produce fichas contradictorias—, aplicada donde una de las dos es un hecho contable y la otra una respuesta.

### 6.6 La muerte se declara dos veces, y no siempre es una contradicción

`notification.deathDate` (paso 4, §5.4) e `investigationAutopsy.deathDate` (paso 5, §5.5.2) son la misma fecha en dos tablas. **El backend no comprueba que coincidan**, y va más lejos: `ESAVI-INVAUT-001` **no mira la notificación en absoluto**. Se puede crear una fila de autopsia sobre un caso cuyo desenlace es «Recuperado», o sobre uno que ni siquiera declaró desenlace.

Y hay una asimetría que lo hace peor: en el paso 4, la fecha de fallecimiento está **prohibida** bajo un desenlace que no es muerte, con `400` (§5.4). En el paso 5, nadie lo comprueba. El mismo dato, blindado en un paso y suelto en el siguiente.

**Y ésta es la única de las seis contradicciones que NO se resuelve con «manda lo declarado antes».** Las otras cinco son un mismo dato escrito dos veces por descuido del esquema; ésta no. **El paciente puede morir después de notificar**, y ése es justamente el caso que la vigilancia no puede permitirse perder. Una notificación con desenlace «Recuperando» seguida de una muerte a los diez días no es una incoherencia: es la historia real del caso.

**Regla de este cliente:**

| Pieza | Regla |
|---|---|
| Visibilidad del bloque de autopsia | **Siempre disponible en el paso 5**, con cualquier desenlace del paso 4 — y también sin desenlace declarado |
| `isDeath` | Se envía fijo `true` y **no se ofrece**: una fila de autopsia sólo existe sobre una muerte, y crearla ya lo afirma |
| `deathDate` | **Precargada** desde `notification.deathDate` **si la hay**; si no, vacía. Editable siempre |
| Al crear la autopsia con un desenlace que no es muerte | **Se avisa y se ofrece corregir el paso 4.** El aviso dice qué desenlace tiene el caso hoy |
| Al editar `deathDate` y diferir de la del paso 4 | Ídem: se avisa y se ofrece corregir |

**El aviso no bloquea, y ésa es la diferencia con §7.3.** Ocultar es integridad cuando el campo *no puede* aplicar a este paciente; aquí sí puede — sólo que todavía no consta. Impedir el registro obligaría a corregir el paso 4 antes de poder anotar la muerte, que es exactamente el orden inverso al del trabajo real: primero se sabe que el paciente murió, después se actualiza el expediente.

**Por qué no se propaga sola, que es la parte que se olvida.** Escribir el paso 4 desde el paso 5 significa un `PUT` a `ESAVI-NOTIFCN-004` que el usuario no pidió y que puede fallar por su cuenta — y si falla, la pantalla ha dicho que guardó y una de las dos tablas se quedó atrás. Avisar y dejar decidir cuesta un clic; deshacer una propagación a medias cuesta un administrador.

> **Y hay un obstáculo real en esa corrección, que el aviso tiene que anticipar.** Cambiar el desenlace del paso 4 a «Fallecido» obliga además a rellenar `deathDate` y `autopsyRequested`, que bajo cualquier otro desenlace estaban **prohibidos** con `400` (§5.4). No es un cambio de un campo: es reabrir el paso 4 y completar su sección de fallecimiento. El aviso lleva al paso 4 con esos campos ya señalados, no deja al usuario buscándolos.

**El paso 6 es quien cierra esto.** Una autopsia registrada bajo un desenlace que no es muerte es una de las incoherencias que la clasificación final revisa antes de cerrar (§4.4) — ahí sí bloquea, porque a esas alturas ya no hay nada pendiente de saberse.

---

## 7. Reglas transversales del formulario

### 7.1 El campo `answerOption`: tres combinaciones, no cinco valores

El ENUM `answerOption` del DDL tiene **cinco** valores: `YES`, `NO`, `UNKNOWN`, `NOT_APPLICABLE`, `NO_ANSWER`. Ninguna columna los ofrece todos. **El proceso usa dos combinaciones**, y `<AnswerOptionField>` se escribe una vez con esa variante como propiedad:

| Variante | Opciones | Cuándo | Columnas |
|---|---|---|---|
| `unknown` | `YES` · `NO` · `UNKNOWN` | La pregunta tiene respuesta objetiva, pero puede no conocerse | **38** |
| `full` | `YES` · `NO` · `UNKNOWN` · `NOT_APPLICABLE` | Además, la pregunta puede no aplicar a este paciente o a este caso | **2** |
| ~~`noAnswer`~~ | ~~`YES` · `NO` · `NO_ANSWER`~~ | **No se implementa** — recorrido el expediente entero sin un solo caso | 0 |

**`noAnswer` se descarta con el expediente terminado, no por olvido** (§5.5.5). Las cuarenta `answerOption` del proceso están asignadas y ninguna necesitó distinguir «se preguntó y no contestó» de «no se sabe», por un motivo que sólo se vio al llegar al paso 5: **estas preguntas no se le hacen a nadie**. El investigador observa la nevera, revisa el registro de transporte, examina las jeringas del puesto, lee la historia clínica. `NO_ANSWER` describe una entrevista, y aquí casi no hay entrevistas con respuesta registrable como tal.

**`NO_ANSWER` queda entonces como un valor que la base admite y este cliente no ofrece nunca** — pero que el campo **sí renderiza si lo encuentra al leer**, por la segunda regla de abajo. Una fila cargada por otro cliente puede traerlo.

`NOT_APPLICABLE` y `NO_ANSWER` **nunca conviven** en el mismo campo: significan cosas distintas —«no corresponde preguntarlo» frente a «se preguntó y no contestó»— y ofrecerlas juntas garantiza que se elijan al azar.

Dos reglas que arrastra la primitiva:

- **Qué variante lleva cada campo se declara en §5**, campo por campo, junto al resto de sus condiciones. La base no lo restringe: las cinco opciones caben en cualquier columna, así que el acotamiento es del cliente y tiene que estar escrito en algún sitio.
- **Al leer, se muestra lo que haya, no lo que la variante permite.** Una fila guardada antes de esta regla —o por otro cliente— puede traer un valor fuera de la combinación. El campo lo renderiza, marcado, en lugar de dejar el desplegable en blanco y perderlo silenciosamente en el siguiente `PUT`.

Las columnas `answerOption` viven en `notification` (`hasRelevantMedicalHistory`, `takesMedication`), en `severeNotification` (cinco) y repartidas por la investigación.

**Asignadas hasta ahora — veintisiete columnas, y sólo dos rompen el patrón:**

| Variante | Columnas | Dónde |
|---|---|---|
| `unknown` | Las diez del paso 4 | §5.4, §5.4b |
| `unknown` | `hasPriorHospitalizationHistory`, `hasFamilyHistory`, `hasPregnancyRiskFactor`, `receivedMedicalAttention` | §5.5.3 |
| **`full`** | **`isPregnancyConfirmed`, `wasBreastfed`** | §5.5.3 |
| `unknown` | `isCluster`, `clusterUsedSameVial` y las nueve de la cadena de frío | §5.5.4 |
| `unknown` | `usedAutoDisableSyringes`, las cinco de reconstitución, las seis `had*` y `hadSimilarEvent` | §5.5.5 |
| ~~`noAnswer`~~ | **Ninguna. Recorrido el expediente entero** | — |

`hasPregnancyComplications` **no** necesita `NOT_APPLICABLE` pese a lo que parecía: el caso «no aplica» —un paciente varón— se resuelve **no mostrando el campo** (§7.4), que es más limpio que ofrecer una opción para decir que la pregunta sobraba. Lo mismo vale para las tres de `notificationPregnancy`, que viven enteras detrás de esa misma compuerta.

**`full` aparece por fin en §5.5.3, y en dos columnas donde ocultar no resuelve.** `isPregnancyConfirmed` se pregunta también cuando §7.4 muestra el bloque marcado «Si aplica» —sexo o edad sin constar—, y ahí `NOT_APPLICABLE` es la respuesta exacta: sin ella hay que elegir entre mentir con un `NO` y dejarlo en blanco. `wasBreastfed` vive dentro del bloque de embarazo, y con una gestación en curso todavía no hay lactancia que declarar, que tampoco es un `NO`. En las dos, «no corresponde» es información; en las catorce restantes sería una cuarta forma de decir `UNKNOWN`.

**Y `full` tampoco entró en §5.5.4, aunque el transporte lo pedía.** La tentación era dar `NOT_APPLICABLE` a las cuatro columnas de contenedor, para la vacunación intramuros donde el vial nunca sale de la nevera. Pero ese dato **ya está registrado** en `investigation.vaccinationSiteItemId` (§5.5.1), que distingue el puesto fijo de las seis modalidades extramuros. Ofrecerlo sería pedir por segunda vez algo que el expediente ya sabe, y §6 enseña qué pasa cuando un dato se declara dos veces.

> **Y `noAnswer` cerró el recorrido con cero columnas de cuarenta.** El razonamiento completo está arriba y en §5.5.5; lo que importa aquí es que **se descartó con el expediente terminado y no por olvido**: quedaba una sesión y quince columnas por revisar, y ninguna lo pidió.

> **`wasPregnantAtVaccination` es la única `answerOption` obligatoria del proceso.** El `001` la exige con `exists()` y un `null` explícito da 400 (§5.4b); el `004` vuelve a admitir `null`. Es la única del documento en que la variante acota lo que se **ofrece** y el backend acota además que se **responda algo**.

### 7.2 La lógica de catálogo va contra `value`, nunca contra `code`

El SPEC F46 separó las dos columnas de `catalogItem` con una frase que decide esto: **el `code` pertenece al país** —es el catálogo oficial y se recodifica con él— **y el `value` pertenece al código fuente**, congelado por `isValueLocked` y protegido con un índice único parcial.

Se ve en las semillas del catálogo `sex`, donde el `code` es un número:

| `code` | `name` | `value` |
|---|---|---|
| `2` | Femenino | `FEMALE` |
| `1` | Masculino | `MALE` |
| `3` | Desconocido | `UNKNOWN` |

Toda comparación del cliente contra un ítem de catálogo se hace por **`value`**. Ya aparece tres veces: `outcome` → `DEATH` (§5.4), `sex` → `FEMALE` (§7.4) y `ageUnit` → `YEARS`/`MONTHS`/`DAYS` (§5.3). Comparar por `code` o por `name` funciona en desarrollo y se rompe en el primer despliegue con el catálogo oficial de otro país.

> **El backend no siempre lo hace así, y hay que saberlo.** La regla del sexo femenino de `ESAVI-NOTIFPRG-001` compara contra un **`catalogItemId`** guardado en la fila `systemConfig` `PREGNANCY_FEMALE_SEX_ITEM` (§5.4b), no contra `value === 'FEMALE'`. El SPEC F46 lo mantuvo a propósito, y lo dejó escrito entre sus decisiones: qué ítem significa «femenino» depende del catálogo que adopte cada país, y eso es configuración legítima, no una constante del dominio. Consecuencia práctica: **la compuerta del cliente (§7.4) y el guardián del servidor pueden discrepar** si esa fila apunta a un ítem distinto del que lleva `value === 'FEMALE'`. Cuando eso pasa, el síntoma es un `400 NOTIFPRG_001_PATIENT_NOT_FEMALE` sobre un bloque que la pantalla mostraba abierto, y la causa está en el despliegue, no en el formulario.

### 7.3 Ocultar es integridad, no cosmética

Un campo visible que no corresponde a este paciente o a esta situación **es una invitación a registrar un dato falso**, y un dato falso en vigilancia no se detecta después: se analiza. Por eso la visibilidad condicional no es un adorno del formulario, es parte de su corrección.

Las reglas ya establecidas, todas con la misma forma:

| Se muestra | Sólo cuando | Al ocultarse |
|---|---|---|
| Criterios de gravedad (§5.3) | La compuerta dice «Sí» | Se limpian a `null`, con confirmación |
| Fallecimiento — 3 campos (§5.4) | `outcome.value === 'DEATH'` | Se limpian. Si no, el `PUT` da 400 |
| `otherSourceDescription` (§5.4) | `verifiedOtherSource === true` | Se limpia. Si no, el `PUT` da 400 |
| `pregnancyComplicationsDescription` (§5.4) | `hasPregnancyComplications === 'YES'` | Se limpia. **Regla del cliente**: el backend no la impone |
| `otherDescription` del evento (§5.4b) | `isOtherEsavi === true` | Se limpia. Si no, el `PUT` da 400 |
| Buscador de término del evento (§5.4b) | `isOtherEsavi === false` | Se limpian `esaviCode` y el término. Si no, el `PUT` da 400 |
| `otherMedicationText` (§5.4b) | `isOtherMedication === true` | Se limpia. Si no, el `PUT` da 400 |
| Todo lo de embarazo (§7.4) | El paciente puede estar embarazada | Se limpia **con `PUT`, nunca con `DELETE`** (§5.4b) |
| `otherDescription` de la fuente (§5.5.2) | `other === true` | Se limpia. **El `004` limpia la heredada él solo**; enviarla apagada es 400 |
| `autopsyDate` (§5.5.2) | `isAutopsyPerformed === true` | Se limpia. **El `004` la fuerza a `null` en el diff**, sin `UPDATE` si ya estaba |
| `scheduledAutopsyDate` (§5.5.2) | `isAutopsyScheduled === true` | Ídem |
| Lista de medicación concomitante (§5.4b) | `takesMedication === 'YES'` **estricto** | **No se limpia: se avisa.** `NOTIFMED-005A` es ADMIN, y borrar N filas al cambiar una respuesta puede fallar a medias |
| Las 9 columnas de embarazo (§5.5.3) | `isPregnancyConfirmed === 'YES'` **estricto** | Se limpian. **El `004` fuerza a `null` la que no viaja**; la que viaja con contenido da 400 |
| Los 3 pares bandera/explicación (§5.5.3) | Su bandera en `true` | Se limpian. Si no, el `PUT` da 400 |
| Las 4 columnas del conglomerado (§5.5.4) | `isCluster === 'YES'` **estricto** | Se limpian. **Un solo código de error para las cuatro**, no cuatro |
| `storageRangeDeviation` (§5.5.4) | `storageTemperatureMonitored === true` | Se limpia. **Sólo ella**: las otras seis `storage*` no cuelgan de nada |
| Los 4 tipos de jeringa + descripción (§5.5.5) | `usedAutoDisableSyringes === 'NO'` — **el «no» abre** | Se limpian **en el mismo `PUT` que la bandera**, o la fila no tiene salida legal |
| `otherSyringesDescription` (§5.5.5) | `usedOtherSyringes === true` | Se limpia. Pero **nunca es obligatoria** con la bandera puesta |
| Las 5 columnas del evento similar (§5.5.5) | `hadSimilarEvent === 'YES'` | Se limpian. **Vaciar la descripción exige cerrar la bandera a la vez** |

**Y tres excepciones declaradas, las únicas del documento — las tres por el mismo motivo: el nombre de la columna engaña.**

| Columnas | Parecen colgar de | Y no cuelgan de nada |
|---|---|---|
| `priorHospitalizationObservations`, `familyHistoryObservations` (§5.5.3) | `hasPriorHospitalizationHistory`, `hasFamilyHistory` | Un texto que **es** el contenido de la respuesta (`otherDescription` dice cuál es la otra fuente) se limpia al apagar; uno que **comenta** la respuesta, no. Y el caso en que más falta hace escribir es aquel en que no se pudo responder: una nota que explica por qué la respuesta es `UNKNOWN` vale más que la respuesta |
| `transportSetInThermos`, `transportReturnedInThermos`, `transportTypeThermo` (§5.5.4) | `transportUsedThermos` | Describen **el contenedor que se usó — termo o paquete frío**. Ocultarlas con el termo, que es lo que el nombre pide a gritos, perdería los tres datos en todo caso de paquete frío. Sus etiquetas i18n **no dicen «termo»**: dicen «contenedor» |
| `syringesKeyFindings` y las doce de las seis parejas `had*` / `*Notes` (§5.5.5) | El bloque de jeringas; su propia respuesta | El hallazgo se anota se haya abierto el bloque o no, y **un `'NO'` con el motivo escrito es un registro válido**. Trece columnas más que un condicional por prefijo dejaría invisibles |

**Las tres excepciones se descubren leyendo el servicio, no la tabla**, y ése es el argumento entero de §5.0. Un `storage*` que no está en el bloque de almacenamiento, un `*InThermos` que no cuelga del termo, un `syringesKeyFindings` fuera del bloque de jeringas: **agrupar por prefijo es la forma más rápida de escribir un formulario que oculta lo que no debe**. Entre las tres suman veinte columnas.

**Ocultar siempre limpia.** Un campo escondido que conserva su valor lo envía igual en el `PUT`, y entonces la pantalla dice una cosa y la fila otra — o el servidor responde 400 por un campo que el usuario ya no ve. Es el mismo error diecisiete veces, así que la regla es una sola.

**Y limpiar no es borrar la fila.** `notificationPregnancy` fue la excepción que obligó a decirlo, y el paso 5 la convierte en norma: sus **ocho satélites 1:1 no tienen `isActive`** (§5.5.0), así que ninguno se retira desde el asistente. Cuando lo que se oculta es un bloque entero con fila propia, se vacían sus campos; la fila se queda.

**Y hay un caso más, el último de la escala: ni siquiera limpiar.** La lista de medicación concomitante (§5.4b) no se puede vaciar al cerrarse su compuerta —`NOTIFMED-005A` es ADMIN, y borrar N filas al cambiar una respuesta es una cascada que puede fallar a medias—, así que **sólo cabe avisar antes de guardar**. Las tres formas, en orden de daño: se limpia el campo, se limpia la fila, o se avisa y no se toca nada.

**Y un caso que parece de esta sección y no lo es.** El bloque de autopsia (§6.6) **no tiene compuerta**: se muestra siempre, con cualquier desenlace, porque el paciente puede morir después de notificar. Ahí no hay nada que ocultar ni que limpiar — hay un aviso que señala una incoherencia real y ofrece resolverla. Ocultar es integridad cuando el campo **no puede** aplicar a este paciente; cuando sí puede y todavía no consta, ocultar es perder el dato.

### 7.4 La compuerta de embarazo

**Ningún paciente varón ve un solo campo de embarazo.** No es una opción «no aplica» dentro del formulario: la sección no existe para él.

La condición positiva: el paciente es **mujer en edad fértil**.

```
patient.sexItemId → catalogItem.value === 'FEMALE'
edad entre 15 y 49 años
```

La edad se calcula con la misma aritmética de calendario del backend (`resolveAgeAtEvent`, `src/helpers/age.helper.ts`) sobre `patient.birthDate` y `esaviCase.eventDate` — periodos completos, nunca división de milisegundos, que es lo que hace que 29-feb a 28-feb sean once meses y no un año. **No reimplementar el cálculo**: dos implementaciones divergen justo en los bordes, y 15 y 49 son bordes.

**Alcanza a todo lo que cuelga del embarazo, en los dos pasos, sin excepción:**

| Paso | Qué oculta |
|---|---|
| 4 (§5.4) | `severeNotification.hasPregnancyComplications` y `pregnancyComplicationsDescription` |
| 4 (§5.4b) | `notificationPregnancy` entera y sus `notificationPregnancyComplication` |
| **5 (§5.5.3)** | **`investigationMedicalHistory.isPregnancyConfirmed` y sus nueve columnas**, e `investigationPregnancyCondition` |

**Las nueve columnas del paso 5 entran, y conviene decirlo porque tienen compuerta propia.** `isPregnancyConfirmed` gobierna esas nueve (§5.5.3), pero **está él mismo detrás de ésta**: en un paciente varón no se pregunta si el embarazo está confirmado — no se pregunta nada. Son dos compuertas anidadas, y ésta es la de fuera.

El orden es el que se lee: primero §7.4 decide si el bloque de embarazo **existe** para este paciente; dentro, `isPregnancyConfirmed` decide si sus nueve campos **se guardan**. Saltarse la primera y confiar en que el investigador responderá `NOT_APPLICABLE` deja el campo a la vista de quien no debería verlo, que es justo lo que §7.3 llama una invitación a registrar un dato falso.

#### La regla, en su forma final

**Se oculta cuando conste que no aplica**, no se muestra sólo cuando conste que aplica. Son dos exclusiones independientes, y basta con que se cumpla una:

```
oculto  ⟺  sex.value === 'MALE'
           ó  edad conocida y fuera de 15–49
```

Fuera de esos dos casos el bloque se muestra. Y cuando se muestra **sin poder confirmar que aplica** —sexo desconocido o sin informar, o edad incalculable por falta de `birthDate`— se muestra **marcado «Si aplica»**.

| `sex.value` | Edad | Bloque de embarazo |
|---|---|---|
| `MALE` | cualquiera | **Oculto** |
| cualquiera | conocida, fuera de 15–49 | **Oculto** |
| `FEMALE` | 15–49 | Visible, normal |
| `FEMALE` | desconocida | Visible, **«Si aplica»** |
| `UNKNOWN` o sin informar | 15–49 o desconocida | Visible, **«Si aplica»** |

La edad es el dato que más falta en la práctica, y ése es justo el motivo de la marca: un campo vacío de más no cuesta nada, y un embarazo no registrado por no saber una fecha de nacimiento no se recupera.

«Si aplica» es una clave i18n como cualquier otra —`es`, `en`, `nl`—, no un literal.

> **La compuerta puede cerrarse desde otro paso.** Depende de `patient.sexItemId`, `patient.birthDate` y `esaviCase.eventDate`, los tres editables en los pasos 1 y 2. Corregir el sexo a `MALE`, o una fecha de nacimiento que deje la edad fuera del rango, oculta un bloque de embarazo que ya estaba lleno — y por §7.3, ocultar limpia. **Ese borrado se avisa**, nunca se hace en silencio: el usuario está editando el paciente y no tiene por qué saber que está borrando la notificación.

---

## 8. Campos que **no** se le piden al usuario

Pedirlos es el error más fácil de cometer, porque están en el DDL como cualquier otro.

| Campo | Quién lo escribe |
|---|---|
| `esaviCase.caseCode` | El backend, en `identifier.helper.ts`: prefijo `healthFacility.localCode` + `reportDate` + secuencia de ancho fijo, con reintento ante `UQ_esaviCase_caseCode` |
| `esaviCase.reportDate` | `DEFAULT current_date`. Se puede enviar, pero no es futura y `eventDate` no puede superarla |
| Los ocho sellos de `caseWorkflow` | `012`, `007` y `008` |
| `caseWorkflow.statusItemId` | `012`, `008`, `009`, `010`, `011`. **Nunca un formulario** |
| `durationMinutes`, `totalDurationMinutes` | Calculados al leer. `totalDurationMinutes` es `null` mientras el expediente está abierto: el tiempo transcurrido de un caso vivo lo calcula el cliente contra su propio reloj |
| `patient.nameTokens` | El backend, al crear y al actualizar. No se expone en el detalle |
| `patient.healthSystemCode` | El backend, con `generateHealthSystemCode`. Lo que el cliente envíe bajo ese nombre **se ignora sin error**, y su unicidad no se comprueba (SPEC F05 §6) |
| `code` en `CONSTANT_CASE`, `name` en `Title Case` | El backend normaliza al escribir: **lo enviado puede volver distinto** |
| `investigationTeamMember.fullName` (§5.5.2) | `Title Case`. Y ese valor normalizado es el que compara la guarda de duplicados |
| `investigationClinicalEvaluation.clinicalDetailsPersonName` (§5.5.3) | `Title Case` **antes de cifrar**, o el criptograma cambiaría en cada apertura del formulario |
| `appDetails` | Cada escritura añade su entrada. Es lo que lee `<AuditTrail>` |

**Los tres campos cifrados del paso 5** —`clinicalDetailsPersonName`, y `personName` y `personContact` de `evaluationInstitution`— añaden una regla que no está en ninguna otra parte del documento: **el máximo del formulario no es el `varchar(n)` de la columna**. Los dos de la institución son `varchar(250)` y el validador los corta en **120**, porque lo que tiene que caber en 250 es el criptograma, más largo que su texto. Copiar el ancho del DDL —que es lo que este documento viene diciendo— produciría aquí un `500` del driver en vez de un `400` del validador (§5.5.3).
| `sortOrder` en las cinco tablas hijas del paso 4 | Un disparador, `MAX + 1` por padre. Enviarlo no da 400: **se descarta en silencio** (§5.4b) |
| `notificationEvent.diagnosticTermId`, `notificationPregnancyComplication.diagnosticTermId` | La resolución contra el catálogo clínico. **Ningún validador los declara**: son la única puerta al término y el cliente no la abre |
| `notificationEvent.esaviRawName`, `notificationPregnancyComplication.complicationRawName` | Derivados: lo que escribió el notificador, y **sólo si difiere** del nombre del maestro |
| `notificationPregnancyComplication.metadata` | Fuera del alcance del SPEC F27. Ningún validador lo nombra |

**Y el reverso: tres campos que sí se envían y no son columnas.** `source` en `NOTIFEVT-001/-004` y `PREGCOMP-001/-004`, y `complicationName` y `complicationCode` en `PREGCOMP`. Alimentan la resolución y se descartan después, así que **lo que se manda no es lo que vuelve** — el formulario tiene que saberlo al releer (§5.4b).

---

## 9. Los specs que implementan este proceso

**Once specs**, en este orden — `FE12` y `FE13` se parten por tamaño, no por naturaleza. Cada uno cita este documento en lugar de repetirlo.

| Spec | Cubre | Depende de |
|---|---|---|
| **FE08** — Armazón del wizard | Ruta `/esavi-cases/:id/wizard/:step`, stepper, `useCaseWorkflow` (`CASEFLOW-006`), barra `Guardar / Completar etapa / Siguiente`, reanudación, sólo lectura si `CLOSED`, mapeo de los `CASEFLOW_00*`, y el cambio de menú: **Registrar** y **Ver/editar**. **Cero formularios** | §1, §3, §4 |
| **FE09** — Listado de casos | «Ver/editar». `<ResourceTable>` sobre `ESAVI-CASE-002A` con los 13 filtros del SPEC F48 en `searchParams`, filtro por estado del workflow, y el enlace «casos de este paciente» (`?patientId=`) | §3, §4.5 |
| **FE10** — Pasos 1 y 2 | Paciente y apertura del caso. Los dos juntos porque son los únicos que ocurren **sin `caseId`** | §5.1, §5.2 |
| **FE11** — Paso 3 | Clasificación inicial. Fija la gravedad, que manda sobre todo lo demás | §5.3, §6.1 |
| **FE12a** — Paso 4, cabecera y rama | `notification`, `severeNotification`, `nonSevereNotification`. 33 columnas y la regla de fallecimiento | §5.4, §6.1, §7 |
| **FE12b** — Paso 4, satélites | Los 6 satélites, 64 columnas, más `<WhodrugTreePicker>`, `<MeddraSearchField>` y `<SatelliteList>`. **Bloqueado por §10.4** | §5.4b, §6.5, §7.4 |
| **FE13a…d** — Paso 5 | Investigación: cabecera, 8 satélites 1:1, 2 listas y 2 nietas. **Se parte en cuatro**, con el reparto de §5.5.0. Sin bloque de COVID (§10.7) | §5.5, §7 |
| **FE14** — Paso 6 | Clasificación final y cierre, con las cuatro precondiciones de §4.4 | §5.6, §4.4 |

**Por qué `FE09` va segundo y no último.** Con `FE08` y `FE09` las dos opciones del menú están vivas y un expediente es reanudable de punta a punta, aunque los pasos todavía no guarden nada: todo lo que venga después es rellenar formularios contra un armazón que ya funciona. Dejar el listado para el final significa hacer seis specs de formulario sin poder probarlos como los va a usar la gente.

### Lo que hay que construir antes o durante

**Las diez primitivas están declaradas en `ARCHITECTURE.md` §4.3 y no se repiten aquí** — ésa es la lista canónica, y duplicarla es exactamente lo que la cabecera de este documento advierte. Aquí sólo va **quién las necesita y cuándo**:

| Pieza | Quién la necesita primero |
|---|---|
| `<EntitySearchSelect>` | FE10 (unidad de salud) y FE12b (términos diagnósticos) |
| `<WhodrugTreePicker>` | FE12b — sin él no hay selector de vacuna. Contrato en §5.4b |
| `<MeddraSearchField>` | FE12b. Contrato en §5.4b |
| `<AnswerOptionField>` | FE12a. Luego FE12b y las cuatro de FE13 |
| `<DateField>`, `<TimeField>` | FE10 el primero; FE12b los dos |
| `<SatelliteList>` | FE12b, cuatro veces. FE13, diez |
| `<SearchableSelect>` | FE12b, con el árbol WHODrug |
| `<NumberField>` con rango | FE13c (contadores del conglomerado) y FE13d |
| `<MapPointPicker>` | **FE13d, y sólo ahí** |

Y lo que no es una primitiva:

| Pieza | Estado |
|---|---|
| shadcn: `checkbox`, `radio-group`, `calendar` + `popover`, `tabs`, `dialog` | ❌ no instalados |
| `leaflet` + `@types/leaflet`, y `VITE_MAP_TILE_URL` en `.env` | ❌ **única dependencia externa nueva** de todo el proceso |
| Contratos de `src/contracts/` | ❌ ninguno del caso. Cada spec añade al `SYNC_MAP` lo que declara en su §3.3, nunca por adelantado |

---

## 10. Dependencias del otro repositorio

Lo que este proceso necesita de `esavi-backend` y no puede resolverse aquí. Se acumula a medida que §5 avanza. Seis peticiones abiertas y una pregunta ya resuelta: §10.4 a §10.6 salieron del paso 4, §10.7 del paso 5.

### 10.1 Fila `systemConfig` con el código de país · **decidido, pendiente de crear**

**Código: `ESAVI_APP_COUNTRY_ISO_CODE`** — familia `ESAVI_APP_*`, la misma de `ESAVI_APP_COUNTRY=Ecuador` que ya existe en el `.env.example` del backend.

| Campo | Valor |
|---|---|
| `code` | `ESAVI_APP_COUNTRY_ISO_CODE` |
| `name` | `Código ISO del país` |
| `value` | `"ECU"` — **ISO 3166-1 alpha-3**, nomenclatura elegida para este proyecto. `esaviCase.countryIsoCode` es `varchar(5)` y su validador pide 2–5 letras, así que la de tres caracteres entra sin holgura problemática |
| `valueType` | `string` |
| `scope` | `GLOBAL` |

La crea un SUPERADMIN con `ESAVI-SYSCONF-001`. El cliente la lee con `ESAVI-SYSCONF-006` (`GET /api/system-configs/code/ESAVI_APP_COUNTRY_ISO_CODE`, rol USER), cacheada con `staleTime` alto.

**Respaldo ya escrito:** `VITE_ESAVI_APP_COUNTRY_ISO_CODE=ECU` en `.env.example` y `.env.development`. La precedencia es la que el backend fijó en el SPEC F43 §3.6 — **`systemConfig` gana, la variable de entorno es el respaldo** — y aquí se replica. Un `404` del `006` es «este despliegue todavía no la sembró» y cae a la variable; cualquier otro error es un problema real.

> El nombre **no** puede ser idéntico a los dos lados, a diferencia del resolutor del backend: Vite sólo expone al cliente lo que empieza por `VITE_`. La correspondencia es `ESAVI_APP_COUNTRY_ISO_CODE` ↔ `VITE_ESAVI_APP_COUNTRY_ISO_CODE`.

### 10.2 `ESAVI-NOTIFIER-005A` debe admitir rol USER · **pedido**

`DELETE /api/notifiers/:id` es borrado lógico y hoy exige **ADMIN**. Con la lista de notificadores de §5.2, un USER puede añadir y no puede quitar — ni siquiera lo que acaba de añadir por error, y añadir es `USER` (`ESAVI-NOTIFIER-001`). La asimetría no protege nada: el borrado es lógico y reversible con `005B`.

**Petición:** bajar el rol mínimo de `ESAVI-NOTIFIER-005A` a `USER` en `ROUTE_RULES`. Al hacerlo, `API-ROUTES.md` se regenera (`references/README.md`).

Hasta entonces, el botón de quitar se oculta con `useCan()` y el usuario pide ayuda a un administrador.

### 10.3 Comprobación de `CLOSED` en los cuatro `PUT` de fase · **pedido**

Ver §6.3. La regla de §4.5 —un expediente cerrado no se edita, y sólo un ADMIN puede reabrirlo con `009`— vive hoy **entera** en el cliente. Deshabilitar formularios es experiencia de usuario; aquí, además, es el único control que existe, y una regla que separa lo que puede hacer un USER de lo que necesita un ADMIN no debería depender de que nadie abra las herramientas de desarrollo.

**Petición:** rechazar la escritura sobre un caso `CLOSED` en `ESAVI-CLASSIF-004`, `ESAVI-NOTIFCN-004`, `ESAVI-INVESTGN-004` y `ESAVI-FINCLASS-004`, con un `409` por operación y la misma forma que ya usa `CASEFLOW_012_CASE_CLOSED` — el precedente existe y no hay que inventar semántica.

Alcance a decidir por el backend, no por aquí: si la comprobación cubre también los satélites (`notificationEvent`, `notificationVaccine`, los catorce de la investigación…), que son la mayor parte de las escrituras reales de un expediente. Cubrir sólo los cuatro `004` deja la puerta entornada.

### 10.4 Cuatro satélites del paso 4 exigen ADMIN para escribir · **pedido el 2026-09-03**

**Es la dependencia más grave del documento.** Un USER notifica el caso, lo clasifica, describe el ESAVI en texto libre y rellena la rama grave o no grave — todo con rol `USER`. Y no puede registrar **qué vacuna se administró, qué diagnóstico tuvo, con qué diluyente se reconstituyó ni qué medicación tomaba**, porque las cuatro tablas exigen ADMIN en `POST`, `PUT` y `DELETE`:

| Entidad | Hoy | Debería |
|---|---|---|
| `ESAVI-NOTIFEVT-001/-004/-005A` | ADMIN | **USER** |
| `ESAVI-NOTIFVAC-001/-004/-005A` | ADMIN | **USER** |
| `ESAVI-NOTIFDIL-001/-004/-005A` | ADMIN | **USER** |
| `ESAVI-NOTIFMED-001/-004/-005A` | ADMIN | **USER** |
| `ESAVI-NOTIFPRG-005A` | ADMIN | **USER** |
| `ESAVI-PREGCOMP-005A` | ADMIN | **USER** |

Las dos últimas son el mismo caso que §10.2: se puede añadir y no se puede quitar lo recién añadido por error. **Las cuatro primeras son distintas y peores** — no es una asimetría, es que el contenido clínico del paso 4 le está vedado a quien notifica.

**Y no es una decisión deliberada del backend**, sino la deriva de que cada spec de CRUD (F16, F21, F22, F23) eligió sus roles por su cuenta. La prueba es que sus vecinas directas —la cabecera `ESAVI-NOTIFCN-001/-004`, y las dos ramas `SEVNOT` y `NSEVNOT`— son `USER`, igual que `NOTIFPRG` y `PREGCOMP` en el mismo paso. Ocho entidades del paso 4, y sólo cuatro piden ADMIN.

**El paso 5 lo confirma: sus trece entidades escriben como `USER`, sin excepción** (§5.5.0). Si hubiera una política graduada por sensibilidad del dato, la investigación clínica —antecedentes, sospecha de maltrato, error de administración— estaría por encima de la lista de vacunas administradas, y va en `USER`. No hay tal política; hay cuatro specs que eligieron distinto.

**Y el mismo problema en los `005A`**, que son ADMIN en las cuatro entidades del paso 5 con identidad propia (`INVTEAM`, `INVVACAD`, `INVPREG`, `EVALINST`). Es §10.2 otra vez: se puede añadir y no quitar lo recién añadido por error. Se acumula a esta misma petición.

**Petición:** bajar a `USER` el rol mínimo de las escrituras listadas arriba en `ROUTE_RULES`. Los `002B` (listados con inactivas) y los `005B`/`005C` se quedan como están. Al hacerlo, `API-ROUTES.md` se regenera (`references/README.md`).

**Pedido el 2026-09-03**, junto con §10.2, que es el mismo problema en `ESAVI-NOTIFIER-005A`.

**`FE12b` se diseña asumiendo `USER`**, y esa es la decisión que importa aquí: no se replica en el cliente una restricción que está en vías de desaparecer, porque el `useCan()` que la implementara habría que quitarlo después y, mientras tanto, ocultaría el contenido clínico del paso sin decir por qué. Esto no se resuelve ocultando botones — un caso que no puede registrar su vacuna no es un caso.

**Mientras no llegue**, el paso 4 lo completa un ADMIN. Si al implementar `FE12b` los roles siguen en ADMIN, la comprobación es de una línea (`API-ROUTES.md` se regenera con el cambio) y lo que hay que ajustar es el aviso de la pantalla, no el diseño.

### 10.5 Tres catálogos sin sembrar que el paso 4 consume · **pendiente de datos**

No es código: son filas que faltan en cada despliegue.

| Catálogo | Estado | Lo consume |
|---|---|---|
| `pharmaceuticalForm` | **Comentado en `esaviapp.sql:1723-1724`** | `notificationMedication.pharmaceuticalFormItemId` |
| `administrationRoute` | **Comentado en `esaviapp.sql:1721-1722`** | `notificationMedication.administrationRouteItemId` |
| `diluentCatalog` | Tabla creada, **sin semillas** | `notificationDiluent.diluentCatalogId` |

Las tres FK son nullables, así que **nada bloquea el registro**: la medicación se guarda sin forma ni vía, y el diluyente con `diluentName` en texto crudo. Pero mandar una clave contra un catálogo vacío responde `404`, y el desplegable vacío parece una pantalla rota.

**Lo que se pide al otro repositorio:** descomentar las dos familias de `upsertCatalogItem` —con el catálogo oficial, no con las dos filas de ejemplo— y sembrar `diluentCatalog`, **incluida una entrada «Desconocido»**, que es lo que el SPEC F23 previó para «se reconstituyó y no sé con qué» (§5.4b).

**Lo que hace el cliente mientras tanto:** `<CatalogSelect>` con cero ítems se muestra deshabilitado y con su explicación, nunca como un desplegable vacío sin más. Es comportamiento general de la primitiva, no un parche del paso 4 — la investigación va a repetir el caso.

### 10.6 Fila `systemConfig` `PREGNANCY_FEMALE_SEX_ITEM` · **pendiente de datos**

Sin ella, `ESAVI-NOTIFPRG-001` responde **`500 NOTIFPRG_001_SEX_CONFIG_MISSING` en cada intento** y el bloque de embarazo entero es inservible (§5.4b).

| Campo | Valor |
|---|---|
| `code` | `PREGNANCY_FEMALE_SEX_ITEM` |
| `scope` | `GLOBAL` |
| `valueType` | `string` |
| `isEncrypted` | `false` — **marcarla cifrada es el fallo peor**: no da error, simplemente no coincide nunca, y toda paciente femenina recibe un `400 PATIENT_NOT_FEMALE` |
| `value` | El `catalogItemId` del sexo femenino **de esa base**, como cadena JSON |

La crea un SUPERADMIN con `ESAVI-SYSCONF-001` en cada despliegue. **No está en `systemConfig.defaults.ts` y no debe estarlo**: su valor es un UUID que cambia por instalación, y el `008` de siembra es sólo-alta — una fila mala quedaría fija.

Es la segunda fila de configuración que este proceso necesita, junto a la de §10.1, y las dos tienen la misma forma de fallo: un despliegue que arranca y una pantalla que no funciona. **Conviene una comprobación de arranque que lea las dos y avise**, en vez de descubrirlo cuando alguien intente registrar un embarazo.

> A diferencia de §10.1, **aquí no cabe un respaldo en variable de entorno**: el valor es una clave ajena de esa base concreta, no una constante del despliegue. Si falta, falta.

### 10.7 `investigationCovidHistory` es una tabla obsoleta · **resuelto el 2026-09-03**

`esaviapp.sql` declara la tabla con **once columnas de datos** —historia de COVID, si fue asintomático, fecha de inicio de síntomas, confirmación diagnóstica, gravedad, fecha de muestra, participación en ensayo clínico y nivel de gravedad más alto—, tres de ellas claves de catálogo. No hay **ni servicio, ni validador, ni ruta, ni código `ESAVI-*`**, y sus tres catálogos tampoco están sembrados.

**Respuesta: es una tabla que el modelo dejó atrás.** No es una entidad pendiente. Nadie le debe endpoints.

**Consecuencias, y por eso esto sigue en §10 aunque ya no sea una pregunta:**

| Para | Regla |
|---|---|
| El paso 5 | **No hay bloque de COVID en el asistente**, ni ahora ni previsto. §5.5.0 no vuelve a mencionarla salvo como nota |
| El reparto de §5.5.0 | Las trece entidades implementadas son **todo** el paso 5. No queda una decimocuarta esperando |
| Quien lea el DDL | La tabla está y no significa nada. **Se documenta como obsoleta** para que nadie la implemente por inercia sólo porque aparece en `esaviapp.sql` |
| Sus tres catálogos | **No entran en §10.5.** Sembrarlos no serviría para nada |

> **Lo único que queda abierto es del otro repositorio, y es menor:** si la tabla se retira del DDL o se deja con una nota. Ninguna de las dos cosas cambia nada de este cliente, así que no se pide — se anota. Lo que sí importaba era saberlo antes de escribir `FE13`, y ya se sabe.

**Es el patrón que conviene repetir.** Una tabla en el esquema no es una obligación de implementarla, y la única forma de distinguir «pendiente» de «abandonada» es preguntar. Leer el DDL como si fuera la especificación habría añadido un bloque entero de once campos al paso 5 —y una petición de endpoints y catálogos a §10— por un vestigio.

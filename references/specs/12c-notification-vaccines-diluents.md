# SPEC FE12c — Paso 4: vacunas y diluyentes

> **Estado:** Borrador
> **Depende de:** SPEC FE08 (armazón del wizard), SPEC FE10 (paciente y apertura del caso — de ahí sale `eventDate`, y este spec le añade un aviso), SPEC FE12a (la cabecera de la notificación — sin su fila no hay `notificationId` al que colgar nada), SPEC FE12b (de ahí sale `<SatelliteList>`, que este spec consume sin volver a escribirla). Del backend: SPEC F22 (notificationVaccine), SPEC F23 (notificationDiluent) y SPEC F44 (case-workflow).
> **Fecha:** 2026-09-05
> **Objetivo:** Las vacunas administradas y sus diluyentes —la tercera lista del paso 4 y la única anidada— con el árbol WHODrug de cinco niveles y las dos coherencias temporales.

---

## 1. Por qué existe este spec

**Un caso notificado hoy no dice qué vacuna lo causó.** FE12a recoge la descripción, la gravedad y el desenlace; FE12b, el diagnóstico y la medicación concomitante. `notificationVaccine` no la toca ningún spec, y es la tabla que da sentido a todo lo demás: un evento supuestamente atribuible a la vacunación del que no consta la vacunación no es un caso ESAVI, es una nota clínica.

**Es el segundo de los tres specs en que se partió el paso 4** (`CASE-PROCESS.md` §9, decidido el 2026-09-04). El corte es `FE12b` (eventos y medicación) → **`FE12c`** (vacunas y diluyentes) → `FE12d` (embarazo y complicaciones). Va después de FE12b porque **consume `<SatelliteList>`** y antes de FE12d porque el embarazo está bloqueado además por datos (§10.6) y su bloqueo no debe arrastrar a nadie.

**Es el lado cliente de dos specs del backend** — SPEC F22 para la vacuna, SPEC F23 para el diluyente — y de una decisión que no está en ninguno de los dos: **los tres textos son copia y los rellena el cliente**. El servicio no toca `whoCode`, `vaccineCode` ni `vaccineName` jamás, ni en el `001` ni en el `004` (SPEC F22 §6). Elegir en el árbol y mandar sólo la FK produce una fila legal e ilegible en cuanto el diccionario se renombre, que es exactamente lo que esas tres columnas existen para evitar.

**Trae la única lista anidada del expediente.** Los diluyentes cuelgan de `vaccineId`, no de la notificación, y **`NOTIFDIL` es la única de las seis satélites sin `006` por caso**: se leen por vacuna, uno a uno. No hay lista de diluyentes del caso y no puede haberla. Eso decide la forma de la pantalla —lista dentro del modal de su vacuna— y decide también que el modal de una vacuna nueva tenga dos fases: sin `vaccineId` no hay padre al que colgar nada.

**Dos primitivas que este spec deja construidas:**

- **`<SearchableSelect>`**, el desplegable con filtro de texto sobre `cmdk` de `ARCHITECTURE.md` §4.3. Aquí aparece cinco veces —los cinco niveles del árbol— y a partir de aquí sirve a cualquier `<CatalogSelect>` con catálogo largo.
- **`<WhodrugTreePicker>`**, los cinco niveles encadenados con su `matchCount` por opción y su panel de información. `CASE-PROCESS.md` §5.5.4 lo vuelve a pedir en el paso 5, donde además **no hay rama cruda**: allí `vaccineWhodrugId` es obligatorio y sin diccionario importado la sección entera se deshabilita.

**Y adopta una regla que hoy no tiene dueño.** `vaccinationDate` no puede ser posterior a `esaviCase.eventDate`, pero `eventDate` se edita en el **paso 2** y el `400` saldría en un paso que el usuario no está mirando. Este spec le pone el aviso donde se origina el daño: el `<DateField>` de `eventDate` comprueba las vacunas ya cargadas antes de guardar. Es la sección 8 de este documento y el único sitio donde toca una pantalla ya construida.

---

## 2. Alcance

**Dentro:**

- **Dos primitivas nuevas en `shared/components/`**, ninguna específica de esta pantalla:
  - **`<SearchableSelect>`** — desplegable con filtro de texto sobre `cmdk`, parametrizado por opciones, texto de búsqueda controlado y mínimo de caracteres. Es lo que `ARCHITECTURE.md` §4.3 ya declara y hasta hoy nadie escribió.
  - **`<WhodrugTreePicker>`** — los cinco niveles de `ESAVI-WHODRUG-006A`…`006E`, con el borrado en cascada de los niveles inferiores, `matchCount` por opción, la resolución anticipada del id, el colapso de nivel por `count === total`, el centinela `__NULL__`, la lectura de la fila entera con `ESAVI-WHODRUG-003` y el panel de información de siete filas.
- **`notificationVaccine` completo**: sus catorce columnas, la guarda de contenido mínimo (`vaccineWhodrugId` **o** `vaccineName`), la coherencia temporal contra `eventDate`, `isSuspected` como casilla por fila y **los tres textos copiados del maestro** al elegir en el árbol.
- **La rama cruda**: con el maestro vacío o con una vacuna que el diccionario no lista, se escribe `vaccineName` a mano y la fila queda sin FK. **No es un caso degradado, es el frecuente**, y la pantalla no lo presenta como un fallo.
- **«Asignar sólo la abreviatura»** como acción del nivel 1 del árbol: guarda `vaccineName` con la abreviatura y sin FK, sin obligar a bajar cinco niveles.
- **`notificationDiluent` completo**: sus diez columnas, la guarda de contenido mínimo (`diluentCatalogId` **o** `diluentName`), la coherencia temporal contra `vaccinationDate` de su vacuna —**sólo fechas, nunca horas**— y la ausencia de `notes`, que es la única de las seis que no lo tiene.
- **La lista de diluyentes anidada dentro del modal de su vacuna**, con lectura perezosa por `ESAVI-NOTIFDIL-002A` al abrir el modal. No hay lista de diluyentes del caso y no puede haberla.
- **El modal de vacuna en dos fases**: con la vacuna sin guardar, la sección de diluyentes se muestra deshabilitada con su explicación; al aceptar, el modal permanece abierto sobre la fila ya creada y la sección se habilita.
- **`<DiluentSelect>`**, envoltura sobre una declaración `createResource('diluent')` contra `ESAVI-DILUENT-002A`. **No es `<CatalogSelect>`**: `diluentCatalog` es una entidad propia, no un `catalogType`. Con el maestro vacío se muestra deshabilitado y con su explicación, como manda §10.5.
- **La lista de vacunas dentro de `NotificationStep`**, que **no se renderiza hasta que existe la fila de `notification`**: sin `notificationId` no hay padre.
- **Dos obligatorios de proceso nuevos** en `notificationCompleteSchema` de FE12a: **al menos una vacuna**, y **al menos una vacuna con `isSuspected === true`**. No bloquean el guardado; se listan bajo «Completar etapa» (§4.6).
- **Bajas con `005A`**, con diálogo de confirmación que nombra la fila **y sus diluyentes**: por la visibilidad heredada de dos niveles, dar de baja una vacuna deja sus diluyentes inalcanzables con `404`.
- **El aviso de `eventDate` en el paso 2** (§8): al guardar el paso 2 con una fecha que dejaría vacunas con `vaccinationDate` posterior, se listan y se advierte. **Avisa, no bloquea** — el backend no valida `eventDate` contra las vacunas y el cliente no va a ser más estricto que el servidor.
- **El aviso de rol mientras §10.4 siga a medias**: un `403 AUTH_ROLE_FORBIDDEN` al editar o al borrar dice que **corregir y retirar** contenido clínico exige un administrador en este despliegue, aunque crearlo no.
- **Mapeo de los códigos de error** de las dos entidades y del árbol, a campo o a toast, y las claves i18n nuevas en `es`, `en` y `nl`.
- **Tests de integración** de la lista de vacunas y de la lista anidada de diluyentes.

**Fuera de alcance (otros specs):**

- **Embarazo y complicaciones** — `notificationPregnancy`, `notificationPregnancyComplication`, la compuerta de §7.4 y la derivación de §6.5. Es **FE12d**, que reutiliza `<SatelliteList>` y `<MeddraSearchField>` sin escribirlas.
- **La lista de vacunas administradas del paso 5** (`investigationVaccineAdministered`, §5.5.4). Consume el mismo `<WhodrugTreePicker>` que este spec deja escrito, pero **sin rama cruda** —`vaccineWhodrugId` es obligatorio allí— y con una regla de duplicado por trío `(investigación, vacuna, dosis)` que aquí no existe. Es FE13.
- **El mantenimiento del maestro `vaccineWhodrug`**: `ESAVI-WHODRUG-001`, `004`, `005A`/`B` y la importación `007` (SUPERADMIN). Son administración del catálogo, no del asistente. Aquí sólo se lee la consecuencia de que el diccionario no esté importado: el árbol vacío, que se explica como estado del despliegue.
- **Sembrar `diluentCatalog`.** Es una dependencia del otro repositorio (§10.5), incluida la entrada «Desconocido» del SPEC F23. Mientras no exista, el diluyente se registra por `diluentName` crudo y el spec no se bloquea.
- **Enlazar `notificationDiluent` con `vaccineWhodrug.diluent`.** El texto del diccionario dice qué diluyente *esperaba* esa vacuna; la fila registra *el lote que se usó*. Son dos datos distintos y preseleccionar uno con el otro es inventar información.
- **Reordenar filas.** `sortOrder` lo asigna un disparador y ningún servicio lo escribe. Igual que en FE12b, si el funcional lo pide es una petición al otro repositorio.
- **Listados por notificación y detalle por id.** Los `002A` por notificación, los `002B` con inactivas y los `003` no se consumen para las vacunas: se lee por caso con el `006`. En diluyentes **sí se usa el `002A`**, porque es la única lectura que existe.
- **Reactivaciones y purgas.** Los `005B` y `005C` son SUPERADMIN y no entran en el asistente.
- **Persistir el contenido de los modales en `draftsStore`.** Igual que FE12b: una fila de satélite se guarda al aceptar el modal y no tiene hueco entre teclear y guardar que merezca persistirse.
- **El recuento de diluyentes en la fila de la lista de vacunas.** Con lectura perezosa no se conoce sin pedirlo, y pedir N veces al entrar al paso para pintar un número no lo vale. Se decidió y se anota en §6.
- **La comprobación de `CLOSED` en el servidor** (§10.3). Sigue viviendo entera en el cliente, igual que en FE11, FE12a y FE12b.

---

## 3. Diseño

### 3.1 Pantallas y rutas

**No hay ruta nueva ni entrada de menú nueva.** La lista vive dentro del paso 4 que FE12a construyó, en la ruta que declaró FE08.

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Lista de vacunas | `/esavi-cases/:id/wizard/notification` | `features/notification/VaccineList.tsx` | el de `CaseWizardPage` (FE08), `<RequireRole level={USER}>` |
| Alta/edición de vacuna | ídem, en modal | `features/notification/VaccineFormDialog.tsx` | ídem |
| Lista de diluyentes | ídem, **dentro del modal de la vacuna** | `features/notification/DiluentList.tsx` | ídem |
| Alta/edición de diluyente | ídem, en formulario en línea dentro de la lista | `features/notification/DiluentFormRow.tsx` | ídem |

**El diluyente no abre un segundo modal.** Un modal sobre modal rompe el foco y el `Escape` deja de tener un destino obvio. La lista anidada edita en línea: la fila se expande a formulario, y las acciones de la vacuna quedan visibles debajo.

**El guard heredado es `USER` y el spec no lo estrecha**, por la misma razón que FE12b: §10.4 está a medio aplicar y replicar en el cliente una restricción en vías de desaparecer obligaría a quitar el `useCan()` después. El `403` se maneja con un mensaje que lo explica (§3.6), que es lo contrario de esconder el botón.

### 3.2 Endpoints consumidos

**Escrituras y lecturas propias**, copiadas textualmente de `references/API-ROUTES.md`, regenerado el 2026-09-05:

```
POST   /api/notification-vaccines              ESAVI-NOTIFVAC-001   USER    crear vacuna
GET    /api/notification-vaccines/case/:id     ESAVI-NOTIFVAC-006   USER    vacunas del caso
PUT    /api/notification-vaccines/:id          ESAVI-NOTIFVAC-004   ADMIN   actualizar vacuna
DELETE /api/notification-vaccines/:id          ESAVI-NOTIFVAC-005A  ADMIN   baja lógica

POST   /api/notification-diluents              ESAVI-NOTIFDIL-001   USER    crear diluyente
GET    /api/notification-diluents/vaccine/:id  ESAVI-NOTIFDIL-002A  USER    diluyentes de la vacuna
PUT    /api/notification-diluents/:id          ESAVI-NOTIFDIL-004   ADMIN   actualizar diluyente
DELETE /api/notification-diluents/:id          ESAVI-NOTIFDIL-005A  ADMIN   baja lógica

GET    /api/whodrug-vaccines/abbreviations     ESAVI-WHODRUG-006A   USER    nivel 1 — abreviatura
GET    /api/whodrug-vaccines/drug-names        ESAVI-WHODRUG-006B   USER    nivel 2 — nombre comercial
GET    /api/whodrug-vaccines/ma-holders        ESAVI-WHODRUG-006C   USER    nivel 3 — titular
GET    /api/whodrug-vaccines/forms             ESAVI-WHODRUG-006D   USER    nivel 4 — forma/presentación
GET    /api/whodrug-vaccines/strengths         ESAVI-WHODRUG-006E   USER    nivel 5 — potencia
GET    /api/whodrug-vaccines/:id               ESAVI-WHODRUG-003    USER    la fila entera del maestro

GET    /api/diluents                           ESAVI-DILUENT-002A   USER    maestro de diluyentes
```

> **§10.4 sigue a medias, igual que en FE12b.** El 2026-09-04 bajaron a `USER` los cuatro `001` del paso 4. Los `004` y los `005A` de `NOTIFVAC` y `NOTIFDIL` **siguen en `ADMIN`**: un USER puede registrar qué vacuna se administró y no puede corregir una errata en el número de lote. Nada lo explica, así que parece un descuido al aplicar la petición y no una política. El spec se diseña asumiendo `USER` en las ocho; lo que cambia mientras tanto es el texto del aviso, no el diseño.

**`ESAVI-NOTIFDIL-002A` es la única lectura de diluyentes que existe.** No hay `006` por caso —`NOTIFDIL` es la única de las seis satélites sin él— y por eso la lectura es por vacuna y perezosa (§3.4).

**Contrato de los cinco niveles del árbol**, de `CASE-PROCESS.md` §5.4b:

| Pieza | Valor |
|---|---|
| Respuesta | `{ count, total, options: [{ value, matchCount, vaccineWhodrugId }] }` |
| `value` | El texto del nivel. **Puede ser `null`**: cuatro de las cinco columnas lo admiten |
| `matchCount` | Cuántas filas del diccionario cuelgan de esa opción. Se **muestra** junto a cada opción |
| `vaccineWhodrugId` | El id, y **sólo cuando `matchCount === 1`**. En cualquier otro caso, `null` |
| Ancestros | Cada nivel exige **todos** los suyos, y viajan **exactos**: sin `trim`, sin normalizar, sin recodificar |
| `search` | **Mínimo dos caracteres.** Filtra la misma columna que agrupa |
| `country` | ISO3. Ausente, no filtra por país |
| `language` | `es`/`en`/`nl`; por defecto, el del store de preferencias |
| Valor nulo | Viaja hacia abajo como el centinela **`__NULL__`**. En pantalla se lee «sin especificar» |
| `isActive` | Siempre `true`. No hay variante de administración |

**Qué no se consume, y por qué:**

- **`ESAVI-NOTIFVAC-002A` y `002B`** (por notificación). El `006` por caso devuelve lo mismo con el `caseId` que ya está en la URL, sin esperar a que resuelva la cabecera.
- **`ESAVI-NOTIFVAC-003` y `ESAVI-NOTIFDIL-003`.** Editar una fila abre el modal con lo que ya trajo la lista; una segunda lectura de lo mismo no añade nada.
- **`ESAVI-NOTIFDIL-002B`.** Es ADMIN e incluye inactivas, y el asistente no muestra filas dadas de baja.
- **Los `005B` y `005C`** de las dos entidades. Reactivar y purgar son SUPERADMIN y no entran en el asistente.
- **`ESAVI-WHODRUG-002A`** (listado del maestro). El árbol no lista filas: agrupa por columna, nivel a nivel. Pedir el listado entero sería traer el diccionario al cliente.
- **`ESAVI-WHODRUG-001`, `004`, `005A`/`B` y `007`.** Mantener e importar el diccionario es otra pantalla, y `007` es SUPERADMIN.
- **`ESAVI-DILUENT-001`, `004`, `005A`/`B`.** El maestro de diluyentes se administra fuera del asistente. Aquí sólo se lee con el `002A`.

**Lecturas que ya implementaron specs anteriores:**

```
GET  /api/case-workflows/case/:id   ESAVI-CASEFLOW-006   USER   estado y stages (FE08)
GET  /api/esavi-cases/:id           ESAVI-CASE-003       USER   eventDate, para la coherencia temporal (FE09/FE10)
GET  /api/notifications/case/:id    ESAVI-NOTIFCN-006    USER   notificationId (FE12a)
```

### 3.3 Tipos del contrato

**Tres archivos nuevos por `contracts:sync`**, con tres entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`:

```ts
// contracts/notificationVaccine.ts — espejo de esavi-backend/src/types/notificationVaccine/
export interface CreateNotificationVaccineInput {
  notificationId: string;
  vaccineWhodrugId?: string | null;   // FK al maestro; gobierna la guarda con vaccineName
  isSuspected?: boolean;              // NOT NULL DEFAULT false
  whoCode?: string | null;            // <=250 — copia de drugCode, nunca derivada
  vaccineCode?: string | null;        // <=250 — copia del mismo drugCode, editable
  vaccineName?: string | null;        // <=500 — copia de drugName; gobierna la guarda
  vaccinationDate?: string | null;    // YYYY-MM-DD; gobierna la coherencia temporal
  vaccinationTime?: string | null;    // HH:MM
  doseNumber?: number | null;         // entero >= 0, sin techo
  batchNumber?: string | null;        // <=100
  expirationDate?: string | null;     // YYYY-MM-DD, sin regla cruzada
  notes?: string | null;
  isActive?: boolean;
}
```

```ts
// contracts/notificationDiluent.ts — espejo de esavi-backend/src/types/notificationDiluent/
export interface CreateNotificationDiluentInput {
  vaccineId: string;                  // el padre, inmutable en el 004
  diluentCatalogId?: string | null;   // FK al maestro; gobierna la guarda con diluentName
  batchNumber?: string | null;        // <=250 — más ancho que el de la vacuna, que es 100
  expirationDate?: string | null;
  reconstitutionDate?: string | null; // gobierna la coherencia temporal
  reconstitutionTime?: string | null; // HH:MM; no entra en ninguna comparación
  diluentName?: string | null;        // <=250
  diluentCode?: string | null;        // <=250
  isActive?: boolean;
}
```

**`notificationDiluent` no tiene `notes`.** Es la única de las seis satélites que no lo tiene, y el formulario no lo inventa.

```ts
// contracts/vaccineWhodrug.ts — espejo de esavi-backend/src/types/vaccineWhodrug/
export interface VaccineWhodrug {
  vaccineWhodrugId: string;
  abbreviation: string | null;
  drugCode: string;                   // fuente de whoCode Y de vaccineCode
  drugName: string;                   // NOT NULL en el maestro; fuente de vaccineName
  maHolders: string | null;
  form: string | null;
  formTranslations: string | null;    // se muestra éste; form es el respaldo
  strength: string | null;
  ingredient: string | null;
  ingredientTranslation: string | null;  // singular — el plugin escribe el plural
  noDose: string | null;                 // singular — el plugin escribe el plural
  diluent: string | null;                // texto del diccionario, NO una clave a diluentCatalog
}

export interface WhodrugLevelOption {
  value: string | null;
  matchCount: number;
  vaccineWhodrugId: string | null;    // sólo cuando matchCount === 1
}
```

**El maestro de diluyentes no trae contrato propio del backend.** `diluent` es una entidad de catálogo con la forma canónica (`code`, `name`, `isActive`), y `createResource('diluent')` la resuelve con los tipos genéricos que FE02 ya declaró.

El update de las dos entidades usa `Partial<CreateEntityInput>`, igual que en el backend.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId` y paso activo | URL | params de `/esavi-cases/:id/wizard/:step` | los declaró FE08 |
| Estado del expediente y `stages` | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | sólo lectura aquí |
| Cabecera de la notificación | TanStack Query | `['notification', 'byCase', caseId]` | de aquí sale `notificationId` |
| El caso | TanStack Query | `['esaviCase', 'detail', caseId]` | de aquí sale `eventDate`, para la coherencia temporal |
| Lista de vacunas | TanStack Query | `['notificationVaccine', 'byCase', caseId]` | sin `staleTime`; se invalida tras cada escritura |
| Diluyentes de **una** vacuna | TanStack Query | `['notificationDiluent', 'byVaccine', vaccineId]` | **`enabled` sólo con el modal de esa vacuna abierto**; sin `staleTime` |
| Maestro de diluyentes | TanStack Query | `['diluent', 'list', {}]` | `staleTime` 30 min — es catálogo |
| Nivel N del árbol WHODrug | TanStack Query | `['whodrugVaccine', 'level', level, ancestors, search, language]` | `staleTime` **30 min**: el diccionario sólo cambia con el `007` |
| Fila del maestro resuelta | TanStack Query | `['whodrugVaccine', 'detail', vaccineWhodrugId]` | `staleTime` 30 min; alimenta el panel y los tres textos |
| Valores del modal abierto | React Hook Form | `useForm` de `VaccineFormDialog` | |
| Valores del diluyente en edición | React Hook Form | `useForm` de `DiluentFormRow` | un formulario por fila expandida |
| Selección en curso del árbol | Componente | `useState` de `<WhodrugTreePicker>`: los cinco valores de ancestro | **efímero y local**; lo elegido se vuelca al formulario al resolverse el id |
| Qué modal está abierto y sobre qué vacuna | Componente | `useState` de `VaccineList` | efímero; **el id, no la fila** |
| Qué diluyente está expandido | Componente | `useState` de `DiluentList` | efímero; el id |
| Diálogo de confirmación de baja | Componente | `useState` | efímero |
| Visibilidad de la lista de vacunas | derivado en render | `notification` existe | no es estado |
| Habilitación de la sección de diluyentes | derivado en render | la vacuna del modal **tiene `vaccineId`** | no es estado — es la fase 2 del modal |
| Deshabilitado de `<DiluentSelect>` | derivado en render | el maestro devolvió `count === 0` | no es estado |
| Vacuna codificada o cruda | derivado en render | `vaccineWhodrugId` tiene valor | no es estado aparte |
| Obligatorios de proceso pendientes | derivado en render | hay ≥1 vacuna, y ≥1 con `isSuspected` | se calcula al pulsar «Completar etapa» |

**Los cuatro puntos obligatorios:**

**1 · Nada del servidor en `useState`.** El modal guarda **el id de la vacuna que edita**, no una copia de la fila: los valores iniciales del formulario salen de la caché al abrirlo. Y los cinco valores de ancestro del árbol **sí son `useState`**, y es la excepción que hay que razonar: no son datos del servidor, son el argumento de la consulta del nivel siguiente. Lo que el servidor devuelve —las opciones, el id, la fila del maestro— vive en las tres claves de caché de arriba, no en el componente.

**2 · Ningún filtro fuera de `searchParams`.** Esta pantalla no tiene filtros, paginación ni orden: el orden lo fija el disparador de `sortOrder` y no se puede cambiar (§5.4b). La regla no aplica, y se dice en vez de callarla. Lo tecleado en el `search` de un nivel del árbol no es un filtro de listado: es el argumento de la consulta de ese nivel, y vive en su clave de caché.

**3 · `staleTime` por naturaleza del dato.** Las cuatro lecturas del expediente —expediente, caso, vacunas, diluyentes— **no llevan `staleTime`**. Los tres maestros llevan **30 minutos**: el de diluyentes es un catálogo ordinario, y las seis claves del árbol WHODrug son un diccionario que **sólo cambia cuando un SUPERADMIN lanza `ESAVI-WHODRUG-007`**. Un árbol con `staleTime` corto convierte cada paso del usuario entre niveles en una petición repetida por nada.

**4 · Qué invalida qué.** Tras cualquier `POST`, `PUT` o `DELETE`:

- **De vacuna:** sólo `['notificationVaccine','byCase',caseId]`.
- **De diluyente:** sólo `['notificationDiluent','byVaccine',vaccineId]` — la de esa vacuna, no las demás.
- **Tras el `POST` de una vacuna nueva**, además, la clave de diluyentes de esa vacuna **pasa a estar habilitada**. No es una invalidación: es que `enabled` se vuelve cierto porque ya hay `vaccineId`.
- **Tras la baja de una vacuna**, se invalida su clave de diluyentes junto con la lista. Sus filas ya no son alcanzables y dejarlas en caché es guardar una respuesta que el servidor ya no daría.

Y **nada más**, deliberadamente:

- **No se invalida `['caseWorkflow','byCase',caseId]`.** Un satélite no sella ninguna marca de tiempo del expediente ni cambia su estado; el `001` que sella `notificationStartedAt` es el de la cabecera y es de FE12a.
- **No se invalida `['notification','byCase',caseId]`.** Ninguna respuesta de la cabecera depende de las vacunas.
- **No se invalida `['esaviCase','detail',caseId]`.** Guardar una vacuna no cambia `eventDate`; la dependencia va en el otro sentido y se trata en §8.
- **Nada invalida las claves del árbol ni el maestro de diluyentes.** Son diccionarios: escribir una fila del expediente no los cambia.

### 3.5 Formularios y validación

**Formulario de vacuna** — `features/notification/schemas.ts`, `notificationVaccineSchema`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| — selección del maestro — | `<WhodrugTreePicker>` | no | Al resolverse, rellena `vaccineWhodrugId` y los tres textos |
| `whoCode` | **texto de solo lectura** | no | ≤250. No es un input: sólo cambia al elegir en el árbol |
| `vaccineCode` | `<Input>` | no | ≤250. **Editable**: el notificador lo sobrescribe con el código nacional del carné |
| `vaccineName` | `<Input>` | condicional | ≤500. **Obligatorio si no hay `vaccineWhodrugId`** — es la guarda de contenido mínimo |
| `isSuspected` | `<Checkbox>` | no | `NOT NULL DEFAULT false`. **No es tri-estado** |
| `vaccinationDate` | `<DateField>` | no | `YYYY-MM-DD`. **No posterior a `eventDate`**, si las dos existen |
| `vaccinationTime` | `<TimeField>` | no | `HH:MM`. La primitiva la escribió FE12b |
| `doseNumber` | `<NumberField>` | no | Entero ≥ 0, **sin techo** |
| `batchNumber` | `<Input>` | no | ≤100 |
| `expirationDate` | `<DateField>` | no | Sin regla cruzada en el servidor |
| `notes` | `<Textarea>` | no | Texto libre |

> **`whoCode` se muestra por análisis, no por captura.** Es la palabra del diccionario, y que difiera de `vaccineCode` es información: alguien corrigió el código a mano. Mostrarlo de solo lectura es lo que sostiene esa lectura; si se dejara editable, la diferencia entre los dos dejaría de significar nada.

**Guarda de contenido mínimo:** el schema exige `vaccineWhodrugId` **o** `vaccineName` no vacío. Se evalúa **sobre el estado resultante**, así que un `PUT` que borra el nombre de una fila sin código falla en el cliente antes de llegar al `400 NOTIFVAC_00X_VACCINE_REQUIRED`.

**Rellenado al resolverse el árbol**, contra la fila del `ESAVI-WHODRUG-003`:

| Se escribe en | Sale de |
|---|---|
| `vaccineWhodrugId` | `vaccineWhodrugId` |
| `whoCode` | `drugCode` |
| `vaccineCode` | **`drugCode`, el mismo** |
| `vaccineName` | `drugName` |

**«Asignar sólo la abreviatura»**, acción del nivel 1: escribe `vaccineName` con la abreviatura elegida y **deja `vaccineWhodrugId`, `whoCode` y `vaccineCode` vacíos**. Es la rama cruda de la guarda, no un caso degradado.

**Formulario de diluyente** — `notificationDiluentSchema`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `diluentCatalogId` | `<DiluentSelect>` | no | FK al maestro. Deshabilitado si el maestro está vacío |
| `diluentName` | `<Input>` | condicional | ≤250. **Obligatorio si no hay `diluentCatalogId`** |
| `diluentCode` | `<Input>` | no | ≤250 |
| `batchNumber` | `<Input>` | no | ≤250 — **más ancho que el de la vacuna** |
| `expirationDate` | `<DateField>` | no | Sin regla cruzada |
| `reconstitutionDate` | `<DateField>` | no | **No posterior a `vaccinationDate` de su vacuna** |
| `reconstitutionTime` | `<TimeField>` | no | `HH:MM`. **No entra en ninguna comparación** |

**Las dos coherencias temporales se validan en el cliente antes de enviar**, y las dos comparan **sólo fechas**: `reconstitutionDate` contra `vaccinationDate` es un solo salto contra el padre directo —la coherencia con `eventDate` sale por transitividad— y nunca mira las horas, aunque las dos tablas guarden una.

**Códigos de error mapeados a campo:**

| Código | Destino |
|---|---|
| `NOTIFVAC_00X_VACCINE_REQUIRED` | `vaccineName` |
| `NOTIFVAC_00X_VACCINATION_AFTER_EVENT` | `vaccinationDate` |
| `NOTIFVAC_00X_WHODRUG_NOT_FOUND` | el `<WhodrugTreePicker>`, con texto que dice que la entrada fue retirada del diccionario |
| `NOTIFDIL_00X_DILUENT_REQUIRED` | `diluentName` |
| `NOTIFDIL_00X_RECONSTITUTION_AFTER_VACCINATION` | `reconstitutionDate` |
| `NOTIFDIL_00X_DILUENT_NOT_FOUND` | `diluentCatalogId` |

Los que no tienen campo van al toast, por `code`. **`AUTH_ROLE_FORBIDDEN` en un `004` o un `005A`** lleva su propio mensaje: corregir y retirar exige administrador en este despliegue, aunque crear no. Y un `404` sobre un diluyente dice que **su vacuna no está disponible**, no que el diluyente no exista — es la visibilidad heredada de dos niveles, y confundirlas manda al usuario a buscar una fila que sí está.

**Se envía el objeto completo en el `PUT`.** El backend hace el update diferencial; el cliente no calcula el diff.

### 3.6 Estados de la pantalla

**Lista de vacunas** (dentro de `NotificationStep`):

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Sin cabecera de notificación | La lista **no se renderiza**. Sin `notificationId` no hay padre al que colgar nada | — |
| Carga | Skeleton de 3 filas bajo el título | — |
| Vacío | **Sólo el título y el botón «Añadir vacuna»**, sin ilustración ni estado vacío — el patrón de `<SatelliteList>` de FE12b | — |
| Error | Mensaje del `EsaviApiError` por `code` + botón reintentar | `notificationVaccine.list.error` |
| Sin permiso | No se llega: el guard del asistente redirige | — |

**No hay «vacío con filtros»**, y es correcto: esta lista no tiene filtros ni paginación.

**`<WhodrugTreePicker>`** dentro del modal:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga de un nivel | El `<SearchableSelect>` de ese nivel deshabilitado con indicador | — |
| Diccionario sin importar (nivel 1 vacío) | El árbol **deshabilitado con su explicación**: el diccionario no está importado en este despliegue y la vacuna se registra por nombre | `whodrugTreePicker.notImported` |
| Nivel sin resultados con `search` | Texto dentro del desplegable, con recordatorio del mínimo de dos caracteres | `whodrugTreePicker.noResults` |
| Id resuelto | El árbol colapsa a un resumen con la vacuna elegida, el panel de información y un botón «Cambiar» | `whodrugTreePicker.change` |
| Panel con campo vacío | «No existe información adicional» — **se muestra, no se oculta**: la fila ausente y el dato ausente se leen igual y no lo son | `whodrugTreePicker.noInfo` |
| Error | Mensaje por `code` + reintentar, sin perder los ancestros ya elegidos | `whodrugTreePicker.error` |

**Un árbol vacío no es una pantalla rota.** Con el diccionario sin importar, la rama cruda sigue siendo válida y la explicación lo dice: se escribe el nombre a mano. Es la diferencia con `investigationVaccineAdministered` del paso 5, donde no hay salida y la sección entera se deshabilita (§5.5.4).

**Lista de diluyentes** dentro del modal de la vacuna:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Vacuna sin guardar | Sección **deshabilitada con su explicación**: hay que guardar la vacuna antes de añadirle diluyentes | `notificationDiluent.list.needsParent` |
| Carga | Skeleton de 2 filas | — |
| Vacío | Título y botón «Añadir diluyente» | — |
| Maestro sin semillas | `<DiluentSelect>` deshabilitado con su explicación; el diluyente se registra por nombre | `diluent.select.empty` |
| Error | Mensaje por `code` + reintentar | `notificationDiluent.list.error` |

**Expediente `CLOSED`:** toda la sección es de solo lectura —sin «Añadir», sin editar, sin borrar—, igual que el resto del asistente (§4.5). La comprobación vive entera en el cliente, como en FE11, FE12a y FE12b.

### 3.7 Responsividad y accesibilidad

- **Lista de vacunas → tarjetas** por debajo de `md`. Los tres campos que sobreviven: **`vaccineName`, `vaccinationDate` y `doseNumber`**. La marca de **sospechosa** va como distintivo visual sobre la tarjeta —un `<Badge>` con token semántico—, no como cuarto campo: es lo que se busca de un vistazo y no compite por una fila.
- **Lista de diluyentes → tarjetas** por debajo de `md`, con **dos** campos: `diluentName` y `batchNumber`. Son los dos que identifican el vial y bastan.
- **El modal de vacuna pasa a hoja completa** por debajo de `md`: son diez campos más una lista anidada, y un diálogo centrado no cabe.
- **El árbol se apila** en móvil: cinco desplegables a ancho completo, uno por línea, con el `matchCount` a la derecha de cada opción.
- La barra de acciones del modal queda **fija abajo**, con «Guardar» siempre alcanzable sin recorrer los diez campos.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- El árbol es navegable con teclado: `cmdk` da flechas y `Enter`, y **elegir un nivel devuelve el foco al nivel siguiente**, que es lo que convierte cinco desplegables en un recorrido y no en cinco paradas.
- El colapso del árbol al resolverse el id **anuncia el cambio** con una región viva: el usuario que no ve la pantalla tiene que enterarse de que ya no hay que elegir nada más.
- Las acciones de editar y eliminar de cada fila llevan `aria-label` por i18n, nombrando la fila — «Eliminar la vacuna Rotarix», no «Eliminar».
- El diálogo de baja de una vacuna **nombra sus diluyentes** en el texto, no sólo en un icono.

### 3.8 Claves i18n nuevas

Van a los **tres** archivos de idioma. `npm run i18n:check` exige paridad exacta.

| Clave | Uso |
|---|---|
| `notificationVaccine.list.title` | Título de la lista |
| `notificationVaccine.list.add` | Botón «Añadir vacuna» |
| `notificationVaccine.list.error` | Error de la lista |
| `notificationVaccine.form.title.create` / `.edit` | Título del modal |
| `notificationVaccine.field.whoCode` | Etiqueta del texto de solo lectura |
| `notificationVaccine.field.vaccineCode` | Etiqueta, con ayuda que explica que admite el código nacional |
| `notificationVaccine.field.vaccineName` | Etiqueta |
| `notificationVaccine.field.isSuspected` | Casilla «Vacuna sospechosa» |
| `notificationVaccine.field.vaccinationDate` · `.vaccinationTime` · `.doseNumber` · `.batchNumber` · `.expirationDate` · `.notes` | Etiquetas |
| `notificationVaccine.badge.suspected` | Distintivo de la tarjeta |
| `notificationVaccine.error.vaccineRequired` | Guarda de contenido mínimo |
| `notificationVaccine.error.vaccinationAfterEvent` | Coherencia temporal |
| `notificationVaccine.error.whodrugNotFound` | La entrada fue retirada del diccionario |
| `notificationVaccine.delete.confirm` | Texto del diálogo, con el nombre de la vacuna |
| `notificationVaccine.delete.confirmWithDiluents` | Ídem, nombrando cuántos diluyentes quedarán inalcanzables |
| `notificationVaccine.complete.missingVaccine` | Obligatorio de proceso: al menos una vacuna |
| `notificationVaccine.complete.missingSuspected` | Obligatorio de proceso: al menos una sospechosa |
| `notificationDiluent.list.title` · `.add` · `.error` | Lista anidada |
| `notificationDiluent.list.needsParent` | Sección deshabilitada mientras la vacuna no esté guardada |
| `notificationDiluent.field.diluentCatalogId` · `.diluentName` · `.diluentCode` · `.batchNumber` · `.expirationDate` · `.reconstitutionDate` · `.reconstitutionTime` | Etiquetas |
| `notificationDiluent.error.diluentRequired` | Guarda de contenido mínimo |
| `notificationDiluent.error.reconstitutionAfterVaccination` | Coherencia temporal |
| `notificationDiluent.error.parentUnavailable` | El `404` heredado: la vacuna no está disponible |
| `notificationDiluent.delete.confirm` | Diálogo de baja |
| `diluent.select.empty` | Maestro sin semillas |
| `whodrugTreePicker.level.abbreviation` · `.drugName` · `.maHolders` · `.form` · `.strength` | Las cinco etiquetas del plugin |
| `whodrugTreePicker.nullValue` | «Sin especificar», la cara visible de `__NULL__` |
| `whodrugTreePicker.matchCount` | «{{count}} coincidencias» junto a cada opción |
| `whodrugTreePicker.assignAbbreviation` | Acción «Asignar sólo la abreviatura» |
| `whodrugTreePicker.change` | Botón para reabrir el árbol resuelto |
| `whodrugTreePicker.notImported` | Diccionario sin importar |
| `whodrugTreePicker.noResults` · `.noInfo` · `.error` | Los tres restantes |
| `whodrugTreePicker.info.*` | Las siete filas del panel de información |
| `notification.roleForbidden.editDelete` | El aviso de §10.4, compartido con FE12b |
| `esaviCase.eventDate.warnVaccines` | El aviso del paso 2 (§8) |

---

## 4. Plan de implementación

Catorce pasos. Cada uno deja el proyecto compilando y arrancable, y cada uno se puede committear solo.

1. **Contratos.** Tres entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs` —`notificationVaccine`, `notificationDiluent`, `vaccineWhodrug`— y `npm run contracts:sync`.
   *Verificación:* los tres archivos existen en `src/contracts/` y `npm run build` sale en 0. `CreateNotificationDiluentInput` **no** tiene `notes`.

2. **`<SearchableSelect>`.** La primitiva de `ARCHITECTURE.md` §4.3 en `shared/components/`, sobre `cmdk`: opciones, texto de búsqueda controlado, mínimo de caracteres configurable, estado de carga, estado vacío y estado deshabilitado con explicación.
   *Verificación:* una historia mínima con veinte opciones filtra con el teclado, no monta el listado entero antes del mínimo de caracteres, y el desplegable deshabilitado muestra su explicación en vez de abrirse vacío.

3. **`<WhodrugTreePicker>`.** Los cinco niveles con sus cinco hooks de consulta, el borrado en cascada de los niveles inferiores al cambiar uno superior, el `matchCount` junto a cada opción, la resolución anticipada cuando `matchCount === 1`, el colapso del nivel por `count === total`, el envío del centinela `__NULL__`, la lectura de la fila con `ESAVI-WHODRUG-003` y el panel de información de siete filas — **con `formTranslations ?? form`, `ingredientTranslation` y `noDose` en singular**.
   *Verificación:* elegir una abreviatura cuya primera opción tenga `matchCount === 1` resuelve el id **sin dibujar los cuatro niveles restantes**; cambiar la abreviatura después vacía los cuatro de abajo; una opción con `value: null` se muestra «sin especificar» y viaja como `__NULL__`; con el nivel 1 vacío el componente aparece deshabilitado con su explicación, no como un desplegable vacío.

4. **El maestro de diluyentes.** Declaración `createResource('diluent')` contra `ESAVI-DILUENT-002A` y la envoltura `<DiluentSelect>` sobre `<SearchableSelect>`, con `staleTime` de 30 minutos.
   *Verificación:* con el maestro sin semillas —el estado real de todo despliegue hoy— el selector sale deshabilitado con su explicación y **no** rompe el formulario: el diluyente se puede guardar por nombre.

5. **Declaración de los dos recursos.** `features/notification/api.ts` gana `notificationVaccineResource` (por `caseId`, `ESAVI-NOTIFVAC-006`) y `notificationDiluentResource` (por `vaccineId`, `ESAVI-NOTIFDIL-002A`), con los códigos de operación citados en cada hook.
   *Verificación:* `grep -rn "ESAVI-NOTIFVAC\|ESAVI-NOTIFDIL" src/features/notification/api.ts` devuelve los ocho códigos; el hook de diluyentes acepta `enabled` y no dispara sin `vaccineId`.

6. **Schemas Zod.** `notificationVaccineSchema` y `notificationDiluentSchema` en `features/notification/schemas.ts`, con las dos guardas de contenido mínimo como refinamientos sobre el objeto completo y las dos coherencias temporales como refinamientos con contexto —`eventDate` y `vaccinationDate` entran como argumento, no se leen de una caché dentro del schema—.
   *Verificación:* pruebas unitarias del schema: borrar `vaccineName` de una fila sin FK falla; `vaccinationDate` igual a `eventDate` pasa y un día después falla; `reconstitutionDate` con hora posterior pero **mismo día** que `vaccinationDate` pasa.

7. **Lista de vacunas, solo lectura.** `VaccineList.tsx` con `<SatelliteList>`, condicionada a que exista `notification`, con el distintivo de sospechosa y el colapso a tarjetas de §3.7. Sin alta ni edición todavía.
   *Verificación:* un caso con vacunas cargadas las lista en orden de creación; sin cabecera de notificación la sección no se renderiza; en 375px la tarjeta muestra los tres campos y el body no hace scroll horizontal.

8. **Alta y edición de vacuna, fase 1.** `VaccineFormDialog.tsx` con los diez campos, el `<WhodrugTreePicker>` en sección colapsable, el volcado de los tres textos al resolverse el id, `whoCode` como texto de solo lectura y la acción «Asignar sólo la abreviatura».
   *Verificación:* elegir en el árbol rellena `vaccineCode` y `vaccineName` y muestra `whoCode`; sobrescribir `vaccineCode` a mano no cambia `whoCode`; «Asignar sólo la abreviatura» deja la fila **sin FK** y se guarda; el modal se abre sobre datos de la caché, no sobre una copia guardada al listar.

9. **Diluyentes, fase 2 del modal.** `DiluentList.tsx` y `DiluentFormRow.tsx` dentro del modal de la vacuna: deshabilitados mientras no haya `vaccineId`, habilitados en cuanto el `POST` de la vacuna responde, con lectura perezosa por `ESAVI-NOTIFDIL-002A` y edición en línea.
   *Verificación:* abrir «Añadir vacuna» muestra la sección deshabilitada con su explicación; pulsar «Guardar» la habilita **sin cerrar el modal**; abrir el modal de una vacuna existente dispara **una** consulta de diluyentes y sólo la de esa vacuna.

10. **Bajas.** `005A` en las dos entidades, con diálogo de confirmación que nombra la fila. El de la vacuna **pide primero sus diluyentes** y los nombra en el texto.
    *Verificación:* dar de baja una vacuna con dos diluyentes muestra un diálogo que dice que quedarán inalcanzables; tras confirmar, la lista y la clave de diluyentes de esa vacuna quedan invalidadas y ninguna otra.

11. **Obligatorios de proceso.** `notificationCompleteSchema` de FE12a gana dos: al menos una vacuna, y al menos una con `isSuspected`.
    *Verificación:* con cero vacunas, «Completar etapa» **lista los dos pendientes** en vez de deshabilitarse en silencio; con una vacuna no sospechosa, lista sólo el segundo; el guardado normal sigue funcionando en los dos casos.

12. **El aviso de `eventDate` en el paso 2.** El `<DateField>` de `eventDate` lee `['notificationVaccine','byCase',caseId]` y, si la fecha nueva dejaría vacunas con `vaccinationDate` posterior, las lista y advierte. **Avisa y deja guardar.** Va aquí y no antes porque necesita el recurso del paso 5.
    *Verificación:* con una vacuna del 10 de marzo, poner `eventDate` el 5 de marzo muestra el aviso nombrando la vacuna y permite continuar; poner el 10 no avisa; sin vacunas cargadas, tampoco.

13. **i18n.** Las claves de §3.8 en `es`, `en` y `nl`.
    *Verificación:* `npm run i18n:check` sale en 0.

14. **Tests de integración.** Con MSW: la lista de vacunas, el modal en sus dos fases, el árbol con un `matchCount === 1` en el nivel 1, la rama cruda y las dos coherencias temporales.
    *Verificación:* `npm test` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Las quince rutas de §3.2 se consumen con su código de operación citado en la declaración del recurso o en el hook.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] La lista de vacunas **no se renderiza** sin fila de `notification`.
- [ ] La guarda de contenido mínimo funciona en las dos entidades: un `PUT` que borra `vaccineName` de una fila sin FK falla, y otro que borra `diluentName` de una fila sin `diluentCatalogId` también.
- [ ] `vaccinationDate` igual a `eventDate` se guarda; un día posterior no.
- [ ] `reconstitutionDate` el mismo día que `vaccinationDate` se guarda **aunque la hora sea posterior**: la comparación no mira las horas.
- [ ] Elegir en el árbol escribe `vaccineWhodrugId`, `whoCode`, `vaccineCode` y `vaccineName`. Sobrescribir `vaccineCode` a mano **no** cambia `whoCode`.
- [ ] `whoCode` no es un input: `grep -rn "whoCode" src/features/notification/` no lo asocia a ningún control editable.
- [ ] Una opción con `matchCount === 1` resuelve el id **en el nivel en que aparece**, sin dibujar los niveles inferiores.
- [ ] Cambiar un nivel superior vacía todos los inferiores.
- [ ] Una opción con `value: null` se muestra «sin especificar» y viaja como `__NULL__`.
- [ ] Con el nivel 1 vacío, el árbol sale deshabilitado con su explicación y **la vacuna se puede registrar por nombre**.
- [ ] «Asignar sólo la abreviatura» guarda una fila **sin FK** y con `vaccineName` relleno.
- [ ] Con el maestro de diluyentes sin semillas, `<DiluentSelect>` sale deshabilitado con su explicación y el diluyente se guarda por `diluentName`.
- [ ] Abrir «Añadir vacuna» deja la sección de diluyentes deshabilitada; guardar la vacuna la habilita **sin cerrar el modal**.
- [ ] Abrir el modal de una vacuna dispara **una sola** consulta de diluyentes, y sólo la de esa vacuna. Al entrar al paso, **ninguna**.
- [ ] Dar de baja una vacuna con diluyentes lo advierte nombrándolos, e invalida su clave de diluyentes junto con la lista.
- [ ] Un `404` sobre un diluyente dice que **su vacuna no está disponible**, no que el diluyente no exista.
- [ ] Con cero vacunas, «Completar etapa» lista los dos obligatorios pendientes y el guardado normal sigue funcionando.
- [ ] Adelantar `eventDate` en el paso 2 por delante de una vacuna cargada **avisa nombrándola y deja guardar**.
- [ ] Un `403 AUTH_ROLE_FORBIDDEN` en un `004` o un `005A` muestra el aviso de §10.4, no un error genérico.
- [ ] Las claves nuevas existen en `es`, `en` y `nl`; `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/notification/ src/shared/components/SearchableSelect.tsx src/shared/components/WhodrugTreePicker.tsx`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** La lista de vacunas colapsa a tarjetas con los tres campos de §3.7, la de diluyentes con dos, el modal pasa a hoja completa, el árbol se apila, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` el paso se usa entero —crear vacuna y diluyente funcionan— y el `403` de los `004`/`005A` se explica sin pantalla en blanco. Con `ANALYTICS` no se llega: el guard del asistente redirige.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders, el «sin especificar» del árbol, el `matchCount` y los `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState` —el modal guarda el id de la fila, no la fila—, y los cinco valores de ancestro del árbol son la excepción razonada, no una copia del servidor.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** `<DiluentSelect>` propio, sobre `createResource('diluent')`. `diluentCatalog` es una entidad con su grupo de rutas —`ESAVI-DILUENT-001`…`005B`—, no un `catalogType`. `CASE-PROCESS.md` §5.4b dice «`<CatalogSelect>` sobre `ESAVI-DILUENT-002A`» y esa frase confunde dos cosas: el componente que resuelve `catalogItem` por tipo no sirve aquí.
- **No:** una prop nueva en `<CatalogSelect>` para aceptar un recurso arbitrario. Ensucia una primitiva que usan cuarenta pantallas para resolver un caso; la envoltura es más barata y no se propaga.
- **Sí:** modal de vacuna en **dos fases**. Un diluyente exige `vaccineId` y el id vuelve en la respuesta del `POST`; es el mismo mecanismo que FE12a usa para cabecera → rama.
- **No:** acumular diluyentes en memoria y escribirlos en cascada tras el `POST` de la vacuna. Es una escritura múltiple que puede fallar a medias, y dejaría filas huérfanas de las que el usuario no se entera. FE12b evitó exactamente esto en la compuerta de `takesMedication`.
- **Sí:** el árbol **inline** en el modal, en sección colapsable que se cierra al resolverse el id. Elegir la vacuna es lo primero que se hace y el resumen ocupa dos líneas después.
- **No:** el árbol en un sub-diálogo. Un modal sobre modal complica el foco, deja el `Escape` sin destino obvio y en móvil apila dos hojas completas.
- **Sí:** lectura **perezosa** de diluyentes, una consulta por modal abierto. Es la única forma con `NOTIFDIL-002A` como única lectura.
- **No:** el recuento de diluyentes en cada fila de la lista de vacunas. Obligaría a N consultas al entrar al paso para pintar un número. Se acepta que la fila no lo diga.
- **Sí:** «al menos una vacuna» **y** «al menos una sospechosa» como obligatorios de proceso. La segunda se consideró opcional —la sospecha puede no estar decidida al notificar— y se decidió exigirla: una notificación que no señala ninguna vacuna sospechosa no dice a qué se atribuye el evento, que es lo que la etapa existe para recoger. No bloquea el guardado; sólo el avance.
- **Sí:** `whoCode` visible y de **solo lectura**. Que difiera de `vaccineCode` significa que alguien corrigió el código a mano, y eso sólo se sostiene si no es editable. Es un dato de análisis más que de captura, y puede ocultarse más adelante sin tocar nada más que el render.
- **No:** derivar `whoCode` y `vaccineCode` en el servidor. SPEC F22 §6 es explícito: el servicio no los toca ni en el `001` ni en el `004`. Los rellena el cliente o quedan vacíos.
- **Sí:** el aviso de `eventDate` entra en **este** spec, con su §8. Sin ello la regla no tiene dueño y el `400` aparece en un paso que el usuario no está mirando.
- **No:** bloquear el guardado del paso 2 hasta corregir las vacunas. El backend no valida `eventDate` contra ellas; ser más estricto que el servidor deja al usuario sin salida en una pantalla que no es la del problema.
- **Sí:** asumir `USER` en las ocho rutas de las dos entidades, según §10.4, y explicar el `403` en vez de esconder el botón. Es la misma decisión que FE12b, y por la misma razón: el `useCan()` que replicara el `ADMIN` habría que quitarlo después.
- **Sí:** `staleTime` de 30 minutos en las seis claves del árbol. El diccionario sólo cambia con `ESAVI-WHODRUG-007`, que es SUPERADMIN.
- **No:** preseleccionar el diluyente con `vaccineWhodrug.diluent`. El texto del diccionario dice qué diluyente *esperaba* la vacuna; la fila registra *el lote que se usó*. Preseleccionar uno con el otro fabrica un dato que nadie introdujo.
- **No:** bloquear el spec hasta que `diluentCatalog` tenga semillas. Las FK son nullables y la guarda se satisface con `diluentName`: el registro funciona hoy, en crudo, y el selector deshabilitado con su explicación es comportamiento general de la primitiva (§10.5).

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Si el backend no devuelve `vaccineWhodrugId` cuando `matchCount === 1`, la resolución anticipada no ocurre y el usuario baja cinco niveles en cada vacuna | Se verifica contra el backend real en el paso 3 del plan, antes de construir el modal. Si no llega, el componente cae a resolver sólo en el nivel 5 y el spec gana una nota de implementación |
| El diálogo de baja de una vacuna pide sus diluyentes antes de confirmar, lo que añade una consulta a una acción que hoy no la tiene | Es una consulta por baja, no por fila listada. Sin ella el usuario no sabe qué está retirando, y el `404` heredado aparecería después sin explicación |
| El usuario cierra el modal tras la fase 1 y cree que no guardó nada | La vacuna **sí quedó creada** y aparece en la lista al cerrar. El botón de la fase 1 dice «Guardar y añadir diluyentes», no «Aceptar» |
| Cinco niveles con `staleTime` de 30 min pueden servir un diccionario recién importado desde caché | El `007` es SUPERADMIN y ocurre en el despliegue, no en sesión. Un recargado de la pestaña lo resuelve, y no justifica pagar la consulta en cada paso entre niveles |
| Los ancestros viajan exactos y un `trim` accidental rompería el nivel siguiente en silencio | Los valores se pasan tal como los devolvió el nivel anterior, sin tocarlos, y hay un test que lo fija con un valor con espacios |

---

## 8. Impacto en pantallas existentes

- **`<DateField>` de `eventDate` en el paso 2** (FE10). Gana la comprobación contra `['notificationVaccine','byCase',caseId]`: si la fecha nueva dejaría vacunas con `vaccinationDate` posterior, las lista y advierte con `esaviCase.eventDate.warnVaccines`. **Avisa, no bloquea.** Es el único punto donde este spec modifica una pantalla ya construida.
- **`notificationCompleteSchema`** (FE12a). Gana dos obligatorios de proceso: al menos una vacuna, y al menos una con `isSuspected`. No cambia el guardado, sólo la lista de pendientes bajo «Completar etapa».
- **`<SatelliteList>`** (FE12b). Se consume **sin cambios**. La lista anidada de diluyentes usa la misma primitiva en su variante de edición en línea; si hiciera falta una variante, es una prop nueva, nunca una copia local.
- **`<CatalogSelect>`** no cambia. `<DiluentSelect>` es una envoltura aparte, no una variante suya.
- **`CASE-PROCESS.md` §5.4b** gana una precisión: donde dice «`<CatalogSelect>` sobre `ESAVI-DILUENT-002A`» debe decir un selector sobre el recurso `diluent`, que es una entidad propia y no un `catalogType`.

---

## Lo que **no** está en este spec

- El embarazo y sus complicaciones (FE12d).
- La lista de vacunas administradas del paso 5, que reutiliza el árbol sin rama cruda (FE13).
- El mantenimiento y la importación del maestro `vaccineWhodrug`.
- Sembrar `diluentCatalog`, incluida la entrada «Desconocido».
- Reordenar filas de satélite.
- Reactivaciones y purgas.
- El recuento de diluyentes en la fila de la lista de vacunas.

Cada uno de esos, si aterriza, va en su propio spec.

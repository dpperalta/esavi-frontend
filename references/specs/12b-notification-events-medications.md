# SPEC FE12b — Paso 4: eventos y medicación concomitante

> **Estado:** Aprobado
> **Depende de:** SPEC FE08 (armazón del wizard), SPEC FE12a (la cabecera de la notificación — sin su fila no hay `notificationId` al que colgar nada, y de ella sale `takesMedication`). Del backend: SPEC F16 (notificationEvent), SPEC F21 (notificationMedication), SPEC F15 (diagnosticTerm y su resolución), SPEC F55 (búsqueda de términos MedDRA) y SPEC F56 (espejo del estándar WHODrug y buscador de medicación concomitante).
> **Fecha:** 2026-09-05
> **Objetivo:** Las dos primeras listas de satélites del paso 4 —los diagnósticos del ESAVI y la medicación concomitante— con sus dos buscadores contra maestro, y las tres primitivas compartidas que nacen con ellas.

---

## 1. Por qué existe este spec

**FE12a deja el paso 4 con una descripción en texto libre y sin un solo diagnóstico.** La cabecera recoge `esaviDescription`, la gravedad y el desenlace; qué le pasó al paciente —el término clínico, cuándo empezó, si es el evento principal— vive en `notificationEvent`, y esa tabla no la toca ningún spec todavía. Un caso notificado hoy dice «tuvo fiebre alta y convulsiones» en un párrafo que ningún análisis puede contar.

**Es el primero de los tres specs en que se partió el paso 4** (`CASE-PROCESS.md` §9, decidido el 2026-09-04). Los seis satélites juntos son 64 columnas, dos niveles de anidamiento y cuatro primitivas nuevas — más de lo que FE12a abarcó con 33 columnas y dieciséis pasos. El corte es `FE12b` (eventos y medicación) → `FE12c` (vacunas y diluyentes) → `FE12d` (embarazo y complicaciones), y **este spec va primero porque escribe `<SatelliteList>`**, que los otros dos consumen sin volver a escribirla.

**Es el lado cliente de tres specs del backend.** SPEC F16 y SPEC F21 describen las dos tablas. SPEC F55 y SPEC F56 aportan los dos maestros que este spec conecta por primera vez: los términos de MedDRA y el espejo del estándar WHODrug. Y hay una regla que no está en ninguno de los cuatro: la resolución del término contra `diagnosticTerm` —tres ramas según `esaviCode` y `source`, con acuñación en una de ellas— vive en el servicio de eventos y es la razón por la que **lo que se envía no es lo que vuelve**: `esaviName` acaba siendo el del maestro y `esaviRawName` guarda lo que escribió el notificador sólo si difiere.

**Es también el spec que retira el último texto libre sin maestro del paso 4.** Hasta el 2026-09-04, `medicationName` y `medicationCode` eran dos cadenas que nadie validaba: *«free text with no master and no foreign key behind it»*, en palabras del propio modelo. Dos personas escribían el mismo medicamento de tres maneras y ninguna consulta agregada sobre medicación concomitante era fiable. `ESAVI-WHODPROD-006` existe desde entonces y este spec lo consume.

**Tres primitivas que este spec deja construidas para los que vienen después:**

- **`<SatelliteList>`**, el patrón canónico de §5.0 —lista con «Añadir», alta y edición en modal— escrito una vez. Aparece **cuatro veces en el paso 4 y diez en el paso 5**. Es la primitiva que más se repite de todo el expediente.
- **`<TermSearchField>`**, el combobox de búsqueda contra un maestro, con sus dos envolturas: **`<MeddraSearchField>`** y **`<WhodrugProductSearchField>`**. Los dos buscadores de este spec son la misma forma —mínimo de caracteres, rebote, `{ count, rows }`, degradación a texto libre— y `CONVENTIONS.md` §10.4 prohíbe escribirla dos veces. FE12d reutiliza la de MedDRA para las complicaciones del embarazo.
- **`<TimeField>`**, `HH:MM` sin obligar a inventar los segundos. Lo estrena `startTime` aquí y lo consumen `vaccinationTime` y `reconstitutionTime` en FE12c.

**Y cierra una compuerta que hoy no tiene cierre.** `takesMedication` gobierna la lista de medicación (`CASE-PROCESS.md` §5.4b), y el documento la clasificaba como el caso extremo de §7.3: *«hay compuertas que sólo se pueden avisar»*, porque borrar N filas al cambiar una respuesta es una cascada que puede fallar a medias. **Este spec la resuelve al revés y mejor:** con filas cargadas, la respuesta no se puede cambiar hasta que el usuario las borre de una en una, viéndolas. No hay cascada, no hay escritura múltiple que falle a medias, y no quedan datos huérfanos. Es una corrección de la referencia, no una interpretación de ella, y va en el primer paso del plan.

---

## 2. Alcance

**Dentro:**

- **Tres primitivas nuevas en `shared/components/`**, ninguna específica de esta pantalla:
  - **`<SatelliteList>`** — el patrón canónico de `CASE-PROCESS.md` §5.0: título, botón «Añadir», filas con acciones de editar y eliminar, colapso a tarjetas por debajo de `md`, y **lista vacía sin estado vacío**: sólo el título y el botón.
  - **`<TermSearchField>`** — el combobox de búsqueda contra maestro, parametrizado por hook de consulta, mínimo de caracteres, rebote y política de degradación. Más sus dos envolturas: **`<MeddraSearchField>`** (`ESAVI-MEDDRA-006`, 3 caracteres, 400 ms) y **`<WhodrugProductSearchField>`** (`ESAVI-WHODPROD-006`, 3 caracteres, 300 ms).
  - **`<TimeField>`** — `HH:MM`, sin pedir los segundos.
- **`notificationEvent` completo**: sus trece columnas, la resolución del término con sus tres ramas de `source`, las dos reglas de «otro evento» y `isMainEsavi` como **casilla por fila**, con varios eventos principales admitidos.
- **`notificationMedication` completo**: sus once columnas, la regla simétrica de «otra medicación», el buscador de WHODrug con sus tres caminos de entrada (§3.5) y los dos `<CatalogSelect>` que hoy salen vacíos por §10.5 sin parecer rotos.
- **Las dos listas dentro de `NotificationStep`**, que **no se renderizan hasta que existe la fila de `notification`**: sin `notificationId` no hay padre al que colgar nada.
- **La compuerta de `takesMedication` en su forma nueva**: con filas activas cargadas, la respuesta de la cabecera **no se puede cambiar** desde `'YES'`; hay que borrar las filas primero. Y si al entrar la respuesta ya no es `'YES'` y hay filas, **la lista se muestra igual** con el aviso de discrepancia.
- **Un obligatorio de proceso nuevo en `notificationCompleteSchema` de FE12a**: al menos un evento. No bloquea el guardado, se lista bajo «Completar etapa».
- **Bajas con `005A`**, con diálogo de confirmación que nombra la fila. Sin toggle de «mostrar inactivos».
- **El aviso de rol mientras §10.4 siga a medias**: un `403 AUTH_ROLE_FORBIDDEN` al editar o al borrar dice que **corregir y retirar** contenido clínico exige un administrador en este despliegue, aunque crearlo no.
- **Mapeo de los códigos de error** de las dos entidades y de los dos buscadores, a campo o a toast, y las claves i18n nuevas en `es`, `en` y `nl`.
- **La corrección de `CASE-PROCESS.md`** §5.4b y §7.3: la compuerta de `takesMedication` deja de ser «se avisa y no se toca nada» y pasa a «no se puede cambiar mientras haya filas». Y la nota de §5.4b que dice que `medicationCode` no tiene maestro detrás, que dejó de ser cierta a medias.
- **Tests de integración** de las dos listas dentro de `NotificationStep`.

**Fuera de alcance (otros specs):**

- **Vacunas y diluyentes** — `notificationVaccine`, `notificationDiluent`, `<WhodrugTreePicker>` y `<SearchableSelect>`. Es **FE12c**, y con él llega el segundo obligatorio de proceso: al menos una vacuna.
- **Embarazo y complicaciones** — `notificationPregnancy`, `notificationPregnancyComplication`, la compuerta de §7.4 y la derivación de §6.5. Es **FE12d**, que reutiliza `<SatelliteList>` y `<MeddraSearchField>` sin escribirlas.
- **La pantalla de inspección del espejo WHODrug** (`ESAVI-WHODPROD-002B`, ADMIN) y **la de sincronización** (`ESAVI-WHODPROD-007`, SUPERADMIN). Son administración del catálogo, no del asistente, y merecen su propio spec junto al resto de mantenimiento de maestros.
- **Enlazar `notificationMedication` con el catálogo por clave foránea.** El SPEC F56 lo dejó fuera a propósito y este spec no lo adelanta: no hay FK, no hay resolución implícita en el servidor y `medicationCode` sigue sin validarse. El cliente rellena dos textos; la fila conserva lo que se leyó.
- **Reordenar filas.** `sortOrder` lo asigna un disparador, ningún servicio lo escribe y un índice único parcial haría fallar cualquier intento. Si el funcional lo pide, es una petición al otro repositorio.
- **Revisar los términos acuñados.** La rama `LOCAL` crea entradas marcadas `autoCreated`/`PENDING` en `diagnosticTerm`; depurarlas es una pantalla de administración del catálogo.
- **Importar los diccionarios.** `ESAVI-DIAGTERM-007` y `ESAVI-WHODRUG-007` son SUPERADMIN y de otra pantalla. Aquí sólo se lee la consecuencia de que no estén importados o sincronizados: un `404` o un `503` que se explican como estado del despliegue.
- **Listados y detalle por id.** Los `002A` por notificación, los `002B` con inactivas y los `003` no se consumen: esta pantalla lee siempre por caso con los dos `006`.
- **Reactivaciones y purgas.** Los `005B` y `005C` son SUPERADMIN y no entran en el asistente.
- **Persistir el contenido de los modales en `draftsStore`.** El borrador de FE12a cubre el formulario de la cabecera; una fila de satélite se guarda al aceptar el modal y no tiene hueco entre teclear y guardar que merezca persistirse.
- **La comprobación de `CLOSED` en el servidor** (§10.3). Sigue viviendo entera en el cliente, igual que en FE11 y FE12a.

---

## 3. Diseño

### 3.1 Pantallas y rutas

**No hay ruta nueva ni entrada de menú nueva.** Las dos listas viven dentro del paso 4 que FE12a ya construyó, en la ruta que declaró FE08.

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Lista de eventos | `/esavi-cases/:id/wizard/notification` | `features/notification/EventList.tsx` | el de `CaseWizardPage` (FE08), `<RequireRole level={USER}>` |
| Alta/edición de evento | ídem, en modal | `features/notification/EventFormDialog.tsx` | ídem |
| Lista de medicación | ídem | `features/notification/MedicationList.tsx` | ídem |
| Alta/edición de medicación | ídem, en modal | `features/notification/MedicationFormDialog.tsx` | ídem |

**El guard heredado es `USER` y el spec no lo estrecha.** Los dos `001` y los dos `006` son `USER`, y también lo son los dos buscadores; lo que sigue en `ADMIN` son los `004` y los `005A` (§3.2). Es la decisión de `CASE-PROCESS.md` §10.4: no se replica en el cliente una restricción que está a medio retirar, porque el `useCan()` que la implementara habría que quitarlo después y, mientras tanto, escondería el contenido clínico del paso sin decir por qué. El `403` se maneja con un mensaje que lo explica (§3.6), que es lo contrario de esconder el botón.

### 3.2 Endpoints consumidos

**Escrituras y lecturas propias**, copiadas textualmente de `references/API-ROUTES.md`, regenerado el 2026-09-05:

```
POST   /api/notification-events            ESAVI-NOTIFEVT-001   USER    crear evento
GET    /api/notification-events/case/:id   ESAVI-NOTIFEVT-006   USER    eventos del caso
PUT    /api/notification-events/:id        ESAVI-NOTIFEVT-004   ADMIN   actualizar evento
DELETE /api/notification-events/:id        ESAVI-NOTIFEVT-005A  ADMIN   baja lógica

POST   /api/notification-medications            ESAVI-NOTIFMED-001   USER    crear medicación
GET    /api/notification-medications/case/:id   ESAVI-NOTIFMED-006   USER    medicación del caso
PUT    /api/notification-medications/:id        ESAVI-NOTIFMED-004   ADMIN   actualizar
DELETE /api/notification-medications/:id        ESAVI-NOTIFMED-005A  ADMIN   baja lógica

GET    /api/meddra/search                  ESAVI-MEDDRA-006     USER    términos de MedDRA
GET    /api/whodrug-products/search        ESAVI-WHODPROD-006   USER    medicación concomitante
```

> **§10.4 se aplicó a medias, y hay que leerlo con cuidado.** El 2026-09-04 bajaron a `USER` los cuatro `001` del paso 4 y el `NOTIFIER-005A` de §10.2. Los `004` y los `005A` **siguen en `ADMIN`**. El resultado es que un USER puede **crear** un evento o una medicación y no puede **corregirlo ni retirarlo**: escribe una fila mal y la fila se queda. Nada explica que crear contenido clínico sea de USER y corregirlo de ADMIN, así que parece un descuido al aplicar la petición y no una política. El spec se sigue diseñando asumiendo `USER` en las seis, según §10.4; lo que cambia mientras tanto es el texto del aviso, no el diseño.

**Contrato de `ESAVI-WHODPROD-006`**, del SPEC F56 §3.5 y §3.7:

| Pieza | Valor |
|---|---|
| `term` | **Obligatorio, mínimo 3 caracteres tras `trim`**, máximo 250. Por debajo es `400` del validador |
| `limit` | Opcional, por defecto **20**, tope **50** |
| Respuesta | `{ term, count, rows: [{ code, name }] }` |
| Grano | **Un medicamento por fila** (`DISTINCT ON drugCode`): las N presentaciones colapsan en una |
| `count === limit` | Hubo más resultados. El cliente afina el término; **no hay paginación** |
| Limitador | **Ninguno.** Consulta el espejo local, no un API licenciado |
| Errores | `503 WHODPROD_006_NOT_CONFIGURED`, `500 WHODPROD_006_FETCH_FAILED` |

**Dos políticas del servidor que el cliente no puede tocar, y conviene saberlas al explicar un resultado vacío:** se excluyen los ATC configurados —las vacunas, `J07`— y se filtra por el país del despliegue. No son parámetros. Un medicamento administrado que no se comercializa en el país **no aparece en el buscador**, y ése es exactamente el caso que el texto libre tiene que seguir cubriendo (§3.5).

**Qué no se consume, y por qué:**

- **`ESAVI-WHODPROD-002B` y `-007`.** Inspeccionar el espejo es ADMIN y sincronizarlo es SUPERADMIN; las dos son pantallas de mantenimiento del catálogo, no del asistente.
- **Los dos `002A` por notificación** (`/notification-events/notification/:id`). Los `006` por caso devuelven lo mismo con el `caseId` que ya está en la URL, sin obligar a esperar a que resuelva la cabecera para poder pedir la lista.
- **Los dos `003` por id.** Editar una fila abre el modal con lo que ya trajo el `006`; una segunda lectura de lo mismo no añade nada.
- **Los dos `002B` de los satélites.** Son ADMIN e incluyen inactivas, y el asistente no muestra filas dadas de baja.
- **Los `005B` y `005C`.** Reactivar y purgar son SUPERADMIN y no entran en el asistente.
- **`ESAVI-DIAGTERM-*` directamente.** El catálogo clínico no se consulta ni se escribe desde aquí: la resolución la hace el servicio de eventos a partir de `esaviCode` y `source`, y **es la única puerta al término**. El cliente no la abre.

**Lecturas que ya implementaron specs anteriores:**

```
GET  /api/case-workflows/case/:id     ESAVI-CASEFLOW-006   USER   estado y stages (FE08)
GET  /api/notifications/case/:id      ESAVI-NOTIFCN-006    USER   notificationId y takesMedication (FE12a)
GET  /api/catalog-types               ESAVI-CATTYPE-002    USER   typeCode -> catalogTypeId
GET  /api/catalog-items/type/:id      ESAVI-CATITEM-002A   USER   pharmaceuticalForm, administrationRoute
```

### 3.3 Tipos del contrato

**Dos archivos nuevos por `contracts:sync`**, con dos entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`:

```ts
// contracts/notificationEvent.ts — espejo de esavi-backend/src/types/notificationEvent/
export interface CreateNotificationEventInput {
  notificationId: string;
  esaviName: string;              // obligatorio, <=250, trim
  esaviCode?: string | null;      // dispara la resolución
  source?: 'MEDDRA' | 'WHODRUG' | 'LOCAL' | 'OTHER';  // aceptado, no es columna
  isMainEsavi?: boolean;
  startDate?: string | null;
  startTime?: string | null;
  isOtherEsavi?: boolean;
  otherDescription?: string | null;
  notes?: string | null;
  isActive?: boolean;
}
```

`notificationMedication.ts` trae `CreateNotificationMedicationInput` con las once columnas de §5.4b. En las dos, `notificationId` es obligatorio al crear e **inmutable después**: el servicio del `004` lo ignora aunque llegue.

**Tres campos que no son columnas de la tabla, y el formulario tiene que saberlo al releer** (`CASE-PROCESS.md` §8):

| Campo | Qué pasa con él |
|---|---|
| `source` | Decide qué rama de la resolución se toma y **se descarta**. No vuelve en la respuesta |
| `diagnosticTermId` | **Derivado.** Lo escribe la resolución; ningún validador lo declara y el cliente no lo envía |
| `esaviRawName` | **Derivado.** Guarda lo que escribió el notificador **sólo si difiere** del nombre del maestro |

**Y de ahí sale la regla de relectura, que es la trampa de esta tabla.** Tras guardar, `esaviName` puede volver **distinto** de lo enviado: el maestro manda sobre el nombre. El campo editable muestra `esaviRawName` cuando existe —es lo que el usuario escribió— y `esaviName` cuando no. Reenviar `esaviName` igual al almacenado **no cuenta como renombrado** y `esaviRawName` sobrevive; mostrarlo y reenviarlo como `esaviName` sin más, lo destruye.

**Tres archivos escritos a mano en `contracts/declared/`**, porque el backend construye estas respuestas como literales y `contracts:sync` nunca escribe en esa carpeta:

```ts
// contracts/declared/whodrugProduct.ts — SPEC F56 §3.7
export interface WhodrugProductSearchRow { code: string; name: string }
export interface WhodrugProductSearchResult {
  term: string;
  count: number;               // = rows.length; si iguala el limit, hubo más
  rows: WhodrugProductSearchRow[];
}
```

Los otros dos son las respuestas de `NOTIFEVT-006` y `NOTIFMED-006`. **Su forma exacta se copia del servicio al escribirlos** —es el paso 2 del plan y es como FE12a escribió sus tres—; lo que este spec fija de antemano es lo de arriba: qué campos son derivados, cuál se envía sin ser columna, y que `esaviName` puede volver reescrito.

**`whodrugProduct` no aporta ningún tipo a `notificationMedication`.** No hay clave foránea: lo único que cruza del maestro a la fila son dos cadenas.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId` y paso activo | URL | params de `/esavi-cases/:id/wizard/:step` | los declaró FE08 |
| Estado del expediente y `stages` | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | sólo lectura aquí |
| Cabecera de la notificación | TanStack Query | `['notification', 'byCase', caseId]` | de aquí salen `notificationId` y `takesMedication` |
| Lista de eventos | TanStack Query | `['notificationEvent', 'byCase', caseId]` | sin `staleTime`; se invalida tras cada escritura |
| Lista de medicación | TanStack Query | `['notificationMedication', 'byCase', caseId]` | ídem |
| Ítems de `pharmaceuticalForm` y `administrationRoute` | TanStack Query | `['catalogItem', 'byType', catalogTypeId]` | `staleTime` 30 min |
| Resultados de MedDRA | TanStack Query | `['meddra', 'search', term]` | `staleTime` **5 min**, igual que la caché del servidor |
| Resultados de WHODrug | TanStack Query | `['whodrugProduct', 'search', term]` | `staleTime` **30 min**: es un espejo local que sólo cambia con el `007` |
| Valores del modal abierto | React Hook Form | `useForm` de `EventFormDialog` / `MedicationFormDialog` | |
| Qué modal está abierto y sobre qué fila | Componente | `useState` de la lista | efímero; **el id, no la fila** |
| Diálogo de confirmación de baja | Componente | `useState` | efímero |
| Visibilidad de las dos listas | derivado en render | `notification` existe | no es estado |
| Visibilidad de la lista de medicación | derivado en render | `takesMedication === 'YES'` **o** hay filas activas | no es estado |
| Bloqueo de `takesMedication` en la cabecera | derivado en render | hay filas activas | no es estado |
| Rama del término (`source` a enviar) | derivado del formulario | cómo se rellenó el campo (§3.5) | no es estado aparte |
| Origen del nombre de la medicación | derivado en render | **`medicationCode` tiene valor ⟹ vino del catálogo** | no es estado aparte |

**Los cuatro puntos obligatorios:**

**1 · Nada del servidor en `useState`.** El modal guarda **el id de la fila que edita**, no una copia de la fila: los valores iniciales del formulario salen de la caché en el momento de abrirlo. Es la diferencia entre reabrir el modal sobre datos frescos y reabrirlo sobre lo que la pantalla creía hace dos minutos.

**2 · Ningún filtro fuera de `searchParams`.** Esta pantalla no tiene filtros, paginación ni orden — el orden lo fija el disparador de `sortOrder` y no se puede cambiar. La regla no aplica, y se dice en vez de callarla. Lo tecleado en los dos buscadores no es un filtro de listado: es el argumento de una búsqueda, y vive en la clave de caché.

**3 · `staleTime` por naturaleza del dato.** Los dos catálogos heredan los 30 minutos de `catalogItemResource`. Las tres lecturas del expediente no llevan `staleTime`. **Los dos buscadores no llevan el mismo, y es deliberado:** MedDRA lleva 5 minutos, que es lo que el servidor cachea por término e idioma, porque detrás hay un API de pago con limitador; WHODrug lleva 30, porque es una consulta al espejo local y ese espejo **sólo cambia cuando un SUPERADMIN lanza el `007`**.

**4 · Qué invalida qué.** Tras cualquier `POST`, `PUT` o `DELETE` de evento: **sólo `['notificationEvent','byCase',caseId]`**. Ídem con medicación y su clave. **Y nada más**, deliberadamente:

- **No se invalida `['caseWorkflow','byCase',caseId]`.** Un satélite no sella ninguna marca de tiempo del expediente ni cambia su estado; el `001` que sella `notificationStartedAt` es el de la cabecera y es de FE12a.
- **No se invalida `['notification','byCase',caseId]`.** El bloqueo de `takesMedication` y la visibilidad de la lista se derivan **en render** de la query de medicación, que ya está invalidada. Refrescar la cabecera para enterarse de algo que la otra query ya sabe es el camino corto a que las dos digan cosas distintas.
- **Nada invalida las dos claves de búsqueda.** Son maestros: escribir una fila del expediente no los cambia.

### 3.5 Formularios y validación

**Dos formularios, los dos en modal, los dos con su `useForm` propio.** Ninguno comparte estado con el formulario de la cabecera: una fila de satélite se guarda al aceptar el modal y no participa en el «Guardar» del paso.

#### Dónde se insertan las dos secciones

El scroll único que FE12a definió gana dos secciones, en este orden:

```
Descripción y antecedentes → Eventos → Medicación concomitante →
Desenlace → Investigación → Ficha grave / no grave → Observaciones
```

Los eventos van pegados a la descripción porque son la misma pregunta en dos formas —el párrafo y los diagnósticos contables—, y la medicación va pegada a `takesMedication`, que es la respuesta que la gobierna. Es un cambio en `NotificationStep`, y va en §8.

#### Evento — `features/notification/schemas.ts`, `notificationEventSchema`

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `esaviName` | `<MeddraSearchField>` | **sí** | ≤250, `trim`, no vacío. Es lo que escribió el notificador |
| `esaviCode` | `<Input>` bajo el buscador | no | ≤250. **Dispara la resolución.** Oculto con «otro evento» |
| `isOtherEsavi` | switch | no | `NOT NULL DEFAULT false`. **Gobierna las dos reglas de abajo** |
| `otherDescription` | `<Textarea>` | condicional | ≤500. Sólo con `isOtherEsavi === true` |
| `isMainEsavi` | casilla | no | `NOT NULL DEFAULT false`. **Casilla por fila, varias admitidas** |
| `startDate` | `<DateField allowFuture={false}>` | no | Fecha de inicio del evento |
| `startTime` | `<TimeField>` | no | `HH:MM`; el servicio rellena los segundos |
| `notes` | `<Textarea>` | no | |

> **`allowFuture={false}` en las dos fechas de este spec es regla del cliente.** El servidor no la impone en `startDate` de ninguna de las dos tablas. Un evento que empieza mañana y una medicación que se empezó a tomar el mes que viene son datos imposibles que nadie detectaría después. Se pasa por parámetro, no por inercia: `<DateField>` existe precisamente porque hay fechas del expediente sin ninguna restricción temporal.

#### El campo del término: un solo buscador, y `source` sale de dónde vino el código

El usuario ve **una caja de texto y un campo de código debajo**, no un selector de taxonomía:

| Lo que hizo el usuario | `esaviName` | `esaviCode` | `source` |
|---|---|---|---|
| Escribió y **eligió una sugerencia** de MedDRA | el del término | el del término | **`MEDDRA`** |
| Escribió el nombre y **tecleó un código a mano** | lo tecleado | lo tecleado | **`LOCAL`**, explícito |
| Escribió sólo el nombre | lo tecleado | vacío | **no viaja** |

**`source` sigue el origen del código, no el del nombre.** Editar el nombre después de elegir una sugerencia no rompe la rama: lo que identifica el término es el código, y corregir cómo se llama en la ficha del caso es legítimo. Lo que sí cambia la rama es **borrar el código y teclear otro**, que pasa a `LOCAL`.

**`LOCAL` se envía escrito, no por omisión.** El servicio trata «sin `source`» y `LOCAL` igual, pero mandarlo explícito es lo que hace legible en el cuerpo de qué rama viene el término, y lo que impide que un término de MedDRA acabe acuñado como local por haberse olvidado el campo.

#### Medicación — `notificationMedicationSchema`

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `medicationName` | `<WhodrugProductSearchField>` | **sí** | ≤250, `trim`, no vacío. **Sólo lectura si vino del catálogo** |
| `medicationCode` | **ningún control: no se muestra** | no | ≤250. Lo rellena la elección del buscador; nunca se teclea |
| `dose` | `<Input>` | no | ≤100, texto libre |
| `pharmaceuticalFormItemId` | `<CatalogSelect typeCode="pharmaceuticalForm">` | no | **Catálogo sin sembrar** (§10.5) |
| `administrationRouteItemId` | `<CatalogSelect typeCode="administrationRoute">` | no | Ídem |
| `startDate` | `<DateField allowFuture={false}>` | no | |
| `isOtherMedication` | switch | no | `NOT NULL DEFAULT false` |
| `otherMedicationText` | `<Textarea>` | condicional | Sólo con `isOtherMedication === true` |

#### Los tres caminos del nombre de la medicación

Es la decisión de interfaz que trae `ESAVI-WHODPROD-006`. **`medicationCode` no tiene control propio en ningún caso**: o lo rellena el buscador, o queda vacío.

| Camino | Cómo | `medicationName` | `medicationCode` |
|---|---|---|---|
| **Del catálogo** | Escribe ≥3 caracteres y elige una sugerencia | El del maestro, **en sólo lectura** | El `code` del maestro |
| **Texto libre** | Escribe y no elige ninguna sugerencia | Lo tecleado, editable | **vacío** |
| **«Otra medicación»** | Marca `isOtherMedication` | Lo tecleado, editable; el buscador colapsa | **vacío** |

**El invariante que compran las dos columnas de la derecha: un `medicationCode` con valor significa que la fila salió del catálogo.** Si el código se pudiera teclear encima, volvería el problema que el SPEC F56 existe para resolver — tres grafías del mismo medicamento y ninguna agregación fiable. Por eso el nombre queda bloqueado junto con el código: un nombre editable sobre un código del maestro produciría exactamente la pareja incoherente que se quiere evitar.

**Y por eso hay una acción «quitar» junto al campo**, que borra los dos y devuelve el control a texto libre. Sin ella, elegir mal una sugerencia sería un callejón sin salida dentro del modal.

> **El texto libre no es un respaldo: es un camino de primera clase.** El `006` **filtra por el país del despliegue**, así que un medicamento administrado que no se comercializa aquí sencillamente no aparece — y eso ocurre. Además, el SPEC F56 siembra `ESAVI_WHODRUG_ENABLED` en **`false`** y las credenciales vacías: en un despliegue sin sincronizar el buscador responde `503` y no hay catálogo que ofrecer. En los dos casos se escribe el nombre y se guarda, y `medicationName` sigue siendo lo único obligatorio.

#### Las cuatro reglas condicionales, y qué limpia cada una

Las tres primeras se evalúan **sobre el estado resultante**, no sobre el cuerpo. Como `CONVENTIONS.md` §6.5 manda enviar el objeto completo en el `PUT`, el campo que se oculta viaja en `null` en la misma petición que mueve la bandera:

| Bloque | Se muestra con | Al ocultarse se pone a | Si no |
|---|---|---|---|
| Buscador de término y `esaviCode` | `isOtherEsavi === false` | `esaviCode` → **`null`** | `NOTIFEVT_00X_OTHER_ESAVI_CONFLICT` |
| `otherDescription` | `isOtherEsavi === true` | `null` | `NOTIFEVT_00X_OTHER_DESCRIPTION_NOT_ALLOWED` |
| `otherMedicationText` | `isOtherMedication === true` | `null` | `NOTIFMED_00X_OTHER_TEXT_NOT_ALLOWED` |
| **`medicationCode`** | `isOtherMedication === false` | `null` | **nada: es regla del cliente** |

**La cuarta no la impone el backend, y se declara para que nadie la busque en el servicio.** `CASE-PROCESS.md` §5.4b es explícito: `medicationCode` **no entra** en la regla de «otra medicación», a diferencia de `esaviCode` en el evento. Pero declarar «otra» significa precisamente que el medicamento no está en el catálogo, así que conservar un código del catálogo debajo sería una contradicción que el servidor aceptaría sin protestar. Se limpia en el cliente.

**`esaviName` y `medicationName` no se limpian nunca**, y es lo que distingue estas compuertas de las de FE12a. Marcar «otro» no borra el nombre: sigue siendo obligatorio y sigue siendo lo que el notificador escribió. Lo que desaparece es la vía al maestro.

#### La compuerta de `takesMedication`, en su forma nueva

| Situación al entrar | Qué hace la pantalla |
|---|---|
| `takesMedication === 'YES'` | La sección de medicación se muestra, normal |
| Distinto de `'YES'` y **sin** filas activas | La sección **no se renderiza** |
| Distinto de `'YES'` y **con** filas activas | **La sección se muestra igual**, con el aviso de que la respuesta de la cabecera no coincide con lo registrado |

Y en la cabecera: **con filas activas, el `<AnswerOptionField>` de `takesMedication` queda deshabilitado**, con el texto que dice qué hay que hacer para cambiarlo — borrar las medicaciones, una a una. No es un aviso al guardar: es un campo que no se puede mover mientras haya datos que quedarían huérfanos.

> **El texto del bloqueo depende del rol, y es la única vez que `useCan()` aparece en este spec.** Mientras `NOTIFMED-005A` siga en `ADMIN`, un USER no puede borrar las filas y por tanto **no puede cambiar la respuesta en absoluto**; decirle «borra las medicaciones» sería mandarlo a una acción que va a responder `403`. Con `useCan(ADMIN)` se elige entre las dos frases. **Decide qué se dice, nunca si el control existe** — que es la línea que §10.4 no quiere que se cruce.

> **La comparación es estricta contra `'YES'`**, como todas las de `answerOption`: `NO`, `UNKNOWN`, `NOT_APPLICABLE`, `NO_ANSWER` y el `null` cierran la sección por igual.

#### Errores del backend mapeados

**Al campo** — `00X` expande a `001` y `004`:

| Código | Campo |
|---|---|
| `NOTIFEVT_00X_OTHER_DESCRIPTION_REQUIRED` | `otherDescription` |
| `NOTIFEVT_00X_OTHER_DESCRIPTION_NOT_ALLOWED` | **`isOtherEsavi`**, no `otherDescription` |
| `NOTIFEVT_00X_OTHER_ESAVI_CONFLICT` | **`isOtherEsavi`**, no `esaviCode` |
| `NOTIFMED_00X_OTHER_TEXT_REQUIRED` | `otherMedicationText` |
| `NOTIFMED_00X_OTHER_TEXT_NOT_ALLOWED` | **`isOtherMedication`** |
| Los dos `404` de catálogo de `NOTIFMED-001/-004` | su `<CatalogSelect>`. El sufijo exacto se copia del servicio en el paso 13 |

**Los tres `NOT_ALLOWED` van a la bandera y no al campo que sobra**, por el mismo criterio que FE12a aplicó a `DEATH_FIELDS_NOT_ALLOWED`: lo que sobra es la combinación, y el campo culpable está oculto en ese momento. Un error señalando un control que el usuario no ve no se puede entender.

**Con comportamiento propio, no sólo texto:**

| Código | Qué hace la pantalla |
|---|---|
| `NOTIFEVT_00X_DIAGTERM_NOT_FOUND` | **No es un error del usuario.** Significa que el diccionario de esa fuente no está importado en este despliegue. El mensaje lo dice y ofrece **guardar el término como texto libre**, borrando el código |
| `MEDDRA_006_DISABLED`, `_NOT_CONFIGURED`, `_TIMEOUT`, `_SEARCH_FAILED` / `_AUTH_FAILED` | El campo **degrada a texto libre sin código** —un registro válido, `diagnosticTermId: null`— y lo dice como estado del servicio, no como «no hay resultados» |
| `WHODPROD_006_NOT_CONFIGURED` (503), `WHODPROD_006_FETCH_FAILED` (500) | Ídem: el campo de medicación **degrada a texto libre sin código**. El espejo no está sincronizado en este despliegue, y eso no impide registrar la medicación |
| `AUTH_ROLE_FORBIDDEN` en un `004` o un `005A` | El aviso de §10.4: **corregir y retirar** contenido clínico exige un administrador en este despliegue, aunque crearlo no. No se oculta el botón; se explica el `403` |

**Al toast, por `code`**, en `shared/api/errorMessages.ts`: los `_CREATION_FAILED`, `_UPDATE_FAILED`, `_DELETE_FAILED`, `_NOT_FOUND` y `_NOTIFICATION_NOT_FOUND` de las dos entidades, con un texto genérico por entidad —ninguno debería alcanzarse en uso normal—, igual que FE11 y FE12a.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Esqueleto de lista, 3 filas, por sección | — |
| **Sin cabecera todavía** | **Las dos secciones no se renderizan.** Sin `notificationId` no hay padre; el usuario ve el formulario de FE12a y nada más | — |
| Lista vacía | **Sólo el título de la sección y el botón «Añadir».** Sin ilustración y sin texto de estado vacío | — |
| Con filas | Tabla en escritorio, tarjetas por debajo de `md` | — |
| Error de lectura | Mensaje del `EsaviApiError` por `code` y botón de reintentar | `notification.events.error.load`, `notification.medications.error.load` |
| Medicación oculta | La sección no existe en el DOM | — |
| **Medicación discrepante** | La sección se muestra con el aviso de que la cabecera dice otra cosa | `notification.medications.mismatch` |
| `takesMedication` bloqueado | El campo de la cabecera, deshabilitado, con el texto que dice qué hacer — **una frase para ADMIN y otra para USER** | `notification.medications.gateLocked`, `.gateLockedNeedsAdmin` |
| Catálogo sin sembrar | `<CatalogSelect>` deshabilitado con su explicación, no un desplegable vacío. Comportamiento de la primitiva | reutiliza las de `CatalogSelect` |
| MedDRA no disponible | El buscador de términos degradado a texto libre, con el estado del servicio | `notification.events.meddraUnavailable` |
| **Espejo WHODrug sin sincronizar** | El buscador de medicación degradado a texto libre, con el estado del servicio | `notification.medications.catalogUnavailable` |
| **Búsqueda sin resultados** | «Ningún medicamento coincide; puedes escribirlo tal cual» — **no un callejón**: el país filtra y el texto libre es válido | `common.termSearch.noResults`, `notification.medications.notInCatalog` |
| Rol insuficiente (§10.4) | El aviso, tras el `403` de un `004` o un `005A`. **Los botones siguen visibles** | `notification.satellites.adminRequiredEdit`, `.adminRequiredDelete` |
| Caso cerrado | Las listas en sólo lectura: sin «Añadir» y sin acciones de fila. El aviso lo pinta `CaseWizardPage` (FE08) | reutiliza las de FE08 |
| Sin permiso | No se llega: el guard del asistente rechaza por debajo de `USER` | — |

**El estado de lista vacía no lleva ilustración ni texto, y es una decisión.** Cuatro listas en el paso 4 y diez en el paso 5: un estado vacío ilustrado por cada una convierte un expediente recién abierto en catorce carteles que dicen lo mismo. El título y el botón ya dicen qué es y qué hacer.

**El «sin resultados» del buscador de medicación sí lleva texto, y es lo contrario de un adorno.** El `006` excluye vacunas y filtra por país: un resultado vacío no significa «ese medicamento no existe», significa «no está en el catálogo de este despliegue». Sin esa frase, el usuario supone que se equivocó y borra lo que había escrito bien.

### 3.7 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`, dentro de `<SatelliteList>`. Los campos que sobreviven:

  | Lista | Tres campos |
  |---|---|
  | Eventos | `esaviName` · `startDate` · marca «principal» si `isMainEsavi` |
  | Medicación | `medicationName` · `dose` · `startDate` |

  **Un campo sin valor no se renderiza**: nada de guiones ni de «—» de relleno. La tarjeta encoge, y una fila con sólo nombre ocupa una línea.
- **Los modales pasan a pantalla completa por debajo de `md`**, con la barra de acciones fija abajo. Un diálogo centrado con ocho campos en 375 px es un formulario con scroll dentro de otro scroll.
- Objetivos táctiles de 44 px en switches, casillas y acciones de fila; `dvh`, nunca `vh`.
- **`<TermSearchField>` es un combobox, no un `<select>`**: `role="combobox"`, `aria-expanded`, `aria-controls`, navegación con flechas y Enter, Escape cierra. El número de resultados se anuncia en una región `aria-live="polite"` — un desplegable que aparece en silencio no existe para un lector de pantalla. Las dos envolturas lo heredan sin repetirlo.
- **Un campo en sólo lectura por venir del catálogo lleva `readonly`, no `disabled`.** Un `disabled` sale del orden de tabulación y su contenido no lo lee un lector de pantalla; el nombre del medicamento elegido es justo lo que hay que poder leer. La acción «quitar» va inmediatamente después en el orden de foco.
- **La casilla de «evento principal» lleva su texto explicativo visible**, no un `title`: varios eventos pueden ser principales, y lo primero que hace cualquiera al ver una casilla repetida por fila es suponer que son excluyentes.
- **El campo `takesMedication` deshabilitado lleva su explicación como texto asociado**, no sólo el atributo. Un control gris sin motivo es indistinguible de un fallo.
- Las acciones de fila son iconos, así que cada una lleva `aria-label` por i18n **con el nombre de la fila** — «Eliminar Fiebre alta», no «Eliminar».
- El diálogo de confirmación de baja **nombra la fila** en su texto, y su acción destructiva usa el token `destructive`.
- `<CatalogSelect>`, `<DateField>` y `<TimeField>` ya traen su `ariaLabel` por i18n.

### 3.8 Claves i18n nuevas

En `es`, `en` y `nl`:

| Grupo | Claves |
|---|---|
| Secciones | `notification.events.sectionTitle`, `notification.medications.sectionTitle` |
| Campos del evento | `notification.events.fields.esaviName`, `.esaviCode`, `.isOtherEsavi`, `.otherDescription`, `.isMainEsavi`, `.startDate`, `.startTime`, `.notes` |
| Ayuda del evento | `notification.events.help.isMainEsavi` — varios admitidos; `notification.events.help.esaviCode` — qué pasa al teclear un código |
| Campos de medicación | `notification.medications.fields.medicationName`, `.dose`, `.pharmaceuticalFormItemId`, `.administrationRouteItemId`, `.startDate`, `.isOtherMedication`, `.otherMedicationText` |
| Buscador de medicación | `notification.medications.fromCatalog` — la marca del nombre bloqueado; `.clearSelection` — la acción «quitar»; `.notInCatalog`; `.catalogUnavailable` |
| Validación | `notification.events.validation.esaviNameRequired`, `.otherDescriptionRequired`, `.startDateFuture`; `notification.medications.validation.medicationNameRequired`, `.otherTextRequired`, `.startDateFuture` |
| Compuerta | `notification.medications.gateLocked`, `.gateLockedNeedsAdmin`, `.mismatch` |
| Términos | `notification.events.meddraUnavailable`, `.diagtermNotImported`, `.keepAsFreeText` |
| Bajas | `notification.satellites.deleteTitle`, `.deleteConfirm`, `.deleteAction` |
| Bloqueo de rol | `notification.satellites.adminRequiredEdit`, `.adminRequiredDelete` |
| Pendientes | `notification.pending.atLeastOneEvent` — el texto en la lista de «Completar etapa» |
| Errores | `notification.events.error.load`, `.error.generic`; `notification.medications.error.load`, `.error.generic` |
| `<SatelliteList>` | `common.satelliteList.add`, `.edit`, `.delete`, `.cancel`, `.save` — bajo `common` porque catorce listas las consumen |
| `<TermSearchField>` | `common.termSearch.minChars`, `.noResults`, `.serviceUnavailable`, `.clear`, `.resultsAnnounce`, `.moreResults` — la última para `count === limit` |
| `<TimeField>` | `common.timeField.placeholder`, `.invalid` |

Los dos buscadores **comparten las claves genéricas de `common.termSearch.*` y aportan sólo su placeholder y sus mensajes de servicio**, que son lo único que difiere. `npm run i18n:check` exige paridad exacta: o están en los tres archivos o falla.

---

## 4. Plan de implementación

Catorce pasos. El primero corrige documentación; el resto amplía. Cada uno deja el proyecto compilando y se puede committear solo. **Las claves i18n de cada paso se añaden en los tres idiomas dentro de ese mismo paso**, no al final.

Todos los componentes shadcn que este spec necesita ya están instalados (`checkbox`, `dialog`, `alert-dialog`, `command`, `popover`): no hay paso de instalación. `references/API-ROUTES.md` se regeneró el 2026-09-05 y ya incluye el grupo `WHODPROD`.

1. **Corregir `CASE-PROCESS.md`.** Dos cosas. Primera: §5.4b («Y aquí ocultar no puede limpiar») y la fila de §7.3 dicen que la compuerta de `takesMedication` sólo se puede avisar; la regla nueva es más estricta y elimina la cascada. Segunda: la nota de §5.4b que dice que `medicationCode` no tiene maestro detrás — sigue sin FK y sin validación, pero ya hay catálogo del que sale.
   *Verificación:* `grep -n "sólo cabe avisar" references/CASE-PROCESS.md` no devuelve la línea de la medicación; §7.3 lista la compuerta como bloqueante, no como aviso.

2. **Contratos.** Dos entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`, `npm run contracts:sync`, y los tres `contracts/declared/` — los dos de los `006` escritos **leyendo `notificationEvent.service.ts` y `notificationMedication.service.ts`**, y el de `whodrugProduct` copiado de §3.7 del SPEC F56. `source` se declara como campo aceptado que no vuelve.
   *Verificación:* `npx tsc --noEmit` en 0; `git diff --stat` no toca contratos de otras entidades.

3. **`<TimeField>`.** En `shared/components/`, `HH:MM` sin pedir segundos, con su máscara y su mensaje de formato inválido por i18n.
   *Verificación:* test propio que acepta `08:30`, rechaza `25:00` y muestra `08:30:00` que venga del servidor sin perderlo.

4. **`<SatelliteList>`.** El patrón canónico: título, «Añadir», filas con editar y eliminar, colapso a tarjetas por debajo de `md`, campo vacío que no se renderiza, y **lista vacía sin estado vacío**. Recibe columnas y acciones por props; no sabe de ninguna entidad.
   *Verificación:* test que monta la lista con cero filas y comprueba que sólo hay título y botón; con una fila cuyo tercer campo es `null`, la tarjeta no pinta ningún separador huérfano.

5. **`<TermSearchField>` y sus dos envolturas.** La primitiva parametrizada por hook, mínimo de caracteres, rebote y política de degradación; `role="combobox"` con teclado completo, resaltado de la coincidencia, región `aria-live`, aviso de `count === limit` y acción «quitar». Encima, `<MeddraSearchField>` (`MEDDRA-006`, 3 caracteres, 400 ms) y `<WhodrugProductSearchField>` (`WHODPROD-006`, 3 caracteres, 300 ms, `limit` 20).
   *Verificación:* con dos caracteres **ninguna** de las dos llama a su endpoint; con un `503` cada una sigue aceptando texto y muestra su estado de servicio, no «no hay resultados»; `grep -c "role=\"combobox\"" src/shared/components/` devuelve 1.

6. **`features/notification/api.ts`.** Dos declaraciones de recurso más y sus dos hooks `byCase`, más el hook de búsqueda de WHODrug, con los códigos `ESAVI-NOTIFEVT-*`, `ESAVI-NOTIFMED-*` y `ESAVI-WHODPROD-006` citados.
   *Verificación:* `npx tsc --noEmit` en 0; abrir el paso 4 con la cabecera creada dispara exactamente dos peticiones nuevas, las dos a `/case/:id`, y ninguna al buscador hasta que se teclea.

7. **`features/notification/schemas.ts`.** Los dos esquemas de §3.5, los dos mapas de error a campo y las cuatro reglas condicionales como predicados puros. Los mensajes propios van por clave i18n con `.refine()`, nunca como literal.
   *Verificación:* tests de los predicados con los casos frontera: «otro» con código presente, «otro» sin descripción, descripción presente con la bandera en `false`, y `medicationCode` presente con `isOtherMedication` en `true`.

8. **Lista de eventos.** `EventList.tsx` y `EventFormDialog.tsx` sobre `<SatelliteList>`, con todos los campos **menos** la resolución del término: `esaviName` como `<Input>` liso, `esaviCode`, las dos reglas de «otro», `isMainEsavi` como casilla por fila, `<DateField>` y `<TimeField>`. Baja con `005A` y diálogo de confirmación que nombra la fila. Se renderiza sólo si existe la cabecera.
   *Verificación:* crear dos eventos y marcar los dos como principales funciona y no desmarca ninguno; sin fila de `notification`, la sección no está en el DOM.

9. **La resolución del término.** `esaviName` pasa a `<MeddraSearchField>` y se cablea la tabla de §3.5: `source` sigue el origen del código. Al releer, el campo muestra `esaviRawName` cuando existe. Y el `DIAGTERM_NOT_FOUND` con su acción de guardar como texto libre.
   *Verificación:* elegir un término de MedDRA envía `source: 'MEDDRA'`; teclear un código a mano envía `'LOCAL'`; sin código no viaja `source`. Guardar y reabrir un evento cuyo maestro reescribió el nombre muestra lo que escribió el usuario, y un `PUT` sin tocar nada **no** produce `updatedAt`.

10. **Lista de medicación, con su buscador.** `MedicationList.tsx` y `MedicationFormDialog.tsx`, con `<WhodrugProductSearchField>` y los tres caminos de §3.5, la acción «quitar», los dos `<CatalogSelect>` que aguantan el catálogo vacío y la regla simétrica de «otra medicación» con su limpieza de `medicationCode`.
    *Verificación:* elegir del buscador deja el nombre en sólo lectura y envía `medicationCode`; «quitar» devuelve el campo a texto libre y manda `medicationCode: null`; marcar «otra medicación» hace lo mismo; con `pharmaceuticalForm` sin sembrar, el desplegable aparece deshabilitado con su explicación y la medicación se guarda igual.

11. **La compuerta de `takesMedication`.** Los tres estados de §3.5: sección visible con `'YES'`, no renderizada sin filas, y visible con aviso de discrepancia si hay filas. Más el bloqueo del `<AnswerOptionField>` de la cabecera, con la frase que corresponda al rol.
    *Verificación:* con una medicación cargada, el campo de la cabecera está deshabilitado y dice por qué; con rol `USER` la frase menciona al administrador y con `ADMIN` no; borrada la última fila, vuelve a ser editable sin recargar la página.

12. **«Al menos un evento» en «Completar etapa».** `notificationCompleteSchema` de FE12a gana el obligatorio de proceso, y `getPendingFields()` lo lista. **No bloquea «Guardar».**
    *Verificación:* con cero eventos, «Completar etapa» lista el pendiente y no se ejecuta; con uno, desaparece de la lista. «Guardar» funciona en los dos casos.

13. **Mapeo de errores y cierre de i18n.** Las entradas de `shared/api/errorMessages.ts` de las dos entidades y de los dos buscadores, los dos avisos de `AUTH_ROLE_FORBIDDEN` de §10.4, y la revisión de paridad.
    *Verificación:* `npm run i18n:check` en 0; un `403` en `PUT /api/notification-events/:id` muestra el aviso de administrador y no un toast genérico.

14. **Tests de integración.** Con MSW y `onUnhandledRequest: 'error'`, montando `NotificationStep` junto a `CaseWizardProvider` y `CaseWizardActionBar`: alta y edición de evento en las tres ramas de `source`, los tres caminos del nombre de la medicación, las dos reglas de «otro» en los dos sentidos, la compuerta de medicación en sus tres estados, la baja con confirmación, y el bloqueo por rol en el `004` y en el `005A`.
    *Verificación:* `npm run check` en 0.

---

## 5. Criterios de aceptación

- [ ] Las diez rutas de §3.2 se consumen y responden lo esperado.
- [ ] Sin fila de `notification`, **ninguna** de las dos secciones existe en el DOM — no basta con que esté oculta.
- [ ] Una lista sin filas muestra **sólo** título y botón «Añadir»: sin ilustración y sin texto de estado vacío.
- [ ] En la tarjeta móvil, un campo sin valor **no se renderiza**; `grep -rn '"—"' src/features/notification/ src/shared/components/SatelliteList.tsx` no devuelve rellenos.
- [ ] Dos eventos marcados como principales conviven: marcar uno **no** desmarca el otro, y no se produce ningún `PUT` sobre la fila hermana.
- [ ] Elegir un término en el buscador envía `source: 'MEDDRA'`; teclear un código a mano envía `source: 'LOCAL'` **explícito**; sin código, `source` no viaja en el cuerpo.
- [ ] Editar el nombre después de elegir una sugerencia **mantiene** `source: 'MEDDRA'`; borrar el código y teclear otro pasa a `'LOCAL'`.
- [ ] Reabrir un evento cuyo maestro reescribió `esaviName` muestra en el campo lo que escribió el usuario (`esaviRawName`), y un `PUT` sin tocar nada no produce `updatedAt` ni entrada de auditoría.
- [ ] Un `NOTIFEVT_00X_DIAGTERM_NOT_FOUND` se presenta como diccionario no importado y ofrece guardar el término como texto libre, no como error del usuario.
- [ ] **Elegir un medicamento del buscador** deja `medicationName` en **sólo lectura** —`readonly`, no `disabled`— y envía `medicationCode` con el `code` del maestro.
- [ ] **`medicationCode` no tiene ningún control en el DOM**: `grep -rn 'name="medicationCode"' src/features/notification/` no devuelve ningún campo de entrada.
- [ ] La acción «quitar» devuelve `medicationName` a texto libre y envía `medicationCode: null`.
- [ ] Marcar «otra medicación» limpia `medicationCode` a `null` **aunque el backend no lo exija**, y colapsa el buscador.
- [ ] Con menos de 3 caracteres, **ninguno** de los dos buscadores llama a su endpoint.
- [ ] Con `WHODPROD_006_NOT_CONFIGURED` (503), el campo de medicación **acepta texto libre** y muestra el estado del servicio; la medicación se guarda sin código.
- [ ] Una búsqueda sin resultados dice que el medicamento puede no estar en el catálogo de este despliegue y **ofrece escribirlo tal cual**; no se presenta como error.
- [ ] Cuando `count === limit`, la pantalla avisa de que hubo más resultados y hay que afinar el término.
- [ ] Con MedDRA caído (`503`/`502`/`504`), el campo de términos **acepta texto libre** y el evento se guarda con `diagnosticTermId: null`.
- [ ] Marcar «otro evento» limpia `esaviCode` a `null` en el mismo `PUT` y responde `200`, no `400 OTHER_ESAVI_CONFLICT`; `esaviName` **no** se limpia.
- [ ] Desmarcar «otro evento» limpia `otherDescription` a `null` y responde `200`.
- [ ] Los tres `NOT_ALLOWED` marcan la **bandera**, no el campo oculto.
- [ ] Con una medicación activa cargada, el `<AnswerOptionField>` de `takesMedication` está deshabilitado y muestra por qué; con `USER` la frase menciona al administrador y con `ADMIN` no; borrada la última fila vuelve a ser editable **sin recargar**.
- [ ] Con `takesMedication` distinto de `'YES'` y filas activas, la sección **se muestra** con el aviso de discrepancia.
- [ ] Con `takesMedication` distinto de `'YES'` y sin filas, la sección no existe en el DOM.
- [ ] Con `pharmaceuticalForm` sin sembrar, el `<CatalogSelect>` sale deshabilitado con su explicación y la medicación se guarda sin forma ni vía.
- [ ] Con cero eventos, «Completar etapa» lista el pendiente y no se ejecuta; «Guardar» funciona igual.
- [ ] `sortOrder` no aparece en ningún cuerpo de petición: `grep -rn "sortOrder" src/features/notification/` no devuelve escrituras.
- [ ] Crear, editar o borrar un satélite invalida **sólo** su clave: no se vuelve a pedir `['caseWorkflow','byCase',caseId]`, ni `['notification','byCase',caseId]`, ni ninguna de las dos de búsqueda.
- [ ] Un `403 AUTH_ROLE_FORBIDDEN` en un `004` o un `005A` muestra el aviso de §10.4, y los botones de editar y eliminar siguen visibles.
- [ ] **Hay un solo combobox de búsqueda en el repositorio.** `<MeddraSearchField>` y `<WhodrugProductSearchField>` son envolturas de `<TermSearchField>` y ninguna repite su teclado ni su ARIA.
- [ ] `grep -rn "useState" src/features/notification/` no devuelve ninguna copia de fila remota: los modales guardan el **id**, no la fila.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `grep -n "sólo cabe avisar" references/CASE-PROCESS.md` ya no devuelve la línea de la medicación.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** Las dos secciones y los dos modales se ven correctos en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/notification/ src/shared/components/SatelliteList.tsx src/shared/components/TermSearchField.tsx src/shared/components/TimeField.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** Las dos listas colapsan a tarjetas con los campos de §3.7, los modales pasan a pantalla completa con la barra de acciones fija abajo, y el body no hace scroll horizontal en 375 px.
- [ ] **Rol bajo.** Con `USER` se puede leer y **crear** eventos y medicaciones; **editar y borrar responden `403`** mientras §10.4 siga a medias, y la pantalla lo explica sin pantalla en blanco y sin ocultar controles. Con `ANALYTICS` el asistente no es alcanzable.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label` —los de fila llevan el nombre de la fila—; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState`, ningún filtro fuera de `searchParams`, y las cuatro visibilidades derivadas en render y no guardadas.

> **La adaptación del bloque, igual que en FE12a.** El ítem de `md` habla de listas y modales porque aquí no hay una tabla de listado paginada. Y el de rol bajo describe algo que ningún otro spec ha tenido que verificar: un `403` **esperado** en dos operaciones de tres, que hoy ocurre siempre y que hay que explicar en vez de dejar romper la pantalla.

---

## 6. Decisiones tomadas y descartadas

**Estructura y alcance**

- **Sí:** partir el paso 4 en cuatro specs y este en el primero de los tres de satélites. 64 columnas, dos niveles de anidamiento y cuatro primitivas nuevas no caben en un spec que alguien pueda ejecutar; FE12a fueron dieciséis pasos con menos de la mitad. Registrado en `CASE-PROCESS.md` §9 el 2026-09-04 para que la partición no dependa de esta conversación.
- **Sí:** eventos y medicación en el mismo spec. Son las dos listas **planas** del paso —cuelgan directas de la notificación, sin anidamiento y sin maestro jerárquico detrás—, y ahora además comparten forma de buscador, que es lo que hace que `<TermSearchField>` salga de aquí con dos consumidores y no con uno.
- **Sí:** los satélites en `features/notification/`, junto a las tres tablas de FE12a. Nunca se usan por separado, ninguno tiene pantalla propia y sus recursos siempre se importan juntos.
- **No:** una carpeta por entidad, como pide `CONVENTIONS.md` §5. Esa regla describe entidades con listado, detalle, ruta y entrada de menú; un satélite del asistente no tiene ninguna de las cuatro cosas.

**Los dos buscadores**

- **Sí:** **una sola primitiva `<TermSearchField>`** con dos envolturas finas. Los dos buscadores son la misma forma —caja de texto, desplegable, mínimo de caracteres, `{ count, rows }`, degradación a texto libre— y sólo difieren en el hook, el rebote y qué significa un error. `CONVENTIONS.md` §10.4 prohíbe la copia, y un segundo combobox sería un segundo teclado y un segundo ARIA que mantener.
- **Sí:** conservar los nombres `<MeddraSearchField>` y `<WhodrugProductSearchField>` como envolturas. `ARCHITECTURE.md` §4.3 declara el primero por su nombre y FE12d y FE13 lo citan; renombrarlo obligaría a tocar una lista canónica por un detalle de implementación.
- **Sí:** rebotes distintos —400 ms en MedDRA, 300 en WHODrug— y `staleTime` distintos —5 minutos y 30—. No es inconsistencia: detrás de uno hay un API de pago con limitador de 60 peticiones cada 15 minutos, y detrás del otro una consulta local a un espejo que sólo cambia cuando un SUPERADMIN lanza el `007`.
- **No:** usar `<EntitySearchSelect>` para ninguno de los dos. Ni `MEDDRA-006` ni `WHODPROD-006` son listados de entidad filtrados por `name`/`code`: los dos toman `term`, con mínimo de tres caracteres, y devuelven pares sin identificador que abrir después.

**El nombre de la medicación**

- **Sí:** `medicationName` en **sólo lectura** cuando viene del catálogo, y **`medicationCode` sin ningún control en la interfaz**. El invariante que compra es el que justifica el SPEC F56 entero: un código con valor significa que la fila salió del catálogo. Un nombre editable sobre un código del maestro produciría la pareja incoherente que se quiere evitar.
- **No:** dejar los dos editables tras elegir, como se propuso primero por analogía con los tres textos de `notificationVaccine`. Allí hay motivo —`vaccineCode` admite el código nacional del carné y `whoCode` no, así que la discrepancia entre ambos **es información**—; aquí hay una sola columna de código y esa distinción no existe.
- **Sí:** una acción «quitar» junto al campo bloqueado. Sin ella, elegir mal una sugerencia sería un callejón sin salida dentro del modal.
- **Sí:** el texto libre como **camino de primera clase**, no como respaldo. El `006` filtra por el país del despliegue, así que un medicamento administrado que no se comercializa aquí no aparece — y ése no es un caso excepcional. Además el espejo se siembra desactivado: en un despliegue sin sincronizar no hay catálogo en absoluto.
- **Sí:** limpiar `medicationCode` al marcar «otra medicación», **aunque el backend no lo exija**. `CASE-PROCESS.md` §5.4b es explícito en que `medicationCode` no entra en esa regla; pero declarar «otra» significa que el medicamento no está en el catálogo, y conservar un código del catálogo debajo sería una contradicción que el servidor aceptaría sin protestar.
- **No:** adelantar la clave foránea a `whodrugProduct`. El SPEC F56 la dejó fuera a propósito, para poblar y validar el catálogo antes de atarle una tabla de producción. Adelantarla aquí sería decidir por el otro repositorio.

**El campo del término**

- **Sí:** una sola caja de texto con buscador incorporado y un campo de código debajo. Las tres ramas de `source` salen de lo que el usuario hizo, no de un control que tiene que entender antes de escribir.
- **No:** un selector de origen explícito (MedDRA / código local / texto libre). Obliga a elegir una taxonomía antes de poder escribir el nombre del evento, que es al revés de como trabaja quien notifica.
- **Sí:** `source` sigue el origen del **código**, no el del nombre. Lo que identifica el término es el código; corregir cómo se llama en la ficha del caso es legítimo y no debería degradar la rama a `LOCAL`.
- **Sí:** `LOCAL` explícito. Mandarlo escrito impide que un término de MedDRA acabe acuñado como local por haberse olvidado el campo — y eso contamina el maestro clínico, no una fila.
- **Sí:** `esaviCode` sigue siendo tecleable a mano y `medicationCode` no. La asimetría es del dominio: allí el código es la puerta a una resolución que puede **acuñar** un término nuevo, y el notificador tiene que poder abrirla; aquí el código es sólo la huella de una elección en un espejo, y no hay nada que acuñar.

**La compuerta de la medicación**

- **Sí:** con filas activas, `takesMedication` no se puede cambiar. Es más estricto que `CASE-PROCESS.md` §7.3 y elimina el problema que aquella regla no resolvía: el usuario borra las filas de una en una, viéndolas, y no hay ninguna escritura múltiple que pueda fallar a medias.
- **No:** borrar las filas automáticamente al cambiar la respuesta. Es la cascada que §7.3 rechazaba: N escrituras disparadas por un cambio que el usuario percibe como una respuesta.
- **No:** limitarse a avisar, como decía §7.3. Deja medicaciones huérfanas bajo un `takesMedication: 'NO'`, y esa incoherencia reaparece en el paso 6 cuando ya nadie recuerda de dónde salió.
- **Sí:** mostrar la lista cuando la respuesta no es `'YES'` **y** hay filas. Ocultarla produciría exactamente los datos huérfanos e invisibles que la regla existe para evitar.
- **Sí:** dos frases distintas para el campo bloqueado según el rol, resueltas con `useCan(ADMIN)`. Mientras `NOTIFMED-005A` siga en ADMIN, decirle a un USER «borra las medicaciones» es mandarlo a un `403`. **`useCan()` decide aquí qué se dice, nunca si el control existe**, que es la línea que §10.4 no quiere cruzar.

**Las listas y su ciclo de vida**

- **Sí:** las secciones no se renderizan hasta que existe la fila de `notification`. El paso 4 crece a medida que se rellena, y el campo que crea la fila —`esaviDescription`— es el primero de la pantalla.
- **No:** mostrarlas deshabilitadas con su explicación. Media pantalla en gris antes de haber escrito nada pesa más que la explicación que aporta.
- **No:** crear la cabecera automáticamente al pulsar «Añadir». Escribe una fila que el usuario no pidió y sella `notificationStartedAt` por un clic exploratorio.
- **Sí:** lista vacía sin estado vacío, sólo título y botón. Son cuatro listas en el paso 4 y diez en el paso 5.
- **Sí:** pero el «sin resultados» del buscador **sí lleva texto**. Un resultado vacío ahí no significa «no existe», significa «no está en el catálogo de este despliegue», y sin decirlo el usuario borra lo que había escrito bien.
- **Sí:** sin toggle de «mostrar inactivos». Los `002B` son ADMIN y una fila retirada del expediente no le dice nada a quien notifica.
- **Sí:** baja con diálogo de confirmación que **nombra la fila**. Es la única acción destructiva de la pantalla y el icono de papelera está a un píxel del de editar.

**Los roles**

- **Sí:** seguir diseñando asumiendo `USER` en las seis escrituras, según `CASE-PROCESS.md` §10.4, pese a que la petición se aplicó a medias el 2026-09-04.
- **No:** ocultar editar y eliminar con `useCan(ADMIN)` ahora que se sabe que van a dar `403`. Habría que quitarlo en cuanto se complete §10.4 y, mientras tanto, un USER vería una fila que puede crear y no puede corregir, sin ninguna explicación de por qué. Un `403` explicado enseña algo; un botón ausente, no.
- **Sí:** distinguir en el mensaje entre **corregir** y **retirar**, con dos claves. Son dos operaciones distintas que el usuario intenta en momentos distintos, y un texto único obligaría a redactarlo tan vago que no diría nada.

**El evento principal**

- **Sí:** casilla por fila, con varios eventos principales admitidos. El DDL no impone unicidad y el SPEC F16 lo declara explícitamente fuera de alcance.
- **No:** un radio en la lista. Obligaría a escribir sobre una fila hermana —un segundo `PUT` que desmarca la anterior— y a inventar el comportamiento del caso en que esa segunda escritura falle. Y con los `004` en `ADMIN`, ese segundo `PUT` fallaría además por rol para quien notifica.

**«Completar etapa»**

- **Sí:** al menos un evento como obligatorio **de proceso**. Un ESAVI sin ningún diagnóstico registrado es un párrafo de texto que ningún análisis puede contar.
- **No:** como bloqueante de guardado. Dejaría sin salida a quien ya escribió la descripción del ESAVI y todavía no tiene el término.
- **No:** exigir al menos una medicación. Cero es una respuesta legítima y además depende de `takesMedication`. El segundo obligatorio de proceso —al menos una vacuna— llega con FE12c.

**Las fechas y el estado**

- **Sí:** `allowFuture={false}` en las dos `startDate`, aunque el servidor no lo imponga. Se pasa por parámetro, que es para lo que `<DateField>` lo admite.
- **Sí:** el modal guarda **el id** de la fila que edita, no una copia. Reabrirlo lee de la caché, y la caché puede haber cambiado.
- **Sí:** no invalidar `caseWorkflow`, `notification` ni las dos claves de búsqueda tras escribir un satélite. Un satélite no sella nada del expediente y no cambia ningún maestro.
- **No:** persistir el contenido de los modales en `draftsStore`. El borrador de FE12a cubre el hueco entre teclear y guardar de un formulario largo; una fila de satélite se guarda al aceptar el modal.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| **§10.4 se aplicó a medias.** Un USER puede **crear** un evento o una medicación y no puede **corregirlo ni retirarlo**: los `004` y los `005A` siguen en ADMIN. Escribe una fila mal y la fila se queda | El diseño no cambia (§10.4 manda asumir `USER`), pero los dos avisos de §3.6 lo explican por operación en vez de dejar un `403` mudo. Queda anotado en `CASE-PROCESS.md` §10.4 con la tabla del antes y el después, para que la petición pendiente sea la mitad que falta y no la entera |
| **Y por eso la compuerta de `takesMedication` es hoy inejecutable para un USER.** No puede borrar las medicaciones, así que una vez respondido `'YES'` con filas cargadas **no puede volver atrás nunca** | El campo bloqueado dice, con `useCan(ADMIN)`, que hace falta un administrador — en vez de pedir una acción que va a responder `403`. Desaparece solo al completarse §10.4 |
| **El `006` filtra por país y excluye vacunas**, así que un medicamento realmente administrado puede no aparecer y el usuario concluir que se equivocó | El «sin resultados» dice que puede no estar en el catálogo de este despliegue y ofrece escribirlo tal cual. El texto libre es camino de primera clase, no respaldo, y está en los criterios de aceptación |
| **El espejo WHODrug se siembra desactivado.** `ESAVI_WHODRUG_ENABLED` nace en `false` y las credenciales vacías: hasta que un SUPERADMIN lance el `007`, el buscador responde `503` en cada pulsación | El campo degrada a texto libre con el estado del servicio dicho, igual que MedDRA. Ningún despliegue queda sin poder registrar medicación por no tener el catálogo |
| `esaviName` puede volver **distinto** de lo enviado: el maestro manda sobre el nombre. Reenviarlo tal cual al editar destruiría `esaviRawName` | El campo muestra `esaviRawName` cuando existe, y el servicio ya trata «reenviar el nombre almacenado» como no-renombrado. Cubierto por el criterio del `PUT` que no produce `updatedAt` |
| **`source` se envía y no vuelve.** Al releer una fila no hay forma de saber de qué rama salió el término | Se deriva de lo que hay: con código y término resuelto, MedDRA o local según el maestro; sin código, texto libre. El formulario sólo necesita la rama para volver a enviar, y para eso vale el origen del código **de esta sesión de edición** |
| La forma exacta de las dos respuestas de los `006` **no está verificada en este spec**: se copia del servicio al escribir `contracts/declared/`. FE12a encontró que `CASE-PROCESS.md` §5.4 era inexacto en un punto verificable | El paso 2 del plan lee los dos servicios antes de escribir nada, que es exactamente como apareció aquella inexactitud. La tercera, la de `whodrugProduct`, sí está verificada: sale de §3.7 del SPEC F56 |
| Los dos catálogos de la medicación están **comentados en `esaviapp.sql`** (§10.5). Mandar una clave contra un catálogo vacío responde `404` | Las dos FK son nullables: la medicación se registra sin forma ni vía. `<CatalogSelect>` con cero ítems sale deshabilitado con su explicación, comportamiento de la primitiva |
| MedDRA es un API externo de pago **detrás de un limitador de 60 peticiones por IP cada 15 minutos** | Mínimo de 3 caracteres comprobado **antes** de pedir, rebote de 400 ms y `staleTime` de 5 minutos alineado con la caché del servidor. Los tres se verifican en el paso 5 |
| El orden de las filas es el de creación y **no se puede cambiar** | Está escrito en §2 como fuera de alcance y en los criterios como un `grep`. Si el funcional pide arrastrar filas, es una petición al otro repositorio |
| Un evento con `isOtherEsavi` marcado sobre una fila que ya tenía código da `400` **aunque el `PUT` no mande el código**: la regla se evalúa sobre el estado resultante | El campo se limpia a `null` en el mismo `PUT` que mueve la bandera, igual que la sección de fallecimiento de FE12a. Cubierto por dos criterios, uno por sentido |

---

## 8. Impacto en pantallas existentes

| Archivo | Qué cambia |
|---|---|
| `features/notification/NotificationStep.tsx` | Gana dos secciones en el scroll, entre *Descripción y antecedentes* y *Desenlace*. Las dos condicionadas a que exista la fila de `notification` |
| `features/notification/schemas.ts` | `notificationCompleteSchema` gana el obligatorio de proceso «al menos un evento»; `getPendingFields()` lo lista |
| El `<AnswerOptionField>` de `takesMedication` (FE12a) | Se deshabilita con su explicación mientras haya medicaciones activas, con una frase por rol. Es el único campo de la cabecera que este spec toca |
| `features/notification/api.ts` | Dos declaraciones de recurso más, dos hooks `byCase` y el hook de búsqueda de WHODrug |
| `shared/components/SatelliteList.tsx` | **Nuevo.** A partir de aquí es de todos: FE12c la usa dos veces y FE13 diez. No se copia |
| `shared/components/TermSearchField.tsx` | **Nuevo.** La primitiva de búsqueda contra maestro |
| `shared/components/MeddraSearchField.tsx` | **Nuevo**, envoltura de la anterior. Lo reutiliza FE12d para las complicaciones del embarazo |
| `shared/components/WhodrugProductSearchField.tsx` | **Nuevo**, envoltura de la anterior. Único consumidor hoy |
| `shared/components/TimeField.tsx` | **Nuevo.** Lo consumen `vaccinationTime` y `reconstitutionTime` en FE12c |
| `shared/api/errorMessages.ts` | Entradas de las dos entidades nuevas y de los dos buscadores, más los dos avisos de `AUTH_ROLE_FORBIDDEN` de §10.4 |
| `scripts/syncContracts.mjs` | Dos entradas nuevas en el `SYNC_MAP` |
| `references/API-ROUTES.md` | **Ya regenerado el 2026-09-05**: grupo `WHODPROD` nuevo y los cuatro `001` del paso 4 en `USER` |
| `references/CASE-PROCESS.md` | §5.4b y §7.3: la compuerta de `takesMedication` pasa de «se avisa» a «no se puede cambiar», y la nota de que `medicationCode` no tiene maestro detrás. §9, §10.4 y §10.8 ya se corrigieron al redactar este spec |

**Y lo que FE12c y FE12d le harán a esta pantalla**, para que no aparezca como sorpresa: FE12c inserta las secciones de *Vacunas* —con los diluyentes anidados en su modal— y añade el segundo obligatorio de proceso; FE12d inserta el bloque de *Embarazo* detrás de la compuerta de §7.4. Ninguno de los dos toca las dos listas de este spec, y los dos consumen `<SatelliteList>` sin modificarla.

---

## Lo que **no** está en este spec

- Las vacunas, los diluyentes y el árbol WHODrug de cinco niveles.
- El embarazo, sus complicaciones y la compuerta de §7.4.
- La pantalla de inspección del espejo WHODrug y la de sincronización.
- La clave foránea de `notificationMedication` al catálogo: el SPEC F56 la dejó fuera y este spec no la adelanta.
- Reordenar filas, que ningún endpoint permite.
- Revisar o depurar los términos acuñados en `diagnosticTerm`.
- Importar los diccionarios de MedDRA o de WHODrug.
- Los listados por notificación, los listados con inactivas y el detalle por id.
- Reactivaciones y purgas.
- La comprobación de caso cerrado en el servidor.

Cada uno de esos, si aterriza, va en su propio spec.

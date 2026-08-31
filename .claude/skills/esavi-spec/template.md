# Plantilla de spec — frontend ESAVI

Este archivo es la referencia que consulta el skill `/esavi-spec` al generar un spec. Cada sección explica su propósito y da un ejemplo mínimo. **No es texto para copiar literalmente** — es la forma que el spec debe respetar.

El equivalente del backend es `esavi-backend/.claude/skills/esavi-spec/template.md`, y `esavi-backend/references/specs/09-healthfacility-crud.md` es su ejemplo vivo. Cuando dudes del nivel de detalle, mira ahí: la forma es la misma aunque el contenido sea otro.

Los specs de este repositorio se guardan en `references/specs/NN-slug.md`, numeran desde `01` y se titulan con prefijo `FE` — `SPEC FE01` — para no confundirlos con los del backend (`SPEC 05` técnico, `SPEC F44` funcional).

---

## Header

Todo spec empieza con metadatos en blockquote. Sin tablas, sin bloques de código:

```markdown
# SPEC FE03 — Título corto en español

> **Estado:** Borrador
> **Depende de:** SPEC FE01 (shell y autenticación), SPEC F48 del backend (filtros de casos)
> **Fecha:** YYYY-MM-DD
> **Objetivo:** Una sola frase.
```

**Estados válidos:** `Borrador`, `En revisión`, `Aprobado`, `Implementado`, `Obsoleto`.

**Depende de:** los specs previos cuyas reglas asume éste, **con su prefijo**. `SPEC FE01` para uno de este repositorio; `SPEC F48` o `SPEC 05` para uno del backend, indicando que es del backend la primera vez que aparece. Si no depende de ninguno, escribe `—`.

**Regla del objetivo:** una frase que un humano lee en cinco segundos y entiende qué se va a construir. Si no cabe en una frase, el spec es demasiado grande: divídelo.

Separa cada sección con `---`.

Si durante la implementación la realidad se aparta del spec, se inserta una **nota de implementación** justo después del header en vez de reescribir el cuerpo.

---

## 1. Por qué existe este spec

El **porqué**, no el qué. Qué no se puede hacer hoy, qué obliga a construir esto, de qué depende.

En specs de ampliación, describe los desajustes verificados con archivo y línea:

```markdown
**A — El listado no conserva los filtros al volver del detalle.** `EsaviCaseListPage.tsx:42`
guarda los filtros en `useState`, no en `searchParams`. Volver con el botón del navegador
los pierde y el enlace no se puede compartir. Contradice `CONVENTIONS.md` §7.
```

En specs de pantalla nueva, basta con situarla en el flujo y decir qué depende de ella. Si el spec implementa el lado cliente de un spec del backend, dilo con su número: *"Es el consumo de `ESAVI-CASEFLOW-006`, especificado en el SPEC F44 del backend."*

---

## 2. Alcance

Dos sub-bloques. **Los dos son obligatorios.**

```markdown
**Dentro:**

- Cosa concreta una.
- Cosa concreta dos.

**Fuera de alcance (otros specs):**

- Algo que se podría hacer pero ahora no.
- Algo que salió en la conversación y se decidió aplazar.
```

**Por qué importa el "fuera".** Recoge lo que el usuario mencionó durante la ronda de preguntas y se decidió aplazar. Sin ese registro, durante la implementación aparece la tentación de colarlo "ya que estamos".

---

## 3. Diseño

En un spec de entidad, esta sección se desglosa en siete sub-secciones. En un spec transversal o de ampliación se usan las que apliquen, con tablas Antes/Después.

### 3.1 Pantallas y rutas

Las vistas que aparecen, su ruta de React Router, su archivo y el rol que exige el guard:

```markdown
| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/esavi-cases` | `features/esaviCase/EsaviCaseListPage.tsx` | `<RequireRole level={USER}>` |
| Detalle | `/esavi-cases/:id` | `features/esaviCase/EsaviCaseDetailPage.tsx` | `<RequireRole level={USER}>` |
```

Más la entrada en `shared/config/navigation.ts`: en qué grupo del menú (`ARCHITECTURE.md` §5.2), con qué icono, con qué clave i18n y con qué `minLevel`.

**El `minLevel` y el `level` del guard son el rol mínimo real de la ruta HTTP**, copiado de §3.2. No se inventan.

### 3.2 Endpoints consumidos

La pieza clave, y la fuente cerrada de este repositorio. Bloque de texto plano con verbo, ruta, código de operación y rol mínimo, **copiado textualmente de `references/API-ROUTES.md`**:

```
GET    /api/esavi-cases                ESAVI-CASE-002A   USER    listado público
GET    /api/esavi-cases/admin          ESAVI-CASE-002B   ADMIN   listado con inactivos
GET    /api/esavi-cases/:id            ESAVI-CASE-003    USER    detalle
POST   /api/esavi-cases                ESAVI-CASE-001    ADMIN   crear
PUT    /api/esavi-cases/:id            ESAVI-CASE-004    ADMIN   actualizar
DELETE /api/esavi-cases/:id            ESAVI-CASE-005A   ADMIN   desactivar
PATCH  /api/esavi-cases/activate/:id   ESAVI-CASE-005B   SUPERADMIN
```

**Si una ruta que la pantalla necesita no está en `API-ROUTES.md`, el spec no se escribe.** No hay backend que consumir: se anota como dependencia y se escribe primero el spec del otro repositorio. Inventar el endpoint aquí es el error más caro que puede cometer un spec de este repositorio.

Indica también qué operaciones **no** se consumen y por qué: *"`005B` no se expone: la reactivación de casos se hará desde la pantalla de administración, en otro spec."*

### 3.3 Tipos del contrato

Los tipos de `contracts/` que la pantalla usa, con su origen en el backend:

```ts
// contracts/esaviCase.ts — espejo de esavi-backend/src/types/esaviCase/
export interface EsaviCase { … }
export interface CreateEsaviCaseInput { … }
```

**No se inventa un campo de la respuesta.** Salen de `contracts/`, de `DOMAIN-MODEL.md` o del spec de la entidad en el backend. Si el tipo no existe todavía, el spec dice que hay que traerlo con `npm run contracts:sync` y desde qué archivo.

El update usa `Partial<CreateEntityInput>`, igual que en el backend.

### 3.4 Contrato de estado — obligatorio en toda pantalla

**Ningún spec se da por terminado sin esta tabla.** La norma es §7 de `references/CONVENTIONS.md`: cada dato vive en **una sola capa**, y la mayoría de los bugs de sincronización del cliente nacen de un dato que vive en dos.

Campo por campo, dónde vive y con qué forma:

```markdown
| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Filtros y paginación | URL | `searchParams` | 13 params de F48; se comparten por enlace |
| Listado | TanStack Query | `['esaviCase', 'list', filters]` | se invalida tras cada mutación |
| Detalle | TanStack Query | `['esaviCase', 'detail', id]` | |
| Catálogo de estados | TanStack Query | `['catalogItem', 'byType', 'caseWorkflowStatus']` | `staleTime` 30 min |
| Columnas visibles | Zustand | `preferences.tableColumns.esaviCase` | persistido |
| Toggle «mostrar inactivos» | URL | `searchParams.includeInactive` | decide `002A` vs `002B` |
| Diálogo de confirmación abierto | Componente | `useState` | efímero, no sale del componente |
```

Cuatro puntos que el spec debe resolver explícitamente, porque son los que se olvidan:

- **Nada del servidor se copia a `useState` ni a un store.** Si el spec necesita "una copia editable" de una fila, eso es el estado del formulario de React Hook Form, y se dice así.
- **Los filtros van en la URL, no en un store.** Un filtro fuera de la URL no sobrevive al refresco, no se comparte por enlace y rompe el botón de atrás. Las tres propiedades a la vez.
- **`staleTime` según la naturaleza del dato.** Catálogos 30 minutos o más; casos y expedientes se invalidan tras cada mutación. Declara cuáles.
- **Qué invalida qué.** Tras un `POST` o un `PUT`, qué claves de caché se invalidan. Es lo que evita el clásico "la lista dice una cosa y el detalle otra".

**Si algún dato es una excepción a estas reglas, dilo y razónalo.** El silencio es indistinguible del olvido.

### 3.5 Formularios y validación

Por cada formulario: qué campos, cuáles obligatorios **según el backend**, y el schema Zod que los expresa.

```markdown
**Formulario de creación** — `features/esaviCase/schemas.ts`, `createEsaviCaseSchema`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `patientId` | `<PatientSelect>` | sí | FK; el backend responde 404 si está inactivo |
| `healthFacilityId` | `<HealthFacilitySelect>` | sí | FK |
| `reportDate` | `<DatePicker>` | sí | `YYYY-MM-DD`; `NOT NULL` en el DDL |
| `eventDate` | `<DatePicker>` | no | anulable |

Errores del backend mapeados al campo: `CASE_001_PATIENT_NOT_FOUND` → `patientId`,
`CASE_001_CODE_EXISTS` → `caseCode`. Los que no tengan campo van al toast, por `code`.
```

Reglas que el spec debe declarar cuando apliquen:

- **Combinaciones que el backend rechaza con `400`** y que el formulario debe impedir antes de enviar. En casos ESAVI son las de SPEC F48: exacta y rango sobre la misma columna son excluyentes **por columna**, `From` nunca posterior a `To`.
- **Fechas como `YYYY-MM-DD`.** Las columnas son `date`, no `timestamp`. Nada de ISO completo ni de conversión a UTC.
- **Se envía el objeto completo en el `PUT`.** El backend hace el update diferencial. El spec no propone calcular un diff en el cliente; si lo propusiera, estaría contradiciendo `CONVENTIONS.md` §6.5.
- **La validación del cliente no reemplaza a la del servidor.** Ahorra un viaje, nada más.

### 3.6 Estados de la pantalla — los cuatro, siempre

Toda vista declara qué se ve en cada uno. Un estado sin declarar acaba siendo una pantalla en blanco:

```markdown
| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de la tabla, 5 filas | — |
| Vacío (sin datos) | Ilustración + botón «Crear caso» | `esaviCase.list.empty` |
| Vacío (con filtros) | Texto + botón «Limpiar filtros» | `esaviCase.list.emptyFiltered` |
| Error | Mensaje del `EsaviApiError` por `code` + botón reintentar | `esaviCase.list.error` |
| Sin permiso | No se llega: el guard redirige. Y el `NavItem` no aparece | — |
```

**Distinguir «vacío» de «vacío con filtros» no es un adorno**: el segundo lleva salida y evita el callejón sin salida en el que el usuario cree que no hay datos.

El estado de error se decide por `code`, nunca parseando `message`, y **nunca muestra `errors`** al usuario.

### 3.7 Responsividad y accesibilidad

Qué pasa por debajo de `md` y qué exige el teclado:

```markdown
- **Tabla → tarjetas** por debajo de `md`. Los tres campos que sobreviven:
  código de caso, fecha de reporte, unidad de salud. El resto queda en el detalle.
- Los filtros colapsan en un `Sheet` inferior con contador de filtros activos.
- La barra de acciones del formulario queda fija abajo.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`.
- El listado es navegable con teclado; la fila abre el detalle con Enter.
- Los iconos sin texto llevan `aria-label` por i18n.
```

Elegir los tres campos de la tarjeta es una **decisión de producto**, no técnica: el spec la deja cerrada para que la implementación no la improvise.

### 3.8 Claves i18n nuevas

Tabla de claves con su uso. Van en los **tres** archivos de idioma:

```markdown
| Clave | Uso |
|---|---|
| `esaviCase.list.title` | Título de la pantalla y del `NavItem` |
| `esaviCase.list.emptyFiltered` | Estado vacío cuando hay filtros activos |
| `esaviCase.filters.dateFrom` | Etiqueta del rango de fechas |
```

`npm run i18n:check` exige paridad exacta: o están en los tres archivos o falla.

---

## 4. Plan de implementación

Pasos numerados. Cada paso deja el proyecto **compilando y arrancable** — nada de "implementar la mitad y seguir mañana".

En un spec de entidad, **un paso por artefacto** de `CONVENTIONS.md` §5 (tipos → recurso → schemas → páginas → ruta → navegación), precedido por lo que haga falta traer y cerrado por los de pruebas.

Cada paso lleva su línea `*Verificación:*` — cómo se comprueba a mano o con un comando que ese paso quedó bien:

```markdown
3. **Listado.** `EsaviCaseListPage.tsx` con `<ResourceTable>`, los 13 filtros en `searchParams`
   y el toggle de inactivos condicionado a `useCan(ADMIN)`.
   *Verificación:* aplicar un filtro y recargar la página lo conserva; el enlace copiado
   reproduce la misma vista en otra sesión; con rol `USER` el toggle no se renderiza.
```

**Reglas:**

- Cada paso debe poder committearse solo.
- El último paso **no** es "probar todo" — eso son los criterios de aceptación.
- Los pasos que corrigen algo van antes que los que amplían: si algo se rompe, que se rompa con superficie pequeña.

---

## 5. Criterios de aceptación

Checklist booleano. Cada ítem se verifica con sí o no. Prefiere comandos ejecutables sobre descripciones.

```markdown
- [ ] Las siete rutas de §3.2 se consumen y responden con lo esperado.
- [ ] Los seis artefactos de `CONVENTIONS.md` §5 existen.
- [ ] Aplicar un filtro y recargar conserva la vista; el enlace la reproduce en otra sesión.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] Las claves nuevas existen en es, en y nl; `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0.
```

**Bloque obligatorio de cierre.** Todo spec que produzca pantalla incluye estos cinco ítems, literalmente. No son opcionales ni se resumen en uno:

```markdown
- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/<entity>/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con los tres campos de §3.7
      y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` (y con `ANALYTICS` si aplica) el menú no ofrece lo que
      la ruta rechaza, y un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders
      y `aria-label`; las tres claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en
      `useState` ni en un store, ningún filtro fuera de `searchParams`.
```

Los tres primeros son los que de verdad discriminan, y por eso se verifican a mano: son exactamente los que nadie comprueba porque el desarrollo ocurre en escritorio, en claro y con `SUPERADMIN`.

Si el spec toca la sesión, añade además:

```markdown
- [ ] Dos peticiones que reciben `401` a la vez producen **un solo** `POST /api/auth/refresh`.
```

`npm run check` encadena `build`, `lint`, `i18n:check` y `test`. Es el criterio de cierre de todo spec.

**Antipatrones:**

- ❌ "Que se vea bien." → subjetivo.
- ❌ "Buena UX." → no verificable.
- ❌ "Sin bugs." → no operativo.
- ✅ "Con rol `USER` el toggle de inactivos no se renderiza." → verificable, booleano.

Conviene cerrar recorriendo el checklist de `references/CONVENTIONS.md` §14 y trasladando lo que aplique.

---

## 6. Decisiones tomadas y descartadas

La sección con más valor dentro de tres meses. Recoge **lo que se consideró**, no solo lo que se eligió. Viñetas con **Sí:** / **No:** y una razón breve cada una.

```markdown
- **Sí:** los trece filtros en `searchParams`, aunque la URL quede larga. Un filtro
  fuera de la URL no se comparte por enlace ni sobrevive al refresco.
- **No:** guardar el último filtro usado en `preferences`. Suena cómodo y produce
  el efecto contrario: el usuario abre la pantalla y no ve los casos que espera.
- **No:** búsqueda por texto sobre el nombre del paciente. Las columnas están
  cifradas de forma determinista: solo funciona la igualdad exacta. Es el SPEC F45
  del backend y tiene su propia forma.
```

Una decisión sin razón es la primera que alguien cuestiona después.

---

## 7. Riesgos identificados

Solo cuando hay riesgos no evidentes. Tabla simple:

```markdown
| Riesgo | Mitigación |
|---|---|
| Los 13 filtros producen URLs de más de 2 000 caracteres | Solo se serializan los que tienen valor; medido con los 13 activos: 380 caracteres |
| El toggle de inactivos con rol `USER` llamaría a `002B` y daría 403 | `createResource` elige por nivel de rol, y el control no se renderiza |
```

En specs pequeños o muy contenidos, omítela.

---

## 8. Impacto en pantallas existentes

Solo si el spec **cambia** algo ya construido: una primitiva de `shared/` que gana una prop, una clave i18n que se renombra, una ruta que se mueve.

Si el spec solo añade pantallas nuevas, omítela.

---

## Sección final — Lo que **no** está en este spec

Se repite explícitamente al final lo que **no** se va a hacer. La repetición es deliberada: la sección 2 ya lo dice, pero al final del documento sirve de recordatorio para quien solo lee las últimas líneas.

```markdown
## Lo que **no** está en este spec

- Exportar el listado a Excel.
- El wizard de notificación.
- Trabajo sin conexión.

Cada uno de esos, si aterriza, va en su propio spec.
```

La frase de cierre es literal y va en todos los specs del repositorio.

---

## Reglas globales del documento

- **Ningún endpoint inventado.** Todo lo que el spec consuma sale de `references/API-ROUTES.md`, citado con su código `ESAVI-*` y su rol mínimo. Si no está en el inventario, no existe, y el spec lo anota como dependencia del otro repositorio.
- **Toda pantalla declara su contrato de estado** (§3.4) y sus cuatro estados de vista (§3.6), y lleva el bloque de cinco criterios de aceptación (§5). Si algún dato es una excepción a las capas, lo dice y lo razona.
- **Una idea por frase.** Si una frase tiene dos comas y un punto y coma, pártela.
- **Nombres concretos.** Si dices "la página", di `features/esaviCase/EsaviCaseListPage.tsx`. Si dices "una clave", da la cadena exacta.
- **Sin TODOs.** Un TODO en un spec significa que la decisión no se tomó. Tómala, o déjala anotada como decisión pendiente con su razón.
- **Sin código ejecutable largo.** El spec describe; el código se escribe después. Fragmentos cortos para ilustrar tipos o estructuras, sí; componentes completos, no.
- **Markdown estándar.** Nada de extensiones raras: tiene que renderizar en GitHub sin sorpresas.
- **Contenido en español, identificadores en inglés.** Nombres de archivo, claves i18n, rutas y códigos de operación siempre en inglés.

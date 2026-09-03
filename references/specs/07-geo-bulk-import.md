# SPEC FE07 — Carga masiva de geografía y establecimientos

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell y autenticación), SPEC FE02 (fábrica de recursos y primitivas), SPEC FE04 (`geoLocation` y `geoLevelType`), SPEC FE06 (`healthFacility`), **SPEC F53 del backend** (importación masiva de geografía y establecimientos desde un `.xlsx`)
> **Fecha:** 2026-09-02
> **Objetivo:** Una pantalla que descarga la plantilla `.xlsx` de geografía y establecimientos, la sube al importador y muestra el informe de resultado.

---

## 1. Por qué existe este spec

Es el lado cliente del **SPEC F53** del backend, que está `Aprobado` y con sus dos rutas vivas en `geoLocation.routes.ts:22,28`.

**A — Cargar la geografía por el formulario es impracticable, y el backend ya lo dio por hecho.** `GeoLocationFormDialog.tsx` crea una fila cada vez, y cada fila necesita el UUID de su padre, que solo existe después de crear el padre. Un país con cuatro niveles administrativos son miles de altas **estrictamente encadenadas**. F53 §1.A lo dice con todas las letras y añade que fue *"lo que detectó la revisión del frontend"*: el importador nació de este repositorio y hasta ahora no tiene por dónde invocarse.

**B — Los establecimientos entran por la misma puerta, no por la suya.** No existe `POST /api/health-facilities/import` — ni en `references/API-ROUTES.md` ni en `src/routes/healthFacility.routes.ts` del backend. F53 §6 lo descartó a propósito: el padrón de establecimientos es la **segunda hoja** del mismo libro, porque un establecimiento cuelga de una geolocalización y cargarlos por separado obliga a que la geografía esté completa y resuelta antes. Este spec construye **una** pantalla, no dos.

**C — El `007` es la única operación del backend cuyo `200` no lleva el sobre `{ ok, message, data }`.** F53 §2 la registró como excepción nombrada en `CONVENTIONS.md` §10 del backend. Nuestro `client.ts:129-130` desenvuelve `response.data.data` incondicionalmente, así que hoy una descarga de plantilla recibiría `undefined`. Y hay un segundo filo del mismo cuchillo: con `responseType: 'blob'` los **errores** también llegan como `Blob`, de modo que `toEsaviApiError` (`client.ts:41-49`) leería `error.response.data.code` sobre un Blob y produciría un `EsaviApiError` sin `code`. Los tres `409` de `geoLevelType` —los únicos que traen el detalle accionable— se perderían justo cuando hacen falta.

**D — La plantilla es la mitad del valor, no una comodidad.** F53 §1.D: la hoja `catalogs` se genera desde la base viva y alimenta los desplegables de Excel, así que el operador **elige** un `level` y un `facilityTypeCode` en vez de adivinarlos. Y con `includeExisting=true` el mismo endpoint vuelca lo ya cargado, de modo que el par descargar–editar–subir es el mantenimiento ordinario de la geografía: apoyado en el update diferencial, reimportar sin cambios no escribe ni una fila. Una pantalla que solo supiera subir ficheros dejaría fuera la razón de ser del endpoint.

---

## 2. Alcance

**Dentro:**

- **Una pantalla nueva**, `/geo-locations/import`, en `src/features/geoLocation/GeoBulkImportPage.tsx`, con guard `<RequireRole level={ADMIN}>` — el rol del `007`, que es lo mínimo con lo que la pantalla sirve para algo.
- **Un `NavItem` nuevo** en el grupo *Geografía y unidades* de `shared/config/navigation.ts`, con `minLevel: ROLE_LEVELS.ADMIN`.
- **Consumo de `ESAVI-GEOLOC-007`** — descarga de la plantilla `.xlsx`, con un `<Switch>` `includeExisting` **activo por defecto** y una nota que explica que desactivarlo descarga la plantilla vacía.
- **Consumo de `ESAVI-GEOLOC-006`** — subida del `.xlsx` en `multipart/form-data`, con dos acciones distintas: **«Validar sin guardar»** (`dryRun: true`, botón secundario) e **«Importar»** (`dryRun: false`, botón primario con confirmación en `<AlertDialog>`).
- **La sección de subida envuelta en `useCan(SUPERADMIN)`**, y **sustituida** —no ocultada— por un texto que explica que la carga exige `SUPERADMIN` cuando el usuario es `ADMIN`.
- **Selector de fichero con zona de arrastre**, validación en cliente de extensión `.xlsx` y tamaño ≤ 20 MB, nombre del fichero visible y botón de quitar.
- **Indicador de trabajo en curso**: spinner más el texto «Cargando datos» mientras la petición está en vuelo, en las dos operaciones. Es indeterminado a propósito — el `006` es síncrono y no publica progreso.
- **El informe de F53 §3.7**: tarjetas de contadores por hoja, avisos propios cuando `inactiveMatched > 0` y cuando aparezcan `PARENT_CHANGED` / `LEVEL_CHANGED` / `LOCATION_CHANGED`, y la tabla de `errors` con hoja, fila y motivo traducido.
- **El recorte visible**: `errors` viene limitado a **20 por hoja** mientras `invalid` cuenta el total real, así que la pantalla dice «20 de 340» en vez de dejar creer que ya se vieron todos.
- **Las 23 claves i18n de `GeoRejectionReason`**, más las de la pantalla, en `es`, `en` y `nl`.
- **Dos cambios en `src/shared/api/client.ts`**, la excepción declarada del hallazgo C:
  - el interceptor de respuesta **no desenvuelve** cuando `response.config.responseType === 'blob'`;
  - el de error lee el `Blob` como texto y lo reparsea a `{ ok, message, code }` antes de construir el `EsaviApiError`, de modo que `getErrorMessage()` sigue decidiendo por `code`.
- **Invalidación de `['geoLocation']` y `['healthFacility']`** enteras tras una importación real — y **no** tras un `dryRun`, que no escribió nada.
- Dos hooks propios en `src/features/geoLocation/importApi.ts`, fuera de `createResource`: la fábrica cubre las siete operaciones canónicas y ninguna de éstas lo es.

**Fuera de alcance (otros specs):**

- **Descargar el informe de errores como fichero.** Con 340 errores y 20 visibles la tentación es evidente; es otra decisión y otro spec.
- **Historial de importaciones anteriores.** F53 §2 lo excluyó también en el backend: no hay tabla donde consultarlo.
- **Barra de progreso real.** El `006` es síncrono y no publica avance. El indicador es indeterminado, y ése es todo el alcance.
- **Pantalla de importación para los otros tres importadores del backend** — `ESAVI-CATITEM-006`, `ESAVI-DIAGTERM-007`, `ESAVI-WHODRUG-007`. El arreglo del blob de `client.ts` les deja el camino hecho, pero ninguna de esas tres entidades tiene aún pantalla.
- **Reintentar solo las filas rechazadas.** El endpoint no lo ofrece: la unidad es el libro entero.
- **Editar la plantilla en el navegador.** Se descarga, se edita en Excel y se sube.
- **Crear `geoLevelType` desde esta pantalla** cuando el `409` `LEVEL_TYPES_MISSING` lo delate. La pantalla explica el problema y enlaza a `/geo-level-types`; el alta se hace allí.
- **Los cinco endpoints nuevos de `whodrug-vaccines` y el `meddra/search`** que aparecieron en la última regeneración del inventario. No tienen nada que ver con esta pantalla.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Carga masiva | `/geo-locations/import` | `features/geoLocation/GeoBulkImportPage.tsx` | `<RequireRole level={ROLE_LEVELS.ADMIN}>` |

No hay segunda vista. El informe no es una ruta: es la respuesta de la mutación, renderizada bajo el formulario en la misma página.

**`NavItem` en `shared/config/navigation.ts`**, dentro del grupo `nav.groups.geography`, después de `nav.items.healthFacility`:

```
{ key: 'nav.items.geoBulkImport', icon: FileSpreadsheet,
  path: '/geo-locations/import', minLevel: ROLE_LEVELS.ADMIN }
```

`minLevel` es **ADMIN** porque es el rol mínimo real del `007` (`API-ROUTES.md`), y el `007` es lo único que un ADMIN puede hacer aquí. Ofrecerlo a `USER` produciría un `403` en la primera acción de la pantalla.

**La página se parte por rol, no por ruta.** El guard deja entrar a ADMIN; dentro, la sección de subida se decide con `useCan(ROLE_LEVELS.SUPERADMIN)`. Un ADMIN ve la tarjeta de plantilla operativa y, donde estaría la de subida, un texto que dice que la carga exige SUPERADMIN. **Sustituida, no ocultada**: una tarjeta que desaparece deja al ADMIN creyendo que la pantalla está a medio construir.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST /api/geo-locations/import            ESAVI-GEOLOC-006  SUPERADMIN  importar el .xlsx
GET  /api/geo-locations/import/template   ESAVI-GEOLOC-007  ADMIN       generar la plantilla
```

**`006`** — `multipart/form-data`, campo `file` (requerido) y `dryRun` (`'true' | 'false'`, por defecto `false`). Devuelve `200` con el informe de F53 §3.7. No es `201`: no hay recurso que devolver, y `data` no contiene ni un `geoLocationId`.

**`007`** — `?includeExisting=true|false`, por defecto `false`. Devuelve `200` con el `.xlsx` binario, `Content-Disposition: attachment`. **Sin sobre** — la desviación declarada de F53 §3.7. Sus errores sí salen con `{ ok, message, code, errors }`.

**Ninguna otra ruta se consume desde esta pantalla.** En concreto, `ESAVI-GEOLOC-002` no se llama para «previsualizar lo que hay»: el `007` con `includeExisting=true` ya es ese volcado, y en el formato que el importador sabe leer.

**Códigos de error que la pantalla trata por `code`**, todos de F53 §3.5–3.6:

| Código | Estado | Dónde se muestra |
|---|---|---|
| `GEOLOC_006_FILE_REQUIRED` | 400 | No debería llegar — el botón está deshabilitado sin fichero |
| `GEOLOC_006_FILE_INVALID` | 400 | Alerta sobre la tarjeta de subida |
| `GEOLOC_006_FILE_TOO_LARGE` | 413 | Prevenido en cliente; alerta si llega igual |
| `GEOLOC_006_LEVEL_TYPES_MISSING` | 409 | Alerta con enlace a `/geo-level-types` |
| `GEOLOC_006_LEVEL_TYPES_DUPLICATED_ORDER` | 409 | Alerta; el `message` del backend trae los órdenes repetidos |
| `GEOLOC_006_LEVEL_TYPES_NOT_CONTIGUOUS` | 409 | Alerta; el `message` trae el hueco |
| `GEOLOC_007_LEVEL_TYPES_*` | 409 | Los tres mismos, sobre la tarjeta de plantilla |

Los tres `409` de niveles **llevan el detalle en `message`, no en `errors`** — F53 §3.5 lo razona: `errors` vale `'Internal server error'` en producción. Así que aquí el `message` del backend **se muestra tal cual**, sin traducir de nuevo y sin concatenar (`CONVENTIONS.md` §6.2). Es el único sitio de la pantalla donde eso ocurre, y por eso se dice.

### 3.3 Tipos del contrato

`geography/geoImport.types.ts` **existe en el backend** y **no está en el mapa de `scripts/syncContracts.mjs`** (solo hay `geoLevelType` y `geoLocation`, líneas 22-23). El primer paso del plan añade la entrada:

```js
{ source: 'geography/geoImport.types.ts', dest: 'geoImport.ts' },
```

De ahí salen, sin escribir uno a mano: `ImportGeoDataInput`, `GenerateGeoTemplateInput`, `GeoRejectionReason` (el union de 23 motivos), `RejectedGeoRow`, `GeoEntityCounters` y `GeoImportReport`.

`ParsedGeoLocationRow` y `ParsedHealthFacilityRow` llegan en el mismo archivo pero **no los usa el cliente**: son internos del parser del backend.

**Nada va a `contracts/declared/`.** Estos tipos sí son un espejo real: el backend los exporta como tipos, a diferencia de `GeoLocation`, que vive en el modelo de Sequelize y por eso está declarado a mano.

Los tipos derivados del cliente —el estado del fichero elegido, las props de `<GeoImportReport>`— viven en la feature, no en `contracts/` (`CONVENTIONS.md` §9).

### 3.4 Contrato de estado

**`searchParams` queda vacío en esta pantalla.** No hay listado, filtros, paginación ni orden, y «el fichero que tengo abierto en el escritorio» no es compartible por enlace. Es la excepción que §3.4 obliga a razonar en voz alta, no un olvido.

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Fichero seleccionado | Componente | `useState<File \| null>` | Efímero; se pierde al recargar, y debe ser así |
| `includeExisting` del switch | Componente | `useState<boolean>`, inicial `true` | No se persiste: es una decisión por descarga |
| Diálogo de confirmación de «Importar» | Componente | `useState<boolean>` | |
| Zona de arrastre activa | Componente | `useState<boolean>` | Solo para el resaltado visual |
| Informe del `006` | TanStack Query | `useMutation().data` | **No se copia a `useState`** |
| Error del `006` / `007` | TanStack Query | `useMutation().error` | `EsaviApiError`, decidido por `code` |
| Petición en vuelo | TanStack Query | `useMutation().isPending` | Alimenta el spinner y «Cargando datos» |
| Nada | `searchParams`, `preferencesStore`, `uiStore`, `draftsStore` | — | |

**El informe vive en la mutación y desaparece cuando se lanza la siguiente.** Copiarlo a un `useState` para «conservarlo» es exactamente el bug de sincronización que `CONVENTIONS.md` §7 prohíbe: dejaría en pantalla el informe del `dryRun` mientras la importación real ya devolvió otro.

**`draftsStore` no interviene.** Es el búfer del wizard contra el cierre accidental de la pestaña; un `File` del sistema de ficheros no es serializable y no tendría sentido persistirlo.

**Invalidación tras el `006`:**

```ts
// solo cuando dryRun === false
queryClient.invalidateQueries({ queryKey: ['geoLocation'] });
queryClient.invalidateQueries({ queryKey: ['healthFacility'] });
```

Las dos claves **enteras**, por prefijo: una importación puede haber insertado dos mil filas y no hay forma útil de invalidar por id. Es imprescindible porque los dos recursos declaran `staleTime: 30 * 60 * 1000` (`geoLocation/api.ts:26`): sin esto, los dos listados muestran datos viejos durante media hora después de una carga.

**Un `dryRun` no invalida nada**, porque no escribió nada. Invalidar ahí tiraría dos cachés de catálogo a cambio de cero cambios.

**El `007` no toca la caché de Query.** Es una descarga, no una lectura cacheable: se implementa como `useMutation`, no como `useQuery`, precisamente para que TanStack no guarde un `Blob` de varios megas bajo una clave.

### 3.5 Formularios y validación

**Esta pantalla no lleva React Hook Form, y es una excepción declarada a `CONVENTIONS.md` §8.** No hay campos que registrar: hay un `File` y un booleano. Montar RHF sobre un `<input type="file">` que no se envía como JSON añade una capa sin comprar nada — ni errores por campo, ni `resolver`, ni `formState`. Lo que sí hay es un schema Zod, y se usa directamente.

**`geoImportFileSchema`** — `features/geoLocation/schemas.ts`, junto a los de la entidad:

| Regla | Valor | Por qué |
|---|---|---|
| Extensión | `.xlsx` | El endpoint acepta un solo formato (F53 §2) |
| Tamaño | ≤ 20 MB | El backend responde `413` `GEOLOC_006_FILE_TOO_LARGE`; subir 40 MB para que lo rechacen es una espera inútil |
| Presencia | requerido | Sin fichero los dos botones están deshabilitados |

Se ejecuta con `safeParse` **en el momento de elegir el fichero** —tanto por el botón como al soltarlo en la zona de arrastre—, no al enviar. Un `.pdf` arrastrado se rechaza en el acto con el mensaje bajo la zona, y el fichero no llega a `useState`.

**La validación del cliente no reemplaza a la del servidor.** Ahorra un viaje. El `413` y el `GEOLOC_006_FILE_INVALID` se siguen manejando aunque «no deberían pasar»: un `.xlsx` con la hoja `geoLocation` ausente pasa las tres reglas de arriba y lo rechaza el backend.

**El `007` no tiene formulario.** Un `<Switch>` `includeExisting`, activo por defecto, y un botón. La nota bajo el switch —`geoBulkImport.template.includeExistingHint`— dice que desactivarlo descarga la plantilla vacía.

**Nada de calcular diffs, filtrar ni deducir en el cliente.** El fichero se sube tal cual. Todo el trabajo —resolución del grafo, cascada, update diferencial— es del backend, y el cliente solo pinta el informe.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Inicial | Las dos tarjetas, sin fichero, sin informe. La de subida con los botones deshabilitados | `geoBulkImport.upload.noFile` |
| Carga (`007`) | Spinner en el botón de descarga + texto «Cargando datos» | `common.loading` |
| Carga (`006`) | Spinner sobre la tarjeta de subida + «Cargando datos». Los dos botones y el selector, deshabilitados | `common.loading` |
| Éxito con informe | El informe bajo las tarjetas: contadores, avisos y tabla de errores | `geoBulkImport.report.title` |
| Éxito sin nada que hacer | Informe con `inserted: 0, updated: 0` y `unchanged: N` — es el resultado correcto de reimportar sin editar, no un fallo | `geoBulkImport.report.allUnchanged` |
| Error | Alerta sobre la tarjeta que falló, con el texto resuelto por `code` | `geoBulkImport.errors.*` |
| Error de niveles (409) | Alerta con el `message` del backend **tal cual** + enlace a `/geo-level-types` | `geoBulkImport.errors.levelTypesAction` |
| Sin permiso (ADMIN) | La tarjeta de plantilla operativa; en lugar de la de subida, un texto que exige SUPERADMIN | `geoBulkImport.upload.requiresSuperadmin` |
| Sin permiso (USER) | No se llega: el guard redirige y el `NavItem` no aparece | — |

**«Vacío» aquí no es «no hay datos», es «no has elegido fichero»**, y su salida es el propio selector, que está justo encima. No hay callejón sin salida que evitar.

**Un informe con `invalid > 0` no es un estado de error.** El `006` respondió `200` y probablemente insertó filas; los rechazos son parte del resultado normal. La pantalla no pinta la tarjeta en rojo por eso — usa `--warning`, que ya existe en `src/index.css`.

`errors` del envelope **no se muestra nunca** (`CONVENTIONS.md` §6.2). El array `errors` **del informe** sí: es otro campo, con otro significado, y es la carne de la pantalla. La coincidencia de nombre es de F53 y conviene no tropezar con ella al implementar.

**Los tres avisos propios del informe**, que son lo que F53 §3.7 señala como más fácil de malinterpretar:

- `inactiveMatched > 0` → «el fichero toca N filas desactivadas y **no** se reactivan». Nivel `--warning`.
- Algún `PARENT_CHANGED`, `LEVEL_CHANGED` o `LOCATION_CHANGED` → «alguien editó una celda que movería el árbol; esas filas no se tocaron». Nivel `--warning`.
- Algún `ORPHAN` → «N filas se rechazaron en cascada por un rechazo en un nivel superior». Nivel informativo. Sin esto, leer `invalid: 340` sin saber que 339 son cascada de un solo `VALUE_TOO_LONG` es el malentendido más probable de este endpoint.

### 3.7 Responsividad y accesibilidad

- **La tabla de errores colapsa a tarjetas por debajo de `md`.** Los datos que sobreviven: **el motivo traducido como título**, y **hoja + fila** como línea secundaria. Cuando el motivo sea `VALUE_TOO_LONG`, la columna culpable se añade al título por interpolación.
- Las tarjetas de contadores van en `grid` de una columna en móvil y dos por hoja desde `md`.
- La zona de arrastre mantiene 44px de objetivo táctil en el botón «Elegir fichero», y **en móvil el arrastre no existe**: el botón es la única vía, y es suficiente.
- Los dos botones de acción se apilan a ancho completo por debajo de `sm`.
- `dvh`, nunca `vh`. El body no hace scroll horizontal en 375px.
- **La zona de arrastre es un `<label>` asociado al `<input type="file">`**, no un `<div>` con `onClick`. Así el teclado y el lector de pantalla la alcanzan sin código propio, que es la mitad del argumento de `CONVENTIONS.md` §10.3.
- El resultado de la validación del fichero se anuncia con `aria-live="polite"`, y el estado «Cargando datos» con `aria-busy` en la tarjeta.
- Los iconos son decorativos y llevan `aria-hidden`; el botón de quitar el fichero lleva `aria-label` por i18n.
- **Ningún color literal.** Los avisos usan `--warning` y `--destructive`; la tabla de errores hereda el tratamiento de `<ResourceTable>` sin serlo.

### 3.8 Claves i18n nuevas

Un bloque nuevo `geoBulkImport` en `src/locales/{es,en,nl}.json`, más una clave en `nav`.

| Clave | Uso |
|---|---|
| `nav.items.geoBulkImport` | Etiqueta del `NavItem` y de la paleta de comandos |
| `geoBulkImport.title` / `.description` | Cabecera de la pantalla |
| `geoBulkImport.template.title` / `.description` | Tarjeta de plantilla |
| `geoBulkImport.template.includeExisting` | Etiqueta del switch |
| `geoBulkImport.template.includeExistingHint` | «Desactivarlo descarga la plantilla vacía» |
| `geoBulkImport.template.download` | Botón de descarga |
| `geoBulkImport.upload.title` / `.description` | Tarjeta de subida |
| `geoBulkImport.upload.dropzone` / `.choose` / `.remove` | Zona de arrastre |
| `geoBulkImport.upload.noFile` | Estado inicial |
| `geoBulkImport.upload.requiresSuperadmin` | Sustituto de la tarjeta para ADMIN |
| `geoBulkImport.upload.validate` / `.import` | Los dos botones |
| `geoBulkImport.upload.confirmTitle` / `.confirmBody` / `.confirmAction` | `<AlertDialog>` de «Importar» |
| `geoBulkImport.upload.invalidExtension` / `.tooLarge` | Validación de cliente |
| `geoBulkImport.report.title` | Cabecera del informe |
| `geoBulkImport.report.dryRunNotice` | «Simulación: no se guardó nada» |
| `geoBulkImport.report.allUnchanged` | Reimportación sin cambios |
| `geoBulkImport.report.sheetGeoLocation` / `.sheetHealthFacility` | Títulos por hoja |
| `geoBulkImport.report.sheetMissing` | `sheets.healthFacility === null` |
| `geoBulkImport.report.counters.*` | Las ocho: `read`, `inserted`, `updated`, `unchanged`, `invalid`, `duplicated`, `inactiveMatched`, `sortOrderCoerced` |
| `geoBulkImport.report.warnInactiveMatched` | Aviso, con `{{count}}` |
| `geoBulkImport.report.warnTreeMoves` | Aviso de `PARENT_CHANGED` / `LEVEL_CHANGED` / `LOCATION_CHANGED` |
| `geoBulkImport.report.infoOrphans` | Aviso de cascada, con `{{count}}` |
| `geoBulkImport.report.missingOptionalHeaders` | Columnas ausentes; las filas existentes conservan su valor |
| `geoBulkImport.report.unknownHeaders` | Columnas ignoradas |
| `geoBulkImport.report.errorsTitle` | Cabecera de la tabla |
| `geoBulkImport.report.errorsTruncated` | **«{{shown}} de {{total}} errores»** |
| `geoBulkImport.report.errorsEmpty` | Ninguna fila rechazada |
| `geoBulkImport.report.columnHint` | Sufijo de `VALUE_TOO_LONG`, con `{{column}}` |
| `geoBulkImport.reasons.<REASON>` | **23 claves**, una por valor de `GeoRejectionReason` |
| `geoBulkImport.errors.GEOLOC_006_FILE_INVALID` | Fichero inválido |
| `geoBulkImport.errors.GEOLOC_006_FILE_TOO_LARGE` | 413 |
| `geoBulkImport.errors.GEOLOC_006_FILE_REQUIRED` | 400 |
| `geoBulkImport.errors.levelTypesAction` | «Configura los niveles geográficos» — el enlace del 409 |

Las 23 de `reasons`: `EMPTY_EXTERNAL_CODE`, `EMPTY_NAME`, `EMPTY_LEVEL`, `INVALID_LEVEL`, `MISSING_PARENT_CODE`, `UNEXPECTED_PARENT_CODE`, `DUPLICATE_IN_FILE`, `VALUE_TOO_LONG`, `CYCLE`, `GEO_LEVEL_NOT_FOUND`, `PARENT_NOT_FOUND`, `PARENT_INACTIVE`, `PARENT_LEVEL_MISMATCH`, `SIBLING_NAME_EXISTS`, `PARENT_CHANGED`, `LEVEL_CHANGED`, `ORPHAN`, `EMPTY_LOCAL_CODE`, `EMPTY_FACILITY_TYPE`, `EMPTY_GEO_CODE`, `GEO_NOT_FOUND`, `FACILITY_TYPE_NOT_FOUND`, `LOCATION_CHANGED`.

**Los seis `409` de niveles no tienen clave propia.** Su texto es el `message` del backend, que trae interpolados los órdenes repetidos o el hueco de la serie; traducirlo otra vez en el cliente perdería justo ese detalle. La única clave nuestra es la del enlace de acción.

**Los tres `GEOLOC_006_*` sí entran en `ERROR_CODE_KEYS`** de `shared/api/errorMessages.ts`, como los de las otras cinco entidades.

---

## 4. Plan de implementación

Los dos primeros pasos no añaden pantalla: abren el hueco del blob y traen los tipos. Van antes para que, si algo se rompe, se rompa con superficie pequeña — el paso 1 toca `client.ts`, que es el archivo del que dependen las cinco entidades ya construidas.

1. **La excepción del blob en `client.ts`.** El interceptor de respuesta salta la desenvoltura cuando `response.config.responseType === 'blob'`; el de error, cuando la respuesta es un `Blob`, lo lee con `.text()`, lo parsea a `{ ok, message, code }` y construye el `EsaviApiError` con su `code` real. Si el parseo falla, cae al `EsaviApiError` genérico con el `status` que sí se conoce.
   *Verificación:* `npm test -- client` sigue en verde sin tocar una aserción existente; un test nuevo comprueba que una respuesta `blob` llega **sin** desenvolver y que un `409` con cuerpo `Blob` produce un `EsaviApiError` cuyo `code` es `GEOLOC_007_LEVEL_TYPES_MISSING` y cuyo `message` es el del servidor; `grep -rn "response.data.data" src/` sigue sin devolver nada.

2. **Los tipos del contrato.** Entrada `{ source: 'geography/geoImport.types.ts', dest: 'geoImport.ts' }` en `scripts/syncContracts.mjs`, y `npm run contracts:sync`.
   *Verificación:* `src/contracts/geoImport.ts` existe con la cabecera de generado, exporta `GeoImportReport`, `GeoEntityCounters`, `RejectedGeoRow` y el union `GeoRejectionReason` con **23** miembros; el diff se revisa a mano; `npm run build` en 0.

3. **Las claves i18n.** El bloque `geoBulkImport` completo de §3.8 y `nav.items.geoBulkImport` en `es.json`, `en.json` y `nl.json`. Los tres `GEOLOC_006_*` añadidos a `ERROR_CODE_KEYS` en `shared/api/errorMessages.ts`.
   *Verificación:* `npm run i18n:check` en 0; el bloque `geoBulkImport.reasons` tiene 23 claves en los tres idiomas.

4. **Los dos hooks.** `features/geoLocation/importApi.ts` con `useGenerateGeoTemplate()` y `useImportGeoData()`, los dos `useMutation`, los dos con su código de operación en comentario. El `007` pide `responseType: 'blob'` y dispara la descarga con un `URL.createObjectURL` que se revoca después. El `006` arma el `FormData` y, en `onSuccess` **con `dryRun === false`**, invalida `['geoLocation']` y `['healthFacility']`.
   *Verificación:* test con MSW — el `007` no pasa por la desenvoltura y devuelve el `Blob`; el `006` con `dryRun: true` **no** invalida ninguna clave y con `dryRun: false` invalida las dos; `grep -n "axios" src/features/` no devuelve nada.

5. **El schema del fichero.** `geoImportFileSchema` en `features/geoLocation/schemas.ts`: extensión `.xlsx` y tamaño ≤ 20 MB.
   *Verificación:* test unitario — un `.pdf` falla con la clave de extensión, un `.xlsx` de 21 MB falla con la de tamaño, uno de 19 MB pasa.

6. **El informe.** `features/geoLocation/GeoImportReport.tsx`: tarjetas de contadores por hoja, el aviso de `dryRun`, los tres avisos de §3.6, `missingOptionalHeaders`, `unknownHeaders` y la tabla de errores con su recorte visible. Componente **puro**: recibe un `GeoImportReport` por props y no llama a nada.
   *Verificación:* renderizado con un informe fijo — con `inactiveMatched: 3` aparece el aviso y no aparece con `0`; con `invalid: 340` y 20 entradas en `errors` el texto dice «20 de 340»; con `sheets.healthFacility: null` la segunda hoja muestra el estado «no venía en el libro» y no ceros; con `errors: []` sale el estado vacío de la tabla.

7. **La pantalla.** `features/geoLocation/GeoBulkImportPage.tsx` con las dos tarjetas: plantilla (switch `includeExisting` inicial `true`, nota y botón) y subida (`<label>` con zona de arrastre, validación al elegir, «Validar sin guardar» e «Importar» con `<AlertDialog>`). La tarjeta de subida envuelta en `useCan(ROLE_LEVELS.SUPERADMIN)` y **sustituida** por el texto de `requiresSuperadmin` cuando no se cumple. Spinner y «Cargando datos» en las dos operaciones. El `409` de niveles renderiza el `message` del backend con el enlace a `/geo-level-types`.
   *Verificación:* con rol ADMIN la tarjeta de plantilla funciona y en lugar de la de subida aparece el texto de SUPERADMIN; con SUPERADMIN las dos funcionan; arrastrar un `.pdf` lo rechaza sin tocar el estado; «Importar» no envía hasta confirmar en el diálogo; durante la petición los dos botones y el selector están deshabilitados.

8. **Ruta y navegación.** `<Route path="/geo-locations/import" element={<GeoBulkImportPage />} />` en `app/router.tsx`, envuelta en `<RequireRole level={ROLE_LEVELS.ADMIN}>`, **declarada antes de cualquier ruta con parámetro bajo `/geo-locations`** por si alguna aterriza después. Y el `NavItem` de §3.1 en `shared/config/navigation.ts`.
   *Verificación:* `app/router.geoBulkImport.test.tsx` — con `USER` la ruta redirige y el ítem no está en el sidebar; con `ADMIN` entra y el ítem aparece en el grupo *Geografía y unidades*; el ítem sale también en la paleta de comandos, que lee del mismo array.

9. **El ciclo completo contra el backend local.** No es un test automatizado. Con el backend en el 4500: descargar la plantilla con `includeExisting=true`, abrirla en Excel, subirla **sin editar**, y después editar un solo `name` y volver a subirla.
   *Verificación:* la primera subida devuelve `updated: 0` y `unchanged: N` en las dos hojas y **ni un solo `PARENT_CHANGED`**; la segunda devuelve `updated: 1`; los desplegables de `level` y `facilityTypeCode` funcionan en Excel; tras la importación real, `/geo-locations` muestra las filas nuevas sin esperar los 30 minutos de `staleTime`.

El paso 9 es el que de verdad cierra el spec: el ciclo descargar–editar–subir es la razón de ser de F53 y no hay forma honesta de verificarlo con un mock de MSW.

---

## 5. Criterios de aceptación

- [ ] `/geo-locations/import` responde con la pantalla para ADMIN y redirige para USER y ANALYTICS.
- [ ] Con rol **ADMIN**, la tarjeta de plantilla funciona y la de subida está **sustituida** por el texto de `requiresSuperadmin` — no ausente.
- [ ] Con rol **SUPERADMIN**, las dos tarjetas funcionan.
- [ ] El `NavItem` aparece en el grupo *Geografía y unidades* con `minLevel: ADMIN`, y sale en la paleta de comandos sin escribirlo a mano en el sidebar.
- [ ] La descarga del `007` produce un `.xlsx` que Excel abre, con tres hojas y los desplegables de `level` y `facilityTypeCode` operativos.
- [ ] El switch `includeExisting` arranca en `true`; desactivarlo descarga la plantilla con solo las cabeceras.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados, y el `007` **no** pasa por la desenvoltura del interceptor.
- [ ] Un `409` del `007` llega como `EsaviApiError` **con su `code`** pese a venir en un `Blob`, y la pantalla muestra el `message` del backend con los órdenes repetidos o el hueco interpolados.
- [ ] Arrastrar o elegir un `.pdf` lo rechaza en el acto y el fichero no entra en el estado; un `.xlsx` de más de 20 MB también.
- [ ] «Importar» exige confirmación en el `<AlertDialog>`; «Validar sin guardar» no.
- [ ] `dryRun: true` **no** invalida `['geoLocation']` ni `['healthFacility']`; `dryRun: false` invalida las dos.
- [ ] Tras una importación real, `/geo-locations` y `/health-facilities` muestran las filas nuevas sin esperar los 30 minutos de `staleTime`.
- [ ] Con `invalid: 340` y 20 entradas en `errors`, la pantalla dice **«20 de 340»**.
- [ ] `inactiveMatched > 0` produce su aviso; `0` no lo produce.
- [ ] Un informe con `ORPHAN` explica que son rechazos en cascada, con el recuento.
- [ ] `sheets.healthFacility: null` muestra «no venía en el libro», no una hoja de ceros.
- [ ] Los 23 motivos de `GeoRejectionReason` tienen texto traducido; ninguno se renderiza como la constante en mayúsculas.
- [ ] Un informe con `invalid > 0` **no** pinta la pantalla como error: el `200` se trata como éxito con advertencias.
- [ ] El array `errors` del **envelope** no se muestra nunca; el `errors` del **informe** sí.
- [ ] `npm run i18n:check` sale en 0 y el bloque `geoBulkImport.reasons` tiene 23 claves en los tres idiomas.
- [ ] Las suites de las cinco entidades ya construidas pasan sin tocar una aserción tras el cambio de `client.ts`.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/geoLocation/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla de errores colapsa a tarjetas con motivo como título y hoja + fila como línea secundaria, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` y con `ANALYTICS` el menú no ofrece la pantalla y la ruta redirige; un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`; todas las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: el informe vive en `useMutation().data` y no se copia a `useState`, y `searchParams` queda vacío.

---

## 6. Decisiones tomadas y descartadas

**Sobre la forma de la pantalla**

- **Sí:** una sola pantalla para las dos entidades. No es una elección de diseño del cliente: el backend expone **un** endpoint que carga las dos hojas del mismo libro, y partir la interfaz en dos inventaría una separación que la API no tiene.
- **No:** un botón «Carga masiva» dentro de `GeoLocationListPage`. Esconde dentro del listado de geolocalizaciones una operación que también alimenta el padrón de establecimientos — invisible desde la mitad de su alcance.
- **No:** dos rutas separadas por rol, `/geo-locations/template` para ADMIN y `/geo-locations/import` para SUPERADMIN. Duplica una pantalla para expresar un reparto que `useCan()` resuelve en tres líneas, y obliga a dos `NavItem` para una sola tarea.
- **Sí:** sustituir la tarjeta de subida por un texto para el ADMIN, en vez de ocultarla. Una tarjeta que desaparece deja al usuario creyendo que la pantalla está a medio construir; un texto que dice «esto exige SUPERADMIN» le dice a quién pedírselo.

**Sobre `dryRun`**

- **Sí:** dos botones distintos, «Validar sin guardar» e «Importar». El importador rechaza **en cascada**, y un `VALUE_TOO_LONG` en el nivel 2 puede sacar 339 filas con `ORPHAN` (F53 §3.7). Validar antes no es un lujo, es el uso normal, y un botón propio lo dice mejor que cualquier etiqueta.
- **No:** un checkbox «modo prueba» junto a un botón único. Obliga a leer el estado de un control para saber qué va a pasar al pulsar, y el precio de equivocarse es asimétrico: creer que estás validando cuando estás escribiendo.
- **Sí:** confirmación en `<AlertDialog>` solo para «Importar». «Validar» no escribe nada y pedir confirmación para ello enseña a confirmar sin leer.

**Sobre la plantilla**

- **Sí:** un botón único con `<Switch>`, `includeExisting` **activo por defecto**. Editar sobre el volcado es lo que evita vaciar columnas por omisión (F53 §3.5), así que el camino correcto debe ser el que no exige tocar nada.
- **No:** dos botones, «vacía» y «con datos». Se consideró y se descartó: duplica el control principal de la tarjeta para una variante que el 90% de las veces no se usa.
- **Sí:** una nota explícita bajo el switch. Un switch activo por defecto que cambia el contenido del fichero descargado necesita decir qué pasa al apagarlo.

**Sobre la capa de API**

- **Sí:** la excepción del blob dentro de `client.ts`, en los dos interceptores. Es un cambio en la primitiva compartida y lo heredan los otros tres importadores del backend el día que tengan pantalla.
- **No:** `fetch` directo para la descarga. Rompe `CONVENTIONS.md` §6.1 y se lleva por delante el `Authorization`, el `?lang=` y la cola de refresh — precisamente en la petición más larga de la aplicación, que es la más probable de pillar un token caducado.
- **No:** `responseType: 'arraybuffer'` discriminando por `Content-Type`. Funciona, pero pone la lógica de «esto es un error o un fichero» en el consumidor en vez de en el interceptor, que es donde vive el resto del contrato.
- **Sí:** reparsear el `Blob` de error para recuperar el `code`. Sin eso, los tres `409` de niveles —los únicos con detalle accionable— llegarían mudos.
- **Sí:** el `007` como `useMutation`, no como `useQuery`. Una descarga no es una lectura cacheable, y `useQuery` guardaría un `Blob` de varios megas bajo una clave que nadie invalida.

**Sobre el estado y la caché**

- **Sí:** invalidar `['geoLocation']` y `['healthFacility']` enteras tras una importación real. Los dos recursos declaran `staleTime` de 30 minutos; sin esto, una carga de 2.000 filas no se ve en los listados durante media hora.
- **No:** invalidar tras un `dryRun`. Tira dos cachés de catálogo a cambio de cero cambios.
- **No:** copiar el informe a `useState` para conservarlo entre ejecuciones. Es el bug de sincronización de `CONVENTIONS.md` §7 en su forma más directa: dejaría en pantalla el informe del `dryRun` mientras la importación real ya devolvió otro.
- **Sí:** `searchParams` vacío. Es la excepción que §3.4 obliga a razonar: no hay filtros ni paginación, y un `File` del escritorio no se comparte por enlace.

**Sobre el formulario**

- **Sí:** sin React Hook Form, contra la norma general de `CONVENTIONS.md` §8. Un `File` y un booleano no son campos: no hay `resolver` que aporte nada, ni errores por campo que mapear.
- **Sí:** el schema Zod igualmente, ejecutado con `safeParse` al elegir el fichero. La regla que importaba de §8 era «la validación se declara en un schema», y esa se cumple.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El cambio de `client.ts` afecta a las cinco entidades ya construidas | El paso 1 va primero y aislado; su verificación exige que las suites existentes pasen sin tocar una aserción. La rama de blob solo se activa con `responseType === 'blob'`, que hoy no usa nadie |
| Una importación de miles de filas agota el timeout por defecto de axios | El cliente no fija `timeout`, así que hereda el del navegador. Si el paso 9 lo desmiente con datos reales, la respuesta es subir el timeout **de esta petición**, no del cliente entero |
| El `Blob` de error no es JSON parseable (un 502 de un proxy devuelve HTML) | El reparseo va en `try/catch` y cae al `EsaviApiError` genérico con el `status` real, que sí se conoce siempre |
| El usuario cree que `invalid: 340` son 340 problemas distintos | El aviso de `ORPHAN` con recuento y el texto «20 de 340». Es el malentendido que F53 §3.7 declara más probable |
| El usuario reimporta y no entiende `updated: 0` | La clave `report.allUnchanged` lo nombra como el resultado correcto, no como un fallo |
| Un ADMIN llega por enlace directo y encuentra media pantalla | Es el comportamiento diseñado, y el texto de `requiresSuperadmin` lo explica en el sitio donde estaría el control |

---

## 8. Impacto en pantallas existentes

Ninguna pantalla cambia, pero **cuatro archivos compartidos sí**:

| Archivo | Cambio | Quién lo hereda |
|---|---|---|
| `src/shared/api/client.ts` | Excepción de blob en los dos interceptores | Las cinco entidades ya construidas, sin cambio de comportamiento |
| `src/shared/api/errorMessages.ts` | Tres entradas `GEOLOC_006_*` en `ERROR_CODE_KEYS` | Solo esta pantalla |
| `scripts/syncContracts.mjs` | Una entrada nueva en el mapa | Todo `contracts:sync` posterior |
| `src/shared/config/navigation.ts` | Un `NavItem` en *Geografía y unidades* | El sidebar y la paleta de comandos, que leen del mismo array |

`GeoLocationListPage` y `HealthFacilityListPage` **no se tocan**. No se les añade botón ni enlace a la carga masiva: el `NavItem` ya la sitúa en el mismo grupo del menú, y un acceso duplicado obligaría a repetir la comprobación de rol en dos sitios.

---

## Lo que **no** está en este spec

- Descargar el informe de errores como fichero.
- Historial de importaciones anteriores.
- Barra de progreso real del `006`.
- Pantalla de importación para `ESAVI-CATITEM-006`, `ESAVI-DIAGTERM-007` y `ESAVI-WHODRUG-007`.
- Reintentar solo las filas rechazadas.
- Editar la plantilla dentro del navegador.
- Crear `geoLevelType` desde esta pantalla.
- Los cinco endpoints nuevos de `whodrug-vaccines` y el `meddra/search`.

Cada uno de esos, si aterriza, va en su propio spec.

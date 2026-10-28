# SPEC FE30 — Importación masiva de ítems de catálogo

> **Estado:** Implementado
> **Depende de:** SPEC FE03 (listado de `catalogItem`; su §2 difería esta importación), SPEC FE25b (flujo de importación: simular, confirmar, descartar el informe), SPEC FE25c (primitiva `<ImportReport>`, generalizada por SPEC FE25d), SPEC F20 del backend (`ESAVI-CATITEM-006`, con sus dos enmiendas)
> **Fecha:** 2026-10-27
> **Objetivo:** Dar a SUPERADMIN una página para subir un `.xlsx` de ítems de catálogo, simularlo, importarlo y leer el informe. Incluye una plantilla vacía descargable y un aviso explícito cuando la carga crea tipos de catálogo nuevos.

---

## 1. Por qué existe este spec

`ESAVI-CATITEM-006` existe en el backend desde SPEC F20, pero el cliente no lo consume: `catalogItem/api.ts:12` lo marca como «not consumed (own spec, SPEC FE03 §2)». Este es ese spec. De las cuatro importaciones de `API-ROUTES.md`, es la única que no tiene pantalla. Geo (FE07), términos diagnósticos (FE25b) y vacunas WHODrug (FE25c) ya la tienen.

Sin ella, la única forma de cargar el catálogo de configuración desde la interfaz es crear los ítems uno a uno con el diálogo del `001`. Poner en marcha un país son cientos de ítems, y el resultado previsible es el que F20 quería evitar: un catálogo cargado por SQL directo, sin `appDetails` ni normalización.

Este spec reutiliza casi todo: el flujo de FE25b y `<ImportReport>` tal como está. Tiene tres diferencias con sus hermanos, y las tres vienen del backend:

- **A. Escribe en dos tablas.** Cuando un `catalogTypeCode` no existe, el backend **crea el tipo al vuelo**, y una errata en esa columna no falla: funda un tipo que nadie pidió y que no se puede revertir. La única señal es `catalogTypesCreated`. Por eso esta pantalla le da tratamiento propio: un aviso en el informe cuando es mayor que cero, y la cifra repetida en el diálogo de confirmación si hay una simulación vigente del mismo fichero. Por la misma razón, la invalidación alcanza también a `['catalogType']`.
- **B. El fichero no lleva `code`.** El código se acuña a partir del `name`. Una columna `code` se ignora, y reimportar un ítem cuyo `code` se fijó a mano con el `004` **inserta un duplicado** en vez de actualizarlo (enmienda F20 del 2026-08-20). La página lo explica antes de subir el fichero, no después.
- **C. No hay endpoint de plantilla.** A diferencia de `ESAVI-GEOLOC-007`, aquí no existe, y este spec no lo inventa. La plantilla es un `.xlsx` estático en `public/` que nace de la muestra del repositorio, sin datos y sin la columna `code`.

---

## 2. Alcance

**Dentro:**

- Página **`/catalog-items/import`**: `features/catalogItem/CatalogItemImportPage.tsx`, con `<RequireRole level={SUPERADMIN}>`. Se declara en `app/router.tsx` antes de cualquier segmento dinámico de `/catalog-items`.
- **`features/catalogItem/importApi.ts`**: `useImportCatalogItems()`, una `useMutation` sobre `POST /api/catalog-items/import` (`ESAVI-CATITEM-006`) en `multipart/form-data` con `file` y `dryRun`. Con `dryRun: false` invalida `['catalogItem']` y `['catalogType']`.
- **`importCatalogItemsSchema`** en `features/catalogItem/schemas.ts`: fichero obligatorio, extensión `.xlsx` y como máximo 20 MB, todo comprobado en el cliente.
- **Simular / Importar / descartar el informe**, el mismo flujo que SPEC FE25b §3.5.
- **El diálogo de confirmación de «Importar»** repite `catalogTypesCreated` si hay una simulación vigente del mismo fichero.
- **El informe** con `<ImportReport>` sin modificarlo:
  - ocho contadores: los seis comunes, más `catalogTypesCreated` y `sortOrderCoerced`;
  - `rejectedTotal = invalid + duplicated`;
  - las tres columnas de rechazo (`row`, `reason` traducido y `column`);
  - en `children`: la hoja leída, `missingOptionalHeaders`, `unknownHeaders` y el `<Alert>` de tipos nuevos cuando `catalogTypesCreated > 0`.
- **Ayuda previa a la carga**:
  - las seis cabeceras, marcando las tres obligatorias;
  - que se lee la primera hoja, con la cabecera en la fila 1;
  - que una columna `code` se ignora;
  - el aviso de duplicado al reimportar ítems con `code` fijado a mano.
- **Plantilla descargable** en `public/templates/catalog-items-template.xlsx`. Sale de `../catalog-items-sample.xlsx`: misma hoja `Items`, solo la fila de cabecera y sin la columna `code`. Se enlaza con `<a href download>`, sin pasar por la API.
- **Botón «Importar catálogo»** en la cabecera de `CatalogItemListPage` y en su estado vacío, visible solo con `useCan(SUPERADMIN)`.
- Se retira el comentario «not consumed» de `catalogItem/api.ts:12` y se cita el `006` donde se consume.
- **Claves i18n nuevas** en el bloque `catalogItem` de `es`, `en` y `nl`.
- **Tests**:
  - `importApi.test.tsx` (MSW): el `FormData`, y la invalidación según `dryRun`;
  - `CatalogItemImportPage.test.tsx`: flujo, errores por `code`, el aviso de tipos y el diálogo;
  - el router: guard SUPERADMIN.

**Fuera de alcance:**

- **La importación de `catalogType`.** No existe en `API-ROUTES.md`; si hace falta, empieza por un spec del backend.
- **Un endpoint de plantilla** al estilo de `ESAVI-GEOLOC-007`. No está en el inventario, y la plantilla estática lo sustituye.
- **Decir *qué* tipos se crearían.** El informe solo da la cifra, y el cliente no la reconstruye leyendo el `.xlsx` en el navegador: no se añade un parser de Excel al cliente.
- **Hacer obligatoria la simulación** antes de importar. Se descarta por simetría con FE25b y FE25c (§6).
- **La entrada de importación en `/catalog-types`** y cualquier `NavItem` propio.
- **Deshacer una importación, o desactivar los tipos que creó.** Se hace a mano con el `005A` de `CATTYPE`.
- **La columna `code` en el fichero, y elegir hoja o fila de cabecera.** Son reglas de F20 que el cliente no puede cambiar.
- **Modificar `<ImportReport>`.** Lo propio de esta importación va por `children` y por la lista de `counters`.
- **Corregir la muestra `../catalog-items-sample.xlsx`.** Queda fuera de los dos repositorios; este spec solo deriva de ella la plantilla.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Importación | `/catalog-items/import` | `features/catalogItem/CatalogItemImportPage.tsx` | `<RequireRole level={SUPERADMIN}>` |
| Listado (cambia) | `/catalog-items` | `features/catalogItem/CatalogItemListPage.tsx` | sin cambios (`USER`) |

**Router.** La ruta se declara junto a `/catalog-items`, antes de cualquier segmento dinámico. Hoy no hay ninguno, pero así ningún `/:id` futuro la captura.

**Menú.** Sin `NavItem`. Se llega desde el listado, igual que en las tres importaciones hermanas.

**Cambios en el listado.**
- Botón «Importar catálogo», con `useCan(SUPERADMIN)`, que navega a `/catalog-items/import`.
- Aparece en la cabecera y como `emptyExtraAction` del estado vacío, con el mismo patrón que `VaccineWhodrugListPage.tsx:359-431`.

**Página de importación**, de arriba abajo:

1. **Cabecera.** Título y enlace «Volver a ítems de catálogo», que lleva a `/catalog-items` y conserva el `typeId` si se llegó con él (`location.state`).
2. **Ayuda del fichero.** Un bloque colapsable que se abre la primera vez y cuyo estado no se persiste:
   - una tabla con las seis cabeceras, si son obligatorias o no, y qué hace cada una;
   - tres notas fijas: «Se lee la primera hoja, con la cabecera en la fila 1»; «Una columna `code` se ignora: el código se genera a partir del nombre»; «`value` vacío toma el nombre; `sortOrder` vacío o inválido entra como 0»;
   - el enlace «Descargar plantilla (.xlsx)».
3. **Aviso fijo** (`<Alert>`, `role="note"`), siempre visible: «Si un ítem tiene un código fijado a mano, reimportarlo crea un duplicado en lugar de actualizarlo. Y un `catalogTypeCode` que no existe crea un tipo nuevo que no se puede deshacer: simula antes».
4. **Formulario.** Selector de fichero y los botones «Simular» e «Importar».
5. **Informe.** Aparece cuando hay `mutation.data` (§3.7).

**Diálogo de confirmación de «Importar».** Es un `AlertDialog`.
- Cuerpo base: «Esto escribirá los ítems en la base de datos y actualizará los que ya existen. Si solo quieres comprobar el archivo, usa «Simular»».
- Si `mutation.data?.dryRun === true` y `catalogTypesCreated > 0`, añade en `text-warning`: «La simulación de este archivo crearía N tipos de catálogo nuevos».
- Si hay simulación y la cifra es 0, añade: «La simulación no crearía tipos nuevos».
- Sin simulación, solo el cuerpo base.

  Como cualquier cambio de fichero hace `mutation.reset()`, un `data` con `dryRun: true` describe siempre el fichero actual. No hace falta guardar aparte «de qué fichero era la simulación».

### 3.2 Endpoints consumidos

```
POST   /api/catalog-items/import   ESAVI-CATITEM-006   SUPERADMIN   importación .xlsx (multipart)
```

**Cuerpo** (`multipart/form-data`):

| Campo | Regla |
|---|---|
| `file` | `.xlsx`, máx. 20 MB |
| `dryRun` | `'true'` o `'false'`; viaja como string porque es un campo de `FormData` |

Sin `dictionaryVersion`, `sheet` ni `encoding`: F20 §3.4 no los acepta.

**Respuesta:** `200`, con `CatalogItemImportReport` desenvuelto por `client.ts`.

**Lo que no se consume:**
- `ESAVI-CATITEM-001` a `007`. Los demás ya los consume el listado (FE03) y esta página no los necesita.
- No hay endpoint de plantilla: la plantilla es un fichero estático (§3.9).

### 3.3 Tipos del contrato

`contracts/catalogItem.ts` ya está en `SYNC_MAP` y aporta todo:
- `ImportCatalogItemsInput` (`{ dryRun?: boolean }`);
- `CatalogItemImportReport`;
- `RejectedCatalogItemRow`, con `reason` como unión de seis literales y `column?`.

Antes del paso 1 se ejecuta `npm run contracts:sync` para confirmar que no hay diferencias.

**Variables de la mutación:** `ImportCatalogItemsVariables { file: File; dryRun: boolean }`, declaradas en `importApi.ts`. Siguen el patrón de `vaccineWhodrug/importApi.ts` y no se añade nada a `contracts/declared/`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Fichero elegido | Componente | `useState<File \| null>` | Un `File` no se serializa: no puede ir a la URL ni a un store. Se valida con `importCatalogItemsSchema` al pulsar. |
| Error de validación del fichero (cliente o servidor) | Componente | `useState<string \| null>` | Se limpia al cambiar de fichero. |
| Informe (simulado o definitivo) | TanStack Query | `useMutation().data` | Nunca se copia a `useState`. Es también la fuente de la cifra del diálogo. |
| En curso | TanStack Query | `useMutation().isPending` | Deshabilita los botones y el selector. |
| Error de `IMPORT_FAILED` | TanStack Query | `useMutation().error` | Se pinta como `<Alert>` de página. |
| Diálogo de confirmación abierto | Componente | `useState<boolean>` | Efímero. |
| Ayuda desplegada | Componente | `useState<boolean>` | Efímero; no se persiste. |
| `typeId` de vuelta al listado | Router | `location.state.typeId` | Solo para el enlace «Volver». No va a la URL de la importación, porque no filtra nada aquí. |

**Ningún dato en Zustand.** Sin `drafts`: un fichero no sobrevive a recargar la pestaña de ninguna forma.

**Invalidación**, en `importApi.ts`, `onSuccess`:
- Con `dryRun: true`, no se invalida nada.
- Con `dryRun: false`, se invalidan `['catalogItem']` **y** `['catalogType']`.
  - Lo segundo es la diferencia con FE25b y FE25c, y viene de A (§1): un tipo creado al vuelo tiene que aparecer en `/catalog-types`, en `<CatalogTypeSelect>` y en el selector de tipo del listado de ítems.
  - Sin eso, el `staleTime` de 30 min de las dos fábricas lo escondería media hora.
  - `<CatalogSelect>` cuelga de `['catalogItem', …]` y se refresca con la primera invalidación.

### 3.5 Formularios y validación

**`importCatalogItemsSchema`**, en `features/catalogItem/schemas.ts`:

| Campo | Control | Regla |
|---|---|---|
| `file` | `<input type="file" accept=".xlsx">` con su `<Label>` | Obligatorio. Extensión `.xlsx` (sin distinguir mayúsculas). Máximo 20 MB, comprobado **antes** de enviar. |

- **No hay React Hook Form**: un solo campo de tipo `File` no lo justifica. Es la misma decisión que en FE25b para el fichero, y el schema se aplica con `safeParse` al pulsar.
- «Simular» envía `dryRun=true`. «Importar» abre el diálogo de §3.1 y, al confirmar, envía `dryRun=false`.
- Si cambia el fichero, se hace `mutation.reset()`: ningún informe describe un fichero distinto del que se va a importar.

**Errores del servidor**, por `EsaviApiError.code`; nunca se muestra `errors`:

| `code` | Estado | Destino |
|---|---|---|
| `CATITEM_006_FILE_REQUIRED` | 400 | Campo `file` |
| `CATITEM_006_FILE_TOO_LARGE` | 413 | Campo `file` |
| `CATITEM_006_FILE_INVALID` | 400 | Campo `file`: «El archivo no es un .xlsx válido, le faltan cabeceras obligatorias (`catalogTypeCode`, `catalogTypeName`, `name`) o no tiene filas válidas» |
| `CATITEM_006_IMPORT_FAILED` | 500 | `<Alert>` de página: «La importación falló y se revirtió el lote en curso; puede que otra importación esté corriendo. Los lotes anteriores sí se guardaron: reimportar el archivo es seguro» |
| Cualquier otro, incluido `UNKNOWN_ERROR` | — | Toast genérico por `code` |

La última frase de `IMPORT_FAILED` sale de F20 §7: los lotes ya confirmados quedan y la reimportación es idempotente.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Inicial | Ayuda, aviso fijo y formulario. «Simular» e «Importar» deshabilitados sin fichero | — |
| En curso | Botones y selector deshabilitados, indicador indeterminado y «Importando… no cierres esta pestaña» | `catalogItem.import.running` |
| Error de fichero | Mensaje bajo el selector, con `aria-describedby` | `catalogItem.errors.CATITEM_006_*` |
| Error de importación | `<Alert variant="destructive">` sobre el formulario | `catalogItem.errors.CATITEM_006_IMPORT_FAILED` |
| Informe simulado | `<ImportReport dryRun>` con la marca de simulación | `common.importReport.dryRunNotice` |
| Informe definitivo | `<ImportReport>` y el enlace «Ver ítems de catálogo» a `/catalog-items` | `catalogItem.import.viewItems` |
| Sin permiso | El guard SUPERADMIN redirige; el botón del listado no se renderiza para quien no lo tiene | — |

**Aviso de tipos nuevos.** Va dentro del informe, como primer hijo de `children`, con `<Alert>` de advertencia y solo si `catalogTypesCreated > 0`:
- en simulación: «Esta carga crearía N tipos de catálogo nuevos. Si no lo esperabas, revisa la columna `catalogTypeCode`: puede haber una errata»;
- definitivo: «Se crearon N tipos de catálogo nuevos. Si alguno no debía existir, desactívalo desde Tipos de catálogo», con un enlace a `/catalog-types`.

Usa plural i18next (`_one` / `_other`).

### 3.7 El informe

`<ImportReport>` sin modificarlo:

- **`counters`**, en este orden:
  - `read`, `inserted`, `updated`, `unchanged`, `invalid` y `duplicated`, con las etiquetas de `common.importReport.*`;
  - `catalogTypesCreated` y `sortOrderCoerced`, con las etiquetas de `catalogItem.import.report.*`.
- **`rejectedTotal`** = `invalid + duplicated`. El backend cuenta `CATALOG_TYPE_NAME_REQUIRED` dentro de `invalid` (`catalogItem.service.ts:641`), así que la suma cubre las dos fuentes de rechazo.
- **`rejected`** = `errors`.
- **`rejectedColumns`**:

  | `key` | Cabecera | Render |
  |---|---|---|
  | `row` | Fila | `row`, número de fila de Excel (la 1 es la cabecera) |
  | `reason` | Motivo | `t('catalogItem.import.reasons.' + reason)` |
  | `column` | Columna | `column ?? '—'`; solo `VALUE_TOO_LONG` lo trae |

- **`children`**, en este orden:
  1. el aviso de tipos nuevos (§3.6);
  2. un `<dl>` con «Hoja leída» (`sheet`);
  3. «Cabeceras opcionales ausentes» (`missingOptionalHeaders`, separadas por coma, solo si hay);
  4. «Cabeceras desconocidas (se ignoraron)» (`unknownHeaders`, solo si hay);
  5. si `unknownHeaders` incluye `code`, sin distinguir mayúsculas, una nota debajo: «La columna `code` no se usa: el código se genera a partir del nombre».
- **`sortOrderCoerced > 0`** no lleva aviso propio: el contador basta, porque la coerción no pierde filas (F20 §3.5, punto 10).

**Motivos traducidos** (`catalogItem.import.reasons.*`):

| `reason` | Texto (es) |
|---|---|
| `EMPTY_CATALOG_TYPE_CODE` | Falta el código del tipo (`catalogTypeCode`). |
| `EMPTY_NAME` | Falta el nombre. |
| `EMPTY_CODE` | El nombre no genera ningún código (solo tiene símbolos o separadores). |
| `VALUE_TOO_LONG` | Un valor supera la longitud de su columna. |
| `DUPLICATE_IN_FILE` | El mismo nombre ya apareció antes en el archivo, bajo el mismo tipo. |
| `CATALOG_TYPE_NAME_REQUIRED` | El tipo no existe y falta `catalogTypeName` para crearlo. |

### 3.8 Responsividad y accesibilidad

- **Una columna en móvil**: ayuda, aviso, formulario e informe apilados. La tabla de cabeceras de la ayuda y la de rechazos hacen scroll horizontal dentro de su contenedor; la página no hace scroll lateral.
- **Botones**: «Simular» e «Importar» van uno al lado del otro por encima de `sm` y a todo el ancho y apilados por debajo, con objetivos táctiles de 44px. El hallazgo de que `<Button>` mide 32px es transversal y no se resuelve aquí.
- **Selector de fichero**: tiene `<Label>`, la ayuda va en `aria-describedby` y el error también.
- **Foco**: al terminar una mutación, el foco va al título del informe (lo hace `<ImportReport>`). Si hay error de fichero, el foco vuelve al selector.
- **Avisos**: el de tipos nuevos lleva `role="status"`, para que se anuncie junto al informe. El aviso fijo es `role="note"` y no se anuncia.
- **Enlace de la plantilla**: lleva el atributo `download`, y su texto dice el formato.

### 3.9 Plantilla descargable

| Aspecto | Decisión |
|---|---|
| Ubicación | `public/templates/catalog-items-template.xlsx`, servida como `/templates/catalog-items-template.xlsx` |
| Origen | `../catalog-items-sample.xlsx` (fuera del repositorio) |
| Contenido | La hoja `Items` con solo la fila 1: `catalogTypeCode, catalogTypeName, name, value, description, sortOrder`. **Sin filas de datos y sin la columna `code`** |
| Cómo se genera | Una sola vez, en el paso de implementación, con un script fuera de `src/` que no se commitea. El `.xlsx` resultante **sí** se commitea (`.gitignore` no excluye `*.xlsx`) |
| Cómo se descarga | `<a href="/templates/catalog-items-template.xlsx" download>`, sin pasar por `client.ts` ni por TanStack Query |
| Verificación | Subir la plantilla tal cual debe dar `CATITEM_006_FILE_INVALID` por no tener filas. Con una fila añadida, `unknownHeaders` y `missingOptionalHeaders` deben venir vacíos |

### 3.10 Claves i18n nuevas

**Bloque `catalogItem`**, en los tres idiomas:

| Grupo | Claves |
|---|---|
| `list.import` | el botón «Importar catálogo» |
| `import.*` | `title`, `back`, `file`, `fileHint`, `simulate`, `run`, `confirmTitle`, `confirmBody`, `confirmTypesCreated_one`, `confirmTypesCreated_other`, `confirmNoTypesCreated`, `confirmAction`, `running`, `viewItems`, `fixedNote` |
| `import.help.*` | `title`, `template`, `firstSheet`, `codeIgnored`, `defaults`, `columns.header`, `columns.required`, `columns.description`, `required`, `optional`, y una descripción por cabecera: `headers.catalogTypeCode`, `headers.catalogTypeName`, `headers.name`, `headers.value`, `headers.description`, `headers.sortOrder` |
| `import.report.*` | `catalogTypesCreated`, `sortOrderCoerced`, `sheet`, `missingOptionalHeaders`, `unknownHeaders`, `codeColumnIgnored`, `typesCreatedDryRun_one/_other`, `typesCreated_one/_other`, `viewTypes`, `columns.row`, `columns.reason`, `columns.column` |
| `import.reasons.*` | los seis de §3.7 |
| `errors.*` | `CATITEM_006_FILE_REQUIRED`, `CATITEM_006_FILE_TOO_LARGE`, `CATITEM_006_FILE_INVALID`, `CATITEM_006_IMPORT_FAILED` |

Ninguna clave nueva en `common.importReport`.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y se puede committear por separado. La comprobación de tipos es siempre `npx tsc --noEmit -p tsconfig.app.json`: `npm run build` no la sustituye. **Antes del paso 4**, que es el primero que produce interfaz, se cargan `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` (`CONVENTIONS.md` §10.6).

**Paso 1 — Contrato y schema.**
- Se ejecuta `npm run contracts:sync` y se confirma que `contracts/catalogItem.ts` no cambia.
- Se añade `importCatalogItemsSchema` a `features/catalogItem/schemas.ts`: obligatorio, `.xlsx` sin distinguir mayúsculas, ≤ 20 MB, con los mensajes como claves i18n.
- Se añaden los casos a `schemas.test.ts`: sin fichero, `.xls`, `.XLSX` válido, 20 MB justos válido y 20 MB + 1 byte rechazado.

*Verificación:* `npx vitest run src/features/catalogItem/schemas.test.ts` en verde, `git diff src/contracts` vacío y `tsc` limpio.

**Paso 2 — `importApi.ts`.**
- `useImportCatalogItems()` con `ImportCatalogItemsVariables`: arma el `FormData` con `file` y `dryRun` como string y hace `POST /catalog-items/import`.
- El código `ESAVI-CATITEM-006` se cita en el comentario del hook.
- En `onSuccess`, si `!dryRun`, invalida `['catalogItem']` y `['catalogType']`.
- En `catalogItem/api.ts:12`, el comentario pasa de «not consumed» a «consumed by importApi.ts (SPEC FE30)».
- `importApi.test.tsx` (MSW):
  - el handler recibe `file` y `dryRun: 'true'` / `'false'`;
  - con `dryRun: true` no se invalida nada;
  - con `false` se invalidan las dos raíces (espía sobre `invalidateQueries`);
  - un `400 CATITEM_006_FILE_INVALID` llega como `EsaviApiError` con su `code`.

*Verificación:* el test en verde y `tsc` limpio.

**Paso 3 — Plantilla.**
- Un script fuera de `src/`, en el scratchpad y sin commitear, lee `../catalog-items-sample.xlsx` y escribe `public/templates/catalog-items-template.xlsx`. El resultado tiene la hoja `Items`, solo la fila 1 y sin la columna `code`.
- Se commitea el `.xlsx`.

*Verificación:*
- Abrir el fichero generado da una hoja, `Items`, con 1 fila y exactamente las seis cabeceras en el orden de §3.9.
- `git check-ignore -v public/templates/catalog-items-template.xlsx` no imprime nada.
- Con `npm run dev`, `GET http://localhost:5173/templates/catalog-items-template.xlsx` responde 200.

**Paso 4 — i18n.**
- Se añaden las claves de §3.10 a `es.json`, `en.json` y `nl.json`, con los textos de §3.1, §3.5, §3.6 y §3.7, incluidos los plurales `_one` y `_other`.

*Verificación:* `npm run i18n:check` sale en 0, y ninguna clave de §3.10 falta en ninguno de los tres archivos.

**Paso 5 — `CatalogItemImportPage.tsx` y ruta.**
- La página sigue §3.1 y §3.5–§3.9: ayuda colapsable con la tabla de cabeceras y el enlace a la plantilla, aviso fijo, selector, «Simular», «Importar» con su `AlertDialog`, el `<Alert>` de `IMPORT_FAILED` y `<ImportReport>` con los ocho contadores, las tres columnas y los `children` de §3.7.
- Se declara la ruta `/catalog-items/import` en `app/router.tsx` con `<RequireRole level={SUPERADMIN}>`.
- **Tests de la página** (`CatalogItemImportPage.test.tsx`, MSW):
  - sin fichero, los dos botones están deshabilitados;
  - un `.csv` y uno de más de 20 MB muestran el error bajo el selector y no hacen petición;
  - «Simular» pinta el informe con la marca de simulación y los ocho contadores;
  - con `catalogTypesCreated: 2` en la simulación, aparece el aviso de tipos nuevos y el diálogo de «Importar» dice «crearía 2 tipos»;
  - con `0`, el diálogo dice «no crearía tipos nuevos»;
  - sin simulación previa, el diálogo muestra solo el cuerpo base;
  - cambiar de fichero tras simular descarta el informe;
  - el informe definitivo con `catalogTypesCreated: 1` muestra el aviso en pasado y el enlace a `/catalog-types`;
  - con 20 rechazos (`invalid + duplicated = 20`, `errors.length = 20`) y `catalogTypesCreated > 0`, la nota de truncado **no** aparece;
  - `unknownHeaders: ['code']` muestra la nota de §3.7;
  - los tres `CATITEM_006_FILE_*` van al campo, `IMPORT_FAILED` va al `<Alert>` y un `code` desconocido va al toast;
  - los seis `reason` se traducen sin mostrar la clave cruda.
- **Test del router** (`router.catalogItemImport.test.tsx`): un ADMIN que entra en `/catalog-items/import` es redirigido y un SUPERADMIN ve la página.

*Verificación:* los dos tests en verde y `tsc` limpio.

**Paso 6 — Entrada desde el listado.**
- En `CatalogItemListPage.tsx`, el botón «Importar catálogo» con `useCan(SUPERADMIN)` en la cabecera y como `emptyExtraAction`. Navega a `/catalog-items/import` con `state: { typeId }`.
- Se amplía `CatalogItemListPage.test.tsx`: SUPERADMIN ve el botón en la cabecera y en el vacío, ADMIN y USER no lo ven.
- El enlace «Volver» de la página devuelve al listado con el mismo `typeId`.

*Verificación:* el test en verde.

**Paso 7 — Cierre.**
- Suite completa: `npx vitest run`. El fallo intermitente conocido de `DiagnosticTermListPage` (`reviewStatus ↔ includeInactive`) no cuenta si pasa aislado.
- `npx tsc --noEmit -p tsconfig.app.json` y `npm run lint`.
- Recorrido manual contra el backend en `:4500` con la plantilla rellenada:
  - simular con un `catalogTypeCode` inexistente, que debe dar `catalogTypesCreated: 1`;
  - importar, y comprobar que el tipo aparece en `/catalog-types` y en el selector del listado **sin recargar**;
  - reimportar el mismo fichero, que debe dar todo en `unchanged`;
  - repetirlo en tema oscuro y a 375px.
- Checklist de `CONVENTIONS.md` §14.

*Verificación:* todo lo anterior en verde, el recorrido manual hecho y el checklist marcado.

---

## 5. Criterios de aceptación

**Endpoint y datos:**

- [ ] `POST /api/catalog-items/import` (`ESAVI-CATITEM-006`) se consume solo desde `importApi.ts`, en `multipart/form-data` con `file` y `dryRun` como `'true'` o `'false'`, y sin `dictionaryVersion`.
- [ ] `ESAVI-CATITEM-006` aparece citado en `importApi.ts`, y `catalogItem/api.ts` ya no lo marca como «not consumed».
- [ ] Con `dryRun: true` no se invalida ninguna query. Con `dryRun: false` se invalidan `['catalogItem']` y `['catalogType']`. Lo cubre `importApi.test.tsx`.
- [ ] Un tipo creado por una importación real aparece en `/catalog-types` y en el selector de tipo del listado de ítems **sin recargar la página** (recorrido manual del paso 7).
- [ ] `git diff src/contracts` está vacío: no se tocó ningún contrato.
- [ ] `grep -rn "response.data.data" src/features/catalogItem/` no devuelve resultados.

**Flujo:**

- [ ] Sin fichero, «Simular» e «Importar» están deshabilitados.
- [ ] Un fichero que no es `.xlsx`, o que pesa más de 20 MB, muestra el error bajo el selector **y no sale ninguna petición**.
- [ ] Cambiar el fichero después de simular hace desaparecer el informe.
- [ ] El diálogo de «Importar» muestra la cifra de tipos nuevos si la simulación vigente da > 0; «no crearía tipos nuevos» si da 0; y solo el cuerpo base si no hubo simulación.
- [ ] Con `catalogTypesCreated > 0`, el informe muestra el aviso de tipos nuevos: en condicional si es simulación, y en pasado y con enlace a `/catalog-types` si es definitivo. Con 0 no aparece.
- [ ] El informe pinta ocho contadores en el orden de §3.7, y la nota de truncado aparece cuando `invalid + duplicated > errors.length`.
- [ ] Los seis `reason` se muestran traducidos; ninguno aparece como clave cruda.
- [ ] Con `unknownHeaders: ['code']` aparece la nota de que la columna `code` no se usa.
- [ ] `CATITEM_006_FILE_REQUIRED`, `FILE_TOO_LARGE` y `FILE_INVALID` se pintan bajo el selector; `IMPORT_FAILED` como `<Alert>` de página; cualquier otro `code`, incluido uno ausente, como toast genérico. `errors` no se muestra nunca.
- [ ] La ayuda lista las seis cabeceras con las tres obligatorias marcadas, y el aviso fijo de duplicados y de tipos nuevos está siempre visible.

**Plantilla:**

- [ ] `public/templates/catalog-items-template.xlsx` existe, está commiteado y tiene una hoja `Items` con una sola fila: `catalogTypeCode, catalogTypeName, name, value, description, sortOrder`, sin `code`.
- [ ] El enlace «Descargar plantilla» lleva `download` y descarga ese fichero.
- [ ] La plantilla con una fila de datos añadida, simulada contra el backend, devuelve `unknownHeaders: []` y `missingOptionalHeaders: []`.

**Acceso:**

- [ ] Con SUPERADMIN, «Importar catálogo» aparece en la cabecera y en el estado vacío de `/catalog-items`. Con ADMIN y con USER no se renderiza.
- [ ] Un ADMIN que escribe `/catalog-items/import` en la barra es redirigido por `<RequireRole>` y no ve la página.
- [ ] Ningún `NavItem` nuevo en `shared/config/navigation.ts`.

**Calidad:**

- [ ] Las claves de §3.10 existen en `es`, `en` y `nl`, y `npm run i18n:check` sale en 0.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0.
- [ ] `npm run check` sale en 0. El intermitente conocido de `DiagnosticTermListPage` cuenta como verde si pasa aislado.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`, y `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/catalogItem/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La página se apila en una columna, las tablas de ayuda y de rechazos hacen scroll dentro de su contenedor, y el body no hace scroll horizontal a 375px. Esta pantalla no tiene listado propio, así que no hay tarjetas.
- [ ] **Rol bajo.** Con `USER` y con `ADMIN`, el listado no ofrece la importación que la ruta rechaza, y un `403` inesperado del `006` cae en el toast genérico sin dejar la pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos los `aria-label`, el texto del enlace de la plantilla y las cabeceras de la tabla de ayuda. Las claves de §3.10 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: el informe solo en `useMutation().data` y nunca copiado a `useState`, nada en Zustand, y ningún dato de la importación en `searchParams`.

---

## 6. Decisiones tomadas y descartadas

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 1 | **El spec cubre solo `ESAVI-CATITEM-006`.** | Un spec de «carga masiva de catálogos» que también cubriera tipos. | No hay endpoint de importación de `catalogType` en `API-ROUTES.md`. Las otras tres importaciones ya tienen pantalla (FE07, FE25b, FE25c). |
| 2 | **Única entrada desde el listado de ítems**, sin `NavItem`. | Botón también en `/catalog-types`. | Un segundo punto de entrada haría pensar que existe una importación de tipos. Los tipos se crean como efecto colateral, no son lo que se importa. |
| 3 | **El diálogo de «Importar» repite `catalogTypesCreated`** de la simulación vigente, y el informe lleva un aviso cuando es > 0. | (a) Solo el contador. (b) Aviso en el informe sin repetirlo en el diálogo. | F20 dice que esa cifra es la única señal de una errata en `catalogTypeCode`, y el tipo creado no se puede revertir. El diálogo es el último momento en que la cifra sirve de algo. |
| 4 | **La simulación es opcional.** | Deshabilitar «Importar» hasta tener una simulación del fichero actual. | Simetría con FE25b y FE25c. El diálogo de la decisión 3 da el aviso a quien sí simuló, sin obligar a todos. |
| 5 | **La simulación «vigente» es `mutation.data` con `dryRun: true`**, sin guardar aparte una huella del fichero. | Guardar nombre, tamaño o hash del fichero simulado en `useState`. | Cambiar de fichero ya hace `mutation.reset()`, así que `data` siempre describe el fichero actual. Guardar la huella pondría el mismo dato en dos capas. |
| 6 | **Plantilla estática en `public/templates/`**, derivada de la muestra del repositorio. | (a) Solo ayuda textual. (b) Un endpoint de plantilla como `ESAVI-GEOLOC-007`. (c) Generar el `.xlsx` en el navegador. | (b) no existe, y un spec no inventa endpoints. (c) mete una librería de Excel en el bundle para producir una sola fila. (a) se queda corto para quien nunca ha visto el formato. **Decisión del usuario.** |
| 7 | **La plantilla va sin la columna `code` y sin filas de datos.** | Publicar la muestra tal cual, o vacía pero conservando las siete cabeceras. | La muestra es anterior a la enmienda F20 del 2026-08-16. Con `code`, cada carga devolvería `unknownHeaders: ['code']` y el operador creería que sus códigos (`ROA-20030000`) se usan. Vacía, porque así lo pidió el usuario: la muestra trae 139 filas reales de rutas de administración que no deben recargarse por accidente. |
| 8 | **Se invalida también `['catalogType']`.** | Invalidar solo `['catalogItem']`, como hacen las hermanas con su raíz. | El importador escribe en dos tablas. Sin esta invalidación, un tipo nuevo quedaría oculto durante el `staleTime` de 30 min. |
| 9 | **Aviso fijo de duplicados** antes de subir el fichero, y nota en el informe si llegó una columna `code`. | Explicarlo solo en la documentación, o solo cuando el informe muestra `inserted` donde se esperaba `unchanged`. | La enmienda del 2026-08-20 hace que un `code` fijado a mano no se resuelva al reimportar: inserta. Es un efecto que no se ve en el informe como error, así que hay que decirlo antes. |
| 10 | **Sin React Hook Form**: `useState<File \| null>` y `safeParse`. | `useForm` con un solo campo. | Un único campo de tipo `File` no aprovecha nada de RHF. Es la misma decisión que FE25b tomó para el fichero. |
| 11 | **`<ImportReport>` no se toca**: lo propio va en `counters` y `children`. | Añadir a la primitiva una prop de «avisos». | La enmienda de FE25d ya generalizó `counters`, y `children` existe justo para esto. Una prop nueva para un solo consumidor contradice la regla de primitivas de `ARCHITECTURE.md` §4.3. |
| 12 | **`sortOrderCoerced` sin aviso propio**, solo con su contador. | Un `<Alert>` como el de tipos nuevos. | La coerción no pierde filas y se corrige con un `004`. El aviso queda reservado para lo irreversible. |
| 13 | **No se intenta decir qué tipos se crearían.** | Leer el `.xlsx` en el cliente y cruzarlo con `GET /api/catalog-types`. | Sería reconstruir en el cliente la normalización `toCamelCase` del backend. Si diverge, señalaría el tipo equivocado. Si hace falta el detalle, es un cambio del informe en el backend. |

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| **Alguien importa sin simular, con una errata en `catalogTypeCode`, y funda un tipo que nadie pidió.** | Riesgo asumido con la decisión 4. Lo reducen el aviso fijo de §3.1, el aviso del informe definitivo con su enlace a `/catalog-types` y la nota de que se limpia con el `005A` de `CATTYPE`. |
| **La plantilla se desalinea del parser** si el backend cambia las cabeceras de F20 otra vez, igual que la muestra quedó desalineada tras la enmienda del 2026-08-16. | §3.9 y §5 incluyen una verificación contra el backend real: una fila en la plantilla debe dar `unknownHeaders` y `missingOptionalHeaders` vacíos. Si una enmienda futura de F20 toca las cabeceras, esa verificación es lo que hay que repetir. |
| **La plantilla se regenera desde la muestra sin quitar `code`** en una actualización futura. | §3.9 fija el contenido exacto y §5 lo comprueba cabecera por cabecera. El script no se commitea a propósito: la plantilla se edita como un fichero, no se recalcula. |
| **Se olvida invalidar `['catalogType']`** al copiar `importApi.ts` de `vaccineWhodrug/`, donde solo se invalida una raíz. | `importApi.test.tsx` lo comprueba con un espía sobre `invalidateQueries`, y el recorrido manual del paso 7 lo verifica sin recargar. |
| **Un fichero grande supera el timeout del proxy** y la petición falla sin `code`. | F20 §7 fija el orden de magnitud en unas 2000 filas, que caben. Un error sin `code` cae en `UNKNOWN_ERROR` y en el toast genérico, sin pantalla en blanco. La importación asíncrona sigue fuera de alcance, en los dos repositorios. |
| **El usuario cierra la pestaña a mitad** y no sabe qué se guardó. | El aviso «no cierres esta pestaña» lo advierte. Como los lotes confirmados quedan y la reimportación es idempotente, basta con volver a importar el mismo fichero. El texto de `IMPORT_FAILED` dice lo mismo. |
| **Se suma `catalogTypesCreated` a `rejectedTotal`** al copiar los contadores, y la nota de truncado aparece de más. | §3.7 fija `rejectedTotal = invalid + duplicated` y cita `catalogItem.service.ts:641`. El paso 5 tiene un test con 20 rechazos y tipos creados donde la nota no debe aparecer. |

---

## 8. Impacto en pantallas existentes

| Pantalla / archivo | Antes | Después |
|---|---|---|
| `CatalogItemListPage` (`/catalog-items`) | Cabecera con «Crear ítem» (ADMIN). El vacío no ofrece importar. | Suma «Importar catálogo» con `useCan(SUPERADMIN)` en la cabecera y como `emptyExtraAction`. Al navegar pasa `state: { typeId }`. |
| `catalogItem/api.ts:12` | `006` marcado «not consumed (own spec, SPEC FE03 §2)». | «consumed by importApi.ts (SPEC FE30)». |
| `app/router.tsx` | Sin ruta de importación de ítems. | `/catalog-items/import` con `<RequireRole level={SUPERADMIN}>`. |
| `CatalogTypeListPage`, `<CatalogTypeSelect>`, `<CatalogSelect>` | Se refrescan solo por sus propias mutaciones o al vencer el `staleTime`. | También se refrescan tras una importación real, por la invalidación de §3.4. No cambia su código. |
| `public/` | Solo `favicon.svg`. | Suma `templates/catalog-items-template.xlsx`. |
| SPEC FE03 §2 | Difería la importación «a su propio spec». | Ese spec es éste. FE03 no se reescribe. |

`<ImportReport>`, `common.importReport.*` y las tres importaciones hermanas no cambian.

---

## Lo que **no** está en este spec

- **La importación de `catalogType`.** No hay endpoint; primero hace falta un spec del backend.
- **Un endpoint de plantilla** para ítems, y generar el `.xlsx` en el navegador.
- **Listar qué tipos se crearían.** Necesita que el backend amplíe el informe.
- **La simulación obligatoria** antes de importar.
- **Deshacer una importación** o desactivar en bloque los tipos que creó.
- **Importación asíncrona** con cola y progreso.
- **Corregir `../catalog-items-sample.xlsx`.** Queda fuera de los dos repositorios.
- **Cambios en `<ImportReport>`** o en las importaciones de FE07, FE25b y FE25c.
- **El tamaño de 32px de `<Button>`.** Es un hallazgo transversal ya anotado, no de esta pantalla.

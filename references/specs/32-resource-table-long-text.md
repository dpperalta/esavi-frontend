# SPEC FE32 — Texto largo en las celdas de `<ResourceTable>` y el ancho del shell

> **Estado:** Implementado
> **Depende de:** SPEC FE01 (shell: `AppShell`), SPEC FE02 (`<ResourceTable>`)
> **Fecha:** 2026-10-28
> **Objetivo:** Que una celda de texto largo se parta en varias líneas dentro de su columna, sin pisar a las vecinas, y que una tabla ancha haga scroll dentro de su contenedor, nunca en el `body`.

---

## 1. Por qué existe este spec

`CONVENTIONS.md` §10.2 dice que «el body nunca hace scroll horizontal» y que toda tabla ancha va dentro de un contenedor con `overflow-x: auto`. Hoy no se cumple ninguna de las dos cosas en escritorio. Se ve en `/whodrug-vaccines?iso3Code=PRY&page=8`, con la ventana a 1521px.

**A — El texto largo de una celda no se parte y pisa las columnas vecinas.** `TableCell` (`ui/table.tsx:84`) lleva `whitespace-nowrap`, y sus hijos lo heredan. Cuatro celdas intentan partir el texto con `break-words` + `max-w-*`:

- `VaccineWhodrugListPage.tsx:294` y `:299`, el nombre del fármaco como enlace y como texto;
- `VaccineWhodrugListPage.tsx:313`, el titular de la autorización;
- `DiagnosticTermListPage.tsx:348`, el nombre del término.

`break-words` no hace nada mientras `white-space` sea `nowrap`. En esa página, seis nombres miden entre 434 y 706px dentro de una caja de 384. El texto sale de la caja y se pinta encima del código del fármaco y del titular.

**B — Una tabla ancha estira el layout y el `body` hace scroll horizontal.** `SidebarInset` (`ui/sidebar.tsx:312`), el hijo flex que comparte fila con el sidebar, no lleva `min-w-0`. Un hijo flex no puede encogerse por debajo del ancho de su contenido, así que la tabla (1399px de ancho natural) lo empuja hasta 1481px. Con el sidebar de 256px, el documento llega a 1737px en una ventana de 1521. Comprobado en vivo: `min-w-0` en `SidebarInset` deja el documento en 1521 y la tabla hace scroll dentro de su contenedor. En el `<main>` interior de `AppShell.tsx:41`, en cambio, no cambia nada.

El contenedor `overflow-x-auto` de la tabla nunca llega a hacer scroll, porque sus padres crecen con ella. B no es propio de esta tabla: lo reproduce cualquier listado cuyo contenido sea más ancho que la ventana. Arreglar solo A lo esconde aquí y lo deja abierto en el siguiente listado ancho.

**Hoy conviven tres patrones para el texto largo, y solo falla uno:**

| Patrón | Dónde | Funciona |
|---|---|---|
| `break-words` + `max-w-*` | `VaccineWhodrugListPage` (3), `DiagnosticTermListPage` (1) | No: el `nowrap` heredado lo anula |
| `truncate` + `title` | `DiluentListPage:171`, `WhodrugProductListPage:99`, `:167` | Sí: una línea con «…» |
| `line-clamp-1` + `title` | `SystemConfigListPage:119`, `:338` | Sí |

---

## 2. Alcance

**Dentro:**

- `ResourceTableColumn` gana una prop opcional `wrap?: boolean`. Con `wrap: true`, la `TableCell` de esa columna lleva `whitespace-normal`. La cabecera y la tarjeta móvil no cambian.
- Las cuatro celdas de §1 A declaran `wrap: true`. Conservan su `max-w-*` y su `break-words`, que con el `nowrap` retirado ya funcionan.
- `AppShell.tsx` pasa `className="min-w-0"` a `<SidebarInset>`.
- Tests:
  - de `<ResourceTable>`: una columna con `wrap` lleva `whitespace-normal` en la celda y otra sin `wrap` no lo lleva;
  - del shell: `SidebarInset` lleva `min-w-0`.

**Fuera de alcance (otros specs):**

- Los patrones `truncate` + `title` y `line-clamp-1` + `title` de §1, que funcionan y se quedan como están.
- Los dos `<main>` anidados (`SidebarInset` y el de `AppShell.tsx:41`), que dan dos *landmarks* `main`. Es un problema de accesibilidad distinto.
- La tarjeta móvil de `<ResourceTable>`: no hereda `nowrap` y ya parte el texto.
- Revisar el ancho de cada columna de cada listado: este spec arregla el mecanismo, no el diseño de cada tabla.

---

## 3. Diseño

Es un spec transversal: no hay pantallas nuevas. Cambia una primitiva y el shell.

### 3.1 Antes / Después

| Pieza | Archivo | Antes | Después |
|---|---|---|---|
| `ResourceTableColumn` | `shared/components/ResourceTable.tsx:40` | `{ key, header, render, card?, className? }` | `+ wrap?: boolean` |
| Celda de una columna con `wrap` | `ResourceTable.tsx:226` | `className={column.className}` (hereda `whitespace-nowrap`) | `className={cn(column.wrap && 'whitespace-normal', column.className)}` |
| Cabecera de esa columna | `ResourceTable.tsx:208` | `whitespace-nowrap` | sin cambio |
| Nombre del fármaco | `VaccineWhodrugListPage.tsx:286` | sin `wrap` | `wrap: true` |
| Titular de la autorización | `VaccineWhodrugListPage.tsx` (columna de `:313`) | sin `wrap` | `wrap: true` |
| Nombre del término | `DiagnosticTermListPage.tsx` (columna de `:348`) | sin `wrap` | `wrap: true` |
| `<SidebarInset>` | `app/layout/AppShell.tsx:36` | sin `className` | `className="min-w-0"` |

`wrap` es una decisión de la columna, no de la celda. Por eso va en la declaración y no como clase suelta dentro del `render`: así lo ve cualquiera que lea las columnas, y un listado nuevo lo activa con una línea.

El `max-w-*` sigue en el `render` de cada columna. Es el ancho de lectura de ese dato, y no tiene un valor que sirva para todos.

### 3.2 Endpoints consumidos

Ninguno. El spec no toca la capa de API.

### 3.3 Tipos del contrato

Ninguno. `ResourceTableColumn` es un tipo del cliente, no del contrato.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Si una columna parte el texto | Declaración estática de la columna | `wrap: true` en el array de columnas | No es estado: no cambia en tiempo de ejecución ni vive en `useState`, en un store ni en la URL. |
| Ancho del layout | CSS | `min-w-0` en `SidebarInset` | Lo resuelve el navegador. |

### 3.5 Formularios y validación

No aplica.

### 3.6 Estados de la pantalla

No aplica: los cuatro estados de `<ResourceTable>` (carga, vacío, error, sin permiso) no cambian. El esqueleto de carga no se toca: sus celdas son `<Skeleton>` de ancho fijo.

### 3.7 Responsividad y accesibilidad

- **Por debajo de `md`:** sin cambios. La tarjeta no usa `TableCell` y ya parte el texto.
- **A partir de `md`:** una celda con `wrap` crece en alto, no en ancho. La fila se hace más alta, y `align-middle` de `TableCell` mantiene alineadas las demás celdas.
- **El `body` no hace scroll horizontal** con ningún ancho de ventana. Si el contenido de una tabla excede el espacio disponible, hace scroll dentro de su contenedor `overflow-x-auto`, como ya pedía §10.2.
- **El enlace del nombre del fármaco** sigue siendo un solo enlace aunque ocupe varias líneas: el foco visible rodea todas.

### 3.8 Claves i18n nuevas

Ninguna.

---

## 4. Plan de implementación

1. **`wrap` en `<ResourceTable>`.** Añadir `wrap?: boolean` a `ResourceTableColumn`, con un comentario de una línea que diga por qué existe: `TableCell` hereda `whitespace-nowrap`. En la celda del cuerpo, `cn(column.wrap && 'whitespace-normal', column.className)`. La cabecera y la tarjeta no se tocan. Ampliar `ResourceTable.test.tsx`: la celda de una columna con `wrap` lleva `whitespace-normal`, y la de una columna sin `wrap` no lo lleva. Un comentario en inglés declara la excepción a `CONVENTIONS.md` §12, como en FE31.
   *Verificación:* `npx vitest run src/shared/components/ResourceTable.test.tsx` pasa, y `npx tsc --noEmit -p tsconfig.app.json` sale en 0.

2. **Las cuatro columnas.** `wrap: true` en las columnas del nombre del fármaco y del titular de `VaccineWhodrugListPage.tsx`, y en la del nombre de `DiagnosticTermListPage.tsx`. Sin otro cambio en su `render`.
   *Verificación:* `grep -n "wrap: true" src/features/vaccineWhodrug/VaccineWhodrugListPage.tsx src/features/diagnosticTerm/DiagnosticTermListPage.tsx` devuelve tres líneas, y los tests de las dos carpetas pasan.

3. **`min-w-0` en el shell.** `<SidebarInset className="min-w-0">` en `AppShell.tsx`. Ampliar `AppShell.test.tsx`: el elemento `[data-slot=sidebar-inset]` lleva `min-w-0`, con la misma excepción declarada.
   *Verificación:* `npx vitest run src/app/layout/AppShell.test.tsx` pasa.

4. **Medición en el navegador.** En escritorio a 1521px de ancho, abrir `/whodrug-vaccines?iso3Code=PRY&page=8` y `/diagnostic-terms`. Comprobar con `getBoundingClientRect()` que ningún hijo de una celda con `wrap` sobresale del borde derecho de su `<td>`. Comprobar también que `document.documentElement.scrollWidth` es igual a `clientWidth`. Repetirlo en `/esavi-cases` y `/catalog-items` como control, y a 375px en las cuatro pantallas.
   *Verificación:* cero celdas desbordadas, y `scrollWidth === clientWidth` en las cuatro pantallas y los dos anchos.

---

## 5. Criterios de aceptación

- [ ] `ResourceTableColumn` tiene `wrap?: boolean`, y un test fija que la celda de una columna con `wrap` lleva `whitespace-normal` y la de una sin `wrap` no.
- [ ] Las columnas del nombre del fármaco y del titular (`VaccineWhodrugListPage`) y la del nombre del término (`DiagnosticTermListPage`) declaran `wrap: true`.
- [ ] `<SidebarInset>` lleva `min-w-0`, y lo fija un test de `AppShell`.
- [ ] En `/whodrug-vaccines?iso3Code=PRY&page=8` a 1521px, ningún nombre de fármaco ni titular sobresale de su celda.
- [ ] En `/whodrug-vaccines?iso3Code=PRY&page=8`, `/diagnostic-terms`, `/esavi-cases` y `/catalog-items`, `document.documentElement.scrollWidth === clientWidth` a 1521px y a 375px.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque de cierre:**

- [ ] **Tema oscuro.** Las filas con texto partido se ven correctas en `dark`, y el diff no introduce ningún color literal: `git diff main -- src/ | grep -E "^\+.*(bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6})"` no devuelve nada.
- [ ] **Por debajo de `md`.** Las tablas siguen colapsando a tarjetas, y el body no hace scroll horizontal a 375px en las cuatro pantallas medidas.
- [ ] **Rol bajo.** Con `USER`, `/diagnostic-terms` y `/whodrug-vaccines` cargan y parten el texto igual que con `SUPERADMIN`: el cambio es de presentación y no depende del rol.
- [ ] **Sin literales.** No aplica: el spec no introduce texto visible.
- [ ] **Estado en una sola capa.** `wrap` es una declaración estática de columna: `grep -rn "wrap" src/shared/components/ResourceTable.tsx` no muestra ningún `useState` ni lectura de store asociados.

---

## 6. Decisiones tomadas y descartadas

- **Sí: arreglar A y B en el mismo spec.** Con solo A, esta tabla deja de pisar columnas, pero el siguiente listado ancho vuelve a provocar scroll en el `body`. B es lo que impide que el contenedor `overflow-x-auto` de §10.2 funcione.
- **Sí: `wrap` como prop de columna en `<ResourceTable>`.** Es la regla de §10.4: una variante se añade como prop de la primitiva, no se copia en cada listado. Además deja la decisión a la vista en la declaración de columnas.
- **No: `whitespace-normal` a mano en cada `render`.** Son cuatro sitios hoy y uno más con cada listado nuevo que olvide el detalle. Es la misma deriva que FE31 cortó con los parches de altura.
- **No: reutilizar `className: 'whitespace-normal'` de la columna.** `className` se aplica también a la cabecera (`ResourceTable.tsx:208`), que debe seguir en una línea. Y una clase suelta no dice por qué está ahí.
- **No: quitar `whitespace-nowrap` de `TableCell` para todos.** Partiría códigos, fechas e identificadores que hoy leen bien en una línea, y cambiaría todos los listados sin un pase visual.
- **Sí: partir en varias líneas, no truncar.** Dos nombres de vacuna casi iguales («Vacuna contra el sarampión y rubéola viva, atenuada (liofilizada)» con dos concentraciones) solo se distinguen leyendo el nombre entero. Truncarlos obliga a pasar el ratón por encima de cada fila.
- **No: unificar los tres patrones de §1.** `truncate` + `title` y `line-clamp-1` + `title` funcionan, y en sus columnas (composición del diluyente, producto WHODrug, valor de configuración) una línea es lo adecuado.
- **Sí: `min-w-0` en `SidebarInset`, pasado desde `AppShell`.** Es el único elemento cuyo cambio corrige el ancho del documento (comprobado en vivo). Va en el consumidor y no en `ui/sidebar.tsx` para que sobreviva si se vuelve a traer el componente del registro de shadcn, y `AppShell` es su único consumidor.
- **Sí: tests de clase, con la excepción a §12 declarada.** jsdom no calcula el layout, así que el test fija el cableado y el paso 4 mide el resultado en el navegador. Es el mismo criterio que FE31.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Con `min-w-0`, un contenido que antes ensanchaba la página ahora queda recortado o encogido en algún sitio que no es una tabla | El paso 4 mide `scrollWidth` en cuatro pantallas a dos anchos. Un contenido que no cabe debe tener su propio `overflow-x-auto`, y si aparece uno sin él, se anota como hallazgo y no se arregla en este spec |
| Las filas con texto partido son más altas y el listado de vacunas pierde densidad | Se acepta: una fila más alta y legible es mejor que una que pisa a la siguiente columna. El `max-w-sm` de la columna limita el número de líneas |
| La tabla de vacunas pasa a hacer scroll horizontal dentro de su contenedor en ventanas estrechas, y las columnas de la derecha (país, preferido) quedan fuera de la vista | Es el comportamiento que §10.2 pide para tablas anchas. Ajustar qué columnas se muestran es diseño de cada listado y está fuera de alcance |

---

## 8. Impacto en pantallas existentes

- **Todas las pantallas del shell, a partir de `md`:** el área de contenido ya no crece más allá de la ventana. Donde antes había scroll horizontal del `body`, ahora lo hay dentro del contenedor de la tabla.
- **`VaccineWhodrugListPage`:** el nombre del fármaco y el titular se parten en varias líneas dentro de su columna.
- **`DiagnosticTermListPage`:** el nombre del término se parte en varias líneas dentro de su columna.

---

## Lo que **no** está en este spec

- Los patrones `truncate` + `title` y `line-clamp-1` + `title`, que siguen como están.
- Los dos `<main>` anidados (`SidebarInset` y `AppShell.tsx:41`).
- La tarjeta móvil de `<ResourceTable>`.
- El ancho y la selección de columnas de cada listado.

Cada uno de esos, si aterriza, va en su propio spec.

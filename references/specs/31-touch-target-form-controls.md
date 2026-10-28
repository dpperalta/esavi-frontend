# SPEC FE31 — Objetivo táctil de 44px en los controles de formulario

> **Estado:** Aprobado
> **Depende de:** SPEC FE15 (tamaños `touch`/`icon-touch` de `<Button>`, Topbar responsive)
> **Fecha:** 2026-10-28
> **Objetivo:** Que todo campo, selector y botón por defecto mida 44px en dispositivos táctiles (`pointer: coarse`), sin cambiar el escritorio con ratón.

---

## 1. Por qué existe este spec

`CONVENTIONS.md` §10.2 exige objetivos táctiles de 44px como mínimo. FE15 lo resolvió solo para cinco CTA del asistente y dejó fuera el tamaño `default` de las primitivas. La razón fue que subirlo para todos cambiaba el escritorio sin un pase visual previo. Desde entonces, cada spec que se tropieza con el problema improvisa un parche local.

**A — El `<Input>` compartido mide 32px.** `shared/components/ui/input.tsx:11` declara `h-8`. Lo importan 54 archivos: todos los campos de texto de la app, y también `<NumberField>` y el campo de texto de `<DateField>`.

**B — El `SelectTrigger` mide 32px.** `shared/components/ui/select.tsx:60` declara `data-[size=default]:h-8`, en 16 archivos, `<CatalogSelect>` incluido.

**C — El `<Button>` `default` e `icon` mide 32px.** `button.tsx:24` (`h-8`) e `icon` (`size-8`). Como los disparadores de `<SearchableSelect>`, `<EntitySearchSelect>` y `<DateField>` son `<Button>`, arreglar solo A dejaría un campo de 44px al lado de un selector de 32px.

**D — El buscador de `command.tsx:72` fuerza `h-8!`** sobre `<InputGroup>`: es el campo de búsqueda dentro de los desplegables de los selectores.

**E — Hay dieciocho parches locales que corrigen por ancho.** Fallan en una tableta táctil a partir de `md`, y son justo la deriva que este spec corta:

- `size="touch" className="md:h-8"` en seis `<Button>`: los botones de importar o sincronizar de cuatro listados (`CatalogItemListPage.tsx:271`, `DiagnosticTermListPage.tsx:408`, `VaccineWhodrugListPage.tsx:360`, `WhodrugProductListPage.tsx:231`) y los dos botones de historial de roles (`UserRoleHistorySheet.tsx:118`, `UserRolesCard.tsx:119`).
- `min-h-11 w-full md:min-h-8` en cinco `SelectTrigger`: `DiagnosticTermFormDialog.tsx:191` y `:259`, `DiagnosticTermListPage.tsx:127` y `:167`, `VaccineWhodrugListPage.tsx:106`.
- `min-h-11 md:min-h-8` en cinco `<Input>` de filtros: `DiagnosticTermListPage.tsx:149` y `:431`, `VaccineWhodrugListPage.tsx:151` y `:383`, `WhodrugProductListPage.tsx:83`.
- `h-11 pl-8 md:h-8` en dos buscadores con icono: `AppRoleListPage.tsx:94`, `UserSearchField.tsx:85`.

---

## 2. Alcance

**Dentro:**

- `<Input>` (`ui/input.tsx`): pasa a `pointer-coarse:h-11`.
- `SelectTrigger` tamaño `default` (`ui/select.tsx`): pasa a 44px con `pointer-coarse:`.
- `<Button>` tamaño `default` → `pointer-coarse:h-11`. Tamaño `icon` → `pointer-coarse:size-11`.
- El buscador de `command.tsx:72`: su `h-8!` gana el equivalente `pointer-coarse:h-11!`.
- La retirada de los dieciocho parches locales de §1 E, sustituidos por el tamaño por defecto.
- Tests unitarios que fijan la clase `pointer-coarse:` en cada primitiva tocada.

**Fuera de alcance (otros specs):**

- Checkbox, radio y switch: su zona de toque la amplía el `<Label>` asociado.
- Los tamaños `xs`, `sm`, `lg`, `icon-xs`, `icon-sm` e `icon-lg` de `<Button>`, y `size="sm"` de `SelectTrigger`: son densidad deliberada.
- La paginación de `<ResourceTable>`.
- Los complementos de `<InputGroup>` (`input-group.tsx:73-77`).
- Quitar `touch`/`icon-touch` de FE15: siguen siendo los 44px fijos de los CTA del asistente, también en escritorio.
- La insignia de etapas inactivas de la bandeja (FE24), el otro hallazgo pendiente de UI.

---

## 3. Diseño

Es un spec transversal: no hay pantallas nuevas, solo primitivas que cambian de tamaño en dispositivos táctiles.

### 3.1 Primitivas — Antes / Después

| Primitiva | Archivo | Antes | Después |
|---|---|---|---|
| `<Input>` | `shared/components/ui/input.tsx:11` | `h-8` | `h-8 pointer-coarse:h-11` |
| `SelectTrigger` (`size="default"`) | `shared/components/ui/select.tsx:60` | `data-[size=default]:h-8` | `+ pointer-coarse:data-[size=default]:h-11` |
| `<Button size="default">` | `shared/components/ui/button.tsx:24` | `h-8` | `h-8 pointer-coarse:h-11` |
| `<Button size="icon">` | `shared/components/ui/button.tsx` | `size-8` | `size-8 pointer-coarse:size-11` |
| Buscador de `<Command>` | `shared/components/ui/command.tsx:72` | `h-8!` | `h-8! pointer-coarse:h-11!` |
| `<Button size="touch">` / `icon-touch` | `button.tsx` | `h-11` / `size-11` | sin cambio |

Una sola regla para todas: el tamaño de escritorio sigue siendo la clase base y `pointer-coarse:` añade los 44px. Ningún consumidor recibe una prop nueva.

### 3.2 Endpoints consumidos

Ninguno. El spec no toca la capa de API.

### 3.3 Tipos del contrato

Ninguno.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Tamaño del control | CSS | media query `(pointer: coarse)` | Lo decide el navegador. No hay estado en JS, ni en el store ni en `useState`. |

**Excepción declarada:** no se detecta el puntero en JavaScript (`matchMedia`) ni se guarda en `ui`. Si se hiciera, el dato viviría en dos capas, CSS y store.

### 3.5 Formularios y validación

No aplica: no cambia ningún schema ni ningún mapeo de errores.

### 3.6 Estados de la pantalla

No aplica: ninguna vista gana ni pierde estados.

### 3.7 Responsividad y accesibilidad

- **Criterio: puntero, no ancho.** `pointer-coarse:` cubre el móvil, la tableta en cualquier orientación y el portátil táctil usado con el dedo. `md:` no los distingue.
- **Escritorio con ratón: igual que hoy.** La clase base sigue en 32px.
- **Contenedores de altura fija.** Ningún contenedor que aloje estas primitivas puede tener altura fija en táctil, porque recortaría un control de 44px. Los que se miden en el paso 6 son el Topbar, las barras de filtros, `CaseWizardActionBar` y las tarjetas de `<ResourceTable>`.
- **El body no hace scroll horizontal a 375px** después del cambio: §10.2 se sigue cumpliendo con los botones `icon` a 44px en el Topbar.

### 3.8 Claves i18n nuevas

Ninguna.

---

## 4. Plan de implementación

1. **`<Input>`.** Añadir `pointer-coarse:h-11` a la clase base de `input.tsx`. Nuevo test `ui/input.test.tsx` que fija la presencia de `h-8` y de `pointer-coarse:h-11`.
   *Verificación:* `npx vitest run src/shared/components/ui/input.test.tsx` pasa, y `npx tsc --noEmit -p tsconfig.app.json` sale en 0.

2. **`SelectTrigger`.** Añadir `pointer-coarse:data-[size=default]:h-11` en `select.tsx`. La clase va en la cadena fija, común a todos los tamaños, y solo surte efecto con `data-size="default"`. Ampliar `ui/select.test.tsx`: el trigger `default` lleva `data-size="default"` y la clase, y el trigger `sm` lleva `data-size="sm"`, que la deja sin efecto.
   *Verificación:* `npx vitest run src/shared/components/ui/select.test.tsx` pasa.

3. **`<Button>` `default` e `icon`.** Añadir `pointer-coarse:h-11` y `pointer-coarse:size-11` en `button.tsx`. No se tocan `touch`, `icon-touch` ni los tamaños de densidad. Nuevo test `ui/button.test.tsx`: `default` e `icon` llevan la clase; `sm`, `xs` y `touch` no la llevan.
   *Verificación:* `npx vitest run src/shared/components/ui/button.test.tsx` pasa, y los tests de `<SearchableSelect>`, `<EntitySearchSelect>` y `<DateField>` siguen en verde.

4. **Buscador de `<Command>`.** Añadir `pointer-coarse:h-11!` junto al `h-8!` de `command.tsx:72`.
   *Verificación:* `grep -n "pointer-coarse:h-11!" src/shared/components/ui/command.tsx` devuelve la línea, y `SearchableSelect.test.tsx` pasa.

5. **Retirar los dieciocho parches de §1 E.** En los seis `<Button>`, `size="touch" className="md:h-8"` desaparece y quedan en el tamaño por defecto. En los cinco `SelectTrigger`, `min-h-11 w-full md:min-h-8` queda en `w-full`. En los cinco `<Input>` de filtros, `className="min-h-11 md:min-h-8"` desaparece. En los dos buscadores con icono, `h-11 pl-8 md:h-8` queda en `pl-8`.
   *Verificación:* `grep -rnE 'md:h-8|md:min-h-8' src/` no devuelve nada, y los tests de `catalogItem`, `diagnosticTerm`, `vaccineWhodrug`, `whodrugProduct`, `user` y `appRole` pasan.

6. **Medición en táctil emulado.** Con Playwright, contexto `hasTouch: true` e `isMobile: true` a 375×812. Primero se confirma que `matchMedia('(pointer: coarse)').matches` da `true`; si no, se mide con el modo dispositivo de Chrome DevTools. Después se mide `getBoundingClientRect().height` en un `<Input>`, un `SelectTrigger`, un disparador de `<SearchableSelect>`, un botón `icon` y el buscador del desplegable. Se mide en `/esavi-cases`, en el diálogo de evento del asistente y en `/catalog-items`. La misma medición se repite en escritorio sin táctil.
   *Verificación:* todos miden 44 en táctil y 32 en escritorio, y `document.documentElement.scrollWidth` es ≤ 375 en las tres pantallas.

---

## 5. Criterios de aceptación

- [ ] `input.tsx`, `select.tsx`, `button.tsx` y `command.tsx` llevan su clase `pointer-coarse:` de §3.1, y cada una la fija un test.
- [ ] `<Button size="sm">`, `xs` y `touch` no llevan `pointer-coarse:`, y `SelectTrigger size="sm"` lleva `data-size="sm"`, que deja sin efecto la clase de 44px (lo comprueba un test).
- [ ] `grep -rnE 'md:h-8|md:min-h-8' src/` no devuelve resultados.
- [ ] En táctil emulado a 375px, `<Input>`, `SelectTrigger`, el disparador de `<SearchableSelect>`, el botón `icon` y el buscador del desplegable miden 44px, en `/esavi-cases`, en el diálogo de evento y en `/catalog-items`.
- [ ] En escritorio con ratón, esos mismos controles siguen midiendo 32px.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque de cierre:**

- [ ] **Tema oscuro.** Los controles se ven correctos en `dark`, y `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/shared/components/ui/{input,select,button,command}.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** Las tablas siguen colapsando a tarjetas, y el body no hace scroll horizontal a 375px en táctil emulado en las tres pantallas medidas, Topbar incluido.
- [ ] **Rol bajo.** No aplica: el spec no cambia qué se muestra a cada rol. Con `USER` las tres pantallas medidas cargan igual que antes.
- [ ] **Sin literales.** No aplica: el spec no introduce texto visible.
- [ ] **Estado en una sola capa.** El tamaño lo decide solo CSS: `grep -rn "pointer: coarse" src/ --include=*.ts --include=*.tsx` no devuelve ningún `matchMedia`.

---

## 6. Decisiones tomadas y descartadas

- **Sí: `pointer-coarse:` en la primitiva.** El requisito de §10.2 es táctil, no de ancho. Con esta variante se llega a 44px solo donde hay dedo, y el escritorio con ratón queda como está. Así desaparece la objeción de FE15 («subir el default reflota 45 entidades sin pase visual»).
- **No: `h-11 md:h-8`.** Falla en tabletas táctiles a partir de `md`. Es el criterio de los dieciocho parches de §1 E, y por eso se retiran.
- **No: `h-11` para todos.** Hincha barras de filtros y filas de tabla en escritorio sin ninguna ganancia de accesibilidad con ratón.
- **No: un `size="touch"` opcional en cada uso.** Serían más de 54 archivos tocados, y cada formulario nuevo lo olvidaría. Es la deriva que este spec corta.
- **Sí: la familia entera (`<Input>`, `SelectTrigger`, `<Button>` `default`/`icon`, buscador de `<Command>`).** Con solo `<Input>`, un campo de 44px quedaría junto a un selector de 32px en el mismo formulario: es la advertencia C del hallazgo de FE14b.
- **Sí: se mantienen `touch`/`icon-touch` de FE15.** Esos CTA del asistente miden 44px también en escritorio, por decisión de FE15, y este spec no la reabre.
- **No: detectar el puntero en JS (`matchMedia`) y guardarlo en `ui`.** Sería un dato en dos capas, y CSS ya lo resuelve sin re-render.
- **No: tocar los tamaños de densidad (`xs`, `sm`, `lg`, `icon-*`) ni los complementos de `<InputGroup>`.** Su uso es deliberado: compacto y secundario. Si alguno resulta ser un objetivo táctil principal, se cambia en su pantalla a `touch`.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Los botones `icon` del Topbar (tema, idioma, logout) pasan a 44px y reabren el desbordamiento a 375px que corrigió FE15 | El paso 6 mide `scrollWidth` a 375px en táctil. Si desborda, se ajusta el `gap` del Topbar dentro de este spec, porque es consecuencia directa del cambio |
| Las tarjetas de `<ResourceTable>` con varios botones `icon` en fila crecen y pueden partir la línea | Se acepta: en táctil, el objetivo de 44px manda sobre la densidad. El paso 6 revisa `/catalog-items` |
| Playwright con `hasTouch` no activa `(pointer: coarse)` en jsdom ni, quizá, en Chromium | jsdom no evalúa media queries, así que los tests fijan la clase y no la altura. En Chromium, el paso 6 confirma `matchMedia` antes de medir, y si falla se mide en el modo dispositivo de DevTools |

---

## 8. Impacto en pantallas existentes

- **Todas las pantallas con formularios o botones, solo en dispositivos táctiles:** los controles pasan de 32 a 44px. El escritorio con ratón no cambia.
- **`CatalogItemListPage`, `DiagnosticTermListPage`, `VaccineWhodrugListPage` y `WhodrugProductListPage`:** el botón de importar o sincronizar pierde `size="touch" className="md:h-8"`. En una tableta táctil a partir de `md` mide ahora 44px, no 32. Los `SelectTrigger` y los `<Input>` de sus barras de filtros pierden `min-h-11 md:min-h-8` y heredan el comportamiento de la primitiva.
- **`DiagnosticTermFormDialog`:** sus dos `SelectTrigger` pierden `min-h-11 md:min-h-8` y heredan el comportamiento de la primitiva.
- **`UserRoleHistorySheet` y `UserRolesCard`:** el botón de historial de roles pierde `size="touch" className="md:h-8"`, igual que los de importar.
- **`AppRoleListPage` y `UserSearchField`:** el buscador con icono pierde `h-11 md:h-8` y conserva `pl-8`.

---

## Lo que **no** está en este spec

- Checkbox, radio y switch.
- Los tamaños de densidad de `<Button>` y `SelectTrigger`, y los complementos de `<InputGroup>`.
- La paginación de `<ResourceTable>`.
- Retirar `touch`/`icon-touch` de FE15.
- La insignia de etapas inactivas de la bandeja (FE24).

Cada uno de esos, si aterriza, va en su propio spec.

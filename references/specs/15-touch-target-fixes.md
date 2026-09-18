# SPEC FE15 — Objetivo táctil: CTA del asistente y Topbar responsive

> **Estado:** Implementado
> **Depende de:** SPEC FE01 (`Topbar`, shell y sidebar), SPEC FE08 (`CaseWizardActionBar`), SPEC FE14b (`ReopenCaseButton`, `ClosureStep`)
> **Fecha:** 2026-09-17
> **Objetivo:** Llevar a 44px los botones de acción primaria del asistente y colapsar el bloque de usuario del `Topbar` por debajo de `md`, dos gaps encontrados en la verificación manual de SPEC FE14b.

---

## 1. Por qué existe este spec

Dos hallazgos de la verificación manual de SPEC FE14b (§checklist de cierre, 375px), ninguno causado por ese spec ni exclusivo de él:

**A — Ningún botón del asistente llega a 44px.** `CONVENTIONS.md` §10.2 exige 44px como objetivo táctil mínimo. El `<Button>` compartido (`shared/components/ui/button.tsx`) no tiene ningún `size` que lo alcance: `default` es `h-8` (32px), `lg` es `h-9` (36px). Se midió en vivo sobre «Guardar», «Completar etapa» y «Siguiente» de `CaseWizardActionBar` (SPEC FE08) y sobre «Cerrar expediente» y «Reabrir» de SPEC FE14b: los cinco miden 32px.

**B — El `Topbar` desborda horizontalmente por debajo de `md`.** `document.documentElement.scrollWidth` midió 438px contra un viewport de 375px, reproducido en `/esavi-cases` y en el asistente — no es un problema de una pantalla, es del layout compartido (`src/app/layout/Topbar.tsx`). El bloque de usuario (nombre, insignia de rol, «Cambiar contraseña») no colapsa en ningún punto de quiebre, a diferencia del sidebar, que ya se vuelve `Sheet` por debajo de `md` (`ARCHITECTURE.md` §8.3).

Los dos comparten motivo (la misma pasada de QA) pero no comparten componente ni mecanismo — por eso el spec los trata como dos frentes independientes en la sección 3, unidos sólo por el objetivo de la §10.2.

---

## 2. Alcance

**Dentro:**

- **Un `size` nuevo en `shared/components/ui/button.tsx`: `touch` → `h-11` (44px).** Se declara junto a los demás (`xs`/`sm`/`default`/`lg`/`icon*`), sin tocar `defaultVariants` — nada que no pase `size="touch"` explícito cambia de tamaño. Documentado con un comentario que cite `CONVENTIONS.md` §10.2, igual que el resto de excepciones declaradas del archivo.
- **Un `size` nuevo `icon-touch` → `size-11` (44px)**, para el botón compacto que abre el menú de usuario del `Topbar` (§3.3) — es un botón nuevo que crea este spec, así que tiene que cumplir 44px por construcción, y ningún tamaño de ícono existente llega a esa medida.
- **Los CTA primarios del asistente pasan a `size="touch"`**, en los componentes y llamadas exactas:
  - `CaseWizardActionBar.tsx`: «Guardar», «Completar etapa», «Siguiente».
  - `ClosureStep.tsx`: «Cerrar expediente» (el botón que abre el diálogo) y el `AlertDialogAction`/`AlertDialogCancel` de su confirmación.
  - `ReopenCaseButton.tsx`: «Reabrir» (el botón que abre el diálogo) y el `AlertDialogAction`/`AlertDialogCancel` de su confirmación.
  - Ningún otro botón de la aplicación cambia — ni los de `<ResourceTable>`, ni los de los 45 formularios de entidad, ni los diálogos de baja/reactivación. Ese barrido, si se decide hacer, es otro spec.
- **`Topbar.tsx` colapsa por debajo de `md`.** Nombre, insignia de rol y «Cambiar contraseña» se agrupan en un único `<DropdownMenu>` disparado por un botón compacto (`size="icon-touch"`). Tema, idioma y cerrar sesión **siguen sueltos** en la barra, sin cambios, en cualquier ancho.
  - **Por debajo de `md`:** disparador del sidebar + tema + idioma + menú de usuario (colapsado) + logout. El menú, al abrirse, muestra nombre, insignia de rol y «Cambiar contraseña» — la misma información y la misma acción, sólo que dentro de un `<DropdownMenuContent>` en vez de sueltos en la barra.
  - **En `md` y más ancho:** sin cambios respecto a hoy — nombre e insignia sueltos, «Cambiar contraseña» como botón de texto.
  - El breakpoint es `md`, el mismo en el que el sidebar ya pasa a `Sheet` (`ARCHITECTURE.md` §8.3) — no se inventa uno nuevo.

**Fuera de alcance (otros specs):**

- **El `size: 'default'` global del `<Button>`.** Subirlo a 44px reflotaría cada botón de la app sin ningún pase visual — es una decisión de diseño con su propio spec, no un ajuste puntual.
- **Cualquier otro botón fuera de los cinco nombrados arriba**, aunque también mida 32px — no es hallazgo de esta pasada de QA.
- **Los íconos sueltos del `Topbar`** (tema, idioma, logout): sus `size="icon-sm"` (28px) no cambian. No estaban entre los hallazgos, y meterlos aquí mezclaría dos decisiones de tamaño distintas en un mismo cambio.
- **Cualquier rediseño del `Topbar` más allá de agrupar el bloque de usuario** — colores, iconografía, orden de los elementos sueltos.

---

## 3. Diseño

Spec transversal: en vez del desglose 3.1–3.7 de una pantalla nueva, esto es lo que cambia en cada archivo, con tablas Antes/Después.

### 3.1 Los `size` nuevos en la primitiva

`shared/components/ui/button.tsx`, dentro de `buttonVariants().variants.size`, junto a los demás:

| Antes | Después |
|---|---|
| `default` (32px) es el más alto salvo `lg` (36px). Ninguno llega a 44px. `icon`/`icon-sm`/`icon-lg` tampoco (32/28/36px). | Se añaden `touch: 'h-11 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2'` (44px, misma forma que `default`/`lg`) e `icon-touch: 'size-11'` (44px). `defaultVariants` no cambia. |

Comentario obligatorio junto a la declaración, citando `CONVENTIONS.md` §10.2 y `SPEC FE15`, igual que el resto de excepciones documentadas del archivo.

### 3.2 Los cinco CTA pasan a `size="touch"`

| Archivo | Botón(es) | Antes | Después |
|---|---|---|---|
| `CaseWizardActionBar.tsx` | «Guardar», «Completar etapa», «Siguiente» | Sin `size` (32px) | `size="touch"` |
| `ClosureStep.tsx` | «Cerrar expediente» (trigger) y el `AlertDialogAction`/`AlertDialogCancel` de su diálogo | Sin `size` (32px) | `size="touch"` en los tres |
| `ReopenCaseButton.tsx` | «Reabrir» (trigger) y el `AlertDialogAction`/`AlertDialogCancel` de su diálogo | Sin `size` (32px) | `size="touch"` en los tres |

Ningún otro prop cambia — `variant`, `disabled`, `onClick` quedan igual. `AlertDialogAction`/`AlertDialogCancel` ya reciben `size` por prop (`alert-dialog.tsx:150-182`), así que no hace falta tocar esa primitiva.

### 3.3 `Topbar.tsx` colapsa el bloque de usuario

| | Antes | Después |
|---|---|---|
| **`< md`** | Nombre + insignia + «Cambiar contraseña» sueltos → desbordan | Un botón compacto (`size="icon-touch"`, ícono de usuario) abre un `<DropdownMenu>` con nombre, insignia y «Cambiar contraseña» dentro |
| **`≥ md`** | Sueltos en la barra | Sin cambios |

**Un detalle de implementación que hay que resolver bien:** `ChangePasswordDialog` es un componente que ya trae su propio `<Dialog>` con su `open` interno — no expone props para controlarlo desde afuera. Meter su `<DialogTrigger>` dentro de un `<DropdownMenuItem>` tal cual choca con el auto-cierre del menú al seleccionar un ítem, que desmonta el trigger antes de que el diálogo llegue a abrirse. Se resuelve envolviendo el ítem en `<DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>` — el patrón estándar de Radix para "ítem de menú que abre un diálogo" — sin tocar la API de `ChangePasswordDialog`.

El botón compacto usa `md:hidden` / el bloque suelto usa `hidden md:flex` — dos renders condicionales, no un solo árbol con clases combinadas, para no arrastrar accesibilidad de un modo al otro (un lector de pantalla no debe encontrar los mismos controles duplicados en el DOM).

### 3.4 Contrato de estado

No aplica — ningún dato nuevo. El único estado es si el `<DropdownMenu>` del bloque de usuario está abierto, que Radix ya gestiona internamente (mismo patrón que los desplegables de tema e idioma, ya existentes en este archivo). Nada se guarda, nada cruza capas.

### 3.5 Accesibilidad

- El botón que abre el menú de usuario lleva `aria-label` propio (clave i18n nueva, `shell.userMenu.trigger`), no depende del texto visible porque no tiene texto visible (es un ícono, como tema/idioma/logout).
- Dentro del menú, nombre e insignia se leen igual que hoy (`user.displayName` + `<Badge>{roleName}</Badge>`) — no se resume ni se trunca la información, sólo cambia el contenedor.
- Los cinco botones con `size="touch"` no cambian su `aria-label`/texto — sólo su alto.

### 3.6 Responsividad

- Breakpoint `md`, el mismo de `ARCHITECTURE.md` §8.3.
- El botón compacto y su `<DropdownMenuContent>` cumplen 44px por `size="icon-touch"` (§3.1) — no se deja como `icon-sm`, que es el tamaño de los otros tres íconos sueltos, expresamente fuera de alcance.

---

## 4. Plan de implementación

**1. El `size` nuevo en la primitiva.** `shared/components/ui/button.tsx`: `touch` (`h-11`) e `icon-touch` (`size-11`), con el comentario que cita `CONVENTIONS.md` §10.2 y `SPEC FE15`.
*Verificación:* con la app corriendo, un `<Button size="touch">` de prueba mide 44px de alto por DOM (`getBoundingClientRect().height`). Ningún botón existente cambia de tamaño (nada usa `touch`/`icon-touch` todavía).

**2. Los cinco CTA del asistente.** `CaseWizardActionBar.tsx`, `ClosureStep.tsx`, `ReopenCaseButton.tsx`: `size="touch"` en los ocho botones listados en §3.2 (tres + tres + dos triggers y sus diálogos).
*Verificación:* cada uno mide 44px de alto. `npx tsc --noEmit -p tsconfig.app.json` sin errores nuevos en los tres archivos. Los tests existentes de `CaseWizardActionBar.test.tsx`, `ClosureStep.test.tsx` y `ReopenCaseButton.test.tsx` siguen en verde (ninguno asertaba sobre tamaño, así que no deberían romperse).

**3. `Topbar.tsx` colapsa por debajo de `md`.** El botón compacto (`size="icon-touch"`, `aria-label` de la clave nueva) con su `<DropdownMenu>`, el `<DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>` envolviendo `<ChangePasswordDialog>`, y los dos renders condicionales (`md:hidden` / `hidden md:flex`) para el bloque de usuario. Tema, idioma y logout no se tocan.
*Verificación:* a 375px, `document.documentElement.scrollWidth` ya no excede `clientWidth`. El menú de usuario abre, muestra nombre + insignia + «Cambiar contraseña», y seleccionar «Cambiar contraseña» abre su diálogo (no se queda el menú abierto tapándolo, ni el diálogo falla en abrir). En `md` y más ancho, el Topbar se ve idéntico a como está hoy.

**4. Las claves i18n nuevas.** `shell.userMenu.trigger` en `es`, `en` y `nl`.
*Verificación:* `npm run i18n:check` en paridad.

**5. Cierre.** `npm run check` completo. Comprobación manual a 375px (el propio motivo del spec) y en tema oscuro (el botón compacto y el menú no meten ningún color literal nuevo).

---

## 5. Criterios de aceptación

- [ ] «Guardar», «Completar etapa» y «Siguiente» en `CaseWizardActionBar` miden 44px de alto.
- [ ] «Cerrar expediente» (el trigger de `ClosureStep`) y los dos botones de su diálogo de confirmación miden 44px de alto.
- [ ] «Reabrir» (el trigger de `ReopenCaseButton`) y los dos botones de su diálogo de confirmación miden 44px de alto, en los tres sitios donde se monta (paso «Cierre», aviso de sólo lectura, `EsaviCaseDetailPage`).
- [ ] Ningún otro botón de la aplicación cambió de tamaño — una comprobación puntual sobre `<ResourceTable>` (p. ej. el menú de acciones de fila de `EsaviCaseListPage`) sigue midiendo 32px.
- [ ] A 375px, `document.documentElement.scrollWidth` no excede `clientWidth` en `/esavi-cases` y en cualquier paso del asistente.
- [ ] Por debajo de `md`, el bloque de usuario (nombre, insignia, «Cambiar contraseña») no está suelto en la barra — vive dentro del `<DropdownMenu>` que abre el botón compacto.
- [ ] El botón compacto del menú de usuario mide 44px de alto y de ancho, y tiene `aria-label` propio.
- [ ] Dentro del menú de usuario colapsado, el nombre y la insignia de rol se leen igual que hoy — ningún dato se pierde ni se trunca.
- [ ] Seleccionar «Cambiar contraseña» dentro del menú colapsado abre el diálogo correctamente — el menú no se queda abierto tapándolo, ni el diálogo falla en aparecer.
- [ ] En `md` y anchos mayores, el `Topbar` se ve idéntico al actual — nombre, insignia y «Cambiar contraseña» sueltos, sin el botón compacto.
- [ ] Tema, idioma y cerrar sesión no cambiaron de tamaño ni de comportamiento en ningún ancho.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no añade errores en los archivos tocados.

**Bloque de cierre — se verifica a mano:**

- [ ] **Tema oscuro.** El botón compacto, el menú desplegable y los cinco CTA con `size="touch"` se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/app/layout/Topbar.tsx src/shared/components/ui/button.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** Se prueba explícitamente a 375px, el ancho donde se detectó el hallazgo original.
- [ ] **Rol bajo.** El colapso del Topbar y los CTA del asistente se prueban con un USER, no sólo con SUPERADMIN — ninguno de los dos depende del rol, pero se confirma que `useCan()` no interfiere.
- [ ] **Sin literales.** `shell.userMenu.trigger` está en los tres idiomas.

---

## 6. Decisiones tomadas y descartadas

- **Sí: un `size` nuevo en la primitiva (`touch`/`icon-touch`), no una `className` suelta en cada sitio.** Es la primitiva de `CONVENTIONS.md` §10.4 — se declara una vez y el próximo spec que necesite un CTA a 44px la reutiliza en vez de reinventar el mismo parche. *Descartado:* `className="h-11"` repetido en cada uno de los cinco sitios — funciona igual pero no deja rastro de que sea una decisión de accesibilidad, y nadie lo encontraría al buscar otros usos de `size`.
- **Sí: acotado a los cinco CTA ya señalados por el hallazgo, no al `default` global.** Subir el default reflota 45 entidades sin ningún pase visual previo — una decisión de producto, no un ajuste de accesibilidad puntual. *Descartado:* aprovechar este spec para "arreglarlo todo de una vez"; es exactamente el tipo de alcance que crece durante la implementación y que las convenciones piden frenar.
- **Sí: el `Topbar` colapsa en `md`, el mismo breakpoint del sidebar.** Dos mecanismos de colapso con puntos de quiebre distintos en el mismo shell confundiría más de lo que resuelve. *Descartado:* un breakpoint propio (`sm` o uno custom) sólo para el Topbar.
- **Sí: nombre e insignia siguen visibles dentro del menú colapsado, nunca se ocultan.** Es información que ya se mostraba; el hallazgo es de espacio horizontal, no de qué mostrar. *Descartado:* ocultar el nombre bajo `md` y dejar sólo la insignia — ahorra espacio pero pierde información que el usuario ya tenía.
- **Sí: tema, idioma y logout quedan sueltos, fuera del menú colapsado.** Son los tres controles que, sueltos, ya caben holgados en 375px (medido), y los que un usuario busca a golpe de vista, no dentro de un menú. *Descartado:* meter los cinco controles (tema, idioma, usuario, cambiar contraseña, logout) en un solo menú — simplifica el Topbar pero esconde justo lo que hoy es más accesible.
- **Sí: `<DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>` envolviendo `<ChangePasswordDialog>` sin tocarlo, en vez de darle props de control externo.** Es el patrón estándar de Radix para "ítem de menú que abre un diálogo", y no obliga a cambiar la API de un componente que SPEC FE01 ya dejó cerrado. *Descartado:* levantar el `open` de `ChangePasswordDialog` a un estado controlado desde `Topbar` — más invasivo, y el componente no lo necesita en ningún otro sitio donde se usa.

---

## 7. Riesgos identificados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **`DropdownMenuItem` + `Dialog` anidados es un patrón frágil de Radix** — si el `onSelect` no lleva `preventDefault()`, el menú se desmonta antes de que el diálogo llegue a abrirse, y el fallo sólo se nota al hacer clic, no al compilar. | El paso 3 del plan lo nombra explícitamente en su verificación: "seleccionar «Cambiar contraseña» abre el diálogo, el menú no tapa nada". Si falla, es la primera señal a revisar. |
| 2 | **El `size="touch"` nuevo puede tentar a usarse fuera de los cinco sitios de este spec**, ahora que existe en la primitiva. | Es una tentación razonable y no un problema en sí — pero cada uso nuevo fuera de este spec es una decisión de otra pantalla, no un efecto automático de que la primitiva ya lo tenga declarado. |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes | Después |
|---|---|---|
| `shared/components/ui/button.tsx` | Ocho `size` (`xs`/`sm`/`default`/`lg`/`icon`/`icon-xs`/`icon-sm`/`icon-lg`) | Diez: se añaden `touch` e `icon-touch`. Ningún `size` existente cambia de valor. |
| `CaseWizardActionBar.tsx` (SPEC FE08) | «Guardar»/«Completar etapa»/«Siguiente» a 32px | 44px. Mismo `variant`, misma lógica de `disabled` |
| `ClosureStep.tsx` (SPEC FE14b) | «Cerrar expediente» y su diálogo a 32px | 44px |
| `ReopenCaseButton.tsx` (SPEC FE14b) | «Reabrir» y su diálogo a 32px, en sus tres sitios de montaje | 44px en los tres |
| `Topbar.tsx` (SPEC FE01) | Bloque de usuario suelto en cualquier ancho; desborda por debajo de `md` | Colapsa a un menú por debajo de `md`; sin cambios en `md` y más ancho |
| `Topbar.test.tsx` | No prueba el colapso (no existía) | Se añaden los casos de §5: colapsa a 375px, el menú abre `ChangePasswordDialog`, sin cambios en desktop |

---

## Lo que **no** está en este spec

- El `size: 'default'` global del `<Button>` — sigue en 32px para todo lo que no sea uno de los cinco CTA nombrados.
- Cualquier otro botón de la aplicación que también mida menos de 44px y no haya salido en esta pasada de QA.
- Los íconos sueltos del `Topbar` (tema, idioma, logout) — siguen en `icon-sm` (28px).
- Cualquier rediseño del `Topbar` más allá de colapsar el bloque de usuario.
- Un breakpoint distinto de `md` para cualquiera de los dos frentes.

Cada uno, si aterriza, va en su propio spec.

# SPEC FE05 — Limpieza de selección en los combos

> **Estado:** Implementado
> **Depende de:** SPEC FE02 (fábrica de recursos y `<ResourceTable>`), SPEC FE03 (`<CatalogTypeSelect>`), SPEC FE04 (`<GeoLocationPicker>` y el listado de geografía)
> **Fecha:** 2026-09-01
> **Objetivo:** Que todo combo de la aplicación pueda deshacer su selección con una «×» dentro del propio control, sin salir a buscar un botón externo.

---

## 1. Por qué existe este spec

Hoy un `<Select>` de este repositorio no se puede vaciar. Radix no admite `""` como valor, así que una vez elegida una opción no hay forma de volver al estado «sin elegir» desde el propio control. Cada pantalla ha resuelto esa carencia por su cuenta, y de tres maneras distintas:

**A — El filtro de nivel usa una opción centinela.** `GeoLocationListPage.tsx:274` añade `ALL_LEVELS` como primer `<SelectItem>` («Todos») para representar «sin filtro». Es una opción falsa dentro de una lista de datos reales: no existe ningún `geoLevelType` llamado «Todos», y la lista de opciones mezcla un valor de dominio con un valor de control.

**B — El resto no lo resuelve.** `CatalogTypeSelect.tsx:58` no ofrece salida: una vez elegido un tipo de catálogo, el usuario no puede volver a la pantalla de invitación (`catalogItem.list.noTypeSelected`) sin recargar o editar la URL.

**C — La única salida real es un botón externo.** `GeoLocationListPage.tsx:309` pinta un «Limpiar filtros» que vacía los tres filtros a la vez. Sirve para empezar de cero, no para deshacer un filtro concreto, y ese mismo archivo deja escrito en `:303-308` que se mantuvo como acción única a la espera de este spec — *«kept as one button, not one "X" per field, so a future clearable-`<Select>` primitive (SPEC FE04 follow-up, out of this spec's scope) won't end up duplicating the affordance»*.

Este spec es ese follow-up. Resuelve el vacío una sola vez, en `shared/components/ui/select.tsx`, en lugar de dejar que cada una de las ~45 entidades pendientes vuelva a inventar su centinela — que es exactamente el error que `CONVENTIONS.md` §10.4 previene.

---

## 2. Alcance

**Dentro:**

- Props `clearable` y `onClear` en `SelectTrigger` (`src/shared/components/ui/select.tsx`), con `clearable` activada por defecto.
- La «×» se renderiza a la izquierda del chevron, **solo cuando el `<Select>` tiene un valor seleccionado**.
- La «×» es un `<button type="button">` hermano del trigger de Radix, dentro de un contenedor `relative`. No es un hijo del trigger: `SelectPrimitive.Trigger` ya es un `<button>` y anidar otro es HTML inválido.
- Adaptación de los cinco consumidores actuales de `<Select>`, con dos excepciones declaradas (`clearable={false}`).
- Retirada de la opción centinela `ALL_LEVELS` de `GeoLocationListPage.tsx`, sustituida por la «×».
- Una «×» por nivel en `<GeoLocationPicker>`; limpiar el nivel N descarta los niveles descendientes.
- Clave i18n `common.select.clear` en los tres idiomas, usada como `aria-label`.
- Área pulsable de 44px por debajo de `md`, con el icono a 16px.
- Tests unitarios de la primitiva y ajuste de los tests existentes que dependen de la opción «Todos».

**Fuera de alcance (otros specs):**

- **El `<Input>` de búsqueda limpiable.** Un input con «×» es otro componente y otro comportamiento de teclado (Escape borra el texto). Decidido explícitamente en la ronda de preguntas.
- **El botón «Limpiar filtros» de `GeoLocationListPage.tsx:309`.** Se queda como está: limpia los tres filtros a la vez, incluida la búsqueda por texto, que no es un `<Select>`. No lo sustituye la «×».
- **Combos con búsqueda incorporada** (`cmdk` sobre catálogos largos). El aviso `catalogType.select.tooManyTypes` seguirá siendo la única señal de que un catálogo pasa de 100 filas.
- **Selección múltiple.** Ningún `<Select>` del repositorio la tiene hoy.
- **`<DatePicker>` y los filtros de fecha de SPEC F48.** Todavía no existen; cuando lleguen, decidirán su propio affordance de limpieza.

---

## 3. Diseño

### 3.1 La primitiva — `SelectTrigger` con «×»

Dos props nuevas en `src/shared/components/ui/select.tsx`:

| Prop | Tipo | Defecto | Qué hace |
|---|---|---|---|
| `clearable` | `boolean` | `true` | Habilita la «×». Se pone en `false` donde vaciar no es un estado válido |
| `onClear` | `() => void` | — | Lo que el consumidor hace al limpiar. Sin ella la «×» no se pinta, aunque `clearable` sea `true` |

**Estructura.** El trigger pasa a envolverse en un `<span className="group relative">`. Dentro: el `SelectPrimitive.Trigger` de siempre y, como **hermano**, el `<button type="button">` de la «×», posicionado sobre el trigger a la izquierda del chevron. No es un hijo del trigger porque `SelectPrimitive.Trigger` ya renderiza un `<button>`.

**Cuándo se ve.** Radix pone `data-placeholder` en el trigger mientras no hay valor. La «×» se oculta con `group-has-data-[placeholder]:hidden` — `display: none`, así que además sale del orden de tabulación. **No hay un segundo estado que diga si hay valor**: se deriva del atributo que Radix ya escribe, coherente con `CONVENTIONS.md` §7.

**El clic no abre el desplegable.** Radix abre en `pointerdown`, no en `click`. La «×» llama a `stopPropagation()` en `onPointerDown` **y** en `onClick`. Sin lo primero, limpiar abre la lista en el mismo gesto.

**Limpiar es poner `''`, nunca `undefined`.** Pasar `undefined` al `value` de un `<Select>` controlado lo convierte en no controlado y React avisa — es la razón del `useState('')` de `GeoLocationPicker.tsx:41`. `onClear` deja el control en `''` y traduce eso a lo que su capa necesite: borrar el parámetro de `searchParams`, o emitir `null` hacia `onChange`.

**Accesibilidad.** `aria-label` desde `common.select.clear`. Alcanzable con Tab: una parada más por combo, decidido en la ronda de preguntas. No captura Escape — dentro de un `<Select>` abierto Escape ya cierra la lista.

**Táctil.** Icono `XIcon` a 16px, área pulsable de 44px por debajo de `md` mediante padding negativo compensado, sin desplazar el chevron ni cambiar la altura del trigger.

### 3.2 Endpoints consumidos

**Ninguno.** Este spec no habla con el backend: no añade lecturas, no añade escrituras y no cambia ninguna clave de caché. Los combos siguen leyendo exactamente lo que leían.

### 3.3 Consumidores — antes y después

| Consumidor | Antes | Después |
|---|---|---|
| `features/geoLocation/GeoLocationListPage.tsx:274` | Filtro de nivel con `<SelectItem value={ALL_LEVELS}>` «Todos» | «×». La opción «Todos» y la constante `ALL_LEVELS` desaparecen |
| `features/catalogType/CatalogTypeSelect.tsx:58` | Sin salida una vez elegido el tipo | «×»; vaciar devuelve a `catalogItem.list.noTypeSelected` |
| `shared/components/GeoLocationPicker.tsx:82` | Un `<Select>` por nivel, sin forma de retroceder | «×» por nivel; limpiar el nivel N descarta los descendientes |
| `shared/components/ResourceTable.tsx:248` | `pageSize` | `clearable={false}` — **excepción 1** |
| `features/geoLocation/GeoLocationFormDialog.tsx:140` | `geoLevelTypeId` | `clearable={false}` — **excepción 2** |

**Las dos excepciones, razonadas.** Un `pageSize` vacío no es un estado que `<ResourceTable>` sepa pintar: la «×» llevaría la tabla a un limbo sin equivalente en la URL. `geoLevelTypeId` es obligatorio en `schemas.ts:14` (`z.string().uuid()`): la «×» solo adelantaría un error de validación que el usuario no puede resolver más que volviendo a elegir.

**Los combos futuros la traen sin hacer nada**, porque el defecto es `true`. Desactivarla exige escribir `clearable={false}` y, por tanto, justificarlo.

### 3.4 Contrato de estado

Este spec **no introduce ningún dato nuevo**. La «×» no guarda nada: escribe en la capa donde ya vivía el valor del combo que la muestra.

| Dato | Capa | Clave / forma | Qué hace la «×» |
|---|---|---|---|
| Filtro de nivel de `geoLocation` | URL | `searchParams.geoLevelId` | Borra el parámetro y vuelve a la página 1 |
| Tipo de catálogo elegido | URL | `searchParams.typeId` | Borra el parámetro; la pantalla vuelve a la invitación |
| Nivel seleccionado en `<GeoLocationPicker>` | Componente | `useState('')` por nivel (`GeoLocationPicker.tsx:41`) | Lo devuelve a `''` y emite `null` hacia `onChange` |
| Campo de `<Select>` dentro de un formulario | React Hook Form | `field.value` | Lo devuelve a `''` vía `field.onChange` |
| Presencia de la «×» | Ninguna | Derivada de `data-placeholder` de Radix, con CSS | — |

Tres reglas que este spec respeta y conviene dejar escritas:

- **La «×» no conoce el dominio.** No sabe si limpia un filtro de la URL o un campo de formulario: llama a `onClear` y el consumidor decide. Por eso no hay una prop `value` en la primitiva.
- **Limpiar un filtro vuelve a la página 1.** `searchParams.page` se reinicia igual que al cambiar el filtro por cualquier otra vía; el manejador existente ya lo hace y no se duplica.
- **No se invalida ninguna caché.** Cambiar un filtro cambia la clave de la query, y TanStack Query resuelve el resto. No hay mutación de por medio.

### 3.5 Formularios y validación

No hay schema nuevo ni campo nuevo. Dos reglas:

- **Un campo obligatorio no lleva «×».** La excepción de `geoLevelTypeId` en §3.3 es el caso; cualquier `<Select>` futuro sobre un campo `NOT NULL` del backend hace lo mismo. La «×» es para lo opcional y para los filtros.
- **Limpiar un campo opcional deja `''`, y el `emptyToUndefined` de `schemas.ts:7` lo convierte en `undefined`** antes de enviar. Ningún `''` viaja al backend por esta vía.

### 3.6 Estados del control

| Estado | Qué se ve |
|---|---|
| Sin valor | Solo el chevron. La «×» no está en el DOM visible ni en el orden de tabulación |
| Con valor | «×» + chevron. Foco visible en la «×» con el mismo anillo que el resto de controles |
| `disabled` | Sin «×». Hereda el `disabled` del trigger; un combo deshabilitado no se limpia |
| `clearable={false}` | Solo el chevron, tenga valor o no |
| Cargando (`<Skeleton>`) | El combo no se ha pintado todavía; no aplica |

### 3.7 Responsividad y accesibilidad

- Icono a 16px en todos los tamaños. Por debajo de `md`, área pulsable de 44px (`CONVENTIONS.md` §10.2), sin cambiar la altura del trigger ni desplazar el chevron.
- `aria-label` obligatorio desde `common.select.clear`; el icono lleva `aria-hidden="true"`.
- Una parada de tabulación adicional por combo, antes del chevron y después del trigger.
- Escape no se captura: dentro del `<Select>` abierto sigue cerrando la lista.
- Sin color literal: `text-muted-foreground` en reposo, `text-foreground` en `hover`. Verificable con el `grep` de §5.

### 3.8 Claves i18n nuevas

| Clave | Uso |
|---|---|
| `common.select.clear` | `aria-label` del botón «×» |

Va a los tres archivos: «Limpiar selección» (es), «Clear selection» (en), «Selectie wissen» (nl).

`common.table.allOption` deja de usarse: `GeoLocationListPage.tsx:279` es su **único** consumidor, comprobado con `grep`. Se elimina de los tres idiomas en el mismo paso.

---

## 4. Plan de implementación

1. **La primitiva.** `clearable` (defecto `true`) y `onClear` en `SelectTrigger` de `src/shared/components/ui/select.tsx`: envoltorio `group relative`, la «×» como `<button type="button">` hermano del trigger, oculta con `group-has-data-[placeholder]:hidden`, `stopPropagation` en `onPointerDown` y `onClick`, `aria-label` desde `common.select.clear`, área de 44px por debajo de `md`.
   *Verificación:* ningún consumidor cambia de comportamiento todavía, porque ninguno pasa `onClear`; `npm run build` y `npm run lint` en 0.

2. **La clave i18n.** `common.select.clear` en `es`, `en` y `nl`.
   *Verificación:* `npm run i18n:check` en 0.

3. **Test de la primitiva.** `src/shared/components/ui/select.test.tsx`: sin valor la «×» no está en el DOM; con valor sí; pulsarla llama a `onClear` **y no abre la lista**; con `clearable={false}` no aparece nunca; con `disabled` tampoco.
   *Verificación:* `npm test -- select` en verde.

4. **Filtro de nivel de geografía.** En `GeoLocationListPage.tsx`: borrar la constante `ALL_LEVELS` (`:42`), la rama `value === ALL_LEVELS` de `handleGeoLevelChange` (`:163`) y el `<SelectItem>` centinela (`:279`); pasar `onClear` que elimina `geoLevelId` de `searchParams` y vuelve a la página 1. Retirar `common.table.allOption` de los tres idiomas.
   *Verificación:* con un nivel filtrado, la «×» lo quita y la URL pierde el parámetro; el botón «Limpiar filtros» sigue limpiando los tres filtros; `GeoLocationListPage.test.tsx` actualizado y en verde.

5. **`<CatalogTypeSelect>`.** `onClear` que emite el vaciado hacia `CatalogItemListPage`, que borra `typeId` de `searchParams`.
   *Verificación:* elegir un tipo, pulsar la «×» y la pantalla vuelve a `catalogItem.list.noTypeSelected`; recargar mantiene ese estado.

6. **`<GeoLocationPicker>`.** Una «×» por nivel: devuelve su `useState` a `''` y emite `null` por `onFinalChange`. El `key={selected}` de `:104` ya descarta los niveles descendientes.
   *Verificación:* con una cascada de tres niveles, limpiar el segundo borra el tercero y el filtro de padre queda vacío en la URL.

7. **Las dos excepciones.** `clearable={false}` en el `pageSize` de `ResourceTable.tsx:248` y en el `geoLevelTypeId` de `GeoLocationFormDialog.tsx:140`, cada uno con un comentario de una línea citando §3.3.
   *Verificación:* ninguno de los dos combos muestra «×» con valor elegido.

8. **Revisión de cierre.** Recorrido con `web-design-guidelines` (`CONVENTIONS.md` §10.6) y el checklist de §14.
   *Verificación:* `npm run check` en 0.

---

## 5. Criterios de aceptación

- [ ] `SelectTrigger` acepta `clearable` (defecto `true`) y `onClear`; un `<Select>` sin `onClear` se comporta exactamente como antes.
- [ ] Sin valor seleccionado, la «×» no está en el DOM y no ocupa una parada de tabulación.
- [ ] Pulsar la «×» limpia el valor y **no** abre el desplegable.
- [ ] `grep -rn "__all__\|ALL_LEVELS" src/` no devuelve resultados.
- [ ] `grep -rn "allOption" src/` no devuelve resultados.
- [ ] Los cinco consumidores de §3.3 están adaptados; los dos con `clearable={false}` no muestran «×» con valor elegido.
- [ ] Limpiar el filtro de nivel borra `geoLevelId` de la URL y devuelve la tabla a la página 1.
- [ ] Limpiar el tipo en `<CatalogTypeSelect>` devuelve a `catalogItem.list.noTypeSelected`, y recargar mantiene ese estado.
- [ ] Limpiar el nivel N de `<GeoLocationPicker>` descarta los niveles descendientes.
- [ ] Un `<Select>` deshabilitado no muestra «×» aunque tenga valor.
- [ ] `common.select.clear` existe en es, en y nl; `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La «×» se ve correcta en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/shared/components/ui/select.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** El área pulsable de la «×» mide 44px, el trigger no cambia de altura y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` los combos visibles se limpian igual; ninguna «×» produce una petición que la ruta rechace.
- [ ] **Sin literales.** El `aria-label` de la «×» sale de i18n en los tres idiomas; no queda ningún texto visible fuera de i18n.
- [ ] **Estado en una sola capa.** La presencia de la «×» se deriva de `data-placeholder`, no de un estado propio; ningún filtro sale de `searchParams`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** prop en `SelectTrigger`, no un `<ClearableSelect>` nuevo. `CONVENTIONS.md` §10.4 resuelve las variantes con una prop; un envoltorio obligaría a migrar los cinco consumidores y a recordar cuál usar en cada combo futuro.
- **Sí:** `clearable` activada por defecto. Con ~45 entidades pendientes, el defecto decide el resultado: así cada excepción hay que escribirla y justificarla, en vez de que la «×» falte por olvido.
- **Sí:** visibilidad derivada de `data-placeholder` con CSS. La alternativa —pasar el `value` a la primitiva— duplicaría en la primitiva un dato que ya vive en el consumidor.
- **Sí:** la «×» en el orden de tabulación. Una acción que solo existe con ratón no es una acción para todo el mundo. El coste es una parada más por combo, aceptado en la ronda de preguntas.
- **No:** la «×» sustituye al botón «Limpiar filtros». Son cosas distintas: una deshace un filtro, la otra vuelve al estado inicial e incluye la búsqueda por texto, que no es un `<Select>`.
- **No:** conservar la opción «Todos» junto a la «×». Dos affordances para la misma acción obligan a explicar una diferencia que no existe.
- **No:** «×» en el `pageSize` y en `geoLevelTypeId`. Vaciar el primero deja la tabla sin estado pintable; vaciar el segundo solo adelanta un error de validación inevitable.
- **No:** capturar Escape para limpiar. Dentro de un `<Select>` abierto Escape ya cierra la lista; darle un segundo significado según el foco es una trampa de teclado.
- **No:** `undefined` como valor de limpieza. Convierte un `<Select>` controlado en no controlado — el problema que `GeoLocationPicker.tsx:41` ya documenta. Se limpia con `''`.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `data-placeholder` es un detalle interno de Radix; una actualización podría cambiarlo | El test del paso 3 falla de inmediato si deja de aplicarse; hoy el `select.tsx:47` ya depende de ese atributo para el color del placeholder |
| `shared/components/ui/select.tsx` lo genera el CLI de shadcn: reinstalarlo pisaría las props | Comentario en el archivo citando este spec; `CONVENTIONS.md` §4 ya reconoce `ui/` como carpeta con reglas propias |
| La «×» sobre un trigger estrecho puede solapar un texto largo | El trigger ya usa `line-clamp-1`; el padding derecho se aumenta para reservar el sitio de los dos iconos |
| Una parada de tabulación más por combo alarga el recorrido de un formulario con muchos selects | Solo aparece cuando hay valor; los campos obligatorios no la llevan |

---

## 8. Impacto en pantallas existentes

- `features/geoLocation/GeoLocationListPage.tsx` — desaparecen `ALL_LEVELS`, su rama en `handleGeoLevelChange` y el `<SelectItem>` «Todos». `GeoLocationListPage.test.tsx` se actualiza.
- `features/catalogType/CatalogTypeSelect.tsx` y `features/catalogItem/CatalogItemListPage.tsx` — el combo gana un camino de vuelta que antes no existía.
- `shared/components/GeoLocationPicker.tsx` — una «×» por nivel.
- `shared/components/ResourceTable.tsx` y `features/geoLocation/GeoLocationFormDialog.tsx` — solo `clearable={false}`; comportamiento idéntico al actual.
- `src/locales/{es,en,nl}.json` — entra `common.select.clear`, sale `common.table.allOption`.

---

## Lo que **no** está en este spec

- El `<Input>` de búsqueda limpiable.
- Combos con búsqueda incorporada para catálogos de más de 100 filas.
- Selección múltiple.
- El affordance de limpieza de `<DatePicker>` y de los filtros de fecha de SPEC F48.

Cada uno de esos, si aterriza, va en su propio spec.

# SPEC FE37 — Inicio: alertas por lote

> **Estado:** Aprobado
> **Depende de:** SPEC FE35 (sección «Vigilancia», `useDashboardPeriod`), SPEC FE34 (contrato `dashboard.ts`, filtro `statusCode` del listado), SPEC FE36b (etiquetas «Texto libre» y «Sin nombre»), SPEC FE09 (listado de casos y sus filtros), SPEC F68 del backend (`ESAVI-DASH-010` y filtro por lote en `ESAVI-CASE-002A`/`002B`), SPEC F66 del backend (validador de periodo y regla de defunción)
> **Fecha:** 2026-11-03
> **Objetivo:** Que la sección «Vigilancia» señale los lotes de vacuna que acumulan casos, graves o defunciones en el territorio del usuario, y que quien puede leer casos llegue a ellos con un clic.

---

## 1. Por qué existe este spec

**El agrupamiento por lote es la señal que no se puede dejar pasar.** Varios eventos tras vacunas del mismo lote apuntan a un problema de calidad del producto, de cadena de frío o de administración, y las tres causas se corrigen retirando o investigando el lote. Detectarlo tarde significa seguir aplicándolo. Hoy nadie agrega los lotes: para ver un agrupamiento habría que abrir los casos uno por uno. El backend ya lo calcula: es `ESAVI-DASH-010`, especificado en el SPEC F68, y este spec es su consumo.

**Esta vez el color sí juzga.** El FE35 descartó los colores semánticos porque más casos notificados no es necesariamente malo. Una alerta por lote es otra cosa: alguien tiene que actuar, y una defunción asociada a un lote es lo más urgente que puede mostrar Inicio. El F68 pide para `DEATH` «el énfasis visual más alto». Este spec hace esa excepción explícita, y la acota a los motivos de la alerta.

**Una alerta que no lleva a sus casos se queda en aviso.** El F68 abre la alerta a `ANALYTICS`, así que no trae `caseId`. A cambio, amplió el listado de casos con `?batchNumber=` y `?vaccineKey=`, con la misma normalización que la alerta, para que el «4 casos» de la alerta y el listado cuadren. El cliente todavía no conoce esas claves: `esaviCaseFiltersSchema` (`features/esaviCase/schemas.ts:42`) no las tiene, y sin ellas el enlace abriría el listado completo. Este spec las añade.

**El lote tiene una regla que el formulario no puede romper.** `vaccineKey` sin `batchNumber` responde 400 (F68 §3.5). Además, `vaccineKey` (`W:<uuid>` o `T:<texto>`) no se puede elegir en ningún selector: ninguna ruta lista esas claves. Por eso este spec decide qué es editable y qué solo llega por enlace, y garantiza que quitar el lote quita también la vacuna.

**La alerta trae pistas de causa que hay que mostrar.** El F68 cuenta cuántos casos se vacunaron con el lote ya caducado y devuelve las formas en que se escribió el lote. La primera es una causa probable del agrupamiento. La segunda es un problema de calidad del dato: si `AB-123` y `AB 123` son el mismo lote, el agrupamiento real puede ser mayor. Si se ocultan, la alerta pierde la mitad de su valor.

---

## 2. Alcance

**Dentro:**

- **Hook `useBatchAlerts(query)`**, el consumo de `ESAVI-DASH-010` con la clave `['dashboard', 'batchAlerts', query]`.
- **Bloque «Alertas por lote»** (`features/dashboard/BatchAlertsBlock.tsx`), dentro de la sección «Vigilancia», **justo después de los indicadores** y antes de la curva:
  - Cabecera:
    - «Lotes con alerta en su territorio»;
    - los umbrales aplicados («≥ 3 casos · ≥ 2 graves · cualquier defunción», con «desactivado» donde llegue `null`);
    - «N lotes evaluados · M casos sin lote registrado».
  - Una tarjeta por alerta:
    - la vacuna (con «Texto libre» si `coded: false`, y «Sin nombre» si `label: null`) y el lote;
    - los badges de motivo;
    - la línea de métricas: casos, sospechosos, graves, defunciones, establecimientos, unidades geográficas, y primera y última fecha;
    - «N vacunados con el lote caducado» si `expiredAtVaccination > 0`;
    - «Escrito de N formas» si `variants.length > 1`, con las variantes en un tooltip.
  - Se muestran las 5 primeras con «Ver las N alertas», que despliega el resto de las recibidas. Si `total > alerts.length`, «y N alertas más no mostradas».
  - **Colores:** `DEATH` como badge `--destructive`; `MIN_CASES`, `MIN_SERIOUS` y el lote caducado como `--warning`. Es la única excepción del dominio al color neutro del FE35.
  - **Enlace a los casos** (`USER+`): `/esavi-cases?batchNumber=…&vaccineKey=…&reportDateFrom=…&reportDateTo=…`, con `batchNumber` y `vaccineKey` tal como llegan, y las fechas de `data.period`. Para `ANALYTICS`, la tarjeta no es pulsable.
- **Variante `warning` del `<Badge>`** de `shared/components/ui/badge.tsx`, calcada de `destructive` sobre el token `--warning`.
- **Filtro por lote en la pestaña «Por caso»** del listado:
  - `esaviCaseFiltersSchema` gana `batchNumber` y `vaccineKey`, con 16 y 17 claves.
  - Un campo de texto «Lote» en `EsaviCaseFilters`, que escribe `batchNumber` con `useDebouncedSearchParam`.
  - `vaccineKey` no tiene control: llega desde la alerta y se ve como el chip «Solo la vacuna de la alerta», que se puede quitar.
  - Vaciar el lote quita también `vaccineKey`, y una URL con `vaccineKey` sin `batchNumber` lo descarta antes de enviar.
  - Las dos claves cuentan en el contador de filtros activos y se borran con «Limpiar filtros».
- **Opción `clearKeysOnWrite`** en `useDebouncedSearchParam`, para que cambiar o vaciar el lote borre `vaccineKey` en la misma escritura.
- **Estados**: carga, error con reintentar, sin territorio, sin alertas (con los umbrales a la vista) y cambio de periodo con `keepPreviousData`.

**Fuera de alcance (otros specs):**

- **Cambiar los umbrales desde Inicio.** `ESAVI_DASHBOARD_BATCH_MIN_CASES` y `_MIN_SERIOUS` se editan en la pantalla de configuración del sistema, que ya existe.
- **Notificar o enviar correos** cuando aparece una alerta. El F68 solo informa.
- **Marcar una alerta como revisada o descartada.** No hay estado de alerta en el backend.
- **Un selector de vacuna para `vaccineKey`** en el listado. Ninguna ruta lista esas claves.
- **Corregir las variantes de un lote** desde la alerta. Es una edición de `notificationVaccine` en el expediente.
- **Ver agrupamientos nacionales** siendo un usuario restringido. Es el alcance de F49.
- **Ver más de las 50 alertas** que devuelve el backend.
- **Exportar las alertas.**

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay rutas nuevas.

| Pieza | Archivo | Guard |
|---|---|---|
| Hook de alertas | `features/dashboard/api.ts` (`useBatchAlerts`, ampliado) | — |
| Bloque «Alertas por lote» | `features/dashboard/BatchAlertsBlock.tsx` (nuevo) | Dentro de la sección «Vigilancia» (`ANALYTICS`) |
| Tarjeta de alerta | `features/dashboard/BatchAlertCard.tsx` (nuevo) | El enlace «Ver casos» solo se monta con `useCan(ROLE_LEVELS.USER)` |
| Sección «Vigilancia» | `features/dashboard/SurveillanceSection.tsx` (FE35, ampliada) | Monta el bloque entre los indicadores y la curva |
| Filtros del listado | `features/esaviCase/EsaviCaseFilters.tsx` y `schemas.ts` (ampliados) | Los que ya tiene la pestaña (`USER`) |
| Badge | `shared/components/ui/badge.tsx` (ampliado) | Gana la variante `warning` |
| Debounce a URL | `shared/hooks/useDebouncedSearchParam.ts` (ampliado) | Gana `clearKeysOnWrite` |

**El enlace va en un botón «Ver casos» dentro de la tarjeta, no en la tarjeta entera.** La tarjeta tiene un tooltip interactivo (las variantes), y un elemento interactivo dentro de un enlace no es accesible.

### 3.2 Endpoints consumidos

```
GET    /api/dashboard/batch-alerts     ESAVI-DASH-010    ANALYTICS   ?from&to&geoLocationId
GET    /api/esavi-cases                ESAVI-CASE-002A   USER        gana ?batchNumber&vaccineKey (SPEC F68 §3.5)
GET    /api/esavi-cases/admin          ESAVI-CASE-002B   ADMIN       gana ?batchNumber&vaccineKey; createResource elige 002A/002B como hoy
```

`010` usa la misma query de `useDashboardPeriod()` que `007`, `008` y `009`, y no usa el periodo anterior.

### 3.3 Tipos del contrato

No hay sincronización nueva para `010`: `DashboardBatchAlerts`, `DashboardBatchAlert` y `DashboardBatchAlertReason` ya llegan con el sync del FE34.

```ts
// contracts/dashboard.ts (F68 §3.3)
interface DashboardBatchAlert {
  vaccineKey: string; label: string | null; coded: boolean;
  batchNumber: string; variants: string[];            // normalized; up to 5 as written
  cases: number; suspectedCases: number; serious: number; deaths: number; expiredAtVaccination: number;
  firstReportDate: string; lastReportDate: string;    // YYYY-MM-DD
  facilities: number; geoUnits: number; expirationDates: string[];
  reasons: ('MIN_CASES' | 'MIN_SERIOUS' | 'DEATH')[];
}
interface DashboardBatchAlerts {
  period: DashboardPeriod;
  scope: { restricted: boolean; hasAssignments: boolean; geoLocationId: string | null };
  thresholds: { minCases: number | null; minSerious: number | null };   // null = disabled
  total: number; batchesEvaluated: number; casesWithoutBatch: number;
  alerts: DashboardBatchAlert[];                                         // ≤ 50, already ordered
}
```

`EsaviCaseListFilters` gana `batchNumber?: string` y `vaccineKey?: string` con `npm run contracts:sync`, si el backend ya los exporta (F68 §3.3). Si no, el paso 2 del plan lo dice, y el schema del cliente los declara igual, como hizo el FE34 con `statusCode`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Periodo y unidad | URL | Los de FE35 | Se leen con `useDashboardPeriod()` |
| Alertas | TanStack Query | `['dashboard', 'batchAlerts', query]` | `staleTime` 5 min, `keepPreviousData` |
| Lista desplegada («Ver las N alertas») | Componente | `useState` en `BatchAlertsBlock` | Efímero: vuelve a 5 al recargar o al cambiar de periodo |
| Enlace a los casos | Derivado | `batchNumber`, `vaccineKey` y `data.period.from`/`to` → `reportDateFrom`/`reportDateTo` | Se construye con `URLSearchParams`, nunca concatenando texto |
| Lote del listado | URL | `searchParams.batchNumber` | Lo escribe `useDebouncedSearchParam('batchNumber', { clearKeysOnWrite: ['vaccineKey'] })` |
| Vacuna del listado | URL | `searchParams.vaccineKey` | Solo llega por enlace; se borra con el chip, al cambiar o vaciar el lote, o con «Limpiar filtros» |
| Listado filtrado | TanStack Query | `['esaviCase', 'list', filters]` | Igual que hoy; `filters` incluye las dos claves |

- **«Ver las N alertas» no va en la URL.** Es una preferencia de lectura del momento, no una vista que valga la pena compartir. Por eso es estado de componente, como un acordeón.
- **Cambiar o vaciar el lote borra `vaccineKey` en la misma escritura.** La opción `clearKeysOnWrite` de `useDebouncedSearchParam` borra las claves dependientes dentro de la misma `URLSearchParams` que escribe el lote, así nunca existe una URL intermedia con `vaccineKey` sola.
- **Nada se invalida desde mutaciones**, igual que el resto de `['dashboard', …]`.

### 3.5 Formularios y validación

**Filtro del listado**, en `esaviCaseFiltersSchema`:

| Campo | Control | Regla |
|---|---|---|
| `batchNumber` | `<Input>` «Lote» con `useDebouncedSearchParam` | `z.string().trim().max(100)`. Se descarta (`.catch(undefined)`) si, al quitar todo lo que no es letra ni número, queda vacío, que es lo que el backend rechaza con 400 |
| `vaccineKey` | Chip «Solo la vacuna de la alerta», sin control de edición | `z.string().regex(/^(W:[0-9a-f-]{36}|T:.*)$/i)`, el `VACCINE_KEY_PATTERN` del F68. Se descarta si no hay `batchNumber` válido |

- **La regla de normalización** del cliente (quitar lo que no es alfanumérico y comprobar que algo queda) solo decide si se envía. **No** se reescribe el valor de la URL: la normalización real es la del backend.
- **Sin mínimo de caracteres.** Un lote puede ser corto (`A1`), y el backend no impone mínimo.
- **No choca con las reglas de F48.** El enlace usa el rango `reportDateFrom`/`reportDateTo`, nunca la fecha exacta.

### 3.6 Estados de la pantalla

**Bloque «Alertas por lote»:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga inicial | Skeleton: cabecera y 3 tarjetas | — |
| Cambio de periodo | Lo anterior con opacidad reducida y `aria-busy` | — |
| Error | Mensaje por `code` (`errors.network` o `dashboard.batchAlerts.error`) y «Reintentar» | `dashboard.batchAlerts.error` |
| Periodo inválido o 400 | Lo resuelve la sección del FE35 | `dashboard.period.invalidLink` (FE35) |
| Sin territorio | El aviso de la sección; el bloque no se dibuja | `dashboard.pendingWork.noAssignments` (FE34) |
| Sin alertas (`alerts` vacío) | «Ningún lote supera los umbrales en este periodo», con la línea de umbrales y los contadores | `dashboard.batchAlerts.empty` |
| `total > alerts.length` | «Y {{count}} alertas más no mostradas», al pie | `dashboard.batchAlerts.truncated` |
| Umbral `null` | «desactivado» en su lugar de la línea de umbrales | `dashboard.batchAlerts.thresholds.disabled` |

**Tarjeta:**

| Caso | Se muestra | Clave i18n |
|---|---|---|
| `DEATH` en `reasons` | `<Badge variant="destructive">` «Defunción», siempre el primero | `dashboard.batchAlerts.reason.DEATH` |
| `MIN_SERIOUS` / `MIN_CASES` | `<Badge variant="warning">` | `dashboard.batchAlerts.reason.{MIN_SERIOUS,MIN_CASES}` |
| `expiredAtVaccination > 0` | «{{count}} vacunados con el lote caducado», en `--warning` | `dashboard.batchAlerts.expired` |
| `variants.length > 1` | «Escrito de {{count}} formas», con las variantes en un tooltip | `dashboard.batchAlerts.variants` |
| `coded: false` | Badge «Texto libre» (del FE36b) | `dashboard.vaccines.uncoded` (FE36b) |
| `label: null` | «Sin nombre» (del FE36b) | `dashboard.vaccines.noLabel` (FE36b) |
| Rol `ANALYTICS` | Sin «Ver casos» | — |

**Pestaña «Por caso» del listado:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Llega desde una alerta | Campo «Lote» relleno, chip «Solo la vacuna de la alerta» y rango de fechas en sus campos | `esaviCase.filters.batchNumber`, `esaviCase.filters.vaccineKeyChip` |
| Sin resultados con lote | El vacío con filtros que ya existe, con «Limpiar filtros» | (sin cambios) |

### 3.7 Responsividad y accesibilidad

- **Tarjetas.**
  - Apiladas, una por fila, en todos los anchos. Es una lista de lectura, no una rejilla.
  - La línea de métricas usa `flex-wrap` y parte en varias líneas a 375 px sin scroll horizontal.
  - «Ver casos» es un botón con texto visible, de 44 px de alto como mínimo, alineado a la derecha desde `md` y a todo el ancho por debajo.
- **Badges.** El motivo va siempre en texto: el color refuerza, no sustituye. La variante `warning` nueva se calca de `destructive` (`bg-warning/10 text-warning`, con `dark:bg-warning/20`), y su contraste se comprueba en claro y en oscuro.
- **Tooltip de variantes.** Se abre con foco y con toque; es un `Tooltip` de shadcn con disparador accesible.
- **«Ver las N alertas»** lleva `aria-expanded` y mueve el foco a la sexta tarjeta al desplegar.
- **El bloque** es una `<section>` con `aria-labelledby`, y cada tarjeta un `<article>` cuyo título es «{{label}} · lote {{batchNumber}}».
- **Listado.** El chip «Solo la vacuna de la alerta» tiene un botón de quitar con `aria-label` por i18n. El campo «Lote» sigue el patrón de los demás filtros de texto de la pestaña.

### 3.8 Claves i18n nuevas

Todas van en `es`, `en` y `nl`.

| Clave | Uso |
|---|---|
| `dashboard.batchAlerts.title` | «Lotes con alerta en su territorio» |
| `dashboard.batchAlerts.error` | Error del bloque |
| `dashboard.batchAlerts.empty` | Sin alertas |
| `dashboard.batchAlerts.truncated` | «Y {{count}} alertas más no mostradas» (plural) |
| `dashboard.batchAlerts.showAll` / `dashboard.batchAlerts.showLess` | «Ver las {{count}} alertas» / «Ver menos» |
| `dashboard.batchAlerts.thresholds.{label,minCases,minSerious,death,disabled}` | Línea de umbrales |
| `dashboard.batchAlerts.evaluated` | «{{count}} lotes evaluados» (plural) |
| `dashboard.batchAlerts.withoutBatch` | «{{count}} casos sin lote registrado» (plural) |
| `dashboard.batchAlerts.reason.{DEATH,MIN_SERIOUS,MIN_CASES}` | Badges de motivo |
| `dashboard.batchAlerts.batch` | «Lote {{batchNumber}}» |
| `dashboard.batchAlerts.metrics.{cases,suspected,serious,deaths,facilities,geoUnits,dates}` | Línea de métricas |
| `dashboard.batchAlerts.expired` | «{{count}} vacunados con el lote caducado» (plural) |
| `dashboard.batchAlerts.variants` | «Escrito de {{count}} formas» |
| `dashboard.batchAlerts.viewCases` | «Ver casos» |
| `esaviCase.filters.batchNumber` | Etiqueta del campo «Lote» |
| `esaviCase.filters.vaccineKeyChip` | Chip «Solo la vacuna de la alerta» |
| `esaviCase.filters.removeVaccineKey` | `aria-label` del botón de quitar del chip |

---

## 4. Plan de implementación

Primero va lo que no tiene pantalla (las dos ampliaciones de primitivas, el schema y el hook de datos), después el filtro del listado y al final el bloque. Cada paso compila y se puede committear por separado. **Requisitos previos:** el FE35 implementado, por la sección «Vigilancia», y el FE34, por el `statusCode` del schema del listado.

1. **Opción del hook compartido.**
   - `useDebouncedSearchParam` gana `clearKeysOnWrite?: string[]`.
   - Cuando el timer escribe la clave (con valor o vacía), borra en la misma `URLSearchParams` las claves de esa lista.
   - Por defecto `[]`, así que las 9 pantallas que ya lo usan no cambian.

   *Verificación:*
   - los tests actuales del hook pasan sin cambios;
   - un test nuevo con `clearKeysOnWrite: ['vaccineKey']` y la URL `?batchNumber=A1&vaccineKey=W:…`: escribir otro lote produce `?batchNumber=B2` en una sola navegación, y vaciarlo produce una URL sin ninguna de las dos claves.

2. **Contrato y schema del listado.**
   - `npm run contracts:sync`, revisando si `EsaviCaseListFilters` gana `batchNumber`/`vaccineKey`; si no, se anota aquí.
   - `esaviCaseFiltersSchema` gana las dos claves con las reglas de §3.5, incluido el descarte de `vaccineKey` sin un `batchNumber` válido.

   *Verificación:* tests del schema para:
   - `batchNumber=AB-123` válido;
   - `batchNumber=--`, que se descarta;
   - `vaccineKey=W:<uuid>` con lote, que se conserva;
   - `vaccineKey` sin lote, que se descarta;
   - `vaccineKey=foo`, que se descarta;
   - el resto de los 15 filtros, que no cambian.

3. **Filtro por lote en la pestaña «Por caso».**
   - `EsaviCaseFilters` gana el campo «Lote» con `useDebouncedSearchParam('batchNumber', { clearKeysOnWrite: ['vaccineKey'] })`, y el chip «Solo la vacuna de la alerta» cuando hay `vaccineKey`.
   - Las dos claves entran en el contador de activos y en «Limpiar filtros».
   - Claves `esaviCase.filters.*` en los tres idiomas.

   *Verificación:*
   - `/esavi-cases?batchNumber=AB123&vaccineKey=W:<uuid>&reportDateFrom=…&reportDateTo=…` envía las cuatro a `002A` y muestra el campo, el chip y el rango;
   - quitar el chip deja el lote;
   - vaciar el lote quita las dos;
   - «Limpiar filtros» quita las dos;
   - recargar conserva la vista.

4. **Hook de alertas.** `useBatchAlerts(query)` en `features/dashboard/api.ts`, con la clave `['dashboard', 'batchAlerts', query]`, `staleTime` de 5 min y `keepPreviousData`. Cita `ESAVI-DASH-010` en un comentario.
   *Verificación:* un test con MSW comprueba que el hook desenvuelve el envelope, que cambiar de periodo no vacía `data` y que un 400 expone `status === 400`.

5. **Variante del badge y tarjeta de alerta.**
   - `badge.tsx` gana la variante `warning`, calcada de `destructive` sobre `--warning`. Es un cambio mínimo en un archivo generado por shadcn, con un comentario de por qué.
   - `BatchAlertCard.tsx` con:
     - vacuna, lote, badges de motivo (con `DEATH` primero) y la línea de métricas;
     - las marcas de caducado y de variantes, con su tooltip;
     - el botón «Ver casos», que solo se monta con `useCan(USER)` y cuyo enlace se construye con `URLSearchParams`.

   Antes de escribir JSX se cargan `ui-ux-pro-max` y `ui-styling`.
   *Verificación:*
   - un `<Badge variant="warning">` se renderiza con las clases del token `--warning`, y las variantes existentes no cambian;
   - con `reasons: ['MIN_CASES', 'DEATH']` el primer badge es «Defunción»;
   - con `expiredAtVaccination: 2` se ve la marca;
   - con una sola variante no hay marca;
   - con `ANALYTICS` no hay «Ver casos»;
   - con `USER`, el `href` contiene exactamente `batchNumber`, `vaccineKey`, `reportDateFrom` y `reportDateTo` con los valores de la respuesta, y un `T:` con espacios va bien codificado.

6. **Bloque y montaje.**
   - `BatchAlertsBlock.tsx` con la cabecera (título, umbrales y contadores), las 5 primeras tarjetas, «Ver las N alertas», el aviso de truncado y los estados de §3.6.
   - `SurveillanceSection` lo monta entre los indicadores y la curva.
   - Claves `dashboard.batchAlerts.*` en los tres idiomas.

   *Verificación:*
   - con 12 alertas se ven 5, y «Ver las 12 alertas» muestra 12 y mueve el foco a la sexta;
   - con `total: 60` y 50 alertas se ve «Y 10 alertas más no mostradas»;
   - con `thresholds.minSerious: null` la línea dice «desactivado» en su lugar;
   - sin alertas se ve el vacío con los umbrales;
   - con `ANALYTICS`, la sección hace cuatro peticiones con la misma query;
   - los tests de FE34 a FE36c siguen pasando.

7. **Revisión de interfaz.** Pasar `web-design-guidelines` sobre el bloque y el filtro, y probar a mano el tema oscuro (contraste de los badges), 375 px y los roles `ANALYTICS` y `USER`, siguiendo un enlace de alerta hasta el listado y comprobando que su `count` coincide con los casos de la alerta.
   *Verificación:* el bloque de cierre de §5 queda marcado.

---

## 5. Criterios de aceptación

**Superficie**

- [ ] `grep -rn "ESAVI-DASH-010" src/features/dashboard/api.ts` devuelve el comentario del hook.
- [ ] La query de `/batch-alerts` es idéntica a la de `/indicators` para la misma URL.
- [ ] Con `ANALYTICS`, el bloque se ve, y no hay ninguna petición a `/esavi-cases`.

**Bloque**

- [ ] El bloque está entre los indicadores y la curva.
- [ ] La cabecera dice «Lotes con alerta en su territorio» y muestra los umbrales aplicados, con «desactivado» donde llega `null`, más los lotes evaluados y los casos sin lote.
- [ ] Las alertas se muestran en el orden recibido: las 5 primeras, y el resto tras «Ver las N alertas».
- [ ] Con `total > alerts.length` se ve «Y N alertas más no mostradas».
- [ ] Sin alertas se ve «Ningún lote supera los umbrales en este periodo», junto con los umbrales.
- [ ] Un 500 de `ESAVI-DASH-010` muestra el error del bloque con «Reintentar», y deja visibles los indicadores, la curva y la barra de periodo.

**Tarjeta**

- [ ] `DEATH` se ve como `<Badge variant="destructive">` y siempre en primera posición. `MIN_SERIOUS` y `MIN_CASES` se ven como `<Badge variant="warning">`. El motivo siempre está en texto.
- [ ] `expiredAtVaccination > 0` muestra «N vacunados con el lote caducado», y con 0 no aparece.
- [ ] `variants.length > 1` muestra «Escrito de N formas», con las variantes en un tooltip accesible por teclado.
- [ ] `coded: false` lleva «Texto libre», y `label: null` se lee «Sin nombre».
- [ ] Con `USER` o más, «Ver casos» enlaza a `/esavi-cases` con `batchNumber`, `vaccineKey`, `reportDateFrom` y `reportDateTo` tal como llegan, codificados con `URLSearchParams`.
- [ ] Con `ANALYTICS` no hay «Ver casos», y nada en la tarjeta es un enlace.
- [ ] `grep -rnE "(text|bg|border)-(destructive|warning)|variant=\"(destructive|warning)\"" src/features/dashboard/` solo encuentra `BatchAlertCard.tsx` y `BatchAlertsBlock.tsx`. Ningún otro bloque del dominio usa color semántico.

**Filtro del listado**

- [ ] Llegar desde una alerta muestra el campo «Lote» relleno, el chip «Solo la vacuna de la alerta» y el rango de fechas, y `002A` recibe las cuatro claves.
- [ ] El `count` del listado al que lleva una alerta es igual a `cases` de esa alerta (comprobado a mano con la misma unidad y periodo).
- [ ] Quitar el chip deja `batchNumber` y quita `vaccineKey`.
- [ ] Cambiar o vaciar el lote quita `vaccineKey` en la misma navegación. Nunca existe una URL con `vaccineKey` sin `batchNumber`.
- [ ] `?vaccineKey=W:<uuid>` sin lote, o `?batchNumber=--`, no se envían y no producen 400.
- [ ] Las dos claves cuentan en el contador de filtros activos, se borran con «Limpiar filtros» y sobreviven a la recarga.

**Primitivas compartidas**

- [ ] `useDebouncedSearchParam` sin `clearKeysOnWrite` se comporta igual que antes: sus tests y los de las 9 pantallas que lo usan pasan sin cambios.
- [ ] `<Badge>` conserva sus variantes existentes sin cambios, y gana `warning`.

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`, con los badges legibles;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/dashboard/ src/features/esaviCase/EsaviCaseFilters.tsx`
      no devuelve resultados.
- [ ] **Por debajo de `md`.**
  - Las tarjetas se leen enteras, con la línea de métricas en varias líneas y «Ver casos» a todo el ancho.
  - El body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` (y con `ANALYTICS` si aplica) el menú no ofrece lo que
      la ruta rechaza, y un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders
      y `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en
      `useState` ni en un store, ningún filtro fuera de `searchParams`.
- [ ] `npm run i18n:check` sale en 0.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` no añade errores en los archivos tocados.
- [ ] `npm run check` sale en 0.

No aplica el ítem de la cola de refresh: el spec no toca la sesión.

---

## 6. Decisiones tomadas y descartadas

**Ubicación y color**

- **Sí:** el bloque justo después de los indicadores, antes de la curva. Es la única señal de Inicio que pide una acción concreta (investigar o retirar un lote), y al final de la sección quedaría debajo de cuatro gráficos.
- **Sí:** colores semánticos en los motivos: `--destructive` para `DEATH` y `--warning` para `MIN_CASES`, `MIN_SERIOUS` y el lote caducado. Es una excepción explícita al criterio del FE35, acotada a este bloque. Aquí el color sí juzga, porque marca urgencia, y el F68 pide para `DEATH` el énfasis más alto.
- **No:** extender los colores semánticos a otros bloques del dominio. Un criterio de §5 lo comprueba con `grep`.
- **Sí:** el motivo siempre en texto, con el color como refuerzo. El color no puede ser el único canal (CONVENTIONS §10.3).
- **Sí:** una variante `warning` en el `<Badge>` compartido, en vez de clases sueltas en la tarjeta. El badge solo tenía `destructive`, y una variante en la primitiva es lo que pide CONVENTIONS §10.4 (hallazgo al guardar este spec).

**Lista**

- **Sí:** una tarjeta por alerta, no una tabla. Cada alerta tiene hasta once datos más marcas condicionales. En una tabla serían columnas casi siempre vacías, y por debajo de `md` habría que colapsarlas igual.
- **Sí:** las 5 primeras y «Ver las N alertas». Con 50 tarjetas abiertas, el bloque empuja la curva fuera de la pantalla, y el backend ya las ordena por gravedad, así que las 5 primeras son las que importan.
- **Sí:** la lista desplegada como estado de componente, no en la URL. Es como un acordeón: una preferencia de lectura del momento, no una vista que se comparta.
- **Sí:** «Ver casos» como botón dentro de la tarjeta, no la tarjeta entera como enlace. La tarjeta tiene un tooltip interactivo, y un elemento interactivo dentro de un enlace no es accesible.
- **Sí:** mostrar la caducidad y las variantes en la tarjeta. Son las dos pistas de causa que el F68 calcula: un lote caducado explica el agrupamiento, y varias formas de escribirlo indican que puede ser mayor.

**Enlace y filtro del listado**

- **Sí:** el enlace con `reportDateFrom`/`reportDateTo` del periodo de la respuesta. Así el listado muestra los mismos casos que contó la alerta, no todos los históricos del lote.
- **Sí:** el enlace solo para `USER+`. `ANALYTICS` no puede abrir casos, y un enlace que lleva a un 403 es peor que no tenerlo.
- **Sí:** un campo «Lote» editable en los filtros. Buscar casos por lote es útil también sin una alerta, por ejemplo ante una retirada comunicada por el fabricante.
- **Sí:** `vaccineKey` sin control, como chip que se puede quitar. Ninguna ruta lista las claves `W:`/`T:`, y escribirlas a mano no tiene sentido.
- **No:** un selector de vacuna para `vaccineKey`. No hay de dónde sacar las opciones.
- **Sí:** cambiar o vaciar el lote quita `vaccineKey`. La vacuna pertenece al lote de la alerta: con otro lote ya no corresponde, y sin lote el backend responde 400.
- **Sí:** la normalización del cliente solo decide si se envía, sin reescribir la URL. La regla de verdad vive en el backend (F68 §2). Duplicarla para mostrar el valor normalizado sería tener dos reglas que pueden divergir.

**Hook compartido**

- **Sí:** ampliar `useDebouncedSearchParam` con `clearKeysOnWrite` en vez de escribir `vaccineKey` desde el componente. Dos escrituras separadas dejan una URL intermedia con `vaccineKey` sin lote, y dos escritores de la misma URL en un temporizador es justo el bug que ese hook resolvió.
- **Sí:** que la opción venga vacía por defecto. Las 9 pantallas que usan el hook no cambian.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El `count` del listado al que lleva una alerta no coincide con sus `cases` | La alerta y el filtro usan la misma normalización del backend (F68 §2) y el mismo periodo. Un criterio de §5 lo comprueba a mano. Si difieren, el fallo es del backend |
| `clearKeysOnWrite` rompe a alguna de las 9 pantallas que usan el hook | Viene vacía por defecto, y el paso 1 exige que los tests actuales del hook pasen sin cambios antes de seguir |
| Una `vaccineKey` `T:<texto>` con espacios o símbolos se rompe en el enlace | El enlace se construye con `URLSearchParams`, nunca concatenando texto. Un criterio de §5 lo prueba con un `T:` con espacios |
| El rojo de `DEATH` alarma en exceso en un periodo largo con una sola defunción | Es lo que pide el F68: una defunción siempre dispara la alerta. La tarjeta muestra el número exacto, y el color marca la prioridad, no la magnitud |
| El contraste de la variante `warning` nueva sobre `--card` no basta en el tema claro | Se calca del par fondo y texto de `destructive`, que ya pasa en los dos temas, y se comprueba en el paso 7. Si falla, se corrige el token `--warning`, no la tarjeta |
| Tocar `badge.tsx`, generado por shadcn, se pierde en una actualización de su CLI | El cambio es una sola entrada en `variants`, con un comentario de por qué. Es la misma excepción que ya tienen otros archivos de `ui/` |
| Un usuario restringido cree que no hay agrupamiento cuando sí lo hay a nivel nacional | El título dice «en su territorio» (F68 §8), así que lo que no ve está declarado como fuera de su alcance |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes | Después |
|---|---|---|
| `shared/hooks/useDebouncedSearchParam.ts` | Escribe solo su clave | Gana `clearKeysOnWrite?: string[]`, vacía por defecto |
| `shared/components/ui/badge.tsx` | Variantes sin `warning` | Gana `warning`; las existentes no cambian |
| `features/esaviCase/schemas.ts` | 15 claves en `esaviCaseFiltersSchema` (tras FE34) | 17: gana `batchNumber` y `vaccineKey` |
| `features/esaviCase/EsaviCaseFilters.tsx` | Sin filtro por lote | Campo «Lote» y chip «Solo la vacuna de la alerta», ambos en el contador y en «Limpiar filtros» |
| `features/dashboard/SurveillanceSection.tsx` | Indicadores, curva y distribuciones | El bloque de alertas entre indicadores y curva |

---

## Lo que **no** está en este spec

- Cambiar los umbrales desde Inicio.
- Notificar o enviar correos por una alerta.
- Marcar una alerta como revisada o descartada.
- Un selector de vacuna para `vaccineKey`.
- Corregir las variantes de un lote desde la alerta.
- Ver agrupamientos nacionales siendo un usuario restringido.
- Ver más de las 50 alertas.
- Exportar las alertas.

Cada uno de esos, si aterriza, va en su propio spec.

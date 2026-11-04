# SPEC FE36a — Inicio: curva epidemiológica

> **Estado:** Implementado
> **Depende de:** SPEC FE35 (sección «Vigilancia», `useDashboardPeriod`), SPEC FE34 (contrato `dashboard.ts`), SPEC F67 del backend (semana epidemiológica OPS y `ESAVI-DASH-008`), SPEC F66 del backend (universo y validador de periodo)
> **Fecha:** 2026-11-03
> **Objetivo:** Que la sección «Vigilancia» muestre la curva de casos por semana epidemiológica del periodo elegido, y dejar instalada la primitiva de gráficos y su paleta que heredan FE36b, FE36c y FE37.

---

## 1. Por qué existe este spec

**Los indicadores dicen cuántos, pero no cuándo.** El FE35 muestra el total de casos del periodo y su variación. Un total no distingue un periodo tranquilo de uno con un brote concentrado en dos semanas. Esa es la primera pregunta de un epidemiólogo, y se responde con la curva. El backend ya la calcula: es `ESAVI-DASH-008`, especificado en el SPEC F67, y este spec es su consumo.

**La curva tiene que hablar el idioma de los boletines.** El F67 agrupa por semana epidemiológica OPS (domingo a sábado) con etiqueta `YYYY-SENN`, donde el año es el epidemiológico. Las semanas de los extremos que el periodo cubre solo en parte llegan con `partial: true`. Si se dibujaran igual que las demás, parecería una caída de casos que no existe. El F67 §8 pide rotularlas, y este spec decide cómo.

**El repositorio no sabe dibujar un gráfico.** `package.json` solo trae `leaflet`. El FE35 resolvió sus categorías con barras CSS, pero una curva de hasta 53 semanas con tres series apiladas, ejes y tooltip no se puede hacer así. FE36b, FE36c y FE37 necesitan lo mismo. Si cada uno eligiera su forma de dibujar, habría tres maneras de hacer un tooltip. Por eso este spec, el primero que dibuja, instala la librería (Recharts) y su envoltorio (`chart` de shadcn) como primitiva de `shared/`.

**Los tokens de gráfico existen, pero son grises.** `src/index.css` define `--chart-1` a `--chart-5` con los valores por defecto de shadcn, cinco grises sin croma, y ningún componente los usa. Con tres series apiladas, dos quedarían indistinguibles, y en el tema oscuro peor. Este spec les da una paleta categórica validada en los dos temas, para que ningún gráfico necesite un color literal.

**Un gráfico no es accesible por sí solo.** Un lector de pantalla no recorre las barras, y quien quiere copiar las cifras de una semana tampoco puede hacerlo desde un SVG. La vista de tabla, con su estado en la URL, cubre los dos casos sin duplicar datos.

---

## 2. Alcance

**Dentro:**

- **Librería de gráficos.** `recharts` como dependencia, en una versión exacta compatible con React 19.
- **Primitiva de gráficos.** El componente `chart` de shadcn en `shared/components/ui/chart.tsx` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend` y `ChartLegendContent`), instalado con su CLI. Cada serie se ata a su token por configuración, sin colores en los componentes.
- **Paleta de gráficos.** Valores reales para `--chart-1` a `--chart-5` en `:root` y en el tema oscuro, sacados de la paleta categórica validada de la skill `dataviz`. Se comprueba el contraste contra `--card` y la distinción con daltonismo, en los dos temas.
- **Bloque «Curva epidemiológica»** (`features/dashboard/EpiCurveBlock.tsx`), el consumo de `ESAVI-DASH-008`:
  - barras apiladas por semana: graves, no graves y sin clasificar (`--chart-1…3`);
  - etiquetas `YYYY-SENN` en el eje, una de cada 4 si hay más de 26 semanas y una de cada 8 por debajo de `md`;
  - las semanas `partial` con opacidad reducida y la marca «semana incompleta» en el tooltip;
  - tooltip con las tres series, el total y las fechas de la semana (`weekStart` a `weekStart + 6`);
  - leyenda de las tres series.
- **Vista de tabla.** El botón «Ver como tabla» cambia el gráfico por una tabla de semana, graves, no graves, sin clasificar y total, con las semanas `partial` marcadas. El modo vive en la URL (`?epiView=table`).
- **Hook `useChartViewParam(key)`** en `features/dashboard/`. Lee y escribe un parámetro de vista (`table` o ausente) tocando una sola clave. La curva es su primer consumidor; FE36b y FE37 lo reutilizan para sus propios gráficos.
- **Estados**: carga, error con reintentar, periodo sin casos (ejes visibles y la línea del FE35), sin territorio (el aviso del FE34/FE35) y cambio de periodo con `keepPreviousData`.
- **Ubicación.** Dentro de la sección «Vigilancia» del FE35, debajo de los indicadores y con el mismo periodo (`useDashboardPeriod()`).

**Fuera de alcance (otros specs):**

- **Vacunas sospechosas, sexo y edad, y fallos programáticos** (`ESAVI-DASH-009`). → SPEC FE36b.
- **Distribución geográfica y mapa de círculos** (`ESAVI-DASH-009`, bloque `geography`). → SPEC FE36c.
- **Alertas por lote** (`ESAVI-DASH-010`). → SPEC FE37.
- **Curva por fecha de evento, por día, por mes o por semana ISO.** El F67 fijó `reportDate` y la semana OPS.
- **Canal endémico, umbrales de alerta o líneas de referencia** sobre la curva. Exigen histórico y un método estadístico propios (F67 §2).
- **Comparar la curva con el periodo anterior.** El `008` no lo devuelve.
- **Pulsar una semana para ver sus casos.** `ANALYTICS` no puede abrirlos, y el listado no filtra por semana epidemiológica.
- **Exportar la curva** a imagen o CSV.
- **Migrar a la primitiva las barras CSS del FE35.** Funcionan, y cambiarlas no es parte de este spec.

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay rutas nuevas. Todo vive en `/`, dentro de la sección «Vigilancia» del FE35, que ya exige `useCan(ROLE_LEVELS.ANALYTICS)`.

| Pieza | Archivo | Guard |
|---|---|---|
| Primitiva de gráficos | `shared/components/ui/chart.tsx` (nuevo, CLI de shadcn) | — |
| Hook de vista | `features/dashboard/useChartViewParam.ts` (nuevo) | — |
| Bloque «Curva epidemiológica» | `features/dashboard/EpiCurveBlock.tsx` (nuevo) | Dentro de la sección (`ANALYTICS`) |
| Vista de tabla de la curva | `features/dashboard/EpiCurveTable.tsx` (nuevo) | Ídem |
| Sección «Vigilancia» | `features/dashboard/SurveillanceSection.tsx` (FE35, ampliada) | Monta el bloque debajo de los indicadores |

`chart.tsx` sigue la excepción declarada de CONVENTIONS §4: conserva el kebab-case de shadcn porque lo genera su CLI.

### 3.2 Endpoints consumidos

```
GET    /api/dashboard/epi-curve    ESAVI-DASH-008    ANALYTICS    ?from&to&geoLocationId
```

Usa la misma `DashboardPeriodQuery` que `ESAVI-DASH-007` y la obtiene de `useDashboardPeriod()` (FE35), nunca parseando la URL por su cuenta. El `008` no usa el periodo anterior (F67 §3.5), así que no hay comparación.

### 3.3 Tipos del contrato

No hay sincronización nueva: `DashboardEpiCurve` y `DashboardEpiWeek` ya llegan a `contracts/dashboard.ts` con el sync del FE34.

```ts
// contracts/dashboard.ts (F67 §3.3)
interface DashboardEpiWeek {
  label: string;        // "2026-SE14", epidemiological year
  epiYear: number; epiWeek: number;
  weekStart: string;    // YYYY-MM-DD, a Sunday
  partial: boolean;
  serious: number; nonSerious: number; unclassified: number; total: number;
}
interface DashboardEpiCurve {
  period: DashboardPeriod;
  scope: { restricted: boolean; hasAssignments: boolean; geoLocationId: string | null };
  weeks: DashboardEpiWeek[];   // continuous, in order
}
```

El fin de cada semana se calcula en el cliente como `weekStart + 6` con date-fns, solo para mostrarlo. No hay ningún otro cálculo de semanas en el cliente: la lista, las etiquetas y `partial` vienen del servidor.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Periodo y unidad | URL | Los de FE35 (`range`, `from`, `to`, `geoLocationId`) | Se leen con `useDashboardPeriod()` |
| Vista de la curva | URL | `searchParams.epiView`, vía `useChartViewParam('epiView')` | `table` o ausente (gráfico). Cualquier otro valor se lee como gráfico, sin aviso |
| Curva | TanStack Query | `['dashboard', 'epiCurve', query]` | `staleTime` 5 min, `placeholderData: keepPreviousData`, igual que los indicadores |
| Semana bajo el puntero o el dedo | Recharts | estado interno del tooltip | Efímero, no sale del componente |
| Paleta | CSS | `--chart-1…3` | Ningún color en el componente; `ChartContainer` recibe `config` con `color: 'var(--chart-N)'` |

- **`useChartViewParam(key)`** devuelve `{ isTable, toggle }`. Escribe con `setSearchParams` funcional, borra la clave al volver al gráfico y no toca ninguna otra, así que cambiar de vista conserva el periodo. Es el único sitio que lee o escribe un parámetro de vista de gráfico.
- **Nada se invalida desde mutaciones**, igual que el resto de `['dashboard', …]`.
- **El cambio de periodo del FE35 no borra `epiView`.** El modo elegido sobrevive al cambiar de rango.

### 3.5 Formularios y validación

No hay formularios. La única entrada es `epiView`, que se lee con una comparación (`=== 'table'`) y no necesita schema.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga inicial | Skeleton con la altura del gráfico, sin ejes | — |
| Cambio de periodo | Gráfico o tabla anterior con opacidad reducida y `aria-busy` | — |
| Error | Mensaje por `code` (`errors.network` o `dashboard.epiCurve.error`) y «Reintentar» | `dashboard.epiCurve.error` |
| Periodo inválido o 400 | Lo resuelve la sección del FE35, con su aviso y el periodo por defecto | `dashboard.period.invalidLink` (FE35) |
| Sin territorio (`hasAssignments = false`) | El aviso de la sección; el bloque no se dibuja | `dashboard.pendingWork.noAssignments` (FE34) |
| Periodo sin casos (todas las semanas en 0) | Ejes con las semanas y una línea encima | `dashboard.indicators.noCasesInPeriod` (FE35) |
| Semana `partial` | Barras con opacidad reducida; el tooltip y la tabla marcan «semana incompleta» | `dashboard.epiCurve.partial` |

**Tooltip:** etiqueta de la semana, «Del {{start}} al {{end}}», las tres series con su valor, el total y, si corresponde, «semana incompleta: no comparable».

### 3.7 Responsividad y accesibilidad

- **Ancho.** `ChartContainer` ocupa el ancho de la tarjeta, con altura fija de 280 px en `md+` y 220 px por debajo.
- **Eje X.**
  - Hasta 26 semanas, todas las etiquetas.
  - Desde `md` con más de 26, una de cada 4.
  - Por debajo de `md`, una de cada 8.
- **Barra mínima.** Si una barra quedara por debajo de 4 px, el contenedor gana `min-width` y se activa el scroll horizontal **dentro de la tarjeta** (`overflow-x-auto`). El body no hace scroll horizontal a 375 px.
- **Táctil.** El tooltip se abre al tocar la barra.
- **Vista de tabla.**
  - `shared/components/ui/table.tsx`, dentro de un contenedor con `overflow-x-auto`.
  - Las semanas `partial` llevan su marca en texto, no solo visual.
  - No es `<ResourceTable>`: no hay paginación ni filas de entidad.
- **Accesibilidad.**
  - El gráfico lleva `role="img"` con un `aria-label` resumen: «Casos por semana epidemiológica, del {{from}} al {{to}}: {{total}} casos en {{weeks}} semanas».
  - El botón «Ver como tabla» / «Ver como gráfico» lleva texto visible y `aria-pressed`.
- **Paleta.** Las tres series se distinguen en claro, en oscuro y con daltonismo: lo comprueba el validador de la skill `dataviz`. Además, la leyenda y el tooltip las nombran en texto, así que el color nunca es el único canal.

### 3.8 Claves i18n nuevas

Todas van en `es`, `en` y `nl`.

| Clave | Uso |
|---|---|
| `dashboard.epiCurve.title` | «Curva epidemiológica» |
| `dashboard.epiCurve.subtitle` | «Casos por semana epidemiológica de reporte» |
| `dashboard.epiCurve.error` | Error del bloque |
| `dashboard.epiCurve.series.{serious,nonSerious,unclassified}` | Las tres series, en leyenda, tooltip y tabla |
| `dashboard.epiCurve.total` | «Total» |
| `dashboard.epiCurve.week` | Cabecera «Semana» de la tabla |
| `dashboard.epiCurve.weekRange` | «Del {{start}} al {{end}}» |
| `dashboard.epiCurve.partial` | «Semana incompleta: no comparable» |
| `dashboard.epiCurve.summary` | `aria-label` resumen del gráfico |
| `dashboard.charts.viewTable` / `dashboard.charts.viewChart` | Botón de cambio de vista, común a todos los gráficos del dominio |

---

## 4. Plan de implementación

Primero va la infraestructura (dependencia, paleta y primitiva), después el hook y al final el bloque. Cada paso compila y se puede committear por separado. **Requisito previo: el FE35 implementado**, porque de él salen la sección «Vigilancia» y `useDashboardPeriod()`.

1. **Primitiva de gráficos.**
   - `npx shadcn add chart` genera `shared/components/ui/chart.tsx` e instala `recharts`.
   - La versión queda fijada exacta en `package.json`: la que pida el CLI, compatible con React 19.
   - No se edita `chart.tsx` a mano, salvo lo imprescindible para el lint, anotado en un comentario.

   *Verificación:* `npm ls recharts` muestra una sola versión, sin `peer dep` sin resolver. `npx tsc --noEmit -p tsconfig.app.json` no añade errores en `chart.tsx`. Un test mínimo de la primitiva renderiza un `ChartContainer` con una serie y el `aria-label` que recibe.

2. **Paleta.**
   - Se cargan las skills `dataviz` y `ui-styling`.
   - `--chart-1…5` toman valores categóricos de la paleta validada, en `:root` y en el bloque `[data-theme='dark']` de `src/index.css`. Es el único bloque oscuro que existe: el modo `system` lo resuelve el script anti-parpadeo, que escribe `data-theme` en `<html>` (ARCHITECTURE §6.4).
   - El validador de la skill se ejecuta sobre los dos temas contra `--card`.

   *Verificación:* el validador pasa en claro y en oscuro, y su salida se pega en el PR. `grep -n "chart-[1-5]: oklch(0\.[0-9]* 0 0)" src/index.css` no devuelve resultados, o sea que ya no quedan grises.

3. **Hook de la curva.** `useEpiCurve(query)` en `features/dashboard/api.ts`, con la clave `['dashboard', 'epiCurve', query]`, `staleTime` de 5 min y `keepPreviousData`. Cita `ESAVI-DASH-008` en un comentario.
   *Verificación:* un test con MSW comprueba que el hook desenvuelve el envelope, que cambiar de periodo no vacía `data` y que un 400 expone `status === 400`.

4. **Hook de vista y vista de tabla.** `useChartViewParam(key)` en `features/dashboard/useChartViewParam.ts`, con su test: `toggle()` escribe `?x=table` y conserva otros parámetros, el segundo `toggle()` borra `x`, y un valor desconocido se lee como gráfico. Después, `EpiCurveTable.tsx` con semana, rango de fechas, las tres series y el total. Las semanas `partial` llevan la marca en texto. Va dentro de `overflow-x-auto`.
   *Verificación:* un test con 3 semanas, una de ellas `partial`, comprueba que la fila `partial` contiene «Semana incompleta: no comparable» y que los totales cuadran fila a fila.

5. **Bloque «Curva epidemiológica».** `EpiCurveBlock.tsx` con:
   - las barras apiladas y la configuración de series sobre `--chart-1…3`;
   - la cadencia de etiquetas de §3.7 y la opacidad de las semanas `partial`;
   - el tooltip y la leyenda;
   - el `aria-label` resumen;
   - el botón de vista sobre `useChartViewParam('epiView')`;
   - los estados de §3.6.

   Antes de escribir JSX se cargan `ui-ux-pro-max` y `ui-styling`.
   *Verificación:*
   - con `?epiView=table` se renderiza la tabla y el botón dice «Ver como gráfico»;
   - pulsarlo quita `epiView` y conserva `range`;
   - con todas las semanas en 0 se ve la línea de periodo sin casos;
   - un 500 muestra el error con «Reintentar» y deja visibles los indicadores.

6. **Montaje en la sección.** `SurveillanceSection.tsx` monta `<EpiCurveBlock>` debajo de `<IndicatorsBlock>`. Las claves de §3.8 van en los tres idiomas.
   *Verificación:* con `ANALYTICS`, la sección hace dos peticiones con la misma query, `/indicators` y `/epi-curve`. Cambiar el atajo de periodo vuelve a pedir las dos. Los tests de FE34 y FE35 siguen pasando.

7. **Revisión de interfaz.** Pasar `web-design-guidelines` sobre el bloque, y probar a mano el tema oscuro, 375 px con 53 semanas (`?range=365d`) y `ANALYTICS`.
   *Verificación:* el bloque de cierre de §5 queda marcado.

---

## 5. Criterios de aceptación

**Infraestructura**

- [ ] `recharts` aparece en `package.json` con versión exacta, y `npm ls recharts` no muestra conflictos de `peer`.
- [ ] `shared/components/ui/chart.tsx` existe, y ninguna otra parte de `src/` importa `recharts` salvo ese archivo y los bloques de `features/dashboard/`.
- [ ] `--chart-1…5` tienen croma distinto de 0 en el tema claro y en el oscuro, y el validador de `dataviz` pasa en los dos.
- [ ] `grep -rnE "#[0-9a-fA-F]{3,6}|rgb\(|hsl\(|oklch\(" src/features/dashboard/EpiCurve*.tsx` no devuelve resultados.

**Superficie**

- [ ] `grep -rn "ESAVI-DASH-008" src/features/dashboard/api.ts` devuelve el comentario del hook.
- [ ] La petición a `/epi-curve` lleva exactamente la misma query que la de `/indicators` para la misma URL.
- [ ] Con `ANALYTICS`, el bloque se ve y no hay ninguna petición fuera de `/indicators`, `/epi-curve` y `/users/me`.

**Curva**

- [ ] Se dibuja una barra apilada por cada elemento de `weeks`, en el orden recibido, con las tres series en `--chart-1…3`.
- [ ] Las semanas `partial` se ven con opacidad reducida, y su tooltip incluye «semana incompleta: no comparable».
- [ ] El tooltip muestra la etiqueta `YYYY-SENN`, «Del … al …» (`weekStart` y `weekStart + 6`), las tres series y el total.
- [ ] Con `?range=365d` (53 semanas), el eje muestra una etiqueta de cada 4 en `md+` y una de cada 8 por debajo.
- [ ] La suma de `total` de todas las semanas que se ven es igual a `volume.total.current` del bloque de indicadores, comprobado con la misma fixture en ambos handlers de MSW.
- [ ] Con todas las semanas en 0, se ven los ejes y la línea «No hay casos reportados en este periodo».
- [ ] Un 500 de `ESAVI-DASH-008` muestra el error del bloque con «Reintentar» y deja visibles los indicadores y la barra de periodo.

**Vista de tabla**

- [ ] «Ver como tabla» escribe `?epiView=table` y conserva `range`, `from`, `to` y `geoLocationId`.
- [ ] Recargar con `?epiView=table` abre directamente la tabla.
- [ ] `?epiView=cualquierCosa` muestra el gráfico, sin aviso.
- [ ] La tabla marca las semanas `partial` con texto, no solo con estilo.
- [ ] Cambiar de periodo no quita `epiView`.
- [ ] `useChartViewParam` es el único sitio que lee o escribe `epiView`: `grep -rn "get('epiView')" src/features/dashboard` solo encuentra el hook.

**Accesibilidad**

- [ ] El gráfico tiene `role="img"` y un `aria-label` con el rango, el total y el número de semanas.
- [ ] El botón de vista tiene texto visible y `aria-pressed`.

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/dashboard/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.**
  - La curva mide 220 px de alto, con una etiqueta de cada 8 semanas.
  - Si hace falta scroll, ocurre dentro de la tarjeta; el body no hace scroll horizontal en 375px.
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

**División del FE36**

- **Sí:** partir el F67 en FE36a (curva), FE36b (vacunas, sexo y edad, y fallos programáticos) y FE36c (geografía). Son cinco visualizaciones sobre dos endpoints, más la elección de librería y un mapa. Juntos serían un spec que nadie revisa entero.
- **Sí:** que el FE36a, el primero que dibuja, sea el que instale la librería y la paleta. Si la elección viniera después de su primer consumidor, ese consumidor se escribiría dos veces.

**Librería y primitiva**

- **Sí:** Recharts. Es SVG declarativo en React, con ejes, tooltip y leyenda resueltos, y es la base del componente `chart` de shadcn/ui, que es nuestro stack. El SVG lee los tokens CSS, así que el tema oscuro funciona sin puente.
- **No:** SVG escrito a mano. Habría que escribir y probar ejes, cadencia de etiquetas, tooltip táctil y accesibilidad para cuatro specs.
- **No:** una librería canvas (ECharts o Chart.js). Aquí no hay volumen que justifique el canvas, y el canvas no lee las variables CSS sin traducirlas a mano en cada cambio de tema.
- **Sí:** el componente `chart` de shadcn como única primitiva de gráficos. Ata cada serie a su token por configuración, y FE36b, FE36c y FE37 la reutilizan sin copiarla (CONVENTIONS §10.4).
- **Sí:** solo `chart.tsx` y `features/dashboard/` importan `recharts`. Así un cambio de librería tiene una superficie acotada.

**Paleta**

- **Sí:** dar valores reales a `--chart-1…5`, validados con `dataviz` en los dos temas. Hoy son cinco grises, y ningún componente los usa todavía.
- **No:** reutilizar `--primary` y `--muted-foreground` para las series. Con tres series, dos quedan casi iguales, y se mezcla el significado de los tokens de interfaz con el de los datos.
- **No:** un color semántico para «graves», como `--destructive`. Mantiene el criterio del FE35: el color no juzga, y la serie se nombra en texto en la leyenda y el tooltip.

**Curva**

- **Sí:** barras apiladas por semana, con las tres series. La forma estándar de una curva epidemiológica son barras, y apilarlas muestra a la vez el total y la composición.
- **No:** solo una línea con el total. Esconde cuántos casos están todavía sin clasificar, que es justo lo que hace que la curva reciente cambie.
- **Sí:** las semanas `partial` con opacidad reducida y la marca en el tooltip y la tabla. Si se vieran igual que las demás, parecería una caída de casos que no existe (F67 §8).
- **Sí:** el cliente no calcula semanas. Lista, etiquetas y `partial` vienen del servidor, y solo se suma `weekStart + 6` para mostrar el rango. La semana OPS existe una sola vez, en el backend.
- **No:** pulsar una semana para ver sus casos. `ANALYTICS` no puede abrirlos, y el listado no filtra por semana epidemiológica.

**Tabla y estado**

- **Sí:** la vista de tabla como alternativa accesible y de datos, con su modo en la URL (`?epiView=table`). Así se comparte por enlace y sobrevive al recargar.
- **Sí:** el parámetro de vista se lee y escribe en un hook del dominio (`useChartViewParam`), no dentro del bloque. FE36b y FE37 necesitan lo mismo para sus gráficos, y las claves del botón van en `dashboard.charts.*`, comunes a todos (ajuste acordado al redactar el SPEC FE36b).
- **Sí:** un `epiView` desconocido se lee como gráfico, sin aviso. Es un parámetro de presentación: un valor raro no merece un mensaje.
- **No:** guardar el modo en `preferences`. Es una forma de mirar este dato ahora, no un ajuste de la cuenta.
- **No:** `<ResourceTable>` para la tabla. Esa primitiva es para filas de entidad paginadas en servidor; esto son, como mucho, 53 filas agregadas.

**Móvil**

- **Sí:** comprimir las barras sin scroll, con una etiqueta de cada 8 semanas, y scroll dentro de la tarjeta solo si la barra baja de 4 px. Un año entero cabe a 375 px, y el body nunca hace scroll horizontal (CONVENTIONS §10.2).

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| La versión de Recharts que instala el CLI de shadcn choca con React 19 | Se fija una versión exacta, y el paso 1 verifica `npm ls recharts` sin conflictos de `peer` antes de escribir ningún bloque. Si el CLI propone una versión incompatible, se elige a mano la primera compatible y se anota en el PR |
| `chart.tsx` generado no pasa el lint o el `tsc` estricto del repositorio | Se corrige lo mínimo con un comentario que diga por qué, igual que los otros archivos de `ui/` |
| Cambiar `--chart-1…5` altera algo existente | `grep -rn "chart-[1-5]" src` no encuentra consumidores hoy (comprobado el 2026-11-03) |
| La curva y los indicadores muestran totales distintos | El F67 garantiza que coinciden para la misma query (§2). Hay un criterio de §5 que lo comprueba con la misma fixture. Si difieren en producción, el fallo es del backend |
| Con 53 barras apiladas, el tooltip táctil tapa la barra que se toca | El tooltip de Recharts se ancla arriba del área del gráfico en móvil, no sobre el dedo. Se comprueba a mano en el paso 7 |
| Recharts suma peso al bundle de Inicio, que es la primera pantalla | Inicio ya monta la sección solo con `ANALYTICS+`. Si el bundle de `/` crece más de 100 kB gzip, el bloque se carga con `React.lazy`; se mide en el paso 7 |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes (tras FE35) | Después |
|---|---|---|
| `package.json` | Sin librería de gráficos | `recharts` con versión exacta |
| `src/index.css` | `--chart-1…5` en gris, sin uso | Paleta categórica validada, en claro y en oscuro |
| `shared/components/ui/` | Sin `chart.tsx` | `chart.tsx`, primitiva de gráficos para todo el repositorio |
| `features/dashboard/` | Sin hook de vista | `useChartViewParam`, para todos los gráficos del dominio |
| `features/dashboard/SurveillanceSection.tsx` | Barra de periodo e indicadores | Más la curva debajo |
| URL de `/` | `range`, `from`, `to`, `geoLocationId` | Más `epiView` |

Ninguna pantalla existente usa `--chart-*`, así que el cambio de paleta no altera nada ya construido.

---

## Lo que **no** está en este spec

- Vacunas sospechosas, sexo y edad, y fallos programáticos (SPEC FE36b).
- Distribución geográfica y mapa (SPEC FE36c).
- Alertas por lote (SPEC FE37).
- Curva por fecha de evento, por día, por mes o por semana ISO.
- Canal endémico, umbrales o líneas de referencia sobre la curva.
- Comparar la curva con el periodo anterior.
- Pulsar una semana para ver sus casos.
- Exportar la curva.
- Migrar a la primitiva las barras CSS del FE35.

Cada uno de esos, si aterriza, va en su propio spec.

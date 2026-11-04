# SPEC FE36b — Inicio: vacunas, sexo y edad, y fallos programáticos

> **Estado:** Implementado
> **Depende de:** SPEC FE36a (primitiva `chart.tsx`, paleta `--chart-*`, `useChartViewParam`), SPEC FE35 (sección «Vigilancia», `useDashboardPeriod`), SPEC FE34 (contrato `dashboard.ts`), SPEC F67 del backend (`ESAVI-DASH-009`)
> **Fecha:** 2026-11-03
> **Objetivo:** Que la sección «Vigilancia» muestre, para el periodo elegido, con qué vacunas, en qué sexo y edad y con qué fallos programáticos se presentan los casos.

---

## 1. Por qué existe este spec

**La curva dice cuándo, pero no con qué ni a quién.** Ante un aumento de casos, la siguiente pregunta de un epidemiólogo es si se concentran en una vacuna, en un grupo de edad o detrás de errores de administración o de cadena de frío. El backend ya responde esas preguntas en una sola llamada: es `ESAVI-DASH-009`, especificado en el SPEC F67. Este spec consume tres de sus cuatro bloques. El cuarto, `geography`, lleva mapa y va en el FE36c.

**Cada bloque trae una trampa de lectura que el F67 deja a la interfaz.**
- *Vacunas:* pueden sumar más que el total de casos, porque un caso con dos vacunas sospechosas cuenta en las dos. Además, una parte llega como texto libre, sin codificar en WHODrug (`coded: false`). Si eso no se distingue, la deuda de codificación queda invisible.
- *Sexo y edad:* llegan como códigos (`LT_1Y`…`Y80_PLUS`, `FEMALE`…`NONE`), no como etiquetas. Hay además dos columnas de sexo, `UNKNOWN` y `NONE`, que no caben en una pirámide de dos lados.
- *Fallos programáticos:* una investigación sin registro de administración o de cadena de frío no cuenta como fallo. Si esas investigaciones entran en el denominador, el porcentaje se diluye, y un 0 parece «sin fallos» cuando en realidad «no se evaluó».

Este spec decide cómo se muestra cada uno, para que la implementación no lo improvise.

**La vista de tabla ya tiene su pieza.** El FE36a dejó `useChartViewParam(key)` y las claves `dashboard.charts.*` para la alternativa accesible de cualquier gráfico del dominio. Vacunas y pirámide la reutilizan con su propio parámetro, sin escribir otra lectura de la URL.

---

## 2. Alcance

**Dentro:**

- **Hook `useDistributions(query)`**, el consumo de `ESAVI-DASH-009` con la clave `['dashboard', 'distributions', query]`, que el FE36c reutiliza tal cual.
- **Bloque «Vacunas sospechosas»** (`VaccinesBlock.tsx`):
  - barras horizontales, una por vacuna, en el orden recibido, apiladas en graves y no graves (`--chart-1` y `--chart-2`);
  - `others` al final, separada visualmente, y oculta si vale 0;
  - las vacunas `coded: false` con el badge «Texto libre» y la etiqueta en cursiva; un `label: null` se muestra como «Sin nombre»;
  - al pie, los casos sin vacuna sospechosa y la nota de que un caso puede contar en varias vacunas;
  - vista de tabla con `useChartViewParam('vaccinesView')`.
- **Bloque «Sexo y edad»** (`SexAgeBlock.tsx`):
  - pirámide con femenino a la izquierda y masculino a la derecha, una fila por banda en el orden recibido;
  - la línea «sexo desconocido o sin dato: N», que suma `UNKNOWN` y `NONE`, con el desglose por banda en el tooltip;
  - etiquetas de bandas y sexos localizadas por código;
  - vista de tabla con `useChartViewParam('sexAgeView')`, con la matriz completa de 9×4.
- **Bloque «Fallos programáticos»** (`ProgrammaticBlock.tsx`):
  - dos tarjetas, administración y cadena de frío, cada una con «al menos uno» destacado arriba y sus seis indicadores debajo;
  - barras CSS de categoría, como en el FE35, con el conteo y el porcentaje en texto;
  - el porcentaje se calcula sobre las investigaciones **con registro** de ese grupo, y el denominador se muestra («sobre N investigaciones con registro»);
  - las investigaciones sin registro se informan aparte.
- **Disposición.** Debajo de la curva: vacunas y pirámide lado a lado desde `lg`, y las dos tarjetas de fallos debajo, también lado a lado. Por debajo de `lg`, todo apilado.
- **Estados**: carga, error con reintentar (uno para los tres bloques, porque comparten petición), periodo sin casos, sin territorio y cambio de periodo con `keepPreviousData`.

**Fuera de alcance (otros specs):**

- **Distribución geográfica y mapa** (bloque `geography` de `ESAVI-DASH-009`). → SPEC FE36c.
- **Alertas por lote** (`ESAVI-DASH-010`). → SPEC FE37.
- **Ver la lista completa de vacunas más allá del top 10.** El backend solo devuelve el top 10 más `others`.
- **Unir el texto libre con las vacunas codificadas por similitud.** El F67 lo descartó (§6).
- **Pulsar una vacuna, una banda o un fallo para ver sus casos.** `ANALYTICS` no puede abrirlos, y el listado no tiene esos filtros.
- **Desglosar `NONE` y `UNKNOWN` fuera del tooltip y la tabla.**
- **Bandas de edad configurables.** Son constantes del backend (F67 §6).
- **Notas de texto libre de las tablas de fallos** (`*Notes`, `*KeyFindings`).
- **Vista de tabla para los fallos programáticos.** Ya son texto.
- **Exportar las distribuciones.**

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay rutas nuevas. Todo vive en `/`, dentro de la sección «Vigilancia» (FE35), que exige `useCan(ROLE_LEVELS.ANALYTICS)`.

| Pieza | Archivo | Guard |
|---|---|---|
| Hook de distribuciones | `features/dashboard/api.ts` (`useDistributions`, ampliado) | — |
| Contenedor de las distribuciones | `features/dashboard/DistributionsSection.tsx` (nuevo) | Dentro de la sección (`ANALYTICS`) |
| Vacunas | `features/dashboard/VaccinesBlock.tsx` y `VaccinesTable.tsx` (nuevos) | Ídem |
| Sexo y edad | `features/dashboard/SexAgeBlock.tsx` y `SexAgeTable.tsx` (nuevos) | Ídem |
| Fallos programáticos | `features/dashboard/ProgrammaticBlock.tsx` (nuevo) | Ídem |

`DistributionsSection` hace la única llamada a `useDistributions` y reparte `vaccines`, `sexAge` y `programmatic` a los tres bloques. Así carga, error y reintento son uno solo. El FE36c le añadirá `geography`.

### 3.2 Endpoints consumidos

```
GET    /api/dashboard/distributions    ESAVI-DASH-009    ANALYTICS    ?from&to&geoLocationId
```

Usa la misma query de `useDashboardPeriod()` que `007` y `008`. El bloque `geography` de la respuesta llega igual, pero este spec no lo dibuja.

### 3.3 Tipos del contrato

No hay sincronización nueva. Los campos que este spec lee de `contracts/dashboard.ts` (F67 §3.3):

```ts
vaccines: {
  items: { key: string; label: string | null; coded: boolean; cases: number; serious: number }[];  // top 10
  others: { cases: number; serious: number };
  casesWithoutSuspectedVaccine: number;
};
sexAge: { bands: string[]; sexes: string[]; matrix: number[][] };   // 9 × 4, ordered like bands × sexes
programmatic: {
  investigatedCases: number;
  withoutAdministrationRecord: number;
  withoutColdChainRecord: number;
  administrationErrors: Record<'prescriptionError' | 'contaminatedVaccine' | 'abnormalVaccineConditions'
    | 'preparationError' | 'handlingError' | 'improperAdministration' | 'anyError', number>;
  coldChainFailures: Record<'rangeDeviation' | 'procedureNotFollowed' | 'vaccineNotUsable'
    | 'diluentNotUsable' | 'partiallyReconstitutedVaccine' | 'otherObjectPresent' | 'anyFailure', number>;
};
```

- **Índices de la matriz.** Se leen por la posición en `bands` y `sexes` que trae la propia respuesta, nunca con índices fijos en el cliente. El orden lo garantiza el F67, pero el cliente no lo asume.
- **Clave de las filas de vacuna.** `key` (`W:<uuid>` o `T:<texto>`) se usa como `key` de React. No se muestra.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Periodo y unidad | URL | Los de FE35 | Se leen con `useDashboardPeriod()` |
| Vista de vacunas | URL | `searchParams.vaccinesView`, vía `useChartViewParam` | `table` o ausente |
| Vista de sexo y edad | URL | `searchParams.sexAgeView`, vía `useChartViewParam` | `table` o ausente |
| Distribuciones | TanStack Query | `['dashboard', 'distributions', query]` | `staleTime` 5 min, `keepPreviousData`. Una sola petición para FE36b y FE36c |
| Porcentajes de fallos | Derivado | función pura `programmaticRate(count, investigated, withoutRecord)` | Se calcula en render, no se guarda |
| Total de sexo desconocido o sin dato | Derivado | suma de las columnas `UNKNOWN` y `NONE` | Ídem |
| Fila bajo el puntero | Recharts | estado interno del tooltip | Efímero |

- **Cada bloque tiene su propio parámetro.** Pasar vacunas a tabla no cambia la pirámide ni la curva.
- **`useChartViewParam` sigue siendo el único sitio** que lee o escribe un parámetro de vista (SPEC FE36a §3.4).
- **Nada se invalida desde mutaciones**, igual que el resto de `['dashboard', …]`.

### 3.5 Formularios y validación

No hay formularios. Las únicas entradas son los dos parámetros de vista, que resuelve `useChartViewParam`.

**Reglas de cálculo:**

- `nonSerious = cases − serious`, por fila de vacuna y en `others`.
- **Porcentaje de un fallo:** `count / (investigatedCases − withoutRecord)`, con `withoutRecord` el de su grupo. Con denominador 0, se muestra «sin investigaciones con registro» en lugar de un porcentaje.
- **Porcentajes de la pirámide:** no se muestran. Se usan conteos absolutos en las barras, el tooltip y la tabla.

### 3.6 Estados de la pantalla

**Comunes a los tres bloques**, porque comparten petición:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga inicial | Un skeleton por bloque con su forma: 6 barras, 9 filas y dos tarjetas | — |
| Cambio de periodo | Lo anterior con opacidad reducida y `aria-busy` | — |
| Error | Un solo mensaje por `code` (`errors.network` o `dashboard.distributions.error`) que ocupa el ancho de los tres bloques, con un único «Reintentar» | `dashboard.distributions.error` |
| Periodo inválido o 400 | Lo resuelve la sección del FE35 | `dashboard.period.invalidLink` (FE35) |
| Sin territorio | El aviso de la sección; los bloques no se dibujan | `dashboard.pendingWork.noAssignments` (FE34) |

**Propios de cada bloque:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Vacunas: `items` vacío y `others.cases = 0` | «No hay vacunas sospechosas registradas en este periodo», más la línea de casos sin vacuna sospechosa | `dashboard.vaccines.empty` |
| Vacunas: `others.cases = 0` con `items` | Se oculta la fila `others` | — |
| Vacunas: `label: null` | «Sin nombre», en cursiva | `dashboard.vaccines.noLabel` |
| Vacunas: `coded: false` | Badge «Texto libre» y la etiqueta en cursiva | `dashboard.vaccines.uncoded` |
| Pirámide: matriz toda en 0 | Ejes y bandas, y la línea de periodo sin casos | `dashboard.indicators.noCasesInPeriod` (FE35) |
| Pirámide: `UNKNOWN + NONE = 0` | Se oculta la línea de sexo desconocido o sin dato | — |
| Fallos: `investigatedCases = 0` | Las dos tarjetas con «ningún caso del periodo tiene investigación» y sin barras | `dashboard.programmatic.noInvestigations` |
| Fallos: denominador del grupo en 0 | La tarjeta muestra «sin investigaciones con registro» | `dashboard.programmatic.noRecords` |

**Tooltips:**

- **Vacuna:** nombre completo; «Texto libre, sin codificar en WHODrug» si corresponde; casos, graves y no graves.
- **Banda de la pirámide:** la banda, femenino, masculino, desconocido y sin dato, con sus cuatro valores.

### 3.7 Responsividad y accesibilidad

- **Vacunas.**
  - `BarChart` en `layout="vertical"` de Recharts, una fila por vacuna, con 32 px de alto por fila.
  - La etiqueta del eje Y mide 160 px en `md+` y 96 px por debajo, truncada con elipsis. El nombre completo va en el tooltip y en la tabla.
  - `others` va separada por un divisor.
- **Pirámide.**
  - `BarChart` en `layout="vertical"`, con femenino en valores negativos y el eje X **simétrico** (`[-max, max]`) para que los dos lados se comparen a la misma escala. Las marcas del eje y el tooltip muestran valores absolutos.
  - Las etiquetas de banda van en el eje Y, a la izquierda.
  - Alto: 9 filas de 28 px. A 375 px, cada lado queda en unos 140 px, que alcanza para leer la forma.
  - Femenino en `--chart-1` y masculino en `--chart-2`. La leyenda los nombra en texto, así que el color no es el único canal.
- **Fallos programáticos.** Las barras CSS del FE35, con el conteo y el porcentaje en texto, y la barra con `aria-hidden`.
- **Tablas.**
  - Van en `shared/components/ui/table.tsx` dentro de `overflow-x-auto`.
  - Vacunas: vacuna, «Codificada» (sí/no), casos y graves.
  - Sexo y edad: banda, `FEMALE`, `MALE`, `UNKNOWN`, `NONE` y total por banda.
- **Disposición.** Desde `lg`, vacunas y pirámide en 2 columnas, y debajo las dos tarjetas de fallos, también en 2. Por debajo de `lg`, todo en una columna. El body no hace scroll horizontal a 375 px.
- **Accesibilidad.**
  - Cada gráfico lleva `role="img"` y un `aria-label` resumen: «10 vacunas sospechosas, la más frecuente {{label}} con {{cases}} casos» y «{{total}} casos por sexo y edad».
  - El botón de vista usa `dashboard.charts.viewTable` / `viewChart` (FE36a), con texto visible y `aria-pressed`.

### 3.8 Claves i18n nuevas

Todas van en `es`, `en` y `nl`. El botón de vista reutiliza `dashboard.charts.*` del FE36a, sin claves nuevas.

| Clave | Uso |
|---|---|
| `dashboard.distributions.error` | Error común de los tres bloques |
| `dashboard.vaccines.title` | «Vacunas sospechosas» |
| `dashboard.vaccines.others` | «Otras vacunas» |
| `dashboard.vaccines.uncoded` | Badge «Texto libre» |
| `dashboard.vaccines.uncodedHint` | Tooltip «sin codificar en WHODrug» |
| `dashboard.vaccines.noLabel` | «Sin nombre» |
| `dashboard.vaccines.withoutSuspected` | «{{count}} casos sin vacuna sospechosa» (plural) |
| `dashboard.vaccines.multiNote` | «Un caso puede contar en varias vacunas» |
| `dashboard.vaccines.empty` | Bloque vacío |
| `dashboard.vaccines.summary` | `aria-label` resumen |
| `dashboard.vaccines.columns.{vaccine,coded,cases,serious}` | Cabeceras de la tabla |
| `dashboard.sexAge.title` | «Sexo y edad» |
| `dashboard.sexAge.band.{LT_1Y,Y1_17,Y18_24,Y25_49,Y50_59,Y60_69,Y70_79,Y80_PLUS,UNKNOWN}` | Las 9 bandas |
| `dashboard.sexAge.sex.{FEMALE,MALE,UNKNOWN,NONE}` | Los 4 sexos |
| `dashboard.sexAge.unknownOrNone` | «Sexo desconocido o sin dato: {{count}}» |
| `dashboard.sexAge.total` | Cabecera «Total» de la tabla |
| `dashboard.sexAge.summary` | `aria-label` resumen |
| `dashboard.programmatic.title` | «Fallos programáticos» |
| `dashboard.programmatic.administration.title` / `dashboard.programmatic.coldChain.title` | Títulos de las dos tarjetas |
| `dashboard.programmatic.administration.{prescriptionError,contaminatedVaccine,abnormalVaccineConditions,preparationError,handlingError,improperAdministration,anyError}` | Indicadores de administración |
| `dashboard.programmatic.coldChain.{rangeDeviation,procedureNotFollowed,vaccineNotUsable,diluentNotUsable,partiallyReconstitutedVaccine,otherObjectPresent,anyFailure}` | Indicadores de cadena de frío |
| `dashboard.programmatic.denominator` | «Sobre {{count}} investigaciones con registro» |
| `dashboard.programmatic.withoutRecord` | «{{count}} investigaciones sin registro» |
| `dashboard.programmatic.noInvestigations` | Sin investigaciones en el periodo |
| `dashboard.programmatic.noRecords` | Sin registros en el grupo |

---

## 4. Plan de implementación

Primero va el hook de datos y las funciones puras, después los bloques y al final el montaje. Cada paso compila y se puede committear por separado. **Requisito previo: el FE36a implementado**, porque de él salen `chart.tsx`, la paleta y `useChartViewParam`.

1. **Hook de distribuciones.** `useDistributions(query)` en `features/dashboard/api.ts`, con la clave `['dashboard', 'distributions', query]`, `staleTime` de 5 min y `keepPreviousData`. Cita `ESAVI-DASH-009` en un comentario.
   *Verificación:* un test con MSW comprueba que el hook desenvuelve el envelope, que cambiar de periodo no vacía `data` y que un 400 expone `status === 400`.

2. **Funciones puras.** `programmaticRate(count, investigated, withoutRecord)` devuelve un número o `null`, y una función que separa la matriz en femenino, masculino y desconocido más sin dato por banda, leyendo los índices de `bands` y `sexes`.
   *Verificación:* tests unitarios para:
   - denominador 0, que da `null`;
   - un caso normal;
   - una matriz con las columnas en otro orden que el habitual, donde la función sigue usando `sexes` y no posiciones fijas.

3. **Bloque «Fallos programáticos».** `ProgrammaticBlock.tsx` con las dos tarjetas, «al menos uno» arriba, los seis indicadores, el denominador visible, las investigaciones sin registro y los estados de §3.6. Barras CSS como en el FE35.
   *Verificación:* tests con MSW para:
   - `investigatedCases = 0`;
   - un grupo con denominador 0;
   - un caso normal, donde el porcentaje mostrado coincide con `count / (investigatedCases − withoutRecord)`.

4. **Bloque «Vacunas sospechosas».** `VaccinesBlock.tsx` y `VaccinesTable.tsx` con las barras horizontales apiladas, `others`, el badge «Texto libre», «Sin nombre», el pie, el tooltip y la vista de tabla (`useChartViewParam('vaccinesView')`). Antes de escribir JSX se cargan `ui-ux-pro-max`, `ui-styling` y `dataviz`.
   *Verificación:*
   - una vacuna `coded: false` muestra el badge;
   - `label: null` muestra «Sin nombre»;
   - con `others.cases = 0` no hay fila «Otras vacunas»;
   - la tabla lista las mismas filas con «Codificada: no» en la de texto libre.

5. **Bloque «Sexo y edad».** `SexAgeBlock.tsx` y `SexAgeTable.tsx` con la pirámide (eje simétrico y valores absolutos), la línea de desconocido o sin dato, el tooltip con los cuatro valores y la vista de tabla (`useChartViewParam('sexAgeView')`).
   *Verificación:*
   - con femenino 5 y masculino 3 en `Y25_49`, el tooltip muestra «5» y «3» (sin signo negativo) y el eje es simétrico;
   - con `UNKNOWN + NONE = 0` no hay línea de desconocido;
   - la tabla muestra la matriz de 9×4 con total por banda, y la suma de la tabla es igual a `volume.total.current` de la misma fixture.

6. **Contenedor y montaje.**
   - `DistributionsSection.tsx` hace la llamada, resuelve los estados comunes de §3.6 y reparte los datos a los tres bloques en la disposición de §3.7.
   - `SurveillanceSection` lo monta debajo de la curva.
   - Las claves de §3.8 van en los tres idiomas.

   *Verificación:*
   - con `ANALYTICS`, la sección hace tres peticiones (`/indicators`, `/epi-curve` y `/distributions`) con la misma query;
   - un 500 de `/distributions` muestra un solo error con un solo «Reintentar» y deja visibles los indicadores y la curva;
   - los tests de FE34, FE35 y FE36a siguen pasando.

7. **Revisión de interfaz.** Pasar `web-design-guidelines` sobre los tres bloques, y probar a mano el tema oscuro, 375 px y `ANALYTICS`, con una fixture que tenga vacunas de texto libre y nombres largos.
   *Verificación:* el bloque de cierre de §5 queda marcado.

---

## 5. Criterios de aceptación

**Superficie**

- [ ] `grep -rn "ESAVI-DASH-009" src/features/dashboard/api.ts` devuelve el comentario del hook.
- [ ] La sección hace **una sola** petición a `/distributions` por query, aunque haya tres bloques montados.
- [ ] La query de `/distributions` es idéntica a la de `/indicators` y `/epi-curve` para la misma URL.
- [ ] Con `ANALYTICS`, los tres bloques se ven, y no hay ninguna petición fuera de `/indicators`, `/epi-curve`, `/distributions` y `/users/me`.

**Vista de tabla**

- [ ] `useChartViewParam` es el único sitio que lee o escribe `epiView`, `vaccinesView` y `sexAgeView`. `grep -rnE "get\('(epiView|vaccinesView|sexAgeView)'\)" src/features/dashboard` solo encuentra el hook.
- [ ] Pasar vacunas a tabla no cambia la vista de la pirámide ni la de la curva.
- [ ] Cambiar de periodo no quita ninguno de los tres parámetros de vista.

**Vacunas**

- [ ] Se dibuja una barra por elemento de `items`, en el orden recibido, apilada en graves y no graves (`cases − serious`).
- [ ] La fila «Otras vacunas» aparece al final, separada, y solo si `others.cases > 0`.
- [ ] Una vacuna `coded: false` lleva el badge «Texto libre» y la etiqueta en cursiva. Un `label: null` se lee como «Sin nombre».
- [ ] El pie muestra los casos sin vacuna sospechosa y la nota «un caso puede contar en varias vacunas».
- [ ] Un nombre de más de 160 px se trunca en el eje y aparece completo en el tooltip y en la tabla.
- [ ] `?vaccinesView=table` muestra la tabla con vacuna, codificada, casos y graves.

**Sexo y edad**

- [ ] La pirámide tiene 9 filas en el orden de `bands`, femenino a la izquierda y masculino a la derecha.
- [ ] El eje es simétrico, y ni el eje ni el tooltip muestran valores negativos.
- [ ] Las bandas y los sexos se ven con sus etiquetas de `dashboard.sexAge.*`, nunca como código.
- [ ] La línea «sexo desconocido o sin dato» suma las columnas `UNKNOWN` y `NONE`, y solo aparece si es mayor que 0.
- [ ] La suma de la tabla de 9×4 es igual a `volume.total.current` del bloque de indicadores, con la misma fixture.
- [ ] Una matriz cuyas columnas llegan en otro orden se dibuja bien, porque los índices se leen de `sexes`.

**Fallos programáticos**

- [ ] Cada tarjeta muestra «al menos uno» arriba y sus seis indicadores debajo, con el conteo y el porcentaje en texto.
- [ ] El porcentaje es `count / (investigatedCases − withoutRecord)` del grupo, y el denominador se ve escrito.
- [ ] Las investigaciones sin registro se ven aparte, con su número.
- [ ] Con `investigatedCases = 0`, las dos tarjetas dicen «ningún caso del periodo tiene investigación». Con denominador 0 en un grupo, esa tarjeta dice «sin investigaciones con registro». En ninguno de los dos casos aparece `NaN` ni `0 %`.

**Errores**

- [ ] Un 500 de `ESAVI-DASH-009` muestra **un** mensaje con **un** «Reintentar», y deja visibles los indicadores, la curva y la barra de periodo.

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/dashboard/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.**
  - Los tres bloques se apilan, la pirámide se lee a 375 px y las etiquetas de vacuna se truncan en 96 px.
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

**Datos y peticiones**

- **Sí:** un contenedor (`DistributionsSection`) que hace la única llamada y reparte los datos a los bloques. El `009` devuelve los cuatro bloques juntos (F67 §6). Tres llamadas con la misma clave se deduplicarían, pero darían tres estados de error para un solo fallo.
- **Sí:** un solo mensaje de error y un solo «Reintentar» para los tres bloques. Comparten petición, y tres botones que hacen lo mismo confunden.
- **Sí:** la misma clave `['dashboard', 'distributions', query]` para el FE36c. La geografía llega en la misma respuesta, y pedirla otra vez no tiene sentido.
- **Sí:** los índices de la matriz se leen de `bands` y `sexes`, no de posiciones fijas. El F67 garantiza el orden, pero un cliente que no lo asume no se rompe si el orden cambia.

**Vacunas**

- **Sí:** barras horizontales apiladas en graves y no graves, con los mismos tokens que la curva. Los nombres de vacuna son largos, y en horizontal la etiqueta cabe. Que graves y no graves usen el mismo color en los dos gráficos hace que se lean igual.
- **Sí:** el badge «Texto libre» y la etiqueta en cursiva para `coded: false`. Hace visible la deuda de codificación WHODrug, que es justo para lo que el F67 separó esas filas (F67 §6).
- **Sí:** la nota «un caso puede contar en varias vacunas» al pie. Sin ella, alguien sumará las barras y creerá que hay más casos que en los indicadores.
- **Sí:** se oculta `others` cuando vale 0. Una fila vacía al final no aporta nada.
- **No:** unir en la interfaz el texto libre con las vacunas codificadas por similitud de nombre. El F67 lo descartó porque puede equivocarse en silencio, y hacerlo en el cliente sería peor.

**Sexo y edad**

- **Sí:** una pirámide de femenino y masculino con el eje simétrico. Es la forma que reconoce un epidemiólogo, y el eje simétrico evita que un lado parezca mayor solo por la escala.
- **Sí:** `UNKNOWN` y `NONE` en una línea aparte, con su desglose en el tooltip y en la tabla. No caben en una pirámide de dos lados, pero esconderlos haría que la pirámide no sume el total.
- **No:** barras apiladas con los cuatro sexos como series. Son más completas, pero ocultan la forma por edad, que es lo que se busca.
- **No:** un mapa de calor de 9×4. Se lee peor que la pirámide para la pregunta «¿en qué edad y en qué sexo se concentran?».
- **No:** porcentajes en la pirámide. Con pocos casos, un porcentaje exagera, y los conteos absolutos son los que cuadran con los indicadores.

**Fallos programáticos**

- **Sí:** el porcentaje sobre las investigaciones con registro del grupo, con el denominador escrito. Una investigación sin registro no se evaluó, y meterla en el denominador diluye el porcentaje (F67 §6: «un 0 no se confunda con "no se evaluó"»).
- **No:** el porcentaje sobre `investigatedCases` total, por la misma razón.
- **Sí:** barras CSS, como en el FE35, sin Recharts. Son categorías discretas con su valor en texto, y una librería no añade nada.
- **Sí:** «al menos uno» arriba, destacado. Es la cifra que responde «¿hubo fallos?» antes de entrar en el detalle.
- **No:** vista de tabla para los fallos. Ya están en texto, con conteo y porcentaje.

**Vista de tabla**

- **Sí:** reutilizar `useChartViewParam(key)` del FE36a, con un parámetro por gráfico. Quien pasa las vacunas a tabla para copiar cifras no quiere perder la pirámide.
- **Sí:** ajustar el FE36a, todavía en Borrador, para que naciera con el hook y las claves `dashboard.charts.*`, en vez de migrarlo desde aquí. No había nada implementado que migrar, y así este spec no arrastra una refactorización.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Recharts no dibuja bien la pirámide con valores negativos (etiquetas con signo, barras invertidas) | Femenino va en negativo solo dentro del dato del gráfico, y el `tickFormatter` y el contenido del tooltip muestran `Math.abs`. Hay un criterio de §5 que comprueba que no se ve ningún signo |
| Nombres de vacuna de texto libre muy largos o con mayúsculas raras (`upper(trim())` del backend) | El eje los trunca con elipsis, y el nombre completo va en el tooltip y en la tabla. No se cambian las mayúsculas: el texto se muestra como llega, que es lo que se registró |
| Un usuario suma las barras de vacunas y no le cuadra con el total | La nota «un caso puede contar en varias vacunas» va siempre al pie, también cuando no hay `others` |
| Las investigaciones sin registro son la mayoría y los porcentajes quedan sobre denominadores muy pequeños | El denominador va siempre escrito («sobre 3 investigaciones con registro»). Con un número tan bajo, el lector ve que el porcentaje no es representativo |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes (tras FE36a) | Después |
|---|---|---|
| `features/dashboard/SurveillanceSection.tsx` | Barra, indicadores y curva | Más `DistributionsSection` debajo de la curva |
| URL de `/` | `range`, `from`, `to`, `geoLocationId`, `epiView` | Más `vaccinesView` y `sexAgeView` |

`useChartViewParam`, `chart.tsx` y las claves `dashboard.charts.*` del FE36a se reutilizan sin cambios.

---

## Lo que **no** está en este spec

- Distribución geográfica y mapa (SPEC FE36c).
- Alertas por lote (SPEC FE37).
- Ver la lista completa de vacunas más allá del top 10.
- Unir el texto libre con las vacunas codificadas por similitud.
- Pulsar una vacuna, una banda o un fallo para ver sus casos.
- Bandas de edad configurables.
- Notas de texto libre de las tablas de fallos.
- Vista de tabla para los fallos programáticos.
- Exportar las distribuciones.

Cada uno de esos, si aterriza, va en su propio spec.

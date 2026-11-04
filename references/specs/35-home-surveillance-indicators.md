# SPEC FE35 — Inicio: periodo de vigilancia e indicadores

> **Estado:** Implementado
> **Depende de:** SPEC FE34 (marco de Inicio por bloques, contrato `dashboard.ts`, etiquetas de etapa), SPEC FE22 (cobertura geográfica del usuario), SPEC F66 del backend (indicadores de vigilancia y validador de periodo), SPEC F49 del backend (alcance geográfico)
> **Fecha:** 2026-11-03
> **Objetivo:** Que Inicio muestre los indicadores de vigilancia de un periodo elegido, comparados con el periodo anterior y acotados al territorio del usuario, y fijar el control de periodo que heredan FE36 y FE37.

---

## 1. Por qué existe este spec

**El FE34 dice qué hay que hacer, pero no cómo va la vigilancia.** El trabajo pendiente es una foto del momento. Un responsable de vigilancia necesita además los números de un periodo:
- cuántos casos se reportaron y cuántos fueron graves;
- cuántas defunciones hubo;
- si se notifica a tiempo y cuánto tarda en cerrarse un expediente;
- cómo se reparte la causalidad.

El backend ya los calcula: es `ESAVI-DASH-007`, especificado en el SPEC F66, y este spec es su consumo.

**`ANALYTICS` hoy entra a Inicio y no ve nada.** El `NavItem` de Inicio admite ese rol desde el FE01, pero hasta el F66 ninguna ruta de datos lo aceptaba. Esta es la primera: agregados sin `caseId` ni datos personales. Con el FE34 implementado, un analista seguiría viendo solo el saludo. Con el FE35 tiene su primer bloque.

**El periodo es de tres specs, no de uno.** El F66 definió un validador de periodo (`from`, `to`, `geoLocationId`) que reutilizan el F67 y el F68. Si el FE35 resolviera el periodo dentro de su bloque, el FE36 y el FE37 tendrían que copiarlo o moverlo. Por eso el control de periodo nace aquí como pieza propia de `features/dashboard/`, y su estado vive en los `searchParams` de `/`, que es donde lo leerán los otros dos.

**El selector geográfico no puede ser el mismo para todos los roles.** El F66 pide ofrecer solo las unidades de la cobertura del usuario. Las dos rutas de donde salen las unidades, `ESAVI-USERGEO-008` (cobertura) y `ESAVI-GEOLOC-002` (árbol), piden `USER`. Un `ANALYTICS` no alcanza ninguna de las dos. Este spec decide qué ve cada rol, en vez de dejar que la implementación lo descubra con un `403`.

**Un número sin su comparación no dice nada, y su color puede decir lo que no es.** El F66 devuelve cada indicador con su valor del periodo anterior y deja la variación a la interfaz. En vigilancia ESAVI, notificar más casos muchas veces significa vigilar mejor, no que la situación haya empeorado. La forma de mostrar la variación es una decisión de este spec, no un detalle de estilo.

---

## 2. Alcance

**Dentro:**

- **Control de periodo del dominio** (`features/dashboard/DashboardPeriodBar.tsx`), reutilizable por FE36 y FE37:
  - Atajos `7d`, `30d`, `90d` y `365d`, más «Personalizado» con dos `<DateField>`.
  - Estado en los `searchParams` de `/`: `range`, o `from` y `to`, más `geoLocationId`.
  - Un schema Zod (`dashboardPeriodSchema`) que valida la URL y el formulario con las reglas del F66: `from ≤ to`, `to` no futura, como mucho 366 días.
  - Un hook (`useDashboardPeriod`) que traduce la URL a la query del backend:
    - con atajo, solo `from`;
    - sin parámetros, nada;
    - con personalizado, `from` y `to`.
- **Selector geográfico según el rol**, dentro del mismo control:
  - `ANALYTICS`: sin selector, con el rótulo «Todo su territorio». Si la URL trae `geoLocationId` (lo escribe el mapa del FE36c al bajar de nivel), se envía igual, y la barra muestra «Unidad seleccionada» y el enlace «Ver todo mi territorio».
  - `USER` a `EVALUATOR`: un select de las unidades de su `coverage` (`ESAVI-USERGEO-008`), indentadas por nivel.
  - `ADMIN` y `SUPERADMIN`: `<GeoLocationPicker>` sobre el árbol completo.
- **Sección «Vigilancia»** en Inicio, gateada con `useCan(ROLE_LEVELS.ANALYTICS)`. Lleva el control de periodo y debajo los bloques que dependen de él; en el FE35, solo los indicadores.
- **Bloque «Indicadores»**, que consume `ESAVI-DASH-007`:
  - Fila de 4 KPIs: casos del periodo, % de graves sobre clasificados, defunciones y mediana de oportunidad. Cada uno con su variación contra el periodo anterior.
  - Cinco tarjetas de detalle: gravedad (8 criterios), defunciones y autopsias, oportunidad, cierre (mediana total y 4 etapas) y causalidad (A, B, C, D y «sin clasificar», más las subcategorías de A).
  - Barras horizontales con tokens, sin librería de gráficos.
  - Variación en color neutro, con «nuevo» de 0 a N y «sin cambios» de 0 a 0.
- **Las seis notas del F66 §8**:
  - la variación la calcula la interfaz;
  - una mediana `null` se muestra como «sin casos»;
  - `onTime: null` se muestra como «plazo no configurado»;
  - el aviso de sin territorio también aplica a `ANALYTICS`;
  - el bloque de cierre se rotula «casos cerrados en el periodo»;
  - «sin clasificación final» se distingue de «sin clasificar».
- **Periodo inválido en la URL o 400 del backend**: se vuelve a los 30 días por defecto, con un aviso en línea y sin pantalla de error.
- **Orden de Inicio**:
  - `USER` o más: saludo, «Trabajo pendiente» y «Vigilancia».
  - `ANALYTICS`: saludo y «Vigilancia».

**Fuera de alcance (otros specs):**

- **Curva epidemiológica y distribuciones** (`ESAVI-DASH-008`/`009`). → SPEC FE36, que además elige la librería de gráficos.
- **Alertas por lote** (`ESAVI-DASH-010`). → SPEC FE37.
- **Actividad reciente y del sistema** (`ESAVI-DASH-011`/`012`). → SPEC FE38.
- **Selector geográfico para `ANALYTICS`.** No tiene una ruta de donde sacar las unidades. Hace falta que el backend abra a `ANALYTICS` una lectura de cobertura propia, y eso es una dependencia del otro repositorio. Bajar de nivel sí le llega con el mapa del SPEC FE36c, que escribe `geoLocationId` desde filas que el servidor ya acotó.
- **Que los KPIs lleven al listado de casos.** `ANALYTICS` no puede abrir casos, y el listado no filtra por gravedad, defunción ni causalidad.
- **Elegir la fecha de anclaje** (`reportDate` frente a `eventDate`). El F66 lo fijó en `reportDate`.
- **Comparar con el año anterior o con varios periodos.**
- **Exportar los indicadores** (CSV, PDF).
- **Colores semánticos en la variación.**
- **Recordar el último periodo elegido en `preferences`.** El periodo vive en la URL.

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay rutas nuevas. Todo vive en `/`, y su `NavItem` (`minLevel: ANALYTICS`) no cambia.

| Pieza | Archivo | Guard |
|---|---|---|
| Inicio | `features/home/HomePage.tsx` (ampliada) | Ninguno, como hoy |
| Sección «Vigilancia» | `features/dashboard/SurveillanceSection.tsx` (nuevo) | `useCan(ROLE_LEVELS.ANALYTICS)` en `HomePage` |
| Control de periodo | `features/dashboard/DashboardPeriodBar.tsx` (nuevo) | Dentro de la sección |
| Selector geográfico | `features/dashboard/DashboardGeoFilter.tsx` (nuevo) | Ver tabla de abajo |
| Bloque «Indicadores» | `features/dashboard/IndicatorsBlock.tsx` (nuevo) | Dentro de la sección, que ya exige `ANALYTICS` |

**Qué selector geográfico ve cada rol:**

| Rol efectivo | Selector | Fuente de las unidades |
|---|---|---|
| `ANALYTICS` | Ninguno; rótulo «Todo su territorio», o «Unidad seleccionada» y «Ver todo mi territorio» si hay `geoLocationId` | — (el `geoLocationId` lo escribe el mapa del FE36c) |
| `USER` a `EVALUATOR` | `Select` con las unidades de `coverage`, indentadas por `level` | `useUserGeoCoverage(user.userId)` (`ESAVI-USERGEO-008`), que ya existe |
| `ADMIN`, `SUPERADMIN` | `<GeoLocationPicker>` | `ESAVI-GEOLOC-002`, por la propia primitiva |

La rama se decide con `useCan(ADMIN)` y `useCan(USER)`, nunca por el nombre del rol. Un `geoLocationId` de la URL que no está en `coverage` se descarta, con el mismo aviso que un periodo inválido (§3.6). Para `ANALYTICS`, el `geoLocationId` de la URL se envía tal cual: no hay cobertura con la que contrastarlo, y un id ajeno solo da ceros con 200 (F66 §6).

### 3.2 Endpoints consumidos

```
GET    /api/dashboard/indicators                    ESAVI-DASH-007     ANALYTICS   ?from&to&geoLocationId
GET    /api/user-geo-locations/user/:id/coverage    ESAVI-USERGEO-008  USER        unidades del selector (USER–EVALUATOR)
GET    /api/geo-locations                           ESAVI-GEOLOC-002   USER        árbol del selector (ADMIN+), vía <GeoLocationPicker>
GET    /api/users/me                                ESAVI-USER-007     USER        userId para la cobertura; ya en caché por HomePage
```

`ESAVI-USER-007` pide `USER`, pero Inicio ya lo llama para el saludo con cualquier sesión, y el FE34 lo dejó igual. El FE35 solo lee su `userId` en la rama `USER`–`EVALUATOR`.

### 3.3 Tipos del contrato

No hay sincronización nueva. `DashboardIndicators`, `DashboardPeriod`, `DashboardComparable` y `DashboardPeriodQuery` ya llegan a `contracts/dashboard.ts` con el sync del FE34 (SPEC FE34 §3.3). Se importan de ahí.

```ts
// contracts/dashboard.ts (F66 §3.3), the fields this spec reads
interface DashboardIndicators {
  period: DashboardPeriod; previousPeriod: DashboardPeriod;            // { from, to, days }
  scope: { restricted: boolean; hasAssignments: boolean; geoLocationId: string | null };
  volume: { total: DashboardComparable; byNotificationType: { SEVERE; NON_SEVERE; none } };
  severity: { classified; serious; unclassified; criteria: Record<8 keys, number> };
  deaths: { total: DashboardComparable; autopsyRequested: number; autopsyPerformed: number };
  timeliness: { withEventDate; withoutEventDate; medianDays: number | null; onTime: number | null; deadlineDays: number | null };
  closure: { closedCases; medianDaysToClose: number | null; stageMedianDays: Record<CaseWorkflowStage, number | null> };
  causality: { withFinalClassification; withoutFinalClassification; categories: Record<'A'|'B'|'C'|'D'|'UNCLASSIFIED', number>; aSubcategories: Record<4 keys, number> };
}
```

`UserGeoCoverage` ya está en `contracts/declared/userGeoLocation.ts`.

**Tipos propios del cliente** (en `features/dashboard/`, no en `contracts/`):

- `DashboardRange = '7d' | '30d' | '90d' | '365d'`;
- `DashboardPeriodParams`, el resultado de parsear la URL: `{ mode: 'default' | 'range' | 'custom'; range?; from?; to?; geoLocationId? }`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Periodo elegido | URL | `searchParams`: `range`, o bien `from` + `to` | Sin ninguno, se usa el default del backend. `from`/`to` mandan sobre `range` si llegan los dos |
| Unidad geográfica | URL | `searchParams.geoLocationId` | Se envía con todos los roles; con `USER`–`EVALUATOR` se descarta si no está en `coverage` |
| Query enviada | Derivado | `useDashboardPeriod()` → `DashboardPeriodQuery` | Con atajo, solo `from = hoy − N + 1` (date-fns, `YYYY-MM-DD`); sin parámetros, `{}` |
| Indicadores | TanStack Query | `['dashboard', 'indicators', query]` | `staleTime` 5 min; se usa `placeholderData: keepPreviousData` para que cambiar de periodo no vacíe la pantalla |
| Periodo mostrado | TanStack Query | `data.period` y `data.previousPeriod` | Lo que se ve sale del servidor, nunca de lo que calculó el cliente |
| Cobertura | TanStack Query | `['userGeoLocation', 'coverage', userId]` | Ya existe (`staleTime` 30 min); solo se activa en la rama `USER`–`EVALUATOR` |
| Fechas del personalizado mientras se escriben | React Hook Form | formulario de `DashboardPeriodBar` | Se escriben en la URL al aplicar, no en cada tecla |
| Aviso de periodo inválido | Derivado | `dashboardPeriodSchema` falló, o el error es un 400 | No es estado: se calcula en cada render |
| «Actualizar» en curso | TanStack Query | `isFetching` | El mismo patrón del FE34 |

- **El periodo no se recuerda en `preferences`.** Abrir Inicio sin parámetros muestra siempre los 30 días por defecto.
- **Al escribir en la URL se conservan los demás parámetros.** El control de periodo usa `setSearchParams` funcional sobre un `prev` nuevo y solo toca sus cuatro claves. Esas escrituras son inmediatas, no van en un temporizador, así que no aplica `useDebouncedSearchParam`.
- **Qué invalida qué.** Ninguna mutación invalida `['dashboard', …]`, igual que en el FE34.

### 3.5 Formularios y validación

**Control de periodo**: `features/dashboard/schemas.ts`, `dashboardPeriodSchema`.

| Campo | Control | Regla (F66 §3.5) |
|---|---|---|
| `range` | Grupo de botones (`md+`) o `Select` (móvil) | `z.enum(['7d','30d','90d','365d'])` |
| `from` | `<DateField>` | `YYYY-MM-DD`; obligatorio en «Personalizado» |
| `to` | `<DateField>` | `YYYY-MM-DD`; obligatorio en «Personalizado» |
| `geoLocationId` | Según el rol (§3.1) | `z.string().uuid()` |

`.superRefine()` con claves i18n propias, nunca literales:

- `from > to` → `dashboard.period.errors.fromAfterTo`, sobre `to`;
- `to` posterior a hoy → `dashboard.period.errors.futureTo`;
- más de 366 días → `dashboard.period.errors.tooLong`, con `{{maxDays}}`.

El mismo schema parsea la URL. Si falla, el periodo se descarta entero (`range`, `from` y `to`) y aplica el default. Un `geoLocationId` mal formado se descarta por separado.

**Errores del backend:** un `400` de `ESAVI-DASH-007` no se asigna a un campo. Se trata como periodo inválido (§3.6) y se reintenta sin periodo. El mensaje se elige por `status`, y el `code` se lee con `?.`, sin suponer que exista.

### 3.6 Estados de la pantalla

**Sección «Vigilancia»:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Periodo inválido (URL o 400) | Aviso en línea sobre la barra; se muestran los 30 días por defecto | `dashboard.period.invalidLink` |
| Sin territorio (`scope.hasAssignments = false`) | Aviso en lugar de los indicadores, también para `ANALYTICS` | `dashboard.pendingWork.noAssignments` (FE34) |
| `ANALYTICS` | Rótulo en lugar del selector geográfico | `dashboard.period.wholeTerritory` |

**Bloque «Indicadores»:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga inicial | Skeleton: 4 KPIs y 5 tarjetas | — |
| Cambio de periodo | Los datos anteriores con opacidad reducida y `aria-busy`, mientras llega la respuesta | — |
| Error (no 400) | Mensaje por `code` (`errors.network` o `dashboard.indicators.error`) y «Reintentar» | `dashboard.indicators.error` |
| Periodo sin casos (`volume.total.current = 0`) | Una línea arriba, y las tarjetas en 0 con «sin casos» en las medianas | `dashboard.indicators.noCasesInPeriod` |
| Mediana `null` | «Sin casos» en lugar del número | `dashboard.indicators.noData` |
| `onTime: null` | «Plazo no configurado» | `dashboard.indicators.timeliness.noDeadline` |
| % de graves sin clasificados | «Sin casos clasificados», en lugar de un porcentaje con denominador 0 | `dashboard.indicators.severity.noClassified` |

**Cómo se muestra la variación:**

| Caso | Se muestra |
|---|---|
| `previous > 0` | Flecha y porcentaje, en `muted-foreground` |
| `previous = 0`, `current > 0` | «Nuevo», sin porcentaje |
| `previous = 0`, `current = 0` | «Sin cambios» |
| % de graves | La diferencia en puntos porcentuales («+3,2 pp»), no un porcentaje de un porcentaje |
| Mediana de oportunidad | Sin variación: el F66 la da solo para el periodo actual |

Un tooltip muestra el valor anterior con sus fechas, tomadas de `previousPeriod`. No hay ningún color semántico.

**Rótulos obligatorios:**

- la tarjeta de cierre dice «casos cerrados en el periodo»;
- la causalidad separa «sin clasificación final» (`withoutFinalClassification`) de «sin clasificar» (`UNCLASSIFIED`);
- las subcategorías de A llevan una nota: «un caso puede contar en varias».

### 3.7 Responsividad y accesibilidad

- **Barra de periodo.**
  - Desde `md`: los atajos como grupo de botones (`role="radiogroup"`, con flechas del teclado) y el selector geográfico a su derecha.
  - Por debajo de `md`: un `Select` con los atajos y «Personalizado», y el selector geográfico en una segunda línea.
  - En los dos casos, «Personalizado» abre los dos `<DateField>` debajo, con su botón «Aplicar».
- **KPIs:** rejilla de 2×2 por debajo de `md` y 4 columnas desde `md`. Cada KPI tiene un nombre accesible que incluye el valor y la variación en texto.
- **Tarjetas de detalle:** apiladas por debajo de `lg` y en 2 columnas desde `lg`.
- **Barras horizontales:**
  - un `div` por fila con su etiqueta y su valor en texto; la barra es decorativa (`aria-hidden`);
  - escala relativa al máximo de la tarjeta;
  - color de `dataviz` sobre tokens, sin literales.
- Objetivos táctiles de 44 px. El body no hace scroll horizontal a 375 px.
- La sección es una `<section>` con `aria-labelledby` apuntando a su título.

### 3.8 Claves i18n nuevas

Todas van en `es`, `en` y `nl`.

| Clave | Uso |
|---|---|
| `dashboard.surveillance.title` | Título de la sección «Vigilancia» |
| `dashboard.period.label` | Etiqueta del control de periodo |
| `dashboard.period.range.{7d,30d,90d,365d}` | Los atajos |
| `dashboard.period.custom` | «Personalizado» |
| `dashboard.period.from` / `dashboard.period.to` | Etiquetas de las fechas |
| `dashboard.period.apply` | «Aplicar» |
| `dashboard.period.current` | «Del {{from}} al {{to}}» |
| `dashboard.period.previous` | «Periodo anterior: del {{from}} al {{to}}» |
| `dashboard.period.wholeTerritory` | Rótulo para `ANALYTICS` |
| `dashboard.period.selectedUnit` | «Unidad seleccionada» (`ANALYTICS` con `geoLocationId`) |
| `dashboard.period.wholeTerritoryLink` | Enlace «Ver todo mi territorio» |
| `dashboard.period.geo` | Etiqueta del selector geográfico |
| `dashboard.period.allCoverage` | Opción «Toda mi cobertura» del select |
| `dashboard.period.invalidLink` | Aviso de periodo inválido |
| `dashboard.period.errors.{fromAfterTo,futureTo,tooLong}` | Errores del formulario |
| `dashboard.indicators.title` | Título del bloque |
| `dashboard.indicators.error` | Error del bloque |
| `dashboard.indicators.noCasesInPeriod` | Periodo sin casos |
| `dashboard.indicators.noData` | Mediana `null` |
| `dashboard.indicators.change.{new,none,up,down,pp}` | Textos de la variación |
| `dashboard.indicators.kpi.{cases,seriousPct,deaths,timelinessMedian}` | Los 4 KPIs |
| `dashboard.indicators.volume.{SEVERE,NON_SEVERE,none}` | Desglose por tipo de notificación |
| `dashboard.indicators.severity.{title,noClassified,classified,unclassified}` | Tarjeta de gravedad |
| `dashboard.indicators.severity.criteria.{death,disability,congenitalAnomaly,fetalDeath,lifeThreatening,hospitalization,abortion,otherCondition}` | Los 8 criterios |
| `dashboard.indicators.deaths.{title,autopsyRequested,autopsyPerformed}` | Tarjeta de defunciones |
| `dashboard.indicators.timeliness.{title,onTime,withoutEventDate,noDeadline,deadline}` | Tarjeta de oportunidad |
| `dashboard.indicators.closure.{title,closedCases,median}` | Tarjeta de cierre («casos cerrados en el periodo») |
| `dashboard.indicators.causality.{title,withoutFinalClassification,UNCLASSIFIED,A,B,C,D}` | Tarjeta de causalidad |
| `dashboard.indicators.causality.aSub.{vaccineProduct,qualityDeviation,programmaticError,stress,note}` | Subcategorías de A |
| `dashboard.indicators.days` | «{{count}} días» (plural, con decimales) |

---

## 4. Plan de implementación

Primero va lo que no tiene pantalla (schema y hooks), después el control de periodo y al final el bloque. Cada paso compila y se puede committear por separado. **Requisito previo: el FE34 implementado**, porque de él salen `contracts/dashboard.ts`, `features/dashboard/` y las etiquetas `caseWorkflow.stage.*`.

1. **Schema y parseo del periodo.**
   - `features/dashboard/schemas.ts` con `dashboardPeriodSchema` (§3.5) y sus claves `dashboard.period.errors.*`.
   - Una función pura `parseDashboardPeriod(searchParams, today)` que devuelve `DashboardPeriodParams`, indicando si el periodo y el `geoLocationId` se descartaron.

   *Verificación:* tests unitarios para:
   - `?range=30d` y personalizado válido;
   - `from` y `to` con `range` a la vez, donde mandan las fechas;
   - `from > to`, `to` futura, 367 días y `range=999d`, que se descartan con aviso;
   - `geoLocationId` mal formado, que se descarta por separado;
   - sin parámetros, que da `mode: 'default'`.

2. **Hook de la query.** `useDashboardPeriod()` traduce la URL a `DashboardPeriodQuery`:
   - con atajo, solo `from`;
   - personalizado, `from` y `to`;
   - por defecto, `{}`;
   - `geoLocationId` incluido para todos los roles, salvo el descarte por `coverage` de `USER`–`EVALUATOR`.

   *Verificación:* con `today = 2026-11-03` y `?range=7d`, la query es `{ from: '2026-10-28' }`, sin `to`. Con `ANALYTICS` y `?geoLocationId=<uuid>`, la query lleva ese `geoLocationId`.

3. **Hook del indicador.** `useIndicators(query)` en `features/dashboard/api.ts`, con la clave `['dashboard', 'indicators', query]`, `staleTime` de 5 min y `placeholderData: keepPreviousData`. Cita `ESAVI-DASH-007` en un comentario.
   *Verificación:* un test con MSW comprueba que cambiar de periodo no vacía `data` mientras llega la respuesta nueva, y que un 400 expone `status === 400` sin lanzar.

4. **Selector geográfico.** `DashboardGeoFilter.tsx` con las tres ramas de §3.1, escribiendo `geoLocationId` en la URL. Un `geoLocationId` fuera de `coverage` se descarta con aviso.
   *Verificación:*
   - con `ANALYTICS` no se llama a `/coverage` ni a `/geo-locations` (MSW con `onUnhandledRequest: 'error'`) y se ve «Todo su territorio»; con `?geoLocationId=<uuid>` se ve «Unidad seleccionada», y «Ver todo mi territorio» quita el parámetro conservando el periodo;
   - con `INVESTIGATOR`, el select lista las unidades de `coverage`;
   - con `ADMIN` se monta `<GeoLocationPicker>`.

5. **Control de periodo.** `DashboardPeriodBar.tsx` con:
   - los atajos (grupo de botones en `md+` y `Select` en móvil);
   - «Personalizado» con dos `<DateField>`, React Hook Form y «Aplicar»;
   - el selector del paso 4;
   - el rango vigente («Del … al …»), tomado de la respuesta;
   - el aviso de enlace inválido.

   Las escrituras en la URL conservan los demás parámetros.
   *Verificación:*
   - elegir un atajo escribe `?range=` y borra `from` y `to`;
   - aplicar un personalizado escribe `from` y `to` y borra `range`;
   - un rango de 400 días no se aplica y muestra el error en el campo;
   - recargar conserva la vista.

6. **Bloque «Indicadores».** `IndicatorsBlock.tsx` con los 4 KPIs, las 5 tarjetas, las barras horizontales y la variación de §3.6. La variación es una función pura, `formatChange(current, previous)` y su variante en puntos porcentuales, con test propio. Antes de escribir JSX se cargan `ui-ux-pro-max`, `ui-styling` y `dataviz` (CONVENTIONS §10.6).
   *Verificación:*
   - tests de `formatChange` para 0→N, 0→0, N→M y el caso en puntos porcentuales;
   - tests con MSW para: periodo sin casos, mediana `null`, `onTime: null`, `classified = 0` y error con reintentar;
   - la tarjeta de cierre muestra «casos cerrados en el periodo»;
   - la causalidad muestra «sin clasificación final» y «sin clasificar» como dos filas distintas.

7. **Sección y marco de Inicio.**
   - `SurveillanceSection.tsx` compone la barra y el bloque, y trata el 400 como periodo inválido: borra el periodo de la URL y muestra el aviso.
   - `HomePage.tsx` la monta después de «Trabajo pendiente», con `useCan(ROLE_LEVELS.ANALYTICS)`.
   - Las claves i18n de §3.8 en los tres idiomas.

   *Verificación:*
   - con `ANALYTICS`, Inicio muestra el saludo y «Vigilancia», sin «Trabajo pendiente» y sin llamada a `/pending-work`;
   - con `USER`, muestra los dos en ese orden;
   - un 400 simulado deja la URL sin periodo, muestra el aviso y vuelve a pedir sin parámetros;
   - los tests del FE34 siguen pasando.

8. **Revisión de interfaz.** Pasar `web-design-guidelines` sobre la sección, y probar a mano el tema oscuro, 375 px y los roles `ANALYTICS`, `INVESTIGATOR` y `ADMIN`.
   *Verificación:* el bloque de cierre de §5 queda marcado.

---

## 5. Criterios de aceptación

**Superficie**

- [ ] `grep -rn "ESAVI-DASH-007" src/features/dashboard/api.ts` devuelve el comentario del hook.
- [ ] La única ruta nueva consumida es `GET /api/dashboard/indicators`. La cobertura y el árbol geográfico se piden con hooks y primitivas que ya existen (`useUserGeoCoverage` y `<GeoLocationPicker>`), sin clientes nuevos.
- [ ] `grep -rn "response.data.data\|from 'axios'" src/features/dashboard src/features/home` no devuelve resultados.

**Roles**

- [ ] Con `ANALYTICS`:
  - Inicio muestra el saludo y la sección «Vigilancia»;
  - no hay ninguna petición a `/pending-work`, `/coverage` ni `/geo-locations`;
  - en lugar del selector geográfico se ve «Todo su territorio».
- [ ] Con `ANALYTICS` y `?geoLocationId=<uuid>` en la URL, la petición a `/indicators` lleva ese `geoLocationId`, y la barra muestra «Unidad seleccionada» y «Ver todo mi territorio».
- [ ] Con `USER`, `NOTIFIER`, `INVESTIGATOR` y `EVALUATOR`, el selector lista exactamente las unidades de `coverage`, con «Toda mi cobertura» como primera opción.
- [ ] Con `ADMIN` y `SUPERADMIN`, el selector es `<GeoLocationPicker>`.
- [ ] Con `USER` o más, el orden es: saludo, «Trabajo pendiente», «Vigilancia».

**Periodo**

- [ ] Sin parámetros, la petición va sin `from`, `to` ni `geoLocationId`, y la barra muestra el rango de `data.period`.
- [ ] `?range=7d` envía solo `from` (hoy − 6) y nunca `to`.
- [ ] Un personalizado válido envía `from` y `to`. Si en la URL vienen las fechas y `range` a la vez, mandan las fechas.
- [ ] El formulario impide aplicar `from > to`, `to` futura y más de 366 días, cada uno con su mensaje en el campo.
- [ ] `?from=2030-01-01`, `?range=999d` y un rango de 400 días muestran el aviso de enlace inválido y los 30 días por defecto, sin pantalla de error.
- [ ] Un 400 simulado del backend produce el mismo aviso, deja la URL sin periodo y vuelve a pedir sin parámetros.
- [ ] Un `geoLocationId` que no está en `coverage` se descarta con el mismo aviso.
- [ ] Cambiar el periodo conserva en la URL cualquier otro parámetro, y recargar reproduce la misma vista.
- [ ] Cambiar el periodo no vacía los indicadores mientras llega la respuesta nueva.

**Indicadores**

- [ ] Los 4 KPIs muestran casos, % de graves sobre clasificados, defunciones y mediana de oportunidad.
- [ ] La variación sigue §3.6:
  - porcentaje en color neutro cuando `previous > 0`;
  - «nuevo» de 0 a N;
  - «sin cambios» de 0 a 0;
  - puntos porcentuales en el % de graves;
  - ninguna en la mediana de oportunidad.
- [ ] `grep -rnE "text-(success|destructive|warning)|bg-(success|destructive|warning)" src/features/dashboard/IndicatorsBlock.tsx` no devuelve resultados.
- [ ] Con `medianDays: null` se lee «sin casos», y con `onTime: null`, «plazo no configurado».
- [ ] Con `severity.classified.current = 0`, el KPI dice «sin casos clasificados» y no muestra `NaN` ni `0 %`.
- [ ] La tarjeta de cierre dice «casos cerrados en el periodo», y sus 4 etapas usan `caseWorkflow.stage.*`.
- [ ] La causalidad muestra «sin clasificación final» y «sin clasificar» como dos filas distintas, y la nota de que las subcategorías de A pueden sumar más que A.
- [ ] Con `volume.total.current = 0` y territorio asignado, se ve «No hay casos reportados en este periodo» con las tarjetas en 0.
- [ ] Con `scope.hasAssignments = false`, se ve el aviso de sin territorio también con `ANALYTICS`.
- [ ] Un 500 de `ESAVI-DASH-007` deja visibles el saludo, «Trabajo pendiente» y la barra de periodo, y muestra el error del bloque con «Reintentar».

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/dashboard/ src/features/home/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.**
  - Los KPIs van en 2×2, las tarjetas se apilan y la barra de periodo pasa a `Select`.
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

**Periodo**

- **Sí:** el periodo en los `searchParams` de `/`, como pieza propia de `features/dashboard/`. FE36 y FE37 consumen el mismo validador del backend (F66). Si el periodo viviera dentro del bloque de indicadores, habría que moverlo en el spec siguiente.
- **Sí:** `?range=30d` para los atajos y `?from=&to=` solo para el personalizado. Así, un enlace a «últimos 30 días» sigue siendo relativo al día en que se abre, que es lo que espera quien lo comparte.
- **No:** que los atajos escriban fechas explícitas en la URL. El enlace quedaría congelado, y «los últimos 30 días» de la semana pasada se leerían como los de hoy.
- **Sí:** con un atajo se envía solo `from`, y el backend completa `to` con su `current_date`. Si el cliente calculara `to` con su reloj, un desfase de un día con el servidor produciría un 400 por «`to` futura».
- **Sí:** sin parámetros no se envía nada. Así el valor por defecto existe en un solo sitio, el backend, y el cliente no lo duplica.
- **Sí:** el rango que se ve sale de `data.period`, no del cálculo del cliente. La pantalla muestra lo que de verdad se contó.
- **Sí:** un periodo inválido en la URL, o un 400, vuelve a los 30 días por defecto con un aviso en línea. Un enlace viejo o mal escrito no debe terminar en una pantalla de error.
- **No:** recordar el último periodo en `preferences`. El usuario abriría Inicio y vería un periodo que no recuerda haber elegido.
- **Sí:** `placeholderData: keepPreviousData`. Si cada cambio de periodo vaciara la pantalla, cada clic en un atajo sería un parpadeo.

**Selector geográfico**

- **Sí:** un selector distinto según el rol, porque las dos fuentes de unidades (`ESAVI-USERGEO-008` y `ESAVI-GEOLOC-002`) piden `USER`. Llamarlas como `ANALYTICS` es un 403 seguro.
- **Sí:** sin selector para `ANALYTICS`, con el rótulo «Todo su territorio». Es honesto con lo que la API permite hoy, y el analista ve igual todo lo que le corresponde.
- **No:** hacer que `ANALYTICS` escriba un `geoLocationId` a mano o con una lista fija. Sin cobertura no hay forma de ofrecer solo lo suyo, y el F66 lo pide expresamente.
- **Sí:** para `USER`–`EVALUATOR`, un select plano de `coverage`, indentado por nivel. La cobertura ya está expandida y en caché (`useUserGeoCoverage`), y es exactamente lo que el usuario puede ver.
- **Sí:** para `ADMIN`/`SUPERADMIN`, `<GeoLocationPicker>` sobre el árbol. Ven el país entero y su cobertura puede estar vacía.
- **Sí:** aceptar el `geoLocationId` de `ANALYTICS` sin contrastarlo. Lo escribe el mapa del FE36c desde filas que el servidor ya acotó al alcance, y un id ajeno escrito a mano solo da ceros (F66 §6). Ajuste acordado al redactar el SPEC FE36c; la primera versión de este spec lo ignoraba.
- **Sí:** descartar un `geoLocationId` que no está en `coverage`. El backend daría ceros con 200 (F66 §6), y el usuario creería que no hay casos.

**Indicadores**

- **Sí:** la variación en color neutro. En vigilancia ESAVI, más casos notificados suele significar mejor vigilancia. Pintarlo de rojo enseña a leerlo mal.
- **Sí:** «nuevo» de 0 a N, sin porcentaje. No existe un porcentaje correcto para ese caso, y por eso el F66 dejó la variación a la interfaz.
- **Sí:** el % de graves se compara en puntos porcentuales. «+50 %» sobre un 10 % confunde; «+5 pp» no.
- **Sí:** el denominador del % de graves son los clasificados. Es la decisión del F66, y los no clasificados se muestran aparte.
- **Sí:** la mediana de oportunidad va sin variación. El F66 la da solo para el periodo actual, y mostrarla con variación implicaría inventar el dato anterior.
- **Sí:** barras horizontales simples, sin librería de gráficos. Para categorías discretas con su valor en texto, la barra es la forma más legible. La librería se elige en el FE36, que la necesita para la curva y el mapa.
- **No:** que los KPIs enlacen al listado de casos. `ANALYTICS` no puede abrirlos, y el listado no filtra por gravedad, defunción ni causalidad.

**Estructura**

- **Sí:** la sección «Vigilancia» con su propia barra de periodo, debajo de «Trabajo pendiente». Una barra arriba de todo parecería filtrar también el trabajo pendiente, que es una foto sin periodo.
- **Sí:** un 400 del backend no se asigna a ningún campo. Llega por la URL, no por el formulario, y el formulario ya bloquea los mismos casos antes de enviar.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El reloj del navegador va un día por delante del servidor y un personalizado con `to = hoy` da 400 | El formulario solo bloquea las fechas posteriores al hoy del cliente. Si el backend responde 400 igual, se trata como periodo inválido: aviso y 30 días por defecto, sin pantalla de error. Los atajos no envían `to`, así que no tienen este problema |
| Un usuario con muchas unidades en su cobertura (una provincia con todos sus cantones y parroquias) recibe un select interminable | La cobertura ya está expandida y llega en una sola respuesta. Si supera ~50 opciones, el select se monta como `<SearchableSelect>`, la primitiva que ya existe, filtrando en memoria |
| `ANALYTICS` con asignación nacional ve el país sin un selector para bajar de nivel | Puede bajar desde el mapa del FE36c. El selector propio sigue siendo una dependencia del backend (§2) |
| Tres claves de URL (`range`, `from`, `to`) para un solo dato producen estados ambiguos | El schema define la precedencia: fechas sobre `range`, y si no hay ninguna, el default. Cada escritura desde la barra deja una sola forma en la URL (§4, paso 5) |
| FE36 y FE37 leen el periodo con otra interpretación | `useDashboardPeriod()` es la única puerta de lectura, y los specs siguientes la citan en lugar de parsear la URL |
| `keepPreviousData` muestra números del periodo anterior como si fueran del nuevo | Mientras llega la respuesta, el bloque va con opacidad reducida y `aria-busy`, y el rango de la barra sigue mostrando el de los datos visibles |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes (tras FE34) | Después |
|---|---|---|
| `features/home/HomePage.tsx` | Saludo y «Trabajo pendiente» (`USER+`) | Más la sección «Vigilancia» (`ANALYTICS+`) después |
| URL de `/` | Sin parámetros | Admite `range`, `from`, `to` y `geoLocationId` |
| `features/dashboard/` | `api.ts` con `usePendingWork` y `PendingWorkBlock` | Añade `useIndicators`, `schemas.ts`, `useDashboardPeriod`, la barra, el selector geográfico, la sección y el bloque |

`useUserGeoCoverage` y `<GeoLocationPicker>` se reutilizan sin tocarlos: no ganan props ni cambian de comportamiento.

---

## Lo que **no** está en este spec

- Curva epidemiológica y distribuciones, y la elección de librería de gráficos (SPEC FE36).
- Alertas por lote (SPEC FE37).
- Actividad reciente y del sistema (SPEC FE38).
- Selector geográfico para `ANALYTICS`. Depende de una ruta de cobertura abierta a ese rol en el backend.
- Que los KPIs enlacen al listado de casos.
- Anclar el periodo en `eventDate`.
- Comparar con el año anterior o con varios periodos.
- Exportar los indicadores.
- Colores semánticos en la variación.
- Recordar el último periodo elegido.

Cada uno de esos, si aterriza, va en su propio spec.

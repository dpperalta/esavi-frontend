# SPEC FE36c — Inicio: distribución geográfica

> **Estado:** Implementado
> **Depende de:** SPEC FE36b (`DistributionsSection`, `useDistributions`), SPEC FE36a (paleta `--chart-*`), SPEC FE35 (barra de periodo, `useDashboardPeriod`, `geoLocationId` en la URL para todos los roles), SPEC F67 del backend (bloque `geography` de `ESAVI-DASH-009`), SPEC F49 del backend (alcance geográfico)
> **Fecha:** 2026-11-03
> **Objetivo:** Que la sección «Vigilancia» muestre dónde se concentran los casos del periodo en un mapa de círculos y una tabla, y que pulsar una unidad baje de nivel para todo Inicio.

---

## 1. Por qué existe este spec

**Las distribuciones dicen con qué y a quién, pero no dónde.** Un aumento de casos que se concentra en un cantón es otra señal que uno repartido por el país, y es la última pregunta que el FE36b deja abierta. El backend ya la responde dentro de la misma llamada: es el bloque `geography` de `ESAVI-DASH-009`, especificado en el SPEC F67. Este spec lo dibuja sin pedir nada nuevo.

**Los polígonos no están al alcance de todos, y los puntos sí.** El F67 no devuelve polígonos y manda a pedirlos a `geoLocation`. Pero `ESAVI-GEOLOC-002` exige `USER`, así que un `ANALYTICS` no podría tener coropletas. Cada fila trae en cambio `latitude` y `longitude`. Un mapa de círculos proporcionales funciona para todos los roles, con los datos que ya llegan.

**El mapa es la forma natural de bajar de nivel.** `ANALYTICS` no tiene un selector de unidades: las dos rutas que las listan piden `USER`. Las filas de la geografía, en cambio, vienen del servidor y están siempre dentro del alcance del usuario (F67 §3.2). Pulsar una permite bajar de nivel a cualquier rol sin abrir ninguna ruta nueva. El SPEC FE35 ya acepta el `geoLocationId` de `ANALYTICS` para esto (ajuste acordado al redactar este spec).

**No todos los casos caben en el mapa.** El F67 añade dos filas sin coordenadas: `self` (casos en la propia unidad de referencia, no en un hijo) y `unlocated` (casos que no se pueden atribuir a ninguna fila). Además, una unidad puede no tener coordenadas cargadas. Sin la tabla, esos casos desaparecerían y el mapa no sumaría el total de los indicadores.

**La configuración del mapa no puede vivir dentro de un componente.** La URL de tiles y el centro por defecto están hoy dentro de `MapPointPicker.tsx`. Un segundo mapa que los copiara tendría dos lecturas de las mismas variables de entorno. Este spec las mueve a `shared/config/` para que las lean los dos.

---

## 2. Alcance

**Dentro:**

- **Configuración del mapa compartida.** `shared/config/map.ts` con `resolveTileUrl()`, el centro por defecto (`VITE_MAP_DEFAULT_CENTER`) y el texto de atribución de OpenStreetMap. `MapPointPicker` pasa a importarlos, sin cambiar su comportamiento.
- **Bloque «Distribución geográfica»** (`features/dashboard/GeoDistributionBlock.tsx`), dentro de `DistributionsSection` (FE36b), con los datos de `geography.rows` y la misma query, carga y error que los otros tres bloques.
- **Mapa** (`features/dashboard/GeoDistributionMap.tsx`), con Leaflet en modo imperativo, como `MapPointPicker`:
  - un círculo por fila `unit` con coordenadas, con el área proporcional a `total` (escala por raíz cuadrada) y relleno `--chart-1` translúcido;
  - tooltip con el nombre, el total y los graves;
  - encuadre con `fitBounds` sobre los círculos y, si no hay ninguno, el centro por defecto;
  - `scrollWheelZoom: false`.
- **Tabla** al lado (desde `lg`) o debajo del mapa:
  - unidad, total y graves, en el orden recibido;
  - filas `self` («En la propia unidad») y `unlocated` («Sin ubicación»), y las `unit` sin coordenadas;
  - la nota «N casos no se pueden ubicar en el mapa» cuando corresponde.
- **Bajar de nivel.**
  - Pulsar un círculo o una fila `unit` escribe `?geoLocationId=<id>` con una entrada nueva en el historial, así que «atrás» sube un nivel.
  - Todo Inicio se recalcula para esa unidad.
  - Un enlace «Ver todo mi territorio» quita el parámetro.
  - Funciona con **todos los roles**, `ANALYTICS` incluido. El FE35 ya envía su `geoLocationId` y muestra «Unidad seleccionada» en su barra.
- **Estados**: los comunes del FE36b, más «sin unidades» (`rows` vacío) y «ningún círculo con coordenadas».

**Fuera de alcance (otros specs):**

- **Coropletas o polígonos.** `ESAVI-GEOLOC-002` exige `USER` y el F67 no los devuelve.
- **Un selector de unidades para `ANALYTICS`.** Sigue sin haber una ruta de cobertura para ese rol. Bajar de nivel desde el mapa cubre la necesidad sin ella.
- **Subir un nivel con un botón** (al padre de la unidad elegida). La respuesta no trae el padre; «atrás» y «Ver todo mi territorio» lo cubren.
- **Ubicar los casos por la residencia del paciente.** El F67 usa el establecimiento (§6).
- **Colorear por porcentaje de graves o círculos concéntricos.**
- **Mapa de calor o agrupación de puntos** (clustering).
- **Alertas por lote** (`ESAVI-DASH-010`). → SPEC FE37.
- **Exportar el mapa o la tabla.**

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay rutas nuevas. Todo vive en `/`, dentro de la sección «Vigilancia» (FE35), que exige `useCan(ROLE_LEVELS.ANALYTICS)`.

| Pieza | Archivo | Guard |
|---|---|---|
| Configuración del mapa | `shared/config/map.ts` (nuevo) | — |
| Selector de punto | `shared/components/MapPointPicker.tsx` (retocado) | Pasa a importar la configuración, sin cambiar su comportamiento |
| Bloque «Distribución geográfica» | `features/dashboard/GeoDistributionBlock.tsx` (nuevo) | Dentro de `DistributionsSection` (FE36b) |
| Mapa | `features/dashboard/GeoDistributionMap.tsx` (nuevo) | Ídem |
| Tabla | `features/dashboard/GeoDistributionTable.tsx` (nuevo) | Ídem |

### 3.2 Endpoints consumidos

Ninguno nuevo. Los datos son `geography.rows` de la respuesta de `ESAVI-DASH-009`, que ya pide `DistributionsSection` (FE36b):

```
GET    /api/dashboard/distributions    ESAVI-DASH-009    ANALYTICS    ?from&to&geoLocationId
```

Los tiles salen de `VITE_MAP_TILE_URL`, que es un servidor de mapas, no la API, igual que en `MapPointPicker`.

### 3.3 Tipos del contrato

No hay sincronización nueva. El campo que lee este spec (F67 §3.3):

```ts
geography: { rows: DashboardGeoRow[] };
interface DashboardGeoRow {
  geoLocationId: string | null;          // null in self / unlocated
  kind: 'unit' | 'self' | 'unlocated';
  name: string | null;                   // null in self / unlocated
  latitude: number | null; longitude: number | null;
  total: number; serious: number;
}
```

`scope.geoLocationId` de la misma respuesta dice qué unidad es la de referencia. Solo trae el id, sin nombre.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Unidad de referencia | URL | `searchParams.geoLocationId` (FE35) | Se envía con todos los roles |
| Filas geográficas | TanStack Query | `['dashboard', 'distributions', query]` (FE36b) | Misma petición que vacunas, pirámide y fallos |
| Instancia de Leaflet | Componente | `useRef` | Se crea al montar y se destruye al desmontar, como en `MapPointPicker` |
| Capa de círculos | Componente | `useRef` a un `L.LayerGroup` | Se vacía y se vuelve a dibujar cuando cambian las filas, sin recrear el mapa |
| Escala de radios | Derivado | `radius = 4 + 24 × √(total / maxTotal)` px, solo con `total > 0` | Se calcula en cada dibujo |
| Filas sin coordenadas | Derivado | `kind !== 'unit'`, o `latitude`/`longitude` nulos | La nota suma sus `total` |

- **Bajar de nivel** escribe `geoLocationId` con `setSearchParams` funcional **sin `replace`**, así que crea una entrada en el historial. Solo toca esa clave: el periodo y los parámetros de vista se conservan.
- **«Ver todo mi territorio»** borra `geoLocationId` del mismo modo.
- **Nada del servidor se copia a `useState`.** El mapa se redibuja desde `data` en un efecto.

### 3.5 Formularios y validación

No hay formularios. El id que se escribe al bajar de nivel viene de una fila del servidor, así que no hay que validarlo. Si llegara a la URL un UUID mal formado, ya lo descarta el schema del FE35.

### 3.6 Estados de la pantalla

Los comunes (carga, error, periodo inválido, sin territorio) los resuelve `DistributionsSection` (FE36b). Los propios del bloque:

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| `rows` vacío | «No hay unidades para mostrar en este nivel», con «Ver todo mi territorio» si hay `geoLocationId` | `dashboard.geo.empty` |
| Ninguna fila `unit` con coordenadas | El mapa centrado en `VITE_MAP_DEFAULT_CENTER`, sin círculos, y la tabla completa | `dashboard.geo.noMappable` |
| Hay filas sin coordenadas | Debajo del mapa: «N casos no se pueden ubicar en el mapa» | `dashboard.geo.unmappedNote` |
| Fila `unit` con `total = 0` | En la tabla con 0; sin círculo | — |
| Fila `self` | «En la propia unidad» | `dashboard.geo.self` |
| Fila `unlocated` | «Sin ubicación» | `dashboard.geo.unlocated` |

**Tooltip del círculo:** nombre, «{{total}} casos», «{{serious}} graves».

### 3.7 Responsividad y accesibilidad

- **Disposición.**
  - Desde `lg`: el mapa a la izquierda (360 px de alto) y la tabla a la derecha, en dos columnas, debajo de los bloques del FE36b.
  - Por debajo de `lg`: el mapa (260 px) y la tabla debajo.
  - El body no hace scroll horizontal a 375 px.
- **Mapa.**
  - `L.circleMarker` con radio en píxeles, estable al hacer zoom.
  - El color va por clase CSS (`className` de Leaflet) con utilidades sobre el token: relleno `--chart-1` al 40 % y borde `--chart-1`. Los atributos de presentación de SVG no resuelven `var()`, así que el color nunca se pasa como `fillColor` en literal.
  - `scrollWheelZoom: false`, y zoom con los controles y con gestos.
  - `fitBounds` con un margen de 24 px sobre los círculos.
  - Los tiles son los de `VITE_MAP_TILE_URL` en los dos temas. En oscuro, el contenedor lleva borde `--border` para que el mapa claro no se funda con la tarjeta.
- **Tabla.**
  - `shared/components/ui/table.tsx` dentro de `overflow-x-auto`.
  - Las filas `unit` llevan el nombre como `<button>`, con un `aria-label` del tipo «Ver {{name}}», que baja de nivel. Las filas `self` y `unlocated` no son pulsables.
- **Accesibilidad.**
  - El mapa va en un `<figure>` cuyo `<figcaption>` (oculto con `sr-only`) es el resumen: «{{units}} unidades en el mapa; la de más casos, {{name}} con {{total}}». Sin círculos, el `<figcaption>` es visible y hace de aviso `dashboard.geo.noMappable`. *Ajuste del paso 5:* la redacción original pedía `role="img"` en el contenedor, pero Leaflet coloca dentro sus botones de zoom, que son enfocables, y los hijos de un `img` son presentacionales.
  - Los botones de zoom llevan títulos traducidos (`dashboard.geo.zoomIn` / `zoomOut`), no los de Leaflet en inglés.
  - Los círculos no reciben foco: el camino accesible para bajar de nivel es la tabla, que tiene los mismos datos y las mismas acciones.
  - «Ver todo mi territorio» es un enlace con texto visible.
- **Táctil.** Tocar un círculo abre su tooltip y un segundo toque baja de nivel, para no bajar por accidente al intentar leer.

### 3.8 Claves i18n nuevas

Todas van en `es`, `en` y `nl`. «Unidad seleccionada» y «Ver todo mi territorio» de la barra son del FE35 (`dashboard.period.selectedUnit` y `dashboard.period.wholeTerritoryLink`), y el estado vacío de este bloque reutiliza la segunda.

| Clave | Uso |
|---|---|
| `dashboard.geo.title` | «Distribución geográfica» |
| `dashboard.geo.subtitle` | «Por ubicación del establecimiento» |
| `dashboard.geo.columns.{unit,total,serious}` | Cabeceras de la tabla |
| `dashboard.geo.self` | «En la propia unidad» |
| `dashboard.geo.unlocated` | «Sin ubicación» |
| `dashboard.geo.unmappedNote` | «{{count}} casos no se pueden ubicar en el mapa» (plural) |
| `dashboard.geo.empty` | Sin unidades en este nivel |
| `dashboard.geo.noMappable` | Ninguna unidad con coordenadas |
| `dashboard.geo.drillDown` | `aria-label` «Ver {{name}}» |
| `dashboard.geo.tooltip.{cases,serious}` | Tooltip del círculo |
| `dashboard.geo.summary` | Resumen del mapa en su `<figcaption>` |
| `dashboard.geo.zoomIn`, `dashboard.geo.zoomOut` | Títulos de los botones de zoom (añadidas en el paso 5) |

La atribución de OpenStreetMap no va en i18n: es un texto legal de un tercero, como ya decide `MapPointPicker`.

---

## 4. Plan de implementación

Primero va la refactorización sin cambio de comportamiento y después el bloque. Cada paso compila y se puede committear por separado. **Requisito previo: el FE36b implementado**, porque de él salen `DistributionsSection` y `useDistributions`, y el FE35 con su aceptación del `geoLocationId` de `ANALYTICS`.

1. **Configuración del mapa.**
   - `shared/config/map.ts` con `resolveTileUrl()`, el centro por defecto y la atribución, movidos tal cual desde `MapPointPicker.tsx`, con sus avisos de variable ausente.
   - `MapPointPicker` pasa a importarlos.

   *Verificación:* los tests de `MapPointPicker` pasan sin cambios, y `grep -n "VITE_MAP_TILE_URL\|VITE_MAP_DEFAULT_CENTER" src -r` solo encuentra `shared/config/map.ts`.

2. **Tabla.** `GeoDistributionTable.tsx` con:
   - las filas en el orden recibido;
   - los nombres `unit` como botones que bajan de nivel;
   - `self` y `unlocated` con sus etiquetas y sin botón;
   - la nota de casos sin ubicar.

   *Verificación:*
   - con una fixture de 3 `unit` (una sin coordenadas), 1 `self` y 1 `unlocated`, la tabla tiene 5 filas y solo 3 botones;
   - la nota suma los `total` de la `unit` sin coordenadas, de `self` y de `unlocated`;
   - pulsar un botón escribe `geoLocationId` sin `replace`;
   - la suma de `total` es igual a `volume.total.current` de la misma fixture.

3. **Mapa.** `GeoDistributionMap.tsx` con:
   - Leaflet imperativo, con tiles y atribución de `shared/config/map.ts`;
   - una capa de círculos que se redibuja al cambiar las filas;
   - la escala por raíz cuadrada, el color por clase CSS sobre `--chart-1`, `fitBounds`, `scrollWheelZoom: false`;
   - el tooltip, y el doble toque táctil para bajar de nivel;
   - el `aria-label` resumen.

   Antes de escribir JSX se cargan `ui-ux-pro-max`, `ui-styling` y `dataviz`.
   *Verificación:*
   - un test con la fixture del paso 2 cuenta 2 círculos (las `unit` con coordenadas y `total > 0`);
   - la de mayor `total` tiene el radio máximo (28 px);
   - cambiar el periodo no recrea el mapa: el mismo nodo contenedor, solo cambian los círculos;
   - `grep -n "fillColor\|color:" src/features/dashboard/GeoDistributionMap.tsx` no encuentra colores literales.

4. **Bloque y montaje.** `GeoDistributionBlock.tsx` compone el mapa, la tabla y los estados de §3.6 en la disposición de §3.7. `DistributionsSection` lo monta debajo de los bloques del FE36b. Las claves de §3.8 van en los tres idiomas.
   *Verificación:*
   - con `ANALYTICS` sigue habiendo una sola petición a `/distributions`;
   - pulsar una unidad vuelve a pedir `/indicators`, `/epi-curve` y `/distributions` con el nuevo `geoLocationId`, y la barra del FE35 pasa a «Unidad seleccionada»;
   - «atrás» del navegador vuelve al nivel anterior con sus datos;
   - un 500 de `/distributions` muestra el error común del FE36b, no uno propio;
   - los tests de FE34, FE35, FE36a y FE36b siguen pasando.

5. **Revisión de interfaz.** Pasar `web-design-guidelines` sobre el bloque, y probar a mano el tema oscuro, 375 px, el doble toque táctil y los roles `ANALYTICS`, `INVESTIGATOR` y `ADMIN`, bajando dos niveles y volviendo con «atrás».
   *Verificación:* el bloque de cierre de §5 queda marcado.

---

## 5. Criterios de aceptación

**Configuración compartida**

- [ ] `VITE_MAP_TILE_URL` y `VITE_MAP_DEFAULT_CENTER` solo se leen en `shared/config/map.ts`.
- [ ] Los tests de `MapPointPicker` pasan sin cambios.

**Superficie**

- [ ] No hay ninguna petición nueva: con `ANALYTICS`, Inicio solo llama a `/indicators`, `/epi-curve`, `/distributions` y `/users/me`, además de los tiles del mapa.
- [ ] El bloque se dibuja con los datos de la misma respuesta de `/distributions` que usan vacunas, pirámide y fallos.

**Mapa**

- [ ] Hay un círculo por cada fila `unit` con `latitude`, `longitude` y `total > 0`, y ninguno más.
- [ ] El radio sigue `4 + 24 × √(total / maxTotal)` px: la fila con más casos mide 28 px.
- [ ] El color de los círculos sale de `--chart-1` por clase CSS, y `grep -nE "fillColor|color: '" src/features/dashboard/GeoDistributionMap.tsx` no devuelve resultados.
- [ ] El mapa encuadra los círculos al cargar y al cambiar de nivel. Sin círculos, se centra en `VITE_MAP_DEFAULT_CENTER`.
- [ ] La rueda del ratón sobre el mapa desplaza la página, no hace zoom.
- [ ] Cambiar de periodo redibuja los círculos sin recrear el mapa.
- [ ] El tooltip de un círculo muestra el nombre, los casos y los graves.

**Tabla**

- [ ] Hay una fila por cada elemento de `rows`, en el orden recibido.
- [ ] Las filas `unit` tienen su nombre como botón con `aria-label` «Ver {{name}}». `self` y `unlocated` se leen «En la propia unidad» y «Sin ubicación», y no son pulsables.
- [ ] La nota «N casos no se pueden ubicar en el mapa» suma `self`, `unlocated` y las `unit` sin coordenadas, y solo aparece si es mayor que 0.
- [ ] La suma de `total` de la tabla es igual a `volume.total.current` de los indicadores, con la misma fixture.

**Bajar de nivel**

- [ ] Pulsar el botón de una fila, o tocar dos veces un círculo, escribe `?geoLocationId=<id>` y conserva el periodo y los parámetros de vista.
- [ ] Bajar de nivel crea una entrada en el historial: «atrás» vuelve al nivel anterior con sus datos.
- [ ] Indicadores, curva y distribuciones se recalculan para la unidad elegida.
- [ ] «Ver todo mi territorio» quita `geoLocationId` y conserva el resto de parámetros.
- [ ] Un primer toque sobre un círculo solo abre el tooltip, sin bajar de nivel.
- [ ] Con `ANALYTICS`, bajar de nivel funciona igual que con los demás roles, y la barra del FE35 muestra «Unidad seleccionada».

**Estados**

- [ ] Con `rows` vacío se ve «No hay unidades para mostrar en este nivel», con «Ver todo mi territorio» si hay `geoLocationId`.
- [ ] Con filas pero ninguna con coordenadas, el mapa se ve sin círculos, con el aviso correspondiente y la tabla completa.
- [ ] Un 500 de `/distributions` muestra el único error común del FE36b. El bloque no tiene un error propio.

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/dashboard/ src/shared/config/map.ts`
      no devuelve resultados.
- [ ] **Por debajo de `lg`.**
  - El mapa mide 260 px de alto y la tabla va debajo.
  - El body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` (y con `ANALYTICS` si aplica) el menú no ofrece lo que
      la ruta rechaza, y un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders
      y `aria-label`; las claves de §3.8 están en los tres idiomas. La atribución de OpenStreetMap es la única excepción.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en
      `useState` ni en un store, ningún filtro fuera de `searchParams`.
- [ ] `npm run i18n:check` sale en 0.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` no añade errores en los archivos tocados.
- [ ] `npm run check` sale en 0.

No aplica el ítem de la cola de refresh: el spec no toca la sesión.

---

## 6. Decisiones tomadas y descartadas

**Mapa**

- **Sí:** círculos proporcionales sobre `latitude`/`longitude`, para todos los roles. Son los datos que ya llegan, y no hace falta ninguna ruta más.
- **No:** coropletas con polígonos. `ESAVI-GEOLOC-002` exige `USER`, así que `ANALYTICS` quedaría con otro mapa. Además, los polígonos de un país pesan, y el F67 los dejó fuera expresamente (§6).
- **Sí:** el área proporcional al total, con escala por raíz cuadrada, en un solo color. El ojo compara áreas, no radios: una escala lineal del radio exagera las unidades grandes. Un solo canal visual se lee sin leyenda.
- **No:** círculos concéntricos o intensidad por porcentaje de graves. Dos canales en un mapa pequeño cuestan más de leer que lo que aportan, y los graves ya están en la tabla y el tooltip.
- **Sí:** sin círculo para `total = 0`. Un punto de radio mínimo con 0 casos se lee como «hay algo». La fila sigue en la tabla.
- **Sí:** `L.circleMarker` con radio en píxeles. El tamaño codifica casos, no superficie: no debe cambiar al hacer zoom.
- **Sí:** el color por clase CSS sobre `--chart-1`. Los atributos de presentación de SVG no resuelven `var()`, y pasar un color literal rompería el tema y CONVENTIONS §10.1.
- **Sí:** `scrollWheelZoom: false`. Un mapa en mitad de Inicio que atrapa la rueda impide bajar por la página.
- **Sí:** los tiles claros también en el tema oscuro, con un borde `--border`. Un servidor de tiles oscuro es otra variable de entorno y otra dependencia, para un mapa que es complementario a la tabla.
- **Sí:** el mapa en `features/dashboard/`, no en `shared/`. Tiene un solo consumidor, y si aparece un segundo, se promueve entonces.

**Tabla y casos sin ubicar**

- **Sí:** la tabla siempre visible junto al mapa, sin parámetro de vista. A diferencia de los gráficos del FE36a y FE36b, aquí la tabla no es una alternativa: lleva datos que el mapa no puede mostrar (`self`, `unlocated` y unidades sin coordenadas) y es el camino accesible para bajar de nivel.
- **Sí:** la nota «N casos no se pueden ubicar en el mapa». Sin ella, alguien sumaría los círculos y no le cuadraría con los indicadores.

**Bajar de nivel**

- **Sí:** pulsar una unidad escribe `geoLocationId` y recalcula todo Inicio. Es el mismo parámetro del FE35, así que indicadores, curva y distribuciones quedan coherentes con lo que muestra el mapa.
- **Sí:** con una entrada nueva en el historial. «Atrás» sube un nivel sin necesidad de conocer el padre, que la respuesta no trae.
- **No:** un botón «subir un nivel». Necesita el id del padre, y ni el F67 ni la cobertura lo dan para todos los roles.
- **Sí:** bajar de nivel para `ANALYTICS`, con el FE35 ajustado (todavía en Borrador) para que acepte su `geoLocationId` en vez de migrarlo desde aquí. Las filas vienen del servidor y siempre están dentro del alcance (F67 §3.2). Un id ajeno escrito a mano solo daría ceros (F66 §6), sin revelar nada.
- **Sí:** «Unidad seleccionada» cuando no se conoce el nombre. Inventar o guardar el nombre en otra capa duplicaría un dato del servidor, y la respuesta no lo trae.
- **Sí:** en táctil, el primer toque abre el tooltip y el segundo baja de nivel. Sin eso, quien quiere leer un círculo pierde la vista en la que estaba.
- **Sí:** los círculos no reciben foco, y la tabla es el camino accesible. Leaflet no da un orden de foco útil entre marcadores; la tabla tiene los mismos datos y las mismas acciones, con botones de verdad.

**Configuración**

- **Sí:** extraer la configuración del mapa a `shared/config/map.ts`. Dos mapas no deben leer las mismas variables de entorno por dos caminos.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Mover la configuración rompe `MapPointPicker` en el wizard | El paso 1 no cambia valores y se committea solo. Los tests de `MapPointPicker` tienen que pasar sin modificarse |
| Leaflet en jsdom: los tests no pueden medir el mapa ni los tiles | Se prueba la lógica (cuántos círculos, qué radio, qué escribe un clic) contra la capa de Leaflet, no contra el render. El encuadre y los tiles se comprueban a mano en el paso 5 |
| Muchas unidades a nivel de parroquia saturan el mapa | Las filas son solo los hijos directos de la unidad de referencia, nunca el árbol entero. Si un nivel tiene cientos, la tabla sigue siendo la referencia, y la agrupación de puntos queda fuera (§2) |
| Coordenadas mal cargadas (0,0 o fuera del país) estiran `fitBounds` | Se dibujan tal como llegan: es un dato del catálogo, no del cliente. La tabla sigue correcta, y el error de coordenadas se corrige en la pantalla de geografía |
| El servidor público de OpenStreetMap limita el uso intensivo | Es el mismo riesgo y la misma variable (`VITE_MAP_TILE_URL`) que ya tiene `MapPointPicker`. Cambiar de servidor es configuración, no código |
| `ANALYTICS` comparte un enlace con `geoLocationId` a alguien que no alcanza esa unidad | El backend devuelve ceros con 200 (F66 §6), sin revelar nada. Es el comportamiento que el F66 eligió para este caso |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes | Después |
|---|---|---|
| `shared/components/MapPointPicker.tsx` | Lee `VITE_MAP_TILE_URL` y `VITE_MAP_DEFAULT_CENTER` por su cuenta | Los importa de `shared/config/map.ts`, mismo comportamiento |
| `features/dashboard/DistributionsSection.tsx` (FE36b) | Vacunas, pirámide y fallos | Más la distribución geográfica debajo |

---

## Lo que **no** está en este spec

- Coropletas o polígonos.
- Un selector de unidades para `ANALYTICS`.
- Un botón para subir un nivel.
- Ubicar los casos por la residencia del paciente.
- Colorear por porcentaje de graves, o círculos concéntricos.
- Mapa de calor o agrupación de puntos.
- Alertas por lote (SPEC FE37).
- Exportar el mapa o la tabla.

Cada uno de esos, si aterriza, va en su propio spec.

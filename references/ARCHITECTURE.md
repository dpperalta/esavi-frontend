# Plan de arquitectura — ESAVI Frontend

> **Estado:** Vigente — en ejecución (hitos 1 y 2 en curso)
> **Fecha:** 2026-08-30 · **revisado contra el backend el 2026-09-03**
> **Ubicación destino:** `esavi-app/esavi-frontend`
> **Backend de referencia:** `esavi-app/esavi-backend` (Express 5 + TypeScript + Sequelize + PostgreSQL)

Este documento recoge las decisiones de arquitectura del cliente web de ESAVI, tomadas contra el estado real del backend a la fecha: 45 routers montados bajo `/api` —44 en producción, más el de semillas que sólo se monta fuera de ella—, ~45 entidades con el mismo contrato de siete artefactos, envelope `{ ok, message, data }`, JWT con refresh en el body, i18n en `es`/`en`/`nl`, roles por nivel numérico y listados duales (`002A` público / `002B` admin con inactivos).

**Revisión del 2026-09-03.** Los specs F50 a F55 del backend no cambiaron ninguna de estas decisiones: no hay tablas nuevas ni entidades nuevas, sólo superficie de lectura sobre el modelo que ya existía —búsqueda por `name`/`code`, el árbol WHODrug, el proxy de MedDRA y la importación masiva de geografía—. Lo que sí añaden son **dos primitivas** (§4.3) y una regla de autocompletado (`CONVENTIONS.md` §6.7).

---

## 1. Estructura de directorios

```
esavi-app/
├── esavi-backend/     ← repo git propio (existente)
├── esavi-frontend/    ← repo git propio (nuevo)
└── FRONTEND-PLAN.md   ← este documento
```

**Dos repositorios hermanos, no un monorepo.** `esavi-app/` es hoy una carpeta contenedora sin `.git`; el backend es un repositorio autónomo con su propio `npm run check`, sus specs y sus convenciones.

Un monorepo con workspaces daría una cosa valiosa —tipos compartidos sin fricción— a cambio de mover el `package.json` del backend, que resuelve `.env.${NODE_ENV}` desde `process.cwd()` y corre Jest con `--runInBand` sobre esa raíz. Se pagaría en arranque, tests y CI de algo que ya funciona. La decisión se puede revisar cuando el frontend esté maduro; convertir dos repos en workspaces más tarde es mecánico.

**Consecuencia a resolver:** los tipos del contrato viajan entre repos. Ver §10.

---

## 2. Stack

| Capa | Elección | Motivo específico de este proyecto |
|---|---|---|
| Build | Vite + React 19 + TypeScript | Back-office autenticado: no hay SEO ni contenido público que justifique SSR |
| Estado de servidor | TanStack Query | Caché por entidad, invalidación tras activar/desactivar, paginación con `keepPreviousData` |
| Estado de cliente | Zustand + `persist` | Preferencias, UI del sidebar y borradores del wizard |
| Rutas | React Router v7 | Rutas anidadas por entidad y guards por rol |
| UI | Tailwind v4 + shadcn/ui (Radix) | Componentes copiados al repo: se modifican, no se pelean |
| Tablas | TanStack Table | Todos los listados son paginados en servidor; headless encaja |
| Formularios | React Hook Form + Zod | `investigation` y sus **12 satélites** son formularios grandes y anidados, con dos niveles de anidamiento (`CASE-PROCESS.md` §5.5.0) |
| HTTP | axios con interceptores | Hace falta cola de refresh ante 401 |
| i18n | react-i18next | Reutiliza las claves de `src/data/i18n/{es,en,nl}.json` |
| Fechas | date-fns | El backend recorta a `YYYY-MM-DD`; nada de zonas horarias sorpresa |
| Comandos | cmdk | Navegar 45 entidades escribiendo, no clicando |
| Mapas | Leaflet + teselas OSM | **Un solo campo lo pide** (`CASE-PROCESS.md` §5.5.5): el domicilio del paciente en `investigationCommunity`. Sin clave de API y sin coste; la URL de teselas va en `VITE_MAP_TILE_URL` para que un despliegue en red cerrada apunte a su propio servidor. La atribución de OSM es visible y obligatoria |
| Tests | Vitest + Testing Library + MSW | MSW permite simular el envelope exacto del backend |

**Descartado:** Redux Toolkit (boilerplate sin contrapartida frente a Zustand + Query), Next.js (SSR innecesario), Material UI (personalizarlo hasta que deje de parecer Material cuesta más que partir de shadcn).

---

## 3. Arquitectura de estado — tres capas

La regla que evita el 80% de los bugs de sincronización: **cada dato vive en una sola capa**.

### 3.1 URL — filtros, paginación y orden

Los 13 filtros de `ESAVI-CASE-002A` (SPEC F48) viven en `searchParams`, no en un store. Se comparten por enlace, sobreviven al refresco y funcionan con los botones de atrás y adelante del navegador. Un store aquí destruye las tres propiedades.

### 3.2 TanStack Query — casos, pacientes, catálogos, todo lo del servidor

**Los casos y los pacientes no son estado de cliente.** Son datos remotos, paginados, que caducan y que otro usuario puede modificar mientras se miran. Guardarlos en un store obliga a reimplementar caché, invalidación y refetch a mano, y produce la incoherencia clásica de "la lista dice una cosa y el detalle otra".

Convención de claves de caché:

```ts
['esaviCase', 'list', filtros]      // listado con sus filtros
['esaviCase', 'detail', id]         // detalle
['catalogItem', 'byType', typeId]   // catálogos, con staleTime alto
```

Los catálogos (`catalogType`, `catalogItem`, `geoLocation`, `diagnosticTerm`) cambian poco: `staleTime` de 30 minutos o más. Los casos, al contrario, se invalidan tras cada mutación.

### 3.3 Zustand — lo que sí es del cliente

Tres slices, pequeños y separados:

- **`preferences`** — tema, idioma, densidad, tamaño de página, columnas visibles. Persistido (§7).
- **`ui`** — sidebar colapsado, sección de menú abierta, estado del drawer móvil.
- **`drafts`** — búfer contra caídas del wizard. **No es el almacén del progreso**: eso vive en la base (§3.4).

El slice `drafts` guarda únicamente lo tecleado en el paso actual, entre el último guardado y el siguiente, y se borra en cuanto el `PUT` responde. Protege contra el cierre accidental de la pestaña, nada más.

---

## 3.4 El progreso del wizard se guarda en la base, no como borrador

**Decidido: filas reales, no una tabla de borradores.** Notificación e investigación suman **18 satélites** —6 y 12—, un formulario que nadie completa de una sentada y cuyo progreso tiene que sobrevivir entre sesiones y dispositivos. Hay dos formas de conseguirlo y solo una es correcta aquí.

### Lo que se descarta

Una tabla de borradores con el formulario a medio llenar en un JSON: duplica el esquema —un blob que valida distinto que la tabla real—, duplica la validación, no deja rastro de auditoría y crea el problema de qué hacer cuando el borrador y la fila real divergen.

### Lo que se hace

El wizard escribe en los endpoints reales: `POST` en el primer paso de cada etapa, `PUT /:id` en los siguientes.

**El backend ya provee la pieza que faltaba.** `ESAVI-CASEFLOW-006` (SPEC F44, implementado) devuelve `exists` e `id` por cada satélite, y su alcance lo declara con estas palabras: *«para que un cliente que retoma un expediente sepa en una sola llamada si cada etapa se crea con `POST` o se actualiza con `PUT /:id`»*. Retomar un expediente en otro dispositivo es una sola petición.

**El esquema lo admite.** Se verificó: `investigation` solo exige `caseId`; todo lo demás es nulable. `notification` exige `notificationType` y `esaviDescription`. Las tablas ya están diseñadas para llenarse por partes.

### Lo que se gana frente a un borrador

- **Auditoría** — cada paso deja su entrada en `appDetails` con usuario y código de operación. Un blob no deja rastro de quién escribió qué.
- **Update diferencial** — `CONVENTIONS.md` §11: volver a un paso sin cambiar nada no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría. Guardar por paso no ensucia el historial.
- **Visibilidad epidemiológica** — un ESAVI grave a medio registrar no queda invisible en el `localStorage` de una persona. En vigilancia, un caso incompleto pero visible vale más que uno completo que nadie ve todavía.

### La consecuencia asumida

Filas a medio llenar aparecen en los listados. **Ya está resuelto en el modelo:** el catálogo `caseWorkflowStatus` tiene ocho estados (`OPEN`, `IN_CLASSIFICATION`, `IN_NOTIFICATION`, `IN_INVESTIGATION`, `IN_FINAL_CLASSIFICATION`, `PENDING_VALIDATION`, `CLOSED`, `REOPENED`). El listado filtra por estado y «en progreso» deja de ser un limbo para ser un estado nombrado. Para eso existe la tabla.

### Restricción de diseño para el wizard

Como `notificationType` y `esaviDescription` son `NOT NULL`, **el primer paso del wizard debe recoger exactamente esos dos campos**: antes de tenerlos no hay fila que guardar. El orden de los pasos se diseña con ese dato en mano.

### Fuera de alcance: offline-first

**Descartado por ahora, por decisión explícita.** Si en el futuro se registran ESAVI sin conexión —una unidad rural sin cobertura—, el servidor deja de poder ser el almacén y nada de esta sección aplica en ese momento: haría falta IndexedDB, cola de sincronización y resolución de conflictos. Es una decisión de otro tamaño y tendría su propio spec.

---

## 4. La capa de recurso genérica

Con ~45 entidades que comparten contrato, la decisión central no es qué librería de UI usar, sino **no escribir 45 veces el mismo CRUD**.

### 4.1 Cliente HTTP que desenvuelve el envelope

El interceptor de respuesta devuelve `data` directamente y convierte `{ ok: false, message, code, errors }` en un `EsaviApiError` que conserva el `code` del backend (`HFAC_001_CREATION_FAILED`). Así ningún componente escribe `response.data.data`, y el `code` alimenta el toast de error.

El interceptor de petición añade el `Authorization` y el idioma activo como `?lang=`, leído del store de preferencias.

Ante un `401`, una **cola de refresh**: la primera respuesta 401 dispara `POST /api/auth/refresh`, las peticiones concurrentes esperan a ese resultado y se reintentan con el token nuevo. Sin cola, diez peticiones simultáneas disparan diez refrescos y el backend invalida la sesión.

### 4.2 Fábrica de hooks por recurso

```ts
const esaviCase = createResource<EsaviCase, CreateEsaviCaseDto, UpdateEsaviCaseDto>({
  path: 'esavi-cases',
  key: 'esaviCase',
  adminPath: 'esavi-cases/admin',   // el 002B, elegido según el rol
});

// entrega, con invalidaciones ya cableadas:
esaviCase.useList(filters)
esaviCase.useOne(id)
esaviCase.useCreate()
esaviCase.useUpdate()
esaviCase.useDeactivate()   // DELETE  → isActive:false + deletedAt
esaviCase.useActivate()     // PATCH /activate/:id
```

`useList` elige entre `002A` y `002B` según el nivel de rol y el toggle de "mostrar inactivos", replicando la lógica de `canViewInactive` del backend. Cada entidad nueva es una declaración, no una carpeta de archivos.

### 4.3 Primitivas de pantalla

- **`<ResourceTable>`** — paginación en servidor, estado vacío, estado de carga, toggle de inactivos según rol, y el colapso a tarjetas en móvil (§8). Se escribe una vez y lo heredan las 45 entidades.
- **`<ResourceForm>`** — React Hook Form + Zod, con mapeo de los errores del backend a los campos correspondientes.
- **`<CatalogSelect typeCode="...">`** — combo que resuelve `catalogItem` por `catalogType`. Aparece en decenas de campos del modelo.
- **`<GeoLocationPicker>`** — cascada jerárquica sobre `geoLocation`. Ya la exige el filtro `geoLocationId` de F48.
- **`<AuditTrail>`** — lector del `appDetails` de cualquier fila. Todas las tablas lo llevan.
- **`<EntitySearchSelect>`** — autocompletado remoto contra `?name=` y `?code=`, con debounce y mínimo de caracteres. **Una sola vez, no uno por entidad:** desde el SPEC F52 las doce entidades buscables hablan el mismo parámetro, y ésa es justo la razón por la que existe la primitiva (`CONVENTIONS.md` §6.7). `<CatalogSelect>` deja de ser el único camino a `catalogItem` — para resolver «Hospital» sin saber a qué `catalogType` pertenece está `ESAVI-CATITEM-007`.

Dos selectores que **no** son casos de `<EntitySearchSelect>` y llevan su propio componente, porque su contrato no es el de un listado filtrado:

- **`<WhodrugTreePicker>`** — las cinco facetas de `WHODRUG-006A`…`006E`. Quien llena una notificación sabe que fue una BCG, no cómo se llama la presentación exacta; se baja por niveles y **el componente para en cuanto `matchCount === 1`**, que es cuando el `vaccineWhodrugId` ya viene resuelto en la propia opción. El centinela `__NULL__` reenvía la opción sin valor al nivel siguiente (`API-CONTRACT.md` §11.2).
- **`<MeddraSearchField>`** — `MEDDRA-006`. Es un API externo de pago detrás de un limitador: debounce obligatorio, mínimo de tres caracteres, y sus `503`/`502`/`504` se muestran como estado del servicio, no como «no hay resultados». Lo que el usuario elige se persiste con otra llamada; el proxy no escribe nada.

**Las siete que salieron de recorrer el proceso del caso** (`CASE-PROCESS.md` §5, cerrado hasta el paso 5). Ninguna es específica de una pantalla: todas se repiten entre diez y cuarenta veces.

- **`<AnswerOptionField>`** — el ENUM `answerOption` con **dos** variantes, `unknown` y `full`. Cuarenta columnas del expediente, y `noAnswer` **no se implementa**: se recorrieron las cuarenta sin un solo caso (`CASE-PROCESS.md` §7.1). Al leer renderiza cualquier valor que encuentre, incluido el que no ofrece.
- **`<SatelliteList>`** — lista con «Añadir» y alta/edición en modal. Es el patrón canónico de los satélites `N`, no un componente por tabla: catorce listas entre los pasos 4 y 5.
- **`<DateField>`** — recorte a `YYYY-MM-DD`, «no futura» y órdenes cruzados. **La regla se pasa por parámetro**: hay una fecha del expediente sin ninguna restricción temporal (`investigationAutopsy.scheduledAutopsyDate`) y aplicarle «no futura» por inercia rompe su caso normal.
- **`<TimeField>`** — `HH:MM`, sin obligar a inventar los segundos. El backend los rellena y compara ya normalizados.
- **`<NumberField>` con rango** — el techo de `smallint` (32767) en nueve contadores y ±90/±180 en las coordenadas. **El techo no sale de ningún `CHECK`**, es del tipo de la columna, y sin replicarlo un 40000 vuelve como `500`.
- **`<SearchableSelect>`** — desplegable con filtro de texto sobre `cmdk`. Lo usan los cinco niveles del árbol WHODrug, y sirve para cualquier `<CatalogSelect>` con catálogo largo.
- **`<MapPointPicker>`** — Leaflet sobre `VITE_MAP_TILE_URL` (§2), con la atribución de OSM visible. **Un solo consumidor**: el domicilio del paciente en `investigationCommunity`. El resto de las coordenadas del expediente son campos numéricos.

> **La lista es cerrada porque el recorrido lo fue.** Salió de contrastar unas 320 columnas contra su validador y su servicio, no de imaginar qué haría falta. Las que faltan las traerá el paso 6, y son pocas.

### 4.4 Autorización espejo

`ROLE_LEVELS` se replica en el cliente (SUPERADMIN 100 > ADMIN 50 > USER 25 > ANALYTICS 10), con un hook `useCan()` y un componente `<RequireRole level={...}>`.

**Esto es experiencia de usuario, no seguridad.** Oculta lo que el usuario no puede hacer para que no lo intente; el backend sigue siendo la única autoridad.

---

## 5. Sidebar y navegación

### 5.1 El menú es dato, no JSX

```ts
type NavItem = {
  key: string;        // clave i18n, nunca texto literal
  icon: LucideIcon;
  path?: string;
  minLevel: number;   // espejo de ROLE_LEVELS
  children?: NavItem[];
};
```

Renderizarlo desde un array tipado permite filtrar por rol, buscar dentro del menú y alimentar la paleta de comandos con la misma fuente.

### 5.2 Agrupación por dominio

Con 44 grupos de rutas, un menú plano es inservible. Los grupos siguen el dominio, no la tabla:

- **Casos** — casos ESAVI, pacientes, flujo del caso, clasificación final
- **Notificación** — cabecera, graves y no graves, eventos, vacunas, medicación, embarazo
- **Investigación** — investigación y sus catorce satélites
- **Catálogos clínicos** — términos diagnósticos, vacunas WHODrug, diluyentes
- **Geografía y unidades** — niveles geográficos, ubicaciones, unidades de salud
- **Administración** — usuarios, roles, coberturas geográficas, tipos y elementos de catálogo, configuración del sistema

### 5.3 Comportamiento

- **Colapsable** en escritorio: iconos con tooltip, nunca desaparición. Estado persistido.
- **Drawer** por debajo de `md`: overlay, cierre al navegar, cierre con `Escape`.
- **Paleta de comandos** (`Ctrl/Cmd + K`): con este número de pantallas, buscar gana a navegar. Es la mejora de productividad más barata del proyecto.
- **Sección activa** derivada de la ruta, no de un estado aparte.

---

## 6. Temas

### 6.1 Tokens, nunca colores literales

Tokens CSS semánticos —`--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--border`, `--destructive`— redefinidos por tema. Es el modelo sobre el que ya está construido shadcn/ui.

**Regla vinculante: ningún color literal en los componentes.** Un `bg-slate-800` suelto rompe el tema oscuro en ese punto y nadie lo detecta hasta producción.

### 6.2 Tres estados, no dos

`light`, `dark` y **`system`** mediante `matchMedia('(prefers-color-scheme: dark)')`, con `system` como valor por defecto y suscripción a los cambios del sistema operativo mientras la aplicación está abierta.

### 6.3 `data-theme` desde el primer día

En lugar de solo la clase `dark`, usar `data-theme="light|dark"` en `<html>`. Si más adelante aparece un tema institucional o uno de alto contraste para uso en campo, es un bloque de tokens más. Cambiar el mecanismo después toca todos los componentes; dejarlo abierto ahora no cuesta nada.

### 6.4 Script anti-parpadeo

En `index.html`, **antes** de que monte React:

```html
<script>
  (function () {
    try {
      var stored = JSON.parse(localStorage.getItem('esavi-preferences') || '{}');
      var theme = (stored.state && stored.state.theme) || 'system';
      var dark = theme === 'dark' ||
        (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch (e) {
      document.documentElement.dataset.theme = 'light';
    }
  })();
</script>
```

Sin esto hay un destello blanco en cada carga con tema oscuro. Es de lo más barato de resolver al principio y de lo más molesto de resolver después.

---

## 7. Preferencias de usuario

### 7.1 Hallazgo del backend

Se revisó el esquema: **`appUser` no tiene columna de preferencias**. Sus campos son de identidad, credenciales y auditoría (`sysDetails`, `appDetails`), no de configuración de usuario. Y **`systemConfig` es global**: tiene `scope`, `code` y `value`, pero ningún `userId`, así que no puede albergar configuración por persona.

Hoy no existe dónde guardar preferencias en el servidor.

### 7.2 Decisión: localStorage ahora, con la forma del futuro JSONB

```ts
type Preferences = {
  theme: 'light' | 'dark' | 'system';
  language: 'es' | 'en' | 'nl';
  sidebarCollapsed: boolean;
  density: 'comfortable' | 'compact';
  pageSize: number;
  tableColumns: Record<string, string[]>;   // columnas visibles por entidad
};
```

Persistido con `zustand/persist` bajo la clave `esavi-preferences`. **Limitación aceptada:** no viajan entre dispositivos ni entre navegadores.

El store se diseña con la forma exacta que tendría la columna JSONB, de modo que migrar sea sustituir el backend del `persist` y no reescribir los consumidores.

### 7.3 Cuando importe: una tabla `appUserPreference`

**Forma decidida: tabla satélite 1:1 con `appUser`, columnas tipadas.** `UNIQUE ("userId")` y `FK ... ON DELETE CASCADE`, exactamente la forma que ya tiene `caseWorkflow` respecto de `esaviCase`.

Se evaluaron y se descartaron dos alternativas:

- **Columna `preferences JSONB` en `appUser`.** Reabre una entidad ya implementada y con columnas cifradas, y choca con el update diferencial: `buildDifferentialUpdate` compara campo por campo, y un blob es un solo campo — cambiar el tema y cambiar el idioma producirían la misma entrada de auditoría, sin decir cuál cambió. Con columnas tipadas eso sale gratis, y además admite `CHECK` reales sobre `theme` y `language`, como el `CK_systemConfig_valueType`.
- **Clave/valor con N filas por usuario**, imitando `systemConfig`. Su única ventaja es que añadir una preferencia no exige DDL; a cambio, cada preferencia arrastra `isActive`, `deletedAt`, `sysDetails` y `appDetails` para guardar un booleano, y leerlas pasa a ser N filas.

**Tampoco se usa `systemConfig` con `scope = 'USER:<uuid>'`.** No hay clave foránea a `appUser`, así que borrar un usuario dejaría filas huérfanas, y esa tabla es el almacén de parámetros que edita un administrador, no un cajón por persona.

#### Qué viaja al servidor y qué no

| Preferencia | Dónde | Por qué |
|---|---|---|
| `language` | Base | Es de la persona; debe seguirla a cualquier dispositivo |
| `pageSize` | Base | Hábito de trabajo, no del dispositivo |
| `tableColumns` | Base | La más valiosa: configurar columnas cuesta tiempo y perderla molesta |
| `theme` | Base | La gente espera que la siga. Con `system` por defecto se resuelve solo en la mayoría de casos |
| `sidebarCollapsed` | `localStorage` | Depende de la pantalla. Nadie quiere el sidebar colapsado en el monitor grande porque lo colapsó en el móvil |
| `density` | `localStorage` | Misma razón |

Que las dos últimas no viajen no es una limitación: es el comportamiento correcto.

#### La identidad del solicitante es la clave

Este sería el primer endpoint del repositorio donde **el `userId` sale de `req.user` y nunca de la ruta ni del body**. Si aceptara un id, cualquier `USER` podría leer la configuración de otro. Eso cambia la forma de las operaciones frente a un CRUD normal:

- **`001`** interno, sin ruta: la fila nace con el usuario, como `caseWorkflow` nace con el caso.
- **`006`** — `GET /api/users/me/preferences`.
- **`004`** — `PATCH /api/users/me/preferences`, diferencial.
- **Sin `002`** (nadie lista preferencias), **sin `003`** por id, **sin `005A`/`005B`** (una fila de preferencias no se desactiva).

Requiere además dar de alta la abreviatura `USERPREF` en `CONVENTIONS.md` §6, con sus operaciones no canónicas.

#### Cuándo

**No está en la ruta crítica del hito 1.** El store se escribe detrás de una interfaz, igual que el `TokenStore` de §11.1:

```ts
interface PreferencesStore {
  read(): Promise<Preferences>;
  write(patch: Partial<Preferences>): Promise<void>;
}
```

Se arranca con la implementación de `localStorage`; el día que exista el endpoint se añade la remota y los componentes no se enteran. El disparador natural para redactar el spec es el primer usuario que pregunte por qué se le reiniciaron las columnas en el otro computador.

### 7.4 El idioma no es solo del cliente

`language` alimenta dos cosas a la vez: los textos de la interfaz vía react-i18next y el parámetro `?lang=` del interceptor de axios. Si solo alimenta el primero, la interfaz queda en español y los mensajes de error del servidor llegan en inglés.

---

## 8. Responsividad

Diseño mobile-first. El trabajo real se concentra en dos puntos.

### 8.1 Tablas → tarjetas

Un listado de casos con ocho columnas no cabe en 375px, y el scroll horizontal es una mala respuesta. Por debajo de `md`, la misma fuente de datos se renderiza como lista de tarjetas con los tres campos que importan —código de caso, fecha, unidad de salud— y el resto queda en el detalle.

Se implementa dentro de `<ResourceTable>` una sola vez.

### 8.2 El wizard de investigación

Es la pantalla difícil:

- Una columna en móvil, sin excepción.
- Pasos como acordeón, no como pestañas horizontales.
- Barra de acciones fija en la parte inferior.
- Guardado del borrador en cada cambio de paso.

### 8.3 El resto, mecánico

- Sidebar como `Sheet` por debajo de `md`.
- Diálogos que en móvil entran desde abajo.
- Objetivos táctiles de 44px como mínimo.
- `dvh` en lugar de `vh`, para que la barra del navegador móvil no corte el contenido.
- Tablas anchas siempre dentro de un contenedor con `overflow-x: auto`.

---

## 9. Estructura de carpetas

```
esavi-frontend/
├── index.html                    ← incluye el script anti-parpadeo
└── src/
    ├── app/
    │   ├── router.tsx
    │   ├── providers.tsx         ← Query, i18n, tema, toaster
    │   └── layout/               ← AppShell, Sidebar, Topbar, CommandPalette
    ├── shared/
    │   ├── api/
    │   │   ├── client.ts         ← axios, envelope, cola de refresh
    │   │   ├── createResource.ts ← la fábrica de hooks
    │   │   └── types.ts          ← envelope y errores
    │   ├── components/
    │   │   ├── ui/               ← shadcn
    │   │   ├── ResourceTable/
    │   │   ├── ResourceForm/
    │   │   ├── CatalogSelect.tsx
    │   │   ├── GeoLocationPicker.tsx
    │   │   └── AuditTrail.tsx
    │   ├── stores/               ← preferences, ui, drafts
    │   ├── hooks/                ← useCan, useDebounce, useMediaQuery
    │   └── config/
    │       └── navigation.ts     ← el árbol de NavItem
    ├── features/
    │   ├── auth/
    │   ├── esaviCase/
    │   ├── patient/
    │   ├── notification/
    │   ├── investigation/
    │   ├── catalogs/
    │   └── admin/
    └── contracts/                ← tipos espejo del backend (§10)
```

Cada carpeta de `features/` contiene su `api.ts` (declaración del recurso), sus `schemas.ts` (Zod), sus páginas y sus componentes propios. Nada de `components/` global que crezca sin control.

---

## 10. Contratos compartidos

El backend tiene sus tipos en `src/types/**` y no expone OpenAPI. Duplicarlos a mano garantiza que se desincronicen en una semana.

**Ahora:** una carpeta `src/contracts/` en el frontend con los tipos de petición y respuesta copiados del backend, más un script `npm run contracts:sync` que los reimporte desde `../esavi-backend/src/types`. Explícito, revisable en el diff y sin infraestructura.

**Después:** generar OpenAPI desde los validadores de `express-validator` y derivar los tipos con `openapi-typescript`. Es la solución correcta y es un spec en sí misma; no bloquea el arranque del frontend.

---

## 11. Seguridad de la sesión

### 11.1 Dónde vive el refresh token

`POST /api/auth/refresh` recibe el refresh token **en el body**, no en una cookie `httpOnly`. Eso obliga a guardarlo en el cliente.

#### Qué diferencia hay realmente

`httpOnly` y CSP no son alternativas: **CSP reduce la probabilidad de que exista un XSS explotable; `httpOnly` reduce el daño cuando existe.** La diferencia se ve en un solo escenario —alguien logra ejecutar JavaScript en el origen—:

- **Con `localStorage`**, el script lee el refresh token y lo exfiltra. El atacante obtiene una sesión completa **desde su propia máquina**, sin la víctima delante, y persiste tras cerrar la pestaña. Es robo de credencial.
- **Con cookie `httpOnly`**, el script no puede leer el token. Puede actuar desde el navegador de la víctima mientras la página esté abierta, pero no llevarse nada. Es suplantación temporal.

La diferencia práctica es entre comprometer la cuenta y comprometer la pestaña.

#### Por qué la CSP no basta aquí

- El script anti-parpadeo (§6.4) es inline: exige `nonce` por respuesta o hash, y el HTML lo sirve un estático de Vite.
- Tailwind y Radix inyectan estilos en tiempo de ejecución, lo que empuja hacia `style-src 'unsafe-inline'` y deja de ser una CSP estricta.
- **El vector realista no es el código propio, son las dependencias.** React escapa por defecto; lo que introduce JavaScript hostil es un paquete npm comprometido. Ese código corre dentro del origen, con la CSP puesta, y lee `localStorage` sin obstáculo. `connect-src` limita la exfiltración, pero un paquete malicioso puede usar la sesión contra la propia API, que está permitida.

#### Lo que cuesta la cookie

- **CSRF.** Las cookies viajan solas: exige `SameSite=Strict` y `Secure`.
- **Orígenes cruzados.** Frontend y backend en puertos distintos son orígenes distintos: hace falta `credentials: true` en CORS y `withCredentials` en axios, y `CORS_ORIGINS` nunca puede ser `*`. Si en producción acaban en dominios distintos, haría falta `SameSite=None` y con ello un token CSRF. Alojarlos bajo el mismo dominio elimina el problema.
- **Un spec de backend**, pequeño: emitir y leer también de cookie en `refresh`, y limpiarla en el logout.

#### Lo que ya está resuelto en el backend

**SPEC F42 implementa rotación con detección de reutilización.** Cada `refresh` invalida el token consumido y emite uno nuevo; si aparece un token ya gastado, se revocan **todas** las sesiones del usuario con `revokedReason: 'REUSE_DETECTED'`.

Es la mitigación más fuerte que existe contra el robo de refresh token, y ya está en producción. Un token robado deja de servir en cuanto el usuario legítimo renueva, y el intento del atacante delata el robo y cierra todo. No elimina el riesgo —hay una ventana y el atacante puede ganar la carrera—, pero lo acota mucho.

#### Decisión: dos fases

**Objetivo (fase 2) — el híbrido, que es el estándar de facto:**

| Token | Dónde | Por qué |
|---|---|---|
| Access (corto, ~15 min) | **Memoria** (variable JS) | No se puede robar de disco; se pierde al recargar y se recupera con el refresh |
| Refresh | **Cookie `httpOnly` + `Secure` + `SameSite=Strict`**, con `path=/api/auth/refresh` | Inalcanzable para JavaScript; el `path` la envía solo al endpoint que la necesita |

Más CSP encima, que sigue valiendo la pena aunque no sea perfecta.

**Arranque (fase 1) — `localStorage`.** Con rotación y detección de reutilización ya en producción, es un riesgo acotado y conocido, no una imprudencia, y no bloquea el hito 1 con una decisión de backend.

**La condición que hace reversible la fase 1:** el cliente de autenticación se escribe **detrás de una interfaz**.

```ts
interface TokenStore {
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  clearRefreshToken(): void;
}
```

Migrar a cookie es entonces sustituir esa implementación y añadir `withCredentials`, no reescribir el flujo de autenticación.

**Alcance del spec de la fase 2:** toca `loginService`, `refresh` y `logout` de `auth.service.ts`, más `CORS_ORIGINS` con `credentials`. **No hay tabla nueva ni cambio de esquema** — `appSession` ya guarda todo lo necesario.

### 11.2 CORS

`CORS_ORIGINS` es obligatoria en producción y gobierna el desarrollo también. Hay que añadir `http://localhost:5173` a `.env.development` del backend **antes** de la primera petición del frontend.

---

## 12. Orden de construcción

| # | Hito | Qué valida |
|---|---|---|
| 1 | Shell y autenticación | Login, cola de refresh, guard por rol, layout, sidebar, tema, preferencias. Es donde se prueba toda la infraestructura |
| 2 | Catálogos | `catalogType`, `catalogItem`, `geoLocation`, `healthFacility`. CRUDs simples que validan la capa genérica y son dependencia de todo lo demás |
| 3 | Casos ESAVI | Listado con los 13 filtros de F48, detalle del caso, pacientes |
| 4 | Notificación e investigación | El wizard multipaso. Llega con las primitivas ya maduras y con el store de borradores probado |
| 5 | Panel y analítica | Al final, y probablemente pidiendo un endpoint de agregados que hoy no existe: F48 lo declara explícitamente fuera de alcance |

El hito 1 es el que más decide. Si la fábrica de recursos y las primitivas salen bien ahí, los hitos 2 y 3 son configuración; si salen mal, se arrastra el error 45 veces.

# SPEC FE34 — Inicio: marco por bloques y trabajo pendiente

> **Estado:** Implementado
> **Depende de:** SPEC FE01 (shell y autenticación), SPEC FE09 (listado de casos y sus filtros), SPEC FE33 (roles por etapa), SPEC F65 del backend (dashboard: marco común y trabajo pendiente), SPEC F49 del backend (alcance geográfico)
> **Fecha:** 2026-11-03
> **Objetivo:** Que Inicio muestre, dentro del territorio del usuario, cuántos casos hay en cada estado, cuáles están detenidos y qué investigaciones siguen sin iniciar, y que cada cifra lleve a sus casos.

---

## 1. Por qué existe este spec

**Inicio hoy no dice nada del trabajo.** `features/home/HomePage.tsx` solo muestra el saludo y el rol efectivo de `ESAVI-USER-007`. Para saber cuántos casos esperan su investigación, el usuario tiene que abrir el listado y revisarlos uno por uno. El backend ya resolvió ese agregado: es `ESAVI-DASH-006`, especificado en el SPEC F65, y este spec es su consumo.

**Las cifras tienen que salir del mismo territorio que el listado.** El F65 cuenta solo los casos que `resolveUserGeoScopeIds` deja ver (F49). La bandeja de workflow ya existente (`?tab=workflow`, `ESAVI-CASEFLOW-002A`) no está acotada por territorio. Si el embudo enlazara a ella, un usuario de provincia vería «12 en investigación» y una lista con más de 12. Por eso el embudo enlaza a la pestaña «Por caso» (`ESAVI-CASE-002A`), cuyo `count` coincide con el del embudo (F65 §5).

**Esa pestaña todavía no filtra por estado.** `esaviCaseFiltersSchema` (`features/esaviCase/schemas.ts:42`) reconoce catorce claves de URL, y ninguna es `statusCode`. El F65 amplió `002A`/`002B` con `?statusCode=`, y este spec añade la clave del lado del cliente. Sin ella, la cifra del embudo no lleva a ningún sitio.

**Los estados del workflow no tienen etiqueta propia en la interfaz.** No hay ninguna clave i18n por código de estado ni de etapa: la interfaz muestra el `name` del catálogo, que solo existe en español. El F65 §8 pide localizar por `statusCode` y dejar `statusName` como respaldo. Inicio es la primera pantalla que se ve en inglés o en neerlandés, así que las claves nacen aquí.

**F65 fija el marco que heredan F66 a F69, y FE34 hace lo mismo en el cliente.** Inicio se arma por bloques. Cada bloque se muestra según el rol mínimo de su propia ruta, porque los cinco endpoints del dominio `DASH` piden tres roles distintos: `USER`, `ANALYTICS` y `SUPERADMIN`. Los SPEC FE35 a FE38 solo añaden bloques sobre ese marco.

---

## 2. Alcance

**Dentro:**

- **El marco de Inicio por bloques.** `HomePage.tsx` conserva el saludo y debajo compone bloques. Cada bloque es un componente propio, gateado con `useCan` según el rol mínimo de su ruta. FE34 trae un solo bloque, y FE35–FE38 añaden los suyos sin tocar el marco.
- **Contrato del dominio.** Una entrada nueva en `SYNC_MAP` (`dashboard/dashboard.types.ts → dashboard.ts`) y `npm run contracts:sync`.
- **Bloque «Trabajo pendiente»**, el consumo de `ESAVI-DASH-006`:
  - cabecera con los casos abiertos, los reabiertos, «Actualizado a las HH:mm» y el botón «Actualizar»;
  - embudo de los ocho estados, en tarjetas pulsables que llevan a `/esavi-cases?statusCode=<code>`, con `CLOSED` separado de los siete abiertos;
  - listas de estancados y de investigaciones pendientes. Cada `caseCode` lleva a `/esavi-cases/:id/wizard`, y si `total` pasa de los 10 que trae `items`, se añade el texto «y N más»;
  - los avisos de F65 §8: «detección desactivada» cuando `staleDays < 1` y «sin territorio asignado» cuando `hasAssignments = false`.
- **Resaltado según el rol efectivo.** Todos los roles ven los cuatro sub-bloques; el rol solo cambia el orden y el énfasis visual (F65 §8, nota 1).
- **Filtro `statusCode` en la pestaña «Por caso»** del listado de casos: la clave número quince de `esaviCaseFiltersSchema`, con su control en `EsaviCaseFilters`, su sitio en el contador de filtros activos y en «Limpiar filtros».
- **Etiquetas del workflow.** `caseWorkflow.status.<CODE>` para los 8 estados y `caseWorkflow.stage.<STAGE>` para las 4 etapas, en `es`, `en` y `nl`. Si llega un código desconocido, se muestra `statusName`.

**Fuera de alcance (otros specs):**

- **KPIs con periodo** (`ESAVI-DASH-007`, SPEC F66). → SPEC FE35.
- **Curva epidemiológica y distribuciones** (`ESAVI-DASH-008`/`009`, SPEC F67). → SPEC FE36.
- **Alertas por lote** (`ESAVI-DASH-010`, SPEC F68). → SPEC FE37.
- **Actividad reciente y del sistema** (`ESAVI-DASH-011`/`012`, SPEC F69). → SPEC FE38.
- **Ver la lista completa de estancados o de investigaciones pendientes.** Ninguna ruta de `API-ROUTES.md` la ofrece. Es una dependencia del backend: un filtro `?stalled=true` / `?pendingInvestigation=true` en `ESAVI-CASE-002A`, con su propio spec allá antes de que el cliente lo enlace.
- **Usar las etiquetas nuevas en el resto de pantallas.** El stepper, la bandeja de workflow y `CatalogSelect` siguen mostrando el `name` del catálogo; migrarlos va en otro spec.
- **Refresco automático** (`refetchInterval`) o en tiempo real.
- **Invalidar `['dashboard', …]` desde las mutaciones del wizard.**
- **Filtrar por varios estados a la vez.** El backend acepta uno solo (F65 §6).
- **Cambiar el umbral `ESAVI_DASHBOARD_STALE_DAYS` desde Inicio.** Se edita en la pantalla de configuración del sistema, que ya existe.

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay rutas nuevas. Inicio sigue en `/` y no cambia su `NavItem` (`navigation.ts:40`, `minLevel: ANALYTICS`).

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Inicio | `/` | `features/home/HomePage.tsx` (ampliada) | Ninguno: es para cualquier sesión, como hoy |
| Bloque «Trabajo pendiente» | — | `features/dashboard/PendingWorkBlock.tsx` (nuevo) | `useCan(ROLE_LEVELS.USER)` en `HomePage`; si no pasa, el bloque no se monta y no hay petición |
| Listado de casos, pestaña «Por caso» | `/esavi-cases?statusCode=<code>` | `features/esaviCase/EsaviCaseFilters.tsx` (ampliado) | El que ya tiene (`USER`) |

**Por qué hay una carpeta `features/dashboard/`.** El dominio del backend es `dashboard`, y la carpeta lleva ese nombre (CONVENTIONS §4). `features/home/` queda como la página que compone los bloques. Los bloques y sus hooks viven en `features/dashboard/`, donde los FE35–FE38 añadirán los suyos.

**Destinos de los enlaces del bloque:**
- cada tarjeta del embudo lleva a `/esavi-cases?statusCode=<statusCode>`;
- cada `caseCode` de las dos listas lleva a `/esavi-cases/:caseId/wizard`, sin `:step`, y `CaseWizardPage` redirige al paso donde se quedó el caso (SPEC FE08 §4).

### 3.2 Endpoints consumidos

```
GET    /api/dashboard/pending-work     ESAVI-DASH-006    USER    embudo, estancados, investigaciones pendientes, reabiertos
GET    /api/esavi-cases                ESAVI-CASE-002A   USER    gana ?statusCode= (SPEC F65 §3.5)
GET    /api/esavi-cases/admin          ESAVI-CASE-002B   ADMIN   gana ?statusCode=; createResource elige 002A/002B como hoy
GET    /api/users/me                   ESAVI-USER-007    USER    rol efectivo para el resaltado; ya lo consume HomePage
```

No se consumen `ESAVI-DASH-007` a `012`: son de FE35 a FE38. Tampoco `ESAVI-CASEFLOW-002A`, por lo que dice la §1.

### 3.3 Tipos del contrato

```ts
// contracts/dashboard.ts — espejo de esavi-backend/src/types/dashboard/dashboard.types.ts
export interface DashboardPendingWork {
  generatedAt: string;
  scope: { restricted: boolean; hasAssignments: boolean };
  funnel: DashboardStatusCount[];          // siempre 8, por sortOrder
  openCases: number;
  stalled: { staleDays: number; total: number; items: DashboardStalledCase[] };
  pendingInvestigations: { total: number; items: DashboardPendingInvestigation[] };
  reopened: { total: number };
}
```

- **Sincronización.**
  - `SYNC_MAP` gana `{ source: 'dashboard/dashboard.types.ts', dest: 'dashboard.ts' }`.
  - `IMPORT_REWRITES` gana una entrada que cambia `import { CaseWorkflowStage } from '../caseWorkflow/caseWorkflow.types'` por `import type { CaseWorkflowStage } from './caseWorkflow'`.
  - El archivo sincronizado trae también los tipos de F66–F69. Quedan sin consumidores hasta sus specs, lo que es aceptable porque el sync copia el archivo entero (`syncContracts.mjs`, cabecera).
- **Los ocho códigos de estado.**
  - En el backend, `CASE_WORKFLOW_STATUS` es un objeto y no el par `[...] as const` + `type` que sabe extraer `EXTRA_ENUM_APPENDS`.
  - Por eso se declaran a mano en `contracts/declared/caseWorkflow.ts` como `CASE_WORKFLOW_STATUS_CODES` (tupla `as const`, en el orden del backend) y `CaseWorkflowStatusCode`. Un comentario cita su origen en `esavi-backend/src/constants/caseWorkflow.constants.ts`.
  - De ahí salen el `z.enum` del filtro y las claves i18n.
- `EsaviCaseListFilters` del contrato sincronizado gana `statusCode?: string` si el backend ya lo exporta. Si no lo exporta, el paso 1 del plan lo dice y el schema del cliente lo declara igual.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Trabajo pendiente | TanStack Query | `['dashboard', 'pendingWork']` | `staleTime` 60 s; no se invalida desde ninguna mutación |
| Hora de actualización | TanStack Query | `data.generatedAt` | La hora del servidor, no `dataUpdatedAt` del cliente |
| «Actualizar» en curso | TanStack Query | `isFetching` de la misma query | El botón llama a `refetch()` y se deshabilita mientras dura |
| Usuario y rol efectivo | TanStack Query | la clave existente de `useCurrentUser` (`ESAVI-USER-007`) | Rol efectivo = `getEffectiveRoleName(user.roles)`, derivado en render |
| Orden y énfasis por rol | Derivado | función pura de `features/dashboard/` | No se guarda en ninguna capa |
| Filtro de estado del listado | URL | `searchParams.statusCode` | Una de las 8 claves; un valor desconocido lo descarta `esaviCaseFiltersSchema` con `.catch(undefined)` y no viaja, así que nunca se dispara el 400 |
| Listado filtrado | TanStack Query | `['esaviCase', 'list', filters]` | Igual que hoy; `filters` incluye `statusCode` |

- **Nada del servidor pasa por `useState` ni por un store.** El bloque no tiene estado propio de componente.
- **Qué invalida qué.** Ninguna mutación invalida `['dashboard', …]`. Al volver a Inicio después de trabajar en el wizard, el `staleTime` de 60 s casi siempre ya venció y la query se vuelve a pedir al montarse. Es una decisión (§6), no un olvido.

### 3.5 Formularios y validación

No hay formularios. El único cambio de validación es el filtro del listado:

| Campo | Control | Regla |
|---|---|---|
| `statusCode` | `<CatalogSelect typeCode="caseWorkflowStatus">` en `EsaviCaseFilters`, con su `emit` por defecto (`code`) | `z.enum(CASE_WORKFLOW_STATUS_CODES).optional().catch(undefined)` en `esaviCaseFiltersSchema` |

- Cuenta en el contador de filtros activos y se borra con «Limpiar filtros», igual que los otros catorce.
- Cambiarlo borra `page`, igual que los demás filtros.
- No choca con ninguna regla de exclusión de F48.

### 3.6 Estados de la pantalla

**Inicio (la página):**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga, error o datos de `ESAVI-USER-007` | Lo que hay hoy: skeleton, error con reintentar o el saludo | sin cambios |
| `ANALYTICS` | Solo el saludo. Sin hueco ni marcador vacío | — |

**Bloque «Trabajo pendiente».** Cada estado se queda dentro del bloque: el saludo sigue visible.

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton con la forma del bloque: cabecera, 8 tarjetas y 2 listas de 3 filas | — |
| Error | Mensaje por `code` (`errors.network` o `dashboard.pendingWork.error`) y «Reintentar» | `dashboard.pendingWork.error` |
| `403` inesperado | Igual que el error, sin pantalla en blanco | `dashboard.pendingWork.error` |
| Sin territorio (`scope.hasAssignments = false`) | Un aviso en lugar del embudo y las listas | `dashboard.pendingWork.noAssignments` |
| Detección desactivada (`stalled.staleDays < 1`) | La lista de estancados se cambia por un texto | `dashboard.pendingWork.stalled.disabled` |
| Lista de estancados vacía | «Ningún caso lleva más de N días detenido» | `dashboard.pendingWork.stalled.empty` |
| Lista de pendientes vacía | «No hay investigaciones solicitadas sin iniciar» | `dashboard.pendingWork.pendingInvestigations.empty` |
| `total > items.length` | «y N más» al pie de la lista, sin enlace (§2) | `dashboard.pendingWork.more` |

El mensaje de error se elige por `code`, nunca por `message`, y `errors` no se muestra nunca.

**Resaltado según el rol efectivo.** Solo aplica a los roles por etapa; `USER`, `ADMIN` y `SUPERADMIN` ven el orden por defecto, sin énfasis.

| Rol efectivo | Énfasis |
|---|---|
| `NOTIFIER` | Tarjetas `OPEN`, `IN_CLASSIFICATION` e `IN_NOTIFICATION` |
| `INVESTIGATOR` | La lista de investigaciones pendientes pasa a la primera posición |
| `EVALUATOR` | Tarjeta `IN_FINAL_CLASSIFICATION` |

El énfasis es solo con tokens (`ring-primary` y `bg-primary/8`), y una tarjeta resaltada no cambia su nombre accesible.

### 3.7 Responsividad y accesibilidad

- **Embudo.**
  - Por debajo de `md`, una rejilla de 2 columnas con 8 tarjetas; desde `md`, una fila de 7 tarjetas abiertas y `CLOSED` separada por un divisor.
  - Cada tarjeta es un `<Link>` cuyo nombre accesible es «<estado>: N casos».
  - Objetivo táctil de 44 px como mínimo.
- **Listas.**
  - Apiladas por debajo de `lg` y lado a lado desde `lg`.
  - Cada fila muestra:
    - estancados: `caseCode` (enlace), estado, etapa abierta y «N días»;
    - pendientes: `caseCode` (enlace), estado y «N días esperando».
  - A 375 px la fila parte en dos líneas: el código y los días arriba, el estado y la etapa debajo.
- El body no hace scroll horizontal a 375 px.
- El botón «Actualizar» lleva un icono y texto visible. Mientras carga, `aria-busy` en el bloque.
- El bloque es una `<section>` con `aria-labelledby` apuntando a su título.

### 3.8 Claves i18n nuevas

Todas van en `es`, `en` y `nl`.

| Clave | Uso |
|---|---|
| `dashboard.pendingWork.title` | Título del bloque |
| `dashboard.pendingWork.openCases` | «{{count}} casos abiertos» (plural) |
| `dashboard.pendingWork.reopened` | «{{count}} reabiertos» (plural) |
| `dashboard.pendingWork.updatedAt` | «Actualizado a las {{time}}» |
| `dashboard.pendingWork.refresh` | Botón «Actualizar» |
| `dashboard.pendingWork.error` | Error del bloque |
| `dashboard.pendingWork.noAssignments` | Aviso de sin territorio asignado |
| `dashboard.pendingWork.funnel.title` | Título del embudo |
| `dashboard.pendingWork.funnel.cardLabel` | Nombre accesible «{{status}}: {{count}} casos» |
| `dashboard.pendingWork.stalled.title` | «Casos detenidos» |
| `dashboard.pendingWork.stalled.days` | «{{count}} días» (plural) |
| `dashboard.pendingWork.stalled.empty` | Lista vacía, con `{{days}}` |
| `dashboard.pendingWork.stalled.disabled` | Detección desactivada |
| `dashboard.pendingWork.pendingInvestigations.title` | «Investigaciones sin iniciar» |
| `dashboard.pendingWork.pendingInvestigations.days` | «{{count}} días esperando» (plural) |
| `dashboard.pendingWork.pendingInvestigations.empty` | Lista vacía |
| `dashboard.pendingWork.more` | «y {{count}} más» |
| `caseWorkflow.status.{OPEN,IN_CLASSIFICATION,IN_NOTIFICATION,IN_INVESTIGATION,IN_FINAL_CLASSIFICATION,PENDING_VALIDATION,CLOSED,REOPENED}` | Las 8 etiquetas de estado |
| `caseWorkflow.stage.{CLASSIFICATION,NOTIFICATION,INVESTIGATION,FINAL_CLASSIFICATION}` | Las 4 etiquetas de etapa |
| `esaviCase.filters.status` | Etiqueta del filtro nuevo del listado |

---

## 4. Plan de implementación

Primero va lo que no tiene pantalla (contrato, constantes y claves), después la ampliación del listado y al final el bloque nuevo. Cada paso compila y se puede committear por separado.

1. **Sincronizar el contrato.**
   - Añadir a `scripts/syncContracts.mjs` la entrada `dashboard/dashboard.types.ts → dashboard.ts` en `SYNC_MAP`, y la reescritura del import de `CaseWorkflowStage` en `IMPORT_REWRITES`.
   - Ejecutar `npm run contracts:sync` y revisar el diff.
   - Si `EsaviCaseListFilters` no gana `statusCode`, anotarlo aquí y declararlo en el schema del cliente (§3.3).

   *Verificación:* `src/contracts/dashboard.ts` existe y su único import es `./caseWorkflow`. `npx tsc --noEmit -p tsconfig.app.json` no añade errores en `src/contracts/`. Un segundo `npm run contracts:sync` no produce diff.

2. **Códigos de estado y etiquetas del workflow.**
   - `CASE_WORKFLOW_STATUS_CODES` y `CaseWorkflowStatusCode` en `contracts/declared/caseWorkflow.ts`, con un comentario que cite su origen en el backend.
   - Las 8 claves `caseWorkflow.status.*` y las 4 `caseWorkflow.stage.*` en los tres idiomas.
   - Un helper puro `statusLabel(t, code, fallback)` en `features/dashboard/`: devuelve la clave si existe y `statusName` si no.

   *Verificación:* `npm run i18n:check` sale en 0. Un test unitario comprueba que un código desconocido devuelve el `fallback`.

3. **Filtro `statusCode` en la pestaña «Por caso».**
   - `esaviCaseFiltersSchema` gana `statusCode` con `z.enum(...).optional().catch(undefined)`.
   - `EsaviCaseFilters` gana su `<CatalogSelect>`, que entra en el contador de activos y en «Limpiar filtros».
   - `esaviCase.filters.status` en los tres idiomas.

   *Verificación:*
   - `/esavi-cases?statusCode=IN_INVESTIGATION` envía `statusCode=IN_INVESTIGATION` a `ESAVI-CASE-002A`.
   - `?statusCode=FOO` no envía el parámetro y no produce 400.
   - Al recargar se conserva el filtro, y «Limpiar filtros» lo quita.
   - Un test del schema cubre los tres casos.

4. **Hook del dominio.** `features/dashboard/api.ts` con `usePendingWork()`, que consume `ESAVI-DASH-006` con la clave `['dashboard', 'pendingWork']` y `staleTime` de 60 s, citando el código en un comentario. No usa `createResource`, porque no es CRUD (§6).
   *Verificación:* un test con MSW comprueba que el hook desenvuelve el envelope y expone `generatedAt`. Montarlo dos veces en menos de 60 s produce una sola petición.

5. **Bloque «Trabajo pendiente».**
   - `features/dashboard/PendingWorkBlock.tsx`, con la cabecera, el embudo, las dos listas, los estados de §3.6, el resaltado por rol y la responsividad de §3.7.
   - El orden y el énfasis por rol salen de una función pura en `features/dashboard/`.
   - Las claves `dashboard.pendingWork.*` en los tres idiomas.
   - Antes de escribir JSX se cargan `ui-ux-pro-max`, `ui-styling` y `dataviz` (CONVENTIONS §10.6).

   *Verificación:*
   - Los tests con MSW cubren los estados de carga, error con reintentar, `hasAssignments = false`, `staleDays = 0`, listas vacías y «y N más».
   - La función de orden tiene su propio test por rol.
   - Las tarjetas enlazan a `?statusCode=` y los códigos a `/wizard`.

6. **Marco de Inicio.** `HomePage.tsx` conserva el saludo y monta `<PendingWorkBlock>` solo si pasa `useCan(ROLE_LEVELS.USER)`.
   *Verificación:* un test de `HomePage` con `ANALYTICS` no renderiza el bloque y no llama a `/api/dashboard/pending-work` (MSW con `onUnhandledRequest: 'error'`). Con `USER` sí lo llama. Los tests actuales de `HomePage` pasan sin cambios.

7. **Revisión de interfaz.** Pasar `web-design-guidelines` sobre `PendingWorkBlock` y `HomePage`, y probar a mano el tema oscuro, 375 px y los roles `ANALYTICS`, `NOTIFIER`, `INVESTIGATOR` y `EVALUATOR`.
   *Verificación:* el bloque de cierre de §5 queda marcado.

---

## 5. Criterios de aceptación

**Contrato y superficie**

- [ ] `src/contracts/dashboard.ts` lo genera `npm run contracts:sync`, y un segundo sync no produce diff.
- [ ] `grep -rn "ESAVI-DASH-006" src/features/dashboard/api.ts` devuelve el comentario del hook.
- [ ] La única llamada nueva a la API es `GET /api/dashboard/pending-work`; `grep -rn "dashboard/" src --include=*.ts*` no encuentra ninguna otra ruta del dominio.
- [ ] `grep -rn "response.data.data\|from 'axios'" src/features/dashboard src/features/home` no devuelve resultados.

**Roles**

- [ ] Con `ANALYTICS`, Inicio muestra solo el saludo y no se hace ninguna petición a `/api/dashboard/pending-work`.
- [ ] Con `USER`, `NOTIFIER`, `INVESTIGATOR`, `EVALUATOR`, `ADMIN` y `SUPERADMIN`, el bloque se monta con sus cuatro sub-bloques.
- [ ] Con `NOTIFIER` se resaltan `OPEN`, `IN_CLASSIFICATION` e `IN_NOTIFICATION`. Con `EVALUATOR`, `IN_FINAL_CLASSIFICATION`. Con `INVESTIGATOR`, la lista de investigaciones pendientes aparece primero. Con `USER`, `ADMIN` y `SUPERADMIN` no hay énfasis.

**Embudo**

- [ ] Se muestran las 8 tarjetas en orden de `sortOrder`, incluidas las que tienen 0, con `CLOSED` separada de las siete abiertas.
- [ ] Cada etiqueta sale de `caseWorkflow.status.<code>`; un `statusCode` desconocido muestra su `statusName`.
- [ ] Pulsar una tarjeta lleva a `/esavi-cases?statusCode=<code>`. Para el mismo usuario, el `count` de ese listado es igual a la cifra de la tarjeta (comprobado a mano con un usuario restringido a un territorio).

**Listas**

- [ ] Cada `caseCode` lleva a `/esavi-cases/:caseId/wizard`.
- [ ] Con `total = 14` e `items` de 10, aparece «y 4 más», sin enlace.
- [ ] Con `stalled.staleDays = 0`, la lista de estancados muestra «detección desactivada», no «ningún caso detenido».
- [ ] Con `scope.hasAssignments = false`, se ve el aviso de sin territorio en lugar del embudo y las listas.

**Frescura**

- [ ] «Actualizado a las HH:mm» sale de `generatedAt`.
- [ ] «Actualizar» vuelve a pedir el dato y se deshabilita mientras dura.
- [ ] Salir de Inicio y volver antes de 60 s no hace una petición nueva; después de 60 s, sí.

**Errores**

- [ ] Un `500` de `ESAVI-DASH-006` deja el saludo visible y muestra el error del bloque con «Reintentar».
- [ ] Un `403` con `AUTH_ROLE_FORBIDDEN` se maneja igual, sin pantalla en blanco.
- [ ] Ninguna rama muestra `errors` ni compara un `code` sin contemplar que falte.

**Filtro del listado**

- [ ] `/esavi-cases?statusCode=IN_INVESTIGATION` envía el parámetro a `002A` (o a `002B` con «mostrar inactivos»).
- [ ] `?statusCode=FOO` no envía el parámetro y no produce 400.
- [ ] El filtro sobrevive a la recarga, cuenta en el contador de activos y se borra con «Limpiar filtros».

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/dashboard/ src/features/home/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** El embudo pasa a una rejilla de 2 columnas, las listas se apilan con la fila en dos líneas de §3.7, y el body no hace scroll horizontal en 375px.
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

**Forma de Inicio**

- **Sí:** Inicio por bloques, cada uno gateado con el rol mínimo de su propia ruta. Los cinco endpoints de `DASH` piden tres roles distintos (`USER`, `ANALYTICS`, `SUPERADMIN`), y un gate único para toda la página dejaría a alguien con un `403` o sin un bloque que sí puede ver.
- **Sí:** el bloque no se monta si no pasa `useCan`, en vez de montarlo y ocultar el resultado. Así no se hace una petición que va a dar `403`.
- **Sí:** una carpeta `features/dashboard/` para los bloques y sus hooks, y `features/home/` solo para componer. La carpeta lleva el nombre del dominio del backend (CONVENTIONS §4), y los FE35–FE38 añaden bloques ahí sin tocar `HomePage` más que para montarlos.
- **No:** `createResource` para `ESAVI-DASH-006`. No es CRUD: no tiene `002A`/`002B`, ni `:id`, ni mutaciones. Un hook a mano sobre el cliente compartido es lo que corresponde, igual que con `ESAVI-CASEFLOW-006`.
- **No:** un hueco o marcador vacío para `ANALYTICS` en el FE34. Un panel vacío parece un error, y los indicadores llegan en el FE35.

**Enlaces**

- **Sí:** el embudo enlaza a la pestaña «Por caso» (`ESAVI-CASE-002A`). Su `count` está acotado por F49, igual que el embudo.
- **No:** enlazar a la bandeja de workflow (`ESAVI-CASEFLOW-002A`). No está acotada por territorio, así que un usuario de provincia vería más casos de los que dice la tarjeta.
- **Sí:** cada `caseCode` lleva a `/esavi-cases/:id/wizard`, sin `:step`. Quien ve un caso detenido quiere seguir donde se quedó, y `CaseWizardPage` ya resuelve ese paso.
- **No:** llevarlo al detalle (`/esavi-cases/:id`). Es un clic más para llegar al mismo sitio.
- **Sí:** «y N más» sin enlace. Ninguna ruta lista todos los estancados ni todas las investigaciones pendientes.
- **No:** enlazar las investigaciones pendientes a `?statusCode=IN_INVESTIGATION`. Esos casos todavía no están en investigación, que es justo lo que el bloque señala: el enlace mostraría otros casos.

**Resaltado por rol**

- **Sí:** todos ven los cuatro sub-bloques, y el rol solo cambia el orden y el énfasis. El payload es igual para todos (F65 §8) y el usuario puede ver todo lo que llega.
- **No:** que cada rol vea solo lo suyo. Los roles están anidados por nivel y lo de cada uno se solapa. Además, ocultar algo no es control de acceso (CONVENTIONS §11).
- **Sí:** el resaltado solo aplica a `NOTIFIER`, `INVESTIGATOR` y `EVALUATOR`. `USER` es de consulta, y `ADMIN`/`SUPERADMIN` no tienen una etapa propia que destacar.
- **Sí:** el rol efectivo es el de mayor nivel (`getEffectiveRoleName`), el mismo que ya muestra el saludo.

**Etiquetas**

- **Sí:** claves `caseWorkflow.status.*` y `caseWorkflow.stage.*` por código, con `statusName` como respaldo. El catálogo solo está en español, y el F65 §8 pide localizar por `statusCode`.
- **Sí:** declarar los 8 códigos a mano en `contracts/declared/caseWorkflow.ts`. El backend los tiene como objeto y `EXTRA_ENUM_APPENDS` solo sabe extraer pares `[...] as const` + `type`. Ampliar el script para un solo uso no compensa.
- **No:** migrar en este spec el stepper, la bandeja y `CatalogSelect` a las claves nuevas. Cambiaría pantallas que no tienen nada que ver con Inicio.

**Frescura**

- **Sí:** `staleTime` de 60 s, el botón «Actualizar» y la hora tomada de `generatedAt`. Es la hora del servidor, que es la que vale para decir «este dato es de tal hora».
- **No:** `refetchInterval`. Inicio queda abierto todo el día, y serían cuatro agregaciones por minuto por usuario. F65 §7 ya avisa del coste.
- **No:** invalidar `['dashboard', …]` desde las mutaciones del wizard. Habría que tocar decenas de hooks por un dato que, al volver a Inicio, casi siempre ya caducó.

**Filtro del listado**

- **Sí:** el filtro `statusCode` va en este spec. Sin él, el embudo no lleva a ningún sitio. Es la misma razón por la que el F65 lo incluyó en el suyo.
- **Sí:** un valor desconocido de `statusCode` se descarta con `.catch(undefined)` y no viaja. Una URL vieja o mal escrita no tiene por qué terminar en una pantalla de error.
- **Sí:** las dos pestañas del listado comparten la clave `statusCode` de la URL. En las dos significa lo mismo, el `code` del catálogo `caseWorkflowStatus`, así que el filtro elegido en una sigue valiendo al pasar a la otra. Renombrar uno de los dos para separarlos rompería los enlaces que ya existen a la bandeja.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| La lista de 8 códigos declarada a mano se desalinea si el backend añade un estado | El helper de etiquetas cae en `statusName`, así que la tarjeta se ve igual. El filtro descartaría el código nuevo sin error. Hay un test que compara `CASE_WORKFLOW_STATUS_CODES` con los `statusCode` de una respuesta MSW con los 8, y el comentario de origen apunta a `caseWorkflow.constants.ts` para la resincronización |
| `dashboard.ts` trae tipos de F66–F69 sin consumidores, y el lint los marca | Son exports de un archivo generado, no variables sin usar. Si el lint protesta, se excluye `src/contracts/` de esa regla, como ya pasa con el resto de contratos |
| El `count` del listado no coincide con la tarjeta del embudo | Para el mismo usuario, F65 §5 garantiza que coinciden. Si no coinciden, el fallo es del backend: se comprueba a mano con un usuario restringido (§5) y se reporta allá |
| El usuario entiende «y N más» como un enlace roto | Va como texto secundario, sin estilo de enlace ni `cursor-pointer`. El filtro que lo resolvería queda anotado como dependencia del backend (§2) |
| Un `ADMIN` ve el país entero y el embudo se vuelve poco útil | Es el comportamiento que F49 y F65 definen para ese rol, no un fallo del cliente. Filtrar Inicio por territorio llega con el `geoLocationId` del validador de periodo, en FE35 |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes | Después |
|---|---|---|
| `features/home/HomePage.tsx` | Saludo y rol | Saludo y rol, más `<PendingWorkBlock>` con `USER` o más |
| Pestaña «Por caso» del listado de casos | 14 claves de URL; el contador y «Limpiar filtros» las cubren | 15: gana `statusCode`, con su `<CatalogSelect>` |
| `esaviCaseFiltersSchema` | Ignora `statusCode` | Lo acepta si es uno de los 8; si no, lo descarta |
| `scripts/syncContracts.mjs` | 3 `IMPORT_REWRITES` | 4, y una entrada más en `SYNC_MAP` |
| `contracts/declared/caseWorkflow.ts` | `CaseWorkflowListRow` | Gana `CASE_WORKFLOW_STATUS_CODES` y `CaseWorkflowStatusCode` |

La bandeja de workflow (`?tab=workflow&statusCode=`) **no cambia su código**, pero desde este spec comparte la clave `statusCode` con la pestaña «Por caso». `handleTabChange` (`EsaviCaseListPage.tsx:112`) solo borra `page` al cambiar de pestaña. Por eso un estado elegido en una pestaña sigue aplicado en la otra, con el mismo significado (§6). Hay una consecuencia que el paso 3 debe cubrir con un test: «Limpiar filtros» de la pestaña «Por caso» quita también el `statusCode` que estuviera filtrando la bandeja.

---

## Lo que **no** está en este spec

- KPIs con periodo (SPEC FE35).
- Curva epidemiológica y distribuciones (SPEC FE36).
- Alertas por lote (SPEC FE37).
- Actividad reciente y del sistema (SPEC FE38).
- La lista completa de estancados y de investigaciones pendientes. Depende de un filtro nuevo en `ESAVI-CASE-002A` del backend.
- Usar las etiquetas nuevas de estado en el stepper, la bandeja y `CatalogSelect`.
- Refresco automático o en tiempo real.
- Invalidar `['dashboard', …]` desde las mutaciones.
- Filtrar por varios estados a la vez.
- Editar el umbral de estancamiento desde Inicio.

Cada uno de esos, si aterriza, va en su propio spec.

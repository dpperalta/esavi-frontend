# SPEC FE38 — Inicio: actividad reciente y del sistema

> **Estado:** Borrador
> **Depende de:** SPEC FE34 (marco de Inicio por bloques, contrato `dashboard.ts`, etiquetas `caseWorkflow.status.*`), SPEC F69 del backend (`ESAVI-DASH-011` y `ESAVI-DASH-012`), SPEC F59 del backend (autor visible según rol), SPEC F42 del backend (detección de reutilización del refresh token)
> **Fecha:** 2026-11-03
> **Objetivo:** Que Inicio muestre qué ha pasado últimamente en los casos del territorio y en cuáles intervino el usuario, y que el SUPERADMIN vea de un vistazo el uso del sistema y cualquier señal de robo de sesión.

---

## 1. Por qué existe este spec

**El trabajo pendiente dice qué falta, no qué se movió.** El FE34 muestra los casos detenidos y las investigaciones sin iniciar, pero no qué cambió desde ayer. Para enterarse, un responsable de territorio tendría que abrir caso por caso. Y quien trabaja en varios expedientes no tiene dónde ver los últimos que tocó. El backend ya resuelve las dos cosas leyendo la auditoría (`appDetails`): es `ESAVI-DASH-011`, especificado en el SPEC F69, y este spec es su consumo.

**El feed tiene huecos declarados que la interfaz no puede rellenar.**
- `STAGE_STARTED` y `STAGE_COMPLETED` no dicen qué etapa: la auditoría no la guarda de forma estructurada.
- `author` llega como email solo para `ADMIN` y `SUPERADMIN`. Para el resto llega `null`, incluso en los eventos del propio usuario (F59).
- No hay «ver más»: el feed cubre 30 días y 20 eventos.

Si la interfaz inventa la etapa o un autor, muestra algo que el servidor no dijo. Este spec decide cómo se presentan esos huecos.

**El SUPERADMIN no tiene dónde ver si alguien le robó una sesión a otro.** El SPEC F42 revoca todas las sesiones de un usuario cuando detecta que se reutilizó un refresh token, que es la huella de un token robado. Esa revocación se registra con el motivo `REUSE_DETECTED`, pero ninguna pantalla lo muestra. `ESAVI-DASH-012` cuenta las sesiones, los usuarios activos y las revocaciones por motivo. Es la única señal de seguridad que llega a la interfaz, y el F69 pide destacarla.

**Son fotos del momento, no indicadores de un periodo.** Ninguno de los dos endpoints recibe parámetros. Por eso no van en la sección «Vigilancia» del FE35, cuya barra de periodo daría a entender que los filtra. «Actividad» se agrupa con el trabajo pendiente, que es la otra foto operativa, y «Sistema» queda aparte, al final, porque es administración y no vigilancia.

---

## 2. Alcance

**Dentro:**

- **Hooks** `useRecentActivity()` (`ESAVI-DASH-011`) y `useSystemActivity()` (`ESAVI-DASH-012`) en `features/dashboard/api.ts`, con `staleTime` de 60 s.
- **Sección «Actividad»** (`features/dashboard/ActivitySection.tsx`), gateada con `useCan(ROLE_LEVELS.USER)` en `HomePage`, **entre «Trabajo pendiente» y «Vigilancia»**:
  - Cabecera con «Actualizado a las HH:mm» y el botón «Actualizar». La respuesta no trae marca de tiempo, así que la hora sale del `dataUpdatedAt` de la query (§3.4).
  - **«Mis casos»:** hasta 10 filas con el `caseCode` enlazado al wizard (`/esavi-cases/:id/wizard`), el estado actual (`caseWorkflow.status.*`), la última acción del usuario y su fecha relativa.
  - **«Actividad del territorio»:** hasta 20 filas con la acción localizada, el `caseCode` enlazado al detalle (`/esavi-cases/:id`), la fecha relativa y, si llega, el autor (email truncado y completo en el tooltip).
  - Lado a lado desde `lg` y apiladas por debajo.
  - Pie: «Últimos {{windowDays}} días».
- **Etiquetas de las 13 acciones**: `dashboard.activity.action.*`, con «Etapa iniciada» y «Etapa completada» sin nombre de etapa.
- **Fechas relativas** con `formatDistanceToNow` de date-fns en el idioma activo, y la fecha y hora exacta en `<time dateTime>` con tooltip.
- **Sección «Sistema»** (`features/dashboard/SystemActivitySection.tsx`), gateada con `useCan(ROLE_LEVELS.SUPERADMIN)`, **al final de Inicio**:
  - 5 contadores: sesiones activas, usuarios activos en 24 h y en 7 días, y sesiones iniciadas en 24 h y en 7 días;
  - las revocaciones de 7 días por motivo en barras CSS (FE35), con los 6 motivos siempre y `UNSPECIFIED`/`OTHER` solo si llegan;
  - con `REUSE_DETECTED > 0`, un aviso `--destructive` arriba del bloque.
- **Orden final de Inicio:**
  - `SUPERADMIN`: saludo, «Trabajo pendiente», «Actividad», «Vigilancia» y «Sistema».
  - `USER`–`ADMIN`: saludo, «Trabajo pendiente», «Actividad» y «Vigilancia».
  - `ANALYTICS`: saludo y «Vigilancia».
- **Estados**: carga, error con reintentar (uno por sección), sin territorio, feed vacío y «Mis casos» vacío.

**Fuera de alcance (otros specs):**

- **Actividad de las ~22 tablas satélite** (notificación, vacunas, investigación…). El F69 lee solo `esaviCase` y `caseWorkflow` (§6).
- **Mostrar qué etapa se inició o completó**, o derivarla del estado actual. El feed no trae el estado.
- **«Ver más» o paginar el feed.** El historial completo está en el detalle del caso.
- **Marcar eventos como leídos, o «desde mi última visita».** Exige guardar estado por usuario.
- **Mostrar `method`.** Es material de soporte (F69 §8).
- **Una lista de sesiones o de usuarios conectados**, o revocar sesiones desde Inicio. No existe ninguna ruta para eso.
- **IP, agente de usuario o intentos de login fallidos.** El backend no los expone o no los registra.
- **Notificaciones push o en tiempo real**, o refresco automático.
- **Ventana o tope configurables.** Son constantes del backend.

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay rutas nuevas. Todo vive en `/`.

| Pieza | Archivo | Guard |
|---|---|---|
| Hooks | `features/dashboard/api.ts` (`useRecentActivity`, `useSystemActivity`, ampliado) | — |
| Sección «Actividad» | `features/dashboard/ActivitySection.tsx` (nuevo) | `useCan(ROLE_LEVELS.USER)` en `HomePage` |
| «Mis casos» | `features/dashboard/MyCasesList.tsx` (nuevo) | Dentro de la sección |
| «Actividad del territorio» | `features/dashboard/TerritoryActivityFeed.tsx` (nuevo) | Ídem |
| Fecha relativa | `features/dashboard/RelativeTime.tsx` (nuevo) | — |
| Sección «Sistema» | `features/dashboard/SystemActivitySection.tsx` (nuevo) | `useCan(ROLE_LEVELS.SUPERADMIN)` en `HomePage` |
| Inicio | `features/home/HomePage.tsx` (ampliada) | Monta las dos secciones en el orden de §2 |

**Destinos de los enlaces:**
- `caseCode` de «Mis casos» → `/esavi-cases/:caseId/wizard`, sin `:step`, que reanuda el caso (SPEC FE08 §4);
- `caseCode` del feed → `/esavi-cases/:caseId`, el detalle.

### 3.2 Endpoints consumidos

```
GET    /api/dashboard/recent-activity    ESAVI-DASH-011    USER         feed del territorio y «Mis casos»
GET    /api/dashboard/system-activity    ESAVI-DASH-012    SUPERADMIN   sesiones y revocaciones
```

Ninguno recibe parámetros. No usan `useDashboardPeriod()`.

### 3.3 Tipos del contrato

No hay sincronización nueva: los tipos ya llegan con el sync del FE34.

```ts
// contracts/dashboard.ts (F69 §3.3)
type DashboardActivityAction =
  'CASE_CREATED' | 'CASE_UPDATED' | 'CASE_DEACTIVATED' | 'CASE_ACTIVATED' |
  'WORKFLOW_DEACTIVATED' | 'WORKFLOW_ACTIVATED' | 'STAGE_STARTED' | 'STAGE_COMPLETED' |
  'CASE_CLOSED' | 'CASE_REOPENED' | 'VALIDATION_REQUESTED' | 'VALIDATION_RESOLVED' | 'OTHER';

interface DashboardActivityEvent { caseId; caseCode; occurredAt: string; method: string; action; author: string | null }
interface DashboardMyCase { caseId; caseCode; statusCode: string; lastActionAt: string; lastAction }
interface DashboardRecentActivity {
  windowDays: number;
  scope: { restricted: boolean; hasAssignments: boolean };
  territory: DashboardActivityEvent[];   // ≤ 20, newest first
  myCases: DashboardMyCase[];            // ≤ 10, by the user's last action
}
interface DashboardSystemActivity {
  generatedAt: string;
  activeSessions: number; activeUsers24h: number; activeUsers7d: number;
  sessionsStarted24h: number; sessionsStarted7d: number;
  revocations7d: { reason: string; count: number }[];   // the 6 always; UNSPECIFIED / OTHER if present
}
```

- **`DashboardRecentActivity` no trae `generatedAt`.** La hora de «Actualizado a las…» de «Actividad» sale del `dataUpdatedAt` de la query, y la de «Sistema», de `generatedAt`. Ver §3.4.
- **`reason` es `string`, no un enum.** Las etiquetas se buscan por código, y un código sin etiqueta se muestra como `OTHER`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Actividad reciente | TanStack Query | `['dashboard', 'recentActivity']` | `staleTime` 60 s; ninguna mutación la invalida, como el FE34 |
| Hora de «Actividad» | TanStack Query | `dataUpdatedAt` de esa query | Es la única marca disponible. Es metadato de la caché, no un dato del servidor copiado |
| Actividad del sistema | TanStack Query | `['dashboard', 'systemActivity']` | `staleTime` 60 s |
| Hora de «Sistema» | TanStack Query | `data.generatedAt` | La hora del servidor, como en el FE34 |
| «Actualizar» en curso | TanStack Query | `isFetching` de cada query | Un botón por sección |
| Etiqueta de acción | Derivado | `dashboard.activity.action.<action>` | Un `action` desconocido usa `OTHER` |
| Etiqueta de motivo | Derivado | `dashboard.system.reason.<reason>` | Un `reason` desconocido usa `OTHER` |
| Fecha relativa | Derivado | `formatDistanceToNow(occurredAt, { locale })` en `RelativeTime` | Se recalcula en cada render y no se refresca sola entre peticiones |
| Aviso de reutilización | Derivado | el `count` de `REUSE_DETECTED` mayor que 0 | — |

- **Nada en la URL.** Las dos secciones no tienen filtros ni vistas.
- **Nada en `useState`** que venga del servidor.

### 3.5 Formularios y validación

No hay formularios ni entradas.

### 3.6 Estados de la pantalla

**Sección «Actividad»:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de dos columnas, con 4 filas cada una | — |
| Error | Un mensaje por `code` (`errors.network` o `dashboard.activity.error`) y «Reintentar», para las dos listas | `dashboard.activity.error` |
| Sin territorio (`hasAssignments = false`) | El aviso del FE34, en lugar de las dos listas | `dashboard.pendingWork.noAssignments` (FE34) |
| «Mis casos» vacío | «No has intervenido en ningún caso en los últimos {{days}} días» | `dashboard.activity.myCases.empty` |
| Feed vacío | «No hay actividad en tu territorio en los últimos {{days}} días» | `dashboard.activity.territory.empty` |
| `author: null` | Sin autor, ni guion ni «desconocido»: el dato no se le muestra a ese rol | — |
| `STAGE_STARTED` / `STAGE_COMPLETED` | «Etapa iniciada» / «Etapa completada», sin nombre de etapa | `dashboard.activity.action.STAGE_*` |
| Estado desconocido en «Mis casos» | El código tal cual: `DashboardMyCase` no trae `statusName` de respaldo | — |

**Sección «Sistema»:**

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de 5 contadores y 6 barras | — |
| Error | Mensaje por `code` (`errors.network` o `dashboard.system.error`) y «Reintentar» | `dashboard.system.error` |
| `REUSE_DETECTED > 0` | Aviso `--destructive` arriba: «{{count}} reutilizaciones de token detectadas en 7 días: posible robo de sesión. Las sesiones de esos usuarios ya fueron revocadas» | `dashboard.system.reuseAlert` |
| Todos los motivos en 0 | Las 6 barras en 0, con «Sin revocaciones en 7 días» | `dashboard.system.noRevocations` |

### 3.7 Responsividad y accesibilidad

- **«Actividad».**
  - «Mis casos» y el feed lado a lado desde `lg`, y apilados por debajo, con «Mis casos» primero.
  - **Fila del feed:** en `md+`, una línea con la acción, el `caseCode`, la fecha relativa y el autor. Por debajo de `md`, dos líneas: la acción y el código arriba, la fecha y el autor abajo.
  - **Autor:** truncado con elipsis a 24 caracteres, con el email completo en el tooltip y en el `title`.
  - **Fila de «Mis casos»:** el código, el estado, la última acción y la fecha relativa. En dos líneas por debajo de `md`.
  - Cada lista es una `<ol>`, porque el orden importa.
- **«Sistema».**
  - Los contadores, en 5 columnas desde `lg`, 3 en `md` y 2 por debajo.
  - Las barras de revocaciones son CSS, con el conteo en texto y la barra con `aria-hidden`.
  - El aviso de reutilización usa `role="alert"` solo al aparecer, no en cada refetch, para no repetirse en el lector de pantalla.
- **Fechas.** `<time dateTime={iso}>` con la fecha relativa visible y la exacta (`PPpp` de date-fns en el idioma activo) en el tooltip.
- **Enlaces.** Los `caseCode` son `<Link>` con texto visible, y el destino distinto de cada lista se nota en el `aria-label`: «Retomar {{code}}» y «Ver {{code}}».
- Las secciones son `<section>` con `aria-labelledby`. El body no hace scroll horizontal a 375 px.

### 3.8 Claves i18n nuevas

Todas van en `es`, `en` y `nl`.

| Clave | Uso |
|---|---|
| `dashboard.activity.title` | «Actividad» |
| `dashboard.activity.error` | Error de la sección |
| `dashboard.activity.window` | «Últimos {{days}} días» |
| `dashboard.activity.updatedAt` / `dashboard.activity.refresh` | Hora y botón |
| `dashboard.activity.myCases.{title,empty,resume}` | «Mis casos», vacío y `aria-label` «Retomar {{code}}» |
| `dashboard.activity.territory.{title,empty,view}` | «Actividad del territorio», vacío y `aria-label` «Ver {{code}}» |
| `dashboard.activity.action.{CASE_CREATED,CASE_UPDATED,CASE_DEACTIVATED,CASE_ACTIVATED,WORKFLOW_DEACTIVATED,WORKFLOW_ACTIVATED,STAGE_STARTED,STAGE_COMPLETED,CASE_CLOSED,CASE_REOPENED,VALIDATION_REQUESTED,VALIDATION_RESOLVED,OTHER}` | Las 13 acciones |
| `dashboard.activity.byAuthor` | «por {{author}}» |
| `dashboard.system.title` | «Sistema» |
| `dashboard.system.error` | Error de la sección |
| `dashboard.system.updatedAt` / `dashboard.system.refresh` | Hora y botón |
| `dashboard.system.counters.{activeSessions,activeUsers24h,activeUsers7d,sessionsStarted24h,sessionsStarted7d}` | Los 5 contadores |
| `dashboard.system.revocations.title` | «Revocaciones de sesión en 7 días» |
| `dashboard.system.reason.{LOGOUT,LOGOUT_ALL,REUSE_DETECTED,PASSWORD_CHANGED,PASSWORD_RESET,ABSOLUTE_MAX_REACHED,UNSPECIFIED,OTHER}` | Los 8 motivos |
| `dashboard.system.reuseAlert` | Aviso de reutilización |
| `dashboard.system.noRevocations` | «Sin revocaciones en 7 días» |

---

## 4. Plan de implementación

Primero van los hooks y las piezas sin pantalla, después las dos secciones y al final el orden de Inicio. Cada paso compila y se puede committear por separado. **Requisito previo: el FE34 implementado**, porque de él salen `contracts/dashboard.ts`, `features/dashboard/`, el marco de bloques de `HomePage` y las etiquetas `caseWorkflow.status.*`.

1. **Hooks.** `useRecentActivity()` y `useSystemActivity()` en `features/dashboard/api.ts`, con las claves `['dashboard', 'recentActivity']` y `['dashboard', 'systemActivity']` y `staleTime` de 60 s. Citan `ESAVI-DASH-011` y `ESAVI-DASH-012` en comentarios.
   *Verificación:* tests con MSW que comprueban que cada hook desenvuelve su envelope, y que montarlo dos veces en menos de 60 s produce una sola petición.

2. **Fecha relativa.** `RelativeTime.tsx` recibe un ISO y muestra `formatDistanceToNow` en el idioma activo, dentro de un `<time dateTime>` con la fecha exacta en el tooltip. Usa los locales `enUS`, `es` y `nl` de `date-fns/locale`, que la app ya importa en otras pantallas.
   *Verificación:* con un reloj fijo, un ISO de hace 3 horas se ve «hace 3 horas» en `es`, «3 hours ago» en `en` y su equivalente en `nl`, y el atributo `dateTime` es el ISO recibido.

3. **Listas de «Actividad».**
   - `MyCasesList.tsx`: código enlazado a `/wizard`, estado (`caseWorkflow.status.*`, con el código como respaldo), última acción y fecha relativa.
   - `TerritoryActivityFeed.tsx`: acción, código enlazado al detalle, fecha relativa y autor solo si llega.
   - Las 13 claves `dashboard.activity.action.*` en los tres idiomas.

   Antes de escribir JSX se cargan `ui-ux-pro-max` y `ui-styling`.
   *Verificación:*
   - un evento con `author: null` no muestra autor ni marcador;
   - uno con email lo muestra truncado, con el completo en el tooltip;
   - `STAGE_COMPLETED` se lee «Etapa completada»;
   - un `action` desconocido se lee como `OTHER`;
   - el `href` de «Mis casos» termina en `/wizard` y el del feed no;
   - con `ADMIN` y con `USER` las listas se ven igual, salvo el autor.

4. **Sección «Actividad».** `ActivitySection.tsx` con la cabecera (hora de `dataUpdatedAt` y «Actualizar»), las dos listas en la disposición de §3.7, el pie «Últimos N días» y los estados de §3.6.
   *Verificación:*
   - con `hasAssignments: false` se ve el aviso de sin territorio y ninguna lista;
   - con las dos listas vacías se ve cada texto de vacío con `windowDays`;
   - un 500 muestra un solo error con «Reintentar» y deja visible «Trabajo pendiente».

5. **Sección «Sistema».** `SystemActivitySection.tsx` con:
   - los 5 contadores;
   - las barras de revocaciones, con los motivos en el orden recibido y una etiqueta por código (`OTHER` como respaldo);
   - el aviso de `REUSE_DETECTED` con `role="alert"` solo al aparecer;
   - la hora de `generatedAt` y «Actualizar».

   *Verificación:*
   - con `REUSE_DETECTED: 2` se ve el aviso `--destructive` con «2»;
   - con 0 no hay aviso;
   - con un motivo `FOO` se ve como «Otro»;
   - un refetch con el mismo `count` no vuelve a anunciar el aviso.

6. **Orden de Inicio.** `HomePage.tsx` monta «Actividad» con `useCan(USER)` entre «Trabajo pendiente» y «Vigilancia», y «Sistema» con `useCan(SUPERADMIN)` al final. Las claves de §3.8 van en los tres idiomas.
   *Verificación:*
   - con `ANALYTICS`: saludo y «Vigilancia», sin peticiones a `/recent-activity` ni `/system-activity` (MSW con `onUnhandledRequest: 'error'`);
   - con `USER` y con `ADMIN`: las cuatro secciones sin «Sistema», y sin petición a `/system-activity`;
   - con `SUPERADMIN`: las cinco, en el orden de §2;
   - los tests de FE34 a FE37 siguen pasando.

7. **Revisión de interfaz.** Pasar `web-design-guidelines` sobre las dos secciones, y probar a mano el tema oscuro, 375 px y los roles `ANALYTICS`, `USER`, `ADMIN` y `SUPERADMIN`.
   *Verificación:* el bloque de cierre de §5 queda marcado.

---

## 5. Criterios de aceptación

**Superficie**

- [ ] `grep -rn "ESAVI-DASH-011\|ESAVI-DASH-012" src/features/dashboard/api.ts` devuelve los dos comentarios.
- [ ] Con `ANALYTICS` no hay peticiones a `/recent-activity` ni a `/system-activity`.
- [ ] Con `USER`, `NOTIFIER`, `INVESTIGATOR`, `EVALUATOR` y `ADMIN` hay petición a `/recent-activity` y no a `/system-activity`.
- [ ] Con `SUPERADMIN` hay petición a las dos.

**Orden de Inicio**

- [ ] `SUPERADMIN` ve: saludo, «Trabajo pendiente», «Actividad», «Vigilancia» y «Sistema».
- [ ] De `USER` a `ADMIN` ven: saludo, «Trabajo pendiente», «Actividad» y «Vigilancia».
- [ ] `ANALYTICS` ve: saludo y «Vigilancia».

**«Mis casos»**

- [ ] Muestra hasta 10 filas en el orden recibido, con el código, el estado (`caseWorkflow.status.*`), la última acción localizada y la fecha relativa.
- [ ] El código lleva a `/esavi-cases/:caseId/wizard`, con `aria-label` «Retomar {{code}}».
- [ ] Vacío, dice «No has intervenido en ningún caso en los últimos N días», con N tomado de `windowDays`.

**«Actividad del territorio»**

- [ ] Muestra hasta 20 filas en el orden recibido, con la acción localizada, el código, la fecha relativa y el autor solo si `author` no es `null`.
- [ ] El código lleva a `/esavi-cases/:caseId`, con `aria-label` «Ver {{code}}».
- [ ] `STAGE_STARTED` y `STAGE_COMPLETED` se leen «Etapa iniciada» y «Etapa completada», sin nombre de etapa.
- [ ] Un `action` desconocido se lee como «Otra acción», y `method` no aparece en ningún texto visible ni `aria-label`.
- [ ] Un email de más de 24 caracteres se trunca con elipsis y se ve completo en el tooltip.
- [ ] Vacío, dice «No hay actividad en tu territorio en los últimos N días».
- [ ] Con `hasAssignments: false`, en lugar de las dos listas se ve el aviso de sin territorio.

**«Sistema»**

- [ ] Los 5 contadores muestran sus valores.
- [ ] Las barras muestran los 6 motivos siempre, y `UNSPECIFIED`/`OTHER` solo si llegan. Un motivo desconocido se lee «Otro».
- [ ] Con `REUSE_DETECTED > 0` se ve el aviso `--destructive` con el número, anunciado una sola vez al aparecer. Con 0 no hay aviso.
- [ ] Con todas las revocaciones en 0 se ve «Sin revocaciones en 7 días».
- [ ] La hora de la cabecera sale de `generatedAt`.

**Fechas y frescura**

- [ ] Cada fecha relativa va en un `<time dateTime>` con el ISO recibido y la fecha exacta en el tooltip, en el idioma activo.
- [ ] Volver a Inicio antes de 60 s no repite las peticiones; después de 60 s, sí.
- [ ] «Actualizar» vuelve a pedir el dato de su sección y se deshabilita mientras dura.

**Errores**

- [ ] Un 500 de `/recent-activity` muestra un solo error con «Reintentar» en «Actividad», y deja visibles «Trabajo pendiente» y «Vigilancia».
- [ ] Un 500 de `/system-activity` solo afecta a «Sistema».
- [ ] Un 403 inesperado en cualquiera de las dos se maneja igual, sin pantalla en blanco.

**Color**

- [ ] `grep -rnE "(text|bg|border)-(destructive|warning)|variant=\"(destructive|warning)\"" src/features/dashboard/` solo encuentra `BatchAlertCard.tsx`, `BatchAlertsBlock.tsx` (FE37) y `SystemActivitySection.tsx`.

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/dashboard/ src/features/home/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.**
  - Las filas del feed y de «Mis casos» parten en dos líneas, y los contadores van en 2 columnas.
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

No aplica el ítem de la cola de refresh: el spec no toca la sesión, solo informa de sus revocaciones.

---

## 6. Decisiones tomadas y descartadas

**Ubicación**

- **Sí:** «Actividad» entre «Trabajo pendiente» y «Vigilancia». Las dos primeras son fotos operativas sin periodo, y ponerla bajo la barra de periodo daría a entender que la filtra.
- **Sí:** «Sistema» al final de Inicio. Es administración, no vigilancia, y lo ve un solo rol. Arriba empujaría hacia abajo lo que todos los demás vienen a ver.
- **Sí:** cada sección se monta solo si pasa su `useCan`. Así no hay ninguna petición que termine en 403, igual que en el FE34.

**Enlaces**

- **Sí:** «Mis casos» lleva al wizard. Son casos en los que el usuario trabaja, y lo natural es retomarlos donde se quedaron, igual que en el FE34.
- **Sí:** el feed lleva al detalle. Son eventos de otros, y lo primero es ver qué pasó, no entrar a editar.
- **Sí:** el `aria-label` distingue «Retomar» de «Ver». Dos enlaces con el mismo texto visible y destinos distintos confunden a un lector de pantalla.

**Feed**

- **Sí:** «Etapa iniciada» y «Etapa completada» sin nombre de etapa. El feed no trae la etapa ni el estado, y deducirla sería mostrar algo que el servidor no dijo (F69 §8).
- **No:** pedir el workflow de cada caso del feed para saber la etapa. Serían 20 peticiones por carga de Inicio para un detalle que el detalle del caso ya muestra.
- **Sí:** no mostrar nada cuando `author` es `null`. El F59 decide que esos roles no ven el autor, y un «desconocido» sugeriría que el dato falta, no que está oculto.
- **No:** mostrar `method`. Es material de soporte (F69 §8), y un código `ESAVI-CASEFLOW-007` no dice nada a quien vigila casos.
- **Sí:** fechas relativas, con la exacta en el tooltip. En un feed, «hace 3 horas» se lee antes que una fecha completa, y la exacta sigue a un paso.
- **No:** refrescar las fechas relativas con un temporizador. Se recalculan en cada render y en cada refetch; un «hace 3 horas» que dura unos minutos más no cambia ninguna decisión.
- **Sí:** la hora de «Actividad» sale de `dataUpdatedAt`, porque la respuesta no trae `generatedAt`. Es metadato de la caché, no un dato del servidor copiado a otra capa.

**Sistema**

- **Sí:** el aviso `--destructive` con `REUSE_DETECTED > 0`. Es la huella de un token robado (F42), y el F69 pide destacarla. Es la segunda excepción de color del dominio, con la misma razón que las alertas por lote: exige actuar.
- **Sí:** `role="alert"` solo al aparecer. Si se repitiera en cada refetch, el lector de pantalla lo anunciaría cada minuto.
- **No:** enlazar el aviso a una lista de sesiones. No existe ninguna ruta de sesiones en `API-ROUTES.md`.
- **Sí:** los 6 motivos siempre, aunque estén en 0. Ver «reutilización: 0» es información, y que el motivo desaparezca no lo es.
- **Sí:** un motivo desconocido se muestra como «Otro». `reason` es texto en el contrato, y un motivo nuevo del backend no debe dejar una barra sin etiqueta.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El feed lee `appDetails` de muchos casos y se vuelve lento en un territorio grande | Es un riesgo del backend, con la condición de entrada de F65 §7. El cliente pide el feed una vez por minuto como mucho (`staleTime` de 60 s), sin `refetchInterval` |
| La hora de «Actividad» (hora del cliente) y la de «Sistema» (hora del servidor) difieren si el reloj del navegador está desfasado | Son secciones distintas, y la diferencia solo se nota con un desfase de minutos. Unificarlas exigiría que el F69 devuelva `generatedAt` en `011`, que se puede pedir al backend si molesta |
| Un `SUPERADMIN` ve el aviso de reutilización y no tiene dónde actuar | El aviso dice que las sesiones ya fueron revocadas (F42). Revisar quién fue requiere una ruta de sesiones que no existe, y queda fuera (§2) |
| Un `ADMIN` ve emails de autores en Inicio, que puede estar proyectado en una reunión | Es lo que el F59 decide para ese rol. El email va truncado, y el completo solo aparece en el tooltip |
| `formatDistanceToNow` con el locale `nl` no está cargado en el bundle | `RelativeTime` importa `enUS`, `es` y `nl` de `date-fns/locale`, como ya hacen `AuditTrail` y otras tres pantallas. Un test del paso 2 lo comprueba en los tres idiomas |
| Inicio de un `SUPERADMIN` hace 7 peticiones al cargar | Son independientes, van en paralelo y cada sección carga y falla por su cuenta. Con `staleTime`, volver a Inicio no repite ninguna antes de su tiempo |

---

## 8. Impacto en pantallas existentes

| Pieza | Antes (tras FE37) | Después |
|---|---|---|
| `features/home/HomePage.tsx` | Saludo, «Trabajo pendiente» y «Vigilancia» | Más «Actividad» entre los dos (`USER+`) y «Sistema» al final (`SUPERADMIN`) |

No cambia ninguna primitiva ni ninguna pantalla fuera de Inicio.

---

## Lo que **no** está en este spec

- Actividad de las tablas satélite del caso.
- Mostrar qué etapa se inició o completó.
- «Ver más» o paginar el feed.
- Marcar eventos como leídos, o «desde mi última visita».
- Mostrar `method`.
- Una lista de sesiones o de usuarios conectados, o revocar sesiones desde Inicio.
- IP, agente de usuario o intentos de login fallidos.
- Notificaciones push, tiempo real o refresco automático.
- Ventana o tope configurables.

Cada uno de esos, si aterriza, va en su propio spec.

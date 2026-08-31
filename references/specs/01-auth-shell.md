# SPEC FE01 — Shell de la aplicación y autenticación

> **Estado:** Aprobado
> **Depende de:** SPEC F42 del backend (rotación del refresh token con detección de reutilización), SPEC F43 del backend (restablecimiento de contraseña por autoservicio)
> **Fecha:** 2026-08-31
> **Objetivo:** Levantar el cliente y cerrar el ciclo completo de la sesión —entrar, mantenerse, salir— sobre un layout con sidebar, temas y preferencias.

---

## 1. Por qué existe este spec

**El repositorio no tiene código.** Contiene `references/`, `CLAUDE.md` y los skills de `.claude/`; no hay `package.json`, ni `src/`, ni `index.html`. Este spec es el primero de la serie y su plan empieza por el scaffold.

**Es el hito 1 de `ARCHITECTURE.md` §12, y es el que más decide.** No entrega ninguna pantalla de negocio: entrega la infraestructura sobre la que se apoyan las otras cuatro. El propio documento lo dice — *«si la fábrica de recursos y las primitivas salen bien ahí, los hitos 2 y 3 son configuración; si salen mal, se arrastra el error 45 veces»*.

**Sin sesión no hay nada más que construir.** Las 323 rutas del inventario, salvo cinco de autenticación, exigen un token válido. Mientras el cliente no sepa iniciar sesión, renovarla y cerrarla, ninguna pantalla del hito 2 puede escribirse ni probarse.

**Es el consumo de dos specs del backend ya implementados.** `SPEC F42` rota el refresh token y revoca todas las sesiones del usuario si detecta uno reutilizado; eso convierte la cola de refresh en un requisito estricto del cliente, no en una optimización. `SPEC F43` puso en producción el restablecimiento de contraseña, y hoy no hay ninguna pantalla que lo consuma.

**Dos hallazgos del backend condicionan el diseño**, verificados en el código y no supuestos:

**A — El nivel de rol no puede salir del login.** `validateUserRole` autoriza con `role.level ?? ROLE_LEVELS[name] ?? 0` (`roleValidation.middleware.ts:16-22`): la columna `appRole.level` es la autoridad. La respuesta del login devuelve `roles` como `{ roleId, name, code }`, **sin `level`** (`auth.service.ts:95-99`); `GET /api/users/me` sí lo incluye (`user.service.ts:26-31`). Un `useCan()` alimentado por el login evaluaría mal cualquier rol creado por la API con un `level` propio.

**B — Todo usuario entra por primera vez con `requiresPasswordChange: true`.** `createUserService` la fija así al dar de alta (`user.service.ts:135`), y sólo la limpian `ESAVI-USER-006` y `ESAVI-AUTH-007`. Es el camino de entrada de cada persona al sistema, no un caso borde.

---

## 2. Alcance

**Dentro:**

- **Scaffold.** Vite + React 19 + TypeScript, la estructura de carpetas de `ARCHITECTURE.md` §9, Tailwind v4 con los tokens semánticos, shadcn/ui, y los ocho comandos npm de `CONVENTIONS.md` §13.
- **`index.html`** con el script anti-parpadeo de `ARCHITECTURE.md` §6.4.
- **`shared/api/client.ts`** — axios con el envelope desenvuelto, `EsaviApiError` con su `code`, el `?lang=` del interceptor de petición y la cola de refresh con un solo refresco en vuelo.
- **`TokenStore`** tras interfaz, implementado con `localStorage` (fase 1 de §11.1).
- **Sesión** — login, logout, `logout-all`, y `['user', 'me']` como única fuente del usuario y su nivel efectivo.
- **Pantallas públicas** — `/login`, `/forgot-password`, `/reset-password`.
- **Cambio de contraseña propio** (`ESAVI-USER-006`), y el bloqueo blando cuando `requiresPasswordChange` es `true`.
- **Autorización espejo** — `ROLE_LEVELS`, `useCan()` y `<RequireRole>`.
- **Layout** — `AppShell` con `Topbar` y sidebar colapsable en escritorio, drawer por debajo de `md`, alimentado por `shared/config/navigation.ts` con los seis grupos de §5.2 y los hijos aún no construidos deshabilitados.
- **Temas** — `data-theme` con `light`/`dark`/`system` y suscripción viva a `matchMedia`.
- **Preferencias** — `preferencesStore` con `zustand/persist` tras la interfaz `PreferencesStore`, con los seis campos de §7.2 declarados y dos expuestos en la interfaz: tema e idioma.
- **i18n** — react-i18next con `es`, `en` y `nl` traducidos de verdad, y `npm run i18n:check`.
- **Página de inicio** mínima en `/`, con el saludo y el rol efectivo.
- **Los cuatro tests** acordados, con MSW simulando el envelope exacto.

**Fuera de alcance (otros specs):**

- **`createResource` y las primitivas** (`<ResourceTable>`, `<ResourceForm>`, `<CatalogSelect>`, `<GeoLocationPicker>`, `<AuditTrail>`). Se escriben en el hito 2, contra catálogos reales que las validen. Una fábrica diseñada sin una sola entidad que la consuma se diseña a ciegas, y es la pieza que menos conviene equivocar.
- **La paleta de comandos** (`Ctrl/Cmd + K`). Se difiere al hito 2: en el hito 1 el menú navegable tiene una entrada, no cuarenta. Se alimentará del mismo `navigation.ts`, que ya queda escrito.
- **La administración de usuarios y roles** (`ESAVI-USER-001`…`005B`, `ESAVI-APPROLE-*`, `ESAVI-USERROLE-*`, `ESAVI-USERGEO-*`). Es una feature del hito 2 con sus seis artefactos.
- **La página de perfil editable** (`ESAVI-USER-004`). En este spec el menú del `Topbar` sólo muestra identidad y ofrece cambiar la contraseña.
- **Preferencias en el servidor.** No hay dónde guardarlas: `appUser` no tiene columna y `systemConfig` es global (§7.1). Exige un spec del backend para `appUserPreference`.
- **Refresh token en cookie `httpOnly`.** Es la fase 2 de §11.1 y exige un spec del backend.
- **`density`, `pageSize` y `tableColumns` en la interfaz.** Existen en el store con su valor por defecto; se exponen en el hito 2, cuando haya una tabla que los consuma.
- **Trabajo sin conexión.** Descartado explícitamente en el repositorio.

### Dependencias de configuración del backend

No son trabajo de este spec, pero sin ellas dos criterios de aceptación no pueden cumplirse:

- **`systemConfig.ESAVI_PASSWORD_RESET_URL` está sembrado vacío** (`systemConfig.defaults.ts:165`). Hay que cargarlo con `ESAVI-SYSCONF-004` apuntando a `/reset-password` del frontend, o el correo de recuperación llega con un enlace roto.
- **El correo tiene que salir.** `ESAVI-AUTH-006` responde `200` aunque el SMTP falle, deliberadamente. Si `ESAVI_MAIL_FROM` y el transporte no están configurados, la pantalla de «revisa tu correo» será correcta y no llegará nada.

---

## 3. Diseño

### 3.1 Pantallas y rutas

Este spec introduce **dos guards distintos**, y no son intercambiables:

- **`<RequireAuth>`** — exige sesión, sin mirar el rol. Redirige a `/login` guardando la ruta pretendida en el `state` del `navigate`.
- **`<RequireRole level>`** — exige un nivel mínimo, y presupone sesión. En este spec no lo usa ninguna ruta todavía: se escribe y se prueba aquí porque el hito 2 lo necesita en las seis entidades a la vez.

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Login | `/login` | `features/auth/LoginPage.tsx` | Público; con sesión activa redirige a `/` |
| Olvidé mi contraseña | `/forgot-password` | `features/auth/ForgotPasswordPage.tsx` | Público |
| Restablecer contraseña | `/reset-password` | `features/auth/ResetPasswordPage.tsx` | Público; lee `?token=` de la URL |
| Inicio | `/` | `features/home/HomePage.tsx` | `<RequireAuth>` |
| No encontrada | `*` | `app/NotFoundPage.tsx` | — |

**El cambio de contraseña no es una ruta.** Es `features/auth/ChangePasswordForm.tsx`, montado en un `Dialog` desde dos sitios: el menú del `Topbar` (descartable) y el bloqueo blando de `requiresPasswordChange` (no descartable). Un solo formulario, dos envolturas.

**Adición declarada a `ARCHITECTURE.md` §9:** la lista de `features/` no contempla `home/`. Se añade, porque la página de inicio no pertenece a `auth/` ni a `app/layout/`. Es una carpeta nueva en la estructura, no una estructura distinta.

**Entradas de `shared/config/navigation.ts`.** Los seis grupos de §5.2, con un solo hijo navegable y el resto deshabilitados. El `minLevel` es el rol mínimo de la ruta de listado de esa entidad, copiado de `API-ROUTES.md`:

| Grupo | Hijo | `minLevel` | Origen | Estado |
|---|---|---|---|---|
| — | Inicio | `ANALYTICS` 10 | no consume ruta | **navegable** |
| Casos | Casos ESAVI | `USER` 25 | `ESAVI-CASE-002A` | deshabilitado |
| Casos | Pacientes | `USER` 25 | `ESAVI-PATIENT-002A` | deshabilitado |
| Casos | Clasificación final | `USER` 25 | `ESAVI-FINCLASS-002A` | deshabilitado |
| Notificación | Notificaciones | `USER` 25 | `ESAVI-NOTIFCN-002A` | deshabilitado |
| Notificación | Notificadores | `USER` 25 | `ESAVI-NOTIFIER-002A` | deshabilitado |
| Investigación | Investigaciones | `USER` 25 | `ESAVI-INVESTGN-002A` | deshabilitado |
| Catálogos clínicos | Términos diagnósticos | `USER` 25 | `ESAVI-DIAGTERM-002A` | deshabilitado |
| Catálogos clínicos | Vacunas WHODrug | `USER` 25 | `ESAVI-WHODRUG-002A` | deshabilitado |
| Catálogos clínicos | Diluyentes | `USER` 25 | `ESAVI-DILUENT-002A` | deshabilitado |
| Geografía y unidades | Niveles geográficos | `USER` 25 | `ESAVI-GEOLVL-002` | deshabilitado |
| Geografía y unidades | Ubicaciones | `USER` 25 | `ESAVI-GEOLOC-002` | deshabilitado |
| Geografía y unidades | Unidades de salud | `USER` 25 | `ESAVI-HFAC-002A` | deshabilitado |
| Administración | Usuarios | `ADMIN` 50 | `ESAVI-USER-002A` | deshabilitado |
| Administración | Roles | `USER` 25 | `ESAVI-APPROLE-002A` | deshabilitado |
| Administración | Tipos de catálogo | `USER` 25 | `ESAVI-CATTYPE-002` | deshabilitado |
| Administración | Elementos de catálogo | `USER` 25 | `ESAVI-CATITEM-002A` | deshabilitado |
| Administración | Configuración del sistema | `USER` 25 | `ESAVI-SYSCONF-002A` | deshabilitado |

Un hijo deshabilitado se renderiza visible y no navegable, con marca de «próximamente» y `aria-disabled="true"`. El filtro por rol se aplica igual que a los navegables: un `ANALYTICS` no ve ninguno, y sólo un `ADMIN` ve «Usuarios».

**Observación sobre dos `minLevel` que sorprenden.** `GET /api/roles` (`ESAVI-APPROLE-002A`) y `GET /api/system-configs` (`ESAVI-SYSCONF-002A`) tienen rol mínimo `USER` en el inventario, aunque sus escrituras sean `ADMIN`. Se copian tal cual, según `CONVENTIONS.md` §5. Si es un error, es del backend y se corrige ahí.

**Los satélites del expediente no son entradas de menú.** `notificationEvent`, `notificationVaccine`, los catorce satélites de `investigation` y el resto se listan por el id de su padre (`/notification/:id`, `/investigation/:id`), no por `/`. Son pasos del wizard del hito 4, y una entrada de menú que exige un id que el usuario no tiene sería un enlace imposible. Por eso los grupos «Notificación» e «Investigación» tienen una entrada cada uno y no seis y catorce.

### 3.2 Endpoints consumidos

```
POST   /api/auth/login              ESAVI-AUTH-001   público   iniciar sesión
POST   /api/auth/refresh            ESAVI-AUTH-002   público   renovar; rota el token
POST   /api/auth/logout             ESAVI-AUTH-003   público   revoca la sesión del token del body
POST   /api/auth/logout-all         ESAVI-AUTH-004   USER      revoca todas las sesiones
POST   /api/auth/forgot-password    ESAVI-AUTH-006   público   solicita el enlace; responde 200 siempre
POST   /api/auth/reset-password     ESAVI-AUTH-007   público   la credencial es el token del body
GET    /api/users/me                ESAVI-USER-007   USER      perfil, roles con level, requiresPasswordChange
PATCH  /api/users/me/password       ESAVI-USER-006   USER      cambio propio, diferencial
```

**Procedencia, porque no todos salen del mismo sitio.** Los cinco endpoints públicos **no tienen fila** en `API-ROUTES.md`: están declarados en su sección «Rutas sin fila» (líneas 30-39) precisamente porque no exigen rol. El inventario no publica sus códigos de operación, así que los códigos `ESAVI-AUTH-001`, `002`, `003`, `006` y `007` se copiaron de `esavi-backend/src/controllers/auth.controller.ts` (líneas 13, 38, 60, 103 y 132). `ESAVI-AUTH-004`, `ESAVI-USER-006` y `ESAVI-USER-007` sí tienen fila (`API-ROUTES.md:74`, `543`, `542`). **Ninguno inventado.**

**Lo que no se consume, y por qué:**

- **`ESAVI-USER-004`** (`PUT /api/users/:id`) — editar el propio perfil exige rol `ADMIN` y la ruta lleva un id ajeno; no hay endpoint de autoedición. Es un spec del hito 2 junto con la administración de usuarios.
- **`ESAVI-USERROLE-002A`** y **`ESAVI-USERGEO-002A`** — los roles ya vienen dentro de `ESAVI-USER-007`, y la cobertura geográfica no la usa ninguna pantalla de este spec.
- **`ESAVI-AUTH-005`** — no existe. La numeración salta del `004` al `006`.

**Una consecuencia operativa del `logout`.** `ESAVI-AUTH-003` revoca la sesión del refresh token que recibe en el body, y no exige access token válido. El cliente debe llamarlo **antes** de vaciar el `TokenStore`: al revés, la sesión queda viva en `appSession` hasta que caduque, aunque el usuario crea que salió.

### 3.3 Tipos del contrato

Tres archivos en `src/contracts/`, y **no todos vienen del mismo sitio**:

```ts
// contracts/user.ts — espejo de esavi-backend/src/types/user/user.types.ts
export interface UserRole { name: string; level: number; roleId?: string; code?: string; }
export interface AuthUser { userId: string; email: string; displayName: string; roles: UserRole[]; }
export interface ChangePasswordInput { currentPassword: string; newPassword: string; }

// contracts/common.ts — espejo de esavi-backend/src/types/common/audit.types.ts
export interface AppDetails { createdAt: Date; user: string; method: string; detail: string; }
```

Los trae `npm run contracts:sync` y se revisan en el diff. `AppDetails` no lo consume ninguna pantalla de este spec — llega con el sync y lo usará `<AuditTrail>` en el hito 2.

**La respuesta del login no tiene tipo declarado en el backend.** `loginService` construye su objeto de retorno como literal (`auth.service.ts:110-121`); no hay ninguna `interface LoginResponse` que copiar. Lo mismo con `GET /api/users/me`, que devuelve lo que produzca `toUserResponse` (`user.service.ts:54-59`). `CONVENTIONS.md` §9 lo prevé: *«si el tipo no existe todavía, se escribe en `contracts/` y se anota su origen en el backend»*.

```ts
// contracts/declared/auth.ts — NO es espejo: el backend construye estas formas como literales.
// Origen: esavi-backend/src/services/auth.service.ts:110-121 (login)
//         esavi-backend/src/services/user.service.ts:54-59 + :26-31 (users/me)
// Reconciliar a mano si cambian; contracts:sync no escribe en declared/.
export interface LoginResponse { … }
export interface CurrentUser { … }
```

**`AuthUser` del backend no describe ninguna de las dos respuestas**, y conviene no confundirlas: declara `roles: UserRole[]` con `level` obligatorio, pero el login devuelve `roles` **sin** `level`. `AuthUser` es el tipo de `req.user` dentro del servidor, no el de la respuesta HTTP. Por eso `LoginResponse` se declara aparte en vez de reutilizarlo.

**`contracts/` tiene dos clases de archivo y el script las distingue por carpeta.** `contracts:sync` sólo escribe en la raíz de `contracts/`; todo lo escrito a mano vive en `contracts/declared/` y el script no lo toca. Concilia §3 —`contracts/` no se edita a mano— con §9 —un tipo inexistente se escribe ahí— sin necesidad de una lista de exclusiones.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Access token | `TokenStore` | `localStorage`, tras la interfaz de §11.1 | Fase 1; ningún módulo lo lee directo |
| Refresh token | `TokenStore` | `localStorage`, tras la misma interfaz | Migrar a cookie es sustituir la implementación |
| Usuario, roles, `level`, `requiresPasswordChange` | TanStack Query | `['user', 'me']` | `ESAVI-USER-007`. **Única fuente**; `staleTime: Infinity` |
| «¿Hay sesión?» | Derivado | hay refresh token **y** `['user', 'me']` resolvió | No es estado propio: no se guarda un booleano |
| Nivel efectivo | Derivado | `Math.max(...roles.map(r => r.level ?? ROLE_LEVELS[r.name] ?? 0))` | Espejo de `roleValidation.middleware.ts:16-22` |
| Ruta pretendida antes del login | `state` del `navigate` | `location.state.from` | Ni store ni URL: muere con la navegación |
| Token de restablecimiento | URL | `searchParams.token` | Se lee y se envía en el body de `ESAVI-AUTH-007` |
| Tema | Zustand persistido | `preferences.theme` | Además se refleja en `data-theme` de `<html>` |
| Idioma | Zustand persistido | `preferences.language` | Alimenta i18next **y** el `?lang=` del interceptor |
| Sidebar colapsado (escritorio) | Zustand persistido | `preferences.sidebarCollapsed` | Preferencia duradera |
| Drawer abierto (móvil) | Zustand **no** persistido | `ui.sidebarOpen` | Efímero: se cierra al navegar |
| `density`, `pageSize`, `tableColumns` | Zustand persistido | `preferences.*` | Declarados con su valor por defecto; sin interfaz en este hito |
| Contenido de los formularios | React Hook Form | — | No sale del componente |
| Diálogo de cambio de contraseña | `useState` del componente | — | Salvo el bloqueo blando, que se **deriva** de `requiresPasswordChange` |
| Refresco en vuelo | Variable de módulo en `client.ts` | `Promise \| null` | **Excepción declarada**, abajo |

**Dos excepciones, dichas en voz alta para que no se confundan con un olvido:**

**A — La cola de refresh no es estado de React.** Vive como variable de módulo en `client.ts` porque quien la consulta es un interceptor de axios, que corre fuera del árbol de componentes. Meterla en un store la haría accesible desde donde no debe tocarse y no resolvería nada: la garantía que hace falta —*un solo refresco en vuelo*— es de módulo, no de render.

**B — El bloqueo blando no tiene estado propio.** `requiresPasswordChange` es un campo de `['user', 'me']`. El diálogo se abre porque ese campo es `true`, no porque alguien escriba `setOpen(true)`. Copiarlo a un `useState` sería exactamente el bug de sincronización que prohíbe `CONVENTIONS.md` §7: el `PATCH` limpiaría la bandera en el servidor y el diálogo seguiría abierto.

**Dos datos que parecen uno y no lo son.** `preferences.sidebarCollapsed` y `ui.sidebarOpen` describen cosas distintas: el primero es una preferencia de escritorio que sobrevive al refresco; el segundo es si el drawer de móvil está desplegado ahora mismo. Unificarlos deja el sidebar colapsado en el monitor grande porque se colapsó en el móvil, que es justo lo que `ARCHITECTURE.md` §7.3 decidió evitar.

**Qué invalida qué:**

| Evento | Efecto sobre la caché |
|---|---|
| Login correcto | `invalidateQueries(['user', 'me'])` — la sesión arranca leyendo el perfil |
| `ESAVI-USER-006` correcto | `invalidateQueries(['user', 'me'])` — es lo que cierra el bloqueo blando |
| Logout / `logout-all` | `queryClient.clear()` — no puede quedar nada del usuario anterior en memoria |
| Refresh correcto | **Nada.** Rota el token, no cambia ningún dato |

### 3.5 Formularios y validación

Cuatro formularios, todos con React Hook Form + Zod, todos en `features/auth/schemas.ts`.

**Login** — `loginSchema`

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `email` | `<Input type="email">` | sí | Formato de correo; el backend normaliza (`auth.validator.ts:3-8`) |
| `password` | `<Input type="password">` | sí | **Sólo no vacío.** Sin longitud mínima (`auth.validator.ts:9-11`) |

**No se pone mínimo de 8 en el login**, aunque lo tengan los otros tres. Un usuario antiguo puede tener una contraseña más corta, y un cliente que se la rechaza le impide entrar a cambiarla.

`AUTH_001_INVALID_CREDENTIALS` se muestra **en el formulario, no en un campo**. Decir cuál de los dos falló convierte la pantalla en un oráculo de enumeración de cuentas, que es exactamente lo que `SPEC F43` se cuidó de evitar en el backend.

**Olvidé mi contraseña** — `forgotPasswordSchema`: sólo `email`. **La pantalla de éxito se muestra siempre**, exista o no la cuenta: `ESAVI-AUTH-006` responde `200` en ambos casos, por diseño. Si el cliente distinguiera, reintroduciría el oráculo que el backend cerró.

**Restablecer** — `resetPasswordSchema`

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `newPassword` | `<Input type="password">` | sí | Mínimo **8** (`appPasswordReset.validator.ts:36-40`) |
| `confirmPassword` | `<Input type="password">` | sí | Igual a `newPassword`. **Sólo del cliente**: el backend no la pide |

El `token` sale de `searchParams`, no del formulario. Si falta, la pantalla no renderiza el formulario: muestra directamente el estado de enlace inválido.

**Cambio propio** — `changePasswordSchema`

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `currentPassword` | `<Input type="password">` | sí | No vacío |
| `newPassword` | `<Input type="password">` | sí | Mínimo **8**; distinta de `currentPassword` |
| `confirmPassword` | `<Input type="password">` | sí | Igual a `newPassword`; sólo del cliente |

**Mapeo de errores del servidor**, todos verificados en el código:

| `code` | Dónde se muestra |
|---|---|
| `AUTH_001_INVALID_CREDENTIALS` | Formulario de login, no un campo |
| `USER_006_INVALID_CREDENTIALS` | Campo `currentPassword` |
| `USER_006_SAME_PASSWORD` | Campo `newPassword` |
| `AUTH_007_INVALID_RESET_TOKEN`, `_RESET_TOKEN_USED`, `_RESET_TOKEN_INVALIDATED`, `_RESET_TOKEN_EXPIRED` | Estado de enlace inválido, con botón a `/forgot-password`. No son errores de campo |
| Cualquier código terminado en `_REFRESH_TOKEN_REUSED` | Al login, con aviso. **Sufijo, no cadena exacta** |
| El resto | Toast decidido por `code` |

**El código de reutilización no es una cadena fija.** `assertRefreshTokenUsable` lo compone con `` `${operation}_REFRESH_TOKEN_REUSED` `` y `operation` vale `'AUTH_002'` **o** `'AUTH_003'` (`auth.service.ts:136,160`) — el logout comparte el mismo helper. Comparar contra `AUTH_002_REFRESH_TOKEN_REUSED` literal deja pasar el caso del logout.

`errors` no se muestra nunca. `message` llega ya traducido por el `?lang=` y no se vuelve a traducir.

### 3.6 Estados de la pantalla

El estado que decide este spec no es el de una tabla: es **el arranque**. Entre que la aplicación monta y `['user', 'me']` responde, no se sabe si hay sesión.

| Vista | Carga | Vacío | Error | Sin permiso |
|---|---|---|---|---|
| **Arranque del shell** | Pantalla de carga a página completa, con el tema ya aplicado por el script anti-parpadeo | — | Si `['user','me']` da `401`, es sesión muerta → `/login`. Si da error de red, pantalla de reintento **sin borrar los tokens** | — |
| Login | Botón en estado de envío, campos deshabilitados | — | `auth.login.invalidCredentials` bajo el formulario | — |
| Olvidé mi contraseña | Botón en envío | — | Sólo error de red; el `200` es siempre éxito | — |
| Restablecer | Botón en envío | Sin `?token=` → enlace inválido | Enlace inválido, con `auth.reset.requestNew` | — |
| Inicio | Skeleton del saludo | — | Mensaje por `code` + reintentar | — |
| Cambio de contraseña | Botón en envío | — | Error mapeado al campo | — |

**Distinguir «sesión muerta» de «servidor caído» no es un adorno.** Si un fallo de red borrara el `TokenStore`, cada corte de wifi expulsaría al usuario y le obligaría a teclear la contraseña. Sólo un `401` cierra la sesión.

**«Sin permiso» no aparece en ninguna vista de este spec**, porque ninguna exige rol por encima de la sesión. `<RequireRole>` se escribe y se prueba igualmente: el hito 2 lo usa en seis entidades a la vez, y descubrir ahí que está mal sale caro.

### 3.7 Responsividad y accesibilidad

- **Sidebar:** colapsable en escritorio (iconos con tooltip, nunca desaparición); `Sheet` lateral por debajo de `md`, que se cierra al navegar y con `Escape`.
- **Las tres pantallas públicas** son una tarjeta centrada, `max-w-sm`, a ancho completo con margen por debajo de `sm`. Sin sidebar ni `Topbar`.
- **El diálogo del bloqueo blando** entra desde abajo en móvil y no tiene botón de cerrar ni cierra con `Escape` — es el punto del spec donde eso es correcto, y el único.
- Objetivos táctiles de **44px**; `dvh`, nunca `vh`.
- Los cuatro formularios son navegables con teclado y se envían con Enter. Todo campo tiene `<Label>` asociado — no `placeholder` como etiqueta.
- Foco visible en todo control; el `outline` no se elimina sin sustituirlo.
- El interruptor de tema y el de idioma son botones con icono: llevan `aria-label` por i18n, y el icono `aria-hidden`.
- Los hijos deshabilitados del menú llevan `aria-disabled="true"` y siguen siendo enfocables, para que un lector de pantalla los anuncie como existentes pero no disponibles.

### 3.8 Claves i18n nuevas

En `src/locales/{es,en,nl}.json`, traducidas de verdad en los tres. Espacios de primer nivel:

| Espacio | Claves | Uso |
|---|---|---|
| `common` | `save`, `cancel`, `retry`, `loading`, `close`, `comingSoon` | Transversales; `comingSoon` marca los hijos deshabilitados |
| `auth.login` | `title`, `email`, `password`, `submit`, `forgotLink`, `invalidCredentials` | Pantalla de login |
| `auth.forgot` | `title`, `description`, `submit`, `sentTitle`, `sentDescription`, `backToLogin` | Solicitud del enlace |
| `auth.reset` | `title`, `newPassword`, `confirmPassword`, `submit`, `success`, `invalidLink`, `requestNew` | Restablecimiento |
| `auth.changePassword` | `title`, `current`, `new`, `confirm`, `submit`, `success`, `required` | Formulario, y `required` es el texto del bloqueo blando |
| `auth.session` | `expired`, `revokedByReuse`, `logout`, `logoutAll`, `logoutAllConfirm` | Fin de sesión; `revokedByReuse` es el aviso de F42 |
| `nav` | `home`, `groups.cases`, `groups.notification`, `groups.investigation`, `groups.clinicalCatalogs`, `groups.geography`, `groups.administration`, y una por cada uno de los 17 hijos | El árbol de `navigation.ts`, entero |
| `home` | `greeting`, `roleLabel` | Página de inicio |
| `settings` | `theme.light`, `theme.dark`, `theme.system`, `language.es`, `language.en`, `language.nl` | Menú del `Topbar` |
| `errors` | `network`, `unexpected`, `forbidden`, `notFound` | Respaldo por `code` cuando no hay clave específica |

Unas 60 claves. `npm run i18n:check` exige paridad exacta de claves entre los tres archivos.

---

## 4. Plan de implementación

Trece pasos. Cada uno deja el proyecto compilando y arrancable, y cada uno se puede committear solo.

1. **Scaffold y comandos.** Vite + React 19 + TypeScript, ESLint, Prettier, Vitest + Testing Library + MSW. Las carpetas de `ARCHITECTURE.md` §9 creadas, y los ocho scripts de `CONVENTIONS.md` §13 — incluidos `i18n:check` y `contracts:sync`, que en este paso existen y no hacen nada útil todavía.
   *Verificación:* `npm run check` sale en 0 sobre el proyecto vacío; `npm run dev` sirve en `5173`.

2. **Tailwind v4, tokens y shadcn.** Los tokens semánticos de §6.1 definidos para `light` y `dark`, shadcn/ui inicializado, y el `index.html` con el script anti-parpadeo de §6.4 **antes** de que monte React.
   *Verificación:* cambiar `data-theme` a mano en las herramientas del navegador invierte los colores de toda la página; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/` no devuelve resultados.

3. **i18n.** react-i18next con `es`, `en` y `nl`, y el script `i18n:check` que compara las claves de los tres archivos.
   *Verificación:* borrar una clave de `nl.json` hace fallar `npm run i18n:check` con salida distinta de 0.

4. **Preferencias y tema.** La interfaz `PreferencesStore` de §7.3 con su implementación de `localStorage`, `preferencesStore` con `zustand/persist` bajo la clave `esavi-preferences` y los seis campos de §7.2, `uiStore` sin persistir, y el hook que refleja el tema en `data-theme` y se suscribe a `matchMedia`.
   *Verificación:* con el tema en `system`, cambiar el tema del sistema operativo cambia la aplicación sin recargar; recargar en `dark` no produce destello blanco; la clave `esavi-preferences` del `localStorage` tiene la forma exacta que lee el script del paso 2.

5. **Contratos.** `contracts:sync` copiando desde `../esavi-backend/src/types` a `src/contracts/`, más `src/contracts/declared/auth.ts` escrito a mano con `LoginResponse` y `CurrentUser`, anotando su origen.
   *Verificación:* `npm run contracts:sync` genera `contracts/user.ts` y `contracts/common.ts`, y **no** toca `contracts/declared/`; el diff del sync es legible.

6. **`client.ts`, sin refresco.** axios con la base `http://localhost:4500/api`, el interceptor que desenvuelve `data`, `EsaviApiError` conservando `code` y `status`, el `Authorization` y el `?lang=` del store de preferencias.
   *Verificación:* tests con MSW — un `200` entrega `data` desenvuelto; un `{ ok: false, code }` produce un `EsaviApiError` con ese `code`; `grep -rn "response.data.data" src/` vacío; `grep -rn "from 'axios'" src/` sólo encuentra `client.ts`.

7. **`TokenStore` y la cola de refresh.** La interfaz de §11.1 con su implementación de `localStorage`, y la cola en `client.ts` con un solo refresco en vuelo.
   *Verificación:* el test más importante del repositorio — dos peticiones que reciben `401` a la vez producen **un solo** `POST /api/auth/refresh`, y ambas se reintentan con el token nuevo. Un `code` terminado en `_REFRESH_TOKEN_REUSED` va al login sin reintentar, y se prueba con las dos variantes, `AUTH_002_…` y `AUTH_003_…`.

8. **Sesión y autorización.** La query `['user', 'me']` con `ESAVI-USER-007` citado, `ROLE_LEVELS`, `useCan()`, `<RequireAuth>` y `<RequireRole>`.
   *Verificación:* test del nivel efectivo — `Math.max` sobre `roles[].level`, con respaldo en `ROLE_LEVELS[name]` cuando `level` es nulo y `0` cuando el nombre tampoco está. Un usuario con dos roles obtiene el mayor.

9. **Router y login.** `app/router.tsx`, `app/providers.tsx` (Query, i18n, tema, toaster) y `LoginPage`.
   *Verificación:* contra el backend real en `4500` — se entra con credenciales válidas; recargar mantiene la sesión sin volver a pedir contraseña; entrar a `/` sin sesión lleva a `/login` y, tras entrar, devuelve a `/`; credenciales malas muestran el error bajo el formulario y no dicen cuál de los dos campos falló.

10. **Recuperación de contraseña.** `ForgotPasswordPage` y `ResetPasswordPage`.
    *Verificación:* con `ESAVI_PASSWORD_RESET_URL` cargado en `systemConfig`, el enlace del correo abre el formulario con el token en la URL; usar el mismo enlace dos veces muestra el estado de enlace inválido con salida a `/forgot-password`; un correo inexistente muestra la misma pantalla de éxito que uno real.

11. **Layout y navegación.** `AppShell`, `Topbar`, `Sidebar` y `shared/config/navigation.ts` con el árbol completo de §3.1.
    *Verificación:* test del filtro por rol — con `ANALYTICS` no aparece ningún hijo, con `USER` aparecen todos menos «Usuarios», con `ADMIN` aparecen los diecisiete. A mano: en 375px el sidebar es un drawer que se cierra al navegar y con `Escape`; el body no hace scroll horizontal; un hijo deshabilitado no navega y se anuncia como `aria-disabled`.

12. **Página de inicio.** `HomePage` con el saludo por `displayName` y el rol efectivo.
    *Verificación:* el nombre mostrado coincide con el que devuelve `ESAVI-USER-007`, no con el del login.

13. **Cambio de contraseña y bloqueo blando.** `ChangePasswordForm`, su diálogo descartable en el `Topbar`, y el no descartable que se deriva de `requiresPasswordChange`.
    *Verificación:* un usuario recién creado con `ESAVI-USER-001` entra y **no puede navegar** hasta cambiar la contraseña; al responder el `PATCH`, el diálogo se cierra solo porque se invalidó `['user', 'me']`, sin ningún `setOpen`; repetir la contraseña actual muestra el `409` en el campo `newPassword`.

**Dos notas sobre el orden.** Los pasos 6 y 7 están separados a propósito: la cola de refresh es la pieza que `CONVENTIONS.md` §12 llama el test más importante del repositorio, y mezclarla con el resto del cliente HTTP hace que un fallo del envelope y un fallo de la cola lleguen en el mismo commit. El paso 11 va después del 9 y del 10 aunque el layout sea lo más visible: sin sesión no hay nada que envolver, y un sidebar construido antes del guard se prueba con datos inventados.

---

## 5. Criterios de aceptación

- [ ] Los ocho endpoints de §3.2 se consumen contra el backend real en `4500` y responden lo esperado.
- [ ] Recargar la página con sesión activa no vuelve a pedir la contraseña.
- [ ] Entrar a una ruta protegida sin sesión lleva a `/login` y, tras entrar, devuelve a la ruta pretendida.
- [ ] **Dos peticiones que reciben `401` a la vez producen un solo `POST /api/auth/refresh`.**
- [ ] Un `code` terminado en `_REFRESH_TOKEN_REUSED` lleva al login sin reintentar, y se comprueba con `AUTH_002_…` **y** con `AUTH_003_…`.
- [ ] Un fallo de red durante el arranque muestra reintento y **no** borra el `TokenStore`; sólo un `401` cierra la sesión.
- [ ] Un usuario recién creado con `ESAVI-USER-001` no puede navegar hasta cambiar su contraseña, y el diálogo se cierra solo al responder el `PATCH`.
- [ ] El mismo enlace de restablecimiento usado dos veces muestra el estado de enlace inválido con salida a `/forgot-password`.
- [ ] `POST /api/auth/forgot-password` con un correo inexistente muestra la misma pantalla que con uno real.
- [ ] El nombre de la página de inicio proviene de `ESAVI-USER-007`, no de la respuesta del login.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `grep -rn "from 'axios'" src/` sólo encuentra `shared/api/client.ts`.
- [ ] `grep -rn "localStorage" src/` sólo encuentra la implementación de `TokenStore` y el `persist` de `preferencesStore`.
- [ ] `npm run contracts:sync` no modifica `src/contracts/declared/`.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La aplicación se ve correcta en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/` no devuelve resultados.
- [ ] **Por debajo de `md`.** El sidebar es un drawer que se cierra al navegar y con `Escape`; las tres pantallas públicas caben en 375px y el body no hace scroll horizontal.
- [ ] **Rol bajo.** Con `ANALYTICS` no aparece ningún hijo del menú; con `USER` aparecen todos menos «Usuarios»; con `ADMIN`, los diecisiete. Un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos `placeholder` y `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState` ni en un store, y las dos excepciones de §3.4 son las únicas.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** `ESAVI-USER-007` como única fuente del usuario. Es la única respuesta que trae `roles[].level`, que es lo que el backend usa para autorizar.
- **No:** guardar el `user` del login en un store. Dos razones independientes, y cada una bastaría: es dato remoto y `CONVENTIONS.md` §7 lo prohíbe, y además le falta el `level`.
- **No:** `createResource` y las primitivas en este spec. Una fábrica escrita sin una sola entidad que la consuma se diseña a ciegas, y es la pieza cuyo error se multiplica por 45.
- **No:** la paleta de comandos ahora. Su valor nace del número de pantallas, y aquí hay una navegable. `navigation.ts` queda escrito, que es lo que la alimentará.
- **Sí:** el menú completo con los diecisiete hijos deshabilitados, en vez de sólo lo que existe. Deja ver el mapa de la aplicación desde el primer día. El riesgo —leerse como una aplicación rota— se acota con la marca de «próximamente» y `aria-disabled`.
- **No:** «corregir» el `minLevel` de «Roles» y «Configuración del sistema». El inventario dice `USER` para sus listados y `CONVENTIONS.md` §5 obliga a copiarlo. Si es un error, es del backend y se arregla ahí; divergir en el cliente produce pantallas escondidas a quien sí puede verlas.
- **Sí:** bloqueo blando en diálogo, no una ruta `/change-password`. La bandera la pone el backend y el diálogo se deriva de ella; una ruta exigiría además guardarla en algún sitio para saber cuándo redirigir.
- **No:** longitud mínima de contraseña en el login. Un usuario con una contraseña antigua más corta no podría entrar a cambiarla.
- **No:** distinguir en `/forgot-password` si la cuenta existe. `ESAVI-AUTH-006` responde `200` siempre, deliberadamente; distinguir en el cliente reintroduciría el oráculo de enumeración que el backend cerró.
- **Sí:** la cola de refresh como variable de módulo. La consulta un interceptor de axios, que corre fuera de React; un store la expondría a quien no debe tocarla sin dar ninguna garantía a cambio.
- **No:** borrar los tokens ante un error de red. Cada corte de conexión expulsaría al usuario. Sólo un `401` cierra sesión.
- **Sí:** `contracts/declared/` para las formas que el backend construye como literales. Concilia §3 —`contracts/` no se edita a mano— con §9 —un tipo inexistente se escribe ahí— sin que el script necesite una lista de exclusiones.
- **Sí:** `localStorage` para los tokens. Es la fase 1 declarada en §11.1; la rotación con detección de reutilización de `SPEC F42` acota el riesgo, y el `TokenStore` tras interfaz hace que migrar a cookie sea sustituir una implementación.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Un paquete npm comprometido lee el refresh token de `localStorage` | Riesgo aceptado y declarado (§11.1). `SPEC F42` invalida el token robado en cuanto el usuario legítimo renueva, y delata el robo revocando todo. La fase 2 lo cierra |
| `ESAVI_PASSWORD_RESET_URL` está sembrado vacío: el correo llega con un enlace roto | Dependencia declarada en §2. La verificación del paso 10 no pasa sin ella, así que no puede olvidarse en silencio |
| `ESAVI-AUTH-006` responde `200` aunque el SMTP falle: la pantalla dirá que el correo salió | Misma verificación del paso 10, contra un correo real. Es comportamiento deliberado del backend, no un fallo |
| Diecisiete entradas muertas se leen como una aplicación rota | `common.comingSoon` visible y `aria-disabled`; el filtro por rol se aplica igual que a las navegables |
| Node 20.19.4 está justo en el mínimo de Vite 7 (`^20.19.0`) | Declarar `engines` en `package.json` y anotarlo en el README: una máquina con Node 20.18 falla en `npm run dev` sin decir por qué |
| Comparar el código de reutilización como cadena exacta deja pasar el caso del logout | El cliente compara por sufijo `_REFRESH_TOKEN_REUSED`, y el test cubre las dos variantes |

---

## Lo que **no** está en este spec

- `createResource` y las primitivas compartidas.
- La paleta de comandos.
- La administración de usuarios, roles y coberturas geográficas.
- La página de perfil editable.
- Las preferencias guardadas en el servidor.
- El refresh token en cookie `httpOnly`.
- `density`, `pageSize` y `tableColumns` en la interfaz.
- Trabajo sin conexión.

Cada uno de esos, si aterriza, va en su propio spec.

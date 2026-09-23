# SPEC FE20 — Gestión de usuarios

> **Estado:** Implementado
> **Depende de:** SPEC FE01 (shell, autenticación y `useCan`), SPEC FE02 (capa de recurso genérica), SPEC F04 del backend (`appUser`: CRUD, cifrado PII y roles del alta), SPEC F62 del backend (búsqueda de usuarios, `ESAVI-USER-008`), SPEC F02 del backend (`appUserRole`: asignación y revocación), SPEC F03 del backend (`appRole`, del que aquí sólo se lee el listado)
> **Fecha:** 2026-09-23
> **Objetivo:** Dar a un ADMIN la pantalla para dar de alta usuarios, corregir sus datos, buscarlos, desactivarlos y decidir qué roles tiene cada uno.

---

## 1. Por qué existe este spec

**Hoy no hay forma de crear un usuario desde la aplicación.** El backend expone las nueve operaciones de `appUser` desde el SPEC F04, y el cliente consume exactamente dos: `ESAVI-USER-007` (`/me`, para resolver la sesión) y `ESAVI-USER-006` (cambiar la propia contraseña, `features/auth/ChangePasswordDialog.tsx`). Las otras siete no tienen consumidor. Dar de alta a quien va a notificar un ESAVI pasa hoy por `POST /api/seed/admin` —que no se monta en producción— o por SQL directo contra la base.

**El menú ya tiene el hueco reservado y lo marca como no disponible.** `shared/config/navigation.ts:178-184` declara `nav.items.user` con `path: '/users'`, `minLevel: ROLE_LEVELS.ADMIN` y `disabled: true`. Este spec es lo que retira ese `disabled`, igual que el FE08 hizo con las entradas de casos.

**Es también el primer consumidor de `ESAVI-USER-008`**, la búsqueda que el SPEC F62 del backend aprobó el 2026-09-22 y que entró en `references/API-ROUTES.md` con la regeneración del 2026-09-23. Ese endpoint existe porque las cinco columnas identificatorias de `appUser` están cifradas de forma determinista: `002A` y `002B` no aceptan ningún filtro de texto, y sin `008` la única forma de encontrar a alguien sería paginar el padrón entero.

**Y es la primera pantalla que escribe en `appUserRole`.** Un usuario sin rol no puede hacer nada, y `ESAVI-USER-004` no acepta `roleId` por decisión explícita del F04 §6: cambiar los roles de alguien es otra operación, con otra tabla y otras guardas. Esta pantalla las junta en una sola ficha porque para quien administra son el mismo acto.

**Lo que este spec deja preparado.** La ficha de usuario es donde aterrizará la cobertura geográfica del SPEC FE22 (`appUserGeoLocation`), y el selector de roles de aquí consume el listado que el SPEC FE21 pasará a administrar. Ninguno de los dos es prerrequisito: FE20 funciona solo.

---

## 2. Alcance

**Dentro:**

- **Listado `/users`**, guard `ADMIN`, con `<ResourceTable>`: paginación `limit`/`offset`, toggle «mostrar inactivos» que decide entre `ESAVI-USER-002A` y `ESAVI-USER-002B`, y orden fijo `createdAt DESC` — el único que el backend puede dar.
- **Buscador de un solo campo** sobre `ESAVI-USER-008`, mínimo 2 caracteres y debounce de 400 ms. Por debajo del mínimo no se dispara petición y la tabla vuelve al listado.
- **Buscador y toggle de inactivos son excluyentes.** Escribir en el buscador apaga el toggle, y el texto de ayuda dice por qué: el `008` sólo devuelve inactivos a `SUPERADMIN`.
- **Alta en diálogo** desde el listado, sobre `ESAVI-USER-001`, con **varios roles** en la misma llamada. El backend crea usuario y asignaciones en una transacción.
- **Ficha `/users/:id`** como página, sobre `ESAVI-USER-003`, con dos bloques: datos del usuario y roles asignados.
- **Edición de los cinco campos** que `ESAVI-USER-004` acepta: `username`, `email`, `firstName`, `lastName` y `phone`. Se envía el objeto completo; el backend hace el update diferencial.
- **Desactivar** con `ESAVI-USER-005A`, con sus dos `409` mapeados a mensaje propio: autodesactivación y último SUPERADMIN.
- **Reactivar** con `ESAVI-USER-005B`. El botón **no se renderiza** salvo `SUPERADMIN`.
- **Bloque de roles con «Guardar»**, que calcula el diff contra las asignaciones activas: las altas van en un solo `ESAVI-USERROLE-007`, las bajas una a una por `ESAVI-USERROLE-005A`. Altas primero, bajas después; si una baja falla se sigue con las siguientes y se reporta al final.
- **Lectura del catálogo de roles** con `ESAVI-APPROLE-002A` para poblar el selector.
- **`<AuditTrail>` en un `Sheet`** abierto desde el menú de la fila del listado, condicionado a `SUPERADMIN`, como en el resto de pantallas de administración.
- **Retirar `disabled: true`** de `nav.items.user` en `shared/config/navigation.ts:178-184`.
- **Tipos del contrato**: `contracts/user.ts` resincronizado y lo que falte en `contracts/declared/`.
- **Claves i18n nuevas** en los tres archivos de idioma.

**Fuera de alcance (otros specs):**

- **Administrar los roles de la aplicación** — crear, editar o retirar un `appRole`. Es **SPEC FE21**; aquí el catálogo sólo se lee.
- **Cobertura geográfica del usuario** (`appUserGeoLocation`). Es **SPEC FE22**, y aterrizará como un tercer bloque en esta misma ficha.
- **`ESAVI-USERROLE-005B`** (reactivar una asignación). No hace falta: el `007` reactiva los pares inactivos dentro de su transacción, así que el camino ADMIN está completo sin pasar por SUPERADMIN.
- **`ESAVI-USERROLE-006`** (quién tiene el rol X). Es la vista inversa y pertenece a la pantalla de roles, FE21.
- **Restablecer la contraseña de un tercero.** No existe endpoint: el F04 §6 lo descartó con motivo. El usuario nuevo nace con `requiresPasswordChange: true` y la cambia él.
- **Pantalla de perfil propio** sobre `/me`. Hoy se resuelve en el shell del FE01 y no se toca.
- **Filtrar la búsqueda por rol, por ámbito geográfico o por estado.** El `008` es sólo texto, y el F62 §2 lo dejó fuera explícitamente.
- **Ordenación alfabética o por relevancia.** Imposible sobre columnas cifradas; `createdAt DESC` es el único orden.
- **Búsqueda por prefijo o parcial.** `per` no encuentra a `Pérez`, y `dperalta` no encuentra a `DPeralta`. Son las limitaciones declaradas en el F62 §7; se explican en pantalla, no se reparan aquí.
- **Exportar el listado.**

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/users` | `features/user/UserListPage.tsx` | `<RequireRole level={ADMIN}>` |
| Ficha | `/users/:id` | `features/user/UserDetailPage.tsx` | `<RequireRole level={ADMIN}>` |

Componentes de la feature, sin ruta propia:

| Componente | Archivo | Qué es |
|---|---|---|
| Diálogo de alta y edición | `features/user/UserFormDialog.tsx` | Los cinco campos, más el selector de roles sólo en modo alta |
| Bloque de roles de la ficha | `features/user/UserRolesCard.tsx` | Selección múltiple + «Guardar», con el diff de §3.5 |
| Buscador | `features/user/UserSearchField.tsx` | Input único sobre `q`, con su texto de ayuda |
| Auditoría | `features/user/UserAuditSheet.tsx` | `<AuditTrail>` sobre `appDetails`, sólo `SUPERADMIN` |

**Carpeta `features/user/`**, no `appUser`: es el precedente de `userGeoLocation`, que ya existe y también deja fuera el prefijo `app` de la tabla. Coincide con `contracts/user.ts`.

**Navegación.** No se añade nada: `shared/config/navigation.ts:178-184` ya declara `nav.items.user` en el grupo `nav.groups.administration`, con icono `UserCog`, `path: '/users'` y `minLevel: ROLE_LEVELS.ADMIN`. **Sólo se retira `disabled: true`.**

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md` (regeneración del 2026-09-23):

```
GET    /api/users                      ESAVI-USER-002A      ADMIN       listado, sólo activos
GET    /api/users/admin                ESAVI-USER-002B      ADMIN       listado con inactivos
GET    /api/users/search?q=x           ESAVI-USER-008       ADMIN       búsqueda por nombre, correo o usuario
GET    /api/users/:id                  ESAVI-USER-003       ADMIN       ficha
POST   /api/users                      ESAVI-USER-001       ADMIN       alta, con roleId: string | string[]
PUT    /api/users/:id                  ESAVI-USER-004       ADMIN       editar los cinco campos
DELETE /api/users/:id                  ESAVI-USER-005A      ADMIN       desactivar
PATCH  /api/users/activate/:id         ESAVI-USER-005B      SUPERADMIN  reactivar
GET    /api/user-roles/user/:id        ESAVI-USERROLE-002A  USER        asignaciones activas, con userRoleId
POST   /api/user-roles/bulk            ESAVI-USERROLE-007   ADMIN       altas de roles, en lote
DELETE /api/user-roles/:id             ESAVI-USERROLE-005A  ADMIN       revocar una asignación
GET    /api/roles                      ESAVI-APPROLE-002A   USER        catálogo de roles del selector
```

**Qué no se consume, y por qué:**

- **`ESAVI-USERROLE-002B`** (`/admin/user/:id`, incluye revocadas). La ficha sólo necesita las vigentes: el `007` reactiva un par inactivo sin que el cliente sepa que existía.
- **`ESAVI-USERROLE-005B`** y **`ESAVI-USERROLE-003`**. La reactivación de una asignación la cubre el `007`; el detalle de una asignación suelta no tiene pantalla.
- **`ESAVI-USERROLE-006`** (quién tiene el rol X). Es la vista inversa, y va en FE21.
- **`ESAVI-APPROLE-001`, `004`, `005A`, `005B`, `002B`, `003`.** Aquí el catálogo de roles sólo se lee, y se lee por `002A`: el selector no ofrece roles inactivos.
- **`ESAVI-USER-006`** y **`ESAVI-USER-007`.** Ya los consume el shell del SPEC FE01 y no se tocan.

**Dos notas de comportamiento que el spec asume y que no se ven en la tabla:**

1. **`008` no tiene parámetro de inactivos.** Quién los ve lo decide `canViewInactive(req.user)` en `user.controller.ts:87`, que hoy es **sólo SUPERADMIN** (`permissions.helper.ts:24-26`). Un ADMIN que busca ve únicamente activos. De ahí la exclusión mutua de §3.5.
2. **`003` y `008` no devuelven `userRoleId`.** `ROLES_INCLUDE` usa `through: { attributes: [] }` (`user.service.ts:26-31`). El identificador de la asignación sólo llega por `USERROLE-002A`.

### 3.3 Tipos del contrato

Del backend, por `npm run contracts:sync` (`src/types/user/`):

```ts
// contracts/user.ts — espejo de esavi-backend/src/types/user/user.types.ts
export interface CreateUserInput {
  username?: string; email: string; password: string;
  firstName: string; lastName: string; phone?: string | null;
  roleId: string | string[];
}

// contracts/appUserRole.ts — espejo de appUserRole.types.ts
export interface BulkAssignRolesInput { userId: string; roleIds: string[]; }
```

Declarados a mano en `contracts/declared/`, porque el backend no tiene un tipo para la **respuesta** (la compone `toUserResponse`):

```ts
// contracts/declared/user.ts
export interface UserRoleSummary { roleId: string; name: string; code: string; level: number; }

export interface User {
  userId: string; username: string | null; email: string;
  firstName: string | null; lastName: string | null; displayName: string;
  phone: string | null; requiresPasswordChange: boolean; isActive: boolean;
  createdAt: string; updatedAt: string | null; deletedAt: string | null;
  appDetails: AppDetails[] | null;
  roles: UserRoleSummary[];   // sin userRoleId: through.attributes está vacío
}

// ESAVI-USER-004 acepta cinco campos y sólo cinco. password, roleId y displayName dan 400.
export type UpdateUserInput = Pick<CreateUserInput, 'username' | 'email' | 'firstName' | 'lastName'> &
  { phone?: string | null };

// contracts/declared/appUserRole.ts — la respuesta de USERROLE-002A es {count, user, rows},
// con un `user` extra que ningún otro listado del inventario tiene.
export interface UserRoleAssignment {
  userRoleId: string; userId: string; roleId: string;
  assignedByUserId: string | null; isActive: boolean;
  role: UserRoleSummary;
}

// contracts/declared/appRole.ts
export interface AppRole {
  roleId: string; code: string; name: string; description: string;
  level: number; isSystemRole: boolean; isActive: boolean;
}
```

**`User.displayName` es calculado por el backend** a partir de `firstName` y `lastName`. Se muestra, nunca se envía: `ESAVI-USER-004` responde `400` si viaja en el cuerpo.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Texto buscado | URL | `searchParams.q` | Escrito con debounce; por debajo de 2 caracteres se borra del URL |
| Página y tamaño | URL | `searchParams.page`, `searchParams.pageSize` | `limit`/`offset` los calcula `createResource` |
| Toggle de inactivos | URL | `searchParams.includeInactive` | Decide `002A` vs `002B`. **Se borra al escribir en `q`** |
| Listado | TanStack Query | `['user', 'list', { page, pageSize, includeInactive }]` | Lo declara `createResource` |
| Resultado de búsqueda | TanStack Query | `['user', 'search', { q, page, pageSize }]` | Hook propio: el `008` no es parte de `createResource` |
| Ficha | TanStack Query | `['user', 'detail', id]` | |
| Asignaciones de rol | TanStack Query | `['appUserRole', 'byUser', userId]` | `USERROLE-002A`; es de donde sale `userRoleId` |
| Catálogo de roles | TanStack Query | `['appRole', 'list']` | `staleTime` 30 min: es catálogo |
| Selección del bloque de roles | Componente | `useState<string[]>`, sembrado del catálogo y de las asignaciones | Es el **borrador de un formulario**, no una copia del servidor: sólo vive mientras el bloque está sin guardar |
| Diálogo abierto, fila en confirmación | Componente | `useState` | Efímero |
| Densidad, `pageSize` por defecto, idioma | Zustand | `preferences` | Ya existe |

**Invalidaciones.** Tras `001`, `004`, `005A` y `005B` se invalida `['user']` entera — arrastra listado, búsqueda y ficha. Tras `007` o `005A` de roles se invalidan `['appUserRole', 'byUser', userId]` y `['user', 'detail', userId]`, porque los roles viajan también dentro de la ficha.

**Las dos excepciones, declaradas:**

- **`useState` en el bloque de roles.** Es lo tecleado antes de guardar, igual que el estado de un React Hook Form; no es una copia de la query. Se resiembra cuando `['appUserRole','byUser',userId]` cambia, y se descarta al guardar.
- **Nada de `q` en un store.** Un buscador fuera de la URL no sobrevive al refresco ni se comparte por enlace.

### 3.5 Formularios y validación

**Alta** — `features/user/schemas.ts`, `createUserSchema`. Reglas copiadas de `createUserValidator` (`esavi-backend/src/validators/user.validator.ts:33-57`), no inventadas:

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `firstName` | `<Input>` | sí | 1–150. El backend lo pasa a `Title Case`: vuelve distinto de lo enviado |
| `lastName` | `<Input>` | sí | 1–150. Igual |
| `email` | `<Input type="email">` | sí | Formato de correo, máx. 250. Se normaliza a minúsculas en el servidor |
| `password` | `<Input type="password">` | sí | **Mínimo 8**. Único requisito del backend |
| `username` | `<Input>` | no | Máx. 250. **Sensible a mayúsculas**, y la ayuda del campo lo dice |
| `phone` | `<Input>` | no | Máx. 50. Es la única columna sin cifrar |
| `roleIds` | `<SearchableSelect multiple>` | sí | Mínimo uno. Viaja como `roleId` (`string[]`) |

**Edición** — `updateUserSchema`. Los mismos cinco campos **sin `password` ni `roleIds`**, todos opcionales. Se envía el objeto completo; el update diferencial es del backend (`CONVENTIONS.md` §6.5).

**Campos que el backend rechaza con `400` si viajan**, y que por tanto el formulario no puede tener: `displayName`, `isActive`, `requiresPasswordChange` en el alta; ésos más `password` y `roleId` en la edición (`updateUserValidator:60-82`).

**Errores del servidor mapeados a su campo:**

| `code` | Dónde se muestra |
|---|---|
| `USER_001_EMAIL_EXISTS`, `USER_004_EMAIL_EXISTS` | Campo `email` |
| `USER_001_USERNAME_EXISTS`, `USER_004_USERNAME_EXISTS` | Campo `username` |
| `USER_001_ROLE_NOT_FOUND`, `USER_001_ROLE_LEVEL_EXCEEDED` | Campo `roleIds` |
| `USER_005A_SELF_DEACTIVATION`, `USER_005A_LAST_SUPERADMIN` | Toast, con mensaje propio |
| `USER_008_QUERY_REQUIRED` | Bajo el buscador. **Nunca como «sin resultados»** |

**Bloque de roles de la ficha.** No es un formulario Zod: es una selección múltiple contra el catálogo de `APPROLE-002A` y un botón «Guardar». Al pulsarlo:

1. Se calcula el diff contra las asignaciones de `['appUserRole','byUser',userId]`.
2. **Altas**: un solo `POST /api/user-roles/bulk` con los `roleIds` que **no** están activos hoy. El lote es todo-o-nada, y el backend reactiva los pares que existían revocados.
3. **Bajas**: un `DELETE /api/user-roles/:userRoleId` por cada asignación retirada, en serie.
4. Si una baja falla, **se sigue con las siguientes** y se reporta al final qué quedó sin aplicar.

**Nunca se manda el conjunto completo al `007`.** Un solo par ya activo devuelve `409 USERROLE_007_ASSIGNMENT_EXISTS` y aborta el lote entero (`appUserRole.service.ts:229-231`). Si ese `409` llega igualmente, significa que la caché estaba obsoleta: se invalida y se pide reintentar.

| `code` del bloque de roles | Dónde se muestra |
|---|---|
| `USERROLE_007_ROLE_LEVEL_EXCEEDED` | Toast: no puedes asignar un rol por encima del tuyo |
| `USERROLE_007_ASSIGNMENT_EXISTS` | Toast de «vuelve a intentarlo», tras invalidar |
| `USERROLE_005A_LAST_SUPERADMIN` | En el resumen final, junto al rol que no pudo retirarse |

**«Guardar» se deshabilita mientras el diff esté vacío**, y el botón no se renderiza sin `useCan(ADMIN)`.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga (listado) | Skeleton de tabla, 5 filas | — |
| Vacío | Ilustración + botón «Crear usuario» | `user.list.empty` |
| Vacío con búsqueda | Texto + botón «Limpiar búsqueda», y el recordatorio de que se busca por palabra completa | `user.list.emptySearch` |
| Error | Mensaje derivado del `code` del `EsaviApiError` + reintentar | `user.list.error` |
| Sin permiso | No se llega: `<RequireRole level={ADMIN}>` redirige, y el `NavItem` no se pinta con `USER` ni `ANALYTICS` | — |
| Carga (ficha) | Skeleton de los dos bloques | — |
| Ficha no encontrada | `USER_003_NOT_FOUND` → pantalla de «no existe» con enlace al listado | `user.detail.notFound` |
| Usuario inactivo en la ficha | Badge «Inactivo» y los botones de edición ocultos | `user.detail.inactive` |

`errors` del envelope **no se muestra nunca**; es material de depuración (`API-CONTRACT.md`).

### 3.7 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`. Los tres campos que sobreviven: **`displayName`**, **`email`** y **los roles** como badges. El teléfono, el usuario y las fechas quedan en la ficha.
- El buscador ocupa el ancho completo por debajo de `md`; el toggle de inactivos baja debajo de él.
- La ficha pasa de dos columnas a una: primero los datos, después los roles.
- Objetivos táctiles de 44px (`CONVENTIONS.md` §10.2), `dvh` nunca `vh`.
- El menú de acciones de fila es alcanzable por teclado; los iconos sin texto llevan `aria-label` por i18n.
- El buscador anuncia el número de resultados con `aria-live="polite"`: sin eso, un lector de pantalla no se entera de que la tabla cambió al teclear.

### 3.8 Claves i18n nuevas

| Clave | Uso |
|---|---|
| `user.list.title` | Título de la pantalla |
| `user.list.empty` | Sin usuarios |
| `user.list.emptySearch` | Sin resultados de búsqueda |
| `user.list.error` | Error del listado |
| `user.list.createLabel` | Botón «Crear usuario» |
| `user.search.placeholder` | «Nombre o correo» |
| `user.search.hint` | Busca por palabra completa; el correo y el usuario, enteros |
| `user.search.usernameCaseHint` | El nombre de usuario distingue mayúsculas |
| `user.search.disablesInactive` | Al buscar sólo se ven usuarios activos |
| `user.search.queryRequired` | `USER_008_QUERY_REQUIRED` |
| `user.columns.displayName`, `.email`, `.username`, `.phone`, `.roles`, `.status`, `.createdAt` | Cabeceras |
| `user.form.createTitle`, `.editTitle` | Títulos del diálogo |
| `user.form.password`, `.passwordHint` | Contraseña y el mínimo de 8 |
| `user.form.usernameHint` | Opcional y sensible a mayúsculas |
| `user.form.requiresPasswordChange` | Aviso de que el usuario nuevo deberá cambiarla |
| `user.detail.title`, `.notFound`, `.inactive` | Ficha |
| `user.roles.title`, `.save`, `.saved`, `.partial` | Bloque de roles y su resumen |
| `user.errors.emailExists`, `.usernameExists`, `.roleNotFound`, `.roleLevelExceeded` | Mapeo de `code` |
| `user.errors.selfDeactivation`, `.lastSuperAdmin`, `.assignmentExists` | Los `409` con mensaje propio |

Van en `es`, `en` y `nl`; `npm run i18n:check` exige paridad exacta.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y arrancable, y puede committearse solo. Los pasos 1 a 4 construyen la base sin que aparezca nada en pantalla; del 5 al 10 cada paso añade superficie; el 11 la publica en el menú.

1. **Tipos del contrato.** `npm run contracts:sync` para traer `CreateUserInput` (ya existe), `BulkAssignRolesInput` y `CreateAppUserRoleInput` desde `../esavi-backend/src/types/user/`. Y a mano, los de §3.3 que el backend no declara: `contracts/declared/user.ts` (`User`, `UserRoleSummary`, `UpdateUserInput`), `contracts/declared/appUserRole.ts` (`UserRoleAssignment`) y `contracts/declared/appRole.ts` (`AppRole`).
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` en 0; `git diff src/contracts/` no toca ningún archivo generado salvo los que el sync reescribe.

2. **Declaración del recurso.** `features/user/api.ts` con un solo `createResource<User, CreateUserInput, UpdateUserInput>({ key: 'user', path: 'users', adminPath: 'users/admin', inactiveMode: 'adminPath', … })`, con los códigos `ESAVI-USER-001`…`005B` citados en comentario (`CONVENTIONS.md` §6.4).
   *Verificación:* el recurso expone `useList`, `useOne`, `useCreate`, `useUpdate`, `useDeactivate` y `useActivate`; `grep -rn "axios" src/features/user/` no devuelve nada.

3. **Los cuatro hooks que no caben en `createResource`.** En el mismo `api.ts`: `useUserSearch(q, params)` sobre `ESAVI-USER-008`; `useUserRoleAssignments(userId)` sobre `ESAVI-USERROLE-002A`; `useBulkAssignRoles()` sobre `ESAVI-USERROLE-007`; `useRevokeUserRole()` sobre `ESAVI-USERROLE-005A`. Más `useAppRoles()` sobre `ESAVI-APPROLE-002A`, con `staleTime` de 30 minutos.
   *Verificación:* `useUserSearch` no dispara petición con `q` de menos de dos caracteres — comprobable con MSW contando llamadas; las claves de caché son las de §3.4.

4. **Schemas Zod.** `features/user/schemas.ts` con `createUserSchema` y `updateUserSchema`, con los límites de §3.5.
   *Verificación:* una contraseña de 7 caracteres falla en el cliente; `displayName` no existe en ninguno de los dos schemas.

5. **Claves i18n.** Las de §3.8 en `es.json`, `en.json` y `nl.json`.
   *Verificación:* `npm run i18n:check` en 0.

6. **Buscador.** `features/user/UserSearchField.tsx`: input único, debounce de 400 ms, mínimo de dos caracteres, y los tres textos de ayuda — palabra completa, correo y usuario enteros, y el aviso de que buscar deja fuera a los inactivos.
   *Verificación:* teclear una letra no escribe `q` en la URL ni llama al backend; teclear dos sí, una sola vez tras 400 ms.

7. **Listado.** `features/user/UserListPage.tsx` con `<ResourceTable>`, las columnas de §3.8, el toggle de inactivos condicionado a `useCan(ADMIN)` y la exclusión mutua con el buscador. Más `features/user/UserAuditSheet.tsx`, abierto desde el menú de la fila y condicionado a `useCan(SUPERADMIN)`.
   *Verificación:* con el toggle activo, escribir dos caracteres lo apaga y lo retira de la URL; recargar la página conserva `q`, `page` y `pageSize`; con rol `USER` la pantalla no se alcanza.

8. **Diálogo de alta y edición.** `features/user/UserFormDialog.tsx`, con el selector múltiple de roles **sólo en modo alta**. El mapeo de `code` a campo de §3.5.
   *Verificación:* crear con un correo ya usado pinta el error bajo `email`, no en un toast; el diálogo de edición no muestra contraseña ni roles.

9. **Bloque de roles.** `features/user/UserRolesCard.tsx` con el diff de §3.5: altas por `007`, bajas en serie por `005A`, resumen al final.
   *Verificación:* a un usuario con un rol se le añade otro y la petición de `bulk` lleva **un solo** `roleId`, no dos; retirar un rol y añadir otro produce exactamente una llamada a `bulk` y una a `DELETE`.

10. **Ficha.** `features/user/UserDetailPage.tsx`: datos del usuario, badge de estado, botones de editar, desactivar y reactivar —éste sólo con `useCan(SUPERADMIN)`— y el bloque de roles.
    *Verificación:* con `ADMIN` el botón de reactivar no está en el DOM; `USER_003_NOT_FOUND` pinta la pantalla de «no existe», no una en blanco.

11. **Ruta y navegación.** La ruta `/users` y `/users/:id` en `app/router.tsx`, ambas envueltas en `<RequireRole level={ROLE_LEVELS.ADMIN}>`. Y retirar `disabled: true` de `nav.items.user` en `shared/config/navigation.ts:183`.
    *Verificación:* el ítem del menú deja de estar marcado como no disponible y navega; con `USER` no aparece.

12. **Pruebas.** `api.test.tsx`, `schemas.test.ts`, `UserListPage.test.tsx`, `UserFormDialog.test.tsx`, `UserRolesCard.test.tsx`, `UserDetailPage.test.tsx` y `app/router.user.test.tsx`, con MSW.
    *Verificación:* `npm run check` en 0.

---

## 5. Criterios de aceptación

**Listado y búsqueda**

- [ ] Las doce rutas de §3.2 se consumen; ninguna otra de los grupos `USER`, `USERROLE` o `APPROLE` aparece en `src/features/user/`.
- [ ] El toggle de inactivos con `ADMIN` cambia la petición de `/api/users` a `/api/users/admin`; no se elige la ruta a mano (`grep -n "users/admin" src/features/user/` sólo aparece en la declaración del recurso).
- [ ] Teclear un carácter no produce petición ni escribe `q` en la URL; teclear dos produce **una** petición tras 400 ms.
- [ ] Con el toggle de inactivos activo, teclear dos caracteres lo apaga y lo borra de `searchParams`.
- [ ] Un `q` que no coincide con nada pinta `user.list.emptySearch`, no un error.
- [ ] Un `400 USER_008_QUERY_REQUIRED` se pinta bajo el buscador y **nunca** como «sin resultados».
- [ ] Aplicar búsqueda y paginación y recargar conserva la vista; el enlace copiado la reproduce en otra sesión.
- [ ] El listado se pinta ordenado por `createdAt DESC` y no hay ningún control de ordenación en pantalla.

**Alta, edición y ciclo de vida**

- [ ] Crear un usuario con dos roles produce **una** llamada a `POST /api/users` con `roleId` como array, y ninguna a `/api/user-roles`.
- [ ] Un correo duplicado pinta el error bajo `email`; un `username` duplicado, bajo `username`.
- [ ] `USER_001_ROLE_LEVEL_EXCEEDED` se pinta bajo el selector de roles.
- [ ] El diálogo de edición no contiene campo de contraseña ni selector de roles, y el `PUT` no envía `displayName`, `password`, `roleId`, `isActive` ni `requiresPasswordChange`.
- [ ] Un `PUT` que reenvía la ficha sin cambiar nada no añade entrada al `<AuditTrail>`.
- [ ] Desactivarse a uno mismo pinta el mensaje de `USER_005A_SELF_DEACTIVATION`; desactivar al último SUPERADMIN, el de `USER_005A_LAST_SUPERADMIN`.
- [ ] Con `ADMIN` el botón «Reactivar» no está en el DOM; con `SUPERADMIN` sí.

**Roles**

- [ ] Añadir un rol a un usuario que ya tiene otro envía en `POST /api/user-roles/bulk` **sólo** el rol nuevo.
- [ ] Añadir uno y retirar otro produce exactamente una llamada a `bulk` y una a `DELETE /api/user-roles/:id`, en ese orden.
- [ ] Si la primera de dos bajas falla, la segunda se ejecuta igualmente y el resumen nombra la que no se aplicó.
- [ ] Volver a dar un rol revocado no llama a `PATCH /api/user-roles/activate/:id`: lo resuelve el `bulk`.
- [ ] «Guardar» está deshabilitado mientras la selección coincide con las asignaciones vigentes.
- [ ] Tras guardar, la ficha muestra los roles nuevos sin recargar la página.

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/user/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `displayName`, `email` y los roles, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` y con `ANALYTICS` el menú no ofrece `/users`, y un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState` ni en un store, ni `q` ni la paginación fuera de `searchParams`.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` también.

---

## 6. Decisiones tomadas y descartadas

**Sobre la búsqueda**

- **Sí:** un único campo `q` para nombre, correo y nombre de usuario. Es la forma que el `008` expone, y obliga a quien administra a saber de antemano qué tipo de dato tiene en la mano si se separan.
- **Sí:** buscador y toggle de inactivos **excluyentes**. `canViewInactive` es hoy sólo `SUPERADMIN` (`permissions.helper.ts:24-26`), así que un `ADMIN` que busca con el toggle activo vería desaparecer filas sin explicación. La exclusión lo hace visible en vez de misterioso.
- **No:** filtrar en memoria los inactivos que el `008` no devuelve. Sería inventar datos que el servidor no mandó, y `CONVENTIONS.md` §6.5 prohíbe filtrar en cliente.
- **No:** ocultar en pantalla que la búsqueda de nombre es por palabra completa. `per` no encuentra a `Pérez` y nunca lo hará: las columnas están cifradas de forma determinista. Decirlo en el texto de ayuda cuesta una clave i18n; no decirlo cuesta un informe de error por semana.
- **Sí:** debounce de 400 ms, no 300. Es el valor que ya usan `HealthFacilityListPage` y `GeoLocationListPage`, y un tercer número distinto no aporta nada.
- **No:** un mínimo de tres caracteres como en MedDRA. Dos es el mínimo del repositorio (`CONVENTIONS.md` §6.7), y aquí un apellido corto es una búsqueda legítima.

**Sobre los roles**

- **Sí:** un bloque con «Guardar» y no una edición inmediata por cada check. Guardar el conjunto de una vez evita el estado intermedio en el que alguien se queda sin ningún rol, que es el único estado del que un administrador no puede salir solo.
- **Sí:** el cliente calcula el diff y manda al `007` **sólo las altas**. No es una excepción a la regla de no calcular diffs: aquella es sobre el `PUT` diferencial (§6.5). Aquí es obligatorio, porque el `007` responde `409` si cualquier par pedido ya está activo (`appUserRole.service.ts:229-231`).
- **Sí:** altas primero, bajas después. Si falla el lote de altas no se ha revocado nada. El orden inverso deja al usuario sin el rol viejo y sin el nuevo.
- **Sí:** ante una baja fallida, seguir con las siguientes y reportar al final. Parar deja un estado igual de parcial, pero además arbitrario: el corte depende del orden en que se recorrió la lista.
- **No:** consumir `ESAVI-USERROLE-005B` para devolver un rol revocado. El `007` ya reactiva los pares inactivos dentro de su transacción (`:243-254`), así que el camino completo cabe en `ADMIN` sin pasar por `SUPERADMIN`.
- **Sí:** pedir las asignaciones a `ESAVI-USERROLE-002A` aunque la ficha ya traiga `roles`. El `ROLES_INCLUDE` del `003` usa `through: { attributes: [] }` y no devuelve `userRoleId` (`user.service.ts:26-31`), que es exactamente lo que `005A` necesita.
- **Sí:** varios roles en el alta. `ESAVI-USER-001` los crea en su propia transacción, así que el alta no necesita una segunda llamada ni puede quedarse a medias.

**Sobre la pantalla**

- **Sí:** ficha como página en `/users/:id`, la primera del repositorio. Los roles no caben cómodos en un diálogo, y es donde aterrizará la cobertura geográfica de FE22 sin rediseñar nada.
- **No:** panel lateral en vez de página. Un panel no tiene URL propia, y una ficha de usuario es justo lo que se pasa por enlace a otro administrador.
- **Sí:** `<AuditTrail>` en un `Sheet` desde la fila, sólo `SUPERADMIN`, como en el resto de pantallas de administración. Duplicarlo en la ficha sería el mismo contenido en dos sitios.
- **Sí:** el botón «Reactivar» **oculto** con `ADMIN`, no deshabilitado con tooltip. Un control deshabilitado que nunca se habilitará es ruido; `ARCHITECTURE.md` §4.4 ya establece que la UI oculta lo que el usuario no puede hacer.
- **No:** mostrar un control de ordenación. No hay orden posible más que `createdAt DESC`: ordenar por nombre ordenaría por el criptograma.
- **No:** guardar el último término buscado en `preferences`. Abrir la pantalla y no ver el padrón completo es desorientador.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `canViewInactive` es `SUPERADMIN`, pero el criterio de aceptación del SPEC F62 §5 dice que un `ADMIN` ve inactivos en la búsqueda. Uno de los dos está mal | La pantalla asume el código, no el criterio: buscar devuelve sólo activos para `ADMIN`. **Queda anotado como dependencia del backend**; si el F62 se corrige bajando `canViewInactive` para el `008`, la exclusión mutua de §3.5 se puede retirar sin tocar nada más |
| Un usuario creado por `POST /api/seed/admin` o por SQL tiene `nameTokens` vacío y **no se encuentra por nombre** (F62 §7, R4) | Sí se encuentra por correo exacto, y aparece en el listado sin búsqueda. Se documenta en el texto de ayuda del buscador |
| `username` distingue mayúsculas: `dperalta` no encuentra a `DPeralta` (F62 §7, R2) | Clave `user.search.usernameCaseHint` en el campo. El F62 dejó dicho que el frontend lo presente como «nombre o correo», y así se hace |
| Entre leer las asignaciones y guardar, otro administrador cambia los roles del mismo usuario. El diff queda obsoleto y el `bulk` responde `409` | El `409 USERROLE_007_ASSIGNMENT_EXISTS` invalida `['appUserRole','byUser',userId]` y pide reintentar. No se reintenta solo: el segundo intento debe partir de lo que hay ahora |
| Las bajas de roles no son transaccionales: tres `DELETE` pueden dejar dos aplicadas | Es inherente al contrato — `005A` es por asignación. El resumen final nombra lo que no se aplicó, y el estado real se relee de la query |
| El backend devuelve `firstName` en `Title Case` y `email` en minúsculas: lo guardado vuelve distinto de lo escrito | El formulario no compara lo enviado con lo devuelto. Tras la mutación se invalida y se repinta con lo que mandó el servidor |

---

## 8. Impacto en pantallas existentes

- **`shared/config/navigation.ts`** — `nav.items.user` pierde `disabled: true` (línea 183). Ningún otro cambio en el árbol: el ítem, su grupo, su icono y su `minLevel` ya estaban.
- **`src/contracts/user.ts`** — lo reescribe `npm run contracts:sync`. Hoy sólo lo consume `features/auth/`, y ninguno de los tipos que usa cambia de forma.
- **Ninguna primitiva de `shared/` se modifica.** `<ResourceTable>` ya tiene `clearFiltersLabel` y `emptyFilteredKey`, que es lo que el estado de «sin resultados de búsqueda» necesita; `<AuditTrail>` y `<SearchableSelect>` se usan tal cual.

---

## Lo que **no** está en este spec

- Administrar los roles de la aplicación: crear, editar o retirar un `appRole`. Es el SPEC FE21.
- La cobertura geográfica del usuario. Es el SPEC FE22, y aterriza como un tercer bloque en `/users/:id`.
- Ver quién tiene un rol determinado (`ESAVI-USERROLE-006`).
- Restablecer la contraseña de un tercero: no existe endpoint, y el SPEC F04 §6 lo descartó con motivo.
- Una pantalla de perfil propio sobre `/me`.
- Filtrar el listado o la búsqueda por rol, por ámbito geográfico o por estado.
- Ordenación alfabética o por relevancia, y búsqueda por prefijo o parcial.
- Normalizar `username` a minúsculas. Es un spec del backend: exige reescribir ciphertext de filas existentes.
- Exportar el listado.

Cada uno de esos, si aterriza, va en su propio spec.

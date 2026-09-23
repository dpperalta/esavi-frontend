# SPEC FE21 — Roles de la aplicación

> **Estado:** Borrador
> **Depende de:** SPEC FE01 (shell, autenticación y `useCan`), SPEC FE02 (capa de recurso genérica), **SPEC FE20 (gestión de usuarios: el `Sheet` de portadores enlaza a `/users/:id`)**, SPEC F03 del backend (`appRole`: CRUD, guardas de escalada y de rol de sistema), SPEC F52 del backend (filtro canónico `name`/`code`), SPEC F02 del backend (`appUserRole`, del que aquí sólo se lee `ESAVI-USERROLE-006`)
> **Fecha:** 2026-09-23
> **Objetivo:** Dar a un ADMIN la pantalla para crear, editar y retirar los roles de la aplicación, y para ver quién porta cada uno.

---

## 1. Por qué existe este spec

**El cliente lee roles pero no los administra.** El SPEC FE20 consume `ESAVI-APPROLE-002A` para poblar el selector de la ficha de usuario, y ahí termina. Las otras seis operaciones del grupo `APPROLE` —crear, listar con retirados, obtener por id, actualizar, retirar y reactivar— no tienen consumidor. Hoy el catálogo de roles es lo que dejó el seed: crear un `SUPERVISOR` con nivel 60 exige SQL directo.

**El menú ya tiene el hueco, y con el nivel equivocado.** `shared/config/navigation.ts:185-191` declara `nav.items.appRole` con `path: '/roles'`, `disabled: true` y `minLevel: ROLE_LEVELS.USER`. Ese `USER` es el rol mínimo real de `ESAVI-APPROLE-002A`, y por eso se escribió así en el FE01. Pero las cinco operaciones que dan sentido a la pantalla —`001`, `002B`, `004`, `005A` y `005B`— exigen `ADMIN` o más. Un `USER` que entrase vería un listado donde no puede hacer nada. Este spec retira el `disabled` y **sube el `minLevel` a `ADMIN`**, con la desviación declarada, igual que el FE19 hizo con `systemConfig`.

**Es la pantalla que cierra el círculo que abrió FE20.** Allí se decide qué roles tiene un usuario; aquí, qué roles existen y cuánta autoridad lleva cada uno. Las dos comparten la misma guarda: nadie crea ni asigna por encima de su propio nivel. Sin esta pantalla, el conjunto de roles asignables es fijo y el `level` —la columna de la que depende toda la autorización del backend desde el paso 12 del SPEC F03— no se puede tocar.

**Y es el único sitio donde se puede responder «quién tiene este rol».** `ESAVI-USERROLE-006` existe para eso y no lo consume nadie. Importa más de lo que parece: retirar un rol con portadores activos responde `409` con el recuento, y sin esta vista el administrador sabe que son cuatro pero no cuáles.

**Lo que este spec no resuelve.** Los permisos finos (`appPermission`, `appRolePermission`) siguen sin superficie HTTP en el backend, así que un rol es hoy un nombre y un número. Mientras siga siéndolo, esta pantalla es toda la administración de roles que cabe.

---

## 2. Alcance

**Dentro:**

- **Listado `/roles`**, guard `ADMIN`, con `<ResourceTable>`: paginación, toggle «mostrar retirados» que decide entre `ESAVI-APPROLE-002A` y `ESAVI-APPROLE-002B`, y orden fijo `level DESC, name ASC`.
- **Buscador de un input** enviado a la vez como `name` y `code`, mínimo 2 caracteres y debounce de 400 ms. El backend une los dos con `Op.or`: coincide en nombre **o** en código.
- **Diálogo de alta y edición** sobre `ESAVI-APPROLE-001` y `ESAVI-APPROLE-004`, con los cuatro campos: `code`, `name`, `description` y `level`.
- **Vista previa de la normalización en vivo**: bajo `code` y `name` se muestra cómo quedará tras el `toConstantCase` del servidor.
- **`level` acotado en el cliente al nivel propio, inclusive**, con la ayuda que enumera los cuatro conocidos: 10 `ANALYTICS`, 25 `USER`, 50 `ADMIN`, 100 `SUPERADMIN`.
- **Retirar** con `ESAVI-APPROLE-005A`, precedido de `ESAVI-APPROLE-003` para leer `activeUserCount` y avisar en el diálogo de confirmación cuántos usuarios portan el rol.
- **Reactivar** con `ESAVI-APPROLE-005B`. El botón **no se renderiza** salvo `SUPERADMIN`.
- **Roles de sistema**: badge en la fila, y las acciones de editar y retirar ocultas salvo `SUPERADMIN`, porque el backend responde `403 APPROLE_00X_SYSTEM_ROLE`.
- **`Sheet` de portadores** sobre `ESAVI-USERROLE-006`, abierto desde la fila, con cada usuario enlazado a `/users/:id` de FE20.
- **`<AuditTrail>` en un `Sheet`** desde la fila, sólo `SUPERADMIN`, como en el resto de pantallas de administración.
- **Retirar `disabled: true` y subir `minLevel` a `ADMIN`** en `nav.items.appRole` (`shared/config/navigation.ts:185-191`).
- **Tipos del contrato**: `CreateAppRoleInput` y `AppRoleListFilters` por `contracts:sync`; `AppRole` y `AppRoleDetail` en `contracts/declared/`.
- **Claves i18n nuevas** en los tres archivos de idioma.

**Fuera de alcance (otros specs):**

- **Permisos finos** — `appPermission` y `appRolePermission` no tienen superficie HTTP en el backend. Un rol es hoy un código, un nombre, una descripción y un nivel.
- **Asignar o revocar el rol de un usuario desde esta pantalla.** Eso es la ficha de FE20; aquí sólo se ve quién lo porta.
- **Editar `isSystemRole` por API.** El backend lo rechaza con `400` y el SPEC F03 lo dejó explícitamente fuera.
- **Cobertura geográfica del usuario.** Es SPEC FE22.
- **Jerarquía o herencia entre roles.** El modelo es plano, y el SPEC F03 lo declaró fuera.
- **Vigencia temporal de un rol.**
- **Avisar de que cambiar el `level` de un rol altera lo que pueden hacer sus portadores ahora mismo.** Se documenta como riesgo en §7, pero no se construye ninguna simulación previa.
- **Exportar el listado.**

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/roles` | `features/appRole/AppRoleListPage.tsx` | `<RequireRole level={ADMIN}>` |

Componentes de la feature, sin ruta propia:

| Componente | Archivo | Qué es |
|---|---|---|
| Diálogo de alta y edición | `features/appRole/AppRoleFormDialog.tsx` | Los cuatro campos, con la vista previa de normalización |
| Campo de nivel | `features/appRole/RoleLevelField.tsx` | Número acotado al nivel propio, con la leyenda de los cuatro conocidos |
| Portadores | `features/appRole/AppRoleHoldersSheet.tsx` | `ESAVI-USERROLE-006`, con enlace a `/users/:id` |
| Auditoría | `features/appRole/AppRoleAuditSheet.tsx` | `<AuditTrail>` sobre `appDetails`, sólo `SUPERADMIN` |

**Carpeta `features/appRole/`, con el prefijo.** Aquí el prefijo no se cae: la clave de caché es `appRole` porque `CONVENTIONS.md` §6.3 exige el nombre de la entidad del backend, el `NavItem` ya se llama `nav.items.appRole` y el archivo de tipos del backend es `appRole.types.ts`. Tres de cuatro identificadores ya lo dicen. `features/user/` de FE20 es la excepción, y lo es porque `contracts/user.ts` y `features/auth/` ya lo nombraban así.

**Navegación.** `shared/config/navigation.ts:185-191` cambia en dos líneas: se retira `disabled: true` y `minLevel` pasa de `ROLE_LEVELS.USER` a `ROLE_LEVELS.ADMIN`. El grupo, el icono (`ShieldCheck`) y la ruta no se tocan.

**Desviación declarada del `minLevel`.** `CONVENTIONS.md` §5 manda copiar el rol mínimo real de la ruta, que en `ESAVI-APPROLE-002A` es `USER`. Se sube a `ADMIN` a propósito: las cinco operaciones que dan sentido a la pantalla lo exigen, y un listado donde no se puede hacer nada es peor que no ofrecerlo. Mismo criterio y mismo precedente que el SPEC FE19 §2 con `systemConfig`.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/roles                      ESAVI-APPROLE-001    ADMIN       crear
GET    /api/roles                      ESAVI-APPROLE-002A   USER        listado, sólo activos
GET    /api/roles/admin                ESAVI-APPROLE-002B   ADMIN       listado con retirados
GET    /api/roles/:id                  ESAVI-APPROLE-003    USER        lectura previa a retirar: activeUserCount
PUT    /api/roles/:id                  ESAVI-APPROLE-004    ADMIN       actualizar
DELETE /api/roles/:id                  ESAVI-APPROLE-005A   ADMIN       retirar
PATCH  /api/roles/activate/:id         ESAVI-APPROLE-005B   SUPERADMIN  reactivar
GET    /api/user-roles/role/:id        ESAVI-USERROLE-006   ADMIN       portadores del rol
```

Son las siete del grupo `APPROLE` —todas— más una de `USERROLE`.

**Qué no se consume:** nada de `USER`, y de `USERROLE` sólo el `006`. Asignar o revocar es la ficha de FE20.

**Dos notas de comportamiento:**

1. **Los listados sí filtran por texto**, pese a lo que dice el §3.5 del SPEC F03. Es una enmienda posterior de SPEC F52: `?name=` y `?code=`, mínimo 2 caracteres, `iLike` con `%` escapado, **unidos con `Op.or`** (`appRole.service.ts:78-88`). Por eso un solo input se envía en los dos parámetros.
2. **`activeUserCount` sólo viaja en el `003`.** Los listados no lo traen, y con razón: sería una consulta por fila. De ahí que el diálogo de confirmación lo pida al abrirse y no antes.

### 3.3 Tipos del contrato

Del backend, por `npm run contracts:sync` (`src/types/user/appRole.types.ts`):

```ts
// contracts/appRole.ts
export interface CreateAppRoleInput {
  code: string; name: string; description: string; level: number;
}

export interface AppRoleListFilters { name?: string; code?: string; }
```

Declarados a mano en `contracts/declared/appRole.ts`, porque el backend no tipa la respuesta:

```ts
export interface AppRole {
  roleId: string; code: string; name: string; description: string;
  level: number; isSystemRole: boolean; isActive: boolean;
  createdAt: string; updatedAt: string | null; deletedAt: string | null;
  appDetails: AppDetails[] | null;
}

// ESAVI-APPROLE-003 añade el recuento; ninguna fila de listado lo trae.
export interface AppRoleDetail extends AppRole { activeUserCount: number; }

// Los cuatro campos, todos opcionales. isSystemRole, isActive y roleId dan 400.
export type UpdateAppRoleInput = Partial<CreateAppRoleInput>;
```

Y la respuesta de los portadores, en `contracts/declared/appUserRole.ts` —el archivo que FE20 ya crea—, porque también tiene forma propia:

```ts
// ESAVI-USERROLE-006 responde { count, role, rows }: el rol una vez, no por fila.
export interface RoleHoldersResponse {
  count: number;
  role: Pick<AppRole, 'roleId' | 'code' | 'name' | 'level'>;
  rows: UserRoleAssignment[];   // cada una con su `user` descifrado
}
```

**`sysDetails` no llega nunca**: los servicios lo excluyen. No se declara.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Texto buscado | URL | `searchParams.q` | Se envía como `name` **y** `code`; por debajo de 2 caracteres se borra del URL |
| Página y tamaño | URL | `searchParams.page`, `searchParams.pageSize` | |
| Toggle de retirados | URL | `searchParams.includeInactive` | Decide `002A` vs `002B` |
| Listado | TanStack Query | `['appRole', 'list', { q, page, pageSize, includeInactive }]` | Lo declara `createResource` |
| Rol para confirmar la retirada | TanStack Query | `['appRole', 'detail', id]` | `003`; se pide **al abrir** el diálogo, con `enabled` |
| Portadores | TanStack Query | `['appUserRole', 'byRole', roleId, { page, pageSize }]` | `USERROLE-006`; sólo mientras el `Sheet` está abierto |
| Nivel propio del solicitante | TanStack Query | Ya resuelto por `useCan` / la sesión de FE01 | Acota el `max` del campo `level`. **No se copia a ningún sitio** |
| Diálogo abierto, fila en confirmación, `Sheet` abierto | Componente | `useState` | Efímero |
| Densidad, `pageSize` por defecto, idioma | Zustand | `preferences` | Ya existe |

**El `staleTime` del listado no es de catálogo.** Aunque `appRole` lo parezca, aquí es el dato que la pantalla edita: se invalida tras cada mutación, no se cachea 30 minutos. El `staleTime` largo se queda donde FE20 lo puso, en el selector de la ficha de usuario, que sólo lee.

**Invalidaciones.** Tras `001`, `004`, `005A` y `005B` se invalida `['appRole']` entera. Eso arrastra también el selector de roles de FE20, que es lo correcto: un rol retirado deja de ofrecerse en el alta de usuarios sin recargar nada.

**La paginación del `Sheet` de portadores vive en `useState`, no en la URL.** Es la única excepción a la regla de los filtros, y es deliberada: el `Sheet` se abre desde una fila y se cierra ahí mismo; meter su página en `searchParams` ensuciaría el enlace del listado con un estado que no sobrevive a cerrar el panel.

### 3.5 Formularios y validación

**Alta** — `features/appRole/schemas.ts`, `createAppRoleSchema`. Reglas copiadas de `createAppRoleValidator` (`esavi-backend/src/validators/appRole.validator.ts:25-42`):

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `code` | `<Input>` | sí | 1–100. El servidor lo pasa a `CONSTANT_CASE` |
| `name` | `<Input>` | sí | 1–200. **También a `CONSTANT_CASE`**, no a `Title Case` |
| `description` | `<Textarea>` | sí | No vacía. Sin límite declarado en el backend |
| `level` | `<RoleLevelField>` | sí | Entero ≥ 0, **máximo el nivel propio, inclusive** |

**Edición** — `updateAppRoleSchema`: los mismos cuatro, todos opcionales. Se envía el objeto completo; el update diferencial es del backend.

**Campos que el backend rechaza con `400`**, y que por tanto el formulario no tiene: `isSystemRole`, `isActive` y `roleId`, en las dos operaciones.

**Vista previa de la normalización.** Bajo `code` y bajo `name`, mientras se teclea, se muestra el valor resultante del `toConstantCase` del servidor. Es el mismo recurso que ya usa el formulario de `catalogItem`, y aquí importa más: `name` es la clave que comparan `roleValidation.middleware.ts` y los predicados de `permissions.helper.ts`.

**El tope del campo `level`.** El `max` es el nivel propio, leído de la sesión. Un ADMIN puede crear roles de nivel ≤ 50; un SUPERADMIN, cualquiera. Es replicación de una regla del servidor y por tanto **experiencia de usuario, no seguridad** (`ARCHITECTURE.md` §4.4): el backend sigue respondiendo `403` si el valor llega igual.

**Errores del servidor mapeados a su campo:**

| `code` | Dónde se muestra |
|---|---|
| `APPROLE_001_CODE_EXISTS`, `APPROLE_004_CODE_EXISTS` | Campo `code` |
| `APPROLE_001_NAME_EXISTS`, `APPROLE_004_NAME_EXISTS` | Campo `name` |
| `APPROLE_001_LEVEL_EXCEEDED`, `APPROLE_004_LEVEL_EXCEEDED` | Campo `level` |
| `APPROLE_004_SYSTEM_ROLE`, `APPROLE_005A_SYSTEM_ROLE` | Toast: hace falta `SUPERADMIN` |
| `APPROLE_005A_SUPERADMIN_ROLE` | Toast: el rol `SUPERADMIN` no se retira |
| `APPROLE_005A_HAS_ACTIVE_ASSIGNMENTS` | Toast, con enlace que abre el `Sheet` de portadores |

**Las dos comprobaciones de unicidad no filtran por `isActive`.** Un `code` que pertenece a un rol retirado sigue ocupado, y el `409` lo dice. El formulario no intenta adivinarlo: lo pregunta al servidor.

**Diálogo de confirmación de retirada.** Al abrirse pide `ESAVI-APPROLE-003` y muestra `activeUserCount`:

- `activeUserCount === 0` → confirmación normal.
- `activeUserCount > 0` → se avisa de cuántos usuarios lo portan y se ofrece **ver quiénes**, que abre el `Sheet` de portadores. El botón de confirmar sigue disponible: el backend responde `409` y se traduce, pero el usuario ya sabe lo que va a pasar.
- Rol de sistema o rol `SUPERADMIN` → la acción no se ofrece; no se llega a este diálogo.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga (listado) | Skeleton de tabla, 5 filas | — |
| Vacío | Ilustración + botón «Crear rol» | `appRole.list.empty` |
| Vacío con búsqueda | Texto + botón «Limpiar búsqueda» | `appRole.list.emptySearch` |
| Error | Mensaje derivado del `code` del `EsaviApiError` + reintentar | `appRole.list.error` |
| Sin permiso | No se llega: `<RequireRole level={ADMIN}>` redirige, y el `NavItem` no se pinta con `USER` ni `ANALYTICS` | — |
| Carga del diálogo de retirada | Skeleton del recuento mientras responde el `003` | — |
| `Sheet` de portadores vacío | «Nadie porta este rol» | `appRole.holders.empty` |
| `Sheet` de portadores, carga | Skeleton de tres filas | — |

`errors` del envelope **no se muestra nunca**.

### 3.7 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`. Los tres campos que sobreviven: **`name`**, **`level`** y el **badge de rol de sistema**. `code` y `description` quedan en el diálogo de edición.
- El buscador ocupa el ancho completo por debajo de `md`; el toggle de retirados baja debajo.
- Los dos `Sheet` ocupan el ancho completo por debajo de `md`.
- Objetivos táctiles de 44px, `dvh` nunca `vh`.
- El `level` se pinta con su nombre conocido al lado cuando coincide —`50 · ADMIN`—, y solo como número cuando no. No se codifica por color: un badge de color sin texto no dice nada a quien no distingue esos colores.
- El menú de acciones de fila es alcanzable por teclado; los iconos sin texto llevan `aria-label` por i18n.

### 3.8 Claves i18n nuevas

| Clave | Uso |
|---|---|
| `appRole.list.title` | Título de la pantalla |
| `appRole.list.empty`, `.emptySearch`, `.error` | Estados del listado |
| `appRole.list.createLabel` | Botón «Crear rol» |
| `appRole.search.placeholder` | «Nombre o código» |
| `appRole.columns.code`, `.name`, `.description`, `.level`, `.systemRole`, `.status` | Cabeceras |
| `appRole.badges.systemRole` | Badge de rol de sistema |
| `appRole.form.createTitle`, `.editTitle` | Títulos del diálogo |
| `appRole.form.normalizedPreview` | «Se guardará como {{value}}» |
| `appRole.form.levelHint` | Los cuatro niveles conocidos |
| `appRole.form.levelMax` | «Tu nivel máximo es {{level}}» |
| `appRole.deactivate.title`, `.confirm` | Diálogo de retirada |
| `appRole.deactivate.holders` | «{{count}} usuarios portan este rol» |
| `appRole.deactivate.viewHolders` | Enlace que abre el `Sheet` |
| `appRole.holders.title`, `.empty` | `Sheet` de portadores |
| `appRole.errors.codeExists`, `.nameExists`, `.levelExceeded` | Mapeo de `code` |
| `appRole.errors.systemRole`, `.superAdminRole`, `.hasActiveAssignments` | Los `403` y `409` con mensaje propio |

Van en `es`, `en` y `nl`; `npm run i18n:check` exige paridad exacta.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y arrancable, y puede committearse solo. Los pasos 1 a 4 construyen la base sin que aparezca nada en pantalla; del 5 al 9 cada paso añade superficie; el 10 la publica en el menú.

1. **Tipos del contrato.** `npm run contracts:sync` para traer `CreateAppRoleInput` y `AppRoleListFilters` desde `../esavi-backend/src/types/user/appRole.types.ts`. A mano, en `contracts/declared/appRole.ts`: `AppRole`, `AppRoleDetail` y `UpdateAppRoleInput`. Y `RoleHoldersResponse` en `contracts/declared/appUserRole.ts`, junto a lo que FE20 dejó ahí.
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` en 0; `AppRoleDetail` tiene `activeUserCount` y `AppRole` no.

2. **Declaración del recurso.** `features/appRole/api.ts` con un solo `createResource<AppRole, CreateAppRoleInput, UpdateAppRoleInput>({ key: 'appRole', path: 'roles', adminPath: 'roles/admin', inactiveMode: 'adminPath', … })`, con los códigos `ESAVI-APPROLE-001`…`005B` citados en comentario.
   *Verificación:* `grep -rn "axios" src/features/appRole/` no devuelve nada; la clave de caché es `appRole`, no `role`.

3. **Los dos hooks que no caben en `createResource`.** En el mismo `api.ts`: `useAppRoleDetail(id, enabled)` sobre `ESAVI-APPROLE-003`, que sólo dispara con el diálogo abierto; y `useRoleHolders(roleId, params)` sobre `ESAVI-USERROLE-006`, con la clave `['appUserRole', 'byRole', roleId, params]`.
   *Verificación:* con el diálogo cerrado, MSW no registra ninguna llamada a `/api/roles/:id`.

4. **Schemas Zod.** `features/appRole/schemas.ts` con `createAppRoleSchema` y `updateAppRoleSchema`, con los límites de §3.5. El tope de `level` es un parámetro del schema, no una constante: depende del nivel del solicitante.
   *Verificación:* `level: -1` falla en el cliente; `isSystemRole` no existe en ninguno de los dos schemas.

5. **Claves i18n.** Las de §3.8 en `es.json`, `en.json` y `nl.json`.
   *Verificación:* `npm run i18n:check` en 0.

6. **Campo de nivel.** `features/appRole/RoleLevelField.tsx`: entero, `max` al nivel propio, leyenda de los cuatro conocidos y la etiqueta `50 · ADMIN` cuando el valor coincide con uno.
   *Verificación:* con sesión `ADMIN`, el campo no deja escribir 100 y muestra el aviso de tope; con `SUPERADMIN`, sí.

7. **Listado.** `features/appRole/AppRoleListPage.tsx` con `<ResourceTable>`, las columnas de §3.8, el buscador de un input enviado como `name` y `code`, el toggle de retirados y el badge de rol de sistema. Más `features/appRole/AppRoleAuditSheet.tsx`, condicionado a `useCan(SUPERADMIN)`.
   *Verificación:* teclear dos caracteres produce **una** petición con `name` y `code` con el mismo valor; una fila con `isSystemRole: true` no ofrece editar ni retirar con `ADMIN`, y sí con `SUPERADMIN`.

8. **Diálogo de alta y edición.** `features/appRole/AppRoleFormDialog.tsx`, con la vista previa de normalización bajo `code` y `name`, y el mapeo de `code` a campo de §3.5.
   *Verificación:* teclear `supervisor de zona` en `name` muestra `SUPERVISOR_DE_ZONA` como vista previa; un `code` repetido pinta el error bajo `code`, no en un toast.

9. **Retirada informada y portadores.** El diálogo de confirmación que pide `003` al abrirse y muestra `activeUserCount`, más `features/appRole/AppRoleHoldersSheet.tsx` con las filas enlazadas a `/users/:id`.
   *Verificación:* retirar un rol con portadores muestra el recuento **antes** de enviar el `DELETE`; el enlace «ver quiénes» abre el `Sheet` y cada fila navega a la ficha del usuario.

10. **Navegación.** En `shared/config/navigation.ts:185-191`: retirar `disabled: true` y cambiar `minLevel` a `ROLE_LEVELS.ADMIN`. Y la ruta `/roles` en `app/router.tsx`, envuelta en `<RequireRole level={ROLE_LEVELS.ADMIN}>`.
    *Verificación:* con `USER` el ítem no aparece y `/roles` no se alcanza; con `ADMIN` sí. `navigation.test.ts` se actualiza: hoy afirma que un `USER` ve ese ítem.

11. **Pruebas.** `api.test.tsx`, `schemas.test.ts`, `RoleLevelField.test.tsx`, `AppRoleListPage.test.tsx`, `AppRoleFormDialog.test.tsx`, `AppRoleHoldersSheet.test.tsx` y `app/router.appRole.test.tsx`, con MSW.
    *Verificación:* `npm run check` en 0.

---

## 5. Criterios de aceptación

**Listado y búsqueda**

- [ ] Las ocho rutas de §3.2 se consumen; ninguna otra del grupo `APPROLE` o `USERROLE` aparece en `src/features/appRole/`.
- [ ] El toggle de retirados con `ADMIN` cambia la petición de `/api/roles` a `/api/roles/admin`.
- [ ] Teclear un carácter no produce petición; teclear dos produce **una** tras 400 ms, con `name` y `code` con el mismo valor.
- [ ] Buscar por el código de un rol lo encuentra, y buscar por su nombre también: el backend une las dos ramas con `Op.or`.
- [ ] El listado se pinta ordenado por `level DESC, name ASC`, y no hay control de ordenación en pantalla.
- [ ] Aplicar búsqueda y paginación y recargar conserva la vista; el enlace copiado la reproduce en otra sesión.

**Alta y edición**

- [ ] Teclear `supervisor de zona` en `name` muestra `SUPERVISOR_DE_ZONA` como vista previa, y lo guardado coincide con lo previsto.
- [ ] Un `code` duplicado pinta el error bajo `code`; un `name` duplicado, bajo `name`.
- [ ] Un `code` que pertenece a un rol **retirado** también da `409`: la unicidad no filtra por `isActive`.
- [ ] Con sesión `ADMIN`, el campo `level` no admite 100 y sí admite 50; con `SUPERADMIN` admite 100.
- [ ] Si el `403 APPROLE_001_LEVEL_EXCEEDED` llega igualmente, se pinta bajo `level`, no en un toast.
- [ ] El formulario no envía `isSystemRole`, `isActive` ni `roleId` en ninguna de las dos operaciones.

**Roles de sistema y ciclo de vida**

- [ ] Una fila con `isSystemRole: true` muestra su badge, y con `ADMIN` no ofrece editar ni retirar; con `SUPERADMIN` ofrece las dos.
- [ ] El rol `SUPERADMIN` no ofrece la acción de retirar a nadie.
- [ ] Abrir el diálogo de retirada dispara **una** llamada a `GET /api/roles/:id`; con el diálogo cerrado no hay ninguna.
- [ ] Retirar un rol con portadores muestra el recuento **antes** de enviar el `DELETE`, y el enlace «ver quiénes» abre el `Sheet`.
- [ ] Si el `409 APPROLE_005A_HAS_ACTIVE_ASSIGNMENTS` llega, su mensaje ofrece abrir el `Sheet` de portadores.
- [ ] Con `ADMIN` el botón «Reactivar» no está en el DOM; con `SUPERADMIN` sí.
- [ ] Tras retirar un rol, el selector de roles de la ficha de usuario de FE20 deja de ofrecerlo sin recargar la página.

**Portadores**

- [ ] El `Sheet` lista los portadores paginados, con nombre y correo descifrados.
- [ ] Cada fila navega a `/users/:id` de FE20.
- [ ] Un rol sin portadores muestra `appRole.holders.empty`, no un error.
- [ ] La página del `Sheet` no aparece en `searchParams`: cerrarlo y copiar el enlace reproduce sólo el listado.

**Cierre**

- [ ] **Tema oscuro.** La pantalla se ve correcta en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/appRole/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `name`, `level` y el badge de rol de sistema, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` y con `ANALYTICS` el menú no ofrece `/roles`, y un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`; las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4, con la excepción declarada de la paginación del `Sheet`.
- [ ] `navigation.test.ts` refleja el `minLevel` nuevo y pasa.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` también.

---

## 6. Decisiones tomadas y descartadas

**Sobre el alcance y el acceso**

- **Sí:** `minLevel: ADMIN` en el menú, aunque el rol mínimo real de `002A` sea `USER`. Cinco de las siete operaciones exigen `ADMIN`; ofrecer a un `USER` un listado donde no puede tocar nada es peor que no ofrecerlo. Precedente: SPEC FE19 §2 con `systemConfig`.
- **No:** dejarlo en `USER` con la pantalla en sólo lectura. Nadie ha pedido consultar el catálogo de roles, y quien lo necesita para elegir uno ya lo tiene en el selector de FE20.
- **Sí:** `ESAVI-USERROLE-006` dentro de este spec. Sin él, el `409` de retirada dice «cuatro usuarios» y no hay forma de saber cuáles desde la interfaz.
- **Sí:** dependencia dura de FE20. El `Sheet` de portadores enlaza a `/users/:id`; una degradación condicional sería código que nadie probaría.
- **No:** permisos finos. `appPermission` y `appRolePermission` no tienen superficie HTTP: no hay nada que consumir.

**Sobre el formulario**

- **Sí:** vista previa de la normalización bajo `code` y `name`. Los dos pasan por `toConstantCase`, y `name` es además la clave que comparan `roleValidation.middleware.ts` y `permissions.helper.ts`. Descubrirlo al guardar es una sorpresa cara.
- **Sí:** `level` como número con tope, no como select cerrado de cuatro opciones. El propio backend usa `60` de ejemplo; un select haría imposible el caso para el que existe la columna.
- **Sí:** el tope es el nivel propio **inclusive**. Es la regla del backend (`appRole.service.ts`), y exigir estrictamente menor dejaría el nivel 50 en manos exclusivas del `SUPERADMIN`.
- **Sí:** acotar el campo en el cliente aunque el backend ya responda `403`. Es experiencia de usuario, no seguridad (`ARCHITECTURE.md` §4.4), y el `403` se sigue manejando.
- **No:** comprobar la unicidad de `code` mientras se teclea. Requeriría un endpoint que no existe, y el `409` del servidor es la única respuesta fiable: la unicidad no filtra por `isActive` y abarca roles retirados que el listado no muestra.

**Sobre la retirada**

- **Sí:** pedir `003` al abrir el diálogo de confirmación. `activeUserCount` existe exactamente para esto, y avisar antes es mejor que traducir un `409` después.
- **No:** pedirlo por fila en el listado. Sería una consulta por fila, que es la razón por la que el backend no lo incluye en los listados.
- **Sí:** dejar el botón de confirmar disponible aunque haya portadores. El backend decide; la pantalla informa. Deshabilitarlo sería replicar una guarda del servidor y equivocarse cuando el recuento cambie entre la lectura y el envío.
- **Sí:** ocultar la acción de retirar en el rol `SUPERADMIN` y en los de sistema sin `SUPERADMIN`. Esas dos sí son estados estables, no un recuento que cambia bajo los pies.

**Sobre la pantalla**

- **Sí:** listado y diálogo, sin página de ficha. Cuatro campos caben en un diálogo, y `activeUserCount` se resuelve con una consulta puntual.
- **Sí:** carpeta `features/appRole/` con el prefijo, a diferencia de `features/user/`. La clave de caché, el `NavItem` y el archivo de tipos del backend ya dicen `appRole`.
- **No:** codificar el nivel por color. Un badge de color sin texto no dice nada a quien no distingue esos colores; el número con su nombre al lado sí.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Cambiar el `level` de un rol altera **de inmediato** lo que pueden hacer sus portadores, y la pantalla no lo simula antes | El diálogo de edición avisa cuando `level` cambia y el rol tiene portadores, con el recuento del `003`. Una simulación real exigiría evaluar las 355 rutas y queda fuera de alcance |
| `code` y `name` van los dos a `CONSTANT_CASE`, lo que hace que un rol se llame `SUPERVISOR_DE_ZONA` en toda la interfaz | Es el dato real, y traducirlo en pantalla lo desalinearía de lo que comparan el middleware y los predicados del backend. Se muestra tal cual, y la vista previa lo anticipa |
| Un `code` ocupado por un rol retirado da `409` sin que el listado muestre ese rol | El mensaje del `409` nombra el `code` en conflicto, y el toggle de retirados lo hace visible. No se intenta adivinar en el cliente |
| El recuento de portadores puede cambiar entre el `003` y el `DELETE` | El `409` del backend es la autoridad; el recuento del diálogo es informativo y así se presenta |
| Subir `minLevel` a `ADMIN` rompe `navigation.test.ts`, que hoy afirma lo contrario | Está en el paso 10 del plan y en los criterios de aceptación. El test se actualiza en el mismo commit |

---

## 8. Impacto en pantallas existentes

- **`shared/config/navigation.ts`** — `nav.items.appRole` pierde `disabled: true` y su `minLevel` pasa de `USER` a `ADMIN` (líneas 185-191). `shared/config/navigation.test.ts` afirma hoy el comportamiento anterior y se actualiza con él.
- **`features/user/` (SPEC FE20)** — no se modifica, pero **se beneficia**: al invalidarse `['appRole']` tras cada mutación, el selector de roles de la ficha de usuario deja de ofrecer un rol recién retirado sin recargar. La clave de caché compartida es lo que lo hace gratis.
- **`contracts/declared/appUserRole.ts`** — creado por FE20, gana `RoleHoldersResponse`. Es una adición; nada de lo que FE20 declaró cambia de forma.
- **Ninguna primitiva de `shared/` se modifica.** `<ResourceTable>` y `<AuditTrail>` se usan tal cual; `<RoleLevelField>` es de esta feature y no de `shared/`, porque sólo esta pantalla lo usa.

---

## Lo que **no** está en este spec

- Permisos finos: `appPermission`, `appRolePermission` y cualquier pantalla que los administre.
- Asignar o revocar el rol de un usuario. Eso es la ficha de SPEC FE20.
- Editar `isSystemRole` por API.
- La cobertura geográfica del usuario. Es SPEC FE22.
- Jerarquía, herencia o agrupación entre roles: el modelo es plano.
- Vigencia temporal de un rol.
- Simular qué dejarían de poder hacer los portadores si se baja el `level` de un rol.
- Comprobar la unicidad de `code` o `name` mientras se teclea.
- Exportar el listado.

Cada uno de esos, si aterriza, va en su propio spec.

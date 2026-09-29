# SPEC FE28 — Historial y reactivación de roles de usuario

> **Estado:** Aprobado
> **Depende de:** SPEC FE20 (ficha de usuario y bloque de roles), SPEC FE21 (catálogo de roles y retirada), SPEC F02 del backend (`appUserRole`: `002B` y `005B`)
> **Fecha:** 2026-09-28
> **Objetivo:** Que un ADMIN vea en la ficha de usuario todas las asignaciones de rol que ha tenido, vigentes y revocadas, y que un SUPERADMIN pueda reactivar una revocada.

---

## 1. Por qué existe este spec

**La ficha de usuario solo muestra el presente.** `UserRolesCard` (`features/user/UserRolesCard.tsx:31`) lee `ESAVI-USERROLE-002A`, que filtra `isActive: true` (`esavi-backend/src/services/appUserRole.service.ts:131`). Cuando se revoca un rol, desaparece de la pantalla sin dejar rastro, aunque el backend conserva la fila, con su `deletedAt` y su `appDetails`. Preguntas como «¿este usuario fue ADMIN alguna vez?» o «¿cuándo le quitaron NOTIFIER?» hoy solo tienen respuesta en SQL.

**El FE20 descartó `002B` y `005B`, y este spec retoma esa decisión con un motivo nuevo.** `references/specs/20-user-management.md:47`, `:101-102` y `:387` los dejó fuera porque `007` reactiva un par revocado dentro de su propia transacción. El razonamiento sigue siendo válido para el camino principal: marcar la casilla de un rol revocado lo devuelve sin pasar por SUPERADMIN, y este spec no lo cambia. Lo que el FE20 no contempló son dos cosas:

- **La consulta del historial.** Para ver las asignaciones revocadas no basta con reactivarlas: hace falta `002B`, que es la única lectura que las devuelve.
- **El único camino que `007` no cubre: reactivar la asignación de un rol retirado.** `UserRoleCheckboxGroup` solo ofrece los roles del catálogo activo (`ESAVI-APPROLE-002A`, `features/user/api.ts:121-134`), así que la asignación a un rol retirado no tiene casilla. Aun así, este spec deshabilita esa reactivación a propósito (§6). La razón es que un privilegio que el catálogo retiró se devuelve reactivando primero el rol en FE21, no la asignación.

**Así que el valor de `005B` aquí es de coherencia, no de capacidad.** Una asignación revocada que se ve en el historial se puede reactivar desde la misma fila, sin tener que buscar la casilla en otro bloque. Solo lo puede hacer SUPERADMIN, que es el rol mínimo de la ruta (`API-ROUTES.md:632`).

---

## 2. Alcance

**Dentro:**

- **Botón «Historial»** en la cabecera de `UserRolesCard`, visible para cualquier usuario que llegue a la ficha, que ya está protegida con `ADMIN` (FE20).
- **`Sheet` «Historial de roles»**, en `features/user/UserRoleHistorySheet.tsx`, sobre `ESAVI-USERROLE-002B` con `limit: 100` y sin paginación. La consulta solo se lanza con el `Sheet` abierto.
- **Una fila por asignación**, en el orden del backend (`createdAt DESC`). Cada fila muestra:
  - nombre del rol;
  - badge «Vigente» o «Revocado»;
  - fecha de asignación (`createdAt`);
  - fecha de revocación (`deletedAt`), solo en las revocadas.
- **Botón «Reactivar»** en las filas revocadas, sobre `ESAVI-USERROLE-005B`, con confirmación `common.confirm.activate`:
  - **no se renderiza** sin `useCan(SUPERADMIN)`;
  - **no se renderiza** si el usuario está inactivo, igual que el resto de controles de edición de la ficha;
  - **se muestra deshabilitado**, con el texto «El rol está retirado», si el `roleId` de la fila no está en el catálogo activo de `useAppRoles()`.
- **Invalidaciones tras `005B`:** el historial, `['appUserRole', 'byUser', userId]` y `['user', 'detail', userId]`. Así la casilla del bloque de roles se marca sola.
- **Errores de `005B`** mapeados por `code` en `ERROR_CODE_KEYS`.
- **El tipo `UserRoleAssignment` gana `createdAt`, `updatedAt` y `deletedAt`**, que la respuesta ya trae y el tipo no declaraba.
- **Claves i18n nuevas** en los tres idiomas.
- **Tests** del `Sheet`: listado, reglas de visibilidad de «Reactivar» y el recorrido de `005B`.

**Fuera de alcance (otros specs):**

- **`<AuditTrail>` por asignación.** `appDetails` viaja en la respuesta, pero aquí solo se usan las dos fechas (§6).
- **Reactivar la asignación de un rol retirado.** El botón existe pero está deshabilitado. El camino es reactivar primero el rol en la pantalla de roles (FE21) y después la asignación.
- **Cambiar el bloque de casillas** (`UserRolesCard` + `007`/`005A`). Sigue siendo el camino principal para asignar y revocar, y la reactivación por casilla de `007` no cambia.
- **Revocar desde el historial.** Revocar ya se hace desmarcando la casilla. Un segundo botón haría lo mismo que la casilla.
- **`ESAVI-USERROLE-003`** (detalle de una asignación suelta). No tiene pantalla.
- **Cerrar todas las sesiones.** Es el SPEC FE27.

---

## 3. Diseño

### 3.1 Pantallas y rutas

No hay ruta nueva, ni `NavItem` nuevo, ni cambios de guard. Todo vive dentro de la ficha `/users/:id`, que el FE20 ya protege con `<RequireRole level={ADMIN}>`.

| Pieza | Archivo | Cambio |
|---|---|---|
| Bloque de roles | `features/user/UserRolesCard.tsx` | Botón «Historial» en `CardHeader`, que abre el `Sheet` |
| Historial | `features/user/UserRoleHistorySheet.tsx` | Nuevo. `Sheet` con la lista de `002B`, «Reactivar» y su confirmación |
| Hooks | `features/user/api.ts` | `useUserRoleHistory` y `useReinstateUserRole`, nuevos. `useBulkAssignRoles` y `useRevokeUserRole` sin cambios (ver §3.4) |

`UserRolesCard` pasa al `Sheet` el `userId` y el `readOnly` que ya recibe de `UserDetailPage.tsx:199`. Ese `readOnly` es el que oculta «Reactivar» cuando el usuario está inactivo.

### 3.2 Endpoints consumidos

```
GET    /api/user-roles/admin/user/:id  ESAVI-USERROLE-002B  ADMIN       historial: vigentes y revocadas
PATCH  /api/user-roles/activate/:id    ESAVI-USERROLE-005B  SUPERADMIN  reactivar una asignación revocada
GET    /api/roles                      ESAVI-APPROLE-002A   USER        catálogo activo, ya consumido por useAppRoles()
```

Las dos primeras se copiaron textualmente de `API-ROUTES.md:628` y `:632`.

- **`002B`** (`appUserRole.service.ts:147-170`). Hace el mismo `findAndCountAll` que `002A`, pero sin `isActive` en el `where`. Responde `{ count, user, rows }`. Error propio: `404 USERROLE_002B_USER_NOT_FOUND`.
- **`005B`** (`appUserRole.service.ts:337-370`). Responde `{ ok, message }` sin `data`. No comprueba si el rol ni el usuario están activos: esas dos reglas las pone la interfaz (§3.5). Errores:
  - `409 USERROLE_005B_ALREADY_ACTIVE`;
  - `409 USERROLE_005B_ASSIGNMENT_EXISTS`, que solo es posible si alguien escribió en la base por SQL;
  - `404 USERROLE_005B_NOT_FOUND`.

**No se consumen:** `ESAVI-USERROLE-003`, porque una asignación suelta no tiene pantalla; ni `001`, `005A`, `006` y `007`, que siguen donde los dejaron FE20 y FE21.

### 3.3 Tipos del contrato

`UserRoleAssignment` (`contracts/declared/appUserRole.ts:20-27`) gana los tres campos de fecha que la respuesta ya trae. Su origen es `toAssignmentResponse`, que devuelve el `toJSON()` completo del modelo (`appUserRole.service.ts:41-47`, columnas en `appUserRole.model.ts:54-66`):

```ts
export interface UserRoleAssignment {
  // …the six fields it already declares
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}
```

`UserRoleAssignmentsResponse` sirve sin cambios para `002B`, porque la forma es idéntica a la de `002A`. No se declaran `appDetails`, `validFrom`, `validTo` ni `sysDetails`: viajan en la respuesta, pero nada de este spec los lee (§6).

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Historial (`002B`) | TanStack Query | `['appUserRole', 'byUser', userId, { includeInactive: true }]` | `enabled` solo con el `Sheet` abierto |
| Asignaciones vigentes (`002A`) | TanStack Query | `['appUserRole', 'byUser', userId]` | Ya existe (FE20) |
| Catálogo activo de roles | TanStack Query | `['appRole', 'list']` | Ya existe. `staleTime` de 30 min. Decide qué filas tienen el rol retirado |
| Ficha del usuario | TanStack Query | `['user', 'detail', userId]` | Ya existe. De ella sale `readOnly` |
| `Sheet` abierto | Componente | `useState` en `UserRolesCard` | Efímero. Decisión cerrada en la ronda de preguntas |
| Fila pendiente de confirmar | Componente | `useState<string \| null>` en el `Sheet`, con el `userRoleId` | Efímero |
| Estado de `005B` | TanStack Query | `useMutation` de `useReinstateUserRole()` | `isPending` deshabilita la acción del diálogo |

**La clave del historial extiende la de `002A`.** No es una clave nueva. TanStack Query invalida por prefijo: invalidar `['appUserRole', 'byUser', userId]` también marca como obsoleto el historial. Por eso `useBulkAssignRoles` y `useRevokeUserRole` no necesitan cambios. Cuando alguien revoca un rol con la casilla, el historial abierto se actualiza solo.

**Invalidaciones tras `005B`:** `['appUserRole', 'byUser', userId]`, que por prefijo incluye el historial, y `['user', 'detail', userId]`. Son las mismas que ya dispara `007`, así que la casilla del rol reactivado aparece marcada sin recargar.

**Nada se filtra en memoria.** El `Sheet` pinta las filas de `002B` tal como llegan, en el orden del backend. Cruzar cada fila con el catálogo activo no es filtrar: decide si el botón está habilitado, no qué filas se muestran.

### 3.5 Reglas de «Reactivar» y errores

El botón aparece solo en las filas con `isActive: false`, y se evalúa en este orden:

| Condición | Resultado |
|---|---|
| Sin `useCan(ROLE_LEVELS.SUPERADMIN)` | No se renderiza |
| `readOnly`, porque el usuario está inactivo | No se renderiza |
| `roleId` ausente de `useAppRoles().data.rows` | Deshabilitado, con `user.roleHistory.roleRetired` debajo |
| En cualquier otro caso | Habilitado. Abre la confirmación `common.confirm.activate` |

Mientras `useAppRoles()` está cargando, el botón está deshabilitado y no muestra el aviso de rol retirado. Así no se marca como retirado un rol que simplemente no ha llegado todavía.

Al confirmar se llama a `useReinstateUserRole().mutate({ userRoleId, userId })`. Si responde 2xx:

- se cierra el diálogo;
- se muestra el toast `common.toast.activated`;
- el `Sheet` sigue abierto, y la fila pasa a «Vigente» cuando el historial se vuelve a pedir.

| `code` | Mensaje | Además |
|---|---|---|
| `USERROLE_005B_ALREADY_ACTIVE` | `user.roleHistory.errors.alreadyActive` | Invalida el historial. Otro administrador se adelantó |
| `USERROLE_005B_ASSIGNMENT_EXISTS` | `user.roleHistory.errors.assignmentExists` | Invalida el historial |
| `USERROLE_005B_NOT_FOUND` y cualquier otro | `getErrorMessage`: `message` del backend o `common.errors.unexpected` | — |

En todos los casos de error se cierra el diálogo y se muestra un toast. Ningún error tiene un campo al que asignarse: no hay formulario.

### 3.6 Estados del `Sheet`

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Tres filas `Skeleton` | — |
| Vacío | Texto: el usuario nunca ha tenido roles | `user.roleHistory.empty` |
| Error | `getErrorMessage(error)` y botón «Reintentar». `USERROLE_002B_USER_NOT_FOUND` cae aquí con el `message` del backend | `common.table.retry` |
| Sin permiso | No se llega: la ficha exige `ADMIN`, igual que `002B` | — |

### 3.7 Responsividad y accesibilidad

- **`Sheet` lateral derecho**, a ancho completo por debajo de `sm`. Las filas ya son bloques apilados, no una tabla, así que no hay que colapsar tabla a tarjetas.
- **Los tres datos que sobreviven por debajo de `md`:**
  - nombre del rol;
  - badge de estado;
  - la fecha relevante: `deletedAt` en las revocadas, `createdAt` en las vigentes.

  Por encima de `md`, las revocadas muestran las dos fechas.
- **Las fechas van en `dd/MM/yyyy` con date-fns**, igual que `formatTimestamp` de `UserDetailPage.tsx:29-31`.
- **«Reactivar» mide al menos 44px por debajo de `md`** (`size="touch"`, `shared/components/ui/button.tsx:37`, del FE15).
- **El aviso de rol retirado** se enlaza al botón con `aria-describedby`, para que un lector de pantalla diga por qué está deshabilitado.
- **El `Sheet` lleva `SheetTitle` y `SheetDescription`**, que exige Radix, y el foco vuelve al botón «Historial» al cerrarlo.

### 3.8 Claves i18n nuevas

| Clave | Uso |
|---|---|
| `user.roleHistory.open` | Botón «Historial» de la tarjeta |
| `user.roleHistory.title` | `SheetTitle` |
| `user.roleHistory.description` | `SheetDescription` |
| `user.roleHistory.status.active` | Badge «Vigente» |
| `user.roleHistory.status.revoked` | Badge «Revocado» |
| `user.roleHistory.assignedAt` | Etiqueta de `createdAt` |
| `user.roleHistory.revokedAt` | Etiqueta de `deletedAt` |
| `user.roleHistory.empty` | Estado vacío |
| `user.roleHistory.roleRetired` | Aviso bajo «Reactivar» deshabilitado |
| `user.roleHistory.errors.alreadyActive` | `USERROLE_005B_ALREADY_ACTIVE` |
| `user.roleHistory.errors.assignmentExists` | `USERROLE_005B_ASSIGNMENT_EXISTS` |

Se reutilizan `common.actions.activate`, `common.actions.cancel`, `common.confirm.activate`, `common.toast.activated`, `common.table.retry` y `common.errors.unexpected`.

---

## 4. Plan de implementación

1. **Tipos del contrato.** `createdAt`, `updatedAt` y `deletedAt` en `UserRoleAssignment` (`contracts/declared/appUserRole.ts`), con el origen en el comentario (§3.3).
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en `contracts/declared/appUserRole.ts` ni en `features/user/` o `features/appRole/`, que ya usan el tipo.

2. **Hooks.** En `features/user/api.ts`:
   - **`useUserRoleHistory(userId, enabled)`.** Comentado con `// ESAVI-USERROLE-002B`. Hace `GET user-roles/admin/user/${userId}` con `limit: WHOLE_LIST_LIMIT, offset: 0`, y usa la clave de §3.4.
   - **`useReinstateUserRole()`.** Comentado con `// ESAVI-USERROLE-005B`. Hace `PATCH user-roles/activate/${userRoleId}`, recibe `{ userRoleId, userId }` como `useRevokeUserRole`, y tiene las dos invalidaciones de §3.4 en su `onSuccess`.

   *Verificación:* en `features/user/api.test.tsx`, con MSW:
   - una llamada a `useRevokeUserRole` marca como obsoleta la query del historial, lo que confirma que la invalidación por prefijo funciona;
   - `useReinstateUserRole` invalida `['user', 'detail', userId]`.

3. **Mensajes e i18n.**
   - Los dos `409` de `005B` en `ERROR_CODE_KEYS` de `shared/api/errorMessages.ts`;
   - las once claves de §3.8 en `es.json`, `en.json` y `nl.json`.

   *Verificación:* `npm run i18n:check` sale en 0.

4. **`Sheet` del historial.** `features/user/UserRoleHistorySheet.tsx`, con props `{ userId, readOnly, open, onOpenChange }`:
   - lista de `002B` y los cuatro estados de §3.6;
   - reglas de «Reactivar» de §3.5, cruzando con `useAppRoles()`;
   - `AlertDialog` de confirmación y toasts por `code`.

   *Verificación:* compila y el lint pasa. La prueba visual se hace en el paso 5, cuando el `Sheet` ya se puede abrir.

5. **Botón en la tarjeta.** «Historial» (`user.roleHistory.open`) en el `CardHeader` de `UserRolesCard.tsx`, junto al título, con el `useState` del `Sheet` abierto. El botón se ve también con `readOnly`, porque consultar el historial de un usuario inactivo es lo que se viene a hacer a su ficha.
   *Verificación:* a mano, con `npm run dev` y el backend en 4500:
   - con SUPERADMIN, revocar un rol con la casilla y abrir el historial: la fila aparece «Revocado» con fecha;
   - pulsar «Reactivar»: la casilla del bloque vuelve a estar marcada sin recargar;
   - con ADMIN, el botón «Reactivar» no está en el DOM;
   - retirar un rol en `/roles`, revocárselo a un usuario y abrir su historial: «Reactivar» está deshabilitado y muestra el aviso.

6. **Tests del `Sheet`.** `features/user/UserRoleHistorySheet.test.tsx`, con MSW y envelope exacto:
   - pinta filas vigentes y revocadas con su badge; `deletedAt` solo en las revocadas;
   - con ADMIN, `queryByRole('button', { name: 'common.actions.activate' })` es `null`;
   - con SUPERADMIN y `readOnly`, tampoco hay botón;
   - con SUPERADMIN y un `roleId` ausente del catálogo, el botón está deshabilitado y tiene `aria-describedby` hacia `user.roleHistory.roleRetired`;
   - reactivar confirma, llama a `PATCH /user-roles/activate/:id` y vuelve a pedir `002B`;
   - `409 USERROLE_005B_ALREADY_ACTIVE` cierra el diálogo y vuelve a pedir `002B`;
   - error de `002B`: se muestra el mensaje y «Reintentar» vuelve a pedirlo;
   - respuesta con `rows: []`: se ve `user.roleHistory.empty`.

   *Verificación:* `npx vitest run src/features/user/` pasa, incluidos `UserRolesCard.test.tsx` y `UserDetailPage.test.tsx` sin tocarlos.

---

## 5. Criterios de aceptación

- [ ] `ESAVI-USERROLE-002B` y `ESAVI-USERROLE-005B` se consumen a través de `client`, y `grep -rn "ESAVI-USERROLE-002B\|ESAVI-USERROLE-005B" src/features/user/api.ts` devuelve las dos líneas.
- [ ] El `Sheet` no lanza ninguna petición a `002B` mientras está cerrado. Se comprueba en la pestaña de red al cargar la ficha.
- [ ] El historial muestra todas las asignaciones del usuario, vigentes y revocadas, en el orden de la respuesta, sin filtrar en el cliente.
- [ ] Revocar un rol con la casilla, con el `Sheet` abierto, hace que la fila pase a «Revocado» sin cerrar ni recargar.
- [ ] Reactivar desde el historial marca la casilla del rol en `UserRolesCard` sin recargar.
- [ ] Con ADMIN, «Reactivar» no está en el DOM. Con SUPERADMIN y un usuario inactivo, tampoco.
- [ ] Con SUPERADMIN, la asignación de un rol retirado muestra «Reactivar» deshabilitado, con el aviso enlazado por `aria-describedby`.
- [ ] Mientras `useAppRoles()` carga, ningún botón muestra el aviso de rol retirado.
- [ ] `USERROLE_005B_ALREADY_ACTIVE` y `USERROLE_005B_ASSIGNMENT_EXISTS` muestran su clave propia y vuelven a pedir el historial.
- [ ] El camino de FE20 no cambia: `UserRolesCard.test.tsx` y `UserDetailPage.test.tsx` pasan sin modificarse.
- [ ] `npx vitest run src/features/user/` pasa.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El `Sheet`, los badges y el diálogo se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/user/` no devuelve resultados.
- [ ] **Por debajo de `md`.** A 375px el `Sheet` ocupa todo el ancho, cada fila muestra los tres datos de §3.7 y el body no hace scroll horizontal.
- [ ] **Rol bajo.** Con ADMIN, el historial se ve completo y sin controles de reactivación. `USER` y `ANALYTICS` no llegan a la ficha, porque el menú no la ofrece y el guard la rechaza. Un `403` inesperado de `005B` se maneja con un toast y sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos `SheetDescription` y el aviso de rol retirado. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: las filas de `002B` no se copian a `useState`, y el cruce con el catálogo se calcula al pintar.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** consumir `002B` y `005B`, retomando lo que el FE20 §6 descartó. El FE20 tenía razón en que `007` basta para devolver un rol. Lo que no cubría es la consulta del historial, y `002B` es la única lectura que lo devuelve. `005B` entra para que una fila revocada se pueda reactivar desde donde se ve, no porque falte capacidad.
- **Sí:** el historial en un `Sheet` y no dentro de la tarjeta. La consulta solo se lanza al abrirlo, la tarjeta no crece y no hay que filtrar en memoria las revocadas de una respuesta que trae todas.
- **No:** una sección «Revocados» dentro de la tarjeta. Obliga a filtrar `isActive === false` en el cliente, contra `CONVENTIONS.md` §6.5.
- **No:** un toggle «mostrar revocados» en la URL que cambie la tarjeta de `002A` a `002B`. La tarjeta es una lista de casillas del catálogo, no de asignaciones: una asignación revocada no tiene casilla en la que pintarse.
- **Sí:** la clave del historial extiende la de `002A` (`[..., userId, { includeInactive: true }]`). Las invalidaciones que ya hacen `007` y `005A` alcanzan el historial por prefijo, sin tocar esos dos hooks.
- **No:** una clave hermana como `['appUserRole', 'history', userId]`. Obligaría a añadir una invalidación a `useBulkAssignRoles` y a `useRevokeUserRole`. Olvidar una dejaría el historial abierto mostrando un rol vigente que ya se revocó.
- **Sí:** ocultar «Reactivar» si el usuario está inactivo, aunque el backend lo permite. La ficha de un usuario inactivo ya oculta todo lo editable (FE20 §3.6). Devolverle un rol a quien no puede entrar no sirve de nada hasta reactivarlo, y ese es otro botón, en otro sitio.
- **Sí:** deshabilitar «Reactivar» para las asignaciones de un rol retirado, en vez de ocultarlo. La regla de `ARCHITECTURE.md` §4.4 lo pide así: se oculta lo que el usuario nunca podrá hacer, y se deshabilita lo que no puede hacer *ahora* por otra razón. Aquí la razón se resuelve reactivando el rol en FE21, y el aviso lo dice.
- **No:** permitir reactivar la asignación de un rol retirado, aunque `005B` lo acepta. Devolvería un privilegio que el catálogo retiró sin que nadie reconsidere el rol. La casilla tampoco lo ofrece, y así los dos caminos se comportan igual.
- **Sí:** solo las dos fechas, sin `<AuditTrail>` por fila. `createdAt` y `deletedAt` responden a «desde cuándo» y «hasta cuándo», que es lo que se consulta. El quién está en `appDetails`, y sus autores solo se resuelven para quien pasa `canViewAuditAuthors`. Es un spec aparte si hace falta.
- **No:** declarar `appDetails`, `validFrom`, `validTo` ni `sysDetails` en `UserRoleAssignment`. Viajan en la respuesta, pero nada los lee, y un campo declarado sin consumidor es un campo que alguien acabará usando sin haber verificado su forma.
- **No:** paginar el `Sheet`. El backend garantiza una fila por par usuario-rol (SPEC F02 §6), así que el historial de un usuario nunca supera el número de roles del catálogo. `limit: 100` basta, igual que en `002A`.
- **No:** revocar desde el historial. Desmarcar la casilla ya lo hace, y un segundo botón con la misma consecuencia en otro bloque invita a preguntarse cuál de los dos es el bueno.
- **Sí:** el `Sheet` sigue abierto tras reactivar. Quien reactiva suele estar revisando más de una fila. La confirmación se cierra y la fila cambia en el sitio.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Un rol recién retirado en `/roles` sigue en `['appRole', 'list']` hasta 30 minutos, y su asignación aparece con «Reactivar» habilitado | FE21 invalida `['appRole']` entera tras `005A` (`21-approle-management.md:161`), así que en la misma pestaña no ocurre. Desde otra pestaña o equipo puede pasar durante esa ventana, y el backend aceptaría la reactivación. Riesgo aceptado: la ruta ya exige SUPERADMIN, que puede reactivar el rol de todos modos |
| Otro administrador reactiva la misma fila a la vez | `409 USERROLE_005B_ALREADY_ACTIVE`: aviso propio y se vuelve a pedir el historial (§3.5) |
| `appRole` inactivo en el catálogo pero con asignaciones activas: el historial muestra «Vigente» de un rol retirado | Es un estado real del backend: retirar un rol no revoca sus asignaciones. El historial lo refleja tal cual. Qué hacer con esas asignaciones es asunto de FE21, no de este spec |
| El tipo `UserRoleAssignment` gana campos obligatorios y rompe mocks de tests existentes | Los mocks de `features/user/` y `features/appRole/` que construyan `UserRoleAssignment` se completan en el paso 1. El `tsc` de ese paso los encuentra |

---

## 8. Impacto en pantallas existentes

- **`features/user/UserRolesCard.tsx`.** Gana el botón «Historial» en el `CardHeader` y el `useState` que abre el `Sheet`. Su bloque de casillas y su «Guardar» no cambian.
- **`contracts/declared/appUserRole.ts`.** `UserRoleAssignment` gana tres campos. Lo usan `features/user/` (FE20) y `features/appRole/` (FE21), que no necesitan cambios más allá de los mocks de sus tests.
- **`shared/api/errorMessages.ts`.** Dos entradas nuevas en `ERROR_CODE_KEYS`.

---

## Lo que **no** está en este spec

- `<AuditTrail>` por asignación.
- Reactivar la asignación de un rol retirado.
- Revocar desde el historial.
- Cambios en el bloque de casillas de FE20.
- `ESAVI-USERROLE-003`.
- Cerrar todas las sesiones (SPEC FE27).

Cada uno de esos, si aterriza, va en su propio spec.

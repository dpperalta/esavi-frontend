# SPEC FE27 — Cerrar todas las sesiones

> **Estado:** Implementado
> **Depende de:** SPEC FE01 (shell, sesión y `useCan`), SPEC FE15 (touch targets del topbar), SPEC F42 del backend (rotación de refresh y `ESAVI-AUTH-004`)
> **Fecha:** 2026-09-28
> **Objetivo:** Que cualquier usuario con rol USER o superior pueda cerrar desde el topbar todas sus sesiones abiertas, incluida la actual.

---

## 1. Por qué existe este spec

**El FE01 lo prometió y no se construyó.** `references/specs/01-auth-shell.md:38` incluye `logout-all` en el alcance de la sesión. La línea `:125` cita `ESAVI-AUTH-004` entre los endpoints consumidos, y `:207` dice qué se limpia tras él. Pero en `src/` no hay ninguna llamada a `/auth/logout-all`. Lo único que quedó fueron las dos claves i18n, `auth.session.logoutAll` y `auth.session.logoutAllConfirm` (`src/locales/es.json:161-162`, lo mismo en `en` y `nl`), que nada usa. El topbar solo ofrece el logout de la sesión actual (`app/layout/Topbar.tsx:125-133`), que llama a `ESAVI-AUTH-003`.

**Sin esta opción, una sesión olvidada no se puede cerrar desde la aplicación.** El refresh token dura días (SPEC F42). Si alguien deja la sesión abierta en un puesto compartido del centro de salud, o pierde un equipo, esa sesión sigue viva hasta que caduca. Hoy la única forma de revocarla sin esperar es cambiar la contraseña: `ESAVI-USER-006` revoca todas las sesiones como efecto secundario. Obligar a alguien a cambiar su contraseña solo para cerrar sesiones es un rodeo que nadie encuentra.

**El backend ya está listo.** `POST /api/auth/logout-all` existe desde el SPEC F42 (`esavi-backend/src/routes/auth.routes.ts:29`). Toma el `userId` del token, no lleva body y responde `{ revokedCount }`. Este spec es solo su consumo en el cliente.

---

## 2. Alcance

**Dentro:**

- **Hook `useLogoutAll()`** en `features/auth/api.ts` sobre `ESAVI-AUTH-004`, con el código citado en comentario.
  - **Si `004` responde 2xx**, hace la misma limpieza local que `logout`: `setAccessToken(null)`, `tokenStore.clearRefreshToken()`, `useDraftsStore.getState().clearAll()` y `queryClient.clear()`.
  - **Si `004` falla, no limpia nada.**
- **El icono de logout del topbar pasa a abrir un menú** con dos entradas: «Cerrar sesión» y «Cerrar todas las sesiones». Cada una abre su propia confirmación. Es el mismo menú por encima y por debajo de `md`.
- **«Cerrar todas las sesiones» se oculta con `useCan(ROLE_LEVELS.USER)`.** ANALYTICS ve el menú con una sola entrada.
- **Diálogo de confirmación de `logout-all`:**
  - título `auth.session.logoutAll`, descripción `auth.session.logoutAllConfirm` y acción en variante `destructive`;
  - sigue abierto con la acción deshabilitada mientras la petición está en vuelo.
- **Si `004` responde 2xx:** se navega a `/login` con `replace` y se muestra el toast `auth.session.logoutAllDone` con `{{count}}` = `revokedCount`.
- **Si `004` falla:** se cierra el diálogo y se muestra un toast de error por `code`. La sesión local sigue intacta y el usuario puede reintentar.
- **`AUTH_004_LOGOUT_ALL_FAILED` → `auth.errors.logoutAllFailed`** en `shared/api/errorMessages.ts`.
- **Claves i18n nuevas** en los tres idiomas: `shell.sessionMenu.trigger`, `auth.session.logoutAllDone` y `auth.errors.logoutAllFailed`.
- **Adaptar `Topbar.test.tsx`** al nuevo recorrido y cubrir los casos de `004`.

**Fuera de alcance (otros specs):**

- **Historial y reactivación de asignaciones de rol** (`ESAVI-USERROLE-002B`, `005B`). Es el **SPEC FE28**.
- **Lista de sesiones activas con cierre individual.** El inventario no tiene ruta para listar sesiones ni para revocar una concreta, solo `004`, que las cierra todas. Sería un spec del backend primero.
- **Cerrar las sesiones de un tercero desde la ficha de usuario.** `004` solo actúa sobre el usuario del token, y no existe una ruta de administración equivalente.
- **Cambiar el comportamiento de `logout` (`003`)**, que sigue limpiando la sesión local aunque la red falle. La asimetría es deliberada (§6).
- **Resolver el desbordamiento del topbar a 375px** registrado tras FE15. Este spec no añade ningún botón a la barra, así que no lo empeora, pero tampoco lo arregla.

---

## 3. Diseño

Este spec es transversal, así que §3 no sigue el desglose de un spec de entidad. Describe qué aparece, qué cambia y dónde vive cada dato.

### 3.1 Qué cambia en la pantalla

No hay ruta nueva ni `NavItem` nuevo. El cambio entero está en `app/layout/Topbar.tsx`.

| | Antes | Después |
|---|---|---|
| Icono `LogOut` del topbar | `<Button>` con `aria-label` `auth.session.logout` que abre la confirmación de `003` | `DropdownMenuTrigger` con `aria-label` `shell.sessionMenu.trigger` |
| Contenido del menú | — | «Cerrar sesión» (todos los roles) y «Cerrar todas las sesiones» (solo con `useCan(ROLE_LEVELS.USER)`) |
| Confirmación de `003` | `AlertDialog` con título `auth.session.logoutConfirm` | Sin cambios. Se abre desde la entrada del menú |
| Confirmación de `004` | — | `AlertDialog` propio: título `auth.session.logoutAll`, descripción `auth.session.logoutAllConfirm`, acción `destructive` |
| Tamaño del disparador | `size="icon-sm"` | `size="icon-sm"`, sin cambios (ver §7) |

Las dos confirmaciones son dos `AlertDialog` hermanos, cada uno con su propio `open`. El menú se cierra al elegir una entrada, antes de abrir el diálogo, igual que ya hace el menú de usuario de FE15. Así el foco no queda atrapado en un menú cerrado.

### 3.2 Endpoints consumidos

```
POST   /api/auth/logout-all            ESAVI-AUTH-004       USER        revoca todas las sesiones, incluida la actual
POST   /api/auth/logout                ESAVI-AUTH-003       (pública)   sin cambios
```

`004` se copió textualmente de `API-ROUTES.md:91`. `003` no tiene fila en el inventario: está en su sección «Rutas sin fila», como declaró el FE01 §3.2.

Contrato de `004` (`esavi-backend/src/controllers/auth.controller.ts:82-99`, SPEC F42 §259):

- **Petición:** sin body. El `userId` sale de `req.user`, nunca del cliente.
- **Éxito:** `200 { ok, message, data: { revokedCount } }`. Una segunda llamada responde `{ revokedCount: 0 }`, no un error.
- **Error propio:** `500 AUTH_004_LOGOUT_ALL_FAILED`.
- **Errores transversales:** `401 AUTH_TOKEN_*`, que pasa por la cola de refresh como cualquier petición autenticada, y `403 AUTH_ROLE_FORBIDDEN` para ANALYTICS.

**`004` va por `client`, no por `axios` directo**, y no se añade a `PUBLIC_AUTH_PATHS` (`shared/api/client.ts:101`). Es una ruta autenticada. Si el access token caducó, la cola de refresh lo renueva y reintenta `004`. Ese refresh consume el refresh token actual, y `004` revoca después el nuevo. No hay reutilización, así que no se dispara la revocación del F42.

### 3.3 Tipos del contrato

Una interfaz nueva en `contracts/declared/auth.ts`. Va ahí, no a `contracts/` sincronizado, por la misma razón que `LoginResponse`: el backend construye la respuesta como literal, sin una `interface` que `contracts:sync` pueda copiar.

```ts
// POST /api/auth/logout-all (ESAVI-AUTH-004) — origin: esavi-backend/src/services/auth.service.ts:312-316
export interface LogoutAllResponse {
  revokedCount: number;
}
```

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Usuario y nivel efectivo | TanStack Query | `['user', 'me']` | Ya existe (FE01). Lo lee `useCan` para ocultar la entrada |
| Estado de la petición `004` | TanStack Query | `useMutation` de `useLogoutAll()` | `isPending` deshabilita la acción del diálogo y el disparador |
| `revokedCount` | Ninguna | Argumento del `onSuccess` | Solo alimenta el toast. No se guarda |
| Diálogo de `003` abierto | Componente | `useState` en `Topbar` | Ya existe (`confirmLogout`) |
| Diálogo de `004` abierto | Componente | `useState` en `Topbar` | Efímero |
| Access token | Módulo `client` | `setAccessToken(null)` | Solo tras 2xx de `004` |
| Refresh token | `TokenStore` | `tokenStore.clearRefreshToken()` | Solo tras 2xx de `004` |
| Borradores del wizard | Zustand | `useDraftsStore.getState().clearAll()` | Solo tras 2xx de `004`, por el mismo motivo que en `003` (SPEC FE12a §3.4) |
| Caché de consultas | TanStack Query | `queryClient.clear()` | Solo tras 2xx de `004`. No se invalida nada: se vacía todo |

**La limpieza depende del resultado, y en `003` no.** `003` limpia en cualquier caso (`features/auth/api.ts:96-112`). `004` solo limpia si recibe 2xx. La excepción es deliberada y está razonada en §6.

**Una sola implementación de la limpieza.** Los cuatro pasos locales de `logout` se extraen a una función del módulo `features/auth/api.ts`, que llaman `003` y `004`. Así no se copian cuatro líneas que tienen que evolucionar juntas: si mañana se añade un quinto paso a la limpieza, lo reciben las dos rutas. `clearSession()` de `client.ts:87-93` no se reutiliza porque no vacía `queryClient`: en esa ruta el vaciado lo hace el consumidor.

### 3.5 Flujo y errores

1. El usuario abre el menú y elige «Cerrar todas las sesiones». Se abre el diálogo de `004`.
2. Al pulsar la acción se llama a `useLogoutAll().mutate()`. El diálogo sigue abierto, con la acción y la cancelación deshabilitadas mientras `isPending`.
3. **Si `004` responde 2xx:**
   - se hace la limpieza local (§3.4);
   - se navega a `/login` con `replace: true`;
   - se muestra `toast.success(t('auth.session.logoutAllDone', { count: revokedCount }))`. El `<Toaster>` está montado en `app/providers.tsx:27`, por encima del router, así que el toast sobrevive a la navegación.
4. **Si `004` falla:**
   - se cierra el diálogo;
   - se muestra `toast.error(getErrorMessage(error))`;
   - no se toca ni la sesión ni la caché.

| `code` | Mensaje |
|---|---|
| `AUTH_004_LOGOUT_ALL_FAILED` | `auth.errors.logoutAllFailed`, clave nueva en `ERROR_CODE_KEYS` |
| `AUTH_ROLE_FORBIDDEN` | El `message` del backend, por el respaldo de `getErrorMessage`. No debería ocurrir, porque la entrada está oculta para ANALYTICS, pero se maneja igual (`CONVENTIONS.md` §11) |
| `AUTH_002_REFRESH_TOKEN_REUSED` u otro 401 del refresh | Lo resuelve `client.ts`: limpia y manda al login. `useLogoutAll` no hace nada más |
| Cualquier otro, o `UNKNOWN_ERROR` | El `message` del backend o `common.errors.unexpected` (`errorMessages.ts:332-341`) |

**Pluralización del toast.** `auth.session.logoutAllDone` usa las variantes `_one` y `_other` de i18next. Por ejemplo, en español: «Se cerró 1 sesión» y «Se cerraron {{count}} sesiones». `revokedCount` nunca vale 0 en este flujo, porque la sesión actual estaba viva al llamar. Aun así, `_other` cubre el 0 sin romperse.

### 3.6 Estados

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Reposo | Menú con una o dos entradas, según el rol | `auth.session.logout`, `auth.session.logoutAll` |
| En vuelo | Diálogo de `004` abierto con acción y cancelación deshabilitadas; disparador deshabilitado | — |
| Éxito | Pantalla `/login` con toast de éxito | `auth.session.logoutAllDone` |
| Error | Diálogo cerrado, toast de error y sesión intacta | `auth.errors.logoutAllFailed` o respaldo |
| Sin permiso (ANALYTICS) | La entrada no se renderiza | — |

### 3.7 Responsividad y accesibilidad

- **El mismo menú en todos los anchos.** No hay variante `md:hidden`: el disparador ya estaba visible en los dos anchos y sigue así.
- **Nombre accesible propio para el disparador:** `shell.sessionMenu.trigger` («Sesión»). Así no coincide con la entrada «Cerrar sesión», y los tests pueden distinguir los dos por rol y nombre.
- **Las entradas del menú son `DropdownMenuItem`**, navegables con flechas. `Enter` abre el diálogo, y el foco pasa a él gracias al `AlertDialog` de Radix.
- **El disparador mide 28px (`icon-sm`, `size-7`), por debajo de los 44px de `CONVENTIONS.md` §10.2.** Es la deuda de touch target que ya existía, no una nueva. §7 la registra.

### 3.8 Claves i18n nuevas

| Clave | Uso |
|---|---|
| `shell.sessionMenu.trigger` | `aria-label` del disparador del menú de sesión |
| `auth.session.logoutAllDone_one` / `_other` | Toast de éxito con `{{count}}` |
| `auth.errors.logoutAllFailed` | Toast de `AUTH_004_LOGOUT_ALL_FAILED` |

Se reutilizan sin cambios `auth.session.logout`, `auth.session.logoutConfirm`, `auth.session.logoutAll`, `auth.session.logoutAllConfirm` y `common.actions.cancel`. Las nuevas van en `es`, `en` y `nl`, y `npm run i18n:check` exige paridad.

---

## 4. Plan de implementación

1. **Tipo del contrato.** `LogoutAllResponse` en `contracts/declared/auth.ts`, con su comentario de origen (§3.3).
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en `contracts/declared/auth.ts`.

2. **Extraer la limpieza local.** En `features/auth/api.ts`, los cuatro pasos locales de `logout()` (`:106-111`) pasan a una función del módulo. `logout()` la llama sin cambiar su orden ni su comportamiento: primero `003` con el refresh token, luego la limpieza, pase lo que pase con la red. `useLogout` sigue haciendo `queryClient.clear()` en su `onSuccess`.
   *Verificación:* el bloque `describe('Topbar — logout')` de `Topbar.test.tsx` pasa sin tocarlo. Es un refactor puro: si un test cambia en este paso, el paso está mal.

3. **Hook `useLogoutAll()`.** En `features/auth/api.ts`, comentado con `// ESAVI-AUTH-004`:
   - `mutationFn` hace `client.post<LogoutAllResponse>('/auth/logout-all')` y devuelve `revokedCount`;
   - solo si la petición resuelve, ejecuta la limpieza del paso 2;
   - `onSuccess` hace `queryClient.clear()`.

   La navegación y el toast no van en el hook: los decide el consumidor, igual que con `useLogout`.
   *Verificación:* `grep -n "ESAVI-AUTH-004" src/features/auth/api.ts` devuelve la línea. `grep -rn "logout-all" src/shared/api/client.ts` no devuelve nada: la ruta no entra en `PUBLIC_AUTH_PATHS`.

4. **Mensajes e i18n.**
   - `AUTH_004_LOGOUT_ALL_FAILED: 'auth.errors.logoutAllFailed'` en `ERROR_CODE_KEYS` de `shared/api/errorMessages.ts`;
   - las cuatro claves de §3.8 (`logoutAllDone` cuenta como dos, por `_one` y `_other`) en `es.json`, `en.json` y `nl.json`.

   *Verificación:* `npm run i18n:check` sale en 0.

5. **Menú de sesión en el topbar.** En `app/layout/Topbar.tsx`:
   - el `<Button>` de `LogOut` pasa a `DropdownMenuTrigger` con `aria-label={t('shell.sessionMenu.trigger')}`;
   - el menú tiene dos `DropdownMenuItem`, y el segundo se muestra solo con `useCan(ROLE_LEVELS.USER)`;
   - se añade un segundo `AlertDialog` para `004`, con el flujo de §3.5;
   - el disparador queda deshabilitado mientras cualquiera de las dos mutaciones esté `isPending`.

   *Verificación:* a mano, con `npm run dev` y el backend en 4500:
   - abrir dos sesiones con el mismo usuario en dos navegadores y lanzar «Cerrar todas las sesiones» en uno; el toast dice «Se cerraron 2 sesiones»;
   - en el otro navegador, la siguiente petición termina en `/login`;
   - con un usuario ANALYTICS, el menú muestra solo «Cerrar sesión».

6. **Tests del topbar.** En `app/layout/Topbar.test.tsx`, primero se adapta el bloque existente: el disparador se busca por `shell.sessionMenu.trigger` y la entrada por `auth.session.logout` dentro del menú. Después, un bloque `describe('Topbar — logout-all')` con MSW y envelope exacto:
   - 200 con `{ revokedCount: 3 }`: se navega a `/login`, `tokenStore.getRefreshToken()` es `null` y `draftsStore` queda vacío;
   - 500 `AUTH_004_LOGOUT_ALL_FAILED`: no se navega, el refresh token sigue presente y el diálogo se cierra;
   - con un usuario ANALYTICS, `queryByRole('menuitem', { name: 'auth.session.logoutAll' })` es `null`;
   - mientras la respuesta está pendiente, la acción del diálogo está deshabilitada.

   Los toasts no se asertan: ningún test del repositorio monta `<Toaster>` (`NotificationStep.test.tsx:17`).
   *Verificación:* `npx vitest run src/app/layout/Topbar.test.tsx` pasa.

---

## 5. Criterios de aceptación

- [ ] `POST /api/auth/logout-all` se consume a través de `client`, y `grep -rn "ESAVI-AUTH-004" src/` devuelve la línea del hook.
- [ ] Con dos sesiones abiertas del mismo usuario, «Cerrar todas las sesiones» en una deja la otra sin sesión: su siguiente petición termina en `/login`.
- [ ] Tras un 2xx de `004`, se llega a `/login`, `tokenStore.getRefreshToken()` es `null`, `draftsStore` está vacío y la caché de TanStack Query está vacía.
- [ ] Tras un error de `004`, la sesión local sigue intacta: no hay navegación, el refresh token sigue presente y el usuario puede reintentar desde el mismo menú.
- [ ] El toast de éxito muestra el `revokedCount` real, en singular o plural según corresponda, en los tres idiomas.
- [ ] `AUTH_004_LOGOUT_ALL_FAILED` muestra `auth.errors.logoutAllFailed`, no el `message` del backend.
- [ ] El logout de la sesión actual (`003`) se comporta como antes: el bloque `Topbar — logout` pasa, adaptado solo en cómo se llega al diálogo.
- [ ] Mientras `004` está en vuelo, la acción del diálogo y el disparador del menú están deshabilitados, y un doble clic no lanza dos peticiones.
- [ ] Dos peticiones que reciben `401` a la vez producen **un solo** `POST /api/auth/refresh`. La cola de `client.ts` no cambia, y su test sigue en verde.
- [ ] `npx vitest run src/app/layout/Topbar.test.tsx` pasa.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** El menú y el diálogo de `004` se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/app/layout/Topbar.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** A 375px el menú de sesión se abre y el diálogo cabe sin scroll horizontal. El desbordamiento previo del topbar no aumenta, porque no se añade ningún botón a la barra.
- [ ] **Rol bajo.** Con `ANALYTICS`, el menú no ofrece «Cerrar todas las sesiones». Un `403 AUTH_ROLE_FORBIDDEN` inesperado se maneja con un toast y sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluido el `aria-label` del disparador. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: `revokedCount` no se guarda en ningún sitio, y la sesión solo se limpia tras un 2xx de `004`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** un menú en el icono de logout con las dos entradas. No añade ningún botón al topbar, que ya desborda a 375px, y funciona igual en todos los anchos.
- **No:** una tercera acción dentro del diálogo de confirmación de `003`. Mezcla dos decisiones con consecuencias distintas en un solo diálogo, y el usuario que solo quería salir tiene al lado un botón que cierra todo.
- **No:** ponerla junto a «Cambiar contraseña», en el menú de usuario. Ese menú solo existe por debajo de `md`. Por encima habría que añadir otro botón suelto a la barra.
- **Sí:** si `004` falla, la sesión local no se toca. Quien pulsa «Cerrar todas las sesiones» quiere echar a una sesión ajena. Si se limpiara localmente aunque fallara la petición, llegaría a `/login` creyendo que lo consiguió, y la otra sesión seguiría abierta.
- **Sí:** mantener la asimetría con `003`, que limpia aunque la red falle. Quien pulsa «Cerrar sesión» quiere dejar de estar autenticado en este equipo, y eso se consigue igual sin red. Son dos intenciones distintas, y por eso tienen dos políticas.
- **Sí:** ocultar la entrada a ANALYTICS con `useCan(USER)`. `004` exige `USER` (`API-ROUTES.md:91`), así que ofrecerla llevaría a un `403`.
- **No:** mantener el botón directo solo para ANALYTICS. Serían dos patrones de interacción y dos ramas de test para ahorrar un clic a un rol minoritario.
- **Sí:** una clave propia `auth.session.logoutAllDone` con `{{count}}`, en vez del `message` del backend. El toast queda en el idioma de la interfaz aunque `?lang=` y el backend no coincidan. Además, la pluralización de i18next da «1 sesión» y el literal del backend no.
- **Sí:** el diálogo sigue abierto mientras `004` está en vuelo. Si se cerrara al pulsar, el usuario no sabría si la acción terminó ni por qué sigue en la misma pantalla.
- **Sí:** extraer la limpieza local a una función compartida por `003` y `004`, en vez de copiarla. La limpieza ya creció una vez —`draftsStore`, SPEC FE12a—, y dos copias divergirían la próxima vez que crezca.
- **No:** reutilizar `clearSession()` de `client.ts`. No vacía `queryClient`, porque en esa ruta el vaciado corresponde al consumidor. Exportarla desde `client.ts` también sacaría del módulo una función que hoy es interna de la cola de refresh.
- **No:** mostrar las sesiones abiertas para cerrarlas una a una. El inventario no tiene esa ruta, y construirla es un spec del backend.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El access token caduca justo al pulsar: `004` recibe `401`, la cola refresca y reintenta | Es el camino normal de `client.ts`. El refresh consume el token actual y `004` revoca el nuevo, así que no hay reutilización ni revocación del F42. Si el propio refresh falla, `client.ts` limpia y manda al login, y el usuario vuelve a entrar y reintenta |
| `004` revoca en el backend pero la respuesta se pierde por la red | El cliente trata el fallo como error y no limpia. La siguiente petición recibe `401`, el refresh falla porque el token ya está revocado y `client.ts` manda al login. El resultado final es el correcto, solo que sin el toast de éxito |
| Otra pestaña de la misma sesión sigue abierta tras el éxito | Comparte `TokenStore` (`localStorage`), que ya está vacío. Su siguiente petición cae en el mismo camino de `401` sin refresh y acaba en `/login`. No se sincroniza en tiempo real, igual que con `003` |
| El disparador mide 28px, por debajo de los 44px de `CONVENTIONS.md` §10.2 | Deuda que ya existía y que este spec no empeora: es el mismo botón, con el mismo tamaño. Queda en el hallazgo de touch targets del `<Button>` compartido, fuera de este spec |

---

## 8. Impacto en pantallas existentes

- **`app/layout/Topbar.tsx`.** El botón de logout deja de abrir directamente la confirmación y pasa a ser el disparador de un menú. «Cerrar sesión» requiere ahora un clic más.
- **`app/layout/Topbar.test.tsx`.** El bloque `Topbar — logout` cambia cómo llega al diálogo: disparador, luego entrada del menú, luego diálogo. Sus aserciones sobre la petición y la limpieza no cambian.
- **`features/auth/api.ts`.** `logout()` delega la limpieza local en la función extraída, sin cambiar su comportamiento.

---

## Lo que **no** está en este spec

- Historial y reactivación de asignaciones de rol (`ESAVI-USERROLE-002B`, `005B`). Es el SPEC FE28.
- Listar las sesiones abiertas o cerrar una concreta.
- Cerrar las sesiones de otro usuario desde la ficha de administración.
- Cambiar la política de limpieza de `logout` (`003`).
- Resolver el desbordamiento del topbar a 375px o el tamaño del `<Button>` compartido.

Cada uno de esos, si aterriza, va en su propio spec.

# SPEC FE19 — Administración de configuraciones del sistema

> **Estado:** Aprobado
> **Depende de:** SPEC FE01 (shell, autenticación y guards por rol), SPEC FE02 (`createResource`), SPEC FE03 (precedente de CRUD administrado con diálogo y *sheet* de auditoría), SPEC F26 del backend (CRUD de `systemConfig` con historial de cambios)
> **Fecha:** 2026-09-22
> **Objetivo:** Dar al SUPERADMIN la pantalla para consultar, crear, editar, proteger, retirar y sembrar los parámetros de `systemConfig`, con su historial de valores.

---

## 1. Por qué existe este spec

`systemConfig` es el almacén de parámetros de comportamiento de la aplicación, y el backend lo entregó completo en el **SPEC F26**: diez rutas, historial de cambios en `systemConfigHistory`, cifrado real del valor cuando `isEncrypted` es `true`, y siembra idempotente por `ESAVI-SYSCONF-008`.

**De esas diez rutas, el cliente consume hoy una.** `ESAVI-SYSCONF-006` —leer una fila por su `code`— se usa en dos sitios: `features/systemConfig/api.ts:16` (`useCountryIsoCode`, para el código de país que el alta de casos envía en cada `ESAVI-CASE-001`) y `shared/hooks/useSystemConfigByCode.ts:16`. Las otras nueve no tienen ningún consumidor.

**La consecuencia práctica es que la tabla no se puede administrar desde la aplicación.** Crear un parámetro, corregir un valor, proteger una fila o retirarla exige hoy entrar por SQL o por un cliente HTTP a mano. Eso vacía de sentido la mitad del F26: `systemConfigHistory` existe precisamente para saber quién cambió qué y por qué, y un `UPDATE` por SQL no pasa por el `004`, así que no deja ni fila de historial ni entrada de auditoría.

**En un despliegue nuevo la tabla está vacía y no hay forma de llenarla desde la interfaz.** `ESAVI-SYSCONF-008` siembra el catálogo de `systemConfig.defaults.ts` de una sola llamada, es idempotente y es solo-alta — pero hoy sólo se puede invocar con `curl` y un token de SUPERADMIN.

**El menú ya reserva el sitio, y lo reserva mal.** `shared/config/navigation.ts:204-210` declara el `NavItem` con `disabled: true`, `minLevel: ROLE_LEVELS.USER` y ruta **`/system-config`** en singular, que incumple la regla de rutas en kebab y plural de `CONVENTIONS.md` §4. Las tres cosas cambian en este spec.

**Es la primera pantalla del repositorio con dos cosas que ninguna otra tiene:**

- **Un valor cifrado.** El listado devuelve `value: null` en toda fila con `isEncrypted: true`, incluso para un SUPERADMIN; sólo el `003` lo descifra, y sólo para SUPERADMIN. Eso obliga a que el formulario de edición **no** se abra con la fila del listado, como hacen las demás pantallas, sino con una lectura propia por `003`.
- **Un historial de dominio**, distinto de `<AuditTrail>`. `ESAVI-SYSCONF-007` devuelve los cambios de **valor** (`previousValue`, `newValue`, `changeReason`, autor), mientras que `appDetails` registra **operaciones**. Las dos cosas conviven en esta pantalla y son dos paneles distintos.

---

## 2. Alcance

**Dentro:**

- **Pantalla de listado** en `/system-configs`, con `<ResourceTable>`: columnas de código, nombre, valor, ámbito, tipo y estado, paginación en servidor y toggle de «mostrar inactivos» que decide entre `002A` y `002B`.
- **Guard de pantalla en `SUPERADMIN`**, tanto en el `NavItem` como en la ruta. Es una **desviación declarada** de `CONVENTIONS.md` §5 —que manda copiar el rol mínimo real de la ruta, y `002A` es USER—, razonada en §6.
- **Filtros** de `name`, `code`, `scope` y `valueType`, todos en `searchParams`. Forma canónica del SPEC F52: `name` y `code`, nunca `search`.
- **Diálogo de formulario** para crear (`001`) y editar (`004`), con el editor de `value` conmutado por `valueType` y los campos inmutables deshabilitados en edición.
- **El formulario de edición carga la fila por `003`**, no desde la fila del listado, porque el listado enmascara el valor cifrado.
- **`changeReason`** siempre visible en edición, obligatorio en el cliente cuando `value` queda *dirty*, y con el 400 del servidor mapeado al mismo campo.
- **Desactivar (`005A`) y reactivar (`005B`)** desde el menú de fila, con el diálogo de confirmación que nombra la fila.
- ***Sheet* de historial de valores** (`007`), con su propia paginación y el autor de cada cambio.
- ***Sheet* de auditoría** (`<AuditTrail>` sobre `appDetails`), como toda pantalla de detalle del repositorio.
- **Botón «Sembrar configuraciones»** (`008`) en la cabecera y en el estado vacío, con confirmación previa y un toast que resume cuántas se crearon y cuántas ya existían.
- **Filas protegidas** (`isEditable: false`) marcadas con un `<Badge>`; se pueden abrir para desprotegerlas, y el 409 `SYSCONF_004_NOT_EDITABLE` se mapea al campo `isEditable`.
- **Tipos del contrato**: `CreateSystemConfigInput` y `SystemConfigValueType` traídos con `npm run contracts:sync`; la fila del `007` declarada a mano en `contracts/declared/systemConfigHistory.ts`.
- **Corrección del `NavItem` existente**: ruta a `/system-configs`, `minLevel` a `SUPERADMIN` y baja del `disabled: true`.
- Bloque de claves i18n `systemConfig.*` en los **tres** idiomas.

**Fuera de alcance (otros specs):**

- **Deduplicar `useCountryIsoCode` y `useSystemConfigByCode`**, que hoy son dos lecturas del mismo `006` con dos entradas de caché distintas. Es una limpieza real, pero de los consumidores del `006`, no de esta pantalla.
- **Consumir la configuración desde la aplicación**: que el `pageSize` por defecto, los mínimos de búsqueda o cualquier otro parámetro salgan de esta tabla en vez del código. El F26 lo dejó fuera en el backend por el mismo motivo, y decidir qué baja a base de datos es un spec en sí mismo.
- ***Rollback* desde el historial.** El `007` sólo lee; restaurar un `previousValue` sería una escritura con su propia semántica, y el backend no expone ninguna operación para ello.
- **Cambiar `isEncrypted`** de una fila existente. Es inmutable en el `004` por decisión del F26 §6, así que el cliente no tiene con qué hacerlo.
- **Editar `sysDetails`** o mostrarlo: el backend no lo expone en ninguna respuesta.
- **Una vista de comparación entre dos versiones del historial.** El *sheet* muestra `previousValue` y `newValue` de cada fila; un *diff* visual es otra pantalla.
- **Búsqueda por el contenido de `value`.** El backend filtra por `name` y `code`; `value` es `jsonb` y no tiene búsqueda declarada.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/system-configs` | `features/systemConfig/SystemConfigListPage.tsx` | `<RequireRole level={SUPERADMIN}>` |

Sin página de detalle: el contenido de una fila cabe en el diálogo de formulario, y los dos historiales son paneles laterales. Componentes de la feature:

| Archivo | Qué es |
|---|---|
| `features/systemConfig/SystemConfigFormDialog.tsx` | Alta y edición; en edición carga por `003` |
| `features/systemConfig/SystemConfigHistorySheet.tsx` | Historial de valores (`007`) |
| `features/systemConfig/SystemConfigAuditSheet.tsx` | `<AuditTrail>` sobre `appDetails` |
| `features/systemConfig/SystemConfigValueField.tsx` | El editor de `value` conmutado por `valueType` |

**Navegación** — `shared/config/navigation.ts:204-210`, grupo `nav.groups.administration`, que ya existe:

| Antes | Después |
|---|---|
| `path: '/system-config'` | `path: '/system-configs'` |
| `minLevel: ROLE_LEVELS.USER` | `minLevel: ROLE_LEVELS.SUPERADMIN` |
| `disabled: true` | *(se elimina)* |

El icono (`Sliders`) y la clave (`nav.items.systemConfig`) no cambian.

### 3.2 Endpoints consumidos

```
GET    /api/system-configs                ESAVI-SYSCONF-002A  USER        listado (solo activas)
GET    /api/system-configs/admin          ESAVI-SYSCONF-002B  ADMIN       listado con inactivas
GET    /api/system-configs/:id            ESAVI-SYSCONF-003   USER        detalle; descifra solo a SUPERADMIN
POST   /api/system-configs                ESAVI-SYSCONF-001   SUPERADMIN  crear
PUT    /api/system-configs/:id            ESAVI-SYSCONF-004   SUPERADMIN  actualizar
DELETE /api/system-configs/:id            ESAVI-SYSCONF-005A  SUPERADMIN  desactivar
PATCH  /api/system-configs/activate/:id   ESAVI-SYSCONF-005B  SUPERADMIN  reactivar
GET    /api/system-configs/:id/history    ESAVI-SYSCONF-007   SUPERADMIN  historial de valores
POST   /api/system-configs/sync           ESAVI-SYSCONF-008   SUPERADMIN  sembrar defaults
```

**`ESAVI-SYSCONF-006` no se consume desde esta pantalla.** Es la lectura por `code` que ya usan `useCountryIsoCode` y `useSystemConfigByCode`, y sirve a otras pantallas; aquí se entra siempre por el `systemConfigId`.

**Nota sobre el inventario:** `API-ROUTES.md:581` lista el `006` como `GET /api/system-configs/code/ESAVI_APP_DEFAULT_LIMIT`. Es un artefacto del generador —el path de ejemplo de `ROUTE_RULES`—, no una ruta literal; la real es `/code/:code`. No afecta a este spec porque no consume el `006`, pero queda anotado.

### 3.3 Tipos del contrato

**Se traen con `npm run contracts:sync`** desde `../esavi-backend/src/types/systemConfig/`, a `contracts/systemConfig.ts`:

```ts
export type SystemConfigValueType = 'string' | 'number' | 'boolean' | 'json' | 'array';
export interface CreateSystemConfigInput { … }   // incluye changeReason, que no es columna
```

**Ya existe**, escrito a mano: `contracts/declared/systemConfig.ts` con `SystemConfigDetail` — la forma de `002A`, `002B`, `003` y `006`. No se toca.

**Se declara a mano**, porque la arma el servicio y no existe como interfaz en el backend (SPEC F26 §3.7): `contracts/declared/systemConfigHistory.ts`.

```ts
export interface SystemConfigHistoryRow {
  systemConfigHistoryId: string;
  systemConfigId: string;
  previousValue: unknown;
  newValue: unknown;
  changeReason: string | null;
  createdAt: string;
  changedByUser: { userId: string; displayName: string } | null;
}
```

El update viaja como `Partial<CreateSystemConfigInput>`, igual que en el backend.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Filtros `name`, `code`, `scope`, `valueType` | URL | `searchParams` | Se comparten por enlace y sobreviven al refresco |
| Página del listado | URL | `searchParams.page` | |
| Toggle «mostrar inactivas» | URL | `searchParams.includeInactive` | Decide `002A` vs `002B` dentro de `createResource` |
| Listado | TanStack Query | `['systemConfig', 'list', { limit, offset, includeInactive, filters }]` | Lo genera `createResource`; sin `staleTime` propio |
| Fila en edición | TanStack Query | `['systemConfig', 'detail', id]` | `useOne` del recurso — es el `003`, la **única** lectura que trae el valor descifrado |
| Historial de valores | TanStack Query | `['systemConfig', 'history', id, { limit, offset }]` | Hook propio `useSystemConfigHistory`; `enabled` sólo con el *sheet* abierto |
| Página del *sheet* de historial | `useState` del *sheet* | — | **Excepción razonada** a «la paginación va en `searchParams`»: es estado efímero de un panel que se cierra, no una vista compartible |
| Qué diálogo o *sheet* está abierto, y sobre qué fila | `useState` de la página | — | Efímero |
| Lo tecleado en el formulario | React Hook Form | — | Nada del servidor se copia a `useState` ni a un store |

**Invalidación.** Las cinco mutaciones (`001`, `004`, `005A`, `005B`, `008`) invalidan la **raíz** `['systemConfig']`, que es lo que hace `createResource` por defecto y lo que hará también el hook del `008`. Eso arrastra las entradas `['systemConfig', 'byCode', …]` que usan otras pantallas, y es deseado: si un SUPERADMIN cambia `ESAVI_APP_COUNTRY_ISO_CODE`, el alta de casos debe dejar de usar el valor viejo sin recargar la aplicación.

**`staleTime`.** El listado y el detalle van sin `staleTime` propio: son el dato que esta pantalla edita, no un catálogo de fondo. Los hooks del `006` conservan sus 30 minutos, que no se tocan.

**El valor cifrado no vive en dos sitios.** El listado trae `value: null` en toda fila con `isEncrypted: true`; el único sitio con el valor en claro es `['systemConfig', 'detail', id]`, y sólo mientras el diálogo está abierto. No se copia a ningún store ni se mantiene tras cerrar.

### 3.5 Formularios y validación

**`features/systemConfig/schemas.ts`** — `createSystemConfigSchema` y `updateSystemConfigSchema`.

| Campo | Control | Obligatorio | Alta | Edición | Regla |
|---|---|---|---|---|---|
| `code` | `Input` | sí | editable | **deshabilitado** | máx. 150; el backend lo normaliza a `CONSTANT_CASE` |
| `name` | `Input` | sí | editable | editable | máx. 200; el backend sólo hace `trim` |
| `description` | `Textarea` | no | editable | editable | anulable |
| `scope` | `Input` | no | editable | **deshabilitado** | máx. 100; por defecto `GLOBAL`, normalizado en el servidor |
| `valueType` | `Select` de los cinco literales | sí | editable | editable | por defecto `json` |
| `value` | `<SystemConfigValueField>` | sí | editable | editable | según `valueType` (abajo) |
| `isEncrypted` | `Switch` | no | editable | **deshabilitado** | inmutable en el `004` |
| `isEditable` | `Switch` | no | editable | editable | por defecto `true`; se compara contra `undefined`, nunca por veracidad |
| `changeReason` | `Textarea` | condicional | no se muestra | **siempre visible** | obligatorio cuando `value` queda *dirty* |

**El editor de `value`** conmuta por `valueType`:

| `valueType` | Control | Validación |
|---|---|---|
| `string` | `Input` | cadena no vacía |
| `number` | `<NumberField>` | número finito |
| `boolean` | `Switch` | siempre válido |
| `json` | `Textarea` monoespaciada | `JSON.parse` correcto |
| `array` | `Textarea` monoespaciada | `JSON.parse` correcto **y** el resultado es un array |

En `json` y `array`, lo que vive en el formulario es **el texto**; el `JSON.parse` se hace al enviar y su fallo es un error de campo, con clave propia (`systemConfig.validation.invalidJson`), vía `.superRefine()` — no un literal dentro del schema, según `CONVENTIONS.md` §8. Cambiar `valueType` reinicia `value` al vacío de su tipo: `''`, `null`, `false`, `{}` y `[]` respectivamente.

**El diálogo de edición se abre con `useOne(id)` (`003`)**, no con la fila del listado, y no renderiza el formulario hasta que la lectura resuelve. Es la única forma de que una fila cifrada llegue con su valor en claro; hacerlo con la fila del listado enviaría `value: null` en el `PUT`.

**`changeReason` es obligatorio en el cliente cuando `value` queda *dirty***, leyendo `formState.dirtyFields.value` de React Hook Form. Eso es estado del formulario, no un diff del payload: **el `PUT` sigue enviando el objeto completo** (`CONVENTIONS.md` §6.5) y el backend decide si hubo cambio real.

**Errores del backend mapeados a campo:**

| `code` | Campo | Situación |
|---|---|---|
| `SYSCONF_001_CODE_EXISTS` | `code` | El par `(code, scope)` ya existe, aunque la fila esté inactiva |
| `SYSCONF_001_VALUE_TYPE_MISMATCH` | `value` | El valor no encaja con el `valueType` |
| `SYSCONF_004_VALUE_TYPE_MISMATCH` | `value` | Ídem, contra el `valueType` resultante |
| `SYSCONF_004_NOT_EDITABLE` | `isEditable` | Fila protegida; hay que desprotegerla en el mismo formulario |
| `SYSCONF_004_CHANGE_REASON_REQUIRED` | `changeReason` | Red de seguridad del obligatorio del cliente |

El resto va al toast por `code`: `SYSCONF_003_NOT_FOUND`, `SYSCONF_004_NOT_FOUND`, `SYSCONF_005A_ALREADY_INACTIVE`, `SYSCONF_005B_ALREADY_ACTIVE`, `SYSCONF_007_NOT_FOUND`, `SYSCONF_008_VALUE_TYPE_MISMATCH` y `AUTH_ROLE_FORBIDDEN`. `errors` no se muestra nunca.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | `ResourceTableSkeleton`, el de `<ResourceTable>` | — |
| Vacío (sin datos) | Texto explicativo + botón **«Sembrar configuraciones»** (`008`), no «Crear» | `systemConfig.list.empty` |
| Vacío (con filtros) | Texto + botón «Limpiar filtros» | `systemConfig.list.emptyFiltered` |
| Error | Mensaje del `EsaviApiError` por `code` + botón reintentar | `systemConfig.list.error` |
| Sin permiso | No se llega: `<RequireRole>` redirige y el `NavItem` no aparece por debajo de `SUPERADMIN` | — |

En el *sheet* de historial, los mismos cuatro: esqueleto, vacío (`systemConfig.history.empty`, para una fila que nunca cambió de valor), error con reintento y sin permiso (no se llega).

### 3.7 Responsividad y accesibilidad

- **Tabla → tarjetas** por debajo de `md`, dentro de `<ResourceTable>`. Los tres campos que sobreviven: **`code`** (primario), **`value`** (secundario, truncado o el candado de «Cifrado») y **`scope`** (meta).
- La columna de valor va en `font-mono` y truncada a una línea; `json` y `array` se muestran como `JSON.stringify` truncado.
- Una fila con `isEncrypted: true` muestra un icono de candado con el texto «Cifrado» en lugar del valor, en tabla y en tarjeta. El icono lleva `aria-label` por i18n.
- Fila inactiva: `<Badge variant="destructive">` más el tinte `bg-destructive/5`, pasando `isRowInactive={(row) => !row.isActive}` a `<ResourceTable>` (`CONVENTIONS.md` §10.1).
- Fila protegida: `<Badge variant="outline">` con «Protegida».
- Los dos *sheets* ocupan el ancho completo por debajo de `md`.
- Objetivos táctiles de 44px; `dvh`, nunca `vh`; sin scroll horizontal del body a 375px.
- El formulario es navegable con teclado y el foco entra en el primer campo editable — en edición, `name`, porque `code` está deshabilitado.

### 3.8 Claves i18n nuevas

Bloque `systemConfig.*` en `src/locales/{es,en,nl}.json`.

| Clave | Uso |
|---|---|
| `systemConfig.list.title` | Título de la pantalla |
| `systemConfig.list.empty` / `emptyFiltered` / `error` | Los tres estados de §3.6 |
| `systemConfig.columns.code` / `name` / `value` / `scope` / `valueType` / `status` | Cabeceras de la tabla |
| `systemConfig.value.encrypted` | Texto y `aria-label` del candado |
| `systemConfig.badge.protected` | `<Badge>` de `isEditable: false` |
| `systemConfig.filters.name` / `code` / `scope` / `valueType` | Etiquetas de los filtros |
| `systemConfig.valueType.string` / `number` / `boolean` / `json` / `array` | Opciones del selector |
| `systemConfig.form.createTitle` / `editTitle` | Títulos del diálogo |
| `systemConfig.field.<campo>` | Una por cada campo de la tabla de §3.5 |
| `systemConfig.help.code` / `scope` / `isEncrypted` / `isEditable` | Textos de ayuda de los cuatro campos que no se explican solos |
| `systemConfig.validation.invalidJson` / `invalidArray` | Los dos errores del editor de `value` |
| `systemConfig.history.title` / `empty` / `previousValue` / `newValue` / `changedBy` / `unknownAuthor` | *Sheet* de historial |
| `systemConfig.sync.action` / `confirmTitle` / `confirmBody` / `success` / `nothingToDo` | Botón y confirmación del `008`; `success` interpola `{{created}}` y `{{skipped}}` |
| `systemConfig.delete.confirm` | Confirmación de baja, interpolando `{{code}}` |
| `systemConfig.roleForbidden` | Toast de `AUTH_ROLE_FORBIDDEN` |

`npm run i18n:check` exige paridad exacta en los tres idiomas.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y puede committearse solo. Verificación de tipos con `npx tsc --noEmit -p tsconfig.app.json` (`npm run build` no comprueba tipos hoy, `CONVENTIONS.md` §14).

1. **Tipos del contrato.** `npm run contracts:sync` para traer `contracts/systemConfig.ts` con `CreateSystemConfigInput` y `SystemConfigValueType` desde `../esavi-backend/src/types/systemConfig/`. Declarar a mano `contracts/declared/systemConfigHistory.ts` con `SystemConfigHistoryRow` (§3.3), anotando su origen en `systemConfig.service.ts` del backend.
   *Verificación:* el diff del sync se revisa a ojo y no arrastra tipos de otras entidades; `npx tsc --noEmit -p tsconfig.app.json` en 0.

2. **Declaración del recurso y hooks propios.** En `features/systemConfig/api.ts`, junto al `useCountryIsoCode` que ya vive ahí: un `createResource<SystemConfigDetail, CreateSystemConfigInput>` con `key: 'systemConfig'`, `path: 'system-configs'`, `adminPath: 'system-configs/admin'`, `inactiveMode: 'adminPath'`, `idField: 'systemConfigId'` y `hasActivate` por defecto. Más dos hooks escritos a mano, con su código de operación citado: `useSystemConfigHistory(id, params, enabled)` (`ESAVI-SYSCONF-007`) y `useSyncSystemConfigDefaults()` (`ESAVI-SYSCONF-008`), que invalida la raíz `['systemConfig']`.
   *Verificación:* test de `api.ts` con MSW — el toggle de inactivas pide `/admin`, el historial pide `/:id/history` con `limit`/`offset`, el sync hace `POST /sync` sin cuerpo e invalida `['systemConfig']`.

3. **Schemas Zod.** `features/systemConfig/schemas.ts` con `createSystemConfigSchema` y `updateSystemConfigSchema` según la tabla de §3.5, la validación cruzada de `value` contra `valueType` por `.superRefine()`, y el mapa de errores del backend a campo.
   *Verificación:* tests de schema — `valueType: 'number'` con `'42'` falla y con `42` pasa; `array` con `'{}'` falla; `json` con `'{ mal'` falla con la clave `invalidJson`; `changeReason` ausente sólo falla cuando `value` está marcado como cambiado.

4. **El editor de `value`.** `features/systemConfig/SystemConfigValueField.tsx`, que conmuta el control por `valueType` (§3.5) y mantiene el texto crudo en `json`/`array`. Cambiar `valueType` reinicia el valor al vacío de su tipo.
   *Verificación:* montar el campo con cada uno de los cinco tipos y comprobar el control que renderiza; cambiar de `json` a `number` deja el campo vacío, no el texto JSON anterior.

5. **Diálogo de formulario.** `SystemConfigFormDialog.tsx` sobre `<ResourceForm>`: en alta, los ocho campos; en edición, `useOne(id)` (`003`) como origen de `defaultValues`, `code`/`scope`/`isEncrypted` deshabilitados y `changeReason` visible. Reset de mutaciones al cerrar (`CONVENTIONS.md` §10.7).
   *Verificación:* editar una fila cifrada muestra el valor en claro y no `null`; el `PUT` que reenvía la ficha sin tocarla no pide `changeReason`; tocar el valor sin motivo bloquea el envío; un 409 `NOT_EDITABLE` aparece sobre el campo `isEditable`.

6. **Listado.** `SystemConfigListPage.tsx` con `<ResourceTable>`, las seis columnas de §3.8, los cuatro filtros en `searchParams` con *debounce* en los de texto, el toggle de inactivas, `isRowInactive`, los dos *badges* y el menú de fila (editar, historial, auditoría, dar de baja o reactivar).
   *Verificación:* aplicar un filtro y recargar conserva la vista; el enlace copiado la reproduce; una fila cifrada muestra el candado y nunca un valor; una inactiva lleva badge y tinte.

7. ***Sheet* de historial.** `SystemConfigHistorySheet.tsx` sobre `useSystemConfigHistory`, con paginación en `useState` propio, `previousValue`/`newValue` en `font-mono`, el `changeReason` y el autor (`changedByUser.displayName`, o `unknownAuthor` cuando es `null`).
   *Verificación:* una fila recién creada muestra exactamente una entrada, con `previousValue` vacío; el orden es del cambio más reciente al más antiguo; cerrar y reabrir el *sheet* no conserva la página anterior.

8. ***Sheet* de auditoría.** `SystemConfigAuditSheet.tsx` con `<AuditTrail>` sobre `appDetails`, siguiendo el precedente de `HealthFacilityAuditSheet.tsx`.
   *Verificación:* una fila con `appDetails: {}` —objeto, no array— muestra el estado vacío y no rompe el árbol de React.

9. **Sembrar configuraciones (`008`).** Botón en la cabecera del listado y en el estado vacío, con `<AlertDialog>` de confirmación y toast que interpola creadas y omitidas.
   *Verificación:* la primera llamada crea el catálogo y la segunda no crea nada y lo dice; el listado se refresca solo tras la siembra, sin recargar la página.

10. **Ruta y navegación.** La ruta `/system-configs` en `app/router.tsx` envuelta en `<RequireRole level={ROLE_LEVELS.SUPERADMIN}>`, y las tres correcciones del `NavItem` de §3.1.
    *Verificación:* con `ADMIN` el ítem no aparece en el sidebar ni en la paleta de comandos, y entrar a mano por la URL redirige; con `SUPERADMIN` aparece en el grupo de Administración.

11. **Claves i18n** de §3.8 en `es`, `en` y `nl`.
    *Verificación:* `npm run i18n:check` en 0.

12. **Cierre.** `npm run check` en 0.

---

## 5. Criterios de aceptación

- [ ] Las nueve rutas de §3.2 se consumen y responden con lo esperado; el `006` **no** se llama desde esta pantalla.
- [ ] Los seis artefactos de `CONVENTIONS.md` §5 existen para `systemConfig`, más las claves i18n en los tres idiomas.
- [ ] El `NavItem` apunta a `/system-configs`, con `minLevel: SUPERADMIN` y sin `disabled`; `grep -n "system-config'" src/shared/config/navigation.ts` no devuelve resultados (la ruta en singular ya no existe).
- [ ] `grep -rn "ESAVI-SYSCONF-" src/features/systemConfig/` cita los nueve códigos consumidos.
- [ ] Aplicar cualquiera de los cuatro filtros y recargar conserva la vista; el enlace copiado la reproduce en otra sesión.
- [ ] `grep -rn "search=" src/features/systemConfig/` no devuelve resultados: los filtros de texto son `name` y `code` (SPEC F52).
- [ ] Toda fila con `isEncrypted: true` muestra el candado y el texto «Cifrado» en el listado, nunca un valor —tampoco para SUPERADMIN—, en tabla y en tarjeta.
- [ ] Abrir el formulario de edición de una fila cifrada muestra el valor **en claro**, porque lo carga por `003` y no desde la fila del listado.
- [ ] `code`, `scope` e `isEncrypted` están deshabilitados en edición y editables en alta.
- [ ] Un `PUT` que reenvía la ficha sin tocar el valor **no** exige `changeReason` y responde 200; tocar el valor sin motivo bloquea el envío en el cliente, y el 400 `SYSCONF_004_CHANGE_REASON_REQUIRED` aparece sobre el campo si llegara del servidor.
- [ ] Guardar sobre una fila con `isEditable: false` muestra el 409 `SYSCONF_004_NOT_EDITABLE` sobre el campo `isEditable`, y desprotegerla en el mismo formulario funciona.
- [ ] El editor de `value` renderiza el control correcto para los cinco `valueType`; `json` con texto mal formado y `array` con un objeto no se envían, y muestran su mensaje de i18n.
- [ ] Cambiar `valueType` en el formulario reinicia `value` al vacío de ese tipo.
- [ ] Crear dos veces el mismo par `(code, scope)` muestra el 409 `SYSCONF_001_CODE_EXISTS` sobre el campo `code`, también cuando la primera fila está inactiva.
- [ ] El *sheet* de historial muestra una sola entrada para una configuración recién creada, del cambio más reciente al más antiguo, con el autor descifrado y `unknownAuthor` cuando `changedByUser` es `null`.
- [ ] La paginación del *sheet* de historial **no** aparece en la URL y se reinicia al cerrarlo.
- [ ] «Sembrar configuraciones» pide confirmación, y el toast dice cuántas se crearon y cuántas ya existían; la segunda llamada seguida no crea ninguna.
- [ ] Tras sembrar, tras crear, tras editar y tras dar de baja, el listado se refresca sin recargar la página.
- [ ] `grep -rn "response.data.data" src/features/systemConfig/` no devuelve resultados.
- [ ] Las claves de §3.8 existen en es, en y nl; `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Bloque de cierre:**

- [ ] **Tema oscuro.** La pantalla, los dos *sheets* y el diálogo se ven correctos en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/systemConfig/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `code`, `value` y `scope`; los *sheets* ocupan el ancho completo; el body no hace scroll horizontal a 375px, ni siquiera con un `value` JSON largo.
- [ ] **Rol bajo.** Con `USER`, con `ANALYTICS` y con `ADMIN` el ítem no aparece en el sidebar ni en la paleta de comandos, y entrar por la URL a mano redirige sin pantalla en blanco. Un `403` inesperado se maneja con el toast de `AUTH_ROLE_FORBIDDEN`.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos los `aria-label` del candado y de los iconos del menú de fila, y los cinco nombres de `valueType`.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: los cuatro filtros y la página en `searchParams`, el valor descifrado sólo en `['systemConfig', 'detail', id]`, y la única excepción declarada es la página del *sheet* de historial.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** la pantalla entera en **`SUPERADMIN`**, en el `NavItem` y en el guard. Es una **desviación declarada** de `CONVENTIONS.md` §5, que manda copiar el rol mínimo real de la ruta —y `002A` es USER—. Se acepta porque las nueve operaciones útiles de esta pantalla (crear, editar, proteger, retirar, reactivar, historial y sembrar) son todas SUPERADMIN: un USER entraría a una pantalla sin una sola acción disponible. La desviación es segura en la dirección que importa: esconde de más, nunca ofrece un enlace que acabe en `403`. **No:** pantalla USER de sólo lectura con los botones ocultos, que es lo que la norma literal pediría y deja ruido en el menú de quien no puede hacer nada.
- **Sí:** el formulario de edición carga por **`003`** y no desde la fila del listado, para **todas** las filas y no sólo para las cifradas. Una sola regla es más fácil de sostener que «depende de `isEncrypted`», y el coste es una petición por apertura de diálogo. **No:** abrir con la fila del listado, que enviaría `value: null` en el `PUT` de una fila cifrada — y bajo `valueType: 'json'` el backend lo aceptaría, destruyendo el secreto con un 200.
- **Sí:** `changeReason` **siempre visible** en edición y obligatorio en el cliente cuando `value` queda *dirty*, leyendo `formState.dirtyFields`. **No:** dejarlo opcional y esperar al 400 del servidor, que gasta un viaje en el caso más común. **No:** calcular el cambio para decidir qué mandar — el `PUT` sigue enviando el objeto completo; lo que se mira es el estado del formulario, no el payload, así que no contradice `CONVENTIONS.md` §6.5.
- **Sí:** editar `json` y `array` con un `Textarea` y `JSON.parse` al enviar. **No:** dejarlos de sólo lectura en esta primera versión, que obligaría a cambiar por SQL justo las filas más complejas — exactamente lo que la tabla existe para evitar.
- **Sí:** «Editar» sigue disponible en las filas protegidas (`isEditable: false`), con el 409 mapeado al campo `isEditable`. Es el único sitio donde un SUPERADMIN puede desprotegerlas, porque `isEditable` sí es mutable. **No:** «Editar» deshabilitada más una acción aparte de «Desproteger», que serían dos acciones y dos confirmaciones para lo que el formulario ya resuelve.
- **Sí:** el estado vacío ofrece **«Sembrar configuraciones»** en vez de «Crear». Una tabla vacía es un despliegue nuevo, y eso se resuelve con el `008`, no creando doce filas a mano.
- **Sí:** el *sheet* de historial pagina en `useState`, declarado como excepción en §3.4. Es estado efímero de un panel que se cierra: no sobrevive al refresco, no se comparte por enlace y no tiene por qué. **No:** meterlo en `searchParams`, que ensuciaría la URL del listado con la página de un panel.
- **Sí:** dos paneles distintos — historial de valores (`007`) y auditoría (`appDetails`). Registran cosas distintas: el primero, cambios de **valor** con su motivo y su autor; el segundo, **operaciones**. Fundirlos en uno obligaría a inventar una forma común que ninguna de las dos fuentes tiene.
- **Sí:** las mutaciones invalidan la **raíz** `['systemConfig']`, arrastrando las entradas `byCode` de otras pantallas. Es deseado: cambiar `ESAVI_APP_COUNTRY_ISO_CODE` tiene que dejar de servirse del valor viejo sin recargar. **No:** invalidar claves enumeradas, que obligaría a esta feature a conocer a sus consumidores.
- **Sí:** el listado muestra la columna de valor. **No:** mostrar sólo `name` y esconder el valor tras el formulario — el valor es justo lo que se viene a consultar, y el enmascarado de los cifrados ya lo protege.
- **Sí:** `code` como campo principal de la tarjeta móvil, por delante de `name`. Un parámetro se busca por su código; el nombre es su descripción larga.
- **Sí:** corregir la ruta a `/system-configs` aunque el `NavItem` esté hoy deshabilitado y nadie la use. Arreglarla ahora cuesta una línea; después de publicarla, un enlace roto.
- **No:** deduplicar `useCountryIsoCode` y `useSystemConfigByCode` en este spec. Son dos lecturas del mismo `006` con dos cachés, y es deuda real — pero de los consumidores del `006`, no de esta pantalla, y tocarlas arrastraría el alta de casos y el paso de notificación a una rama que va de administración.
- **No:** *rollback* desde el historial ni cambiar `isEncrypted` de una fila existente. El backend no expone ninguna de las dos operaciones (SPEC F26 §2), así que un botón aquí sería inventar un endpoint.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El diálogo de edición se abre con la fila del listado «porque ya está en la caché», y el `PUT` de una fila cifrada envía `value: null`. Bajo `valueType: 'json'` el backend lo acepta y **el secreto se destruye con un 200** | Es el riesgo más caro del spec. El paso 5 del plan obliga a `useOne(id)` (`003`) como único origen de `defaultValues`, con su criterio de aceptación propio y su test |
| Se intenta calcular en el cliente si `value` cambió para decidir qué enviar, y se acaba mandando un objeto parcial | La norma es explícita (`CONVENTIONS.md` §6.5) y §3.5 lo repite: se envía el objeto completo. Lo que se lee es `formState.dirtyFields`, que decide si **pedir el motivo**, nunca qué viaja en el cuerpo |
| El texto crudo de `json`/`array` se guarda como cadena y llega al backend con comillas escapadas, en vez del objeto | El `JSON.parse` ocurre al enviar y su fallo es un error de campo; los tests del paso 3 cubren los dos sentidos |
| Un `value` JSON largo desborda la tabla y produce scroll horizontal del body en móvil | Columna truncada a una línea y `<ResourceTable>` colapsando a tarjetas por debajo de `md`; hay un criterio de aceptación que lo nombra con un JSON largo |
| El toggle de «mostrar inactivas» llamaría a `002B`, que exige ADMIN | No hay riesgo real: toda la pantalla es SUPERADMIN, que está por encima. `createResource` decide igualmente por nivel de rol |
| Un `POST /sync` se pulsa por error en producción y pisa configuración ajustada a mano | No puede: el `008` es solo-alta por diseño del backend (SPEC F26 §6) y no toca ninguna fila existente, activa o inactiva. Aun así lleva confirmación previa |
| Se lee la desviación de rol como un error y alguien «corrige» el `minLevel` a USER copiándolo del inventario | Declarada en §2, en §3.1 y razonada en §6, con un criterio de aceptación que exige que el ítem no aparezca para `ADMIN` |

---

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `shared/config/navigation.ts` | El `NavItem` de `systemConfig` cambia de ruta (`/system-config` → `/system-configs`), de `minLevel` (`USER` → `SUPERADMIN`) y pierde `disabled: true` |
| `app/router.tsx` | Ruta nueva `/system-configs` bajo `<RequireRole level={SUPERADMIN}>` |
| `features/systemConfig/api.ts` | Gana la declaración de `createResource` y dos hooks propios, junto al `useCountryIsoCode` que ya contiene. Ese hook **no se toca** |
| `contracts/systemConfig.ts` | Archivo nuevo, traído por `npm run contracts:sync` |
| `contracts/declared/systemConfigHistory.ts` | Archivo nuevo, declarado a mano |
| `shared/hooks/useSystemConfigByCode.ts` | Ningún cambio de código. Se beneficia de la invalidación de raíz: un cambio hecho en esta pantalla refresca su caché sin recargar |

Ninguna pantalla existente cambia de comportamiento visible.

---

## Lo que **no** está en este spec

- Deduplicar `useCountryIsoCode` y `useSystemConfigByCode`.
- Que la aplicación consuma sus parámetros desde esta tabla en vez del código.
- *Rollback* de un valor desde el historial.
- Cambiar `isEncrypted` de una fila existente.
- Exponer o editar `sysDetails`.
- Una vista de comparación entre dos versiones del historial.
- Búsqueda por el contenido de `value`.

Cada uno de esos, si aterriza, va en su propio spec.

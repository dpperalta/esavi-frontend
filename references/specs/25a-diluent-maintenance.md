# SPEC FE25a — Mantenimiento de diluyentes

> **Estado:** Aprobado
> **Depende de:** SPEC FE02 (fábrica de recursos), SPEC FE12c (`diluentResource` y `<DiluentSelect>`), SPEC F23 del backend (CRUD de `diluentCatalog`)
> **Fecha:** 2026-09-25
> **Objetivo:** Dar al maestro de diluyentes una pantalla en `/diluents` para listar, buscar, crear, editar, desactivar y reactivar, sobre las siete rutas de `DILUENT`.

---

## 1. Por qué existe este spec

Es el consumo completo de `ESAVI-DILUENT-001`…`005B`, especificado en el SPEC F23 del backend, y el primero de los cuatro de catálogos clínicos (FE25a–d).

**A — El maestro solo se puede llenar a mano, en la base.** `src/features/diluent/api.ts` declara `diluentResource` únicamente para que `<DiluentSelect>` lea `002A`. Sus comentarios marcan las otras seis rutas como «out of scope» (SPEC FE12c §2). Mientras tanto, `DiluentFormRow.tsx:89` trata el maestro vacío como la situación de todo despliegue: sin filas, el paso de notificación cae al registro en texto libre. Sin pantalla de mantenimiento, codificar un diluyente exige tocar la base directamente.

**B — El menú promete una pantalla que no existe.** `navigation.ts` declara `nav.items.diluent → /diluents` con `disabled: true`, y hoy se pinta como «Próximamente».

**C — El `003` no ve lo que el `002B` sí muestra.** Un diluyente inactivo responde 404 a USER **y a ADMIN** en `ESAVI-DILUENT-003`, porque `canViewInactive` es solo de SUPERADMIN (SPEC F23 §3.5). El `002B`, en cambio, se lo lista a ADMIN. Una acción de fila que abra el diálogo de edición sobre una fila inactiva acabaría en error. La pantalla tiene que resolverlo por diseño (§3.1), no descubrirlo en pruebas.

Fija además el patrón de listado + diálogo + auditoría que después reutilizan FE25b (términos diagnósticos) y FE25c (vacunas WHODrug).

---

## 2. Alcance

**Dentro:**

- **La pantalla `/diluents`** con `DiluentListPage.tsx`. Lleva búsqueda por `name`/`code` en `searchParams.q`, paginación en `searchParams.page` y el toggle «mostrar inactivos» en `searchParams.includeInactive`, visible solo con ADMIN. El toggle elige entre `002A` y `002B` a través de `createResource`.
- **`DiluentFormDialog.tsx`**: un solo diálogo para crear (`001`) y editar (`004`), con los cuatro campos de SPEC F23 y `code` en error ante un 409 de código ocupado.
- **La fila `OTHER` protegida en la interfaz.** Al abrir el diluyente con `code === 'OTHER'`, el diálogo explica que el paso de notificación depende de esa fila para el registro en texto libre y **no deja guardar**: «Guardar» queda deshabilitado para todos los roles, aunque se modifiquen los campos, y solo queda «Cancelar». El menú de fila no ofrece «Dar de baja» sobre ella.
- **`DiluentAuditSheet.tsx`**: lee `appDetails` con `useOne` (`003`) y la ve solo SUPERADMIN, como en `geoLevelType` y `healthFacility`.
- **Acciones de fila por rol y estado:**
  - «Editar» para ADMIN en filas activas, y para SUPERADMIN en cualquiera.
  - «Auditoría» para SUPERADMIN.
  - «Desactivar» (`005A`) para ADMIN en filas activas.
  - «Reactivar» (`005B`) para SUPERADMIN en filas inactivas.
- **`schemas.ts`** con `createDiluentSchema` y `updateDiluentSchema`, más el mapa de errores del servidor a campos.
- **Ruta y menú:** la ruta `/diluents` bajo `<RequireRole level={USER}>` en `app/router.tsx`, y en `navigation.ts` se quita `disabled: true` de `nav.items.diluent`.
- **`api.ts` actualizado:** los comentarios de «out of scope» pasan a citar este spec. La declaración no cambia.
- **El bloque i18n `diluent.*`** (listado, formulario, estados, errores por `code`) en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **Términos diagnósticos**, en SPEC FE25b.
- **Vacunas WHODrug**, en SPEC FE25c.
- **Sincronización y listado de productos WHODrug**, en SPEC FE25d.
- **Página de detalle de diluyente.** Cuatro columnas caben en la tabla y en la auditoría.
- **Proteger la fila `OTHER` en el backend.** El bloqueo de este spec es de interfaz: el `004` y el `005A` siguen aceptándola (§7).
- **`ESAVI-DILUENT-005C`.** No existe: la tabla está en `preventPhysicalDelete`.
- **El hallazgo de `healthFacility`:** `HealthFacilityRowActions` ofrece «Editar» a ADMIN sobre filas inactivas, y el `003` le responde 404. Se corrige en su propio spec.
- **Subir el `pageSize: 100` de `DiluentFormRow.tsx:80`.** Solo importa si el maestro pasa de cien filas, y no hay indicio de que vaya a pasar.

---

## 3. Diseño

### 3.1 Pantallas y rutas

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Listado | `/diluents` | `features/diluent/DiluentListPage.tsx` | `<RequireRole level={USER}>` |
| Crear / editar | (diálogo sobre el listado) | `features/diluent/DiluentFormDialog.tsx` | acción visible con `useCan(ADMIN)` |
| Auditoría | (panel lateral sobre el listado) | `features/diluent/DiluentAuditSheet.tsx` | acción visible con `useCan(SUPERADMIN)` |

**Menú.** En `shared/config/navigation.ts`, la entrada `nav.items.diluent` del grupo `nav.groups.clinicalCatalogs` pierde `disabled: true`. Conserva el icono `Beaker`, la ruta `/diluents` y `minLevel: ROLE_LEVELS.USER`, que es el rol mínimo real de `ESAVI-DILUENT-002A`.

**Acciones de fila.** Cada una se decide por rol y por `isActive`. Van en un `DiluentRowActions` con sus propios `useCan()`, igual que `HealthFacilityRowActions`.

| Acción | Visible si | Ruta |
|---|---|---|
| Editar | `useCan(ADMIN)` y fila activa, **o** `useCan(SUPERADMIN)` | `003` + `004` |
| Ver auditoría | `useCan(SUPERADMIN)` | `003` |
| Dar de baja | `useCan(ADMIN)`, fila activa y `code !== 'OTHER'` | `005A` |
| Reactivar | `useCan(SUPERADMIN)` y fila inactiva | `005B` |

La condición de «Editar» resuelve el hallazgo C de §1. Un ADMIN ve filas inactivas por el `002B`, pero no puede leerlas por el `003`, así que no se le ofrece una acción que acabaría en 404. «Ver auditoría» no necesita esa condición porque solo la ve SUPERADMIN, que sí lee inactivas.

«Crear diluyente» va en la cabecera del listado, con `useCan(ADMIN)`.

### 3.2 Endpoints consumidos

```
GET    /api/diluents                ESAVI-DILUENT-002A  USER        listado de activos
GET    /api/diluents/admin          ESAVI-DILUENT-002B  ADMIN       listado con inactivos (toggle)
GET    /api/diluents/:id            ESAVI-DILUENT-003   USER        diálogo de edición y auditoría
POST   /api/diluents                ESAVI-DILUENT-001   ADMIN       crear
PUT    /api/diluents/:id            ESAVI-DILUENT-004   ADMIN       actualizar
DELETE /api/diluents/:id            ESAVI-DILUENT-005A  ADMIN       dar de baja
PATCH  /api/diluents/activate/:id   ESAVI-DILUENT-005B  SUPERADMIN  reactivar
```

Se consumen las siete. No hay `005C`, porque `diluentCatalog` está en `preventPhysicalDelete`.

**Parámetros del listado.** Además de `limit` y `offset`, el listado acepta `name` y `code`, cada uno con un mínimo de 2 caracteres. El backend los combina con `Op.or` (`diluentCatalog.service.ts:29`), así que el término de búsqueda viaja en los dos a la vez. **No se usa `search`**, que es el alias congelado de SPEC F52. Orden fijo `name ASC`, que decide el servidor.

### 3.3 Tipos del contrato

Se reutilizan sin cambios los de `contracts/declared/diluent.ts`: `Diluent` (fila con `diluentCatalogId`, `code`, `name`, `description`, `composition`, `isActive`, `createdAt`, `updatedAt`, `deletedAt`, `appDetails`) y `CreateDiluentInput`. El update es `Partial<CreateDiluentInput>`.

No se ejecuta `contracts:sync`. Es un contrato declarado a mano, reconciliado contra `esavi-backend/src/types/diluentCatalog/`, y hoy coincide campo por campo con `CreateDiluentCatalogInput`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Término de búsqueda | URL | `searchParams.q` | Se escribe con debounce. Viaja como `name=q&code=q`. Menos de 2 caracteres no se envía. Al cambiar, se borra `page`. |
| Página | URL | `searchParams.page` | Si falta, vale 1. |
| Toggle «mostrar inactivos» | URL | `searchParams.includeInactive=true` | Si falta, es falso. Solo se renderiza con ADMIN. Decide entre `002A` y `002B`. |
| Tamaño de página | Zustand | `preferences.pageSize` | Preferencia global que ya existe. No es propia de esta pantalla. |
| Listado | TanStack Query | `['diluent', 'list', { limit, offset, includeInactive, filters }]` | `staleTime` de 30 min: es un catálogo, y ya está declarado en `diluentResource`. |
| Fila del diálogo y de la auditoría | TanStack Query | `['diluent', 'detail', id]` | La misma entrada de caché para los dos. |
| Valores del formulario | React Hook Form | estado del `useForm` | Se rellenan con `reset(detail)` al llegar el `003`. Es la única copia editable. |
| Id en edición o auditoría, diálogo abierto | Componente | `useState` en `DiluentListPage` | Efímero: no se comparte por enlace. |
| Confirmación de baja o reactivación abierta | Componente | `useState` | Efímero. |
| Texto del input antes del debounce | Componente | `useState` | Es un búfer de tecleo. La fuente de verdad es `searchParams.q`. |

**Invalidación.** Tras `001`, `004`, `005A` y `005B`, la fábrica invalida `['diluent']` entera. Eso refresca el listado, el detalle y, sin tocar nada, el `<DiluentSelect>` y el `DiluentFormRow` del paso de notificación, que leen la misma clave.

**Sin excepciones a las capas.** No hay nada remoto en `useState` ni en un store, y ningún filtro vive fuera de la URL.

### 3.5 Formularios y validación

**Formulario único de crear y editar**: `features/diluent/schemas.ts`, con `createDiluentSchema`. `updateDiluentSchema` es `createDiluentSchema.partial()`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `code` | `<Input>` | sí | `trim`, no vacío, máx. 100. El backend lo guarda en `CONSTANT_CASE`. |
| `name` | `<Input>` | sí | `trim`, no vacío, máx. 250. El backend lo guarda **literal**, solo con `trim`, sin pasarlo a Title Case. |
| `description` | `<Textarea>` | no | Anulable. Vacío se envía como `null`. |
| `composition` | `<Textarea>` | no | Anulable. Vacío se envía como `null`. |

- **`isActive` no está en el formulario.** El ciclo de vida va por `005A`/`005B`, no por `PUT`.
- **Normalización visible.** Debajo de `code` va una ayuda fija: «Se guardará en mayúsculas con guiones bajos». Sirve para que `agua destilada` → `AGUA_DESTILADA` no sorprenda al volver del servidor. La ayuda es texto; el cliente no transforma el valor.
- **En el `PUT` va el objeto completo.** El backend hace el update diferencial (`CONVENTIONS.md` §6.5). Guardar sin tocar nada no escribe.
- **Fila `OTHER`: aviso y guardado bloqueado.** Si el `code` cargado por el `003` es `OTHER`, el diálogo muestra el aviso sobre los campos (el paso de notificación usa esta fila para el registro en texto libre, y cambiar su código o darla de baja lo desactiva) y deshabilita «Guardar» para todos los roles. Los campos siguen editables, pero nada se envía; solo «Cancelar» está activo. El bloqueo se decide por el valor **guardado**, no por lo que se está tecleando: teclear `OTHER` en otra fila no bloquea nada.

**Errores del servidor.**

| `code` | Destino |
|---|---|
| `DILUENT_001_CODE_EXISTS`, `DILUENT_004_CODE_EXISTS` | Campo `code`. El texto aclara que el código puede estar ocupado por un diluyente dado de baja. |
| `DILUENT_003_NOT_FOUND`, `DILUENT_004_NOT_FOUND` | Toast, y el diálogo se cierra. |
| `DILUENT_005A_NOT_FOUND`, `DILUENT_005B_NOT_FOUND` | Toast. |
| `DILUENT_005A_ALREADY_INACTIVE`, `DILUENT_005B_ALREADY_ACTIVE` | Toast. |
| Cualquier otro, incluido `UNKNOWN_ERROR` | Toast genérico por `code`. Nunca se muestra `errors`. |

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga | Skeleton de `<ResourceTable>` | — |
| Vacío (sin datos) | Texto, más el botón «Crear diluyente» solo con ADMIN | `diluent.list.empty` |
| Vacío (con búsqueda) | Texto, más el botón «Limpiar búsqueda», que borra `q` y `page` | `diluent.list.emptySearch`, `diluent.list.clearSearch` |
| Error | Mensaje por `code`, más «Reintentar» | `common.table.retry` |
| Sin permiso | No se llega: la ruta es USER y el `NavItem` es USER. Las acciones de ADMIN y SUPERADMIN no se renderizan. | — |
| Carga del diálogo de edición | Campos deshabilitados hasta que llega el `003` | — |

### 3.7 Responsividad y accesibilidad

- **La tabla pasa a tarjetas** por debajo de `md`:
  - `card: 'primary'` → `name`.
  - `card: 'secondary'` → `code`.
  - `card: 'meta'` → `composition`, truncada a una línea.

  La fila inactiva lleva `isRowInactive`: tinte y badge de §10.1.
- **Columnas en escritorio:** `name`, `code`, `composition` (truncada, con el texto completo en `title`), estado y acciones. `description` solo se ve en el diálogo.
- **La caja de búsqueda** ocupa el ancho completo en móvil. El toggle de inactivos queda debajo.
- **Diálogo en pantalla completa** por debajo de `md`, con la barra de acciones fija abajo.
- **Accesibilidad:** objetivos táctiles de 44px y `dvh`. El menú de acciones de fila lleva un `aria-label` por i18n. Toda la pantalla se recorre con teclado.

### 3.8 Claves i18n nuevas

Van en el bloque `diluent`, que ya existe con `select.empty`, y en los tres idiomas.

| Clave | Uso |
|---|---|
| `diluent.list.title` | Título de la pantalla |
| `diluent.list.empty` | Vacío sin datos |
| `diluent.list.emptySearch` | Vacío con búsqueda |
| `diluent.list.clearSearch` | Botón «Limpiar búsqueda» |
| `diluent.list.create` | Botón «Crear diluyente» |
| `diluent.filters.search` | Etiqueta de la búsqueda |
| `diluent.filters.searchHint` | «Nombre o código, al menos 2 caracteres» |
| `diluent.form.createTitle` / `editTitle` | Títulos del diálogo |
| `diluent.form.codeHint` | Ayuda de normalización de `code` |
| `diluent.form.otherWarning` | Aviso de la fila `OTHER` |
| `diluent.fields.code` / `name` / `description` / `composition` / `isActive` | Etiquetas y cabeceras de columna |
| `diluent.status.active` / `inactive` | Badge de estado |
| `diluent.actions.menu` | `aria-label` del menú de fila |
| `diluent.errors.DILUENT_001_CODE_EXISTS` … `DILUENT_005B_ALREADY_ACTIVE` | Los ocho `code` de §3.5 |

`nav.items.diluent` ya existe y no cambia.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y se puede committear por separado. Antes del paso 4 se cargan `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` (`CONVENTIONS.md` §10.6).

1. **`api.ts` fuera del «out of scope».** Los siete comentarios de `features/diluent/api.ts` pasan a citar su consumidor: `DiluentListPage`, `DiluentFormDialog`, `DiluentAuditSheet` y `<DiluentSelect>`, con referencia a este spec. La llamada a `createResource` no se toca.
   *Verificación:* `grep -n "out of scope" src/features/diluent/api.ts` no devuelve nada, y `git diff` solo muestra líneas de comentario.

2. **Schemas.** `features/diluent/schemas.ts` contiene:
   - `createDiluentSchema` y `updateDiluentSchema`;
   - un `toDiluentPayload`, que convierte vacío en `null` en `description` y `composition`;
   - `diluentErrorFieldMap`, que envía los dos `CODE_EXISTS` a `code`.

   Se prueban en `schemas.test.ts`.
   *Verificación:* los tests cubren `code` vacío, `code` de 101 caracteres, `name` de 251, y `description: ''` que se convierte en `null`.

3. **Claves i18n.** Las claves de §3.8 van en `es`, `en` y `nl`.
   *Verificación:* `npm run i18n:check` sale en 0.

4. **`DiluentFormDialog.tsx`.**
   - Crea con `useCreate` y edita con `useOne` + `useUpdate`, resetea las mutaciones al cerrar (§10.7) y mapea los errores al campo.
   - Muestra la ayuda de normalización y, según el `code` guardado, el aviso `OTHER` con «Guardar» deshabilitado.
   - Se prueba en `DiluentFormDialog.test.tsx` con MSW.

   *Verificación:* un 409 `DILUENT_001_CODE_EXISTS` pinta el error bajo `code`. Una fila con `code: 'OTHER'` muestra el aviso y deja «Guardar» deshabilitado aunque se modifique un campo; una fila distinta no. El `PUT` lleva los cuatro campos.

5. **`DiluentAuditSheet.tsx`.** Pasa `appDetails` desde `useOne` (`003`) a `<AuditTrail>`, con la misma forma que `HealthFacilityAuditSheet`.
   *Verificación:* abrir el panel sobre una fila con dos entradas en `appDetails` las lista en orden.

6. **`DiluentListPage.tsx` y `DiluentRowActions`.**
   - `<ResourceTable>` con `inactiveMode="adminPath"`, `isRowInactive`, las columnas y las tarjetas de §3.7.
   - `q`, `page` e `includeInactive` en `searchParams`, con debounce sobre `q`.
   - Las acciones de §3.1 según rol e `isActive`, y la confirmación de baja y de reactivación.
   - Se prueba en `DiluentListPage.test.tsx`.

   *Verificación:*
   - Teclear «agua» envía `name=agua&code=agua` una sola vez tras el debounce, y recargar conserva la búsqueda.
   - Con ADMIN, una fila inactiva no ofrece «Editar».
   - Con USER no aparecen el toggle, «Crear» ni el menú de acciones.
   - Con SUPERADMIN, una fila inactiva ofrece «Editar», «Auditoría» y «Reactivar».
   - La fila `OTHER` activa no ofrece «Dar de baja».

7. **Ruta y menú.** `/diluents` bajo `<RequireRole level={USER}>` en `app/router.tsx`, y se quita `disabled: true` de `nav.items.diluent`. Se añade `router.diluent.test.tsx`, que sigue el patrón de `router.catalogType.test.tsx`.
   *Verificación:* con USER, el ítem del sidebar ya no dice «Próximamente» y lleva a `/diluents`. Sin sesión, redirige al login.

---

## 5. Criterios de aceptación

- [ ] Las siete rutas de §3.2 se consumen, y cada una aparece citada con su código `ESAVI-DILUENT-*` en `api.ts` o en el componente que la usa.
- [ ] Existen los artefactos de `CONVENTIONS.md` §5 que aplican: `contracts/declared/diluent.ts`, `api.ts`, `schemas.ts`, `DiluentListPage.tsx`, la ruta en `app/router.tsx` y el `NavItem` sin `disabled`. No hay `DetailPage`, por la decisión de §6.
- [ ] Buscar «agua» y recargar la página conserva la búsqueda. El enlace copiado reproduce la misma vista en otra sesión.
- [ ] La búsqueda envía `name` y `code`, nunca `search`. Con menos de 2 caracteres no se envía nada.
- [ ] Con `includeInactive=true` y rol ADMIN, la petición va a `/api/diluents/admin`. Sin el parámetro, va a `/api/diluents`.
- [ ] Con ADMIN, una fila inactiva no ofrece «Editar». Con SUPERADMIN, sí.
- [ ] Un 409 de código ocupado pinta el error bajo `code`, también cuando la fila que lo ocupa está dada de baja.
- [ ] Abrir la fila `OTHER` muestra el aviso y deja «Guardar» deshabilitado para todos los roles, aunque se modifiquen los campos. Solo «Cancelar» está activo.
- [ ] El menú de fila de `OTHER` no ofrece «Dar de baja».
- [ ] Tras crear un diluyente, el `<DiluentSelect>` del paso de notificación lo ofrece sin recargar.
- [ ] `grep -rn "response.data.data" src/features/diluent/` no devuelve resultados.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no reporta errores nuevos en los archivos tocados.

**Cierre obligatorio:**

- [ ] **Tema oscuro.** La pantalla, el diálogo y el panel de auditoría se ven correctos en `dark`, y `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/diluent/` no devuelve resultados.
- [ ] **Por debajo de `md`.** La tabla colapsa a tarjetas con `name`, `code` y `composition`, y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER`, el menú ofrece `/diluents` y la pantalla no ofrece el toggle, «Crear» ni acciones de fila. Un `403` inesperado se maneja sin pantalla en blanco.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`. Las claves de §3.8 están en los tres idiomas.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState` ni en un store, y ningún filtro fuera de `searchParams`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** dividir los catálogos clínicos en FE25a (diluyentes), FE25b (términos diagnósticos), FE25c (vacunas WHODrug) y FE25d (productos WHODrug). Tres entidades con contratos muy distintos, más una cuarta de otro dominio, no caben en un spec que alguien pueda ejecutar. Diluyentes va primero porque es el más pequeño y fija el patrón.
- **Sí:** conservar `features/diluent/` y `diluentResource`, y no renombrar a `diluentCatalog`. Es la decisión de SPEC FE12c §6: `diluentCatalog` es la tabla y `diluent` es el recurso. Renombrar ahora movería `<DiluentSelect>` y `DiluentFormRow` sin ganancia.
- **Sí:** una sola caja de búsqueda que viaja como `name` y `code`. El backend las combina con `Op.or`, así que un campo cubre los dos casos. Dos cajas separadas no ofrecerían AND, porque el servidor no lo hace.
- **No:** usar `search`. Es el alias congelado de SPEC F52.
- **Sí:** ocultar «Editar» a ADMIN en filas inactivas. El `003` le responde 404 aunque el `002B` le muestre la fila.
- **No:** rellenar el diálogo con la fila del listado para esquivar el 404. Crearía dos fuentes para el mismo dato y contradiría §3.4.
- **Sí:** auditoría solo para SUPERADMIN, por simetría con `geoLevelType` y `healthFacility`.
- **Sí (revisado el 2026-09-25, durante la implementación):** bloquear el guardado de la fila `OTHER` y ocultar su «Dar de baja», para todos los roles, conservando el aviso. Sustituye a la decisión inicial de un aviso no bloqueante: el usuario prefirió que ningún rol pueda romper el registro en texto libre desde la interfaz.
- **No:** poner los campos de `OTHER` en solo lectura. Siguen editables; lo que se impide es el envío.
- **No:** reescribir el aviso. Conserva su texto aunque mencione cambiar el código.
- **Sabido:** `OTHER` es una convención de este despliegue (`DiluentFormRow.tsx:26`), no del contrato. El bloqueo es de interfaz, no una regla del backend (§7).
- **No:** página de detalle. Cuatro columnas caben en la tabla, y `description` se lee en el diálogo.
- **No:** `isActive` en el formulario. El ciclo de vida va por `005A`/`005B`, cada uno con su rol y su entrada de auditoría.
- **No:** normalizar `code` en el cliente. Lo hace el backend. El cliente solo avisa con una ayuda fija, para no mantener dos implementaciones de `toConstantCase`.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| La fila `OTHER` se renombra o se da de baja fuera de esta pantalla (API directa, otra pestaña con caché vieja), y el paso de notificación pierde el registro en texto libre | La interfaz bloquea el guardado y la baja (§3.5), pero el backend no: el `004` y el `005A` siguen aceptándola. La baja se revierte con `005B` (SUPERADMIN). Protegerla de verdad es un cambio del otro repositorio. |
| El maestro pasa de 100 filas y `DiluentFormRow` (`pageSize: 100`) deja de ofrecer las últimas | Fuera de alcance (§2). Con una docena de diluyentes esperados no ocurre, y `002A` ordena por `name`. |
| Un 409 de código ocupado confunde cuando la fila que lo ocupa está dada de baja y no aparece en el listado | El mensaje de `CODE_EXISTS` dice que el código puede pertenecer a un diluyente dado de baja. Con el toggle, ADMIN puede encontrarlo. |

---

## 8. Impacto en pantallas existentes

| Archivo | Antes | Después |
|---|---|---|
| `shared/config/navigation.ts` | `nav.items.diluent` con `disabled: true`, que se pinta como «Próximamente» | Navegable a `/diluents` |
| `features/diluent/api.ts` | Seis rutas comentadas como «out of scope» | Comentarios que citan este spec y a sus consumidores. El código no cambia. |
| `shared/components/DiluentSelect.tsx`, `features/notification/DiluentFormRow.tsx` | Leen un maestro que solo se llena por la base | Sin cambios de código. Reciben los cambios del CRUD por la invalidación de `['diluent']`. |

---

## Lo que **no** está en este spec

- Términos diagnósticos (SPEC FE25b), vacunas WHODrug (SPEC FE25c) y productos WHODrug (SPEC FE25d).
- La página de detalle de diluyente.
- Proteger la fila `OTHER` en el backend.
- Subir el `pageSize` de `DiluentFormRow`.
- El hallazgo de `HealthFacilityRowActions`, que ofrece «Editar» a ADMIN sobre filas inactivas que el `003` le responde con 404.

Cada uno de esos, si aterriza, va en su propio spec.

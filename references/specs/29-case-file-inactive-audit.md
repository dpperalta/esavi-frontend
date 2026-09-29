# SPEC FE29 — Registros eliminados y auditoría en las listas del expediente

> **Estado:** Aprobado
> **Depende de:**
> - SPEC FE02 (`createResource`, `useListByParent`, `useActivate`)
> - SPEC FE12b–FE12e y FE13a–FE13c (las diez listas satélite)
> - SPEC FE16 (`getPendingFields`, que sigue leyendo solo filas activas)
> - SPEC FE17 (`isCaseClosedError` y el manejador global de `*_CASE_CLOSED`)
> - SPEC F60 del backend (los `005B` de las satélites bajan a ADMIN)
> - SPEC F61 del backend (un caso cerrado no reactiva filas)
>
> **Fecha:** 2026-09-29
> **Objetivo:** Que un ADMIN vea las filas eliminadas de las listas del expediente y las restaure, y que un SUPERADMIN consulte el historial de auditoría de cada fila (`CONVENTIONS.md` §10.4). Todo con un único mecanismo genérico, no entidad por entidad.

---

## 1. Por qué existe este spec

Las diez listas satélite de los pasos 4 y 5 permiten eliminar una fila (`005A`, USER desde F60), pero **no hay forma de ver lo eliminado ni de deshacerlo**. El backend ofrece las dos cosas en cada una de esas entidades:

- un `002B` por padre, que devuelve activas e inactivas (ADMIN);
- un `005B`, que reactiva (ADMIN).

Ninguna pantalla los consume. Un evento, una vacuna o un diagnóstico eliminado por error solo se recupera hoy por API.

**A — Lo eliminado es invisible.** Todas las listas leen `006` (por caso) o `002A` (por padre), y los dos filtran por `isActive: true`. Tras un `005A`, la fila desaparece de la pantalla sin dejar rastro, también para el ADMIN que tiene permiso para devolverla.

**B — La auditoría existe pero no se ve.** Cada fila trae su `appDetails` (quién creó, editó, eliminó o restauró, y cuándo). `<AuditTrail>` ya sabe pintarlo, pero en el expediente solo se usa en `EsaviCaseDetailPage`, nunca por fila satélite.

**C — `createResource` no admite la forma de estas rutas.** Su listado con inactivos (`adminSegment`) solo funciona con `inactiveMode: 'adminPath'`, y ese modo exige un `adminPath` global que estas entidades no tienen. Sus `002B` son exclusivamente por padre (`/admin/notification/:id`, `/admin/investigation/:id`, `/admin/pregnancy/:id`). Por eso las diez están declaradas `serverDecides` y ninguna puede pedir el `002B` a través de la fábrica.

**D — Son diez, no veinte, y con un contrato idéntico.** Cumplen el par (`002B` por padre y `005B`, ambos ADMIN) exactamente las satélites de varias filas:

- de la notificación: `NOTIFEVT`, `NOTIFVAC`, `NOTIFMED`, `MEDHIST`, `PREGCOMP`;
- de la investigación: `INVTEAM`, `INVPREG`, `EVALINST`, `INVVACAD`, `INVDIAG`;
- `NOTIFDIL` también lo cumple, pero queda fuera (§2).

Las satélites 1:1 de la investigación no tienen ni `005A` ni `005B`. `NOTIFPRG` tiene `005B`, pero ningún `002B` desde el que encontrar la fila. Que el contrato sea idéntico es lo que permite resolverlo una sola vez: tres props opcionales en `<SatelliteList>`, un ajuste en la fábrica y una declaración por recurso.

---

## 2. Alcance

**Dentro:**

- **`createResource`.** `assertConfig` acepta `inactiveMode: 'adminPath'` con un `adminPath` **o** con un `parent.adminSegment`. Si falta `adminPath` y alguien llama a `useList` con `includeInactive`, la fábrica lanza un error explícito en vez de pedir la URL `undefined`.
- **Las diez declaraciones de recurso.** Pasan a `inactiveMode: 'adminPath'` y declaran `parent` con su `segment` (`002A`) y su `adminSegment` (`002B`). Las cuatro que ya tienen `parent` (`INVTEAM`, `INVPREG`, `EVALINST`, `INVVACAD`) solo añaden `adminSegment`. Los códigos `002B` y `005B` se citan en el comentario de cabecera de cada una.
- **`<SatelliteList>`.** Recibe cuatro props opcionales:
  - `isRowInactive(row)`: tinte `bg-destructive/5` y `Badge` «Eliminado» (§10.1), también en la tarjeta;
  - `onRestore(row)`: la acción «Restaurar», que solo aparece en filas inactivas;
  - `onShowHistory(row)`: la acción «Historial», que aparece en todas las filas cuando quien usa la primitiva la pasa (solo desde SUPERADMIN);
  - `getRowAppDetails(row)`: alimenta el `Sheet` con `<AuditTrail>` que abre la propia primitiva.

  Una fila inactiva no ofrece ni editar ni eliminar. Sin estas props, la primitiva se comporta exactamente como hoy.
- **El toggle «Mostrar registros eliminados».**
  - Es un `Switch` en la cabecera del contenido de los pasos 4 y 5, y se ve desde ADMIN.
  - Vive en `searchParams.includeInactive` del asistente: sobrevive al cambio de paso y a la recarga.
  - En los pasos 1–3 y 6 no se pinta.
- **Las diez listas.**
  - Con el toggle encendido, la tabla lee `useListByParent(parentId, { includeInactive: true })`, es decir, el `002B`. Con el toggle apagado, lee la consulta de hoy.
  - La lógica del paso (`getPendingFields`, `takesMedication`, completar etapa) sigue leyendo siempre la consulta de hoy.
  - «Historial» se ve solo desde SUPERADMIN (`useCan(ROLE_LEVELS.SUPERADMIN)`, `CONVENTIONS.md` §10.4). «Restaurar» se ve desde ADMIN y se oculta con `readOnly`.
- **Restaurar sin confirmación.** Es una acción directa con toast de éxito e invalidación de la raíz del recurso (`useActivate` ya la hace). En eventos, el toast avisa en condicional de que el evento pudo pasar al final de la lista.
- **Errores.** `*_005B_ALREADY_ACTIVE` se resuelve por sufijo: toast común más invalidación. `*_CASE_CLOSED` ya lo resuelve FE17.
- **Claves i18n nuevas** en `es`, `en` y `nl`.

**Fuera de alcance (otros specs):**

- **`NOTIFDIL`.** Es una lista anidada en el diálogo de vacuna y no usa `<SatelliteList>`. Queda como seguimiento.
- **`NOTIFPRG`.** Tiene `005B` pero ningún `002B`, así que un bloque de embarazo eliminado no se puede encontrar desde el cliente. Es una dependencia del backend.
- **Auditoría de las satélites 1:1 y de las cabeceras de etapa** (`notification`, `investigation`, `classification`, los 1:1 de la investigación). No tienen baja lógica, y su historial merece su propio spec si se pide.
- **Purga física (`005C`, SUPERADMIN).**
- **Auditoría y eliminados en `EsaviCaseDetailPage`.** Este spec solo toca el asistente.
- **El badge que falta en la bandeja de FE24.** Es un hueco conocido, pero de otra pantalla.
- **Filtrar la lista a «solo eliminados».** El toggle mezcla activas e inactivas, como en el resto de la app.

---

## 3. Diseño

Es un spec de ampliación y transversal: solo aparecen las subsecciones que aplican, y la §3.8 recoge las claves i18n.

### 3.1 Pantallas y rutas

No hay rutas ni entradas de navegación nuevas.

| Pieza | Archivo | Qué cambia | Roles |
|---|---|---|---|
| Fábrica | `shared/api/createResource.ts` | `assertConfig` acepta `'adminPath'` con `parent.adminSegment` y sin `adminPath`; `useList` lanza un error explícito si se pide con inactivos y no hay `adminPath` | — |
| Primitiva | `shared/components/SatelliteList.tsx` | Cuatro props opcionales (§2), `Badge` y tinte, acciones «Historial» y «Restaurar», y un `Sheet` interno con `<AuditTrail>` | Los decide quien la usa |
| Toggle | `features/esaviCase/ShowInactiveSwitch.tsx` (nuevo, en la feature que posee el asistente) | Un `Switch` conectado a `searchParams.includeInactive`, pintado arriba del contenido de `NotificationStep` e `InvestigationStep` | Visible desde ADMIN (`useCan(ROLE_LEVELS.ADMIN)`), el rol real de los diez `002B` |
| Listas de la notificación | `notification/EventList`, `VaccineList`, `MedicationList`, `MedicalHistoryList`, `PregnancyComplicationList` | Leen el toggle; con él encendido, la tabla lee el `002B`; pasan las cuatro props | «Historial»: SUPERADMIN. «Restaurar»: ADMIN y no `readOnly` |
| Listas de la investigación | `investigation/TeamMemberList`, `NewbornConditionList`, `EvaluationInstitutionList`, `VaccineAdministeredList`, `DiagnosticList` | Lo mismo; en estas, el equivalente de `readOnly` es su prop `disabled` | Lo mismo |
| Recursos | `features/notification/api.ts`, `features/investigation/api.ts` | Diez declaraciones pasan a `'adminPath'` con `parent.segment` y `parent.adminSegment` | — |

El toggle lo lee cada lista con `useSearchParams`, y no baja por props. Así, `NotificationStep` e `InvestigationStep` no tienen que pasar un valor más a diez hijos, y la URL sigue siendo la única fuente.

### 3.2 Endpoints consumidos

Los diez `002B` son nuevos para el cliente, los diez `005B` también. Todos salen de `API-ROUTES.md`:

| Entidad | `002B` (ADMIN) | `005B` (ADMIN) |
|---|---|---|
| `notificationEvent` | `GET /api/notification-events/admin/notification/:id` · `ESAVI-NOTIFEVT-002B` | `PATCH /api/notification-events/activate/:id` · `ESAVI-NOTIFEVT-005B` |
| `notificationVaccine` | `GET /api/notification-vaccines/admin/notification/:id` · `ESAVI-NOTIFVAC-002B` | `PATCH /api/notification-vaccines/activate/:id` · `ESAVI-NOTIFVAC-005B` |
| `notificationMedication` | `GET /api/notification-medications/admin/notification/:id` · `ESAVI-NOTIFMED-002B` | `PATCH /api/notification-medications/activate/:id` · `ESAVI-NOTIFMED-005B` |
| `notificationMedicalHistory` | `GET /api/notification-medical-histories/admin/notification/:id` · `ESAVI-MEDHIST-002B` | `PATCH /api/notification-medical-histories/activate/:id` · `ESAVI-MEDHIST-005B` |
| `notificationPregnancyComplication` | `GET /api/notification-pregnancy-complications/admin/pregnancy/:id` · `ESAVI-PREGCOMP-002B` | `PATCH /api/notification-pregnancy-complications/activate/:id` · `ESAVI-PREGCOMP-005B` |
| `investigationTeamMember` | `GET /api/investigation-team-members/admin/investigation/:id` · `ESAVI-INVTEAM-002B` | `PATCH /api/investigation-team-members/activate/:id` · `ESAVI-INVTEAM-005B` |
| `investigationPregnancyCondition` | `GET /api/investigation-pregnancy-conditions/admin/investigation/:id` · `ESAVI-INVPREG-002B` | `PATCH /api/investigation-pregnancy-conditions/activate/:id` · `ESAVI-INVPREG-005B` |
| `evaluationInstitution` | `GET /api/evaluation-institutions/admin/investigation/:id` · `ESAVI-EVALINST-002B` | `PATCH /api/evaluation-institutions/activate/:id` · `ESAVI-EVALINST-005B` |
| `investigationVaccineAdministered` | `GET /api/investigation-vaccines-administered/admin/investigation/:id` · `ESAVI-INVVACAD-002B` | `PATCH /api/investigation-vaccines-administered/activate/:id` · `ESAVI-INVVACAD-005B` |
| `investigationDiagnostic` | `GET /api/investigation-diagnostics/admin/investigation/:id` · `ESAVI-INVDIAG-002B` | `PATCH /api/investigation-diagnostics/activate/:id` · `ESAVI-INVDIAG-005B` |

Notas del contrato:

- **El `:id` de `002B` es el del padre**, no el del caso: `notificationId`, `pregnancyId` o `investigationId`. Las diez listas ya lo reciben por props. Si el padre todavía no existe (`pregnancyId === null`, o `investigationId` ausente en `DiagnosticList`), la consulta no se lanza (`enabled: !!parentId`, ya en la fábrica).
- **`002B` pagina** (`limit` 1–100). Las listas piden una sola página de 100, igual que hoy reciben todo de una vez. Una lista del expediente con más de 100 filas, contando las eliminadas, no es un caso real; si ocurre, se ve el aviso de §7.
- **`002B` ordena por `sortOrder`** en las entidades que lo tienen, con activas e inactivas mezcladas.
- **`005B` no devuelve nada que la pantalla lea.** Tras un `200` se relee la lista.
- **Rechazos del backend.** Con el caso cerrado, `005B` responde `409 <PREFIX>_005B_CASE_CLOSED` (F61). En `NOTIFEVT`, antes de reactivar, el backend reasigna el `sortOrder` si su número está ocupado.
- **`appDetails` llega en cada fila** del `002B`, de `002A` y de `006`. El autor viene resuelto para ADMIN o superior y como `null` para USER (`canViewAuditAuthors`). «Historial» no hace ninguna petición.

### 3.3 Tipos del contrato

No hay tipos nuevos. Las diez interfaces de `src/contracts/declared/` ya tienen `isActive`, `deletedAt` y `appDetails`. `<AuditTrail>` recibe `AppDetails[] | null`; si el tipo de alguna fila declara `AppDetailsResponse[]` (autor `string | null`), `<AuditTrail>` amplía su prop a ese tipo en lugar de hacer un cast (`CONVENTIONS.md` §9).

### 3.4 Contrato de estado

| Dato | Capa | Dónde | Notas |
|---|---|---|---|
| Toggle «Mostrar registros eliminados» | URL | `searchParams.includeInactive` (`'true'` o ausente) | Lo escribe `ShowInactiveSwitch`, que al apagarse **borra** el parámetro en lugar de escribir `'false'`. Con USER se ignora aunque venga en la URL: cada lista lo combina con `useCan(ROLE_LEVELS.ADMIN)` y la fábrica vuelve a exigirlo. |
| Filas que ve la tabla, toggle apagado | TanStack Query | La consulta de hoy: `[key,'byCase',caseId]` (`006`) o `[key, operation, parentId, {…, includeInactive:false}]` (`002A`) | Sin cambios. |
| Filas que ve la tabla, toggle encendido | TanStack Query | `[key, operation, parentId, { limit:100, offset:0, includeInactive:true }]` (`002B`) | Sin `staleTime`, como toda la data del expediente: la invalida la escritura. |
| Filas que decide la lógica del paso | TanStack Query | La consulta de hoy, **siempre** | `getPendingFields`, `takesMedication` y completar etapa responden sobre filas activas. La lista de pantalla y la lógica hacen dos preguntas distintas con dos claves distintas; ninguna copia la otra. |
| Fila cuyo historial está abierto | `useState` local de `<SatelliteList>` | La fila o `null` | Estado de UI efímero; el `Sheet` pinta `getRowAppDetails(row)` de la fila en caché, no una copia. |
| Restauración en vuelo | TanStack Query | `useActivate()` de cada recurso | `isPending` deshabilita el botón de esa fila. Al terminar bien, invalida `[config.key]`, que cubre `byCase`, `002A` y `002B` porque comparten raíz. |

**Invalidación:**

| Evento | Qué se invalida |
|---|---|
| `200` de `005B` | `[config.key]` (lo hace ya `useActivate`) |
| `409 *_005B_ALREADY_ACTIVE` | `[config.key]`, desde el `catch` de la lista: otra persona se adelantó, y la relectura pinta la fila activa |
| `409 *_005B_CASE_CLOSED` | `['caseWorkflow']`, desde el `MutationCache` global (FE17); la pantalla pasa a solo lectura y «Restaurar» desaparece |

Nada de esto va a Zustand: ningún dato del expediente vive en un store.

### 3.5 Errores del servidor

Son los errores de `002B` y `005B` de las diez entidades. Se resuelven por **sufijo**, sin enumerar treinta códigos en `errorMessages.ts`, con la misma técnica que `isCaseClosedError` de FE17.

| Código (patrón) | HTTP | Tratamiento |
|---|---|---|
| `*_005B_ALREADY_ACTIVE` | 409 | Toast común `common.satelliteList.errors.alreadyActive` más invalidación de `[config.key]`. Lo detecta un helper nuevo, `isAlreadyActiveError(error)`, en `shared/api/errorMessages.ts`, y el `catch` de cada lista lo consulta antes de `getErrorMessage`. |
| `*_005B_CASE_CLOSED` | 409 | Toast con `getErrorMessage`; el `MutationCache` de FE17 invalida `['caseWorkflow']` y la pantalla pasa a solo lectura. |
| `*_005B_NOT_FOUND` | 404 | Toast con el `message` traducido del servidor, más invalidación de `[config.key]`: la fila fue purgada (`005C`) desde otra sesión. |
| `*_005B_ACTIVATION_FAILED` y cualquier `500` | 500 | Toast con `getErrorMessage`. No invalida. |
| Error de `002B` | 403, 404 o 500 | El bloque de error que `<SatelliteList>` ya pinta, con «Reintentar». El `403` no debería ocurrir, porque el toggle exige el mismo rol que la ruta. Si ocurre (rol degradado a mitad de sesión), se muestra igual, sin tratamiento especial. |

El toast de éxito **no** sale del servidor: es `common.satelliteList.toast.restored`, o `notification.events.toast.restored` en eventos.

### 3.6 Estados de la vista

| Estado | Toggle apagado | Toggle encendido |
|---|---|---|
| Carga | El esqueleto de hoy | El mismo esqueleto de `<SatelliteList>` mientras llega el `002B`; la lógica del paso no espera por él |
| Vacío | Sin texto (`CASE-PROCESS.md` §5.0) | Igual, sin texto |
| Error | El bloque de hoy | El bloque de hoy, con reintento del `002B` |
| Sin permiso | — | Con USER el toggle no se pinta, y un `includeInactive=true` escrito a mano en la URL se ignora: la lista queda como si estuviera apagado |
| Solo lectura (caso cerrado, `disabled`) | Sin «Añadir», editar ni eliminar (hoy) | Filas eliminadas visibles, con «Historial» (SUPERADMIN); **sin** «Restaurar» |
| Restauración en vuelo | — | El botón «Restaurar» de esa fila queda deshabilitado con `aria-busy`; el resto de la lista sigue operable |

Un historial vacío (`appDetails` `null`, `{}` o `[]`) muestra `common.audit.empty`, que ya existe.

### 3.7 Responsividad y accesibilidad

- **Por debajo de `md`, la tarjeta** lleva el `Badge` «Eliminado» junto al `cardBadge` que ya pase la lista, el tinte, y en el pie las acciones «Historial» y, si aplica, «Restaurar». Las dos miden 44px (`CONVENTIONS.md` §10.2).
- **El `Sheet` de historial** se abre por la derecha en escritorio y ocupa la pantalla por debajo de `md`. El título lleva la etiqueta de la fila: «Historial de Fiebre alta».
- **Accesibilidad de las acciones:**
  - las etiquetas son específicas de la fila, igual que las de editar y eliminar: `aria-label` «Ver historial de Fiebre alta» y «Restaurar Fiebre alta» (FE12b §3.7);
  - el `Badge` no depende solo del color: dice «Eliminado» en texto;
  - el `Switch` lleva `<Label>` asociado y se anuncia como interruptor;
  - al restaurar, el foco queda en la fila restaurada si sigue en la lista, o en el título de la lista si no.
- **Tema oscuro:** solo tokens (`bg-destructive/5`, variante de `Badge`), ningún color literal.

### 3.8 Claves i18n nuevas

En `es`, `en` y `nl`:

| Clave | `es` |
|---|---|
| `caseWizard.showInactive.label` | «Mostrar registros eliminados» |
| `caseWizard.showInactive.description` | «Incluye en las listas las filas eliminadas, para consultarlas o restaurarlas.» |
| `common.satelliteList.inactiveBadge` | «Eliminado» |
| `common.satelliteList.history` | «Ver historial de {{name}}» |
| `common.satelliteList.historyTitle` | «Historial de {{name}}» |
| `common.satelliteList.restore` | «Restaurar {{name}}» |
| `common.satelliteList.toast.restored` | «Registro restaurado» |
| `common.satelliteList.errors.alreadyActive` | «Este registro ya estaba restaurado.» |
| `notification.events.toast.restored` | «Evento restaurado. Si su posición estaba ocupada, pasa al final de la lista.» |

No se reutiliza `common.table.showInactive` («Mostrar inactivos»): en el expediente, lo que el usuario hizo fue «eliminar», y el toggle habla su idioma. La ruta exacta del prefijo `notification.events` se ajusta a la que ya usa `EventList` al implementar.

---

## 4. Plan de implementación

**1. Fábrica: listado con inactivos solo por padre.** En `createResource.ts`:

- `assertConfig` admite `'adminPath'` con `adminPath` **o** con `parent.adminSegment`. Si faltan los dos, sigue lanzando el error.
- `useList`, llamada con `includeInactive` sobre un recurso sin `adminPath`, lanza `createResource(<key>): useList with includeInactive requires adminPath`, en vez de pedir `undefined`.

*Verificación:* en `createResource.test.tsx`:

- un recurso con solo `parent.adminSegment` se construye sin error;
- con ADMIN e `includeInactive: true`, `useListByParent` pide `…/admin/investigation/:id`;
- con USER pide `…/investigation/:id`;
- `useList` con inactivos y sin `adminPath` lanza el error;
- los tests existentes siguen verdes.

**2. Declaraciones de los diez recursos.** En `notification/api.ts` e `investigation/api.ts`, cada uno pasa a `inactiveMode: 'adminPath'`:

- declara su `parent` (`operation`, `segment`, `adminSegment`), o añade solo el `adminSegment` a las cuatro que ya lo tienen;
- el comentario de cabecera cita los códigos `002B` y `005B` de §3.2;
- donde el comentario actual dice «no screen ever toggles inactive rows», se corrige.

*Verificación:* `npx tsc --noEmit -p tsconfig.app.json` limpio. Un test por archivo (`api.test.tsx`) comprueba, con MSW, que `useListByParent(id, { includeInactive: true })` con ADMIN pide la URL `002B` exacta de cada una de sus entidades, y que `useActivate` hace `PATCH …/activate/:id`.

**3. Helper `isAlreadyActiveError`.** En `shared/api/errorMessages.ts`: `/_005B_ALREADY_ACTIVE$/`, con la misma defensa ante `code` ausente que `isCaseClosedError`.

*Verificación:* test unitario con un código que coincide, uno que no y `code` ausente, que no lanza.

**4. `<SatelliteList>`: estado inactivo, «Historial» y «Restaurar».**

- Añadir `isRowInactive`, `onRestore`, `onShowHistory`, `getRowAppDetails` y `restoringId`, para deshabilitar la fila en vuelo.
- Pintar tinte y `Badge` en la tabla y en la tarjeta.
- En una fila inactiva, ocultar editar y eliminar.
- Poner el `Sheet` con `<AuditTrail>` dentro de la primitiva.

*Verificación:* en `SatelliteList.test.tsx`:

- sin las props nuevas, el DOM es el de hoy (el test existente no cambia);
- una fila inactiva muestra «Eliminado» y «Restaurar {{name}}», y no muestra editar ni eliminar;
- una activa no muestra «Restaurar»;
- «Ver historial de …» abre el `Sheet` con las entradas de `appDetails`, la más reciente primero;
- `appDetails: null` muestra `common.audit.empty`.

**5. `ShowInactiveSwitch` en los pasos 4 y 5.**

- Componente nuevo en `features/esaviCase/`: lee y escribe `searchParams.includeInactive`; al apagarse borra el parámetro; no se pinta por debajo de ADMIN.
- Se monta en `NotificationStep` e `InvestigationStep`, arriba del contenido.
- Se exporta `useShowInactive()`, que devuelve `includeInactive === 'true' && useCan(ADMIN)` y es lo que leen las listas.

*Verificación:*

- con ADMIN, el switch aparece en los pasos 4 y 5 y no en el 3 ni en el 6;
- encenderlo escribe `includeInactive=true` y apagarlo lo borra;
- con USER no aparece, y `useShowInactive()` devuelve `false` aunque la URL traiga `true`;
- cambiar de paso conserva el parámetro.

**6. Las cinco listas de la notificación.** En `EventList`, `VaccineList`, `MedicationList`, `MedicalHistoryList` y `PregnancyComplicationList`:

- con `useShowInactive()`, la tabla lee `useListByParent(parentId, { pageSize: 100, includeInactive: true })`;
- se pasan las cuatro props;
- `onRestore` llama a `useActivate()` y muestra el toast de éxito (en eventos, el suyo) o el de §3.5;
- «Restaurar» se omite con `readOnly` o por debajo de ADMIN;
- la consulta que alimenta la lógica del paso no cambia.

*Verificación:* en el test de cada lista, con MSW:

- con el toggle encendido y ADMIN, una fila inactiva del `002B` aparece con badge;
- «Restaurar» hace el `PATCH` y la fila se relee activa;
- un `409 *_005B_ALREADY_ACTIVE` muestra `alreadyActive` y relee;
- con `readOnly` no hay «Restaurar» pero sí «Historial» (con SUPERADMIN);
- con ADMIN no hay «Historial»;
- con el toggle apagado, la petición es la de hoy.

**7. Las cinco listas de la investigación.** Lo mismo en `TeamMemberList`, `NewbornConditionList`, `EvaluationInstitutionList`, `VaccineAdministeredList` y `DiagnosticList`, con `disabled` en el papel de `readOnly`. En `DiagnosticList`, sin `investigationId` la consulta `002B` no se lanza.

*Verificación:* los mismos casos del paso 6 en cada test. Además, `getPendingFields` de `InvestigationStep` (FE16) devuelve lo mismo con el toggle encendido que apagado, en un caso con una fila eliminada.

**8. i18n y cierre.**

- Las nueve claves de §3.8 en `es`, `en` y `nl`.
- `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json` y `npx vitest run`.
- Recorrido a mano, con ADMIN y USER, de un caso abierto y uno cerrado, en claro, en oscuro y a 375px.

*Verificación:* el test de paridad de claves (si existe) pasa; las tres órdenes terminan sin errores. El recurrente de `DiagnosticTermListPage` de la memoria de FE25b no cuenta como regresión si también falla en `main`.

---

## 5. Criterios de aceptación

**Funcionales:**

- [ ] Con ADMIN, en los pasos 4 y 5 aparece «Mostrar registros eliminados». En los pasos 1, 2, 3 y 6 no aparece.
- [ ] Al encenderlo, las diez listas muestran sus filas eliminadas mezcladas con las activas, en el orden del backend, y cada eliminada lleva tinte y `Badge` «Eliminado».
- [ ] El toggle se conserva al cambiar de paso y al recargar, porque está en la URL. Al apagarlo, `includeInactive` desaparece de la URL.
- [ ] Una fila eliminada ofrece «Restaurar» (y «Historial» con SUPERADMIN), y no ofrece editar ni eliminar.
- [ ] «Restaurar» devuelve la fila a activa sin diálogo de confirmación, muestra «Registro restaurado» y la fila pierde el badge sin recargar la página. En eventos, el toast es el suyo.
- [ ] Una fila restaurada vuelve a contar en la lógica del paso: aparece con el toggle apagado y la tienen en cuenta `getPendingFields` y completar etapa.
- [ ] Con dos pestañas abiertas, restaurar en una y después en la otra muestra «Este registro ya estaba restaurado.» y la segunda pestaña pinta la fila activa.
- [ ] «Historial» está en toda fila, activa o eliminada, solo con SUPERADMIN (`CONVENTIONS.md` §10.4). Con ADMIN o USER no se pinta.
- [ ] Con el caso cerrado (o una lista `disabled`), el toggle y «Historial» (SUPERADMIN) funcionan y «Restaurar» no se pinta.
- [ ] Con USER no hay toggle, y abrir el asistente con `?includeInactive=true` en la URL no muestra filas eliminadas ni lanza ninguna petición `…/admin/…`.
- [ ] Con el toggle apagado, las peticiones de red de los pasos 4 y 5 son exactamente las de antes de este spec.
- [ ] `NOTIFDIL`, `NOTIFPRG` y las satélites 1:1 no cambian.

**Bloque de cierre (`CONVENTIONS.md` §14):**

- [ ] **Una sola capa por dato.** El toggle vive solo en `searchParams`. Las filas, solo en TanStack Query. La fila del `Sheet` es un `useState` local, y no copia datos del servidor a ningún store.
- [ ] **Sin endpoints inventados.** Las veinte rutas del cliente nuevo son las de §3.2, y cada declaración cita su código `002B`/`005B`.
- [ ] **Roles reales.** El toggle y «Restaurar» se ocultan con `useCan(ROLE_LEVELS.ADMIN)`, el rol mínimo de los diez `002B` y los diez `005B`.
- [ ] **i18n.** Las nueve claves de §3.8 existen en `es`, `en` y `nl`. `grep` sin texto literal nuevo en JSX.
- [ ] **Tema oscuro.** El tinte, el badge, el `Sheet` y el switch se ven correctos en `dark`. `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/shared/components/SatelliteList.tsx src/features/notification/ src/features/investigation/ src/features/esaviCase/ShowInactiveSwitch.tsx` no devuelve resultados nuevos.
- [ ] **Responsividad.** A 375px, la tarjeta lleva badge, tinte y las dos acciones de 44px, y el `Sheet` ocupa la pantalla. No hay desbordamiento horizontal nuevo; el ya conocido del `Topbar` no cuenta.
- [ ] **Accesibilidad.** Las acciones llevan `aria-label` con el nombre de la fila, el switch tiene su `<Label>`, y el foco tras restaurar queda donde dice §3.7.
- [ ] **Tests.** Existen los de los pasos 1–7, y `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint` y `npx vitest run` pasan.

---

## 6. Decisiones tomadas y descartadas

- **Sí: un solo toggle para el expediente, en `searchParams.includeInactive`.** La pregunta del usuario es «qué se eliminó en este caso», no «qué se eliminó en esta lista». Un control y un dato en la URL, en vez de diez.
  - *Descartado:* un toggle por lista en la cabecera de `<SatelliteList>`. Serían diez controles, diez parámetros de URL y ruido en una pantalla ya densa.
- **Sí: solo en la cabecera del contenido de los pasos 4 y 5.** Son los únicos con listas.
  - *Descartado:* ponerlo en la cabecera global del asistente, donde se vería en cuatro pasos en los que no hace nada.
- **Sí: con el toggle encendido, el `002B` sustituye a la lista de pantalla, pero la lógica del paso sigue leyendo la consulta de hoy.** Son dos preguntas distintas, «qué mostrar» y «qué cuenta para completar», con dos claves distintas.
  - *Descartado:* una segunda tabla «Eliminados», que duplicaría la primitiva en cada lista.
  - *Descartado también:* alimentar la lógica del paso con el `002B` filtrado en el cliente, que haría depender `getPendingFields` de un toggle de vista.
- **Sí: el mecanismo genérico va en la fábrica y en `<SatelliteList>`, no en diez componentes.** Las diez entidades comparten contrato: `002B` por padre, `005B`, ADMIN en ambos.
  - *Descartado:* hooks `useXxxAdminByParent` escritos a mano, uno por entidad.
- **Sí: `assertConfig` acepta `'adminPath'` con solo `parent.adminSegment`.** Es el cambio mínimo que deja pasar estas diez declaraciones sin inventar un `adminPath` global que no existe.
  - *Descartado:* un tercer `InactiveMode` (`'parentAdminPath'`), que añadiría una rama a toda la fábrica para lo que es la misma semántica.
- **Sí: «Historial» solo desde SUPERADMIN.** Lo impone `CONVENTIONS.md` §10.4, que está por encima de los specs (§1): la auditoría es información del sistema y no admite excepción por entidad.
  - *Descartado (2026-09-29):* «Historial» para todos los roles, que contradecía §10.4.
- **Sí: el `Sheet` de historial vive dentro de `<SatelliteList>`.**
  - *Descartado:* que cada lista abra el suyo, lo que daría diez copias del mismo `Sheet`.
- **Sí: «Restaurar» sin diálogo de confirmación.** Es reversible: la fila se puede volver a eliminar. Además, restaurar no destruye nada.
  - *Descartado:* un `AlertDialog` como el de eliminar, que añadiría un clic sin reducir ningún riesgo.
- **Sí: en solo lectura se ven las eliminadas y su historial, pero no se restaura.** Consultar no es escribir, y el backend rechaza `005B` con el caso cerrado (F61). Ocultar la acción evita un `409` seguro.
- **Sí: errores por sufijo** (`isAlreadyActiveError`), como `isCaseClosedError` en FE17.
  - *Descartado:* treinta entradas en `errorMessages.ts` para diez entidades con el mismo texto.
- **Sí: el toast de eventos va en condicional.** El backend solo mueve el `sortOrder` si hay colisión, y el cliente no lo sabe.
  - *Descartado:* comparar el orden antes y después para decidir el texto. Es más código para un matiz que el condicional ya cubre.
- **Sí: `NOTIFDIL` fuera.** Es una lista anidada en el diálogo de vacuna, no usa `<SatelliteList>`, y obligaría a llevar el toggle hasta un diálogo.
- **Sí: el texto es «Mostrar registros eliminados»**, y no el «Mostrar inactivos» común. En el expediente, la acción que el usuario conoce es «Eliminar».

---

## 7. Riesgos identificados

- **Más de 100 filas en un `002B`.** Las listas piden una sola página de 100, el máximo del backend. Una lista con más filas, contando eliminadas, perdería las últimas en silencio.
  - *Mitigación:* si `count > rows.length`, la lista pinta una nota `role="status"` («Se muestran las primeras 100 filas»). No hace falta clave nueva si se reutiliza una existente de `<ResourceTable>`; si no la hay, se añade al implementar. No se construye paginación para un caso que hoy no existe.
- **`serverDecides` → `adminPath` cambia la clave de caché de `useListByParent`** en las cuatro entidades que ya lo usaban con `002A`: ahora `includeInactive` forma parte de la clave. Los tests de esas cuatro listas que siembran la caché a mano pueden fallar.
  - *Mitigación:* ajustar la clave en esos tests. Es un cambio de forma, no de comportamiento.
- **Un ADMIN degradado a USER a mitad de sesión** conserva el toggle hasta que se relea su perfil, y el `002B` responderá `403`. La lista muestra su bloque de error, sin romper el paso. Es aceptable.
- **Test intermitente conocido de `DiagnosticTermListPage`** (FE25b). Si falla con la suite completa, se comprueba en `main` antes de atribuirlo a este spec.

---

## 8. Impacto en pantallas existentes

| Archivo | Hoy | Después |
|---|---|---|
| `shared/api/createResource.ts` | `'adminPath'` exige `adminPath` | También vale `parent.adminSegment` |
| `shared/api/errorMessages.ts` | Sin helper por sufijo de `005B` | `isAlreadyActiveError` |
| `shared/components/SatelliteList.tsx` | Filas activas, con editar y eliminar | Además, estado inactivo, «Historial» y «Restaurar», con props opcionales: sin ellas, igual que hoy |
| `features/notification/api.ts` e `investigation/api.ts` | Diez recursos `serverDecides`, seis sin `parent` | `'adminPath'` con `parent` completo |
| Las diez listas | Solo activas | Activas o `002B` según el toggle; historial en todas las filas con SUPERADMIN |
| `NotificationStep` e `InvestigationStep` | — | Montan `ShowInactiveSwitch` |
| Resto de consumidores de `<SatelliteList>` (la lista de `NotificationStep`) | — | Sin cambios |

---

## Lo que **no** está en este spec

- Mostrar y restaurar diluyentes (`NOTIFDIL`), que queda como seguimiento.
- Restaurar el bloque de embarazo (`NOTIFPRG`), que depende de un `002B` que el backend no tiene.
- El historial de las satélites 1:1 y de las cabeceras de etapa.
- La purga física (`005C`).
- Mostrar eliminados o auditoría en `EsaviCaseDetailPage`.
- El `Badge` que falta en la bandeja de FE24.
- Un filtro de «solo eliminados».
- La paginación de las listas del expediente.

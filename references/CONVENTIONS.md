# Convenciones de código — esavi-frontend

> **Estado:** Norma vinculante
> **Fecha:** 2026-08-31
> **Contraparte:** `esavi-backend/references/CONVENTIONS.md`

Este documento manda sobre cualquier archivo de este repositorio que lo contradiga. `ARCHITECTURE.md` explica **por qué** se decidió cada cosa; este documento dice **cómo se escribe**. Cuando ambos hablen del mismo tema, `ARCHITECTURE.md` es el razonamiento y éste es la regla aplicable.

Sobre el contrato con el backend manda `esavi-backend/references/CONVENTIONS.md`. Este repositorio no puede relajar nada de allí.

---

## 1. Jerarquía de normas

Cuando dos fuentes se contradigan, gana la de más arriba:

| # | Fuente | Qué gobierna |
|---|---|---|
| 1 | `esavi-backend/references/CONVENTIONS.md` | El contrato: códigos, envelope, roles, update diferencial |
| 2 | `esavi-backend/references/functional/specs/NN-slug.md` | El comportamiento de cada entidad |
| 3 | Este documento | Cómo se escribe el cliente |
| 4 | `references/specs/NN-slug.md` (`SPEC FE01`…) | Qué se construye en cada cambio |
| 5 | `ARCHITECTURE.md` | El porqué de cada decisión |
| 6 | El código existente | Nada. Si contradice lo anterior, es deuda |

**Una pantalla que no cuadra con lo que devuelve la API no se arregla en el cliente.** La respuesta está en el spec de esa entidad.

---

## 2. Idioma

| Qué | Idioma |
|---|---|
| Identificadores, archivos, carpetas, comentarios en código | **Inglés** |
| Claves i18n | **Inglés** (`esaviCase.list.emptyState`) |
| Textos visibles al usuario | **Español**, y siempre a través de i18n — nunca literales en el JSX |
| Explicaciones, planes, mensajes de commit | **Español** |

**Ningún texto visible se escribe literal en un componente.** Ni un título, ni un placeholder, ni un `aria-label`, ni el texto de un botón. La regla no admite «esto es provisional»: un literal suelto no aparece en `i18n:check` y sobrevive a producción.

---

## 3. Estructura de directorios

Es la de `ARCHITECTURE.md` §9 y no se improvisa una alternativa:

```
src/
├── app/          router.tsx, providers.tsx, layout/
├── shared/       api/, components/, stores/, hooks/, config/
├── features/     una carpeta por dominio
└── contracts/    tipos espejo del backend
```

### Reglas de ubicación

- **`features/<entity>/` es el destino por defecto.** Un componente nace en su feature. Sube a `shared/` sólo cuando lo consuma una **segunda** feature, y en ese momento se mueve — no se copia.
- **No existe un `components/` global de propósito general.** `shared/components/` sólo contiene las primitivas declaradas en `ARCHITECTURE.md` §4.3 y la carpeta `ui/` de shadcn.
- **Una feature no importa de otra feature.** Si `investigation` necesita algo de `esaviCase`, ese algo pertenece a `shared/` o a `contracts/`. La única excepción son los tipos de `contracts/`, que los importa quien quiera.
- **`contracts/` no se edita a mano** más allá de lo que traiga `npm run contracts:sync`. Es un espejo, no un lugar donde añadir tipos propios; los tipos del cliente viven en su feature.

---

## 4. Nomenclatura

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpeta de feature | camelCase, **igual que la entidad del backend** | `features/esaviCase/` |
| Componente (archivo y export) | PascalCase, el archivo se llama como lo que exporta | `EsaviCaseFilters.tsx` |
| Página | PascalCase con sufijo `Page` | `EsaviCaseListPage.tsx` |
| Hook | camelCase con prefijo `use` | `useEsaviCaseFilters.ts` |
| Store de Zustand | camelCase con sufijo `Store` | `preferencesStore.ts` |
| Utilidad, api, schemas | camelCase | `api.ts`, `schemas.ts`, `formatDate.ts` |
| Tipo e interfaz | PascalCase, **sin prefijo `I`** | `EsaviCase`, `TokenStore` |
| Constante de módulo | `CONSTANT_CASE` | `ROLE_LEVELS` |
| Clave i18n | camelCase con puntos | `esaviCase.filters.dateFrom` |
| Clave de caché de Query | ver §6.3 | `['esaviCase', 'list', filters]` |

**Excepción declarada:** `shared/components/ui/` conserva el kebab-case de shadcn (`data-table.tsx`, `alert-dialog.tsx`). Esos archivos los genera su CLI y renombrarlos rompe cada actualización. La excepción **no se extiende** a componentes propios que se guarden ahí.

**El nombre de la entidad se copia del backend, no se traduce ni se pluraliza.** `esaviCase`, `healthFacility`, `catalogItem`, `notificationVaccine`. La ruta HTTP sí va en kebab y plural (`esavi-cases`), pero eso vive dentro de `api.ts` y en ningún otro sitio.

### Un export por archivo de componente

Cada archivo `.tsx` exporta **un** componente con `export function`. Nada de `export default`: el default permite renombrar en el import y se pierde la trazabilidad al buscar. Los subcomponentes privados de un archivo no se exportan.

---

## 5. Regla de oro — los seis artefactos por entidad

Añadir una entidad genera **seis** artefactos, en este orden. Ninguno es opcional:

```
tipos → declaración del recurso → schemas → páginas → ruta → navegación
```

| # | Artefacto | Archivo | Qué contiene |
|---|---|---|---|
| 1 | Tipos del contrato | `contracts/<entity>.ts` | Entidad y DTOs, espejo del backend (§9) |
| 2 | Declaración del recurso | `features/<entity>/api.ts` | Un solo `createResource<…>({ … })` |
| 3 | Schemas Zod | `features/<entity>/schemas.ts` | `createSchema` y `updateSchema` |
| 4 | Páginas | `features/<entity>/<Entity>ListPage.tsx`, `<Entity>DetailPage.tsx` | Listado y detalle |
| 5 | Ruta | `app/router.tsx` | La ruta envuelta en `<RequireRole level={…}>` |
| 6 | Navegación | `shared/config/navigation.ts` | El `NavItem` con su `minLevel` |

**Más las claves i18n de la entidad**, completas en los tres idiomas (`es`, `en`, `nl`).

Entregar una entidad sin schemas, sin guard de rol o sin claves i18n en los tres idiomas no se acepta. Una entidad **no** genera: cliente HTTP propio, hooks de CRUD escritos a mano, ni tipos duplicados de los que ya están en `contracts/`.

### El nivel de rol sale de `API-ROUTES.md`

El `minLevel` del `NavItem` y el `level` del `<RequireRole>` son el **rol mínimo real de la ruta**, copiado de `API-ROUTES.md`. Inventarlo produce una de dos cosas: un menú que ofrece pantallas que devuelven `403`, o pantallas escondidas a quien sí puede verlas.

---

## 6. La capa de API

### 6.1 Nada de axios fuera de `shared/api/client.ts`

Ningún componente, hook o feature importa `axios`. Todo pasa por el cliente configurado, que es el único que sabe del envelope, del `Authorization`, del `?lang=` y de la cola de refresh.

**Prohibido escribir `response.data.data`.** El interceptor ya desenvuelve `data`. Si aparece ese patrón, el cliente está mal configurado o alguien esquivó el interceptor.

### 6.2 Los errores son `EsaviApiError`

El interceptor convierte `{ ok: false, … }` en un `EsaviApiError` que conserva `code` y `status`.

- **El toast se decide por `code`**, nunca parseando `message`. El `code` (`HFAC_001_CREATION_FAILED`) es estable; el texto está traducido y cambia.
- **`errors` no se muestra jamás al usuario.** Es material de depuración y en producción vale `'Internal server error'`.
- `message` viene ya traducido por el backend en el idioma de `?lang=`. No se vuelve a traducir ni se concatena con texto propio.

### 6.3 Claves de caché

Siempre array, siempre en este orden — entidad, operación, argumento:

```ts
['esaviCase', 'list', filters]
['esaviCase', 'detail', id]
['catalogItem', 'byType', typeId]
```

La primera posición es **el nombre de la entidad tal como está en el backend**. Es lo que hace que una invalidación por entidad funcione sin enumerar claves.

`staleTime` por naturaleza del dato: **catálogos** (`catalogType`, `catalogItem`, `geoLocation`, `diagnosticTerm`, `whodrugVaccine`) 30 minutos o más; **casos, pacientes y todo lo del expediente**, se invalidan tras cada mutación.

### 6.4 Cita el código de operación

Toda llamada al backend lleva el código `ESAVI-<ENTIDAD>-<NNN>` en un comentario, en la declaración del recurso o en el hook que la envuelve:

```ts
// ESAVI-CASEFLOW-006 — estado del expediente + exists/id por satélite
const { data } = useCaseWorkflowByCase(caseId);
```

Es lo que permite cruzar un error del cliente con los logs del backend sin adivinar qué endpoint se llamó.

### 6.5 Lo que no se hace en el cliente

- **No se calcula el diff antes de un `PUT`.** Se envía el objeto completo: el backend escribe sólo lo que cambió de verdad y no ensucia el historial. Calcularlo en el cliente da peor resultado, porque compara contra lo que el cliente cree que había.
- **No se leen roles del JWT.** El payload sólo lleva `userId`. El rol efectivo es el que devuelve el login y el que el backend recarga en cada petición.
- **No se elige `002A` o `002B` a mano.** Lo decide `createResource` según el nivel de rol y el toggle de «mostrar inactivos».
- **No se filtra ni se pagina en memoria.** Todos los listados son paginados en servidor con `limit`/`offset`.

### 6.6 Refresh: un solo refresco en vuelo

El backend rota el refresh token y **detecta la reutilización** (SPEC F42): presentar un token ya consumido revoca todas las sesiones del usuario. Consecuencias que no son negociables:

1. La cola de refresh vive en `client.ts` y es la única que llama a `POST /api/auth/refresh`.
2. Se guarda **siempre** el token nuevo de la respuesta; el anterior ya no vale.
3. Ante `AUTH_002_REFRESH_TOKEN_REUSED` se va al login. **No se reintenta.**
4. El acceso al token pasa por la interfaz `TokenStore`. Ningún módulo llama a `localStorage` para tokens.

---

## 7. Estado — cada dato en una sola capa

| Dato | Capa | Nunca en |
|---|---|---|
| Filtros, paginación, orden | `searchParams` de la URL | Un store, `useState` |
| Casos, pacientes, catálogos, todo lo remoto | TanStack Query | Un store de cliente |
| Tema, idioma, densidad, `pageSize`, columnas | `preferencesStore` (persistido) | La URL |
| Sidebar, drawer, sección abierta | `uiStore` | La URL, el servidor |
| Lo tecleado en el paso actual del wizard | `draftsStore` | Cualquier otro sitio |

**Los casos y los pacientes no son estado de cliente.** Un `useState` que copia datos de una query es el bug de sincronización clásico y no pasa revisión.

**`draftsStore` no es el almacén del progreso.** Guarda sólo lo tecleado entre el último guardado y el siguiente, y **se borra en cuanto el `PUT` responde**. El progreso vive en la base, en filas reales (`ARCHITECTURE.md` §3.4).

### El wizard escribe en los endpoints reales

`POST` en el primer paso de cada etapa, `PUT /:id` en los siguientes. Para saber cuál toca se llama a `ESAVI-CASEFLOW-006`, que devuelve `exists` e `id` por satélite en una sola petición. **No se deduce del estado local** ni se intenta un `POST` para ver si falla.

**El primer paso del wizard recoge `notificationType` y `esaviDescription`**, porque son los dos `NOT NULL` de la cabecera: antes de tenerlos no hay fila que guardar.

---

## 8. Formularios y validación

- **React Hook Form + Zod, siempre.** Nada de formularios controlados a mano.
- El schema Zod vive en `features/<entity>/schemas.ts` y se deriva de los validadores del backend, no de lo que parezca razonable. Si el backend acepta nulo, el schema acepta nulo.
- **Los errores del backend se mapean al campo correspondiente**, no a un toast genérico. Un `409` de duplicado marca el campo duplicado.
- **Las fechas se envían como `YYYY-MM-DD`.** Las columnas son `date`, no `timestamp`; date-fns formatea, y no se manda un ISO completo ni se convierte a UTC.
- **La validación del cliente no reemplaza a la del servidor.** Sirve para no gastar un viaje, nada más.

### Filtros de casos (SPEC F48)

El formulario de filtros **debe impedir** combinar fecha exacta y rango sobre la misma columna: el validador devuelve `400`. La exclusión es **por columna** — `reportDate` exacta con `eventDateFrom` en rango es válido y frecuente. `From` nunca posterior a `To`. `geoLocationId` es siempre jerárquico e incluye descendientes; no existe modo estricto.

---

## 9. Contratos y tipos

- Los tipos de petición y respuesta se copian del backend a `contracts/` con `npm run contracts:sync`. **Se revisan en el diff**; un cambio de contrato tiene que verse.
- **Ningún `any` en el límite con la API.** Si el tipo no existe todavía, se escribe en `contracts/` y se anota su origen en el backend.
- **Ningún tipo del contrato se redefine en una feature.** Se importa.
- Los tipos derivados del cliente (estado de un formulario, props) viven en la feature y no van a `contracts/`.

---

## 10. UI

### 10.1 Tokens, nunca colores literales

**Ningún color literal en los componentes.** Ni `bg-slate-800`, ni `#1e293b`, ni `text-white`. Sólo tokens semánticos: `background`, `foreground`, `card`, `primary`, `muted-foreground`, `border`, `destructive`.

Un literal suelto rompe el tema oscuro exactamente en ese punto y nadie lo nota hasta producción. La regla también cubre los SVG y los estilos inline.

El tema se aplica con `data-theme="light|dark"` en `<html>` — no con la clase `dark`. Tres estados: `light`, `dark` y `system`, con `system` por defecto y suscripción viva a `matchMedia`.

### 10.2 Responsividad

Mobile-first, sin excepción:

- **Las tablas colapsan a tarjetas por debajo de `md`**, dentro de `<ResourceTable>`. El scroll horizontal no es la respuesta.
- El wizard va a **una columna en móvil**, con los pasos en acordeón y la barra de acciones fija abajo.
- `dvh`, nunca `vh`.
- Objetivos táctiles de **44px** como mínimo.
- Toda tabla ancha va dentro de un contenedor con `overflow-x: auto`. **El body nunca hace scroll horizontal.**

### 10.3 Accesibilidad

- Se usan los primitivos de Radix vía shadcn antes que reimplementar un menú, un diálogo o un combo. Traen foco, teclado y ARIA resueltos.
- Todo control interactivo es alcanzable con teclado y tiene foco visible. **No se elimina el outline** sin sustituirlo.
- Los `aria-label` pasan por i18n como cualquier otro texto.
- Los iconos decorativos llevan `aria-hidden`; un icono que es el único contenido de un botón exige `aria-label`.

### 10.4 Las primitivas se escriben una vez

`<ResourceTable>`, `<ResourceForm>`, `<CatalogSelect>`, `<GeoLocationPicker>` y `<AuditTrail>` son de `shared/`. Si una feature necesita una variante, se añade una prop a la primitiva; **no se hace una copia local**. Con ~45 entidades, cada copia es un error que se arrastra 45 veces.

Toda entidad tiene `appDetails`, así que **toda pantalla de detalle lleva `<AuditTrail>`**.

### 10.5 El menú es dato

`shared/config/navigation.ts` es un array de `NavItem` tipado, con `key` de i18n —nunca texto literal— y `minLevel`. De ahí salen a la vez el sidebar, el filtro por rol y la paleta de comandos. **Un enlace escrito a mano en el JSX del sidebar no existe para la paleta de comandos.**

La sección activa se deriva de la ruta. No hay estado aparte que la duplique.

### 10.6 Skills de diseño antes de generar interfaz

**Norma vinculante para el agente, no sólo para el código.** Antes de escribir o modificar cualquier componente visual —una pantalla, un formulario, un diálogo, el layout— se cargan estas skills:

| Skill | Cuándo |
|---|---|
| `ui-ux-pro-max` | Al diseñar la pantalla: composición, tipografía, color, patrones de interacción. Antes de escribir JSX. |
| `ui-styling` | Al implementar con shadcn/ui + Tailwind — el stack decidido de este repositorio (`ARCHITECTURE.md` §2). |
| `web-design-guidelines` | Al cerrar el componente, como revisión contra las Web Interface Guidelines antes de darlo por terminado — se suma al checklist de §14. |

Condicionalmente, según lo que la pantalla exija:

- **`frontend-design`** — cuando hace falta una decisión estética no cubierta por los tokens ya establecidos (una pantalla nueva de alta visibilidad, no un CRUD más sobre `<ResourceTable>`).
- **`dataviz`** — cualquier gráfico, panel o visualización de datos. El hito 5 (`ARCHITECTURE.md` §12, "Panel y analítica") lo necesitará.

**Esto no sustituye a `references/CONVENTIONS.md` ni a `ARCHITECTURE.md`.** Las skills informan composición y accesibilidad genéricas; las convenciones de este repositorio —tokens semánticos, cero color literal, i18n obligatorio, las primitivas de §10.4 escritas una sola vez— mandan cuando hay conflicto, igual que dicta la jerarquía de normas de §1.

---

## 11. Autorización en el cliente

`ROLE_LEVELS` se replica: `SUPERADMIN 100 > ADMIN 50 > USER 25 > ANALYTICS 10`. `useCan()` y `<RequireRole>` son los únicos consumidores.

**Esto es experiencia de usuario, no seguridad.** Oculta lo que el usuario no puede hacer para que no lo intente. El backend sigue siendo la única autoridad, así que:

- Una comprobación de rol **nunca** sustituye a la respuesta del servidor. Un `403` se maneja igual aunque «no debería pasar».
- Nunca se oculta un dato sensible sólo con un `useCan()`. Si el usuario no debe verlo, no debe llegar al cliente.

---

## 12. Tests

Vitest + Testing Library + MSW. Los handlers de MSW **simulan el envelope exacto** `{ ok, message, data }` y los errores con su `code`; un mock que devuelve el objeto pelado prueba algo que no existe.

Qué se testea, por orden de valor:

1. **`client.ts`** — desenvoltura del envelope, `EsaviApiError` con su `code`, y **la cola de refresh: dos peticiones con `401` simultáneas producen un solo refresh**. Es el test más importante del repositorio.
2. **`createResource`** — elección de `002A`/`002B` según rol, invalidaciones tras mutar.
3. **Las primitivas de `shared/components/`** — se escriben una vez y las heredan 45 entidades.
4. **Reglas de negocio del cliente** — exclusión exacta/rango de los filtros F48, guards de rol, transiciones del wizard.

No se testea el CRUD generado de cada entidad una por una: se testea la fábrica.

Se testea **comportamiento observable**, con queries accesibles (`getByRole`, `getByLabelText`). Nada de asertar sobre estado interno ni sobre clases de Tailwind.

---

## 13. Comandos

El scaffold debe exponer, como mínimo:

```bash
npm run dev              # vite
npm run build            # tsc --noEmit && vite build
npm run lint             # eslint src/            (--fix via lint:fix)
npm run test             # vitest run
npm run format           # prettier --write .     (--check via format:check)
npm run i18n:check       # paridad de claves es/en/nl
npm run contracts:sync   # reimporta tipos desde ../esavi-backend/src/types
npm run check            # build && lint && i18n:check && test
```

`npm run check` es la puerta antes de cerrar un cambio, igual que en el backend.

---

## 14. Checklist antes de cerrar

- [ ] Se cargaron `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` antes de generar la interfaz (§10.6).
- [ ] Los **seis artefactos** están, y las claves i18n en **los tres** idiomas.
- [ ] El `minLevel` del `NavItem` y el `level` del `<RequireRole>` coinciden con `API-ROUTES.md`.
- [ ] El código `ESAVI-*` aparece citado donde se consume el endpoint.
- [ ] Ningún color literal, ningún texto literal visible, ningún `any` en el límite con la API.
- [ ] Ningún `response.data.data`, ningún `axios` importado fuera de `client.ts`, ningún `localStorage` de tokens fuera de `TokenStore`.
- [ ] Los filtros van en `searchParams`; nada remoto copiado a `useState` o a un store.
- [ ] Se probó por debajo de `md`: la tabla colapsa a tarjetas y el body no hace scroll horizontal.
- [ ] Se probó en tema oscuro.
- [ ] Se probó con un rol bajo (`USER` o `ANALYTICS`), no sólo con `SUPERADMIN`.
- [ ] `npm run check` pasa.

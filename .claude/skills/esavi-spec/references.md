# Ficha de consulta — datos del repositorio para escribir specs

Resumen de dónde vive cada dato, para no releer 40 KB de documentación en cada spec. **No sustituye a las fuentes**: cuando necesites una tabla exacta, ábrela.

---

## 1. Mapa de fuentes

### En este repositorio

| Necesito saber… | Fuente |
|---|---|
| Jerarquía de normas cuando dos fuentes se contradicen | `references/CONVENTIONS.md` §1 |
| Nomenclatura de archivos, carpetas y símbolos | §4 |
| **Los seis artefactos obligatorios por entidad** | §5 |
| Reglas de la capa de API (cliente, errores, caché, códigos) | §6 |
| **Capas de estado: qué dato vive dónde** | §7 |
| Formularios, Zod, fechas, filtros F48 | §8 |
| Contratos y tipos | §9 |
| UI: tokens, responsividad, accesibilidad, primitivas, menú | §10 |
| Autorización en el cliente | §11 |
| Tests | §12 |
| Comandos del scaffold | §13 |
| Checklist antes de cerrar | §14 |
| El porqué de cada decisión | `references/ARCHITECTURE.md` |
| Envelope, auth, paginación, idioma, auditoría | `references/API-CONTRACT.md` |
| **Las 323 rutas con rol mínimo y código de operación** | `references/API-ROUTES.md` |
| Entidades y cómo se conectan | `references/DOMAIN-MODEL.md` |
| Specs de este repositorio (`SPEC FE01`…) | `references/specs/NN-slug.md` |

### En el backend

| Necesito saber… | Fuente |
|---|---|
| La norma vinculante del contrato | `esavi-backend/references/CONVENTIONS.md` |
| **El porqué del comportamiento de una entidad** | `esavi-backend/references/functional/specs/NN-slug.md` |
| Reglas transversales del backend (`SPEC 01`–`09`) | `esavi-backend/references/specs/` |
| El DDL autoritativo, con nulabilidad y constraints | `esavi-backend/esaviapp.sql` |
| Los tipos que se copian a `contracts/` | `esavi-backend/src/types/` |
| Las claves i18n del servidor | `esavi-backend/src/data/i18n/{es,en,nl}.json` |

**Cuando una pantalla no cuadre con lo que devuelve la API, la respuesta está en el spec de esa entidad**, no en el cliente.

---

## 2. Numeración de specs — tres series, tres prefijos

| Serie | Ubicación | Cita | Ejemplo |
|---|---|---|---|
| Frontend (ésta) | `references/specs/` | `SPEC FE01` | `SPEC FE03 — Listado de casos` |
| Backend funcional | `esavi-backend/references/functional/specs/` | `SPEC F01` | `SPEC F48 — Filtros de casos` |
| Backend técnico | `esavi-backend/references/specs/` | `SPEC 01` | `SPEC 05 — Códigos de operación` |

**Cita siempre el prefijo.** `SPEC 05` y `SPEC FE05` son documentos distintos en repositorios distintos, y el backend ya llega al `F49`.

---

## 3. Specs del backend que más se consultan al diseñar pantallas

| Spec | Qué resuelve | Cuándo lo necesitas |
|---|---|---|
| `SPEC F44` — case-workflow | Estado del expediente y `ESAVI-CASEFLOW-006` con `exists`/`id` por satélite | Al diseñar cualquier paso del wizard |
| `SPEC F48` — esavicase-date-geo-filters | Los 13 filtros, sus exclusiones y el alcance jerárquico de `geoLocationId` | Al diseñar el listado de casos |
| `SPEC F49` — esavicase-geo-scope | Qué casos ve cada usuario según su cobertura geográfica | Al decidir qué se muestra por rol |
| `SPEC F42` — auth-refresh-token | Rotación y detección de reutilización | Al tocar la sesión o la cola de refresh |
| `SPEC F43` — auth-password-reset | Flujo de recuperación y sus limitadores | Al construir las pantallas públicas |
| `SPEC F12` — differential | El update diferencial | Al diseñar cualquier formulario de edición |
| `SPEC F45` / `F47` — patient-name | Búsqueda y modelo del nombre del paciente | Al construir un selector de pacientes |
| `SPEC F11` — age-recalculation | La edad se recalcula en el servidor | Al mostrar edad: no la calcules en el cliente |

La lista completa está en `esavi-backend/references/functional/specs/` — 49 specs a la fecha.

---

## 4. Los seis artefactos por entidad

Norma: `references/CONVENTIONS.md` §5. Orden fijo, ninguno opcional:

```
tipos → declaración del recurso → schemas → páginas → ruta → navegación
```

| # | Artefacto | Archivo |
|---|---|---|
| 1 | Tipos del contrato | `src/contracts/<entity>.ts` |
| 2 | Declaración del recurso | `src/features/<entity>/api.ts` |
| 3 | Schemas Zod | `src/features/<entity>/schemas.ts` |
| 4 | Páginas | `src/features/<entity>/<Entity>ListPage.tsx`, `<Entity>DetailPage.tsx` |
| 5 | Ruta con guard | `src/app/router.tsx` |
| 6 | Entrada de menú | `src/shared/config/navigation.ts` |

**Más las claves i18n en los tres idiomas.**

Una entidad **no** genera cliente HTTP propio, ni hooks de CRUD a mano, ni tipos duplicados de `contracts/`.

---

## 5. Códigos de operación y roles

Formato: `ESAVI-<ENTIDAD>-<NNN>[A|B]`. Numeración fija del backend:

| Código | Operación | HTTP | Ruta | Rol mínimo |
|---|---|---|---|---|
| `001` | create | POST | `/` | ADMIN |
| `002` | list único | GET | `/` | USER |
| `002A` | list público (solo activos) | GET | `/` | USER |
| `002B` | list admin (incluye inactivos) | GET | `/admin` | ADMIN |
| `003` | getById | GET | `/:id` | USER |
| `004` | update | PUT | `/:id` | ADMIN |
| `005A` | soft delete | DELETE | `/:id` | ADMIN |
| `005B` | activate | PATCH | `/activate/:id` | SUPERADMIN |

**Son valores típicos, no garantizados.** El rol mínimo real de cada ruta está en `references/API-ROUTES.md`, y de ahí —no de esta tabla— salen el `minLevel` del `NavItem` y el `level` del `<RequireRole>`.

`ROLE_LEVELS`: `SUPERADMIN 100 > ADMIN 50 > USER 25 > ANALYTICS 10`. `validateUserRole(X)` significa **nivel ≥ nivel(X)**, no igualdad.

**El código se cita en el cliente que consume el endpoint**, en la declaración del recurso o en el hook. Es lo que permite cruzar un error del cliente con los logs del backend.

Códigos de `AppError` que el cliente ve y usa para decidir el toast: `CREATION_FAILED`, `FETCH_FAILED`, `UPDATE_FAILED`, `DELETE_FAILED`, `ACTIVATION_FAILED`, `NOT_FOUND`, `CODE_EXISTS`, `ALREADY_ACTIVE`, `ALREADY_INACTIVE`, `<FK>_NOT_FOUND`. Más `AUTH_002_REFRESH_TOKEN_REUSED`, que es el único que obliga a ir al login sin reintentar.

---

## 6. Estado — la tabla que decide

Norma: `references/CONVENTIONS.md` §7. **Cada dato vive en una sola capa.**

| Dato | Capa | Nunca en |
|---|---|---|
| Filtros, paginación, orden, toggle de inactivos | `searchParams` | Un store, `useState` |
| Casos, pacientes, catálogos, todo lo remoto | TanStack Query | Un store de cliente |
| Tema, idioma, densidad, `pageSize`, columnas | `preferencesStore` (persistido) | La URL |
| Sidebar, drawer, sección abierta | `uiStore` | La URL, el servidor |
| Lo tecleado en el paso actual del wizard | `draftsStore` | Cualquier otro sitio |
| Diálogo abierto, foco, hover | `useState` del componente | Un store global |

Claves de caché — siempre array, siempre entidad → operación → argumento:

```ts
['esaviCase', 'list', filters]
['esaviCase', 'detail', id]
['catalogItem', 'byType', typeId]
```

`staleTime`: catálogos (`catalogType`, `catalogItem`, `geoLocation`, `diagnosticTerm`, `whodrugVaccine`) 30 minutos o más; casos, pacientes y expedientes se invalidan tras cada mutación.

---

## 7. Primitivas compartidas — se citan, no se reinventan

Un spec que necesite una de éstas la cita; si necesita una variante, propone **una prop nueva**, nunca una copia local. Con ~45 entidades, cada copia es un error que se arrastra 45 veces.

| Primitiva | Qué resuelve |
|---|---|
| `<ResourceTable>` | Paginación en servidor, estado vacío, carga, toggle de inactivos, colapso a tarjetas en móvil |
| `<ResourceForm>` | React Hook Form + Zod, con los errores del backend mapeados a campos |
| `<CatalogSelect typeCode>` | Combo que resuelve `catalogItem` por `catalogType` |
| `<GeoLocationPicker>` | Cascada jerárquica sobre `geoLocation` |
| `<AuditTrail>` | Lector del `appDetails` de cualquier fila — **toda pantalla de detalle lo lleva** |
| `<RequireRole level>` / `useCan()` | Guard y predicado de rol (UX, no seguridad) |
| `createResource(...)` | La fábrica: `useList`, `useOne`, `useCreate`, `useUpdate`, `useDeactivate`, `useActivate` |

Fuente: `ARCHITECTURE.md` §4.3 y `CONVENTIONS.md` §10.4.

---

## 8. Orden de construcción — `ARCHITECTURE.md` §12

| # | Hito | Qué valida |
|---|---|---|
| 1 | Shell y autenticación | Login, cola de refresh, guard por rol, layout, sidebar, tema, preferencias |
| 2 | Catálogos | `catalogType`, `catalogItem`, `geoLocation`, `healthFacility` — validan la capa genérica |
| 3 | Casos ESAVI | Listado con los 13 filtros de F48, detalle, pacientes |
| 4 | Notificación e investigación | El wizard multipaso |
| 5 | Panel y analítica | Al final; probablemente pide un endpoint de agregados que hoy no existe |

**El hito 1 es el que más decide** y es un spec transversal, no de entidad. Si la fábrica de recursos y las primitivas salen bien ahí, los hitos 2 y 3 son configuración; si salen mal, el error se arrastra 45 veces.

Los grupos del menú (`ARCHITECTURE.md` §5.2): Casos · Notificación · Investigación · Catálogos clínicos · Geografía y unidades · Administración.

---

## 9. Comandos de verificación

| Comando | Qué comprueba |
|---|---|
| `npm run build` | `tsc --noEmit` y build de Vite |
| `npm run lint` | ESLint sobre `src/` |
| `npm run i18n:check` | Paridad de claves en es/en/nl |
| `npm test` | Vitest |
| `npm run check` | Los cuatro anteriores encadenados |
| `npm run contracts:sync` | Reimporta tipos desde `../esavi-backend/src/types` |

`npm run check` en 0 es el criterio de cierre de todo spec.

Verificaciones que **ningún comando cubre** y que por eso están en el bloque obligatorio de criterios de aceptación: tema oscuro, por debajo de `md`, y con un rol bajo. Son exactamente las que nadie comprueba, porque el desarrollo ocurre en escritorio, en claro y con `SUPERADMIN`.

---

## 10. Estado del repositorio y anomalías a tener en cuenta

- **No hay código todavía.** El primer spec es el hito 1, y su plan de implementación empieza por el scaffold: estructura de `ARCHITECTURE.md` §9, el `index.html` con el script anti-parpadeo de §6.4, y los comandos de `CONVENTIONS.md` §13.
- **No hay ningún commit.** `/spec-impl` lo comprueba antes de crear la rama.
- `references/API-ROUTES.md` es **generado** desde `ROUTE_RULES` del backend. Si el backend añadió endpoints, hay que regenerarlo (ver `references/README.md`) antes de escribir el spec — si no, el inventario miente por omisión.
- **`appUser` no tiene columna de preferencias y `systemConfig` es global.** Hoy no hay dónde guardar preferencias en el servidor: van a `localStorage` detrás de `PreferencesStore` (`ARCHITECTURE.md` §7).
- **El refresh token vive en `localStorage` en la fase 1**, detrás de `TokenStore`. Migrar a cookie `httpOnly` es la fase 2 y exige un spec del backend.
- **Deuda conocida del modelo:** `classification.isSeriousEvent` y `notification.notificationType` son dos declaraciones de gravedad que el esquema no obliga a coincidir (SPEC F44 lo dejó anotado). Un spec de wizard debe tomar una como fuente y no dejar que el usuario las contradiga sin avisar.
- **`notificationType` y `esaviDescription` son `NOT NULL`.** El primer paso del wizard tiene que recogerlos: antes de tenerlos no hay fila que guardar.
- **Trabajo sin conexión está fuera de alcance** por decisión explícita. Si un spec lo necesita, es una decisión de otro tamaño y tiene su propio spec.

---

## 11. Lo que un spec de este repositorio nunca hace

- **Inventar un endpoint.** Si no está en `references/API-ROUTES.md`, no existe.
- **Inventar un campo de la respuesta.** Salen de `contracts/`, de `DOMAIN-MODEL.md` o del spec de la entidad en el backend.
- **Proponer calcular el diff en el cliente.** El backend hace el update diferencial y compara contra el valor real de la fila.
- **Proponer leer roles del JWT.** El payload lleva solo `userId`.
- **Proponer filtrar o paginar en memoria.** Todos los listados son paginados en servidor.
- **Proponer un color literal o un texto literal visible.** Tokens e i18n, sin excepción.
- **Tratar la comprobación de rol como seguridad.** Es UX; el `403` se maneja igual aunque «no debería pasar».

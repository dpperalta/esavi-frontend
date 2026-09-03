# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repositorio

**Todavía no hay código.** El repositorio contiene sólo `references/` y este archivo; el primer hito es el shell con autenticación (`references/ARCHITECTURE.md` §12). Al hacer el scaffold, seguir la estructura de carpetas de la §9 de ese documento — no inventar una distinta.

## Convenciones de código (norma vinculante)

Antes de escribir o modificar código bajo `src/`, lee **`references/CONVENTIONS.md`**. Define la nomenclatura, los seis artefactos obligatorios por entidad, las capas de estado, las reglas de la capa de API y de UI, y el checklist de cierre. Manda sobre cualquier archivo existente que lo contradiga.

Usa `/esavi-frontend-conventions` para cargarlo; el skill vive en `.claude/skills/esavi-frontend-conventions/`.

## Specs

Las implementaciones se planifican antes de escribirse. Los specs de este repositorio viven en `references/specs/NN-slug.md`, numeran desde `01` y se titulan con prefijo `FE` — `SPEC FE01` — para no confundirlos con los del backend, que se citan `SPEC F44` (funcional) o `SPEC 05` (técnico). Cada spec declara su estado — `Borrador`, `En revisión`, `Aprobado`, `Implementado`, `Obsoleto` — y solo se implementa cuando está `Aprobado`.

Usa `/esavi-spec <entidad o pantalla>` para redactar uno y `/spec-impl <NN-slug>` para ejecutarlo; los skills viven en `.claude/skills/`.

**Ningún spec inventa un endpoint.** Todo lo que una pantalla consuma sale de `references/API-ROUTES.md`, citado con su código `ESAVI-*` y su rol mínimo — es la fuente cerrada de este repositorio, el equivalente de `esaviapp.sql` en el backend. Si una ruta no está en el inventario, no existe: es una dependencia del otro repositorio.

**Todo spec que produzca pantalla declara su contrato de estado.** Dónde vive cada dato —`searchParams`, TanStack Query o Zustand— campo por campo, y un dato no puede vivir en dos capas. Es la tabla de §3.4 de `.claude/skills/esavi-spec/template.md`, y su omisión es el origen de la mayoría de los bugs de sincronización del cliente.

## Referencias

Antes de escribir código, lee lo que corresponda de `references/`. Son decisiones ya tomadas y razonadas contra el backend real; no se reabren sin motivo:

- **`CONVENTIONS.md`** — la norma de código. Se lee siempre.
- **`ARCHITECTURE.md`** — stack, tres capas de estado, capa de recurso genérica, sidebar, temas, preferencias, responsividad, seguridad de sesión y orden de construcción.
- **`API-CONTRACT.md`** — envelope, auth, paginación, idioma, auditoría. Es la referencia de `client.ts` y `createResource.ts`.
- **`API-ROUTES.md`** — las 333 rutas con su rol mínimo y su código de operación. **Generado, no se edita a mano** (ver `references/README.md`).
- **`DOMAIN-MODEL.md`** — entidades y relaciones; decide el orden de los pasos del wizard.

Documentos del backend que mandan sobre cualquier duda: `esavi-backend/references/CONVENTIONS.md` (la norma), `esavi-backend/references/functional/specs/NN-slug.md` (el spec de cada entidad) y `esavi-backend/esaviapp.sql` (el DDL autoritativo).

## Idioma

Responde **siempre en español** en este repositorio: explicaciones, resúmenes, planes y mensajes de commit. En el código, la interfaz va en español (vía react-i18next, nunca texto literal) y los identificadores y comentarios en inglés, igual que el backend.

## Proyecto

Cliente web del sistema de vigilancia de ESAVI — Eventos Supuestamente Atribuibles a la Vacunación e Inmunización. React 19 + TypeScript + Vite sobre la API de `../esavi-backend` (Express 5 + Sequelize + PostgreSQL).

**Dos repositorios hermanos, no un monorepo.** `esavi-app/` es una carpeta contenedora sin `.git`. Consecuencia: los tipos del contrato se copian a `src/contracts/` y se resincronizan con `npm run contracts:sync` desde `../esavi-backend/src/types` (`ARCHITECTURE.md` §10).

### Desarrollo local

El backend corre en el puerto **4500**; la base URL es `http://localhost:4500/api`. `CORS_ORIGINS` del backend ya incluye `http://localhost:5173`, el puerto por defecto de Vite — no hace falta tocar CORS.

```bash
cd ../esavi-backend && npm run dev   # terminal 1
npm run dev                          # terminal 2
```

## Stack decidido

Vite + React 19 + TypeScript · TanStack Query (estado de servidor) · Zustand + `persist` (estado de cliente) · React Router v7 · Tailwind v4 + shadcn/ui · TanStack Table · React Hook Form + Zod · axios con interceptores · react-i18next · date-fns · cmdk · Vitest + Testing Library + MSW.

Descartados con motivo: Redux Toolkit, Next.js, Material UI.

## Las reglas que más se rompen

**Cada dato vive en una sola capa** (`ARCHITECTURE.md` §3). Filtros, paginación y orden van en `searchParams`, no en un store. Casos y pacientes son datos remotos: viven en TanStack Query, **nunca en un store de cliente**. Zustand guarda sólo `preferences`, `ui` y `drafts`.

**El progreso del wizard se guarda en la base, en filas reales**, no como borrador (§3.4). El slice `drafts` es sólo un búfer contra el cierre accidental de la pestaña y se borra en cuanto responde el `PUT`. `GET /api/case-workflows/case/:id` (`ESAVI-CASEFLOW-006`) devuelve `exists` + `id` por satélite y dice, en una sola llamada, si cada etapa se crea con `POST` o se actualiza con `PUT /:id`.

**Ningún color literal en los componentes** (§6.1). Sólo tokens CSS semánticos; un `bg-slate-800` suelto rompe el tema oscuro y no se detecta hasta producción. El tema se aplica con `data-theme="light|dark"` en `<html>`, con tres estados (`light`/`dark`/`system`) y el script anti-parpadeo de §6.4 en `index.html`.

**Con ~45 entidades de contrato idéntico, no se escribe 45 veces el mismo CRUD** (§4). Cada entidad nueva es una declaración de `createResource(...)`, no una carpeta de archivos. Lo mismo con las primitivas: `<ResourceTable>`, `<ResourceForm>`, `<CatalogSelect>`, `<GeoLocationPicker>`, `<AuditTrail>` y `<EntitySearchSelect>` se escriben una vez. Sólo el árbol WHODrug (`WHODRUG-006A`…`E`) y MedDRA (`MEDDRA-006`) llevan componente propio, porque su contrato no es el de un listado filtrado.

**Replicar `ROLE_LEVELS` en el cliente es experiencia de usuario, no seguridad.** `useCan()` y `<RequireRole>` ocultan lo que el usuario no puede hacer; el backend sigue siendo la única autoridad.

## Contrato del backend

**Envelope.** Éxito `{ ok, message, data }`; error `{ ok, message, code, errors }`. El interceptor de respuesta desenvuelve `data` y lanza un `EsaviApiError` que conserva `code` y `status` — ningún componente escribe `response.data.data`. `errors` es material de depuración y **no se muestra al usuario**. El `code` (`HFAC_001_CREATION_FAILED`) es estable y decide el mensaje del toast sin parsear texto. Todo listado devuelve `{ count, rows }`, con `limit` entre 1 y 100.

**`code` puede faltar, y no puede romper nada.** Los errores de los middlewares transversales son de la forma `AUTH_TOKEN_EXPIRED` / `AUTH_ROLE_FORBIDDEN`, sin número de operación (`API-CONTRACT.md` §2), y hasta el 2026-09-03 salían sin `code` del todo. `client.ts` respalda con `'UNKNOWN_ERROR'`: ninguna comparación de `code` asume que el valor exista — la que lo asumía tiraba un `TypeError` dentro del interceptor y mandaba al login en cada recarga.

**Búsqueda: `name` y `code`, nunca `search`.** Doce entidades aceptan filtro de texto con esa forma canónica (SPEC F52); `search` es un alias congelado en cuatro. Mínimo dos caracteres —tres en MedDRA—, debounce obligatorio, `%` y `_` literales, y sin tolerancia a tildes.

**Refresh: cola obligatoria.** El refresh token viaja en el body. Hay rotación con detección de reutilización (SPEC F42): dos refrescos concurrentes con el mismo token **revocan todas las sesiones del usuario**. Un solo refresh en vuelo, guardar siempre el token nuevo, y ante `AUTH_002_REFRESH_TOKEN_REUSED` ir al login sin reintentar.

**Tokens detrás de interfaces.** `TokenStore` (§11.1) y `PreferencesStore` (§7.3) se implementan hoy con `localStorage`; migrar a cookie `httpOnly` y a la tabla `appUserPreference` debe ser sustituir la implementación, no reescribir a los consumidores.

**Listados duales `002A`/`002B`.** `GET /api/<entidad>` devuelve activas; `GET /api/<entidad>/admin` incluye inactivas y exige rol superior. `createResource` elige según el nivel de rol y el toggle de «mostrar inactivos». Paginación con `limit`/`offset`.

**Update diferencial.** Se puede enviar el objeto completo en un `PUT`: el backend escribe sólo lo que cambió de verdad, así que volver a un paso del wizard sin tocar nada no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría. No calcular el diff en el cliente.

**Idioma.** El interceptor de petición añade `?lang=` con el idioma activo del store de preferencias. Sin eso, la interfaz queda en el idioma elegido y los mensajes del servidor llegan en español.

**Ciclo de vida.** `DELETE /:id` es borrado lógico (`isActive: false` + `deletedAt`), `PATCH /activate/:id` lo revierte. Cada escritura añade una entrada al array `appDetails` de la fila, que es lo que lee `<AuditTrail>`.

**Normalización y cifrado.** El backend pasa `code` a `CONSTANT_CASE` y `name` a `Title Case` al escribir (excepción: `catalogType` y `catalogItem` usan camelCase en `code`), así que lo enviado puede volver distinto. Los datos personales cifrados se descifran antes de responder — el cliente recibe texto claro, pero la búsqueda parcial sobre esas columnas no funciona.

**Filtros de casos (SPEC F48).** Trece filtros acumulados con AND. El formulario debe impedir combinar fecha exacta y rango **sobre la misma columna** (es `400`), y `geoLocationId` es siempre jerárquico: incluye los descendientes.

## Códigos de operación

Cada endpoint tiene un código `ESAVI-<ENTIDAD>-<NNN>[A|B]`. **Citarlo en el código del cliente que lo consume** — en la declaración del recurso o en el hook — ahorra mucho tiempo al depurar contra los logs del backend.

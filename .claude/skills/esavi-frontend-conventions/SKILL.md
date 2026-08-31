---
name: esavi-frontend-conventions
description: Convenciones obligatorias de código del frontend ESAVI. Úsalo SIEMPRE antes de escribir, generar o revisar código en este repositorio — componentes, páginas, hooks, stores, schemas, rutas, llamadas a la API o el scaffold inicial. Disparadores "crea una pantalla", "agrega una entidad", "nuevo listado", "conecta con el backend", "revisa este componente", o cualquier edición bajo src/.
---

# Convenciones de código — esavi-frontend

## Qué hacer

**Lee `references/CONVENTIONS.md` (en la raíz del repositorio) antes de escribir una sola línea.** Ese documento es la norma; este skill solo es el puntero. No trabajes de memoria: el canon tiene las tablas exactas de nomenclatura, artefactos, claves de caché, capas de estado y el checklist de cierre, y no se reconstruyen de cabeza.

Según lo que vayas a tocar, lee además:

| Si vas a… | Lee también |
|---|---|
| Escribir `client.ts` o `createResource.ts` | `references/API-CONTRACT.md` |
| Construir una pantalla | `references/API-ROUTES.md` — el rol mínimo y el código de operación de cada ruta |
| Diseñar un formulario o el orden del wizard | `references/DOMAIN-MODEL.md` |
| Reabrir una decisión de diseño | `references/ARCHITECTURE.md` — probablemente ya está razonada allí |

**El repositorio todavía no tiene código.** Si haces el scaffold, la estructura de carpetas es la de `ARCHITECTURE.md` §9 y el orden de construcción el de §12 — no inventes una alternativa.

Cuando una pantalla no cuadre con lo que devuelve la API, la respuesta está en el spec de esa entidad (`esavi-backend/references/functional/specs/`), no en el cliente.

## Regla de oro

Una entidad nueva genera **seis** artefactos, en este orden. Ninguno es opcional:

tipos → declaración del recurso → schemas → páginas → ruta → navegación

Más las claves i18n de la entidad en **los tres** archivos (`es`, `en`, `nl`).

Una entidad **no** genera un cliente HTTP propio, ni hooks de CRUD escritos a mano, ni tipos duplicados de los que ya están en `contracts/`. Con ~45 entidades de contrato idéntico, cada CRUD escrito a mano es un error que se arrastra 45 veces.

## Lo que más se rompe

Ocho reglas concentran casi todo el riesgo. Revísalas siempre:

1. **Cada dato vive en una sola capa.** Filtros, paginación y orden en `searchParams`. Todo lo remoto en TanStack Query — **casos y pacientes nunca en un store ni copiados a un `useState`**. Zustand solo para `preferences`, `ui` y `drafts`.
2. **Ningún color literal y ningún texto literal visible.** Solo tokens semánticos (`bg-background`, no `bg-slate-800`) y solo claves i18n, incluidos placeholders y `aria-label`. Ambos fallos sobreviven hasta producción sin que nadie los vea.
3. **Nada de `axios` fuera de `shared/api/client.ts`, y nunca `response.data.data`.** El interceptor desenvuelve el envelope y lanza `EsaviApiError`. El toast se decide por `code`, nunca parseando `message`; `errors` no se muestra jamás al usuario.
4. **Un solo refresh en vuelo.** El backend rota el refresh token y detecta la reutilización: dos refrescos concurrentes revocan **todas** las sesiones del usuario. La cola vive en `client.ts`, se guarda siempre el token nuevo, y ante `AUTH_002_REFRESH_TOKEN_REUSED` se va al login sin reintentar. El acceso al token pasa por `TokenStore`.
5. **El progreso del wizard vive en la base, en filas reales.** `draftsStore` es solo un búfer contra el cierre de la pestaña y se borra cuando responde el `PUT`. Para saber si toca `POST` o `PUT /:id` se llama a `ESAVI-CASEFLOW-006`, que devuelve `exists` + `id` por satélite en una petición — no se deduce del estado local.
6. **Se envía el objeto completo en el `PUT`.** El backend hace el update diferencial y compara contra el valor real de la fila. No calcules el diff en el cliente.
7. **El `minLevel` del `NavItem` y el `level` del `<RequireRole>` salen de `API-ROUTES.md`**, no de la intuición. Inventarlos produce menús que llevan a `403` o pantallas escondidas a quien sí puede verlas. Y recuerda: replicar roles es **experiencia de usuario, no seguridad** — el `403` se maneja igual aunque «no debería pasar».
8. **Cita el código `ESAVI-*`** en el código del cliente que consume el endpoint. Es lo que permite cruzar un error del cliente con los logs del backend sin adivinar.

## Nomenclatura, en corto

Componentes y páginas en PascalCase (`EsaviCaseListPage.tsx`), hooks con `use` (`useEsaviCaseFilters.ts`), el resto en camelCase (`api.ts`, `schemas.ts`). Carpeta de feature con el **nombre de la entidad del backend, sin traducir ni pluralizar** (`features/esaviCase/`). Un solo export por archivo de componente, `export function`, sin `export default`. Excepción declarada: `shared/components/ui/` conserva el kebab-case de shadcn porque lo genera su CLI.

Tabla completa en §4 del canon.

## Idioma

El código va **siempre en inglés** — archivos, identificadores, comentarios y claves i18n. La interfaz va en español, siempre a través de i18n. Las explicaciones al usuario van en español.

## Antes de cerrar

Recorre el checklist de la sección 14 de `references/CONVENTIONS.md` y verifica que `npm run check` pasa. Tres comprobaciones se olvidan siempre: **tema oscuro**, **por debajo de `md`** y **con un rol bajo**, no solo con `SUPERADMIN`.

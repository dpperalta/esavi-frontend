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

## Skills de diseño — cárgalas antes de generar interfaz

**Norma vinculante, `CONVENTIONS.md` §10.6.** Antes de escribir o modificar cualquier componente visual —pantalla, formulario, diálogo, layout— carga estas skills, en este orden: **`ui-ux-pro-max`** (composición, tipografía, color, interacción, antes de escribir JSX), **`ui-styling`** (al implementar con shadcn/ui + Tailwind, el stack decidido), **`web-design-guidelines`** (al cerrar el componente, como revisión final). Condicional: **`frontend-design`** si la pantalla exige una decisión estética no cubierta por los tokens ya establecidos; **`dataviz`** para cualquier gráfico o panel (el hito 5 lo necesitará). Ninguna sustituye a este canon — cuando haya conflicto, manda `CONVENTIONS.md`.

## Lo que más se rompe

Once reglas concentran casi todo el riesgo. Revísalas siempre — **las dos primeras son las que más se pasan por alto porque no rompen ningún test ni ningún build**:

1. **Todo comentario en el código va en inglés, sin excepción.** `CONVENTIONS.md` §2 lo dice desde el principio, y aun así es la regla que más fácil se olvida escribiendo rápido: nada avisa cuando se rompe, `npm run check` no la detecta, y el desliz se repite archivo tras archivo si nadie lo revisa a mano. Antes de cerrar cualquier paso, `grep -rnP '(?<![:/])//\s*[a-záéíóúñ]' src/` es la comprobación rápida — un comentario en español empieza casi siempre con minúscula acentuada o una palabra española tras `//`.
2. **Ninguna pantalla se genera sin haber cargado antes `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines`** (arriba). Igual que la regla anterior, nada lo detecta automáticamente — sólo la disciplina de cargarlas antes de escribir.
3. **Cada dato vive en una sola capa.** Filtros, paginación y orden en `searchParams`. Todo lo remoto en TanStack Query — **casos y pacientes nunca en un store ni copiados a un `useState`**. Zustand solo para `preferences`, `ui` y `drafts`.
4. **Ningún color literal y ningún texto literal visible.** Solo tokens semánticos (`bg-background`, no `bg-slate-800`) y solo claves i18n, incluidos placeholders y `aria-label`. Ambos fallos sobreviven hasta producción sin que nadie los vea.
5. **Nada de `axios` fuera de `shared/api/client.ts`, y nunca `response.data.data`.** El interceptor desenvuelve el envelope y lanza `EsaviApiError`. El toast se decide por `code`, nunca parseando `message`; `errors` no se muestra jamás al usuario. **Y ninguna comparación de `code` asume que el valor exista**: los errores de los middlewares transversales llegan como `AUTH_TOKEN_EXPIRED` o `AUTH_ROLE_FORBIDDEN`, sin número de operación, y hasta el 2026-09-03 llegaban sin `code`; `client.ts` respalda con `'UNKNOWN_ERROR'`.
6. **Un solo refresh en vuelo.** El backend rota el refresh token y detecta la reutilización: dos refrescos concurrentes revocan **todas** las sesiones del usuario. La cola vive en `client.ts`, se guarda siempre el token nuevo, y ante `AUTH_002_REFRESH_TOKEN_REUSED` se va al login sin reintentar. El acceso al token pasa por `TokenStore`.
7. **El progreso del wizard vive en la base, en filas reales.** `draftsStore` es solo un búfer contra el cierre de la pestaña y se borra cuando responde el `PUT`. Para saber si toca `POST` o `PUT /:id` se llama a `ESAVI-CASEFLOW-006`, que devuelve `exists` + `id` por satélite en una petición — no se deduce del estado local.
8. **Se envía el objeto completo en el `PUT`.** El backend hace el update diferencial y compara contra el valor real de la fila. No calcules el diff en el cliente.
9. **El `minLevel` del `NavItem` y el `level` del `<RequireRole>` salen de `API-ROUTES.md`**, no de la intuición. Inventarlos produce menús que llevan a `403` o pantallas escondidas a quien sí puede verlas. Y recuerda: replicar roles es **experiencia de usuario, no seguridad** — el `403` se maneja igual aunque «no debería pasar».
10. **Cita el código `ESAVI-*`** en el código del cliente que consume el endpoint. Es lo que permite cruzar un error del cliente con los logs del backend sin adivinar.
11. **Todo autocompletado busca con `name` y `code`, nunca con `search`** (`CONVENTIONS.md` §6.7). Mínimo dos caracteres —tres en MedDRA— comprobados **antes** de pedir, debounce siempre, `%` y `_` literales y ninguna tolerancia a tildes. `search` sobrevive como alias congelado en cuatro entidades y no se usa en código nuevo.

## Nomenclatura, en corto

Componentes y páginas en PascalCase (`EsaviCaseListPage.tsx`), hooks con `use` (`useEsaviCaseFilters.ts`), el resto en camelCase (`api.ts`, `schemas.ts`). Carpeta de feature con el **nombre de la entidad del backend, sin traducir ni pluralizar** (`features/esaviCase/`). Un solo export por archivo de componente, `export function`, sin `export default`. Excepción declarada: `shared/components/ui/` conserva el kebab-case de shadcn porque lo genera su CLI.

Tabla completa en §4 del canon.

## Idioma

El código va **siempre en inglés** — archivos, identificadores, comentarios y claves i18n. La interfaz va en español, siempre a través de i18n. Las explicaciones al usuario van en español.

## Antes de cerrar

Recorre el checklist de la sección 14 de `references/CONVENTIONS.md` y verifica que `npm run check` pasa. Tres comprobaciones se olvidan siempre: **tema oscuro**, **por debajo de `md`** y **con un rol bajo**, no solo con `SUPERADMIN`.

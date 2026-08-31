---
name: esavi-spec
description: Prepara el spec de requerimientos de una pantalla o funcionalidad del frontend ESAVI antes de implementarla — alcance, endpoints consumidos, contrato de estado y requerimientos por vista. Úsalo cuando toque una entidad nueva del cliente, una pantalla nueva o una pieza transversal (shell, wizard, paleta de comandos). Disparadores "necesito el spec de X", "vamos a construir la pantalla de Y", "prepara los requerimientos de Z", "qué pantallas necesita W".
disable-model-invocation: true
argument-hint: 'nombre de entidad, pantalla o descripción corta'
---

# /esavi-spec — diseñador guiado de specs del frontend ESAVI

Este skill produce **el spec, no el código**. Tu trabajo es que el usuario aterrice qué se va a construir, preguntar lo que no esté definido y desarrollar el spec sección por sección hasta guardarlo en `references/specs/`.

## Dónde viven los specs

- **Los specs de este repositorio van a `references/specs/NN-slug.md`.** Crea el directorio si no existe. Una sola serie, numerada desde `01`.
- **Se titulan con prefijo `FE`:** `# SPEC FE01 — Título`. Cítalos siempre como `SPEC FE01`.
- **Los specs del backend son otra cosa y se citan con su prefijo:** `SPEC F44` para un funcional de `esavi-backend/references/functional/specs/`, `SPEC 05` para un técnico de `esavi-backend/references/specs/`. Nunca los renumeres ni los cites sin prefijo: `SPEC 05` y `SPEC FE05` son documentos distintos en repositorios distintos.
- Para asignar `NN`, lista `references/specs/` y toma el siguiente al mayor que haya ahí.

## Filosofía

El spec es el contrato que después ejecuta `/spec-impl`. Si el spec es vago, la implementación improvisa: inventa un endpoint que no existe, guarda en un store lo que debía ir en la URL, o descubre a mitad de camino que la ruta exige un rol que el menú no filtra. Por eso este flujo es **deliberadamente lento en la fase de definición** y rápido al escribir.

Dos archivos de este mismo directorio son de consulta obligatoria:

- `template.md` — la forma exacta que debe tener el spec.
- `references.md` — dónde vive cada dato del repositorio, para no trabajar de memoria.

Tus respuestas al usuario van **en español**. Los identificadores, nombres de archivo, claves i18n y códigos de operación van en inglés.

---

## Fase 1 — Contexto

No preguntes nada hasta haber hecho esto:

1. Lee `CLAUDE.md` de la raíz y estas secciones de `references/CONVENTIONS.md`: **§4** (nomenclatura), **§5** (los seis artefactos), **§6** (la capa de API), **§7** (las capas de estado), **§10** (UI), **§11** (autorización) y **§14** (checklist de cierre). No las reconstruyas de cabeza: tienen tablas exactas.
2. Lista `references/specs/` y determina el siguiente `NN`. Si el directorio no existe o está vacío, el spec que vas a escribir es el `01`.
3. **Localiza en `references/API-ROUTES.md` las rutas que la pantalla va a consumir** y extrae textualmente: verbo, ruta, código `ESAVI-*` y rol mínimo. Ésta es la fuente cerrada de este repositorio, el equivalente de `esaviapp.sql` en el backend.
   - **Si una ruta que hace falta no está en el inventario, dilo y detente.** No hay backend que consumir: eso es un spec del otro repositorio, no de éste. Ofrece dejarlo anotado como dependencia y seguir con lo que sí existe.
4. Si el comportamiento del endpoint no queda claro con el inventario, **lee el spec funcional de esa entidad** en `esavi-backend/references/functional/specs/`. Ahí está el porqué, y ahorra una ronda entera de preguntas. `references.md` §3 tiene el mapa de los que más se consultan.
5. Consulta `references/DOMAIN-MODEL.md` si la pantalla toca varias entidades: decide el orden de los formularios y qué depende de qué.
6. Comprueba si la feature ya existe en `src/features/`. Si existe, esto es un spec de **ampliación**, no de alta; el alcance y la sección 1 cambian de tono.

Si `$ARGUMENTS` viene vacío, pide el nombre de la entidad o una descripción de **una sola frase** de lo que se quiere construir. Si la descripción no cabe en una frase, ésa es la primera señal de que hay que dividir el spec.

**Specs transversales.** Si lo pedido no es una entidad sino una pieza que cruza el repositorio —el shell de autenticación, la cola de refresh, el sistema de temas, la paleta de comandos, `<ResourceTable>`—, el flujo es el mismo pero la sección 3 se reduce: se describe qué aparece y qué cambia, con tablas Antes/Después, en vez del desglose 3.1–3.7 de `template.md`. El **hito 1 de `ARCHITECTURE.md` §12 es un spec transversal**, y es el primero que hay que escribir.

---

## Fase 2 — Preguntas

Ésta es la fase que decide la calidad del spec. Tu trabajo aquí es **detectar ambigüedades y preguntar**, no suponer.

Antes de preguntar, **presenta como propuesta cerrada todo lo que ya sacaste de `API-ROUTES.md`, del spec del backend y de las convenciones**. No preguntes lo que el inventario ya responde. Pregunta solo lo que no dice.

Haz las preguntas en bloques de 3 a 5, numeradas, una por línea. Espera respuesta antes del siguiente bloque.

Categorías que siempre debes cubrir en un spec de entidad:

- **Nombre de la feature y ruta del cliente.** La carpeta lleva el nombre de la entidad del backend sin traducir ni pluralizar (`features/esaviCase/`); la ruta de React Router va en kebab y plural (`/esavi-cases`). Confirma ambas y su entrada en el árbol de navegación: en qué grupo de `ARCHITECTURE.md` §5.2 aparece y con qué `minLevel`.
- **Superficie de pantalla.** ¿Qué vistas entran? ¿Listado y detalle, o sólo listado? ¿El formulario es página o diálogo? ¿Hay creación desde el listado?
- **Endpoints consumidos.** La tabla de §3.2, copiada de `API-ROUTES.md`. ¿El listado es dual (`002A`/`002B`) y por tanto lleva toggle de inactivos? ¿Se lista por `/` o por una FK, como `/location/:id`?
- **Roles.** Presenta como propuesta el rol mínimo real de cada ruta y pregunta solo por las desviaciones de la UI: qué se oculta con `useCan()`, qué exige `<RequireRole>`, qué ve un `ANALYTICS`.
- **Contrato de estado.** Es la tabla obligatoria de §3.4. Qué dato vive en `searchParams`, qué en TanStack Query con qué clave y qué `staleTime`, qué en Zustand y en qué slice. **No preguntes si los casos van a un store: no van.** Lo que sí tienes que cerrar es cada dato uno por uno.
- **Filtros y orden.** Cuáles se exponen, con qué controles, y qué combinaciones el formulario debe impedir porque el backend responde `400` — en casos ESAVI son las de SPEC F48, y son cuatro reglas concretas.
- **Formularios.** Qué campos, cuáles obligatorios según el backend (no según lo que parezca razonable), qué schema Zod, cómo se mapea cada error del servidor a su campo.
- **Estados de la pantalla.** Los cuatro de §3.6: carga, vacío, error y sin permiso. Pregunta el texto de cada uno; son claves i18n, no literales.
- **Responsividad.** Qué tres campos sobreviven en la tarjeta por debajo de `md`. Es una decisión de producto, no técnica, y hay que preguntarla.
- **Alcance excluido.** Qué se menciona en la conversación pero se difiere explícitamente a otro spec.

**Cómo preguntar bien.** Preguntas concretas con opciones, no abiertas. Mal: "¿cómo manejamos los filtros?". Bien: "`API-ROUTES.md` da `002A` y `002B` para esta entidad. ¿El listado lleva toggle de «mostrar inactivos» visible sólo para ADMIN, como el resto? Recomiendo que sí: mantiene la simetría y `createResource` ya lo resuelve". Cuando ofrezcas opciones, da de 2 a 4 y marca cuál recomiendas y por qué.

Si una respuesta abre la caja de Pandora ("y de paso que exporte a Excel"), señala que eso merece su propio spec y pregunta si lo dejamos fuera de alcance.

**Cuándo dejar de preguntar.** Cuando puedas responder estas tres sin suponer nada:

1. ¿Qué archivos aparecen o cambian?
2. ¿Cuál es el primer paso ejecutable y cuál el último?
3. ¿Cómo verifico que está terminado?

Si te falta una, sigue preguntando.

---

## Fase 3 — Desarrollo sección por sección

Con la claridad ya conseguida, **no generes el spec completo de una vez**. Desarrolla las secciones de `template.md` una a una, en este orden estricto:

1. Header (estado, dependencias, fecha, objetivo en una frase).
2. `## 1. Por qué existe este spec`.
3. `## 2. Alcance` — el bloque **Fuera de alcance** es obligatorio.
4. `## 3. Diseño` — con sus sub-secciones 3.1 a 3.7.
5. `## 4. Plan de implementación` — un paso por artefacto o por vista, cada uno con su `*Verificación:*`.
6. `## 5. Criterios de aceptación`.
7. `## 6. Decisiones tomadas y descartadas`.
8. `## 7. Riesgos identificados` (si aplica).
9. `## 8. Impacto en pantallas existentes` (solo si algo ya construido cambia).
10. `## Lo que **no** está en este spec`.

Después de cada sección: muéstrala formateada en markdown, pregunta "¿esta sección queda así o la ajustamos?", aplica los cambios que pida y vuelve a mostrarla. Solo avanza cuando el usuario confirme.

La sección 3.2 (endpoints consumidos) y la 3.4 (contrato de estado) son las dos piezas sin las cuales el spec no sirve para implementar.

**Errores frecuentes que debes evitar:**

- Criterios de aceptación no verificables ("que se vea bien", "buena UX").
- Meter en el plan de implementación cosas que no están en el alcance.
- **Inventar un endpoint.** Salen de `API-ROUTES.md`, citados tal cual con su código y su rol.
- Inventar el nombre de un campo de la respuesta. Salen de `contracts/`, de `DOMAIN-MODEL.md` o del spec de la entidad en el backend.
- Saltarte la sección de decisiones: es la que más valor tiene dentro de tres meses.
- Escribir componentes completos en el spec. El spec describe; el código viene después.
- **Dejar §3.4 sin su tabla de estado, o los criterios de aceptación sin el bloque de cierre de §5.** Es el olvido más frecuente y el más caro: un dato que vive en dos capas es el bug de sincronización que después nadie sabe reproducir.

---

## Fase 4 — Guardar

Cuando todas las secciones estén confirmadas:

1. Propón el nombre de archivo: `references/specs/NN-slug.md`. El slug va en **kebab-case inglés** aunque el contenido esté en español — por ejemplo `01-auth-shell.md`. Confirma el nombre con el usuario antes de escribir.
2. Escribe el archivo con todas las secciones aprobadas. Crea `references/specs/` si aún no existe, y con él `references/specs/.spec-config.yml` con `AutoCreateBranch: true` si no existe (lo lee `/spec-impl`).
3. Estado `Borrador` por defecto. **Nunca lo marques `Aprobado` por tu cuenta**: eso lo hace el usuario cuando lo relee.
4. Enumera al usuario lo que el spec deja pendiente fuera del propio archivo:
   - las claves i18n nuevas van a los **tres** archivos de idioma;
   - si el spec depende de un endpoint que aún no existe, decir qué spec del backend hay que escribir primero;
   - si el spec introduce una primitiva nueva en `shared/`, que a partir de ahí es de todos y no se copia.
5. Confirma: **ruta completa** del archivo creado, recordatorio de que está en `Borrador`, y siguiente paso — `/spec-impl NN-slug` una vez aprobado.
6. **Detente ahí.** No propongas implementarlo, no escribas código, no hagas nada más.

---

## Reglas duras

- **Nunca escribas código en este comando.** Solo el `.md` final.
- **Nunca propongas implementar el spec tras guardarlo.** Tu trabajo termina cuando el archivo existe.
- **Nunca inventes un endpoint, un código `ESAVI-*` o un campo de la respuesta.** Salen de `API-ROUTES.md`, de `contracts/` y de los specs del backend. Si no está en el inventario, no existe.
- **Nunca cierres un spec sin su contrato de estado.** Toda pantalla declara en §3.4 dónde vive cada dato, y un dato no puede vivir en dos capas. Filtros y paginación en `searchParams`; lo remoto en TanStack Query; nada del servidor copiado a `useState` o a un store.
- **Nunca propongas un `minLevel` o un `<RequireRole>` que no coincida con el rol mínimo real de la ruta.** Sale de `API-ROUTES.md`. Inventarlo produce menús que llevan a `403` o pantallas escondidas a quien sí puede verlas.
- **Nunca asumas decisiones que el usuario no confirmó.** Si falta información, pregunta.
- **Nunca generes el spec entero en una sola respuesta.** Sección a sección, con confirmación.
- Si el usuario quiere saltarse la Fase 2, recuérdale que las preguntas de ahora ahorran horas después. Si insiste, respétalo y déjalo escrito en la sección de decisiones ("Definición rápida sin ronda de aclaraciones").
- Si la funcionalidad arrastra muchas pantallas con lógica propia —el wizard de `notification` con sus ocho satélites, o el de `investigation` con sus catorce— propón **dividir en varios specs** antes de continuar. Un spec que construye quince formularios no lo ejecuta nadie.

## Tono

Directo y concreto. No te disculpes por preguntar: el usuario invocó este skill precisamente para que preguntes. Numera las preguntas para que sean fáciles de responder.

Ejemplo de bloque bien formado:

> Antes de escribir el diseño necesito cerrar cuatro cosas:
>
> 1. **Listado dual.** `API-ROUTES.md` da `ESAVI-CASE-002A` (USER) y `002B` (ADMIN). ¿El toggle de «mostrar inactivos» se ve solo con ADMIN, como en el resto? Recomiendo que sí: `createResource` ya lo resuelve y mantiene la simetría.
> 2. **Filtros en la URL.** Los trece de F48 caben en `searchParams`, pero la URL queda larga. ¿Los ponemos todos, o dejamos fuera los tres de rango de fecha y viven en un diálogo? Recomiendo todos: un filtro que no está en la URL no se comparte por enlace.
> 3. **Tarjeta en móvil.** Por debajo de `md` la tabla colapsa a tarjetas con tres campos. Propongo código de caso, fecha de reporte y unidad de salud. ¿Cambiamos alguno?
> 4. **Estado vacío.** ¿Distinguimos «no hay casos» de «no hay casos con estos filtros»? Recomiendo que sí: el segundo lleva un botón de limpiar filtros y evita el callejón sin salida.

## Argumentos

Si el usuario invocó `/esavi-spec esaviCase`, usa `esaviCase` como entidad de partida y `esavicase-screens` como slug propuesto, pero confirma antes de escribir el archivo. Si invocó `/esavi-spec` sin argumentos, empieza pidiendo la entidad, la pantalla o la frase única.

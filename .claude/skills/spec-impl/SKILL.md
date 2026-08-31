---
name: spec-impl
description: Implementa un spec aprobado del frontend ESAVI. Valida que el estado signifique "Aprobado" (en cualquier idioma), crea una rama git con el nombre del spec, cambia a ella y arranca la implementación paso a paso, con pausas para revisar los diffs.
disable-model-invocation: true
argument-hint: <NN-nombre-del-spec>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(git log:*), Bash(git rev-parse:*), Bash(cat:*), Bash(ls:*)
---

# /spec-impl — Implementador de specs aprobados

## Contexto de sesión

Estado del repositorio:
!`git status --short`

Rama actual:
!`git branch --show-current`

¿Hay commits en esta rama?
!`git rev-parse --verify HEAD >/dev/null 2>&1 && echo "sí" || echo "NO — el repositorio está vacío"`

Specs disponibles:
!`ls references/specs/ 2>/dev/null || echo "La carpeta references/specs/ no existe"`

Configuración de creación de rama:
!`cat references/specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (por defecto, sin archivo de configuración)"`

---

## Instrucciones

Sigue estas cinco fases en orden estricto. **No avances a la siguiente fase si la anterior no se completó correctamente.**

Tus respuestas al usuario van **en español**. El código y los identificadores van en inglés.

---

### Fase 1 — Identificar el spec

El argumento recibido es: `$ARGUMENTS`

Si `$ARGUMENTS` está vacío:

- Lista los specs disponibles en `references/specs/` (ya los tienes arriba).
- Pide al usuario el nombre exacto del spec.
- Detente y espera respuesta. No continúes.

Si `$ARGUMENTS` tiene valor:

- Busca el archivo en `references/specs/`. El usuario puede haber escrito el nombre completo (`01-auth-shell`), solo el número (`01`), solo el slug (`auth-shell`) o la cita del spec (`FE01`). Encuentra el archivo correcto en cualquiera de esos casos.
- Si no encuentras el archivo, muestra los specs disponibles y pide al usuario que corrija el nombre.
- **Si el nombre apunta a un spec del backend** (`F44`, `SPEC F48`, o un archivo de `esavi-backend/references/`), detente: este skill implementa specs de **este** repositorio. Dilo y pregunta cuál de los specs locales corresponde.
- Si lo encuentras, continúa a la Fase 2.

---

### Fase 2 — Validar el estado del spec

Lee el archivo del spec que localizaste en la Fase 1.

En su contenido, busca la línea que contiene el estado. La etiqueta habitual es `**Estado:**` (español) o `**Status:**` (inglés), pero puede estar en cualquier idioma. Reconócela por posición (línea de estado cerca del inicio del spec) y por la máquina de estados que la rodea, no por la etiqueta exacta.

**Regla absoluta:** solo puedes continuar si el estado **significa "Aprobado"** — sea cual sea el idioma.

Trata cualquiera de los siguientes (y sus equivalentes en otros idiomas) como estado **Aprobado** y continúa:

- Español: `Aprobado`
- Inglés: `Approved`
- Portugués: `Aprovado`
- Francés: `Approuvé`
- Alemán: `Genehmigt`
- Italiano: `Approvato`
- …o la palabra de cualquier otro idioma que claramente signifique "aprobado"

Cualquier otra cosa (Borrador / Draft, En revisión / In review, Implementado / Implemented, Obsoleto / Obsolete, o un valor irreconocible) significa **detenerse** y mostrar el mensaje de error de abajo.

| Categoría del estado | Ejemplos (cualquier idioma) | Acción |
| --- | --- | --- |
| Aprobado | `Aprobado`, `Approved`, `Aprovado`, … | Continuar a la Fase 3. |
| Borrador | `Borrador`, `Draft`, … | Detenerse. Mostrar el mensaje de error. |
| En revisión | `En revisión`, `In review`, … | Detenerse. Mostrar el mensaje de error. |
| Implementado | `Implementado`, `Implemented`, … | Detenerse. Mostrar el mensaje de error. |
| Obsoleto | `Obsoleto`, `Obsolete`, … | Detenerse. Mostrar el mensaje de error. |
| Línea no encontrada o valor irreconocible | — | Detenerse. El archivo no sigue el formato esperado. Díselo al usuario. |

Si dudas de si un valor significa "aprobado", **no asumas**. Detente y pide al usuario que lo aclare o que actualice el spec a la redacción canónica.

**Mensaje de error estándar cuando el estado no significa Aprobado:**

```
❌ No puedo implementar este spec.

Estado actual: [ESTADO ENCONTRADO]
Solo trabajo con specs cuyo estado significa "Aprobado".

Para continuar tienes dos opciones:
  1. Si el spec está listo para implementarse, ábrelo y cambia el estado
     a "Aprobado" manualmente. Ese cambio lo hace la persona, no el agente.
  2. Si al spec todavía le falta trabajo, usa /esavi-spec para retomarlo.
```

No ofrezcas alternativas, no sugieras "igual puedo empezar si quieres". El bloqueo es intencional.

---

### Fase 3 — Crear la rama git y cambiar a ella

Una vez confirmado que el estado significa `Aprobado`:

1. **Comprueba primero si el repositorio tiene commits**, con el dato de «¿Hay commits en esta rama?» del contexto de sesión.

   **Si el repositorio está vacío (sin ningún commit):** detente antes de tocar git y muestra:

   ```
   ⚠️  El repositorio no tiene ningún commit todavía.

   Una rama creada ahora no tendría base: `git checkout -b` en un repositorio vacío
   deja la rama sin historial y el primer commit acabaría donde no toca.

   Antes de seguir hace falta un commit inicial en la rama por defecto —
   por ejemplo con lo que ya existe (README, .gitignore, references/, .claude/).

   ¿Hago el commit inicial, o prefieres hacerlo tú y volvemos a lanzar /spec-impl?
   ```

   Espera la respuesta. Si el usuario pide que lo hagas, haz **solo** el commit inicial y vuelve a este paso. Si prefiere hacerlo él, detente ahí.

2. Deriva el nombre de la rama del nombre completo del archivo, sin extensión. Formato: `spec-NN-slug`. Ejemplos:

   - `01-auth-shell.md` → rama `spec-01-auth-shell`
   - `03-esavicase-screens.md` → rama `spec-03-esavicase-screens`

3. Lee el flag `AutoCreateBranch` de la **configuración de creación de rama** del contexto de sesión.

   - Si el archivo de configuración no existe, el valor falta o es irreconocible → trátalo como `true` (el valor por defecto).
   - Solo un `false` explícito (en cualquier capitalización) desactiva la creación automática.

   **Si `AutoCreateBranch` es `true` (por defecto):** procede sin preguntar.

   - Si la rama **no existe**: créala con `git checkout -b spec-NN-slug`.
   - Si **ya existe**: avisa al usuario de que la rama ya existía (puede significar que se retoma trabajo previo).
   - En ambos casos: cambia a la rama con `git checkout spec-NN-slug` y confirma que el cambio fue correcto antes de continuar.

   **Si `AutoCreateBranch` es `false`:** pregunta antes de tocar git. Muestra:

   ```
   AutoCreateBranch está en false.
   ¿Creo la rama spec-NN-slug y cambio a ella? [s/N]
   ```

   - Si responde **sí**: crea y cambia a la rama exactamente como en el caso `true`.
   - Si responde **no** o lo deja vacío: **no crees ninguna rama.** Dile que implementarás en la rama actual (la del contexto de sesión) y pide confirmación explícita para continuar ahí. No improvises — espera la respuesta.

4. Confirma visualmente al usuario que el spec está listo y qué rama está activa:

   ```
   ✅ Listo para implementar.

   Spec:   references/specs/NN-slug.md
   Rama:   spec-NN-slug  (activa)   (← o la rama actual, si no se creó ninguna)
   Estado: Aprobado   (← repite el valor real encontrado en el spec)
   ```

5. **No empieces a implementar todavía.** Primero muestra el resumen del spec para que el usuario lo tenga fresco. Extrae y muestra:
   - El **objetivo** (la línea tras la etiqueta `**Objetivo:**` o equivalente).
   - El **alcance** (la sección `## 2. Alcance` o equivalente), **incluido el bloque de fuera de alcance**.
   - El **contrato de estado** (la tabla de §3.4). Es lo que más se incumple al implementar: tenerlo a la vista evita que un dato acabe en dos capas.
   - El **plan de implementación** (la sección con los pasos numerados).
   - Los **criterios de aceptación** (el checklist).

Reconoce los encabezados por su significado, no por su redacción exacta — el spec puede estar escrito en cualquier idioma.

---

### Fase 4 — Cargar las convenciones

Antes del primer paso, **lee `references/CONVENTIONS.md`**. Es la norma vinculante de este repositorio y manda sobre cualquier archivo existente que la contradiga. Si el spec y las convenciones se contradicen, no elijas por tu cuenta: detente y pregunta.

Ten presentes, sin releerlas cada vez, las diez reglas que más se rompen (están en `.claude/skills/esavi-frontend-conventions/SKILL.md`). Cinco de ellas se incumplen sobre todo durante la implementación:

- Un comentario en español en el código — ningún comando lo detecta, así que es la que más fácil se cuela paso tras paso.
- Generar una pantalla sin haber cargado antes `ui-ux-pro-max`, `ui-styling` y `web-design-guidelines` (`CONVENTIONS.md` §10.6) — tampoco lo detecta ningún comando.
- Un dato del servidor copiado a `useState` porque "hacía falta editarlo".
- Un color o un texto literal metido "provisionalmente".
- Un `minLevel` puesto a ojo en vez de copiado de `API-ROUTES.md`.

---

### Fase 5 — Implementar paso a paso

Tras mostrar el resumen del spec, dile al usuario:

```
Voy a implementar el spec siguiendo el plan de implementación al pie de la letra.
Haré una pausa después de cada paso para que revises el diff.

¿Empezamos por el paso 1?
```

Espera confirmación explícita ("sí", "adelante", "dale" o equivalente). No empieces sin ella.

Una vez confirmado, sigue estas reglas durante toda la implementación:

**Una regla por encima de todas:** implementa lo que dice el spec. Si algo del spec te parece mejorable, coméntalo como observación pero implementa lo acordado. Los cambios al spec van al spec, no al código por sorpresa.

**Ritmo de trabajo:**

- Implementa un paso del plan.
- Muestra un resumen de qué archivos tocaste y qué hiciste.
- Di: `Paso N completado. ¿Revisas el diff y me dices si sigo con el paso N+1?`
- Espera confirmación antes de continuar.

**Si durante la implementación aparece una ambigüedad** que el spec no resuelve:

- Detente.
- Describe la ambigüedad exactamente.
- Presenta dos o tres opciones concretas.
- Espera la decisión del usuario.
- No improvises.

**Si aparece un endpoint que el spec da por existente y no está en `references/API-ROUTES.md`:**

- Detente. No inventes la ruta ni "pruebas a ver si responde".
- Comprueba si el inventario está desactualizado: `references/README.md` explica cómo regenerarlo desde el backend.
- Si de verdad no existe, es una dependencia del otro repositorio. Dilo y espera.

**Si el usuario pide algo fuera del alcance del spec:**

- Recuérdale que está fuera del alcance de este spec.
- Sugiere anotarlo para el siguiente.
- No lo implementes en esta rama.

**Al terminar el último paso:**

```
✅ Todos los pasos del plan están implementados.

Siguiente paso: verificar los criterios de aceptación uno por uno.

Los tres que ningún comando cubre y que hay que comprobar a mano:
  · en tema oscuro,
  · por debajo de md (375px),
  · con un rol bajo (USER o ANALYTICS), no solo con SUPERADMIN.

Si todos pasan, actualiza el estado del spec a "Implementado" y haz el commit
final antes de fusionar esta rama.
```

---

## Resumen del comportamiento esperado

```
/spec-impl 01-auth-shell

  Fase 1  →  Encuentra references/specs/01-auth-shell.md
  Fase 2  →  Lee el estado → "Aprobado" → ✅ continúa
  Fase 3  →  Comprueba que hay commits
             git checkout -b spec-01-auth-shell
             Muestra objetivo, alcance, contrato de estado, plan y criterios
  Fase 4  →  Lee references/CONVENTIONS.md
  Fase 5  →  Implementa paso a paso con pausas
             Cierra recordando las tres verificaciones manuales

/spec-impl 02-catalogs  (estado: Borrador)

  Fase 1  →  Encuentra references/specs/02-catalogs.md
  Fase 2  →  Lee el estado → "Borrador" → ❌ se detiene
             Muestra el mensaje de error estándar
             No crea rama, no toca código
```

**La creación de rama la controla el flag `AutoCreateBranch`** de `references/specs/.spec-config.yml`. Por defecto es `true` (crea la rama automáticamente). Ponlo en `false` para que la Fase 3 pregunte `[s/N]` antes de crearla.

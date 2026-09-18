# SPEC FE16 — Botón «Anterior» y campos pendientes en investigación

> **Estado:** Implementado
> **Depende de:** SPEC FE08 (armazón del wizard y `CaseWizardStepHandle`), SPEC FE13a–FE13e (las diecisiete secciones del paso de investigación), SPEC FE14b (paso `closure` y `isStepRequired`)
> **Fecha:** 2026-09-18
> **Objetivo:** Completar la barra de acciones del wizard con navegación hacia atrás en los siete pasos y con la lista de campos pendientes que hoy falta en el paso de investigación.

---

## 1. Por qué existe este spec

Dos desajustes de la misma barra, `features/esaviCase/CaseWizardActionBar.tsx`. Ninguno consume un endpoint nuevo.

**A — No se puede retroceder desde la barra.** `CaseWizardActionBar.tsx:143-167` pinta tres botones —Guardar, Completar etapa, Siguiente— y ninguno navega hacia atrás. Para volver al paso anterior sólo quedan el `<CaseWizardStepper>` y el botón del navegador. Se pidió durante la implementación de SPEC FE11 y se aplazó entonces por ser navegación del armazón, no contenido del paso de clasificación. Pesa más en un expediente `CLOSED`, donde el wizard es de sólo lectura (`CASE-PROCESS.md:198`) y recorrerlo hacia atrás es el uso principal.

**B — El paso de investigación no dice qué le falta.** `InvestigationStep.tsx:521` registra el handle del paso con `getPendingFields: () => []`. La lista de `CaseWizardActionBar.tsx:130-141` existe y funciona, pero en este paso siempre recibe un array vacío y no se pinta nunca. Los otros tres pasos con etapa sí la alimentan: `ClassificationStep.tsx:165`, `NotificationStep.tsx:257` y `FinalClassificationStep.tsx:178`.

El desajuste es contra una norma escrita. `CASE-PROCESS.md` §4.6 define **dos niveles de obligatoriedad** —bloqueante de guardado y obligatorio de proceso— y exige que cada formulario lleve **dos esquemas Zod**: `saveSchema` con los bloqueantes y `completeSchema` con los obligatorios de proceso. En `features/investigation/schemas.ts` sólo existen los `*SaveSchema`; no hay un solo `completeSchema` en toda la feature. La misma sección cierra con la regla que hoy se incumple:

> «Al pulsar «Completar etapa» con campos pendientes, la pantalla los lista en vez de deshabilitar el botón en silencio. Un botón apagado sin explicación es la peor versión de esta regla.»

Es exactamente lo que ocurre hoy en el paso 5: el botón «Completar etapa» se deshabilita o la etapa se completa incompleta, sin que la pantalla nombre nunca lo que falta.

**Lo que este spec no cambia.** Completar una etapa **no desbloquea nada** (`CASE-PROCESS.md:143`): el cierre comprueba que las filas existan y estén activas, nunca que tengan `endedAt`. La lista de pendientes es información, no una compuerta — el paso se sigue guardando incompleto, que es la regla general del wizard (`CASE-PROCESS.md:202`).

---

## 2. Alcance

**Dentro:**

- Un botón **«Anterior»** en `CaseWizardActionBar`, a la izquierda del grupo de tres botones actuales, deshabilitado en el primer paso (`patient`) y visible también cuando el expediente está `CLOSED`.
- `findPreviousRequiredStep()` en `features/esaviCase/steps.ts`, simétrico de `findNextRequiredStep()`: salta hacia atrás los pasos que `isStepRequired` deja fuera.
- «Anterior» pasa por el mismo `AlertDialog` de cambios sin guardar que hoy usa «Siguiente», sin duplicarlo.
- Un **`completeSchema` por sección** en `features/investigation/schemas.ts`, derivado del validador del backend, para las secciones que tengan obligatorios de proceso.
- `getPendingFields(): string[]` añadido a `InvestigationSectionHandle`, y la agregación en orden de sección dentro de `InvestigationStep`.
- **Cuatro listas satélite con mínimo de un elemento**, que aportan su propia entrada a la lista: equipo investigador, diagnósticos, vacunas administradas e instituciones que evaluaron al paciente.
- Cada entrada de la lista lleva **prefijo de sección** — `Datos básicos · Fecha de investigación`.
- Las claves i18n nuevas, en los tres archivos de idioma.

**Fuera de alcance (otros specs):**

- **Bloquear «Completar etapa» cuando hay pendientes.** La lista informa; el botón sigue habilitado y el backend sigue siendo la autoridad (`CASE-PROCESS.md` §4.6).
- **Tocar el `computePendingFields` de clasificación, notificación y clasificación final.** Los tres ya listan; aquí sólo se verifican, no se reescriben.
- **Lista de pendientes en los pasos sin etapa** — `patient`, `case-opening` y `closure`. No tienen «Completar etapa», así que no hay nada que completar.
- **Ampliar `caseWorkflow/closeReadiness.ts`.** Las once comprobaciones de cierre de SPEC FE14b son otra cosa y se quedan como están.
- **Fundir el aviso de secciones vacías** de SPEC FE13e §3.6 con la lista de pendientes. Se mantiene tal cual, donde está y con el texto que tiene: responde a otra pregunta —qué secciones ni siquiera se abrieron— y el usuario pidió expresamente conservarlo.
- **Endurecer los `*SaveSchema` de investigación.** Lo bloqueante de guardado no cambia en este spec; sólo se añade el nivel de proceso.
- **Enmendar SPEC FE08.** Está `Implementado`; este spec lo amplía desde fuera y lo cita.

---

## 3. Diseño

Spec de ampliación: se describe qué cambia sobre lo construido, con tablas Antes/Después.

### 3.1 Pantallas y rutas

**No aparece ninguna vista ni ninguna ruta nueva.** Todo ocurre dentro de la ruta que ya existe:

| Vista | Ruta | Archivo | Guard |
|---|---|---|---|
| Wizard del caso | `/esavi-cases/:id/wizard/:step` | `features/esaviCase/CaseWizardPage.tsx` | sin cambios |

Archivos que cambian:

| Archivo | Qué cambia |
|---|---|
| `features/esaviCase/CaseWizardActionBar.tsx` | Botón «Anterior» y el reparto de la fila de botones |
| `features/esaviCase/steps.ts` | `findPreviousRequiredStep()` |
| `features/esaviCase/InvestigationStep.tsx` | `getPendingFields()` real, agregado por sección |
| `features/investigation/schemas.ts` | `InvestigationSectionHandle.getPendingFields` y los `completeSchema` |
| Las secciones de `features/investigation/` con pendientes | Devuelven los suyos por el handle |
| `features/investigation/BasicInfoSection.tsx` | Además, el aviso de estado «Desconocido» |
| `src/locales/{es,en,nl}.json` | Las claves de §3.8 |

`findNextRequiredStep()` vive hoy dentro de `CaseWizardActionBar.tsx:37-47`. Se **mueve a `steps.ts`** junto a su simétrico: la barra no es el sitio de la aritmética de pasos, y `steps.ts` ya tiene `isStepRequired`, `isStepUnlocked` y `getPrecedingStepSlug`.

### 3.2 Endpoints consumidos

**Ninguno nuevo.** Retroceder es un `navigate()` sobre una ruta que ya existe, y las cuatro listas satélite ya se leen en esta misma pantalla.

```
GET /api/case-workflows/case/:id                               ESAVI-CASEFLOW-006    USER
GET /api/investigation-team-members/investigation/:id           ESAVI-INVTEAM-002A    USER
GET /api/investigation-diagnostics/investigation/:id            ESAVI-INVDIAG-002A    USER
GET /api/investigation-vaccines-administered/investigation/:id  ESAVI-INVVACAD-002A   USER
GET /api/evaluation-institutions/investigation/:id              ESAVI-EVALINST-002A   USER
```

**Las cuatro lecturas no añaden ni una petición.** Son las mismas claves y los mismos parámetros que el aviso de secciones vacías de SPEC FE13e §3.6 ya ejecuta, y que las propias `<TeamMemberList>`, `<DiagnosticList>`, `<VaccineAdministeredList>` y `<EvaluationInstitutionList>` ejecutan cuando su sección es visible. TanStack Query sirve la misma entrada de caché.

**No se consume `ESAVI-CASEFLOW-007`** (completar etapa) de otra manera: `useCompleteStage` se queda exactamente como está. La lista informa, no cambia lo que se envía.

### 3.3 Tipos y contratos del cliente

Dos interfaces del cliente cambian. Ninguna es del contrato del backend, así que **`contracts/` no se toca y no hace falta `npm run contracts:sync`**.

```ts
// features/investigation/schemas.ts — antes
export interface InvestigationSectionHandle {
  save: () => Promise<void>;
  isDirty: boolean;
}

// después
export interface InvestigationSectionHandle {
  save: () => Promise<void>;
  isDirty: boolean;
  getPendingFields?: () => string[];   // ya traducidas, con prefijo de sección
}
```

`CaseWizardStepHandle` de `features/esaviCase/CaseWizardContext.tsx:5-9` **no cambia**. Ya declara `getPendingFields(): string[]`; el paso de investigación simplemente deja de devolver `[]`. Es la razón por la que el aviso de «Desconocido» va dentro de la sección y no en la barra (§3.5): meterlo en la barra obligaría a ampliar un contrato que comparten los siete pasos.

Las cadenas que viajan por `getPendingFields()` son **texto ya traducido**, no claves: es lo que hacen hoy los otros tres pasos, y lo que `CaseWizardActionBar.tsx:137` pinta tal cual.

### 3.4 Contrato de estado

Nada nuevo se persiste y nada nuevo se guarda. Todo lo que este spec añade es **derivado en render**.

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Paso activo del wizard | URL | `/esavi-cases/:id/wizard/:step` | Ya existe; «Anterior» sólo llama a `navigate()` |
| Etapas y estado del expediente | TanStack Query | `['caseWorkflow', caseId]` | `ESAVI-CASEFLOW-006`; decide `isStepRequired` y `isClosed` |
| Handle del paso activo | Contexto React | `CaseWizardContext` | Efímero, se registra al montar y se limpia al desmontar |
| Handles de las 17 secciones | `useState` de `InvestigationStep` | `sectionHandles` | Ya existe (`InvestigationStep.tsx:493-495`); gana `getPendingFields` |
| `pendingFields` del paso | **Derivado** | Se calcula en render | No vive en ninguna capa: ni `useState`, ni store, ni caché |
| Valores de cada formulario de sección | React Hook Form | `watch()` de la propia sección | Estado del formulario, no copia del servidor |
| Las cuatro listas satélite | TanStack Query | Las claves que ya usan sus `<...List>` | Sólo se lee `count`; no se copia a ningún sitio |
| Slug destino del diálogo de cambios sin guardar | `useState` del componente | `pendingNavigation` | Ya existe; «Anterior» lo reutiliza sin añadir otro |
| Aviso de «Desconocido» descartado | — | **No se recuerda** | Ver abajo |

Tres puntos que el spec cierra explícitamente:

- **`pendingFields` es derivado, nunca almacenado.** Se recalcula en cada render a partir de los valores del formulario y del `count` de las listas. Guardarlo en un estado obligaría a sincronizarlo, que es exactamente el bug que §7 de `CONVENTIONS.md` previene. La única concesión es el `pendingFieldsRef` que ya usan los otros tres pasos, y **no es caché**: es la forma de que `registerStep` no se vuelva a llamar en cada tecla (`NotificationStep.tsx:892-898`). Investigación replica ese patrón.
- **Nada se invalida.** Retroceder no invalida ninguna clave: el dato del paso anterior ya está en caché, el `PUT` del backend es diferencial y volver a un paso sin tocarlo no produce ni `UPDATE` ni entrada de auditoría.
- **El aviso de «Desconocido» no se recuerda entre visitas.** A diferencia del aviso de muerte, que sí tiene `deathWarningDismissed` (`BasicInfoSection.tsx:183`), éste no se puede descartar: no hay nada que descartar, es una frase bajo el desplegable. Si más adelante se decide que sea descartable, eso es `useState` de la sección y no cambia esta tabla.

### 3.5 Formularios y validación

**«Anterior» no valida nada.** Es navegación: no envía, no comprueba el formulario y no depende de `pendingFields`. Lo único que respeta es el `AlertDialog` de cambios sin guardar, exactamente como «Siguiente» (`CaseWizardActionBar.tsx:111-125`).

**Los seis pendientes del paso 5.** En orden de aparición de sección, que es el orden en que se listan:

| # | Sección | Entrada | Condición para estar pendiente |
|---|---|---|---|
| 1 | Información básica | `Información básica · Fecha de inicio de la investigación` | `investigation.investigationStartDate == null` |
| 2 | Información básica | `Información básica · Fecha de fallecimiento` | El estado resuelve a `DEATH` **y** no hay fila `investigationAutopsy` |
| 3 | Equipo de investigación | `Datos del equipo de investigación · Al menos un integrante` | `count === 0` |
| 4 | Instituciones evaluadoras | `Instituciones que evaluaron al paciente · Al menos una institución` | `count === 0` |
| 5 | Diagnósticos | `Diagnóstico final o presuntivo · Al menos un diagnóstico` | `count === 0` |
| 6 | Vacunas administradas | `Vacunas administradas · Al menos una vacuna` | `count === 0` |

**Ninguno bloquea «Guardar», y ninguno bloquea «Completar etapa».** Son obligatorios de proceso en el sentido de `CASE-PROCESS.md` §4.6: se listan y nada más.

**De dónde sale cada uno.** Dos orígenes, no uno:

- **Los cuatro mínimos de lista los calcula `InvestigationStep`.** Ya lee los cuatro `count` en `InvestigationStep.tsx:531-552` para el aviso de secciones vacías de SPEC FE13e. Se reutilizan tal cual; no hay lectura nueva.
- **Los dos de `basicInfo` los reporta la sección**, por el handle. Es la única sección con pendientes de campo, y es la que ya conoce si el bloque de muerte está abierto (`BasicInfoSection.tsx:156-157`) y si la fila de autopsia existe.

**La fecha de fallecimiento sólo puede faltar de una forma.** El bloque de muerte del paso 5 se abre cuando `investigation.statusItemId` resuelve a `DEATH`, y con él abierto `investigationAutopsySaveSchema` ya exige `deathDate` (`features/investigation/schemas.ts:172-176`). La fila de autopsia, por tanto, nunca existe sin fecha: el único hueco es que esa fila no se haya guardado todavía. Es lo que comprueba la entrada 2, y por eso no se solapa con el aviso de incoherencia de muerte que ya vive en `BasicInfoSection.tsx:180-184`.

**`getPendingFields` es opcional** en `InvestigationSectionHandle`, y el agregador resuelve con `?? []`. Con una sola sección reportando, la alternativa sería obligar a las diez secciones que hoy registran handle a escribir `() => []`: ruido sin información.

**Un `completeSchema`, no once.** Sólo `basicInfo` tiene obligatorios de proceso de campo, así que sólo aparece `investigationBasicInfoCompleteSchema` en `features/investigation/schemas.ts`. Los mínimos de lista no son campos de ningún formulario: son predicados sobre un `count`, y viven junto a él. Escribir un `completeSchema` vacío para las otras dieciséis secciones sería un artefacto que no dice nada.

**Los `*SaveSchema` no se tocan.** Las reglas condicionales del paso 5 —bandera/explicación, compuerta del conglomerado, compuerta de evento similar, las cuatro de autopsia— siguen siendo bloqueantes de guardado y siguen donde están. Este spec sólo añade el segundo nivel.

**El aviso de «Desconocido»**, en `BasicInfoSection`, bajo el desplegable de estado, con el patrón del aviso de muerte que ya vive ahí (`BasicInfoSection.tsx:180-184`). Aparece cuando el estado resuelve al ítem `value: '0'`. **No es un pendiente** y no entra en la lista de la barra: `CASE-PROCESS.md:1241` dice expresamente que el estado no es obligatorio en pantalla, porque el servidor lo rellena solo. El aviso sólo señala que quedó el valor por defecto y que puede ser un olvido.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Carga del workflow | La barra entera devuelve `null` (`CaseWizardActionBar.tsx:66-68`). Sin cambios | — |
| **Carga de las cuatro listas** | **Sus entradas no se listan todavía** | — |
| Sin pendientes | La lista no se pinta; la barra queda con sus botones | — |
| Con pendientes | El bloque de `CaseWizardActionBar.tsx:130-141`, sin cambios de forma | `caseWizard.actions.pendingFieldsTitle` |
| Primer paso | «Anterior» visible y deshabilitado | `caseWizard.actions.previous` |
| Expediente `CLOSED` | «Anterior» y «Siguiente»; ni «Guardar» ni «Completar etapa»; la lista no se pinta | — |
| Error al leer una lista | Su entrada no se lista | — |

**La fila de carga es una regla, no una nota.** `(teamMembers.data?.count ?? 0) === 0` es `true` mientras la petición está en vuelo, así que afirmar el pendiente durante la carga haría parpadear «falta al menos un integrante» en cada entrada al paso, incluso con cuatro listas llenas. La entrada se omite hasta que su lectura resuelve. Un error de lectura se comporta igual: **no se afirma lo que no se sabe**. Es la misma prudencia que el stepper aplica con `flags === null` (`CaseWizardActionBar.tsx:34-36`), en la dirección que aquí corresponde.

### 3.7 Responsividad y accesibilidad

- La fila de botones pasa de `flex flex-wrap justify-end gap-2` a **`justify-between`**, con «Anterior» solo a la izquierda y los otros tres agrupados a la derecha. Es el cambio mínimo: ni se reordenan los tres actuales, ni cambia su variante, ni cambia el contenedor `sticky` de la barra.
- «Anterior» lleva `variant="ghost"` y `size="touch"`, los mismos 44px del resto (`CONVENTIONS.md` §10.2). `ghost` porque es la acción menos prominente de las cuatro, y porque «Siguiente» debe seguir siendo el único botón sólido.
- **A 375px hay cuatro botones donde antes había tres.** `flex-wrap` se conserva: cuando la fila no cabe, los botones bajan de línea. Se verifica a mano en el ancho de 375px, y el body no hace scroll horizontal (`CONVENTIONS.md` §10.2).
- «Anterior» es un botón con texto, sin icono obligatorio: no necesita `aria-label`. Si se le añade un chevron, va con `aria-hidden` (`CONVENTIONS.md` §10.3).
- Deshabilitado en el primer paso sale del orden de tabulación, que es el comportamiento correcto: no hay destino al que ir.
- La lista de pendientes ya es un `<ul>` con `<li>` y no cambia de marcado.

### 3.8 Claves i18n nuevas

Van a los **tres** archivos: `src/locales/{es,en,nl}.json`.

| Clave | Uso | Texto en `es` |
|---|---|---|
| `caseWizard.actions.previous` | Etiqueta del botón | `Anterior` |
| `investigation.pending.investigationStartDate` | Pendiente 1 | `Fecha de inicio de la investigación` |
| `investigation.pending.deathDate` | Pendiente 2 | `Fecha de fallecimiento` |
| `investigation.pending.atLeastOneTeamMember` | Pendiente 3 | `Al menos un integrante` |
| `investigation.pending.atLeastOneInstitution` | Pendiente 4 | `Al menos una institución` |
| `investigation.pending.atLeastOneDiagnostic` | Pendiente 5 | `Al menos un diagnóstico` |
| `investigation.pending.atLeastOneVaccine` | Pendiente 6 | `Al menos una vacuna` |
| `investigation.pending.entry` | El prefijo | `{{section}} · {{field}}` |
| `investigation.basicInfo.statusUnknownWarning` | Aviso de «Desconocido» | `El estado quedó en «Desconocido», el valor por defecto. Compruébalo si no es el que corresponde.` |

`investigation.pending.*` replica el espacio de nombres que notificación ya tiene (`notification.pending.*`), con etiquetas cortas: las de `investigation.basicInfo.*` y `investigation.autopsy.*` son la pregunta completa del formulario —*«Si la persona murió, indique la fecha de la muerte»*— y no sirven para una lista.

Los nombres de sección del prefijo **no son claves nuevas**: se reutilizan `investigation.basicInfo.title`, `investigation.team.sectionTitle`, `investigation.evaluationInstitution.title`, `investigation.diagnostic.title` e `investigation.vaccinesAdministered.title`, que son exactamente las que `InvestigationStep.tsx:546-552` ya usa para el aviso de secciones vacías.

`npm run i18n:check` exige paridad exacta en los tres idiomas.

---

## 4. Plan de implementación

Seis pasos. Cada uno se puede committear solo y deja el proyecto compilando.

1. **La aritmética de pasos, en su sitio.** Mover `findNextRequiredStep()` de `CaseWizardActionBar.tsx:37-47` a `features/esaviCase/steps.ts` y escribir junto a él `findPreviousRequiredStep(currentIndex, stages, flags)`: recorre hacia atrás desde `currentIndex - 1` y devuelve el primer paso que `isStepRequired` deja pasar, o `null` si no hay ninguno. No comprueba `isStepUnlocked` — un paso anterior está desbloqueado por definición. Con `flags === null` todo paso es requerido, igual que su simétrico.
   *Verificación:* pruebas de `steps.ts` — desde `investigation` devuelve `notification`; desde el primer paso devuelve `null`; con el paso 5 o el 6 ocultos por `isStepRequired`, retroceder desde `closure` los salta y no aterriza en un paso escondido.

2. **El botón «Anterior».** En `CaseWizardActionBar.tsx`: la clave `caseWizard.actions.previous` en los tres idiomas, la fila a `justify-between`, y el botón `variant="ghost" size="touch"` a la izquierda, con `disabled` cuando `findPreviousRequiredStep()` devuelve `null`. Se renderiza siempre, también con `isClosed`. `handlePrevious()` reutiliza `pendingNavigation` y el `AlertDialog` existentes; no se añade un segundo diálogo ni un segundo estado.
   *Verificación:* desde `notification` el botón vuelve a `classification`; en `patient` está visible y deshabilitado; con el expediente `CLOSED` se ven «Anterior» y «Siguiente» y no se ven «Guardar» ni «Completar etapa»; con el formulario sucio, pulsar «Anterior» abre el diálogo y confirmar navega. A 375px la fila envuelve y el body no hace scroll horizontal.

3. **El contrato y el schema de investigación.** En `features/investigation/schemas.ts`: `getPendingFields?: () => string[]` en `InvestigationSectionHandle`, y `investigationBasicInfoCompleteSchema` con los dos obligatorios de proceso de §3.5 — `investigationStartDate` presente, y la fecha de fallecimiento cuando el bloque de muerte está abierto y no hay fila de autopsia. Más las nueve claves i18n de §3.8 en los tres idiomas.
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` en 0; pruebas de `schemas.test.ts` sobre las dos reglas; `npm run i18n:check` en 0. Nada cambia todavía en pantalla.

4. **`BasicInfoSection` reporta lo suyo.** La sección añade `getPendingFields` a su handle, construido con `investigation.pending.entry` sobre `investigation.basicInfo.title`. Con el mismo cambio entra el aviso de «Desconocido» bajo el desplegable de estado, con el patrón del aviso de muerte que ya vive en el archivo.
   *Verificación:* pruebas de `BasicInfoSection.test.tsx` — sin fecha de inicio devuelve su entrada; con el estado en `DEATH` y sin fila de autopsia devuelve las dos; con la fila de autopsia guardada devuelve sólo la primera; el aviso aparece con el ítem `value: '0'` y no con ningún otro.

5. **La agregación en `InvestigationStep`.** Sustituir `getPendingFields: () => []` (`InvestigationStep.tsx:521`) por la concatenación, en orden de sección: primero los de `sectionHandles`, después las cuatro entradas de lista derivadas de los `count` que el archivo ya lee en las líneas 531-552. **Cada entrada de lista se omite mientras su lectura no haya resuelto o haya fallado.** El resultado se pasa por el mismo `pendingFieldsRef` que usan los otros tres pasos, para que `registerStep` no se vuelva a llamar en cada tecla.
   *Verificación:* con las cuatro listas vacías y sin fecha de inicio, la barra lista seis pendientes en el orden de §3.5; con todo completo no se pinta el bloque; en la primera entrada al paso no parpadea ningún pendiente de lista antes de que lleguen los datos; el aviso de secciones vacías de SPEC FE13e sigue apareciendo donde estaba y con su propio texto.

6. **Las pruebas de la barra.** `CaseWizardActionBar.test.tsx` gana los casos de «Anterior» —primer paso, paso intermedio, `CLOSED`, formulario sucio— y `InvestigationStep.test.tsx` los de la lista agregada.
   *Verificación:* `npm run check` en 0.

---

## 5. Criterios de aceptación

- [ ] `findPreviousRequiredStep()` vive en `steps.ts` junto a `findNextRequiredStep()`, y `CaseWizardActionBar.tsx` ya no declara ninguna de las dos.
- [ ] Desde cualquier paso intermedio, «Anterior» navega al paso anterior requerido; nunca aterriza en un paso que `isStepRequired` deja fuera.
- [ ] En `patient`, «Anterior» se renderiza y está deshabilitado.
- [ ] Con el expediente `CLOSED` se ven «Anterior» y «Siguiente», y no se ven «Guardar» ni «Completar etapa».
- [ ] Con el formulario sucio, «Anterior» abre el mismo `AlertDialog` que «Siguiente»; el componente no declara un segundo estado de navegación pendiente.
- [ ] En el paso de investigación, con las cuatro listas vacías y sin fecha de inicio, la barra lista los seis pendientes de §3.5, en ese orden y con prefijo de sección.
- [ ] Entrar al paso de investigación con las cuatro listas llenas no pinta ningún pendiente en ningún momento, tampoco durante la carga.
- [ ] Con el estado en `DEATH` y la fila de autopsia guardada, «Fecha de fallecimiento» no aparece como pendiente.
- [ ] El aviso de secciones vacías de SPEC FE13e sigue apareciendo, con su texto y en su sitio.
- [ ] El aviso de «Desconocido» aparece bajo el desplegable de estado sólo con el ítem `value: '0'`, y no entra en la lista de pendientes.
- [ ] «Completar etapa» sigue habilitado con pendientes en la lista: ninguno bloquea.
- [ ] Ningún `*SaveSchema` de `features/investigation/schemas.ts` cambia.
- [ ] `grep -rn "getPendingFields: () => \[\]" src/features/esaviCase/` no devuelve resultados.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque obligatorio de cierre:**

- [ ] **Tema oscuro.** La barra y el aviso se ven correctos en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/esaviCase/CaseWizardActionBar.tsx src/features/investigation/BasicInfoSection.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** A 375px los cuatro botones envuelven sin desbordar, cada uno mide 44px de alto, y el body no hace scroll horizontal.
- [ ] **Rol bajo.** Con `USER` el paso de investigación se comporta igual: las cuatro listas son `002A` de rol `USER` y ninguna entrada de la lista de pendientes depende de un rol superior. Un `403` inesperado en cualquiera de las cuatro lecturas omite su entrada, no deja la barra en blanco.
- [ ] **Sin literales.** Las nueve claves de §3.8 están en los tres idiomas; ningún texto visible fuera de i18n.
- [ ] **Estado en una sola capa.** `pendingFields` se deriva en render; no aparece en ningún `useState`, store ni clave de caché. El único `useRef` es el que evita el re-registro del handle.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** un solo spec para las dos cosas. Ambas cambian la misma barra de acciones, ninguna toca endpoints y el usuario lo pidió expresamente. Partirlas habría duplicado el contexto sin separar nada.
- **Sí:** spec propio en vez de enmendar SPEC FE08. FE08 está `Implementado`; reabrirlo pierde la trazabilidad de qué se construyó cuándo.
- **Sí:** «Anterior» a la izquierda, con `justify-between`. Es el reparto de la captura que originó la petición durante FE11, y no obliga a reordenar ni a cambiar la variante de los tres botones que ya estaban.
- **Sí:** deshabilitado en el primer paso, no oculto. Ocultarlo hace que la barra cambie de forma al entrar y salir del primer paso, que es justo lo que se pidió evitar.
- **Sí:** «Anterior» también con el expediente `CLOSED`. Es donde más se usa: el wizard cerrado es de sólo lectura (`CASE-PROCESS.md:198`) y recorrerlo hacia atrás es el uso principal al revisar un caso. Sin él se podría avanzar por un expediente cerrado pero no volver.
- **Sí:** `findPreviousRequiredStep()` simétrico, en vez de `currentIndex - 1`. El literal aterriza en pasos que `isStepRequired` oculta, que es exactamente el bug que `findNextRequiredStep()` ya evita en la otra dirección.
- **No:** comprobar `isStepUnlocked` al retroceder. Un paso anterior está desbloqueado por definición; añadir la comprobación sólo abre la puerta a un «Anterior» deshabilitado sin motivo visible.
- **No:** invalidar la caché del paso al que se vuelve. El dato ya está en TanStack Query, el `PUT` del backend es diferencial y volver a un paso sin tocarlo no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría. Invalidar sería gastar una petición para obtener lo mismo.
- **No:** un segundo `AlertDialog` o un segundo estado de navegación pendiente. `pendingNavigation` ya guarda el slug destino; sirve igual hacia atrás.
- **Sí:** mover `findNextRequiredStep()` a `steps.ts`. Estaba en la barra porque era la única que lo usaba; con dos funciones simétricas, la aritmética de pasos pertenece al archivo que ya tiene `isStepRequired`, `isStepUnlocked` y `getPrecedingStepSlug`.
- **Sí:** los seis pendientes de §3.5 y no más. En investigación **el backend no exige ninguna columna** (`CASE-PROCESS.md:1256`, `:1307`, `:1962`): no hay una lista de obligatorios que copiar del validador, como sí la había en notificación. Todo lo que exige es condicional y ya es bloqueante de guardado. Los seis son, por tanto, una decisión de producto tomada explícitamente, no una derivación.
- **No:** listar toda pregunta `answerOption` sin responder, que era el equivalente literal de lo que hace notificación con `hasRelevantMedicalHistory` y `takesMedication`. En un paso de diecisiete secciones la lista habría sido larguísima y habría convertido un recordatorio en un interrogatorio, que es lo que `CASE-PROCESS.md` §4.6 previene.
- **No:** una entrada por sección sin fila creada. Se solapa con el aviso de secciones vacías de SPEC FE13e, que se conserva tal cual por decisión expresa.
- **No:** `statusItemId` como pendiente. `CASE-PROCESS.md:1241` es explícito: *«En pantalla, el estado no es un campo obligatorio»*, porque el servidor lo rellena solo con «Desconocido». Marcarlo obligatorio obligaría al investigador a elegir «Desconocido» a mano. Se cubre con un aviso, que es información sin imposición.
- **Sí:** el aviso de «Desconocido» en la sección y no en la barra. Ponerlo en la barra obligaría a añadir `getWarnings?: () => string[]` a `CaseWizardStepHandle`, un contrato que comparten los siete pasos — un cambio grande por un aviso de un solo campo. En la sección reutiliza el patrón del aviso de muerte que ya vive en el mismo archivo.
- **Sí:** `getPendingFields` opcional en `InvestigationSectionHandle`. Sólo `basicInfo` tiene pendientes de campo; obligar a las otras diez secciones que registran handle a escribir `() => []` es ruido sin información.
- **Sí:** un solo `completeSchema`, el de `basicInfo`. Los cuatro mínimos de lista son predicados sobre un `count`, no campos de un formulario: viven donde ya se lee el `count`, no en un schema Zod vacío.
- **No:** añadir la fecha de inicio de la investigación al `saveSchema`. Endurecer lo bloqueante de guardado es otra decisión y otro tamaño; aquí sólo se añade el nivel de proceso.
- **No:** bloquear «Completar etapa» cuando hay pendientes. `CASE-PROCESS.md` §4.6 lo prohíbe en sus propias palabras: *«un botón apagado sin explicación es la peor versión de esta regla»*. La lista informa; el backend decide.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Los cuatro `count` valen `0` mientras la petición está en vuelo, así que la lista parpadearía con cuatro pendientes falsos en cada entrada al paso | La entrada se omite hasta que su lectura resuelve (§3.6). Es un criterio de aceptación, no una nota |
| `getPendingFields` recalculado en cada tecla reabre el `CaseWizardProvider` y produce un bucle sin fin — le pasó a `ClassificationStep` una vez (SPEC FE11 §9) | Se reutiliza el `pendingFieldsRef` de los otros tres pasos: el valor se lee por referencia y `registerStep` sólo se vuelve a llamar cuando cambia `isDirty` |
| Cuatro botones donde había tres desbordan a 375px | `flex-wrap` se conserva; se verifica a mano a 375px y está en el bloque obligatorio de cierre |
| «Anterior» en un expediente `CLOSED` sugiere que se puede editar | En `CLOSED` no se renderizan «Guardar» ni «Completar etapa», y el aviso de sólo lectura de `CASE-PROCESS.md:198` sigue en su sitio |

---

## 8. Impacto en pantallas existentes

| Qué | Antes | Después |
|---|---|---|
| `CaseWizardActionBar` | Tres botones, `justify-end` | Cuatro, `justify-between`, con «Anterior» a la izquierda. **Los siete pasos lo heredan** |
| `steps.ts` | `findNextRequiredStep` no está aquí | Las dos funciones simétricas |
| `InvestigationSectionHandle` | `save`, `isDirty` | Más `getPendingFields?`. Las diez secciones que ya registran handle **no cambian**: el método es opcional |
| `BasicInfoSection` | Un aviso (incoherencia de muerte) | Dos: el de muerte y el de estado «Desconocido» |
| `InvestigationStep` | `getPendingFields: () => []` | La agregación de §3.5. El aviso de secciones vacías de FE13e **no cambia** |

Ninguna clave i18n se renombra, ninguna ruta se mueve, ninguna primitiva de `shared/` cambia.

---

## Lo que **no** está en este spec

- Bloquear «Completar etapa» cuando hay campos pendientes.
- Los `computePendingFields` de clasificación, notificación y clasificación final.
- Lista de pendientes en `patient`, `case-opening` y `closure`.
- Ampliar las once comprobaciones de cierre de `caseWorkflow/closeReadiness.ts`.
- Endurecer los `*SaveSchema` de investigación.
- Un `getWarnings()` en `CaseWizardStepHandle`.

Cada uno de esos, si aterriza, va en su propio spec.

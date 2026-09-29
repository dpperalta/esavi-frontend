# SPEC FE26 — Retirada de las entradas «Próximamente» del menú

> **Estado:** Implementado
> **Depende de:** SPEC FE01 (shell y navegación), SPEC FE09 (listado de casos), SPEC F49 del backend (alcance geográfico del caso)
> **Fecha:** 2026-09-28
> **Objetivo:** Quitar del menú las cinco entradas que nunca van a tener un listado propio, junto con el mecanismo de «Próximamente» que sólo ellas usan.

---

## 1. Por qué existe este spec

FE01 §3.1 declaró el menú completo, con diecisiete entradas deshabilitadas, para «ver el mapa de la aplicación desde el primer día» (FE01 §6). Doce de esas entradas ya tienen pantalla. Quedan cinco, todas con `disabled: true` en `shared/config/navigation.ts`:

| Grupo | Entrada | Ruta | Listado del backend |
|---|---|---|---|
| Casos | Pacientes | `/patients` | `ESAVI-PATIENT-002A` |
| Casos | Clasificación final | `/final-classifications` | `ESAVI-FINCLASS-002A` |
| Notificación | Notificaciones | `/notifications` | `ESAVI-NOTIFCN-002A` |
| Notificación | Notificadores | `/notifiers` | `ESAVI-NOTIFIER-002A` |
| Investigación | Investigaciones | `/investigations` | `ESAVI-INVESTGN-002A` |

A las cinco se llega hoy desde el caso: el wizard de FE08–FE14 y la página de resumen de FE09. Ninguna tiene un listado propio. Antes de escribir cinco specs de listado, hay que preguntar qué aportaría cada uno que FE09 no dé ya. La respuesta es nada, y en cuatro de los cinco casos construirlos sería además un retroceso de seguridad.

**A — Un listado transversal reabre lo que F49 cerró.** El control por territorio del SPEC F49 sólo se aplica a `esaviCase`: en el backend, `geoScope` aparece únicamente en `esaviCase.service.ts`. El propio F49 lo reconoce:

- **§2:** las entidades satélite del caso —entre ellas `notification`, `investigation`, `finalClassification` y `notifier`— quedan sin ese control, y `patient` también.
- **§320:** lo que F49 sí cierra es el *descubrimiento*. Sin `ESAVI-CASE-002A` ni `003`, conseguir el `caseId` de un caso ajeno «deja de ser trivial».

`GET /api/notifications` o `GET /api/investigations` sin filtro de `caseId` devuelven filas de todo el país, cada una con su `caseId`. Una pantalla sobre esos listados le entregaría al usuario contenido clínico de casos fuera de su territorio, que es justo lo que F49 quiso evitar. El backend lo permite hoy, pero la interfaz no debe exponerlo.

**B — Lo que sí aportarían es un filtro de casos, no una pantalla.** Evaluación de cada entrada contra FE09:

- **Clasificación final** — el listado sólo filtra por `caseId`. Es una fila por caso, y ya se ve en el caso.
- **Notificadores** — filtra por `caseId`, `professionItemId` y `geoLocationId`. Cada notificador pertenece a un caso; no es un directorio que se reutilice entre casos.
- **Notificaciones** — `notificationType`, `requestInvestigation` y `outcomeItemId` responden preguntas reales («casos graves», «con investigación solicitada»). Pero la pregunta es sobre casos, y su lugar es la barra de filtros de FE09.
- **Investigaciones** — igual con `statusItemId` y la geografía de vacunación. El estado del expediente ya lo cubre la pestaña «Bandeja por estado» de FE09.
- **Pacientes** — `ESAVI-PATIENT-002A` no acepta filtros y ordena por `createdAt`, porque los nombres están cifrados (F05 §164). Sería una lista sin orden útil de datos personales de todo el país. El salto «ver los casos de este paciente» ya existe en FE09 con `?patientId=`.

**C — Cinco entradas muertas sin fecha se leen como una aplicación inacabada.** FE01 aceptó ese riesgo porque cada «Próximamente» iba a llegar. Éstas no van a llegar, y dejarlas promete pantallas que nadie va a construir.

---

## 2. Alcance

**Dentro:**

- **Las cinco entradas salen de `NAVIGATION`:** `nav.items.patient`, `nav.items.finalClassification`, `nav.items.notification`, `nav.items.notifier` y `nav.items.investigation`.
- **Los grupos «Notificación» e «Investigación» salen de `NAVIGATION`.** Se quedan sin hijos, y un grupo sin hijos no se declara. El menú pasa de seis grupos a cuatro: Casos, Catálogos clínicos, Geografía y unidades, y Administración.
- **El mecanismo «Próximamente» desaparece:**
  - el campo `NavItem.disabled`;
  - la rama `item.disabled` de `NavLeaf` en `AppSidebar.tsx`;
  - el test «no navega al hacer click y se anuncia como aria-disabled» de `AppSidebar.test.tsx`;
  - la clave `common.comingSoon`.
- **Las claves i18n huérfanas salen de los tres idiomas** (`es`, `en`, `nl`):
  - `common.comingSoon`;
  - `nav.groups.notification` y `nav.groups.investigation`;
  - las cinco `nav.items.*` de arriba.

  Las claves `caseWizard.groups.*` son otras y **no se tocan**.
- **Los conteos de los tests de navegación se actualizan:** USER pasa de 15 a 10 hijos, ADMIN de 19 a 14 y SUPERADMIN de 20 a 15, en `navigation.test.ts` y en `AppSidebar.test.tsx`.
- **`ARCHITECTURE.md` §5.2** se reescribe a cuatro grupos, con una línea que explica que notificación e investigación se recorren desde el caso. Su bloque de `NavItem` en §5.1 no cambia, porque nunca tuvo `disabled`.
- **FE01** recibe una nota de implementación tras su header, que remite a FE26. Su tabla §3.1 no se reescribe.

**Fuera de alcance (otros specs, o dependencias del backend):**

- **Extender el control por territorio del SPEC F49 a las entidades satélite y a `patient`** (F49 §351). Es un spec del backend. Mientras no exista, ninguna de estas cinco entidades tiene listado en el cliente.
- **Añadir a `ESAVI-CASE-002A`/`002B` filtros por `notificationType`, `requestInvestigation`, estado de la investigación y clasificación final.** Es un spec del backend. Cuando exista, su consumo es una ampliación de FE09, no una entrada de menú nueva. Se suma a la dependencia que FE09 §2 ya dejó anotada para `workflowStatusCode`.
- **Buscador de paciente por nombre en la barra de filtros de FE09** (`ESAVI-PATIENT-007`, alimentando el `patientId` que ya existe). Es una mejora de FE09 con su propio spec, y cubre lo único útil que tendría un listado de pacientes.
- **Reabrir alguna de las cinco entradas** (por ejemplo, «Investigaciones pendientes») cuando llegue el control por territorio. Si hace falta, será un spec nuevo que parta de cero, no una vuelta a `disabled`.
- **La paleta de comandos** (`ARCHITECTURE.md` §5.3). Hoy no existe; cuando se construya, leerá `NAVIGATION` tal como FE26 lo deja.

---

## 3. Diseño

Es un spec transversal: se describe qué cambia, con tablas Antes/Después, en lugar del desglose 3.1–3.7 completo. Se incluyen las sub-secciones que aplican.

### 3.1 Árbol de navegación

**Antes** (seis grupos; se marcan las entradas que se retiran):

| Grupo | Hijos |
|---|---|
| Casos | Registrar · Ver/editar · ~~Pacientes~~ · ~~Clasificación final~~ |
| ~~Notificación~~ | ~~Notificaciones~~ · ~~Notificadores~~ |
| ~~Investigación~~ | ~~Investigaciones~~ |
| Catálogos clínicos | Términos diagnósticos · Vacunas WHODrug · Medicamentos WHODrug · Diluyentes |
| Geografía y unidades | Niveles geográficos · Ubicaciones · Unidades de salud · Importación geográfica |
| Administración | Usuarios · Roles · Tipos de catálogo · Elementos de catálogo · Configuración del sistema |

**Después** (cuatro grupos, quince hijos, todos navegables):

| Grupo | Hijos |
|---|---|
| Casos | Registrar · Ver/editar |
| Catálogos clínicos | sin cambios |
| Geografía y unidades | sin cambios |
| Administración | sin cambios |

Ningún `minLevel` cambia y ningún hijo se reordena. **Inicio** sigue siendo la hoja suelta del primer nivel.

**Hijos visibles por rol:**

| Rol | Antes | Después |
|---|---|---|
| `ANALYTICS` | 0 | 0 |
| `USER` | 15 | 10 |
| `ADMIN` | 19 | 14 |
| `SUPERADMIN` | 20 | 15 |

**Las rutas `/patients`, `/final-classifications`, `/notifications`, `/notifiers` e `/investigations` nunca se registraron** en `router.tsx`. Quien las escriba a mano sigue recibiendo `NotFoundPage`, igual que hoy. No hay redirecciones que añadir.

### 3.2 Endpoints consumidos

**Ninguno.** FE26 no añade ni quita llamadas a la API. Las cinco rutas de listado de la tabla de §1 **no se consumen, y ése es el objeto del spec** (§1A). Las lecturas por caso que hacen hoy el wizard y la página de resumen siguen igual: `ESAVI-NOTIFCN-006`, `ESAVI-INVESTGN-006`, `ESAVI-FINCLASS-006`, `ESAVI-NOTIFIER-*` y `ESAVI-PATIENT-003`/`006`/`007`.

### 3.3 Tipos

**`NavItem` pierde un campo.** No hay nada que traer con `contracts:sync`: `NavItem` es un tipo del cliente, no del contrato.

| Campo | Antes | Después |
|---|---|---|
| `disabled?: boolean` | Marca «coming soon» (FE01 §3.1) | **Eliminado** |
| `key`, `icon`, `path`, `minLevel`, `children` | — | Sin cambios |

El comentario de cabecera de `NavItem` («the 17 entities that don't have a screen yet») sale con el campo.

**`NavLeaf` se queda con una sola rama:** siempre es un `<Link>` dentro de `SidebarMenuButton asChild`. Desaparecen el `aria-disabled`, el `tabIndex={0}`, las clases `cursor-not-allowed opacity-60` y el `<span>` con `common.comingSoon`.

### 3.4 Contrato de estado

**FE26 no introduce ni mueve ningún dato.** El menú es una constante de módulo (`NAVIGATION`), filtrada en cada render por el nivel efectivo que se deriva de `useCurrentUser()`. Eso ya estaba así y no cambia:

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Árbol del menú | Constante de módulo | `NAVIGATION` | Sin estado: es dato, no JSX (`ARCHITECTURE.md` §5.1) |
| Usuario actual | TanStack Query | la clave de `useCurrentUser()`, sin cambios | De ahí sale `getEffectiveLevel(user.roles)` |
| Sidebar colapsado | Zustand | el slice `ui` actual, sin cambios | No lo toca este spec |
| Sección activa | Derivado | `useLocation()` | No lo toca este spec |

### 3.5 Claves i18n

**Salen de `es.json`, `en.json` y `nl.json`, y no entra ninguna:**

| Clave | Motivo |
|---|---|
| `common.comingSoon` | Su único consumidor era la rama `disabled` de `NavLeaf` |
| `nav.groups.notification` | Grupo retirado |
| `nav.groups.investigation` | Grupo retirado |
| `nav.items.patient` · `nav.items.finalClassification` · `nav.items.notification` · `nav.items.notifier` · `nav.items.investigation` | Entradas retiradas |

**No confundir con `caseWizard.groups.notification` y `caseWizard.groups.investigation`**, que usa `CaseWizardStepper.tsx:76-77` y se quedan. Antes de borrar cada clave hay que buscar su ruta completa (por ejemplo `nav.items.notification`) en `src/`: el grep sobre el nombre suelto da falsos positivos.

### 3.7 Responsividad y accesibilidad

No hay cambios de comportamiento. El drawer por debajo de `md`, el colapso con tooltips y el cierre al navegar siguen igual. Lo que desaparece es la regla de FE01 §3.7 sobre ítems deshabilitados («enfocables y anunciados como `aria-disabled`»), porque ya no queda ninguno. **Si en el futuro alguien necesita un ítem no navegable, la regla está escrita en FE01 y se recupera de ahí**, no se deja código latente esperándolo.

---

## 4. Plan de implementación

Los pasos 1 y 2 van juntos en la práctica: al quitar `disabled` del tipo, `AppSidebar.tsx` deja de compilar hasta que pierde su rama. Se separan para que cada uno tenga su propia verificación.

1. **`shared/config/navigation.ts`.**
   - Quitar las cinco hojas y los dos grupos (`nav.groups.notification`, `nav.groups.investigation`).
   - Eliminar el campo `disabled` de `NavItem` con su comentario.
   - Actualizar el comentario de cabecera de `NAVIGATION` («The tree of SPEC FE01 §3.1…») para que cite también FE26.

   *Verificación:* `grep -n "disabled\|/patients\|/notifications\|/notifiers\|/investigations\|/final-classifications" src/shared/config/navigation.ts` no devuelve nada.

2. **`app/layout/AppSidebar.tsx`.** `NavLeaf` se queda con una sola rama, la del `<Link>`. Salen el `if (item.disabled)` y su comentario.

   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` sale en 0 (no `npm run build`: la puerta de `tsc` de `build` no comprueba nada). `grep -rn "comingSoon\|\.disabled" src/app/layout` no devuelve nada.

3. **Tests de navegación.**
   - `navigation.test.ts`: conteos a 10 / 14 / 15, con los títulos de los `it` ajustados («quince», no «veinte»). Se conservan las exclusiones por rol que ya comprueba.
   - `AppSidebar.test.tsx`:
     - conteos y títulos de USER y ADMIN, de «diecisiete» a diez y de «diecinueve» a catorce;
     - eliminar el test «no navega al hacer click y se anuncia como aria-disabled» y su comentario sobre `nav.items.patient`;
     - renombrar el `describe` «hijos deshabilitados» a «hijos navegables». Sus dos tests de FE08 y FE09 se quedan.
   - Añadir a `navigation.test.ts` una comprobación de que ningún grupo de `NAVIGATION` queda con `children` vacío. Es la regla de §2 («un grupo sin hijos no se declara») convertida en test.

   *Verificación:* `npx vitest run src/shared/config/navigation.test.ts src/app/layout/AppSidebar.test.tsx` en verde.

4. **Aserciones de «Próximamente» en los tests de router.** `router.user.test.tsx:109-111`, `router.diagnosticTerm.test.tsx:89`, `router.diluent.test.tsx:84` y `router.vaccineWhodrug.test.tsx:144` comprueban que su ítem no dice «Próximamente». Tras FE26 esa aserción no puede fallar, así que se borra la línea y su comentario. El resto de cada test no se toca: la aserción que importa es que el ítem es un enlace y lleva a su pantalla.

   *Verificación:* `grep -rn "Próximamente\|comingSoon" src` no devuelve nada, y esos cuatro archivos siguen en verde.

5. **Claves i18n** de §3.5, fuera de `es.json`, `en.json` y `nl.json`. Antes de borrar cada una, grep de su ruta completa en `src/`.

   *Verificación:* `npm run i18n:check` sale en 0, y `grep -rn "caseWizard.groups" src/features/esaviCase/CaseWizardStepper.tsx` sigue encontrando sus dos claves.

6. **Documentación.**
   - `references/ARCHITECTURE.md` §5.2: cuatro grupos. Casos pasa a «casos ESAVI (registrar y ver/editar)», y una línea explica que notificación, investigación, clasificación final, notificadores y pacientes se recorren desde el caso, con remisión a FE26 §1.
   - `references/specs/01-auth-shell.md`: nota de implementación justo tras el header, del tipo «Las entradas Pacientes, Clasificación final, Notificaciones, Notificadores e Investigaciones, los grupos Notificación e Investigación y el mecanismo `disabled`/`common.comingSoon` se retiraron en SPEC FE26». El cuerpo no se toca.

   *Verificación:* lectura. `grep -n "Notificación\|Investigación" references/ARCHITECTURE.md` en §5.2 sólo aparece dentro de la línea explicativa.

7. **Cierre.** `npm run check` completo: build, lint, `i18n:check` y test.

   *Verificación:* sale en 0. Si falla el test intermitente de `DiagnosticTermListPage` (`reviewStatus ↔ includeInactive`), se confirma que pasa aislado antes de atribuirlo a FE26: es un fallo conocido, anterior a este spec. A mano, con `npm run dev`, entrando como USER: el menú muestra cuatro grupos y diez hijos, ninguno atenuado; en 375 px, el drawer abre, navega y se cierra igual que antes.

---

## 5. Criterios de aceptación

**Menú**

- [ ] `grep -rn "/patients\|/final-classifications\|/notifications\|/notifiers\|/investigations" src/shared/config/navigation.ts` no devuelve nada.
- [ ] `NAVIGATION` tiene cuatro grupos, `nav.groups.cases`, `clinicalCatalogs`, `geography` y `administration`, más la hoja `nav.home`. Ningún grupo tiene `children` vacío, y lo comprueba un test de `navigation.test.ts`.
- [ ] `filterNavigationByLevel` devuelve 0 / 10 / 14 / 15 hijos para `ANALYTICS` / `USER` / `ADMIN` / `SUPERADMIN`.
- [ ] Ningún `minLevel` de las entradas que se quedan cambia respecto de `main` (`git diff` sobre `navigation.ts` sólo muestra líneas borradas y comentarios).

**Mecanismo «Próximamente»**

- [ ] `NavItem` no tiene campo `disabled`; `grep -rn "item.disabled\|disabled?: boolean" src/shared/config src/app/layout` no devuelve nada.
- [ ] `NavLeaf` renderiza siempre un `<Link>`; `grep -rn "aria-disabled\|cursor-not-allowed" src/app/layout/AppSidebar.tsx` no devuelve nada.
- [ ] `grep -rn "comingSoon\|Próximamente" src` no devuelve nada.

**i18n**

- [ ] Las ocho claves de §3.5 no existen en `es.json`, `en.json` ni `nl.json`, y `npm run i18n:check` sale en 0.
- [ ] `caseWizard.groups.notification` y `caseWizard.groups.investigation` siguen en los tres idiomas, y el stepper del wizard las muestra.

**Documentación**

- [ ] `ARCHITECTURE.md` §5.2 describe cuatro grupos y remite a FE26.
- [ ] `01-auth-shell.md` tiene la nota de implementación tras el header, y su §3.1 está intacta.

**Cierre**

- [ ] `npx tsc --noEmit -p tsconfig.app.json` no reporta errores en los archivos tocados.
- [ ] `npm run check` sale en 0. El test intermitente conocido de `DiagnosticTermListPage` pasa aislado si falla en la suite.
- [ ] **Tema oscuro.** El sidebar se ve correcto en `dark`, y FE26 no añade ninguna clase de color (`git diff` de `AppSidebar.tsx` sólo quita clases).
- [ ] **Por debajo de `md`.** A 375 px, el drawer abre, lista los cuatro grupos, navega y se cierra al navegar y con `Escape`.
- [ ] **Rol bajo.** Con `USER`, el menú muestra diez hijos navegables y ninguno lleva a una ruta que responda `403` o `NotFoundPage`. Con `ANALYTICS`, sólo Inicio.
- [ ] **Sin literales.** FE26 no añade texto visible, sólo borra claves.
- [ ] **Estado en una sola capa.** No se introduce estado nuevo; §3.4 se cumple sin cambios.

---

## 6. Decisiones tomadas y descartadas

- **Sí: un solo spec que retira las cinco entradas, en vez de cinco specs de listado.** Cada entrada se evaluó contra FE09 (§1B), y ninguna aporta una pregunta que no sea en realidad un filtro de casos. Escribir cinco specs para concluir cinco veces lo mismo es más caro que decirlo una vez con las cinco razones.
- **Sí: el motivo principal es la seguridad, no la utilidad.** Aunque alguno de los listados fuera útil, mientras el SPEC F49 no se extienda a las entidades satélite, construirlo desharía en el cliente lo que F49 cerró en el descubrimiento (§1A). El backend sigue siendo la autoridad, pero la interfaz no ofrece un camino que el backend sólo deja abierto porque aún no lo ha cerrado.
- **Sí: se elimina el mecanismo `disabled`/`common.comingSoon`, no se conserva latente.** Sin ningún ítem que lo use, es código sin consumidor y una clave huérfana en tres idiomas. FE01 lo justificó para «ver el mapa de la aplicación desde el primer día», y ese objetivo ya se cumplió. Si vuelve a hacer falta, la regla de accesibilidad está escrita en FE01 §3.7.
- **Sí: se retiran los grupos «Notificación» e «Investigación».** Un grupo sin hijos no se declara, aunque `filterNavigationByLevel` ya lo descartaría. Que el filtro tape un grupo vacío es un accidente, no un diseño.
- **Sí: se actualiza `ARCHITECTURE.md` §5.2, y FE01 recibe una nota en vez de una reescritura.** `ARCHITECTURE.md` describe el sistema vigente y tiene que coincidir con el menú. Los specs son históricos, y la plantilla manda anotar las desviaciones con una nota tras el header.
- **Sí: se borran las aserciones «no dice Próximamente» de los cuatro tests de router.** Tras FE26 no pueden fallar, y una aserción que no puede fallar no comprueba nada: sólo confunde a quien lee el test.
- **Sí: se añade un test de «ningún grupo vacío».** Es la única regla nueva que introduce FE26, y un test es la única forma de que no se pierda.
- **Descartado: dejar las entradas «Próximamente» a la espera de los specs del backend.** Si esos specs llegan, su consumo natural es un filtro de FE09, no estas entradas. Mantenerlas promete una pantalla que el diseño ya descartó.
- **Descartado: un listado de pacientes con `ESAVI-PATIENT-007` como buscador.** Busca por nombre sobre datos cifrados de todo el país y no aporta nada que no dé la cápsula `?patientId=` de FE09 alimentada por ese mismo buscador. Queda como mejora posible de FE09 (§2).
- **Descartado: redirigir las cinco rutas a `/esavi-cases`.** Nunca se registraron en `router.tsx`, así que nadie tiene un enlace guardado a ellas. Una redirección haría creer que la ruta existió.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Borrar una clave i18n que otro sitio sí usa: `notification` e `investigation` aparecen bajo varios prefijos (`caseWizard.groups.*`, `esaviCase.*`) | Grep de la **ruta completa** de cada clave antes de borrarla (paso 5). `i18n:check` detecta las claves que el código pide y no existen. Hay un criterio de aceptación explícito sobre las dos claves de `caseWizard.groups.*` |
| Un usuario echa de menos una entrada que veía, aunque nunca funcionó | No se pierde ninguna funcionalidad: las cinco eran `aria-disabled`, y las cinco entidades siguen accesibles desde el caso. Es una limpieza visual, no una retirada de capacidad |
| Que alguien lea FE26 como «estos listados están prohibidos para siempre» | §2 lo deja abierto: cuando el backend extienda el control por territorio, un spec nuevo puede proponer una pantalla. Lo que FE26 cierra es la vía de dejarlas pendientes indefinidamente |
| Que el test intermitente de `DiagnosticTermListPage` se atribuya a FE26 | El paso 7 obliga a correrlo aislado antes de sacar conclusiones |

---

## 8. Impacto en pantallas existentes

| Pantalla o archivo | Cambio |
|---|---|
| `AppSidebar` (todas las pantallas autenticadas) | Cuatro grupos en lugar de seis; ningún ítem atenuado |
| `CaseWizardStepper` | **Ninguno.** Sus claves `caseWizard.groups.*` se quedan |
| Página de resumen del caso (FE09) y wizard (FE08–FE14) | **Ninguno.** Siguen siendo la vía de acceso a las cinco entidades |
| `router.tsx` | **Ninguno.** Las cinco rutas nunca existieron |

---

## Lo que **no** está en este spec

- El control por territorio de F49 sobre las entidades satélite y `patient`: es un spec del backend.
- Los filtros de gravedad, investigación solicitada, estado de la investigación y clasificación final en `ESAVI-CASE-002A`: es un spec del backend, más una ampliación de FE09 cuando exista.
- El buscador de paciente por nombre en los filtros de FE09.
- La paleta de comandos.
- Cualquier pantalla nueva para las cinco entidades.

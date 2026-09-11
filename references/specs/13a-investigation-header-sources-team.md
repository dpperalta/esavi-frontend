# SPEC FE13a — Paso 5: cabecera de la investigación, fuentes, equipo y autopsia

> **Estado:** Aprobado
> **Depende de:** SPEC FE08 (armazón del asistente, `CaseWizardActionBar`, sólo lectura si `CLOSED`), SPEC FE12a (la cadena guardar/completar de un paso y `<AnswerOptionField>`), SPEC FE12e (`<SatelliteList>` y el patrón de diálogo satélite), SPEC FE12f (`useProgressiveSections`, el revelado por secciones que este spec replica), SPEC F58 del backend (la investigación y sus satélites)
> **Fecha:** 2026-09-10
> **Objetivo:** Que el paso 5 deje de ser un marcador de posición y abra la investigación con sus tres primeras secciones — fuentes de información, información básica con el bloque de muerte y autopsia, y equipo investigador.

---

## 1. Por qué existe este spec

**A — El paso 5 está enrutado y vacío.** `CaseWizardPage.tsx:136-143` desbloquea el slug `investigation` cuando `notification.exists === true` y pinta el nombre del paso dentro de un contenedor vacío. El stepper ya lo lista, la reanudación ya lo alcanza y `ESAVI-CASEFLOW-006` ya informa de su etapa: lo único que falta es la pantalla.

**B — Es el primer bloque de los cuatro del paso 5, y el que fija sus patrones.** `CASE-PROCESS.md` §5.5.0 describe la investigación como una cabecera y catorce satélites en cuatro formas distintas. Las cuatro tablas de este spec estrenan tres de ellas: la cabecera 1:N con el caso, dos satélites **1:1 con PK = FK** —`investigationSource` e `investigationAutopsy`— y una lista `N` con identidad propia —`investigationTeamMember`—. Lo que aquí se decida sobre cómo se crea una fila 1:1, cómo se limpia en vez de borrarse y cómo se envía el `investigationId` en el cuerpo del `POST`, lo repiten FE13b, FE13c y FE13d ocho veces más.

**C — Las filas 1:1 del paso 5 no tienen `isActive`, y eso cambia el ciclo de vida que el repositorio da por supuesto.** No hay `005A` ni `005B`: sólo `005C`, purga física, SUPERADMIN. El asistente **crea y limpia; no borra** (§5.5.0). Es la misma regla que `notificationPregnancy` en el paso 4, pero aquí deja de ser una excepción y pasa a ser la forma normal de trabajar.

**D — La muerte se declara dos veces y el backend no las cruza, con razón.** `notification.deathDate` (paso 4) e `investigationAutopsy.deathDate` (paso 5) son la misma fecha en dos tablas. `CASE-PROCESS.md` §6.6 razona por qué eso no es un error que haya que impedir: un paciente puede morir **después** de notificar, y ése es exactamente el desenlace que la vigilancia no puede permitirse perder. La pantalla tiene que precargar, avisar y **no bloquear**.

**E — El lugar de vacunación se captura en un mapa, y el mapa no existe.** `ESAVI-FORM.md` A1 §2 pide la dirección del lugar de vacunación sobre un mapa; `vaccinationLatitude` y `vaccinationLongitude` son las columnas detrás. `<MapPointPicker>` está declarado en `ARCHITECTURE.md` §4.3 y no está escrito. Este spec lo escribe, y con él entra la **única dependencia externa nueva de todo el proceso del caso**: `leaflet`.

---

## 2. Alcance

**Dentro:**

- **La fila `investigation` se crea al entrar al paso**, con un `POST` vacío si `stages.investigation.exists === false` (`ESAVI-CASEFLOW-006`). Ninguna columna de datos es obligatoria, así que la cabecera existe desde el primer segundo y los tres satélites quedan operativos sin esperar a un guardado.
- **Sección «Fuentes de información»** (`ESAVI-FORM.md` §1): las ocho banderas tri-estado de `investigationSource` y `otherDescription` detrás de `other`.
- **Sección «Información básica»** (A1): las diez columnas de datos de `investigation` — estado, lugar de vacunación, unidad de salud, nivel geográfico, las dos fechas, las dos coordenadas sobre el mapa y las observaciones.
- **El bloque de muerte y autopsia dentro de A1** (6.1–6.7): las nueve columnas de `investigationAutopsy`, visible cuando el estado de la investigación resuelve a `value === 'DEATH'`, con `isDeath` fijo en `true` y las cuatro reglas de coherencia validadas en el cliente antes de enviar.
- **La precarga de `deathDate` desde `notification.deathDate`**, siempre editable, y el aviso **no bloqueante** de §6.6 cuando el desenlace del paso 4 no es muerte o las dos fechas difieren, con enlace al paso 4.
- **Sección «Equipo de investigación»** (A2): `<SatelliteList>` sobre `investigationTeamMember` con diálogo de alta y edición, y la guarda de duplicado sobre `fullName` normalizado leída del `409`.
- **`<MapPointPicker>` en `shared/components/`**, con `leaflet`, `VITE_MAP_TILE_URL` y `VITE_MAP_DEFAULT_CENTER`, la atribución de OSM visible y el centro inicial derivado del `geoLocation` elegido con caída al centro por defecto.
- **El revelado progresivo de FE12f**, `useProgressiveSections` tal cual: las dos primeras secciones llevan «Guardar y continuar»; la tercera se revela con el segundo avance y por debajo manda `CaseWizardActionBar`. Al reentrar en un paso que ya existía, todo visible y ningún botón intermedio.
- **Los cuatro contratos sincronizados** —`investigation`, `investigationSource`, `investigationTeamMember`, `investigationAutopsy`— más sus cuatro respuestas declaradas a mano en `contracts/declared/`.
- **Las claves i18n nuevas bajo `investigation.*`**, en los tres idiomas.
- **Tests**: los schemas Zod con sus reglas cruzadas, el `<MapPointPicker>`, la lista de equipo y el recorrido de integración del paso — alta, reentrada, cambio de estado a muerte y vuelta, y expediente cerrado.

**Fuera de alcance (otros specs):**

- **§5.5.3, §5.5.4, §5.5.5 y §5.5.6** — el paciente, el acto de vacunación, el error de administración, la comunidad y los diagnósticos. Son FE13b, FE13c y FE13d.
- **Borrar un miembro del equipo.** `ESAVI-INVTEAM-005A` exige ADMIN mientras las catorce entidades del paso 5 escriben como USER. El comportamiento objetivo —que un USER pueda quitar a un miembro que él cargó— queda declarado en §3.5 y **bloqueado por la deuda de §10** de `CASE-PROCESS.md`, igual que FE12b y FE12c lo estuvieron por §10.4. Hasta que la ruta baje a USER, el botón no se pinta.
- **Reactivar o purgar la investigación.** `005B` es SUPERADMIN y `005C` es purga física. El asistente limpia con `PUT`; ninguna de las dos se expone aquí.
- **`<AuditTrail>` sobre la investigación y sus satélites.** El array `appDetails` viaja en las respuestas, pero la pantalla de auditoría del expediente es un spec propio.
- **El bloque de COVID.** `investigationCovidHistory` está en el DDL sin API y es **obsoleta** (§10.7). No hay sección, ni ahora ni prevista.
- **Propagar la fecha de muerte al paso 4 automáticamente.** El aviso lleva al paso 4 con los campos señalados; escribir por su cuenta serían dos escrituras y la segunda puede fallar sola (§6.6).
- **Cruzar `investigationStartDate` con `eventDate` o con `hospitalizationDate`.** El backend no impone orden entre ellas y este spec tampoco lo inventa.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** FE12f dejó la entrada pendiente para cuando FE13 lo adoptara; con este segundo uso ya se sabe qué sobrevivió, pero escribir la norma es un cambio de `CONVENTIONS.md`, no de este spec.
- **La fila `systemConfig` con el código de país** (§10.1). El centro por defecto del mapa sale de `.env`, no de esa fila, precisamente para no depender de ella.

---

## 3. Diseño

### 3.1 Pantallas y archivos

**No hay ruta nueva.** El paso 5 ya está enrutado por FE08 en `/esavi-cases/:id/wizard/investigation`, con el guard `<RequireRole level={USER}>` del asistente y el desbloqueo por `notification.exists === true`. Este spec sustituye el marcador de posición de `CaseWizardPage.tsx:136-143` por la pantalla real.

| Archivo | Qué es |
|---|---|
| `features/esaviCase/InvestigationStep.tsx` | El paso. Monta el formulario, las tres secciones y el revelado progresivo. Va en `esaviCase/` por simetría con `NotificationStep.tsx` |
| `features/investigation/api.ts` | Los hooks de las cuatro entidades |
| `features/investigation/schemas.ts` | Los cuatro schemas Zod y sus predicados de coherencia |
| `features/investigation/SourceSection.tsx` | Sección 1 — las ocho fuentes y su texto |
| `features/investigation/BasicInfoSection.tsx` | Sección A1 — las diez columnas de `investigation`, con el mapa |
| `features/investigation/AutopsyFields.tsx` | El bloque 6.1–6.7, dentro de A1 |
| `features/investigation/TeamMemberList.tsx` | Sección A2 — `<SatelliteList>` |
| `features/investigation/TeamMemberFormDialog.tsx` | Alta y edición de un miembro |
| `shared/components/MapPointPicker.tsx` | Primitiva nueva de `ARCHITECTURE.md` §4.3 |

`shared/config/navigation.ts` **no cambia**: el paso 5 se alcanza desde el asistente, no desde el menú.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/investigations                                ESAVI-INVESTGN-001   USER   crear la cabecera
GET    /api/investigations/case/:id                       ESAVI-INVESTGN-006   USER   leer por caso
PUT    /api/investigations/:id                            ESAVI-INVESTGN-004   USER   actualizar

POST   /api/investigation-sources                         ESAVI-INVSRC-001     USER   crear (lleva investigationId en el cuerpo)
GET    /api/investigation-sources/case/:id                ESAVI-INVSRC-006     USER   leer por caso — devuelve un objeto, no una lista
PUT    /api/investigation-sources/:id                     ESAVI-INVSRC-004     USER   actualizar (:id ES el investigationId)

POST   /api/investigation-autopsies                       ESAVI-INVAUT-001     USER   crear
GET    /api/investigation-autopsies/case/:id              ESAVI-INVAUT-006     USER   leer por caso
PUT    /api/investigation-autopsies/:id                   ESAVI-INVAUT-004     USER   actualizar (:id ES el investigationId)

POST   /api/investigation-team-members                    ESAVI-INVTEAM-001    USER   añadir un miembro
GET    /api/investigation-team-members/investigation/:id  ESAVI-INVTEAM-002A   USER   listar los activos
PUT    /api/investigation-team-members/:id                ESAVI-INVTEAM-004    USER   editar un miembro

GET    /api/case-workflows/case/:id                       ESAVI-CASEFLOW-006   USER   ya consumido por FE08: da `exists` + `id` por satélite
GET    /api/catalog-items?typeCode=investigationStatus    ESAVI-CATITEM-002A   USER   vía <CatalogSelect>
GET    /api/catalog-items?typeCode=vaccinationSite        ESAVI-CATITEM-002A   USER   vía <CatalogSelect>
```

**Lo que no se consume y por qué:**

- `-002A` / `-002B` de las cuatro entidades: son listados globales del backoffice. El asistente entra siempre por caso o por investigación.
- `-003` de las cuatro: el `-006` por caso ya trae el objeto, y el `id` de las tres 1:1 **es** el `investigationId`, así que no hay nada que resolver aparte.
- `ESAVI-INVESTGN-005A` / `-005B` / `-005C`, `ESAVI-INVSRC-005C`, `ESAVI-INVAUT-005C`: el asistente limpia con `PUT`, no borra.
- `ESAVI-INVTEAM-005A` / `-005B` / `-005C`: el borrado del miembro está bloqueado por la deuda de §10 (§2, fuera de alcance).

**Las tres 1:1 llevan el `investigationId` en el cuerpo del `POST`.** La columna es PK y FK a la vez y no tiene `DEFAULT gen_random_uuid()`, así que el cliente lo envía; y el `:id` de sus rutas es ese mismo valor, no un id propio (`CASE-PROCESS.md` §5.5.2).

**El `003`/`006` de `investigation` devuelve objetos resueltos, no claves crudas.** En lugar de `statusItemId`, `vaccinationSiteItemId`, `vaccinationHealthFacilityId`, `vaccinationGeoLocationId` y `caseId` llegan `status`, `vaccinationSite`, `vaccinationHealthFacility`, `vaccinationGeoLocation` y `case`. **El formulario despliega el objeto a su id al enviar** — reenviar la respuesta del `GET` no manda ninguna clave, y el `004` está escrito contando con eso.

### 3.3 Tipos del contrato

Cuatro entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`, traídas con `npm run contracts:sync`:

```js
{ source: 'investigation/investigation.types.ts',            dest: 'investigation.ts' },
{ source: 'investigation/investigationSource.types.ts',      dest: 'investigationSource.ts' },
{ source: 'investigation/investigationTeamMember.types.ts',  dest: 'investigationTeamMember.ts' },
{ source: 'investigation/investigationAutopsy.types.ts',     dest: 'investigationAutopsy.ts' },
```

Traen `CreateInvestigationInput`, `CreateInvestigationSourceInput`, `CreateInvestigationTeamMemberInput`, `CreateInvestigationAutopsyInput` y sus `*ListFilters`. El update es `Partial<Create…Input>`, igual que en el backend.

**Las respuestas se declaran a mano** en `contracts/declared/`, porque el backend las construye como literales y `contracts:sync` no las puede copiar — el mismo caso que `notification.ts` y las suyas:

```ts
// contracts/declared/investigation.ts — origen: investigation.service.ts (toInvestigationResponse)
export interface Investigation {
  investigationId: string;
  case: { esaviCaseId: string; caseCode: string };
  status: CatalogItemRef | null;
  vaccinationSite: CatalogItemRef | null;
  vaccinationHealthFacility: HealthFacilityRef | null;
  vaccinationGeoLocation: GeoLocationRef | null;
  hospitalizationDate: string | null;
  investigationStartDate: string | null;
  vaccinationLatitude: string | null;   // numeric(10,7) — llega como cadena
  vaccinationLongitude: string | null;
  notes: string | null;
  isActive: boolean;
  appDetails: AppDetails[];
}
```

Más `InvestigationSource` (ocho banderas `boolean | null`, `otherDescription`, `notes`), `InvestigationTeamMember` (`investigationTeamMemberId`, `fullName`, `institutionName`, `email`, `phone`, `sortOrder`, `notes`, `isActive`) e `InvestigationAutopsy` (`isDeath`, `deathDate`, `deathTime`, las dos banderas, las dos fechas, `autopsyComments`, `notes`). **Cada interfaz se reconcilia contra el servicio del backend antes de escribirla; ningún campo se inventa.**

`vaccinationLatitude` y `vaccinationLongitude` son `numeric(10,7)` y **llegan como cadena**, no como número — el `<MapPointPicker>` recibe y emite `number`, y la conversión vive en el mapeo del formulario, en un solo sitio.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId`, slug del paso | URL | `useParams` de `/esavi-cases/:id/wizard/:step` | Lo resuelve FE08; este paso lo lee |
| Etapas del expediente | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | `ESAVI-CASEFLOW-006`. Da `stages.investigation.exists` y el `id`. Ya la puebla FE08 |
| Cabecera de la investigación | TanStack Query | `['investigation', 'byCase', caseId]` | `enabled` con `stages.investigation.exists === true`, igual que `useNotificationByCase` |
| Fuentes | TanStack Query | `['investigationSource', 'byCase', caseId]` | Devuelve **un objeto**, no una lista |
| Autopsia | TanStack Query | `['investigationAutopsy', 'byCase', caseId]` | Ídem |
| Equipo | TanStack Query | `['investigationTeamMember', 'byInvestigation', investigationId]` | `002A`: sólo los activos |
| Notificación (precarga y aviso) | TanStack Query | `['notification', 'byCase', caseId]` | **Ya existe**, la puebla FE12a. Se lee, no se duplica: de ahí salen `deathDate` y el desenlace de §6.6 |
| Catálogo `investigationStatus` | TanStack Query | `['catalogItem', 'byType', 'investigationStatus']` | `<CatalogSelect>`, `staleTime` 30 min |
| Catálogo `vaccinationSite` | TanStack Query | `['catalogItem', 'byType', 'vaccinationSite']` | Ídem. Los mismos 8 ítems que en el paso 4 |
| Búsqueda de unidad de salud | TanStack Query | `['healthFacility', 'search', term]` | Dentro de `<EntitySearchSelect>`, con rebote |
| Valores de los tres formularios | React Hook Form | `useForm<InvestigationFormValues>` | **Nada del servidor se copia a `useState` ni a un store**: el `defaultValues` se construye del `GET` y RHF es el dueño desde ahí |
| Borrador contra el cierre de pestaña | Zustand | `drafts[caseId]['investigation']` | Mismo mecanismo de FE12a: rebote de 500 ms, `resolveDraftConflict` contra `updatedAt`, **se borra en cuanto responde el `PUT`** |
| Índice de la última sección revelada | Componente | `useProgressiveSections` (`useState`) | **No se persiste** — ni URL, ni store, ni base. Al recargar mandan los datos (FE12f) |
| Diálogo de miembro abierto y miembro en edición | Componente | `useState` | Efímero, no sale de `TeamMemberList` |
| Aviso de §6.6 descartado en esta sesión | Componente | `useState` | Vuelve a aparecer al recargar, a propósito: es una incoherencia real mientras dure |

**Las cinco cosas que este contrato resuelve explícitamente:**

- **La coordenada tiene un solo dueño.** `<MapPointPicker>` no guarda posición interna: recibe `value` de RHF y emite `onChange`. Arrastrar el marcador y escribir en el campo son la misma escritura sobre el mismo valor.
- **El estado de muerte no se duplica.** El bloque de autopsia se muestra o no según `status.value === 'DEATH'` **derivado en render** de los valores del formulario y del catálogo ya cargado. No hay una bandera `showAutopsy` en ningún sitio.
- **`deathDate` se precarga una vez, al construir `defaultValues`,** y a partir de ahí es de RHF. La notificación es su origen, no su dueña: editarla aquí no toca el paso 4, y volver a montar el paso no la vuelve a pisar si el usuario ya la cambió — el `GET` de autopsia manda sobre la precarga en cuanto la fila existe.
- **Qué invalida qué.** El `PUT` de la cabecera invalida `['investigation','byCase',caseId]`; el de fuentes y el de autopsia, la suya; cualquier alta, edición o baja de miembro invalida `['investigationTeamMember','byInvestigation',investigationId]`. **El `POST` de la cabecera invalida además `['caseWorkflow','byCase',caseId]`**, porque `stages.investigation.exists` acaba de cambiar y de él dependen el stepper, la reanudación y el `enabled` de las otras tres consultas.
- **`staleTime`.** Catálogos 30 minutos; las cuatro consultas del expediente se invalidan tras cada mutación y no llevan `staleTime` propio.

**La excepción declarada:** el índice de sección revelada es estado de componente que sobrevive a un cambio de sección pero no a una recarga. Es deliberado y viene de FE12f — persistirlo obligaría a decidir qué manda cuando los datos y el recorrido no coinciden, y la respuesta correcta («mandan los datos») ya es lo que ocurre sin persistir nada.

### 3.5 Formularios y validación

Cuatro schemas en `features/investigation/schemas.ts`. **Obligatorio significa «el backend lo rechaza»**, no «parece razonable».

**A — Cabecera** (`investigationSaveSchema`). Sección A1.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `statusItemId` | `<CatalogSelect typeCode="investigationStatus">` | **no** | Admite vacío: el servidor pone el ítem `value: '0'` si no viaja. Marcarlo obligatorio obligaría a elegir «Desconocido» a mano |
| `vaccinationSiteItemId` | `<CatalogSelect typeCode="vaccinationSite">` | no | Los ocho ítems del paso 4 |
| `vaccinationHealthFacilityId` | `<EntitySearchSelect>` | no | Sólo se comprueba `isActive`. **No valida alcance geográfico**, a diferencia del paso 2 |
| `vaccinationGeoLocationId` | `<GeoLocationPicker>` | no | Alimenta el centro inicial del mapa |
| `hospitalizationDate` | `<DateField>` | no | **No futura** |
| `investigationStartDate` | `<DateField>` | no | **No futura.** Sin orden cruzado con la anterior |
| `vaccinationLatitude` / `vaccinationLongitude` | `<MapPointPicker>` | no | `numeric(10,7)`: **máximo 7 decimales**, o `400`. Se redondean al emitir |
| `notes` | `<Textarea>` | no | Texto libre |

**Ninguna columna de datos bloquea el guardado.** El único obligatorio es `caseId`, que sale del contexto — por eso la fila se crea vacía al entrar al paso.

**B — Fuentes** (`investigationSourceSaveSchema`). Sección 1. Ocho `<Switch>` tri-estado en un `<fieldset>` con `<legend>`, más el texto.

`history`, `interviewVaccinatedPerson`, `interviewHealthWorker`, `vaccinationRecord`, `autopsyRecord`, `verbalAutopsyRecord`, `investigationReport`, `other` — todas `boolean | null`, todas opcionales. **`null` es «no se recogió» y `false` es un «no» deliberado**; el interruptor nace sin tocar, no desmarcado.

`otherDescription` se muestra sólo con `other === true`, dentro de un `aria-live="polite"` porque aparece por un cambio en otro control. La regla es asimétrica y el schema la expresa sobre el **estado resultante**:

- con `other === true`, la descripción es **obligatoria** → `INVSRC_001_OTHER_DESCRIPTION_REQUIRED`;
- sin `other === true`, una descripción **con contenido** es `400` → `..._NOT_ALLOWED`;
- al apagar el interruptor, la pantalla **limpia el campo y deja de enviarlo** (§7.3). Una descripción heredada la borra el `004` él solo, sin error. Lo que nunca se envía es la fuente apagada **y** el texto.

Es literalmente la forma de `VerificationSourceSection.tsx` con ocho banderas en vez de seis; el predicado se escribe con el mismo nombre y la misma firma que `isOtherSourceDescriptionRequirementMet`.

**C — Autopsia** (`investigationAutopsySaveSchema`). Bloque 6.1–6.7, dentro de A1, visible con `status.value === 'DEATH'`.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `isDeath` | — | **sí, fijo `true`** | El validador lo exige explícito y valga exactamente `true`. **Nunca se ofrece**: una fila de autopsia sólo existe sobre una muerte |
| `deathDate` | `<DateField>` | **sí** | **No futura.** En el `004` es corregible pero **no anulable** |
| `deathTime` | `<TimeField>` | no | `HH:mm`. Primera columna `time` del repositorio |
| `isAutopsyPerformed` | `<Switch>` | no | Tri-estado. Gobierna `autopsyDate` y `autopsyComments` |
| `autopsyDate` | `<DateField>` | no | Visible con la bandera en `true`. **No futura** |
| `autopsyComments` | `<Textarea>` | no | Visible con la bandera en `true` |
| `isAutopsyScheduled` | `<Switch>` | no | Tri-estado. Visible con `isAutopsyPerformed !== true` (`ESAVI-FORM.md` 6.6) |
| `scheduledAutopsyDate` | `<DateField>` | no | **Sin restricción temporal alguna** — ni futura, ni posterior a la muerte |
| `notes` | `<Textarea>` | no | Texto libre |

**Las cuatro reglas de coherencia se validan en el cliente antes de enviar**, porque el backend corta en la primera y descubrirlas de una en una es un viaje por error:

| # | Regla | Código del backend |
|---|---|---|
| 1 | `isAutopsyPerformed` e `isAutopsyScheduled` no pueden ser los dos `true` | `INVAUT_00X_AUTOPSY_FLAGS_EXCLUSIVE` |
| 2 | Sin `isAutopsyPerformed === true`, `autopsyDate` prohibida | `INVAUT_00X_AUTOPSY_DATE_NOT_ALLOWED` |
| 3 | Sin `isAutopsyScheduled === true`, `scheduledAutopsyDate` prohibida | `INVAUT_00X_SCHEDULED_AUTOPSY_DATE_NOT_ALLOWED` |
| 4 | `autopsyDate` **no anterior** a `deathDate` | `INVAUT_00X_AUTOPSY_DATE_BEFORE_DEATH` |

Las reglas 1 a 3 no llegan a dispararse si la pantalla oculta y limpia como debe; la **regla 4 sí**, y es la única que salta desde un campo que no es el suyo: corregir sólo `deathDate` puede dejar detrás una `autopsyDate` ya guardada. El error se ancla en `deathDate` **y** en `autopsyDate`, con las dos fechas en el mensaje.

**`scheduledAutopsyDate` no lleva la regla «no futura»**, y el `<DateField>` tiene que recibirlo explícito: aplicársela por inercia rompería el caso normal, que es una autopsia programada para dentro de tres días.

**El aviso de §6.6.** Si `notification.outcome` no es muerte, o `notification.deathDate` difiere de la que hay aquí, se pinta un aviso junto al bloque con enlace al paso 4 señalando `deathDate` y `autopsyRequested`. **No bloquea el guardado, no propaga nada y se puede descartar**: primero se sabe que el paciente murió, después se actualiza el expediente.

**D — Miembro del equipo** (`teamMemberSaveSchema`). Diálogo de alta y edición.

| Campo | Control | Obligatorio | Regla |
|---|---|---|---|
| `fullName` | `<Input>` | **sí** | ≤250. Vuelve en `Title Case`: `ANA PÉREZ` se guarda `Ana Pérez`. En el `004` es corregible pero **no anulable** |
| `institutionName` | `<Input>` | no | ≤500. **No se normaliza** — `MINSAL` no debe volver `Minsal` |
| `email` | `<Input type="email">` | no | Formato validado, **sin longitud máxima**. Se guarda en minúsculas |
| `phone` | `<Input>` | no | ≤50, **texto libre**: extensiones, varios números y prefijos escritos de cualquier manera. Ninguna máscara |

**El duplicado no se anticipa en el cliente.** `fullName` normalizado no se repite entre los miembros activos → `409 INVTEAM_00X_ALREADY_EXISTS`, y es **coincidencia exacta sobre texto normalizado**: `Juan Pérez` y `Juan Perez` son dos personas distintas para esa guarda. El mensaje dice que ya hay un miembro con ese nombre; **no dice «parecido»**, porque el backend no promete eso.

**E — Mapeo de errores del servidor a su campo.** Por `code`, nunca parseando texto, y `errors` no se muestra al usuario:

| `code` | Dónde se ancla |
|---|---|
| `INVESTGN_001_CASE_ALREADY_INVESTIGATED` | Toast + se relee `['investigation','byCase',caseId]`: la fila ya existe y el `exists` estaba obsoleto (§6.2) |
| `INVESTGN_00X_STATUS_NOT_FOUND` | `statusItemId` — el ítem se desactivó mientras la pantalla estaba abierta |
| `INVESTGN_00X_DEFAULT_STATUS_MISSING` | Toast propio: es un despliegue sin sembrar, no un error del usuario. Se nombra como tal |
| `INVSRC_001_OTHER_DESCRIPTION_REQUIRED` · `..._NOT_ALLOWED` | `otherDescription` |
| `INVAUT_00X_AUTOPSY_*` | Los cuatro, en su campo, según la tabla de arriba |
| `INVTEAM_00X_ALREADY_EXISTS` | `fullName`, dentro del diálogo |
| `INV<ENT>_001_ALREADY_EXISTS` | Toast + relectura: una fila 1:1 sellada sigue ocupando su `investigationId` |
| Sin `code`, o `UNKNOWN_ERROR` | Toast genérico. `client.ts` ya respalda; **ninguna comparación asume que el valor exista** |

### 3.6 Orden de pantalla y revelado progresivo

El orden es el de `ESAVI-FORM.md`, sin excepciones — a diferencia del paso 4, aquí no hay que mover nada, porque **la fila padre ya existe antes de la primera sección**:

| # | Sección | Tabla | «Guardar y continuar» |
|---|---|---|---|
| 1 | Fuentes de información | `investigationSource` | sí |
| 2 | Información básica (A1) · con el bloque de muerte y autopsia | `investigation` + `investigationAutopsy` | sí |
| 3 | Equipo de investigación (A2) | `investigationTeamMember` | **no**: se revela con el segundo avance y por debajo ya está la barra del pie |

`useProgressiveSections` se reutiliza tal cual, con la misma regla de FE12f:

```
visible(sección i)  =  existíaAlMontar ? siempre : i <= avanzadoEnEstaSesión
```

`existíaAlMontar` se lee **una vez**, al montar, de `stages.investigation.exists`. Reentrar, recargar o volver mañana entra siempre por esa rama: **todo visible y ningún botón intermedio**; manda `CaseWizardActionBar`.

**El matiz que distingue este paso del 4.** Aquí la fila `investigation` se crea al entrar, así que en el primer llenado `stages.investigation.exists` era `false` al montar —y el recorrido se hace— aunque la fila ya exista al pulsar el primer botón. El valor se captura al montar precisamente para que crear la cabecera no cancele el recorrido en el acto.

**Cada «Guardar y continuar» escribe sólo lo suyo:** el de la sección 1 hace `POST`/`PUT` de `investigationSource`; el de la sección 2, el `PUT` de la cabecera y, si el bloque de muerte está visible, el `POST`/`PUT` de `investigationAutopsy`. Si una de las dos escrituras falla, no se avanza y el error se ancla donde toca.

**El texto informativo largo** de la cabecera del formulario de investigación —las cuatro condiciones que justifican una investigación completa— se pinta una sola vez, plegado, encima de la sección 1. Es la guía que `ESAVI-FORM.md` da al investigador y no se pierde.

### 3.7 El contrato de `<MapPointPicker>`

Primitiva nueva en `shared/components/`, declarada en `ARCHITECTURE.md` §4.3. Este spec es su primer consumidor; FE13d es el segundo, con el domicilio de `investigationCommunity`.

```ts
interface MapPointPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (value: { lat: number; lng: number } | null) => void;
  fallbackCenter?: { lat: number; lng: number };  // por defecto, VITE_MAP_DEFAULT_CENTER
  disabled?: boolean;
  ariaLabel: string;
}
```

- **Leaflet sobre `VITE_MAP_TILE_URL`**, con la atribución de OpenStreetMap visible. Las dos variables van al `.env.example` y a la documentación de arranque.
- **Centro inicial:** el punto ya guardado, si lo hay; si no, las coordenadas del `geoLocation` elegido, si las trae; si no, `fallbackCenter`. Nunca geolocalización del navegador.
- **Redondea a 7 decimales al emitir.** Es la restricción de `numeric(10,7)` y evita un `400` que el usuario no puede entender.
- **Alternativa sin ratón, obligatoria:** dos campos numéricos junto al mapa, editables, sincronizados con el marcador en las dos direcciones. Un mapa que sólo responde a arrastrar no es accesible, y el dato tiene que poder pegarse desde un GPS.
- **Borrable:** un punto puesto por error se quita y las dos columnas vuelven a `null`.
- `disabled` pinta el mapa sin interacción — es lo que ve un expediente `CLOSED`.

### 3.8 Estados de la pantalla

Los cuatro de `CONVENTIONS.md`, con clave i18n, nunca literales:

| Estado | Qué se ve |
|---|---|
| Carga | Esqueleto de las tres secciones. El paso no se pinta a medias |
| Vacío | No aplica como estado de pantalla: la investigación se crea al entrar. La **lista de equipo** sí tiene el suyo — `investigation.team.empty`, con el botón de añadir |
| Error | Mensaje por `code` (§3.5 E) más reintento. `errors` no se muestra: es material de depuración |
| Sin permiso | Lo resuelve el guard del asistente (FE08). El paso 5 no añade guardas propias: **todas sus escrituras son `USER`** |
| Sólo lectura | Expediente `CLOSED`: los tres formularios deshabilitados, el mapa sin interacción y el botón de añadir miembro oculto. Heredado de FE08 |

**El fallo de creación de la cabecera al entrar al paso es un estado propio.** Si el `POST` de `investigation` falla, no hay dónde colgar nada: la pantalla muestra el error con un botón de reintentar y **no pinta los formularios**. Un formulario que no puede guardar es peor que un error honesto.

### 3.9 Responsividad y accesibilidad

- **Por debajo de `md`**, la tabla del equipo colapsa a tarjetas con **nombre, institución y correo**. El teléfono y las observaciones quedan en el diálogo.
- El mapa ocupa el ancho disponible con `aspect-ratio` fijo y los dos campos numéricos pasan debajo, no al lado.
- Las ocho fuentes son un `<fieldset>` con `<legend>` en `sr-only`; cada `<Switch>` con su `aria-label` y su etiqueta clicable de al menos 44 px de alto, como en `VerificationSourceSection`.
- Los bloques que aparecen por un cambio en otro control —`otherDescription`, el bloque de muerte, las dos fechas de autopsia— van dentro de `aria-live="polite"`.
- Un control deshabilitado lleva siempre `aria-describedby` al texto que dice por qué (FE12e §3.7): gris sin explicación es indistinguible de un fallo.
- **Ningún color literal.** Sólo tokens semánticos, incluido el aviso de §6.6 y la atribución del mapa.

---

## 4. Plan de implementación

Trece pasos. Cada uno deja el repositorio compilando y con sus tests en verde; el cierre de cada paso es `npx tsc --noEmit -p tsconfig.app.json` más `npm run test`.

**1. Los contratos.** Cuatro entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs` y `npm run contracts:sync`. Después, `contracts/declared/investigation.ts`, `investigationSource.ts`, `investigationTeamMember.ts` e `investigationAutopsy.ts`, reconciliados campo a campo contra los servicios del backend.
*Verificación:* los cuatro archivos sincronizados aparecen sin editar a mano; `tsc` pasa; ningún campo de las cuatro interfaces declaradas carece de origen citado en el comentario de cabecera.

**2. La dependencia del mapa.** `leaflet` y `@types/leaflet`; `VITE_MAP_TILE_URL` y `VITE_MAP_DEFAULT_CENTER` en `.env.example` y en el arranque documentado.
*Verificación:* `npm run dev` levanta sin las variables definidas y avisa por consola una sola vez, en vez de romper.

**3. `<MapPointPicker>`.** La primitiva de §3.7 en `shared/components/`, con sus dos campos numéricos sincronizados, el redondeo a 7 decimales, el borrado del punto y `disabled`.
*Verificación:* test propio — arrastrar el marcador escribe en los campos, escribir en los campos mueve el marcador, el séptimo decimal se conserva y el octavo se recorta, `disabled` no admite interacción, y sin `value` el mapa se centra en el `fallbackCenter`.

**4. La capa de API.** `features/investigation/api.ts`: las cuatro consultas de §3.4 con sus helpers de clave, y las mutaciones de las cuatro entidades con su invalidación. Cada hook cita su código `ESAVI-*`. El `POST` de las tres 1:1 lleva el `investigationId` en el cuerpo.
*Verificación:* tests con MSW — el `enabled` no dispara el `GET` con `exists === false`, el `POST` de la cabecera invalida también `['caseWorkflow','byCase',caseId]`, y el `PUT` de las 1:1 va contra `/:investigationId`.

**5. Los schemas.** `features/investigation/schemas.ts`: los cuatro de §3.5, con el predicado de «otra fuente» y las cuatro reglas de coherencia de la autopsia.
*Verificación:* tests de tabla — las cuatro reglas de autopsia rechazan lo que deben, `scheduledAutopsyDate` acepta una fecha futura, `deathDate` no acepta `null` en el update, y una descripción con `other` apagado no valida.

**6. El paso, vacío pero vivo.** `InvestigationStep.tsx` montado desde `CaseWizardPage.tsx` en lugar del marcador de posición: lee `stages`, crea la cabecera con un `POST` vacío si `exists === false`, y pinta el estado de error propio de §3.8 si esa creación falla.
*Verificación:* test de integración — entrar en un caso sin investigación dispara un solo `POST`; entrar en uno que ya la tiene no dispara ninguno; con el `POST` en error no se pinta ningún formulario y hay botón de reintentar.

**7. Sección 1 — Fuentes.** `SourceSection.tsx`, ocho `<Switch>` tri-estado y `otherDescription` detrás de `other`, con la limpieza al apagar.
*Verificación:* test — un interruptor sin tocar envía `null` y no `false`; apagar «otra fuente» limpia el texto y el cuerpo no lo lleva; el `409` de fila ya existente relee en vez de duplicar.

**8. Sección A1 — Información básica.** `BasicInfoSection.tsx` con las diez columnas, el `<CatalogSelect>` de estado sin marca de obligatorio, y el mapa alimentando su centro desde `vaccinationGeoLocationId`.
*Verificación:* test — el formulario emite ids y nunca reenvía los objetos resueltos del `GET`; dejar el estado vacío guarda sin error; ocho decimales en la latitud no llegan a salir.

**9. El bloque de muerte y autopsia.** `AutopsyFields.tsx` dentro de A1, con la compuerta `status.value === 'DEATH'`, `isDeath` fijo, la precarga de `deathDate` y el aviso no bloqueante de §6.6.
*Verificación:* test — elegir «Fallecido» revela el bloque y precarga la fecha del paso 4; cambiar a otro estado limpia los campos con un `PUT` y no borra la fila; el aviso aparece con un desenlace que no es muerte, **no impide guardar** y su enlace lleva al paso 4.

**10. Sección A2 — Equipo.** `TeamMemberList.tsx` sobre `<SatelliteList>` y `TeamMemberFormDialog.tsx`, con el `409` de duplicado anclado en `fullName` y **sin botón de borrar** (§2).
*Verificación:* test — el alta invalida la lista; el nombre vuelve en `Title Case` y la pantalla muestra lo devuelto, no lo escrito; el `409` deja el diálogo abierto con el error en su campo; en móvil la tarjeta muestra tres campos.

**11. Revelado progresivo y borrador.** `useProgressiveSections` con las tres secciones de §3.6, y el borrador de `draftsStore` bajo la clave `'investigation'`, con el mismo rebote y la misma resolución de conflicto que FE12a.
*Verificación:* test — en un paso nuevo sólo se ve la sección 1 y un botón; al reentrar en uno existente se ven las tres y ningún botón intermedio; un borrador más viejo que `updatedAt` se descarta con aviso.

**12. i18n.** Las claves nuevas bajo `investigation.*` en `es.json`, `en.json` y `nl.json`, con el texto literal de `ESAVI-FORM.md` como origen del español.
*Verificación:* los tres archivos tienen el mismo conjunto de claves; ningún literal en los componentes; el texto informativo largo aparece completo.

**13. El recorrido completo.** Test de integración del paso: alta desde cero, reentrada, cambio de estado a muerte y vuelta, fallo de guardado y expediente `CLOSED`.
*Verificación:* los cinco casos pasan; `npx tsc --noEmit -p tsconfig.app.json` limpio; `npm run lint` limpio.

---

## 5. Criterios de aceptación

- [ ] Entrar en el paso 5 de un caso sin investigación dispara **un solo** `ESAVI-INVESTGN-001` con cuerpo `{ caseId }`, y entrar en uno que ya la tiene no dispara ninguno.
- [ ] Si ese `POST` falla, no se pinta ningún formulario: sale el error con reintento.
- [ ] Un `409 INVESTGN_001_CASE_ALREADY_INVESTIGATED` relee `['investigation','byCase',caseId]` y sigue adelante en vez de dejar el paso muerto.
- [ ] El `POST` de la cabecera invalida además `['caseWorkflow','byCase',caseId]`, y el stepper refleja el paso 5 como iniciado sin recargar.
- [ ] Las tres 1:1 envían el `investigationId` **en el cuerpo** del `POST`, y sus `PUT` van a `/:investigationId`, no a un id propio.
- [ ] El formulario de la cabecera envía `statusItemId`, `vaccinationSiteItemId`, `vaccinationHealthFacilityId` y `vaccinationGeoLocationId` como **ids**; ningún cuerpo lleva `status: {...}` ni ningún otro objeto resuelto del `GET`.
- [ ] Guardar la cabecera con el estado vacío responde `200`, y la fila vuelve con el ítem `value: '0'`.
- [ ] Un interruptor de fuente sin tocar viaja como `null`; apagado a mano, como `false`. Los dos estados se distinguen al releer.
- [ ] Apagar «otra fuente» limpia el texto en pantalla y el cuerpo no lo lleva; nunca se envía `other: false` con `otherDescription` con contenido.
- [ ] Elegir el estado cuyo `value` es `'DEATH'` revela el bloque de muerte, precarga `deathDate` desde `notification.deathDate` si la hay, y **la deja editable**.
- [ ] Cambiar el estado a uno que no es muerte limpia los campos de autopsia con un `PUT` y **no** borra la fila.
- [ ] `isDeath` viaja siempre `true` en el `POST` y **no aparece como control** en ninguna parte de la pantalla.
- [ ] Las cuatro reglas de coherencia de la autopsia se muestran antes de enviar, las cuatro a la vez si se rompen a la vez, y no de una en una por viaje al servidor.
- [ ] `scheduledAutopsyDate` acepta una fecha futura sin error, y `autopsyDate` anterior a `deathDate` no.
- [ ] Un desenlace del paso 4 que no es muerte, o dos fechas de muerte que difieren, pintan el aviso de §6.6; el aviso **no impide guardar**, se puede descartar y su enlace lleva al paso 4.
- [ ] La latitud emite como máximo 7 decimales, y arrastrar el marcador y escribir en el campo numérico producen el mismo valor.
- [ ] El mapa se centra en el punto guardado, si no en el `geoLocation` elegido, y si no en `VITE_MAP_DEFAULT_CENTER`. La atribución de OSM es visible siempre.
- [ ] Un miembro del equipo con `fullName` repetido devuelve `409` y el error queda anclado en ese campo, con el diálogo abierto; el mensaje no dice «parecido».
- [ ] Tras el alta, la lista muestra el `fullName` **devuelto** en `Title Case`, no lo tecleado, y `institutionName` **sin** normalizar.
- [ ] La lista de equipo no ofrece borrar (§2), y `grep -rn "INVTEAM-005" src/` no devuelve nada.
- [ ] En un paso nuevo sólo es visible la sección 1 con un botón; tras dos avances están las tres y ningún botón intermedio. Al reentrar, todo visible desde el principio.
- [ ] Un avance que falla no revela la sección siguiente.
- [ ] `npm run check` sale en 0 y `npx tsc --noEmit -p tsconfig.app.json` no añade errores en los archivos tocados.

**Bloque de cierre — se verifica a mano:**

- [ ] **Tema oscuro.** Las tres secciones, el aviso de §6.6, el diálogo y **el mapa con su atribución** se ven correctos en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/investigation/ src/shared/components/MapPointPicker.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** A 375 px no hay scroll horizontal en ninguna de las tres secciones; el mapa ocupa el ancho con los campos numéricos debajo; la tarjeta de miembro muestra nombre, institución y correo.
- [ ] **Rol bajo.** Con `USER` el paso completo funciona de punta a punta: las trece rutas de §3.2 que se consumen son `USER`. Ningún `403` aparece en el recorrido normal.
- [ ] **Sin literales.** Todo el texto sale de `investigation.*` en los tres idiomas, incluido el texto informativo largo y los mensajes de las cuatro reglas de autopsia.
- [ ] **Estado en una sola capa.** Nada remoto en `useState` ni en un store; el índice de sección revelada y el descarte del aviso son de componente; `drafts` sólo guarda valores del formulario y se borra al responder el `PUT`.
- [ ] **Accesibilidad.** Con teclado se puede fijar un punto en el mapa mediante los campos numéricos, sin ratón; cada control deshabilitado dice por qué con `aria-describedby`; los bloques que aparecen solos están en `aria-live`.

---

## 6. Decisiones tomadas y descartadas

**El corte de FE13 en cuatro.** `FE13a` = §5.5.1 + §5.5.2 · `FE13b` = §5.5.3 · `FE13c` = §5.5.4 · `FE13d` = §5.5.5 + §5.5.6. Sigue el reparto por afinidad clínica de `CASE-PROCESS.md` §5.5.0 y respeta lo que §9 prometió. Las dos nietas viajan con su madre, que es lo que impide olvidar el orden de creación.

**La fila `investigation` se crea al entrar al paso, no con el primer guardado.** Ninguna columna de datos es obligatoria, así que el `POST` vacío es legítimo y deja los tres satélites operativos desde el primer segundo. Es la misma regla que §5.5.3 aplica a las madres de las nietas: «la madre se crea al abrir el bloque, no al primer Añadir». *Descartado:* crearla con el primer «Guardar y continuar», como hace el paso 4 — encadenaría dos escrituras en un botón y la segunda puede fallar sola.

**Revelado progresivo en una sola página, con `useProgressiveSections` de FE12f.** *Descartado:* sub-pasos con segmento de ruta propio y stepper interno. El mecanismo de FE12f **ya está construido y probado**, y replicarlo cuesta cero; inventar un segundo mecanismo de navegación dentro del asistente costaría un spec entero. La decisión se revisa en FE13d si la página del paso 5, con sus catorce satélites, deja de ser manejable — y entonces será un cambio de presentación sobre secciones que ya funcionan, no un rediseño.

**`<MapPointPicker>` se escribe aquí, no en FE13d.** `ESAVI-FORM.md` A1 §2 pide mapa para el lugar de vacunación, y construirlo aquí le da **dos consumidores** — éste y el domicilio de `investigationCommunity` —, que es justamente lo que `ARCHITECTURE.md` §4.3 exige de una primitiva y lo que hasta hoy no cumplía. *Descartado:* dos `<NumberField>` ahora y el mapa sólo en FE13d. **Consecuencia:** §4.3 deja de decir que su único consumidor es `investigationCommunity`, y `leaflet` —la única dependencia externa nueva de todo el proceso— entra un spec antes de lo previsto.

**La compuerta del bloque de autopsia va contra el estado de la investigación**, `status.value === 'DEATH'`, y no contra el desenlace del paso 4. Los dos textos que parecían chocar no chocan: `ESAVI-FORM.md` condiciona 6.1–6.7 a `statusItemId`, y el «siempre disponible» de `CASE-PROCESS.md` §5.5.2 se refiere a que **el desenlace del paso 4 no lo gobierna**. Con esta compuerta se cumplen los dos: el investigador declara la muerte aquí, aunque el paso 4 diga otra cosa. Y va contra `value`, nunca contra `code` (§7.2).

**`deathDate` se precarga y queda siempre editable.** La notificación es su origen, no su dueña: si hubo una inconsistencia al notificar, se corrige aquí sin pedir permiso al paso 4. El aviso de §6.6 informa de la divergencia y **no bloquea**.

**El estado de la investigación no se marca obligatorio en pantalla.** El servidor pone el ítem `value: '0'` si no viaja; exigirlo obligaría al investigador a elegir «Desconocido» a mano, que es exactamente lo que ese respaldo existe para evitar.

**El borrado de un miembro del equipo no se implementa todavía.** `ESAVI-INVTEAM-005A` exige ADMIN mientras las catorce entidades del paso 5 escriben como USER; es deriva del CRUD, no política de seguridad. Se anota como deuda del backend y el botón no se pinta. *Descartado:* pintarlo con `useCan(ADMIN)` — dejaría un botón que el 90 % de los investigadores no ve y que habría que desmontar después.

**El patrón de las ocho fuentes se escribe local en `features/investigation/`.** Es el segundo uso de la forma «N interruptores + texto detrás del último», tras `VerificationSourceSection`. Se extrae a `shared/` cuando aparezca el tercero, que es la regla que este repositorio ya aplicó con `useProgressiveSections`.

**El texto informativo largo del formulario se conserva, plegado.** Son las cuatro condiciones que justifican una investigación completa, y son la guía que decide si esta pantalla debía abrirse. Resumirlo sería reescribir un criterio clínico.

---

## 7. Riesgos identificados

**El `value` `'DEATH'` de `investigationStatus` no está bloqueado.** `esaviapp.sql` acuña los seis valores semánticos del catálogo pero sólo bloquea `('investigationStatus','UNKNOWN')`; `('outcome','DEATH')` sí está bloqueado, éste no. Si alguien edita o desactiva ese ítem desde el mantenimiento de catálogos, **el bloque de muerte y autopsia desaparece de la pantalla sin error visible**. Mitigación en dos partes: se abre una entrada nueva en §10 de `CASE-PROCESS.md` pidiendo que se bloquee, y mientras tanto la pantalla registra un aviso en consola —no un error al usuario— si el catálogo carga sin ningún ítem con ese `value`.

**`exists: true` no significa «utilizable» (§6.2).** `ESAVI-CASEFLOW-006` puede decir que la investigación existe sobre una fila desactivada, y entonces los `GET` por caso devuelven vacío y los `POST` de las 1:1 dan `409`. La pantalla trata el `409` releyendo, no duplicando, y ése es el único camino de recuperación disponible desde el asistente: revertirlo es `ESAVI-INVESTGN-005B`, SUPERADMIN.

**Las teselas del mapa son una petición a un tercero.** `VITE_MAP_TILE_URL` sale de la red del cliente; en un despliegue sin salida a internet el mapa queda gris. Los dos campos numéricos son la mitigación, no un extra: con ellos la coordenada se captura igual.

**El aviso de §6.6 depende de que la notificación esté cargada.** Si `['notification','byCase',caseId]` aún no resolvió, no hay con qué comparar. En ese caso **no se avisa**, y el aviso aparece cuando llegue el dato. Callar es correcto; avisar de una divergencia que no se ha comprobado, no.

---

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `features/esaviCase/CaseWizardPage.tsx` | El marcador de posición de `:136-143` se sustituye por `<InvestigationStep caseId={id} />`. La condición negativa que hoy enumera cuatro slugs pierde uno |
| `scripts/syncContracts.mjs` | Cuatro entradas nuevas en `SYNC_MAP` |
| `.env.example` | `VITE_MAP_TILE_URL` y `VITE_MAP_DEFAULT_CENTER` |
| `package.json` | `leaflet` y `@types/leaflet` |
| `src/locales/{es,en,nl}.json` | El bloque `investigation.*` |
| `references/ARCHITECTURE.md` §4.3 | `<MapPointPicker>` deja de tener un solo consumidor. **Se corrige al implementar**, no antes |
| `references/CASE-PROCESS.md` §10 | Entrada nueva: bloquear `('investigationStatus','DEATH')` y bajar `ESAVI-INVTEAM-005A` a USER |

`CaseWizardActionBar`, `CaseWizardStepper` y `NotificationStep` **no se tocan**. El desbloqueo del paso 5 por `notification.exists` y la sólo-lectura por `CLOSED` ya funcionan y este spec los consume tal cual.

---

## Lo que **no** está en este spec

- Las secciones B, B1, B2, C, D, D1, E1, E2, F, F2, G y H del formulario de investigación — son FE13b, FE13c y FE13d.
- El paso 6, la clasificación final y el cierre del expediente (FE14).
- El borrado de miembros del equipo, hasta que `ESAVI-INVTEAM-005A` baje a USER.
- `<AuditTrail>` sobre la investigación y sus satélites.
- Cualquier bloque de COVID: `investigationCovidHistory` es esquema abandonado (§10.7).
- La propagación automática de la fecha de muerte al paso 4.
- La entrada de `useProgressiveSections` en `CONVENTIONS.md`.
- La fila `systemConfig` con el código de país (§10.1).

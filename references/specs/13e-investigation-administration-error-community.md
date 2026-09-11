# SPEC FE13e — Paso 5: el error de administración, la investigación comunitaria y el cierre de la etapa

> **Estado:** Borrador
> **Depende de:** SPEC FE08 (armazón del asistente, `CaseWizardActionBar`, sólo lectura si `CLOSED`), SPEC FE11 (el `RadioGroup` Sí/No de dos vías sin retorno a `null`), SPEC FE12a (la cadena guardar/completar de un paso y `<AnswerOptionField>`), SPEC FE12f (`useProgressiveSections`), SPEC FE13a (la cabecera de la investigación, `InvestigationStep.tsx` y `<MapPointPicker>`, del que este spec es el segundo consumidor), SPEC FE13d (las cuatro secciones anteriores y los trece identificadores de revelado que aquí llegan a diecisiete), SPEC F58 del backend (la investigación y sus satélites)
> **Fecha:** 2026-09-11
> **Objetivo:** Cerrar §5.5.5 del `CASE-PROCESS.md` —las secciones F, F2, G y H del formulario— y con ellas el paso 5: es este spec el que monta «Completar etapa».

---

## 1. Por qué existe este spec

**A — Es la única compuerta invertida del expediente, y equivocarla funciona en las pruebas.** `usedAutoDisableSyringes` es un `answerOption` y **sólo el `'NO'` abre el bloque de tipos de jeringa**; `YES`, `UNKNOWN`, `NOT_APPLICABLE`, `NO_ANSWER` y el `null` lo cierran, los cinco por igual (§5.5.5). Las otras cuatro compuertas de la investigación —dos en §5.5.3, dos en §5.5.4— abren con la afirmación. Escribir `=== 'YES'` por inercia deja pasar **todos los casos menos uno**: el que declara qué jeringa se usó en lugar de la autodestructible, que es exactamente el dato que el bloque existe para capturar.

**B — Trae la primera regla de mínimo del repositorio, y traducirla del `400` deja al usuario sin saber qué le falta.** Con el bloque abierto, al menos uno de los cuatro tipos tiene que resultar `true` → `400 INVADMER_00X_SYRINGE_TYPE_REQUIRED`. **El `false` no cuenta como declaración**: los cuatro en `false` dan el mismo error que los cuatro ausentes. Es una regla sobre el estado resultante de cuatro controles distintos, y un toast con un código no señala ninguno de ellos — **se valida en el cliente antes de enviar**.

**C — Veintiuna de las veintiséis columnas del error de administración no cuelgan de nada.** `syringesKeyFindings` está **fuera** del bloque pese al prefijo —cuarto nombre engañoso del paso 5, tras los `storage*` y los `*InThermos` de FE13d—; las cinco de reconstitución **no son excluyentes** y pueden resultar `'YES'` a la vez; y las seis parejas `had*` / `*Notes` son **doce columnas independientes**, donde un `'NO'` con el motivo escrito es un registro válido. Agrupar por prefijo y condicionar por parejas ocultaría veintiuna columnas que deben verse siempre: es el reflejo más caro de este bloque.

**D — Salir de un bloque abierto exige un `PUT` que el formulario tiene que componer, no dos.** Con el bloque cerrado los cinco campos están prohibidos, con una asimetría fina: el `false` es **400 en el `001` y legal en el `004`**. Esa puerta es deliberada — sin ella, una fila con su último tipo en `true` no tendría forma legal de apagarse. Para el formulario significa una regla concreta: al mover `usedAutoDisableSyringes` fuera del `'NO'`, la bandera nueva **y** los cuatro tipos viajan en la **misma** petición.

**E — La comunidad vuelve a la polaridad normal, y hay que decirlo porque se leen seguidas.** `hadSimilarEvent === 'YES'` estricto abre el bloque, y aquí **sí hay lado obligatorio**: `similarEventDescription` (`INVCOMM_00X_SIMILAR_EVENT_DESCRIPTION_REQUIRED`), a diferencia del conglomerado de FE13d, que no tenía ninguno. El orden de los dos errores está fijado —prohibición antes que obligación— y de ahí sale la única forma de vaciar la descripción: **cerrar la bandera en la misma petición**, porque un `PUT { similarEventDescription: null }` con el bloque abierto es `400`.

**F — El domicilio del paciente es el segundo y último mapa del expediente, y su precarga cuesta dos lecturas que el paso 5 hoy no hace.** `investigationCommunity` es el **único par de coordenadas con rango validado en el servidor** (±90, ±180); el de `investigation` (§5.5.1) sólo comprueba los siete decimales, y el cliente aplica el rango en las dos. La precarga desde la residencia registrada no está a mano: `EsaviCaseDetail.patient` no trae la residencia y `PatientDetail` la expone como `residence.geoLocationId`, así que hay que encadenar `ESAVI-PATIENT-003` y `ESAVI-GEOLOC-003` — cuyas `latitude`/`longitude` son **nullable**. Y como la residencia es una división administrativa, lo que se precarga es **un centroide, no una casa**: el marcador nace marcado como aproximado hasta que alguien lo arrastre.

**G — Es el spec que cierra el paso, y el único con «Completar etapa» del paso 5.** FE13a a FE13d dejaron trece secciones abiertas y ningún botón de cierre. Ninguna columna del paso es obligatoria, así que el cierre **no valida nada**: avisa, de forma no bloqueante, de qué secciones quedaron íntegramente vacías, y deja continuar. Un paso donde nada es obligatorio y aun así no deja completar sería la peor de las dos cosas.

**H — Y aquí se confirma el veredicto sobre `noAnswer`.** Las trece `answerOption` de este bloque usan `unknown`. Con ellas se cierra el reparto del expediente: **`noAnswer` no aparece ni una vez en cuarenta columnas**, porque estas preguntas no se le hacen a nadie — el investigador observa la nevera, examina las jeringas del puesto y lee la historia clínica. Cuando no consigue el dato el resultado es «no se sabe», no «se preguntó y no contestó». `<AnswerOptionField>` queda con dos variantes y `NO_ANSWER` como valor que se **renderiza si se encuentra al leer** y no se ofrece nunca.

---

## 2. Alcance

**Dentro:**

- **Las dos filas 1:1 se crean al revelarse su sección**, con un `POST { investigationId }` a secas (`ESAVI-INVADMER-001`, `ESAVI-INVCOMM-001`). Ninguna de sus columnas de datos es obligatoria, así que las dos fichas existen desde el primer segundo y el guardado posterior es **siempre `004`**, sin rama `POST`-o-`PUT` dentro del botón. Las dos cuelgan de `investigation` directamente: aquí **no hay el `404` de nieta** de FE13b y FE13c.
- **Sección F — «Jeringas y agujas»**: `usedAutoDisableSyringes` como **compuerta que abre con el `'NO'`** sobre los cuatro tipos `boolean` tri-estado —`usedGlassSyringes`, `usedDisposableSyringes`, `usedRecycledDisposableSyringes`, `usedOtherSyringes`—, más `otherSyringesDescription` anidada bajo la cuarta, y `syringesKeyFindings` **fuera del bloque**.
- **La regla de mínimo validada en el cliente con Zod**, sobre el estado resultante: con el bloque abierto, al menos uno de los cuatro tipos en `true`. El mensaje se ancla en el `<fieldset>` de los cuatro, no en un toast, y **el `false` no cuenta como declaración**.
- **La salida del bloque compuesta en una sola petición.** Al mover `usedAutoDisableSyringes` fuera del `'NO'`, la pantalla limpia los cinco campos y envía la bandera nueva junto con los cuatro tipos en el **mismo `PUT`** (§7.3). Nunca dos escrituras encadenadas.
- **`otherSyringesDescription` no se exige** — ni en el servidor ni en el cliente. Es el único «otro» del expediente que no se reclama, y la decisión está tomada en §5.5.5: el bloque anidado **abre** la columna, no la pide.
- **Sección F2 — «Procedimiento de reconstitución»**, partida en **dos bloques visuales con encabezado propio** dentro de una sola sección de revelado: «Reconstitución» (las cinco `answerOption` no excluyentes y `reconstitutionKeyFindings`) y «Errores de administración» (las seis parejas `had*` / `*Notes` y `notes`). **Las veintiuna columnas se ven siempre**: ninguna cuelga de nada.
- **F y F2 comparten `useForm` y un único «Guardar y continuar»**, al final de F2 — son una sola fila, y es el patrón que FE13d estrenó con E1/E2.
- **Las seis parejas `had*` / `*Notes` como doce controles independientes.** La nota no cuelga de su respuesta: **un `'NO'` con el motivo escrito es un registro válido**, el mismo criterio de §5.5.3 con las observaciones de antecedentes.
- **Sección G — «Investigación comunitaria»**, con su texto informativo literal («por favor, visite la localidad y entreviste a los familiares o vecinos de la persona afectada»): el domicilio sobre `<MapPointPicker>`, `hadSimilarEvent` como compuerta de `'YES'` estricto sobre la descripción **obligatoria** y los cuatro contadores opcionales, más `otherComments` y `notes`.
- **El rango de coordenadas aplicado en el cliente, ±90 y ±180**, y los siete decimales de `numeric(10,7)` redondeados al emitir.
- **La precarga del marcador desde la residencia registrada**, encadenando `ESAVI-PATIENT-003` y `ESAVI-GEOLOC-003`: el caso sólo trae `patient.patientId`, el detalle del paciente expone `residence.geoLocationId` y la división administrativa tiene `latitude`/`longitude` **nullable**. Con cualquier eslabón vacío, el mapa cae a `VITE_MAP_DEFAULT_CENTER` sin error visible.
- **El aviso de posición aproximada.** Mientras el marcador no se haya arrastrado se pinta distinto y con su motivo — «posición aproximada, tomada de la residencia registrada» —, y el aviso desaparece al moverlo. Es señal de pantalla: **no hay columna donde guardar «esto es aproximado»**.
- **El aviso de contadores que no suman.** Con los cuatro informados y `affectedVaccinated + affectedUnvaccinated + affectedUnknown ≠ similarEventCount`, se muestra la diferencia y **se deja guardar**. No se bloquea y `similarEventCount` **no se deriva**.
- **Sección H — «Otras constataciones, observaciones y comentarios»**: el `<Textarea>` de `investigation.notes`, **movido aquí desde A1**, donde FE13a lo había puesto. Se guarda con `ESAVI-INVESTGN-004` sobre la cabecera, no sobre ninguna de las dos fichas nuevas.
- **«Completar etapa», que este spec monta y ninguno anterior tenía.** `ESAVI-CASEFLOW-007` con diálogo de confirmación que dice lo que hace y lo que no —marca la investigación como terminada, **no cierra el expediente**— y, delante, un **aviso no bloqueante** listando las secciones del paso 5 que quedaron íntegramente vacías. Se puede completar igual.
- **El revelado progresivo de FE12f** extendido con cuatro identificadores: `administrationErrorSyringes`, `administrationErrorPractices`, `community` y `otherFindings` — de trece a **diecisiete**. Al reentrar en un paso que ya existía, todo visible y ningún botón intermedio.
- **Las dos lecturas del paso**: `ESAVI-INVADMER-006` e `ESAVI-INVCOMM-006`, las dos por caso.
- **Los dos contratos sincronizados** más sus dos respuestas declaradas a mano en `contracts/declared/`.
- **Las claves i18n nuevas bajo `investigation.*`**, en los tres idiomas.
- **Tests**: la compuerta invertida con sus cinco valores de cierre, la regla de mínimo con los cuatro `false`, la salida del bloque en una sola petición, la obligatoriedad de la descripción y su único borrado legal, el rango de coordenadas, la caída de la precarga con `latitude` nula, el aviso de suma, y el recorrido de integración del cierre del paso — alta, reentrada, completar con secciones vacías y expediente cerrado.

**Fuera de alcance (otros specs):**

- **El paso 6 y la clasificación final.** «Completar etapa» marca la investigación como terminada; la clasificación causal, el cierre del expediente (`ESAVI-CASEFLOW-008`) y su reapertura (`-009`, ADMIN) son **FE14**.
- **Pedir y resolver validación** (`ESAVI-CASEFLOW-010` y `-011`, §4.3). Son acciones del expediente, no del paso 5, y el asistente no las expone aquí.
- **Retirar o purgar las dos fichas 1:1.** No hay `005A` ni `005B`: ninguna de las dos tablas tiene `isActive` y sólo existe `005C`, purga física, SUPERADMIN. El asistente **crea y limpia; no borra** (§5.5.0).
- **Los listados `002A` y `002B` y las lecturas por id (`003`).** El asistente entra por el caso: el `006` resuelve la lectura en una llamada. Los `002A` son listados globales sin filtro por investigación y los `002B` son ADMIN.
- **Cruzar los cuatro contadores en el servidor.** El backend no lo comprueba y este spec **no pide que lo haga**: el desglose puede llegar incompleto y derivar el total lo haría imposible de registrar.
- **Validar el rango de coordenadas en `investigation` desde el backend.** La asimetría queda anotada —`investigationCommunity` sí lo valida, `investigation` no— y **se resuelve en el cliente en las dos**, sin abrir una séptima petición a §10.
- **Geolocalización del navegador, búsqueda por dirección y polígonos.** `<MapPointPicker>` es un marcador arrastrable sobre teselas; `geoPolygon` existe en la tabla y no se dibuja.
- **Exigir `otherSyringesDescription`.** Decidido en §5.5.5 y respetado: ser más estricto que la API sin que la omisión produzca un dato contradictorio es inventar fricción.
- **Condicionar las seis `*Notes` a su respuesta.** Nada las ata en el backend y atarlas en el cliente perdería registros válidos.
- **`<AuditTrail>` sobre las dos tablas.** El array `appDetails` viaja en las respuestas; la pantalla de auditoría del expediente es un spec propio.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** Sexto uso, misma decisión que FE13a–FE13d: escribir la norma es un cambio de `CONVENTIONS.md`, no de este spec.
- **Reordenar o renumerar las secciones del paso 5.** El movimiento de `notes` de A1 a H es el único cambio de orden, y está dentro.

---

## 3. Diseño

### 3.1 Pantallas y archivos

**No hay ruta nueva ni pantalla nueva.** El paso 5 ya está enrutado por FE08 en `/esavi-cases/:id/wizard/investigation`, con el guard `<RequireRole level={USER}>` del asistente; FE13a lo pobló y FE13b, FE13c y FE13d le añadieron diez secciones. Este spec añade las cuatro últimas y el botón que cierra la etapa.

| Archivo | Qué es |
|---|---|
| `features/investigation/AdministrationErrorSection.tsx` | **Nuevo.** F y F2 sobre una sola fila: tres bloques visuales, un `useForm`, un guardado |
| `features/investigation/CommunitySection.tsx` | **Nuevo.** G — el mapa del domicilio, la compuerta del evento similar y los cuatro contadores |
| `features/investigation/OtherFindingsSection.tsx` | **Nuevo.** H — `investigation.notes`, guardado contra la cabecera |
| `features/investigation/usePatientResidenceCenter.ts` | **Nuevo.** Las dos lecturas encadenadas de la precarga, con sus tres caídas |
| `features/investigation/api.ts` | **Cambia.** Dos entidades más sobre la base de FE13a–FE13d |
| `features/investigation/schemas.ts` | **Cambia.** Dos schemas, la compuerta invertida, la regla de mínimo y el rango de coordenadas |
| `features/investigation/BasicInformationSection.tsx` | **Cambia.** Pierde el `<Textarea>` de `notes`, que se va a H (§8) |
| `features/esaviCase/InvestigationStep.tsx` | **Cambia.** Monta las cuatro secciones, amplía `useProgressiveSections` de trece identificadores a diecisiete y monta «Completar etapa» |

`shared/config/navigation.ts` **no cambia**: el paso 5 se alcanza desde el asistente, no desde el menú. **Ninguna primitiva nueva de `shared/`**: las trece de `ARCHITECTURE.md` §4.3 bastan, y este spec usa siete de ellas — `<MapPointPicker>` por segunda y última vez.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/investigation-administration-errors          ESAVI-INVADMER-001   USER   crear la ficha (lleva investigationId en el cuerpo)
GET    /api/investigation-administration-errors/case/:id ESAVI-INVADMER-006   USER   leer la ficha por caso
PUT    /api/investigation-administration-errors/:id      ESAVI-INVADMER-004   USER   actualizar (:id es el investigationId)

POST   /api/investigation-communities                    ESAVI-INVCOMM-001    USER   crear la ficha (lleva investigationId en el cuerpo)
GET    /api/investigation-communities/case/:id           ESAVI-INVCOMM-006    USER   leer la ficha por caso
PUT    /api/investigation-communities/:id                ESAVI-INVCOMM-004    USER   actualizar (:id es el investigationId)

PUT    /api/investigations/:id                           ESAVI-INVESTGN-004   USER   guardar `notes` de la sección H
GET    /api/case-workflows/case/:id                      ESAVI-CASEFLOW-006   USER   el investigationId y el estado de las seis etapas
PATCH  /api/case-workflows/case/:id/complete-stage       ESAVI-CASEFLOW-007   USER   completar la etapa de investigación

GET    /api/patients/:id                                 ESAVI-PATIENT-003    USER   la residencia del paciente, para precargar el mapa
GET    /api/geo-locations/:id                            ESAVI-GEOLOC-003     USER   las coordenadas de esa división administrativa
```

**Lo que no se consume, y por qué:**

- **`ESAVI-INVADMER-002A`, `-002B`, `-003` y `ESAVI-INVCOMM-002A`, `-002B`, `-003`.** El asistente entra por el caso: el `006` resuelve la lectura en una llamada. Los `002A` son listados globales sin filtro por investigación y los `002B` son ADMIN, con las inactivas de una tabla que **no tiene `isActive`**.
- **`ESAVI-INVADMER-005C` y `ESAVI-INVCOMM-005C`.** Purga física, SUPERADMIN. No hay `005A` ni `005B` para estas dos tablas y el asistente no borra.
- **`ESAVI-CASEFLOW-008`, `-009`, `-010` y `-011`.** Cerrar, reabrir, pedir y resolver validación. El `-008` y el `-009` son de FE14; los otros dos, de la pantalla del expediente.
- **`ESAVI-PATIENT-004`.** La precarga **lee** la residencia; no la corrige. Un domicilio mal registrado se arregla en el paso 1.
- **`ESAVI-GEOLOC-002`.** El listado no hace falta: la precarga conoce el `geoLocationId` exacto y el `003` es el único que trae las relaciones.

### 3.3 Tipos del contrato

Los dos salen de `../esavi-backend/src/types/investigation/` con `npm run contracts:sync`, y las dos respuestas se declaran a mano en `contracts/declared/` como en todo el paso 5 — el backend tipa la entrada, no la salida:

```ts
// contracts/investigationAdministrationError.ts
export interface CreateInvestigationAdministrationErrorInput {
  investigationId: string;                  // PK = FK, la envía el cliente
  usedAutoDisableSyringes?: AnswerOption | null;  // compuerta: SÓLO 'NO' abre
  usedGlassSyringes?: boolean | null;             // boolean, no answerOption
  usedDisposableSyringes?: boolean | null;
  usedRecycledDisposableSyringes?: boolean | null;
  usedOtherSyringes?: boolean | null;             // y gobierna la siguiente
  otherSyringesDescription?: string | null;       // nunca obligatoria
  syringesKeyFindings?: string | null;            // FUERA del bloque, pese al prefijo
  reconstitutionUsedSameSyringe?: AnswerOption | null;
  reconstitutionUsedSameSyringeDifferentVaccine?: AnswerOption | null;
  reconstitutionUsedDifferentSyringeSameVial?: AnswerOption | null;
  reconstitutionUsedDifferentSyringeDifferentVaccine?: AnswerOption | null;
  reconstitutionFollowedManufacturerRecommendation?: AnswerOption | null;
  reconstitutionKeyFindings?: string | null;
  hadPrescriptionError?: AnswerOption | null;       prescriptionErrorNotes?: string | null;
  hadContaminatedVaccine?: AnswerOption | null;     contaminatedVaccineNotes?: string | null;
  hadAbnormalVaccineConditions?: AnswerOption | null;  abnormalConditionsNotes?: string | null;
  hadPreparationError?: AnswerOption | null;        preparationErrorNotes?: string | null;
  hadHandlingError?: AnswerOption | null;           handlingErrorNotes?: string | null;
  hadImproperAdministration?: AnswerOption | null;  improperAdministrationNotes?: string | null;
  notes?: string | null;
}

// contracts/investigationCommunity.ts
export interface CreateInvestigationCommunityInput {
  investigationId: string;                  // PK = FK, la envía el cliente
  patientLatitude?: number | null;          // numeric(10,7), rango ±90 en el servidor
  patientLongitude?: number | null;         // numeric(10,7), rango ±180 en el servidor
  hadSimilarEvent?: AnswerOption | null;    // compuerta: 'YES' estricto
  similarEventDescription?: string | null;  // OBLIGATORIA con el bloque abierto
  similarEventCount?: number | null;        // 0–32767
  affectedVaccinated?: number | null;       // 0–32767
  affectedUnvaccinated?: number | null;     // 0–32767
  affectedUnknown?: number | null;          // 0–32767
  otherComments?: string | null;
  notes?: string | null;
}
```

**Ninguno de los diez textos del error de administración tiene longitud máxima**, y es la diferencia con la cadena de frío de FE13d, que tenía una. Los diez son `text` sin techo declarado: **inventarle un `maxLength` al formulario crearía un `400` que la base no respalda**. Lo mismo con `otherComments` y `notes` de la comunidad.

**Las dos respuestas se declaran a mano.** `InvestigationAdministrationErrorDetail` e `InvestigationCommunityDetail` reproducen las columnas anteriores más `createdAt`, `updatedAt`, `deletedAt` y `appDetails`, **sin `isActive`**: ninguna de las dos tablas lo tiene. Cada interfaz se reconcilia contra el servicio del backend antes de escribirla; ningún campo se inventa.

Los tipos de la precarga **ya existen** y no se sincroniza nada: `PatientDetail` (con `residence: { geoLocationId, name, geoLevelTypeId, level } | null`) y `GeoLocationDetail` (con `latitude: number | null` y `longitude: number | null`) están en `contracts/declared/`.

### 3.4 Contrato de estado

| Dato | Capa | Clave / slice | Notas |
|---|---|---|---|
| Caso abierto (`caseId`) | `searchParams` | El `:id` de la ruta del asistente | Lo fija FE08; este spec sólo lo lee |
| Paso activo (`investigation`) | `searchParams` | El slug del asistente | Ídem |
| Etapas del expediente y `investigationId` | TanStack Query | `['caseWorkflow', 'byCase', caseId]` | `ESAVI-CASEFLOW-006`. Ya en caché desde FE08; **el `investigationId` no se copia a ningún sitio** |
| Ficha de error de administración | TanStack Query | `['investigationAdministrationError', 'byCase', caseId]` | `ESAVI-INVADMER-006`. `staleTime` 0: es dato de captura |
| Ficha de comunidad | TanStack Query | `['investigationCommunity', 'byCase', caseId]` | `ESAVI-INVCOMM-006`. Ídem |
| Cabecera de la investigación (para `notes` de H) | TanStack Query | `['investigation', 'byCase', caseId]` | `ESAVI-INVESTGN-006`, ya leída por FE13a. **H no abre una clave nueva** |
| Detalle del paciente | TanStack Query | `['patient', 'detail', patientId]` | `ESAVI-PATIENT-003`. `staleTime` 5 min. Sólo para la precarga |
| División administrativa de residencia | TanStack Query | `['geoLocation', 'detail', geoLocationId]` | `ESAVI-GEOLOC-003`. `staleTime` 30 min — una división no se mueve. `enabled` sólo con el id resuelto |
| Valores de los tres formularios | React Hook Form | `useForm` del error de administración, `useForm` de la comunidad, `useForm` de H | **No es una copia del servidor**: es el estado del formulario, sembrado con `defaultValues` y resembrado con `reset` cuando llega la fila. **F y F2 comparten uno** |
| Secciones reveladas | Componente | `useProgressiveSections` en `InvestigationStep.tsx` | Diecisiete identificadores tras este spec. Efímero: al reentrar en un paso que ya existe, todas visibles |
| Marcador sin arrastrar | Componente | `useState` en `CommunitySection` | Efímero. Nace `true` cuando el punto vino de la precarga y muere en el primer arrastre o en la primera edición numérica. **No hay columna donde guardarlo** |
| Diálogo de «Completar etapa» | Componente | `useState` en `InvestigationStep` | Efímero, no sale del componente |
| Borrador contra el cierre de pestaña | Zustand | `drafts` | El búfer de `ARCHITECTURE.md` §3.4, ya existente; se borra en cuanto responde el `PUT` |

**Lo que este spec declara explícitamente que *no* hace:**

- **Nada del servidor se copia a `useState` ni a un store.** Las dos fichas se leen de su clave y se vuelven a leer tras cada escritura.
- **La compuerta de las jeringas no es estado nuevo.** Se deriva con `watch('usedAutoDisableSyringes') === 'NO'`; no se guarda un booleano `showSyringeTypes` junto a ella, que sería el mismo dato en dos capas.
- **La compuerta del evento similar tampoco**: `watch('hadSimilarEvent') === 'YES'`.
- **La suma de los contadores no se guarda.** Es un derivado de cuatro campos del `useForm`, calculado en el render. No hay una quinta variable «total declarado».
- **Las coordenadas viven en el `useForm`, no en el componente del mapa.** `<MapPointPicker>` es controlado: su `value` sale del formulario y su `onChange` lo escribe. Los dos campos numéricos de la alternativa accesible escriben en **los mismos** dos campos.
- **El centro de precarga no entra en el formulario.** Es el `fallbackCenter` del mapa mientras `patientLatitude` sea `null`; en el momento en que el usuario coloca el punto, el valor pasa a ser del formulario. **La precarga no escribe columnas por su cuenta**: un caso que se abre y se cierra sin tocar el mapa guarda `null`, no el centroide.
- **Ningún filtro en la URL**, porque no hay filtros: las dos fichas son una fila cada una.

**Qué invalida qué:**

| Escritura | Invalida |
|---|---|
| `INVADMER-001` / `-004` | `['investigationAdministrationError', 'byCase', caseId]` |
| `INVCOMM-001` / `-004` | `['investigationCommunity', 'byCase', caseId]` |
| `INVESTGN-004` (sección H) | `['investigation', 'byCase', caseId]` |
| `CASEFLOW-007` (completar la etapa) | `['caseWorkflow', 'byCase', caseId]` |

**Ninguna escritura de este spec invalida la clave de otra**, igual que en FE13d: las dos tablas cuelgan de `investigation` y son independientes entre sí. **Y las dos claves de la precarga no se invalidan nunca desde aquí** — este spec no escribe ni pacientes ni divisiones administrativas.

### 3.5 Formularios y validación

Dos schemas nuevos en `features/investigation/schemas.ts`, más una línea en el ya existente de la cabecera. **Obligatorio significa «el backend lo rechaza»**, no «parece razonable».

**A — Error de administración, bloque F: jeringas y agujas** (`investigationAdministrationErrorSaveSchema`)

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `usedAutoDisableSyringes` | `<AnswerOptionField variant="unknown">` | No | **Compuerta invertida: sólo `'NO'` abre.** `YES`, `UNKNOWN`, `NOT_APPLICABLE` y `null` cierran por igual |
| `usedGlassSyringes` | `<Switch>` tri-estado | No, con el bloque abierto | **`boolean`**, no `answerOption`. Nace sin tocar, no desmarcado |
| `usedDisposableSyringes` | `<Switch>` tri-estado | Ídem | Ídem |
| `usedRecycledDisposableSyringes` | `<Switch>` tri-estado | Ídem | Ídem |
| `usedOtherSyringes` | `<Switch>` tri-estado | Ídem | **Y gobierna la descripción** |
| `otherSyringesDescription` | `<Input>` | **No**, nunca | Visible con `usedOtherSyringes === true`, dentro de un `aria-live="polite"`. Prohibida con `false` o `null` |
| `syringesKeyFindings` | `<Textarea>` | No | **Fuera del bloque.** Se ve siempre, con la compuerta en cualquier valor |

- **Regla de mínimo, validada en el cliente** con un `superRefine` sobre el estado resultante: con el bloque abierto, al menos uno de los cuatro tipos en `true`. El error se ancla en el `<fieldset>` de los cuatro y su mensaje dice qué falta — «Indica al menos un tipo de jeringa usada» —, no el código. El `INVADMER_00X_SYRINGE_TYPE_REQUIRED` se registra igual en `errorMessages.ts` como red de seguridad.
- **Los cuatro `false` no satisfacen la regla**, y el mensaje lo dice: apagar los cuatro es la misma omisión que no tocarlos.
- **Salida del bloque en una sola petición.** El `onChange` de `usedAutoDisableSyringes` fuera del `'NO'` hace `setValue` de los cuatro tipos a `null` y de la descripción a `''`; el `PUT` viaja con la bandera nueva **y** los cinco campos limpios. Nunca dos escrituras.
- **El `false` legal del `004` no se explota desde el formulario.** La pantalla envía `null`, que es legal en los dos verbos; el `false` sólo aparece cuando el usuario apagó un interruptor a mano con el bloque abierto.

**B — Error de administración, bloque F2: reconstitución** (mismo schema, mismo `useForm`)

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `reconstitutionUsedSameSyringe` | `<AnswerOptionField variant="unknown">` | No | **Sin compuerta.** Las cinco pueden ser `'YES'` a la vez: describen prácticas distintas, no opciones de una lista |
| `reconstitutionUsedSameSyringeDifferentVaccine` | Ídem | No | Ídem |
| `reconstitutionUsedDifferentSyringeSameVial` | Ídem | No | Ídem |
| `reconstitutionUsedDifferentSyringeDifferentVaccine` | Ídem | No | Ídem |
| `reconstitutionFollowedManufacturerRecommendation` | Ídem | No | Ídem |
| `reconstitutionKeyFindings` | `<Textarea>` | No | Texto libre, sin longitud |

**C — Error de administración, bloque F2: errores de administración** (mismo schema, mismo `useForm`)

Seis parejas, **doce controles independientes**. Cada `had*` es un `<AnswerOptionField variant="unknown">` y cada `*Notes` un `<Textarea>` **siempre visible, nunca condicionado a su respuesta**: `hadPrescriptionError`/`prescriptionErrorNotes`, `hadContaminatedVaccine`/`contaminatedVaccineNotes`, `hadAbnormalVaccineConditions`/`abnormalConditionsNotes`, `hadPreparationError`/`preparationErrorNotes`, `hadHandlingError`/`handlingErrorNotes`, `hadImproperAdministration`/`improperAdministrationNotes`. Cierra `notes`, texto libre.

**Un `'NO'` con el motivo escrito es un registro válido** y el formulario no lo estorba: la nota comenta la respuesta, no la contiene.

**D — Comunidad** (`investigationCommunitySaveSchema`)

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `patientLatitude` / `patientLongitude` | `<MapPointPicker>` + dos campos numéricos | No | **Rango ±90 / ±180 validado en el cliente**, y 7 decimales redondeados al emitir. Los dos van juntos: un punto es dos columnas o ninguna |
| `hadSimilarEvent` | `<AnswerOptionField variant="unknown">` | No | **Compuerta de `'YES'` estricto**, polaridad normal |
| `similarEventDescription` | `<Textarea>` | **Sí con el bloque abierto** | `INVCOMM_00X_SIMILAR_EVENT_DESCRIPTION_REQUIRED`. Con el bloque cerrado, **prohibida** |
| `similarEventCount` | `<NumberField min={0} max={32767}>` | No, con el bloque abierto | El `0` es contenido. **No se deriva de los tres siguientes** |
| `affectedVaccinated` | Ídem | No, con el bloque abierto | |
| `affectedUnvaccinated` | Ídem | No, con el bloque abierto | |
| `affectedUnknown` | Ídem | No, con el bloque abierto | |
| `otherComments` | `<Textarea>` | No | Texto libre, sin longitud. **Fuera del bloque** |
| `notes` | `<Textarea>` | No | Ídem |

- **Apagar la compuerta limpia los cinco campos y los envía como `null` explícito**, en la misma petición. Es la única forma legal de vaciar la descripción: con el bloque abierto, un `PUT { similarEventDescription: null }` es `400`, porque la obligación sigue en pie.
- **La precedencia del servidor no se reproduce** —prohibición antes que obligación—: el formulario nunca produce el estado que la dispara. Los dos códigos se registran en `errorMessages.ts` de todos modos.
- **Aviso de suma, no bloqueante.** Con los cuatro contadores informados y `affectedVaccinated + affectedUnvaccinated + affectedUnknown ≠ similarEventCount`, se muestra la diferencia bajo el grupo — «el desglose suma 9 y has declarado 12» — y **el botón de guardar sigue activo**. El desglose puede llegar incompleto y obligar a cuadrarlo sería obligar a inventar un número.
- **El `0` y el `null` no son lo mismo, y la comprobación es siempre contra `null`.** «De las afectadas, ninguna estaba vacunada» es una respuesta.

**E — Sección H, sobre la cabecera**

`investigation.notes`, un `<Textarea>` sin longitud máxima, guardado con `ESAVI-INVESTGN-004`. **Es el único campo del paso 5 que escribe contra la cabecera después de A1**, y tiene su propio «Guardar y continuar» porque su `useForm` es otro.

### 3.6 Orden de pantalla, revelado progresivo y cierre de la etapa

El paso 5 queda con **diecisiete secciones** en el orden de `ESAVI-FORM.md`. Las cuatro de este spec van al final:

| # | Identificador | Sección del formulario | De qué spec |
|---|---|---|---|
| 1–13 | `sources` … `coldChainTransport` | §1, A1, A2, B, B1, B2, C, D, D1, E1, E2 | FE13a–FE13d |
| **14** | `administrationErrorSyringes` | **F — Jeringas y agujas** | Este spec |
| **15** | `administrationErrorPractices` | **F2 — Procedimiento de reconstitución** (dos bloques visuales) | Este spec |
| **16** | `community` | **G — Investigación comunitaria** | Este spec |
| **17** | `otherFindings` | **H — Otras constataciones, observaciones y comentarios** | Este spec |

- **`useProgressiveSections` tal cual**, sin cambios en el hook: se le pasan cuatro identificadores más. Las secciones 14, 15 y 16 llevan «Guardar y continuar»; **la 17 no lo lleva**, porque detrás de ella está el cierre de la etapa.
- **F y F2 son dos identificadores de revelado y un solo formulario.** El revelado los separa —F2 no aparece hasta que F se guarda— pero el `useForm` y el `PUT` son uno: al pulsar «Guardar y continuar» en F se escribe la fila con lo que haya y se revela F2; al pulsarlo en F2 se escribe la misma fila otra vez y se revela G. **Es el patrón de E1/E2 de FE13d**, con la diferencia de que aquí el primer bloque sí tiene botón propio.
- **F2 se parte en dos bloques visuales con encabezado** —«Reconstitución» y «Errores de administración»— dentro de la misma sección. Son veintiún controles seguidos y sin ese corte la pantalla es ilegible; pero **no son dos secciones de revelado**: separar por un botón dos bloques de la misma fila que nadie está obligado a rellenar añadiría un viaje sin ganar nada.
- **Al reentrar en un paso que ya existía, las diecisiete visibles y ningún botón intermedio.** La regla de FE12f, sin excepción.

**El cierre de la etapa**, debajo de H, en `CaseWizardActionBar`:

- **No valida nada.** Ninguna columna del paso 5 es obligatoria: un expediente donde nada se exige y aun así no deja completar sería lo peor de las dos cosas.
- **Avisa, de forma no bloqueante, de las secciones íntegramente vacías.** El aviso se calcula sobre lo leído del servidor —no sobre el formulario— y lista por nombre las secciones cuyas columnas de datos están todas en `null`: «Estas secciones quedaron sin rellenar: Cadena de frío, Investigación comunitaria. Puedes completar la etapa igualmente y volver a editarlas después.» Las listas satélite cuentan como vacías cuando no tienen filas activas.
- **Diálogo de confirmación que dice lo que hace y lo que no.** «Completar etapa marca la investigación como terminada. **No cierra el expediente** y podrás seguir editando el paso hasta que se cierre.» Es la regla de §4.2 y §4.5 del `CASE-PROCESS.md`, y decirla aquí evita la llamada de soporte.
- **`ESAVI-CASEFLOW-007`**, e invalida `['caseWorkflow', 'byCase', caseId]`. El stepper se repinta con la etapa marcada y el asistente lleva al paso 6 si existe.
- **Con el expediente `CLOSED` no se pinta**, igual que el resto de las acciones de escritura (FE08).

### 3.7 La precarga del marcador, y sus tres caídas

`usePatientResidenceCenter(patientId)` encadena dos lecturas y devuelve `{ lat, lng } | null`:

```
esaviCase.patient.patientId        ya en caché, viene con la página del asistente
  → ESAVI-PATIENT-003              ['patient', 'detail', patientId]
      residence?.geoLocationId     ← puede ser null: el paciente no tiene residencia registrada
  → ESAVI-GEOLOC-003               ['geoLocation', 'detail', geoLocationId]   enabled sólo con el id
      latitude / longitude         ← number | null, las dos por separado
```

**Las tres caídas, todas silenciosas:** el paciente sin `residence`, la división sin `latitude` o sin `longitude`, y cualquiera de las dos lecturas fallando. En los tres casos el mapa abre en `VITE_MAP_DEFAULT_CENTER` **sin marcador y sin mensaje de error** — la precarga es una comodidad, no un requisito, y un toast rojo por no poder centrar un mapa sería ruido.

**Lo que la precarga es y lo que no es:**

- **Es el centro del mapa y un marcador propuesto**, no un valor del formulario. Mientras el usuario no lo mueva, `patientLatitude` y `patientLongitude` siguen en `null` y **un guardado escribe `null`**. Un expediente que nadie tocó no registra el centroide de un cantón como domicilio del paciente.
- **El marcador propuesto se pinta distinto** —atenuado, con un anillo discontinuo— y lleva su aviso: «Posición aproximada, tomada de la residencia registrada. Arrastra el marcador para indicar el domicilio.»
- **El aviso muere al primer arrastre o a la primera edición numérica**, y entonces el marcador pasa a su forma normal y los dos campos del formulario tienen valor.
- **No se ofrece «usar la posición aproximada».** Un botón que copie el centroide a las columnas convertiría la aproximación en un dato, que es justo lo que el aviso existe para impedir.
- **`<MapPointPicker>` no cambia de contrato.** Es el mismo de FE13a: `value`, `onChange`, `fallbackCenter`, `disabled`, `ariaLabel`. Lo aproximado se pinta **fuera** del picker, como `value === null` con un `fallbackCenter` señalado — la primitiva no aprende un tercer estado para un solo consumidor.

### 3.8 Estados de la pantalla

Los cuatro de `CONVENTIONS.md`, con clave i18n, nunca literales:

| Estado | Qué se ve |
|---|---|
| **Carga** | Esqueletos con la forma de cada sección mientras resuelven `ESAVI-INVADMER-006` y `ESAVI-INVCOMM-006`. El mapa de G reserva su altura desde el primer render para que la página no salte cuando llegue la precarga |
| **Vacío** | No aplica en el sentido del listado: las dos fichas son una fila y se crean al revelarse la sección. Lo que sí existe es la **ficha recién creada**, con las veintiséis columnas en `null` — que es el estado normal de entrada, no un vacío que haya que anunciar |
| **Error** | El mensaje del `code` del envelope, resuelto por `errorMessages.ts`. Un fallo al crear la fila deja la sección visible y **deshabilitada con su motivo** y un botón de reintentar, no una sección en blanco. Las dos lecturas de la precarga son la excepción: fallan en silencio (§3.7) |
| **Sin permiso** | No se alcanza: el asistente entero está tras `<RequireRole level={USER}>` y las once rutas de este spec son USER. Un `403` del interceptor es un fallo de sesión, no una pantalla de este paso |

**Y un quinto, que es el del paso completo:** con el expediente `CLOSED`, las cuatro secciones se pintan **en sólo lectura** —el mapa incluido, con `disabled`— y ni «Guardar y continuar» ni «Completar etapa» existen. Es la regla de FE08 y aquí no se matiza.

### 3.9 Responsividad y accesibilidad

- **Ninguna lista nueva**, así que no hay tarjeta por debajo de `md` que decidir: las cuatro secciones son formularios sobre dos filas 1:1 y la cabecera.
- **Los grupos de controles bajan a una columna** por debajo de `md`. Los cuatro contadores de G y las seis parejas `had*` / `*Notes` de F2 son los dos sitios donde se nota, y las parejas mantienen **respuesta y nota juntas** al apilarse: separarlas obligaría a recordar de qué era la nota.
- **El mapa a ancho completo** por debajo de `md`, con altura fija y los dos campos numéricos **debajo**, no al lado.
- **Cada bloque es un `<fieldset>` con su `<legend>`**: los cuatro tipos de jeringa, las cinco de reconstitución, las seis parejas y los cuatro contadores. El error de la regla de mínimo se anuncia en el `<legend>` del primero, que es lo que lee un lector de pantalla al entrar al grupo.
- **Lo que aparece por un cambio en otro control va en `aria-live="polite"`**: el bloque de tipos de jeringa, `otherSyringesDescription`, el bloque del evento similar y el aviso de suma.
- **La alternativa sin ratón del mapa es obligatoria** y ya está en el contrato de `<MapPointPicker>` (FE13a §3.7): dos campos numéricos sincronizados en las dos direcciones. Un mapa que sólo responde a arrastrar no es accesible, y el dato tiene que poder pegarse desde un GPS.
- **Los textos informativos del formulario se pintan como tales** —«Jeringas y agujas», «Procedimiento de reconstitución», el párrafo de la investigación comunitaria—, con el mismo tratamiento que FE13a dio a los suyos. Son parte del formulario en papel y quien transcribe los busca.
- **Ningún color literal.** Los estados del marcador aproximado y el aviso de suma usan tokens semánticos; un `text-amber-600` suelto rompería el tema oscuro (§6.1).

### 3.10 Claves i18n nuevas

Todas bajo `investigation.*`, en `src/locales/es.json`, `en.json` y `nl.json` — **los tres archivos, sin excepción**:

| Espacio | Qué contiene |
|---|---|
| `investigation.sections.administrationErrorSyringes.*` | Título de F, texto informativo «Jeringas y agujas», las siete etiquetas |
| `investigation.sections.administrationErrorPractices.*` | Título de F2, los dos encabezados de bloque, las seis de reconstitución y las trece de las parejas más `notes` |
| `investigation.sections.community.*` | Título de G, el párrafo informativo literal, las once etiquetas y las dos del mapa |
| `investigation.sections.otherFindings.*` | Título de H y la etiqueta de `notes` |
| `investigation.map.approximate.*` | El aviso de posición aproximada y su instrucción |
| `investigation.community.countMismatch` | El aviso de suma, con `{{declared}}` y `{{breakdown}}` interpolados |
| `investigation.syringes.minimumRequired` | «Indica al menos un tipo de jeringa usada» |
| `investigation.complete.*` | El diálogo de «Completar etapa»: título, cuerpo con lo que hace y lo que no, botones |
| `investigation.complete.emptySections` | El aviso no bloqueante, con la lista de secciones interpolada |
| `errors.INVADMER_*` / `errors.INVCOMM_*` | Los códigos del envelope en `errorMessages.ts`, incluidos los dos que el formulario no debería producir |

**Las etiquetas salen literalmente de `ESAVI-FORM.md`**, incluidas sus rarezas de puntuación —«¿Los diluyentes y las vacunas usadas ¿son las mismas recomendadas por el fabricante?» pierde el segundo signo de apertura, y es la única corrección que este spec hace sobre el texto del formulario. Ninguna otra se retoca.

---

## 4. Plan de implementación

**1. Contratos y tipos.** `npm run contracts:sync` para `CreateInvestigationAdministrationErrorInput` y `CreateInvestigationCommunityInput`; declarar a mano `InvestigationAdministrationErrorDetail` e `InvestigationCommunityDetail` en `contracts/declared/`, **sin `isActive`** en ninguna de las dos.
*Verificación:* `npx tsc --noEmit -p tsconfig.app.json` limpio, y cada campo declarado contrastado contra el servicio del backend — ninguno inventado.

**2. Capa de API.** En `features/investigation/api.ts`, las dos entidades con sus tres operaciones cada una (`001`, `006`, `004`), con el código `ESAVI-*` citado en cada hook. Las claves, las de §3.4.
*Verificación:* un test con MSW comprueba que el `004` pega contra `/:id` con el `investigationId` y que el `001` lleva `investigationId` en el cuerpo.

**3. Schemas y errores.** Los dos schemas de §3.5, la compuerta invertida, el `superRefine` de la regla de mínimo, la limpieza de los cinco campos al salir del bloque, la compuerta del evento similar con su obligación, y el rango ±90/±180 con redondeo a 7 decimales. Los códigos nuevos en `errorMessages.ts`.
*Verificación:* tests de schema — los cinco valores que cierran el bloque de jeringas, los cuatro `false` que no satisfacen el mínimo, la descripción obligatoria y prohibida, una latitud de 500 rechazada y una de ocho decimales redondeada.

**4. `usePatientResidenceCenter`.** Las dos lecturas encadenadas, el `enabled` del segundo y las tres caídas a `null`.
*Verificación:* tests con MSW para el camino feliz, el paciente sin `residence`, la división con `latitude` nula y el `500` en cualquiera de las dos — los cuatro devuelven sin lanzar y los tres últimos devuelven `null`.

**5. `AdministrationErrorSection.tsx`.** F y F2 en un `useForm`: el bloque de jeringas con su compuerta y su `<fieldset>`, los dos bloques visuales de F2 con sus encabezados, las veintiuna columnas siempre visibles, y el guardado que compone la salida del bloque en una sola petición.
*Verificación:* abrir con `'NO'`, marcar un tipo, cambiar la bandera a `'YES'` y comprobar en el `PUT` interceptado que **viajan la bandera nueva y los cuatro tipos limpios en el mismo cuerpo**. Y que con `'YES'`, `UNKNOWN`, `NOT_APPLICABLE` y `null` el bloque no se pinta.

**6. `CommunitySection.tsx`.** El mapa con la precarga y su aviso, la compuerta del evento similar, los cuatro contadores con su aviso de suma, y los dos textos libres de fuera del bloque.
*Verificación:* con la precarga resuelta, el formulario guarda `patientLatitude: null` si nadie arrastró el marcador; tras arrastrarlo, guarda el punto y el aviso desaparece. El aviso de suma aparece con `12` declarados y `9` desglosados, y el botón de guardar sigue activo.

**7. `OtherFindingsSection.tsx`.** H sobre la cabecera, con `ESAVI-INVESTGN-004` y su propia invalidación.
*Verificación:* un guardado en H no invalida las claves de las dos fichas, y el `notes` escrito sobrevive a recargar el paso.

**8. Quitar `notes` de A1.** `BasicInformationSection.tsx` pierde el `<Textarea>` y su clave i18n se reubica; el `investigationSaveSchema` conserva el campo, porque H escribe contra el mismo `PUT`.
*Verificación:* el campo aparece una sola vez en el paso 5, y un valor guardado desde H se lee en H al reentrar. El test de integración de FE13a que tocaba `notes` en A1 se actualiza, no se borra.

**9. Montar las cuatro secciones y el cierre.** `InvestigationStep.tsx`: los cuatro identificadores nuevos, el aviso de secciones vacías calculado sobre lo leído del servidor, el diálogo de confirmación y la llamada a `ESAVI-CASEFLOW-007`.
*Verificación:* recorrido de integración completo — entrar al paso vacío y llegar a completar la etapa sin rellenar nada, con el aviso listando las secciones vacías; reentrar y ver las diecisiete visibles sin botones intermedios; y con el expediente `CLOSED`, todo en sólo lectura y sin botón de completar.

**10. i18n en los tres archivos.** Las claves de §3.10 en `es.json`, `en.json` y `nl.json`, con las etiquetas tomadas literalmente de `ESAVI-FORM.md`.
*Verificación:* el linter de claves no reporta huérfanas ni faltantes en ninguno de los tres, y ningún literal en JSX.

**11. Cierre.** El checklist de `CONVENTIONS.md` §14, `npx tsc --noEmit -p tsconfig.app.json` y la suite completa.
*Verificación:* los tres verdes, y ningún color literal nuevo bajo `features/investigation/`.

---

## 5. Criterios de aceptación

1. Con `usedAutoDisableSyringes` en `'NO'`, el bloque de cuatro tipos y `syringesKeyFindings` se ven; con `'YES'`, `'UNKNOWN'`, `'NOT_APPLICABLE'` o `null`, **sólo `syringesKeyFindings`**.
2. Con el bloque abierto y los cuatro tipos sin tocar o los cuatro en `false`, el guardado **no sale del cliente**: el error se ancla en el `<fieldset>` y dice qué falta. No hay toast con un código.
3. Con un tipo en `true`, cambiar la bandera a cualquier otro valor produce **un solo `PUT`**, cuyo cuerpo lleva la bandera nueva y los cinco campos del bloque limpios.
4. `usedOtherSyringes: true` **sin descripción guarda sin error**, en el alta y en la edición.
5. `syringesKeyFindings` es visible con la compuerta en los cinco valores, y las veintiuna columnas sin compuerta de F y F2 son visibles en todo momento.
6. Las cinco de reconstitución admiten `'YES'` **las cinco a la vez** y el guardado lo acepta.
7. Cada `*Notes` se puede escribir con su `had*` en `'NO'`, y el guardado lo acepta.
8. Con `hadSimilarEvent` en `'YES'` y la descripción vacía, el guardado no sale del cliente; al cerrar la compuerta, los cinco campos viajan como `null` en la **misma** petición y el guardado pasa.
9. Una latitud fuera de ±90 o una longitud fuera de ±180 se rechaza en el cliente; un punto con más de siete decimales se **redondea al emitir** y no produce `400`.
10. El mapa abre centrado en la residencia del paciente cuando las dos lecturas resuelven, y en `VITE_MAP_DEFAULT_CENTER` cuando el paciente no tiene residencia, la división no tiene coordenadas o cualquiera de las dos lecturas falla — **sin mensaje de error en los cuatro casos**.
11. Con el marcador sin arrastrar, el aviso de posición aproximada está visible y un guardado escribe `patientLatitude: null` y `patientLongitude: null`. Tras arrastrarlo, el aviso desaparece y las dos columnas llevan el punto.
12. Con los cuatro contadores informados y la suma distinta de `similarEventCount`, se muestra la diferencia y **el guardado sigue disponible**; `similarEventCount` no se recalcula nunca.
13. `investigation.notes` aparece **una sola vez** en el paso 5, en la sección H, y lo guardado se lee allí al reentrar.
14. El paso 5 revela diecisiete secciones en el orden de `ESAVI-FORM.md`; al reentrar en un paso ya existente, **todas visibles y ningún botón intermedio**.
15. «Completar etapa» aparece sólo en la sección H, **completa un paso íntegramente vacío**, y antes muestra el aviso no bloqueante con los nombres de las secciones sin rellenar.
16. El diálogo de confirmación dice explícitamente que completar la etapa **no cierra el expediente**.
17. Completar la etapa invalida `['caseWorkflow', 'byCase', caseId]` y el stepper se repinta sin recargar la página.
18. Con el expediente `CLOSED`, las cuatro secciones están en sólo lectura, el mapa `disabled`, y no existen ni «Guardar y continuar» ni «Completar etapa».

**Cierre:** `npx tsc --noEmit -p tsconfig.app.json` sin errores, la suite de Vitest en verde, el checklist de `CONVENTIONS.md` §14 recorrido, las claves i18n presentes en los **tres** archivos de idioma y **ningún color literal** en los componentes nuevos.

---

## 6. Decisiones tomadas y descartadas

**1. La compuerta de las jeringas se escribe `=== 'NO'`, y el test lo blinda.** Es la única inversión del expediente. *Descartado*: normalizarla a «abre con la afirmación» invirtiendo la etiqueta en pantalla —preguntar «¿se usaron jeringas no autodestructibles?»—, que contradiría el texto literal del formulario en papel y rompería la transcripción, que es lo que `ESAVI-FORM.md` existe para proteger.

**2. La regla de mínimo se valida en el cliente.** Es una regla sobre el estado resultante de cuatro controles, y un toast con `INVADMER_00X_SYRINGE_TYPE_REQUIRED` no señala ninguno. *Descartado*: dejarla al servidor y traducir el código, como se hace con los errores de una sola columna. El código se registra igual, como red de seguridad si el backend endurece la regla.

**3. `otherSyringesDescription` no se exige.** Rompe el patrón de los otros cinco «otro» del expediente y aun así se respeta el servidor. El motivo, ya escrito en §5.5.5: **este cliente sólo endurece al backend cuando su omisión produce un dato contradictorio**. «Se usó otro tipo de jeringa» es información completa aunque no se detalle cuál. *Descartado*: exigirla por simetría con el evento, la fuente y la evaluación clínica.

**4. F y F2 son dos secciones de revelado y un solo formulario.** El revelado los separa; la fila y el `PUT` son uno. *Descartado*: dos filas —imposible, es una tabla 1:1— y un solo identificador de revelado, que dejaría veintiséis columnas de golpe en la primera aparición.

**5. F2 se parte en dos bloques visuales, no en dos secciones.** Veintiún controles seguidos son ilegibles, pero separarlos con un botón de guardado añadiría un viaje sin ganar nada: es la misma fila y nadie está obligado a rellenar ninguna de las dos mitades. *Descartado*: un tercer identificador de revelado para «Errores de administración».

**6. Las seis `*Notes` se ven siempre.** Nada las ata a su `had*` en el backend, y **un `'NO'` con el motivo escrito es un registro válido**. *Descartado*: condicionarlas a su respuesta, que agruparía por parejas y perdería registros legítimos — el reflejo más caro de este bloque, junto con agrupar por prefijo.

**7. `syringesKeyFindings` se pinta fuera del bloque, pese al prefijo.** Cuarto nombre engañoso del paso 5, tras los `storage*` y los `*InThermos` de FE13d. *Descartado*: meterlo dentro del `<fieldset>` de jeringas, que lo ocultaría en todo caso de jeringa autodestructible — que es el caso normal.

**8. El aviso de suma no bloquea y el total no se deriva.** El desglose puede llegar incompleto —doce casos conocidos y nueve clasificados— y derivar `similarEventCount` de los otros tres lo haría imposible de registrar. *Descartado*: bloquear el guardado, que obligaría a inventar un número, y calcular el total automáticamente, que borraría el dato que el investigador sí tiene.

**9. El rango de coordenadas se valida en el cliente en las dos entidades.** `investigationCommunity` lo valida también en el servidor; `investigation` no. La asimetría se anota y **no se pide al backend**: una coordenada imposible es un error de captura, no una vía de ataque, y §10 del `CASE-PROCESS.md` ya lleva seis peticiones abiertas. *Descartado*: abrir la séptima.

**10. La precarga no escribe columnas.** El centroide de una división administrativa no es un domicilio, y guardarlo porque nadie tocó el mapa registraría un dato falso que después nadie sabría distinguir de uno real. *Descartado*: copiar la precarga a las dos columnas al crear la fila, y ofrecer un botón «usar la posición aproximada» — que es la misma decisión disfrazada de consentimiento.

**11. Lo aproximado se pinta fuera de `<MapPointPicker>`.** La primitiva se queda con el contrato de FE13a: `value === null` más un `fallbackCenter` señalado. *Descartado*: enseñarle un tercer estado por un solo consumidor — la regla de `ARCHITECTURE.md` §4.3 es que ninguna primitiva es de una sola pantalla, y su corolario es que ninguna aprende un estado que sólo una usa.

**12. Las tres caídas de la precarga son silenciosas.** *Descartado*: un toast por no poder centrar un mapa. La precarga es una comodidad; su ausencia no impide capturar nada.

**13. «Completar etapa» no valida, pero avisa.** Ninguna columna del paso es obligatoria (§5.5.5 y las cuatro anteriores), así que bloquear sería inventar una obligación que el backend no tiene; y completar sin avisar convertiría un olvido en un paso dado por terminado. *Descartado*: exigir al menos una sección rellena, y completar en silencio.

**14. El aviso se calcula sobre lo leído del servidor, no sobre los formularios.** Un formulario abierto con cambios sin guardar no cuenta como relleno — y decir lo contrario mentiría exactamente en el caso que importa. *Descartado*: derivarlo del estado de los `useForm`.

**15. `investigation.notes` se mueve de A1 a H.** El orden de `ESAVI-FORM.md` es la razón por la que ese documento se adoptó, y H existe precisamente para ese campo. *Descartado*: dejarlo en A1 y no pintar H —una sección del formulario sin equivalente en pantalla—, y pintarlo en los dos sitios sincronizado, que sería el mismo dato en dos lugares de la misma pantalla.

**16. Las trece `answerOption` usan `unknown`.** Con ellas se cierra el reparto del expediente: **`noAnswer` no aparece ni una vez en cuarenta columnas**. Estas preguntas no se le hacen a nadie — se observan, se revisan, se examinan. *Descartado*: la variante `full`, que ofrecería «no contestó» a un investigador que no entrevistó a nadie.

**17. La precedencia de errores del servidor no se reproduce.** El formulario nunca produce el estado que la dispara. Los dos códigos se registran de todos modos. *Descartado*: replicar en el cliente el orden prohibición-antes-que-obligación, que sería mantener dos veces una lógica que sólo importa depurando.

---

## 7. Riesgos identificados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **La compuerta invertida se implementa como `=== 'YES'`** y funciona en todas las pruebas manuales menos en el caso que importa | Test explícito con los cinco valores de cierre, y el `'NO'` como único que abre. Está en los criterios 1 y 2 |
| 2 | **Los `<Switch>` de los cuatro tipos se implementan como booleanos de dos estados** y pierden el `null` | Son los mismos tri-estado de las ocho fuentes de FE13a: `null` es «no se recogió» y `false` un «no» deliberado. El test de la regla de mínimo distingue los dos |
| 3 | **La salida del bloque se implementa como dos peticiones** —limpiar y luego cambiar la bandera— y la primera recibe `400` | Criterio 3: el `PUT` interceptado tiene que ser uno. El `false` legal del `004` existe precisamente para que una sola petición baste |
| 4 | **Alguien le pone `maxLength` a los diez textos** por parecido con la cadena de frío de FE13d | §3.3 lo dice explícitamente: son `text` sin techo, y un límite de pantalla inventado produce un rechazo que la base no respalda |
| 5 | **La precarga se convierte en dato** por una lectura de más o un `defaultValues` mal sembrado | Criterio 11. El `useForm` nace con `patientLatitude: null`; el centro vive en el `fallbackCenter`, no en los campos |
| 6 | **Las dos lecturas encadenadas se disparan sin `enabled`** y piden `geo-locations/undefined` | El segundo `useQuery` lleva `enabled: Boolean(geoLocationId)`. Test con el paciente sin residencia |
| 7 | **El aviso de secciones vacías se queda desincronizado** cuando FE14 o un spec posterior añada secciones al paso | El aviso recorre la misma lista de identificadores de `useProgressiveSections`, no una copia. Una sección nueva entra en el aviso sin tocarlo |
| 8 | **Completar la etapa con el `investigationId` aún sin resolver**, si alguien pulsa antes de que `CASEFLOW-006` responda | El botón nace deshabilitado hasta que la etapa está en caché; es la misma guarda que FE12a puso en el paso 4 |

---

## 8. Impacto en pantallas existentes

| Qué | Cambio |
|---|---|
| **`BasicInformationSection.tsx` (FE13a)** | **Pierde el `<Textarea>` de `investigation.notes`**, que pasa a la sección H. El `investigationSaveSchema` conserva el campo —H escribe contra el mismo `ESAVI-INVESTGN-004`— y su clave i18n se reubica bajo `investigation.sections.otherFindings.*`. El test de integración de FE13a que tocaba `notes` en A1 se **actualiza**, no se borra |
| **`InvestigationStep.tsx` (FE13a–FE13d)** | Monta cuatro secciones más, pasa `useProgressiveSections` de trece identificadores a diecisiete y **gana el botón de completar la etapa**, que hasta ahora ningún spec del paso 5 montaba |
| **`CaseWizardActionBar` (FE08)** | Sin cambios de código. El paso 5 empieza a usar su acción de completar, que ya existía y estaba sin consumidor en este paso |
| **`<MapPointPicker>` (FE13a)** | **Sin cambios de contrato.** Segundo y último consumidor. FE13a anotaba que el segundo sería FE13d; con el corte real de las secciones, es este spec — la nota de FE13a §3.7 se corrige |
| **`errorMessages.ts`** | Entradas nuevas de `INVADMER_*` e `INVCOMM_*`, incluidas las dos que el formulario no debería producir |
| **`ARCHITECTURE.md` §4.3** | Sin cambios: ninguna primitiva nueva. Las trece siguen siendo trece |

---

## Lo que **no** está en este spec

- El paso 6, la clasificación final, el cierre del expediente (`ESAVI-CASEFLOW-008`) y su reapertura (`-009`) — son **FE14**.
- Pedir y resolver validación (`ESAVI-CASEFLOW-010`, `-011`).
- Retirar, reactivar o purgar las dos fichas 1:1: no hay `005A` ni `005B`, y el `005C` es purga física SUPERADMIN.
- Los listados `002A`/`002B` y las lecturas por id de las dos entidades.
- Cruzar los cuatro contadores de la comunidad en el servidor.
- Validar el rango de coordenadas de `investigation` en el backend: queda anotado como asimetría conocida y resuelto en el cliente.
- Geolocalización del navegador, búsqueda por dirección y dibujo de `geoPolygon`.
- Exigir `otherSyringesDescription`, y condicionar las seis `*Notes` a su respuesta.
- `<AuditTrail>` sobre `investigationAdministrationError` e `investigationCommunity`.
- La entrada de `useProgressiveSections` en `CONVENTIONS.md`.

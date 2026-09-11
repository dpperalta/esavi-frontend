# SPEC FE13d — Paso 5: el acto de vacunación, las vacunas administradas y la cadena de frío

> **Estado:** Borrador
> **Depende de:** SPEC FE08 (armazón del asistente, `CaseWizardActionBar`, sólo lectura si `CLOSED`), SPEC FE11 (el `RadioGroup` Sí/No de dos vías sin retorno a `null`), SPEC FE12a (la cadena guardar/completar de un paso y `<AnswerOptionField>`), SPEC FE12c (`<WhodrugTreePicker>` y su árbol de cinco niveles), SPEC FE12f (`useProgressiveSections`), SPEC FE13a (la cabecera de la investigación y `InvestigationStep.tsx`), SPEC FE13c (las últimas tres secciones montadas sobre ese paso), SPEC F58 del backend (la investigación y sus satélites)
> **Fecha:** 2026-09-11
> **Objetivo:** Cerrar §5.5.4 del `CASE-PROCESS.md` — las secciones D, D1, E1 y E2 del formulario de investigación: qué pasó el día de la vacunación, con qué vacunas, y si la cadena de frío aguantó.

---

## 1. Por qué existe este spec

**A — Es el bloque de las tres compuertas mal leídas, y las tres se leen al revés si uno se fía del nombre.** `isCluster` gobierna cuatro columnas con `'YES'` estricto y **un solo código de error** para las cuatro; `clusterUsedSameVial` exige su contador con el **`'NO'`**, no con el `'YES'`; y `storageTemperatureMonitored` abre **una** columna, no las seis que comparten su prefijo. Ninguna de las tres es un error del esquema: las tres están escritas en el DDL y las tres tienen sentido clínico (§5.5.4). Un formulario construido por intuición sobre los nombres de columna se equivoca en las tres a la vez.

**B — Es la única lista del expediente sin rama cruda, y eso convierte un maestro vacío en una pantalla muerta.** `investigationVaccineAdministered.vaccineWhodrugId` es **obligatorio**: no hay `vaccineName` libre, ni `whoCode`, ni `vaccineCode`. En `notificationVaccine` (§5.4b) la vacuna sin codificar se notificaba por nombre; aquí no hay salida. Si el despliegue no importó el diccionario (`ESAVI-WHODRUG-007`, SUPERADMIN), **la sección entera se deshabilita con su motivo** — sondeando el primer nivel del árbol y comprobando `count === 0` — en vez de abrir un diálogo que no acepta nada.

**C — Dos columnas del DDL no están en el formulario, y se resuelven de manera opuesta.** `vaccinatedPerBatchCount` **se pinta** con etiqueta propia — «Número de personas vacunadas con el lote de la vacuna involucrada», paralela a la del vial de D.3 — porque el dato tiene lectura epidemiológica evidente y el paralelismo lo hace inequívoco. `transportUsedThermos` **también se pinta**, pero por un motivo distinto: sin ella **la exclusión mutua del transporte queda muda**. E2 pregunta por el paquete frío (E2.4) y no por el termo, y el backend rechaza que los dos resulten `'YES'` — sin el campo, «viajó en termo» es inexpresable. Son las dos únicas etiquetas de este spec que no salen de `ESAVI-FORM.md`, y las dos quedan declaradas en §6.

**D — Dieciséis columnas de aspecto uniforme, dos de otro tipo, y el backend no traduce entre ellas.** `storageTemperatureMonitored` y `storageRangeDeviation` son `boolean`; las otras ocho respuestas de la cadena de frío son `answerOption`. Enviar `'YES'` a un booleano es 400, y enviar `true` a un `answerOption` también. `<AnswerOptionField>` **no sirve para las dos primeras**: ahí va el `RadioGroup` Sí/No de FE11, de dos vías y sin retorno a `null`. Es la mezcla de tipos más traicionera del expediente.

**E — Los cinco contadores llevan techo de 32767, y no sale de ningún `CHECK`.** Los `CHECK` del DDL sólo cubren el suelo con `>= 0`; el techo lo pone el tipo `smallint`, y **si el cliente no lo replicara, un 40000 llegaría a Postgres y volvería como un 500** en vez de como un 400 del validador. Es la segunda vez en el paso 5 que el límite de pantalla no se copia del esquema — en FE13c fue el `varchar(250)` de las columnas cifradas; aquí es un techo que el esquema no declara en ninguna parte.

**F — El `0` y el `false` son contenido, y comprobar por veracidad destruye el caso normal.** «De ese vial no se vacunó a nadie más» es una respuesta, no una ausencia; y `storageRangeDeviation: false` —«se monitorizó y no hubo desviación»— es **el hallazgo más frecuente del formulario**. La comprobación es siempre contra `null`, nunca contra la verdad del valor. Es el mismo error dos veces, con dos tipos distintos, en la misma pantalla.

**G — Y `noAnswer` sigue sin un solo caso.** Las once `answerOption` de este bloque usan `unknown`: el investigador **observa** la nevera y **revisa** el registro de transporte, así que cuando no consigue el dato el resultado es «no se sabe», no «se preguntó y no contestó». `full` tampoco entra — `NOT_APPLICABLE` en el transporte sería pedir por segunda vez lo que `investigation.vaccinationSiteItemId` ya distingue (§5.5.1). Quedan las quince de §5.5.5: si allí tampoco aparece, la conclusión ya no es «todavía no ha salido».

---

## 2. Alcance

**Dentro:**

- **Las dos filas 1:1 se crean al revelarse su sección**, con un `POST { investigationId }` a secas (`ESAVI-INVVACTX-001`, `ESAVI-INVCOLD-001`). Ninguna de sus columnas de datos es obligatoria, así que las dos fichas existen desde el primer segundo y el guardado posterior es **siempre `004`**, sin rama `POST`-o-`PUT` dentro del botón. Las dos cuelgan de `investigation` directamente: aquí **no hay el `404` de nieta** de FE13b y FE13c.
- **Sección D — «Información relacionada con ESAVI sobre las personas vacunadas en el sitio de vacunación»**, en el orden del formulario: primero **la lista de vacunas administradas** (D.1–D.2) y después el **contexto** (D.3–D.6) — `vaccinatedPerVialCount`, `vaccinatedPerBatchCount`, `locations`, `momentItemId` y `multidoseItemId`.
- **Los dos desplegables del mismo catálogo con dos mensajes distintos.** `momentItemId` y `multidoseItemId` apuntan los dos a `vaccinationMoment` (3 ítems) y el servicio los valida por separado con **dos códigos de error**. Se replica: el usuario tiene dos desplegables en pantalla y necesita saber cuál rechazar.
- **Sección D1 — «Conglomerados»**: `isCluster` como compuerta de `'YES'` estricto sobre `clusterIdentificationNumber` (≤100), `clusterAdditionalCaseCount`, `clusterUsedSameVial` y `clusterSameVialCount`. **Sin lado obligatorio** con el bloque abierto, salvo la regla del vial.
- **La regla del vial, con su etiqueta reescrita.** Con el bloque abierto y `clusterUsedSameVial === 'NO'`, `clusterSameVialCount` es **obligatorio**. La etiqueta oficial de D1.5 —«enumere los viales usados por el conglomerado de casos»— describe otra cosa y se **reescribe**: «¿Cuántos casos del conglomerado usaron el mismo vial?». **El `0` satisface la obligación.**
- **El bloque del conglomerado validado en el cliente, no traducido del 400.** Apagar la compuerta limpia las cuatro columnas y las envía como `null` explícito (§7.3); la precedencia del servidor —bloque cerrado gana sobre regla del vial— no hace falta reproducirla porque el formulario nunca produce ese estado.
- **`<SatelliteList>` sobre `investigationVaccineAdministered`** con diálogo de alta y edición: `<WhodrugTreePicker>` **obligatorio**, `doseNumber` y `notes`. Tres columnas, y las tres caben en la tarjeta por debajo de `md`.
- **El sondeo del diccionario WHODrug.** Una lectura del primer nivel del árbol (`ESAVI-WHODRUG-006A`); con `count === 0` la sección se pinta **deshabilitada con su motivo**, no como una lista vacía.
- **La guarda de duplicado del trío** `(investigationId, vaccineWhodrugId, doseNumber)` entre las activas, leída del `409`, **con el `null` de la dosis dentro de la comparación** y con el mensaje diciendo que **lo que colisiona es la vacuna, no la dosis**.
- **Sección E1 — «Cadena de frío»**: `storageTemperatureMonitored` como `RadioGroup` Sí/No abriendo **sólo** `storageRangeDeviation`, más las seis columnas `storage*` restantes **fuera del bloque** — `storageProcedureFollowed`, `storageOtherObjectPresent`, `storagePartiallyReconstitutedVaccine`, `storageVaccineNotUsable`, `storageDiluentNotUsable` y `storageKeyFindings`.
- **Sección E2 — «Transporte»**: `transportTypeThermo` (≤250), `transportSetInThermos`, `transportReturnedInThermos`, `transportUsedThermos` y `transportUsedColdPack`, más `transportKeyFindings` y `notes`.
- **Los dos contenedores excluyentes en pantalla**: marcar uno pone el otro en `'NO'`, y así el `400 TRANSPORT_CONTAINER_CONFLICT` no sale nunca. Una fila heredada con los dos en `'YES'` se resuelve **por precedencia del termo** —lo mismo que hace el servidor— con **aviso no bloqueante** de que el próximo guardado lo corrige.
- **Las tres etiquetas que no dicen «termo».** `transportSetInThermos`, `transportReturnedInThermos` y `transportTypeThermo` **no cuelgan de ninguna de las dos banderas**: se muestran siempre y sus claves i18n dicen **«contenedor»**, porque ocultarlas con el termo perdería los tres datos en todo caso de paquete frío.
- **E1 y E2 son dos identificadores de revelado sobre la misma fila**: comparten `useForm` y **un solo «Guardar y continuar»**, al final de E2.
- **Los cinco contadores con `<NumberField min={0} max={32767}>`** — los cuatro del contexto y `doseNumber`. El techo es validación, **no texto de ayuda**.
- **Las tres lecturas del paso**: `ESAVI-INVVACTX-006` e `ESAVI-INVCOLD-006` por caso, `ESAVI-INVVACAD-002A` por investigación.
- **El revelado progresivo de FE12f** extendido con cuatro identificadores: `vaccinesAdministered`, `vaccinationContext`, `coldChainStorage` y `coldChainTransport` — de nueve a trece. Al reentrar en un paso que ya existía, todo visible y ningún botón intermedio.
- **Los tres contratos sincronizados** más sus tres respuestas declaradas a mano en `contracts/declared/`.
- **Las claves i18n nuevas bajo `investigation.*`**, en los tres idiomas.
- **Tests**: la compuerta del conglomerado con su limpieza, la regla del vial con el `0`, el techo de 32767, la exclusión del transporte y el empate heredado, el `409` del trío con dosis nula, el sondeo del diccionario vacío, y el recorrido de integración de las cuatro secciones — alta, reentrada, apagado de la compuerta con campos escritos y expediente cerrado.

**Fuera de alcance (otros specs):**

- **§5.5.5 completa** — el error de administración, la investigación comunitaria y la sección H de notas (FE13e). **Es FE13e quien cierra la etapa**: este spec sólo deja «Guardar y continuar»; el «Completar etapa» de `CaseWizardActionBar` no se pulsa aquí.
- **Retirar, reactivar o borrar en la lista de vacunas administradas.** `ESAVI-INVVACAD-005A` y `-005B` exigen **ADMIN** mientras las catorce entidades del paso 5 escriben como USER. El comportamiento objetivo queda declarado en §3.5 y **bloqueado por la deuda de §10** de `CASE-PROCESS.md`, igual que en FE13a, FE13b y FE13c. Hasta que las rutas bajen a USER, el botón no se pinta.
- **Retirar o purgar las dos fichas 1:1.** No hay `005A` ni `005B`: ninguna de las dos tablas tiene `isActive` y sólo existe `005C`, purga física, SUPERADMIN. El asistente **crea y limpia; no borra** (§5.5.0).
- **Reordenar las vacunas administradas.** `sortOrder` lo pone un disparador y **no se envía nunca**; el orden es el de creación.
- **Importar el diccionario WHODrug.** `ESAVI-WHODRUG-007` es SUPERADMIN y pertenece a una pantalla de administración del maestro, no al asistente. Este spec **detecta** el maestro vacío; no lo resuelve.
- **Reproducir en el cliente el relevo y el empate heredado del transporte.** Son reparaciones silenciosas del servidor sobre estados que la aplicación no produce. El cliente impide el conflicto y avisa del empate; no replica la lógica.
- **Cruzar los cuatro contadores entre sí.** Nada en el backend comprueba que `clusterSameVialCount ≤ clusterAdditionalCaseCount`, y el cliente **no inventa la restricción**: el conglomerado puede tener casos que el investigador aún no ha contado.
- **Cruzar la lista de vacunas administradas con `notificationVaccine`.** Nada ata las dos tablas. Ni precarga, ni sugerencia, ni aviso de discrepancia — la misma decisión que FE13c tomó sobre los diagnósticos y `notificationEvent`.
- **Ofrecer `NOT_APPLICABLE` en las cuatro columnas de transporte.** El sitio de vacunación ya distingue intramuros de extramuros (§5.5.1); pedirlo dos veces es lo que §6 del `CASE-PROCESS.md` enseña a no hacer.
- **Los listados `002B` con inactivas.** Son ADMIN y pertenecen a una pantalla de administración del expediente.
- **`<AuditTrail>` sobre las tres tablas.** El array `appDetails` viaja en las respuestas; la pantalla de auditoría del expediente es un spec propio.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** Quinto uso, misma decisión que FE13a, FE13b y FE13c: escribir la norma es un cambio de `CONVENTIONS.md`, no de este spec.

---

## 3. Diseño

### 3.1 Pantallas y archivos

**No hay ruta nueva ni pantalla nueva.** El paso 5 ya está enrutado por FE08 en `/esavi-cases/:id/wizard/investigation`, con el guard `<RequireRole level={USER}>` del asistente; FE13a lo pobló, FE13b y FE13c le añadieron seis secciones. Este spec añade cuatro más detrás.

| Archivo | Qué es |
|---|---|
| `features/investigation/VaccineAdministeredList.tsx` | **Nuevo.** D.1–D.2 — `<SatelliteList>` sobre las vacunas administradas, con el sondeo del diccionario |
| `features/investigation/VaccineAdministeredFormDialog.tsx` | **Nuevo.** Alta y edición de una vacuna administrada |
| `features/investigation/VaccinationContextSection.tsx` | **Nuevo.** D.3–D.6 y D1 completa — el contexto y la compuerta del conglomerado |
| `features/investigation/ColdChainSection.tsx` | **Nuevo.** E1 y E2 sobre una sola fila: dos bloques visuales, un `useForm`, un guardado |
| `features/investigation/api.ts` | **Cambia.** Tres entidades más sobre la base de FE13a–FE13c |
| `features/investigation/schemas.ts` | **Cambia.** Tres schemas, la compuerta del conglomerado y la exclusión del transporte |
| `features/esaviCase/InvestigationStep.tsx` | **Cambia.** Monta las cuatro secciones y amplía `useProgressiveSections` de nueve identificadores a trece |

`shared/config/navigation.ts` **no cambia**: el paso 5 se alcanza desde el asistente, no desde el menú. **Ninguna primitiva nueva de `shared/`**: las trece de `ARCHITECTURE.md` §4.3 bastan, y este spec usa nueve de ellas.

### 3.2 Endpoints consumidos

Copiado textualmente de `references/API-ROUTES.md`:

```
POST   /api/investigation-vaccination-contexts             ESAVI-INVVACTX-001   USER   crear la ficha (lleva investigationId en el cuerpo)
GET    /api/investigation-vaccination-contexts/case/:id    ESAVI-INVVACTX-006   USER   leer la ficha por caso
PUT    /api/investigation-vaccination-contexts/:id         ESAVI-INVVACTX-004   USER   actualizar (:id es el investigationId)

POST   /api/investigation-vaccines-administered                   ESAVI-INVVACAD-001   USER   crear una vacuna administrada
GET    /api/investigation-vaccines-administered/investigation/:id ESAVI-INVVACAD-002A  USER   listar las activas de la investigación
PUT    /api/investigation-vaccines-administered/:id               ESAVI-INVVACAD-004   USER   actualizar

POST   /api/investigation-cold-chains             ESAVI-INVCOLD-001   USER   crear la ficha (lleva investigationId en el cuerpo)
GET    /api/investigation-cold-chains/case/:id    ESAVI-INVCOLD-006   USER   leer la ficha por caso
PUT    /api/investigation-cold-chains/:id         ESAVI-INVCOLD-004   USER   actualizar (:id es el investigationId)

GET    /api/whodrug-vaccines/abbreviations        ESAVI-WHODRUG-006A  USER   primer nivel del árbol; sondeo del maestro y primer paso del picker
GET    /api/catalog-items/type/:id                ESAVI-CATITEM-002A  USER   el catálogo `vaccinationMoment`, consumido dos veces
```

`<WhodrugTreePicker>` consume además `ESAVI-WHODRUG-006B`…`006E`, los cuatro niveles restantes del árbol; los declara FE12c y este spec no los toca.

**Lo que no se consume, y por qué:**

- **`ESAVI-INVVACTX-002A`, `-002B`, `-003` y `ESAVI-INVCOLD-002A`, `-002B`, `-003`.** El asistente entra por el caso, no por el id de la ficha: el `006` resuelve la lectura en una llamada y es el único que el paso necesita. Los `002A` de estas dos, además, son listados globales sin filtro por investigación — no sirven aquí.
- **`ESAVI-INVVACAD-006`.** Existe y devuelve lo mismo que el `002A`, pero el paso ya conoce el `investigationId` desde `caseWorkflowByCaseKey`, así que la lectura por investigación es la directa. Se deja anotado como respaldo.
- **`ESAVI-INVVACAD-002B`.** Es ADMIN y trae las retiradas; el asistente sólo trabaja con las activas.
- **`ESAVI-INVVACAD-003`.** El diálogo de edición se abre con la fila que ya trajo el listado.
- **`ESAVI-INVVACAD-005A` y `-005B`.** Exigen ADMIN — deuda de §10, declarada en §3.5 y fuera de alcance.
- **`ESAVI-INVVACTX-005C`, `ESAVI-INVVACAD-005C`, `ESAVI-INVCOLD-005C`.** Purga física, SUPERADMIN. No se expone en el asistente.
- **`ESAVI-WHODRUG-007`.** La importación del diccionario es SUPERADMIN y de otra pantalla. Este spec **lee** el maestro para saber si está vacío; no lo llena.

**Un catálogo, dos consumos, dos errores:**

| Campo | Catálogo | Nota |
|---|---|---|
| `momentItemId` | `vaccinationMoment` | «¿Cuándo fue vacunada la persona que tuvo el o los ESAVI?» |
| `multidoseItemId` | `vaccinationMoment` | «¿En el caso de viales multidosis, se administró la vacuna?» |

La clave de TanStack Query es **la misma** —una sola lectura, los dos desplegables la comparten—, pero los **códigos de error son dos distintos** y `errorMessages.ts` los registra por separado. Compartir el catálogo es una decisión de datos; compartir el mensaje sería la peor decisión de interfaz posible, porque el usuario tiene los dos desplegables delante y necesita saber cuál rechazar.

### 3.3 Tipos del contrato

Los tres salen de `../esavi-backend/src/types/investigation/` con `npm run contracts:sync`, y las tres respuestas se declaran a mano en `contracts/declared/` como en todo el paso 5 — el backend tipa la entrada, no la salida:

```ts
// contracts/investigationVaccinationContext.ts
export interface CreateInvestigationVaccinationContextInput {
  investigationId: string;            // PK = FK, la envía el cliente
  momentItemId?: string | null;       // catálogo vaccinationMoment
  multidoseItemId?: string | null;    // el MISMO catálogo, otro código de error
  vaccinatedPerVialCount?: number | null;   // 0–32767
  vaccinatedPerBatchCount?: number | null;  // 0–32767
  locations?: string | null;
  isCluster?: AnswerOption | null;          // compuerta, 'YES' estricto
  clusterIdentificationNumber?: string | null;  // ≤100
  clusterAdditionalCaseCount?: number | null;   // 0–32767
  clusterUsedSameVial?: AnswerOption | null;    // su 'NO' exige la siguiente
  clusterSameVialCount?: number | null;         // 0–32767
  notes?: string | null;
}

// contracts/investigationVaccineAdministered.ts
export interface CreateInvestigationVaccineAdministeredInput {
  investigationId: string;            // del contexto; inmutable
  vaccineWhodrugId: string;           // OBLIGATORIO. No hay rama cruda
  doseNumber?: number | null;         // 0–32767; el null entra en el UNIQUE
  notes?: string | null;
  isActive?: boolean;
}

// contracts/investigationColdChain.ts
export interface CreateInvestigationColdChainInput {
  investigationId: string;            // PK = FK, la envía el cliente
  storageTemperatureMonitored?: boolean | null;   // boolean, NO answerOption
  storageRangeDeviation?: boolean | null;         // boolean; el false es contenido
  storageProcedureFollowed?: AnswerOption | null;
  storageOtherObjectPresent?: AnswerOption | null;
  storagePartiallyReconstitutedVaccine?: AnswerOption | null;
  storageVaccineNotUsable?: AnswerOption | null;
  storageDiluentNotUsable?: AnswerOption | null;
  storageKeyFindings?: string | null;
  transportUsedThermos?: AnswerOption | null;     // excluyente con coldPack
  transportSetInThermos?: AnswerOption | null;    // NO cuelga del termo
  transportReturnedInThermos?: AnswerOption | null;  // NO cuelga del termo
  transportUsedColdPack?: AnswerOption | null;    // excluyente con thermos
  transportTypeThermo?: string | null;            // ≤250; NO cuelga del termo
  transportKeyFindings?: string | null;
  notes?: string | null;
}
```

Cuatro cosas que el tipo dice y el formulario tiene que respetar:

- **`sortOrder` no está en ningún input**, deliberadamente: lo pone un disparador y **el cliente no lo envía nunca**, ni siquiera cuando lo recibe en el `GET`.
- **Los dos `boolean | null` son de otro tipo que sus ocho vecinos, y TypeScript lo detecta.** Un `AnswerOption` asignado a `storageTemperatureMonitored` no compila — el contrato es la primera defensa contra el 400 más probable de este spec, antes que el schema y antes que el test.
- **`vaccineWhodrugId` es `string`, no `string | null`, y ésa es toda la diferencia con `notificationVaccine`.** En el `001` lo exige el validador; en el `004` lo admite nulo y **lo rechaza el servicio** sobre el estado resultante, porque ahí «ausente» significa «no lo toques». El 400 llega por las dos vías; el schema del cliente lo exige siempre.
- **El `PUT` usa `Partial<CreateXInput>` y se envía el objeto completo.** El backend hace el update diferencial (`CONVENTIONS.md` §6.5); volver a una sección sin tocar nada no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría.

Las tres respuestas declaradas añaden lo que el `GET` trae y el input no: `createdAt`, `updatedAt`, `appDetails`, `isActive` **sólo en las vacunas administradas** —las dos fichas 1:1 no la tienen (§5.5.0)— y en cada vacuna el `vaccineWhodrug` anidado con los cinco niveles del árbol, que es lo que se pinta en la lista.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Id del caso | URL | `params.id` de `/esavi-cases/:id/wizard/investigation` | Lo fija FE08; este spec no lo toca |
| Etapas del expediente | TanStack Query | `caseWorkflowByCaseKey(caseId)` | `ESAVI-CASEFLOW-006`. De ahí sale `investigation.id`, el único identificador que este spec necesita |
| Contexto de vacunación | TanStack Query | `investigationVaccinationContextByCaseKey(caseId)` | `ESAVI-INVVACTX-006`. Sin `staleTime`: sus dos mutaciones invalidan esta clave |
| Vacunas administradas | TanStack Query | `vaccinesAdministeredByInvestigationKey(investigationId)` | `ESAVI-INVVACAD-002A`. Devuelve `{ count, rows }` sin paginación en pantalla |
| Cadena de frío | TanStack Query | `investigationColdChainByCaseKey(caseId)` | `ESAVI-INVCOLD-006`. Una sola clave para E1 y E2 |
| Sondeo del diccionario | TanStack Query | `['whodrug', 'abbreviations']` | `ESAVI-WHODRUG-006A`, `staleTime` 30 min. **La misma clave que usa `<WhodrugTreePicker>` en su primer nivel**: el sondeo no añade una petición, reutiliza la que el picker iba a hacer igualmente |
| Catálogo `vaccinationMoment` | TanStack Query | `['catalogItem', 'byType', 'vaccinationMoment']` | `staleTime` 30 min. **Una lectura, dos desplegables** |
| Valores de los tres formularios | React Hook Form | `useForm` del contexto, `useForm` de la cadena de frío, `useForm` del diálogo | **No es una copia del servidor**: es el estado del formulario, sembrado con `defaultValues` y resembrado con `reset` cuando llega la fila. **E1 y E2 comparten uno** |
| Secciones reveladas | Componente | `useProgressiveSections` en `InvestigationStep.tsx` | Trece identificadores tras este spec. Efímero: al reentrar en un paso que ya existe, todas visibles |
| Diálogo abierto y fila en edición | Componente | `useState` en `VaccineAdministeredList` | Efímero, no sale del componente |
| Aviso de empate heredado | Componente | `useState` derivado del `reset` | Efímero. Nace al cargar una fila con los dos contenedores en `'YES'` y muere al guardar |
| Borrador contra el cierre de pestaña | Zustand | `drafts` | El búfer de `ARCHITECTURE.md` §3.4, ya existente; se borra en cuanto responde el `PUT` |

**Lo que este spec declara explícitamente que *no* hace:**

- **Nada del servidor se copia a `useState` ni a un store.** La lista de vacunas se lee de su clave y se vuelve a leer tras cada escritura; no hay array local.
- **La exclusión del transporte no es estado nuevo**: es el `onChange` de dos campos del mismo `useForm` haciendo `setValue` sobre el otro. No hay una tercera variable «contenedor usado» en ninguna capa — sería el mismo dato en dos sitios y el origen exacto del `400` que se quiere evitar.
- **La compuerta del conglomerado tampoco.** Se deriva con `watch('isCluster') === 'YES'`; no se guarda un booleano `showCluster` junto a ella.
- **El `investigationId` no se guarda en ningún sitio.** Sale de `caseWorkflowByCaseKey`, que ya está en caché desde FE08.
- **Ningún filtro en la URL**, porque no hay filtros: la lista trae todas las filas activas en una página.

**Qué invalida qué:**

| Escritura | Invalida |
|---|---|
| `INVVACTX-001` / `-004` | `investigationVaccinationContextByCaseKey(caseId)` |
| `INVVACAD-001` / `-004` | `vaccinesAdministeredByInvestigationKey(investigationId)` |
| `INVCOLD-001` / `-004` | `investigationColdChainByCaseKey(caseId)` |
| Completar el paso (FE13e) | `caseWorkflowByCaseKey(caseId)` |

**Ninguna escritura de este spec invalida la clave de otra.** Es la diferencia con FE13b y FE13c: allí la nieta dependía de que la madre existiera, y crear la madre tenía que refrescar la lista de la nieta. Aquí las tres tablas cuelgan de `investigation` y son independientes entre sí — la lista de vacunas funciona aunque ninguna de las dos fichas 1:1 exista.

### 3.5 Formularios y validación

**Sección D — vacunas administradas (`investigationVaccineAdministered`), diálogo de alta y edición**

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `vaccineWhodrugId` | `<WhodrugTreePicker>` | **Sí** (bloqueante) | Cinco niveles. `404` si la vacuna no existe o está inactiva. **No hay rama cruda** |
| `doseNumber` | `<NumberField min={0} max={32767}>` | No | El `0` es válido. El `null` **entra en la comparación de duplicado** |
| `notes` | `<Textarea>` | No | Texto libre, sin longitud |

- **Guarda de duplicado**, leída del `409` sobre el trío `(investigationId, vaccineWhodrugId, doseNumber)` entre las activas. El mensaje nombra **la vacuna**, no la dosis: «Esa vacuna ya está en la lista. Si son dos dosis distintas, indica el número de dosis en cada una».
- **Sección deshabilitada con el maestro vacío.** Si el sondeo devuelve `count === 0`, no se pinta el botón de añadir: en su lugar, el motivo — «El diccionario WHODrug no está importado en este despliegue. Esta sección sólo admite vacunas codificadas y no puede rellenarse hasta que un administrador lo importe».
- **Sin botón de retirar.** `005A` es ADMIN (deuda de §10); el comportamiento objetivo es el mismo `<SatelliteList>` con su acción de retirar y su confirmación, y se activa el día que la ruta baje a USER.

**Sección D — contexto (`investigationVaccinationContext`), formulario de la fila 1:1**

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `vaccinatedPerVialCount` | `<NumberField min={0} max={32767}>` | No | D.3. El `0` es contenido |
| `vaccinatedPerBatchCount` | `<NumberField min={0} max={32767}>` | No | **Etiqueta propia** (§6.2), paralela a la anterior |
| `locations` | `<Textarea>` | No | D.4. Texto libre, sin longitud |
| `momentItemId` | `<CatalogSelect typeCode="vaccinationMoment">` | No | D.5. Su propio código de error |
| `multidoseItemId` | `<CatalogSelect typeCode="vaccinationMoment">` | No | D.6. **El mismo catálogo, otro código de error** |
| `notes` | `<Textarea>` | No | Texto libre |

**Sección D1 — conglomerado, dentro del mismo formulario**

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `isCluster` | `<AnswerOptionField variant="unknown">` | No | **Compuerta de `'YES'` estricto.** `NO`, `UNKNOWN`, `NOT_APPLICABLE` y `null` cierran por igual |
| `clusterIdentificationNumber` | `<Input maxLength={100}>` | No, con el bloque abierto | Único `varchar(n)` de la tabla |
| `clusterAdditionalCaseCount` | `<NumberField min={0} max={32767}>` | No, con el bloque abierto | |
| `clusterUsedSameVial` | `<AnswerOptionField variant="unknown">` | No, con el bloque abierto | **Su `'NO'` abre la siguiente y la hace obligatoria** |
| `clusterSameVialCount` | `<NumberField min={0} max={32767}>` | **Sí si `clusterUsedSameVial === 'NO'`** | El `0` satisface. Etiqueta reescrita (§6.3) |

**La compuerta no traduce el 400: lo impide.** Apagar `isCluster` oculta las cuatro y las envía como `null` explícito (§7.3 del `CASE-PROCESS.md`), así que `CLUSTER_FIELDS_NOT_ALLOWED` no puede salir. La precedencia del servidor —bloque cerrado gana sobre regla del vial— se registra en `errorMessages.ts` como respaldo y no se reproduce en el schema: el formulario nunca construye ese estado.

**Sección E1 — almacenamiento (`investigationColdChain`)**

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `storageTemperatureMonitored` | **`RadioGroup` Sí/No**, dos vías, sin retorno a `null` | No | **`boolean`, no `answerOption`.** Nace sin tocar. **Sólo `true` abre la siguiente** |
| `storageRangeDeviation` | **`RadioGroup` Sí/No**, dos vías | No, con el bloque abierto | **`boolean`.** El `false` es el hallazgo más frecuente del formulario |
| `storageProcedureFollowed` | `<AnswerOptionField variant="unknown">` | No | **Fuera del bloque** |
| `storageOtherObjectPresent` | `<AnswerOptionField variant="unknown">` | No | Ídem |
| `storagePartiallyReconstitutedVaccine` | `<AnswerOptionField variant="unknown">` | No | Ídem |
| `storageVaccineNotUsable` | `<AnswerOptionField variant="unknown">` | No | Ídem |
| `storageDiluentNotUsable` | `<AnswerOptionField variant="unknown">` | No | Ídem |
| `storageKeyFindings` | `<Textarea>` | No | Ídem. Texto libre |

**Las seis últimas no cuelgan del termómetro pese al prefijo `storage`.** Se observan sin medición y no las toca nadie. El bloque condicional contiene **una sola columna**.

**Sección E2 — transporte (misma fila, mismo `useForm`)**

| Campo | Control | ¿Obligatorio? | Regla |
|---|---|---|---|
| `transportTypeThermo` | `<Input maxLength={250}>` | No | E2.1. Único `varchar(n)`. **No cifrado**: el 250 del DDL vale tal cual. Etiqueta: «contenedor» |
| `transportSetInThermos` | `<AnswerOptionField variant="unknown">` | No | E2.2. **No cuelga de nada.** Etiqueta: «contenedor» |
| `transportReturnedInThermos` | `<AnswerOptionField variant="unknown">` | No | E2.3. **No cuelga de nada.** Etiqueta: «contenedor» |
| `transportUsedThermos` | `<AnswerOptionField variant="unknown">` | No | **No sale del formulario** (§6.2). Excluyente con el siguiente |
| `transportUsedColdPack` | `<AnswerOptionField variant="unknown">` | No | E2.4. Excluyente con el anterior |
| `transportKeyFindings` | `<Textarea>` | No | E2.5. Texto libre |
| `notes` | `<Textarea>` | No | Texto libre |

**La exclusión, en tres reglas de pantalla:**

1. Poner uno de los dos en `'YES'` fuerza el otro a `'NO'` con `setValue`. Es lo único que impide el `400 TRANSPORT_CONTAINER_CONFLICT`, y basta.
2. Los demás valores —`NO`, `UNKNOWN`, `null`— **no arrastran nada**: sólo el `'YES'` es excluyente, igual que en el servidor.
3. Si el `reset` recibe los dos en `'YES'` —fila heredada—, **gana el termo** y el paquete frío baja a `'NO'`, con un aviso **no bloqueante** sobre el bloque: «Esta ficha tenía los dos contenedores marcados. Se ha conservado el termo; al guardar quedará corregido».

**Cierre de los tres formularios**

- **Los tres guardan con `004`**, siempre: las dos fichas 1:1 ya existen desde el revelado de su sección, y el diálogo de la lista distingue alta de edición por si hay `vaccineAdministeredId`.
- **Un solo «Guardar y continuar» para E1 y E2**, al final del bloque de transporte. Dos identificadores de revelado, una fila, un `useForm`, una petición.
- **Con el expediente `CLOSED`**, los tres formularios se montan en sólo lectura y el diálogo de alta no se abre — la regla de FE08, que este spec no reimplementa.
- **`sortOrder` no viaja nunca**, ni en el alta ni en la edición, ni aunque el `GET` lo haya traído.

### 3.6 Estados de la pantalla

| Estado | Cuándo | Qué se ve |
|---|---|---|
| **Carga** | Las tres lecturas en vuelo | `<Skeleton>` por sección, con la forma del formulario que va a aparecer. El revelado progresivo no se aplica hasta que responden |
| **Vacío — lista de vacunas** | `count === 0` y el diccionario **sí** está importado | «Aún no se ha añadido ninguna vacuna administrada», con el botón de añadir |
| **Vacío — diccionario ausente** | El sondeo devuelve `count === 0` | El motivo de §3.5, **sin botón de añadir**. Es una sección deshabilitada, no una lista vacía |
| **Vacío — fichas 1:1** | No aplica | Las dos filas se crean al revelarse la sección; no hay estado vacío que pintar |
| **Error de lectura** | Cualquiera de los tres `GET` falla | Mensaje por `code` desde `errorMessages.ts` y botón de reintentar, por sección — un fallo en la cadena de frío no tumba la lista de vacunas |
| **Error de escritura** | `400`, `404` o `409` | Toast por `code`; el `409` del trío se pinta además **en el campo de la vacuna** dentro del diálogo, que es donde está el problema |
| **Sin permiso** | Rol por debajo de USER | No se llega: el guard de FE08 corta antes. Un `403` sobrevenido —token degradado— sale como error de escritura con su `code` |
| **Aviso de empate heredado** | El `reset` trae los dos contenedores en `'YES'` | Aviso no bloqueante sobre el bloque de transporte. **No es un error**: el formulario ya lo resolvió |
| **Expediente cerrado** | `status === 'CLOSED'` | Sólo lectura en las tres secciones, sin botones de guardar ni de añadir |

### 3.7 Responsividad y accesibilidad

- **La lista de vacunas cabe entera en móvil.** Tres columnas —vacuna, dosis, notas— y las tres sobreviven en la tarjeta por debajo de `md`; no hay que elegir. El nombre de la vacuna es el de los cinco niveles concatenados, y se trunca con `title` completo.
- **Los dos desplegables del mismo catálogo llevan `aria-label` distintos**, con el texto completo de D.5 y D.6. Sin eso, un lector de pantalla anuncia dos veces el mismo control y el usuario no sabe en cuál está.
- **Cada `RadioGroup` de los dos booleanos es un `radiogroup` con `aria-label` propio** —el texto de la pregunta—, navegable con flechas, igual que los ocho criterios de FE11.
- **La compuerta del conglomerado y la del termómetro anuncian la aparición** con `aria-live="polite"` sobre el contenedor revelado, y el foco **no** se mueve solo: el usuario acaba de contestar una pregunta y saltar el foco le roba el sitio.
- **El aviso del empate heredado es `role="status"`**, no `role="alert"`: es informativo y no interrumpe.
- **Los cinco contadores son `<input type="number">` con `inputMode="numeric"`**, y su mensaje de error dice el rango, no el tipo.
- **Ningún color literal.** Los tres estados del aviso y del error salen de tokens semánticos (`ARCHITECTURE.md` §6.1).

### 3.8 Claves i18n nuevas

Todas bajo `investigation.*`, en `es.json`, `en.json` y `nl.json`:

```
investigation.vaccinesAdministered.title | .empty | .dictionaryMissing | .add | .duplicate
investigation.vaccinesAdministered.field.vaccine | .doseNumber | .notes
investigation.vaccinationContext.title
investigation.vaccinationContext.field.vaccinatedPerVialCount   ← D.3, literal del formulario
investigation.vaccinationContext.field.vaccinatedPerBatchCount  ← etiqueta propia (§6.2)
investigation.vaccinationContext.field.locations | .moment | .multidose | .notes
investigation.cluster.title
investigation.cluster.field.isCluster | .identificationNumber | .additionalCaseCount
investigation.cluster.field.usedSameVial
investigation.cluster.field.sameVialCount                       ← etiqueta reescrita (§6.3)
investigation.coldChain.storage.title | .hint                   ← «Último sitio de almacenamiento»
investigation.coldChain.storage.field.temperatureMonitored | .rangeDeviation
investigation.coldChain.storage.field.procedureFollowed | .otherObjectPresent
investigation.coldChain.storage.field.partiallyReconstitutedVaccine
investigation.coldChain.storage.field.vaccineNotUsable | .diluentNotUsable | .keyFindings
investigation.coldChain.transport.title
investigation.coldChain.transport.field.typeThermo              ← dice «contenedor»
investigation.coldChain.transport.field.setInThermos            ← dice «contenedor»
investigation.coldChain.transport.field.returnedInThermos       ← dice «contenedor»
investigation.coldChain.transport.field.usedThermos             ← etiqueta propia (§6.2)
investigation.coldChain.transport.field.usedColdPack | .keyFindings | .notes
investigation.coldChain.transport.inheritedTieWarning
```

Más los códigos de error en `errorMessages.ts`, **cada uno en sus dos variantes de operación** (`001` y `004`): los dos del catálogo compartido, el del bloque del conglomerado, el del contador del vial, el del conflicto de contenedores, el `404` de la vacuna WHODrug y el `409` del trío.

**Tres reglas de redacción que este spec impone a las claves:**

1. **Las tres del contenedor no dicen «termo»** en ninguno de los tres idiomas, pese al nombre de la columna.
2. **`cluster.field.sameVialCount` pregunta «cuántos casos usaron el mismo vial»**, no «enumere los viales».
3. **`vaccinationContext.field.vaccinatedPerBatchCount` es paralela a la del vial** y sólo cambia «vial» por «lote». El paralelismo es lo que la hace interpretable.

---

## 4. Plan de implementación

1. **Sincronizar los tres contratos.** Tres entradas nuevas en el `SYNC_MAP` de `scripts/syncContracts.mjs`, `npm run contracts:sync`, y las tres respuestas declaradas a mano en `contracts/declared/`.
   *Verificación:* `npx tsc --noEmit -p tsconfig.app.json` pasa, y asignar un `AnswerOption` a `storageTemperatureMonitored` **falla a compilar**.

2. **Ampliar `features/investigation/api.ts`** con las tres entidades: las tres lecturas (`INVVACTX-006`, `INVVACAD-002A`, `INVCOLD-006`), las dos creaciones 1:1, la creación y edición de la lista, y las dos ediciones 1:1 — cada hook con su código de operación citado en comentario.
   *Verificación:* un test de MSW por hook comprueba que la URL y el verbo son los de §3.2, y que ninguna mutación envía `sortOrder`.

3. **Sondeo del diccionario.** `useWhodrugDictionaryAvailable()` sobre `ESAVI-WHODRUG-006A`, **reutilizando la clave del primer nivel de `<WhodrugTreePicker>`** para no añadir una petición.
   *Verificación:* con `{ count: 0, rows: [] }` devuelve `false`; con una fila, `true`; y el devtools de Query muestra **una** entrada, no dos.

4. **`schemas.ts` — el contexto y el conglomerado.** Los cinco campos de D, la compuerta de `'YES'` estricto sobre las cuatro de D1, la regla del vial con el `'NO'`, y los `max(32767)` de los cuatro contadores.
   *Verificación:* tests de tabla — `isCluster: 'UNKNOWN'` con número de conglomerado escrito no llega al servidor; `clusterUsedSameVial: 'NO'` sin contador falla; **con contador `0` pasa**; `40000` falla en los cuatro.

5. **`schemas.ts` — la cadena de frío.** Los dos `boolean` tri-estado, el bloque de una sola columna, la exclusión de los dos contenedores y el `max(250)` de `transportTypeThermo`.
   *Verificación:* `storageRangeDeviation: false` con `storageTemperatureMonitored: true` **pasa**; con `false` o `null` en la compuerta, se limpia; los dos contenedores en `'YES'` no es un estado alcanzable desde el schema.

6. **`VaccineAdministeredFormDialog.tsx`.** `<WhodrugTreePicker>` obligatorio, `<NumberField>` de la dosis y notas. El `409` se pinta en el campo de la vacuna.
   *Verificación:* alta con vacuna repetida y dosis vacía devuelve el mensaje que nombra la vacuna, y el campo queda marcado.

7. **`VaccineAdministeredList.tsx`.** `<SatelliteList>` con las tres columnas, los tres estados vacíos de §3.6 y **sin botón de retirar** (deuda de §10).
   *Verificación:* con el sondeo en `false` no se pinta el botón de añadir y sí el motivo; con `true` y lista vacía, el vacío normal.

8. **`VaccinationContextSection.tsx`.** D.3–D.6 y D1 en un `useForm`, con la compuerta limpiando las cuatro a `null` explícito al apagarse.
   *Verificación:* rellenar el bloque, apagar `isCluster` y guardar envía las cuatro en `null` — comprobado sobre el cuerpo capturado por MSW, no sobre la pantalla.

9. **`ColdChainSection.tsx`.** E1 y E2 como dos bloques visuales sobre un `useForm`, con el `RadioGroup` de los dos booleanos, la exclusión de los contenedores y el aviso del empate heredado. **Un solo botón de guardar, al final de E2.**
   *Verificación:* marcar el paquete frío pone el termo en `'NO'` sin petición; un `reset` con los dos en `'YES'` deja el termo, baja el paquete y pinta el aviso con `role="status"`.

10. **Montar en `InvestigationStep.tsx`.** Las cuatro secciones en el orden D → D1 → E1 → E2, `useProgressiveSections` de nueve identificadores a trece, y el `POST` de creación de cada ficha 1:1 disparado al revelarse su sección.
    *Verificación:* en un caso nuevo, revelar D crea el contexto con un `POST { investigationId }` a secas; revelar E1 crea la cadena de frío; reentrar en un paso ya guardado **no dispara ningún `POST`** y muestra las trece secciones sin botones intermedios.

11. **Las claves i18n en los tres idiomas.** Las de §3.8 más los códigos de error en sus dos variantes de operación.
    *Verificación:* el test de paridad de locales pasa — ninguna clave en un idioma y no en otro—, y las tres del contenedor **no contienen la palabra «termo»** en ninguno de los tres.

12. **Test de integración del bloque.** Recorrido completo: añadir dos vacunas administradas, rellenar el contexto con conglomerado, abrir y cerrar la compuerta, rellenar la cadena de frío con `storageRangeDeviation: false`, guardar, recargar y comprobar que todo vuelve.
    *Verificación:* el recorrido pasa; y repetido sobre un expediente `CLOSED`, las tres secciones se montan en sólo lectura y no hay botón de guardar ni de añadir.

13. **Cierre.** El checklist de `CONVENTIONS.md` §14: `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, `npm test`, y la revisión de que ningún componente lleva color literal ni texto sin i18n.

---

## 5. Criterios de aceptación

- [ ] Las once rutas de §3.2 se consumen y responden con lo esperado; ninguna otra se llama.
- [ ] Cada hook de `features/investigation/api.ts` cita su código `ESAVI-*` en un comentario.
- [ ] Revelar la sección D en una investigación sin contexto dispara **un solo** `POST /api/investigation-vaccination-contexts`; revelar E1 sin cadena de frío dispara **un solo** `POST /api/investigation-cold-chains`. Reentrar en un paso que ya las tiene no dispara ninguno.
- [ ] Todos los guardados posteriores son `PUT`: en un recorrido completo no hay un segundo `POST` sobre ninguna de las dos fichas 1:1.
- [ ] `isCluster` en `'UNKNOWN'`, `'NO'`, `'NOT_APPLICABLE'` o sin contestar **oculta las cuatro columnas del conglomerado**, y el `PUT` las lleva como `null` explícito — comprobado sobre el cuerpo capturado, no sobre la pantalla.
- [ ] Con el bloque abierto, `clusterUsedSameVial: 'NO'` hace **obligatorio** `clusterSameVialCount` y `'YES'` no; un `0` en ese campo **satisface la obligación** y se envía.
- [ ] La etiqueta de `clusterSameVialCount` pregunta cuántos casos usaron el mismo vial; **la palabra «enumere» no aparece** en ninguno de los tres idiomas.
- [ ] Los cinco contadores rechazan `40000` en el cliente: ningún valor por encima de **32767** sale en una petición, y el mensaje de error dice el rango.
- [ ] Un `0` en cualquiera de los cinco contadores se envía como `0`, nunca como `null`.
- [ ] `momentItemId` y `multidoseItemId` se pintan con **una sola lectura** del catálogo `vaccinationMoment` y con **dos `aria-label` distintos**; sus dos códigos de error están registrados por separado en `errorMessages.ts`.
- [ ] `storageTemperatureMonitored` y `storageRangeDeviation` envían `true`/`false`/`null` — **nunca `'YES'`**; y ninguna de las otras ocho respuestas de la cadena de frío envía un booleano.
- [ ] Un `RadioGroup` de esos dos sin tocar envía `null`, no `false`.
- [ ] `storageRangeDeviation: false` con la compuerta en `true` **se guarda y vuelve como `false`**; no se confunde con ausencia en ningún punto del recorrido.
- [ ] Apagar `storageTemperatureMonitored` oculta **sólo** `storageRangeDeviation`; las seis columnas `storage*` restantes siguen visibles y editables.
- [ ] Marcar `transportUsedColdPack` en `'YES'` pone `transportUsedThermos` en `'NO'` **sin petición**, y a la inversa; el `400 TRANSPORT_CONTAINER_CONFLICT` no se produce en ningún recorrido del test de integración.
- [ ] Poner uno de los dos contenedores en `'NO'`, `'UNKNOWN'` o sin contestar **no altera el otro**.
- [ ] Un `reset` con los dos contenedores en `'YES'` deja el termo, baja el paquete frío y pinta el aviso con `role="status"`; el aviso **no bloquea el guardado**.
- [ ] `transportSetInThermos`, `transportReturnedInThermos` y `transportTypeThermo` se muestran **siempre**, con cualquier valor de las dos banderas de contenedor.
- [ ] Con el sondeo de WHODrug en `count === 0`, la sección de vacunas administradas **no pinta el botón de añadir** y muestra el motivo; con una fila, funciona con normalidad.
- [ ] El sondeo y el primer nivel de `<WhodrugTreePicker>` comparten clave: el devtools de Query muestra **una** entrada para `['whodrug','abbreviations']`, no dos.
- [ ] Una vacuna administrada no se envía sin `vaccineWhodrugId`; el campo es bloqueante en el diálogo.
- [ ] Añadir dos veces la misma vacuna sin número de dosis da `409`, y el mensaje **nombra la vacuna, no la dosis**, anclado en el campo de la vacuna.
- [ ] E1 y E2 comparten `useForm` y **un solo botón de guardar**, al final de E2; no hay un segundo `PUT` sobre `investigationColdChain` en un guardado.
- [ ] `useProgressiveSections` maneja **trece** identificadores; al reentrar en un paso ya guardado todas las secciones son visibles y no hay ningún botón intermedio.
- [ ] **El «Completar etapa» no se pulsa en este spec**: el paso 5 sigue abierto al terminar E2.
- [ ] Ningún cuerpo enviado contiene `sortOrder`.
- [ ] `grep -rn "response.data.data" src/` no devuelve resultados.
- [ ] `npm run i18n:check` sale en 0.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` sale en 0 — **no basta `npm run build`**, que no comprueba tipos del proyecto de aplicación.
- [ ] `npm run check` sale en 0.

**Bloque de cierre:**

- [ ] **Tema oscuro.** Las cuatro secciones se ven correctas en `dark`;
      `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/investigation/`
      no devuelve resultados.
- [ ] **Por debajo de `md`.** La lista de vacunas colapsa a tarjetas con **los tres campos**
      —vacuna, dosis, notas— y el body no hace scroll horizontal en 375px.
- [ ] **Rol bajo.** Con `USER` las cuatro secciones son plenamente utilizables y **no se pinta
      ningún botón de retirar**; ninguna acción visible produce un `403`.
- [ ] **Sin literales.** Ningún texto visible fuera de i18n, incluidos placeholders y `aria-label`;
      las claves de §3.8 están en los tres idiomas, y **las tres del contenedor no dicen «termo»**
      en ninguno.
- [ ] **Estado en una sola capa.** Cada dato está donde dice §3.4: nada remoto en `useState`
      ni en un store, el `investigationId` se lee de `caseWorkflowByCaseKey` en vez de guardarse,
      y **no existe ninguna variable «contenedor usado»** al margen de los dos campos del formulario.

---

## 6. Decisiones tomadas y descartadas

**1. Un solo spec para las cuatro secciones.** D, D1, E1 y E2 describen **un solo hecho** —el acto de vacunación— y el investigador las rellena de una sentada. Tres tablas y 33 columnas es exactamente el tamaño de FE13c, que ya se demostró ejecutable. Descartado: partir en `13d` (contexto + vacunas) y `13e` (cadena de frío), lo que habría corrido §5.5.5 a un `13f` y roto la correspondencia entre subspec y sección del `CASE-PROCESS.md`.

**2. Las dos columnas ausentes del formulario se pintan las dos, por motivos distintos.** `vaccinatedPerBatchCount` se pinta con **etiqueta propia**, paralela a la del vial de D.3 y cambiando sólo «vial» por «lote»: el dato tiene lectura epidemiológica evidente y el paralelismo lo hace inequívoco sin inventar un concepto. `transportUsedThermos` se pinta porque **sin ella la exclusión mutua del transporte es inexpresable**: E2 pregunta por el paquete frío y no por el termo, y el backend rechaza que los dos resulten `'YES'` — un formulario que sólo ofrece uno de los dos no permite decir que la vacuna viajó en termo. Descartadas: dejar las dos fuera —perdería un dato recogible y rompería una regla del servidor— y declararlas dependencia del otro repositorio hasta que el formulario oficial las recoja, que habría bloqueado el spec por una corrección de documento.

**3. La etiqueta de `clusterSameVialCount` se reescribe.** D1.5 dice «Si no, enumere los viales usados por el conglomerado de casos» y la columna es **un contador de casos**, no una lista de viales. La etiqueta pasa a «¿Cuántos casos del conglomerado usaron el mismo vial?». Es la única vez en el expediente en que una etiqueta del formulario se corrige en vez de copiarse, y se hace porque la literal **induce a escribir otra cosa**: un investigador que lea «enumere los viales» pondrá un número de viales en un campo que cuenta casos. Descartado: respetar la literal y compensar con texto de ayuda — la ayuda no se lee y el dato entra mal igual.

**4. Los dos `boolean` van con el `RadioGroup` Sí/No de dos vías de FE11.** Se reutiliza el patrón ya escrito: nace sin tocar (`null` = «no se recogió») y una vez contestado no vuelve a `null`. **Consecuencia aceptada y escrita aquí para que no sorprenda:** un usuario que conteste «Sí» por error y quiera volver a «no se sabe» no puede hacerlo sin recargar la ficha. Se acepta porque `false` y `null` **cierran igual la compuerta**, así que el error no arrastra ningún otro campo, y porque un tercer botón «No se sabe» en dos preguntas sueltas rompe la simetría con los ocho criterios de FE11 y con las once `answerOption` vecinas. Descartado: un `RadioGroup` de tres opciones con retorno a `null`.

**5. Las dos fichas 1:1 nacen al revelarse su sección, no al primer guardado.** `POST { investigationId }` a secas, y a partir de ahí **todo guardado es `004`**. Ninguna de sus columnas es obligatoria, así que la fila vacía es un estado legítimo. Descartado: crear en el primer «Guardar y continuar», que mete una rama `POST`-o-`PUT` dentro del botón — la misma rama que FE13a, FE13b y FE13c ya decidieron no tener.

**6. El diccionario WHODrug se sondea, y el sondeo no cuesta una petición.** `useWhodrugDictionaryAvailable()` reutiliza la clave del primer nivel de `<WhodrugTreePicker>`, que el picker iba a pedir igualmente. Con `count === 0` la sección se deshabilita **con su motivo**. Descartado: no sondear y dejar que el picker muestre su propio vacío dentro del diálogo — abrir un diálogo que no acepta nada es un callejón sin salida, y el usuario no tiene forma de saber que el problema es del despliegue y no suyo.

**7. E1 y E2 son dos identificadores de revelado y un solo guardado.** Son **una fila**: separarlas visualmente respeta el formulario, pero dos `PUT` sobre la misma fila serían dos escrituras donde el backend espera una, con dos entradas de auditoría por un mismo acto. Descartados: fundirlas en un identificador único —perdería el ritmo del formulario, que corta ahí— y darle a cada una su botón.

**8. La exclusión del transporte se impide en pantalla; el relevo y el empate no se replican.** Marcar un contenedor pone el otro en `'NO'`, y eso basta para que el `400 TRANSPORT_CONTAINER_CONFLICT` no salga nunca. El **relevo** y el **empate heredado** son reparaciones silenciosas del servidor sobre estados que esta aplicación no produce; reproducir su lógica sería código sin caso de prueba alcanzable. Lo único que el cliente sí hace es **resolver el empate al cargar** y avisar. Descartado: traducir el `400` a un mensaje y dejar que el usuario descubra la regla al guardar.

**9. La sección D respeta el orden del formulario aunque eso ponga la lista antes que la fila 1:1.** D.1–D.2 son vacunas administradas y D.3–D.6 son contexto; se pintan en ese orden. Que la fila 1:1 se cree **después** de la lista no importa: las tres tablas cuelgan de `investigation` y son independientes — la lista funciona aunque el contexto no exista. Descartado: agrupar por tabla, contexto primero, que habría leído mejor en el código y peor en pantalla.

**10. Los cuatro contadores no se cruzan entre sí.** Nada en el backend comprueba que `clusterSameVialCount ≤ clusterAdditionalCaseCount`, y el cliente **no inventa la restricción**: un conglomerado puede tener casos que el investigador aún no ha terminado de contar, y una validación de más convierte un dato provisional en un formulario que no se deja guardar. Descartado: la comprobación «razonable» que ningún documento pide.

**11. Las once `answerOption` usan `unknown`.** `full` se descarta porque `NOT_APPLICABLE` en el transporte sería pedir por segunda vez lo que `investigation.vaccinationSiteItemId` ya distingue (§5.5.1), y §6 del `CASE-PROCESS.md` documenta lo que pasa cuando un dato se declara dos veces. `noAnswer` se descarta porque estas once **no se le preguntan a nadie**: el investigador observa la nevera y revisa el registro de transporte, y cuando no consigue el dato el resultado es «no se sabe». Con esto la variante `noAnswer` sigue sin un solo caso en veintisiete columnas.

**12. El «Completar etapa» no vive aquí.** Este spec deja el paso 5 con trece secciones reveladas y abiertas; lo cierra **FE13e** al añadir F, F2, G y H. Descartado: completar la etapa al final de E2, que dejaría §5.5.5 fuera del recorrido y obligaría a reabrir un paso ya completado para rellenarla.

---

## 7. Riesgos identificados

**A — Dos etiquetas de este spec no están en `ESAVI-FORM.md`, y el formulario oficial puede recogerlas después con otro texto.** `vaccinatedPerBatchCount` y `transportUsedThermos` se pintan con etiquetas propias (§6.2). Si una futura revisión del formulario OPS las incorpora con una redacción distinta, hay que reconciliar **la etiqueta, no el dato**: la columna y la regla no cambian. **Mitigación:** las dos claves i18n quedan marcadas en §3.8 con su referencia a §6.2, de modo que una búsqueda por ese marcador las encuentra las dos de una vez. **Dependencia declarada del otro documento**, no bloqueante.

**B — Con el diccionario WHODrug sin importar, la sección D.1–D.2 es inservible en producción, y este spec no puede arreglarlo.** `ESAVI-WHODRUG-007` es SUPERADMIN y de otra pantalla. El spec **detecta** el maestro vacío y lo explica; no lo llena. **Consecuencia operativa:** un despliegue que llegue al paso 5 sin diccionario importado no puede registrar ninguna vacuna administrada, y ese bloqueo **no tiene salida desde el asistente** porque la tabla no admite rama cruda. **Mitigación:** el motivo de §3.5 nombra la acción que falta y a quién corresponde. **Dependencia de despliegue**, no de código.

**C — Retirar una vacuna administrada exige ADMIN mientras el resto del paso 5 escribe como USER.** `ESAVI-INVVACAD-005A` y `-005B` son la cuarta aparición de la deuda de `CASE-PROCESS.md` §10.4 en el paso 5, tras el equipo investigador (FE13a), las condiciones del recién nacido (FE13b) y las dos listas de FE13c. **Consecuencia:** un USER que añada una vacuna equivocada sólo puede **editarla**, no retirarla. **Mitigación:** el comportamiento objetivo está descrito en §3.5 y se activa el día que la ruta baje a USER, sin cambiar nada más. **Dependencia del otro repositorio.**

**D — Un usuario no puede volver a «no se sabe» en los dos booleanos de la cadena de frío.** Consecuencia aceptada del `RadioGroup` de dos vías (§6.4). **Mitigación:** `false` y `null` cierran igual la compuerta, así que un «Sí» puesto por error no arrastra ningún otro campo, y recargar la ficha lo devuelve al estado guardado. Si el uso real demuestra que molesta, el cambio es **un control**, no una regla: se sustituye el `RadioGroup` por uno de tres opciones y nada más se toca.

**E — Los códigos de error de este spec se citan como `00X` porque el número de operación cambia entre el `001` y el `004`.** Al implementar hay que **leer los códigos exactos del backend**, no derivarlos: `errorMessages.ts` registra cada uno en sus dos variantes, y una comparación contra un código inventado falla en silencio — el toast sale con el mensaje genérico y nadie se entera hasta producción. **Mitigación:** el paso 11 del plan los enumera, y `client.ts` respalda con `'UNKNOWN_ERROR'` (`CLAUDE.md`), así que un código no registrado degrada en vez de romper.

**F — El empate heredado del transporte sólo puede llegar de filas escritas por SQL directo o cargadas antes del spec del backend.** La aplicación no lo produce. **Consecuencia:** el aviso de §3.5 es código que en un despliegue limpio no se ejecuta nunca. **Mitigación:** se cubre con un test que construye el estado en el `reset`, no esperando a encontrarlo en datos reales. No se retira: una migración de datos futura es exactamente el escenario que lo dispara.

---

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `src/shared/api/errorMessages.ts` | **Ya existe.** Códigos nuevos de las tres entidades, cada uno en sus dos variantes de operación (§7.E). No se toca ninguno de los registrados |
| `src/locales/{es,en,nl}.json` | **Ya existen.** Claves nuevas bajo `investigation.*`; ninguna clave existente se renombra ni se borra |
| `scripts/syncContracts.mjs` | **Ya existe.** Tres entradas nuevas en el `SYNC_MAP` |
| `features/esaviCase/InvestigationStep.tsx` | **Lo crea FE13a.** Aquí monta cuatro secciones más y `useProgressiveSections` pasa de nueve identificadores a trece |
| `features/investigation/api.ts` y `schemas.ts` | **Los crea FE13a**, los amplían FE13b y FE13c. Aquí crecen con tres entidades y tres schemas |
| `shared/components/WhodrugTreePicker.tsx` | **No cambia.** Se consume tal cual; el sondeo del maestro vive en un hook nuevo de `features/investigation/`, no dentro del picker |

**Ninguna pantalla ya construida cambia de comportamiento.** El paso 5 sólo se alcanza desde el asistente, `shared/config/navigation.ts` no se toca, y **ninguna primitiva de `shared/components/` se modifica** — este spec usa nueve de las trece de `ARCHITECTURE.md` §4.3 tal como están.

---

## Lo que **no** está en este spec

- **§5.5.5 completa**: el error de administración, la investigación comunitaria y la sección H de notas (FE13e). **Es FE13e quien completa la etapa.**
- **El paso 6**, la clasificación final y el cierre del expediente (FE14).
- **Importar el diccionario WHODrug.** `ESAVI-WHODRUG-007` es SUPERADMIN y de otra pantalla (§7.B).
- **Bajar a USER `ESAVI-INVVACAD-005A` y `-005B`.** Deuda de `CASE-PROCESS.md` §10.4; hasta entonces, sin botón de retirar (§7.C).
- **Recoger `vaccinatedPerBatchCount` y `transportUsedThermos` en `ESAVI-FORM.md`.** Es una corrección del documento oficial, no de este repositorio (§7.A).
- **La pantalla de auditoría del expediente**, `<AuditTrail>` sobre estas tres tablas incluido.
- **Elevar `useProgressiveSections` a `CONVENTIONS.md`.** Quinto uso, misma decisión que FE13a, FE13b y FE13c.

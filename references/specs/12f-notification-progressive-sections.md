# SPEC FE12f — Paso 4 incremental: revelado progresivo por secciones

> **Estado:** Aprobado
> **Depende de:** SPEC FE08 (armazón del asistente y `CaseWizardActionBar`), SPEC FE12a (la cabecera, las dos ramas y la cadena de guardado que este spec fracciona), SPEC FE12d (el bloque de embarazo y su compuerta), SPEC FE12e (las secciones del paso 4, su orden y sus encabezados, que aquí no se tocan)
> **Fecha:** 2026-09-10
> **Objetivo:** Que el paso 4 se descubra sección a sección y guarde al avanzar, para que las listas satélite dejen de exigir un viaje al botón «Guardar» del pie.

---

## 1. Por qué existe este spec

**A — Las compuertas ya reaccionan en vivo; las listas no.** `NotificationStep.tsx:450` deriva la compuerta de antecedentes médicos de `watchedValues`, así que la sección aparece en cuanto se responde «Sí», sin guardar nada. La lista de dentro, en cambio, no existe: `MedicalHistoryList.tsx:59`, `EventList.tsx:51` y `VaccineList.tsx:60` devuelven `null` mientras `notificationId` sea `null`. La fricción no está repartida por la pantalla — está concentrada en **la primera escritura, la que crea la fila padre**.

**B — El único remedio de hoy está al final de la pantalla.** Para crear esa fila hay que bajar a la barra de acciones de FE08, pulsar «Guardar» y volver a subir a rellenar lo que acaba de aparecer. Con nueve secciones en la rama grave y once en la no grave, ese viaje se repite en cada expediente, y no lo pide ningún dato: lo pide dónde está el botón.

**C — El repositorio ya resolvió esto a menor escala, y de dos maneras distintas.** `VaccineFormDialog` parte el alta en dos fases y ofrece «Guardar y añadir diluyentes»: guarda, desbloquea la lista dependiente y no cierra el modal. Donde no hay botón, hay al menos una explicación: `DiluentList.tsx:53` y `PregnancyComplicationList.tsx:65` pintan `needsParent` — «Guarda el bloque de embarazo antes de añadir complicaciones». Pero las cuatro listas por caso no hacen ni una cosa ni la otra: **desaparecen en silencio**. Tres comportamientos para el mismo problema.

**D — Y el paso 5 lo multiplica.** `CASE-PROCESS.md` §5.5.0 describe la investigación como **una cabecera y catorce satélites**. Si el paso 4 resuelve esto con código propio de `NotificationStep.tsx`, FE13 lo reescribe desde cero. Por eso el mecanismo sale a `shared/hooks/` desde el primer día.

**Este spec no cambia una sola regla de negocio.** No toca el orden de FE12e, ni las compuertas, ni los schemas, ni un endpoint. Cambia **cuándo** se guarda y **cuánto** se ve.

---

## 2. Alcance

**Dentro:**

- **La regla de visibilidad del paso 4**, derivada en render: una sección se muestra si los datos ya la desbloquean **o** si el usuario avanzó hasta ella en esta sesión — lo que sea mayor. Se aplica a las nueve secciones de la rama grave y a las once de la no grave que fijó FE12e.
- **Un solo «Guardar y continuar» en pantalla en todo momento**: el de la última sección revelada. Al avanzar, ese botón desaparece y aparece el de la siguiente. Con todo revelado —reentrada incluida— no queda ninguno y manda la barra del pie.
- **Qué secciones lo llevan:** todas menos las **dos últimas** —desenlace y las observaciones de la cabecera—, que se revelan juntas con el último avance porque la barra ya está debajo.
- **«Descripción del ESAVI» pasa a ser la primera sección del paso**, por delante de «Antecedentes de la persona vacunada». Es el único bloqueante de guardado de la cabecera, así que sin ella no hay fila padre ni avance posible; es el único punto en que este spec toca el orden de FE12e.
- **El disparador del `POST` de embarazo pasa de `wasPregnantAtVaccination` a `wasPregnantAtEsavi`**, que es la primera pregunta en pantalla desde FE12e. Sin esto, responder sólo la primera pregunta y avanzar no crearía la fila y Complicaciones no aparecería, sin explicación.
- **El bloque de embarazo conserva un único botón**, que crea su fila —y con ella revela Complicaciones dentro de la propia sección— y avanza a la siguiente en la misma pulsación.
- **El mecanismo, extraído a `useProgressiveSections` en `shared/hooks/`**, para que FE13 lo herede sin rediseñarlo. Sale a `shared/` desde el primer uso, no después.
- **Las cuatro listas por caso dejan de desaparecer en silencio.** No porque cambien: porque su sección ya no se revela antes de que exista el padre, así que el estado que las hacía evaporarse deja de ser alcanzable en el recorrido normal.
- **La clave i18n nueva** `caseWizard.actions.saveAndContinue`, en los tres idiomas.
- **Tests de integración** del recorrido completo en las dos ramas, de la reentrada, del fallo de guardado y del expediente cerrado.

**Fuera de alcance (otros specs):**

- **El paso 5 y los demás pasos del asistente.** FE13 adopta el hook; este spec sólo lo deja escrito y probado en el paso 4.
- **Elevar el patrón a `CONVENTIONS.md`.** Con un solo uso todavía es una decisión de pantalla. La entrada se escribe cuando FE13 lo adopte y se sepa qué sobrevivió al segundo caso.
- **Persistir por dónde va el recorrido.** No entra en `draftsStore`, ni en `searchParams`, ni en la base. Al refrescar mandan los datos, y eso basta.
- **El orden, las etiquetas, los encabezados y el diseño de FE12e.** Se respetan tal cual —**con una excepción declarada arriba**: «Descripción del ESAVI» sube al principio del paso, porque sin ella no existe la fila padre. Salvo esa, este spec sólo decide qué se pinta y cuándo.
- **El comportamiento de «Guardar» y de «Completar etapa» de la barra.** No cambian. La lista de pendientes seguirá nombrando campos de secciones aún ocultas, y eso se declara como funcionalidad en §3.6: le dice al usuario qué datos tiene que ir a recoger.
- **Convertir las secciones en etapas reales del expediente.** El progreso del asistente son las seis etapas de `case-workflow`; esto es ayuda de llenado dentro de una sola.
- **Unificar el botón de dos fases de `VaccineFormDialog` con el hook.** Vive dentro de un modal y responde a otra mecánica; tocarlo aquí ampliaría el alcance sin ganar nada.
- **Los mensajes `needsParent` de `DiluentList` y `PregnancyComplicationList`.** Siguen donde están: cubren la ventana entre revelar el bloque y guardarlo, que este spec estrecha pero no elimina.

---

## 3. Diseño

### 3.1 La regla de visibilidad

Tal como se enunció al diseñarla —«los datos o el avance, lo que sea mayor»— la regla se derrumba: en cuanto existe la fila de `notification`, *todos* los umbrales de datos quedan satisfechos, así que el primer «continuar» revelaría el paso entero. Lo que faltaba era definir el primer término. No es «qué desbloquean los datos ahora mismo», sino **«el paso ya existía cuando llegué»**.

```
visible(sección i)  =  existíaAlMontar
                       ? siempre
                       : i <= avanzadoEnEstaSesión
```

`existíaAlMontar` se lee **una vez**, al montar el paso, de `stages.notification.exists` (`ESAVI-CASEFLOW-006`). Volver de otro paso, recargar o abrir el expediente mañana entra siempre por esa rama: **todo visible, ningún botón «Guardar y continuar»**. Sólo el llenado inicial —el de un paso 4 que no existía cuando entraste— recorre las secciones.

**Dos umbrales de datos siguen existiendo, y son independientes de la regla anterior:**

| Umbral | Qué desbloquea | Por qué |
|---|---|---|
| `notificationId !== null` | Las cuatro listas por caso: antecedentes médicos, farmacológicos, vacunas y eventos | Una fila satélite necesita su padre |
| `pregnancyId !== null` | Complicaciones, **dentro** del bloque de embarazo | Cuelga del embarazo, no de la notificación |

El primero deja de ser observable: la sección 2 no se revela antes de que el primer «continuar» haya creado la fila. El segundo sí, y por eso el bloque de embarazo conserva su mensaje `needsParent` para la ventana entre revelarse y guardarse.

**«Descripción del ESAVI» encabeza el recorrido** (decisión tomada al implementar, 2026-09-10). `esaviDescription` es el único bloqueante de guardado de la cabecera —`TEXT NOT NULL` en `CASE-PROCESS.md` §4.6 y §5, y `min(1)` en `notificationSaveSchema`—, así que ninguna fila padre puede existir antes de que esté escrita: dejarla entre las tres últimas hacía que el primer «Guardar y continuar» fallara en la validación de un campo fuera del DOM, sin nada que explicara por qué. Pasa de cerrar el paso a abrirlo, y **con ello cambia el orden de pantalla que fijó FE12e**: es la única sección que se mueve, y `ESAVI-FORM.md` deja de mandar en su posición.

**La secuencia se calcula sobre las secciones que aplican, no sobre las nueve u once teóricas.** Si la compuerta de antecedentes médicos está cerrada, esa sección no existe y avanzar desde la 1 lleva a la 3. Con paciente masculino, el bloque de embarazo no cuenta como paso.

**Rama grave — seis avances:**

| # | Sección | Botón |
|---|---|---|
| 1 | Descripción del ESAVI | sí |
| 2 | Antecedentes de la persona vacunada | sí |
| 3 | Antecedentes médicos | sí |
| 4 | Antecedentes farmacológicos | sí |
| 5 | Datos de embarazo | sí |
| 6 | Selección de vacunas | sí |
| 7 | Eventos adversos | sí |
| 8–9 | Desenlace · Observaciones | **no**: se revelan juntas con el séptimo avance |

**Rama no grave — nueve avances:** las mismas, más «Antecedentes de vacunación o inmunización» y «¿Cómo se verificó la información de la vacunación?» entre el embarazo y las vacunas, ambas con botón.

### 3.2 Endpoints consumidos

Ninguno nuevo. Copiados textualmente de `references/API-ROUTES.md`; lo que este spec cambia es **cuándo** se llaman, no cuáles:

```
GET  /api/case-workflows/case/:id            ESAVI-CASEFLOW-006  USER  decide `existíaAlMontar`
POST /api/notifications                      ESAVI-NOTIFCN-001   USER  primer avance: crea el padre
PUT  /api/notifications/:id                  ESAVI-NOTIFCN-004   USER  avances siguientes
POST /api/severe-notifications               ESAVI-SEVNOT-001    USER
PUT  /api/severe-notifications/:id           ESAVI-SEVNOT-004    USER
POST /api/non-severe-notifications           ESAVI-NSEVNOT-001   USER
PUT  /api/non-severe-notifications/:id       ESAVI-NSEVNOT-004   USER
POST /api/notification-pregnancies           ESAVI-NOTIFPRG-001  USER  avance del bloque de embarazo
PUT  /api/notification-pregnancies/:id       ESAVI-NOTIFPRG-004  USER
```

**No se consume nada más.** Ni una ruta de los satélites: sus listas ya las llaman por su cuenta y este spec no las toca.

**Cada avance es la cadena completa de FE12a**, no un guardado parcial: cabecera → rama → embarazo, en ese orden, con el mismo mapeo de errores. Es lo que hace que un avance desde la sección 1 ya deje creada la fila padre de todas las listas.

### 3.3 El hook `useProgressiveSections`

Vive en `shared/hooks/`, no en la feature, porque FE13 lo hereda. No sabe nada de notificaciones:

```ts
useProgressiveSections<Id extends string>(input: {
  sections: Id[];        // las que aplican hoy, en orden
  revealAll: boolean;    // `existíaAlMontar`
  lastWithButton: Id;    // a partir de aquí se revela todo junto
}): {
  isVisible: (id: Id) => boolean;
  frontier: Id | null;   // la única sección que pinta el botón; `null` si no hay ninguna
  advance: () => void;
};
```

**`advance()` no guarda.** Guardar es del llamador: `NotificationStep` ejecuta su cadena y sólo llama a `advance()` si resolvió bien. Un hook que supiera guardar no serviría para el paso 5, que escribe otras entidades.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| `caseId` y paso activo | URL | params de `/esavi-cases/:id/wizard/:step` | los declaró FE08 |
| Estado del expediente y `stages` | TanStack Query | `['caseWorkflow','byCase',caseId]` | de aquí sale `existíaAlMontar` |
| Cabecera, ramas, embarazo y los satélites | TanStack Query | las claves de FE12a–FE12e | **no cambian** |
| Valores del paso | React Hook Form | el `useForm` de `NotificationStep` | no cambia |
| **Hasta dónde se avanzó en esta sesión** | Componente | `useState` dentro del hook | efímero; se pierde al desmontar, y debe perderse |
| **`existíaAlMontar`** | Componente | `useRef`, leído una vez al montar | congelado a propósito: si se releyera, crear la fila en la sección 1 revelaría el paso entero |
| Qué secciones son visibles | derivado en render | la regla de §3.1 | no es estado |
| Qué sección pinta el botón | derivado en render | la última visible con botón | no es estado |
| Borrador sin guardar | Zustand `drafts` | `drafts[caseId]['notification']` | **no cambia** |

**Los cuatro puntos obligatorios:**

1. **Nada del servidor en `useState`.** Lo único que se guarda es un entero —cuántos avances— y un booleano congelado. Ninguna fila, ningún id, ninguna copia editable.
2. **Ningún filtro fuera de `searchParams`.** Esta pantalla no tiene filtros. La posición del recorrido **no es un filtro**: no se comparte por enlace, no debe sobrevivir al refresco y no describe qué datos se ven, sino cuáles se han pedido todavía.
3. **`staleTime`: sin cambios.** Ninguna query nueva, ninguna política nueva.
4. **Qué invalida qué: sin cambios.** Un avance invalida exactamente lo que ya invalidaba un «Guardar». Guardar más veces no invalida más cosas, y por el update diferencial un avance sobre una sección intacta no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría.

### 3.5 Formularios y validación

**Ningún schema cambia.** Cada avance ejecuta el mismo `performSave` de hoy, validado por `notificationSaveSchema` —el permisivo, que sólo comprueba coherencias— mientras `createNotificationCompleteSchema` sigue alimentando la lista de pendientes de «Completar etapa» sin intervenir en el guardado.

**Una sección aún no revelada no puede bloquear un avance.** Las dos reglas de coherencia comparan pares de valores y se rinden si falta uno: `isGestationRangeCoherent` devuelve `true` cuando cualquiera de las dos fechas está ausente (`schemas.ts:820`), y la comprobación de `deathDate` contra `eventDate` vive en el desenlace, que se revela al final. Con los campos vacíos, no hay nada que contradecir.

**El único cambio de comportamiento del guardado** está en `NotificationStep.tsx:649-652`:

| | Antes | Después |
|---|---|---|
| Dispara el `POST` de embarazo | `pregnancyId !== null \|\| wasPregnantAtVaccination != null` | `pregnancyId !== null \|\| wasPregnantAtEsavi != null` |

Es la primera pregunta del bloque desde FE12e. Sin el cambio, responder sólo esa y avanzar no crearía la fila y Complicaciones no aparecería, sin decir por qué.

**Si el guardado falla, no se avanza.** El error se muestra exactamente como hoy —al campo por `errorFieldMap`, o al toast por `code`— y la sección siguiente no se revela. El usuario corrige donde está, sin haber perdido nada de lo escrito.

### 3.6 Estados de la pantalla

| Estado | Qué se ve | Clave i18n |
|---|---|---|
| Paso nuevo, sin fila previa | Sólo la sección 1, con su botón al final | — |
| En recorrido | Las secciones hasta la frontera; **una sola** pinta el botón | — |
| Guardando un avance | El botón deshabilitado mientras la cadena está en vuelo; la barra del pie no cambia | — |
| Avance fallido | Nada se revela; el error va al campo o al toast, como hoy | — |
| Reentrada | Todo visible, **ningún** botón de avance | — |
| Expediente `CLOSED` | Todo visible, ningún botón, sólo lectura — igual que hoy | — |
| Carga del paso | El skeleton actual | — |
| Error de carga del paso | El banner actual con reintento | — |

**«Completar etapa» y su lista de pendientes se declaran como funcionalidad, no como efecto colateral.** Durante el recorrido nombrará campos de secciones que el usuario todavía no ha visto, y eso es deseado: le dice de antemano qué datos tiene que ir a recoger. Ocultarla haría que el botón fallara sin explicación.

### 3.7 Responsividad y accesibilidad

- **El botón se alinea al final de su sección**, a la derecha en escritorio y a ancho completo por debajo de `md`. Objetivo táctil de 44px.
- **Al avanzar, el foco va al `<h3>` de la sección nueva** (`tabIndex={-1}`), que además la trae a la vista. Sin eso, quien navega con teclado se queda al final del documento y quien usa lector no se entera de que apareció nada.
- **El avance se anuncia con una región viva.** El texto es el encabezado de la sección revelada, que ya es clave i18n desde FE12e: no hace falta una cadena nueva.
- **El botón nunca sustituye a la barra del pie.** «Guardar» y «Completar etapa» siguen alcanzables por teclado en todo momento, también a mitad del recorrido.
- **El orden del DOM sigue siendo el orden visual**, como exige FE12e §3.7: revelar es montar al final, nunca reordenar con CSS.

### 3.8 Claves i18n nuevas

Van a los **tres** archivos de idioma; `npm run i18n:check` exige paridad exacta.

| Clave | Uso |
|---|---|
| `caseWizard.actions.saveAndContinue` | El botón de avance: «Guardar y continuar» |

**Una sola clave.** El anuncio de la región viva reutiliza los encabezados de sección de FE12e, y ni el botón de la barra ni los mensajes de error cambian de texto.

---

## 4. Plan de implementación

1. **El hook.** `shared/hooks/useProgressiveSections.ts` con el contrato de §3.3 y sus pruebas unitarias. Sin consumidores todavía.
   *Verificación:* con `revealAll` en `true`, `isVisible` responde `true` para todas y `frontier` es `null`; con `false`, sólo la primera es visible; cada `advance()` mueve la frontera una sección; al alcanzar `lastWithButton`, todas quedan visibles y `frontier` vuelve a `null`; un `advance()` de más no rompe nada.

2. **El disparador del embarazo.** En `NotificationStep.tsx:649-652`, `wasPregnantAtVaccination` pasa a `wasPregnantAtEsavi`. Va primero: si algo se rompe, se rompe con superficie pequeña.
   *Verificación:* con el bloque respondido **sólo** en `wasPregnantAtEsavi`, el guardado encadena `NOTIFPRG-001`; con el bloque intacto, no lo dispara. Los dos tests de la cadena de embarazo de FE12d siguen pasando tras redirigir el campo que rellenan.

3. **La clave i18n.** `caseWizard.actions.saveAndContinue` en `es`, `en` y `nl`.
   *Verificación:* `npm run i18n:check` sale en 0; el commit no toca ningún archivo bajo `src/features/`.

4. **El botón y el revelado, juntos.** `NotificationStep` consume el hook: `existíaAlMontar` se lee una vez de `stages.notification.exists` y se congela en un `useRef`; la lista de secciones que aplican se calcula de las compuertas ya existentes; `frontier` decide cuál es el único botón en pantalla, y pulsarlo ejecuta la cadena de guardado completa y sólo avanza si resolvió bien. Incluye el expediente `CLOSED`, que entra por la rama de todo visible. **Es el commit más grande del spec**, y se fusiona a propósito para no dejar un estado intermedio con varios botones a la vez.
   *Verificación:* con un paso 4 inexistente sólo se ve la sección 1 y un botón; cada avance revela la siguiente y mueve el botón; el último revela descripción, desenlace y observaciones juntas y no deja ninguno; un `POST` que falla no revela nada y muestra el error donde hoy; recargar con la fila ya creada muestra todo sin botones; con la compuerta de antecedentes médicos cerrada, avanzar desde la sección 1 lleva a los farmacológicos; con paciente masculino el embarazo no cuenta como avance; con `CLOSED`, ningún botón; la barra del pie sigue guardando igual. **Los tests de FE12a–FE12e que simulan `stages.notification.exists` siguen pasando sin tocarlos**; los que parten de un paso inexistente se redirigen aquí.

5. **Foco y anuncio.** El `<h3>` de cada sección recibe `tabIndex={-1}`; al avanzar, el foco va al de la sección revelada y una región viva anuncia su encabezado.
   *Verificación:* tras pulsar el botón con teclado, el foco queda en el encabezado nuevo y éste queda a la vista; el anuncio usa la clave de sección de FE12e, sin cadenas nuevas.

6. **Tests de integración.** Del recorrido completo en las dos ramas, de la reentrada, del avance fallido y del expediente cerrado.
   *Verificación:* `npm run check` sale en 0.

---

## 5. Criterios de aceptación

- [ ] Con un paso 4 que no existía, al entrar sólo se ve la sección «Descripción del ESAVI» y **un** botón «Guardar y continuar».
- [ ] En todo momento hay **como máximo un** botón de avance en el DOM.
- [ ] Cada avance ejecuta la cadena completa de FE12a y sólo revela la sección siguiente si resolvió bien.
- [ ] El último avance revela desenlace y observaciones **juntas**, y deja el DOM sin ningún botón de avance.
- [ ] Con la fila de `notification` ya existente al montar el paso, **todo** está visible y no hay ningún botón de avance.
- [ ] Una sección que no aplica —antecedentes médicos con la compuerta cerrada, embarazo con paciente masculino— no cuenta como avance y no aparece en el DOM.
- [ ] Con el bloque de embarazo respondido sólo en `wasPregnantAtEsavi`, el avance encadena `ESAVI-NOTIFPRG-001` y Complicaciones queda visible dentro de la misma sección.
- [ ] Un avance que falla no revela nada y muestra el error en el mismo sitio que hoy.
- [ ] Con expediente `CLOSED`, todo visible, ningún botón de avance y ningún control editable.
- [ ] «Guardar» y «Completar etapa» de la barra se comportan **exactamente** igual que antes de este spec, también a mitad del recorrido.
- [ ] `grep -rn "useProgressiveSections" src/features/` devuelve **sólo** `NotificationStep.tsx`, y el hook vive en `shared/hooks/`.
- [ ] Ningún endpoint nuevo: `git diff` sobre `features/notification/api.ts` no muestra rutas añadidas.
- [ ] `npm run check` sale en 0, y `npx tsc --noEmit -p tsconfig.app.json` no añade ningún error en los archivos tocados.

**Bloque de cierre — se verifica a mano:**

- [ ] **Tema oscuro.** El botón y las secciones reveladas se ven correctos en `dark`; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/features/esaviCase/ src/shared/hooks/` no devuelve resultados.
- [ ] **Por debajo de `md`.** El botón ocupa el ancho completo con objetivo táctil de 44px, y el paso 4 no hace scroll horizontal en 375px durante todo el recorrido.
- [ ] **Rol bajo.** Con `USER` el recorrido completo funciona: las nueve rutas de §3.2 son `USER` y ninguna exige más. Un `403` inesperado en un avance no revela la sección siguiente ni deja la pantalla en blanco.
- [ ] **Sin literales.** El botón sale de `caseWizard.actions.saveAndContinue` en los tres idiomas; el anuncio de la región viva reutiliza las claves de sección de FE12e.
- [ ] **Estado en una sola capa.** El avance de la sesión y `existíaAlMontar` son los únicos datos nuevos, ambos del componente; nada remoto en `useState`, nada del recorrido en `draftsStore` ni en `searchParams`.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** el primer término de la regla es **«el paso ya existía al montar»**, no «los datos lo desbloquean». Con la definición literal, en cuanto existe la fila padre todos los umbrales quedan satisfechos y el primer avance revelaría el paso entero: la regla se anulaba a sí misma.
- **Sí:** un solo botón en pantalla, el de la frontera. Un «continuar» donde ya no queda nada que revelar miente sobre lo que hace.
- **Sí:** el bloque de embarazo conserva **un** botón, aunque haga dos cosas a la vez —crear su fila, que revela Complicaciones dentro de la sección, y avanzar—. Partirlo rompería el orden que FE12e acaba de fijar contra `ESAVI-FORM.md`, y dos botones seguidos en la misma caja son indistinguibles para quien rellena.
- **Sí:** las dos últimas secciones se revelan juntas. Ninguna desbloquea nada, y la barra del pie ya está justo debajo.
- **Sí:** «Descripción del ESAVI» encabeza el paso. Se decidió al implementar, contra la primera redacción de §3.1: con ella al final, el primer avance no podía guardar nada y el recorrido entero quedaba bloqueado sin explicación. Se prefirió moverla a revelarla en su sitio antiguo porque es lo primero que el usuario tiene que llenar.
- **Sí:** el hook sale a `shared/hooks/` desde el primer uso. Extraerlo cuando FE13 lo pida significa extraerlo mal: con la forma que le dejó el paso 4.
- **Sí:** «Guardar y continuar», no «Siguiente». «Siguiente» ya significa pasar al paso 5 en este asistente, y el botón no lleva a ninguna parte. El precedente literal es «Guardar y añadir diluyentes» de `VaccineFormDialog`.
- **Sí:** el disparador del `POST` de embarazo se alinea con la primera pregunta en pantalla. Es una corrección arrastrada de FE12e, no una decisión nueva.
- **No:** persistir por dónde va el recorrido, ni en `draftsStore` ni en la base. El progreso del expediente son las seis etapas de `case-workflow`; esto es ayuda de llenado dentro de una sola, y guardarlo crearía un segundo modelo de progreso que puede contradecir al primero.
- **No:** una primitiva `<WizardSection>` en `shared/components/`. Habría entrado en la lista canónica de `ARCHITECTURE.md` §4.3 —de trece a catorce— y lo reutilizable aquí no es el marco visual sino la regla y el avance. El paso 5 tiene su propia maquetación.
- **No:** crear la fila de `notification` al entrar al paso 4 para desbloquear las listas sin guardar nada explícito. Es menos código y resuelve el mismo dolor, pero deja filas de casos que alguien abrió y abandonó, y esconde el momento en que las cosas se persisten.
- **No:** que `advance()` guarde. Un hook que supiera guardar no serviría al paso 5, que escribe otras entidades. Guardar es del llamador; el hook sólo sabe contar secciones.
- **No:** deshabilitar el «Guardar» de la barra durante el recorrido. Guardar y avanzar son cosas distintas, y quien quiera guardar sin avanzar tiene derecho a hacerlo.
- **No:** elevar el patrón a `CONVENTIONS.md` ahora. Con un solo uso todavía es una decisión de pantalla; con dos ya es un patrón, y la entrada se escribe sabiendo qué sobrevivió al segundo caso.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Un avance por sección multiplica las escrituras del paso 4 | El update diferencial: un avance sobre una sección intacta no produce `UPDATE`, ni `updatedAt`, ni entrada de auditoría. Sin esa propiedad del backend, este spec no sería viable |
| `existíaAlMontar` congelado en un `useRef` podría quedar obsoleto | Volver de otro paso desmonta `NotificationStep`, y al remontar se relee. Se verifica explícitamente en el paso 4 del plan |
| Los tests de integración de FE12a–FE12e asumen la pantalla entera visible | Casi todos simulan `stages.notification.exists`, que entra por la rama de todo visible; sólo los que parten de un paso inexistente se redirigen |
| Un avance que falla dejaría al usuario sin entender por qué no pasa nada | El error va al campo o al toast igual que hoy, y el botón sigue en su sitio: reintentar es volver a pulsarlo |
| El recorrido podría ocultar un obligatorio y hacer que «Completar etapa» falle sin explicación | La lista de pendientes de la barra sigue completa desde el primer render (§3.6), y por eso se declara como funcionalidad |

---

## 8. Impacto en pantallas existentes

| Archivo | Qué cambia |
|---|---|
| `shared/hooks/useProgressiveSections.ts` | **Nuevo.** Genérico, sin saber de notificaciones |
| `features/esaviCase/NotificationStep.tsx` | Consume el hook; cada sección con botón lo pinta; el disparador del `POST` de embarazo cambia de campo |
| `features/esaviCase/NotificationStep.test.tsx` | Los tests que parten de un paso 4 inexistente y examinan una sección posterior entran por la reentrada (`mockNotificationReentry`); los dos del orden de FE12e esperan la descripción primero |
| `src/locales/{es,en,nl}.json` | Una clave |

**`CaseWizardActionBar.tsx` y `CaseWizardContext.tsx` no cambian.** Al concretar el diseño resultó que el avance no necesita nada de la barra: reutiliza el `performSave` que el paso ya registra. La dependencia de FE08 sigue siendo real —el comportamiento de «Guardar» y «Completar etapa» es una restricción de este spec— pero no se toca ninguno de sus dos archivos.

**Ninguna primitiva de `ARCHITECTURE.md` §4.3 cambia**, y la lista sigue teniendo trece.

---

## Lo que **no** está en este spec

- El paso 5 y el resto de pasos del asistente.
- Elevar el patrón a `CONVENTIONS.md`.
- Persistir por dónde va el recorrido.
- El orden, las etiquetas y el diseño del paso 4, que son de FE12e.
- El comportamiento de «Guardar» y de «Completar etapa».
- El botón de dos fases de `VaccineFormDialog`.

Cada uno de esos, si aterriza, va en su propio spec.

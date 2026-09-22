# SPEC FE18 — Validación silenciosa en los diálogos satélite de notificación

> **Estado:** Aprobado
> **Depende de:** SPEC FE12b (`EventFormDialog`, `notificationEventSchema`), SPEC FE12c (`VaccineFormDialog`, `DiluentFormRow`, `notificationVaccine`/`notificationDiluent` schemas), SPEC FE12d (`PregnancyComplicationFormDialog`, `notificationPregnancyComplicationSchema`)
> **Fecha:** 2026-09-22
> **Objetivo:** Que un error de validación en `startTime`, `vaccinationTime`, `reconstitutionTime` o `complicationTypeItemId` se vea en pantalla en vez de dejar «Guardar» sin efecto y sin aviso.

---

## 1. Por qué existe este spec

Cuatro campos de tres diálogos satélite de notificación fallan su validación de Zod sin que nada en pantalla lo diga: «Guardar» simplemente no hace nada. Se encontró el primero en la comprobación manual del paso 9 de SPEC FE17, contra el caso `HOSPSE-17092026-0002`.

**A — `<TimeField>` muestra un valor que no coincide con el que valida el schema.** `shared/components/TimeField.tsx:21-24` (`toDisplayValue`) trunca el `HH:mm:ss` que llega de Postgres a `HH:mm` **solo para pintarlo** en el `<Input>`. El valor de React Hook Form —el que `zodResolver` compara contra `timeRegex = /^\d{2}:\d{2}$/` (`features/notification/schemas.ts:457`)— sigue siendo el `HH:mm:ss` original, porque `toDisplayValue` nunca llama a `onChange`. El usuario ve `10:59` en el campo, cree que está bien, pulsa «Guardar», y la validación falla contra un valor que nunca vio.

Reproducido en los tres campos que usan `<TimeField>` con un valor que puede llegar del servidor:

- `startTime` en `EventFormDialog.tsx:372` (`existing.data?.startTime ?? null`).
- `vaccinationTime` en `VaccineFormDialog.tsx:404` (`existing?.vaccinationTime ?? null`).
- `reconstitutionTime` en `DiluentFormRow.tsx:63` (`diluent?.reconstitutionTime ?? null`).

**B — Ninguno de esos tres campos pinta el error cuando la validación sí falla.** `EventFormDialog.tsx` no importa `FormMessage` en absoluto; su `<FormField name="startTime">` (líneas 244–257) no tiene ni `<FormMessage/>` ni el bloque manual `fieldState.error && <p>…</p>` que sí llevan `esaviName` (línea 118) y `otherDescription` (línea 200) del mismo archivo. Mismo patrón en `VaccineFormDialog.tsx` (`vaccinationTime`, líneas 200–216, frente a `vaccineName` y `vaccinationDate` que sí muestran su error) y en `DiluentFormRow.tsx` (`reconstitutionTime`, líneas 241–256, frente a `diluentName` y `reconstitutionDate`). El resto de la aplicación no tiene este hueco: 39 de los 45 formularios de entidad importan `FormMessage`; los seis que no lo hacen son justo los diálogos satélite de notificación de FE12b/c/d.

**C — El mismo síntoma con una causa distinta en `complicationTypeItemId`.** `notificationPregnancyComplicationSchema` (`features/notification/schemas.ts:902`) lo declara `z.string().uuid()`, **obligatorio, sin `.optional()`**. Su `<FormField>` en `PregnancyComplicationFormDialog.tsx` (líneas 159–183) tampoco tiene `<FormMessage/>` ni bloque manual. Si el usuario no elige un tipo de complicación, la validación falla, `onSubmit` nunca se llama, y no hay ninguna pista de por qué. No es un problema de formato como los otros tres: es un campo requerido cuya ausencia de valor es completamente invisible.

Los cuatro comparten el mismo defecto de fondo: **un fallo de `zodResolver` sin ningún consumidor de `fieldState.error` en ese campo es indistinguible, para el usuario, de que la aplicación no responde.**

---

## 2. Alcance

**Dentro:**

- **`<TimeField>` sincroniza el valor mostrado con el valor validado.** Al recibir un `value` con más de 5 caracteres (`HH:mm:ss`), llama a `onChange` con el valor truncado a `HH:mm`, además de actualizar el `draft` visual que ya truncaba. Un solo punto de cambio, porque los tres consumidores (`startTime`, `vaccinationTime`, `reconstitutionTime`) comparten la primitiva.
- **`<FormMessage/>` en los cuatro campos de la tabla de la sección anterior**: `startTime` (`EventFormDialog.tsx`), `vaccinationTime` (`VaccineFormDialog.tsx`), `reconstitutionTime` (`DiluentFormRow.tsx`) y `complicationTypeItemId` (`PregnancyComplicationFormDialog.tsx`). Se usa el componente compartido `shared/components/ui/form.tsx` — el mismo que ya usan 39 de los 45 formularios —, no el bloque manual `fieldState.error && <p>…</p>` que llevan otros campos de esos mismos archivos.
- **Un test por campo** que reproduzca el escenario real: montar el diálogo en edición con un valor `HH:mm:ss` de servidor, comprobar que el campo muestra `HH:mm`, y que enviar sin tocarlo hace el `PUT`/`POST` correcto (para los tres de tiempo); y, para `complicationTypeItemId`, enviar el formulario sin seleccionar tipo y comprobar que aparece el mensaje de error y que la mutación no se dispara.

**Fuera de alcance (otros specs):**

- **`MedicalHistoryFormDialog.tsx`.** Ninguno de sus campos tiene hoy una vía real de fallo silencioso (decidido en la ronda de preguntas).
- **Sustituir los bloques manuales `fieldState.error && <p>…</p>` que ya existen** en `esaviName`, `otherDescription`, `vaccineName`, `vaccinationDate`, `diluentName`, `reconstitutionDate` y `complicationName` por `<FormMessage/>` genérico. Ya muestran su error; tocarlos es un cambio de redacción sin bug detrás, no de este spec.
- **Un audit de `FormMessage` en el resto de la aplicación.** Los otros 39 formularios ya lo tienen; no hay nada que corregir ahí.
- **Cambiar `timeRegex` para aceptar `HH:mm:ss`.** El schema ya expresa correctamente lo que el formulario pide (`HH:mm`); el defecto está en que el valor mostrado y el validado diverjan, no en la regla de validación.
- **Normalizar la hora en el servidor.** `notificationEvent.service.ts` (`normalizeTime`) ya documenta que Postgres devuelve `HH:MM:SS` por diseño de la columna `time`; no es un defecto a corregir en el backend.

---

## 3. Diseño

Es un spec de ampliación transversal (una primitiva compartida + cuatro campos en tres features), así que se usan las sub-secciones que aplican, con tablas de antes/después.

### 3.2 Endpoints consumidos

Ninguno nuevo. Los cuatro campos ya escriben contra rutas existentes de FE12b/FE12c/FE12d — este spec no cambia ninguna llamada, solo hace visible un rechazo que hoy ya ocurre en el cliente antes de llegar a la red.

### 3.4 Contrato de estado

| Dato | Capa | Clave / forma | Nota |
|---|---|---|---|
| Valor mostrado y valor validado de `startTime`/`vaccinationTime`/`reconstitutionTime` | React Hook Form (vía `<TimeField>`) | Campo del formulario de la sección | **Pasan a ser el mismo valor.** Hoy son dos representaciones del mismo dato — la mostrada y la validada — y eso es la causa del defecto. Después del fix hay una sola. |
| Selección de `complicationTypeItemId` | React Hook Form | Campo del formulario de `PregnancyComplicationFormDialog` | Sin cambios de capa; solo gana su `<FormMessage/>` |
| El propio error de validación (`fieldState.error`) | React Hook Form | `form.formState.errors.<campo>` | Ya existe hoy en los cuatro campos — nadie lo copia a `useState` ni a un store. El cambio es que ahora algo lo lee y lo pinta. |

No hay ningún dato nuevo que decidir dónde vive: los cuatro campos ya estaban en la capa correcta (React Hook Form). El defecto era de lectura, no de ubicación.

### 3.5 Formularios y validación

**`<TimeField>`** (`shared/components/TimeField.tsx`) — cambio en la primitiva, no en un schema.

| | Antes | Después |
|---|---|---|
| Al montar/recibir un `value` de más de 5 caracteres | `toDisplayValue` lo trunca solo para `draft` (lo que se ve) | Además llama a `onChange(value.slice(0, 5))`: el valor de React Hook Form pasa a coincidir con lo que se ve, en el mismo efecto que ya sincroniza `draft` |
| Con un `value` de 5 caracteres o menos | Sin cambios | Sin cambios — no se llama a `onChange` si ya coincide, para no generar un `isDirty` falso en el caso común |

No cambia `TIME_PATTERN`, `maskTimeInput` ni el mecanismo de error de tecleo en curso (`invalid`, líneas 41–70): ese sigue siendo el error de "lo que estoy escribiendo no es una hora", distinto del error de Zod que resuelve el punto siguiente.

**Los cuatro campos ganan `<FormMessage/>`**, dentro de su `<FormItem>`, igual que ya hacen `HealthFacilityFormDialog.tsx`, `DiagnosticFormDialog.tsx` y `EvaluationInstitutionFormDialog.tsx` con `<CatalogSelect>`:

| Archivo | Campo | Mensaje que produce (ya existe en los tres idiomas, vía `zodErrorMap.ts`) |
|---|---|---|
| `EventFormDialog.tsx` | `startTime` | `errors.validation.invalid` — issue `invalid_format` sin `uuid`/`email` |
| `VaccineFormDialog.tsx` | `vaccinationTime` | `errors.validation.invalid` |
| `DiluentFormRow.tsx` | `reconstitutionTime` | `errors.validation.invalid` |
| `PregnancyComplicationFormDialog.tsx` | `complicationTypeItemId` | `errors.validation.required` — issue `invalid_type` sobre un `string().uuid()` sin valor |

**No hace falta ninguna clave i18n nueva** (§3.8 queda vacío): los cuatro mensajes salen del mapa genérico de `zodErrorMap.ts`, que ya cubre `invalid_format` e `invalid_type` en `es`/`en`/`nl`.

**La validación del cliente sigue sin sustituir a la del servidor** (`CONVENTIONS.md` §8): esto no añade ninguna regla nueva, solo hace visible una que ya existía.

### 3.7 Responsividad y accesibilidad

- Sin cambios de layout: `<FormMessage/>` es el mismo párrafo de `text-destructive` que ya usan 39 formularios, dentro del mismo `<FormItem>` de `grid gap-2`.
- **Precedente ya aceptado, no un gap nuevo de este spec.** `<TimeField>` y `<CatalogSelect>` no reenvían el `aria-describedby`/`aria-invalid` que `FormControl` calcula (`shared/components/ui/form.tsx:94-106`) hasta su `<input>`/disparador interno — el mismo comportamiento que ya tienen `HealthFacilityFormDialog.tsx` y los demás formularios con `<CatalogSelect>` + `<FormMessage/>`. El mensaje es visible y sigue el orden del DOM, pero no está enlazado por `aria-describedby` al control. Corregirlo es un cambio de las dos primitivas compartidas que afecta a toda la aplicación, no algo que este spec de alcance acotado deba resolver — queda anotado en §7.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando. Verificación de tipos con `npx tsc --noEmit -p tsconfig.app.json` (`npm run build` no sirve para esto, per memoria del proyecto).

1. **`<TimeField>` sincroniza `onChange` con el valor mostrado.** `shared/components/TimeField.tsx`: en el `useEffect` que ya reacciona a `[value]`, si `value` tiene más de 5 caracteres, llamar a `onChange(value.slice(0, 5))` además de `setDraft`.
   *Verificación:* en `TimeField.test.tsx`, un test nuevo monta el campo con `value="10:59:00"` y comprueba que `onChange` se llamó una vez con `"10:59"` al montar, y que con `value="10:59"` no se llama a `onChange` en absoluto.

2. **`startTime` en `EventFormDialog.tsx` gana `<FormMessage/>`.** Se añade dentro del `<FormItem>` de las líneas 244–257, junto al `<FormControl>` existente. Se importa `FormMessage` de `shared/components/ui/form`.
   *Verificación:* en `EventFormDialog.test.tsx`, un test monta el diálogo en edición con `startTime: '10:59:00'` desde el mock de `existing.data`, comprueba que el campo muestra `10:59`, pulsa «Guardar» sin tocar la hora, y comprueba que el `PUT` se dispara con `startTime: '10:59'`. Un segundo test fuerza un valor inválido y comprueba que aparece el mensaje de `<FormMessage/>` y que la mutación no se llama.

3. **`vaccinationTime` en `VaccineFormDialog.tsx` gana `<FormMessage/>`.** Mismo cambio, líneas 200–216.
   *Verificación:* mismos dos casos que el paso 2, en `VaccineFormDialog.test.tsx`.

4. **`reconstitutionTime` en `DiluentFormRow.tsx` gana `<FormMessage/>`.** Mismo cambio, líneas 241–256.
   *Verificación:* mismos dos casos que el paso 2, añadidos a `DiluentList.test.tsx` (que es quien hoy monta `DiluentFormRow` en sus tests, al no existir un archivo de test propio).

5. **`complicationTypeItemId` en `PregnancyComplicationFormDialog.tsx` gana `<FormMessage/>`.** Líneas 159–183.
   *Verificación:* un test nuevo en `PregnancyComplicationList.test.tsx` (que monta el diálogo, al no existir un archivo de test propio) que abre el formulario de creación, escribe `complicationName` pero no selecciona tipo, pulsa «Guardar», comprueba que aparece el mensaje de campo obligatorio y que `POST` no se llama.

6. **Cierre.** `npm run check` en 0.

---

## 5. Criterios de aceptación

- [ ] Editar un evento cuyo `startTime` llega como `HH:mm:ss` muestra `HH:mm` en el campo y «Guardar» produce el `PUT` sin tocar la hora.
- [ ] Lo mismo para `vaccinationTime` en `VaccineFormDialog` y `reconstitutionTime` en `DiluentFormRow`.
- [ ] Guardar `PregnancyComplicationFormDialog` sin seleccionar `complicationTypeItemId` muestra el mensaje de campo obligatorio y no llama a `POST`/`PUT`.
- [ ] `grep -n "FormMessage" src/features/notification/EventFormDialog.tsx src/features/notification/VaccineFormDialog.tsx src/features/notification/DiluentFormRow.tsx src/features/notification/PregnancyComplicationFormDialog.tsx` devuelve resultado en los cuatro archivos.
- [ ] `TimeField.test.tsx` cubre que un valor de más de 5 caracteres dispara `onChange` una vez al montar, y que uno de 5 no lo dispara.
- [ ] Ningún archivo de este spec gana una clave i18n nueva (confirmado en §3.5); `npm run i18n:check` sale en 0.
- [ ] `npm run check` sale en 0.

**Bloque de cierre:**

- [ ] **Tema oscuro.** El texto de `<FormMessage/>` usa el token `destructive` ya existente; `grep -rnE "bg-(slate|gray|zinc|white|black)|#[0-9a-fA-F]{3,6}" src/shared/components/TimeField.tsx src/features/notification/EventFormDialog.tsx src/features/notification/VaccineFormDialog.tsx src/features/notification/DiluentFormRow.tsx src/features/notification/PregnancyComplicationFormDialog.tsx` no devuelve resultados.
- [ ] **Por debajo de `md`.** Los cuatro diálogos siguen sin scroll horizontal a 375px con el mensaje de error visible (el párrafo añadido no ensancha el `<FormItem>`).
- [ ] **Rol bajo.** El comportamiento no depende del rol: un `USER` ve el mismo mensaje que un `ADMIN` ante el mismo error de validación.
- [ ] **Sin literales.** Los cuatro mensajes salen de `zodErrorMap.ts` vía i18n; ningún texto nuevo se escribe a mano.
- [ ] **Estado en una sola capa.** `fieldState.error` sigue viviendo solo en React Hook Form; ningún paso de este plan lo copia a `useState` ni a un store.

---

## 6. Decisiones tomadas y descartadas

- **Sí:** normalizar en `<TimeField>`, no en los tres `defaultValues` de cada diálogo. Es la primitiva compartida (FE12b §2); arreglarla ahí cierra los tres campos de una vez y cualquier consumidor futuro nace correcto.
- **Sí:** usar `<FormMessage/>` genérico en vez de un bloque manual `fieldState.error && <p>{t('clave.propia')}</p>`. Es el patrón que ya usan 39 de los 45 formularios, y los mensajes genéricos de `zodErrorMap.ts` ya dicen lo correcto sin inventar una clave nueva por campo.
- **No:** tocar los bloques manuales que ya existen (`esaviName`, `otherDescription`, `vaccineName`, `vaccinationDate`, `diluentName`, `reconstitutionDate`, `complicationName`). Ya muestran su error; homogeneizarlos a `<FormMessage/>` es una limpieza de estilo sin bug detrás, y este spec corrige un defecto, no reescribe seis archivos por consistencia.
- **No:** incluir `MedicalHistoryFormDialog.tsx`. Ninguno de sus campos tiene una vía real de fallo silencioso hoy (decidido explícitamente con el usuario).
- **No:** relajar `timeRegex` para aceptar `HH:mm:ss`. El formulario pide `HH:mm`; el defecto era la divergencia entre lo mostrado y lo validado, no la regla.
- **No:** corregir en este spec que `<TimeField>` y `<CatalogSelect>` no reenvían el `aria-describedby`/`aria-invalid` de `FormControl` a su control interno. Es un gap ya existente en toda la aplicación (§3.7), y arreglarlo toca dos primitivas compartidas usadas por decenas de formularios — un spec de accesibilidad aparte, no un bug fix acotado a cuatro campos.

---

## 7. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `<TimeField>` tiene otros dos consumidores fuera de notificación: `AutopsyFields.tsx` y `BasicInfoSection.tsx` (FE13a, `deathTime`) | `BasicInfoSection.tsx:69` ya recorta a mano `autopsy.deathTime.slice(0, 5)` antes de llegar a `<TimeField>` — el fix de la primitiva no cambia nada ahí, porque el valor ya llega en 5 caracteres. Es la prueba de que el diagnóstico de la causa es correcto: alguien más tropezó con el mismo defecto y lo parchó en su propio `defaultValues` en vez de en la primitiva. |
| `AutopsyFields.tsx` usa `<TimeField>` sin `<FormMessage/>`, igual que los cuatro campos de este spec | Fuera de alcance (decidido en §2: este spec se acota a notificación). Si `deathTime` llegara alguna vez sin pasar por el recorte de `BasicInfoSection.tsx:69`, tendría el mismo síntoma. Queda anotado para un spec de investigación aparte, no se toca aquí. |
| Llamar a `onChange` en el montaje de `<TimeField>` marca el formulario como `isDirty` aunque el usuario no haya tocado nada | Sin consumidor que le importe: `ResourceForm` solo deshabilita «Guardar» con `isSubmitting` (`ResourceForm.tsx:101`), y ninguno de los cuatro diálogos usa `draftsStore` — esa capa es solo del wizard, no de los diálogos satélite (`CONVENTIONS.md` §7) |

---

## 8. Impacto en pantallas existentes

| Archivo | Cambio |
|---|---|
| `shared/components/TimeField.tsx` | Sincroniza `onChange` con el valor mostrado al recibir más de 5 caracteres |
| `features/notification/EventFormDialog.tsx` | `startTime` gana `<FormMessage/>` |
| `features/notification/VaccineFormDialog.tsx` | `vaccinationTime` gana `<FormMessage/>` |
| `features/notification/DiluentFormRow.tsx` | `reconstitutionTime` gana `<FormMessage/>` |
| `features/notification/PregnancyComplicationFormDialog.tsx` | `complicationTypeItemId` gana `<FormMessage/>` |
| `features/investigation/AutopsyFields.tsx`, `BasicInfoSection.tsx` | Ningún cambio de código. Se benefician del fix de la primitiva sin tocarse (§7): si `deathTime` llegara alguna vez sin el recorte manual de `BasicInfoSection.tsx:69`, ya no divergiría en silencio |

---

## Lo que **no** está en este spec

- `MedicalHistoryFormDialog.tsx`.
- Sustituir los bloques manuales `fieldState.error && <p>…</p>` que ya funcionan por `<FormMessage/>` genérico.
- Un audit de `FormMessage` en el resto de la aplicación.
- Cambiar `timeRegex` para aceptar `HH:mm:ss`.
- Normalizar la hora en el servidor.
- Que `<TimeField>` y `<CatalogSelect>` reenvíen `aria-describedby`/`aria-invalid` de `FormControl` a su control interno.
- `AutopsyFields.tsx` y el resto del paso de investigación.

Cada uno de esos, si aterriza, va en su propio spec.

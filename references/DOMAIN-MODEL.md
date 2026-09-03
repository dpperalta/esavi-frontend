# Modelo de dominio

> **Fuentes:** `esavi-backend/src/models/associations/*.ts` (relaciones), `esaviapp.sql` (DDL y semillas)
> **Fecha:** 2026-09-03 · **47 tablas**, verificadas contra el DDL

El mapa de lo que existe y de cómo se conecta. Sirve para decidir qué pantalla necesita qué, y en qué orden se pueden llenar los formularios.

---

## 1. El centro: `esaviCase`

Un **ESAVI** es un Evento Supuestamente Atribuible a la Vacunación e Inmunización. El caso es la unidad del sistema, y todo cuelga de él.

```
              patient ──┐
                        ├──> esaviCase ──┬──> notifier              quién reportó
       healthFacility ──┘                ├──> classification        gravedad inicial
                                         ├──> notification          ficha de notificación
                                         ├──> investigation         investigación de campo
                                         ├──> finalClassification   veredicto de causalidad
                                         └──> caseWorkflow          avance del expediente
```

`esaviCase` apunta a `patient` (quién) y a `healthFacility` (dónde se reportó). Sus **seis satélites** apuntan hacia él.

`caseWorkflow` es 1:1 con `UNIQUE ("caseId")` y **nace junto al caso**, dentro de la transacción de `ESAVI-CASE-001`. Ningún caso nuevo existe sin flujo.

---

## 2. Las cinco etapas y su estado

`caseWorkflow.statusItemId` apunta al catálogo `caseWorkflowStatus`, con **ocho ítems**:

| Estado | Significado |
|---|---|
| `OPEN` | Caso creado, sin etapa iniciada |
| `IN_CLASSIFICATION` | En clasificación de gravedad |
| `IN_NOTIFICATION` | Llenando la ficha de notificación |
| `IN_INVESTIGATION` | Investigación de campo en curso |
| `IN_FINAL_CLASSIFICATION` | Aplicando el algoritmo de causalidad OMS/OPS |
| `PENDING_VALIDATION` | Requiere revisión antes de continuar. **Reversible**: `previousStatusItemId` guarda desde dónde se pidió y al salir se restaura |
| `CLOSED` | Expediente cerrado |
| `REOPENED` | Reabierto por ADMIN; `reopenCount` y `lastReopenedAt` lo registran |

La tabla guarda además **cuatro sellos de inicio y cuatro de fin**, uno por etapa, más `openedAt`, `closedAt` y `lastReopenedAt`. Las duraciones **se calculan al leer**; no hay columna que las almacene.

> **No confundir dos estados parecidos.** `investigation.statusItemId` apunta al catálogo `investigationStatus` —*Recuperado*, *Fallecido*, *No recuperado*— y es el **desenlace clínico del paciente**. `caseWorkflow.statusItemId` es el **avance administrativo del expediente**. Son ortogonales: un caso cerrado puede tener al paciente sin recuperar.

### El endpoint que hace posible retomar un caso

`GET /api/case-workflows/case/:id` (`ESAVI-CASEFLOW-006`) devuelve el estado **y `exists` + `id` por cada satélite**. Una sola llamada dice si cada etapa se crea con `POST` o se actualiza con `PUT /:id`. Es la base del wizard.

---

## 3. La rama de notificación

```
notification ──┬──> severeNotification            1:1, si es grave
               ├──> nonSevereNotification         1:1, si no lo es
               ├──> notificationEvent      (N)    eventos, con término diagnóstico
               ├──> notificationMedication (N)    medicación concomitante
               ├──> notificationVaccine    (N) ──> notificationDiluent (N)
               └──> notificationPregnancy   1:1 ──> notificationPregnancyComplication (N)
```

Dos nietas: `notificationDiluent` cuelga de **`notificationVaccine`**, no de la notificación —el diluyente pertenece a una vacuna concreta—, y `notificationPregnancyComplication` cuelga de `notificationPregnancy`.

`notification.notificationType` es un ENUM `NOT NULL`, y `esaviDescription` es `TEXT NOT NULL`. **Son los dos únicos campos obligatorios de la cabecera**, y por eso el primer paso del wizard tiene que recogerlos: antes de tenerlos no hay fila que guardar.

> **Deuda conocida:** `classification.isSeriousEvent` y `notification.notificationType` son dos declaraciones de gravedad que el esquema no obliga a coincidir. El SPEC F44 lo dejó anotado sin resolver. El cliente debería tomar una como fuente y no dejar que el usuario las contradiga sin avisar.

---

## 4. La rama de investigación

`investigation` tiene **diez satélites directos** y **dos nietas**:

```
investigation ──┬──> investigationSource               (N)  fuentes de verificación
                ├──> investigationAutopsy              1:1  fallecimiento y autopsia
                ├──> investigationTeamMember           (N)  quién investigó, ordenado
                ├──> investigationMedicalHistory       1:1 ──> investigationPregnancyCondition (N)
                ├──> investigationClinicalEvaluation   1:1 ──> evaluationInstitution (N)
                ├──> investigationVaccinationContext   1:1  sesión de vacunación
                ├──> investigationVaccineAdministered  (N)  vacunas con número de dosis
                ├──> investigationColdChain            1:1  conservación y transporte
                ├──> investigationAdministrationError  1:1
                └──> investigationCommunity            1:1
```

`investigation` sólo exige `caseId`: **todo lo demás es nulable**. La tabla está diseñada para llenarse por partes, que es exactamente lo que necesita el wizard.

Detalles que afectan a la interfaz:

- `investigationPregnancyCondition` cuelga de `investigationMedicalHistory`, no de la investigación. Se entra por la historia clínica.
- `evaluationInstitution` cuelga de `investigationClinicalEvaluation` y **lleva columnas cifradas** (`personName`, `personContact`): el backend descifra fila a fila al listar.
- `investigationVaccinationContext` tiene **dos claves foráneas contra el mismo catálogo** (`vaccinationMoment`).
- Varios satélites tienen la primary key **igual** a la foránea y **no tienen `isActive`**: no exponen activación (`005A`/`005B`).

---

## 5. Catálogos

### 5.1 `catalogType` → `catalogItem`

El catálogo genérico del sistema. Casi todos los desplegables del formulario salen de aquí, resueltos por el **código del tipo**.

Tipos sembrados en `esaviapp.sql`, con su número de ítems:

| `catalogType.code` | Ítems | Dónde se usa |
|---|---|---|
| `vaccinationSite` | 8 | Sitio de aplicación |
| `profession` | 8 | Notificador, equipo investigador |
| `caseWorkflowStatus` | 8 | Estado del expediente |
| `pregnancyOutcome` | 7 | Embarazo |
| `gestationMethod` | 7 | Embarazo |
| `outcome` | 6 | Desenlace del evento |
| `investigationStatus` | 6 | Desenlace clínico del paciente |
| `healthFacilityType` | 5 | Unidades de salud |
| `evaluationInstitutionType` | 5 | Instituciones evaluadoras |
| `deliveryType` | 5 | Parto |
| `userStatus` | 4 | Usuarios |
| `birthCondition` | 4 | Recién nacido |
| `vaccinationMoment` | 3 | Contexto de vacunación (×2 FK) |
| `sex` | 3 | Paciente |
| `pregnancyComplicationType` | 3 | Complicaciones |
| `finalClassificationImportance` | 3 | Clasificación final |
| `ageUnit` | 3 | Edad del paciente |
| `pharmaceuticalForm` | 2 | Medicación |
| `administrationRoute` | 2 | Vía de administración |

> **Excepción de nomenclatura:** en `catalogType` y `catalogItem` el `code` va en **camelCase**, no en `CONSTANT_CASE` como el resto del repositorio. Está declarado en `CONVENTIONS.md`.

El componente `<CatalogSelect typeCode="sex">` resuelve contra `GET /api/catalog-items/type/:id`. Como el id es un UUID y lo que el frontend conoce es el `code`, hace falta un mapa `code → catalogTypeId` resuelto una vez al arranque y cacheado con `staleTime` alto.

### 5.2 Catálogos con tabla propia

| Tabla | Qué es | Import masivo |
|---|---|---|
| `diagnosticTerm` | Términos diagnósticos (MedDRA-like) | Sí, `.asc` |
| `vaccineWhodrug` | Vacunas del diccionario WHODrug | Sí, `.xlsx` |
| `diluentCatalog` | Diluyentes | No |

Rutas con nombre deliberadamente distinto al de la tabla: `/api/whodrug-vaccines` y `/api/diluents`.

**`vaccineWhodrug` es plana en el esquema y jerárquica en los datos.** Ninguna columna declara la jerarquía, pero cinco la dibujan: `abbreviation → drugName → maHolders → formTranslations → strength`. El SPEC F54 la expone como cinco endpoints de navegación (`WHODRUG-006A`…`006E`), y con eso el selector de vacuna del formulario de notificación **no lista el diccionario entero**: baja por facetas y para en cuanto queda una sola fila, que es la que la notificación referencia por `vaccineWhodrugId`. Las cinco columnas son nulables, y un `null` es una opción navegable más — ninguna fila queda inalcanzable. La forma de la respuesta está en `API-CONTRACT.md` §11.2.

**MedDRA no es una tabla de este sistema.** `GET /api/meddra/search` (SPEC F55) es un proxy de sólo lectura contra el diccionario oficial, licenciado y de pago: no escribe nada y no cruza sus resultados contra `diagnosticTerm`. Sirve para **codificar un evento cuyo término no se importó**; lo que se elige se persiste por la vía que ya existía —`ESAVI-DIAGTERM-006`, o los campos `esaviCode`/`esaviName` de `notificationEvent`—, y por eso sus filas vienen ya con la forma `code` + `name` de esas columnas.

---

## 6. Geografía y unidades de salud

```
geoLevelType ──> geoLocation ──> healthFacility
                      ↑ self           ↑ self
```

- `geoLocation.parentGeoLocationId` es **autorreferente**: la jerarquía completa (país → provincia → cantón → parroquia) vive en una sola tabla.
- `healthFacility` **también** es autorreferente (unidades que dependen de otras) y apunta a `geoLocation` y a `catalogItem` (su tipo).
- `geoLocation` tiene `latitude`, `longitude` y `geoPolygon geometry(MultiPolygon, 4326)` — hay PostGIS disponible si algún día se quiere mapa.

**El filtro `geoLocationId` del listado de casos es jerárquico** (SPEC F48): resuelve el subárbol completo con un `WITH RECURSIVE`, porque `healthFacility.geoLocationId` apunta casi siempre a la unidad más fina y una igualdad estricta contra una provincia devolvería cero filas.

`<GeoLocationPicker>` debe recorrer esa jerarquía en cascada, nivel por nivel.

**La identidad externa de una fila geográfica es `geoLocation.externalCode`**, protegida desde el SPEC F53 por el índice único parcial `UQ_geoLocation_externalCode` (único cuando no es nulo, así que una fila sin código externo sigue siendo válida). Es la clave por la que la importación masiva decide entre insertar y actualizar, y por la que las filas del fichero se resuelven a su padre; en `healthFacility` ese papel lo hace `localCode`. Consecuencia para la interfaz: **`externalCode` no es un campo decorativo del formulario** — editarlo a mano rompe la correspondencia con la siguiente carga.

El importador (`ESAVI-GEOLOC-006`) **nunca reparenta ni cambia de nivel**: una fila cuyo padre o nivel difiere de lo cargado se rechaza con `PARENT_CHANGED` o `LEVEL_CHANGED`, y sus descendientes con `ORPHAN`. Mover una unidad sigue siendo trabajo del `004`, una a una — un reparentado arrastra el subárbol entero y con él el alcance geográfico de los usuarios (SPEC F49). Tampoco reactiva: una fila desactivada sigue inactiva aunque el fichero la traiga.

---

## 7. Usuarios, roles y cobertura

```
appUser ──┬──> appUserRole ──> appRole
          ├──> appUserGeoLocation ──> geoLocation    cobertura territorial
          ├──> appSession                            sesiones vivas y revocadas
          └──> appPasswordReset                      tokens de reseteo
```

- `appUser` tiene cifrados `email`, `username`, `firstName`, `lastName` y `displayName`. El backend descifra antes de responder.
- `appUserGeoLocation` define **qué territorio ve cada usuario**. `ESAVI-USERGEO-008` expande esa cobertura recursivamente.
- `appSession` sostiene la rotación de refresh tokens y la revocación (`LOGOUT`, `LOGOUT_ALL`, `REUSE_DETECTED`, `PASSWORD_CHANGED`).

**Roles y niveles:** `SUPERADMIN` 100 > `ADMIN` 50 > `USER` 25 > `ANALYTICS` 10.

---

## 8. Configuración del sistema

```
systemConfig ──> systemConfigHistory
```

Clave/valor **global** con `UNIQUE (code, scope)`, `value jsonb` y `valueType` acotado por `CHECK` a `string | number | boolean | json | array`. Una fila puede marcarse `isEncrypted` (guarda `{ "enc": "…" }`) o `isEditable: false`.

**No tiene `userId`.** No sirve para preferencias por persona — ver `ARCHITECTURE.md` §7.3.

Cada escritura deja una fila en `systemConfigHistory` con `previousValue`, `newValue` y `changedByUserId`, **incluso cuando el valor no cambió**: el procedimiento `upsertSystemConfig` es deliberadamente lo contrario del update diferencial.

---

## 9. Estado de implementación

**47 tablas en el DDL** —`CREATE TABLE` contados sobre `esaviapp.sql` el 2026-09-03—, incluidas las que añadieron F43 (`appPasswordReset`) y F44 (`caseWorkflow`). Prácticamente todas tienen ya sus siete artefactos y su ruta: el inventario real de lo consumible es `API-ROUTES.md`, con **333 rutas en 43 grupos**.

Los specs del backend del F50 al F55 **no añadieron ninguna tabla**: son búsqueda, navegación, importación y un proxy externo sobre el modelo que ya existía. El único cambio de DDL desde entonces es el índice `UQ_geoLocation_externalCode` de §6.

El esquema **no** lo crea Sequelize: no hay `sequelize.sync()`. `esaviapp.sql` es el DDL autoritativo y no existe sistema de migraciones.

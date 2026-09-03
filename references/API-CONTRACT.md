# Contrato de la API

> **Fuentes:** `esavi-backend/src/app.ts`, `src/middlewares/`, `src/services/auth.service.ts`, `src/helpers/`, `src/validators/`, `references/CONVENTIONS.md`, `references/functional/specs/50` a `55`, `.env.example`
> **Fecha:** 2026-09-03

Todo lo que el cliente necesita saber sobre la forma de las peticiones y las respuestas. Es la referencia del `client.ts` y de `createResource.ts`.

---

## 1. Base

| Dato | Valor |
|---|---|
| Prefijo | Todas las rutas cuelgan de `/api` |
| Puerto de desarrollo | `4500` (`PORT` en `.env.development`) |
| Base URL de desarrollo | `http://localhost:4500/api` |
| Origen del frontend | `http://localhost:5173` — **ya está en `CORS_ORIGINS` del `.env.example`** |
| Vida del access token | `JWT_EXPIRES_IN=1h` |

`CORS_ORIGINS` es obligatoria cuando `NODE_ENV=production`.

---

## 2. Envelope de respuesta

**Éxito** — cualquier `2xx`:

```json
{ "ok": true, "message": "Casos ESAVI obtenidos correctamente", "data": { } }
```

`message` siempre proviene de `getMessage(clave, req.lang)`: viene traducido y **no debe mostrarse tal cual sin considerar que ya está en el idioma pedido**.

**Error** — lo produce `errorHandler`, el último middleware de `src/app.ts`:

```json
{
  "ok": false,
  "message": "Error de validación. Por favor, verifique su entrada e inténtelo de nuevo.",
  "code": "CASE_002A_GET_FAILED",
  "errors": "…"
}
```

`errors` sólo contiene el texto real del error cuando `NODE_ENV=development`. En producción es `'Internal server error'`. **El cliente no debe mostrar `errors` al usuario**: es material de depuración.

### Implicación para el cliente

El interceptor de respuesta de axios desenvuelve `data` y convierte el error en un `EsaviApiError` que conserva `code` y `status`. Ningún componente debería escribir `response.data.data`.

### Forma del `code`

`<ENTIDAD>_<OPERACIÓN>_<MOTIVO>` — por ejemplo `HFAC_001_CREATION_FAILED`, `CASE_002A_GET_FAILED`, `AUTH_001_INVALID_CREDENTIALS`. Es estable y sirve para decidir el mensaje del toast sin parsear texto.

**Hay una segunda forma, sin número de operación.** Los errores que nacen antes de saber a qué operación pertenece la petición —los de los middlewares transversales— llevan sólo `<ÁMBITO>_<MOTIVO>`: `INTERNAL_SERVER_ERROR` es el precedente, y desde 2026-09-03 también los seis de autenticación y autorización.

### Códigos transversales de autenticación y autorización

`tokenValidation` y `validateUserRole` rechazan con `next(new AppError(...))`, así que sus respuestas llevan `code` como cualquier otra (backend `CONVENTIONS.md` §10, DEUDA-032). Son los seis códigos que el cliente ve **antes** de que la petición llegue a su controlador:

| `code` | Status | Qué significa | Qué hace el cliente |
|---|---|---|---|
| `AUTH_TOKEN_MISSING` | `401` | No hay cabecera `Authorization`, o no empieza por `Bearer ` | Refrescar y reintentar; es el caso normal tras recargar la página |
| `AUTH_TOKEN_EXPIRED` | `401` | El token es legítimo pero caducó | Refrescar y reintentar |
| `AUTH_TOKEN_INVALID` | `401` | La firma no verifica o el token está malformado | Refrescar; si el refresh también falla, al login |
| `AUTH_USER_NOT_FOUND` | `401` | El token verifica pero el `userId` no es de un usuario activo | Al login. Refrescar no lo arregla |
| `AUTH_TOKEN_VALIDATION_FAILED` | `500` | Fallo inesperado dentro del middleware | Error, no cierre de sesión |
| `AUTH_ROLE_FORBIDDEN` | `403` | Nivel de rol insuficiente | No hay nada que reintentar: es la única forma de saber que un `403` es de rol y no de otra cosa |

**El cliente no puede asumir que `code` viaje siempre.** Hasta el 2026-09-03 estos seis `401`/`403` se construían a mano y salían **sin `code`**; `toEsaviApiError` sustituye `'UNKNOWN_ERROR'` cuando falta, y esa red se mantiene: sin ella, la guarda `code.endsWith(...)` de la cola de refresh reventaba con un `TypeError` antes de intentar el refresco, y toda recarga de página terminaba en el login. Lo mismo vale para un cuerpo vacío o no-JSON: `message` y `code` se leen con `?.` y respaldo.

---

## 3. Autenticación

### 3.1 Login — `POST /api/auth/login`

Respuesta (`data`):

```ts
{
  token: string;          // access token JWT
  refreshToken: string;   // formato compuesto: sessionId + secreto
  expiresAt: string;      // ISO
  user: {
    userId: string;
    email: string;        // descifrado por el backend
    displayName: string;  // descifrado por el backend
    roles: Array<{ roleId: string; name: string; code: string }>;
  };
}
```

El JWT lleva **sólo `userId`** en el payload. No intentes leer roles del token: `tokenValidation` recarga el usuario con sus roles desde la base **en cada petición**, así que el rol efectivo es siempre el de la base, no el del token.

### 3.2 Refresh — `POST /api/auth/refresh`

El refresh token viaja **en el body**, no en cookie. No exige `tokenValidation`, porque el access token está caducado justo cuando este endpoint hace falta.

**Rotación con detección de reutilización (SPEC F42):** cada `refresh` invalida el token consumido y emite uno nuevo. Presentar un refresh token ya gastado revoca **todas** las sesiones del usuario con `revokedReason: 'REUSE_DETECTED'`.

Consecuencias para el cliente, y son estrictas:

- **Un solo refresh en vuelo.** Dos peticiones concurrentes que reciban `401` no pueden disparar dos refrescos: el segundo usaría un token ya consumido y cerraría todas las sesiones del usuario. Es obligatorio encolar.
- **Guardar siempre el token nuevo** que devuelve la respuesta; el anterior ya no vale.
- Si el refresh devuelve `401` con `AUTH_002_REFRESH_TOKEN_REUSED`, la sesión está comprometida o duplicada: hay que llevar al login, no reintentar.

### 3.3 Logout — `POST /api/auth/logout`

Revoca la sesión del refresh token recibido en el body. Tampoco exige access token válido, y por la misma razón.

`POST /api/auth/logout-all` sí lo exige: el `userId` sale de `req.user`, nunca del body — tomarlo del body convertiría el endpoint en una denegación de servicio contra cualquier usuario.

### 3.4 Recuperación de contraseña

- `POST /api/auth/forgot-password` — abierta, con limitador propio (5 por IP cada 15 minutos).
- `POST /api/auth/reset-password` — abierta; la credencial es el token del body. **Sin limitador**, deliberadamente: limitarla castigaría al usuario legítimo que se equivoca al pegar el enlace.

---

## 4. Autorización

Dos mecanismos, y el cliente debe reflejar los dos:

**Por ruta** — `validateUserRole(...)` compara niveles numéricos:

```ts
const ROLE_LEVELS = { SUPERADMIN: 100, ADMIN: 50, USER: 25, ANALYTICS: 10 };
```

Pasar `USER` admite cualquier rol superior. La matriz completa está en `API-ROUTES.md`.

**Por comportamiento** — dentro de los servicios, los predicados de `permissions.helper.ts` (`canViewInactive`, `isAdmin`, …) deciden típicamente si las filas inactivas son visibles. De ahí nace el par `002A`/`002B`.

> Replicar esto en el cliente es **experiencia de usuario, no seguridad**. Oculta lo que el usuario no puede hacer para que no lo intente; el backend sigue siendo la única autoridad.

---

## 5. Listados y paginación

Los listados aceptan `limit` y `offset` como query params, ambos opcionales.

```
GET /api/esavi-cases?limit=25&offset=50
```

`limit` es un entero **entre 1 y 100** — un `pageSize` mayor es `400`, no una página grande — y `offset` un entero no negativo. El valor por defecto sale de `systemConfig` (`ESAVI_APP_DEFAULT_LIMIT`, legible con `ESAVI-SYSCONF-006`), no de una constante del cliente.

La respuesta de todo listado es `{ count, rows }`: `count` es el total de filas que cumplen el filtro, **no** las devueltas en la página.

**El par `002A` / `002B`** es la constante del repositorio:

| Operación | Ruta típica | Devuelve |
|---|---|---|
| `002A` | `GET /api/<entidad>` | Sólo filas activas |
| `002B` | `GET /api/<entidad>/admin` | Activas **e** inactivas, con rol superior |

`createResource` elige entre las dos según el nivel de rol y el toggle de «mostrar inactivos».

### Filtros de casos ESAVI (SPEC F48)

`GET /api/esavi-cases` y `/admin` aceptan **trece filtros opcionales, todos acumulados con AND**:

| Parámetro | Semántica |
|---|---|
| `patientId`, `healthFacilityId` | igualdad (UUID) |
| `reportDate`, `eventDate`, `reportFillingDate` | igualdad exacta (`YYYY-MM-DD`) |
| `…From` / `…To` para cada una de las tres fechas | rango **inclusivo** en ambos extremos |
| `geoLocationId` | la unidad geográfica **y todos sus descendientes activos** |

Reglas que el formulario de filtros debe respetar, porque el validador devuelve `400`:

- **Exacta y rango sobre la misma columna son mutuamente excluyentes.** `?reportDate=…&reportDateFrom=…` es un error. La exclusión es **por columna**, no global: `?reportDate=2026-03-01&eventDateFrom=2026-02-01` es válido y frecuente.
- `From` no puede ser posterior a `To`.
- Las fechas se recortan a `YYYY-MM-DD`; las columnas son `date`, no `timestamp`.
- **Un caso sin `eventDate` nunca aparece al filtrar por `eventDate`**, en ninguna de sus tres formas. Es semántica de SQL y es la correcta. Igual para `reportFillingDate`. `reportDate` es `NOT NULL`.

`geoLocationId` es siempre jerárquico: no existe un modo de igualdad estricta, porque `healthFacility.geoLocationId` apunta casi siempre a la unidad más fina y un filtro estricto por provincia devolvería cero filas.

### Búsqueda por nombre y código (SPEC F50, F51, F52)

**`name` y `code` son la forma canónica del filtro de texto**, separados y combinados entre sí con `OR`; frente a cualquier otro filtro, con `AND`. Son coincidencia parcial insensible a mayúsculas (`ILIKE %valor%`) y **sensible a tildes**: «Peñas» no se encuentra escribiendo «Penas».

Doce entidades los aceptan hoy en su listado, sin ruta nueva:

| Entidad | Dónde | Columnas |
|---|---|---|
| `catalogType`, `geoLevelType`, `appRole`, `diagnosticTerm`, `diluentCatalog`, `systemConfig` | `002A`/`002B` | `name`; `code` |
| `geoLocation` | `002` | `name`; `code` |
| `vaccineWhodrug` | `002A`/`002B` | `drugName`; `drugCode` |
| `esaviCase` | `002A`/`002B` | **`code` únicamente** (`caseCode`). Un `?name=` que llegue se ignora en silencio |
| `catalogItem` | `007` — `GET /api/catalog-items/search` | `name`; `code`, con `catalogTypeId` opcional |
| `healthFacility` | `006` — `GET /api/health-facilities/search` | `name`; `code`, con `geoLocationId` opcional |
| `patient` | `006` por identificador, `007` `search-by-name` | ver abajo |

Reglas que el cliente debe respetar:

- **Mínimo dos caracteres** en todo parámetro nuevo (`400` por debajo). Las excepciones son `geoLocation`, cuyo `name`/`code` se publicaron sin mínimo y no se endurecieron, y el `term` de MedDRA, que exige **tres**. Un autocompletado no debe llamar antes del mínimo.
- **`%` y `_` son literales.** El backend los escapa (`escapeLike`); no son comodines y no hay que ofrecerlos como tales. Importa en los códigos administrativos, que los llevan.
- **`search` es un alias congelado.** Sobrevive en `diagnosticTerm`, `diluentCatalog`, `vaccineWhodrug` y `systemConfig` con el significado «coincide en nombre **o** en código». **No se usa en código nuevo** y no se añadirá a ninguna superficie nueva: el componente de autocompletado se escribe una sola vez contra `name`/`code`.
- **`GET /api/catalog-items/search` sin `name` ni `code` es `400`** (`CATITEM_007_SEARCH_CRITERIA_REQUIRED`). `catalogTypeId` por sí solo no es criterio de búsqueda — para eso está el `002A` por tipo.
- La búsqueda de pacientes por nombre (`ESAVI-PATIENT-007`, `?name=`) no es `ILIKE`: va contra un índice de tokens cifrados con **coincidencia conjuntiva** (SPEC F45/F47). Los nombres están cifrados y la búsqueda parcial no existe sobre ellos.

### `sysDetails` no viaja (casi nunca)

`catalogItem`, `catalogType`, `geoLevelType` y `geoLocation` dejaron de exponer la columna interna `sysDetails` en sus `002A`, `002B` y `003` (SPEC F52). **Excepción viva:** los `002A`/`002B` de `healthFacility` todavía la devuelven; su `003` y su `006` no. Es una asimetría conocida del backend, no un dato que el cliente deba usar: `sysDetails` no se lee nunca desde el frontend — la auditoría visible es `appDetails`.

---

## 6. Idioma

`languageMiddleware` resuelve `req.lang` en este orden:

1. `?lang=` en la query
2. Cabecera `Accept-Language`
3. `DEFAULT_LANGUAGE` (`es`)

Filtrado contra `SUPPORTED_LANGUAGES` = `es,en,nl`.

**El interceptor de axios debe añadir `?lang=` con el idioma activo del store de preferencias.** Si no lo hace, la interfaz queda en el idioma elegido y los mensajes del servidor llegan en español por defecto.

Los mensajes viven en `src/data/i18n/{es,en,nl}.json`, con **46 claves de primer nivel** —`common`, `auth`, y una por entidad— y paridad exacta garantizada por `npm run i18n:check`. Son una buena base para las claves del frontend, pero no se comparten: el cliente tiene sus propios textos de interfaz.

---

## 7. Ciclo de vida de las filas

Toda tabla lleva `isActive`, `deletedAt`, `sysDetails` (JSONB) y `appDetails` (JSONB array).

- **`DELETE /:id`** — borrado lógico: `isActive: false` + `deletedAt`. Típicamente ADMIN.
- **`PATCH /activate/:id`** — lo revierte. Típicamente SUPERADMIN.
- **Borrado físico** — sólo existe (`005C`) donde el trigger `preventPhysicalDelete` no protege la tabla. La mayoría de entidades no lo exponen.

**Auditoría:** cada creación, actualización o activación añade una entrada al array `appDetails` de la fila:

```json
{ "createdAt": "…", "user": "<userId>", "method": "ESAVI-CASE-004", "detail": "…" }
```

El componente `<AuditTrail>` lee ese array. Está en todas las entidades.

---

## 8. Update diferencial

**Norma vinculante** (`CONVENTIONS.md` §11, helper `buildDifferentialUpdate`).

La escritura la dispara el **cambio real del valor**, nunca la presencia de la clave en el body. Sin diferencias no hay `UPDATE`, ni `updatedAt`, ni entrada en `appDetails`, ni evento en `sysDetails`.

Consecuencias para el cliente:

- **Se puede enviar el objeto completo en un `PUT`** sin ensuciar el historial. Volver a un paso del wizard y no cambiar nada no escribe nada.
- **No hace falta calcular el diff en el cliente.** El backend lo hace, y lo hace mejor porque compara contra el valor real de la fila, no contra lo que el cliente cree que había.
- Un `PUT` que no cambia nada devuelve `200`, no error.

Las escrituras que **no** son diferenciales —activaciones, traslados, asignaciones masivas— están declaradas una a una en sus specs.

---

## 9. Normalización en escritura

El backend normaliza al escribir, y el cliente debe saberlo para no sorprenderse cuando lo que envía vuelve distinto:

- Los campos `code` se pasan a `CONSTANT_CASE` con `toConstantCase`.
- Los campos `name` se pasan a `Title Case` con `toTitleCase`.
- Las comprobaciones de unicidad se hacen contra el **valor normalizado**.

**Excepción declarada:** `catalogType` y `catalogItem` llevan el `code` en camelCase. Ahí `code` es **opcional en el body**: si viaja se normaliza con `toCodeFromInput` (idempotente sobre un camelCase ya correcto), y sólo si falta se acuña desde el `name` con `toCodeFromName`. En el update se escribe exactamente cuando viaja y **nunca se re-acuña** desde un `name` renombrado.

---

## 10. Cifrado de datos personales

En `appUser` están cifrados `email`, `username`, `firstName`, `lastName` y `displayName`. En `evaluationInstitution`, `personName` y `personContact`. En `investigationClinicalEvaluation`, `clinicalDetailsPersonName`.

El cifrado es determinista (AES con IV fijo), de modo que las búsquedas por igualdad funcionan. **El backend descifra antes de responder**, así que el cliente siempre recibe texto claro y no tiene que hacer nada — salvo tenerlo presente al pensar en búsquedas parciales, que sobre una columna cifrada no funcionan.

---

## 11. Endpoints que no son CRUD

Conviene conocerlos porque cambian la forma de la pantalla:

| Endpoint | Qué hace |
|---|---|
| `GET /api/case-workflows/case/:id` (`CASEFLOW-006`) | Devuelve el estado del expediente **y `exists` + `id` por cada satélite**. Es lo que permite retomar un caso: dice si cada etapa se crea con `POST` o se actualiza con `PUT /:id` |
| `PATCH …/complete-stage`, `…/close`, `…/reopen`, `…/request-validation`, `…/resolve-validation` | Transiciones del flujo del expediente (`007` a `011`) |
| `POST /api/catalog-items/import` (`CATITEM-006`) | Importación masiva desde `.xlsx` (SUPERADMIN) |
| `POST /api/diagnostic-terms/import` (`DIAGTERM-007`), `POST /api/whodrug-vaccines/import` (`WHODRUG-007`) | Lo mismo para sus catálogos |
| `POST /api/geo-locations/import` (`GEOLOC-006`, SUPERADMIN) · `GET /api/geo-locations/import/template` (`GEOLOC-007`, ADMIN) | Carga masiva de geografía **y establecimientos** en un solo libro, y la plantilla que la alimenta (SPEC F53) |
| `GET /api/whodrug-vaccines/{abbreviations,drug-names,ma-holders,forms,strengths}` (`WHODRUG-006A`…`006E`) | Los cinco niveles del árbol WHODrug (SPEC F54) |
| `GET /api/meddra/search` (`MEDDRA-006`) | Proxy de sólo lectura contra el API oficial de MedDRA (SPEC F55) |
| `GET /api/system-configs/code/:code` (`SYSCONF-006`) · `POST /api/system-configs/sync` (`SYSCONF-008`, SUPERADMIN) | Leer una configuración por `(code, scope)` y sembrar las que falten |

Las importaciones usan `multipart/form-data` y `exceljs` en el backend; el cliente sube el archivo tal cual y recibe un informe con contadores y filas rechazadas. Todas admiten `dryRun`.

### 11.1 La única respuesta que no lleva envelope

`GET /api/geo-locations/import/template` (`GEOLOC-007`) responde un **binario `.xlsx` con `Content-Disposition`**, no `{ ok, message, data }`. Es una excepción declarada del contrato (backend `CONVENTIONS.md` §10). Sus **errores sí** salen por `errorHandler` con el sobre habitual, y ahí está la trampa: con `responseType: 'blob'` un `409` también llega como `Blob`, así que hay que leerlo y parsearlo antes de construir el `EsaviApiError` — sin eso el `code` se pierde justo donde está el detalle accionable.

### 11.2 El árbol WHODrug (`006A` a `006E`)

Cinco lecturas encadenadas: `abbreviation → drugName → maHolders → formTranslations → strength`. Cada nivel **exige el valor de su padre inmediato** y admite los ancestros superiores como acotación opcional; todos aceptan `country`, `language` y `search` (mínimo 2). **Sin paginación**: cada nivel devuelve su lista completa.

```ts
{ count: number;   // opciones distintas de este nivel
  total: number;   // filas del diccionario bajo el subconjunto
  options: Array<{
    value: string | null;         // null es una opción navegable de pleno derecho
    matchCount: number;           // cuántas filas cuelgan de ESTA opción
    vaccineWhodrugId: string | null;  // resuelto cuando matchCount === 1
  }>;
}
```

Las dos consecuencias para la interfaz: **el selector deja de desplegar niveles en cuanto `matchCount === 1`** —ahí ya está la vacuna, con su `vaccineWhodrugId`—, y una opción con `value: null` se reenvía al nivel siguiente como el centinela literal `__NULL__`, no como cadena vacía ni omitiendo el parámetro.

### 11.3 MedDRA (`MEDDRA-006`)

`GET /api/meddra/search?term=<texto>`, rol `USER`, **`term` de 3 a 200 caracteres** y único parámetro: versión, idioma y niveles del diccionario salen de `systemConfig` y no se abren al cliente. Devuelve `{ count, rows }` con filas de exactamente tres claves —`code`, `name`, `termGroup` (`LLT|PT|HLT|HLGT|SOC`)— que es ya la forma que consumen `esaviCode` y `esaviName` de `notificationEvent`.

Sin coincidencias es **`200` con `{ count: 0, rows: [] }`**, nunca `404`. El backend cachea 5 minutos por término e idioma, y la ruta lleva limitador propio (60 peticiones por IP cada 15 minutos): **un autocompletado sin debounce lo agota**.

Es un servicio externo de pago y sus fallos no son los del resto de la API — hay que distinguirlos en la interfaz, porque ninguno es culpa de lo que el usuario escribió:

| `code` | Status | Qué mostrar |
|---|---|---|
| `MEDDRA_006_DISABLED` | `503` | La búsqueda MedDRA está apagada en esta instalación — ocultar el campo, no ofrecer reintento |
| `MEDDRA_006_NOT_CONFIGURED` | `503` | Falta configurar credenciales; es tarea de un SUPERADMIN |
| `MEDDRA_006_INVALID_SEARCH_CONFIG` | `503` | Configuración inválida (ningún nivel activo) |
| `MEDDRA_006_AUTH_FAILED` | `502` | El API externo rechazó las credenciales |
| `MEDDRA_006_TIMEOUT` | `504` | El API externo no respondió en 10 s — reintentar sí tiene sentido |
| `MEDDRA_006_SEARCH_FAILED` | `500` | Fallo genérico |

El endpoint **no escribe nada**. Persistir el término elegido es otra llamada: `ESAVI-DIAGTERM-006` o los campos `esaviCode`/`esaviName` de `ESAVI-NOTIFEVT-001`.

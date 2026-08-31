# Contrato de la API

> **Fuentes:** `esavi-backend/src/app.ts`, `src/middlewares/`, `src/services/auth.service.ts`, `src/helpers/`, `references/CONVENTIONS.md`, `.env.example`
> **Fecha:** 2026-08-31

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
| `POST /api/catalog-items/import` | Importación masiva desde `.xlsx` (SUPERADMIN) |
| `POST /api/diagnostic-terms/import`, `POST /api/whodrug-vaccines/import` | Lo mismo para sus catálogos |

Las importaciones usan `multipart/form-data` y `exceljs` en el backend; el cliente sube el archivo tal cual.

# Inventario de rutas del backend

> **Fuente:** `esavi-backend/tests/auth/roles.test.ts` → `ROUTE_RULES`
> **Generado:** 2026-09-01 · **324 rutas** en **42 grupos**
> **Regenerar:** ver `README.md` de este directorio

`ROUTE_RULES` es la matriz canónica de la §9 de `CONVENTIONS.md`, y el backend la
usa como test: **una ruta que no aparece aquí no está protegida por la suite**. Es,
por tanto, la lista autoritativa de lo que el frontend puede consumir.

## Cómo leer la columna «Rol mínimo»

`validateUserRole(X)` significa **nivel >= nivel(X)**, no igualdad:

| Rol | Nivel |
|---|---|
| `SUPERADMIN` | 100 |
| `ADMIN` | 50 |
| `USER` | 25 |
| `ANALYTICS` | 10 |

Una ruta con rol mínimo `USER` admite también a `ADMIN` y `SUPERADMIN`. Replicar
esta tabla en el cliente es lo que permite `useCan()` y `<RequireRole>`.

## Rutas sin fila en esta tabla

Cuatro endpoints de autenticación no aparecen porque **no exigen rol alguno**, y es
deliberado:

| Ruta | Por qué es abierta |
|---|---|
| `POST /api/auth/login` | Nunca tuvo rol: es la puerta de entrada |
| `POST /api/auth/refresh` | El access token está normalmente caducado justo cuando se necesita. La credencial es el refresh token del body, verificado contra `appSession` |
| `POST /api/auth/logout` | Misma razón: exigir un access token válido para cerrar sesión deja fuera a quien más lo necesita |
| `POST /api/auth/forgot-password` | Quien la llama no puede autenticarse — ese es el problema que resuelve. Lleva limitador propio: 5 peticiones por IP cada 15 minutos |
| `POST /api/auth/reset-password` | La credencial es el token de reseteo del body, verificado contra `appPasswordReset` |

`POST /api/auth/logout-all` **sí** exige `tokenValidation`, porque revocar todas las
sesiones de una cuenta exige identidad probada.

## Convenciones de las operaciones

| Código | Significado |
|---|---|
| `001` | Crear |
| `002` | Listar — `002A` sólo activos, `002B` incluye inactivos (rol superior) |
| `003` | Obtener por id |
| `004` | Actualizar (**diferencial**: sin cambio real de valor no hay escritura) |
| `005A` | Desactivar — `isActive: false` + `deletedAt` |
| `005B` | Reactivar |
| `005C` | Borrado físico — sólo donde el trigger `preventPhysicalDelete` no lo bloquea |
| `006`+ | Operaciones no canónicas: importaciones, búsquedas, transiciones de flujo |

---

## Rutas por entidad

### APPROLE

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/roles` | ADMIN | `ESAVI-APPROLE-001` |
| `GET` | `/api/roles` | USER | `ESAVI-APPROLE-002A` |
| `GET` | `/api/roles/admin` | ADMIN | `ESAVI-APPROLE-002B` |
| `GET` | `/api/roles/:id` | USER | `ESAVI-APPROLE-003` |
| `PUT` | `/api/roles/:id` | ADMIN | `ESAVI-APPROLE-004` |
| `DELETE` | `/api/roles/:id` | ADMIN | `ESAVI-APPROLE-005A` |
| `PATCH` | `/api/roles/activate/:id` | SUPERADMIN | `ESAVI-APPROLE-005B` |

### AUTH

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/auth/logout-all` | USER | `ESAVI-AUTH-004` |

### CASE

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/esavi-cases` | USER | `ESAVI-CASE-001` |
| `GET` | `/api/esavi-cases` | USER | `ESAVI-CASE-002A` |
| `GET` | `/api/esavi-cases/admin` | ADMIN | `ESAVI-CASE-002B` |
| `GET` | `/api/esavi-cases/:id` | USER | `ESAVI-CASE-003` |
| `PUT` | `/api/esavi-cases/:id` | USER | `ESAVI-CASE-004` |
| `DELETE` | `/api/esavi-cases/:id` | ADMIN | `ESAVI-CASE-005A` |
| `PATCH` | `/api/esavi-cases/activate/:id` | SUPERADMIN | `ESAVI-CASE-005B` |

### CASEFLOW

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `GET` | `/api/case-workflows` | USER | `ESAVI-CASEFLOW-002A` |
| `GET` | `/api/case-workflows/admin` | ADMIN | `ESAVI-CASEFLOW-002B` |
| `PATCH` | `/api/case-workflows/activate/:id` | SUPERADMIN | `ESAVI-CASEFLOW-005B` |
| `GET` | `/api/case-workflows/case/:id` | USER | `ESAVI-CASEFLOW-006` |
| `PATCH` | `/api/case-workflows/case/:id/complete-stage` | USER | `ESAVI-CASEFLOW-007` |
| `PATCH` | `/api/case-workflows/case/:id/close` | USER | `ESAVI-CASEFLOW-008` |
| `PATCH` | `/api/case-workflows/case/:id/reopen` | ADMIN | `ESAVI-CASEFLOW-009` |
| `PATCH` | `/api/case-workflows/case/:id/request-validation` | USER | `ESAVI-CASEFLOW-010` |
| `PATCH` | `/api/case-workflows/case/:id/resolve-validation` | USER | `ESAVI-CASEFLOW-011` |
| `GET` | `/api/case-workflows/:id` | USER | `ESAVI-CASEFLOW-003` |
| `DELETE` | `/api/case-workflows/:id` | ADMIN | `ESAVI-CASEFLOW-005A` |

### CATITEM

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/catalog-items` | ADMIN | `ESAVI-CATITEM-001` |
| `GET` | `/api/catalog-items/type/:id` | USER | `ESAVI-CATITEM-002A` |
| `GET` | `/api/catalog-items/admin/type/:id` | ADMIN | `ESAVI-CATITEM-002B` |
| `GET` | `/api/catalog-items/:id` | USER | `ESAVI-CATITEM-003` |
| `PUT` | `/api/catalog-items/:id` | ADMIN | `ESAVI-CATITEM-004` |
| `DELETE` | `/api/catalog-items/:id` | ADMIN | `ESAVI-CATITEM-005A` |
| `PATCH` | `/api/catalog-items/activate/:id` | SUPERADMIN | `ESAVI-CATITEM-005B` |
| `POST` | `/api/catalog-items/import` | SUPERADMIN | `ESAVI-CATITEM-006` |

### CATTYPE

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/catalog-types` | ADMIN | `ESAVI-CATTYPE-001` |
| `GET` | `/api/catalog-types` | USER | `ESAVI-CATTYPE-002` |
| `GET` | `/api/catalog-types/:id` | USER | `ESAVI-CATTYPE-003` |
| `PUT` | `/api/catalog-types/:id` | ADMIN | `ESAVI-CATTYPE-004` |
| `DELETE` | `/api/catalog-types/:id` | ADMIN | `ESAVI-CATTYPE-005A` |
| `PATCH` | `/api/catalog-types/activate/:id` | SUPERADMIN | `ESAVI-CATTYPE-005B` |

### CLASSIF

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/classifications` | USER | `ESAVI-CLASSIF-001` |
| `GET` | `/api/classifications` | USER | `ESAVI-CLASSIF-002A` |
| `GET` | `/api/classifications/admin` | ADMIN | `ESAVI-CLASSIF-002B` |
| `GET` | `/api/classifications/case/:id` | USER | `ESAVI-CLASSIF-006` |
| `GET` | `/api/classifications/:id` | USER | `ESAVI-CLASSIF-003` |
| `PUT` | `/api/classifications/:id` | USER | `ESAVI-CLASSIF-004` |
| `DELETE` | `/api/classifications/:id` | ADMIN | `ESAVI-CLASSIF-005A` |
| `PATCH` | `/api/classifications/activate/:id` | SUPERADMIN | `ESAVI-CLASSIF-005B` |
| `DELETE` | `/api/classifications/purge/:id` | SUPERADMIN | `ESAVI-CLASSIF-005C` |

### DIAGTERM

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/diagnostic-terms` | ADMIN | `ESAVI-DIAGTERM-001` |
| `GET` | `/api/diagnostic-terms` | USER | `ESAVI-DIAGTERM-002A` |
| `GET` | `/api/diagnostic-terms/admin` | ADMIN | `ESAVI-DIAGTERM-002B` |
| `GET` | `/api/diagnostic-terms/:id` | USER | `ESAVI-DIAGTERM-003` |
| `PUT` | `/api/diagnostic-terms/:id` | ADMIN | `ESAVI-DIAGTERM-004` |
| `DELETE` | `/api/diagnostic-terms/:id` | ADMIN | `ESAVI-DIAGTERM-005A` |
| `PATCH` | `/api/diagnostic-terms/activate/:id` | SUPERADMIN | `ESAVI-DIAGTERM-005B` |
| `POST` | `/api/diagnostic-terms/import` | SUPERADMIN | `ESAVI-DIAGTERM-007` |

### DILUENT

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/diluents` | ADMIN | `ESAVI-DILUENT-001` |
| `GET` | `/api/diluents` | USER | `ESAVI-DILUENT-002A` |
| `GET` | `/api/diluents/admin` | ADMIN | `ESAVI-DILUENT-002B` |
| `GET` | `/api/diluents/:id` | USER | `ESAVI-DILUENT-003` |
| `PUT` | `/api/diluents/:id` | ADMIN | `ESAVI-DILUENT-004` |
| `DELETE` | `/api/diluents/:id` | ADMIN | `ESAVI-DILUENT-005A` |
| `PATCH` | `/api/diluents/activate/:id` | SUPERADMIN | `ESAVI-DILUENT-005B` |

### EVALINST

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/evaluation-institutions` | USER | `ESAVI-EVALINST-001` |
| `GET` | `/api/evaluation-institutions/admin/investigation/:id` | ADMIN | `ESAVI-EVALINST-002B` |
| `GET` | `/api/evaluation-institutions/investigation/:id` | USER | `ESAVI-EVALINST-002A` |
| `DELETE` | `/api/evaluation-institutions/purge/:id` | SUPERADMIN | `ESAVI-EVALINST-005C` |
| `PATCH` | `/api/evaluation-institutions/activate/:id` | ADMIN | `ESAVI-EVALINST-005B` |
| `GET` | `/api/evaluation-institutions/:id` | USER | `ESAVI-EVALINST-003` |
| `PUT` | `/api/evaluation-institutions/:id` | USER | `ESAVI-EVALINST-004` |
| `DELETE` | `/api/evaluation-institutions/:id` | ADMIN | `ESAVI-EVALINST-005A` |

### FINCLASS

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/final-classifications` | USER | `ESAVI-FINCLASS-001` |
| `GET` | `/api/final-classifications` | USER | `ESAVI-FINCLASS-002A` |
| `GET` | `/api/final-classifications/admin` | ADMIN | `ESAVI-FINCLASS-002B` |
| `PATCH` | `/api/final-classifications/activate/:id` | SUPERADMIN | `ESAVI-FINCLASS-005B` |
| `DELETE` | `/api/final-classifications/purge/:id` | SUPERADMIN | `ESAVI-FINCLASS-005C` |
| `GET` | `/api/final-classifications/case/:id` | USER | `ESAVI-FINCLASS-006` |
| `GET` | `/api/final-classifications/:id` | USER | `ESAVI-FINCLASS-003` |
| `PUT` | `/api/final-classifications/:id` | USER | `ESAVI-FINCLASS-004` |
| `DELETE` | `/api/final-classifications/:id` | ADMIN | `ESAVI-FINCLASS-005A` |

### GEOLOC

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/geo-locations` | ADMIN | `ESAVI-GEOLOC-001` |
| `GET` | `/api/geo-locations` | USER | `ESAVI-GEOLOC-002` |
| `GET` | `/api/geo-locations/:id` | USER | `ESAVI-GEOLOC-003` |
| `PUT` | `/api/geo-locations/:id` | ADMIN | `ESAVI-GEOLOC-004` |
| `DELETE` | `/api/geo-locations/:id` | ADMIN | `ESAVI-GEOLOC-005A` |
| `PATCH` | `/api/geo-locations/activate/:id` | SUPERADMIN | `ESAVI-GEOLOC-005B` |

### GEOLVL

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/geo-level-types` | ADMIN | `ESAVI-GEOLVL-001` |
| `GET` | `/api/geo-level-types` | USER | `ESAVI-GEOLVL-002` |
| `GET` | `/api/geo-level-types/:id` | USER | `ESAVI-GEOLVL-003` |
| `PUT` | `/api/geo-level-types/:id` | ADMIN | `ESAVI-GEOLVL-004` |
| `DELETE` | `/api/geo-level-types/:id` | ADMIN | `ESAVI-GEOLVL-005A` |
| `PATCH` | `/api/geo-level-types/activate/:id` | SUPERADMIN | `ESAVI-GEOLVL-005B` |

### HFAC

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/health-facilities` | ADMIN | `ESAVI-HFAC-001` |
| `GET` | `/api/health-facilities/location/:id` | USER | `ESAVI-HFAC-002A` |
| `GET` | `/api/health-facilities/admin/location/:id` | ADMIN | `ESAVI-HFAC-002B` |
| `GET` | `/api/health-facilities/search` | USER | `ESAVI-HFAC-006` |
| `GET` | `/api/health-facilities/:id` | USER | `ESAVI-HFAC-003` |
| `PUT` | `/api/health-facilities/:id` | ADMIN | `ESAVI-HFAC-004` |
| `DELETE` | `/api/health-facilities/:id` | ADMIN | `ESAVI-HFAC-005A` |
| `PATCH` | `/api/health-facilities/activate/:id` | SUPERADMIN | `ESAVI-HFAC-005B` |

### INVADMER

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-administration-errors` | USER | `ESAVI-INVADMER-001` |
| `GET` | `/api/investigation-administration-errors` | USER | `ESAVI-INVADMER-002A` |
| `GET` | `/api/investigation-administration-errors/admin` | ADMIN | `ESAVI-INVADMER-002B` |
| `DELETE` | `/api/investigation-administration-errors/purge/:id` | SUPERADMIN | `ESAVI-INVADMER-005C` |
| `GET` | `/api/investigation-administration-errors/case/:id` | USER | `ESAVI-INVADMER-006` |
| `GET` | `/api/investigation-administration-errors/:id` | USER | `ESAVI-INVADMER-003` |
| `PUT` | `/api/investigation-administration-errors/:id` | USER | `ESAVI-INVADMER-004` |

### INVAUT

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-autopsies` | USER | `ESAVI-INVAUT-001` |
| `GET` | `/api/investigation-autopsies` | USER | `ESAVI-INVAUT-002A` |
| `GET` | `/api/investigation-autopsies/admin` | ADMIN | `ESAVI-INVAUT-002B` |
| `GET` | `/api/investigation-autopsies/case/:id` | USER | `ESAVI-INVAUT-006` |
| `GET` | `/api/investigation-autopsies/:id` | USER | `ESAVI-INVAUT-003` |
| `PUT` | `/api/investigation-autopsies/:id` | USER | `ESAVI-INVAUT-004` |
| `DELETE` | `/api/investigation-autopsies/purge/:id` | SUPERADMIN | `ESAVI-INVAUT-005C` |

### INVCLIEV

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-clinical-evaluations` | USER | `ESAVI-INVCLIEV-001` |
| `GET` | `/api/investigation-clinical-evaluations` | USER | `ESAVI-INVCLIEV-002A` |
| `GET` | `/api/investigation-clinical-evaluations/admin` | ADMIN | `ESAVI-INVCLIEV-002B` |
| `DELETE` | `/api/investigation-clinical-evaluations/purge/:id` | SUPERADMIN | `ESAVI-INVCLIEV-005C` |
| `GET` | `/api/investigation-clinical-evaluations/case/:id` | USER | `ESAVI-INVCLIEV-006` |
| `GET` | `/api/investigation-clinical-evaluations/:id` | USER | `ESAVI-INVCLIEV-003` |
| `PUT` | `/api/investigation-clinical-evaluations/:id` | USER | `ESAVI-INVCLIEV-004` |

### INVCOLD

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-cold-chains` | USER | `ESAVI-INVCOLD-001` |
| `GET` | `/api/investigation-cold-chains` | USER | `ESAVI-INVCOLD-002A` |
| `GET` | `/api/investigation-cold-chains/admin` | ADMIN | `ESAVI-INVCOLD-002B` |
| `DELETE` | `/api/investigation-cold-chains/purge/:id` | SUPERADMIN | `ESAVI-INVCOLD-005C` |
| `GET` | `/api/investigation-cold-chains/case/:id` | USER | `ESAVI-INVCOLD-006` |
| `GET` | `/api/investigation-cold-chains/:id` | USER | `ESAVI-INVCOLD-003` |
| `PUT` | `/api/investigation-cold-chains/:id` | USER | `ESAVI-INVCOLD-004` |

### INVCOMM

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-communities` | USER | `ESAVI-INVCOMM-001` |
| `GET` | `/api/investigation-communities` | USER | `ESAVI-INVCOMM-002A` |
| `GET` | `/api/investigation-communities/admin` | ADMIN | `ESAVI-INVCOMM-002B` |
| `DELETE` | `/api/investigation-communities/purge/:id` | SUPERADMIN | `ESAVI-INVCOMM-005C` |
| `GET` | `/api/investigation-communities/case/:id` | USER | `ESAVI-INVCOMM-006` |
| `GET` | `/api/investigation-communities/:id` | USER | `ESAVI-INVCOMM-003` |
| `PUT` | `/api/investigation-communities/:id` | USER | `ESAVI-INVCOMM-004` |

### INVESTGN

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigations` | USER | `ESAVI-INVESTGN-001` |
| `GET` | `/api/investigations` | USER | `ESAVI-INVESTGN-002A` |
| `GET` | `/api/investigations/admin` | ADMIN | `ESAVI-INVESTGN-002B` |
| `GET` | `/api/investigations/case/:id` | USER | `ESAVI-INVESTGN-006` |
| `GET` | `/api/investigations/:id` | USER | `ESAVI-INVESTGN-003` |
| `PUT` | `/api/investigations/:id` | USER | `ESAVI-INVESTGN-004` |
| `DELETE` | `/api/investigations/:id` | ADMIN | `ESAVI-INVESTGN-005A` |
| `PATCH` | `/api/investigations/activate/:id` | SUPERADMIN | `ESAVI-INVESTGN-005B` |
| `DELETE` | `/api/investigations/purge/:id` | SUPERADMIN | `ESAVI-INVESTGN-005C` |

### INVMEDH

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-medical-histories` | USER | `ESAVI-INVMEDH-001` |
| `GET` | `/api/investigation-medical-histories` | USER | `ESAVI-INVMEDH-002A` |
| `GET` | `/api/investigation-medical-histories/admin` | ADMIN | `ESAVI-INVMEDH-002B` |
| `DELETE` | `/api/investigation-medical-histories/purge/:id` | SUPERADMIN | `ESAVI-INVMEDH-005C` |
| `GET` | `/api/investigation-medical-histories/case/:id` | USER | `ESAVI-INVMEDH-006` |
| `GET` | `/api/investigation-medical-histories/:id` | USER | `ESAVI-INVMEDH-003` |
| `PUT` | `/api/investigation-medical-histories/:id` | USER | `ESAVI-INVMEDH-004` |

### INVPREG

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-pregnancy-conditions` | USER | `ESAVI-INVPREG-001` |
| `GET` | `/api/investigation-pregnancy-conditions/admin/investigation/:id` | ADMIN | `ESAVI-INVPREG-002B` |
| `GET` | `/api/investigation-pregnancy-conditions/investigation/:id` | USER | `ESAVI-INVPREG-002A` |
| `DELETE` | `/api/investigation-pregnancy-conditions/purge/:id` | SUPERADMIN | `ESAVI-INVPREG-005C` |
| `PATCH` | `/api/investigation-pregnancy-conditions/activate/:id` | ADMIN | `ESAVI-INVPREG-005B` |
| `GET` | `/api/investigation-pregnancy-conditions/:id` | USER | `ESAVI-INVPREG-003` |
| `PUT` | `/api/investigation-pregnancy-conditions/:id` | USER | `ESAVI-INVPREG-004` |
| `DELETE` | `/api/investigation-pregnancy-conditions/:id` | ADMIN | `ESAVI-INVPREG-005A` |

### INVSRC

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-sources` | USER | `ESAVI-INVSRC-001` |
| `GET` | `/api/investigation-sources` | USER | `ESAVI-INVSRC-002A` |
| `GET` | `/api/investigation-sources/admin` | ADMIN | `ESAVI-INVSRC-002B` |
| `GET` | `/api/investigation-sources/case/:id` | USER | `ESAVI-INVSRC-006` |
| `GET` | `/api/investigation-sources/:id` | USER | `ESAVI-INVSRC-003` |
| `PUT` | `/api/investigation-sources/:id` | USER | `ESAVI-INVSRC-004` |
| `DELETE` | `/api/investigation-sources/purge/:id` | SUPERADMIN | `ESAVI-INVSRC-005C` |

### INVTEAM

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-team-members` | USER | `ESAVI-INVTEAM-001` |
| `GET` | `/api/investigation-team-members/admin/investigation/:id` | ADMIN | `ESAVI-INVTEAM-002B` |
| `GET` | `/api/investigation-team-members/investigation/:id` | USER | `ESAVI-INVTEAM-002A` |
| `GET` | `/api/investigation-team-members/case/:id` | USER | `ESAVI-INVTEAM-006` |
| `DELETE` | `/api/investigation-team-members/purge/:id` | SUPERADMIN | `ESAVI-INVTEAM-005C` |
| `PATCH` | `/api/investigation-team-members/activate/:id` | ADMIN | `ESAVI-INVTEAM-005B` |
| `GET` | `/api/investigation-team-members/:id` | USER | `ESAVI-INVTEAM-003` |
| `PUT` | `/api/investigation-team-members/:id` | USER | `ESAVI-INVTEAM-004` |
| `DELETE` | `/api/investigation-team-members/:id` | ADMIN | `ESAVI-INVTEAM-005A` |

### INVVACAD

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-vaccines-administered` | USER | `ESAVI-INVVACAD-001` |
| `GET` | `/api/investigation-vaccines-administered/admin/investigation/:id` | ADMIN | `ESAVI-INVVACAD-002B` |
| `GET` | `/api/investigation-vaccines-administered/investigation/:id` | USER | `ESAVI-INVVACAD-002A` |
| `GET` | `/api/investigation-vaccines-administered/case/:id` | USER | `ESAVI-INVVACAD-006` |
| `DELETE` | `/api/investigation-vaccines-administered/purge/:id` | SUPERADMIN | `ESAVI-INVVACAD-005C` |
| `PATCH` | `/api/investigation-vaccines-administered/activate/:id` | ADMIN | `ESAVI-INVVACAD-005B` |
| `GET` | `/api/investigation-vaccines-administered/:id` | USER | `ESAVI-INVVACAD-003` |
| `PUT` | `/api/investigation-vaccines-administered/:id` | USER | `ESAVI-INVVACAD-004` |
| `DELETE` | `/api/investigation-vaccines-administered/:id` | ADMIN | `ESAVI-INVVACAD-005A` |

### INVVACTX

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/investigation-vaccination-contexts` | USER | `ESAVI-INVVACTX-001` |
| `GET` | `/api/investigation-vaccination-contexts` | USER | `ESAVI-INVVACTX-002A` |
| `GET` | `/api/investigation-vaccination-contexts/admin` | ADMIN | `ESAVI-INVVACTX-002B` |
| `DELETE` | `/api/investigation-vaccination-contexts/purge/:id` | SUPERADMIN | `ESAVI-INVVACTX-005C` |
| `GET` | `/api/investigation-vaccination-contexts/case/:id` | USER | `ESAVI-INVVACTX-006` |
| `GET` | `/api/investigation-vaccination-contexts/:id` | USER | `ESAVI-INVVACTX-003` |
| `PUT` | `/api/investigation-vaccination-contexts/:id` | USER | `ESAVI-INVVACTX-004` |

### NOTIFCN

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notifications` | USER | `ESAVI-NOTIFCN-001` |
| `GET` | `/api/notifications` | USER | `ESAVI-NOTIFCN-002A` |
| `GET` | `/api/notifications/admin` | ADMIN | `ESAVI-NOTIFCN-002B` |
| `GET` | `/api/notifications/case/:id` | USER | `ESAVI-NOTIFCN-006` |
| `GET` | `/api/notifications/:id` | USER | `ESAVI-NOTIFCN-003` |
| `PUT` | `/api/notifications/:id` | USER | `ESAVI-NOTIFCN-004` |
| `DELETE` | `/api/notifications/:id` | ADMIN | `ESAVI-NOTIFCN-005A` |
| `PATCH` | `/api/notifications/activate/:id` | SUPERADMIN | `ESAVI-NOTIFCN-005B` |
| `DELETE` | `/api/notifications/purge/:id` | SUPERADMIN | `ESAVI-NOTIFCN-005C` |

### NOTIFDIL

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notification-diluents` | ADMIN | `ESAVI-NOTIFDIL-001` |
| `GET` | `/api/notification-diluents/admin/vaccine/:id` | ADMIN | `ESAVI-NOTIFDIL-002B` |
| `GET` | `/api/notification-diluents/vaccine/:id` | USER | `ESAVI-NOTIFDIL-002A` |
| `DELETE` | `/api/notification-diluents/purge/:id` | SUPERADMIN | `ESAVI-NOTIFDIL-005C` |
| `PATCH` | `/api/notification-diluents/activate/:id` | SUPERADMIN | `ESAVI-NOTIFDIL-005B` |
| `GET` | `/api/notification-diluents/:id` | USER | `ESAVI-NOTIFDIL-003` |
| `PUT` | `/api/notification-diluents/:id` | ADMIN | `ESAVI-NOTIFDIL-004` |
| `DELETE` | `/api/notification-diluents/:id` | ADMIN | `ESAVI-NOTIFDIL-005A` |

### NOTIFEVT

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notification-events` | ADMIN | `ESAVI-NOTIFEVT-001` |
| `GET` | `/api/notification-events/case/:id` | USER | `ESAVI-NOTIFEVT-006` |
| `GET` | `/api/notification-events/admin/notification/:id` | ADMIN | `ESAVI-NOTIFEVT-002B` |
| `GET` | `/api/notification-events/notification/:id` | USER | `ESAVI-NOTIFEVT-002A` |
| `DELETE` | `/api/notification-events/purge/:id` | SUPERADMIN | `ESAVI-NOTIFEVT-005C` |
| `PATCH` | `/api/notification-events/activate/:id` | SUPERADMIN | `ESAVI-NOTIFEVT-005B` |
| `GET` | `/api/notification-events/:id` | USER | `ESAVI-NOTIFEVT-003` |
| `PUT` | `/api/notification-events/:id` | ADMIN | `ESAVI-NOTIFEVT-004` |
| `DELETE` | `/api/notification-events/:id` | ADMIN | `ESAVI-NOTIFEVT-005A` |

### NOTIFIER

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notifiers` | USER | `ESAVI-NOTIFIER-001` |
| `GET` | `/api/notifiers` | USER | `ESAVI-NOTIFIER-002A` |
| `GET` | `/api/notifiers/admin` | ADMIN | `ESAVI-NOTIFIER-002B` |
| `GET` | `/api/notifiers/:id` | USER | `ESAVI-NOTIFIER-003` |
| `PUT` | `/api/notifiers/:id` | USER | `ESAVI-NOTIFIER-004` |
| `DELETE` | `/api/notifiers/:id` | ADMIN | `ESAVI-NOTIFIER-005A` |
| `PATCH` | `/api/notifiers/activate/:id` | SUPERADMIN | `ESAVI-NOTIFIER-005B` |
| `DELETE` | `/api/notifiers/purge/:id` | SUPERADMIN | `ESAVI-NOTIFIER-005C` |

### NOTIFMED

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notification-medications` | ADMIN | `ESAVI-NOTIFMED-001` |
| `GET` | `/api/notification-medications/case/:id` | USER | `ESAVI-NOTIFMED-006` |
| `GET` | `/api/notification-medications/admin/notification/:id` | ADMIN | `ESAVI-NOTIFMED-002B` |
| `GET` | `/api/notification-medications/notification/:id` | USER | `ESAVI-NOTIFMED-002A` |
| `DELETE` | `/api/notification-medications/purge/:id` | SUPERADMIN | `ESAVI-NOTIFMED-005C` |
| `PATCH` | `/api/notification-medications/activate/:id` | SUPERADMIN | `ESAVI-NOTIFMED-005B` |
| `GET` | `/api/notification-medications/:id` | USER | `ESAVI-NOTIFMED-003` |
| `PUT` | `/api/notification-medications/:id` | ADMIN | `ESAVI-NOTIFMED-004` |
| `DELETE` | `/api/notification-medications/:id` | ADMIN | `ESAVI-NOTIFMED-005A` |

### NOTIFPRG

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notification-pregnancies` | USER | `ESAVI-NOTIFPRG-001` |
| `GET` | `/api/notification-pregnancies/notification/:id` | USER | `ESAVI-NOTIFPRG-006` |
| `DELETE` | `/api/notification-pregnancies/purge/:id` | SUPERADMIN | `ESAVI-NOTIFPRG-005C` |
| `PATCH` | `/api/notification-pregnancies/activate/:id` | SUPERADMIN | `ESAVI-NOTIFPRG-005B` |
| `GET` | `/api/notification-pregnancies/:id` | USER | `ESAVI-NOTIFPRG-003` |
| `PUT` | `/api/notification-pregnancies/:id` | USER | `ESAVI-NOTIFPRG-004` |
| `DELETE` | `/api/notification-pregnancies/:id` | ADMIN | `ESAVI-NOTIFPRG-005A` |

### NOTIFVAC

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notification-vaccines` | ADMIN | `ESAVI-NOTIFVAC-001` |
| `GET` | `/api/notification-vaccines/case/:id` | USER | `ESAVI-NOTIFVAC-006` |
| `GET` | `/api/notification-vaccines/admin/notification/:id` | ADMIN | `ESAVI-NOTIFVAC-002B` |
| `GET` | `/api/notification-vaccines/notification/:id` | USER | `ESAVI-NOTIFVAC-002A` |
| `DELETE` | `/api/notification-vaccines/purge/:id` | SUPERADMIN | `ESAVI-NOTIFVAC-005C` |
| `PATCH` | `/api/notification-vaccines/activate/:id` | SUPERADMIN | `ESAVI-NOTIFVAC-005B` |
| `GET` | `/api/notification-vaccines/:id` | USER | `ESAVI-NOTIFVAC-003` |
| `PUT` | `/api/notification-vaccines/:id` | ADMIN | `ESAVI-NOTIFVAC-004` |
| `DELETE` | `/api/notification-vaccines/:id` | ADMIN | `ESAVI-NOTIFVAC-005A` |

### NSEVNOT

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/non-severe-notifications` | USER | `ESAVI-NSEVNOT-001` |
| `GET` | `/api/non-severe-notifications/case/:id` | USER | `ESAVI-NSEVNOT-006` |
| `DELETE` | `/api/non-severe-notifications/purge/:id` | SUPERADMIN | `ESAVI-NSEVNOT-005C` |
| `GET` | `/api/non-severe-notifications/:id` | USER | `ESAVI-NSEVNOT-003` |
| `PUT` | `/api/non-severe-notifications/:id` | USER | `ESAVI-NSEVNOT-004` |

### PATIENT

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/patients` | USER | `ESAVI-PATIENT-001` |
| `GET` | `/api/patients` | USER | `ESAVI-PATIENT-002A` |
| `GET` | `/api/patients/admin` | ADMIN | `ESAVI-PATIENT-002B` |
| `GET` | `/api/patients/search/:id` | USER | `ESAVI-PATIENT-006` |
| `GET` | `/api/patients/search-by-name?name=A` | USER | `ESAVI-PATIENT-007` |
| `GET` | `/api/patients/:id` | USER | `ESAVI-PATIENT-003` |
| `PUT` | `/api/patients/:id` | USER | `ESAVI-PATIENT-004` |
| `DELETE` | `/api/patients/:id` | ADMIN | `ESAVI-PATIENT-005A` |
| `PATCH` | `/api/patients/activate/:id` | SUPERADMIN | `ESAVI-PATIENT-005B` |

### PREGCOMP

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/notification-pregnancy-complications` | USER | `ESAVI-PREGCOMP-001` |
| `GET` | `/api/notification-pregnancy-complications/admin/pregnancy/:id` | ADMIN | `ESAVI-PREGCOMP-002B` |
| `GET` | `/api/notification-pregnancy-complications/pregnancy/:id` | USER | `ESAVI-PREGCOMP-002A` |
| `DELETE` | `/api/notification-pregnancy-complications/purge/:id` | SUPERADMIN | `ESAVI-PREGCOMP-005C` |
| `PATCH` | `/api/notification-pregnancy-complications/activate/:id` | SUPERADMIN | `ESAVI-PREGCOMP-005B` |
| `GET` | `/api/notification-pregnancy-complications/:id` | USER | `ESAVI-PREGCOMP-003` |
| `PUT` | `/api/notification-pregnancy-complications/:id` | USER | `ESAVI-PREGCOMP-004` |
| `DELETE` | `/api/notification-pregnancy-complications/:id` | ADMIN | `ESAVI-PREGCOMP-005A` |

### SEVNOT

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/severe-notifications` | USER | `ESAVI-SEVNOT-001` |
| `GET` | `/api/severe-notifications/case/:id` | USER | `ESAVI-SEVNOT-006` |
| `DELETE` | `/api/severe-notifications/purge/:id` | SUPERADMIN | `ESAVI-SEVNOT-005C` |
| `GET` | `/api/severe-notifications/:id` | USER | `ESAVI-SEVNOT-003` |
| `PUT` | `/api/severe-notifications/:id` | USER | `ESAVI-SEVNOT-004` |

### SYSCONF

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/system-configs` | SUPERADMIN | `ESAVI-SYSCONF-001` |
| `GET` | `/api/system-configs` | USER | `ESAVI-SYSCONF-002A` |
| `GET` | `/api/system-configs/admin` | ADMIN | `ESAVI-SYSCONF-002B` |
| `GET` | `/api/system-configs/code/ESAVI_APP_DEFAULT_LIMIT` | USER | `ESAVI-SYSCONF-006` |
| `POST` | `/api/system-configs/sync` | SUPERADMIN | `ESAVI-SYSCONF-008` |
| `PATCH` | `/api/system-configs/activate/:id` | SUPERADMIN | `ESAVI-SYSCONF-005B` |
| `GET` | `/api/system-configs/:id/history` | SUPERADMIN | `ESAVI-SYSCONF-007` |
| `GET` | `/api/system-configs/:id` | USER | `ESAVI-SYSCONF-003` |
| `PUT` | `/api/system-configs/:id` | SUPERADMIN | `ESAVI-SYSCONF-004` |
| `DELETE` | `/api/system-configs/:id` | SUPERADMIN | `ESAVI-SYSCONF-005A` |

### USER

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/users` | ADMIN | `ESAVI-USER-001` |
| `GET` | `/api/users` | ADMIN | `ESAVI-USER-002A` |
| `GET` | `/api/users/admin` | ADMIN | `ESAVI-USER-002B` |
| `GET` | `/api/users/me` | USER | `ESAVI-USER-007` |
| `PATCH` | `/api/users/me/password` | USER | `ESAVI-USER-006` |
| `GET` | `/api/users/:id` | ADMIN | `ESAVI-USER-003` |
| `PUT` | `/api/users/:id` | ADMIN | `ESAVI-USER-004` |
| `DELETE` | `/api/users/:id` | ADMIN | `ESAVI-USER-005A` |
| `PATCH` | `/api/users/activate/:id` | SUPERADMIN | `ESAVI-USER-005B` |

### USERGEO

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/user-geo-locations` | ADMIN | `ESAVI-USERGEO-001` |
| `POST` | `/api/user-geo-locations/bulk` | ADMIN | `ESAVI-USERGEO-007` |
| `GET` | `/api/user-geo-locations/user/:id` | USER | `ESAVI-USERGEO-002A` |
| `GET` | `/api/user-geo-locations/admin/user/:id` | ADMIN | `ESAVI-USERGEO-002B` |
| `GET` | `/api/user-geo-locations/user/:id/coverage` | USER | `ESAVI-USERGEO-008` |
| `GET` | `/api/user-geo-locations/:id` | USER | `ESAVI-USERGEO-003` |
| `PUT` | `/api/user-geo-locations/:id` | ADMIN | `ESAVI-USERGEO-004` |
| `PATCH` | `/api/user-geo-locations/reassign/:id` | ADMIN | `ESAVI-USERGEO-006` |
| `DELETE` | `/api/user-geo-locations/:id` | ADMIN | `ESAVI-USERGEO-005A` |
| `PATCH` | `/api/user-geo-locations/activate/:id` | SUPERADMIN | `ESAVI-USERGEO-005B` |
| `DELETE` | `/api/user-geo-locations/purge/:id` | SUPERADMIN | `ESAVI-USERGEO-005C` |

### USERROLE

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/user-roles` | ADMIN | `ESAVI-USERROLE-001` |
| `POST` | `/api/user-roles/bulk` | ADMIN | `ESAVI-USERROLE-007` |
| `GET` | `/api/user-roles/user/:id` | USER | `ESAVI-USERROLE-002A` |
| `GET` | `/api/user-roles/admin/user/:id` | ADMIN | `ESAVI-USERROLE-002B` |
| `GET` | `/api/user-roles/role/:id` | ADMIN | `ESAVI-USERROLE-006` |
| `GET` | `/api/user-roles/:id` | USER | `ESAVI-USERROLE-003` |
| `DELETE` | `/api/user-roles/:id` | ADMIN | `ESAVI-USERROLE-005A` |
| `PATCH` | `/api/user-roles/activate/:id` | SUPERADMIN | `ESAVI-USERROLE-005B` |

### WHODRUG

| Método | Ruta | Rol mínimo | Código |
|---|---|---|---|
| `POST` | `/api/whodrug-vaccines` | ADMIN | `ESAVI-WHODRUG-001` |
| `GET` | `/api/whodrug-vaccines` | USER | `ESAVI-WHODRUG-002A` |
| `GET` | `/api/whodrug-vaccines/admin` | ADMIN | `ESAVI-WHODRUG-002B` |
| `GET` | `/api/whodrug-vaccines/:id` | USER | `ESAVI-WHODRUG-003` |
| `PUT` | `/api/whodrug-vaccines/:id` | ADMIN | `ESAVI-WHODRUG-004` |
| `DELETE` | `/api/whodrug-vaccines/:id` | ADMIN | `ESAVI-WHODRUG-005A` |
| `PATCH` | `/api/whodrug-vaccines/activate/:id` | SUPERADMIN | `ESAVI-WHODRUG-005B` |
| `POST` | `/api/whodrug-vaccines/import` | SUPERADMIN | `ESAVI-WHODRUG-007` |

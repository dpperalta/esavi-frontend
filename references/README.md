# references/

Todo lo que hay que tener claro antes de escribir una línea del frontend. Cinco documentos, cada uno con un propósito distinto.

| Documento | Qué responde | Cuándo se lee |
|---|---|---|
| **[CONVENTIONS.md](./CONVENTIONS.md)** | Cómo se escribe el código: nomenclatura, artefactos, capas, checklist | **Siempre**, antes de tocar `src/` |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Qué construimos y con qué decisiones ya tomadas | Antes de empezar, y cada vez que aparezca una duda de diseño |
| **[API-CONTRACT.md](./API-CONTRACT.md)** | Cómo se habla con el backend: envelope, auth, paginación, idioma, auditoría | Al escribir `client.ts` y `createResource.ts` |
| **[API-ROUTES.md](./API-ROUTES.md)** | Las 323 rutas con su rol mínimo y su código de operación | Al construir cada pantalla |
| **[DOMAIN-MODEL.md](./DOMAIN-MODEL.md)** | Qué entidades existen y cómo se conectan | Al diseñar formularios y decidir el orden de los pasos |

## Origen de los datos

Ninguno de estos documentos es una interpretación libre: todos salen de fuentes autoritativas del backend.

| Documento | Fuente |
|---|---|
| `CONVENTIONS.md` | Decisiones de este proyecto, derivadas de `ARCHITECTURE.md` y del canon del backend |
| `API-ROUTES.md` | `esavi-backend/tests/auth/roles.test.ts` → `ROUTE_RULES` |
| `API-CONTRACT.md` | `src/app.ts`, `src/middlewares/`, `src/services/auth.service.ts`, `references/CONVENTIONS.md`, `.env.example` |
| `DOMAIN-MODEL.md` | `src/models/associations/*.ts`, `esaviapp.sql` |
| `ARCHITECTURE.md` | Decisiones de diseño de este proyecto, contrastadas contra el backend |

## Regenerar el inventario de rutas

`API-ROUTES.md` se genera; no se edita a mano. Cuando el backend añada endpoints:

```bash
cd ../esavi-backend
node ../esavi-frontend/references/scripts/extract-routes.js \
     ../esavi-frontend/references/routes-table.md
```

Luego se sustituye la sección «Rutas por entidad» de `API-ROUTES.md` por el contenido generado, y se actualizan la fecha y los totales de la cabecera.

El script lee `ROUTE_RULES` del test de roles del backend, que es la matriz canónica de la §9 de `CONVENTIONS.md`: **una ruta que no está ahí no está protegida por la suite**, así que también sirve como aviso de endpoints sin cubrir.

## Documentos del backend que conviene tener a mano

No se copian aquí porque viven y cambian en su repositorio:

- `esavi-backend/references/CONVENTIONS.md` — la norma vinculante. Nomenclatura, siete artefactos por endpoint, códigos `ESAVI-*`, matriz de roles, contrato de respuesta.
- `esavi-backend/references/functional/specs/NN-slug.md` — el spec de cada entidad. Cuando una pantalla no cuadre con lo que devuelve la API, la respuesta está en el spec de esa entidad, no en el código.
- `esavi-backend/esaviapp.sql` — el DDL autoritativo, con las semillas de los catálogos.

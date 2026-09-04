# references/

Todo lo que hay que tener claro antes de escribir una línea del frontend. Seis documentos, cada uno con un propósito distinto.

| Documento | Qué responde | Cuándo se lee |
|---|---|---|
| **[CONVENTIONS.md](./CONVENTIONS.md)** | Cómo se escribe el código: nomenclatura, artefactos, capas, checklist | **Siempre**, antes de tocar `src/` |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Qué construimos y con qué decisiones ya tomadas | Antes de empezar, y cada vez que aparezca una duda de diseño |
| **[API-CONTRACT.md](./API-CONTRACT.md)** | Cómo se habla con el backend: envelope, auth, paginación, idioma, auditoría | Al escribir `client.ts` y `createResource.ts` |
| **[API-ROUTES.md](./API-ROUTES.md)** | Las 333 rutas con su rol mínimo y su código de operación | Al construir cada pantalla |
| **[DOMAIN-MODEL.md](./DOMAIN-MODEL.md)** | Qué entidades existen y cómo se conectan | Al diseñar formularios y decidir el orden de los pasos |
| **[CASE-PROCESS.md](./CASE-PROCESS.md)** | Las reglas del recorrido del caso: seis pasos, cuatro fases, qué habilita y qué bloquea cada acción | Al redactar e implementar cualquier spec del wizard (`FE08`–`FE14`) |

## Origen de los datos

Ninguno de estos documentos es una interpretación libre: todos salen de fuentes autoritativas del backend.

| Documento | Fuente |
|---|---|
| `CONVENTIONS.md` | Decisiones de este proyecto, derivadas de `ARCHITECTURE.md` y del canon del backend |
| `API-ROUTES.md` | `esavi-backend/tests/auth/roles.test.ts` → `ROUTE_RULES` |
| `API-CONTRACT.md` | `src/app.ts`, `src/middlewares/`, `src/services/auth.service.ts`, `references/CONVENTIONS.md`, `.env.example` |
| `DOMAIN-MODEL.md` | `src/models/associations/*.ts`, `esaviapp.sql` |
| `CASE-PROCESS.md` | `esaviapp.sql`, `src/services/*.service.ts`, `src/validators/*.validator.ts`, `references/functional/specs/`, y `references/external/` para los componentes de WHODrug y MedDRA |
| `ARCHITECTURE.md` | Decisiones de diseño de este proyecto, contrastadas contra el backend |

## Regenerar el inventario de rutas

`API-ROUTES.md` se genera; no se edita a mano. Cuando el backend añada endpoints:

```bash
cd ../esavi-backend
node ../esavi-frontend/references/scripts/extract-routes.cjs \
     ../esavi-frontend/references/routes-table.md
```

Luego se sustituye la sección «Rutas por entidad» de `API-ROUTES.md` por el contenido generado, y se actualizan la fecha y los totales de la cabecera.

El script lee `ROUTE_RULES` del test de roles del backend, que es la matriz canónica de la §9 de `CONVENTIONS.md`: **una ruta que no está ahí no está protegida por la suite**, así que también sirve como aviso de endpoints sin cubrir.

Y por eso mismo no basta con regenerar: el script sólo ve lo que el test declara. Para saber si el backend añadió una ruta **sin** darla de alta en `ROUTE_RULES` —que es el caso que dejaría un endpoint fuera de este inventario y sin cobertura— hay que cruzar la matriz contra los routers reales de `esavi-backend/src/routes/`. Cruce del 2026-09-03: las 333 filas cubren todo lo registrado salvo las cinco rutas abiertas de autenticación, `GET /api/health` y `POST /api/seed/admin`, las siete documentadas en la cabecera de `API-ROUTES.md`.

## Documentos del backend que conviene tener a mano

No se copian aquí porque viven y cambian en su repositorio:

- `esavi-backend/references/CONVENTIONS.md` — la norma vinculante. Nomenclatura, siete artefactos por endpoint, códigos `ESAVI-*`, matriz de roles, contrato de respuesta.
- `esavi-backend/references/functional/specs/NN-slug.md` — el spec de cada entidad. Cuando una pantalla no cuadre con lo que devuelve la API, la respuesta está en el spec de esa entidad, no en el código.
- `esavi-backend/esaviapp.sql` — el DDL autoritativo, con las semillas de los catálogos.

## `references/external/` — los plugins DHIS2 de referencia

Copias locales de los plugins de **WHODrug** y **MedDRA** que hoy están en producción sobre DHIS2. Son la referencia de comportamiento de `<WhodrugTreePicker>` y `<MeddraSearchField>`: qué orden llevan los niveles del árbol, cuándo se colapsa uno, el debounce y el mínimo de caracteres del buscador, qué se muestra en la lista de resultados.

**Está en `.gitignore` y no se versiona.** Son código de terceros y pesan; se copian a mano cuando hacen falta. Por eso `CASE-PROCESS.md` §5.4b **describe** el comportamiento en vez de remitir a los ficheros: sus reglas se implementan sin tener la carpeta, y las citas a `WhoDrugCascade.js` o `useMedDRASearch.js` son para quien sí la tenga.

Lo que se replica es el comportamiento, no la arquitectura: los plugins hablan con un backend externo por una *route* de DHIS2 y escriben en `dataElements`; aquí el origen es `ESAVI-WHODRUG-006A`…`E` y `ESAVI-MEDDRA-006`, y el destino una fila de `notificationVaccine` o `notificationEvent`.

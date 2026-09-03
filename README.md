# ESAVI Frontend

Cliente web del sistema de vigilancia de **ESAVI** — Eventos Supuestamente Atribuibles a la Vacunación e Inmunización.

React + TypeScript sobre la API de [`esavi-backend`](../esavi-backend).

> **Estado: sin código todavía.** El repositorio contiene por ahora sólo las referencias de diseño. El primer hito es el shell con autenticación (ver `references/ARCHITECTURE.md` §12).

---

## Empezar por aquí

Todo el diseño está decidido y documentado en **[`references/`](./references)**. Antes de escribir código:

0. **[`references/CONVENTIONS.md`](./references/CONVENTIONS.md)** — la norma de código: nomenclatura, los seis artefactos por entidad, capas de estado, reglas de API y de UI, checklist de cierre. Se lee siempre.
1. **[`references/ARCHITECTURE.md`](./references/ARCHITECTURE.md)** — stack, capas de estado, la capa de recurso genérica, sidebar, temas, preferencias, responsividad, seguridad de sesión y orden de construcción.
2. **[`references/API-CONTRACT.md`](./references/API-CONTRACT.md)** — cómo se habla con el backend.
3. **[`references/API-ROUTES.md`](./references/API-ROUTES.md)** — las 333 rutas disponibles.
4. **[`references/DOMAIN-MODEL.md`](./references/DOMAIN-MODEL.md)** — qué entidades existen y cómo se conectan.

---

## Relación con el backend

Son **dos repositorios hermanos**, no un monorepo:

```
esavi-app/
├── esavi-backend/     Express 5 + TypeScript + Sequelize + PostgreSQL
└── esavi-frontend/    este repositorio
```

El backend expone **333 rutas bajo `/api`** repartidas en 43 grupos de entidades, casi todas con el mismo contrato de siete artefactos. Esa uniformidad es lo que hace viable la capa de recurso genérica descrita en `ARCHITECTURE.md` §4: cada entidad debería costar una declaración, no una carpeta.

### Para desarrollar en local

El backend corre en el puerto **4500** y su `.env.example` ya incluye `http://localhost:5173` en `CORS_ORIGINS`, que es el puerto por defecto de Vite. No hace falta tocar CORS para empezar.

```bash
# terminal 1
cd ../esavi-backend && npm run dev

# terminal 2 (cuando exista el scaffold)
npm run dev
```

---

## Decisiones ya tomadas

Están razonadas en `references/ARCHITECTURE.md`; el resumen para no reabrirlas sin motivo:

| Tema | Decisión |
|---|---|
| Estado de servidor | TanStack Query. **Casos y pacientes no van a un store de cliente** |
| Filtros y paginación | En la URL (`searchParams`), no en un store |
| Estado de cliente | Zustand: `preferences`, `ui`, `drafts` |
| Progreso del wizard | **En la base, en filas reales**, no como borradores. `ESAVI-CASEFLOW-006` dice dónde se quedó el expediente |
| Offline-first | Fuera de alcance por ahora |
| Temas | Tokens CSS, `data-theme` en `<html>`, tres estados (`light`/`dark`/`system`) y script anti-parpadeo |
| Preferencias | `localStorage` ahora, tabla `appUserPreference` 1:1 cuando haga falta |
| Refresh token | `localStorage` detrás de una interfaz `TokenStore`; cookie `httpOnly` como objetivo |

---

## Convenciones heredadas del backend

El código del cliente es español en la interfaz e inglés en los identificadores, igual que el backend. Tres reglas suyas afectan directamente a este repositorio:

- **Códigos de operación.** Cada endpoint tiene un código `ESAVI-<ENTIDAD>-<NNN>`. Citarlo en el código del cliente que lo consume ahorra mucho tiempo al depurar.
- **Update diferencial.** Enviar el objeto completo en un `PUT` no ensucia el historial: el backend sólo escribe lo que cambió de verdad.
- **`002A` / `002B`.** Todo listado tiene versión pública y versión con inactivos. La elección es por rol.

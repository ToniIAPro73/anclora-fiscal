# Checkpoints de fase

> Nota de origen: este archivo no existía en el repositorio antes de esta entrada. Los checkpoints de las Fases 0-4 se reportaron únicamente en el chat de sesión de Codex y no quedaron persistidos aquí; no se reconstruye su contenido para evitar fabricar información. Esta es la primera entrada persistida en `docs/`.

## ✅ CHECKPOINT FASE 5

- **Completado:**
  - Conector XLSX multihoja de Amazon KDP (§3.3), incluida la hoja KENP, con clasificación por marketplace y tolerancia Resumen/detalle (ADR-008).
  - Nuevas entidades `RoyaltyStatement`/`RoyaltyLine` en `@anclora/core` para modelar regalías KDP sin reutilizar `CanonicalOperation` (ADR-009); integración con el motor fiscal diferida explícitamente (ADR-010).
  - 6 pantallas nuevas del centro de control montadas en Next.js: Operaciones, Conciliación, Facturación, VERI*FACTU, Expedientes IVA, Configuración — todas enlazadas desde la navegación principal de `apps/web/app/page.tsx` (9 rutas reales, sin placeholders `#N`).
  - Infraestructura de test para `apps/web` (Vitest + Testing Library) añadida desde cero; 6/6 tests unitarios pasan.
  - `pnpm --filter @anclora/web lint / typecheck / test` limpios (0 errores).
  - `pnpm --filter @anclora/connectors test`: 9/9 tests pasan, incluida la lectura de las 9 hojas, la clasificación de la venta de 4 unidades / 27,76 € y las aserciones de KENP en `PENDING_TAX_REVIEW` (`packages/connectors/src/kdp-xlsx.test.ts`).

- **Archivos creados/modificados:**
  - Nuevos: `apps/web/app/operations/`, `apps/web/app/reconciliation/`, `apps/web/app/invoicing/`, `apps/web/app/verifactu/`, `apps/web/app/vat-dossier/`, `apps/web/app/settings/`, `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`, `packages/connectors/src/kdp-xlsx.ts`, `packages/connectors/src/kdp-xlsx.test.ts`, `packages/connectors/test/`, `packages/core/src/royalty.ts`.
  - Modificados: `apps/web/app/page.tsx`, `apps/web/app/styles.css`, `apps/web/package.json`, `apps/api/src/import-service.ts` (+ test), `packages/connectors/package.json`, `packages/connectors/src/index.ts`, `packages/core/src/index.ts`, `docs/decision-log.md`, `docs/import-mapping-spec.md`, `docs/known-limitations.md`, `pnpm-lock.yaml`.

- **Tests:**
  - `@anclora/web`: lint 0 errores, typecheck 0 errores, `vitest run` — 6/6 pasados (2 archivos: `operations/timeline.test.tsx`, `reconciliation/workbench.test.tsx`).
  - `@anclora/connectors`: `vitest run` — 9/9 pasados (`shopify.test.ts` 2, `kdp-xlsx.test.ts` 7).

- **Decisiones registradas en decision-log:** ADR-007 (nombres de hoja KDP por `trim`), ADR-008 (tolerancia Resumen/detalle ±0,01 € o ±1%), ADR-009 (regalías KDP como entidades propias, no `CanonicalOperation`), ADR-010 (integración con motor fiscal diferida para KDP).

- **Riesgos/limitaciones abiertos:**
  - **Bloqueante de bundling RESUELTO.** Causa raíz original: `packages/core/src/index.ts` re-exportaba `export * from './storage'`, y `packages/core/src/storage.ts` importaba `node:fs/promises`, `node:path` y `node:crypto` (para `FilesystemStorage`). Cualquier página que importara cualquier símbolo de `@anclora/core` arrastraba ese módulo completo al bundle de Next.js/webpack, que no resuelve esquemas `node:` en el cliente/RSC (`UnhandledSchemeError`). Corrección aplicada: `packages/core/package.json` ahora expone un mapa `exports` con dos entradas — `.` (client-safe) y `./server` (funciones/adaptadores que dependen de Node, incluida `FilesystemStorage`, `createIntegrityRecord`, `createVatDossier`, `MockVerifactuAdapter`, `verifyIntegrityChain`, `verifyVatDossier`). `packages/core/src/index.ts` quedó limitado a exports client-safe (con comentario explícito); `packages/core/src/server.ts` es el nuevo entrypoint server-only. `packages/core/test/compliance.test.ts` se actualizó para importar desde `../src/server` en vez de `../src/index`.
  - Verificado tras la corrección: `pnpm --filter @anclora/core --filter @anclora/connectors --filter @anclora/api --filter @anclora/web typecheck` y `test` — los cuatro paquetes en verde (0 errores de tipo, todos los tests unitarios pasan). Ver tabla de verificación manual abajo para la confirmación end-to-end en el servidor de desarrollo real.
  - Regalías KDP no llevan todavía tipo impositivo calculado (ADR-010); integración con `TaxRule`/`TaxContext` queda para una fase posterior.
  - Tolerancia Resumen/detalle (ADR-008) es siempre `WARNING`, no bloquea import; pendiente de validar con datos reales de producción para descartar falsos positivos.

- **Verificación manual:**
  - Comando: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000<ruta>` + `agent-browser` (open/wait networkidle/get text h1/console) contra cada ruta de la navegación principal, servidor de desarrollo activo (`pnpm --filter @anclora/web dev`).
  - Navegación confirmada: los 9 `href` de `apps/web/app/page.tsx` apuntan a rutas reales (`/`, `/imports`, `/operations`, `/reconciliation`, `/invoicing`, `/verifactu`, `/tax-engine`, `/vat-dossier`, `/settings`); cero hrefs placeholder `#N`.

  | # | Ítem de nav | URL | HTTP | `<h1>` renderizado | Errores de consola | Resultado |
  |---|---|---|---|---|---|---|
  | 1 | Centro de control | `/` | 200 | "Centro de control" | Ninguno (solo aviso informativo de React DevTools) | PASS |
  | 2 | Importaciones | `/imports` | 200 | "Bandeja de importaciones" | Ninguno (solo aviso informativo) | PASS |
  | 3 | Operaciones | `/operations` | 200 | "Operaciones" | Ninguno (solo aviso informativo) | PASS |
  | 4 | Conciliación | `/reconciliation` | 200 | "Conciliación" | Ninguno (solo aviso informativo) | PASS |
  | 5 | Facturación | `/invoicing` | 200 | "Facturación" | Ninguno (solo aviso informativo) | PASS |
  | 6 | VERI*FACTU | `/verifactu` | 200 | "VERI*FACTU" | Ninguno (solo aviso informativo) | PASS |
  | 7 | Motor fiscal | `/tax-engine` | 200 | "Simulador fiscal" | Ninguno (solo aviso informativo) | PASS |
  | 8 | Expedientes IVA | `/vat-dossier` | 200 | "Expedientes IVA" | Ninguno (solo aviso informativo) | PASS |
  | 9 | Configuración | `/settings` | 200 | "Configuración" | Ninguno (solo aviso informativo) | PASS |

  Resultado: **9/9 PASS.** Las 9 rutas del centro de control devuelven HTTP 200, renderizan su `<h1>` correspondiente y no emiten errores ni warnings de consola (solo el aviso informativo estándar de React DevTools en modo desarrollo). El bloqueante de bundling server/client descrito en checkpoints previos queda cerrado y verificado end-to-end.

## ✅ CHECKPOINT FASE 6

- **Hardening:** RBAC aplicado a la importación; la cabecera de rol solo se
  acepta en desarrollo/tests y producción falla cerrada. MIME y estructura se
  validan antes de custodiar bytes; XLSX limitado a 10.000 filas por hoja;
  cookies `SameSite=Lax`/`HttpOnly` y secreto robusto obligatorio en producción.
- **Dependencias:** Next.js 15.5.18, Drizzle ORM 0.45.2 y SheetJS 0.20.3 oficial
  en conectores/core. `pnpm audit --prod`: 0 vulnerabilidades conocidas.
- **E2E:** Playwright cubre las 9 rutas, Shopify CSV con IVA/refund total, KDP
  XLSX con KENP/ISBN y rechazo MIME. Resultado: 12/12 PASS, sin errores de
  consola.
- **Documentación:** arquitectura, dominio, datos, conciliación, API,
  seguridad, estrategia de pruebas, runbook y limitaciones actualizados.
- **Puertas de calidad:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (37/37),
  `pnpm build` y `pnpm test:e2e` (12/12) en verde.
- **Riesgo residual:** el parser XLSX sigue dentro del proceso API; antes de
  producción debe aislarse en un worker con límites de memoria/tiempo. La
  autenticación real, persistencia y rutas mutantes permanecen fuera de alcance.

## ✅ CHECKPOINT — REST paginado + mutaciones fiscales auditadas (Plan 1/2 de `docs/completion-action-plan.md`)

- **Completado:**
  - REST paginado multi-tenant de solo lectura: `GET /api/v1/operations`, `GET /api/v1/financial-events`, `GET /api/v1/reconciliation/candidates`, `GET /api/v1/issues` — todos con `page`/`pageSize` (tope 100), filtros opcionales, y aislamiento de tenant obligatorio en la firma de cada repositorio (`tenantId` siempre desde `request.authSession`, nunca de cabecera/body).
  - Mutación `PATCH /api/v1/issues/:id` (resolución idempotente, 404 en intento cross-tenant).
  - Emisión de factura `POST /api/v1/operations/:id/invoices` y rectificación `POST /api/v1/fiscal-documents/:id/rectify`: idempotentes (reintentar devuelve el mismo documento sin duplicar la cadena de integridad), bloqueadas por RBAC (`documents:issue`/`documents:rectify`), con `AuditEvent` en la misma transacción. `verifyIntegrityChain()` confirmado `true` sobre la cadena completa emisión+rectificación.
  - Cierre/reapertura de período `POST /api/v1/periods/:period/close` y `/reopen`: el cierre se bloquea (409) si existen incidencias `BLOCKING` abiertas en el período, es idempotente, y la reapertura preserva el historial de auditoría previo (nunca lo borra).
  - Expediente de IVA `POST`/`GET /api/v1/periods/:period/vat-dossier`: solo genera sobre períodos `CLOSED` (409 si no), idempotente salvo `force=true` (limitado a `ADMIN`/`REVIEWER`, verificado server-side contra el rol de sesión, no falseable por query string), `verifyVatDossier()` confirmado `true` sobre el ZIP persistido y releído de storage. La recuperación (`GET`) devuelve `storageKey` en crudo — no existe mecanismo de URL firmada (gap documentado en `docs/security.md`, no corregido en este lote por ser fuera de alcance).
  - Extensión aditiva del mapa de permisos en `packages/core/src/index.ts` (nuevas claves de lectura/escritura para `FISCAL_OPERATOR`/`REVIEWER`; ninguna clave existente eliminada).
  - `docs/api.md` y `docs/security.md` actualizados con las rutas reales y el modelo de sesión firmada vigente; sin referencias residuales a la cabecera `x-anclora-role` retirada.
  - Bug real encontrado y corregido durante el propio lote: las rutas de expediente de IVA quedaron accidentalmente comentadas en `apps/api/src/app.ts` (con el `);` de cierre sin comentar, error de sintaxis) tras una investigación de depuración intermedia — detectado por `pnpm lint`, corregido, y cubierto con un test de regresión en `apps/api/src/app.test.ts`.

- **Archivos creados/modificados (resumen):**
  - Nuevos: `packages/db/src/{operations,financial-events,reconciliation,issues,fiscal-documents,period-closes,vat-dossiers}-repository.ts` (+ `.test.ts` de cada uno, PGlite), `apps/api/src/{operations,financial-events,reconciliation,issues,fiscal-documents,period-closes,vat-dossier}-controller.ts` (+ `.test.ts`), `apps/api/src/pagination.ts` (+ test).
  - Modificados: `packages/core/src/index.ts` (+ `test/rbac.test.ts`), `packages/db/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `docs/api.md`, `docs/security.md`, `docs/known-limitations.md`, `docs/completion-action-plan.md`.

- **Tests:** `pnpm --filter @anclora/core test` 13/13 · `pnpm --filter @anclora/db test` 34/34 · `pnpm --filter @anclora/api test` 79/79 — 126/126 en total. Lint y typecheck limpios en los tres paquetes.

- **Decisiones registradas:** extensión aditiva de permisos (sin ADR propio, ver diff de `packages/core/src/index.ts`); patrón repository-port + `DrizzleXRepository` + `AuditEvent` en la misma transacción replicado exactamente en las 7 rutas nuevas, siguiendo el precedente de `import-preview-repository.ts`.

- **Riesgos/limitaciones abiertos:**
  - Sin mecanismo de URL firmada para la descarga del expediente de IVA (`GET` devuelve `storageKey` en crudo) — documentado en `docs/security.md`, no corregido (fuera de alcance de este lote).
  - Parámetros de query (`status`, `severity`, `eventType`, `accepted`, `period`) se castean con `as` en vez de validarse con Zod en tiempo de ejecución — no explotable hoy (todas las comparaciones van parametrizadas vía Drizzle `eq()`), pero una validación más estricta detectaría entradas malformadas antes.
  - Duplicación estructural entre los 6 repositorios (patrón `list()`/paginación casi idéntico, inserción de `AuditEvent` repetida en cada mutación) — candidato claro para un helper compartido en una futura limpieza; no es un defecto de corrección.
  - Las páginas de `apps/web` (Operaciones, Conciliación, Facturación, VERI*FACTU, Expedientes IVA, Configuración) siguen mostrando escenarios de demostración fijos — este lote construye el REST, no reconecta el frontend. Ver plan de seguimiento (`2026-07-03-completion-ui-e2e-closure.md`).

- **Verificación manual:** `pnpm lint && pnpm typecheck && pnpm test` en los tres paquetes afectados, en verde tras la corrección del bug de sintaxis en `app.ts`. Revisión de cumplimiento de especificación (7 puntos), revisión de calidad de código, y revisión de seguridad (aislamiento por tenant, orden RBAC-antes-de-idempotencia, gating de `force=true`) completadas sin hallazgos críticos/altos/medios.

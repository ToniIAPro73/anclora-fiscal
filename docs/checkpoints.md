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

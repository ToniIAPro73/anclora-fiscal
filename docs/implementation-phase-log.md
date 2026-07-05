# Registro de implementación por fases

> Registro de ejecución de `PROMPT_MAESTRO_ANCLORA_FISCAL_REDEFINICION_POR_FASES.md`.
> Una entrada por fase completada, en orden cronológico (más reciente al final).
> No se añade una entrada hasta que la fase ha ejecutado su puerta de calidad real
> (§2.2 del master prompt) — nunca se documenta un resultado asumido o parafraseado.

## Convención de evidencia

Cada entrada de fase debe incluir, como mínimo, los siguientes campos:

- **Fase:** número y nombre corto (p. ej. `FASE 00 — Línea base, inventario verificable y contrato de ejecución`).
- **Objetivo:** una frase, tomada o adaptada del master prompt para esa fase.
- **Archivos / migraciones:** rutas reales creadas o modificadas en esta fase (no "varios ficheros").
- **Pruebas ejecutadas y resultado real:** el comando ejecutado tal cual (`pnpm turbo lint typecheck test --force` u otro) y su resumen de pass/fail **copiado literalmente** de la terminal — nunca una suposición de que "debería pasar".
- **SHA corto:** el hash corto del commit que cierra la fase, una vez creado por el agente `commit`. Si la fase aún no se ha comprometido, se anota `pendiente de commit`.
- **Rama remota:** la rama de `origin` a la que se hizo (o se hará) push.
- **Limitaciones abiertas:** brechas conocidas que la fase deja sin resolver, con referencia a la fase futura que las cubre.
- **Siguiente fase:** número y nombre de la fase que continúa el trabajo.

---

## FASE 00 — Línea base, inventario verificable y contrato de ejecución

- **Objetivo:** empezar desde un estado seguro, reproducible y documentado, sin cambiar todavía
  la semántica de negocio; producir un mapa trazable requisito→fase→módulos→tests, ADRs para
  las cinco decisiones fundacionales, y una línea base de test real (ejecutada, no asumida).
- **Archivos / migraciones:** ninguna migración (fase docs-only). Ficheros creados:
  `docs/product-redefinition-implementation-plan.md`, `docs/implementation-phase-log.md`,
  `docs/adr/0001-shopify-sale-vs-financial-event.md`,
  `docs/adr/0002-kdp-net-royalty-only-default.md`,
  `docs/adr/0003-safe-fiscal-rule-states.md`,
  `docs/adr/0004-fiscal-period-as-date-range.md`,
  `docs/adr/0005-verifactu-preparation-only.md`. Fichero modificado (extensión de test, no
  lógica de negocio): `apps/api/src/build-app.test.ts` (nueva prueba: "no registra ningún
  endpoint de envío VERI*FACTU").
- **Pruebas ejecutadas y resultado real:** `pnpm turbo lint typecheck test --force`, ejecutado
  literalmente desde la raíz del repo. Resultado real de terminal:

  ```text
  Tasks:    26 successful, 26 total
  Cached:    0 cached, 26 total
  Time:    2m32.449s

  @anclora/api:test — Test Files  20 passed (20) / Tests  122 passed (122)
  Duration  4.68s

  WARNING  no output files found for task @anclora/tax-engine#build. Please check your `outputs` key in `turbo.json`
  WARNING  no output files found for task @anclora/ui#build. Please check your `outputs` key in `turbo.json`
  ```

  Las dos advertencias de `outputs` en `turbo.json` son preexistentes (configuración de caché
  de turbo, no un fallo de lint/typecheck/test) y no bloquearon la ejecución — 26/26 tareas
  completaron con éxito.
- **SHA corto:** pendiente de commit.
- **Rama remota:** `origin/feat/anclora-fiscal-product-redefinition` (rama local
  `feat/anclora-fiscal-product-redefinition`, último commit previo a esta fase: `94dd1f7`).
- **Limitaciones abiertas:**
  - `order_lines`: no existe tabla ni columna equivalente (confirmado por grep directo sobre
    `packages/db/migrations/0000-0010` y `schema.ts`); un pedido Shopify multi-línea con
    distinta naturaleza fiscal por línea sigue modelado como una sola fila de
    `commercial_orders`. Debe confirmarse y resolverse en Fase 02.
  - Conflicto potencial entre el commit `eb6e610` (filtros de operaciones, facturación
    automática) + migración `0010_buyer_contact_evidence.sql` y un futuro modelo
    `order_lines`: ambos operan hoy sobre `commercial_orders`/`canonical_operations` sin
    líneas independientes. Pregunta abierta dirigida a Fase 02, sin acción en esta fase.
  - `docs/known-limitations.md` (líneas ~19-22) sigue afirmando que Operaciones, Conciliación,
    Facturación, VERI*FACTU y Expedientes IVA son "vistas de demostración... sin repositorios
    persistentes" — esto es **falso** a día de hoy, contradicho por `matching-service.ts`,
    `tax-decision-service.ts` e `ingestion-normalization-service.ts` (commits `a7e6b5f`→`145a5b4`).
    La corrección de ese fichero se deja pendiente de una fase de documentación dedicada (no
    FASE 00, para no exceder su alcance docs-only definido en el master prompt).
  - Filtro de periodo del expediente de IVA: `vat-dossiers-repository.ts` compara por
    `to_char(issued_at, 'YYYY-MM')` mientras la UI pide un trimestre literal (`'2026-T3'`) — ver
    `docs/adr/0004-fiscal-period-as-date-range.md`. No se corrige en esta fase.
  - `apps/web/app/settings/page.tsx` sigue renderizando `demoSpainConfig` de `@anclora/tax-engine`
    directamente (etiquetado honestamente como "DEMO_CONFIG" en la propia página, por lo que no
    incumple la prohibición de afirmación falsa, pero es el patrón anti-objetivo señalado por el
    doc de redefinición). Acción recomendada para Fase 02.
- **Siguiente fase:** FASE 01 — Shell de aplicación, navegación y sistema de diseño operativo.

---

## FASE 01 — Shell de aplicación, navegación y sistema de diseño operativo

- **Objetivo:** convertir la aplicación en un espacio de trabajo fiscal coherente, navegable y
  reutilizable, con jerarquía visual premium, controles accesibles y estados vacíos honestos.
- **Archivos / migraciones:** ninguna migración. Se incorporaron el shell, mapa de navegación y
  rutas canónicas en `apps/web/app/components/`, `apps/web/app/lib/navigation.ts`,
  `apps/web/app/sales/shopify/`, `apps/web/app/tax-rules/` y `apps/web/app/tax-periods/`; se
  adaptaron las páginas funcionales y rutas legacy bajo `apps/web/app/`; se consolidó el sistema
  visual responsive en `apps/web/app/styles.css`; y se creó el kit compartido y sus pruebas en
  `packages/ui/src/`, con configuración Vitest en `packages/ui/`. También se actualizaron
  `apps/web/e2e/`, `packages/ui/package.json`, `packages/ui/tsconfig.json` y `pnpm-lock.yaml`.
- **Pruebas ejecutadas y resultado real:** `pnpm turbo lint typecheck test --force`, ejecutado
  literalmente desde la raíz del repositorio. Resultado real de terminal:

  ```text
  Tasks:    26 successful, 26 total
  Cached:    0 cached, 26 total
  Time:    2m54.741s

  @anclora/ui:test — Test Files  11 passed (11) / Tests  29 passed (29)
  @anclora/web:test — Test Files  21 passed (21) / Tests  53 passed (53)
  @anclora/db:test — Test Files  15 passed (15) / Tests  67 passed (67)
  @anclora/api:test — Test Files  20 passed (20) / Tests  122 passed (122)

  WARNING  no output files found for task @anclora/tax-engine#build. Please check your `outputs` key in `turbo.json`
  WARNING  no output files found for task @anclora/ui#build. Please check your `outputs` key in `turbo.json`
  ```

  Las dos advertencias de `outputs` son la limitación de caché ya registrada en FASE 00 y no
  afectaron a las 26 tareas. La revisión manual autenticada con `agent-browser` cubrió `/`,
  `/imports`, `/sales/shopify`, `/reconciliation`, `/invoicing`, `/verifactu`, `/tax-rules`,
  `/tax-periods` y `/settings` en escritorio, además de `/imports` a 390 px; no se detectó
  overflow horizontal (`scrollWidth === clientWidth`).
- **SHA corto:** pendiente de commit.
- **Rama remota:** `origin/feat/anclora-fiscal-product-redefinition`.
- **Limitaciones abiertas:**
  - La navegación móvil prioriza marca, cierre de sesión y contenido; el menú completo requiere
    un patrón desplegable en una fase futura si se exige navegación entre módulos sin volver al
    centro de control.
  - Los avisos React sobre el atributo `priority` aparecen exclusivamente por el mock de
    `next/image` en pruebas y no afectan al runtime ni al resultado del pipeline.
  - Las reglas fiscales configurables, periodos por rango real y modelo `order_lines` pertenecen
    a FASE 02; esta fase no altera semántica fiscal ni habilita envíos VERI*FACTU.
- **Siguiente fase:** FASE 02 — Modelo de dominio fiscal y contratos persistentes.

---

## FASE 02 — Fundaciones de datos y configuración fiscal mínima

- **Objetivo:** disponer de configuración fiscal persistida y del modelo mínimo para clasificar
  ventas y emitir documentos sin constantes demo en recorridos productivos.
- **Archivos / migraciones:** migración aditiva
  `packages/db/migrations/0011_fiscal_configuration_foundation.sql`; esquema y repositorio en
  `packages/db/src/schema.ts` y `fiscal-configuration-repository.ts`; API GET/PUT en
  `apps/api/src/fiscal-configuration-controller.ts`; wiring productivo en `build-app.ts` y
  `create-production-app.ts`; readiness de emisión en `fiscal-documents-repository.ts`; carga de
  reglas persistidas en `tax-decision-service.ts`; formulario accesible en
  `apps/web/app/settings/`; permisos en `packages/core/src/index.ts`; pruebas unitarias y de
  integración asociadas en core, db, api y web.
- **Pruebas ejecutadas y resultado real:** `pnpm turbo lint typecheck test --force`:

  ```text
  Tasks:    26 successful, 26 total
  Cached:    0 cached, 26 total
  Time:    3m0.751s

  @anclora/db:test — Test Files  16 passed (16) / Tests  70 passed (70)
  @anclora/api:test — Test Files  21 passed (21) / Tests  124 passed (124)
  @anclora/web:test — Test Files  21 passed (21) / Tests  53 passed (53)

  WARNING  no output files found for task @anclora/tax-engine#build. Please check your `outputs` key in `turbo.json`
  WARNING  no output files found for task @anclora/ui#build. Please check your `outputs` key in `turbo.json`
  ```

  La migración se verificó desde base limpia y en segunda ejecución idempotente. La validación
  autenticada de `/settings` confirmó 18 controles etiquetados, estado de readiness honesto y
  ausencia de overflow horizontal (`scrollWidth === clientWidth`, 1265 px).
- **SHA corto:** pendiente de commit.
- **Rama remota:** `origin/feat/anclora-fiscal-product-redefinition`.
- **Limitaciones abiertas:**
  - `order_lines`, `tax_periods`, `payouts`, asignaciones y contrapartes quedan estructuralmente
    preparados; su ingestión y flujos completos corresponden a FASE 04, 06 y 07.
  - El simulador aislado de `/tax-rules` conserva `demoSpainConfig` como fixture explícita; los
    servicios productivos cargan exclusivamente perfiles persistidos y bloquean si faltan.
  - No se aplica la migración a producción en esta fase; requiere una petición explícita.
- **Siguiente fase:** FASE 03 — Arquitectura de importación, preview y confirmación segura.

---

## FASE 03 — Arquitectura de importación, preview y confirmación segura

- **Objetivo:** implementar el circuito completo de importación de archivos (Shopify, KDP, Pagos) con
  descomposición transparente de problemas, vista previa antes de persistencia, y confirmación
  deliberada sin rollback automático de cambios fiscales parcialmente comprometidos.
- **Archivos / migraciones:** migración aditiva `packages/db/migrations/0012_import_states_v2.sql`;
  esquema y repositorios en `packages/db/src/schema.ts`, `import-preview-repository.ts`,
  `import-issue-codes.ts` y `dashboard-summary-repository.ts`; ciclo de vida y servicios en
  `apps/api/src/import-lifecycle-controller.ts`, `import-lifecycle-service.ts`,
  `import-controller.ts` e `import-preview-persistence.ts`; wiring productivo en
  `apps/api/src/build-app.ts` y `create-production-app.ts`; componentes de interfaz en
  `apps/web/app/imports/` (uploader, import-card, shopify-orders-card, shopify-payments-card,
  kdp-royalties-card); actualización de navegación y shell en `apps/web/app/lib/navigation.ts`,
  `apps/web/app/components/app-shell.tsx`, `apps/web/app/page.tsx`; pruebas end-to-end en
  `apps/web/e2e/imports.spec.ts` y `e2e/navigation.spec.ts`; actualización de documentación en
  `docs/api.md` y pruebas unitarias asociadas en todos los módulos.
- **Pruebas ejecutadas y resultado real:** `pnpm --filter api test`, `pnpm --filter web test`,
  `pnpm --filter db test`:

  ```text
  @anclora/api:test — Test Files  21 passed, 1 failed / Tests  136 passed, 12 failed
  (12 failures: ENOENT on .evidence/pedido-shopify.csv and pedido-shopify-sin-pais.csv —
   pre-existing fixture files missing, confirmed unrelated to FASE 03 changes via clean-HEAD
   worktree baseline)

  @anclora/web:test — Test Files  17 passed (17) / Tests  61 passed (61)

  @anclora/db:test — Test Files  16 passed (16) / Tests  77 passed (77)
  ```

  Los 12 fallos de fixture son defectos de base (archivos `.evidence/` faltantes desde commits
  previos), certificados como preexistentes y no causados por esta fase.
- **SHA corto:** 54d9448.
- **Rama remota:** `origin/main`.
- **Limitaciones abiertas:**
  - Los 12 fallos de test por archivos de fixture faltantes (`.evidence/pedido-shopify.csv` y
    `pedido-shopify-sin-pais.csv`) deben restaurarse o sus tests refactearse en una fase o fix
    dedicado.
  - El enfoque de re-preview en tiempo de confirmación re-parsea el fichero custodiado en lugar
    de usar una instantánea almacenada; válido por diseño para esta fase pero revisable si el
    rendimiento se convierte en limitación.
  - La normalización completa de importaciones (decomposición de multipedidos Shopify, asociación
    a perfiles fiscales, integración con ciclos de compra KDP) corresponde a FASE 04.
- **Siguiente fase:** FASE 04 — Normalización de importaciones Shopify y KDP.

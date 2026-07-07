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
- **SHA corto:** `fa325db`.
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
- **SHA corto:** `bc4aa2a`.
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

---

## SHOPIFY-04 — Orquestador de importación y previews por fuente

- **Objetivo:** separar de extremo a extremo los tres streams Shopify (pedidos,
  transacciones de pedido y ledger de Shopify Payments), con detección por cabeceras,
  previews específicos y ciclo analizar/confirmar/rechazar/reintentar sin efectos fiscales
  automáticos.
- **Archivos / migraciones:** contratos y sanitización de preview en
  `apps/api/src/import-service.ts`; validación exacta de stream y ciclo de vida en
  `import-controller.ts`, `import-lifecycle-controller.ts`, `import-lifecycle-service.ts` e
  `import-preview-persistence.ts`; IDs persistidos de incidencias en
  `packages/db/src/import-preview-repository.ts`; tres tarjetas y previews diferenciados en
  `apps/web/app/imports/`; autenticación reproducible del arnés Playwright en
  `apps/web/e2e/auth.setup.ts` y `playwright.config.ts`; pruebas API, web y E2E asociadas.
  No se añade ninguna migración. Las migraciones 0012–0014 ya estaban aplicadas en producción.
- **Pruebas ejecutadas y resultado real:** `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm --filter @anclora/web test:e2e` y `git diff --check`:

  ```text
  lint — 7/7 tareas correctas
  typecheck — 7/7 tareas correctas
  @anclora/web:test — 25 archivos / 62 pruebas correctas
  @anclora/db:test — 18 archivos / 94 pruebas correctas
  @anclora/connectors:test — 5 archivos / 41 pruebas correctas
  @anclora/api:test — 24 archivos / 156 pruebas correctas
  build — 7/7 tareas correctas
  Playwright — 33/33 pruebas correctas
  ```
- **SHA corto:** pendiente de commit.
- **Rama remota:** `origin/main`.
- **Limitaciones abiertas:**
  - Los enlaces explícitos entre las tres evidencias y la conciliación segura pertenecen a
    SHOPIFY-05 según el prompt maestro vigente.
  - Las filas de ledger sin `externalPayoutId` permanecen correctamente como liquidación
    pendiente; no representan payout ni cobro bancario.
- **Siguiente fase:** SHOPIFY-05 — Enlaces de evidencia y conciliación segura.

---

## SHOPIFY-05 — Relaciones de evidencia y conciliación controlada

- **Objetivo:** relacionar pedido, transacción de pedido y ledger Shopify con
  enlaces explícitos, explicables y decidibles, sin crear facturas ni afirmar
  conciliación bancaria.
- **Archivos / migraciones:** migración aditiva
  `packages/db/migrations/0015_shopify_evidence_links.sql`; esquema y repositorio
  `shopify-evidence-links-repository.ts`; conservación de `Transaction Date` en
  el ledger; reconstrucción idempotente tras confirmar cualquier stream Shopify;
  API GET/PATCH en `shopify-evidence-links-controller.ts`; aislamiento del
  matching legacy y eliminación de su emisión automática de facturas.
- **Decisión de enlace:** el prompt nominal menciona el ID interno para
  transaction→order, pero los exports verificados y la migración 0014 demuestran
  que Orders no contiene ese ID numérico enlazable. Se mantiene la decisión
  validada: `shopifyOrderName` resuelve exactamente a
  `commercialOrders.externalOrderId`; `shopifyOrderId` se conserva como evidencia.
- **Pruebas ejecutadas y resultado real:** `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm build`, `pnpm test:e2e` y `git diff --check`:

  ```text
  lint — 7/7 tareas correctas
  typecheck — 7/7 tareas correctas
  @anclora/web:test — 25 archivos / 62 pruebas correctas
  @anclora/db:test — 19 archivos / 100 pruebas correctas
  @anclora/connectors:test — 5 archivos / 41 pruebas correctas
  @anclora/api:test — 25 archivos / 162 pruebas correctas
  build — 7/7 tareas correctas
  Playwright — 33/33 pruebas correctas
  ```
- **SHA corto:** pendiente de commit.
- **Rama remota:** `origin/main`.
- **Limitaciones abiertas:**
  - `matching_candidates` permanece para lectura de datos legacy, pero no participa
    en el nuevo flujo Shopify.
  - `bankVerified` permanece siempre falso: la aplicación aún no ingiere extractos
    bancarios.
- **Siguiente fase:** SHOPIFY-06 — Ventas Shopify, conciliación y facturación segura.

---

## SHOPIFY-06 — Ventas, liquidación y facturación segura

- **Objetivo:** convertir las tres evidencias Shopify en un expediente operativo por pedido,
  sin confundir payout con conciliación bancaria y sin emisión automática.
- **Implementación:** read model y API `/api/v1/shopify/sales`; lista con métricas y filtros;
  detalle pedido → transacciones → ledger → payout → decisión → documentos → auditoría;
  workbench “Cobros y liquidación Shopify”; creación del caso fiscal desde el pedido
  confirmado, independiente del matching; emisión manual con permiso y elegibilidad
  calculada en servidor; importe cero excluido y reembolsos bifurcados en el servicio de
  emisión. No se añade migración.
- **Pruebas:** `pnpm lint` y `pnpm typecheck` (7/7); `pnpm test` (API 25
  archivos/176 pruebas, DB 19/100, web 25/58, conectores 5/41, core 6/22,
  UI 11/29 y tax-engine 1/3); `pnpm build` (7/7); Playwright (33/33); y
  `git diff --check`, todos correctos.
- **SHA corto:** pendiente de commit.
- **Rama remota:** `origin/main`.
- **Limitación explícita:** no se ingieren extractos bancarios; ningún estado de payout se
  presenta como cobro bancario verificado.
- **Siguiente fase:** SHOPIFY-07 — Cierre de calidad, documentación y aceptación real.

---

## SHOPIFY-07 — Documentación y aceptación real

- **Objetivo:** cerrar el flujo Shopify con documentación mantenible, decisiones
  arquitectónicas explícitas y evidencia de aceptación reproducible.
- **Documentación:** mapeos, conciliación, dominio, datos, API, limitaciones,
  runbook de exports, cuatro ADR y reporte final actualizados.
- **Privacidad:** los tres exports reales se retiraron del índice Git, se
  conservaron localmente y quedaron protegidos por reglas específicas de
  `.gitignore`.
- **Aceptación local observada:** 4 pedidos, 2 transacciones, 2 movimientos de
  ledger, enlaces por ID y nombre, refund en ambos streams, neto −0,45 EUR,
  2 payouts pending sin ID y 3 pedidos de importe cero fuera de emisión.
- **Calidad:** lint/typecheck/build 7/7; 429 pruebas; Playwright 33/33;
  migraciones correctas sobre base limpia y segunda ejecución; 11 documentos
  afectados sin warnings markdown; revisión manual desktop/móvil de imports,
  ventas, detalle y conciliación sin errores ni overflow.
- **SHA:** pendiente del commit final.
- **Siguiente paso:** ninguno dentro del plan Shopify-first; cualquier despliegue
  o trabajo KDP requiere instrucción separada.

---

## REFACTOR FISCAL SHOPIFY — FASE 0 — Baseline y decisiones de compatibilidad

- **Objetivo:** establecer una línea base verificable para el prompt maestro
  `PROMPT MAESTRO — CODEX / REFACTOR FISCAL SHOPIFY DE ANCLORA FISCAL`, confirmar
  la rama `feature/fiscal-refactor-shopify`, registrar divergencias con documentación
  antigua y fijar decisiones de compatibilidad antes de cambios funcionales.
- **Preflight ejecutado antes de cambios funcionales:**

  ```text
  git status --short
  salida: limpia

  git branch --show-current
  salida: feature/fiscal-refactor-shopify

  git remote -v
  salida:
  origin https://github.com/ToniIAPro73/anclora-fiscal.git (fetch)
  origin https://github.com/ToniIAPro73/anclora-fiscal.git (push)

  git fetch origin --prune
  salida: sin cambios

  git log --oneline --decorate -20
  salida: HEAD inicial d8a9915, origin/main en 5c08415, historial Shopify 01-07 presente

  git diff --check
  salida: sin errores
  ```

- **Sincronización no destructiva:** `origin/main` contenía el commit `5c08415`
  de foco automático en login que no estaba integrado en la rama. Como el árbol
  estaba limpio, se ejecutó merge normal:

  ```text
  git merge --no-ff origin/main -m "sync: merge main before fiscal refactor"
  salida: Merge made by the 'ort' strategy.
  ```

- **SHA base de trabajo:** `763922d` tras el merge normal de `origin/main`.
- **Lectura mínima realizada:** `README.md`, documentación de arquitectura,
  dominio, datos, conciliación, motor fiscal, limitaciones, ADRs, prompt E2E
  previo, migraciones 0000-0015 y módulos actuales de configuración fiscal,
  emisión, decisión fiscal, caso fiscal, ciclo de importación, normalización
  Shopify, ventas Shopify, facturación core y vistas operativas.
- **Archivos / migraciones:** sin migración. Archivos docs-only:
  `docs/adr/0010-shopify-fiscal-refactor-policy.md` y
  `docs/implementation-phase-log.md`.
- **Decisiones registradas:** `legal_entities` permanece como único emisor fiscal
  persistente; la emisión Shopify futura se disparará por transacción de pedido
  confirmada y no por payout/matching; OSS y B2B fallan de forma segura; los
  valores nuevos del dominio fiscal se introducen en español; VERI*FACTU sigue
  desactivado por defecto.
- **Divergencias verificadas:** el repositorio ya separa tres evidencias Shopify,
  pero la emisión manual aún exige ledger, el PDF aún usa “Emitida por Anclora
  Insights”, `fiscal_documents` sólo distingue tipos legacy y la política de
  emisión todavía no modela factura simplificada/completa/rectificativa con
  contratos españoles.
- **Pruebas ejecutadas y resultado real:**

  ```text
  pnpm lint
  Tasks: 7 successful, 7 total
  Cached: 2 cached, 7 total
  Time: 46.46s

  pnpm typecheck
  Tasks: 7 successful, 7 total
  Cached: 3 cached, 7 total
  Time: 1m27.796s

  pnpm test
  Tasks: 12 successful, 12 total
  Cached: 4 cached, 12 total
  Time: 5m0.566s
  @anclora/ui:test — Test Files 11 passed / Tests 30 passed
  @anclora/web:test — Test Files 26 passed / Tests 68 passed
  @anclora/db:test — Test Files 19 passed / Tests 100 passed
  @anclora/connectors:test — Test Files 5 passed / Tests 41 passed
  @anclora/api:test — Test Files 25 passed / Tests 181 passed
  @anclora/core:test — Test Files 6 passed / Tests 22 passed
  @anclora/tax-engine:test — Test Files 1 passed / Tests 3 passed
  WARNING no output files found for task @anclora/ui#build.
  ```

  Los avisos React sobre `priority` proceden del mock de `next/image` en pruebas
  web y no bloquean la suite.
- **SHA corto:** pendiente de commit.
- **Rama remota:** `origin/feature/fiscal-refactor-shopify`.
- **Limitaciones abiertas:**
  - La implementación funcional de emisor persona física, NIF/NIE, series `FS`,
    `F`, `FR` y OSS corresponde a FASE 1.
  - La clasificación fiscal y estados españoles del nuevo modelo corresponden a
    FASE 2.
  - PDF, numeración y rectificación completa corresponden a FASE 3.
  - Orquestación post-transacción Shopify confirmada corresponde a FASE 4.
  - Read models y UI operativa final corresponden a FASE 5.
- **Siguiente fase:** REFACTOR FISCAL SHOPIFY — FASE 1 — Emisor fiscal,
  configuración y migración aditiva.

## REFACTOR FISCAL SHOPIFY — FASE 1 — Emisor fiscal y configuración

- **Rama:** `feature/fiscal-refactor-shopify`.
- **Objetivo:** introducir configuración fiscal real del emisor sin duplicar la
  fuente persistente `legal_entities`.
- **Migración aditiva:** `packages/db/migrations/0016_fiscal_issuer_refactor.sql`.
  Añade tipo de emisor, IAE, régimen de IVA, OSS, estado fiscal configurado y
  marca de NIF/NIE configurado.
- **Contrato nuevo:** la API acepta payload español con `datosEmisor`, `oss`,
  `perfilProducto` y `ejercicio`; el contrato legacy sigue disponible.
- **Protección NIF/NIE:** la API valida NIF/NIE español y lo cifra con secreto de
  servidor antes de persistir. GET no devuelve nunca el valor en claro ni el
  cifrado.
- **Series fiscales:** el guardado real crea de forma idempotente `FS`
  simplificada, `F` completa y `FR` rectificativa sobre `invoice_series`.
- **UI:** la pantalla de configuración muestra campos visibles para emisor
  persona física, NIF/NIE sustituible, IAE, régimen IVA, OSS y resumen de series.
- **Pruebas ejecutadas y resultado real:**

  ```text
  pnpm --filter @anclora/core test -- spanish-tax-id
  Test Files 7 passed / Tests 25 passed

  pnpm --filter @anclora/db test -- fiscal-configuration-repository migrations
  Test Files 19 passed / Tests 101 passed

  pnpm --filter @anclora/api test -- fiscal-configuration-controller
  Test Files 25 passed / Tests 183 passed

  pnpm --filter @anclora/web test -- settings/page.test.tsx
  Test Files 26 passed / Tests 68 passed

  pnpm --filter @anclora/core typecheck
  pnpm --filter @anclora/db typecheck
  pnpm --filter @anclora/api typecheck
  pnpm --filter @anclora/web typecheck
  todos sin errores

  pnpm --filter @anclora/core lint
  pnpm --filter @anclora/db lint
  pnpm --filter @anclora/api lint
  pnpm --filter @anclora/web lint
  todos sin errores
  ```

  Los avisos React sobre `priority` proceden del mock de `next/image` en pruebas
  web y no bloquean la suite.
- **SHA corto:** pendiente de commit.
- **Siguiente fase:** REFACTOR FISCAL SHOPIFY — FASE 2 — Clasificación de ventas
  Shopify y decisiones fiscales.

## REFACTOR FISCAL SHOPIFY — FASE 2 — Clasificación y decisión fiscal

- **Rama:** `feature/fiscal-refactor-shopify`.
- **Objetivo:** clasificar ventas Shopify confirmadas y persistir decisiones
  fiscales con nuevos valores canónicos españoles.
- **Motor fiscal:** `@anclora/tax-engine` devuelve `DETERMINADA`,
  `PENDIENTE_REVISION_FISCAL` o `BLOQUEADA`, clasifica ventas nacionales B2C
  con IVA reducido/general y emite tipo documental `SIMPLIFICADA`.
- **Normalización de producto:** `ebook` y `LIBRO_ELECTRONICO` se tratan como
  la misma naturaleza fiscal para que la configuración real de Fase 1 no rompa
  importaciones Shopify existentes.
- **Caso fiscal Shopify:** `ConfirmedOrderFiscalCaseService` crea operaciones
  con `VENTA_SHOPIFY`, `PENDIENTE_DECISION_FISCAL` y
  `EVIDENCIA_INTERNA_PENDIENTE`; los pedidos de importe cero quedan en revisión
  y no generan operación fiscal.
- **Persistencia:** `DrizzleOperationsRepository.create()` asigna a nuevos
  registros `reviewStatus=PENDIENTE` y `verifactuStatus=NO_CONFIGURADO`.
- **UI:** se añadieron traducciones para los estados y clasificaciones
  españoles en `display-labels` y el simulador fiscal reconoce ambos esquemas.
- **Pruebas ejecutadas y resultado real:**

  ```text
  pnpm --filter @anclora/tax-engine test
  Test Files 1 passed / Tests 4 passed

  pnpm --filter @anclora/api test -- tax-decision-service confirmed-order-fiscal-case-service matching-service
  Test Files 26 passed / Tests 185 passed

  pnpm --filter @anclora/db test -- operations-repository
  Test Files 19 passed / Tests 101 passed

  pnpm --filter @anclora/web test -- tax-rules sales/shopify
  Test Files 26 passed / Tests 68 passed

  pnpm --filter @anclora/tax-engine typecheck
  pnpm --filter @anclora/api typecheck
  pnpm --filter @anclora/db typecheck
  pnpm --filter @anclora/web typecheck
  todos sin errores

  pnpm --filter @anclora/tax-engine lint
  pnpm --filter @anclora/api lint
  pnpm --filter @anclora/db lint
  pnpm --filter @anclora/web lint
  todos sin errores
  ```

  Los avisos React sobre `priority` proceden del mock de `next/image` en pruebas
  web y no bloquean la suite.
- **SHA corto:** `365e154`.
- **Siguiente fase:** REFACTOR FISCAL SHOPIFY — FASE 3 — Documentos fiscales
  simplificados, completos y rectificativos.

## REFACTOR FISCAL SHOPIFY — FASE 3 — Documentos fiscales

- **Rama:** `feature/fiscal-refactor-shopify`.
- **Objetivo:** emitir documentos simplificados, completos y rectificativos con
  tipos y series fiscales españolas, conservando compatibilidad con documentos
  legacy.
- **Migración aditiva:** `packages/db/migrations/0017_tax_decision_document_type.sql`.
  Añade `tax_decisions.document_type` con valor por defecto `COMPLETA` para que
  las decisiones previas sigan siendo emitibles.
- **Emisión:** `DrizzleFiscalDocumentsRepository.issue()` selecciona el tipo
  decidido (`SIMPLIFICADA` o `COMPLETA`), usa las series `FS` o `F`, renderiza el
  emisor fiscal real en el PDF y mantiene idempotencia por tipo documental.
- **Rectificación:** `rectify()` acepta originales simplificados/completos,
  emite `RECTIFICATIVA` con serie `FR`, enlaza el documento original y conserva
  compatibilidad de lectura con `FULL_INVOICE`/`RECTIFYING_INVOICE`.
- **Read models:** las operaciones consideran emitidas las facturas
  `SIMPLIFICADA`, `COMPLETA` y `FULL_INVOICE`, evitando que facturas españolas
  desaparezcan de facturación.
- **Pruebas ejecutadas y resultado real:**

  ```text
  pnpm --filter @anclora/core build
  correcto

  pnpm --filter @anclora/core test -- invoicing
  Test Files 7 passed / Tests 25 passed

  pnpm --filter @anclora/db test -- fiscal-documents-repository
  Test Files 19 passed / Tests 102 passed

  pnpm --filter @anclora/core typecheck
  pnpm --filter @anclora/db typecheck
  pnpm --filter @anclora/api typecheck
  todos sin errores

  pnpm --filter @anclora/core lint
  pnpm --filter @anclora/db lint
  pnpm --filter @anclora/api lint
  todos sin errores
  ```

- **SHA corto:** pendiente de commit.
- **Siguiente fase:** REFACTOR FISCAL SHOPIFY — FASE 4 — Orquestación de emisión
  desde pagos Shopify confirmados.

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

# Limitaciones conocidas

- La Fase 0 no conecta todavía el formulario de acceso a un proveedor de
  identidad. El modelo RBAC y los límites de autorización ya están definidos.
- No se ha ejecutado ninguna migración contra la `DATABASE_URL` externa.
- VERI*FACTU permanece desactivado y no se declara cumplimiento normativo.
- Los datos mostrados en el centro de control son una vista demostrativa
  anonimizada hasta completar los importadores.
- El fichero real de KDP (`.evidence/KDP_Orders-*.xlsx`) no contiene ninguna
  fila en la hoja `KENP leídas`, así que la cobertura de prueba de KENP
  depende de una única fila sintética inyectada en el fixture anonimizado
  (`packages/connectors/test/fixtures/kdp-orders-anonymized.xlsx`). Revisar si
  se dispone de una exportación real con lecturas KENP.
- El conector KDP XLSX no calcula todavía tipo impositivo ni integra
  `TaxRule`/`TaxContext` (ver ADR-010) — las `RoyaltyLine` quedan como
  entidades de importación/clasificación, sin motor fiscal aplicado.
- Operaciones, Conciliación, Facturación, VERI*FACTU y Expedientes IVA son
  vistas de demostración sobre casos fijos (AI-1001 / venta KDP) — no hay
  persistencia (`packages/db` no existe todavía); no reflejan datos reales de
  tenant.
- Las páginas Facturación, VERI*FACTU y Expedientes IVA son Server Components
  que ejecutan lógica de `packages/core` (dependiente de `node:crypto` /
  `pdf-lib`) directamente en cada render; `apps/web` no tenía hasta ahora
  ningún arnés de pruebas para Server Components (solo Vitest + React
  Testing Library sobre componentes cliente, añadido en esta fase junto con
  `apps/web/vitest.config.ts`). No se ha inventado infraestructura nueva para
  cubrirlas — quedan sin test automatizado; solo las páginas cliente
  (Operaciones, Conciliación) tienen cobertura RTL
  (`apps/web/app/operations/timeline.test.tsx`,
  `apps/web/app/reconciliation/workbench.test.tsx`).

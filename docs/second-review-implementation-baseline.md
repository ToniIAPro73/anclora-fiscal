# Baseline de implementación de la segunda revisión

Fecha: 12 de julio de 2026.

## Estado inicial

- Rama: `main`.
- `HEAD` local y `origin/main`: `ca71366a58bd95063a2c3575ac99301086dc2538`.
- Árbol versionado limpio. Se preservan dos documentos del usuario sin seguimiento:
  `prompt_maestro_anclora_fiscal_segunda_revision.md` y
  `anclora-fiscal-segunda-revision-hallazgos-y-mejoras.md`.
- Índice del grafo de código disponible: 3.293 nodos y 7.485 relaciones.
- Última migración: `0024_fiscal_document_counterparty.sql`.
- Baseline global verde: lint, typecheck, tests y build terminan con código 0.
- Avisos no bloqueantes previos: Next.js infiere la raíz por múltiples lockfiles y algunos tests
  muestran el atributo `priority` del mock de imagen como atributo DOM no booleano.

## Defectos confirmados

1. Emisión simplificada persiste `aeatTipoFactura` mediante constante `F1`.
2. Builder XML fija destinatario con `recipient ?? issuer` y construye siempre
   `Destinatarios`.
3. Dry-run y submit manual repiten fallback de destinatario.
4. Rectificación usa semántica de `ANULACION` donde debe existir alta rectificativa `R5`.
5. Flujo de factura completa no modela sustitución `F3` de simplificada previa.
6. Servicio interno de ejecución VERI*FACTU existe, pero aplicación productiva no lo cablea.
7. Repositorio solo localiza pendientes por ID; no reclama lote vencido concurrentemente.
8. Dossier almacena `storageKey`, pero no hay endpoint API de lectura del ZIP.
9. Eventos SIF tienen repositorio y controlador, pero faltan productores operativos.
10. Persisten proxies web obsoletos de PDF y ZIP.
11. Documentación de limitaciones no refleja capacidades actuales.

## Mapa de impacto

- Core: `verifactu-aeat-xml.ts`, validación, transporte, modelos VERI*FACTU, dossier y SIF.
- DB: repositorios de documentos y submissions, esquema, migraciones y exports server.
- API: `create-production-app.ts`, runtime VERI*FACTU, controladores internos, dossier y SIF.
- Web: facturación, periodos, VERI*FACTU, nuevas superficies de cierre, salud y gastos.
- Infra: `vercel.json`, scripts operativos y runbooks.
- Tests: fixtures XML, emisión, cola, API, UI, migraciones y aislamiento por tenant.

## Riesgos de migración

- Huellas y XML históricos son inmutables: ninguna migración debe recalcularlos.
- Relaciones F3/R5 deben ser aditivas y conservar documentos originales.
- Claims de cola necesitan lease transaccional sin mantener transacción durante red.
- Nuevas constraints deben aceptar filas históricas antes de exigir invariantes nuevos.
- Gastos quedan fuera de `integrity_chain_records` y `verifactu_submissions`.
- Datos cifrados de contrapartes no deben copiarse a estructuras menos protegidas.

## Decisiones que no deben improvisarse

- Catálogo canónico AEAT limitado inicialmente a `F1`, `F2`, `F3` y `R5`.
- Límite general de simplificada: 400 EUR. Régimen especial de 3.000 EUR desactivado
  por defecto y sujeto a evidencia configurada.
- Producción AEAT permanece bloqueada. Cron y endpoint interno solo operan en modo test.
- Correcciones fiscales crean registros nuevos; nunca mutan registros emitidos.
- Compras usan decisiones de deducibilidad propias y no entran en cadena oficial de ventas.
- Criterios fiscales configurables se muestran como revisables por asesoría.

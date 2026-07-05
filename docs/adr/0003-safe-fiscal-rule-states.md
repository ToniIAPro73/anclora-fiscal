# ADR 0003 — Estados seguros para decisiones fiscales: DETERMINED / REVIEW_REQUIRED / BLOCKED

## Status

Accepted

## Context

Una decisión fiscal automática que "adivina" en silencio cuando falta evidencia (país del
cliente, tipo de cliente, naturaleza del producto, entidad legal emisora) puede generar una
factura con un tipo impositivo incorrecto sin que nadie lo note hasta una inspección. El
producto necesita que el motor fiscal nunca devuelva un resultado "aparentemente correcto"
cuando en realidad no tiene evidencia suficiente para decidir.

## Decision

`apps/api/src/tax-decision-service.ts` ejecuta `VersionedTaxEngine` (de `@anclora/tax-engine`)
contra un `TaxContext` construido con la evidencia disponible del pedido
(`customerCountry`, `customerType`, `productNature`, `grossAmount`, `currency`). El
resultado (`decision.status`, ver `TaxDecision['status']`) se persiste siempre —
incluyendo cuando no es un tipo determinado — a través de
`TaxDecisionsRepositoryPort.create()`, nunca se descarta ni se sustituye por un valor por
defecto silencioso. El único caso que no persiste una decisión es
`SKIPPED_NO_LEGAL_ENTITY` (líneas 83-89): si el tenant no tiene ninguna entidad legal
configurada, no hay país emisor con el que evaluar nada, así que se registra como omitido
explícitamente (con `console.warn`) en lugar de forzar una decisión sin sentido.

Cuando sí hay entidad legal, el motor debe resolver a uno de los estados seguros
(`DETERMINED`, `REVIEW_REQUIRED`, `BLOCKED` — definidos en `@anclora/tax-engine`, tipo
`TaxDecision['status']`) según la evidencia disponible; nunca un cuarto estado implícito
de "asumido correcto".

## Consequences

- Cualquier consumidor de `tax_decisions` (facturación, libros registro, expedientes IVA)
  puede filtrar por estado y bloquear la emisión de un documento fiscal cuando el estado
  no es `DETERMINED`, en vez de asumir que toda fila de `tax_decisions` es facturable.
- Las pruebas (`tax-decision-service.test.ts`) deben cubrir explícitamente el camino
  `REVIEW_REQUIRED`/`BLOCKED` con evidencia incompleta, no sólo el camino feliz.
- Coste: no se puede "forzar" una decisión provisional para desbloquear un flujo de
  demostración; es una restricción deliberada — ver también §2.5 ("Prudencia fiscal y
  normativa") del master prompt.

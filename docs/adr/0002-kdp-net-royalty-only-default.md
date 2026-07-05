# ADR 0002 — Líneas de regalía KDP por defecto en NET_ROYALTY_ONLY

## Status

Accepted

## Context

Amazon KDP es el "merchant of record" (comerciante registrado) de la venta al lector
final — Anclora Fiscal no factura al lector, sólo recibe una liquidación de regalías del
propio Amazon. Si una línea de regalía se contabilizase por el precio de venta bruto al
lector (en vez de por la regalía neta reportada por KDP), el importe fiscalmente relevante
para el autor/editor quedaría duplicado: una vez como "venta" y otra vez como "regalía
cobrada", cuando en realidad sólo existe un flujo económico real hacia el tenant — la
regalía neta.

## Decision

`packages/core/src/royalty.ts` declara explícitamente en su comentario de cabecera
(líneas 1-4) que las filas de KDP se modelan como `RoyaltyLine`/`RoyaltyStatement`, nunca
como una operación canónica (`CanonicalOperation`) facturada al lector. El tipo
`RoyaltyLine` no tiene un campo de "precio bruto facturado"; expone `amount` (regalía),
`averageUnitPrice` y `productionCost` como desglose informativo, no como base de otra
factura. `summarizeRoyaltyLinesByFormat()` (líneas 72-84) excluye explícitamente las líneas
`'reembolso'` y las de lectura KENP del cómputo de precio/coste, evitando que un reembolso
o una lectura por suscripción se sumen como si fueran una venta bruta adicional.

La persistencia (`packages/db/migrations/0005_royalty_statements.sql`,
`packages/db/src/royalty-repository.ts`) sigue el mismo modelo: se guarda la liquidación
tal como la reporta KDP, no una reconstrucción de precio de venta al público.

## Consequences

- El motor fiscal (Fase 05/06, aún no implementado para KDP — ver
  `docs/known-limitations.md`) deberá aplicarse sobre `amount` (regalía neta), no sobre un
  precio de venta reconstruido, cuando se implemente.
- Riesgo aceptado: si en el futuro se necesita reportar el precio bruto de venta al lector
  (por ejemplo, para un requisito de información distinto al fiscal del tenant), habrá que
  añadir un campo explícito nuevo, no reutilizar `amount`.
- No se modifica en esta fase — se documenta un comportamiento y una intención de diseño
  ya presentes en el código, para que decisiones futuras (Fase 05/06) no las reviertan por
  desconocimiento.

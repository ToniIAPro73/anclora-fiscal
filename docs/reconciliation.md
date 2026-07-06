# Cobros y liquidación Shopify

## Alcance

La conciliación Shopify relaciona evidencia comercial, transacciones de pedido
y ledger de Shopify Payments. No ingiere extractos bancarios y ningún estado
equivale a conciliación bancaria.

## Enlaces

- Pedido → transacción: enlace exacto por identidad Shopify preservada.
- Pedido → ledger: enlace exacto mediante `orders.Name = ledger.Order`.
- Transacción → ledger: propuesta explicable por pedido, tipo compatible,
  moneda, importe y ventana temporal.

Los enlaces exactos son `AUTO_LINKED`. Los enlaces transacción → ledger nacen
como `PROPOSED` y un operador con permiso puede marcarlos `CONFIRMED` o
`REJECTED`; actor y fecha quedan auditados.

## Estados honestos

- `LEDGER_MISSING`: falta importar la evidencia de liquidación.
- `PAYOUT_PENDING`: existe ledger, pero no `Payout ID`.
- `SETTLED`: existe referencia de payout; no implica banco verificado.
- `PROPOSED`: enlace pendiente de revisión humana.

El modelo legacy `matching_candidates` permanece sólo por compatibilidad y no
crea enlaces Shopify ni documentos fiscales.

## Reembolsos

Un refund conserva el pedido y añade transacciones y ledger. Si existe factura,
la corrección se realiza con documento rectificativo vinculado. Sin factura
previa, el caso se envía a revisión. La factura original nunca se modifica.

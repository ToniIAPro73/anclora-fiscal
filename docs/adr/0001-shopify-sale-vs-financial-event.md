# ADR 0001 — Venta Shopify separada del evento financiero/payout

## Status

Accepted

## Context

Una venta Shopify (el pedido, con su fecha de compra, país del cliente, naturaleza del
producto e importe declarado al cliente) y el evento financiero asociado (el cobro, el
payout de Shopify Payments, sus comisiones y su fecha real de liquidación bancaria) no
ocurren en el mismo instante ni necesariamente 1:1. Un mismo pedido puede tener un cobro
parcial, un reembolso posterior, o un payout que agrupa múltiples pedidos. Si se modelan
como una única fila, la fecha de devengo fiscal (venta) y la fecha de caja (cobro) quedan
acopladas, lo que rompe la conciliación cuando ambas divergen — el caso normal, no el
excepcional.

## Decision

El esquema (`packages/db/src/schema.ts`) modela la venta y el evento financiero como dos
tablas independientes con sus propias claves de idempotencia:

- `commercialOrders` → tabla `commercial_orders`, única por `(tenant_id, source_channel,
  external_order_id)` (índice `orders_external_uq`). Contiene la evidencia fiscal del
  pedido: `commercial_date`, `customer_country`, `customer_type`, `product_nature`,
  `total_amount`, `tax_amount`.
- `financialEvents` → tabla `financial_events`, única por `(tenant_id, source_channel,
  external_event_id)` (índice `financial_events_external_uq`). Contiene `event_type`,
  `order_reference`, `amount`, `fee_amount`, `net_amount`, `occurred_at`.

Las dos tablas se relacionan por `order_reference`/`checkout_reference`, no por clave
primaria compartida, y se **emparejan** (matching), no se fusionan: ver
`apps/api/src/matching-service.ts`, que resuelve la relación venta↔cobro sin sobrescribir
ninguna de las dos entidades.

## Consequences

- La decisión fiscal (`tax-decision-service.ts`) puede ejecutarse en cuanto existe la
  venta, sin esperar al cobro — necesario porque la obligación fiscal nace con la venta,
  no con el cobro.
- La conciliación (Fase 07) puede señalar pedidos sin cobro emparejado, o cobros sin
  pedido, como incidencia explícita en vez de un dato silenciosamente incorrecto.
- Coste: cualquier lectura que necesite "venta + su cobro" requiere un join explícito;
  se acepta porque la alternativa (fusionar en una fila) pierde la capacidad de detectar
  divergencias, que es precisamente el objetivo de conciliación del producto.

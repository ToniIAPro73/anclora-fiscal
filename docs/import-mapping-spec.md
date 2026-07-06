# Especificación de mapeo de importaciones

## Principios comunes

- La detección usa cabeceras, no el nombre del archivo.
- Preview y retry no crean registros fiscales; sólo confirm crea datos operativos.
- El original se custodia con SHA-256 y el reimport es idempotente por tenant.
- Los previews no devuelven nombres, direcciones, correos ni snapshots completos.
- Los tres exports Shopify son evidencias independientes y no intercambiables.

## Shopify Orders CSV

Cabeceras distintivas: `Name`, `Financial Status`, `Fulfillment Status`,
`Created at` y `Lineitem quantity`. Cada `Name` genera un `commercial_order` y
las filas con el mismo `Name` generan sus `order_lines`.

<!-- markdownlint-disable MD013 -->

| Campo fuente | Destino | Nota |
| --- | --- | --- |
| `Name` | `commercial_orders.external_order_id` | Referencia visible y enlace canónico del pedido. |
| `Id` | Evidencia fuente | ID interno Shopify; no sustituye a `Name`. |
| `Financial Status` | `financial_status` | Determina si el pedido está confirmado. |
| `Total` / `Taxes` | `total_amount` / `tax_amount` | Valores comerciales informados. |
| `Lineitem *` | `order_lines` | ID nativo si existe; fingerprint reproducible si falta. |
| País y contacto | evidencia del cliente | Nunca infieren por sí solos B2B u OSS. |

<!-- markdownlint-enable MD013 -->

Un total cero conserva el pedido con `ZERO_VALUE_REVIEW`; nunca se elimina ni
se factura automáticamente. Un refund actualiza el estado mediante nueva
evidencia, sin borrar el pedido ni sus líneas.

## Shopify Order Transaction History CSV

Cabeceras distintivas: `Order`, `Name`, `Kind`, `Gateway`, `Created At`,
`Status`, `Amount` y `Currency`. Cada fila crea un
`shopify_order_payment_event`. `Order` conserva el ID interno y `Name` permite
resolver el pedido comercial. El signo de refunds se conserva.

## Shopify Payments Ledger CSV

Exige las 18 cabeceras canónicas de ledger. Cada fila crea un
`shopify_payments_ledger_entry`. `Order` enlaza con `orders.Name`; `Fee`,
`Net`, `VAT`, estado y referencia de payout se conservan como evidencia de
Shopify. `VAT` no es una decisión fiscal.

Sin `Payout ID` no se crea un payout recibido: la fila permanece como
liquidación pendiente. Un payout identificado tampoco prueba el abono bancario.

## Contrato de detección

La matriz válida es diagonal: Orders sólo lo acepta el detector Orders,
Order Transactions sólo su detector y Ledger sólo el suyo. Cualquier cruce se
rechaza antes de persistir datos operativos.

## Amazon KDP

KDP permanece separado del alcance Shopify. Se modela como regalía neta del
merchant of record, no como venta al lector.

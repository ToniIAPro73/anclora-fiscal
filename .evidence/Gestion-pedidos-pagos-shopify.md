<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# quiero saber que informes necesito extraer de shopify para poder gestionar desde mi aplicación tanto los pedidos que se han realiazado como los pagos efectuados

Para que tu aplicación pueda gestionar bien **pedidos** y **pagos**, necesitas trabajar con **3 tipos de export** distintos de Shopify, no solo con el CSV de pedidos.

***

## 1. Export de pedidos (orders_export.csv)

Es la base de todo: cada pedido, con sus líneas, impuestos y datos de cliente. Se obtiene desde:

- Admin → **Orders** → botón **Export** (arriba a la derecha) → CSV.[^1][^2][^3]

Este CSV (el típico `orders_export.csv`) te da:

- Identificador de pedido (`Name`, `Id`)
- Estado (`Financial Status`, `Fulfillment Status`)
- Fechas (`Created at`, `Fulfilled at`)
- Líneas de pedido (título, cantidad, precio)
- Impuestos (`Taxes`, `Tax N Name`, `Tax N Value`)
- Datos de facturación y envío (nombre, dirección, país, etc.)[^3][^4]

**Uso en tu app**:

- Construir la entidad **Pedido** (source = Shopify)
- Generar las **facturas/tickets** a partir de las líneas
- Determinar **régimen de IVA** según país del cliente y tipo de producto

***

## 2. Export de historial de transacciones de pedidos (Payments / Transactions)

Aquí no miras el pedido “comercial”, sino los **eventos de pago** asociados (cargo, devolución, autorización). Se obtiene también desde Orders, pero con la opción de transacciones:[^4]

- Admin → **Orders** → Export → opción **Export transaction history** (o equivalente según idioma)[^4]

El CSV de **historial de transacciones** incluye columnas como:[^4]

- `Order` / `Name` → referencia al pedido
- `Payment Method` → tarjeta, PayPal, etc.
- `Kind` → `sale`, `refund`, `authorization`
- `Gateway` → Shopify Payments, PayPal, Stripe, …
- `Created At` → fecha y hora de la transacción
- `Status` → éxito/fallo
- `Amount` / `Currency` → importe de la transacción

**Uso en tu app**:

- Crear la entidad **Transacción de pago** por pedido (venta, devolución, rectificativa)
- Saber exactamente **cuándo se ha cobrado** y **cuándo se ha devuelto**
- Construir la lógica de **“Operaciones” / conciliación**: pedido + cobro – devoluciones

***

## 3. Export de payouts de Shopify Payments (pagos a tu banco)

Lo anterior son los pagos **cliente → Shopify**. Te falta la capa **Shopify → tu cuenta bancaria**: los **payouts**. Esa info está en Shopify Payments y se exporta así:[^5][^6][^7]

- Admin → **Settings** → **Payments** → en Shopify Payments, clic **View payouts**
- Dentro de un payout, clic **View transactions** → botón **Export** para CSV[^6]

Este CSV de payout incluye, por línea:[^7][^6]

- `Transaction Date` → fecha/hora
- `Type` → cargo, reembolso, ajuste
- `Order` → ID de pedido
- `Payout Status` / `Payout Date`
- `Amount` → bruto
- `Fee` → comisión de Shopify
- `Net` → neto que va al payout

**Uso en tu app**:

- Construir la entidad **Payout** (ingreso en banco) asociada a varios pedidos
- Conciliar el **neto cobrado en banco** con:
    - ventas (orders + transactions)
    - comisiones de pasarela (fees)
- Generar el informe de **caja/banco** para modelo 130 / IRPF y conciliación contable

***

## Resumen operativo para tu aplicación

Para tener el circuito completo en anclora-fiscal:

1. **Pedidos (Orders export)**
    - Fuente: Orders → Export → CSV
    - Entidad: `PedidoShopify` + `LineaPedidoShopify`
2. **Transacciones de pago por pedido**
    - Fuente: Orders → Export transaction history
    - Entidad: `TransaccionPagoShopify` (sale/refund/authorization, gateway, método)
3. **Payouts de Shopify Payments**
    - Fuente: Settings → Payments → View payouts → View transactions → Export CSV
    - Entidad: `PayoutShopify` + `TransaccionEnPayout` (amount, fee, net)[^5][^6]

Con esas tres familias de CSV tu app puede:

- Saber qué **pedidos** existen y qué IVA/cuota lleva cada uno
- Saber qué **pagos** se han hecho por cada pedido (ventas y devoluciones)
- Saber qué **dinero te ha llegado realmente al banco**, con comisiones y netos por payout

Si quieres, el siguiente paso lo podemos concretar en estructura de tablas/modelo de datos para cada tipo de informe y cómo los mapeas al modelo de “Operaciones / Conciliación / Expedientes IVA” que ya tienes en el repo.
<span style="display:none">[^10][^11][^12][^13][^14][^15][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://www.youtube.com/watch?v=ziyx0OYb1Cc

[^2]: https://community.shopify.com/t/how-to-find-the-orders-export-report-including-gift-card-sales/88503

[^3]: https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders

[^4]: https://help.shopify.com/th/manual/fulfillment/managing-orders/exporting-orders

[^5]: https://help.shopify.com/en/manual/payments/shopify-payments/payouts/view-details

[^6]: https://help.shopify.com/zh-TW/manual/payments/shopify-payments/payouts/view-details

[^7]: https://community.shopify.com/t/complete-transaction-history-csv-download-for-accountant/408901

[^8]: https://community.shopify.com/t/payment-transactions-export-to-csv-for-more-than-1-payout-day/381472/3

[^9]: https://help.shopify.com/en/partners/manage-account/manage-payouts-invoices/payouts

[^10]: https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/custom-reports/export-reports

[^11]: https://community.shopify.com/c/shopify-discussions/payment-transactions-export-to-csv-for-more-than-1-payout-day/m-p/2883530

[^12]: https://community.shopify.com/t/how-can-i-export-orders-in-csv-with-line-item-properties/621231

[^13]: https://apps.shopify.com/payout-close

[^14]: https://apps.shopify.com/simple-reports-and-data-export

[^15]: https://blog.coupler.io/shopify-export-orders/


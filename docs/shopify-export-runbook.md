# Guía operativa de exports Shopify

## Objetivo

Obtener las tres evidencias necesarias para revisar ventas, cobros y liquidación
sin mezclar sus significados.

## Rango recomendado

Use el mismo rango para los tres exports y añada siete días de margen al inicio
y al final para capturar cargos, refunds y liquidaciones desplazadas. En revisiones
mensuales, reimporte el periodo solapado: la idempotencia evita duplicados.

## 1. Orders CSV

En Shopify Admin, abra **Orders**, filtre el rango y use **Export** en formato CSV.
No elimine columnas. En Anclora Fiscal use **Importaciones → Pedidos Shopify**,
revise el preview y confirme las incidencias reconocidas.

Resultado esperado: pedidos y líneas. Los pedidos de importe cero permanecen en
revisión y no se facturan automáticamente.

## 2. Order Transaction History CSV

Exporte el historial de transacciones con las columnas `Order`, `Name`, `Kind`,
`Gateway`, `Created At`, `Status`, `Amount` y `Currency`. En instalaciones donde
Shopify no ofrezca export masivo, el detalle de una orden se puede comprobar en
la vista de transacciones del pedido; no convierta manualmente JSON en evidencia
sin conservar procedencia y rango.

En Anclora Fiscal use **Importaciones → Transacciones de pedidos Shopify**.

## 3. Shopify Payments Ledger CSV

En **Finanzas → Pagos → Payouts**, abra las transacciones del rango y expórtelas.
Conserve `Transaction Date`, `Type`, `Order`, `Payout Status`, `Payout ID`,
`Amount`, `Fee`, `Net`, moneda y VAT. Use **Importaciones → Shopify Payments**.

Una fila `pending` sin `Payout ID` es liquidación pendiente. Incluso con ID, no
la marque como banco verificado sin un extracto bancario independiente.

## Verificación posterior

1. Abra **Ventas Shopify** y compruebe pedidos, métricas y estados de evidencia.
2. Abra el expediente de un pedido para revisar líneas, transacciones y ledger.
3. Abra **Cobros y liquidación Shopify** y decida enlaces propuestos.
4. Emita desde el expediente, con configuración, transacción confirmada y
   decisión fiscal completas. Ledger y payout no son requisito fiscal.
5. Ante refund con factura, genere una rectificativa; sin factura, revise el caso.

## Privacidad

Los exports reales no se adjuntan a incidencias, commits ni documentación. Para
soporte, comparta hashes y conteos agregados, nunca filas con datos personales.

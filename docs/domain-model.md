# Modelo de dominio

## Agregados Shopify

- `CommercialOrder` y `OrderLine`: evidencia de la venta y sus productos.
- `ShopifyOrderPaymentEvent`: sale, capture, refund u otro evento del pedido.
- `ShopifyPaymentsLedgerEntry`: importe, fee, neto y estado de payout.
- `ShopifyEvidenceLink`: relación explícita, explicada y decidible.
- `CanonicalOperation`: expediente fiscal nacido del pedido confirmado.
- `TaxDecision`: decisión versionada basada en configuración y evidencia.
- `FiscalDocument`: factura inmutable o rectificativa vinculada.

## Invariantes

- Pedido, transacción, ledger, payout y banco son capas distintas.
- `Name` e `Id` son identificadores Shopify con usos diferentes.
- El caso fiscal nace del pedido confirmado, no del matching.
- Matching o importación nunca emiten facturas.
- Un pedido a cero permanece en revisión y fuera de emisión.
- El VAT del ledger no sustituye al IVA fiscal decidido.
- Un refund nunca elimina evidencia ni edita una factura emitida.
- Toda lectura y mutación se limita al tenant de la sesión.

## Ciclo operativo

1. Analizar cada export con su conector específico.
2. Confirmar para persistir la evidencia de ese stream.
3. Construir enlaces exactos y propuestas entre evidencias.
4. Revisar la venta aunque falten transacción, ledger o payout.
5. Emitir manualmente sólo con rol, configuración, perfil, evidencia y
   decisión fiscal suficientes.
6. Rectificar explícitamente cuando un refund afecta a una factura existente.

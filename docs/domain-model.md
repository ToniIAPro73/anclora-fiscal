# Modelo de dominio

## Agregados Shopify

- `CommercialOrder` y `OrderLine`: evidencia de la venta y sus productos.
- `ShopifyOrderPaymentEvent`: sale, capture, refund u otro evento del pedido.
- `ShopifyPaymentsLedgerEntry`: importe, fee, neto y estado de payout.
- `ShopifyEvidenceLink`: relación explícita, explicada y decidible.
- `CanonicalOperation`: expediente fiscal nacido del pedido confirmado.
- `TaxDecision`: decisión versionada basada en configuración y evidencia; usa
  estados españoles como `DETERMINADA`, `PENDIENTE_REVISION_OSS` y
  `REVISION_IMPORTE_CERO`.
- `FiscalDocument`: factura simplificada, completa o rectificativa inmutable.

## Invariantes

- Pedido, transacción, ledger, payout y banco son capas distintas.
- `Name` e `Id` son identificadores Shopify con usos diferentes.
- El caso fiscal nace de una transacción Shopify de cobro confirmada.
- Matching, pedido, ledger, payout o banco nunca emiten facturas.
- Un pedido a cero permanece en revisión y fuera de emisión.
- El VAT del ledger no sustituye al IVA fiscal decidido.
- Un refund nunca elimina evidencia ni edita una factura emitida.
- Una factura simplificada no se convierte en completa editando el original; se
  corrige mediante documento vinculado cuando proceda.
- Toda lectura y mutación se limita al tenant de la sesión.

## Ciclo operativo

1. Analizar cada export con su conector específico.
2. Confirmar para persistir la evidencia de ese stream.
3. La transacción de pedido confirmada crea el expediente fiscal y dispara la
   emisión automática sólo si la decisión fiscal es `DETERMINADA`.
4. Construir enlaces exactos y propuestas entre evidencias.
5. Revisar la venta aunque falten ledger o payout.
6. Emitir manualmente sólo con rol, configuración, perfil, transacción
   confirmada y decisión fiscal suficientes.
7. Rectificar explícitamente cuando un refund afecta a una factura existente.

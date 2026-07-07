# ADR 0010 — Refactor fiscal Shopify con emisor único y emisión por cobro confirmado

## Estado

Aceptado.

## Contexto

El refactor fiscal Shopify debe evolucionar el flujo actual sin crear un modelo
paralelo ni romper el contrato de tres evidencias ya establecido:

- pedido comercial;
- transacción de pedido;
- movimiento de ledger/payout;
- conciliación bancaria;
- documento fiscal.

El código actual ya contiene `legal_entities`, `invoice_series`,
`product_tax_profiles`, `fiscal_counterparties`, `commercial_orders`,
`shopify_order_payment_events`, `shopify_payments_ledger_entries` y
`fiscal_documents`. También existen ADRs previos que separan pedido, transacción,
ledger, payout y banco.

## Decisión

1. `legal_entities` sigue siendo la única fuente persistente del emisor fiscal.
   El refactor puede exponer DTOs o proyecciones con nombres de dominio en
   español, pero no creará una tabla paralela de emisores.
2. La emisión fiscal Shopify se orquestará desde una transacción de pedido
   confirmada (`sale` o `capture` correcto) después de persistir la evidencia.
   No se emitirá por importación de pedido, matching, ledger, payout ni banco.
3. La ausencia de ledger, payout o banco no bloqueará una emisión fiscal cuando
   exista cobro confirmado, configuración válida y decisión fiscal permitida.
4. OSS, B2B, REST del mundo, reembolsos parciales e importes cero fallarán hacia
   revisión fiscal explícita si falta evidencia o regla vigente documentada.
5. Los nuevos estados, tipos, clasificaciones, payloads y etiquetas del dominio
   fiscal se introducirán en español. Los valores legacy en inglés se conservarán
   sólo como compatibilidad técnica mientras se mapean hacia el modelo nuevo.
6. VERI*FACTU permanece desactivado por defecto. La aplicación no declarará
   certificación ni cumplimiento pleno futuro.

## Divergencias verificadas con el código actual

- `DrizzleFiscalDocumentsRepository.issue()` emite sólo `FULL_INVOICE`; todavía
  no distingue simplificada, completa y rectificativa con campos canónicos
  españoles.
- `InvoiceIssuanceService` y `createShopifySaleInvoiceHandler()` aún exigen
  ledger para la emisión manual; esto debe eliminarse en las fases de emisión.
- `packages/core/src/invoicing.ts` todavía renderiza el texto fijo
  “Emitida por Anclora Insights”; debe sustituirse por el emisor legal
  configurado.
- `ConfirmedOrderFiscalCaseService` crea expediente desde pedido confirmado,
  pero no desde evento Shopify confirmado ni con política fiscal completa.
- `TaxDecisionService` usa el motor versionado existente, con estados legacy en
  inglés; el refactor añadirá capa fiscal Shopify en español sin renombrar
  masivamente contratos antiguos.

## Consecuencias

- Las migraciones del refactor serán aditivas y secuenciales.
- La numeración fiscal deberá salir de `invoice_series` con series `FS`, `F` y
  `FR`, de forma atómica e idempotente.
- Los documentos existentes se leerán por compatibilidad, pero los documentos
  nuevos usarán tipo fiscal inequívoco y emisor legal correcto.
- Las pantallas operativas deberán mostrar pago, payout/banco y fiscalidad como
  capas separadas.

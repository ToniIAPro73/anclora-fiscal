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

## Implementación cerrada

- `DrizzleFiscalDocumentsRepository.issue()` emite `SIMPLIFICADA` o `COMPLETA`
  según la decisión fiscal, y `rectify()` emite `RECTIFICATIVA`.
- `InvoiceIssuanceService` y la acción manual de Ventas Shopify no exigen
  ledger, payout ni banco; sólo pedido, transacción confirmada, configuración,
  perfil y decisión fiscal.
- `packages/core/src/invoicing.ts` renderiza el emisor legal configurado. El
  nombre comercial puede aparecer como marca, pero no sustituye a nombre legal,
  NIF/NIE configurado y domicilio.
- `ConfirmedOrderFiscalCaseService` se orquesta desde eventos Shopify
  confirmados de tipo `sale` o `capture` y estado correcto.
- `TaxDecisionService` persiste decisiones con estados y tipos fiscales
  españoles nuevos, manteniendo compatibilidad técnica con valores legacy.

## Consecuencias

- Las migraciones del refactor serán aditivas y secuenciales.
- La numeración fiscal deberá salir de `invoice_series` con series `FS`, `F` y
  `FR`, de forma atómica e idempotente.
- Los documentos existentes se leerán por compatibilidad, pero los documentos
  nuevos usarán tipo fiscal inequívoco y emisor legal correcto.
- Las pantallas operativas deberán mostrar pago, payout/banco y fiscalidad como
  capas separadas.

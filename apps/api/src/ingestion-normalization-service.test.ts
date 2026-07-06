import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractShopifyOrdersCsv, previewShopifyCsv } from '@anclora/connectors';
import { normalizeShopifyOrdersCsv, normalizeShopifyPaymentTransactions, normalizeShopifyPaymentsLedger } from './ingestion-normalization-service.js';

const fixtures = resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures');

describe('normalizeShopifyOrdersCsv', () => {
  it('mapea filas de pedidos a commercial_orders con externalOrderId y fecha comercial', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);

    expect(groups).toHaveLength(4);
    expect(groups.map((group) => group.order.externalOrderId)).toEqual(['AI-1004', 'AI-1003', 'AI-1002', 'AI-1001']);
    expect(groups.every((group) => group.order.sourceChannel === 'SHOPIFY')).toBe(true);
    const withDate = groups.find((group) => group.order.externalOrderId === 'AI-1001');
    expect(withDate?.order.commercialDate).toEqual(new Date('2026-07-01'));
  });

  it('deja commercialDate sin definir cuando el pedido no trae fecha comercial válida', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    const groupWithoutDate = parsed.groupedOrders.find((order) => order.orderId === 'AI-1004');
    delete groupWithoutDate!.commercialDate;
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    expect(groups.find((group) => group.order.externalOrderId === 'AI-1004')?.order.commercialDate).toBeUndefined();
  });

  it('aplica customerCountry real y los valores por defecto documentados de customerType/productNature', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);

    expect(groups.every((group) => group.order.customerCountry === 'ES')).toBe(true);
    expect(groups.every((group) => group.order.customerType === 'B2C')).toBe(true);
    expect(groups.every((group) => group.order.productNature === 'ebook')).toBe(true);
  });

  it('deja customerCountry sin definir cuando el export no trae columnas de país', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-no-country.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    expect(groups[0]?.order.customerCountry).toBeUndefined();
  });

  it('mapea customerName, totalAmount y taxAmount reales como strings numéricos', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    const group = groups.find((entry) => entry.order.externalOrderId === 'AI-1001');

    expect(group?.order.customerName).toBe('Cliente Demo AI-1001');
    expect(group?.order.totalAmount).toBe('6.99');
    expect(group?.order.taxAmount).toBe('0.27');
  });

  it('deja customerName, totalAmount y taxAmount sin definir cuando el export no trae Total/Taxes', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-no-country.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    expect(groups[0]?.order.totalAmount).toBeUndefined();
    expect(groups[0]?.order.taxAmount).toBeUndefined();
  });

  it('mapea customerEmail y customerAddress reales', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    const group = groups.find((entry) => entry.order.externalOrderId === 'AI-1001');
    expect(group?.order.customerEmail).toBe('cliente-ai-1001@ejemplo.com');
    expect(group?.order.customerAddress).toBe("Calle Ejemplo 1, Palma, '07015, PM");
  });

  it('deja customerEmail y customerAddress sin definir cuando el export no trae esas columnas', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-no-country.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    expect(groups[0]?.order.customerEmail).toBeUndefined();
    expect(groups[0]?.order.customerAddress).toBeUndefined();
  });

  it('mapea las líneas del pedido con sourceRowNumber y sin sobrescribir el total reportado (SHOPIFY-02)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-grouped-multiline.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    const group = groups.find((entry) => entry.order.externalOrderId === 'AI-2001');

    expect(group?.lines).toHaveLength(2);
    expect(group?.lines.every((line) => typeof line.sourceRowNumber === 'number' && line.sourceRowNumber > 0)).toBe(true);
    expect(group?.order.reportedTotalAmount).toBe('8.66');
  });

  it('marca fiscalStatus=ZERO_VALUE_REVIEW para un pedido con Total=0, sin descartarlo (SHOPIFY-02)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-grouped-multiline.csv')));
    const groups = normalizeShopifyOrdersCsv(parsed.groupedOrders);
    const zeroValueGroup = groups.find((entry) => entry.order.externalOrderId === 'AI-2003');

    expect(zeroValueGroup).toBeDefined();
    expect(zeroValueGroup?.order.fiscalStatus).toBe('ZERO_VALUE_REVIEW');
  });
});

describe('normalizeShopifyPaymentTransactions', () => {
  it('mapea filas de transacciones a financial_events con montos y referencia de checkout', async () => {
    const preview = previewShopifyCsv(await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv')));
    const events = normalizeShopifyPaymentTransactions(preview);

    expect(events).toHaveLength(preview.rows.length);
    expect(new Set(events.map((event) => event.eventType))).toEqual(new Set(['charge', 'refund']));
    expect(events.every((event) => event.sourceChannel === 'SHOPIFY')).toBe(true);
    expect(events.every((event) => event.orderReference === 'AI-1001')).toBe(true);
    expect(events.every((event) => event.checkoutReference === '#68683485610367')).toBe(true);
    // externalEventId reuses the connector's businessKey — same file, same ids.
    expect(new Set(events.map((event) => event.externalEventId)).size).toBe(events.length);
  });
});

describe('normalizeShopifyPaymentsLedger', () => {
  it('conserva Transaction Date para aplicar la ventana temporal de enlaces SHOPIFY-05', async () => {
    const preview = previewShopifyCsv(await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv')));
    const entries = normalizeShopifyPaymentsLedger(preview);

    expect(entries[0]?.transactionAt).toEqual(new Date(preview.rows[0]!['Transaction Date']));
  });
});

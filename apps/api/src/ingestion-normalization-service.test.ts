import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractShopifyOrdersCsv, previewShopifyCsv } from '@anclora/connectors';
import { normalizeShopifyOrdersCsv, normalizeShopifyPaymentTransactions } from './ingestion-normalization-service.js';

const evidence = resolve(import.meta.dirname, '../../../.evidence');

describe('normalizeShopifyOrdersCsv', () => {
  it('mapea filas de pedidos a commercial_orders con externalOrderId y fecha comercial', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify.csv')));
    const orders = normalizeShopifyOrdersCsv(parsed);

    expect(orders).toHaveLength(4);
    expect(orders.map((order) => order.externalOrderId)).toEqual(['AI-1004', 'AI-1003', 'AI-1002', 'AI-1001']);
    expect(orders.every((order) => order.sourceChannel === 'SHOPIFY')).toBe(true);
    const withDate = orders.find((order) => order.externalOrderId === 'AI-1001');
    expect(withDate?.commercialDate).toEqual(new Date('2026-07-01'));
  });

  it('deja commercialDate sin definir cuando el pedido no trae fecha comercial válida', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify.csv')));
    delete parsed.orders[0]!.commercialDate;
    const orders = normalizeShopifyOrdersCsv(parsed);
    expect(orders[0]?.commercialDate).toBeUndefined();
  });

  it('aplica customerCountry real y los valores por defecto documentados de customerType/productNature', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify.csv')));
    const orders = normalizeShopifyOrdersCsv(parsed);

    expect(orders.every((order) => order.customerCountry === 'ES')).toBe(true);
    expect(orders.every((order) => order.customerType === 'B2C')).toBe(true);
    expect(orders.every((order) => order.productNature === 'general')).toBe(true);
  });

  it('deja customerCountry sin definir cuando el export no trae columnas de país', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-sin-pais.csv')));
    const orders = normalizeShopifyOrdersCsv(parsed);
    expect(orders[0]?.customerCountry).toBeUndefined();
  });
});

describe('normalizeShopifyPaymentTransactions', () => {
  it('mapea filas de transacciones a financial_events con montos y referencia de checkout', async () => {
    const preview = previewShopifyCsv(await readFile(resolve(evidence, 'payment_transactions_export_1.csv')));
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

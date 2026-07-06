import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractShopifyOrdersCsv, isShopifyOrdersCsvFile } from './shopify-orders-csv.js';
import { isShopifyOrderTransactionsCsvFile } from './shopify-order-transactions-csv.js';
import { isShopifyPaymentsLedgerCsvFile } from './shopify-payments-ledger-csv.js';

const fixtures = resolve(import.meta.dirname, '../test/fixtures');

describe('extractShopifyOrdersCsv', () => {
  it('trata el export de pedidos como evidencia comercial e identifica la incoherencia de reembolso total', async () => {
    const result = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    expect(result.orders.map((order) => order.orderId)).toEqual(['AI-1004', 'AI-1003', 'AI-1002', 'AI-1001']);
    const incident = result.orders.find((order) => order.orderId === 'AI-1001');
    expect(incident?.commercialDate).toBe('2026-07-01');
    expect(incident?.issues).toContainEqual(expect.objectContaining({ code: 'INCOHERENT_QUANTITY' }));
    expect(incident).not.toHaveProperty('amount');
  });

  it('acepta cabeceras reordenadas con una columna opcional extra, ignorando la columna desconocida', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-reordered-headers.csv')));
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0]?.orderId).toBe('AI-1004');
    expect(parsed.orders[0]?.customerCountry).toBe('ES');
    expect(parsed.orders[0]).not.toHaveProperty('Extra Column');
  });

  it('lanza un error nombrando explícitamente la columna obligatoria ausente (Financial Status)', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-orders-missing-critical-header.csv'));
    expect(() => extractShopifyOrdersCsv(bytes)).toThrowError(/Financial Status/);
  });

  it('procesa un fichero con BOM UTF-8 igual que su equivalente sin BOM (mismo recuento y forma de filas)', async () => {
    const withBom = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-bom.csv')));
    const withoutBom = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    expect(withBom.orders).toHaveLength(withoutBom.orders.length);
    expect(withBom.orders.map((order) => order.orderId)).toEqual(withoutBom.orders.map((order) => order.orderId));
  });

  it('no rechaza un número de pedido sin prefijo AI (regresión — no existe regex de prefijo hoy)', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-orders-four.csv'));
    const mutated = Buffer.from(bytes.toString('utf8').replaceAll('AI-1004', '1004'), 'utf8');
    const parsed = extractShopifyOrdersCsv(mutated);
    expect(parsed.orders.some((order) => order.orderId === '1004')).toBe(true);
  });

  it('genera el mismo hash de documento para los mismos bytes y uno distinto si cambia un campo', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-orders-four.csv'));
    const first = extractShopifyOrdersCsv(bytes);
    const second = extractShopifyOrdersCsv(bytes);
    expect(first.hash).toBe(second.hash);
    const mutated = Buffer.from(bytes.toString('utf8').replace('6.99,0.00', '7.99,0.00'), 'utf8');
    const third = extractShopifyOrdersCsv(mutated);
    expect(third.hash).not.toBe(first.hash);
  });
});

describe('detectores Shopify — matriz de rechazo cruzado 3x3', () => {
  it('isShopifyOrdersCsvFile rechaza Ledger y Order Transactions', async () => {
    expect(isShopifyOrdersCsvFile(await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv')))).toBe(false);
    expect(isShopifyOrdersCsvFile(await readFile(resolve(fixtures, 'shopify-order-transactions.csv')))).toBe(false);
  });

  it('isShopifyOrderTransactionsCsvFile rechaza Orders y Ledger', async () => {
    expect(isShopifyOrderTransactionsCsvFile(await readFile(resolve(fixtures, 'shopify-orders-four.csv')))).toBe(false);
    expect(isShopifyOrderTransactionsCsvFile(await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv')))).toBe(false);
  });

  it('isShopifyPaymentsLedgerCsvFile rechaza Orders y Order Transactions', async () => {
    expect(isShopifyPaymentsLedgerCsvFile(await readFile(resolve(fixtures, 'shopify-orders-four.csv')))).toBe(false);
    expect(isShopifyPaymentsLedgerCsvFile(await readFile(resolve(fixtures, 'shopify-order-transactions.csv')))).toBe(false);
  });
});

describe('extractShopifyOrdersCsv — casos existentes', () => {
  it('captura customerCountry priorizando Shipping Country sobre Billing Country', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    expect(parsed.orders.every((order) => order.customerCountry === 'ES')).toBe(true);
  });

  it('deja customerCountry sin definir cuando el export no trae columnas de país (honesto, no fabricado)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-no-country.csv')));
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0]?.customerCountry).toBeUndefined();
  });

  it('captura customerName, totalPrice y taxAmount reales de un pedido con Billing Name/Total/Taxes', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    const order = parsed.orders.find((entry) => entry.orderId === 'AI-1001');
    expect(order?.customerName).toBe('Cliente Demo AI-1001');
    expect(order?.totalPrice).toBe(6.99);
    expect(order?.taxAmount).toBe(0.27);
  });

  it('deja customerName, totalPrice y taxAmount sin definir cuando el export no trae esas columnas (honesto, no fabricado)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-no-country.csv')));
    const order = parsed.orders[0];
    // El fixture "no-country" sí trae Billing Name/Shipping Name (con valor),
    // por lo que customerName se captura igualmente; solo Total/Taxes están ausentes.
    expect(order?.customerName).toBe('Cliente Demo AI-2001');
    expect(order?.totalPrice).toBeUndefined();
    expect(order?.taxAmount).toBeUndefined();
  });

  it('captura customerEmail y customerAddress reales, con Billing Address1/City/Zip/Province como respaldo de Shipping', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    const order = parsed.orders.find((entry) => entry.orderId === 'AI-1001');
    expect(order?.customerEmail).toBe('cliente-ai-1001@ejemplo.com');
    // El fixture no trae Shipping Address1 relleno, así que se usa el
    // respaldo de columnas Billing (Address1/City/Zip/Province).
    expect(order?.customerAddress).toBe("Calle Ejemplo 1, Palma, '07015, PM");
  });

  it('clasifica el formato mediante Lineitem requires shipping sin inferirlo por el título', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-four.csv')));
    expect(parsed.orders.every((order) => order.productNature === 'ebook')).toBe(true);
  });

  it('deja customerEmail y customerAddress sin definir cuando el export no trae esas columnas (honesto, no fabricado)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-no-country.csv')));
    const order = parsed.orders[0];
    expect(order?.customerEmail).toBeUndefined();
    expect(order?.customerAddress).toBeUndefined();
  });
});

describe('extractShopifyOrdersCsv — agrupación de líneas por Name (SHOPIFY-02)', () => {
  it('agrupa 2+ filas con el mismo Name en 1 pedido con N líneas', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-grouped-multiline.csv')));
    const grouped = parsed.groupedOrders.find((order) => order.orderId === 'AI-2001');
    expect(grouped).toBeDefined();
    expect(grouped?.lines).toHaveLength(2);
    expect(grouped?.lines.map((line) => line.sku)).toEqual(['SKU-A', 'SKU-B']);
    // Only 1 group for AI-2001, not 2 (regression guard against the
    // silent-drop bug this grouping step exists to close).
    expect(parsed.groupedOrders.filter((order) => order.orderId === 'AI-2001')).toHaveLength(1);
  });

  it('no marca ORDER_TOTAL_MISMATCH cuando el total reportado coincide con el calculado', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-grouped-multiline.csv')));
    const grouped = parsed.groupedOrders.find((order) => order.orderId === 'AI-2001');
    expect(grouped?.issues).not.toContainEqual(expect.objectContaining({ code: 'ORDER_TOTAL_MISMATCH' }));
  });

  it('marca ORDER_TOTAL_MISMATCH cuando el total reportado no coincide con el calculado, sin corregirlo automáticamente', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-grouped-multiline.csv')));
    const grouped = parsed.groupedOrders.find((order) => order.orderId === 'AI-2002');
    expect(grouped?.issues).toContainEqual(expect.objectContaining({ code: 'ORDER_TOTAL_MISMATCH' }));
    expect(grouped?.reportedTotalAmount).toBe(9);
  });

  it('conserva un pedido con Total=0 y lo marca zeroValueReview, sin descartarlo ni emitir automáticamente', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-grouped-multiline.csv')));
    const grouped = parsed.groupedOrders.find((order) => order.orderId === 'AI-2003');
    expect(grouped).toBeDefined();
    expect(grouped?.zeroValueReview).toBe(true);
    expect(grouped?.issues).not.toContainEqual(expect.objectContaining({ code: 'ORDER_TOTAL_MISMATCH' }));
  });

  it('genera fingerprint + sourceRowNumber (no un ID oficial falso) cuando falta Lineitem ID', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(fixtures, 'shopify-orders-grouped-multiline.csv')));
    const grouped = parsed.groupedOrders.find((order) => order.orderId === 'AI-2001');
    for (const line of grouped?.lines ?? []) {
      expect(line.externalLineId).toBeUndefined();
      expect(line.sourceLineFingerprint).toBeDefined();
      expect(line.sourceRowNumber).toBeGreaterThan(0);
    }
  });
});

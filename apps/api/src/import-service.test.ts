import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FilesystemStorage } from '@anclora/core/server';
import { previewImport } from './import-service';

const root = resolve(import.meta.dirname, '../../../.tmp-import-test');
afterAll(() => rm(root, { recursive: true, force: true }));

describe('previewImport', () => {
  it('custodia evidencia y devuelve preview CSV sin PII', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.status).toBe('PREVIEW_READY');
    expect(result.summary).toMatchObject({ records: 2, orderIds: ['AI-1001'] });
    expect(result.evidence.sha256).toHaveLength(64);
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it('devuelve un contrato explícito de ledger sin crear financialEvents legacy', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.connector).toBe('shopify-csv');
    expect(result.shopifyPaymentsLedger?.entries).toHaveLength(result.summary.records);
    expect(result.financialEvents).toBeUndefined();
    expect(result.commercialOrders).toBeUndefined();
  });

  it('normaliza los pedidos Shopify a commercialOrders para persistencia posterior', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-orders-four.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.connector).toBe('shopify-orders-csv');
    expect(result.commercialOrders).toHaveLength(result.summary.records);
    expect(result.commercialOrders?.every((order) => order.sourceChannel === 'SHOPIFY')).toBe(true);
    expect(result.shopifyOrders?.orders).toHaveLength(4);
    expect(result.shopifyOrders?.orders[0]).toEqual(expect.objectContaining({ orderName: expect.any(String), lines: expect.any(Array) }));
    expect(result.financialEvents).toBeUndefined();
  });

  it('detecta el XLSX de KDP por hoja conocida y devuelve la venta de 4 unidades pendiente de revisión KENP', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/kdp-orders-anonymized.xlsx'));
    const result = await previewImport({ tenantId: 'test', filename: 'KDP_Orders.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes, storage: new FilesystemStorage(root) });
    expect(result.status).toBe('PREVIEW_READY');
    expect(result.connector).toBe('kdp-xlsx');
    expect(result.summary.orderIds).toContain('9798184523026');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KENP_PENDING_REVIEW' }));
    expect(result.summary.royaltyByFormat).toContainEqual(expect.objectContaining({ format: 'impreso', orderCount: 1, averageUnitPrice: 14.99, averageProductionCost: 2.05, totalRoyalties: 27.76 }));
  });

  it('filtra pedidos Shopify ya importados cuando se provee el repositorio de dedup', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-orders-four.csv'));
    const baseline = await previewImport({ tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    const allOrderIds = baseline.summary.orderIds;
    expect(allOrderIds.length).toBeGreaterThan(0);

    const result = await previewImport(
      { tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) },
      { commercialOrdersRepository: { findExistingExternalOrderIds: async () => new Set(allOrderIds) } },
    );

    expect(result.commercialOrders).toEqual([]);
    expect(result.summary.orderIds).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.summary.alreadyImportedCount).toBe(allOrderIds.length);
    expect(result.summary.allAlreadyImported).toBe(true);
  });

  it('deja pasar solo los pedidos Shopify nuevos con solapamiento parcial', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-orders-four.csv'));
    const baseline = await previewImport({ tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    const firstOrderId = baseline.summary.orderIds[0];
    expect(firstOrderId).toBeDefined();

    const result = await previewImport(
      { tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) },
      { commercialOrdersRepository: { findExistingExternalOrderIds: async () => new Set([firstOrderId!]) } },
    );

    expect(result.summary.orderIds).not.toContain(firstOrderId);
    expect(result.commercialOrders?.every((order) => order.externalOrderId !== firstOrderId)).toBe(true);
    expect(result.summary.alreadyImportedCount).toBe(1);
    expect(result.summary.allAlreadyImported).toBe(false);
  });

  it('sin dependencia de dedup, el comportamiento es idéntico al actual', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-orders-four.csv'));
    const withoutDeps = await previewImport({ tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    const withEmptyDeps = await previewImport({ tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) }, {});

    expect(withoutDeps.summary.alreadyImportedCount).toBeUndefined();
    expect(withoutDeps.summary.allAlreadyImported).toBeUndefined();
    expect(withEmptyDeps.summary.alreadyImportedCount).toBeUndefined();
    expect(withEmptyDeps.summary.allAlreadyImported).toBeUndefined();
    expect(withEmptyDeps.commercialOrders).toEqual(withoutDeps.commercialOrders);
    expect(withEmptyDeps.summary.orderIds).toEqual(withoutDeps.summary.orderIds);
  });

  it('filtra líneas de royalty KDP ya importadas por businessKey', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/kdp-orders-anonymized.xlsx'));
    const baseline = await previewImport({ tenantId: 'test', filename: 'KDP_Orders.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes, storage: new FilesystemStorage(root) });
    const allBusinessKeys = baseline.royalty!.lines.map((line) => line.businessKey);
    expect(allBusinessKeys.length).toBeGreaterThan(0);

    const result = await previewImport(
      { tenantId: 'test', filename: 'KDP_Orders.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes, storage: new FilesystemStorage(root) },
      { royaltyRepository: { findExistingBusinessKeys: async () => new Set(allBusinessKeys) } },
    );

    expect(result.royalty?.lines).toEqual([]);
    expect(result.summary.alreadyImportedCount).toBe(allBusinessKeys.length);
    expect(result.summary.allAlreadyImported).toBe(true);
  });

  it('detecta el CSV de Order Transactions y normaliza orderTransactions para persistencia posterior (SHOPIFY-03)', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-order-transactions.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'order-transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.connector).toBe('shopify-order-transactions-csv');
    expect(result.orderTransactions).toHaveLength(2);
    expect(result.shopifyOrderTransactions?.events).toHaveLength(2);
    expect(result.orderTransactions?.every((row) => row.shopifyOrderName === 'AI-1001')).toBe(true);
    // shopifyOrderId carries the raw numeric Shopify "Order" value, distinct from shopifyOrderName (the real join key).
    expect(result.orderTransactions?.every((row) => row.shopifyOrderId === '9000000000001')).toBe(true);
    expect(result.commercialOrders).toBeUndefined();
    expect(result.financialEvents).toBeUndefined();
  });

  it('enriquece el preview de transacciones de pedido con comprador existente', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-order-transactions.csv'));
    const findPreviewByExternalOrderIds = vi.fn().mockResolvedValue([
      {
        externalOrderId: 'AI-1001',
        customerName: 'Ana García',
        customerEmail: 'ana@example.test',
        customerAddress: null,
        customerCountry: 'ES',
        customerType: 'B2C',
      },
    ]);
    const result = await previewImport(
      { tenantId: 'test', filename: 'order-transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) },
      {
        commercialOrdersRepository: {
          findExistingExternalOrderIds: async () => new Set(),
          findPreviewByExternalOrderIds,
        },
      },
    );

    expect(findPreviewByExternalOrderIds).toHaveBeenCalledWith('test', 'SHOPIFY', ['AI-1001']);
    expect(result.orderTransactions?.[0]).not.toHaveProperty('customerEmail');
    expect(result.shopifyOrderTransactions?.events[0]).toMatchObject({
      shopifyOrderName: 'AI-1001',
      customerName: 'Ana García',
      customerEmail: 'ana@example.test',
      customerCountry: 'ES',
    });
  });

  it('normaliza Shopify Payments Ledger sin duplicarlo en financialEvents legacy', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.connector).toBe('shopify-csv');
    expect(result.paymentsLedger).toHaveLength(result.summary.records);
    expect(result.paymentsLedger?.every((row) => row.shopifyOrderName === 'AI-1001')).toBe(true);
    expect(result.shopifyPaymentsLedger?.entries).toEqual(result.paymentsLedger);
    expect(result.financialEvents).toBeUndefined();
  });

  it('enriquece el preview de Shopify Payments con comprador existente', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const result = await previewImport(
      { tenantId: 'test', filename: 'transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) },
      {
        commercialOrdersRepository: {
          findExistingExternalOrderIds: async () => new Set(),
          findPreviewByExternalOrderIds: async () => [
            {
              externalOrderId: 'AI-1001',
              customerName: 'Ana García',
              customerEmail: 'ana@example.test',
              customerAddress: null,
              customerCountry: 'ES',
              customerType: 'B2C',
            },
          ],
        },
      },
    );

    expect(result.paymentsLedger?.[0]).not.toHaveProperty('customerEmail');
    expect(result.shopifyPaymentsLedger?.entries[0]).toMatchObject({
      shopifyOrderName: 'AI-1001',
      customerName: 'Ana García',
      customerEmail: 'ana@example.test',
    });
  });

  it('no custodia contenido que falle la validación estructural', async () => {
    let writes = 0;
    await expect(previewImport({
      tenantId: 'test',
      filename: 'falso.csv',
      mimeType: 'text/csv',
      bytes: new TextEncoder().encode('contenido no CSV'),
      storage: {
        put: async () => { writes += 1; throw new Error('No debería escribirse'); },
        get: async () => new Uint8Array(),
      },
    })).rejects.toThrow();
    expect(writes).toBe(0);
  });
});

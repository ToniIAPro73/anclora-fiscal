import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
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

  it('normaliza las transacciones Shopify a financialEvents para persistencia posterior', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.connector).toBe('shopify-csv');
    expect(result.financialEvents).toHaveLength(result.summary.records);
    expect(result.financialEvents?.every((event) => event.sourceChannel === 'SHOPIFY')).toBe(true);
    expect(result.commercialOrders).toBeUndefined();
  });

  it('normaliza los pedidos Shopify a commercialOrders para persistencia posterior', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-orders-four.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'pedido-shopify.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.connector).toBe('shopify-orders-csv');
    expect(result.commercialOrders).toHaveLength(result.summary.records);
    expect(result.commercialOrders?.every((order) => order.sourceChannel === 'SHOPIFY')).toBe(true);
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

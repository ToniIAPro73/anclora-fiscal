import { describe, expect, it, vi } from 'vitest';
import { ImportMetadataCipher, ImportPreviewPersistenceService } from './import-preview-persistence';

describe('ImportPreviewPersistenceService', () => {
  it('cifra el nombre y delega todos los datos del preview al repositorio', async () => {
    const persist = vi.fn().mockResolvedValue({ jobId: 'job-1', duplicate: false });
    const service = new ImportPreviewPersistenceService(
      { persist },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
    );
    const preview = {
      jobId: 'job-1',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'a'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 1, issues: 1, orderIds: ['#1'] },
      issues: [{ code: 'VAT_ZERO', severity: 'HIGH', message: 'Revisar IVA', row: 2 }],
    };

    await expect(service.persist('01977d43-75de-7000-8000-000000000010', 'clientes-2026.csv', preview)).resolves.toEqual({ jobId: 'job-1', duplicate: false });
    const persisted = persist.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      jobId: 'job-1',
      connectorId: 'shopify-csv',
      importerVersion: 'shopify-csv@0.1.0',
      evidence: preview.evidence,
      issues: preview.issues,
    });
    expect(persisted.originalNameEncrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(persisted.originalNameEncrypted).not.toContain('clientes-2026.csv');
  });

  it('persist() NO crea pedidos, eventos ni líneas de regalías aunque el preview los incluya (FASE 03: solo confirm() puede persistir datos fiscales)', async () => {
    const persist = vi.fn().mockResolvedValue({ jobId: 'job-2', importFileId: 'file-2', duplicate: false });
    const royaltyPersist = vi.fn();
    const commercialOrdersCreateMany = vi.fn();
    const financialEventsCreateMany = vi.fn();
    const service = new ImportPreviewPersistenceService(
      { persist },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      { persist: royaltyPersist },
      { createMany: commercialOrdersCreateMany },
      { createMany: financialEventsCreateMany },
    );
    const statement = { hash: 'b'.repeat(64), sourceConnector: 'kdp' as const, currency: 'EUR', periods: ['2026-06'], totalRoyalties: 6.99, lineCount: 1 };
    const lines = [{ businessKey: 'k1', classification: 'ebook' as const, status: 'RECOGNIZED' as const, period: '2026-06', isbnOrAsin: 'B1', amount: 6.99, currency: 'EUR', sourceSheet: 'Regalías de eBooks' }];
    const preview = {
      jobId: 'job-2',
      status: 'PREVIEW_READY' as const,
      connector: 'kdp-xlsx' as const,
      evidence: { key: 'evidence/key', sha256: 'c'.repeat(64), size: 42, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      summary: { records: 1, issues: 0, orderIds: ['B1'] },
      issues: [],
      royalty: { statement, lines },
      commercialOrders: [{ sourceChannel: 'SHOPIFY', externalOrderId: 'AI-1001', commercialDate: new Date('2026-07-01') }],
      financialEvents: [{ sourceChannel: 'SHOPIFY', externalEventId: 'evt-1', eventType: 'charge', amount: '10', feeAmount: '1', netAmount: '9', currency: 'EUR', occurredAt: new Date('2026-07-01') }],
    };

    await service.persist('01977d43-75de-7000-8000-000000000010', 'kdp.xlsx', preview);

    expect(royaltyPersist).not.toHaveBeenCalled();
    expect(commercialOrdersCreateMany).not.toHaveBeenCalled();
    expect(financialEventsCreateMany).not.toHaveBeenCalled();
  });
});

describe('ImportPreviewPersistenceService.persistFiscalRecords (FASE 03, confirm-exclusive)', () => {
  it('persiste las líneas de regalías cuando el preview incluye datos KDP y devuelve createdRecordIds', async () => {
    const royaltyPersist = vi.fn().mockResolvedValue({ statementId: 'stmt-1', duplicate: false });
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      { persist: royaltyPersist },
    );
    const statement = { hash: 'b'.repeat(64), sourceConnector: 'kdp' as const, currency: 'EUR', periods: ['2026-06'], totalRoyalties: 6.99, lineCount: 1 };
    const lines = [{ businessKey: 'k1', classification: 'ebook' as const, status: 'RECOGNIZED' as const, period: '2026-06', isbnOrAsin: 'B1', amount: 6.99, currency: 'EUR', sourceSheet: 'Regalías de eBooks' }];
    const preview = {
      jobId: 'job-2',
      status: 'PREVIEW_READY' as const,
      connector: 'kdp-xlsx' as const,
      evidence: { key: 'evidence/key', sha256: 'c'.repeat(64), size: 42, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      summary: { records: 1, issues: 0, orderIds: ['B1'] },
      issues: [],
      royalty: { statement, lines },
    };

    const result = await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-2', preview);
    expect(royaltyPersist).toHaveBeenCalledWith({ tenantId: '01977d43-75de-7000-8000-000000000010', importFileId: 'file-2', statement, lines });
    expect(result).toEqual({ createdRecordIds: { royaltyStatements: ['stmt-1'] } });
  });

  it('persiste los pedidos comerciales y eventos financieros normalizados cuando el preview los incluye y devuelve sus ids', async () => {
    const commercialOrdersCreateMany = vi.fn().mockResolvedValue([{ id: 'order-row-1' }]);
    const financialEventsCreateMany = vi.fn().mockResolvedValue([{ id: 'event-row-1' }]);
    const createForConfirmedOrder = vi.fn();
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      undefined,
      { createMany: commercialOrdersCreateMany },
      { createMany: financialEventsCreateMany },
      { createForConfirmedOrder },
    );
    const commercialOrders = [{ sourceChannel: 'SHOPIFY', externalOrderId: 'AI-1001', commercialDate: new Date('2026-07-01') }];
    const financialEvents = [{ sourceChannel: 'SHOPIFY', externalEventId: 'evt-1', eventType: 'charge', amount: '10', feeAmount: '1', netAmount: '9', currency: 'EUR', occurredAt: new Date('2026-07-01') }];
    const preview = {
      jobId: 'job-4',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-orders-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'e'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 1, issues: 0, orderIds: ['AI-1001'] },
      issues: [],
      commercialOrders,
      financialEvents,
    };

    const result = await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-4', preview);

    expect(commercialOrdersCreateMany).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', commercialOrders);
    expect(financialEventsCreateMany).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', financialEvents);
    expect(createForConfirmedOrder).not.toHaveBeenCalled();
    expect(result).toEqual({ createdRecordIds: { commercialOrders: ['order-row-1'], financialEvents: ['event-row-1'] } });
  });

  it('SHOPIFY-06: dispara la creación de la operación fiscal solo para pedidos con financialStatus confirmado (paid), no para pedidos pendientes', async () => {
    const commercialOrdersCreateMany = vi.fn().mockResolvedValue([
      { id: 'order-row-paid', externalOrderId: 'AI-1001' },
      { id: 'order-row-pending', externalOrderId: 'AI-1002' },
    ]);
    const createForConfirmedOrder = vi.fn().mockResolvedValue({ status: 'CREATED', canonicalOperationId: 'op-1' });
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      undefined,
      { createMany: commercialOrdersCreateMany },
      undefined,
      { createForConfirmedOrder },
    );
    const commercialOrders = [
      { sourceChannel: 'SHOPIFY', externalOrderId: 'AI-1001', financialStatus: 'paid', commercialDate: new Date('2026-07-01') },
      { sourceChannel: 'SHOPIFY', externalOrderId: 'AI-1002', financialStatus: 'pending', commercialDate: new Date('2026-07-01') },
    ];
    const preview = {
      jobId: 'job-confirmed',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-orders-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'e'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 2, issues: 0, orderIds: ['AI-1001', 'AI-1002'] },
      issues: [],
      commercialOrders,
    };

    await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-confirmed', preview);

    expect(createForConfirmedOrder).toHaveBeenCalledTimes(1);
    expect(createForConfirmedOrder).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'order-row-paid');
  });

  it('SHOPIFY-06: también dispara para pedidos reembolsados total o parcialmente (el cargo ya se confirmó), pero no para voided', async () => {
    const commercialOrdersCreateMany = vi.fn().mockResolvedValue([
      { id: 'order-row-refunded', externalOrderId: 'AI-2001' },
      { id: 'order-row-partial', externalOrderId: 'AI-2002' },
      { id: 'order-row-voided', externalOrderId: 'AI-2003' },
    ]);
    const createForConfirmedOrder = vi.fn().mockResolvedValue({ status: 'CREATED', canonicalOperationId: 'op-1' });
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      undefined,
      { createMany: commercialOrdersCreateMany },
      undefined,
      { createForConfirmedOrder },
    );
    const commercialOrders = [
      { sourceChannel: 'SHOPIFY', externalOrderId: 'AI-2001', financialStatus: 'refunded', commercialDate: new Date('2026-07-01') },
      { sourceChannel: 'SHOPIFY', externalOrderId: 'AI-2002', financialStatus: 'partially_refunded', commercialDate: new Date('2026-07-01') },
      { sourceChannel: 'SHOPIFY', externalOrderId: 'AI-2003', financialStatus: 'voided', commercialDate: new Date('2026-07-01') },
    ];
    const preview = {
      jobId: 'job-refunded',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-orders-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'f'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 3, issues: 0, orderIds: ['AI-2001', 'AI-2002', 'AI-2003'] },
      issues: [],
      commercialOrders,
    };

    await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-refunded', preview);

    expect(createForConfirmedOrder).toHaveBeenCalledTimes(2);
    expect(createForConfirmedOrder).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'order-row-refunded');
    expect(createForConfirmedOrder).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'order-row-partial');
  });

  it('no persiste nada cuando el preview no incluye datos fiscales', async () => {
    const royaltyPersist = vi.fn();
    const commercialOrdersCreateMany = vi.fn();
    const financialEventsCreateMany = vi.fn();
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      { persist: royaltyPersist },
      { createMany: commercialOrdersCreateMany },
      { createMany: financialEventsCreateMany },
    );
    const preview = {
      jobId: 'job-5',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-orders-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'f'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 1, issues: 0, orderIds: ['AI-1001'] },
      issues: [],
    };

    const result = await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-5', preview);

    expect(royaltyPersist).not.toHaveBeenCalled();
    expect(commercialOrdersCreateMany).not.toHaveBeenCalled();
    expect(financialEventsCreateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ createdRecordIds: {} });
  });
});

describe('ImportPreviewPersistenceService.persistFiscalRecords — SHOPIFY-03 payment/settlement evidence', () => {
  it('resuelve commercial_order_id vía shopify_order_name (no el shopify_order_id numérico) antes de persistir orderTransactions', async () => {
    const findByExternalOrderId = vi.fn().mockResolvedValue({ id: 'order-row-1' });
    const shopifyOrderPaymentEventsCreateMany = vi.fn().mockResolvedValue([{ id: 'event-row-1' }]);
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      undefined,
      { createMany: vi.fn(), findByExternalOrderId },
      undefined,
      undefined,
      { createMany: shopifyOrderPaymentEventsCreateMany },
    );
    const preview = {
      jobId: 'job-6',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-order-transactions-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'a'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 1, issues: 0, orderIds: ['AI-1001'] },
      issues: [],
      orderTransactions: [{ externalEventKey: 'evt-key', shopifyOrderId: '9000000000001', shopifyOrderName: 'AI-1001', kind: 'sale', gateway: 'shopify_payments', status: 'success', amount: '6.99', currency: 'EUR', occurredAt: new Date('2026-07-01'), minimizedSnapshot: {} }],
    };

    const result = await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-6', preview);

    expect(findByExternalOrderId).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'AI-1001');
    const persistedRows = shopifyOrderPaymentEventsCreateMany.mock.calls[0]?.[2];
    expect(persistedRows[0]).toMatchObject({ commercialOrderId: 'order-row-1', shopifyOrderId: '9000000000001', shopifyOrderName: 'AI-1001' });
    expect(result).toEqual({ createdRecordIds: { shopifyOrderPaymentEvents: ['event-row-1'] } });
  });

  it('reconstruye enlaces de evidencia tras confirmar cualquier stream Shopify sin invocar matching legacy', async () => {
    const linkTenantEvidence = vi.fn().mockResolvedValue(undefined);
    const createForConfirmedOrder = vi.fn();
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      undefined,
      { createMany: vi.fn().mockResolvedValue([]) },
      undefined,
      { createForConfirmedOrder },
      undefined,
      undefined,
      { linkTenantEvidence },
    );
    const preview = {
      jobId: 'job-links', status: 'PREVIEW_READY' as const, connector: 'shopify-orders-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'd'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 0, issues: 0, orderIds: [] }, issues: [], commercialOrders: [],
    };

    await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-links', preview);

    expect(linkTenantEvidence).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', { windowDays: 7 });
    expect(createForConfirmedOrder).not.toHaveBeenCalled();
  });

  it('ORDER_EVIDENCE_MISSING: persiste commercial_order_id null cuando shopify_order_name no resuelve, sin bloquear el import', async () => {
    const findByExternalOrderId = vi.fn().mockResolvedValue(undefined);
    const shopifyOrderPaymentEventsCreateMany = vi.fn().mockResolvedValue([{ id: 'event-row-2' }]);
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      undefined,
      { createMany: vi.fn(), findByExternalOrderId },
      undefined,
      undefined,
      { createMany: shopifyOrderPaymentEventsCreateMany },
    );
    const preview = {
      jobId: 'job-7',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-order-transactions-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'b'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 1, issues: 0, orderIds: ['AI-9999'] },
      issues: [],
      orderTransactions: [{ externalEventKey: 'evt-key-2', shopifyOrderId: '9000000000009', shopifyOrderName: 'AI-9999', kind: 'sale', gateway: 'shopify_payments', status: 'success', amount: '6.99', currency: 'EUR', occurredAt: new Date('2026-07-01'), minimizedSnapshot: {} }],
    };

    await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-7', preview);

    const persistedRows = shopifyOrderPaymentEventsCreateMany.mock.calls[0]?.[2];
    expect(persistedRows[0]).toMatchObject({ commercialOrderId: null });
  });

  it('persiste paymentsLedger resolviendo commercial_order_id por shopify_order_name', async () => {
    const findByExternalOrderId = vi.fn().mockResolvedValue({ id: 'order-row-2' });
    const shopifyPaymentsLedgerCreateMany = vi.fn().mockResolvedValue({ entries: [{ id: 'ledger-row-1' }] });
    const service = new ImportPreviewPersistenceService(
      { persist: vi.fn() },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      undefined,
      { createMany: vi.fn(), findByExternalOrderId },
      undefined,
      undefined,
      undefined,
      { createMany: shopifyPaymentsLedgerCreateMany },
    );
    const preview = {
      jobId: 'job-8',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'c'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 1, issues: 0, orderIds: ['AI-1001'] },
      issues: [],
      paymentsLedger: [{ externalEntryKey: 'entry-key', shopifyOrderName: 'AI-1001', checkoutReference: '#1', entryType: 'charge', amount: '6.99', feeAmount: '0.45', netAmount: '6.54', currency: 'EUR', payoutStatus: 'pending', minimizedSnapshot: {} }],
    };

    const result = await service.persistFiscalRecords('01977d43-75de-7000-8000-000000000010', 'file-8', preview);

    expect(findByExternalOrderId).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'AI-1001');
    const persistedRows = shopifyPaymentsLedgerCreateMany.mock.calls[0]?.[2];
    expect(persistedRows[0]).toMatchObject({ commercialOrderId: 'order-row-2' });
    expect(result).toEqual({ createdRecordIds: { shopifyPaymentsLedgerEntries: ['ledger-row-1'] } });
  });
});

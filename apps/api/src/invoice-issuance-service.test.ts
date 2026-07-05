import { describe, expect, it, vi } from 'vitest';
import { InvoiceIssuanceService } from './invoice-issuance-service';

const tenantId = '01977d43-75de-7000-8000-000000000010';

class InMemoryStorage {
  async put() {
    return { key: 'test-key', sha256: 'test-sha', size: 0, mimeType: 'application/pdf' };
  }
  async get(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }
}

describe('InvoiceIssuanceService', () => {
  it('emite factura solo con issue() para una venta normal (sin refund flag)', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-1' }, alreadyIssued: false });
    const rectify = vi.fn();
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify }, storage: new InMemoryStorage() });

    const result = await service.runInvoiceIssuanceForOperation(tenantId, { id: 'op-1', anomalyFlags: [] });

    expect(issue).toHaveBeenCalledWith({ tenantId, actorId: null, canonicalOperationId: 'op-1', storage: expect.anything() });
    expect(rectify).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'ISSUED', documentId: 'doc-1' });
  });

  it('emite y rectifica cuando anomalyFlags incluye FULL_REFUND_NET_ZERO y issue() tuvo éxito', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-2' }, alreadyIssued: false });
    const rectify = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-2-rect' }, alreadyRectified: false });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify }, storage: new InMemoryStorage() });

    const result = await service.runInvoiceIssuanceForOperation(tenantId, { id: 'op-2', anomalyFlags: ['FULL_REFUND_NET_ZERO', 'RECTIFICATION_REVIEW_REQUIRED'] });

    expect(rectify).toHaveBeenCalledWith({ tenantId, actorId: null, fiscalDocumentId: 'doc-2', storage: expect.anything() });
    expect(result).toEqual({
      status: 'ISSUED',
      documentId: 'doc-2',
      rectification: { status: 'RECTIFIED', documentId: 'doc-2-rect' },
    });
  });

  it('devuelve SKIPPED sin intentar rectify() cuando issue() devuelve TAX_DECISION_MISSING', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: false, reason: 'TAX_DECISION_MISSING' });
    const rectify = vi.fn();
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify }, storage: new InMemoryStorage() });

    const result = await service.runInvoiceIssuanceForOperation(tenantId, { id: 'op-3', anomalyFlags: ['FULL_REFUND_NET_ZERO'] });

    expect(rectify).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'SKIPPED', reason: 'TAX_DECISION_MISSING' });
  });

  it('es idempotente: re-ejecutar sobre una operación ya emitida y ya rectificada no lanza y refleja ambos estados "already"', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-4' }, alreadyIssued: true });
    const rectify = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-4-rect' }, alreadyRectified: true });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify }, storage: new InMemoryStorage() });

    const result = await service.runInvoiceIssuanceForOperation(tenantId, { id: 'op-4', anomalyFlags: ['FULL_REFUND_NET_ZERO'] });

    expect(result).toEqual({
      status: 'ALREADY_ISSUED',
      documentId: 'doc-4',
      rectification: { status: 'ALREADY_RECTIFIED', documentId: 'doc-4-rect' },
    });
  });

  it('no lanza cuando rectify() falla tras un issue() exitoso (no fatal)', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-5' }, alreadyIssued: false });
    const rectify = vi.fn().mockResolvedValue({ ok: false, reason: 'INVALID_DOCUMENT_STATE' });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify }, storage: new InMemoryStorage() });

    await expect(service.runInvoiceIssuanceForOperation(tenantId, { id: 'op-5', anomalyFlags: ['FULL_REFUND_NET_ZERO'] }))
      .resolves.toEqual({ status: 'ISSUED', documentId: 'doc-5' });
  });
});

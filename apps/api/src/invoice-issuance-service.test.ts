import { describe, expect, it, vi } from 'vitest';
import { evaluateManualIssuanceGate, InvoiceIssuanceService, ZERO_VALUE_REVIEW_FISCAL_STATUS, type ManualIssuanceOperation } from './invoice-issuance-service';

const tenantId = '01977d43-75de-7000-8000-000000000010';
const actorId = '01977d43-75de-7000-8000-000000000099';

class InMemoryStorage {
  async put() {
    return { key: 'test-key', sha256: 'test-sha', size: 0, mimeType: 'application/pdf' };
  }
  async get(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }
}

function fullyEligibleOperation(overrides: Partial<ManualIssuanceOperation> = {}): ManualIssuanceOperation {
  return {
    id: 'op-1',
    fiscalStatus: 'PENDING',
    hasFiscalConfiguration: true,
    hasFiscalProfile: true,
    hasOrderEvidence: true,
    hasTransactionsEvidence: true,
    hasLedgerEvidence: true,
    hasTaxDecision: true,
    ...overrides,
  };
}

describe('evaluateManualIssuanceGate (SHOPIFY-06 manual issuance gating)', () => {
  it('bloquea cuando el rol no tiene el permiso documents:issue (p.ej. REVIEWER)', () => {
    expect(evaluateManualIssuanceGate('REVIEWER', fullyEligibleOperation())).toEqual({ allowed: false, reason: 'ROLE_NOT_AUTHORIZED' });
  });

  it('permite a FISCAL_OPERATOR y ADMIN, que sí tienen documents:issue', () => {
    expect(evaluateManualIssuanceGate('FISCAL_OPERATOR', fullyEligibleOperation())).toEqual({ allowed: true });
    expect(evaluateManualIssuanceGate('ADMIN', fullyEligibleOperation())).toEqual({ allowed: true });
  });

  it('excluye pedidos con fiscalStatus ZERO_VALUE_REVIEW aunque el resto de condiciones se cumplan', () => {
    const operation = fullyEligibleOperation({ fiscalStatus: ZERO_VALUE_REVIEW_FISCAL_STATUS });
    expect(evaluateManualIssuanceGate('ADMIN', operation)).toEqual({ allowed: false, reason: 'ZERO_VALUE_REVIEW_EXCLUDED' });
  });

  it('bloquea cuando falta configuración fiscal mínima', () => {
    const operation = fullyEligibleOperation({ hasFiscalConfiguration: false });
    expect(evaluateManualIssuanceGate('ADMIN', operation)).toEqual({ allowed: false, reason: 'FISCAL_CONFIGURATION_INCOMPLETE' });
  });

  it('bloquea cuando falta el perfil fiscal', () => {
    const operation = fullyEligibleOperation({ hasFiscalProfile: false });
    expect(evaluateManualIssuanceGate('ADMIN', operation)).toEqual({ allowed: false, reason: 'FISCAL_PROFILE_MISSING' });
  });

  it.each([
    ['hasOrderEvidence' as const],
    ['hasTransactionsEvidence' as const],
  ])('bloquea por evidencia insuficiente cuando falta %s (orden + transacción confirmada)', (flag) => {
    const operation = fullyEligibleOperation({ [flag]: false });
    expect(evaluateManualIssuanceGate('ADMIN', operation)).toEqual({ allowed: false, reason: 'INSUFFICIENT_EVIDENCE' });
  });

  it('no exige ledger ni payout para emitir cuando existe transacción Shopify confirmada', () => {
    expect(evaluateManualIssuanceGate('ADMIN', fullyEligibleOperation({ hasLedgerEvidence: false }))).toEqual({ allowed: true });
  });

  it('bloquea cuando no hay una decisión fiscal determinada', () => {
    const operation = fullyEligibleOperation({ hasTaxDecision: false });
    expect(evaluateManualIssuanceGate('ADMIN', operation)).toEqual({ allowed: false, reason: 'TAX_DECISION_MISSING' });
  });
});

describe('InvoiceIssuanceService.issueManually (explicit, role-gated action)', () => {
  it('no llama al repositorio y devuelve BLOCKED cuando la puerta de gating rechaza la solicitud', async () => {
    const issue = vi.fn();
    const rectify = vi.fn();
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify }, storage: new InMemoryStorage() });

    const result = await service.issueManually({ tenantId, actorId, role: 'REVIEWER', operation: fullyEligibleOperation() });

    expect(issue).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'BLOCKED', reason: 'ROLE_NOT_AUTHORIZED' });
  });

  it('emite la factura cuando la puerta de gating permite la solicitud, pasando el actorId real (no null)', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-1' }, alreadyIssued: false });
    const rectify = vi.fn();
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify }, storage: new InMemoryStorage() });

    const result = await service.issueManually({ tenantId, actorId, role: 'FISCAL_OPERATOR', operation: fullyEligibleOperation() });

    expect(issue).toHaveBeenCalledWith({ tenantId, actorId, canonicalOperationId: 'op-1', storage: expect.anything() });
    expect(result).toEqual({ status: 'ISSUED', documentId: 'doc-1' });
  });

  it('devuelve ALREADY_ISSUED cuando el repositorio reporta alreadyIssued', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-2' }, alreadyIssued: true });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify: vi.fn() }, storage: new InMemoryStorage() });

    const result = await service.issueManually({ tenantId, actorId, role: 'ADMIN', operation: fullyEligibleOperation() });

    expect(result).toEqual({ status: 'ALREADY_ISSUED', documentId: 'doc-2' });
  });

  it('propaga el fallo del repositorio como ISSUE_FAILED cuando la puerta permite pero issue() falla (p.ej. carrera con config incompleta)', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: false, reason: 'FISCAL_CONFIGURATION_INCOMPLETE' });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify: vi.fn() }, storage: new InMemoryStorage() });

    const result = await service.issueManually({ tenantId, actorId, role: 'ADMIN', operation: fullyEligibleOperation() });

    expect(result).toEqual({ status: 'ISSUE_FAILED', reason: 'FISCAL_CONFIGURATION_INCOMPLETE' });
  });
});

describe('InvoiceIssuanceService.issueAutomatically (confirmed Shopify payment)', () => {
  it('emite con actorId null y sin exigir ledger/payout', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-auto' }, alreadyIssued: false });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify: vi.fn() }, storage: new InMemoryStorage() });

    const result = await service.issueAutomatically({ tenantId, operation: fullyEligibleOperation({ hasLedgerEvidence: false }) });

    expect(issue).toHaveBeenCalledWith({ tenantId, actorId: null, canonicalOperationId: 'op-1', storage: expect.anything() });
    expect(result).toEqual({ status: 'ISSUED', documentId: 'doc-auto' });
  });

  it('bloquea automáticamente si no hay transacción confirmada', async () => {
    const issue = vi.fn();
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue, rectify: vi.fn() }, storage: new InMemoryStorage() });

    const result = await service.issueAutomatically({ tenantId, operation: fullyEligibleOperation({ hasTransactionsEvidence: false }) });

    expect(issue).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'BLOCKED', reason: 'INSUFFICIENT_EVIDENCE' });
  });
});

describe('InvoiceIssuanceService.handleRefund (refund branching)', () => {
  it('rutea a la cola de incidencias/revisión cuando el pedido reembolsado no tiene factura previa', async () => {
    const rectify = vi.fn();
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue: vi.fn(), rectify }, storage: new InMemoryStorage() });

    const result = await service.handleRefund({ tenantId, actorId, operation: { id: 'op-refund-1', existingFiscalDocumentId: null } });

    expect(rectify).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'ROUTED_TO_REVIEW', operationId: 'op-refund-1' });
  });

  it('genera una rectificación enlazada cuando ya existe una factura emitida (nunca edita la original)', async () => {
    const rectify = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-1-rect' }, alreadyRectified: false });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue: vi.fn(), rectify }, storage: new InMemoryStorage() });

    const result = await service.handleRefund({ tenantId, actorId, operation: { id: 'op-refund-2', existingFiscalDocumentId: 'doc-1' } });

    expect(rectify).toHaveBeenCalledWith({ tenantId, actorId, fiscalDocumentId: 'doc-1', storage: expect.anything() });
    expect(result).toEqual({ status: 'RECTIFIED', documentId: 'doc-1-rect' });
  });

  it('devuelve ALREADY_RECTIFIED cuando el repositorio reporta alreadyRectified (idempotente)', async () => {
    const rectify = vi.fn().mockResolvedValue({ ok: true, document: { id: 'doc-1-rect' }, alreadyRectified: true });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue: vi.fn(), rectify }, storage: new InMemoryStorage() });

    const result = await service.handleRefund({ tenantId, actorId, operation: { id: 'op-refund-3', existingFiscalDocumentId: 'doc-2' } });

    expect(result).toEqual({ status: 'ALREADY_RECTIFIED', documentId: 'doc-1-rect' });
  });

  it('propaga RECTIFICATION_FAILED cuando el documento no puede rectificarse en su estado actual', async () => {
    const rectify = vi.fn().mockResolvedValue({ ok: false, reason: 'INVALID_DOCUMENT_STATE' });
    const service = new InvoiceIssuanceService({ fiscalDocumentsRepository: { issue: vi.fn(), rectify }, storage: new InMemoryStorage() });

    const result = await service.handleRefund({ tenantId, actorId, operation: { id: 'op-refund-4', existingFiscalDocumentId: 'doc-3' } });

    expect(result).toEqual({ status: 'RECTIFICATION_FAILED', reason: 'INVALID_DOCUMENT_STATE' });
  });
});

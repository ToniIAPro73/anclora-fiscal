'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@anclora/ui';
import { emptyOperationFilters, OperationFilters, operationFiltersQuery, type OperationFilterValues } from '../components/operation-filters';
import { channelLabel, statusLabel } from '../lib/display-labels';

interface Operation {
  id: string;
  sourceChannel: string;
  sourceOrderId: string | null;
  operationType: string;
  operationStatus: string;
  reviewStatus: string;
  reconciliationStatus: string;
  verifactuStatus: string;
  grossAmount: string | null;
  platformFeeAmount: string | null;
  netAmount: string | null;
  originalCurrency: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  customerCountry?: string | null;
  customerType?: string | null;
  issuedInvoiceId?: string | null;
  issuedInvoiceNumber?: string | null;
  issuedInvoiceDocumentType?: string | null;
  issuedInvoiceTotalAmount?: string | null;
  issuedInvoiceCurrency?: string | null;
  createdAt: string;
  anomalyFlags?: string[];
}

const RECTIFICATION_REVIEW_FLAG = 'RECTIFICATION_REVIEW_REQUIRED';
interface OperationsPage { items: Operation[]; page: number; pageSize: number; total: number }

interface FiscalDocument {
  id: string;
  number: string;
  documentType?: string | null;
  status: string;
  taxBase: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
}

type IssueOutcome =
  | { kind: 'success'; document: FiscalDocument; alreadyIssued: boolean }
  | { kind: 'error'; message: string };

type InvoiceView = 'PENDING' | 'BLOCKED' | 'ISSUED';

function invoiceErrorMessage(body: { code?: string; message?: string }): string {
  if (body.code === 'TAX_DECISION_MISSING') return 'Esta operación necesita una decisión fiscal antes de poder facturarse.';
  if (body.code === 'FISCAL_CONFIGURATION_INCOMPLETE') return 'Completa la configuración fiscal: emisor, serie de facturación y perfil de producto.';
  if (body.code === 'OPERATION_NOT_FOUND') return 'La operación no existe o ya no está disponible para facturación.';
  return body.message ?? 'No se pudo emitir la factura.';
}

function buyerLabel(operation: Operation): string {
  return operation.customerName || operation.customerEmail || 'Comprador no informado';
}

function documentDownloadHref(documentId: string) {
  return `/api/v1/fiscal-documents/${encodeURIComponent(documentId)}/download`;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isReadyForIssuance(operation: Operation): boolean {
  return operation.operationStatus === 'READY_FOR_INVOICING'
    || operation.operationStatus === 'LISTA_PARA_FACTURAR';
}

function operationBlocker(operation: Operation): string | null {
  if (operation.issuedInvoiceId) return null;
  if (operation.anomalyFlags?.includes(RECTIFICATION_REVIEW_FLAG)) return 'Revisar el reembolso antes de emitir o rectificar.';
  if (isReadyForIssuance(operation)) return null;
  if (operation.operationStatus.includes('DECISION_FISCAL')) return 'Falta completar la decisión fiscal.';
  if (operation.reconciliationStatus !== 'MATCHED' && operation.reconciliationStatus !== 'CONCILIADA') {
    return 'El cruce de evidencias internas todavía no está resuelto.';
  }
  return `Estado actual: ${statusLabel(operation.operationStatus)}.`;
}

function effectiveDocument(operation: Operation, outcome?: IssueOutcome): FiscalDocument | null {
  if (outcome?.kind === 'success') return outcome.document;
  if (!operation.issuedInvoiceId) return null;
  return {
    id: operation.issuedInvoiceId,
    number: operation.issuedInvoiceNumber ?? 'Factura emitida',
    documentType: operation.issuedInvoiceDocumentType ?? null,
    status: 'ISSUED',
    taxBase: '0',
    taxAmount: '0',
    totalAmount: operation.issuedInvoiceTotalAmount ?? '0',
    currency: operation.issuedInvoiceCurrency ?? operation.originalCurrency ?? 'EUR',
  };
}

interface BatchIssueResult {
  period: string;
  issued: Array<{ canonicalOperationId: string; documentId: string; documentNumber: string }>;
  skipped: Array<{ canonicalOperationId: string; reason: string }>;
  errors: Array<{ canonicalOperationId: string; message: string }>;
}

function BatchIssuancePanel({ eligible, onIssued }: { eligible: Operation[]; onIssued: () => void }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BatchIssueResult | null>(null);
  const [error, setError] = useState('');
  const total = eligible.reduce((sum, operation) => sum + Number(operation.grossAmount ?? 0), 0);

  async function confirmBatchIssue() {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/periods/${encodeURIComponent(period)}/invoices/issue-eligible`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? 'No se pudo emitir el lote del periodo');
        return;
      }
      const data = await response.json() as BatchIssueResult;
      setResult(data);
      setConfirming(false);
      if (data.issued.length > 0) onIssued();
    } catch {
      setError('No se pudo emitir el lote del periodo');
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="invoicing-batch-card" aria-labelledby="invoicing-batch-heading">
    <div className="invoicing-batch-copy">
      <span className="section-index">Emisión por lote</span>
      <h2 id="invoicing-batch-heading">Preparar facturas del periodo</h2>
      <p>Revisa primero los candidatos. La numeración fiscal solo se consume al confirmar la emisión.</p>
    </div>

    <div className="invoicing-batch-controls">
      <label htmlFor="invoicing-batch-period">Periodo</label>
      <input id="invoicing-batch-period" type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setResult(null); setConfirming(false); }} />
      <div className="batch-preview-metric"><span>Elegibles visibles</span><strong>{eligible.length}</strong></div>
      <div className="batch-preview-metric"><span>Importe visible</span><strong>{total.toFixed(2)} €</strong></div>
      <button type="button" className="btn" disabled={!period} onClick={() => setConfirming(true)}>Revisar emisión</button>
    </div>

    {confirming ? <div className="invoicing-batch-confirm" role="alertdialog" aria-labelledby="invoicing-batch-confirm-heading">
      <div><strong id="invoicing-batch-confirm-heading">Confirmar emisión de {period}</strong><p>El servidor volverá a validar cobro, decisión fiscal, reembolsos, incidencias y duplicados. Esta acción no se puede deshacer.</p></div>
      <div className="invoicing-confirm-actions"><button type="button" className="btn" disabled={submitting} onClick={() => void confirmBatchIssue()}>{submitting ? 'Emitiendo…' : 'Confirmar emisión'}</button><button type="button" className="btn btn-secondary" disabled={submitting} onClick={() => setConfirming(false)}>Cancelar</button></div>
    </div> : null}

    {error ? <p className="import-error" role="status">{error}</p> : null}
    {result ? <div className="invoicing-batch-result" role="status">
      <strong>Resultado del lote</strong>
      <p>Periodo {result.period}: {result.issued.length} emitida{result.issued.length === 1 ? '' : 's'}, {result.skipped.length} omitida{result.skipped.length === 1 ? '' : 's'}, {result.errors.length} con error.</p>
      {result.issued.length > 0 ? <ul>{result.issued.map((item) => <li key={item.canonicalOperationId}>{item.documentNumber}</li>)}</ul> : null}
      {result.skipped.length > 0 ? <details><summary>Ver operaciones omitidas</summary><ul>{result.skipped.map((item) => <li key={item.canonicalOperationId}>{statusLabel(item.reason)}</li>)}</ul></details> : null}
      {result.errors.length > 0 ? <details><summary>Ver errores</summary><ul>{result.errors.map((item) => <li key={item.canonicalOperationId}>{item.message}</li>)}</ul></details> : null}
    </div> : null}
  </section>;
}

export function InvoicingPanel() {
  const [operations, setOperations] = useState<Operation[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState<Record<string, boolean>>({});
  const [outcomes, setOutcomes] = useState<Record<string, IssueOutcome>>({});
  const [filters, setFilters] = useState<OperationFilterValues>({ ...emptyOperationFilters, sourceChannel: 'SHOPIFY' });
  const [view, setView] = useState<InvoiceView>('PENDING');
  const [reloadToken, setReloadToken] = useState(0);
  const hasFilters = Boolean(filters.dateFrom || filters.dateTo || filters.productNature);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/v1/operations${operationFiltersQuery(filters)}`, { credentials: 'include' });
        if (!response.ok) throw new Error('No se pudieron obtener las operaciones');
        const data = await response.json() as OperationsPage;
        if (!cancelled) setOperations(data.items);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudieron obtener las operaciones');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [filters, reloadToken]);

  async function issueInvoiceFor(operationId: string) {
    setIssuing((current) => ({ ...current, [operationId]: true }));
    try {
      const response = await fetch(`/api/v1/operations/${encodeURIComponent(operationId)}/invoices`, { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { code?: string; message?: string };
        setOutcomes((current) => ({ ...current, [operationId]: { kind: 'error', message: invoiceErrorMessage(body) } }));
        return;
      }
      const document = await response.json() as FiscalDocument & { alreadyIssued?: boolean };
      setOutcomes((current) => ({ ...current, [operationId]: { kind: 'success', document, alreadyIssued: Boolean(document.alreadyIssued) } }));
      setView('ISSUED');
    } catch {
      setOutcomes((current) => ({ ...current, [operationId]: { kind: 'error', message: 'No se pudo emitir la factura' } }));
    } finally {
      setIssuing((current) => ({ ...current, [operationId]: false }));
    }
  }

  const classified = useMemo(() => {
    const source = operations ?? [];
    const issued = source.filter((operation) => effectiveDocument(operation, outcomes[operation.id]));
    const pending = source.filter((operation) => !effectiveDocument(operation, outcomes[operation.id]) && !operationBlocker(operation));
    const blocked = source.filter((operation) => !effectiveDocument(operation, outcomes[operation.id]) && operationBlocker(operation));
    return { pending, blocked, issued };
  }, [operations, outcomes]);

  const visible = view === 'PENDING' ? classified.pending : view === 'BLOCKED' ? classified.blocked : classified.issued;

  if (loading) return <section className="invoicing-documents"><p aria-live="polite">Cargando operaciones…</p></section>;
  if (error) return <section className="invoicing-documents"><p className="import-error">{error}</p></section>;

  return <section className="invoicing-documents invoicing-workbench">
    <div className="workflow-guide" role="note"><strong>Cuándo aparece una venta aquí</strong><span>Shopify debe aportar un cobro confirmado y la aplicación debe crear una operación fiscal.</span><span>El payout y el ingreso bancario no son requisitos para emitir la factura.</span></div>

    <div className="summary-grid invoicing-summary-grid"><article><span>Listas para emitir</span><strong>{classified.pending.length}</strong></article><article><span>Bloqueadas</span><strong>{classified.blocked.length}</strong></article><article><span>Emitidas</span><strong>{classified.issued.length}</strong></article></div>

    <BatchIssuancePanel eligible={classified.pending} onIssued={() => setReloadToken((token) => token + 1)} />

    <div className="invoicing-filter-panel"><OperationFilters value={filters} onChange={setFilters} showPlatform={false} /></div>

    <div className="invoicing-tabs" role="tablist" aria-label="Estado de facturación">
      <button type="button" role="tab" aria-selected={view === 'PENDING'} onClick={() => setView('PENDING')}>Pendientes ({classified.pending.length})</button>
      <button type="button" role="tab" aria-selected={view === 'BLOCKED'} onClick={() => setView('BLOCKED')}>Bloqueadas ({classified.blocked.length})</button>
      <button type="button" role="tab" aria-selected={view === 'ISSUED'} onClick={() => setView('ISSUED')}>Emitidas ({classified.issued.length})</button>
    </div>

    {!operations || operations.length === 0 ? <div className="invoicing-empty-state"><strong>{hasFilters ? 'No hay operaciones para los filtros seleccionados.' : 'No hay operaciones fiscales creadas.'}</strong><p>{hasFilters ? 'Modifica los filtros para ampliar la búsqueda.' : 'Importa una transacción Shopify confirmada. Si ya lo hiciste, revisa que el emisor y la configuración fiscal estén completos.'}</p><div><Link className="btn" href="/sales/shopify">Revisar ventas Shopify</Link><Link className="btn btn-secondary" href="/settings">Revisar configuración</Link></div></div> : null}

    {operations && operations.length > 0 && visible.length === 0 ? <p className="workbench-notice">No hay operaciones en esta categoría.</p> : null}

    {visible.length > 0 ? <div className="invoice-grid invoice-work-queue">{visible.map((operation) => {
      const outcome = outcomes[operation.id];
      const gross = operation.grossAmount !== null ? Number(operation.grossAmount).toFixed(2) : '—';
      const currency = operation.originalCurrency ?? 'EUR';
      const issuedDocument = effectiveDocument(operation, outcome);
      const blocker = operationBlocker(operation);
      return <article key={operation.id} className="invoice-card invoice-work-card">
        <div className="invoice-card-header"><div><span className="table-kicker">Pedido Shopify</span><h2>{operation.sourceOrderId ?? operation.id}</h2></div><StatusBadge tone={issuedDocument ? 'info' : blocker ? 'warning' : 'info'}>{issuedDocument ? 'Factura emitida' : blocker ? 'Bloqueada' : 'Lista para emitir'}</StatusBadge></div>
        <div className="invoice-card-amount"><span>Total</span><strong>{gross} {currency}</strong></div>
        <dl className="invoice-card-details"><div><dt>Comprador</dt><dd>{buyerLabel(operation)}</dd></div><div><dt>País</dt><dd>{operation.customerCountry ?? 'No informado'}</dd></div><div><dt>Plataforma</dt><dd>{channelLabel(operation.sourceChannel)}</dd></div><div><dt>Estado fiscal</dt><dd>{statusLabel(operation.operationStatus)}</dd></div><div><dt>Cruce de datos</dt><dd>{statusLabel(operation.reconciliationStatus)}</dd></div><div><dt>VERI*FACTU</dt><dd>{statusLabel(operation.verifactuStatus)}</dd></div></dl>
        {blocker ? <div className="invoice-blocker"><strong>Qué bloquea la emisión</strong><span>{blocker}</span></div> : null}
        {issuedDocument ? <a className="btn invoice-download" href={documentDownloadHref(issuedDocument.id)}>Descargar factura</a> : blocker ? <a className="btn btn-secondary" href={operation.reconciliationStatus === 'MATCHED' ? '/settings' : '/reconciliation'}>Resolver bloqueo</a> : <button type="button" className="btn" disabled={Boolean(issuing[operation.id])} onClick={() => void issueInvoiceFor(operation.id)}>{issuing[operation.id] ? 'Emitiendo…' : 'Emitir factura'}</button>}
        {outcome?.kind === 'error' ? <p className="import-error" role="status">{outcome.message}</p> : null}
        {issuedDocument ? <dl className="invoice-document-summary"><div><dt>Tipo</dt><dd>{statusLabel(issuedDocument.documentType ?? 'COMPLETA')}</dd></div><div><dt>Número</dt><dd>{issuedDocument.number}{outcome?.kind === 'success' && outcome.alreadyIssued ? ' (ya emitida)' : ''}</dd></div><div><dt>Total</dt><dd>{Number(issuedDocument.totalAmount).toFixed(2)} {issuedDocument.currency}</dd></div></dl> : null}
      </article>;
    })}</div> : null}
  </section>;
}

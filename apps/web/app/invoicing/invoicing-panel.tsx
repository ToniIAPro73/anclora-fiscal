'use client';

import { useEffect, useState } from 'react';
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

function invoiceErrorMessage(body: { code?: string; message?: string }): string {
  if (body.code === 'TAX_DECISION_MISSING') {
    return 'Esta operación necesita una decisión fiscal antes de poder facturarse.';
  }
  if (body.code === 'FISCAL_CONFIGURATION_INCOMPLETE') {
    return 'Completa la configuración fiscal: emisor, serie de facturación y perfil de producto.';
  }
  if (body.code === 'OPERATION_NOT_FOUND') {
    return 'La operación no existe o ya no está disponible para facturación.';
  }
  return body.message ?? 'No se pudo emitir la factura.';
}

function buyerLabel(operation: Operation): string {
  return operation.customerName || operation.customerEmail || 'Comprador no informado';
}

function documentDownloadHref(documentId: string) {
  return `/api/v1/fiscal-documents/${encodeURIComponent(documentId)}/download`;
}

interface BatchIssueResult {
  period: string;
  issued: Array<{ canonicalOperationId: string; documentId: string; documentNumber: string }>;
  skipped: Array<{ canonicalOperationId: string; reason: string }>;
  errors: Array<{ canonicalOperationId: string; message: string }>;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function BatchIssuancePanel({ onIssued }: { onIssued: () => void }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BatchIssueResult | null>(null);
  const [error, setError] = useState('');
  const periodValid = /^\d{4}-\d{2}$/.test(period);

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

  return <section className="invoicing-batch" aria-labelledby="invoicing-batch-heading">
    <h2 id="invoicing-batch-heading">Emisión por lote</h2>
    <label htmlFor="invoicing-batch-period">Periodo (AAAA-MM)</label>
    <input
      id="invoicing-batch-period"
      type="text"
      inputMode="numeric"
      placeholder="2026-07"
      value={period}
      onChange={(event) => { setPeriod(event.target.value); setResult(null); setConfirming(false); }}
    />
    {!confirming ? <button
      type="button"
      disabled={!periodValid}
      onClick={() => setConfirming(true)}
    >
      Emitir elegibles del periodo
    </button> : null}

    {confirming ? <div className="invoicing-batch-confirm" role="alertdialog" aria-labelledby="invoicing-batch-confirm-heading">
      <p id="invoicing-batch-confirm-heading">
        Vas a emitir automáticamente todas las facturas simplificadas Shopify elegibles del periodo <strong>{period}</strong>:
        cobro confirmado, decisión fiscal determinada, sin reembolso pendiente ni incidencia abierta, y que aún no tengan
        factura. Esta acción no se puede deshacer.
      </p>
      <button type="button" disabled={submitting} onClick={() => void confirmBatchIssue()}>
        {submitting ? 'Emitiendo…' : 'Confirmar emisión'}
      </button>
      <button type="button" disabled={submitting} onClick={() => setConfirming(false)}>
        Cancelar
      </button>
    </div> : null}

    {error ? <p className="import-error" role="status">{error}</p> : null}

    {result ? <div className="invoicing-batch-result" role="status">
      <p>
        Periodo {result.period}: {result.issued.length} emitida{result.issued.length === 1 ? '' : 's'},{' '}
        {result.skipped.length} omitida{result.skipped.length === 1 ? '' : 's'},{' '}
        {result.errors.length} con error.
      </p>
      {result.issued.length > 0 ? <ul>
        {result.issued.map((item) => <li key={item.canonicalOperationId}>{item.documentNumber}</li>)}
      </ul> : null}
      {result.skipped.length > 0 ? <details>
        <summary>Ver operaciones omitidas</summary>
        <ul>
          {result.skipped.map((item) => <li key={item.canonicalOperationId}>{statusLabel(item.reason)}</li>)}
        </ul>
      </details> : null}
      {result.errors.length > 0 ? <details>
        <summary>Ver errores</summary>
        <ul>
          {result.errors.map((item) => <li key={item.canonicalOperationId}>{item.message}</li>)}
        </ul>
      </details> : null}
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
  const [reloadToken, setReloadToken] = useState(0);
  const hasFilters = Boolean(filters.dateFrom || filters.dateTo || filters.productNature);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
      const response = await fetch(`/api/v1/operations/${encodeURIComponent(operationId)}/invoices`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { code?: string; message?: string };
        setOutcomes((current) => ({ ...current, [operationId]: { kind: 'error', message: invoiceErrorMessage(body) } }));
        return;
      }
      const document = await response.json() as FiscalDocument & { alreadyIssued?: boolean };
      setOutcomes((current) => ({ ...current, [operationId]: { kind: 'success', document, alreadyIssued: Boolean(document.alreadyIssued) } }));
    } catch {
      setOutcomes((current) => ({ ...current, [operationId]: { kind: 'error', message: 'No se pudo emitir la factura' } }));
    } finally {
      setIssuing((current) => ({ ...current, [operationId]: false }));
    }
  }

  if (loading) return <section className="invoicing-documents"><p aria-live="polite">Cargando operaciones…</p></section>;
  if (error) return <section className="invoicing-documents"><p className="import-error">{error}</p></section>;
  return <section className="invoicing-documents">
    <span className="section-index">Operaciones pendientes de facturar</span>
    <BatchIssuancePanel onIssued={() => setReloadToken((token) => token + 1)} />
    <OperationFilters value={filters} onChange={setFilters} showPlatform={false} />
    {!operations || operations.length === 0 ? <p className="workbench-notice">{hasFilters ? 'No hay operaciones para los filtros seleccionados.' : 'No hay operaciones todavía.'}</p> : null}
    {operations && operations.length > 0 ? <div className="invoice-grid">{operations.map((operation) => {
      const outcome = outcomes[operation.id];
      const gross = operation.grossAmount !== null ? Number(operation.grossAmount).toFixed(2) : '—';
      const currency = operation.originalCurrency ?? 'EUR';
      const needsReview = Boolean(operation.anomalyFlags?.includes(RECTIFICATION_REVIEW_FLAG));
      const issuedDocument = outcome?.kind === 'success' ? outcome.document : operation.issuedInvoiceId ? {
        id: operation.issuedInvoiceId,
        number: operation.issuedInvoiceNumber ?? 'Factura emitida',
        documentType: operation.issuedInvoiceDocumentType ?? null,
        status: 'ISSUED',
        taxBase: '0',
        taxAmount: '0',
        totalAmount: operation.issuedInvoiceTotalAmount ?? '0',
        currency: operation.issuedInvoiceCurrency ?? currency,
      } satisfies FiscalDocument : null;
      return <article key={operation.id} className="invoice-card">
        <StatusBadge tone="info">{operation.sourceOrderId ?? operation.id}</StatusBadge>
        {needsReview ? <StatusBadge tone="warning">Revisión recomendada: posible rectificación por reembolso</StatusBadge> : null}
        <h2>{channelLabel(operation.sourceChannel)}</h2>
        <dl>
          <div><dt>Bruto</dt><dd>{gross} {currency}</dd></div>
          <div><dt>Comprador</dt><dd>{buyerLabel(operation)}</dd></div>
          <div><dt>País comprador</dt><dd>{operation.customerCountry ?? 'No informado'}</dd></div>
          <div><dt>Estado de revisión</dt><dd>{statusLabel(operation.reviewStatus)}</dd></div>
          <div><dt>Estado operativo</dt><dd>{statusLabel(operation.operationStatus)}</dd></div>
          <div><dt>Conciliación</dt><dd>{statusLabel(operation.reconciliationStatus)}</dd></div>
        </dl>
        {issuedDocument ? <a className="btn invoice-download" href={documentDownloadHref(issuedDocument.id)}>Descargar factura</a> : <button type="button" disabled={Boolean(issuing[operation.id])} onClick={() => void issueInvoiceFor(operation.id)}>
            {issuing[operation.id] ? 'Emitiendo…' : 'Emitir factura'}
          </button>}
        {outcome?.kind === 'error' ? <p className="import-error" role="status">{outcome.message}</p> : null}
        {issuedDocument ? <dl>
          <div><dt>Tipo</dt><dd>{statusLabel(issuedDocument.documentType ?? 'COMPLETA')}</dd></div>
          <div><dt>Número</dt><dd>{issuedDocument.number}{outcome?.kind === 'success' && outcome.alreadyIssued ? ' (ya emitida)' : ''}</dd></div>
          <div><dt>Total</dt><dd>{Number(issuedDocument.totalAmount).toFixed(2)} {issuedDocument.currency}</dd></div>
        </dl> : null}
      </article>;
    })}</div> : null}
  </section>;
}

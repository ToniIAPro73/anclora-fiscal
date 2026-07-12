'use client';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';
import { ledgerEntryLabel, settlementLabel, statusLabel, transactionTypeLabel } from '../../../lib/display-labels';

type Row = Record<string, string | number | null>;
interface Detail { order: Row; lines: Row[]; transactions: Row[]; ledger: Row[]; links: Row[]; operation: Row | null; taxDecision: Row | null; documents: Row[]; audit: Row[]; settlement: string; eligibility: Record<string, boolean>; }
const emptyBuyer = { displayName: '', taxIdentity: '', billingAddress: '', customerType: 'B2C' as 'B2C' | 'B2B' };

export function ShopifySaleDetail({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Detail>(); const [error, setError] = useState(''); const [action, setAction] = useState('');
  const [showFullInvoiceForm, setShowFullInvoiceForm] = useState(false);
  const [buyer, setBuyer] = useState(emptyBuyer);
  const [fullInvoiceStatus, setFullInvoiceStatus] = useState('');
  useEffect(() => { fetch(`/api/v1/shopify/sales/${orderId}`, { credentials: 'include' }).then(async r => { if (!r.ok) throw new Error('No se pudo cargar el expediente'); return r.json(); }).then(setData).catch((e: Error) => setError(e.message)); }, [orderId]);
  if (error) return <p className="workbench-notice workbench-notice-error">{error}</p>;
  if (!data) return <p className="workbench-notice">Cargando expediente…</p>;
  const operationId = data.operation?.id ? String(data.operation.id) : null;
  const requestFullInvoice = async () => {
    if (!operationId) return;
    setFullInvoiceStatus('Emitiendo…');
    const response = await fetch(`/api/v1/operations/${operationId}/full-invoice`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buyer),
    });
    const body = await response.json();
    setFullInvoiceStatus(response.ok ? `Factura completa ${body.number ?? 'emitida'}` : body.message ?? 'No se pudo emitir la factura completa');
  };
  const sections = [
    ['Pedido y líneas', data.lines, 'El pedido existe pero no contiene líneas.'],
    ['Transacciones del pedido', data.transactions, 'Falta importar el CSV de transacciones del pedido.'],
    ['Movimientos de Shopify Payments', data.ledger, 'No hay movimientos de Shopify Payments; no bloquea la emisión fiscal si existe una transacción confirmada.'],
    ['Documentos fiscales', data.documents, 'No se ha emitido ningún documento fiscal.'],
    ['Trazabilidad', data.audit, 'Todavía no hay eventos de auditoría para este expediente.'],
  ] as const;
  const eligible = Boolean(data.operation && data.order.fiscalStatus !== 'ZERO_VALUE_REVIEW' && data.eligibility.hasFiscalConfiguration && data.eligibility.hasFiscalProfile && data.eligibility.hasTransactionsEvidence && data.eligibility.hasTaxDecision);
  const issue = async () => { setAction('Emitiendo…'); const response = await fetch(`/api/v1/shopify/sales/${orderId}/invoice`, { method: 'POST', credentials: 'include' }); const body = await response.json(); setAction(response.ok ? `Factura ${body.number ?? 'emitida'}` : body.message ?? 'No se pudo emitir'); };
  const rowTitle = (row: Row, index: number) => String(row.title ?? (row.kind ? transactionTypeLabel(String(row.kind)) : row.entryType ? ledgerEntryLabel(String(row.entryType)) : row.number ?? row.action ?? `Registro ${index + 1}`));
  const rowValue = (row: Row) => String(row.amount ?? row.totalAmount ?? (row.status ? statusLabel(String(row.status)) : ''));
  return <section className="reconciliation-workbench"><div className="summary-grid"><article><span>Pedido</span><strong>{data.order.externalOrderId}</strong></article><article><span>Total</span><strong>{Number(data.order.totalAmount ?? 0).toFixed(2)} €</strong></article><article><span>Payout / banco</span><StatusBadge tone={data.settlement === 'SETTLED' ? 'info' : 'warning'}>{settlementLabel(data.settlement, Number(data.order.totalAmount ?? 0) === 0)}</StatusBadge></article><article><span>Decisión fiscal</span><strong>{statusLabel(String(data.taxDecision?.status ?? 'PENDING'))}</strong></article></div>
    <p><button type="button" disabled={!eligible} onClick={issue}>Emitir factura</button> {action || (!eligible ? 'La emisión requiere configuración, decisión fiscal y transacción Shopify confirmada.' : '')}</p>
    <p><button type="button" disabled={!operationId} onClick={() => setShowFullInvoiceForm((current) => !current)}>Solicitar factura completa</button></p>
    {showFullInvoiceForm ? <div className="detail-section" role="group" aria-label="Datos del destinatario para factura completa">
      <label htmlFor="full-invoice-display-name">Nombre / razón social</label>
      <input id="full-invoice-display-name" type="text" value={buyer.displayName} onChange={(e) => setBuyer({ ...buyer, displayName: e.target.value })} />
      <label htmlFor="full-invoice-tax-identity">NIF/NIE</label>
      <input id="full-invoice-tax-identity" type="text" value={buyer.taxIdentity} onChange={(e) => setBuyer({ ...buyer, taxIdentity: e.target.value })} />
      <label htmlFor="full-invoice-address">Dirección de facturación</label>
      <input id="full-invoice-address" type="text" value={buyer.billingAddress} onChange={(e) => setBuyer({ ...buyer, billingAddress: e.target.value })} />
      <label htmlFor="full-invoice-customer-type">Tipo de cliente</label>
      <select id="full-invoice-customer-type" value={buyer.customerType} onChange={(e) => setBuyer({ ...buyer, customerType: e.target.value as 'B2C' | 'B2B' })}>
        <option value="B2C">Particular</option>
        <option value="B2B">Empresa</option>
      </select>
      <button type="button" disabled={!buyer.displayName || !buyer.taxIdentity || !buyer.billingAddress} onClick={requestFullInvoice}>Confirmar y emitir factura completa</button>
      {fullInvoiceStatus ? <p role="status">{fullInvoiceStatus}</p> : null}
    </div> : null}
    {data.links.some(link => link.state === 'PROPOSED') ? <p className="workbench-notice">Hay enlaces de evidencia propuestos pendientes de revisión.</p> : null}
    {sections.map(([title, rows, empty]) => <section className="detail-section" key={title}><span className="section-index">{title}</span>{rows.length === 0 ? <p className="workbench-notice">{empty}</p> : <div className="reconciliation-table-panel"><table><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}><td><strong>{rowTitle(row, index)}</strong></td><td>{rowValue(row)}</td></tr>)}</tbody></table></div>}</section>)}
  </section>;
}

'use client';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';

type Row = Record<string, string | number | null>;
interface Detail { order: Row; lines: Row[]; transactions: Row[]; ledger: Row[]; links: Row[]; operation: Row | null; taxDecision: Row | null; documents: Row[]; audit: Row[]; settlement: string; eligibility: Record<string, boolean>; }
export function ShopifySaleDetail({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Detail>(); const [error, setError] = useState(''); const [action, setAction] = useState('');
  useEffect(() => { fetch(`/api/v1/shopify/sales/${orderId}`, { credentials: 'include' }).then(async r => { if (!r.ok) throw new Error('No se pudo cargar el expediente'); return r.json(); }).then(setData).catch((e: Error) => setError(e.message)); }, [orderId]);
  if (error) return <p className="workbench-notice workbench-notice-error">{error}</p>;
  if (!data) return <p className="workbench-notice">Cargando expediente…</p>;
  const sections = [
    ['Pedido y líneas', data.lines, 'El pedido existe pero no contiene líneas.'],
    ['Transacciones del pedido', data.transactions, 'Falta importar el CSV de transacciones del pedido.'],
    ['Ledger de Shopify Payments', data.ledger, 'Falta importar el ledger de Shopify Payments.'],
    ['Documentos fiscales', data.documents, 'No se ha emitido ningún documento fiscal.'],
    ['Trazabilidad', data.audit, 'Todavía no hay eventos de auditoría para este expediente.'],
  ] as const;
  const eligible = data.operation && data.order.fiscalStatus !== 'ZERO_VALUE_REVIEW' && Object.values(data.eligibility).every(Boolean);
  const issue = async () => { setAction('Emitiendo…'); const response = await fetch(`/api/v1/shopify/sales/${orderId}/invoice`, { method: 'POST', credentials: 'include' }); const body = await response.json(); setAction(response.ok ? `Factura ${body.number ?? 'emitida'}` : body.message ?? 'No se pudo emitir'); };
  return <section className="reconciliation-workbench"><div className="summary-grid"><article><span>Pedido</span><strong>{data.order.externalOrderId}</strong></article><article><span>Total</span><strong>{Number(data.order.totalAmount ?? 0).toFixed(2)} €</strong></article><article><span>Liquidación</span><StatusBadge tone={data.settlement === 'SETTLED' ? 'info' : 'warning'}>{data.settlement === 'SETTLED' ? 'Payout identificado (no verificación bancaria)' : data.settlement === 'PAYOUT_PENDING' ? 'Payout pendiente' : 'Ledger pendiente'}</StatusBadge></article><article><span>Decisión fiscal</span><strong>{data.taxDecision?.status ?? 'Pendiente'}</strong></article></div>
    <p><button type="button" disabled={!eligible} onClick={issue}>Emitir factura</button> {action || (!eligible ? 'La emisión requiere configuración, decisión fiscal y las tres evidencias.' : '')}</p>
    {data.links.some(link => link.state === 'PROPOSED') ? <p className="workbench-notice">Hay enlaces de evidencia propuestos pendientes de revisión.</p> : null}
    {sections.map(([title, rows, empty]) => <section className="detail-section" key={title}><span className="section-index">{title}</span>{rows.length === 0 ? <p className="workbench-notice">{empty}</p> : <div className="reconciliation-table-panel"><table><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}><td><strong>{String(row.title ?? row.kind ?? row.entryType ?? row.number ?? row.action ?? `Registro ${index + 1}`)}</strong></td><td>{String(row.amount ?? row.totalAmount ?? row.status ?? '')}</td></tr>)}</tbody></table></div>}</section>)}
  </section>;
}

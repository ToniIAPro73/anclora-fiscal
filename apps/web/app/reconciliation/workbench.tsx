'use client';
import { useEffect, useState } from 'react';
import { Button, StatusBadge } from '@anclora/ui';
import { settlementLabel, statusLabel } from '../lib/display-labels';

interface LinkRecord { id: string; linkType: string; state: string; confidence: string; explanationJson: { shopifyOrderName?: string; fiscalStatus?: string; transactionAmount?: number; ledgerNetAmount?: number; platformFeeAmount?: number; payoutStatus?: string; externalPayoutId?: string | null; bankVerified?: boolean }; }
const LINK_TYPE_LABELS: Record<string, string> = {
  ORDER_TO_TRANSACTION: 'Pedido → transacción',
  'Order to transaction': 'Pedido → transacción',
  ORDER_TO_LEDGER: 'Pedido → movimiento',
  'Order to ledger': 'Pedido → movimiento',
  TRANSACTION_TO_LEDGER: 'Transacción → movimiento',
};
const linkTypeLabel = (linkType: string) => LINK_TYPE_LABELS[linkType] ?? statusLabel(linkType);

type OrderReconciliationStatus = 'CONCILIADO' | 'PENDIENTE' | 'DISCREPANTE';

const ORDER_STATUS_LABEL: Record<OrderReconciliationStatus, string> = {
  CONCILIADO: 'Conciliado',
  PENDIENTE: 'Pendiente',
  DISCREPANTE: 'Discrepante',
};

const ORDER_STATUS_TONE: Record<OrderReconciliationStatus, 'info' | 'warning' | 'high'> = {
  CONCILIADO: 'info',
  PENDIENTE: 'warning',
  DISCREPANTE: 'high',
};

/**
 * Aggregates evidence-link state up to the order level: any REJECTED link
 * on the order marks it DISCREPANTE (needs human attention), any remaining
 * PROPOSED link marks it PENDIENTE (still awaiting review), otherwise every
 * link is AUTO_LINKED/CONFIRMED so the order is CONCILIADO.
 */
function computeOrderStatuses(links: LinkRecord[]): Map<string, OrderReconciliationStatus> {
  const byOrder = new Map<string, LinkRecord[]>();

  for (const link of links) {
    const order = link.explanationJson.shopifyOrderName;
    if (!order) continue;
    const existing = byOrder.get(order) ?? [];
    existing.push(link);
    byOrder.set(order, existing);
  }

  const statuses = new Map<string, OrderReconciliationStatus>();

  for (const [order, orderLinks] of byOrder) {
    if (orderLinks.some((link) => link.state === 'REJECTED')) {
      statuses.set(order, 'DISCREPANTE');
    } else if (orderLinks.some((link) => link.state === 'PROPOSED')) {
      statuses.set(order, 'PENDIENTE');
    } else {
      statuses.set(order, 'CONCILIADO');
    }
  }

  return statuses;
}

interface PayoutSummary {
  payoutId: string;
  orderCount: number;
  netAmount: number;
  feeAmount: number;
}

function computePayoutSummaries(links: LinkRecord[]): PayoutSummary[] {
  const byPayout = new Map<string, { orders: Set<string>; netAmount: number; feeAmount: number }>();

  for (const link of links) {
    const payoutId = link.explanationJson.externalPayoutId;
    if (!payoutId) continue;
    const entry = byPayout.get(payoutId) ?? { orders: new Set<string>(), netAmount: 0, feeAmount: 0 };
    if (link.explanationJson.shopifyOrderName) entry.orders.add(link.explanationJson.shopifyOrderName);
    entry.netAmount += link.explanationJson.ledgerNetAmount ?? 0;
    entry.feeAmount += link.explanationJson.platformFeeAmount ?? 0;
    byPayout.set(payoutId, entry);
  }

  return [...byPayout.entries()].map(([payoutId, entry]) => ({
    payoutId,
    orderCount: entry.orders.size,
    netAmount: entry.netAmount,
    feeAmount: entry.feeAmount,
  }));
}
export function ReconciliationWorkbench() {
  const [links, setLinks] = useState<LinkRecord[]>(); const [error, setError] = useState(''); const [state, setState] = useState('');
  const load = () => fetch(`/api/v1/shopify/evidence-links${state ? `?state=${state}` : ''}`, { credentials: 'include' }).then(async r => { if (!r.ok) throw new Error('No se pudieron obtener los enlaces de evidencia'); return r.json(); }).then(setLinks).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [state]);
  const decide = async (id: string, decision: 'CONFIRMED' | 'REJECTED') => { await fetch(`/api/v1/shopify/evidence-links/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: decision }) }); load(); };
  if (error) return <p className="workbench-notice workbench-notice-error">{error}</p>;

  const orderStatuses = links ? computeOrderStatuses(links) : new Map<string, OrderReconciliationStatus>();
  const payoutSummaries = links ? computePayoutSummaries(links) : [];
  const statusCounts = { CONCILIADO: 0, PENDIENTE: 0, DISCREPANTE: 0 } as Record<OrderReconciliationStatus, number>;
  for (const status of orderStatuses.values()) statusCounts[status] += 1;

  return <section className="reconciliation-workbench"><p className="workbench-notice">Esta pantalla concilia evidencias internas de Shopify. “Liquidación identificada” significa que existe una referencia de liquidación; no implica que el banco la haya confirmado.</p>
    <div className="reconciliation-filters"><label>Estado<select value={state} onChange={e => setState(e.target.value)}><option value="">Todos</option><option value="PROPOSED">Pendiente de revisión</option><option value="AUTO_LINKED">Enlace exacto</option><option value="CONFIRMED">Confirmado</option><option value="REJECTED">Rechazado</option></select></label></div>
    {links && links.length > 0 ? <div className="summary-grid">
      <article><span>Pedidos conciliados</span><strong>{statusCounts.CONCILIADO}</strong></article>
      <article><span>Pedidos pendientes</span><strong>{statusCounts.PENDIENTE}</strong></article>
      <article><span>Pedidos discrepantes</span><strong>{statusCounts.DISCREPANTE}</strong></article>
    </div> : null}
    {payoutSummaries.length > 0 ? <div className="reconciliation-table-panel">
      <h2 className="section-index">Resumen por payout</h2>
      <table><thead><tr><th>Payout</th><th>Pedidos</th><th>Neto</th><th>Comisión</th></tr></thead><tbody>
        {payoutSummaries.map(summary => <tr key={summary.payoutId}><td>{summary.payoutId}</td><td>{summary.orderCount}</td><td>{summary.netAmount.toFixed(2)}</td><td>{summary.feeAmount.toFixed(2)}</td></tr>)}
      </tbody></table>
    </div> : null}
    {!links ? <p className="workbench-notice">Cargando enlaces…</p> : links.length === 0 ? <p className="workbench-notice">No hay enlaces para este filtro. Importa pedidos, transacciones y movimientos para construir la cadena de evidencia.</p> : <div className="reconciliation-table-panel"><table><thead><tr><th>Pedido</th><th>Estado del pedido</th><th>Enlace</th><th>Importes</th><th>Payout / banco</th><th>Estado fiscal</th><th>Estado</th><th>Revisión</th></tr></thead><tbody>{links.map(link => { const orderName = link.explanationJson.shopifyOrderName; const orderStatus = orderName ? orderStatuses.get(orderName) : undefined; return <tr key={link.id}><td>{orderName ?? '—'}</td><td>{orderStatus ? <StatusBadge tone={ORDER_STATUS_TONE[orderStatus]}>{ORDER_STATUS_LABEL[orderStatus]}</StatusBadge> : '—'}</td><td>{linkTypeLabel(link.linkType)}</td><td>{link.explanationJson.transactionAmount ?? '—'} / neto {link.explanationJson.ledgerNetAmount ?? '—'} / comisión {link.explanationJson.platformFeeAmount ?? '—'}</td><td><StatusBadge tone={link.explanationJson.externalPayoutId ? 'info' : 'warning'}>{settlementLabel(link.explanationJson.externalPayoutId ? 'SETTLED' : 'PAYOUT_PENDING')}</StatusBadge></td><td>{statusLabel(link.explanationJson.fiscalStatus ?? 'PENDIENTE_REVISION_FISCAL')}</td><td>{statusLabel(link.state)} · {(Number(link.confidence) * 100).toFixed(0)}%</td><td>{link.state === 'PROPOSED' ? <div className="reconciliation-actions"><Button onClick={() => decide(link.id, 'CONFIRMED')}>Confirmar</Button><Button variant="secondary" onClick={() => decide(link.id, 'REJECTED')}>Rechazar</Button></div> : '—'}</td></tr>; })}</tbody></table></div>}
  </section>;
}

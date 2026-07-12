'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, StatusBadge } from '@anclora/ui';
import { settlementLabel, statusLabel } from '../lib/display-labels';

interface LinkRecord {
  id: string;
  linkType: string;
  state: string;
  confidence: string;
  explanationJson: {
    shopifyOrderName?: string;
    fiscalStatus?: string;
    transactionAmount?: number;
    ledgerNetAmount?: number;
    platformFeeAmount?: number;
    payoutStatus?: string;
    externalPayoutId?: string | null;
    bankVerified?: boolean;
  };
}

const LINK_TYPE_LABELS: Record<string, string> = {
  ORDER_TO_TRANSACTION: 'Pedido → transacción',
  'Order to transaction': 'Pedido → transacción',
  ORDER_TO_LEDGER: 'Pedido → movimiento',
  'Order to ledger': 'Pedido → movimiento',
  TRANSACTION_TO_LEDGER: 'Transacción → movimiento',
};

const linkTypeLabel = (linkType: string) => LINK_TYPE_LABELS[linkType] ?? statusLabel(linkType);
type OrderReconciliationStatus = 'CRUZADO' | 'REVISAR' | 'DISCREPANTE';
type ViewMode = 'ATTENTION' | 'ALL';

interface OrderGroup {
  orderName: string;
  links: LinkRecord[];
  status: OrderReconciliationStatus;
  fiscalStatus: string;
  payoutId: string | null;
  transactionAmount: number | null;
  ledgerNetAmount: number | null;
  feeAmount: number | null;
}

function orderStatus(links: LinkRecord[]): OrderReconciliationStatus {
  if (links.some((link) => link.state === 'REJECTED')) return 'DISCREPANTE';
  if (links.some((link) => link.state === 'PROPOSED')) return 'REVISAR';
  return 'CRUZADO';
}

function groupByOrder(links: LinkRecord[]): OrderGroup[] {
  const groups = new Map<string, LinkRecord[]>();
  for (const link of links) {
    const orderName = link.explanationJson.shopifyOrderName ?? 'Sin pedido asociado';
    groups.set(orderName, [...(groups.get(orderName) ?? []), link]);
  }

  return [...groups.entries()].map(([orderName, orderLinks]) => {
    const financialLink = orderLinks.find((link) => link.linkType === 'TRANSACTION_TO_LEDGER')
      ?? orderLinks.find((link) => link.explanationJson.transactionAmount !== undefined)
      ?? orderLinks[0];
    const payoutLink = orderLinks.find((link) => link.explanationJson.externalPayoutId);
    return {
      orderName,
      links: orderLinks,
      status: orderStatus(orderLinks),
      fiscalStatus: financialLink?.explanationJson.fiscalStatus ?? 'PENDIENTE_REVISION_FISCAL',
      payoutId: payoutLink?.explanationJson.externalPayoutId ?? null,
      transactionAmount: financialLink?.explanationJson.transactionAmount ?? null,
      ledgerNetAmount: financialLink?.explanationJson.ledgerNetAmount ?? null,
      feeAmount: financialLink?.explanationJson.platformFeeAmount ?? null,
    };
  });
}

const STATUS_COPY: Record<OrderReconciliationStatus, { label: string; tone: 'info' | 'warning' | 'high'; description: string }> = {
  CRUZADO: { label: 'Datos internos cruzados', tone: 'info', description: 'Los archivos importados se relacionan sin incidencias.' },
  REVISAR: { label: 'Revisión necesaria', tone: 'warning', description: 'Queda al menos una propuesta por confirmar.' },
  DISCREPANTE: { label: 'Discrepancia', tone: 'high', description: 'Existe un enlace rechazado o incompatible.' },
};

function amountLabel(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)} €`;
}

export function ReconciliationWorkbench() {
  const [links, setLinks] = useState<LinkRecord[]>();
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>('ATTENTION');

  const load = () => fetch('/api/v1/shopify/evidence-links', { credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) throw new Error('No se pudieron obtener los enlaces de evidencia');
      return response.json() as Promise<LinkRecord[]>;
    })
    .then(setLinks)
    .catch((reason: Error) => setError(reason.message));

  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => groupByOrder(links ?? []), [links]);
  const visibleGroups = view === 'ATTENTION' ? groups.filter((group) => group.status !== 'CRUZADO') : groups;
  const counts = {
    CRUZADO: groups.filter((group) => group.status === 'CRUZADO').length,
    REVISAR: groups.filter((group) => group.status === 'REVISAR').length,
    DISCREPANTE: groups.filter((group) => group.status === 'DISCREPANTE').length,
  };

  async function decide(id: string, decision: 'CONFIRMED' | 'REJECTED') {
    await fetch(`/api/v1/shopify/evidence-links/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: decision }),
    });
    await load();
  }

  if (error) return <p className="workbench-notice workbench-notice-error">{error}</p>;

  return <section className="reconciliation-workbench reconciliation-exceptions">
    <div className="workflow-guide" role="note">
      <strong>Qué comprueba esta pantalla</strong>
      <span>Relaciona pedidos, transacciones de pedido y movimientos de Shopify Payments.</span>
      <span>“Datos internos cruzados” no confirma el ingreso en tu banco ni resuelve la fiscalidad del pedido.</span>
    </div>

    {links && links.length > 0 ? <div className="summary-grid reconciliation-summary-grid">
      <article><span>Datos cruzados</span><strong>{counts.CRUZADO}</strong></article>
      <article><span>Necesitan revisión</span><strong>{counts.REVISAR}</strong></article>
      <article><span>Discrepancias</span><strong>{counts.DISCREPANTE}</strong></article>
    </div> : null}

    <div className="reconciliation-view-switch" role="group" aria-label="Vista de conciliación">
      <button type="button" aria-pressed={view === 'ATTENTION'} onClick={() => setView('ATTENTION')}>Necesitan revisión ({counts.REVISAR + counts.DISCREPANTE})</button>
      <button type="button" aria-pressed={view === 'ALL'} onClick={() => setView('ALL')}>Todos los cruces ({groups.length})</button>
    </div>

    {!links ? <p className="workbench-notice">Cargando cruces de Shopify…</p> : null}
    {links?.length === 0 ? <p className="workbench-notice">No hay datos que cruzar. Importa pedidos, transacciones de pedidos y movimientos de Shopify Payments.</p> : null}
    {links && links.length > 0 && visibleGroups.length === 0 ? <div className="reconciliation-empty-success">
      <strong>No hay excepciones pendientes.</strong>
      <span>Los {counts.CRUZADO} pedidos disponibles tienen sus evidencias internas cruzadas.</span>
      <button type="button" onClick={() => setView('ALL')}>Ver todos los cruces</button>
    </div> : null}

    {visibleGroups.length > 0 ? <div className="reconciliation-order-list">
      {visibleGroups.map((group) => {
        const status = STATUS_COPY[group.status];
        const proposedLinks = group.links.filter((link) => link.state === 'PROPOSED');
        return <article key={group.orderName} className="reconciliation-order-card">
          <div className="reconciliation-order-main">
            <div className="cell-stack"><span className="table-kicker">Pedido</span><strong>{group.orderName}</strong><span>{group.links.length} enlace{group.links.length === 1 ? '' : 's'} de evidencia</span></div>
            <div className="cell-stack"><span className="table-kicker">Resultado del cruce</span><StatusBadge tone={status.tone}>{status.label}</StatusBadge><span>{status.description}</span></div>
            <div className="cell-stack"><span className="table-kicker">Importes</span><strong>{amountLabel(group.transactionAmount)}</strong><span>Neto {amountLabel(group.ledgerNetAmount)} · comisión {amountLabel(group.feeAmount)}</span></div>
            <div className="cell-stack"><span className="table-kicker">Payout</span><StatusBadge tone={group.payoutId ? 'info' : 'warning'}>{settlementLabel(group.payoutId ? 'SETTLED' : 'PAYOUT_PENDING')}</StatusBadge><span>{group.payoutId ?? 'Sin identificador de payout'}</span></div>
            <div className="cell-stack"><span className="table-kicker">Fiscalidad</span><strong>{statusLabel(group.fiscalStatus)}</strong><span>{proposedLinks.length > 0 ? `${proposedLinks.length} decisión pendiente` : 'Sin acción de conciliación'}</span></div>
          </div>

          <details className="reconciliation-evidence-details">
            <summary>Ver detalle técnico ({group.links.length})</summary>
            <div className="reconciliation-table-panel">
              <table>
                <thead><tr><th>Relación</th><th>Estado</th><th>Confianza</th><th>Importes</th><th>Revisión</th></tr></thead>
                <tbody>{group.links.map((link) => <tr key={link.id}>
                  <td>{linkTypeLabel(link.linkType)}</td>
                  <td>{statusLabel(link.state)}</td>
                  <td>{(Number(link.confidence) * 100).toFixed(0)}%</td>
                  <td>{amountLabel(link.explanationJson.transactionAmount ?? null)} / neto {amountLabel(link.explanationJson.ledgerNetAmount ?? null)}</td>
                  <td>{link.state === 'PROPOSED' ? <div className="reconciliation-actions"><Button onClick={() => void decide(link.id, 'CONFIRMED')}>Confirmar</Button><Button variant="secondary" onClick={() => void decide(link.id, 'REJECTED')}>Rechazar</Button></div> : 'Sin acción'}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </article>;
      })}
    </div> : null}
  </section>;
}

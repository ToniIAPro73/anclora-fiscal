'use client';

import type { CommercialEvidence, FinancialEvidence } from '@anclora/core';
import { matchOrder } from '@anclora/core';
import { StatusBadge } from '@anclora/ui';

const order: CommercialEvidence = { orderId: 'AI-1001', checkoutId: '#68683485610367' };
const events: FinancialEvidence[] = [
  { id: 'evt-charge-1', orderId: 'AI-1001', checkoutId: '#68683485610367', type: 'charge', amount: 6.99, fee: 0.35, net: 6.64, currency: 'EUR' },
  { id: 'evt-refund-1', orderId: 'AI-1001', checkoutId: '#68683485610367', type: 'refund', amount: -6.99, fee: -0.35, net: -6.64, currency: 'EUR' },
];

export function OperationsTimeline() {
  const draft = matchOrder(order, events);
  const netZero = Math.abs(draft.netAmount) < 0.005;

  return <section className="operations-timeline">
    <span className="section-index">Vista de demostración — caso de referencia AI-1001</span>
    <div className="timeline-summary">
      <StatusBadge tone={draft.status === 'PENDING_TAX_REVIEW' ? 'warning' : 'info'}>{draft.status}</StatusBadge>
      <StatusBadge tone={draft.reconciliationStatus === 'MATCHED' ? 'info' : 'warning'}>{draft.reconciliationStatus}</StatusBadge>
      <dl>
        <div><dt>Bruto</dt><dd>{draft.grossAmount.toFixed(2)} EUR</dd></div>
        <div><dt>Comisión</dt><dd>{draft.platformFeeAmount.toFixed(2)} EUR</dd></div>
        <div><dt>Neto</dt><dd>{draft.netAmount.toFixed(2)} EUR</dd></div>
      </dl>
    </div>
    <ol className="evidence-thread">
      <li>
        <time>PEDIDO</time>
        <div><strong>Pedido comercial importado</strong><p>AI-1001 · checkout {order.checkoutId}</p></div>
        <StatusBadge tone="info">Evidencia original</StatusBadge>
      </li>
      {events.map((event) => {
        const match = draft.matches.find((candidate) => candidate.eventId === event.id);
        return <li key={event.id}>
          <time>{event.type === 'charge' ? 'COBRO' : 'REEMB.'}</time>
          <div>
            <strong>{event.type === 'charge' ? 'Cobro enlazado al pedido' : 'Reembolso registrado'}</strong>
            <p>{event.amount.toFixed(2)} EUR{match ? ` · confianza ${(match.confidence * 100).toFixed(0)} %` : ' · sin coincidencia'}</p>
          </div>
          <StatusBadge tone={match ? 'info' : 'blocking'}>{match ? 'Trazado' : 'Sin coincidencia'}</StatusBadge>
        </li>;
      })}
      <li>
        <time>PAYOUT</time>
        <div><strong>Payout pendiente</strong><p>Sin liquidación registrada todavía para este pedido.</p></div>
        <StatusBadge tone="warning">Pendiente</StatusBadge>
      </li>
    </ol>
    {netZero ? <p className="timeline-net-zero">Neto cero confirmado: el cobro y el reembolso se cancelan.</p> : null}
  </section>;
}

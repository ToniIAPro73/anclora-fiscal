'use client';

import type { CommercialEvidence, FinancialEvidence } from '@anclora/core';
import { matchOrder } from '@anclora/core';
import { StatusBadge } from '@anclora/ui';

interface DemoCase { label: string; order: CommercialEvidence; events: FinancialEvidence[] }

const cases: DemoCase[] = [
  {
    label: 'AI-1001 · reembolso total',
    order: { orderId: 'AI-1001', checkoutId: '#68683485610367' },
    events: [
      { id: 'evt-charge-1', orderId: 'AI-1001', checkoutId: '#68683485610367', type: 'charge', amount: 6.99, fee: 0.35, net: 6.64, currency: 'EUR' },
      { id: 'evt-refund-1', orderId: 'AI-1001', checkoutId: '#68683485610367', type: 'refund', amount: -6.99, fee: -0.35, net: -6.64, currency: 'EUR' },
    ],
  },
  {
    label: 'SP-2045 · cobro único',
    order: { orderId: 'SP-2045', checkoutId: '#900011' },
    events: [
      { id: 'evt-charge-2', orderId: 'SP-2045', checkoutId: '#900011', type: 'charge', amount: 24.5, fee: 1.1, net: 23.4, currency: 'EUR' },
    ],
  },
  {
    label: 'SP-3399 · cobro sin pedido',
    order: { orderId: 'SP-3399', checkoutId: '#900099' },
    events: [
      { id: 'evt-charge-3', orderId: 'SP-8888', checkoutId: '#111222', type: 'charge', amount: 12.0, fee: 0.6, net: 11.4, currency: 'EUR' },
    ],
  },
];

const stateTone = (status: string) => status === 'MATCHED' ? 'info' : status === 'PARTIALLY_MATCHED' ? 'warning' : 'blocking';
const reconciliationLabels: Record<string, string> = { MATCHED: 'Conciliado', PARTIALLY_MATCHED: 'Parcialmente conciliado', UNMATCHED: 'Excepción' };

export function ReconciliationWorkbench() {
  const rows = cases.map((demoCase) => ({ ...demoCase, draft: matchOrder(demoCase.order, demoCase.events) }));

  return <section className="reconciliation-workbench">
    <span className="section-index">Vista de demostración</span>
    <table>
      <thead>
        <tr><th scope="col">Caso</th><th scope="col">Bruto</th><th scope="col">Comisión</th><th scope="col">Neto</th><th scope="col">Estado</th><th scope="col">Confianza</th></tr>
      </thead>
      <tbody>
        {rows.map(({ label, draft }) => {
          const confidence = draft.matches.reduce((max, match) => Math.max(max, match.confidence), 0);
          return <tr key={label}>
            <td>{label}</td>
            <td>{draft.grossAmount.toFixed(2)} EUR</td>
            <td>{draft.platformFeeAmount.toFixed(2)} EUR</td>
            <td>{draft.netAmount.toFixed(2)} EUR</td>
            <td><StatusBadge tone={stateTone(draft.reconciliationStatus)}>{reconciliationLabels[draft.reconciliationStatus] ?? draft.reconciliationStatus}</StatusBadge></td>
            <td>{(confidence * 100).toFixed(0)} %</td>
          </tr>;
        })}
      </tbody>
    </table>
  </section>;
}

'use client';

import { ImportCard } from './import-card';
import type { CommercialOrderPreview, ImportIssue, PreviewResponse } from './types';

function PayoutsPreviewTable({ preview, issuesByPosition }: { preview: PreviewResponse; issuesByPosition: Map<number, ImportIssue[]> }) {
  const rows: CommercialOrderPreview[] = preview.commercialOrders
    ?? preview.summary.orderIds.map((externalOrderId) => ({ externalOrderId }));

  return <table>
    <thead>
      <tr>
        <th scope="col">Payout</th>
        <th scope="col">Fecha</th>
        <th scope="col">Importe</th>
        <th scope="col">Incidencias</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((payout, index) => {
        const rowIssues = issuesByPosition.get(index + 1) ?? [];
        return <tr key={payout.externalOrderId}>
          <td>{payout.externalOrderId}</td>
          <td>{payout.commercialDate ? new Date(payout.commercialDate).toLocaleDateString('es-ES') : '—'}</td>
          <td>{payout.totalAmount ?? '—'}</td>
          <td>{rowIssues.length > 0 ? rowIssues.map((issue) => `${issue.code}: ${issue.message}`).join('; ') : '—'}</td>
        </tr>;
      })}
    </tbody>
  </table>;
}

export interface ShopifyPaymentsCardProps {
  /**
   * Whether the shopify-payments connector mapping is ready to accept
   * uploads. Defaults to enabled — the backend connector for this
   * connectorId is being built in the same batch as this UI (FASE 03
   * Batch 2), not a future phase.
   */
  enabled?: boolean;
}

export function ShopifyPaymentsCard({ enabled = true }: ShopifyPaymentsCardProps) {
  return <ImportCard
    connectorId="shopify-payments"
    title="Shopify — Pagos y payouts"
    description="Analiza y confirma los payouts de Shopify Payments para habilitar la conciliación."
    accept=".csv,text/csv"
    fileFieldId="shopify-payments-file"
    fileFieldLabel="Archivo de payouts Shopify"
    hint="CSV de pagos y payouts Shopify · máximo 15 MB"
    disabled={!enabled}
    disabledReason="El mapeo de payouts Shopify está en construcción — próximamente disponible."
    renderPreviewTable={(preview, issuesByPosition) => <PayoutsPreviewTable preview={preview} issuesByPosition={issuesByPosition} />}
  />;
}

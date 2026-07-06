'use client';

import { ImportCard } from './import-card';
import type { ImportIssue, PreviewResponse } from './types';

function LedgerPreviewTable({ preview, issuesByPosition }: { preview: PreviewResponse; issuesByPosition: Map<number, ImportIssue[]> }) {
  const rows = preview.shopifyPaymentsLedger?.entries ?? [];

  return <table>
    <thead>
      <tr>
        <th scope="col">Pedido</th><th scope="col">Movimiento</th><th scope="col">Bruto</th><th scope="col">Fee</th><th scope="col">Neto</th><th scope="col">Liquidación</th>
        <th scope="col">Incidencias</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((entry, index) => {
        const rowIssues = issuesByPosition.get(index + 2) ?? [];
        const settlement = entry.externalPayoutId ? `Payout ${entry.externalPayoutId}` : 'Liquidación pendiente';
        return <tr key={`${entry.orderName}-${entry.entryType}-${index}`}>
          <td>{entry.orderName}</td><td>{entry.entryType}</td><td>{entry.amount} {entry.currency}</td><td>{entry.feeAmount} {entry.currency}</td><td>{entry.netAmount} {entry.currency}</td><td>{settlement}</td>
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
    title="Shopify Payments — Ledger y liquidación"
    description="Movimientos, fees y netos de Shopify Payments. Sin Payout ID se muestra como liquidación pendiente."
    accept=".csv,text/csv"
    fileFieldId="shopify-payments-file"
    fileFieldLabel="Archivo de ledger Shopify Payments"
    hint="CSV View payouts → View transactions → Export · máximo 15 MB"
    disabled={!enabled}
    disabledReason="El mapeo de payouts Shopify está en construcción — próximamente disponible."
    renderPreviewTable={(preview, issuesByPosition) => <LedgerPreviewTable preview={preview} issuesByPosition={issuesByPosition} />}
  />;
}

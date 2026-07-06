'use client';

import { ImportCard } from './import-card';
import type { ImportIssue, PreviewResponse } from './types';

function TransactionsPreviewTable({ preview, issuesByPosition }: { preview: PreviewResponse; issuesByPosition: Map<number, ImportIssue[]> }) {
  const events = preview.shopifyOrderTransactions?.events ?? [];
  return <table>
    <thead><tr><th scope="col">Pedido</th><th scope="col">ID interno</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col">Importe</th><th scope="col">Fecha</th><th scope="col">Incidencias</th></tr></thead>
    <tbody>{events.map((event, index) => {
      const issues = issuesByPosition.get(index + 2) ?? [];
      return <tr key={`${event.orderId}-${event.kind}-${event.occurredAt}`}>
        <td>{event.orderName}</td><td>{event.orderId}</td><td>{event.kind}</td><td>{event.status}</td>
        <td>{event.amount} {event.currency}</td><td>{new Date(event.occurredAt).toLocaleDateString('es-ES')}</td>
        <td>{issues.length ? issues.map((issue) => issue.code).join(', ') : '—'}</td>
      </tr>;
    })}</tbody>
  </table>;
}

export function ShopifyOrderTransactionsCard() {
  return <ImportCard
    connectorId="shopify-order-transactions"
    title="Shopify — Transacciones de pedido"
    description="Historial de cobros, autorizaciones y devoluciones asociado a cada pedido."
    accept=".csv,text/csv"
    fileFieldId="shopify-order-transactions-file"
    fileFieldLabel="Archivo de transacciones de pedido Shopify"
    hint="CSV Export transaction history de Shopify · máximo 15 MB"
    renderPreviewTable={(preview, issues) => <TransactionsPreviewTable preview={preview} issuesByPosition={issues} />}
  />;
}

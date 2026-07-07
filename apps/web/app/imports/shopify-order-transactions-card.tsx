"use client";

import { DataTable } from "@anclora/ui";
import { statusLabel, transactionTypeLabel } from "../lib/display-labels";
import { ImportCard } from "./import-card";
import type { ImportIssue, PreviewResponse } from "./types";

function TransactionsPreviewTable({
  preview,
  issuesByPosition,
}: {
  preview: PreviewResponse;
  issuesByPosition: Map<number, ImportIssue[]>;
}) {
  const events = preview.shopifyOrderTransactions?.events ?? [];

  return (
    <DataTable
      caption="Vista previa de transacciones de pedido Shopify"
      rows={events.map((event, index) => ({ ...event, position: index + 2 }))}
      rowKey={(event) => `${event.orderId}-${event.kind}-${event.occurredAt}`}
      minWidth={860}
      emptyMessage="No se han detectado transacciones de pedido."
      columns={[
        { key: "order", header: "Pedido", render: (event) => event.orderName },
        {
          key: "internalId",
          header: "ID interno",
          render: (event) => event.orderId,
        },
        {
          key: "kind",
          header: "Tipo",
          render: (event) => transactionTypeLabel(event.kind),
        },
        {
          key: "status",
          header: "Estado",
          render: (event) => statusLabel(event.status),
        },
        {
          key: "amount",
          header: "Importe",
          render: (event) => `${event.amount} ${event.currency}`,
        },
        {
          key: "date",
          header: "Fecha",
          render: (event) =>
            new Date(event.occurredAt).toLocaleDateString("es-ES"),
        },
        {
          key: "issues",
          header: "Incidencias",
          render: (event) => {
            const issues = issuesByPosition.get(event.position) ?? [];
            return issues.length
              ? issues.map((issue) => issue.code).join(", ")
              : "-";
          },
        },
      ]}
    />
  );
}

export function ShopifyOrderTransactionsCard() {
  return (
    <ImportCard
      connectorId="shopify-order-transactions"
      title="Shopify — Transacciones de pedido"
      description="Historial de cobros, autorizaciones y devoluciones asociado a cada pedido."
      accept=".csv,text/csv"
      fileFieldId="shopify-order-transactions-file"
      fileFieldLabel="Archivo de transacciones de pedido Shopify"
      hint="CSV Export transaction history de Shopify · máximo 15 MB"
      renderPreviewTable={(preview, issues) => (
        <TransactionsPreviewTable preview={preview} issuesByPosition={issues} />
      )}
    />
  );
}

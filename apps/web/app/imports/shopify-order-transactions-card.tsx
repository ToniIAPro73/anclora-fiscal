"use client";

import { DataTable } from "@anclora/ui";
import { issueLabel, statusLabel, transactionTypeLabel } from "../lib/display-labels";
import { ImportCard } from "./import-card";
import type { ImportIssue, PreviewResponse } from "./types";

type TransactionPreviewRow = NonNullable<
  PreviewResponse["shopifyOrderTransactions"]
>["events"][number] & { position: number };

function orderName(event: TransactionPreviewRow) {
  return event.orderName ?? event.shopifyOrderName ?? "Sin pedido";
}

function internalOrderId(event: TransactionPreviewRow) {
  return event.orderId ?? event.shopifyOrderId ?? "Sin ID interno";
}

function buyerLabel(event: TransactionPreviewRow) {
  return event.customerName || event.customerEmail || "Comprador no informado";
}

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
      rowKey={(event) =>
        `${internalOrderId(event)}-${event.kind}-${event.occurredAt}-${event.position}`
      }
      minWidth={1080}
      emptyMessage="No se han detectado transacciones de pedido."
      columns={[
        { key: "order", header: "Pedido", render: orderName },
        {
          key: "internalId",
          header: "ID interno",
          render: internalOrderId,
        },
        {
          key: "buyer",
          header: "Comprador",
          render: (event) => (
            <div className="cell-stack">
              <strong>{buyerLabel(event)}</strong>
              <span>{event.customerEmail ?? event.customerCountry ?? "Sin email ni país"}</span>
            </div>
          ),
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
            return issues.length ? (
              <div className="cell-stack">
                {issues.map((issue) => (
                  <span key={`${event.position}-${issue.code}`}>
                    {issueLabel(issue.code)}
                    {issue.message ? ` · ${issue.message}` : ""}
                  </span>
                ))}
              </div>
            ) : (
              "Sin incidencias"
            );
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

"use client";

import { DataTable } from "@anclora/ui";
import { ImportCard } from "./import-card";
import type { ImportIssue, PreviewResponse } from "./types";

function LedgerPreviewTable({
  preview,
  issuesByPosition,
}: {
  preview: PreviewResponse;
  issuesByPosition: Map<number, ImportIssue[]>;
}) {
  const rows = preview.shopifyPaymentsLedger?.entries ?? [];

  return (
    <DataTable
      caption="Vista previa de ledger Shopify Payments"
      rows={rows.map((entry, index) => ({ ...entry, position: index + 2 }))}
      rowKey={(entry) =>
        `${entry.orderName}-${entry.entryType}-${entry.position}`
      }
      minWidth={900}
      emptyMessage="No se han detectado movimientos de ledger."
      columns={[
        { key: "order", header: "Pedido", render: (entry) => entry.orderName },
        {
          key: "movement",
          header: "Movimiento",
          render: (entry) => entry.entryType,
        },
        {
          key: "gross",
          header: "Bruto",
          render: (entry) => `${entry.amount} ${entry.currency}`,
        },
        {
          key: "fee",
          header: "Fee",
          render: (entry) => `${entry.feeAmount} ${entry.currency}`,
        },
        {
          key: "net",
          header: "Neto",
          render: (entry) => `${entry.netAmount} ${entry.currency}`,
        },
        {
          key: "settlement",
          header: "Liquidación",
          render: (entry) =>
            entry.externalPayoutId
              ? `Payout ${entry.externalPayoutId}`
              : "Liquidación pendiente",
        },
        {
          key: "issues",
          header: "Incidencias",
          render: (entry) => {
            const rowIssues = issuesByPosition.get(entry.position) ?? [];
            return rowIssues.length > 0
              ? rowIssues
                  .map((issue) => `${issue.code}: ${issue.message}`)
                  .join("; ")
              : "-";
          },
        },
      ]}
    />
  );
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

export function ShopifyPaymentsCard({
  enabled = true,
}: ShopifyPaymentsCardProps) {
  return (
    <ImportCard
      connectorId="shopify-payments"
      title="Shopify Payments — Ledger y liquidación"
      description="Movimientos, fees y netos de Shopify Payments. Sin Payout ID se muestra como liquidación pendiente."
      accept=".csv,text/csv"
      fileFieldId="shopify-payments-file"
      fileFieldLabel="Archivo de ledger Shopify Payments"
      hint="CSV View payouts → View transactions → Export · máximo 15 MB"
      disabled={!enabled}
      disabledReason="El mapeo de payouts Shopify está en construcción — próximamente disponible."
      renderPreviewTable={(preview, issuesByPosition) => (
        <LedgerPreviewTable
          preview={preview}
          issuesByPosition={issuesByPosition}
        />
      )}
    />
  );
}

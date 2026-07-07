"use client";

import { DataTable } from "@anclora/ui";
import { issueLabel, ledgerEntryLabel } from "../lib/display-labels";
import { ImportCard } from "./import-card";
import type { ImportIssue, PreviewResponse } from "./types";

type LedgerPreviewRow = NonNullable<
  PreviewResponse["shopifyPaymentsLedger"]
>["entries"][number] & { position: number };

function orderName(entry: LedgerPreviewRow) {
  return entry.orderName ?? entry.shopifyOrderName ?? "Sin pedido";
}

function buyerLabel(entry: LedgerPreviewRow) {
  return entry.customerName || entry.customerEmail || "Comprador no informado";
}

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
      caption="Vista previa de movimientos Shopify Payments"
      rows={rows.map((entry, index) => ({ ...entry, position: index + 2 }))}
      rowKey={(entry) =>
        `${orderName(entry)}-${entry.entryType}-${entry.position}`
      }
      minWidth={1080}
      emptyMessage="No se han detectado movimientos."
      columns={[
        { key: "order", header: "Pedido", render: orderName },
        {
          key: "buyer",
          header: "Comprador",
          render: (entry) => (
            <div className="cell-stack">
              <strong>{buyerLabel(entry)}</strong>
              <span>{entry.customerEmail ?? entry.customerCountry ?? "Sin email ni país"}</span>
            </div>
          ),
        },
        {
          key: "movement",
          header: "Movimiento",
          render: (entry) => ledgerEntryLabel(entry.entryType),
        },
        {
          key: "gross",
          header: "Bruto",
          render: (entry) => `${entry.amount} ${entry.currency}`,
        },
        {
          key: "fee",
          header: "Comisión",
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
              ? `Liquidación ${entry.externalPayoutId}`
              : "Liquidación pendiente",
        },
        {
          key: "issues",
          header: "Incidencias",
          render: (entry) => {
            const rowIssues = issuesByPosition.get(entry.position) ?? [];
            return rowIssues.length > 0 ? (
              <div className="cell-stack">
                {rowIssues.map((issue) => (
                  <span key={`${entry.position}-${issue.code}`}>
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
      title="Shopify Payments — Movimientos y liquidación"
      description="Movimientos, comisiones y netos de Shopify Payments. Sin ID de liquidación se muestra como liquidación pendiente."
      accept=".csv,text/csv"
      fileFieldId="shopify-payments-file"
      fileFieldLabel="Archivo de movimientos Shopify Payments"
      hint="CSV View payouts → View transactions → Export · máximo 15 MB"
      disabled={!enabled}
      disabledReason="El mapeo de liquidaciones Shopify está en construcción — próximamente disponible."
      renderPreviewTable={(preview, issuesByPosition) => (
        <LedgerPreviewTable
          preview={preview}
          issuesByPosition={issuesByPosition}
        />
      )}
    />
  );
}

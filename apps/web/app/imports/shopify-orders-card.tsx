"use client";

import { useState } from "react";
import { DataTable, DateRangeField, SelectField } from "@anclora/ui";
import { statusLabel } from "../lib/display-labels";
import { ImportCard } from "./import-card";
import type {
  CommercialOrderPreview,
  ImportIssue,
  PreviewResponse,
} from "./types";

type OrderPreviewRow = CommercialOrderPreview & {
  financialStatus?: string;
  lineCount?: number;
  position: number;
};

function OrdersPreviewTable({
  preview,
  issuesByPosition,
}: {
  preview: PreviewResponse;
  issuesByPosition: Map<number, ImportIssue[]>;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [productNature, setProductNature] = useState("");

  const rows: OrderPreviewRow[] =
    preview.shopifyOrders?.orders.map((order, index) => ({
      ...order,
      externalOrderId: order.orderName,
      financialStatus: order.financialStatus,
      lineCount: order.lines.length,
      position: index + 1,
    })) ??
    preview.commercialOrders?.map((order, index) => ({
      ...order,
      position: index + 1,
    })) ??
    preview.summary.orderIds.map((externalOrderId, index) => ({
      externalOrderId,
      position: index + 1,
    }));

  const filteredRows = rows.filter(
    (order) =>
      (!dateFrom ||
        Boolean(
          order.commercialDate && order.commercialDate.slice(0, 10) >= dateFrom,
        )) &&
      (!dateTo ||
        Boolean(
          order.commercialDate && order.commercialDate.slice(0, 10) <= dateTo,
        )) &&
      (!productNature || order.productNature === productNature),
  );

  return (
    <>
      <div
        className="operation-filters operation-filters-compact"
        aria-label="Filtros de pedidos Shopify"
      >
        <DateRangeField
          label="Rango de fechas"
          value={{ from: dateFrom, to: dateTo }}
          onChange={(range) => {
            setDateFrom(range.from);
            setDateTo(range.to);
          }}
        />
        <SelectField
          label="Tipo de producto"
          placeholder="Todos"
          options={[
            { value: "ebook", label: "eBook" },
            { value: "general", label: "Tapa blanda / general" },
          ]}
          value={productNature}
          onChange={(event) => setProductNature(event.target.value)}
        />
      </div>
      <DataTable
        caption="Vista previa de pedidos Shopify"
        rows={filteredRows}
        rowKey={(order) => order.externalOrderId}
        minWidth={860}
        emptyMessage="No hay pedidos que coincidan con los filtros seleccionados."
        columns={[
          {
            key: "externalOrderId",
            header: "Pedido",
            render: (order) => order.externalOrderId,
          },
          {
            key: "commercialDate",
            header: "Fecha",
            render: (order) =>
              order.commercialDate
                ? new Date(order.commercialDate).toLocaleDateString("es-ES")
                : "-",
          },
          {
            key: "status",
            header: "Estado",
            render: (order) =>
              order.financialStatus
                ? statusLabel(order.financialStatus)
                : "-",
          },
          {
            key: "buyer",
            header: "Comprador",
            render: (order) => (
              <div className="cell-stack">
                <strong>{order.customerName ?? "Sin nombre"}</strong>
                <span>{order.customerEmail ?? order.customerCountry ?? "Sin email ni país"}</span>
              </div>
            ),
          },
          {
            key: "lines",
            header: "Líneas",
            render: (order) => order.lineCount ?? "-",
          },
          {
            key: "total",
            header: "Total",
            render: (order) => (
              <div className="cell-stack">
                <strong>{order.totalAmount ?? "-"}</strong>
                {Number(order.discountAmount ?? 0) > 0 || order.discountCode ? (
                  <span>
                    {order.discountCode
                      ? `Descuento · ${order.discountCode}`
                      : `Descuento · ${order.discountAmount}`}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: "tax",
            header: "IVA",
            render: (order) => order.taxAmount ?? "-",
          },
          {
            key: "issues",
            header: "Incidencias",
            render: (order) => {
              const rowIssues = issuesByPosition.get(order.position) ?? [];
              return rowIssues.length > 0
                ? rowIssues
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")
                : "-";
            },
          },
        ]}
      />
    </>
  );
}

export function ShopifyOrdersCard() {
  return (
    <ImportCard
      connectorId="shopify-orders"
      title="Shopify — Pedidos"
      description="CSV exportado desde Orders. Crea pedidos y líneas comerciales al confirmar."
      accept=".csv,text/csv"
      fileFieldId="shopify-orders-file"
      fileFieldLabel="Archivo de pedidos Shopify"
      hint="CSV de pedidos Shopify · máximo 15 MB"
      renderPreviewTable={(preview, issuesByPosition) => (
        <OrdersPreviewTable
          preview={preview}
          issuesByPosition={issuesByPosition}
        />
      )}
      nextStepsNote="Próximos pasos: puedes cargar otro archivo de pedidos o revisar las operaciones pendientes en Facturación."
    />
  );
}

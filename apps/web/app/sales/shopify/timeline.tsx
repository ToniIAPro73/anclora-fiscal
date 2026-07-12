"use client";

import { useEffect, useState } from "react";
import { Button, DataTable, SelectField, StatusBadge } from "@anclora/ui";
import { settlementLabel as settlementStatusLabel, statusLabel } from "../../lib/display-labels";

interface Sale {
  id: string;
  externalOrderId: string;
  commercialDate: string | null;
  totalAmount: string | null;
  discountCode: string | null;
  discountAmount: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerCountry: string | null;
  paymentStatus: string;
  refundStatus: string;
  fiscalStatus: string;
  transactionCount: number;
  ledgerCount: number;
  feeAmount: string;
  payoutStatus: string;
}

interface Response {
  items: Sale[];
  metrics: {
    salesAmount: string;
    refundedAmount: string;
    feeAmount: string;
    pendingSettlement: number;
  };
}

const emptyFilters = {
  paymentStatus: "",
  refundStatus: "",
  fiscalStatus: "",
  settlementStatus: "",
  zeroAmount: "",
};

function activeFilterParams(filters: typeof emptyFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

function formatEuros(value: string | null | undefined) {
  return `${Number(value ?? 0).toFixed(2)} €`;
}

function buyerLabel(sale: Sale) {
  return sale.customerName || sale.customerEmail || "Comprador no informado";
}

function discountLabel(sale: Sale) {
  if (Number(sale.discountAmount ?? 0) <= 0 && !sale.discountCode) return null;
  return sale.discountCode
    ? `Descuento aplicado · ${sale.discountCode}`
    : `Descuento aplicado · ${formatEuros(sale.discountAmount)}`;
}

function isZeroAmount(sale: Sale) {
  return Number(sale.totalAmount ?? 0) === 0;
}

function paymentSummary(sale: Sale) {
  if (isZeroAmount(sale)) {
    return { tone: "info" as const, label: "No requiere cobro", detail: discountLabel(sale) ?? "Pedido gratuito" };
  }
  if (sale.transactionCount > 0) {
    return {
      tone: sale.paymentStatus === "PAID" ? "info" as const : "warning" as const,
      label: sale.paymentStatus === "PAID" ? "Cobro confirmado" : statusLabel(sale.paymentStatus),
      detail: `${sale.transactionCount} evento${sale.transactionCount === 1 ? "" : "s"} de pago`,
    };
  }
  return { tone: "warning" as const, label: "Falta transacción", detail: "Importa transacciones de pedidos" };
}

function evidenceSummary(sale: Sale) {
  if (isZeroAmount(sale)) return { tone: "info" as const, label: "Cruce no requerido", detail: "Importe cero" };
  if (sale.transactionCount > 0 && sale.ledgerCount > 0) {
    return {
      tone: "info" as const,
      label: "Datos internos cruzados",
      detail: `${sale.transactionCount} transacción${sale.transactionCount === 1 ? "" : "es"} · ${sale.ledgerCount} movimiento${sale.ledgerCount === 1 ? "" : "s"}`,
    };
  }
  if (sale.transactionCount === 0) return { tone: "warning" as const, label: "Cruce incompleto", detail: "Falta la transacción del pedido" };
  return { tone: "warning" as const, label: "Cruce incompleto", detail: "Falta Shopify Payments" };
}

function nextAction(sale: Sale) {
  if (isZeroAmount(sale)) return { label: "Revisar tratamiento fiscal", href: `/sales/shopify/${sale.id}` };
  if (sale.transactionCount === 0 || sale.ledgerCount === 0) return { label: "Completar evidencia", href: "/imports" };
  if (sale.fiscalStatus === "INVOICED" || sale.fiscalStatus === "ISSUED") return { label: "Ver documento", href: `/sales/shopify/${sale.id}` };
  if (sale.fiscalStatus === "READY_FOR_INVOICING") return { label: "Ir a facturación", href: "/invoicing" };
  return { label: "Revisar fiscalidad", href: `/sales/shopify/${sale.id}` };
}

export function OperationsTimeline() {
  const [data, setData] = useState<Response>();
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(emptyFilters);

  useEffect(() => {
    const query = activeFilterParams(filters);
    fetch(`/api/v1/shopify/sales?${query}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron obtener las ventas Shopify");
        return response.json() as Promise<Response>;
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, [filters]);

  if (error) return <p className="workbench-notice workbench-notice-error">{error}</p>;
  if (!data) return <p className="workbench-notice">Cargando ventas Shopify…</p>;

  return (
    <section className="operations-timeline shopify-operations-hub">
      <div className="workflow-guide" role="note">
        <strong>Cómo leer esta pantalla</strong>
        <span>Pedido → cobro → cruce de archivos → payout → decisión fiscal → factura.</span>
        <span>Un pedido puede tener sus datos internos cruzados y seguir pendiente de payout o de tratamiento fiscal.</span>
      </div>

      <span className="section-index">Resumen operativo</span>
      <div className="summary-grid shopify-summary-grid">
        <article><span>Ventas brutas</span><strong>{Number(data.metrics.salesAmount).toFixed(2)} €</strong></article>
        <article><span>Reembolsos</span><strong>{Number(data.metrics.refundedAmount).toFixed(2)} €</strong></article>
        <article><span>Comisiones Shopify</span><strong>{Number(data.metrics.feeAmount).toFixed(2)} €</strong></article>
        <article><span>Payouts pendientes</span><strong>{data.metrics.pendingSettlement}</strong></article>
      </div>

      <div className="operation-filters shopify-sales-filters" aria-label="Filtros de ventas Shopify">
        <SelectField label="Cobro" placeholder="Todos" options={[{ value: "PAID", label: "Confirmado" }, { value: "PENDING", label: "Pendiente" }]} value={filters.paymentStatus} onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })} />
        <SelectField label="Reembolso" placeholder="Todos" options={[{ value: "NONE", label: "Sin reembolso" }, { value: "PARTIAL", label: "Parcial" }, { value: "FULL", label: "Total" }]} value={filters.refundStatus} onChange={(event) => setFilters({ ...filters, refundStatus: event.target.value })} />
        <SelectField label="Payout" placeholder="Todos" options={[{ value: "PENDING", label: "Pendiente" }, { value: "SETTLED", label: "Identificado" }]} value={filters.settlementStatus} onChange={(event) => setFilters({ ...filters, settlementStatus: event.target.value })} />
        <SelectField label="Importe" placeholder="Todos" options={[{ value: "true", label: "Cero" }, { value: "false", label: "Mayor que cero" }]} value={filters.zeroAmount} onChange={(event) => setFilters({ ...filters, zeroAmount: event.target.value })} />
        <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>Limpiar</Button>
        <a className="btn shopify-export-button" href={`/api/v1/shopify/sales/export?${activeFilterParams(filters)}`}>Exportar CSV para asesoría</a>
      </div>

      <DataTable
        caption="Ventas Shopify"
        rows={data.items}
        rowKey={(sale) => sale.id}
        minWidth={1320}
        emptyMessage="No hay pedidos Shopify para los filtros seleccionados."
        className="shopify-sales-table shopify-workflow-table"
        columns={[
          { key: "order", header: "Pedido", render: (sale) => <div className="cell-stack"><a href={`/sales/shopify/${sale.id}`}><strong>{sale.externalOrderId}</strong></a><span>{sale.commercialDate ? new Date(sale.commercialDate).toLocaleDateString("es-ES") : "Sin fecha"}</span></div> },
          { key: "buyer", header: "Comprador", render: (sale) => <div className="cell-stack"><strong>{buyerLabel(sale)}</strong><span>{sale.customerEmail ?? sale.customerCountry ?? "Sin email ni país"}</span></div> },
          { key: "amount", header: "Venta", render: (sale) => <div className="cell-stack"><strong>{formatEuros(sale.totalAmount)}</strong>{discountLabel(sale) ? <span>{discountLabel(sale)}</span> : null}</div> },
          { key: "payment", header: "Cobro", render: (sale) => { const summary = paymentSummary(sale); return <div className="cell-stack"><StatusBadge tone={summary.tone}>{summary.label}</StatusBadge><span>{summary.detail}</span></div>; } },
          { key: "evidence", header: "Cruce de datos", render: (sale) => { const summary = evidenceSummary(sale); return <div className="cell-stack"><StatusBadge tone={summary.tone}>{summary.label}</StatusBadge><span>{summary.detail}</span></div>; } },
          { key: "settlement", header: "Payout", render: (sale) => <StatusBadge tone={sale.payoutStatus === "SETTLED" || isZeroAmount(sale) ? "info" : "warning"}>{settlementStatusLabel(sale.payoutStatus, isZeroAmount(sale))}</StatusBadge> },
          { key: "fiscal", header: "Fiscalidad y acción", render: (sale) => { const action = nextAction(sale); return <div className="cell-stack fiscal-action-cell"><strong>{statusLabel(sale.fiscalStatus)}</strong><a href={action.href}>{action.label} →</a></div>; } },
        ]}
      />
    </section>
  );
}

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

function evidenceLabel(sale: Sale) {
  if (isZeroAmount(sale) && sale.transactionCount === 0 && sale.ledgerCount === 0) {
    return "Pedido con importe cero · sin cobro requerido";
  }
  if (sale.transactionCount || sale.ledgerCount) {
    return `${sale.transactionCount} transacción · ${sale.ledgerCount} movimiento`;
  }
  return <StatusBadge tone="warning">Faltan transacciones</StatusBadge>;
}

export function OperationsTimeline() {
  const [data, setData] = useState<Response>();
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(emptyFilters);

  useEffect(() => {
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value),
    );
    fetch(`/api/v1/shopify/sales?${query}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("No se pudieron obtener las ventas Shopify");
        return response.json() as Promise<Response>;
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, [filters]);

  if (error)
    return <p className="workbench-notice workbench-notice-error">{error}</p>;
  if (!data)
    return <p className="workbench-notice">Cargando ventas Shopify…</p>;

  return (
    <section className="operations-timeline">
      <span className="section-index">Resumen operativo</span>
      <div className="summary-grid">
        <article>
          <span>Ventas</span>
          <strong>{Number(data.metrics.salesAmount).toFixed(2)} €</strong>
        </article>
        <article>
          <span>Reembolsos</span>
          <strong>{Number(data.metrics.refundedAmount).toFixed(2)} €</strong>
        </article>
        <article>
          <span>Comisiones</span>
          <strong>{Number(data.metrics.feeAmount).toFixed(2)} €</strong>
        </article>
        <article>
          <span>Liquidación pendiente</span>
          <strong>{data.metrics.pendingSettlement}</strong>
        </article>
      </div>
      <div
        className="operation-filters shopify-sales-filters"
        aria-label="Filtros de ventas Shopify"
      >
        <SelectField
          label="Pago"
          placeholder="Todos"
          options={[
            { value: "PAID", label: "Pagado" },
            { value: "PENDING", label: "Pendiente" },
          ]}
          value={filters.paymentStatus}
          onChange={(e) =>
            setFilters({ ...filters, paymentStatus: e.target.value })
          }
        />
        <SelectField
          label="Reembolso"
          placeholder="Todos"
          options={[
            { value: "NONE", label: "Sin reembolso" },
            { value: "PARTIAL", label: "Parcial" },
            { value: "FULL", label: "Total" },
          ]}
          value={filters.refundStatus}
          onChange={(e) =>
            setFilters({ ...filters, refundStatus: e.target.value })
          }
        />
        <SelectField
          label="Liquidación"
          placeholder="Todas"
          options={[
            { value: "PENDING", label: "Pendiente" },
            { value: "SETTLED", label: "Liquidada" },
          ]}
          value={filters.settlementStatus}
          onChange={(e) =>
            setFilters({ ...filters, settlementStatus: e.target.value })
          }
        />
        <SelectField
          label="Importe"
          placeholder="Todos"
          options={[
            { value: "true", label: "Cero" },
            { value: "false", label: "Mayor que cero" },
          ]}
          value={filters.zeroAmount}
          onChange={(e) =>
            setFilters({ ...filters, zeroAmount: e.target.value })
          }
        />
        <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>
          Limpiar
        </Button>
      </div>
      <DataTable
        caption="Ventas Shopify"
        rows={data.items}
        rowKey={(sale) => sale.id}
        minWidth={1080}
        emptyMessage="No hay pedidos Shopify para los filtros seleccionados."
        className="shopify-sales-table"
        columns={[
          {
            key: "order",
            header: "Pedido",
            render: (sale) => (
              <div className="cell-stack">
                <a href={`/sales/shopify/${sale.id}`}>
                  <strong>{sale.externalOrderId}</strong>
                </a>
              </div>
            ),
          },
          {
            key: "buyer",
            header: "Comprador",
            render: (sale) => (
              <div className="cell-stack">
                <strong>{buyerLabel(sale)}</strong>
                <span>{sale.customerEmail ?? sale.customerCountry ?? "Sin email ni país"}</span>
              </div>
            ),
          },
          {
            key: "date",
            header: "Fecha",
            render: (sale) =>
              sale.commercialDate
                ? new Date(sale.commercialDate).toLocaleDateString("es-ES")
                : "Sin fecha",
          },
          {
            key: "amount",
            header: "Importe",
            render: (sale) => (
              <div className="cell-stack">
                <strong>{formatEuros(sale.totalAmount)}</strong>
                {Number(sale.totalAmount ?? 0) === 0 && discountLabel(sale) ? (
                  <span>{discountLabel(sale)}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: "evidence",
            header: "Evidencia",
            render: evidenceLabel,
          },
          {
            key: "settlement",
            header: "Liquidación",
            render: (sale) => (
              <StatusBadge
                tone={sale.payoutStatus === "SETTLED" || isZeroAmount(sale) ? "info" : "warning"}
              >
                {settlementStatusLabel(sale.payoutStatus, isZeroAmount(sale))}
              </StatusBadge>
            ),
          },
          {
            key: "fiscal",
            header: "Estado fiscal",
            render: (sale) => (
              <div className="cell-stack">
                <strong>{statusLabel(sale.fiscalStatus)}</strong>
                {Number(sale.totalAmount ?? 0) === 0 ? (
                  <span>{discountLabel(sale) ?? "Importe cero: requiere revisión"}</span>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}

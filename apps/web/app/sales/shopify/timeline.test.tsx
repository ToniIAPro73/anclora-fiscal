import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsTimeline } from "./timeline";
afterEach(() => vi.unstubAllGlobals());
const metrics = {
  salesAmount: "6.99",
  refundedAmount: "0",
  feeAmount: "0.35",
  pendingSettlement: 1,
};
const sale = {
  id: "01977d43-75de-7000-8000-000000000001",
  externalOrderId: "AI-1001",
  commercialDate: "2026-07-01",
  totalAmount: "6.99",
  discountCode: null,
  discountAmount: "0",
  customerName: "Ana García",
  customerEmail: "ana@example.test",
  customerCountry: "ES",
  paymentStatus: "PAID",
  refundStatus: "NONE",
  fiscalStatus: "PENDING",
  transactionCount: 1,
  ledgerCount: 1,
  feeAmount: "0.35",
  payoutStatus: "PENDING",
};
function mock(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) })),
  );
}
describe("OperationsTimeline SHOPIFY-06", () => {
  it("muestra carga", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<OperationsTimeline />);
    expect(screen.getByText("Cargando ventas Shopify…")).toBeInTheDocument();
  });
  it("muestra vacío honesto", async () => {
    mock({ items: [], metrics });
    render(<OperationsTimeline />);
    await screen.findByText(
      "No hay pedidos Shopify para los filtros seleccionados.",
    );
  });
  it("muestra métricas, evidencias y liquidación pendiente", async () => {
    mock({ items: [sale], metrics });
    render(<OperationsTimeline />);
    await screen.findByText("AI-1001");
    expect(screen.getByText("Comprador")).toBeInTheDocument();
    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getAllByText("Liquidación pendiente")).toHaveLength(2);
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6.99 €")).toHaveLength(2);
  });
  it("explica pedidos de importe cero por descuento y evita 'faltan movimientos'", async () => {
    mock({
      items: [{
        ...sale,
        externalOrderId: "AI-1002",
        totalAmount: "0",
        discountCode: "PRUEBA100",
        discountAmount: "6.99",
        fiscalStatus: "ZERO_VALUE_REVIEW",
        transactionCount: 0,
        ledgerCount: 0,
        payoutStatus: "LEDGER_MISSING",
      }],
      metrics,
    });
    render(<OperationsTimeline />);
    await screen.findByText("AI-1002");
    expect(screen.getAllByText("Descuento aplicado · PRUEBA100").length).toBeGreaterThan(0);
    expect(screen.getByText("Falta importar Shopify Payments")).toBeInTheDocument();
    expect(screen.queryByText("Faltan movimientos")).not.toBeInTheDocument();
    expect(screen.getByText("Estado fiscal")).toBeInTheDocument();
  });
  it("no afirma banco al identificar la liquidación", async () => {
    mock({ items: [{ ...sale, payoutStatus: "SETTLED" }], metrics });
    render(<OperationsTimeline />);
    await screen.findByText("Liquidación identificada");
    expect(screen.queryByText(/banco verificado/i)).not.toBeInTheDocument();
  });
  it("muestra error de API", async () => {
    mock({}, false);
    render(<OperationsTimeline />);
    await waitFor(() =>
      expect(
        screen.getByText("No se pudieron obtener las ventas Shopify"),
      ).toBeInTheDocument(),
    );
  });
});

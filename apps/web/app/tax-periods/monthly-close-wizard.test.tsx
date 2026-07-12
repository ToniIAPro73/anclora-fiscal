import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthlyCloseWizard } from "./monthly-close-wizard";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function start(status: "RED" | "GREEN" = "GREEN") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/session")
          ? { role: "REVIEWER" }
          : {
              status,
              reasons:
                status === "RED"
                  ? [{ code: "BLOCK", action: "Resolver bloqueo" }]
                  : [],
            },
    })),
  );
  render(<MonthlyCloseWizard />);
  fireEvent.change(screen.getByLabelText(/Periodo mensual/), {
    target: { value: "2026-06" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar revisión" }));
}
describe("MonthlyCloseWizard", () => {
  it("renderiza los cuatro pasos y nunca ofrece envío AEAT", () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ role: "ADVISOR_READONLY" }),
        }),
    );
    render(<MonthlyCloseWizard />);
    for (const label of [
      "Importaciones",
      "Revisión",
      "Facturación y VERI*FACTU",
      "Dossier",
    ])
      expect(
        screen.getByRole("button", { name: (name) => name.includes(label) }),
      ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enviar.*AEAT/i }),
    ).not.toBeInTheDocument();
  });
  it("el asesor readonly no puede ejecutar acciones", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async (url: string) => ({
          ok: true,
          json: async () =>
            url.endsWith("/session")
              ? { role: "ADVISOR_READONLY" }
              : { status: "GREEN", reasons: [] },
        })),
    );
    render(<MonthlyCloseWizard />);
    fireEvent.change(screen.getByLabelText(/Periodo mensual/), {
      target: { value: "2026-06" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar revisión" }));
    fireEvent.click(screen.getByRole("button", { name: /3\. Facturación/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Emitir elegibles" }),
      ).toBeDisabled(),
    );
  });
  it("bloquea el avance cuando readiness es RED", async () => {
    start("RED");
    await screen.findByText("RED");
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });
  it("permite volver a pasos anteriores", async () => {
    start();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(
      screen.getByRole("heading", { name: "Importaciones" }),
    ).toBeInTheDocument();
  });
  it("expone emisión controlada, cierre y dossier", async () => {
    start();
    await waitFor(() => expect(screen.getByText("GREEN")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /3\. Facturación/ }));
    expect(
      screen.getByRole("button", { name: "Emitir elegibles" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /4\. Dossier/ }));
    expect(
      screen.getByRole("button", { name: "Cerrar periodo" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generar dossier" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: "Descargar dossier" }),
    ).toHaveAttribute("href", "/api/v1/periods/2026-06/vat-dossier/archive");
  });
});

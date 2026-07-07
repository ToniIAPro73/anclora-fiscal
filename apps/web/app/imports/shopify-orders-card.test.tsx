import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyOrdersCard } from "./shopify-orders-card";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status?: number;
    body: unknown;
  }>,
) {
  const fetchMock = vi.fn();

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 400),
      json: () => Promise.resolve(response.body),
    });
  }

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function selectFile() {
  const input = screen.getByLabelText(
    /Archivo de pedidos Shopify/,
  ) as HTMLInputElement;

  const file = new File(["contenido"], "pedidos.csv", { type: "text/csv" });

  fireEvent.change(input, {
    target: { files: [file] },
  });
}

async function submitPreview() {
  selectFile();

  fireEvent.submit(
    screen
      .getByRole("button", {
        name: "Generar vista previa",
      })
      .closest("form")!,
  );
}

async function getOpenPreviewDialog() {
  await waitFor(() => {
    expect(
      screen.getByRole("dialog", {
        name: /Vista previa · Shopify — Pedidos/i,
      }),
    ).toHaveAttribute("open");
  });

  return screen.getByRole("dialog", {
    name: /Vista previa · Shopify — Pedidos/i,
  });
}

const basePreview = {
  jobId: "job-1",
  connector: "shopify-orders-csv",
  status: "ANALYZED",
  summary: {
    records: 1,
    issues: 0,
    orderIds: ["AI-2001"],
  },
  issues: [],
  commercialOrders: [
    {
      externalOrderId: "AI-2001",
      commercialDate: "2026-07-01T00:00:00.000Z",
      customerName: "Ana García",
      totalAmount: "19.99",
      taxAmount: "1.99",
    },
  ],
};

describe("ShopifyOrdersCard", () => {
  it("preview happy path: shows the analyzed table and confirms without blocking issues", async () => {
    mockFetchSequence([
      { ok: true, body: basePreview },
      {
        ok: true,
        body: {
          jobId: "job-1",
          status: "IMPORTED",
          createdRecordIds: {
            orders: ["ord-1"],
          },
        },
      },
    ]);

    render(<ShopifyOrdersCard />);

    await submitPreview();

    const dialog = await getOpenPreviewDialog();

    expect(within(dialog).getByText("AI-2001")).toBeInTheDocument();

    expect(within(dialog).getByText("Ana García")).toBeInTheDocument();

    const confirmButton = within(dialog).getByRole("button", {
      name: "Confirmar importación",
    });

    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("Importado")).toBeInTheDocument();
    });

    expect(screen.getByText(/orders: 1 registro/)).toBeInTheDocument();

    expect(screen.getByText(/Próximos pasos/)).toBeInTheDocument();
  });

  it("shows order IDs when the preview only returns summary orderIds", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          ...basePreview,
          summary: {
            records: 4,
            issues: 0,
            orderIds: ["AI-1004", "AI-1003", "AI-1002", "AI-1001"],
          },
          commercialOrders: undefined,
        },
      },
    ]);

    render(<ShopifyOrdersCard />);

    await submitPreview();

    const dialog = await getOpenPreviewDialog();

    expect(within(dialog).getByText("AI-1004")).toBeInTheDocument();
    expect(within(dialog).getByText("AI-1003")).toBeInTheDocument();
    expect(within(dialog).getByText("AI-1002")).toBeInTheDocument();
    expect(within(dialog).getByText("AI-1001")).toBeInTheDocument();
  });

  it("disables confirm until blocking issues are acknowledged", async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          ...basePreview,
          issues: [
            {
              position: 1,
              code: "ORDER_TOTAL_MISMATCH",
              message: "El total no coincide",
              suggestedAction: "Revisa el pedido AI-2001",
            },
          ],
        },
      },
    ]);

    render(<ShopifyOrdersCard />);

    await submitPreview();

    const dialog = await getOpenPreviewDialog();

    expect(
      within(dialog).getAllByText(/ORDER_TOTAL_MISMATCH/).length,
    ).toBeGreaterThan(0);

    const confirmButton = within(dialog).getByRole("button", {
      name: "Confirmar importación",
    });

    expect(confirmButton).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox"));

    expect(confirmButton).toBeEnabled();
  });

  it("reject flow shows the rejected result", async () => {
    mockFetchSequence([
      { ok: true, body: basePreview },
      {
        ok: true,
        body: {
          jobId: "job-1",
          status: "REJECTED",
        },
      },
    ]);

    render(<ShopifyOrdersCard />);

    await submitPreview();

    const dialog = await getOpenPreviewDialog();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Rechazar",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Importación rechazada")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Nueva importación",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Generar vista previa",
      }),
    ).toBeInTheDocument();
  });

  it("retry re-runs analysis against the same jobId without creating a new distinct job", async () => {
    mockFetchSequence([
      { ok: true, body: basePreview },
      {
        ok: true,
        body: {
          ...basePreview,
          status: "ANALYZED",
          summary: {
            records: 1,
            issues: 0,
            orderIds: ["AI-2001"],
          },
        },
      },
    ]);

    render(<ShopifyOrdersCard />);

    await submitPreview();

    const dialog = await getOpenPreviewDialog();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Reintentar análisis",
      }),
    );

    const reopenedDialog = await getOpenPreviewDialog();

    expect(within(reopenedDialog).getAllByText("AI-2001")).toHaveLength(1);
  });
});

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopifyPaymentsCard } from './shopify-payments-card';

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

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

async function getOpenPreviewDialog() {
  await waitFor(() => {
    expect(
      screen.getByRole('dialog', {
        name: /Vista previa · Shopify Payments — Movimientos y liquidación/i,
      }),
    ).toHaveAttribute('open');
  });

  return screen.getByRole('dialog', {
    name: /Vista previa · Shopify Payments — Movimientos y liquidación/i,
  });
}

describe('ShopifyPaymentsCard', () => {
  it('ships enabled by default while the backend connector is being built this batch', () => {
    render(<ShopifyPaymentsCard />);

    expect(
      screen.getByLabelText(
        /Archivo de movimientos Shopify Payments/,
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        'El mapeo de liquidaciones Shopify está en construcción',
      ),
    ).not.toBeInTheDocument();
  });

  it('can be rendered disabled with a "próximamente" reason', () => {
    render(<ShopifyPaymentsCard enabled={false} />);

    expect(
      screen.queryByLabelText(
        /Archivo de movimientos Shopify Payments/,
      ),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText(
        /El mapeo de liquidaciones Shopify está en construcción/,
      ),
    ).toBeInTheDocument();
  });

  it('preview distingue liquidación pendiente de liquidación real', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          jobId: 'job-pay-1',
          connector: 'shopify-payments-csv',
          status: 'ANALYZED',
          summary: {
            records: 1,
            issues: 0,
            orderIds: ['PO-1'],
          },
          issues: [],
          shopifyPaymentsLedger: {
            entries: [
              {
                shopifyOrderName: 'PO-1',
                customerName: 'Ana García',
                customerEmail: 'ana@example.test',
                entryType: 'charge',
                amount: '150.00',
                feeAmount: '4.50',
                netAmount: '145.50',
                currency: 'EUR',
                payoutStatus: 'pending',
                payoutDate: null,
                externalPayoutId: null,
              },
            ],
          },
        },
      },
      {
        ok: true,
        body: {
          jobId: 'job-pay-1',
          status: 'IMPORTED',
          createdRecordIds: {
            payouts: ['pay-1'],
          },
        },
      },
    ]);

    render(<ShopifyPaymentsCard />);

    const input = screen.getByLabelText(
      /Archivo de movimientos Shopify Payments/,
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [
          new File(
            ['x'],
            'payouts.csv',
            { type: 'text/csv' },
          ),
        ],
      },
    });

    fireEvent.submit(
      screen
        .getByRole('button', {
          name: 'Generar vista previa',
        })
        .closest('form')!,
    );

    const dialog = await getOpenPreviewDialog();

    expect(
      within(dialog).getByText('PO-1'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Ana García'),
    ).toBeInTheDocument();

    expect(
      within(dialog).getByText('Liquidación pendiente'),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Confirmar importación',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Importado')).toBeInTheDocument();
    });
  });

  it('traduce incidencias técnicas a mensajes comprensibles', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          jobId: 'job-pay-issues',
          connector: 'shopify-payments-csv',
          status: 'ANALYZED',
          summary: {
            records: 1,
            issues: 1,
            orderIds: ['PO-1'],
          },
          issues: [
            {
              position: 2,
              code: 'PLATFORM_VAT_ZERO_UNVALIDATED',
              message: 'VAT del canal a cero; no equivale a IVA fiscal validado',
              suggestedAction: 'Revisar',
              blocking: false,
            },
          ],
          shopifyPaymentsLedger: {
            entries: [
              {
                shopifyOrderName: 'PO-1',
                entryType: 'charge',
                amount: '150.00',
                feeAmount: '4.50',
                netAmount: '145.50',
                currency: 'EUR',
                payoutStatus: 'pending',
                payoutDate: null,
                externalPayoutId: null,
              },
            ],
          },
        },
      },
    ]);

    render(<ShopifyPaymentsCard />);

    const input = screen.getByLabelText(
      /Archivo de movimientos Shopify Payments/,
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File(['x'], 'payouts.csv', { type: 'text/csv' })],
      },
    });

    fireEvent.submit(
      screen
        .getByRole('button', {
          name: 'Generar vista previa',
        })
        .closest('form')!,
    );

    const dialog = await getOpenPreviewDialog();

    expect(
      within(dialog).getByText(/IVA de plataforma no validado fiscalmente/),
    ).toBeInTheDocument();
  });
});

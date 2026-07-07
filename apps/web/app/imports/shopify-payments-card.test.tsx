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
        name: /Vista previa · Shopify Payments — Ledger y liquidación/i,
      }),
    ).toHaveAttribute('open');
  });

  return screen.getByRole('dialog', {
    name: /Vista previa · Shopify Payments — Ledger y liquidación/i,
  });
}

describe('ShopifyPaymentsCard', () => {
  it('ships enabled by default while the backend connector is being built this batch', () => {
    render(<ShopifyPaymentsCard />);

    expect(
      screen.getByLabelText(
        /Archivo de ledger Shopify Payments/,
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        'El mapeo de payouts Shopify está en construcción',
      ),
    ).not.toBeInTheDocument();
  });

  it('can be rendered disabled with a "próximamente" reason', () => {
    render(<ShopifyPaymentsCard enabled={false} />);

    expect(
      screen.queryByLabelText(
        /Archivo de ledger Shopify Payments/,
      ),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText(
        /El mapeo de payouts Shopify está en construcción/,
      ),
    ).toBeInTheDocument();
  });

  it('preview distingue settlement pendiente de payout real', async () => {
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
                orderName: 'PO-1',
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
      /Archivo de ledger Shopify Payments/,
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
});
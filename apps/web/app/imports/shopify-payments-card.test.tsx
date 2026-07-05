import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopifyPaymentsCard } from './shopify-payments-card';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
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

describe('ShopifyPaymentsCard', () => {
  it('ships enabled by default while the backend connector is being built this batch', () => {
    render(<ShopifyPaymentsCard />);
    expect(screen.getByLabelText(/Archivo de payouts Shopify/)).toBeInTheDocument();
    expect(screen.queryByText('El mapeo de payouts Shopify está en construcción')).not.toBeInTheDocument();
  });

  it('can be rendered disabled with a "próximamente" reason', () => {
    render(<ShopifyPaymentsCard enabled={false} />);
    expect(screen.queryByLabelText(/Archivo de payouts Shopify/)).not.toBeInTheDocument();
    expect(screen.getByText(/El mapeo de payouts Shopify está en construcción/)).toBeInTheDocument();
  });

  it('preview happy path confirms a payout import', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          jobId: 'job-pay-1',
          connector: 'shopify-payments-csv',
          status: 'ANALYZED',
          summary: { records: 1, issues: 0, orderIds: ['PO-1'] },
          issues: [],
          commercialOrders: [{ externalOrderId: 'PO-1', commercialDate: '2026-07-01T00:00:00.000Z', totalAmount: '150.00' }],
        },
      },
      { ok: true, body: { jobId: 'job-pay-1', status: 'IMPORTED', createdRecordIds: { payouts: ['pay-1'] } } },
    ]);
    render(<ShopifyPaymentsCard />);
    const input = screen.getByLabelText(/Archivo de payouts Shopify/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'payouts.csv', { type: 'text/csv' })] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Generar vista previa' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('PO-1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));
    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
  });
});

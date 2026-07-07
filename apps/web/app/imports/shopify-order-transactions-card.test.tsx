import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopifyOrderTransactionsCard } from './shopify-order-transactions-card';

afterEach(() => vi.unstubAllGlobals());

describe('ShopifyOrderTransactionsCard', () => {
  it('muestra pedido, tipo, estado, importe y fecha antes de confirmar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
      jobId: 'job-tx-1', connector: 'shopify-order-transactions-csv', status: 'ANALYZED',
      summary: { records: 1, issues: 0, orderIds: ['AI-1001'] }, issues: [],
      shopifyOrderTransactions: { events: [{ orderId: '9001', orderName: 'AI-1001', kind: 'refund', status: 'success', amount: '-6.99', currency: 'EUR', occurredAt: '2026-07-02T10:00:00.000Z' }] },
    }) }));
    render(<ShopifyOrderTransactionsCard />);
    const input = screen.getByLabelText(/Archivo de transacciones de pedido Shopify/);
    fireEvent.change(input, { target: { files: [new File(['x'], 'transactions.csv', { type: 'text/csv' })] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Generar vista previa' }).closest('form')!);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    expect(screen.getByText('Reembolso')).toBeInTheDocument();
    expect(screen.getByText('Correcta')).toBeInTheDocument();
    expect(screen.getByText('-6.99 EUR')).toBeInTheDocument();
  });
});

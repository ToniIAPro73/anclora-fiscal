import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationsTimeline } from './timeline';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockSalesFetch(ordersBody: unknown, operationsBody: unknown = { items: [], page: 1, pageSize: 20, total: 0 }, ok = true) {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
    ok,
    json: () => Promise.resolve(url.includes('commercial-orders') ? ordersBody : operationsBody),
  })));
}

describe('OperationsTimeline', () => {
  it('muestra un estado de carga mientras se obtienen las operaciones', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<OperationsTimeline />);
    expect(screen.getByText('Cargando operaciones…')).toBeInTheDocument();
  });

  it('muestra el mensaje de vacío cuando no hay operaciones', async () => {
    mockSalesFetch({ items: [], page: 1, pageSize: 20, total: 0 });
    render(<OperationsTimeline />);
    await waitFor(() => expect(screen.getByText('No hay ventas Shopify importadas todavía.')).toBeInTheDocument());
    expect(screen.queryByLabelText('Plataforma')).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/commercial-orders', { credentials: 'include' });
  });

  it('muestra un pedido Shopify importado aunque todavía no tenga operación conciliada', async () => {
    mockSalesFetch({
      items: [{
        id: 'order-1',
        sourceChannel: 'SHOPIFY',
        externalOrderId: 'AI-1001',
        commercialDate: '2026-07-01T00:00:00.000Z',
        productNature: 'ebook',
        totalAmount: '6.99',
        taxAmount: '0.27',
      }],
      page: 1, pageSize: 20, total: 1,
    });
    render(<OperationsTimeline />);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    expect(screen.getByText('Pendiente de conciliación')).toBeInTheDocument();
  });

  it('muestra el estado financiero cuando el pedido ya tiene operación canónica', async () => {
    mockSalesFetch({
      items: [{ id: 'order-1', sourceChannel: 'SHOPIFY', externalOrderId: 'AI-1001', productNature: 'ebook', totalAmount: '6.99' }],
      page: 1, pageSize: 20, total: 1,
    }, {
      items: [{
        id: 'op-1',
        sourceChannel: 'SHOPIFY',
        sourceOrderId: 'AI-1001',
        operationType: 'SALE',
        operationStatus: 'READY_FOR_INVOICING',
        reviewStatus: 'PENDING_TAX_REVIEW',
        reconciliationStatus: 'MATCHED',
        verifactuStatus: 'PENDING',
        grossAmount: '6.99',
        platformFeeAmount: '0.35',
        netAmount: '6.64',
        originalCurrency: 'EUR',
        createdAt: new Date().toISOString(),
      }],
      page: 1, pageSize: 20, total: 1,
    });
    render(<OperationsTimeline />);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    expect(screen.getByText('Conciliado')).toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición falla', async () => {
    mockSalesFetch({}, {}, false);
    render(<OperationsTimeline />);
    await waitFor(() => expect(screen.getByText('No se pudieron obtener las ventas Shopify')).toBeInTheDocument());
  });
});

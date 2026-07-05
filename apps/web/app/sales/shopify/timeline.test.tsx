import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationsTimeline } from './timeline';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }));
}

describe('OperationsTimeline', () => {
  it('muestra un estado de carga mientras se obtienen las operaciones', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<OperationsTimeline />);
    expect(screen.getByText('Cargando operaciones…')).toBeInTheDocument();
  });

  it('muestra el mensaje de vacío cuando no hay operaciones', async () => {
    mockFetchOnce({ items: [], page: 1, pageSize: 20, total: 0 });
    render(<OperationsTimeline />);
    await waitFor(() => expect(screen.getByText('No hay operaciones todavía.')).toBeInTheDocument());
    expect(screen.queryByLabelText('Plataforma')).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/operations?sourceChannel=SHOPIFY', { credentials: 'include' });
  });

  it('renderiza operaciones reales devueltas por la API', async () => {
    mockFetchOnce({
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
    expect(screen.getByText('Pendiente de revisión fiscal')).toBeInTheDocument();
    expect(screen.getByText('Conciliado')).toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición falla', async () => {
    mockFetchOnce({}, false);
    render(<OperationsTimeline />);
    await waitFor(() => expect(screen.getByText('No se pudieron obtener las operaciones')).toBeInTheDocument());
  });
});

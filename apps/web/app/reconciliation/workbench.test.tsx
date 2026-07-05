import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationWorkbench } from './workbench';

afterEach(() => {
  vi.unstubAllGlobals();
});

const emptyUnmatchedOrders = { items: [], page: 1, pageSize: 20, total: 0 };

/** Stubs fetch to respond differently per endpoint — the workbench now calls
 * both /api/v1/reconciliation/candidates and /api/v1/reconciliation/unmatched-orders,
 * so a single generic mock would leak one endpoint's shape into the other's table. */
function mockFetchByUrl(responses: {
  candidates?: { body: unknown; ok?: boolean };
  unmatchedOrders?: { body: unknown; ok?: boolean };
}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('unmatched-orders')) {
      const response = responses.unmatchedOrders ?? { body: emptyUnmatchedOrders };
      return Promise.resolve({ ok: response.ok ?? true, json: () => Promise.resolve(response.body) });
    }
    const response = responses.candidates ?? { body: { items: [], page: 1, pageSize: 20, total: 0 } };
    return Promise.resolve({ ok: response.ok ?? true, json: () => Promise.resolve(response.body) });
  }));
}

describe('ReconciliationWorkbench', () => {
  it('muestra un estado de carga mientras se obtienen las candidaturas', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<ReconciliationWorkbench />);
    expect(screen.getByText('Cargando candidaturas de conciliación…')).toBeInTheDocument();
  });

  it('muestra el mensaje de vacío cuando no hay candidaturas', async () => {
    mockFetchByUrl({ candidates: { body: { items: [], page: 1, pageSize: 20, total: 0 } } });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('No hay candidaturas de conciliación todavía.')).toBeInTheDocument());
  });

  it('renderiza candidaturas reales como filas de tabla', async () => {
    mockFetchByUrl({
      candidates: {
        body: {
          items: [
            { id: 'cand-1', commercialOrderId: 'order-1', financialEventId: 'evt-1', confidence: '1', accepted: true, commercialOrderExternalId: 'AI-1001', financialEventExternalId: 'evt-charge-1' },
            { id: 'cand-2', commercialOrderId: 'order-2', financialEventId: 'evt-2', confidence: '0.5', accepted: false, commercialOrderExternalId: 'SP-2045', financialEventExternalId: 'evt-charge-2' },
          ],
          page: 1, pageSize: 20, total: 2,
        },
      },
    });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    const candidatesTable = screen.getAllByRole('table')[0]!;
    expect(within(candidatesTable).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición de candidaturas falla', async () => {
    mockFetchByUrl({ candidates: { body: {}, ok: false } });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('No se pudieron obtener las candidaturas de conciliación')).toBeInTheDocument());
  });

  it('muestra el mensaje de vacío en la sección de pedidos sin conciliar cuando no hay ninguno', async () => {
    mockFetchByUrl({ unmatchedOrders: { body: emptyUnmatchedOrders } });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('No hay pedidos pendientes de conciliar.')).toBeInTheDocument());
  });

  it('renderiza pedidos sin conciliar como filas de tabla, sin acciones de aceptar/rechazar', async () => {
    mockFetchByUrl({
      unmatchedOrders: {
        body: {
          items: [
            { id: 'order-9', externalOrderId: 'AI-9001', sourceChannel: 'shopify', commercialDate: '2026-07-01T00:00:00.000Z' },
          ],
          page: 1, pageSize: 20, total: 1,
        },
      },
    });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('AI-9001')).toBeInTheDocument());
    expect(screen.getByText('Sin movimiento financiero')).toBeInTheDocument();
    expect(screen.queryByText('shopify')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aceptar|rechazar/i })).not.toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición de pedidos sin conciliar falla', async () => {
    mockFetchByUrl({ unmatchedOrders: { body: {}, ok: false } });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('No se pudieron obtener los pedidos sin conciliar')).toBeInTheDocument());
  });
});

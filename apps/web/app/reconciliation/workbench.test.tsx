import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationWorkbench } from './workbench';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }));
}

describe('ReconciliationWorkbench', () => {
  it('muestra un estado de carga mientras se obtienen las candidaturas', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<ReconciliationWorkbench />);
    expect(screen.getByText('Cargando candidaturas de conciliación…')).toBeInTheDocument();
  });

  it('muestra el mensaje de vacío cuando no hay candidaturas', async () => {
    mockFetchOnce({ items: [], page: 1, pageSize: 20, total: 0 });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('No hay candidaturas de conciliación todavía.')).toBeInTheDocument());
  });

  it('renderiza candidaturas reales como filas de tabla', async () => {
    mockFetchOnce({
      items: [
        { id: 'cand-1', commercialOrderId: 'order-1', financialEventId: 'evt-1', confidence: '1', accepted: true, commercialOrderExternalId: 'AI-1001', financialEventExternalId: 'evt-charge-1' },
        { id: 'cand-2', commercialOrderId: 'order-2', financialEventId: 'evt-2', confidence: '0.5', accepted: false, commercialOrderExternalId: 'SP-2045', financialEventExternalId: 'evt-charge-2' },
      ],
      page: 1, pageSize: 20, total: 2,
    });
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3));
    expect(screen.getByText('AI-1001')).toBeInTheDocument();
    expect(screen.getByText('Aceptada')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición falla', async () => {
    mockFetchOnce({}, false);
    render(<ReconciliationWorkbench />);
    await waitFor(() => expect(screen.getByText('No se pudieron obtener las candidaturas de conciliación')).toBeInTheDocument());
  });
});

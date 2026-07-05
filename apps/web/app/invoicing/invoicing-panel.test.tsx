import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvoicingPanel } from './invoicing-panel';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  const fn = vi.fn();
  for (const response of responses) {
    fn.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: () => Promise.resolve(response.body),
    });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

const sampleOperation = {
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
};

describe('InvoicingPanel', () => {
  it('muestra un estado de carga mientras se obtienen las operaciones', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<InvoicingPanel />);
    expect(screen.getByText('Cargando operaciones…')).toBeInTheDocument();
  });

  it('muestra el mensaje de vacío cuando no hay operaciones', async () => {
    mockFetchSequence([{ ok: true, body: { items: [], page: 1, pageSize: 20, total: 0 } }]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('No hay operaciones todavía.')).toBeInTheDocument());
  });

  it('muestra un mensaje de error cuando la petición de operaciones falla', async () => {
    mockFetchSequence([{ ok: false, body: {} }]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('No se pudieron obtener las operaciones')).toBeInTheDocument());
  });

  it('muestra copy honesto cuando la emisión responde TAX_DECISION_MISSING', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } },
      { ok: false, status: 422, body: { code: 'TAX_DECISION_MISSING', message: 'La operación no tiene una decisión fiscal registrada' } },
    ]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    screen.getByRole('button', { name: 'Emitir factura' }).click();
    await waitFor(() => expect(screen.getByText('Esta operación necesita una decisión fiscal antes de poder facturarse.')).toBeInTheDocument());
  });

  it('muestra el número de factura cuando la emisión tiene éxito', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } },
      { ok: true, status: 201, body: { id: 'doc-1', number: 'AF-2026-0001', status: 'ISSUED', taxBase: '6.35', taxAmount: '0.64', totalAmount: '6.99', currency: 'EUR', alreadyIssued: false } },
    ]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    screen.getByRole('button', { name: 'Emitir factura' }).click();
    await waitFor(() => expect(screen.getByText('AF-2026-0001')).toBeInTheDocument());
  });

  it('muestra la insignia de revisión recomendada cuando anomalyFlags incluye RECTIFICATION_REVIEW_REQUIRED', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [{ ...sampleOperation, anomalyFlags: ['FULL_REFUND_NET_ZERO', 'RECTIFICATION_REVIEW_REQUIRED'] }], page: 1, pageSize: 20, total: 1 } },
    ]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('Revisión recomendada: posible rectificación por reembolso')).toBeInTheDocument());
  });

  it('no muestra la insignia de revisión recomendada cuando la operación no tiene anomalyFlags', async () => {
    mockFetchSequence([{ ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } }]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    expect(screen.queryByText('Revisión recomendada: posible rectificación por reembolso')).not.toBeInTheDocument();
  });
});

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
  customerName: 'Ana García',
  customerEmail: 'ana@example.test',
  customerAddress: 'Calle Mayor 1, Madrid',
  customerCountry: 'ES',
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
    expect(screen.queryByLabelText('Plataforma')).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/operations?sourceChannel=SHOPIFY', { credentials: 'include' });
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

  it('muestra estados traducidos y el bloqueo de configuración fiscal incompleta', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } },
      { ok: false, status: 422, body: { code: 'FISCAL_CONFIGURATION_INCOMPLETE', message: 'Complete emisor, serie y perfil fiscal antes de emitir' } },
    ]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('Shopify')).toBeInTheDocument());
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.queryByText('ana@example.test')).not.toBeInTheDocument();
    expect(screen.getByText('ES')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de revisión fiscal')).toBeInTheDocument();
    expect(screen.getByText('Lista para facturar')).toBeInTheDocument();
    expect(screen.getByText('Conciliada')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Emitir factura' }).click();
    await waitFor(() => expect(screen.getByText('Completa la configuración fiscal: emisor, serie de facturación y perfil de producto.')).toBeInTheDocument());
  });

  it('muestra el número de factura cuando la emisión tiene éxito', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } },
      { ok: true, status: 201, body: { id: 'doc-1', number: 'FS-00001', documentType: 'SIMPLIFICADA', status: 'ISSUED', taxBase: '6.72', taxAmount: '0.27', totalAmount: '6.99', currency: 'EUR', alreadyIssued: false } },
    ]);
    render(<InvoicingPanel />);
    await waitFor(() => expect(screen.getByText('AI-1001')).toBeInTheDocument());
    screen.getByRole('button', { name: 'Emitir factura' }).click();
    await waitFor(() => expect(screen.getByText('FS-00001')).toBeInTheDocument());
    expect(screen.getByText('Factura simplificada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar factura' })).toHaveAttribute('href', '/api/v1/fiscal-documents/doc-1/download');
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

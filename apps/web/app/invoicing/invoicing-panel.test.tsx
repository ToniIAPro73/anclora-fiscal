import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvoicingPanel } from './invoicing-panel';

afterEach(() => { vi.unstubAllGlobals(); });

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
  it('muestra un estado de carga mientras obtiene las operaciones', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<InvoicingPanel />);
    expect(screen.getByText('Cargando operaciones…')).toBeInTheDocument();
  });

  it('explica el vacío y ofrece rutas de resolución', async () => {
    mockFetchSequence([{ ok: true, body: { items: [], page: 1, pageSize: 20, total: 0 } }]);
    render(<InvoicingPanel />);
    await screen.findByText('No hay operaciones fiscales creadas.');
    expect(screen.getByText(/Importa una transacción Shopify confirmada/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar ventas Shopify' })).toHaveAttribute('href', '/sales/shopify');
    expect(screen.getByRole('link', { name: 'Revisar configuración' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByLabelText('Plataforma')).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/operations?sourceChannel=SHOPIFY', { credentials: 'include' });
  });

  it('muestra un mensaje de error cuando falla la petición', async () => {
    mockFetchSequence([{ ok: false, body: {} }]);
    render(<InvoicingPanel />);
    await screen.findByText('No se pudieron obtener las operaciones');
  });

  it('separa pendientes, bloqueadas y emitidas', async () => {
    mockFetchSequence([{ ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } }]);
    render(<InvoicingPanel />);
    await screen.findByText('AI-1001');
    expect(screen.getByText('Listas para emitir').closest('article')).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: 'Pendientes (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Lista para facturar')).toBeInTheDocument();
    expect(screen.getByText('Conciliada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir factura' })).toBeInTheDocument();
  });

  it('muestra el motivo de bloqueo en la bandeja correspondiente', async () => {
    mockFetchSequence([{ ok: true, body: { items: [{ ...sampleOperation, anomalyFlags: ['RECTIFICATION_REVIEW_REQUIRED'] }], page: 1, pageSize: 20, total: 1 } }]);
    render(<InvoicingPanel />);
    await screen.findByRole('tab', { name: 'Bloqueadas (1)' });
    fireEvent.click(screen.getByRole('tab', { name: 'Bloqueadas (1)' }));
    expect(await screen.findByText('Qué bloquea la emisión')).toBeInTheDocument();
    expect(screen.getByText('Revisar el reembolso antes de emitir o rectificar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resolver bloqueo' })).toHaveAttribute('href', '/settings');
  });

  it('muestra copy honesto cuando la emisión responde TAX_DECISION_MISSING', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } },
      { ok: false, status: 422, body: { code: 'TAX_DECISION_MISSING' } },
    ]);
    render(<InvoicingPanel />);
    await screen.findByText('AI-1001');
    fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }));
    await screen.findByText('Esta operación necesita una decisión fiscal antes de poder facturarse.');
  });

  it('muestra el número y la descarga cuando la emisión tiene éxito', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [sampleOperation], page: 1, pageSize: 20, total: 1 } },
      { ok: true, status: 201, body: { id: 'doc-1', number: 'FS-00001', documentType: 'SIMPLIFICADA', status: 'ISSUED', taxBase: '6.72', taxAmount: '0.27', totalAmount: '6.99', currency: 'EUR', alreadyIssued: false } },
    ]);
    render(<InvoicingPanel />);
    await screen.findByText('AI-1001');
    fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }));
    await screen.findByText('FS-00001');
    expect(screen.getByText('Factura simplificada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar factura' })).toHaveAttribute('href', '/api/v1/fiscal-documents/doc-1/download');
    expect(screen.getByRole('tab', { name: 'Emitidas (1)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('exige revisión y confirmación explícita antes de emitir el lote', async () => {
    const fetchMock = mockFetchSequence([{ ok: true, body: { items: [], page: 1, pageSize: 20, total: 0 } }]);
    render(<InvoicingPanel />);
    await screen.findByText('No hay operaciones fiscales creadas.');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar emisión' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Esta acción no se puede deshacer/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('emite el lote tras confirmar y muestra el resumen', async () => {
    mockFetchSequence([
      { ok: true, body: { items: [], page: 1, pageSize: 20, total: 0 } },
      {
        ok: true,
        body: {
          period: '2026-07',
          issued: [{ canonicalOperationId: 'op-1', documentId: 'doc-1', documentNumber: 'FS-00001' }],
          skipped: [{ canonicalOperationId: 'op-2', reason: 'IMPORTE_CERO_EN_REVISION' }],
          errors: [],
        },
      },
      { ok: true, body: { items: [], page: 1, pageSize: 20, total: 0 } },
    ]);
    render(<InvoicingPanel />);
    await screen.findByText('No hay operaciones fiscales creadas.');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar emisión' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar emisión' }));
    await screen.findByText(/1 emitida, 1 omitida, 0 con error/);
    expect(screen.getByText('FS-00001')).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v1/periods/2026-07/invoices/issue-eligible', { method: 'POST', credentials: 'include' });
  });

  it('no muestra acciones de envío a AEAT', async () => {
    mockFetchSequence([{ ok: true, body: { items: [], page: 1, pageSize: 20, total: 0 } }]);
    render(<InvoicingPanel />);
    await screen.findByText('No hay operaciones fiscales creadas.');
    expect(screen.queryByRole('button', { name: /enviar a aeat/i })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopifySaleDetail } from './sale-detail';

afterEach(() => vi.unstubAllGlobals());

const baseDetail = {
  order: { externalOrderId: 'AI-1001', totalAmount: '6.99', fiscalStatus: 'INVOICED' },
  lines: [],
  transactions: [],
  ledger: [],
  links: [],
  operation: { id: 'op-1' },
  taxDecision: { status: 'DETERMINADA' },
  documents: [],
  audit: [],
  settlement: 'PENDING',
  eligibility: {
    hasFiscalConfiguration: true,
    hasFiscalProfile: true,
    hasTransactionsEvidence: true,
    hasTaxDecision: true,
  },
};

function mockDetail(detail: unknown) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('/full-invoice')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ number: 'F-00001' }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(detail) });
  }));
}

describe('ShopifySaleDetail — solicitud de factura completa', () => {
  it('muestra el botón para solicitar factura completa cuando hay operación asociada', async () => {
    mockDetail(baseDetail);
    render(<ShopifySaleDetail orderId="order-1" />);
    const button = await screen.findByRole('button', { name: 'Solicitar factura completa' });
    expect(button).not.toBeDisabled();
  });

  it('deshabilita la solicitud cuando no hay operación asociada', async () => {
    mockDetail({ ...baseDetail, operation: null });
    render(<ShopifySaleDetail orderId="order-1" />);
    const button = await screen.findByRole('button', { name: 'Solicitar factura completa' });
    expect(button).toBeDisabled();
  });

  it('despliega el formulario y envía los datos del destinatario al confirmar', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/full-invoice')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ number: 'F-00001' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(baseDetail) });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ShopifySaleDetail orderId="order-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar factura completa' }));

    fireEvent.change(screen.getByLabelText('Nombre / razón social'), { target: { value: 'Empresa Compradora SL' } });
    fireEvent.change(screen.getByLabelText('NIF/NIE'), { target: { value: '87654321X' } });
    fireEvent.change(screen.getByLabelText('Dirección de facturación'), { target: { value: 'Calle Comprador 5, Barcelona' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y emitir factura completa' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/operations/op-1/full-invoice',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Empresa Compradora SL',
          taxIdentity: '87654321X',
          billingAddress: 'Calle Comprador 5, Barcelona',
          customerType: 'B2C',
        }),
      }),
    ));

    await screen.findByText('Factura completa F-00001');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationsTimeline } from './timeline';

afterEach(() => vi.unstubAllGlobals());

const metrics = {
  salesAmount: '6.99',
  refundedAmount: '0',
  feeAmount: '0.35',
  pendingSettlement: 1,
};

const sale = {
  id: '01977d43-75de-7000-8000-000000000001',
  externalOrderId: 'AI-1001',
  commercialDate: '2026-07-01',
  totalAmount: '6.99',
  discountCode: null,
  discountAmount: '0',
  customerName: 'Ana García',
  customerEmail: 'ana@example.test',
  customerCountry: 'ES',
  paymentStatus: 'PAID',
  refundStatus: 'NONE',
  fiscalStatus: 'PENDING',
  transactionCount: 1,
  ledgerCount: 1,
  feeAmount: '0.35',
  payoutStatus: 'PENDING',
};

function mock(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) })));
}

describe('OperationsTimeline SHOPIFY-06', () => {
  it('muestra carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<OperationsTimeline />);
    expect(screen.getByText('Cargando ventas Shopify…')).toBeInTheDocument();
  });

  it('muestra vacío honesto', async () => {
    mock({ items: [], metrics });
    render(<OperationsTimeline />);
    await screen.findByText('No hay pedidos Shopify para los filtros seleccionados.');
  });

  it('explica el flujo y separa cobro, cruce, payout y fiscalidad', async () => {
    mock({ items: [sale], metrics });
    render(<OperationsTimeline />);
    await screen.findByText('AI-1001');
    expect(screen.getByText(/Pedido → cobro → cruce de archivos/)).toBeInTheDocument();
    expect(screen.getByText('Cobro confirmado')).toBeInTheDocument();
    expect(screen.getByText('Datos internos cruzados')).toBeInTheDocument();
    expect(screen.getByText('Payout Shopify pendiente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar fiscalidad →' })).toHaveAttribute('href', `/sales/shopify/${sale.id}`);
  });

  it('explica pedidos de importe cero sin reclamar transacciones ni movimientos', async () => {
    mock({
      items: [{
        ...sale,
        externalOrderId: 'AI-1002',
        totalAmount: '0',
        discountCode: 'PRUEBA100',
        discountAmount: '6.99',
        fiscalStatus: 'ZERO_VALUE_REVIEW',
        transactionCount: 0,
        ledgerCount: 0,
        payoutStatus: 'LEDGER_MISSING',
      }],
      metrics,
    });
    render(<OperationsTimeline />);
    await screen.findByText('AI-1002');
    expect(screen.getAllByText('Descuento aplicado · PRUEBA100').length).toBeGreaterThan(0);
    expect(screen.getByText('No requiere cobro')).toBeInTheDocument();
    expect(screen.getByText('Cruce no requerido')).toBeInTheDocument();
    expect(screen.getByText('No requiere pago Shopify')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar tratamiento fiscal →' })).toBeInTheDocument();
  });

  it('no afirma conciliación bancaria al identificar el payout', async () => {
    mock({ items: [{ ...sale, payoutStatus: 'SETTLED' }], metrics });
    render(<OperationsTimeline />);
    await screen.findByText('Payout Shopify identificado · banco sin conciliar');
    expect(screen.queryByText(/banco verificado/i)).not.toBeInTheDocument();
  });

  it('expone un enlace de exportación CSV que respeta los filtros activos', async () => {
    mock({ items: [sale], metrics });
    render(<OperationsTimeline />);
    await screen.findByText('AI-1001');
    expect(screen.getByRole('link', { name: 'Exportar CSV para asesoría' })).toHaveAttribute('href', '/api/v1/shopify/sales/export?');
  });

  it('muestra error de API', async () => {
    mock({}, false);
    render(<OperationsTimeline />);
    await waitFor(() => expect(screen.getByText('No se pudieron obtener las ventas Shopify')).toBeInTheDocument());
  });
});

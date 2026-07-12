import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationWorkbench } from './workbench';

afterEach(() => vi.unstubAllGlobals());

const proposed = {
  id: 'link-1',
  linkType: 'TRANSACTION_TO_LEDGER',
  state: 'PROPOSED',
  confidence: '0.95',
  explanationJson: {
    shopifyOrderName: 'AI-1001',
    fiscalStatus: 'PENDIENTE_REVISION_FISCAL',
    transactionAmount: 6.99,
    ledgerNetAmount: 6.64,
    platformFeeAmount: 0.35,
    payoutStatus: 'pending',
    externalPayoutId: null,
    bankVerified: false,
  },
};

function mockLinks(links: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(links) })));
}

describe('ReconciliationWorkbench SHOPIFY-06', () => {
  it('explica el alcance sin afirmar conciliación bancaria', async () => {
    mockLinks([]);
    render(<ReconciliationWorkbench />);
    expect(screen.getByText(/no confirma el ingreso en tu banco/)).toBeInTheDocument();
    await screen.findByText(/No hay datos que cruzar/);
  });

  it('agrupa los enlaces por pedido y muestra las excepciones por defecto', async () => {
    mockLinks([
      proposed,
      { ...proposed, id: 'link-2', linkType: 'ORDER_TO_TRANSACTION', state: 'AUTO_LINKED', confidence: '1.0' },
      { ...proposed, id: 'link-3', linkType: 'ORDER_TO_LEDGER', state: 'AUTO_LINKED', confidence: '1.0' },
    ]);
    render(<ReconciliationWorkbench />);
    await screen.findByText('AI-1001');
    expect(screen.getAllByText('AI-1001')).toHaveLength(1);
    expect(screen.getByText('Revisión necesaria')).toBeInTheDocument();
    expect(screen.getByText('3 enlaces de evidencia')).toBeInTheDocument();
    expect(screen.getByText('Transacción → movimiento')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('oculta cruces resueltos de la bandeja de excepciones y permite verlos', async () => {
    mockLinks([{ ...proposed, state: 'CONFIRMED' }]);
    render(<ReconciliationWorkbench />);
    await screen.findByText('No hay excepciones pendientes.');
    expect(screen.getByText('Datos cruzados').closest('article')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos los cruces' }));
    expect(await screen.findByText('Datos internos cruzados')).toBeInTheDocument();
  });

  it('muestra discrepancias como una excepción prioritaria', async () => {
    mockLinks([{ ...proposed, state: 'REJECTED' }]);
    render(<ReconciliationWorkbench />);
    await screen.findByText('Discrepancia');
    expect(screen.getByText('Discrepancias').closest('article')).toHaveTextContent('1');
  });

  it('permite confirmar una propuesta', async () => {
    const fetchMock = vi.fn((_: string, init?: RequestInit) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(init?.method === 'PATCH' ? proposed : [proposed]),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReconciliationWorkbench />);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/shopify/evidence-links/link-1', expect.objectContaining({ method: 'PATCH' })));
  });

  it('distingue payout identificado de banco conciliado', async () => {
    mockLinks([{ ...proposed, state: 'CONFIRMED', explanationJson: { ...proposed.explanationJson, externalPayoutId: 'payout-9' } }]);
    render(<ReconciliationWorkbench />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver todos los cruces' }));
    expect(await screen.findByText('Payout Shopify identificado · banco sin conciliar')).toBeInTheDocument();
    expect(screen.getByText('payout-9')).toBeInTheDocument();
  });

  it('muestra error de API', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })));
    render(<ReconciliationWorkbench />);
    await screen.findByText('No se pudieron obtener los enlaces de evidencia');
  });
});

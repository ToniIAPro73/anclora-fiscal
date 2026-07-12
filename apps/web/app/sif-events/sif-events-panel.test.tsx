import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SifEventsPanel } from './sif-events-panel';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response;
}

const sampleEvent = {
  id: 'evt-1',
  eventType: 'INTEGRITY_ERROR',
  actor: 'system',
  detail: { documentId: 'doc-1' },
  hash: 'abcdef1234567890abcdef1234567890',
  previousHash: null,
  occurredAt: '2026-07-03T09:00:00.000Z',
};

describe('SifEventsPanel', () => {
  it('muestra el estado vacío cuando no hay eventos', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 25, total: 0 }))));
    render(<SifEventsPanel />);
    await screen.findByText('No hay eventos SIF registrados todavía.');
  });

  it('muestra la lista de eventos con tipo, actor y huella', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ items: [sampleEvent], page: 1, pageSize: 25, total: 1 }))));
    render(<SifEventsPanel />);
    await screen.findByText('Error de integridad');
    expect(screen.getByText('system')).toBeInTheDocument();
  });

  it('pagina hacia adelante y hacia atrás', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ items: [sampleEvent], page: 1, pageSize: 1, total: 2 })));
    vi.stubGlobal('fetch', fetchMock);
    render(<SifEventsPanel />);
    await screen.findByText('Página 1 de 2');

    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ ...sampleEvent, id: 'evt-2' }], page: 2, pageSize: 1, total: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/sif-events?page=2&pageSize=25', { credentials: 'include' }));
  });

  it('verifica la cadena bajo demanda y muestra el resultado', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/verify')) return Promise.resolve(jsonResponse({ valid: true }));
      return Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 25, total: 0 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SifEventsPanel />);
    await screen.findByText('No hay eventos SIF registrados todavía.');

    fireEvent.click(screen.getByRole('button', { name: 'Verificar cadena' }));

    await screen.findByText('Cadena íntegra');
  });

  it('no muestra ninguna acción de envío en el panel de eventos SIF', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 25, total: 0 }))));
    render(<SifEventsPanel />);
    await screen.findByText('No hay eventos SIF registrados todavía.');
    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
  });
});

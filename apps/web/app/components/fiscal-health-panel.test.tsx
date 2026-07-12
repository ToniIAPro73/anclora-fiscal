import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FiscalHealthPanel } from './fiscal-health-panel';
afterEach(() => vi.unstubAllGlobals());
describe('FiscalHealthPanel', () => {
  it('muestra métricas fiscales reales del periodo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ period: '2026-07', status: 'RED', metrics: { blockingIssues: 2, rejectedSubmissions: 1, pendingSubmissions: 4, incompleteReconciliation: 3, invoicesWithoutHash: 2 } }) }));
    render(<FiscalHealthPanel />);
    expect(await screen.findByRole('heading', { name: 'Estado operativo del periodo' })).toBeInTheDocument();
    expect(screen.getByText('Bloqueos y rechazos')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});

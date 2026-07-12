import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeriodReadinessPanel } from './period-readiness';
afterEach(() => vi.unstubAllGlobals());
describe('PeriodReadinessPanel', () => {
  it.each([['RED','Bloqueado'],['AMBER','Con advertencias'],['GREEN','Listo'],['CLOSED','Cerrado']] as const)('renderiza %s', async (status, label) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ period: '2026-06', status, reasons: [] }) }));
    render(<PeriodReadinessPanel />); fireEvent.change(screen.getByLabelText(/Periodo/), { target: { value: '2026-06' } }); fireEvent.click(screen.getByRole('button', { name: 'Comprobar preparación' }));
    await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  });
  it('muestra razones y acciones', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ period: '2026-06', status: 'RED', reasons: [{ code: 'BLOCKING_ISSUES_OPEN', severity: 'BLOCKER', count: 2, action: 'Resolver incidencias' }] }) }));
    render(<PeriodReadinessPanel />); fireEvent.change(screen.getByLabelText(/Periodo/), { target: { value: '2026-06' } }); fireEvent.click(screen.getByRole('button', { name: 'Comprobar preparación' }));
    await screen.findByText(/Resolver incidencias/);
  });
});

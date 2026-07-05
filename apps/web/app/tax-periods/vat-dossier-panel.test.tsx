import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VatDossierPanel } from './vat-dossier-panel';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(response: { ok: boolean; status?: number; body: unknown }) {
  const fn = vi.fn().mockResolvedValueOnce({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: () => Promise.resolve(response.body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function typePeriod(value: string) {
  fireEvent.change(screen.getByLabelText(/Periodo/), { target: { value } });
}

describe('VatDossierPanel', () => {
  it('permite escribir un periodo y consultar el expediente', async () => {
    mockFetchOnce({ ok: true, body: { id: 'dossier-1', period: '2026-T3', status: 'CLOSED', manifest: { 'facturas.csv': '' } } });
    render(<VatDossierPanel />);
    typePeriod('2026-T3');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar expediente' }));
    await waitFor(() => expect(screen.getByText('Periodo 2026-T3')).toBeInTheDocument());
  });

  it('muestra un mensaje honesto cuando no hay periodo cerrado (404)', async () => {
    mockFetchOnce({ ok: false, status: 404, body: { code: 'NOT_FOUND' } });
    render(<VatDossierPanel />);
    typePeriod('2026-T3');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar expediente' }));
    await waitFor(() => expect(screen.getByText('No hay un periodo cerrado ni un expediente de IVA para este periodo todavía.')).toBeInTheDocument());
  });

  it('muestra un mensaje cuando el periodo no está cerrado al generar (409)', async () => {
    mockFetchOnce({ ok: false, status: 409, body: { code: 'PERIOD_NOT_CLOSED' } });
    render(<VatDossierPanel />);
    typePeriod('2026-T3');
    fireEvent.click(screen.getByRole('button', { name: 'Generar expediente' }));
    await waitFor(() => expect(screen.getByText('El período no está cerrado todavía; no se puede generar un expediente de IVA hasta que exista un cierre de periodo.')).toBeInTheDocument());
  });
});

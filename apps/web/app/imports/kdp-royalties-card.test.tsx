import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KdpRoyaltiesCard } from './kdp-royalties-card';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 400),
      json: () => Promise.resolve(response.body),
    });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function submit() {
  const input = screen.getByLabelText(/Archivo de regalías KDP/) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'kdp.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } });
  fireEvent.submit(screen.getByRole('button', { name: 'Generar vista previa' }).closest('form')!);
}

describe('KdpRoyaltiesCard', () => {
  it('groups and nets royalty lines by ISBN/ASIN+format, ordered by date descending, with a period header', async () => {
    mockFetchSequence([{
      ok: true,
      body: {
        jobId: 'job-kdp-1',
        connector: 'kdp-xlsx',
        status: 'ANALYZED',
        summary: { records: 3, issues: 0, orderIds: ['B0ABC1234'] },
        issues: [],
        royalty: {
          statement: { periods: ['2026-06'] },
          lines: [
            { isbnOrAsin: 'B0ABC1234', title: 'Mi libro', classification: 'ebook', unitsNet: 5, amount: 12.5, currency: 'EUR', format: 'ebook', date: '2026-06-10' },
            { isbnOrAsin: 'B0ABC1234', title: 'Mi libro', classification: 'reembolso', unitsNet: -1, amount: -2.5, currency: 'EUR', format: 'ebook', date: '2026-06-20' },
          ],
        },
      },
    }]);
    render(<KdpRoyaltiesCard />);
    submit();
    await waitFor(() => expect(screen.getByText('junio 2026')).toBeInTheDocument());
    expect(screen.getByText('Mi libro')).toBeInTheDocument();
    expect(screen.getByText(/10.00 EUR/)).toBeInTheDocument();
    expect(screen.getByText(/incluye reembolso/)).toBeInTheDocument();
  });

  it('blocks confirm on KDP_COST_DOUBLE_COUNT_RISK until acknowledged', async () => {
    mockFetchSequence([{
      ok: true,
      body: {
        jobId: 'job-kdp-2',
        connector: 'kdp-xlsx',
        status: 'ANALYZED',
        summary: { records: 1, issues: 1, orderIds: ['B0ABC1234'] },
        issues: [{ position: 1, code: 'KDP_COST_DOUBLE_COUNT_RISK', message: 'Riesgo de doble conteo de coste', suggestedAction: 'Revisa la fila 1' }],
        royalty: { statement: { periods: ['2026-06'] }, lines: [{ isbnOrAsin: 'B0ABC1234', classification: 'coste_produccion', amount: 5, currency: 'EUR' }] },
      },
    }]);
    render(<KdpRoyaltiesCard />);
    submit();
    await waitFor(() => expect(screen.getAllByText(/KDP_COST_DOUBLE_COUNT_RISK/).length).toBeGreaterThan(0));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar importación' });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirmButton).toBeEnabled();
  });
});

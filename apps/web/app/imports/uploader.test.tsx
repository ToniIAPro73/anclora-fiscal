import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportUploader } from './uploader';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(response: { ok: boolean; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
    ok: response.ok,
    json: () => Promise.resolve(response.body),
  }));
}

function selectFile() {
  const input = screen.getByLabelText(/Archivos de evidencia/) as HTMLInputElement;
  const file = new File(['contenido'], 'pedidos.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('ImportUploader', () => {
  it('muestra el estado vacío inicial sin implicar un paso de confirmación inexistente', () => {
    render(<ImportUploader />);
    expect(screen.getByText('Sin archivo analizado')).toBeInTheDocument();
    expect(screen.getByText(/Al generar la vista previa, el archivo ya queda guardado como evidencia/)).toBeInTheDocument();
  });

  it('renderiza una tabla de pedidos con sus incidencias para shopify-orders-csv', async () => {
    mockFetchOnce({
      ok: true,
      body: {
        jobId: 'job-1',
        connector: 'shopify-orders-csv',
        status: 'PREVIEW_READY',
        summary: { records: 2, issues: 1, orderIds: ['AI-2001', 'AI-2002'] },
        issues: [{ code: 'INCOHERENT_QUANTITY', severity: 'WARNING', message: 'AI-2001: cantidad servida incoherente con el neto comercial' }],
      },
    });
    render(<ImportUploader />);
    selectFile();
    fireEvent.submit(screen.getByRole('button', { name: 'Generar vista previa' }).closest('form')!);
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3));
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('AI-2001');
    expect(rows[1]).toHaveTextContent('cantidad servida incoherente con el neto comercial');
    expect(rows[2]).toHaveTextContent('AI-2002');
    expect(rows[2]).toHaveTextContent('—');
  });

  it('renderiza una tabla de líneas de regalías para kdp-xlsx con incidencias generales aparte', async () => {
    mockFetchOnce({
      ok: true,
      body: {
        jobId: 'job-2',
        connector: 'kdp-xlsx',
        status: 'PREVIEW_READY',
        summary: { records: 1, issues: 1, orderIds: ['B0ABC1234'] },
        issues: [{ code: 'SUMMARY_DETAIL_MISMATCH', severity: 'WARNING', message: 'Resumen 2026-06: 10.00 EUR vs detalle 9.50 EUR', sheet: 'Resumen' }],
        royalty: { lines: [{ isbnOrAsin: 'B0ABC1234', title: 'Mi libro', classification: 'ebook', unitsNet: 5, amount: 9.5, currency: 'EUR' }] },
      },
    });
    render(<ImportUploader />);
    selectFile();
    fireEvent.submit(screen.getByRole('button', { name: 'Generar vista previa' }).closest('form')!);
    await waitFor(() => expect(screen.getByText('Mi libro')).toBeInTheDocument());
    expect(screen.getByText('B0ABC1234')).toBeInTheDocument();
    expect(screen.getByText('eBook')).toBeInTheDocument();
    expect(screen.getByText('9.50 EUR')).toBeInTheDocument();
    expect(screen.getByText('[Resumen] Resumen 2026-06: 10.00 EUR vs detalle 9.50 EUR')).toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición falla', async () => {
    mockFetchOnce({ ok: false, body: {} });
    render(<ImportUploader />);
    selectFile();
    fireEvent.submit(screen.getByRole('button', { name: 'Generar vista previa' }).closest('form')!);
    await waitFor(() => expect(screen.getByText('El archivo no supera la validación estructural')).toBeInTheDocument());
  });
});

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

async function submitPreview() {
  selectFile();
  fireEvent.submit(screen.getByRole('button', { name: 'Generar vista previa' }).closest('form')!);
}

describe('ImportUploader', () => {
  it('muestra el estado vacío inicial sin implicar un paso de confirmación inexistente', () => {
    render(<ImportUploader />);
    expect(screen.getByText('Sin archivo analizado')).toBeInTheDocument();
    expect(screen.getByText(/Al generar la vista previa, el archivo ya queda guardado como evidencia/)).toBeInTheDocument();
  });

  it('renderiza una tabla de pedidos con fecha/cliente/total/IVA e incidencias para shopify-orders-csv', async () => {
    mockFetchOnce({
      ok: true,
      body: {
        jobId: 'job-1',
        connector: 'shopify-orders-csv',
        status: 'PREVIEW_READY',
        summary: { records: 2, issues: 1, orderIds: ['AI-2001', 'AI-2002'] },
        issues: [{ code: 'INCOHERENT_QUANTITY', severity: 'WARNING', message: 'AI-2001: cantidad servida incoherente con el neto comercial' }],
        commercialOrders: [
          { externalOrderId: 'AI-2001', commercialDate: '2026-07-01T00:00:00.000Z', customerName: 'Ana García', totalAmount: '19.99', taxAmount: '1.99' },
          { externalOrderId: 'AI-2002' },
        ],
      },
    });
    render(<ImportUploader />);
    await submitPreview();
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3));
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('AI-2001');
    expect(rows[1]).toHaveTextContent('Ana García');
    expect(rows[1]).toHaveTextContent('19.99');
    expect(rows[1]).toHaveTextContent('1.99');
    expect(rows[1]).toHaveTextContent('cantidad servida incoherente con el neto comercial');
    expect(rows[2]).toHaveTextContent('AI-2002');
    expect(rows[2]).toHaveTextContent('—');
  });

  it('recurre a summary.orderIds cuando commercialOrders no está presente (forma de vista previa anterior)', async () => {
    mockFetchOnce({
      ok: true,
      body: {
        jobId: 'job-1b',
        connector: 'shopify-orders-csv',
        status: 'PREVIEW_READY',
        summary: { records: 1, issues: 0, orderIds: ['AI-3001'] },
        issues: [],
      },
    });
    render(<ImportUploader />);
    await submitPreview();
    await waitFor(() => expect(screen.getByText('AI-3001')).toBeInTheDocument());
  });

  it('agrupa y neta las líneas de regalías KDP por ISBN/ASIN+formato, ordenadas por fecha descendente, con cabecera de periodo', async () => {
    mockFetchOnce({
      ok: true,
      body: {
        jobId: 'job-2',
        connector: 'kdp-xlsx',
        status: 'PREVIEW_READY',
        summary: { records: 3, issues: 1, orderIds: ['B0ABC1234'] },
        issues: [{ code: 'SUMMARY_DETAIL_MISMATCH', severity: 'WARNING', message: 'Resumen 2026-06: 10.00 EUR vs detalle 9.50 EUR', sheet: 'Resumen' }],
        royalty: {
          statement: { periods: ['2026-06'] },
          lines: [
            { isbnOrAsin: 'B0ABC1234', title: 'Mi libro', classification: 'ebook', unitsNet: 5, amount: 12.5, currency: 'EUR', format: 'ebook', date: '2026-06-10' },
            { isbnOrAsin: 'B0ABC1234', title: 'Mi libro', classification: 'reembolso', unitsNet: -1, amount: -2.5, currency: 'EUR', format: 'ebook', date: '2026-06-20' },
            { isbnOrAsin: 'B0XYZ9999', title: 'Otro libro', classification: 'impreso', unitsNet: 2, amount: 8, currency: 'EUR', format: 'impreso', date: '2026-06-05' },
          ],
        },
      },
    });
    render(<ImportUploader />);
    await submitPreview();
    await waitFor(() => expect(screen.getByText('junio 2026')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    // header + 2 netted groups (B0ABC1234/ebook combined, B0XYZ9999/impreso)
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Mi libro');
    expect(rows[1]).toHaveTextContent('10.00 EUR');
    expect(rows[1]).toHaveTextContent('incluye reembolso');
    expect(rows[2]).toHaveTextContent('Otro libro');
    expect(rows[2]).toHaveTextContent('8.00 EUR');
    expect(screen.getByText('[Resumen] Resumen 2026-06: 10.00 EUR vs detalle 9.50 EUR')).toBeInTheDocument();
  });

  it('muestra el mensaje de "todos ya importados" y omite la tabla cuando allAlreadyImported es true', async () => {
    mockFetchOnce({
      ok: true,
      body: {
        jobId: 'job-3',
        connector: 'shopify-orders-csv',
        status: 'PREVIEW_READY',
        summary: { records: 2, issues: 0, orderIds: [], alreadyImportedCount: 2, allAlreadyImported: true },
        issues: [],
        commercialOrders: [],
      },
    });
    render(<ImportUploader />);
    await submitPreview();
    await waitFor(() => expect(screen.getByText('Todos los registros de este archivo ya estaban importados.')).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra el mensaje de omisión parcial cuando solo parte de los registros ya estaban importados', async () => {
    mockFetchOnce({
      ok: true,
      body: {
        jobId: 'job-4',
        connector: 'shopify-orders-csv',
        status: 'PREVIEW_READY',
        summary: { records: 2, issues: 0, orderIds: ['AI-5001'], alreadyImportedCount: 1, allAlreadyImported: false },
        issues: [],
        commercialOrders: [{ externalOrderId: 'AI-5001' }],
      },
    });
    render(<ImportUploader />);
    await submitPreview();
    await waitFor(() => expect(screen.getByText('1 registros omitidos por ya estar importados.')).toBeInTheDocument());
    expect(screen.getByText('AI-5001')).toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición falla', async () => {
    mockFetchOnce({ ok: false, body: {} });
    render(<ImportUploader />);
    await submitPreview();
    await waitFor(() => expect(screen.getByText('El archivo no supera la validación estructural')).toBeInTheDocument());
  });
});

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';
import { ImportCard } from './import-card';
import type { PreviewResponse } from './types';

vi.mock('@anclora/ui', () => ({
  Button: ({
    children,
    type = 'button',
    variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    variant?: string;
  }) => {
    void variant;

    return (
      <button type={type} {...props}>
        {children}
      </button>
    );
  },

  FileDropzone: ({
    label,
    name,
    accept,
    required,
  }: {
    label: string;
    name: string;
    accept: string;
    required?: boolean;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="file"
        name={name}
        accept={accept}
        required={required}
      />
    </label>
  ),

  StatusBadge: ({
    children,
  }: {
    children: ReactNode;
    tone?: string;
  }) => <span>{children}</span>,
}));

const basePreview: PreviewResponse = {
  jobId: 'job-1',
  connector: 'shopify-orders-csv',
  status: 'ANALYZED',
  summary: {
    records: 1,
    issues: 0,
    orderIds: ['AI-2001'],
  },
  issues: [],
  commercialOrders: [
    {
      externalOrderId: 'AI-2001',
      commercialDate: '2026-07-01T00:00:00.000Z',
      customerName: 'Ana García',
      totalAmount: '19.99',
      taxAmount: '1.99',
    },
  ],
};

beforeAll(() => {
  Object.defineProperty(
    HTMLDialogElement.prototype,
    'showModal',
    {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    },
  );

  Object.defineProperty(
    HTMLDialogElement.prototype,
    'close',
    {
      configurable: true,
      value: function close(this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status?: number;
    body: unknown;
  }>,
) {
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

function renderImportCard() {
  return render(
    <ImportCard
      connectorId="shopify-orders"
      title="Shopify — Pedidos"
      description="Importa el CSV de pedidos exportado desde Shopify."
      accept=".csv,text/csv"
      fileFieldId="shopify-orders-file"
      fileFieldLabel="Archivo de pedidos Shopify"
      hint="Selecciona el CSV exportado desde Shopify."
      renderPreviewTable={(preview) => (
        <table>
          <tbody>
            {preview.commercialOrders?.map((order) => (
              <tr key={order.externalOrderId}>
                <td>{order.externalOrderId}</td>
                <td>{order.customerName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      nextStepsNote="Próximos pasos: revisa los pedidos importados."
    />,
  );
}

function selectFile() {
  const input = screen.getByLabelText(
    'Archivo de pedidos Shopify',
  ) as HTMLInputElement;

  const file = new File(
    ['contenido de prueba'],
    'pedidos-shopify.csv',
    { type: 'text/csv' },
  );

  fireEvent.change(input, {
    target: {
      files: [file],
    },
  });
}

async function generatePreview() {
  selectFile();

  const submitButton = screen.getByRole('button', {
    name: 'Generar vista previa',
  });

  const form = submitButton.closest('form');

  if (!form) {
    throw new Error(
      'No se encontró el formulario de generación de vista previa.',
    );
  }

  fireEvent.submit(form);

  await waitFor(() => {
    expect(
      screen.getByRole('dialog', {
        name: /Vista previa · Shopify — Pedidos/i,
      }),
    ).toHaveAttribute('open');
  });
}

function getPreviewDialog() {
  return screen.getByRole('dialog', {
    name: /Vista previa · Shopify — Pedidos/i,
  });
}

describe('ImportCard preview dialog', () => {
  it('abre la vista previa dentro de un modal tras analizar el archivo', async () => {
    const fetchMock = mockFetchSequence([
      {
        ok: true,
        body: basePreview,
      },
    ]);

    renderImportCard();

    await generatePreview();

    const dialog = getPreviewDialog();

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByText('AI-2001')).toBeInTheDocument();
    expect(within(dialog).getByText('Ana García')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/imports/preview',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('permite cerrar el modal y reabrir una vista previa pendiente sin volver a subir el archivo', async () => {
    const fetchMock = mockFetchSequence([
      {
        ok: true,
        body: basePreview,
      },
    ]);

    renderImportCard();

    await generatePreview();

    const dialog = getPreviewDialog();

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Cerrar',
      }),
    );

    await waitFor(() => {
      expect(dialog).not.toHaveAttribute('open');
    });

    expect(
      screen.getByText('Vista previa pendiente de decisión'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Abrir vista previa',
      }),
    );

    await waitFor(() => {
      expect(dialog).toHaveAttribute('open');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mantiene deshabilitada la confirmación hasta reconocer las incidencias bloqueantes', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          ...basePreview,
          summary: {
            ...basePreview.summary,
            issues: 1,
          },
          issues: [
            {
              position: 1,
              code: 'ORDER_TOTAL_MISMATCH',
              message: 'El total del pedido no coincide.',
              suggestedAction:
                'Revisa el importe del pedido AI-2001.',
            },
          ],
        },
      },
    ]);

    renderImportCard();

    await generatePreview();

    const dialog = getPreviewDialog();

    const confirmButton = within(dialog).getByRole('button', {
      name: 'Confirmar importación',
    });

    expect(confirmButton).toBeDisabled();

    fireEvent.click(within(dialog).getByRole('checkbox'));

    expect(confirmButton).toBeEnabled();
  });

  it('confirma la importación desde el modal usando el job de la vista previa', async () => {
    const fetchMock = mockFetchSequence([
      {
        ok: true,
        body: basePreview,
      },
      {
        ok: true,
        body: {
          jobId: 'job-1',
          status: 'IMPORTED',
          createdRecordIds: {
            orders: ['order-1'],
          },
        },
      },
    ]);

    renderImportCard();

    await generatePreview();

    const dialog = getPreviewDialog();

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Confirmar importación',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Importado')).toBeInTheDocument();
    });

    expect(
      screen.getByText('orders: 1 registro(s)'),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/imports/job-1/confirm',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          acknowledgedIssueIds: [],
        }),
      }),
    );
  });

  it('rechaza una vista previa pendiente desde el modal', async () => {
    const fetchMock = mockFetchSequence([
      {
        ok: true,
        body: basePreview,
      },
      {
        ok: true,
        body: {
          jobId: 'job-1',
          status: 'REJECTED',
        },
      },
    ]);

    renderImportCard();

    await generatePreview();

    const dialog = getPreviewDialog();

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Rechazar',
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'Importación rechazada. El archivo original se conserva como evidencia.',
        ),
      ).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/imports/job-1/reject',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
    );
  });
});
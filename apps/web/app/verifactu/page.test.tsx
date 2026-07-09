import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VerifactuPage from './page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/verifactu' }));
vi.mock('../components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VerifactuPage', () => {
  it('renders the operational read model with no send action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'vs-1',
            environment: 'mock',
            status: 'PENDING',
            attemptCount: '0',
            payloadRedacted: { documentNumber: 'FS-1' },
            responseRedacted: null,
            fiscalDocumentId: 'fd-1',
            fiscalDocumentNumber: 'FS-1',
            documentType: 'SIMPLIFICADA',
            issuedAt: '2026-07-09T00:00:00.000Z',
            recordType: 'ALTA',
            chainHash: '1234567890abcdef123456',
            previousHash: null,
          },
        ],
        page: 1,
        pageSize: 25,
        total: 1,
      }),
    });

    render(<VerifactuPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'VERI*FACTU' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('FS-1')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Mock local').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ALTA')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /emitir|enviar/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/verifactu/submissions?page=1&pageSize=25', {
      credentials: 'include',
    });
  });

  it('renders an empty state when there are no prepared records', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
      }),
    });

    render(<VerifactuPage />);

    await waitFor(() => {
      expect(screen.getByText('Sin registros VERI*FACTU')).toBeInTheDocument();
    });
  });

  it('renders an error state when the API fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ code: 'ERROR' }),
    });

    render(<VerifactuPage />);

    await waitFor(() => {
      expect(screen.getByText('No se pudo consultar el estado VERI*FACTU')).toBeInTheDocument();
    });
  });
});

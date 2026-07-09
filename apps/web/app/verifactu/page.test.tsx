import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifactuPage from './page';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: ComponentPropsWithoutRef<'img'> & { src: string | { src?: string } }) => {
    const resolvedSrc = typeof src === 'string' ? src : src.src ?? '';

    return <img src={resolvedSrc} alt={alt ?? ''} {...props} />;
  },
}));

vi.mock('../app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

const runtimeTest = {
  status: 'ok',
  verifactuEnabled: true,
  verifactuMode: 'test',
  verifactuCanSubmit: true,
  verifactuProductionSafe: true,
};

const runtimeDisabled = {
  status: 'ok',
  verifactuEnabled: false,
  verifactuMode: 'disabled',
  verifactuCanSubmit: false,
  verifactuProductionSafe: true,
};

const runtimeProductionBlocked = {
  status: 'ok',
  verifactuEnabled: true,
  verifactuMode: 'production',
  verifactuCanSubmit: false,
  verifactuProductionSafe: false,
};

describe('VerifactuPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza el panel operativo sin acción de envío', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(runtimeTest))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 'submission-1',
            fiscalDocumentNumber: 'FS-1',
            documentType: 'SIMPLIFICADA',
            issuedAt: '2026-07-09T10:00:00.000Z',
            environment: 'test',
            status: 'PENDING',
            recordType: 'ALTA',
            chainHash: 'abcdef1234567890abcdef1234567890',
            previousHash: null,
            attemptCount: '0',
          },
        ],
        page: 1,
        pageSize: 25,
        total: 1,
      }));

    vi.stubGlobal('fetch', fetchMock);

    render(<VerifactuPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'VERI*FACTU' })).toBeInTheDocument();

    expect(await screen.findByText('FS-1')).toBeInTheDocument();
    expect(screen.getByText('Preparación VERI*FACTU')).toBeInTheDocument();
    expect(screen.getByText('Integración preparada')).toBeInTheDocument();
    expect(screen.getByText('Preparado')).toBeInTheDocument();
    expect(screen.getByText('Simplificada')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);

    expect(screen.getAllByText('AEAT pruebas').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/submit/i)).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith('/health', { credentials: 'include' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/verifactu/submissions?page=1&pageSize=25',
      { credentials: 'include' },
    );
  });

  it('renderiza estado vacío cuando no hay registros', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(runtimeDisabled))
      .mockResolvedValueOnce(jsonResponse({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
      }));

    vi.stubGlobal('fetch', fetchMock);

    render(<VerifactuPage />);

    expect(await screen.findByText('Sin registros VERI*FACTU aún')).toBeInTheDocument();
    expect(screen.getByText('Las facturas emitidas o rectificadas aparecerán aquí con su estado de preparación, entorno y trazabilidad de cadena.')).toBeInTheDocument();
    expect(screen.getAllByText('Desactivado').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
  });

  it('renderiza error cuando falla el read model', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(runtimeProductionBlocked))
      .mockResolvedValueOnce(jsonResponse({}, false));

    vi.stubGlobal('fetch', fetchMock);

    render(<VerifactuPage />);

    await waitFor(() => {
      expect(screen.getByText('No se pudieron cargar los registros VERI*FACTU')).toBeInTheDocument();
    });

    expect(screen.getByText('Producción bloqueada')).toBeInTheDocument();
    expect(screen.getByText('Revisión necesaria')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
  });
});

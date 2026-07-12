import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifactuPage from './page';

vi.mock('next/image', () => ({
  default: ({ priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;

    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
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

const aeatSoapTransport = {
  implemented: true,
  wiredIntoSubmissionFlow: false,
  networkEnabled: false,
  operation: 'RegFactuSistemaFacturacion',
  soapAction: '',
  safety: 'disabled-by-default',
};

const aeatXmlPreflight = {
  enabled: true,
  schemaProfile: 'aeat-suministro-lr-local-preflight-v1',
  blocksInvalidXmlBeforeAdapter: true,
  maxRegistroFacturaPerEnvelope: 1000,
};

const aeatPortalReady = {
  environment: 'test',
  endpointUrl: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion',
  endpointHost: 'prewww10.aeat.es',
  preproductionHost: true,
  certificateConfigured: true,
  certificateFingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
  productionSubmissionEnabled: false,
  allowAutomatedLoadTests: false,
  ready: true,
  blockedReasons: [],
  warnings: [],
  usagePolicy: 'manual-preproduction-tests-only',
};

const aeatPortalPending = {
  environment: 'test',
  endpointUrl: null,
  endpointHost: null,
  preproductionHost: false,
  certificateConfigured: false,
  certificateFingerprint: null,
  productionSubmissionEnabled: false,
  allowAutomatedLoadTests: false,
  ready: false,
  blockedReasons: ['AEAT_VERIFACTU_ENDPOINT_REQUIRED'],
  warnings: [],
  usagePolicy: 'manual-preproduction-tests-only',
};

const runtimeTest = {
  status: 'ok',
  verifactuEnabled: true,
  verifactuMode: 'test',
  verifactuCanSubmit: true,
  verifactuProductionSafe: true,
  aeatPortalReadiness: aeatPortalReady,
  aeatXmlPreflight,
  aeatSoapTransport,
};

const runtimeDisabled = {
  status: 'ok',
  verifactuEnabled: false,
  verifactuMode: 'disabled',
  verifactuCanSubmit: false,
  verifactuProductionSafe: true,
  aeatPortalReadiness: aeatPortalPending,
  aeatXmlPreflight,
  aeatSoapTransport,
};

const runtimeProductionBlocked = {
  status: 'ok',
  verifactuEnabled: true,
  verifactuMode: 'production',
  verifactuCanSubmit: false,
  verifactuProductionSafe: false,
  aeatPortalReadiness: {
    ...aeatPortalPending,
    environment: 'production',
    blockedReasons: ['AEAT_VERIFACTU_PRODUCTION_SUBMISSION_NOT_ENABLED'],
  },
};

describe('VerifactuPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza el panel operativo, sin acción de envío y con historial auditable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/health') {
        return jsonResponse(runtimeTest);
      }

      if (url === '/api/v1/verifactu/submissions?page=1&pageSize=25') {
        return jsonResponse({
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
              attemptCount: '1',
            },
          ],
          page: 1,
          pageSize: 25,
          total: 1,
        });
      }

      if (url === '/api/v1/verifactu/submissions/submission-1/attempts') {
        return jsonResponse({
          items: [
            {
              id: 'attempt-1',
              verifactuSubmissionId: 'submission-1',
              attemptNumber: '1',
              status: 'ACCEPTED',
              responseRedacted: {
                schemaVersion: 'anclora-verifactu-response-redacted-v1',
                environment: 'test',
                status: 'ACCEPTED',
                reference: 'aeat-ref-visible',
                message: 'Aceptado en entorno de pruebas',
                submittedAt: '2026-07-09T10:05:00.000Z',
              },
              attemptedAt: '2026-07-09T10:05:00.000Z',
            },
          ],
        });
      }

      return jsonResponse({}, false);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<VerifactuPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'VERI*FACTU' })).toBeInTheDocument();

    expect(await screen.findByText('FS-1')).toBeInTheDocument();
    expect(screen.getByText('Preparación VERI*FACTU')).toBeInTheDocument();
    expect(screen.getByText('Integración preparada')).toBeInTheDocument();
    expect(screen.getAllByText('Portal de pruebas preparado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Host configurado: prewww10.aeat.es')).toBeInTheDocument();
    expect(screen.getAllByText('Validación activa').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('aeat-suministro-lr-local-preflight-v1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Transporte SOAP preparado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Red desactivada').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('RegFactuSistemaFacturacion').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Preparado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Simplificada')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AEAT pruebas').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Ver historial de FS-1' }));

    expect(await screen.findByText('Historial de intentos')).toBeInTheDocument();
    expect(screen.getByText('Intento 1')).toBeInTheDocument();
    expect(screen.getByText('aeat-ref-visible')).toBeInTheDocument();
    expect(screen.getByText('Aceptado en entorno de pruebas')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/submit/i)).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith('/health', { credentials: 'include' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/verifactu/submissions?page=1&pageSize=25',
      { credentials: 'include' },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/verifactu/submissions/submission-1/attempts',
      { credentials: 'include' },
    );
  });

  it('muestra estados de aceptación parcial y reintento programado con su próximo intento y error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/health') {
        return jsonResponse(runtimeTest);
      }

      if (url === '/api/v1/verifactu/submissions?page=1&pageSize=25') {
        return jsonResponse({
          items: [
            {
              id: 'submission-2',
              fiscalDocumentNumber: 'FS-2',
              documentType: 'SIMPLIFICADA',
              issuedAt: '2026-07-09T10:00:00.000Z',
              environment: 'test',
              status: 'ACCEPTED_WITH_ERRORS',
              recordType: 'ALTA',
              chainHash: 'abcdef1234567890abcdef1234567890',
              previousHash: null,
              attemptCount: '1',
              nextAttemptAt: null,
              lastError: null,
            },
            {
              id: 'submission-3',
              fiscalDocumentNumber: 'FS-3',
              documentType: 'SIMPLIFICADA',
              issuedAt: '2026-07-09T10:00:00.000Z',
              environment: 'test',
              status: 'RETRY_SCHEDULED',
              recordType: 'ALTA',
              chainHash: 'abcdef1234567890abcdef1234567891',
              previousHash: null,
              attemptCount: '2',
              nextAttemptAt: '2026-07-13T09:00:00.000Z',
              lastError: 'Timeout al conectar con AEAT',
            },
          ],
          page: 1,
          pageSize: 25,
          total: 2,
        });
      }

      return jsonResponse({}, false);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<VerifactuPage />);

    expect(await screen.findByText('FS-2')).toBeInTheDocument();
    expect(screen.getAllByText('Aceptado con errores').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Reintento programado').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Timeout al conectar con AEAT')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
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

    expect(screen.getAllByText('Producción bloqueada').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Revisión necesaria')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
  });
});

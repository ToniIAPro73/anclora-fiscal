import { describe, expect, it } from 'vitest';
import type {
  AeatVerifactuSoapTransportPort,
  AeatVerifactuSoapTransportRequest,
  AeatVerifactuSoapTransportResponse,
} from './verifactu-aeat-transport';
import {
  AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION,
  runAeatVerifactuManualPreproductionSubmit,
} from './verifactu-aeat-manual-preproduction-submit';

const baseInput = {
  endpointUrl: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  certificatePath: '/secrets/aeat-test.p12',
  certificatePasswordConfigured: true,
  certificateFingerprint: 'a'.repeat(40),
  issuer: {
    taxId: 'B12345678',
    name: 'Anclora Fiscal',
  },
  software: {
    name: 'Anclora Fiscal',
    id: 'AF',
    version: '0.1.0',
    installationNumber: 'LOCAL-TEST-001',
    producer: {
      taxId: 'B87654321',
      name: 'Anclora Labs',
    },
    onlyVerifactu: true,
    multiTenant: false,
  },
  sample: {
    documentId: 'manual-preproduction-document-1',
    documentNumber: 'AEAT-TEST-0001',
    issuedAt: '2026-07-09T10:00:00.000Z',
    totalAmount: 6.99,
    taxAmount: 0.27,
  },
  generatedAt: '2026-07-09T10:05:00.000Z',
  userAgent: 'Anclora-Manual-Preproduction/1',
};

class RecordingTransport implements AeatVerifactuSoapTransportPort {
  public request: AeatVerifactuSoapTransportRequest | null = null;

  async submit(request: AeatVerifactuSoapTransportRequest): Promise<AeatVerifactuSoapTransportResponse> {
    this.request = request;

    return {
      statusCode: 200,
      receivedAt: '2026-07-09T10:06:00.000Z',
      body: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
        '<soapenv:Body>',
        '<RespuestaRegFactuSistemaFacturacion>',
        '<RespuestaLinea>',
        '<EstadoRegistro>Correcto</EstadoRegistro>',
        '<CSV>CSV-PREPROD-TEST-1</CSV>',
        '<Mensaje>Prueba manual aceptada</Mensaje>',
        '</RespuestaLinea>',
        '</RespuestaRegFactuSistemaFacturacion>',
        '</soapenv:Body>',
        '</soapenv:Envelope>',
      ].join(''),
    };
  }
}

describe('runAeatVerifactuManualPreproductionSubmit', () => {
  it('bloquea cualquier intento si la red no está habilitada explícitamente', async () => {
    const transport = new RecordingTransport();

    await expect(runAeatVerifactuManualPreproductionSubmit({
      ...baseInput,
      networkEnabled: false,
      confirmation: AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION,
      transport,
    })).rejects.toThrow('AEAT_VERIFACTU_MANUAL_PREPRODUCTION_NETWORK_DISABLED');

    expect(transport.request).toBeNull();
  });

  it('exige confirmación literal antes de abrir transporte', async () => {
    const transport = new RecordingTransport();

    await expect(runAeatVerifactuManualPreproductionSubmit({
      ...baseInput,
      networkEnabled: true,
      confirmation: 'yes',
      transport,
    })).rejects.toThrow('AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION_REQUIRED');

    expect(transport.request).toBeNull();
  });

  it('bloquea si el dry-run previo no está listo', async () => {
    const transport = new RecordingTransport();

    await expect(runAeatVerifactuManualPreproductionSubmit({
      ...baseInput,
      endpointUrl: undefined,
      networkEnabled: true,
      confirmation: AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION,
      transport,
    })).rejects.toThrow('AEAT_VERIFACTU_MANUAL_PREPRODUCTION_NOT_READY');

    expect(transport.request).toBeNull();
  });

  it('envía por el puerto inyectado y devuelve reporte auditable sin incluir XML ni respuesta completa', async () => {
    const transport = new RecordingTransport();

    const report = await runAeatVerifactuManualPreproductionSubmit({
      ...baseInput,
      networkEnabled: true,
      confirmation: AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION,
      transport,
    });

    expect(report).toMatchObject({
      profile: 'aeat-verifactu-manual-preproduction-submit-v1',
      mode: 'manual-preproduction-submit',
      sendsNetworkRequest: true,
      request: {
        endpointHost: 'prewww10.aeat.es',
        documentNumber: 'AEAT-TEST-0001',
        recordType: 'ALTA',
        usesXmlSignature: false,
      },
      response: {
        statusCode: 200,
        receivedAt: '2026-07-09T10:06:00.000Z',
        result: {
          status: 'ACCEPTED',
          reference: 'CSV-PREPROD-TEST-1',
          message: 'Prueba manual aceptada',
        },
      },
    });

    expect(report.request.xmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.response.bodySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(transport.request?.environment).toBe('test');
    expect(transport.request?.endpointUrl).toBe(baseInput.endpointUrl);
    expect(transport.request?.signedPayload.signedXml).toContain('RegFactuSistemaFacturacion');
    expect(transport.request?.signedPayload.signedXml).not.toContain('<ds:Signature');
  });
});

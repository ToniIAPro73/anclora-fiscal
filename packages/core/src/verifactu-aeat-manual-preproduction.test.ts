import { describe, expect, it } from 'vitest';
import { buildAeatVerifactuManualPreproductionDryRun } from './verifactu-aeat-manual-preproduction';

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

describe('buildAeatVerifactuManualPreproductionDryRun', () => {
  it('construye un dry-run listo sin enviar tráfico de red', () => {
    const report = buildAeatVerifactuManualPreproductionDryRun(baseInput);

    expect(report).toMatchObject({
      profile: 'aeat-verifactu-manual-preproduction-dry-run-v1',
      mode: 'dry-run',
      sendsNetworkRequest: false,
      canRunManualPreproductionTest: true,
      documentNumber: 'AEAT-TEST-0001',
      portalReady: true,
      xmlPreflightReady: true,
      nextAction: 'ready-for-manual-preproduction-test',
      blockingReasons: [],
      soapPreview: {
        endpointHost: 'prewww10.aeat.es',
        operation: 'RegFactuSistemaFacturacion',
        soapAction: '',
        contentType: 'text/xml; charset=utf-8',
        userAgent: 'Anclora-Manual-Preproduction/1',
      },
    });

    expect(report.soapPreview.contentLength).toBeGreaterThan(500);
    expect(report.soapPreview.xmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.soapPreview.xmlPreviewSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('bloquea el dry-run cuando falta configuración del portal AEAT', () => {
    const report = buildAeatVerifactuManualPreproductionDryRun({
      ...baseInput,
      endpointUrl: undefined,
      certificatePath: undefined,
      certificatePasswordConfigured: false,
      certificateFingerprint: undefined,
    });

    expect(report.canRunManualPreproductionTest).toBe(false);
    expect(report.portalReady).toBe(false);
    expect(report.xmlPreflightReady).toBe(true);
    expect(report.nextAction).toBe('configure-portal');
    expect(report.blockingReasons).toEqual(expect.arrayContaining([
      'AEAT_VERIFACTU_ENDPOINT_REQUIRED',
      'AEAT_VERIFACTU_CERTIFICATE_PATH_REQUIRED',
      'AEAT_VERIFACTU_CERTIFICATE_PASSWORD_REQUIRED',
      'AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_REQUIRED',
    ]));
  });

  it('rechaza datos de muestra inválidos antes de construir un reporte engañoso', () => {
    expect(() => buildAeatVerifactuManualPreproductionDryRun({
      ...baseInput,
      sample: {
        ...baseInput.sample,
        totalAmount: Number.NaN,
      },
    })).toThrow('AEAT_VERIFACTU_INVALID_AMOUNT');
  });
});

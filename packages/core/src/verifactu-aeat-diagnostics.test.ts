import { describe, expect, it } from 'vitest';
import { buildAeatVerifactuOperationalDiagnostics } from './verifactu-aeat-diagnostics';
import type { AeatVerifactuXmlValidationReport } from './verifactu-aeat-local-validation';
import { resolveAeatVerifactuPortalReadiness } from './verifactu-aeat-portal';

function readyPortal() {
  return resolveAeatVerifactuPortalReadiness({
    environment: 'test',
    endpointUrl: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion',
    certificatePath: '/secrets/aeat-test.p12',
    certificatePasswordConfigured: true,
    certificateFingerprint: 'a'.repeat(40),
  });
}

const validXmlReport: AeatVerifactuXmlValidationReport = {
  schemaProfile: 'aeat-suministro-lr-local-preflight-v1',
  valid: true,
  rootElement: 'soapenv:Envelope',
  recordType: 'ALTA',
  registroFacturaCount: 1,
  blockingIssues: [],
  warnings: [],
};

const invalidXmlReport: AeatVerifactuXmlValidationReport = {
  schemaProfile: 'aeat-suministro-lr-local-preflight-v1',
  valid: false,
  rootElement: 'soapenv:Envelope',
  recordType: 'ALTA',
  registroFacturaCount: 1,
  blockingIssues: [
    {
      code: 'AEAT_VERIFACTU_FECHA_EXPEDICION_FACTURA_FORMAT_INVALID',
      severity: 'blocking',
      message: 'Fecha inválida',
      path: 'FechaExpedicionFactura',
    },
  ],
  warnings: [
    {
      code: 'AEAT_VERIFACTU_XML_DECLARATION_RECOMMENDED',
      severity: 'warning',
      message: 'Declaración XML recomendada',
    },
  ],
};

describe('buildAeatVerifactuOperationalDiagnostics', () => {
  it('marca listo el diagnóstico cuando portal y XML están preparados', () => {
    expect(buildAeatVerifactuOperationalDiagnostics({
      portalReadiness: readyPortal(),
      xmlValidationReport: validXmlReport,
    })).toEqual({
      profile: 'aeat-verifactu-operational-diagnostics-v1',
      portalReady: true,
      xmlPreflightReady: true,
      canRunManualPreproductionTest: true,
      nextAction: 'ready-for-manual-preproduction-test',
      blockingReasons: [],
      warnings: [],
    });
  });

  it('bloquea si el portal AEAT no está configurado', () => {
    const diagnostics = buildAeatVerifactuOperationalDiagnostics({
      portalReadiness: resolveAeatVerifactuPortalReadiness({
        environment: 'test',
      }),
      xmlValidationReport: validXmlReport,
    });

    expect(diagnostics.canRunManualPreproductionTest).toBe(false);
    expect(diagnostics.nextAction).toBe('configure-portal');
    expect(diagnostics.blockingReasons).toEqual(expect.arrayContaining([
      'AEAT_VERIFACTU_ENDPOINT_REQUIRED',
      'AEAT_VERIFACTU_CERTIFICATE_PATH_REQUIRED',
    ]));
  });

  it('bloquea si el XML no supera el preflight local', () => {
    const diagnostics = buildAeatVerifactuOperationalDiagnostics({
      portalReadiness: readyPortal(),
      xmlValidationReport: invalidXmlReport,
    });

    expect(diagnostics).toMatchObject({
      portalReady: true,
      xmlPreflightReady: false,
      canRunManualPreproductionTest: false,
      nextAction: 'fix-xml',
    });
    expect(diagnostics.blockingReasons).toContain('AEAT_VERIFACTU_FECHA_EXPEDICION_FACTURA_FORMAT_INVALID');
    expect(diagnostics.warnings).toContain('AEAT_VERIFACTU_XML_DECLARATION_RECOMMENDED');
  });
});

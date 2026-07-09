import { describe, expect, it } from 'vitest';
import { createIntegrityRecord } from './verifactu';
import { buildAeatVerifactuUnsignedXml, type AeatVerifactuUnsignedXmlInput } from './verifactu-aeat-xml';
import {
  validateAeatVerifactuUnsignedXml,
  validateAeatVerifactuXml,
} from './verifactu-aeat-local-validation';

function baseInput(overrides: Partial<AeatVerifactuUnsignedXmlInput> = {}): AeatVerifactuUnsignedXmlInput {
  const record = createIntegrityRecord({
    documentId: 'document-1',
    documentNumber: 'FS-2026-0001',
    recordType: 'ALTA',
    issuedAt: '2026-07-09T10:00:00.000Z',
    totalAmount: 6.99,
    taxAmount: 0.27,
  }, '2026-07-09T10:00:00.000Z');

  return {
    environment: 'test',
    record,
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
    generatedAt: '2026-07-09T10:05:00.000Z',
    operationDescription: 'Venta digital de ebook',
    ...overrides,
  };
}

describe('validateAeatVerifactuUnsignedXml', () => {
  it('valida el XML de alta generado por el builder AEAT', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput());
    const report = validateAeatVerifactuUnsignedXml(payload);

    expect(report).toMatchObject({
      schemaProfile: 'aeat-suministro-lr-local-preflight-v1',
      valid: true,
      rootElement: 'soapenv:Envelope',
      recordType: 'ALTA',
      registroFacturaCount: 1,
      blockingIssues: [],
    });
  });

  it('valida el XML de anulación generado por el builder AEAT', () => {
    const record = createIntegrityRecord({
      documentId: 'document-2',
      documentNumber: 'FS-2026-0002',
      recordType: 'ANULACION',
      issuedAt: '2026-07-09T10:00:00.000Z',
      totalAmount: 6.99,
      taxAmount: 0.27,
      previousHash: 'a'.repeat(64),
    }, '2026-07-09T10:00:00.000Z');

    const payload = buildAeatVerifactuUnsignedXml(baseInput({ record }));
    const report = validateAeatVerifactuUnsignedXml(payload);

    expect(report.valid).toBe(true);
    expect(report.recordType).toBe('ANULACION');
    expect(report.blockingIssues).toEqual([]);
  });

  it('bloquea namespaces antiguos tikeV1.0', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput());
    const xml = payload.xml.replace(
      'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd',
      'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroLR.xsd',
    );

    const report = validateAeatVerifactuXml(xml);

    expect(report.valid).toBe(false);
    expect(report.blockingIssues.map((item) => item.code)).toContain('AEAT_VERIFACTU_LEGACY_NAMESPACE_DETECTED');
  });

  it('bloquea XML sin Cabecera ni RegistroFactura', () => {
    const report = validateAeatVerifactuXml([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
      '<soapenv:Body>',
      '<sum:RegFactuSistemaFacturacion xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd"/>',
      '</soapenv:Body>',
      '</soapenv:Envelope>',
    ].join(''));

    expect(report.valid).toBe(false);
    expect(report.blockingIssues.map((item) => item.code)).toEqual(expect.arrayContaining([
      'AEAT_VERIFACTU_SUMINISTRO_INFORMACION_NAMESPACE_REQUIRED',
      'AEAT_VERIFACTU_CABECERA_REQUIRED',
      'AEAT_VERIFACTU_OBLIGADO_EMISION_REQUIRED',
      'AEAT_VERIFACTU_REGISTRO_FACTURA_REQUIRED',
      'AEAT_VERIFACTU_REGISTRO_FACTURA_TYPE_REQUIRED',
    ]));
  });

  it('bloquea mezcla de RegistroAlta y RegistroAnulacion', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput());
    const xml = payload.xml.replace(
      '</sum1:RegistroAlta>',
      '</sum1:RegistroAlta><sum1:RegistroAnulacion><sum1:IDVersion>1.0</sum1:IDVersion></sum1:RegistroAnulacion>',
    );

    const report = validateAeatVerifactuXml(xml);

    expect(report.valid).toBe(false);
    expect(report.recordType).toBe('UNKNOWN');
    expect(report.blockingIssues.map((item) => item.code)).toContain(
      'AEAT_VERIFACTU_REGISTRO_FACTURA_CHOICE_INVALID',
    );
  });

  it('bloquea formato de fecha no oficial dd-mm-yyyy', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput());
    const xml = payload.xml.replace(
      '<sum1:FechaExpedicionFactura>09-07-2026</sum1:FechaExpedicionFactura>',
      '<sum1:FechaExpedicionFactura>2026-07-09</sum1:FechaExpedicionFactura>',
    );

    const report = validateAeatVerifactuXml(xml);

    expect(report.valid).toBe(false);
    expect(report.blockingIssues.map((item) => item.code)).toContain(
      'AEAT_VERIFACTU_FECHA_EXPEDICION_FACTURA_FORMAT_INVALID',
    );
  });

  it('detecta manipulación del hash del payload', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput());
    const report = validateAeatVerifactuUnsignedXml({
      ...payload,
      xmlSha256: '0'.repeat(64),
    });

    expect(report.valid).toBe(false);
    expect(report.blockingIssues.map((item) => item.code)).toContain(
      'AEAT_VERIFACTU_XML_SHA256_MISMATCH',
    );
  });
});

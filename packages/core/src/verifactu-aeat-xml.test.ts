import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrityRecord } from './verifactu';
import {
  buildAeatVerifactuUnsignedXml,
  escapeXml,
  type AeatVerifactuUnsignedXmlInput,
} from './verifactu-aeat-xml';
import { AEAT_VERIFACTU_NAMESPACES } from './verifactu-aeat-spec';

function baseInput(overrides: Partial<AeatVerifactuUnsignedXmlInput> = {}): AeatVerifactuUnsignedXmlInput {
  const record = createIntegrityRecord({
    documentId: 'document-1',
    documentNumber: 'FS-2026-0001',
    recordType: 'ALTA',
    issuedAt: '2026-07-09T10:00:00.000Z',
    totalAmount: 7.02,
    taxAmount: 0.27,
  }, '2026-07-09T10:00:00.000Z');

  return {
    environment: 'test',
    record,
    issuer: {
      taxId: 'b12345678',
      name: 'Anclora & Fiscal <Test>',
    },
    recipient: {
      taxId: 'b11223344',
      name: 'Cliente Prueba VERIFACTU',
    },
    software: {
      name: 'Anclora Fiscal',
      id: 'AF',
      version: '0.1.0',
      installationNumber: 'LOCAL-TEST-001',
      producer: {
        taxId: 'b87654321',
        name: 'Anclora Labs',
      },
      onlyVerifactu: true,
      multiTenant: false,
    },
    generatedAt: '2026-07-09T10:05:00.000Z',
    operationDescription: 'Venta digital de ebook & guía',
    ...overrides,
  };
}

describe('escapeXml', () => {
  it('escapa caracteres reservados de XML', () => {
    expect(escapeXml(`A&B <C> "D" 'E'`)).toBe('A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
  });
});

describe('buildAeatVerifactuUnsignedXml', () => {
  it('construye un XML SOAP con namespaces oficiales AEAT para alta', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput());

    expect(payload).toMatchObject({
      schemaVersion: 'anclora-aeat-verifactu-unsigned-xml-draft-v1',
      environment: 'test',
      recordType: 'ALTA',
      documentNumber: 'FS-2026-0001',
    });
    expect(payload.chainHash).toMatch(/^[A-F0-9]{64}$/);
    expect(payload.xmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(payload.xml).toContain(`<soapenv:Envelope xmlns:soapenv="${AEAT_VERIFACTU_NAMESPACES.soapEnvelope}"`);
    expect(payload.xml).toContain(`xmlns:sum="${AEAT_VERIFACTU_NAMESPACES.suministroLR}"`);
    expect(payload.xml).toContain(`xmlns:sum1="${AEAT_VERIFACTU_NAMESPACES.suministroInformacion}"`);
    expect(payload.xml).not.toContain('tikeV1.0');

    expect(payload.xml).toContain('<sum:RegFactuSistemaFacturacion>');
    expect(payload.xml).toContain('<sum:Cabecera><sum1:ObligadoEmision>');
    expect(payload.xml).not.toContain('<sum:IDVersion>');

    expect(payload.xml).toContain('<sum1:RegistroAlta>');
    expect(payload.xml).toContain('<sum1:NumSerieFactura>FS-2026-0001</sum1:NumSerieFactura>');
    expect(payload.xml).toContain('<sum1:FechaExpedicionFactura>09-07-2026</sum1:FechaExpedicionFactura>');
    expect(payload.xml).toContain('<sum1:Destinatarios><sum1:IDDestinatario>');
    expect(payload.xml).toContain('<sum1:NombreRazon>Cliente Prueba VERIFACTU</sum1:NombreRazon>');
    expect(payload.xml).toContain('<sum1:NIF>B11223344</sum1:NIF>');
    expect(payload.xml).toContain('<sum1:Desglose><sum1:DetalleDesglose>');
    expect(payload.xml).toContain('<sum1:ClaveRegimen>01</sum1:ClaveRegimen>');
    expect(payload.xml).toContain('<sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion>');
    expect(payload.xml).toContain('<sum1:TipoImpositivo>4</sum1:TipoImpositivo>');
    expect(payload.xml).toContain('<sum1:BaseImponibleOimporteNoSujeto>6.75</sum1:BaseImponibleOimporteNoSujeto>');
    expect(payload.xml).toContain('<sum1:CuotaRepercutida>0.27</sum1:CuotaRepercutida>');
    expect(payload.xml).toContain('<sum1:CuotaTotal>0.27</sum1:CuotaTotal>');
    expect(payload.xml).toContain('<sum1:ImporteTotal>7.02</sum1:ImporteTotal>');
    expect(payload.xml).toContain('<sum1:PrimerRegistro>S</sum1:PrimerRegistro>');
    expect(payload.xml).toContain('<sum1:NombreSistemaInformatico>Anclora Fiscal</sum1:NombreSistemaInformatico>');
    expect(payload.xml).toContain('Anclora &amp; Fiscal &lt;Test&gt;');
    const expectedAeatHuella = createHash('sha256')
      .update(
        'IDEmisorFactura=B12345678&NumSerieFactura=FS-2026-0001&FechaExpedicionFactura=09-07-2026&TipoFactura=F1&CuotaTotal=0.27&ImporteTotal=7.02&Huella=&FechaHoraHusoGenRegistro=2026-07-09T10:05:00.000Z',
        'utf8',
      )
      .digest('hex')
      .toUpperCase();
    expect(payload.chainHash).toBe(expectedAeatHuella);
    expect(payload.xml).toContain(`<sum1:Huella>${payload.chainHash}</sum1:Huella>`);
    expect(payload.xml).not.toMatch(/<script/i);
  });

  it('construye un XML para anulación con IDFactura anulada oficial', () => {
    const previousHash = 'a'.repeat(64);
    const record = createIntegrityRecord({
      documentId: 'document-2',
      documentNumber: 'FS-2026-0002',
      recordType: 'ANULACION',
      issuedAt: '2026-07-09T10:00:00.000Z',
      totalAmount: 6.99,
      taxAmount: 0.27,
      previousHash,
    }, '2026-07-09T10:00:00.000Z');

    const payload = buildAeatVerifactuUnsignedXml(baseInput({ record }));

    expect(payload.recordType).toBe('ANULACION');
    expect(payload.xml).toContain('<sum1:RegistroAnulacion>');
    expect(payload.xml).toContain('<sum1:IDEmisorFacturaAnulada>B12345678</sum1:IDEmisorFacturaAnulada>');
    expect(payload.xml).toContain('<sum1:NumSerieFacturaAnulada>FS-2026-0002</sum1:NumSerieFacturaAnulada>');
    expect(payload.xml).toContain('<sum1:FechaExpedicionFacturaAnulada>09-07-2026</sum1:FechaExpedicionFacturaAnulada>');
    expect(payload.xml).toContain('<sum1:RegistroAnterior>');
    expect(payload.xml).toContain(`<sum1:Huella>${previousHash.toUpperCase()}</sum1:Huella>`);
  });

  it('rechaza importes, fechas o huellas inválidas antes de generar XML', () => {
    const invalidAmount = createIntegrityRecord({
      documentId: 'document-invalid',
      documentNumber: 'FS-INVALID',
      recordType: 'ALTA',
      issuedAt: '2026-07-09T10:00:00.000Z',
      totalAmount: Number.NaN,
      taxAmount: 0.27,
    }, '2026-07-09T10:00:00.000Z');

    expect(() => buildAeatVerifactuUnsignedXml(baseInput({ record: invalidAmount }))).toThrow(
      'AEAT_VERIFACTU_INVALID_AMOUNT',
    );

    const invalidDate = createIntegrityRecord({
      documentId: 'document-invalid-date',
      documentNumber: 'FS-INVALID-DATE',
      recordType: 'ALTA',
      issuedAt: 'not-a-date',
      totalAmount: 6.99,
      taxAmount: 0.27,
    }, '2026-07-09T10:00:00.000Z');

    expect(() => buildAeatVerifactuUnsignedXml(baseInput({ record: invalidDate }))).toThrow(
      'AEAT_VERIFACTU_INVALID_DATE',
    );

    expect(() => buildAeatVerifactuUnsignedXml(baseInput({
      record: {
        ...baseInput().record,
        hash: 'not-a-sha256',
      },
    }))).toThrow('AEAT_VERIFACTU_CHAIN_HASH_INVALID');
  });

  it('rechaza identidades incompletas', () => {
    expect(() => buildAeatVerifactuUnsignedXml(baseInput({
      issuer: {
        taxId: '',
        name: 'Anclora Fiscal',
      },
    }))).toThrow('AEAT_VERIFACTU_ISSUER_TAX_ID_REQUIRED');

    expect(() => buildAeatVerifactuUnsignedXml(baseInput({
      software: {
        name: 'Anclora Fiscal',
        id: '',
        version: '0.1.0',
        installationNumber: 'LOCAL-TEST-001',
        producer: {
          taxId: 'B87654321',
          name: 'Anclora Labs',
        },
      },
    }))).toThrow('AEAT_VERIFACTU_SOFTWARE_ID_REQUIRED');
  });
});

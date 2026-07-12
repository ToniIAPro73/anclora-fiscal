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
    invoiceType: 'F1',
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
  it('genera F2 sin destinatario y usa tipo dinámico en huella', () => {
    const f1 = buildAeatVerifactuUnsignedXml(baseInput());
    const f2 = buildAeatVerifactuUnsignedXml(baseInput({ invoiceType: 'F2', recipient: undefined }));

    expect(f2.xml).toContain('<sum1:TipoFactura>F2</sum1:TipoFactura>');
    expect(f2.xml).not.toContain('<sum1:Destinatarios>');
    expect(f2.chainHash).not.toBe(f1.chainHash);
  });

  it('aplica invariantes de destinatario para F1 y F2', () => {
    expect(() => buildAeatVerifactuUnsignedXml(baseInput({ recipient: undefined })))
      .toThrow('AEAT_VERIFACTU_F1_RECIPIENT_REQUIRED');
    expect(() => buildAeatVerifactuUnsignedXml(baseInput({ invoiceType: 'F2' })))
      .toThrow('AEAT_VERIFACTU_F2_RECIPIENT_FORBIDDEN');
  });

  it('genera F3 con referencias sustituidas y exige al menos una', () => {
    expect(() => buildAeatVerifactuUnsignedXml(baseInput({ invoiceType: 'F3' })))
      .toThrow('AEAT_VERIFACTU_F3_SUBSTITUTED_INVOICES_REQUIRED');
    const payload = buildAeatVerifactuUnsignedXml(baseInput({
      invoiceType: 'F3',
      substitutedInvoices: [{ documentNumber: 'FS-2026-0000', issuedAt: '2026-07-08' }],
    }));
    expect(payload.xml).toContain('<sum1:FacturasSustituidas>');
    expect(payload.xml).toContain('<sum1:IDFacturaSustituida>');
  });

  it('genera alta R5 con factura rectificada e importes de rectificación', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput({
      invoiceType: 'R5',
      recipient: undefined,
      rectification: {
        type: 'S',
        correctedInvoices: [{ documentNumber: 'FS-2026-0000', issuedAt: '2026-07-08' }],
        correctedTaxBase: 6.75,
        correctedTaxAmount: 0.27,
      },
    }));
    expect(payload.xml).toContain('<sum1:TipoFactura>R5</sum1:TipoFactura>');
    expect(payload.xml).toContain('<sum1:TipoRectificativa>S</sum1:TipoRectificativa>');
    expect(payload.xml).toContain('<sum1:FacturasRectificadas>');
    expect(payload.xml).toContain('<sum1:BaseRectificada>6.75</sum1:BaseRectificada>');
  });
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

  it('encadena con RegistroAnterior cuando existe un registro previo y omite PrimerRegistro=S', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput({
      previousRecord: {
        issuerTaxId: 'b12345678',
        documentNumber: 'FS-2026-0000',
        issuedAt: '2026-07-08T10:00:00.000Z',
        huella: 'f'.repeat(64),
      },
    }));

    expect(payload.xml).toContain('<sum1:RegistroAnterior>');
    expect(payload.xml).toContain('<sum1:NumSerieFactura>FS-2026-0000</sum1:NumSerieFactura>');
    expect(payload.xml).toContain(`<sum1:Huella>${'F'.repeat(64)}</sum1:Huella>`);
    expect(payload.xml).not.toContain('<sum1:PrimerRegistro>S</sum1:PrimerRegistro>');

    const expectedAeatHuella = createHash('sha256')
      .update(
        'IDEmisorFactura=B12345678&NumSerieFactura=FS-2026-0001&FechaExpedicionFactura=09-07-2026&TipoFactura=F1&CuotaTotal=0.27&ImporteTotal=7.02&Huella=FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF&FechaHoraHusoGenRegistro=2026-07-09T10:05:00.000Z',
        'utf8',
      )
      .digest('hex')
      .toUpperCase();
    expect(payload.chainHash).toBe(expectedAeatHuella);
  });

  it('mantiene la huella oficial AEAT independiente del hash interno Anclora (record.hash)', () => {
    const payload = buildAeatVerifactuUnsignedXml(baseInput());
    const { record } = baseInput();

    expect(payload.chainHash).toMatch(/^[A-F0-9]{64}$/);
    expect(record.hash).toMatch(/^[a-f0-9]{64}$/);
    // La huella AEAT (chainHash) se calcula sobre IDEmisorFactura/NumSerieFactura/... y NUNCA
    // coincide con record.hash (SHA-256 canónico interno de Anclora sobre el payload JSON).
    expect(payload.chainHash.toLowerCase()).not.toBe(record.hash.toLowerCase());
  });

  it('rechaza un previousHash inválido en el registro antes de firmar', () => {
    const invalidPreviousHash = createIntegrityRecord({
      documentId: 'document-invalid-previous',
      documentNumber: 'FS-INVALID-PREVIOUS',
      recordType: 'ALTA',
      issuedAt: '2026-07-09T10:00:00.000Z',
      totalAmount: 6.99,
      taxAmount: 0.27,
      previousHash: 'not-a-valid-hash',
    }, '2026-07-09T10:00:00.000Z');

    expect(() => buildAeatVerifactuUnsignedXml(baseInput({ record: invalidPreviousHash }))).toThrow(
      'AEAT_VERIFACTU_PREVIOUS_HASH_INVALID',
    );
  });

  it('rechaza un previousRecord.huella inválido antes de generar el encadenamiento', () => {
    expect(() => buildAeatVerifactuUnsignedXml(baseInput({
      previousRecord: {
        issuerTaxId: 'B12345678',
        documentNumber: 'FS-2026-0000',
        issuedAt: '2026-07-08T10:00:00.000Z',
        huella: 'not-a-valid-hash',
      },
    }))).toThrow('AEAT_VERIFACTU_PREVIOUS_HASH_INVALID');
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

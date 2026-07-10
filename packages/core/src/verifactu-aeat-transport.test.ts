import { describe, expect, it, vi } from 'vitest';
import { createIntegrityRecord, resolveVerifactuRuntimeConfig } from './verifactu';
import { DeterministicAeatVerifactuXmlSigner } from './verifactu-aeat-signing';
import {
  AeatVerifactuXmlSubmissionAdapter,
  DeterministicAeatVerifactuSoapTransport,
  parseAeatVerifactuSoapResponse,
} from './verifactu-aeat-transport';

function record(totalAmount = 6.99) {
  return createIntegrityRecord({
    documentId: 'document-1',
    documentNumber: 'FS-2026-0001',
    recordType: 'ALTA',
    issuedAt: '2026-07-09T10:00:00.000Z',
    totalAmount,
    taxAmount: 0.27,
  }, '2026-07-09T10:00:00.000Z');
}

function adapter(overrides: Partial<ConstructorParameters<typeof AeatVerifactuXmlSubmissionAdapter>[1]> = {}) {
  return new AeatVerifactuXmlSubmissionAdapter(
    resolveVerifactuRuntimeConfig({
      mode: 'test',
      nodeEnv: 'production',
      adapterConfigured: true,
    }),
    {
      environment: 'test',
      endpointUrl: 'https://aeat.test.example/verifactu',
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
      },
      certificateFingerprint: 'AABBCC1122',
      signer: new DeterministicAeatVerifactuXmlSigner(),
      transport: new DeterministicAeatVerifactuSoapTransport(() => '2026-07-09T10:07:00.000Z'),
      now: () => '2026-07-09T10:06:00.000Z',
      ...overrides,
    },
  );
}

describe('parseAeatVerifactuSoapResponse', () => {
  it('normaliza una respuesta aceptada de AEAT a VerifactuSubmissionResult', () => {
    const result = parseAeatVerifactuSoapResponse({
      statusCode: 200,
      receivedAt: '2026-07-09T10:07:00.000Z',
      body: [
        '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
        '<soapenv:Body>',
        '<RespuestaLinea>',
        '<EstadoRegistro>Correcto</EstadoRegistro>',
        '<CSV>CSV-123</CSV>',
        '<Mensaje>Aceptado</Mensaje>',
        '</RespuestaLinea>',
        '</soapenv:Body>',
        '</soapenv:Envelope>',
      ].join(''),
    });

    expect(result).toEqual({
      status: 'ACCEPTED',
      reference: 'CSV-123',
      message: 'Aceptado',
    });
  });

  it('normaliza una respuesta rechazada de AEAT a VerifactuSubmissionResult', () => {
    const result = parseAeatVerifactuSoapResponse({
      statusCode: 200,
      receivedAt: '2026-07-09T10:07:00.000Z',
      body: [
        '<RespuestaLinea>',
        '<EstadoRegistro>Incorrecto</EstadoRegistro>',
        '<CSV>CSV-REJECTED</CSV>',
        '<DescripcionErrorRegistro>NIF no válido</DescripcionErrorRegistro>',
        '</RespuestaLinea>',
      ].join(''),
    });

    expect(result).toEqual({
      status: 'REJECTED',
      reference: 'CSV-REJECTED',
      message: 'NIF no válido',
    });
  });

  it('rechaza respuestas HTTP no 2xx o XML no reconocible', () => {
    expect(() => parseAeatVerifactuSoapResponse({
      statusCode: 500,
      receivedAt: '2026-07-09T10:07:00.000Z',
      body: '<error/>',
    })).toThrow('AEAT_VERIFACTU_HTTP_500');

    expect(() => parseAeatVerifactuSoapResponse({
      statusCode: 200,
      receivedAt: '2026-07-09T10:07:00.000Z',
      body: '<RespuestaLinea><EstadoRegistro>Desconocido</EstadoRegistro></RespuestaLinea>',
    })).toThrow('AEAT_VERIFACTU_UNRECOGNIZED_SOAP_RESPONSE');
  });
});

describe('DeterministicAeatVerifactuSoapTransport', () => {
  it('requiere entorno test y XML firmado', async () => {
    const transport = new DeterministicAeatVerifactuSoapTransport();

    await expect(transport.submit({
      environment: 'production',
      endpointUrl: 'https://aeat.production.example/verifactu',
      signedPayload: {
        schemaVersion: 'anclora-aeat-verifactu-signed-xml-draft-v1',
        environment: 'production',
        recordType: 'ALTA',
        documentNumber: 'FS-1',
        chainHash: 'a'.repeat(64),
        unsignedXmlSha256: 'b'.repeat(64),
        signedXml: '<xml><ds:Signature/></xml>',
        signedXmlSha256: 'c'.repeat(64),
        signatureDigest: 'd'.repeat(64),
        certificateFingerprint: 'AABBCC1122',
        signedAt: '2026-07-09T10:06:00.000Z',
        signingMode: 'deterministic-test',
      },
    })).rejects.toThrow('AEAT_VERIFACTU_DETERMINISTIC_TRANSPORT_REQUIRES_TEST_ENVIRONMENT');

    await expect(transport.submit({
      environment: 'test',
      endpointUrl: 'https://aeat.test.example/verifactu',
      signedPayload: {
        schemaVersion: 'anclora-aeat-verifactu-signed-xml-draft-v1',
        environment: 'test',
        recordType: 'ALTA',
        documentNumber: 'FS-1',
        chainHash: 'a'.repeat(64),
        unsignedXmlSha256: 'b'.repeat(64),
        signedXml: '<xml/>',
        signedXmlSha256: 'c'.repeat(64),
        signatureDigest: 'd'.repeat(64),
        certificateFingerprint: 'AABBCC1122',
        signedAt: '2026-07-09T10:06:00.000Z',
        signingMode: 'deterministic-test',
      },
    })).rejects.toThrow('AEAT_VERIFACTU_SIGNED_XML_SIGNATURE_REQUIRED');
  });
});

describe('AeatVerifactuXmlSubmissionAdapter', () => {
  it('ejecuta el flujo registro interno → XML → firma → transporte test', async () => {
    const deterministicTransport = new DeterministicAeatVerifactuSoapTransport(() => '2026-07-09T10:07:00.000Z');
    const transport = {
      submit: vi.fn((request) => deterministicTransport.submit(request)),
    };

    const result = await adapter({ transport }).submit(record());

    expect(result.status).toBe('ACCEPTED');
    expect(result.reference).toMatch(/^aeat-test-[a-f0-9]{16}$/);
    expect(result.message).toBe('Aceptado por el transporte AEAT de pruebas simulado');

    expect(transport.submit).toHaveBeenCalledOnce();
    expect(transport.submit.mock.calls[0]?.[0]).toMatchObject({
      environment: 'test',
      endpointUrl: 'https://aeat.test.example/verifactu',
    });
    expect(transport.submit.mock.calls[0]?.[0].signedPayload.signedXml).toContain('<ds:Signature');
    expect(transport.submit.mock.calls[0]?.[0].signedPayload.signedXml).toContain('<sum1:NumSerieFactura>FS-2026-0001</sum1:NumSerieFactura>');
  });

  it('propaga un rechazo normalizado del transporte AEAT test', async () => {
    const transport = {
      submit: vi.fn(async () => ({
        statusCode: 200,
        receivedAt: '2026-07-09T10:07:00.000Z',
        body: [
          '<RespuestaLinea>',
          '<EstadoRegistro>Incorrecto</EstadoRegistro>',
          '<CSV>CSV-REJECTED-TEST</CSV>',
          '<DescripcionErrorRegistro>Rechazo simulado por transporte AEAT</DescripcionErrorRegistro>',
          '</RespuestaLinea>',
        ].join(''),
      })),
    };

    const result = await adapter({ transport }).submit(record());

    expect(result.status).toBe('REJECTED');
    expect(result.reference).toBe('CSV-REJECTED-TEST');
    expect(result.message).toBe('Rechazo simulado por transporte AEAT');
    expect(transport.submit).toHaveBeenCalledOnce();
  });

  it('respeta los bloqueos de runtime, entorno y endpoint', async () => {
    const disabled = new AeatVerifactuXmlSubmissionAdapter(
      resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production' }),
      {
        environment: 'test',
        endpointUrl: 'https://aeat.test.example/verifactu',
        issuer: { taxId: 'B12345678', name: 'Anclora Fiscal' },
        software: {
          name: 'Anclora Fiscal',
          id: 'AF',
          version: '0.1.0',
          installationNumber: 'LOCAL-TEST-001',
          producer: { taxId: 'B87654321', name: 'Anclora Labs' },
        },
        certificateFingerprint: 'AABBCC1122',
        signer: new DeterministicAeatVerifactuXmlSigner(),
        transport: new DeterministicAeatVerifactuSoapTransport(),
      },
    );

    await expect(disabled.submit(record())).rejects.toThrow('VERIFACTU_NOT_ENABLED');

    await expect(adapter({ environment: 'production' }).submit(record())).rejects.toThrow(
      'VERIFACTU_AEAT_ENVIRONMENT_MISMATCH',
    );

    await expect(adapter({ endpointUrl: ' ' }).submit(record())).rejects.toThrow(
      'VERIFACTU_AEAT_ENDPOINT_NOT_CONFIGURED',
    );
  });
});

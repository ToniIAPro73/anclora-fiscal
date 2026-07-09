import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AeatVerifactuSignedXmlPayload } from './verifactu-aeat-signing';
import {
  AeatVerifactuRealSoapTransport,
  buildSoapHeaders,
  resolveClientCertificate,
} from './verifactu-aeat-real-soap-transport';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function signedPayload(xml = '<soapenv:Envelope><soapenv:Body><ds:Signature/></soapenv:Body></soapenv:Envelope>') {
  return {
    signedXml: xml,
    signedXmlSha256: 'b'.repeat(64),
    unsignedXmlSha256: 'c'.repeat(64),
    certificateFingerprint: 'd'.repeat(40),
    signedAt: '2026-07-09T10:00:00.000Z',
    signingMode: 'deterministic-test',
  } as AeatVerifactuSignedXmlPayload;
}

describe('buildSoapHeaders', () => {
  it('genera cabeceras SOAP document/literal con soapAction vacío', () => {
    expect(buildSoapHeaders('<xml/>', 'Agent/1')).toEqual({
      'content-type': 'text/xml; charset=utf-8',
      soapaction: '""',
      'user-agent': 'Agent/1',
      'content-length': '6',
    });
  });
});

describe('resolveClientCertificate', () => {
  it('carga un certificado PFX desde buffer', async () => {
    await expect(resolveClientCertificate({
      pfxBuffer: Buffer.from('fake-pfx'),
      passphrase: 'secret',
    })).resolves.toMatchObject({
      pfx: Buffer.from('fake-pfx'),
      passphrase: 'secret',
    });
  });

  it('carga un certificado PFX desde fichero', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'anclora-aeat-cert-'));
    tmpDirs.push(dir);

    const pfxPath = join(dir, 'cert.p12');
    await writeFile(pfxPath, Buffer.from('fake-pfx-file'));

    await expect(resolveClientCertificate({
      pfxPath,
      passphrase: 'secret',
    })).resolves.toMatchObject({
      pfx: Buffer.from('fake-pfx-file'),
      passphrase: 'secret',
    });
  });

  it('rechaza configuración sin certificado cliente', async () => {
    await expect(resolveClientCertificate({})).rejects.toThrow('AEAT_VERIFACTU_CLIENT_CERTIFICATE_REQUIRED');
  });
});

describe('AeatVerifactuRealSoapTransport', () => {
  it('permanece apagado por defecto aunque exista endpoint y certificado', async () => {
    const transport = new AeatVerifactuRealSoapTransport({
      enabled: false,
      certificate: {
        pfxBuffer: Buffer.from('fake-pfx'),
        passphrase: 'secret',
      },
    });

    await expect(transport.submit({
      environment: 'test',
      endpointUrl: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
      signedPayload: signedPayload(),
    })).rejects.toThrow('AEAT_VERIFACTU_REAL_SOAP_TRANSPORT_DISABLED');
  });

  it('prepara un POST SOAP mTLS cuando se habilita explícitamente en test', async () => {
    const request = {
      request: vi.fn(async () => ({
        statusCode: 200,
        headers: {
          'content-type': 'text/xml',
        },
        body: '<soapenv:Envelope><soapenv:Body><RespuestaRegFactuSistemaFacturacion/></soapenv:Body></soapenv:Envelope>',
      })),
    };

    const transport = new AeatVerifactuRealSoapTransport({
      enabled: true,
      certificate: {
        pfxBuffer: Buffer.from('fake-pfx'),
        passphrase: 'secret',
      },
      request,
      now: () => '2026-07-09T10:10:00.000Z',
      userAgent: 'Anclora-Test/1',
    });

    const response = await transport.submit({
      environment: 'test',
      endpointUrl: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
      signedPayload: signedPayload('<soapenv:Envelope><soapenv:Body>ok</soapenv:Body></soapenv:Envelope>'),
    });

    expect(response).toMatchObject({
      statusCode: 200,
      receivedAt: '2026-07-09T10:10:00.000Z',
    });
    expect(request.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
      method: 'POST',
      body: '<soapenv:Envelope><soapenv:Body>ok</soapenv:Body></soapenv:Envelope>',
      timeoutMs: 30_000,
      headers: expect.objectContaining({
        'content-type': 'text/xml; charset=utf-8',
        soapaction: '""',
        'user-agent': 'Anclora-Test/1',
      }),
      certificate: expect.objectContaining({
        pfx: Buffer.from('fake-pfx'),
        passphrase: 'secret',
      }),
    }));
  });

  it('bloquea test contra hosts que no sean preproducción', async () => {
    const transport = new AeatVerifactuRealSoapTransport({
      enabled: true,
      certificate: {
        pfxBuffer: Buffer.from('fake-pfx'),
      },
      request: {
        request: vi.fn(),
      },
    });

    await expect(transport.submit({
      environment: 'test',
      endpointUrl: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
      signedPayload: signedPayload(),
    })).rejects.toThrow('AEAT_VERIFACTU_TEST_SOAP_ENDPOINT_MUST_BE_PREPRODUCTION');
  });

  it('bloquea producción si apunta por error a preproducción', async () => {
    const transport = new AeatVerifactuRealSoapTransport({
      enabled: true,
      certificate: {
        pfxBuffer: Buffer.from('fake-pfx'),
      },
      request: {
        request: vi.fn(),
      },
    });

    await expect(transport.submit({
      environment: 'production',
      endpointUrl: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
      signedPayload: signedPayload(),
    })).rejects.toThrow('AEAT_VERIFACTU_PRODUCTION_SOAP_ENDPOINT_MUST_NOT_BE_PREPRODUCTION');
  });
});

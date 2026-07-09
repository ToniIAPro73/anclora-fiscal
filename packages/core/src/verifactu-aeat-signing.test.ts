import { describe, expect, it } from 'vitest';
import { createIntegrityRecord } from './verifactu';
import { buildAeatVerifactuUnsignedXml } from './verifactu-aeat-xml';
import { DeterministicAeatVerifactuXmlSigner } from './verifactu-aeat-signing';

function unsignedPayload(environment: 'test' | 'production' = 'test') {
  const record = createIntegrityRecord({
    documentId: 'document-1',
    documentNumber: 'FS-2026-0001',
    recordType: 'ALTA',
    issuedAt: '2026-07-09T10:00:00.000Z',
    totalAmount: 6.99,
    taxAmount: 0.27,
  }, '2026-07-09T10:00:00.000Z');

  return buildAeatVerifactuUnsignedXml({
    environment,
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
    },
    generatedAt: '2026-07-09T10:05:00.000Z',
  });
}

describe('DeterministicAeatVerifactuXmlSigner', () => {
  it('firma de forma determinista un XML VERI*FACTU de pruebas', async () => {
    const signer = new DeterministicAeatVerifactuXmlSigner();

    const signed = await signer.signXml({
      unsignedPayload: unsignedPayload(),
      certificateFingerprint: 'aa:bb:cc:11:22',
      signedAt: '2026-07-09T10:06:00.000Z',
    });

    expect(signed).toMatchObject({
      schemaVersion: 'anclora-aeat-verifactu-signed-xml-draft-v1',
      environment: 'test',
      recordType: 'ALTA',
      documentNumber: 'FS-2026-0001',
      certificateFingerprint: 'AABBCC1122',
      signedAt: '2026-07-09T10:06:00.000Z',
      signingMode: 'deterministic-test',
    });
    expect(signed.unsignedXmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.signedXmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.signatureDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.signedXml).toContain('<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">');
    expect(signed.signedXml).toContain(`<ds:SignatureValue>${signed.signatureDigest}</ds:SignatureValue>`);
    expect(signed.signedXml).toContain('<soapenv:Body>');
    expect(signed.signedXml).toContain('</soapenv:Body>');
  });

  it('produce la misma firma para la misma entrada', async () => {
    const signer = new DeterministicAeatVerifactuXmlSigner();
    const input = {
      unsignedPayload: unsignedPayload(),
      certificateFingerprint: 'AABBCC1122',
      signedAt: '2026-07-09T10:06:00.000Z',
    };

    const first = await signer.signXml(input);
    const second = await signer.signXml(input);

    expect(second.signatureDigest).toBe(first.signatureDigest);
    expect(second.signedXmlSha256).toBe(first.signedXmlSha256);
    expect(second.signedXml).toBe(first.signedXml);
  });

  it('rechaza producción para evitar una firma ficticia en entorno real', async () => {
    const signer = new DeterministicAeatVerifactuXmlSigner();

    await expect(signer.signXml({
      unsignedPayload: unsignedPayload('production'),
      certificateFingerprint: 'AABBCC1122',
      signedAt: '2026-07-09T10:06:00.000Z',
    })).rejects.toThrow('AEAT_VERIFACTU_DETERMINISTIC_SIGNER_NOT_ALLOWED_IN_PRODUCTION');
  });

  it('rechaza fingerprint, fecha o hash incoherentes', async () => {
    const signer = new DeterministicAeatVerifactuXmlSigner();

    await expect(signer.signXml({
      unsignedPayload: unsignedPayload(),
      certificateFingerprint: '',
      signedAt: '2026-07-09T10:06:00.000Z',
    })).rejects.toThrow('AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_REQUIRED');

    await expect(signer.signXml({
      unsignedPayload: unsignedPayload(),
      certificateFingerprint: 'AABBCC1122',
      signedAt: 'not-a-date',
    })).rejects.toThrow('AEAT_VERIFACTU_SIGNATURE_DATETIME_INVALID');

    const tamperedPayload = {
      ...unsignedPayload(),
      xml: '<xml>alterado</xml>',
    };

    await expect(signer.signXml({
      unsignedPayload: tamperedPayload,
      certificateFingerprint: 'AABBCC1122',
      signedAt: '2026-07-09T10:06:00.000Z',
    })).rejects.toThrow('AEAT_VERIFACTU_UNSIGNED_XML_HASH_MISMATCH');
  });
});

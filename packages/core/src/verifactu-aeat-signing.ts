import { createHash } from 'node:crypto';
import type { AeatVerifactuUnsignedXmlPayload } from './verifactu-aeat-xml.js';

export interface AeatVerifactuXmlSignerInput {
  unsignedPayload: AeatVerifactuUnsignedXmlPayload;
  certificateFingerprint: string;
  signedAt: string;
}

export interface AeatVerifactuSignedXmlPayload {
  schemaVersion: 'anclora-aeat-verifactu-signed-xml-draft-v1';
  environment: AeatVerifactuUnsignedXmlPayload['environment'];
  recordType: AeatVerifactuUnsignedXmlPayload['recordType'];
  documentNumber: string;
  chainHash: string;
  unsignedXmlSha256: string;
  signedXml: string;
  signedXmlSha256: string;
  signatureDigest: string;
  certificateFingerprint: string;
  signedAt: string;
  signingMode: 'deterministic-test';
}

export interface AeatVerifactuXmlSignerPort {
  signXml(input: AeatVerifactuXmlSignerInput): Promise<AeatVerifactuSignedXmlPayload>;
}

/**
 * Deterministic XML signer for tests and local verification.
 *
 * This is not an electronic signature and must not be used as a production
 * signer. It gives the rest of the VERI*FACTU pipeline a stable signed-payload
 * shape before wiring a real XMLDSig/certificate implementation.
 */
export class DeterministicAeatVerifactuXmlSigner implements AeatVerifactuXmlSignerPort {
  async signXml(input: AeatVerifactuXmlSignerInput): Promise<AeatVerifactuSignedXmlPayload> {
    const certificateFingerprint = normalizeFingerprint(input.certificateFingerprint);
    const signedAt = normalizeDateTime(input.signedAt);
    const unsignedXml = input.unsignedPayload.xml.trim();

    if (!unsignedXml) {
      throw new Error('AEAT_VERIFACTU_UNSIGNED_XML_EMPTY');
    }

    if (input.unsignedPayload.environment === 'production') {
      throw new Error('AEAT_VERIFACTU_DETERMINISTIC_SIGNER_NOT_ALLOWED_IN_PRODUCTION');
    }

    const expectedUnsignedHash = sha256(unsignedXml);
    if (expectedUnsignedHash !== input.unsignedPayload.xmlSha256) {
      throw new Error('AEAT_VERIFACTU_UNSIGNED_XML_HASH_MISMATCH');
    }

    const signatureDigest = sha256([
      input.unsignedPayload.xmlSha256,
      input.unsignedPayload.chainHash,
      certificateFingerprint,
      signedAt,
      input.unsignedPayload.documentNumber,
    ].join('|'));

    const signatureBlock = [
      '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
      '<ds:SignedInfo>',
      '<ds:CanonicalizationMethod Algorithm="urn:anclora:test:canonicalization"/>',
      '<ds:SignatureMethod Algorithm="urn:anclora:test:sha256"/>',
      '<ds:Reference URI="">',
      `<ds:DigestValue>${signatureDigest}</ds:DigestValue>`,
      '</ds:Reference>',
      '</ds:SignedInfo>',
      `<ds:SignatureValue>${signatureDigest}</ds:SignatureValue>`,
      '<ds:KeyInfo>',
      `<ds:X509Data>${certificateFingerprint}</ds:X509Data>`,
      '</ds:KeyInfo>',
      '</ds:Signature>',
    ].join('');

    const signedXml = injectSignature(unsignedXml, signatureBlock);

    return {
      schemaVersion: 'anclora-aeat-verifactu-signed-xml-draft-v1',
      environment: input.unsignedPayload.environment,
      recordType: input.unsignedPayload.recordType,
      documentNumber: input.unsignedPayload.documentNumber,
      chainHash: input.unsignedPayload.chainHash,
      unsignedXmlSha256: input.unsignedPayload.xmlSha256,
      signedXml,
      signedXmlSha256: sha256(signedXml),
      signatureDigest,
      certificateFingerprint,
      signedAt,
      signingMode: 'deterministic-test',
    };
  }
}

function injectSignature(xml: string, signatureBlock: string): string {
  const closingBody = '</soapenv:Body>';

  if (xml.includes(closingBody)) {
    return xml.replace(closingBody, `${signatureBlock}${closingBody}`);
  }

  return `${xml}${signatureBlock}`;
}

function normalizeFingerprint(value: string): string {
  const normalized = value.replaceAll(':', '').replaceAll(' ', '').trim().toUpperCase();

  if (!normalized) {
    throw new Error('AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_REQUIRED');
  }

  if (!/^[A-F0-9-]+$/.test(normalized)) {
    throw new Error('AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_INVALID');
  }

  return normalized;
}

function normalizeDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('AEAT_VERIFACTU_SIGNATURE_DATETIME_INVALID');
  }

  return date.toISOString();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

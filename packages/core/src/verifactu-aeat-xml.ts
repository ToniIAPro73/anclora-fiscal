import { createHash } from 'node:crypto';
import type { IntegrityRecord } from './verifactu.js';
import { AEAT_VERIFACTU_NAMESPACES } from './verifactu-aeat-spec.js';

export type AeatVerifactuXmlEnvironment = 'test' | 'production';

export interface AeatVerifactuPartyIdentity {
  taxId: string;
  name: string;
}

export interface AeatVerifactuPreviousRecordReference {
  issuerTaxId?: string | undefined;
  documentNumber: string;
  issuedAt: string;
  huella: string;
}

export interface AeatVerifactuSoftwareIdentity {
  name: string;
  id: string;
  version: string;
  installationNumber: string;
  producer: AeatVerifactuPartyIdentity;
  onlyVerifactu?: boolean | undefined;
  multiTenant?: boolean | undefined;
}

export interface AeatVerifactuUnsignedXmlInput {
  environment: AeatVerifactuXmlEnvironment;
  record: IntegrityRecord;
  issuer: AeatVerifactuPartyIdentity;
  recipient?: AeatVerifactuPartyIdentity | undefined;
  previousRecord?: AeatVerifactuPreviousRecordReference | undefined;
  software: AeatVerifactuSoftwareIdentity;
  generatedAt: string;
  operationDescription?: string | undefined;
  externalReference?: string | undefined;
}

export interface AeatVerifactuUnsignedXmlPayload {
  schemaVersion: 'anclora-aeat-verifactu-unsigned-xml-draft-v1';
  environment: AeatVerifactuXmlEnvironment;
  recordType: IntegrityRecord['recordType'];
  documentNumber: string;
  chainHash: string;
  xml: string;
  xmlSha256: string;
}

export function buildAeatVerifactuUnsignedXml(input: AeatVerifactuUnsignedXmlInput): AeatVerifactuUnsignedXmlPayload {
  assertEnvironment(input.environment);
  assertRecord(input.record);

  const issuer = normalizeParty(input.issuer, 'ISSUER');
  const producer = normalizeParty(input.software.producer, 'SOFTWARE_PRODUCER');
  const recipient = normalizeParty(input.recipient ?? input.issuer, 'RECIPIENT');
  const software = normalizeSoftware(input.software, producer);
  const chainHash = input.record.recordType === 'ALTA'
    ? calculateRegistroAltaHuella(input, issuer)
    : normalizeHash(input.record.hash, 'CHAIN_HASH');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<soapenv:Envelope xmlns:soapenv="${AEAT_VERIFACTU_NAMESPACES.soapEnvelope}" xmlns:sum="${AEAT_VERIFACTU_NAMESPACES.suministroLR}" xmlns:sum1="${AEAT_VERIFACTU_NAMESPACES.suministroInformacion}" xmlns:xd="${AEAT_VERIFACTU_NAMESPACES.xmlDsig}">`,
    '<soapenv:Header/>',
    '<soapenv:Body>',
    '<sum:RegFactuSistemaFacturacion>',
    buildCabecera(issuer),
    '<sum:RegistroFactura>',
    input.record.recordType === 'ANULACION'
      ? buildRegistroAnulacion(input, issuer, software)
      : buildRegistroAlta(input, issuer, recipient, software),
    '</sum:RegistroFactura>',
    '</sum:RegFactuSistemaFacturacion>',
    '</soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('');

  return {
    schemaVersion: 'anclora-aeat-verifactu-unsigned-xml-draft-v1',
    environment: input.environment,
    recordType: input.record.recordType,
    documentNumber: input.record.documentNumber,
    chainHash,
    xml,
    xmlSha256: createHash('sha256').update(xml).digest('hex'),
  };
}

function buildCabecera(issuer: AeatVerifactuPartyIdentity): string {
  return [
    '<sum:Cabecera>',
    '<sum1:ObligadoEmision>',
    element('sum1:NombreRazon', issuer.name),
    element('sum1:NIF', issuer.taxId),
    '</sum1:ObligadoEmision>',
    '</sum:Cabecera>',
  ].join('');
}

function buildRegistroAlta(
  input: AeatVerifactuUnsignedXmlInput,
  issuer: AeatVerifactuPartyIdentity,
  recipient: AeatVerifactuPartyIdentity,
  software: NormalizedSoftwareIdentity,
): string {
  return [
    '<sum1:RegistroAlta>',
    element('sum1:IDVersion', '1.0'),
    buildIdFacturaAlta(input.record, issuer),
    element('sum1:RefExterna', input.externalReference ?? input.record.documentId),
    element('sum1:NombreRazonEmisor', issuer.name),
    element('sum1:TipoFactura', 'F1'),
    element('sum1:DescripcionOperacion', input.operationDescription ?? 'Operación registrada desde Anclora Fiscal'),
    buildDestinatarios(recipient),
    buildDesglose(input.record),
    element('sum1:CuotaTotal', formatAmount(input.record.taxAmount)),
    element('sum1:ImporteTotal', formatAmount(input.record.totalAmount)),
    buildEncadenamiento(input, issuer),
    buildSistemaInformatico(software),
    element('sum1:FechaHoraHusoGenRegistro', formatDateTime(input.generatedAt)),
    element('sum1:TipoHuella', '01'),
    element('sum1:Huella', calculateRegistroAltaHuella(input, issuer)),
    '</sum1:RegistroAlta>',
  ].join('');
}




function calculateRegistroAltaHuella(
  input: AeatVerifactuUnsignedXmlInput,
  issuer: AeatVerifactuPartyIdentity,
): string {
  const previousHuella = input.previousRecord
    ? normalizeHash(input.previousRecord.huella, 'PREVIOUS_HASH')
    : input.record.previousHash
      ? normalizeHash(input.record.previousHash, 'PREVIOUS_HASH')
      : '';

  const source = [
    `IDEmisorFactura=${issuer.taxId}`,
    `NumSerieFactura=${input.record.documentNumber}`,
    `FechaExpedicionFactura=${formatDate(input.record.issuedAt)}`,
    'TipoFactura=F1',
    `CuotaTotal=${formatAmount(input.record.taxAmount)}`,
    `ImporteTotal=${formatAmount(input.record.totalAmount)}`,
    `Huella=${previousHuella}`,
    `FechaHoraHusoGenRegistro=${formatDateTime(input.generatedAt)}`,
  ].join('&');

  return createHash('sha256').update(source, 'utf8').digest('hex').toUpperCase();
}

function buildDestinatarios(recipient: AeatVerifactuPartyIdentity): string {
  return [
    '<sum1:Destinatarios>',
    '<sum1:IDDestinatario>',
    element('sum1:NombreRazon', recipient.name),
    element('sum1:NIF', recipient.taxId),
    '</sum1:IDDestinatario>',
    '</sum1:Destinatarios>',
  ].join('');
}

function buildDesglose(record: IntegrityRecord): string {
  const baseAmount = record.totalAmount - record.taxAmount;

  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    throw new Error('AEAT_VERIFACTU_INVALID_AMOUNT');
  }

  const taxRate = baseAmount === 0 ? 0 : (record.taxAmount / baseAmount) * 100;

  if (!Number.isFinite(taxRate) || taxRate < 0) {
    throw new Error('AEAT_VERIFACTU_INVALID_AMOUNT');
  }

  return [
    '<sum1:Desglose>',
    '<sum1:DetalleDesglose>',
    element('sum1:ClaveRegimen', '01'),
    element('sum1:CalificacionOperacion', 'S1'),
    element('sum1:TipoImpositivo', formatPercentage(taxRate)),
    element('sum1:BaseImponibleOimporteNoSujeto', formatAmount(baseAmount)),
    element('sum1:CuotaRepercutida', formatAmount(record.taxAmount)),
    '</sum1:DetalleDesglose>',
    '</sum1:Desglose>',
  ].join('');
}

function buildRegistroAnulacion(
  input: AeatVerifactuUnsignedXmlInput,
  issuer: AeatVerifactuPartyIdentity,
  software: NormalizedSoftwareIdentity,
): string {
  return [
    '<sum1:RegistroAnulacion>',
    element('sum1:IDVersion', '1.0'),
    buildIdFacturaAnulacion(input.record, issuer),
    element('sum1:RefExterna', input.externalReference ?? input.record.documentId),
    buildEncadenamiento(input, issuer),
    buildSistemaInformatico(software),
    element('sum1:FechaHoraHusoGenRegistro', formatDateTime(input.generatedAt)),
    element('sum1:TipoHuella', '01'),
    element('sum1:Huella', normalizeHash(input.record.hash, 'CHAIN_HASH')),
    '</sum1:RegistroAnulacion>',
  ].join('');
}

function buildIdFacturaAlta(record: IntegrityRecord, issuer: AeatVerifactuPartyIdentity): string {
  return [
    '<sum1:IDFactura>',
    element('sum1:IDEmisorFactura', issuer.taxId),
    element('sum1:NumSerieFactura', record.documentNumber),
    element('sum1:FechaExpedicionFactura', formatDate(record.issuedAt)),
    '</sum1:IDFactura>',
  ].join('');
}

function buildIdFacturaAnulacion(record: IntegrityRecord, issuer: AeatVerifactuPartyIdentity): string {
  return [
    '<sum1:IDFactura>',
    element('sum1:IDEmisorFacturaAnulada', issuer.taxId),
    element('sum1:NumSerieFacturaAnulada', record.documentNumber),
    element('sum1:FechaExpedicionFacturaAnulada', formatDate(record.issuedAt)),
    '</sum1:IDFactura>',
  ].join('');
}

function buildEncadenamiento(
  input: AeatVerifactuUnsignedXmlInput,
  issuer: AeatVerifactuPartyIdentity,
): string {
  if (!input.previousRecord && !input.record.previousHash) {
    return [
      '<sum1:Encadenamiento>',
      element('sum1:PrimerRegistro', 'S'),
      '</sum1:Encadenamiento>',
    ].join('');
  }

  const previous = normalizePreviousRecord(input, issuer);

  return [
    '<sum1:Encadenamiento>',
    '<sum1:RegistroAnterior>',
    element('sum1:IDEmisorFactura', previous.issuerTaxId),
    element('sum1:NumSerieFactura', previous.documentNumber),
    element('sum1:FechaExpedicionFactura', formatDate(previous.issuedAt)),
    element('sum1:Huella', previous.huella),
    '</sum1:RegistroAnterior>',
    '</sum1:Encadenamiento>',
  ].join('');
}


function normalizePreviousIssuerTaxId(value: string): string {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    throw new Error('AEAT_VERIFACTU_PREVIOUS_ISSUER_TAX_ID_REQUIRED');
  }

  return normalized;
}

function normalizePreviousRecord(
  input: AeatVerifactuUnsignedXmlInput,
  issuer: AeatVerifactuPartyIdentity,
): NormalizedPreviousRecordReference {
  const previous = input.previousRecord;

  if (previous) {
    required(previous.documentNumber, 'PREVIOUS_DOCUMENT_NUMBER');
    required(previous.issuedAt, 'PREVIOUS_ISSUED_AT');
    required(previous.huella, 'PREVIOUS_HASH');

    return {
      issuerTaxId: normalizePreviousIssuerTaxId(previous.issuerTaxId ?? issuer.taxId),
      documentNumber: previous.documentNumber.trim(),
      issuedAt: previous.issuedAt,
      huella: normalizeHash(previous.huella, 'PREVIOUS_HASH'),
    };
  }

  return {
    issuerTaxId: issuer.taxId,
    documentNumber: 'REGISTRO-ANTERIOR',
    issuedAt: input.record.issuedAt,
    huella: normalizeHash(input.record.previousHash ?? '', 'PREVIOUS_HASH'),
  };
}

interface NormalizedPreviousRecordReference {
  issuerTaxId: string;
  documentNumber: string;
  issuedAt: string;
  huella: string;
}

interface NormalizedSoftwareIdentity {
  name: string;
  id: string;
  version: string;
  installationNumber: string;
  producer: AeatVerifactuPartyIdentity;
  onlyVerifactu: boolean;
  multiTenant: boolean;
}

function buildSistemaInformatico(software: NormalizedSoftwareIdentity): string {
  return [
    '<sum1:SistemaInformatico>',
    element('sum1:NombreRazon', software.producer.name),
    element('sum1:NIF', software.producer.taxId),
    element('sum1:NombreSistemaInformatico', software.name),
    element('sum1:IdSistemaInformatico', software.id),
    element('sum1:Version', software.version),
    element('sum1:NumeroInstalacion', software.installationNumber),
    element('sum1:TipoUsoPosibleSoloVerifactu', software.onlyVerifactu ? 'S' : 'N'),
    element('sum1:TipoUsoPosibleMultiOT', software.multiTenant ? 'S' : 'N'),
    element('sum1:IndicadorMultiplesOT', software.multiTenant ? 'S' : 'N'),
    '</sum1:SistemaInformatico>',
  ].join('');
}

function element(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}


function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) throw new Error('AEAT_VERIFACTU_INVALID_AMOUNT');

  const formatted = value
    .toFixed(2)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');

  return formatted === '-0' ? '0' : formatted;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) throw new Error('AEAT_VERIFACTU_INVALID_AMOUNT');
  return value.toFixed(2);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('AEAT_VERIFACTU_INVALID_DATE');

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());

  return `${day}-${month}-${year}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('AEAT_VERIFACTU_INVALID_DATETIME');
  return date.toISOString();
}

function normalizeHash(value: string, code: string): string {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-F0-9]{64}$/.test(normalized)) {
    throw new Error(`AEAT_VERIFACTU_${code}_INVALID`);
  }

  return normalized;
}

function assertEnvironment(environment: AeatVerifactuXmlEnvironment): void {
  if (environment !== 'test' && environment !== 'production') {
    throw new Error('AEAT_VERIFACTU_INVALID_ENVIRONMENT');
  }
}

function assertRecord(record: IntegrityRecord): void {
  required(record.documentId, 'DOCUMENT_ID');
  required(record.documentNumber, 'DOCUMENT_NUMBER');
  required(record.hash, 'CHAIN_HASH');
  normalizeHash(record.hash, 'CHAIN_HASH');

  if (record.previousHash) {
    normalizeHash(record.previousHash, 'PREVIOUS_HASH');
  }

  if (record.algorithm !== 'SHA-256') {
    throw new Error('AEAT_VERIFACTU_UNSUPPORTED_HASH_ALGORITHM');
  }
}

function normalizeParty(party: AeatVerifactuPartyIdentity, scope: string): AeatVerifactuPartyIdentity {
  return {
    taxId: required(party.taxId, `${scope}_TAX_ID`).toUpperCase(),
    name: required(party.name, `${scope}_NAME`),
  };
}

function normalizeSoftware(
  software: AeatVerifactuSoftwareIdentity,
  producer: AeatVerifactuPartyIdentity,
): NormalizedSoftwareIdentity {
  return {
    name: required(software.name, 'SOFTWARE_NAME'),
    id: required(software.id, 'SOFTWARE_ID'),
    version: required(software.version, 'SOFTWARE_VERSION'),
    installationNumber: required(software.installationNumber, 'SOFTWARE_INSTALLATION_NUMBER'),
    producer,
    onlyVerifactu: software.onlyVerifactu ?? true,
    multiTenant: software.multiTenant ?? false,
  };
}

function required(value: string, code: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`AEAT_VERIFACTU_${code}_REQUIRED`);
  return trimmed;
}

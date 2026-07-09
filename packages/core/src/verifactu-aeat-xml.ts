import { createHash } from 'node:crypto';
import type { IntegrityRecord } from './verifactu.js';
import { AEAT_VERIFACTU_NAMESPACES } from './verifactu-aeat-spec.js';

export type AeatVerifactuXmlEnvironment = 'test' | 'production';

export interface AeatVerifactuPartyIdentity {
  taxId: string;
  name: string;
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
  const software = normalizeSoftware(input.software, producer);
  const chainHash = normalizeHash(input.record.hash, 'CHAIN_HASH');

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
      : buildRegistroAlta(input, issuer, software),
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
    element('sum1:CuotaTotal', formatAmount(input.record.taxAmount)),
    element('sum1:ImporteTotal', formatAmount(input.record.totalAmount)),
    buildEncadenamiento(input.record, issuer),
    buildSistemaInformatico(software),
    element('sum1:FechaHoraHusoGenRegistro', formatDateTime(input.generatedAt)),
    element('sum1:TipoHuella', '01'),
    element('sum1:Huella', normalizeHash(input.record.hash, 'CHAIN_HASH')),
    '</sum1:RegistroAlta>',
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
    buildEncadenamiento(input.record, issuer),
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

function buildEncadenamiento(record: IntegrityRecord, issuer: AeatVerifactuPartyIdentity): string {
  if (!record.previousHash) {
    return [
      '<sum1:Encadenamiento>',
      element('sum1:PrimerRegistro', 'S'),
      '</sum1:Encadenamiento>',
    ].join('');
  }

  return [
    '<sum1:Encadenamiento>',
    '<sum1:RegistroAnterior>',
    element('sum1:IDEmisorFactura', issuer.taxId),
    element('sum1:NumSerieFactura', 'REGISTRO-ANTERIOR'),
    element('sum1:FechaExpedicionFactura', formatDate(record.issuedAt)),
    element('sum1:Huella', normalizeHash(record.previousHash, 'PREVIOUS_HASH')),
    '</sum1:RegistroAnterior>',
    '</sum1:Encadenamiento>',
  ].join('');
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

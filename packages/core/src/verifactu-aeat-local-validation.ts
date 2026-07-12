import { createHash } from 'node:crypto';
import { AEAT_VERIFACTU_NAMESPACES, AEAT_VERIFACTU_XML_LIMITS } from './verifactu-aeat-spec.js';
import type { AeatVerifactuUnsignedXmlPayload } from './verifactu-aeat-xml.js';

export type AeatVerifactuXmlValidationSeverity = 'blocking' | 'warning';

export interface AeatVerifactuXmlValidationIssue {
  code: string;
  severity: AeatVerifactuXmlValidationSeverity;
  message: string;
  path?: string | undefined;
}

export interface AeatVerifactuXmlValidationReport {
  schemaProfile: 'aeat-suministro-lr-local-preflight-v1';
  valid: boolean;
  rootElement: string | null;
  recordType: 'ALTA' | 'ANULACION' | 'UNKNOWN' | null;
  registroFacturaCount: number;
  blockingIssues: AeatVerifactuXmlValidationIssue[];
  warnings: AeatVerifactuXmlValidationIssue[];
}

export function validateAeatVerifactuUnsignedXml(
  payload: AeatVerifactuUnsignedXmlPayload,
): AeatVerifactuXmlValidationReport {
  const report = validateAeatVerifactuXml(payload.xml);
  const issues = [...report.blockingIssues];
  const warnings = [...report.warnings];

  const calculatedSha256 = sha256(payload.xml);

  if (payload.xmlSha256 !== calculatedSha256) {
    issues.push(issue(
      'AEAT_VERIFACTU_XML_SHA256_MISMATCH',
      'blocking',
      'La huella SHA-256 del XML no coincide con el contenido actual.',
      'xmlSha256',
    ));
  }

  if (payload.recordType === 'ALTA' && report.recordType !== 'ALTA') {
    issues.push(issue(
      'AEAT_VERIFACTU_XML_RECORD_TYPE_MISMATCH',
      'blocking',
      'El payload indica ALTA pero el XML no contiene RegistroAlta.',
      'recordType',
    ));
  }

  if (payload.recordType === 'ANULACION' && report.recordType !== 'ANULACION') {
    issues.push(issue(
      'AEAT_VERIFACTU_XML_RECORD_TYPE_MISMATCH',
      'blocking',
      'El payload indica ANULACION pero el XML no contiene RegistroAnulacion.',
      'recordType',
    ));
  }

  const currentHash = lastXmlText(payload.xml, 'Huella');

  if (currentHash && currentHash !== payload.chainHash) {
    issues.push(issue(
      'AEAT_VERIFACTU_XML_CHAIN_HASH_MISMATCH',
      'blocking',
      'La huella final del XML no coincide con la huella del payload.',
      'Huella',
    ));
  }

  return {
    ...report,
    valid: issues.length === 0,
    blockingIssues: issues,
    warnings,
  };
}

export function validateAeatVerifactuXml(xml: string): AeatVerifactuXmlValidationReport {
  const blockingIssues: AeatVerifactuXmlValidationIssue[] = [];
  const warnings: AeatVerifactuXmlValidationIssue[] = [];

  const rootElement = detectRootElement(xml);
  const registroFacturaCount = countOpeningTags(xml, 'RegistroFactura');
  const hasAlta = hasTag(xml, 'RegistroAlta');
  const hasAnulacion = hasTag(xml, 'RegistroAnulacion');
  const recordType = hasAlta && !hasAnulacion
    ? 'ALTA'
    : hasAnulacion && !hasAlta
      ? 'ANULACION'
      : hasAlta && hasAnulacion
        ? 'UNKNOWN'
        : null;

  if (!xml.trim().startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    warnings.push(issue(
      'AEAT_VERIFACTU_XML_DECLARATION_RECOMMENDED',
      'warning',
      'Se recomienda declarar XML UTF-8 explícitamente.',
    ));
  }

  if (xml.includes('tikeV1.0')) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_LEGACY_NAMESPACE_DETECTED',
      'blocking',
      'El XML contiene namespaces antiguos tikeV1.0.',
    ));
  }

  requireText(xml, AEAT_VERIFACTU_NAMESPACES.soapEnvelope, 'AEAT_VERIFACTU_SOAP_NAMESPACE_REQUIRED', blockingIssues);
  requireText(xml, AEAT_VERIFACTU_NAMESPACES.suministroLR, 'AEAT_VERIFACTU_SUMINISTRO_LR_NAMESPACE_REQUIRED', blockingIssues);
  requireText(xml, AEAT_VERIFACTU_NAMESPACES.suministroInformacion, 'AEAT_VERIFACTU_SUMINISTRO_INFORMACION_NAMESPACE_REQUIRED', blockingIssues);

  if (!hasTag(xml, 'RegFactuSistemaFacturacion')) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_ROOT_REGFACTU_REQUIRED',
      'blocking',
      'Falta RegFactuSistemaFacturacion.',
      'RegFactuSistemaFacturacion',
    ));
  }

  if (!hasTag(xml, 'Cabecera')) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_CABECERA_REQUIRED',
      'blocking',
      'Falta Cabecera.',
      'Cabecera',
    ));
  }

  if (!hasTag(xml, 'ObligadoEmision')) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_OBLIGADO_EMISION_REQUIRED',
      'blocking',
      'Falta ObligadoEmision.',
      'Cabecera.ObligadoEmision',
    ));
  }

  if (registroFacturaCount < 1) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_REGISTRO_FACTURA_REQUIRED',
      'blocking',
      'Debe existir al menos un RegistroFactura.',
      'RegistroFactura',
    ));
  }

  if (registroFacturaCount > AEAT_VERIFACTU_XML_LIMITS.maxRegistroFacturaPerEnvelope) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_REGISTRO_FACTURA_LIMIT_EXCEEDED',
      'blocking',
      `Se supera el máximo de ${AEAT_VERIFACTU_XML_LIMITS.maxRegistroFacturaPerEnvelope} RegistroFactura por envío.`,
      'RegistroFactura',
    ));
  }

  if (hasAlta && hasAnulacion) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_REGISTRO_FACTURA_CHOICE_INVALID',
      'blocking',
      'Un RegistroFactura no debe mezclar RegistroAlta y RegistroAnulacion.',
      'RegistroFactura',
    ));
  }

  if (!hasAlta && !hasAnulacion) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_REGISTRO_FACTURA_TYPE_REQUIRED',
      'blocking',
      'Debe existir RegistroAlta o RegistroAnulacion.',
      'RegistroFactura',
    ));
  }

  if (recordType === 'ALTA') {
    validateAlta(xml, blockingIssues, warnings);
  }

  if (recordType === 'ANULACION') {
    validateAnulacion(xml, blockingIssues);
  }

  validateCommonRecordFields(xml, blockingIssues, warnings);

  return {
    schemaProfile: 'aeat-suministro-lr-local-preflight-v1',
    valid: blockingIssues.length === 0,
    rootElement,
    recordType,
    registroFacturaCount,
    blockingIssues,
    warnings,
  };
}

function validateAlta(
  xml: string,
  blockingIssues: AeatVerifactuXmlValidationIssue[],
  warnings: AeatVerifactuXmlValidationIssue[],
): void {
  const invoiceType = firstXmlText(xml, 'TipoFactura');
  for (const field of [
    'IDVersion',
    'IDFactura',
    'IDEmisorFactura',
    'NumSerieFactura',
    'FechaExpedicionFactura',
    'NombreRazonEmisor',
    'TipoFactura',
    'DescripcionOperacion',
    'Desglose',
    'DetalleDesglose',
    'ClaveRegimen',
    'CalificacionOperacion',
    'TipoImpositivo',
    'BaseImponibleOimporteNoSujeto',
    'CuotaRepercutida',
    'CuotaTotal',
    'ImporteTotal',
  ]) {
    requireTag(xml, field, blockingIssues);
  }

  if (invoiceType === 'F1' || invoiceType === 'F3') {
    requireTag(xml, 'Destinatarios', blockingIssues);
    requireTag(xml, 'IDDestinatario', blockingIssues);
  }
  if (invoiceType === 'F2' && hasTag(xml, 'Destinatarios')) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_F2_DESTINATARIOS_FORBIDDEN',
      'blocking',
      'F2 no admite Destinatarios en este flujo.',
      'Destinatarios',
    ));
  }

  validateDateField(xml, 'FechaExpedicionFactura', blockingIssues);
  validateAmountField(xml, 'BaseImponibleOimporteNoSujeto', blockingIssues, warnings);
  validateAmountField(xml, 'CuotaRepercutida', blockingIssues, warnings);
  validateAmountField(xml, 'CuotaTotal', blockingIssues, warnings);
  validateAmountField(xml, 'ImporteTotal', blockingIssues, warnings);
}

function validateAnulacion(
  xml: string,
  blockingIssues: AeatVerifactuXmlValidationIssue[],
): void {
  for (const field of [
    'IDVersion',
    'IDFactura',
    'IDEmisorFacturaAnulada',
    'NumSerieFacturaAnulada',
    'FechaExpedicionFacturaAnulada',
  ]) {
    requireTag(xml, field, blockingIssues);
  }

  validateDateField(xml, 'FechaExpedicionFacturaAnulada', blockingIssues);
}

function validateCommonRecordFields(
  xml: string,
  blockingIssues: AeatVerifactuXmlValidationIssue[],
  warnings: AeatVerifactuXmlValidationIssue[],
): void {
  for (const field of [
    'Encadenamiento',
    'SistemaInformatico',
    'NombreSistemaInformatico',
    'IdSistemaInformatico',
    'Version',
    'NumeroInstalacion',
    'FechaHoraHusoGenRegistro',
    'TipoHuella',
    'Huella',
  ]) {
    requireTag(xml, field, blockingIssues);
  }

  const tipoHuella = firstXmlText(xml, 'TipoHuella');

  if (tipoHuella && tipoHuella !== '01') {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_TIPO_HUELLA_UNSUPPORTED',
      'blocking',
      'Sólo se admite TipoHuella 01 para SHA-256.',
      'TipoHuella',
    ));
  }

  const huella = lastXmlText(xml, 'Huella');

  if (huella && !/^[A-F0-9]{64}$/.test(huella)) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_HUELLA_INVALID',
      'blocking',
      'La Huella debe ser hexadecimal SHA-256 de 64 caracteres.',
      'Huella',
    ));
  }

  const generatedAt = firstXmlText(xml, 'FechaHoraHusoGenRegistro');

  if (generatedAt && !isIsoDateTimeWithTimezone(generatedAt)) {
    blockingIssues.push(issue(
      'AEAT_VERIFACTU_FECHA_HORA_HUSO_INVALID',
      'blocking',
      'FechaHoraHusoGenRegistro debe ser ISO 8601 con zona horaria.',
      'FechaHoraHusoGenRegistro',
    ));
  }

  if (hasTag(xml, 'Signature')) {
    warnings.push(issue(
      'AEAT_VERIFACTU_SIGNATURE_PRESENT_IN_PREFLIGHT',
      'warning',
      'El preflight se está ejecutando sobre XML que ya contiene firma.',
      'Signature',
    ));
  }
}

function requireTag(
  xml: string,
  localName: string,
  blockingIssues: AeatVerifactuXmlValidationIssue[],
): void {
  if (!hasTag(xml, localName)) {
    blockingIssues.push(issue(
      `AEAT_VERIFACTU_${snake(localName)}_REQUIRED`,
      'blocking',
      `Falta ${localName}.`,
      localName,
    ));
  }
}

function requireText(
  xml: string,
  value: string,
  code: string,
  blockingIssues: AeatVerifactuXmlValidationIssue[],
): void {
  if (!xml.includes(value)) {
    blockingIssues.push(issue(
      code,
      'blocking',
      `Falta el valor requerido: ${value}.`,
    ));
  }
}

function validateDateField(
  xml: string,
  localName: string,
  blockingIssues: AeatVerifactuXmlValidationIssue[],
): void {
  const value = firstXmlText(xml, localName);

  if (!value) return;

  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    blockingIssues.push(issue(
      `AEAT_VERIFACTU_${snake(localName)}_FORMAT_INVALID`,
      'blocking',
      `${localName} debe tener formato dd-mm-yyyy.`,
      localName,
    ));
    return;
  }

  const [dayText, monthText, yearText] = value.split('-');
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  if (
    !Number.isInteger(day)
    || !Number.isInteger(month)
    || !Number.isInteger(year)
    || month < 1
    || month > 12
    || day < 1
    || day > 31
  ) {
    blockingIssues.push(issue(
      `AEAT_VERIFACTU_${snake(localName)}_VALUE_INVALID`,
      'blocking',
      `${localName} contiene una fecha no válida.`,
      localName,
    ));
  }
}

function validateAmountField(
  xml: string,
  localName: string,
  blockingIssues: AeatVerifactuXmlValidationIssue[],
  warnings: AeatVerifactuXmlValidationIssue[],
): void {
  const value = firstXmlText(xml, localName);

  if (!value) return;

  if (!/^-?\d+\.\d{2}$/.test(value)) {
    blockingIssues.push(issue(
      `AEAT_VERIFACTU_${snake(localName)}_FORMAT_INVALID`,
      'blocking',
      `${localName} debe usar dos decimales y punto como separador decimal.`,
      localName,
    ));
    return;
  }

  if (value.startsWith('-')) {
    warnings.push(issue(
      `AEAT_VERIFACTU_${snake(localName)}_NEGATIVE_AMOUNT`,
      'warning',
      `${localName} es negativo; puede ser rechazado según el tipo de operación.`,
      localName,
    ));
  }
}

function detectRootElement(xml: string): string | null {
  const opening = findOpeningTag(xml, 'Envelope', 0)
    ?? findOpeningTag(xml, 'RegFactuSistemaFacturacion', 0);

  return opening?.fullName ?? null;
}

function hasTag(xml: string, localName: string): boolean {
  return findOpeningTag(xml, localName, 0) !== null;
}

function countOpeningTags(xml: string, localName: string): number {
  let count = 0;
  let cursor = 0;

  while (cursor < xml.length) {
    const opening = findOpeningTag(xml, localName, cursor);

    if (!opening) break;

    count += 1;
    cursor = opening.end;
  }

  return count;
}

function firstXmlText(xml: string, localName: string): string | null {
  const values = allXmlTexts(xml, localName);
  return values.length > 0 ? values[0] ?? null : null;
}

function lastXmlText(xml: string, localName: string): string | null {
  const values = allXmlTexts(xml, localName);
  return values.length > 0 ? values[values.length - 1] ?? null : null;
}

function allXmlTexts(xml: string, localName: string): string[] {
  const values: string[] = [];
  let cursor = 0;

  while (cursor < xml.length) {
    const opening = findOpeningTag(xml, localName, cursor);

    if (!opening) break;

    const closingTag = `</${opening.fullName}>`;
    const closeIndex = xml.indexOf(closingTag, opening.end);

    if (closeIndex < 0) break;

    const raw = xml.slice(opening.end, closeIndex).trim();

    if (raw) {
      values.push(unescapeXml(raw));
    }

    cursor = closeIndex + closingTag.length;
  }

  return values;
}

function findOpeningTag(
  xml: string,
  localName: string,
  fromIndex: number,
): { fullName: string; end: number } | null {
  let cursor = fromIndex;

  while (cursor < xml.length) {
    const openIndex = xml.indexOf('<', cursor);

    if (openIndex < 0) return null;

    const marker = xml.charAt(openIndex + 1);

    if (marker === '/' || marker === '?' || marker === '!') {
      cursor = openIndex + 1;
      continue;
    }

    const closeIndex = xml.indexOf('>', openIndex + 1);

    if (closeIndex < 0) return null;

    const fullName = parseTagName(xml.slice(openIndex + 1, closeIndex));
    const colonIndex = fullName.indexOf(':');
    const candidateLocalName = colonIndex >= 0 ? fullName.slice(colonIndex + 1) : fullName;

    if (candidateLocalName === localName) {
      return {
        fullName,
        end: closeIndex + 1,
      };
    }

    cursor = closeIndex + 1;
  }

  return null;
}

function parseTagName(tagContent: string): string {
  const trimmed = tagContent.trim();
  let end = trimmed.length;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed.charAt(index);

    if (
      character === ' '
      || character === '/'
      || character === String.fromCharCode(9)
      || character === String.fromCharCode(10)
      || character === String.fromCharCode(13)
    ) {
      end = index;
      break;
    }
  }

  return trimmed.slice(0, end);
}

function isIsoDateTimeWithTimezone(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function snake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase();
}

function issue(
  code: string,
  severity: AeatVerifactuXmlValidationSeverity,
  message: string,
  path?: string,
): AeatVerifactuXmlValidationIssue {
  return {
    code,
    severity,
    message,
    ...(path ? { path } : {}),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

import { createHash } from 'node:crypto';
import type {
  IntegrityRecord,
  VerifactuPort,
  VerifactuRuntimeConfig,
  VerifactuSubmissionResult,
} from './verifactu.js';
import {
  buildAeatVerifactuUnsignedXml,
  type AeatVerifactuPartyIdentity,
  type AeatVerifactuSoftwareIdentity,
  type AeatVerifactuXmlEnvironment,
} from './verifactu-aeat-xml.js';
import type {
  AeatVerifactuSignedXmlPayload,
  AeatVerifactuXmlSignerPort,
} from './verifactu-aeat-signing.js';

export interface AeatVerifactuSoapTransportRequest {
  environment: AeatVerifactuXmlEnvironment;
  endpointUrl: string;
  signedPayload: AeatVerifactuSignedXmlPayload;
}

export interface AeatVerifactuSoapTransportResponse {
  statusCode: number;
  body: string;
  receivedAt: string;
}

export interface AeatVerifactuSoapTransportPort {
  submit(request: AeatVerifactuSoapTransportRequest): Promise<AeatVerifactuSoapTransportResponse>;
}

export interface AeatVerifactuXmlSubmissionAdapterOptions {
  environment: AeatVerifactuXmlEnvironment;
  endpointUrl: string;
  issuer: AeatVerifactuPartyIdentity;
  software: AeatVerifactuSoftwareIdentity;
  certificateFingerprint: string;
  signer: AeatVerifactuXmlSignerPort;
  transport: AeatVerifactuSoapTransportPort;
  now?: (() => string) | undefined;
  operationDescription?: string | undefined;
}

export class AeatVerifactuXmlSubmissionAdapter implements VerifactuPort {
  constructor(
    private readonly config: VerifactuRuntimeConfig,
    private readonly options: AeatVerifactuXmlSubmissionAdapterOptions,
  ) {}

  async submit(record: IntegrityRecord): Promise<VerifactuSubmissionResult> {
    assertRuntime(this.config, this.options.environment);

    const endpointUrl = this.options.endpointUrl.trim();
    if (!endpointUrl) {
      throw new Error('VERIFACTU_AEAT_ENDPOINT_NOT_CONFIGURED');
    }

    const now = this.options.now?.() ?? new Date().toISOString();

    const unsignedPayload = buildAeatVerifactuUnsignedXml({
      environment: this.options.environment,
      record,
      issuer: this.options.issuer,
      software: this.options.software,
      generatedAt: now,
      operationDescription: this.options.operationDescription,
      externalReference: record.documentId,
    });

    const signedPayload = await this.options.signer.signXml({
      unsignedPayload,
      certificateFingerprint: this.options.certificateFingerprint,
      signedAt: now,
    });

    const response = await this.options.transport.submit({
      environment: this.options.environment,
      endpointUrl,
      signedPayload,
    });

    return parseAeatVerifactuSoapResponse(response);
  }
}

export class DeterministicAeatVerifactuSoapTransport implements AeatVerifactuSoapTransportPort {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async submit(request: AeatVerifactuSoapTransportRequest): Promise<AeatVerifactuSoapTransportResponse> {
    if (request.environment !== 'test') {
      throw new Error('AEAT_VERIFACTU_DETERMINISTIC_TRANSPORT_REQUIRES_TEST_ENVIRONMENT');
    }

    if (!request.endpointUrl.trim()) {
      throw new Error('AEAT_VERIFACTU_ENDPOINT_REQUIRED');
    }

    if (!request.signedPayload.signedXml.includes('<ds:Signature')) {
      throw new Error('AEAT_VERIFACTU_SIGNED_XML_SIGNATURE_REQUIRED');
    }

    const reference = `aeat-test-${sha256(request.signedPayload.signedXml).slice(0, 16)}`;
    const rejected = request.signedPayload.signedXml.includes('<sum1:ImporteTotal>-');

    return {
      statusCode: 200,
      receivedAt: this.now(),
      body: buildDeterministicSoapResponse({
        accepted: !rejected,
        reference,
        message: rejected
          ? 'Rechazo simulado por importe negativo'
          : 'Aceptado por el transporte AEAT de pruebas simulado',
      }),
    };
  }
}

export function parseAeatVerifactuSoapResponse(response: AeatVerifactuSoapTransportResponse): VerifactuSubmissionResult {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`AEAT_VERIFACTU_HTTP_${response.statusCode}`);
  }

  const estado = firstXmlText(response.body, 'EstadoRegistro')
    ?? firstXmlText(response.body, 'EstadoEnvio')
    ?? '';

  const reference = firstXmlText(response.body, 'CSV')
    ?? firstXmlText(response.body, 'CodigoRegistro')
    ?? firstXmlText(response.body, 'Referencia')
    ?? `aeat-response-${sha256(response.body).slice(0, 16)}`;

  const message = firstXmlText(response.body, 'DescripcionErrorRegistro')
    ?? firstXmlText(response.body, 'DescripcionError')
    ?? firstXmlText(response.body, 'Mensaje')
    ?? estado
    ?? 'Respuesta AEAT procesada';

  const normalizedEstado = normalizeStatusText(estado);

  if (
    normalizedEstado === 'incorrecto'
    || normalizedEstado.includes('rechazado')
    || normalizedEstado.includes('rechazada')
    || normalizedEstado.includes('error')
  ) {
    return {
      status: 'REJECTED',
      reference,
      message,
    };
  }

  if (
    normalizedEstado === 'correcto'
    || normalizedEstado.includes('aceptado')
    || normalizedEstado.includes('aceptada')
  ) {
    return {
      status: 'ACCEPTED',
      reference,
      message,
    };
  }

  throw new Error('AEAT_VERIFACTU_UNRECOGNIZED_SOAP_RESPONSE');
}

function assertRuntime(config: VerifactuRuntimeConfig, environment: AeatVerifactuXmlEnvironment): void {
  if (!config.enabled || !config.canSubmit) {
    throw new Error('VERIFACTU_NOT_ENABLED');
  }

  if (config.mode === 'disabled' || config.mode === 'mock') {
    throw new Error('VERIFACTU_AEAT_ADAPTER_REQUIRES_AEAT_MODE');
  }

  if (config.mode !== environment) {
    throw new Error('VERIFACTU_AEAT_ENVIRONMENT_MISMATCH');
  }

  if (config.mode === 'production' && !config.productionSafe) {
    throw new Error('VERIFACTU_PRODUCTION_NOT_SAFE');
  }
}

function buildDeterministicSoapResponse(input: {
  accepted: boolean;
  reference: string;
  message: string;
}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soapenv:Body>',
    '<RespuestaRegFactuSistemaFacturacion>',
    '<RespuestaLinea>',
    `<EstadoRegistro>${input.accepted ? 'Correcto' : 'Incorrecto'}</EstadoRegistro>`,
    `<CSV>${escapeXml(input.reference)}</CSV>`,
    `<Mensaje>${escapeXml(input.message)}</Mensaje>`,
    '</RespuestaLinea>',
    '</RespuestaRegFactuSistemaFacturacion>',
    '</soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('');
}

function firstXmlText(xml: string, localName: string): string | null {
  const opening = findOpeningTag(xml, localName, 0);
  if (!opening) return null;

  const closingTag = `</${opening.fullName}>`;
  const closeIndex = xml.indexOf(closingTag, opening.end);

  if (closeIndex < 0) return null;

  const raw = xml.slice(opening.end, closeIndex).trim();
  if (!raw) return null;

  const cdataStart = '<![CDATA[';
  const cdataEnd = ']]>';
  const text = raw.startsWith(cdataStart) && raw.endsWith(cdataEnd)
    ? raw.slice(cdataStart.length, raw.length - cdataEnd.length).trim()
    : raw;

  return unescapeXml(text);
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

function normalizeStatusText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

import { readFile } from 'node:fs/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type {
  AeatVerifactuSoapTransportPort,
  AeatVerifactuSoapTransportRequest,
  AeatVerifactuSoapTransportResponse,
} from './verifactu-aeat-transport.js';

export interface AeatVerifactuClientCertificateSource {
  pfxPath?: string | undefined;
  pfxBuffer?: Buffer | undefined;
  certPath?: string | undefined;
  keyPath?: string | undefined;
  caPath?: string | undefined;
  passphrase?: string | undefined;
}

export interface AeatVerifactuResolvedClientCertificate {
  pfx?: Buffer | undefined;
  cert?: Buffer | undefined;
  key?: Buffer | undefined;
  ca?: Buffer | undefined;
  passphrase?: string | undefined;
}

export interface AeatVerifactuHttpsRequestInput {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  certificate: AeatVerifactuResolvedClientCertificate;
}

export interface AeatVerifactuHttpsResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
}

export interface AeatVerifactuHttpsRequestPort {
  request(input: AeatVerifactuHttpsRequestInput): Promise<AeatVerifactuHttpsResponse>;
}

export interface AeatVerifactuRealSoapTransportOptions {
  enabled: boolean;
  certificate: AeatVerifactuClientCertificateSource;
  request?: AeatVerifactuHttpsRequestPort | undefined;
  timeoutMs?: number | undefined;
  userAgent?: string | undefined;
  now?: (() => string) | undefined;
}

export class AeatVerifactuRealSoapTransport implements AeatVerifactuSoapTransportPort {
  private readonly requestPort: AeatVerifactuHttpsRequestPort;

  constructor(private readonly options: AeatVerifactuRealSoapTransportOptions) {
    this.requestPort = options.request ?? new NodeAeatVerifactuHttpsRequest();
  }

  async submit(request: AeatVerifactuSoapTransportRequest): Promise<AeatVerifactuSoapTransportResponse> {
    if (!this.options.enabled) {
      throw new Error('AEAT_VERIFACTU_REAL_SOAP_TRANSPORT_DISABLED');
    }

    assertEndpointPolicy(request.environment, request.endpointUrl);

    const certificate = await resolveClientCertificate(this.options.certificate);
    const response = await this.requestPort.request({
      url: request.endpointUrl,
      method: 'POST',
      headers: buildSoapHeaders(request.signedPayload.signedXml, this.options.userAgent),
      body: request.signedPayload.signedXml,
      timeoutMs: this.options.timeoutMs ?? 30_000,
      certificate,
    });

    return {
      statusCode: response.statusCode,
      body: response.body,
      receivedAt: this.options.now?.() ?? new Date().toISOString(),
    };
  }
}

export class NodeAeatVerifactuHttpsRequest implements AeatVerifactuHttpsRequestPort {
  async request(input: AeatVerifactuHttpsRequestInput): Promise<AeatVerifactuHttpsResponse> {
    const url = new URL(input.url);

    const options: RequestOptions = {
      method: input.method,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: input.headers,
    };

    if (url.port) {
      options.port = Number(url.port);
    }

    if (input.certificate.pfx) {
      options.pfx = input.certificate.pfx;
    }

    if (input.certificate.cert) {
      options.cert = input.certificate.cert;
    }

    if (input.certificate.key) {
      options.key = input.certificate.key;
    }

    if (input.certificate.ca) {
      options.ca = input.certificate.ca;
    }

    if (input.certificate.passphrase) {
      options.passphrase = input.certificate.passphrase;
    }

    return new Promise((resolve, reject) => {
      const clientRequest = httpsRequest(options, (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: normalizeHeaders(response.headers),
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });

      clientRequest.setTimeout(input.timeoutMs, () => {
        clientRequest.destroy(new Error('AEAT_VERIFACTU_SOAP_TIMEOUT'));
      });

      clientRequest.on('error', reject);
      clientRequest.write(input.body);
      clientRequest.end();
    });
  }
}

export function buildSoapHeaders(signedXml: string, userAgent?: string | undefined): Record<string, string> {
  return {
    'content-type': 'text/xml; charset=utf-8',
    soapaction: '""',
    'user-agent': userAgent?.trim() || 'Anclora-Fiscal-Verifactu-Test/0.1',
    'content-length': String(Buffer.byteLength(signedXml, 'utf8')),
  };
}

export async function resolveClientCertificate(
  source: AeatVerifactuClientCertificateSource,
): Promise<AeatVerifactuResolvedClientCertificate> {
  const certificate: AeatVerifactuResolvedClientCertificate = {};

  if (source.pfxBuffer) {
    certificate.pfx = source.pfxBuffer;
  } else if (source.pfxPath?.trim()) {
    certificate.pfx = await readFile(source.pfxPath.trim());
  }

  if (source.certPath?.trim()) {
    certificate.cert = await readFile(source.certPath.trim());
  }

  if (source.keyPath?.trim()) {
    certificate.key = await readFile(source.keyPath.trim());
  }

  if (source.caPath?.trim()) {
    certificate.ca = await readFile(source.caPath.trim());
  }

  if (source.passphrase?.trim()) {
    certificate.passphrase = source.passphrase;
  }

  if (!certificate.pfx && !(certificate.cert && certificate.key)) {
    throw new Error('AEAT_VERIFACTU_CLIENT_CERTIFICATE_REQUIRED');
  }

  return certificate;
}

function assertEndpointPolicy(environment: AeatVerifactuSoapTransportRequest['environment'], endpointUrl: string): void {
  const parsed = new URL(endpointUrl);

  if (parsed.protocol !== 'https:') {
    throw new Error('AEAT_VERIFACTU_REAL_SOAP_REQUIRES_HTTPS');
  }

  const hostname = parsed.hostname.toLowerCase();
  const preproduction = hostname === 'preportal.aeat.es'
    || hostname.startsWith('prewww1.aeat.es')
    || hostname.startsWith('prewww2.aeat.es')
    || hostname.startsWith('prewww10.aeat.es');

  if (environment === 'test' && !preproduction) {
    throw new Error('AEAT_VERIFACTU_TEST_SOAP_ENDPOINT_MUST_BE_PREPRODUCTION');
  }

  if (environment === 'production' && preproduction) {
    throw new Error('AEAT_VERIFACTU_PRODUCTION_SOAP_ENDPOINT_MUST_NOT_BE_PREPRODUCTION');
  }
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string' || Array.isArray(value)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

import QRCode from 'qrcode';

export type VerifactuQrEnvironment = 'test' | 'production';

export interface VerifactuQrInput {
  environment: VerifactuQrEnvironment;
  issuerTaxIdentity: string;
  documentNumber: string;
  issuedAt: string;
  totalAmount: number;
}

export interface VerifactuQrValidationUrlResult {
  url: string;
  environment: VerifactuQrEnvironment;
}

/**
 * AEAT QR validation hosts per the published VERI*FACTU QR generation spec
 * (Anexo II, "Especificaciones técnicas para la generación del código QR").
 * `docs/verifactu-compliance-matrix.md` still flags this row as pending
 * final confirmation against AEAT's technical annex, so treat these as the
 * current best-known values rather than certified constants.
 */
const AEAT_QR_VALIDATION_URL: Record<VerifactuQrEnvironment, string> = {
  test: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  production: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
};

export const VERIFACTU_QR_LEGEND_LINES = [
  'Factura verificable en la sede electrónica de la AEAT',
  'VERI*FACTU',
] as const;

function formatQrDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) throw new Error('VERIFACTU_QR_DATE_INVALID');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}-${month}-${year}`;
}

export function buildVerifactuQrValidationUrl(
  input: VerifactuQrInput,
): VerifactuQrValidationUrlResult {
  if (input.environment === 'production') {
    throw new Error('VERIFACTU_QR_PRODUCTION_BLOCKED_PENDING_MANUAL_COTEJO');
  }
  const base = AEAT_QR_VALIDATION_URL[input.environment];
  const params = new URLSearchParams({
    nif: input.issuerTaxIdentity,
    numserie: input.documentNumber,
    fecha: formatQrDate(input.issuedAt),
    importe: input.totalAmount.toFixed(2),
  });

  return {
    url: `${base}?${params.toString()}`,
    environment: input.environment,
  };
}

export function parseVerifactuQrValidationUrl(url: string) {
  const parsed = new URL(url);
  if (`${parsed.origin}${parsed.pathname}` !== AEAT_QR_VALIDATION_URL.test) throw new Error('VERIFACTU_QR_URL_NOT_ALLOWED');
  const nif = parsed.searchParams.get('nif');
  const documentNumber = parsed.searchParams.get('numserie');
  const issuedAt = parsed.searchParams.get('fecha');
  const totalAmount = parsed.searchParams.get('importe');
  if (!nif || !documentNumber || !/^\d{2}-\d{2}-\d{4}$/.test(issuedAt ?? '') || !/^\d+\.\d{2}$/.test(totalAmount ?? '')) throw new Error('VERIFACTU_QR_PARAMETERS_INVALID');
  return { nif, documentNumber, issuedAt: issuedAt as string, totalAmount: totalAmount as string };
}

export const VERIFACTU_QR_PNG_OPTIONS = Object.freeze({
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 300,
} as const);

/** PNG bytes, square, error correction level M as required by the AEAT QR spec. */
export async function generateVerifactuQrPng(url: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(url, { ...VERIFACTU_QR_PNG_OPTIONS });

  return new Uint8Array(buffer);
}

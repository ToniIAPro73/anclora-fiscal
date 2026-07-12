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
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

export function buildVerifactuQrValidationUrl(
  input: VerifactuQrInput,
): VerifactuQrValidationUrlResult {
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

/** PNG bytes, square, error correction level M as required by the AEAT QR spec. */
export async function generateVerifactuQrPng(url: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 300,
  });

  return new Uint8Array(buffer);
}

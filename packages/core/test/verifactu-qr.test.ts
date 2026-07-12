import { describe, expect, it } from 'vitest';
import {
  buildVerifactuQrValidationUrl,
  generateVerifactuQrPng,
  parseVerifactuQrValidationUrl,
  VERIFACTU_QR_PNG_OPTIONS,
  VERIFACTU_QR_LEGEND_LINES,
} from '../src/verifactu-qr';

describe('verifactu QR', () => {
  it('construye la URL de cotejo de entorno de pruebas con los campos exigidos', () => {
    const result = buildVerifactuQrValidationUrl({
      environment: 'test',
      issuerTaxIdentity: '12345678Z',
      documentNumber: 'FS-00001',
      issuedAt: '2026-07-03',
      totalAmount: 6.99,
    });

    expect(result.environment).toBe('test');
    expect(result.url.startsWith('https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?')).toBe(true);

    const params = new URL(result.url).searchParams;

    expect(params.get('nif')).toBe('12345678Z');
    expect(params.get('numserie')).toBe('FS-00001');
    expect(params.get('fecha')).toBe('03-07-2026');
    expect(params.get('importe')).toBe('6.99');
  });

  it('bloquea el entorno de producción hasta completar el cotejo manual', () => {
    expect(() => buildVerifactuQrValidationUrl({
      environment: 'production',
      issuerTaxIdentity: '12345678Z',
      documentNumber: 'FS-00002',
      issuedAt: '2026-07-03',
      totalAmount: 12,
    })).toThrow('VERIFACTU_QR_PRODUCTION_BLOCKED_PENDING_MANUAL_COTEJO');
  });

  it('parsea la URL y compara todos los parámetros contra el documento', () => {
    const document = { environment: 'test' as const, issuerTaxIdentity: 'B12345678', documentNumber: 'FS/2026-42', issuedAt: '2026-12-31T23:30:00-05:00', totalAmount: 1200.5 };
    const parsed = parseVerifactuQrValidationUrl(buildVerifactuQrValidationUrl(document).url);
    expect(parsed).toEqual({ nif: document.issuerTaxIdentity, documentNumber: document.documentNumber, issuedAt: '01-01-2027', totalAmount: '1200.50' });
  });

  it('genera un PNG válido para la URL de cotejo', async () => {
    const { url } = buildVerifactuQrValidationUrl({
      environment: 'test',
      issuerTaxIdentity: '12345678Z',
      documentNumber: 'FS-00001',
      issuedAt: '2026-07-03',
      totalAmount: 6.99,
    });

    const png = await generateVerifactuQrPng(url);

    expect(png.length).toBeGreaterThan(0);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(300);
    expect(view.getUint32(20)).toBe(300);
    expect(VERIFACTU_QR_PNG_OPTIONS).toEqual({ errorCorrectionLevel: 'M', margin: 1, width: 300 });
  });

  it('incluye las líneas de leyenda VERI*FACTU exigidas', () => {
    expect(VERIFACTU_QR_LEGEND_LINES).toEqual([
      'Factura verificable en la sede electrónica de la AEAT',
      'VERI*FACTU',
    ]);
  });
});

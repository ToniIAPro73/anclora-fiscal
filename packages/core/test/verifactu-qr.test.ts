import { describe, expect, it } from 'vitest';
import {
  buildVerifactuQrValidationUrl,
  generateVerifactuQrPng,
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

  it('construye la URL de cotejo de producción con el host de producción de la AEAT', () => {
    const result = buildVerifactuQrValidationUrl({
      environment: 'production',
      issuerTaxIdentity: '12345678Z',
      documentNumber: 'FS-00002',
      issuedAt: '2026-07-03',
      totalAmount: 12,
    });

    expect(result.environment).toBe('production');
    expect(result.url.startsWith('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?')).toBe(true);
    expect(new URL(result.url).searchParams.get('importe')).toBe('12.00');
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
  });

  it('incluye las líneas de leyenda VERI*FACTU exigidas', () => {
    expect(VERIFACTU_QR_LEGEND_LINES).toEqual([
      'Factura verificable en la sede electrónica de la AEAT',
      'VERI*FACTU',
    ]);
  });
});

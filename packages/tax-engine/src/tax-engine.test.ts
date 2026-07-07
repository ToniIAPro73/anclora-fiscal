import { describe, expect, it } from 'vitest';
import { demoSpainConfig, VersionedTaxEngine } from './index';

const engine = new VersionedTaxEngine(demoSpainConfig);
describe('motor fiscal versionado', () => {
  it('aplica el 4% configurado al ebook nacional', () => {
    expect(engine.evaluate({ issuerCountry: 'ES', customerCountry: 'ES', customerType: 'B2C', productNature: 'ebook', channel: 'shopify', operationType: 'sale', evidence: ['country'], grossAmount: 6.99, currency: 'EUR' })).toMatchObject({ status: 'DETERMINADA', classification: 'VENTA_NACIONAL_B2C_IVA_REDUCIDO', documentType: 'SIMPLIFICADA', rate: '0.04', taxBase: 6.72, taxAmount: 0.27, totalAmount: 6.99, ruleId: 'ES_EBOOK_4' });
  });
  it('trata LIBRO_ELECTRONICO como el mismo producto fiscal que ebook', () => {
    expect(engine.evaluate({ issuerCountry: 'ES', customerCountry: 'ES', customerType: 'B2C', productNature: 'LIBRO_ELECTRONICO', channel: 'shopify', operationType: 'sale', evidence: ['country'], grossAmount: 6.99, currency: 'EUR' })).toMatchObject({ status: 'DETERMINADA', ruleId: 'ES_EBOOK_4' });
  });
  it('bloquea cuando falta país', () => { expect(engine.evaluate({ customerType: 'B2C', productNature: 'ebook', channel: 'shopify', operationType: 'sale', evidence: [] }).status).toBe('BLOQUEADA'); });
  it('deriva OSS y KDP no validado a revisión', () => {
    expect(engine.evaluate({ customerCountry: 'FR', customerType: 'B2C', productNature: 'ebook', channel: 'shopify', operationType: 'sale', evidence: [] }).status).toBe('PENDIENTE_REVISION_FISCAL');
    expect(engine.evaluate({ customerCountry: 'ES', customerType: 'B2B', productNature: 'royalty', channel: 'amazon-kdp', operationType: 'royalty', evidence: [] }).status).toBe('PENDIENTE_REVISION_FISCAL');
  });
});

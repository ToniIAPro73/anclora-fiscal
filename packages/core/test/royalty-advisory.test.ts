import { describe, expect, it } from 'vitest'; import { summarizeRoyaltyAdvisory, type RoyaltyLine } from '../src/royalty';
const line = (currency:string, store:string, format:'ebook'|'impreso', amount:number): RoyaltyLine => ({ businessKey:`${currency}-${store}-${format}`, classification:format, format, status:'RECOGNIZED', period:'2025-01', date:'2025-01-15', isbnOrAsin:'x', store, amount, currency, productionCost: format === 'impreso' ? 2 : 0, sourceSheet:'s' });
describe('KDP advisory analytics', () => {
  it('desglosa marketplace/formato y usa tipo histórico con redondeo', () => { const result = summarizeRoyaltyAdvisory([line('USD','Amazon.com','ebook',10),line('USD','Amazon.com','impreso',10)],[{ source:'manual',date:'2025-01-01',base:'USD',quote:'EUR',rate:.92345 }]); expect(result).toHaveLength(2); expect(result[0]).toMatchObject({ marketplace:'Amazon.com', currency:'USD', eurInformative:9.23 }); expect(result[1]?.netInformative).toBe(8); });
  it('marca ausencia de tipo sin usar el actual', () => expect(summarizeRoyaltyAdvisory([line('GBP','Amazon.co.uk','ebook',5)],[])[0]).toMatchObject({ eurInformative:null, warning: expect.any(String) }));
});

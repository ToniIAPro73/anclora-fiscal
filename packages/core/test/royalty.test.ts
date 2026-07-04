import { describe, expect, it } from 'vitest';
import { summarizeRoyaltyLinesByFormat, type RoyaltyLine } from '../src/royalty';

const line = (overrides: Partial<RoyaltyLine>): RoyaltyLine => ({
  businessKey: 'key',
  classification: 'ebook',
  status: 'RECOGNIZED',
  period: '2026-06',
  isbnOrAsin: 'B0000000',
  amount: 0,
  currency: 'EUR',
  sourceSheet: 'test',
  ...overrides,
});

describe('summarizeRoyaltyLinesByFormat', () => {
  it('agrupa por formato y promedia precio y coste de producción', () => {
    const lines: RoyaltyLine[] = [
      line({ classification: 'ebook', amount: 10, averageUnitPrice: 6.99, productionCost: 0.2 }),
      line({ classification: 'ebook', amount: 5, averageUnitPrice: 8.99, productionCost: 0.3 }),
      line({ classification: 'impreso', amount: 20, averageUnitPrice: 14.99, productionCost: 2.05 }),
    ];
    const summary = summarizeRoyaltyLinesByFormat(lines);
    const ebook = summary.find((entry) => entry.format === 'ebook');
    const impreso = summary.find((entry) => entry.format === 'impreso');
    expect(ebook).toMatchObject({ orderCount: 2, averageUnitPrice: 7.99, averageProductionCost: 0.25, totalRoyalties: 15 });
    expect(impreso).toMatchObject({ orderCount: 1, averageUnitPrice: 14.99, averageProductionCost: 2.05, totalRoyalties: 20 });
  });

  it('excluye líneas de reembolso y kenp del recuento por formato', () => {
    const lines: RoyaltyLine[] = [
      line({ classification: 'ebook', amount: 10, averageUnitPrice: 6.99 }),
      line({ classification: 'reembolso', amount: 0, averageUnitPrice: 6.99 }),
      line({ classification: 'kenp_lectura', amount: 0 }),
    ];
    const summary = summarizeRoyaltyLinesByFormat(lines);
    const ebook = summary.find((entry) => entry.format === 'ebook');
    expect(ebook?.orderCount).toBe(1);
  });

  it('devuelve ceros cuando no hay líneas de un formato', () => {
    const summary = summarizeRoyaltyLinesByFormat([line({ classification: 'ebook', amount: 10 })]);
    const impreso = summary.find((entry) => entry.format === 'impreso');
    expect(impreso).toMatchObject({ orderCount: 0, averageUnitPrice: 0, averageProductionCost: 0, totalRoyalties: 0 });
  });
});

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractShopifyOrdersCsv } from './shopify-orders-csv.js';

const evidence = resolve(import.meta.dirname, '../../../.evidence');

describe('extractShopifyOrdersCsv', () => {
  it('captura customerCountry priorizando Shipping Country sobre Billing Country', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify.csv')));
    expect(parsed.orders.every((order) => order.customerCountry === 'ES')).toBe(true);
  });

  it('deja customerCountry sin definir cuando el export no trae columnas de país (honesto, no fabricado)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-sin-pais.csv')));
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0]?.customerCountry).toBeUndefined();
  });
});

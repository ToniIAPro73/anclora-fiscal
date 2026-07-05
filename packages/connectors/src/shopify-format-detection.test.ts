import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isShopifyOrdersCsvFile } from './shopify-orders-csv';
import { previewShopifyCsv } from './shopify-csv';

const fixtures = resolve(import.meta.dirname, '../test/fixtures');

describe('Shopify format detection (SHOPIFY-00 baseline)', () => {
  it('detecta el fixture de pedidos (Orders) mediante isShopifyOrdersCsvFile()', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-orders-four.csv'));
    expect(isShopifyOrdersCsvFile(bytes)).toBe(true);
  });

  it('el fixture de ledger de pagos (Payments Ledger) NO se detecta como Orders CSV', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv'));
    expect(isShopifyOrdersCsvFile(bytes)).toBe(false);
  });

  it('el fixture de ledger de pagos parsea correctamente vía previewShopifyCsv()', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv'));
    const preview = previewShopifyCsv(bytes);
    expect(preview.rows).toHaveLength(2);
  });

  // Known gap (documented, not resolved here — SHOPIFY-01's job): today there is
  // no dedicated "Order Transaction History" connector distinct from the
  // Shopify Payments Ledger connector. previewShopifyCsv() does a strict,
  // ordered 18-column header match against `shopifyHeaders` (Transaction Date,
  // Type, Order, Card Brand, ... VAT). The Order Transaction History export
  // (Order, Name, Kind, Gateway, Created At, Status, Amount, Currency, Card
  // Type, Payment Method) has a completely different header shape, so today it
  // is correctly rejected by previewShopifyCsv() rather than being silently
  // misclassified as a Ledger file. This test locks in that current (safe but
  // incomplete) behavior; SHOPIFY-01 will add a dedicated Transactions
  // connector so this file type gets its own detection path instead of just
  // failing shopify-csv.ts's header check.
  it('el fixture de Order Transaction History no coincide con ningún conector actual (gap documentado para SHOPIFY-01)', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-order-transactions.csv'));
    expect(isShopifyOrdersCsvFile(bytes)).toBe(false);
    expect(() => previewShopifyCsv(bytes)).toThrow('Cabeceras Shopify no reconocidas o desordenadas');
  });
});

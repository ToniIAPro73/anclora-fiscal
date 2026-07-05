import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseShopifyOrderTransactionsCsv } from './shopify-order-transactions-csv.js';

const fixtures = resolve(import.meta.dirname, '../test/fixtures');

describe('parseShopifyOrderTransactionsCsv', () => {
  it('preserva el signo negativo de un reembolso (no lo convierte a positivo ni a NaN)', async () => {
    const evidence = parseShopifyOrderTransactionsCsv(
      await readFile(resolve(fixtures, 'shopify-order-transactions-negative-refund.csv')),
    );
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.rows[0]?.amount).toBe(-6.99);
  });

  it('marca un Kind no reconocido como "unknown" y emite ORDER_TRANSACTION_STATUS_UNSUPPORTED', async () => {
    const evidence = parseShopifyOrderTransactionsCsv(
      await readFile(resolve(fixtures, 'shopify-order-transactions-unknown-kind.csv')),
    );
    expect(evidence.rows[0]?.kind).toBe('unknown');
    expect(evidence.issues).toContainEqual(expect.objectContaining({ code: 'ORDER_TRANSACTION_STATUS_UNSUPPORTED' }));
  });

  it('genera la misma businessKey en pasadas repetidas y una distinta si cambia Amount', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-order-transactions.csv'));
    const first = parseShopifyOrderTransactionsCsv(bytes);
    const second = parseShopifyOrderTransactionsCsv(bytes);
    expect(first.rows[0]?.businessKey).toBe(second.rows[0]?.businessKey);

    const originalText = bytes.toString('utf8');
    const saleLine = '9000000000001,AI-1001,sale,shopify_payments,2026-07-01 07:33:07 +0000,success,6.99,EUR,master,card';
    const mutatedLine = saleLine.replace(',6.99,EUR,', ',7.99,EUR,');
    expect(originalText).toContain(saleLine);
    const mutatedBytes = Buffer.from(originalText.replace(saleLine, mutatedLine), 'utf8');
    const mutated = parseShopifyOrderTransactionsCsv(mutatedBytes);
    expect(mutated.rows[0]?.businessKey).not.toBe(first.rows[0]?.businessKey);
  });
});

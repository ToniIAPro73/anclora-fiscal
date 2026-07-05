import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewShopifyPaymentsLedgerCsv } from './shopify-payments-ledger-csv.js';

const fixtures = resolve(import.meta.dirname, '../test/fixtures');

describe('Shopify Payments Ledger CSV', () => {
  it('clasifica charge/refund sin convertir VAT de canal en IVA fiscal', async () => {
    const preview = previewShopifyPaymentsLedgerCsv(await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv')));
    expect(new Set(preview.rows.map((row) => row.kind))).toEqual(new Set(['charge', 'refund']));
    expect(preview.issues.filter((issue) => issue.code === 'PLATFORM_VAT_ZERO_UNVALIDATED')).toHaveLength(2);
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: 'FULL_REFUND_NET_ZERO' }));
    expect(preview.rows[0]?.businessKey).not.toBe(preview.rows[1]?.businessKey);
  });

  it('genera la misma businessKey en pasadas repetidas y una distinta si cambia Amount', async () => {
    const bytes = await readFile(resolve(fixtures, 'shopify-ledger-charge-refund.csv'));
    const first = previewShopifyPaymentsLedgerCsv(bytes);
    const second = previewShopifyPaymentsLedgerCsv(bytes);
    expect(first.rows[1]?.businessKey).toBe(second.rows[1]?.businessKey);

    const originalText = bytes.toString('utf8');
    const chargeLine = '2026-07-01 07:33:09 +0000,charge,AI-1001,master,online,pending,2026-07-10,,2026-07-10,6.99,0.45,6.54,#68683485610367,card,6.99,EUR,EUR,0.00';
    const mutatedLine = chargeLine.replace(',6.99,0.45,6.54,', ',7.99,0.45,6.54,');
    expect(originalText).toContain(chargeLine);
    const mutatedBytes = Buffer.from(originalText.replace(chargeLine, mutatedLine), 'utf8');
    const mutated = previewShopifyPaymentsLedgerCsv(mutatedBytes);
    expect(mutated.rows[1]?.businessKey).not.toBe(first.rows[1]?.businessKey);
  });
});

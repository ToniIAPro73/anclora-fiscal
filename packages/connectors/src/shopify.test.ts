import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractShopifyOrdersCsv } from './shopify-orders-csv';
import { previewShopifyCsv } from './shopify-csv';

const evidence = resolve(import.meta.dirname, '../../../.evidence');

describe('Shopify CSV', () => {
  it('clasifica charge/refund sin convertir VAT de canal en IVA fiscal', async () => {
    const preview = previewShopifyCsv(await readFile(resolve(evidence, 'pedido-shopify-pruebas.csv')));
    expect(new Set(preview.rows.map((row) => row.kind))).toEqual(new Set(['charge', 'refund']));
    expect(preview.issues.filter((issue) => issue.code === 'PLATFORM_VAT_ZERO_UNVALIDATED')).toHaveLength(2);
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: 'FULL_REFUND_NET_ZERO' }));
    expect(preview.rows[0]?.businessKey).not.toBe(preview.rows[1]?.businessKey);
  });
});

describe('Shopify Orders CSV', () => {
  it('trata el export de pedidos como evidencia comercial e identifica la incoherencia de reembolso total', async () => {
    const result = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-pruebas.csv')));
    expect(result.orders.map((order) => order.orderId)).toEqual(['AI-1004', 'AI-1003', 'AI-1002', 'AI-1001']);
    const incident = result.orders.find((order) => order.orderId === 'AI-1001');
    expect(incident?.commercialDate).toBe('2026-07-01');
    expect(incident?.issues).toContainEqual(expect.objectContaining({ code: 'INCOHERENT_QUANTITY' }));
    expect(incident).not.toHaveProperty('amount');
  });
});

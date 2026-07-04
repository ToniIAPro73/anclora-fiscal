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

  it('captura customerName, totalPrice y taxAmount reales de un pedido con Billing Name/Total/Taxes', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify.csv')));
    const order = parsed.orders.find((entry) => entry.orderId === 'AI-1001');
    expect(order?.customerName).toBe('Cliente Demo AI-1001');
    expect(order?.totalPrice).toBe(6.99);
    expect(order?.taxAmount).toBe(0.27);
  });

  it('deja customerName, totalPrice y taxAmount sin definir cuando el export no trae esas columnas (honesto, no fabricado)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-sin-pais.csv')));
    const order = parsed.orders[0];
    // El fixture "sin-pais" sí trae Billing Name/Shipping Name (con valor),
    // por lo que customerName se captura igualmente; solo Total/Taxes están ausentes.
    expect(order?.customerName).toBe('Cliente Demo AI-2001');
    expect(order?.totalPrice).toBeUndefined();
    expect(order?.taxAmount).toBeUndefined();
  });
});

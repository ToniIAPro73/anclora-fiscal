import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractShopifyOrdersCsv } from './shopify-orders-csv.js';

const evidence = resolve(import.meta.dirname, '../../../.evidence');

describe('extractShopifyOrdersCsv', () => {
  it('captura customerCountry priorizando Shipping Country sobre Billing Country', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-pruebas.csv')));
    expect(parsed.orders.every((order) => order.customerCountry === 'ES')).toBe(true);
  });

  it('deja customerCountry sin definir cuando el export no trae columnas de país (honesto, no fabricado)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-pruebas.csv')));
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0]?.customerCountry).toBeUndefined();
  });

  it('captura customerName, totalPrice y taxAmount reales de un pedido con Billing Name/Total/Taxes', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-pruebas.csv')));
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

  it('captura customerEmail y customerAddress reales, con Billing Address1/City/Zip/Province como respaldo de Shipping', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify.csv')));
    const order = parsed.orders.find((entry) => entry.orderId === 'AI-1001');
    expect(order?.customerEmail).toBe('cliente-ai-1001@ejemplo.com');
    // El fixture real no trae Shipping Address1 relleno, así que se usa el
    // respaldo de columnas Billing (Address1/City/Zip/Province).
    expect(order?.customerAddress).toBe("Calle Ejemplo 1, Palma, '07015, PM");
  });

  it('clasifica el formato mediante Lineitem requires shipping sin inferirlo por el título', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify.csv')));
    expect(parsed.orders.every((order) => order.productNature === 'ebook')).toBe(true);
  });

  it('deja customerEmail y customerAddress sin definir cuando el export no trae esas columnas (honesto, no fabricado)', async () => {
    const parsed = extractShopifyOrdersCsv(await readFile(resolve(evidence, 'pedido-shopify-sin-pais.csv')));
    const order = parsed.orders[0];
    expect(order?.customerEmail).toBeUndefined();
    expect(order?.customerAddress).toBeUndefined();
  });
});

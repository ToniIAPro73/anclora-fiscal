import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';

export interface ShopifyOrderEvidence {
  orderId: string;
  commercialDate?: string;
  quantity: number;
  hasBillingBlock: boolean;
  hasShippingBlock: boolean;
  issues: Array<{ code: string; severity: 'HIGH' | 'BLOCKING'; message: string }>;
}

export interface ShopifyOrdersCsvEvidence { hash: string; orders: ShopifyOrderEvidence[]; }

const requiredHeaders = ['Name', 'Financial Status', 'Fulfillment Status', 'Created at', 'Lineitem quantity', 'Billing Name', 'Shipping Name'];

export function isShopifyOrdersCsvFile(bytes: Uint8Array): boolean {
  const firstLine = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '').split('\n')[0]?.replace(/\r$/, '') ?? '';
  const headers = new Set(firstLine.split(','));
  return requiredHeaders.every((header) => headers.has(header));
}

export function extractShopifyOrdersCsv(bytes: Uint8Array): ShopifyOrdersCsvEvidence {
  const source = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
  const records = parse(source, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const orders = records.map((record): ShopifyOrderEvidence => {
    const orderId = record.Name;
    if (!orderId) throw new Error('Fila de pedido sin identificador');
    const commercialDate = record['Created at']?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const quantity = Number(record['Lineitem quantity']);
    const issues: ShopifyOrderEvidence['issues'] = [];
    if (!commercialDate) issues.push({ code: 'COMMERCIAL_DATE_MISSING', severity: 'HIGH', message: 'No se detectó una fecha comercial válida' });
    if (!Number.isFinite(quantity) || quantity <= 0) issues.push({ code: 'ITEM_QUANTITY_MISSING', severity: 'HIGH', message: 'No se detectó una cantidad de artículos válida' });
    // El export de pedidos no incluye un recuento "entregado de un total" como el
    // extracto en PDF que sustituye; la incoherencia equivalente aquí es un pedido
    // marcado como cumplido (entregado) cuyo estado financiero es un reembolso
    // total — mercancía servida sin ingreso neto, la misma señal de riesgo que
    // antes detectaba una cantidad entregada mayor que la cantidad total.
    if (record['Financial Status'] === 'refunded' && record['Fulfillment Status'] === 'fulfilled') {
      issues.push({ code: 'INCOHERENT_QUANTITY', severity: 'HIGH', message: 'Pedido cumplido con reembolso total; cantidad servida incoherente con el neto comercial' });
    }
    return {
      orderId,
      ...(commercialDate ? { commercialDate } : {}),
      quantity,
      hasBillingBlock: Boolean(record['Billing Name']),
      hasShippingBlock: Boolean(record['Shipping Name']),
      issues,
    };
  });
  return { hash: createHash('sha256').update(bytes).digest('hex'), orders };
}

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

type PdfParser = (data: Buffer) => Promise<{ text: string; numpages: number }>;
const pdf = createRequire(import.meta.url)('pdf-parse/lib/pdf-parse.js') as PdfParser;

export interface ShopifyPdfItem { description: string; fulfilled: number; total: number; }
export interface ShopifyOrderEvidence {
  orderId: string;
  commercialDate?: string;
  items: ShopifyPdfItem[];
  hasBillingBlock: boolean;
  hasShippingBlock: boolean;
  issues: Array<{ code: string; severity: 'HIGH' | 'BLOCKING'; message: string }>;
}

export interface ShopifyPdfEvidence { hash: string; orders: ShopifyOrderEvidence[]; }

const spanishMonths: Record<string, string> = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' };

export async function extractShopifyOrdersPdf(bytes: Uint8Array): Promise<ShopifyPdfEvidence> {
  const result = await pdf(Buffer.from(bytes));
  const text = result.text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  const segments = text.split(/(?=Pedido\s+AI-\d+)/i).filter((segment) => /^Pedido\s+AI-\d+/i.test(segment.trim()));
  const orders = segments.map((segment): ShopifyOrderEvidence => {
    const orderId = segment.match(/Pedido\s+(AI-\d+)/i)?.[1];
    if (!orderId) throw new Error('Segmento de pedido sin identificador');
    const dateMatch = segment.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    const month = dateMatch?.[2] ? spanishMonths[dateMatch[2].toLowerCase()] : undefined;
    const commercialDate = dateMatch && month ? `${dateMatch[3]}-${month}-${dateMatch[1]?.padStart(2, '0')}` : undefined;
    const items = [...segment.matchAll(/(\d+)\s+de\s+(\d+)/g)].map((match) => ({ description: 'Artículo Shopify', fulfilled: Number(match[1]), total: Number(match[2]) }));
    const issues: ShopifyOrderEvidence['issues'] = [];
    if (!commercialDate) issues.push({ code: 'COMMERCIAL_DATE_MISSING', severity: 'HIGH', message: 'No se detectó una fecha comercial válida' });
    if (items.length === 0) issues.push({ code: 'ITEM_QUANTITY_MISSING', severity: 'HIGH', message: 'No se detectaron cantidades de artículos' });
    if (items.some((item) => item.total === 0 || item.fulfilled > item.total)) issues.push({ code: 'INCOHERENT_QUANTITY', severity: 'HIGH', message: 'Cantidad cero o incoherente en el pedido' });
    return { orderId, ...(commercialDate ? { commercialDate } : {}), items, hasBillingBlock: /FACTURAR A/i.test(segment), hasShippingBlock: /ENVIAR A/i.test(segment), issues };
  });
  return { hash: createHash('sha256').update(bytes).digest('hex'), orders };
}

import type { FiscalDocument, InvoiceInput } from '@anclora/core/server';
import { InvoiceSequence, issueInvoice, rectifyInvoice } from '@anclora/core/server';
import { demoSpainConfig, VersionedTaxEngine } from '@anclora/tax-engine';

const decision = new VersionedTaxEngine(demoSpainConfig).evaluate({
  issuerCountry: 'ES',
  customerCountry: 'ES',
  customerType: 'B2C',
  productNature: 'ebook',
  channel: 'shopify',
  operationType: 'sale',
  evidence: ['country'],
  grossAmount: 6.99,
  currency: 'EUR',
});

export const demoInvoiceInput: InvoiceInput = {
  operationId: 'AI-1001',
  customerLabel: 'Cliente digital · pedido AI-1001',
  description: 'Venta de ebook — pedido AI-1001',
  taxBase: decision.taxBase ?? 0,
  taxRate: Number(decision.rate ?? 0),
  taxAmount: decision.taxAmount ?? 0,
  totalAmount: decision.totalAmount ?? 0,
  currency: 'EUR',
  issuedAt: '2026-07-01',
};

export async function buildDemoInvoices(): Promise<{ original: FiscalDocument; rectified: FiscalDocument }> {
  const sequence = new InvoiceSequence('AF-2026');
  const original = await issueInvoice(sequence, demoInvoiceInput);
  const rectified = await rectifyInvoice(sequence, original, '2026-07-03');
  return { original, rectified };
}
